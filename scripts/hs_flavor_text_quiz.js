// Settings
const MULTIPLE_CHOICE_DEFAULT_SIZE = 4;
const MULTIPLE_CHOICE_MIN_SIZE = 2;
const MULTIPLE_CHOICE_MAX_SIZE = 100;
const OBVIOUS_WORD_MIN_LENGTH = 3; // Filters for words from name that appear in flavorText of this length
const OBVIOUS_SUBSTRING_MIN_LENGTH = 5; // Filters for common substrings of this length
const CLOSE_ENOUGH_SIMILARITY_THRESHOLD = 0.8; // From range [0, 1];
const HINT_SUBSTRING_MIN_LENGTH = 4; // You get a hint if you get this many chars right
const PAGE_SIZE = 500; // API response size. This seems to be the cap
const API_RETRY_DELAY = 20; // Delay (in ms) between attempts to access the API if it fails
const API_ATTEMPTS_BEFORE_MESSAGE = 3; // Number of API fetch attempts before a message is displayed

// OAuth Data
const CLIENT_ID = "b7777d5b2cf8467697f17db51270a714";
const CLIENT_SECRET = "AgbO2QvwGDaFrtUdQstKCRJNZlBQ6vTZ";

// Modes
const MODES = {
	MULTIPLE_CHOICE: "Multiple Choice",
	FREE_REPONSE: "Free Response"
}

// Emote lines for random responses.
// Source - https://hearthstone.gamepedia.com/Hearthstone_Wiki
const _WOW_LINES = [
	"Wow....",
	"Astonishing!",
	"Amazing.",
	"That's incredible!",
	"By the Holy Light!",
	"Astounding!",
	"Extraordinary.",
	"Incredible.",
	"Spectacular!"
]
const _OOPS_LINES = [
	"Not quite what was planned.",
	"That was an error.",
	"Whoops.",
	"That was a mistake.",
	"That was a mistake.",
	"That didn't quite hit the mark.",
	"That was a mistake.",
	"Mistakes were made.",
	"A natural mistake."
]
const _SORRY_LINES = [
	"My apologies.",
	"Sorry that happened.",
	"I'm sorry.",
	"Sorry that happened.",
	"I am sorry.",
	"My apologies.",
	"Sorry.",
	"Sorry about that.",
	"Sorry about that."
]
const WOW_LINES = _WOW_LINES.filter((v,i) => _WOW_LINES.indexOf(v) === i);
const OOPS_LINES = _OOPS_LINES.filter((v,i) => _OOPS_LINES.indexOf(v) === i);
const SORRY_LINES = _SORRY_LINES.filter((v,i) => _SORRY_LINES.indexOf(v) === i);

// Global Token data
var Access_Token = null;
var Fetch_Attempts = 0;

// Global variables to store card data
var All_Cards = [];
var Cards_With_Flavor = [];
var Current_Pool_Full = [];
var Current_Pool_No_Obvious = [];
var Current_Card_mc = null;
var Current_Card_fr = null;
var Current_Options = [];

var Card_Revealed_mc = false;
var Card_Revealed_fr = false;

// User Settings
var Mode = MODES.MULTIPLE_CHOICE;
var Multiple_Choice_Size = MULTIPLE_CHOICE_DEFAULT_SIZE;
var Hints = true;
var No_Obvious_Prompts = true;

// Getters
function getCurrentCard() {
	return (Mode === MODES.MULTIPLE_CHOICE) ? Current_Card_mc : Current_Card_fr;
}
function getCurrentPool() {
	return (No_Obvious_Prompts) ? Current_Pool_No_Obvious : Current_Pool_Full;
}

// Score/streak variables, initialized according to cookies
var Current_Streak_mc;
var Best_Streak_mc;
var Total_Score_mc;
var Current_Streak_fr;
var Best_Streak_fr;
var Total_Score_fr;
getScoreCookies();

// Audio Files
// Source - https://www.reddit.com/r/hearthstone/comments/2zzvh0/the_sounds_of_hearthstone_all_sounds_from_the_game/
// Howler Library - https://howlerjs.com/
// TODO



