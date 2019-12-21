// Settings
const SIMILARITY_THRESHOLD = 0.8; // From range [0, 1];
const SUBSTRING_MIN_LENGTH = 4; // You get a hint if you get this many chars right
const PAGE_SIZE = 500; // This seems to be the cap
const MULTIPLE_CHOICE_DEFAULT_SIZE = 4;
const MULTIPLE_CHOICE_MIN_SIZE = 2;
const MULTIPLE_CHOICE_MAX_SIZE = 100;

// OAuth Data
const CLIENT_ID = "b7777d5b2cf8467697f17db51270a714";
const CLIENT_SECRET = "AgbO2QvwGDaFrtUdQstKCRJNZlBQ6vTZ";

// Modes
const MODES = {
	MULTIPLE_CHOICE: "Multiple Choice",
	FREE_REPONSE: "Free Response"
}

// Global Token data
var Access_Token = null;

// Global variables to store card data
var All_Cards = [];
var Cards_With_Flavor = [];
var Current_Card = null;
var Current_Options = [];
var Options_to_Buttons = {};
var Current_Streak = 0;
var Total_Score = 0;

// User Settings
var Mode = MODES.MULTIPLE_CHOICE;
var Multiple_Choice_Size = MULTIPLE_CHOICE_DEFAULT_SIZE;
var Hints = true;



// ===== Fetching Data from the Hearthstone API =====

// Reference:
// https://develop.battle.net/documentation/hearthstone/game-data-apis
// https://develop.battle.net/documentation/guides/using-oauth
// https://develop.battle.net/documentation/guides/using-oauth/client-credentials-flow
// https://develop.battle.net/access/clients/details/b7777d5b2cf8467697f17db51270a714

// First, get an access token
// Reference:
// https://github.com/search?q=%22.battle.net%2Foauth%2Ftoken%22+fetch&type=Code
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
	getCardData(1);
})
.catch(err => {
	console.log(err);
});


// Now use the token to actually get card data
// Reference:
// https://github.com/search?q=%22.api.blizzard.com%2Fhearthstone%2F%22+fetch&type=Code
function getCardData(pageNum) {
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
	});
}

// Takes in a page of card data and either requests the next page, or generates the quiz
function appendCardData(json) {
	All_Cards = All_Cards.concat(json.cards);
	// console.log("All cards:");
	// console.log(All_Cards);

	if (json.page >= json.pageCount) {
		generateQuiz();
	} else {
		getCardData(json.page + 1);
	}
}

// Generate quiz questions, once all data has been loaded
function generateQuiz() {
	Cards_With_Flavor = All_Cards.filter(card => card.flavorText !== undefined && card.flavorText.trim());
	console.log("Cards_With_Flavor:");
	console.log(Cards_With_Flavor);
	setNewCurrentCard();
}


// ===== Quiz Functionality =====

function revealCard(correct, textToShow) {
	if (correct) {
		Current_Streak++;
		Total_Score++;
	} else {
		Current_Streak = 0;
	}
	$("#current_streak_display").text(Current_Streak);
	$("#total_score_display").text(Total_Score);

	$("#correctCardImg").attr("src", Current_Card.image);
	$("#answerTextContainer").html(textToShow);
	$("#answerTextContainer").show();
	$("#HS_Flav_next").show();
	$('#HS_Flav_opt_butt').show();
	$("#flavorText").show();
	$("#HS_Flav_multiple_choice_input").hide();
	$("#HS_Flav_free_response_input").hide();
	// $("#HS_Flav_next_button").focus();
}

// Sets Current_Card to a new random card
function setNewCurrentCard() {
	$("#correctCardImg").attr("src", "/images/HS_Flavor_Text_Quiz/Mystery Card.png");

	Current_Card = getRandomCard();
	// Current_Card.name = Current_Card.name.trim();
	// Current_Card.flavorText = Current_Card.flavorText.trim();

	$("#HS_Flav_multiple_choice_input").hide();
	$("#HS_Flav_free_response_input").hide();
	if (Mode == MODES.MULTIPLE_CHOICE) {
		setOptions();
		$("#HS_Flav_multiple_choice_input").show();
	} else if (Mode == MODES.FREE_REPONSE) {
		$("#HS_Flav_free_response_input").show();
	}

	$("#flavorText").html(Current_Card.flavorText);
	$("#answerTextContainer").hide();
	$("#HS_Flav_next").hide();
	$("#HS_Flav_streak_display").show();
	$('#HS_Flav_opt_butt').show();
	$("#flavorText").show();
	$("#guessField").val("");
	$("#guessField").focus();
}

// Set options for Multiple Choice
function setOptions() {
	update_mc_size();
	update_mc_display_width();
	if (Cards_With_Flavor.length < Multiple_Choice_Size) {
		throw "Not enough cards to generate that many choices";
	}

	Current_Options = [Current_Card];
	while (Current_Options.length < Multiple_Choice_Size) {
		let nextCard = getRandomCard();
		if (!Current_Options.includes(nextCard)) {
			Current_Options.push(nextCard);
		}
	}
	shuffleArray(Current_Options);

	// Generate a multiple choice button for each option
	clearMCOptionButtons();
	let container = document.getElementById("mc_options_container");
	let sample_btn = document.getElementById("sample_mc_option_btn");
	Options_to_Buttons = {};

	for (let i=0; i < Current_Options.length; i++) {
		let card = Current_Options[i];
		var new_btn = sample_btn.cloneNode(true);
		new_btn.style.display = "inline-block";
		new_btn.id = "real_mc_option_btn";
		Options_to_Buttons[new_btn] =
		$(new_btn).text(card.name);
		$(new_btn).attr("onclick", "guessCardSlug('" + card.slug + "')");
		container.appendChild(new_btn);
	}
}