// ===== My favorites =====
// Spirit of the Frog
// Quick Shot
// Blackwald Pixie
// Nozdormu
// Shatter
// Crushing Walls
// Lakkari Sacrifice



// ===== Fetching Data from the Hearthstone API =====

// Reference:
// https://develop.battle.net/documentation/hearthstone/game-data-apis
// https://develop.battle.net/documentation/guides/using-oauth
// https://develop.battle.net/documentation/guides/using-oauth/client-credentials-flow
// https://develop.battle.net/access/clients/details/b7777d5b2cf8467697f17db51270a714

// First, get an access token
// Reference - https://github.com/search?q=%22.battle.net%2Foauth%2Ftoken%22+fetch&type=Code
fetchAccessToken();
function fetchAccessToken() {
	fetch("https://us.battle.net/oauth/token?grant_type=client_credentials&client_id=" + CLIENT_ID + "&client_secret=" + CLIENT_SECRET, {
		"method": "POST"
	})
	.then(response => {
		const reader = response.body.getReader();
		return new ReadableStream({
			start(controller) {
				return pump();
				function pump() {
					return reader.read().then(({ done, value }) => {
						// When no more data needs to be consumed, close the stream
						if (done) {
							controller.close();
							return;
						}
						// Enqueue the next data chunk into our target stream
						controller.enqueue(value);
						return pump();
					});
				}
			}
		})
	})
	.then(stream => new Response(stream))
	.then(response => response.json())
	.then(json => {
		Access_Token = json.access_token;
		fetchCardData(1);
	})
	.catch(err => {
		console.log(err);
		console.log("Going to try again after " + API_RETRY_DELAY + "ms delay...");
		incrFetchAttempts();
		setTimeout(fetchAccessToken(), API_RETRY_DELAY);
	});
}



// Now use the token to actually get card data
// Reference - https://github.com/search?q=%22.api.blizzard.com%2Fhearthstone%2F%22+fetch&type=Code
function fetchCardData(pageNum) {
	fetch("https://us.api.blizzard.com/hearthstone/cards?locale=en_US&collectible=1&pageSize=" + PAGE_SIZE + "&page=" + pageNum + "&access_token=" + Access_Token, {
		"method": "GET"
	})
	.then(response => {
		const reader = response.body.getReader();
		return new ReadableStream({
			start(controller) {
				return pump();
				function pump() {
					return reader.read().then(({ done, value }) => {
						// When no more data needs to be consumed, close the stream
						if (done) {
							controller.close();
							return;
						}
						// Enqueue the next data chunk into our target stream
						controller.enqueue(value);
						return pump();
					});
				}
			}
		})
	})
	.then(stream => new Response(stream))
	.then(response => response.json())
	.then(json => appendCardData(json))
	.catch(err => {
		console.log(err);
		console.log("Going to try again after " + API_RETRY_DELAY + "ms delay...");
		incrFetchAttempts();
		setTimeout(fetchCardData(pageNum), API_RETRY_DELAY);
	});
}

function incrFetchAttempts() {
	Fetch_Attempts++;
	if (Fetch_Attempts >= API_ATTEMPTS_BEFORE_MESSAGE) {
		$("#notLoadingIndicator").show();
	}
}

// Takes in a page of card data and either requests the next page, or generates the quiz
function appendCardData(json) {
	All_Cards = All_Cards.concat(json.cards);
	if (json.page >= json.pageCount) {
		generateQuiz();
	} else {
		fetchCardData(json.page + 1);
	}
}

// Generate quiz questions, once all data has been loaded
function generateQuiz() {
	Cards_With_Flavor = All_Cards.filter(card => card.flavorText !== undefined && card.flavorText.trim());
	resetPools();

	console.log("Cards_With_Flavor:");
	console.log(Cards_With_Flavor);

	$("#notLoadingIndicator").hide();

	setNewCurrentCard();

	// Special search here
	// console.log(Cards_With_Flavor.filter(card => card.text.includes("close")));
}

// Returns true iff the card's flavor text is not "obvious"
function obviousFilter(card) {
	// Word-by-word filter based on words in the name
	let words = card.name.split(' ');
	for (let i=0; i < words.length; i++) {
		if (words[i].length >= OBVIOUS_WORD_MIN_LENGTH && card.flavorText.includes(words[i]) && words[i] !== words[i].toLowerCase()) {
			return false;
		}
	}
	// Any substring of a certain length
	if (bestSubstringMatch(card.name, card.flavorText).length >= OBVIOUS_SUBSTRING_MIN_LENGTH) {
		return false;
	}
	return true;
}

// Resets the pools to their complete versions
function resetPools() {
	Current_Pool_Full = All_Cards.filter(card => card.flavorText !== undefined && card.flavorText.trim());
	Current_Pool_No_Obvious = Cards_With_Flavor.filter(card => obviousFilter(card));
	// console.log("Current_Pool_No_Obvious:");
	// console.log(Current_Pool_No_Obvious);
}



// ===== Quiz Functionality =====

function revealCard(correct, textToShow) {
	if (correct) {
		if (Mode === MODES.MULTIPLE_CHOICE) {
			Current_Streak_mc++;
			Total_Score_mc++;
			if (Current_Streak_mc > Best_Streak_mc) {
				Best_Streak_mc = Current_Streak_mc;
			}
		} else {
			Current_Streak_fr++;
			Total_Score_fr++;
			if (Current_Streak_fr > Best_Streak_fr) {
				Best_Streak_fr = Current_Streak_fr;
			}
		}
		// Update current pools
		removeFromPools(getCurrentCard());
	} else {
		if (Mode === MODES.MULTIPLE_CHOICE) {
			Current_Streak_mc = 0;
		} else {
			Current_Streak_fr = 0;
		}
	}
	setScoreCookies();
	update_score_display();

	updateCurrentCardRevealed(true);

	$("#correctCardImg").attr("src", getCurrentCard().image);
	$("#correctCardImg").addClass("glowing-card");
	$("#correctCardImgLink").attr("href", getCardLibraryURL(getCurrentCard()));
	$("#answerTextContainer").html(textToShow);
	$("#answerTextContainer").show();
	$("#HS_Flav_next").show();
	$('#HS_Flav_options_container').show();
	$("#flavorText").show();
	$("#HS_Flav_multiple_choice_input").hide();
	$("#HS_Flav_free_response_input1").hide();
	$("#HS_Flav_free_response_input2").hide();
	// $("#HS_Flav_next_button").focus();
}

// Returns true iff current card is revealed
function isCurrentCardRevealed() {
	return (Mode === MODES.MULTIPLE_CHOICE) ? Card_Revealed_mc : Card_Revealed_fr;
}
function updateCurrentCardRevealed(newVal) {
	if (Mode === MODES.MULTIPLE_CHOICE) {
		Card_Revealed_mc = newVal;
	} else if (Mode === MODES.FREE_REPONSE) {
		Card_Revealed_fr = newVal;
	}
}

// Sets Current_Card to a new random card
function setNewCurrentCard(justVisuals = false) {
	$("#correctCardImg").attr("src", "/images/HS_Flavor_Text_Quiz/Mystery Card.png");
	$("#correctCardImg").removeClass("glowing-card");
	$("#correctCardImgLink").removeAttr("href");

	// Current_Card.name = Current_Card.name.trim();
	// Current_Card.flavorText = Current_Card.flavorText.trim();

	$("#HS_Flav_multiple_choice_input").hide();
	$("#HS_Flav_free_response_input1").hide();
	$("#HS_Flav_free_response_input2").hide();
	if (Mode == MODES.MULTIPLE_CHOICE) {
		if (!justVisuals) {
			Current_Card_mc = getRandomCard();
			setOptions();
		}
		$("#HS_Flav_multiple_choice_input").show();
	} else if (Mode == MODES.FREE_REPONSE) {
		if (!justVisuals) {
			Current_Card_fr = getRandomCard();
		}
		$("#HS_Flav_free_response_input1").show();
		$("#HS_Flav_free_response_input2").show();
	}
	updateCurrentCardRevealed(false);

	$("#preloadCardImg").attr("src", getCurrentCard().image);
	$("#flavorText").html(getCurrentCard().flavorText);
	$("#answerTextContainer").hide();
	$("#HS_Flav_next").hide();
	$("#HS_Flav_streak_display").show();
	$('#HS_Flav_options_container').show();
	$("#flavorText").show();
	$("#guessField").val("");
	$("#guessField").focus();
}