// Clear all the multiple choice option buttons
function clearMCOptionButtons() {
	var sample_btn = document.getElementById("sample_mc_option_btn");
	var new_sample_btn = sample_btn.cloneNode(true);

	var container = document.getElementById("mc_options_container");
	while (container.hasChildNodes()) {
		var last = container.removeChild(container.lastChild);
	}
	container.append(new_sample_btn);
}

// Returns a random card (from Cards_With_Flavor)
function getRandomCard() {
	return Cards_With_Flavor[Math.floor(Math.random() * Cards_With_Flavor.length)];
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

	let currentCardNameLower = Current_Card.name.toLowerCase();
	let similarityScore = similarity(guess, Current_Card.name);
	if (guess === currentCardNameLower) {
		revealCard(true, "That's right!<br><u>The answer is</u>: <i>" + Current_Card.name + "</i>");
	} else if (similarityScore >= SIMILARITY_THRESHOLD) {
		revealCard(true, "Close enough!<br><u>The answer is</u>: <i>" + Current_Card.name + "</i>");
		// console.log("[You had a similarity score of " + similarityScore + "]");
	} else {
		let bestSubstring = bestSubstringMatch(guess, Current_Card.name);
		if (Hints && bestSubstring.length >= SUBSTRING_MIN_LENGTH) {
			$("#answerTextContainer").html("Almost! You got this part right: \"" + bestSubstring + "\"");
		} else {
			$("#answerTextContainer").html("You guessed: \"" + fullCaseGuess +  "\". Good try but nope.");
		}
		// console.log("[HINT: You had a similarity score of " + similarityScore + "]");
	}
}
// "slug" is the card's slug
function guessCardSlug(slug) {
	console.assert(Mode === MODES.MULTIPLE_CHOICE);
	if (slug === Current_Card.slug) {
		revealCard(true, "You got it!<br><u>The answer is</u>: <i>" + Current_Card.name + "</i>");
	} else {
		let guessed_card_list = Current_Options.filter(card => card.slug === slug);
		console.assert(guessed_card_list.length === 1);
		let guessed_card = guessed_card_list[0];
		revealCard(false, "Sorry, <u>The answer is</u>: <i>" + Current_Card.name + "</i><br>The flavor text of " + guessed_card.name + " is: \"" + guessed_card.flavorText + "\"");
	}
}

// Call this to give up and see the answer
function giveUp() {
	revealCard(false, "Okay, okay...<br><u>The answer is</u>: <i>" + Current_Card.name + "</i>");
}

// Toggle the mode to a new mode
function setMode(newMode) {
	Mode = newMode;
	if (Mode === MODES.MULTIPLE_CHOICE) {
		$("#HS_Flav_multiple_choice_input").show();
		$("#HS_Flav_free_response_input").hide();
		$("#mc_size_container").show();
		$("#fr_hints_container").hide();
	} else if (Mode == MODES.FREE_REPONSE) {
		$("#HS_Flav_multiple_choice_input").hide();
		$("#HS_Flav_free_response_input").show();
		$("#mc_size_container").hide();
		$("#fr_hints_container").show();
	}
	if (Cards_With_Flavor && Cards_With_Flavor.length > 0) {
		setNewCurrentCard();
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
		hint_checkbox.each(function(index, box) {
			Hints = (box.checked || $(box).prop('checked'));
		});
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

// Toggles the options card on/off
function toggle_options_display() {
	let optionsContainer = $('#optionsContainer');
	optionsContainer.each(function(index, options_container) {
		let element = $(options_container);
		if (element.css("display") === "none") {
			element.css("display", "block");
		} else {
			element.css("display", "none");
		}
	});
}

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
// Updates the multiple choice options column display width
function update_mc_display_width() {
	$('#mc_options_col').removeClass("col-lg-5 col-md-6 col-sm-9");
	$('#mc_options_col').removeClass("col-lg-7 col-md-9");
	if (Multiple_Choice_Size < 6) {
		$('#mc_options_col').addClass("col-lg-5 col-md-6 col-sm-9");
	} else if (Multiple_Choice_Size < 20) {
		$('#mc_options_col').addClass("col-lg-7 col-md-9");
	}
}

// Init UI
// Set the options container to hide properly once Bootstrap does its thing
setTimeout(function() {
	$('#optionsContainer').css("display", "none");
	$('#optionsContainer').css("opacity", "1");
}, 50);
// Initialize to multiple choice
setMode(MODES.MULTIPLE_CHOICE);
// Initialize multiple choice options
$('#mc-size-input').val(MULTIPLE_CHOICE_DEFAULT_SIZE);


// TODO - language options
// See Bootstrap dropdown here - https://getbootstrap.com/docs/4.2/components/forms/?



// ===== UTILITY =====

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