// Set options for Multiple Choice
function setOptions() {
	update_mc_size();

	let currentPool = getCurrentPool();
	let currentCard = getCurrentCard();

	const MIN_POOL_SIZE_FACTOR = 3;
	if (currentPool.length < Multiple_Choice_Size * MIN_POOL_SIZE_FACTOR) {
		// throw "Not enough cards to generate that many choices";
		resetPools();
	}

	let newPool = generatePool(getCurrentPool(), currentCard, Multiple_Choice_Size * 1.1);

	Current_Options = [currentCard];
	while (Current_Options.length < Multiple_Choice_Size) {
		let nextCard = getRandomFromArray(newPool);
		// let nextCard = getRandomCard(); // Completely random selection
		if (!Current_Options.includes(nextCard)) {
			Current_Options.push(nextCard);
		}
	}
	shuffleArray(Current_Options);

	// Generate a multiple choice button for each option
	clearMCOptionButtons();
	let container = document.getElementById("mc_options_container");
	let sample_btn = document.getElementById("sample_mc_option_btn");

	for (let i=0; i < Current_Options.length; i++) {
		let card = Current_Options[i];
		let new_btn = sample_btn.cloneNode(true);
		new_btn.style.display = "inline-block";
		new_btn.id = "real_mc_option_btn";
		$(new_btn).text(card.name);
		$(new_btn).attr("onclick", "guessCardSlug('" + card.slug + "')");
		container.appendChild(new_btn);
	}
}

// Generates a pool based on 2 (randomly chosen) card features
function generatePool(initialPool, focusCard, minSize) {
	let newPool = [];
	const POOL_MAX_LOOPS = 10;
	let loops = 0;
	while (newPool.length < minSize) {
		if (loops >= POOL_MAX_LOOPS) {
			return initialPool;
		}
		loops++;

		let classOrSet = (Math.random() > 0.5) ? classFilter(focusCard) : setFilter(focusCard);
		let anyFilter = (Math.random() > 0.5) ? rarityFilter(focusCard) : ((Math.random() > 0.5) ? classFilter(focusCard) : setFilter(focusCard));
		newPool = initialPool.filter(card => typeFilter(focusCard)(card) && classOrSet(card) && anyFilter(card));
	}
	return newPool;
}
// HOF: Returns true iff [class/type/rarity/set] is the same as focusCard
function classFilter(focusCard) { return (card => card.classId === focusCard.classId); }
function setFilter(focusCard) { return (card => card.cardSetId === focusCard.cardSetId); }
function typeFilter(focusCard) { return (card => card.cardTypeId === focusCard.cardTypeId); }
function rarityFilter(focusCard) { return (card => card.rarityId === focusCard.rarityId); }

// Clear all the multiple choice option buttons
function clearMCOptionButtons() {
	let sample_btn = document.getElementById("sample_mc_option_btn");
	let new_sample_btn = sample_btn.cloneNode(true);

	let container = document.getElementById("mc_options_container");
	while (container.hasChildNodes()) {
		let last = container.removeChild(container.lastChild);
	}
	container.append(new_sample_btn);
}

// Returns a random card (from the current pool)
function getRandomCard() {
	return getRandomFromArray(getCurrentPool());
}

// Call this to guess what the card is.
// "guess" is a string for the card's name.
function guessCard(guess) {
	console.assert(Mode !== MODES.MULTIPLE_CHOICE);

	if (guess === undefined) {
		guess = $("#guessField").val();
	}
	let fullCaseGuess = guess;
	guess = guess.toLowerCase();
	if (!guess) {
		return;
	}

	$("#answerTextContainer").show();

	let currentCardNameLower = getCurrentCard().name.toLowerCase();
	let similarityScore = similarity(guess, getCurrentCard().name);
	if (guess === currentCardNameLower) {
		revealCard(true, randWowLine() + "<br><u>The answer is</u>: <i>" + getCurrentCard().name + "</i>");
	} else if (similarityScore >= CLOSE_ENOUGH_SIMILARITY_THRESHOLD) {
		revealCard(true, randWowLine() + " (Close enough)<br><u>The answer is</u>: <i>" + getCurrentCard().name + "</i>");
		// console.log("[You had a similarity score of " + similarityScore + "]");
	} else {
		let bestSubstring = bestSubstringMatch(guess, getCurrentCard().name);
		if (Hints && bestSubstring.length >= HINT_SUBSTRING_MIN_LENGTH) {
			$("#answerTextContainer").html("Almost! You got this part right:<br>\"" + bestSubstring + "\"");
		} else {
			$("#answerTextContainer").html("You guessed: \"" + fullCaseGuess +  "\". Good try but nope.");
		}
		// console.log("[HINT: You had a similarity score of " + similarityScore + "]");
	}
}
// "slug" is the card's slug
function guessCardSlug(slug) {
	console.assert(Mode === MODES.MULTIPLE_CHOICE);
	if (slug === getCurrentCard().slug) {
		revealCard(true, randWowLine() + "<br><u>The answer is</u>: <i>" + getCurrentCard().name + "</i>");
	} else {
		let guessed_card_list = Current_Options.filter(card => card.slug === slug);
		console.assert(guessed_card_list.length === 1);
		let guessed_card = guessed_card_list[0];
		revealCard(false, randOopsLine() + "<br><u>The answer is</u>: <i>" + getCurrentCard().name + "</i><br><br>The flavor text of <i>" + guessed_card.name
		+ "</i> is:<br> <span style='background-color: yellow; color: black'>" + guessed_card.flavorText + "</span>");
	}
}

// Call this to give up and see the answer
function giveUp() {
	revealCard(false, randSorryLine() + "<br><u>The answer is</u>: <i>" + getCurrentCard().name + "</i>");
}

// Removes a certain card from each card pool
function removeFromPools(card) {
	let index_full = Current_Pool_Full.indexOf(card);
	let index_no_obvious = Current_Pool_No_Obvious.indexOf(card);
	if (index_full >= 0) {
		Current_Pool_Full.splice(index_full, 1);
	}
	if (index_no_obvious >= 0) {
		Current_Pool_No_Obvious.splice(index_no_obvious, 1);
	}
}

// Toggle the mode to a new mode
function setMode(newMode) {
	Mode = newMode;

	if (Mode === MODES.MULTIPLE_CHOICE) {
		$("#HS_Flav_multiple_choice_input").show();
		$("#HS_Flav_free_response_input1").hide();
		$("#HS_Flav_free_response_input2").hide();
		$("#mc_size_container").show();
		$("#fr_hints_container").hide();
	} else if (Mode == MODES.FREE_REPONSE) {
		$("#HS_Flav_multiple_choice_input").hide();
		$("#HS_Flav_free_response_input1").show();
		$("#HS_Flav_free_response_input2").show();
		$("#mc_size_container").hide();
		$("#fr_hints_container").show();
	}
	let currentPool = getCurrentPool();
	if (currentPool && currentPool.length > 0) {
		setNewCurrentCard(!!getCurrentCard() && !isCurrentCardRevealed());
	}
}

// Get a random emote line
function randWowLine() {
	return "<span style='background-color: green'>" + getRandomFromArray(WOW_LINES) + "</span>";
}
function randOopsLine() {
	return "<span style='background-color: red'>" + getRandomFromArray(OOPS_LINES) + "</span>";
}
function randSorryLine() {
	return "<span style='background-color: red'>" + getRandomFromArray(SORRY_LINES) + "</span>";
}

// Get the official card library URL of a card
function getCardLibraryURL(card) {
	return "https://playhearthstone.com/en-us/cards/" + card.slug;
}

// Reset the score
function tryReset() {
	if (confirm("This will reset ALL of your score and streak data. Are you sure?")) {
		Current_Streak_mc = 0;
		Best_Streak_mc = 0;
		Total_Score_mc = 0;
		Current_Streak_fr = 0;
		Best_Streak_fr = 0;
		Total_Score_fr = 0;
		setScoreCookies();
		update_score_display();
	}
}



// ===== UI =====

// When you press enter in the guess input field, it should submit the guess
document.getElementById("guessField").addEventListener("keydown", function(event) {
	if (event.keyCode === 13) {
		guessCard();
	}
});

// Add the hint update function as a listener of the hint checkbox
$(function() {
	let hint_checkbox = $('#hintsSwitch');
	hint_checkbox.change(function() {
		Hints = hint_checkbox.prop('checked');
	});
});

// Add the update function as a listener of the "No Obious Prompts" checkbox
$(function() {
	let no_obvious_checkbox = $('#noObviousSwitch');
	no_obvious_checkbox.change(function() {
		No_Obvious_Prompts = no_obvious_checkbox.prop('checked');
	});
});

// Mode toggle listeners
$(function() {
	let mc_radio = $('#multipleChoiceRadio');
	let fr_radio = $('#freeResponseRadio');
	mc_radio.change(function() {
		setMode(MODES.MULTIPLE_CHOICE);
	});
	fr_radio.change(function() {
		setMode(MODES.FREE_REPONSE);
	});
});

// Multiple choice size spinner initialization.
// Source: https://www.cssscript.com/increment-decrement-number-ispinjs/
let spinner = new ISpin(document.getElementById('mc-size-input'), {
	// wrapper class
	wrapperClass: 'ispin-wrapper',
	// button class
	// buttonsClass: String,
	// step size
	step: 1,
	// page step
	pageStep: 20,
	// repeat interval
	repeatInterval: 200,
	// enable overflow
	wrapOverflow: false,
	// parse
	// parse: String => Number,
	// format
	// format: Number => String,
	// disable the input spinner
	disabled: false,
	// min/max values
	max: MULTIPLE_CHOICE_MAX_SIZE,
	min: MULTIPLE_CHOICE_MIN_SIZE,
	// onChange callback
	onChange: update_mc_size
});

// Updates the multiple choice option size based on the spinner value
function update_mc_size() {
	let new_size = parseInt($('#mc-size-input').val());
	if (new_size) {
		Multiple_Choice_Size = Math.max(MULTIPLE_CHOICE_MIN_SIZE, Math.min(new_size, MULTIPLE_CHOICE_MAX_SIZE));
	}
	$('#mc-size-input').val(Multiple_Choice_Size);
}

// Updates the score display
function update_score_display() {
	$("#current_streak_mc_display").text(Current_Streak_mc);
	$("#best_streak_mc_display").text(Best_Streak_mc);
	$("#total_score_mc_display").text(Total_Score_mc);
	$("#current_streak_fr_display").text(Current_Streak_fr);
	$("#best_streak_fr_display").text(Best_Streak_fr);
	$("#total_score_fr_display").text(Total_Score_fr);
}


// Init UI
// Initialize to multiple choice
setMode(MODES.MULTIPLE_CHOICE);
// Initialize multiple choice options
$('#mc-size-input').val(MULTIPLE_CHOICE_DEFAULT_SIZE);
// Init score UI
update_score_display();


// TODO - language options
// See Bootstrap dropdown here - https://getbootstrap.com/docs/4.2/components/forms/?



// ===== COOKIES =====
// Permissions only applies to "tracking" cookies for EU users - https://javascript.info/cookie

// Set the score/streak variables based on cookies
function getScoreCookies() {
	Current_Streak_mc = getCookie("Current_Streak_mc");
	Best_Streak_mc = getCookie("Best_Streak_mc");
	Total_Score_mc = getCookie("Total_Score_mc");
	Current_Streak_fr = getCookie("Current_Streak_fr");
	Best_Streak_fr = getCookie("Best_Streak_fr");
	Total_Score_fr = getCookie("Total_Score_fr");
	// Make sure they're well-typed
	if (!Current_Streak_mc) { Current_Streak_mc = 0; }
	if (!Best_Streak_mc) { Best_Streak_mc = 0; }
	if (!Total_Score_mc) { Total_Score_mc = 0; }
	if (!Current_Streak_fr) { Current_Streak_fr = 0; }
	if (!Best_Streak_fr) { Best_Streak_fr = 0; }
	if (!Total_Score_fr) { Total_Score_fr = 0; }
}

// Set the cookies based on current score/streak variables
function setScoreCookies() {
	setCookie("Current_Streak_mc", Current_Streak_mc);
	setCookie("Best_Streak_mc", Best_Streak_mc);
	setCookie("Total_Score_mc", Total_Score_mc);
	setCookie("Current_Streak_fr", Current_Streak_fr);
	setCookie("Best_Streak_fr", Best_Streak_fr);
	setCookie("Total_Score_fr", Total_Score_fr);
}

// Expiration date source - https://stackoverflow.com/questions/532635/javascript-cookie-with-no-expiration-date
function setCookie(cname, value) {
	document.cookie = cname + "=" + value + "; expires=2038-01-19, 01:00:00 UTC";
}
// Source - https://www.w3schools.com/js/js_cookies.asp
function getCookie(cname) {
	let name = cname + "=";
	let decodedCookie = decodeURIComponent(document.cookie);
	let ca = decodedCookie.split(';');
	for(let i = 0; i <ca.length; i++) {
		let c = ca[i];
		while (c.charAt(0) == ' ') {
			c = c.substring(1);
		}
		if (c.indexOf(name) == 0) {
			return c.substring(name.length, c.length);
		}
	}
	return "";
}



// ===== UTILITY =====

// Returns a random element from an array
function getRandomFromArray(arr) {
	return arr[Math.floor(Math.random() * arr.length)];
}

// Shuffles an array in place.
// Source: https://stackoverflow.com/questions/6274339/how-can-i-shuffle-an-array
function shuffleArray(a) {
	for (let i = a.length - 1; i > 0; i--) {
		let j = Math.floor(Math.random() * (i + 1));
		let x = a[i];
		a[i] = a[j];
		a[j] = x;
	}
}

// Returns the longest matching substring between two strings
function bestSubstringMatch(s1, s2) {
	let s2_FullCase = s2;
	s1 = s1.toLowerCase();
	s2 = s2.toLowerCase();

	let bestLength = 0;
	let bestString = "";
	for (let i = 0; i < s1.length; i++) {
		for (let j = 0; j < s2.length; j++) {
			let I = i, J = j, length = 0;
			while (I < s1.length && J < s2.length && s1[I] === s2[J]) {
				length++;
				I++;
				J++;
			}
			if (length > bestLength) {
				bestLength = length;
				bestString = s2_FullCase.substring(j, J);
			}
		}
	}
	return bestString;
}

// Returns a similarity score of two strings, between 0 and 1, based on Levenshtein Distance
// https://stackoverflow.com/questions/10473745/compare-strings-javascript-return-of-likely
function similarity(s1, s2) {
	let longer = s1;
	let shorter = s2;
	if (s1.length < s2.length) {
		longer = s2;
		shorter = s1;
	}
	let longerLength = longer.length;
	if (longerLength == 0) {
		return 1.0;
	}
	return (longerLength - editDistance(longer, shorter)) / parseFloat(longerLength);
}

function editDistance(s1, s2) {
	s1 = s1.toLowerCase();
	s2 = s2.toLowerCase();

	let costs = new Array();
	for (let i = 0; i <= s1.length; i++) {
		let lastValue = i;
		for (let j = 0; j <= s2.length; j++) {
			if (i == 0) {
				costs[j] = j;
			} else {
				if (j > 0) {
					let newValue = costs[j - 1];
					if (s1.charAt(i - 1) != s2.charAt(j - 1)) {
						newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
					}
					costs[j - 1] = lastValue;
					lastValue = newValue;
				}
			}
		}
		if (i > 0) {
			costs[s2.length] = lastValue;
		}
	}
	return costs[s2.length];
}
