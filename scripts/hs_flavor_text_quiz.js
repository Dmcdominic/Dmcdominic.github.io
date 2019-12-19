// Settings
const SIMILARITY_THRESHOLD = 0.8; // From range [0, 1];
const SUBSTRING_MIN_LENGTH = 4; // You get a hint if you get this many chars right
const PAGE_SIZE = 500; // This seems to be the cap

// OAuth Data
const CLIENT_ID = "b7777d5b2cf8467697f17db51270a714";
const CLIENT_SECRET = "AgbO2QvwGDaFrtUdQstKCRJNZlBQ6vTZ";

// Global Token data
var Access_Token = null;

// Global variables to store card data
var All_Cards = [];
var Cards_With_Flavor = [];
var Current_Card = null;



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

	console.log("All cards:");
	console.log(All_Cards);

	if (json.page >= json.pageCount) {
		generateQuiz();
	} else {
		getCardData(json.page + 1);
	}
}

// Generate quiz questions, once all data has been loaded
function generateQuiz() {
	// TODO - set Cards_With_Flavor to be filtered All_Cards
	Cards_With_Flavor = All_Cards.filter(card => card.flavorText !== undefined && card.flavorText.trim());
	console.log("Cards_With_Flavor:");
	console.log(Cards_With_Flavor);
	setNewCurrentCard();
}


// ===== Quiz Functionality =====

function revealCard(textToShow) {
	$("#correctCardImg").attr("src", Current_Card.image);
	$("#answerTextContainer").html(textToShow);
	$("#answerTextContainer").show();
	$("#HS_Flav_next").show();
	$("#flavorText").show();
	$("#HS_Flav_input").hide();
	// $("#HS_Flav_next_button").focus();
}

// Sets Current_Card to a new random card
function setNewCurrentCard() {
	$("#correctCardImg").attr("src", "/images/HS_Flavor_Text_Quiz/Mystery Card.png");

	Current_Card = getRandomCard();
	Current_Card.name = Current_Card.name.trim();
	Current_Card.flavorText = Current_Card.flavorText.trim();
	$("#flavorText").html(Current_Card.flavorText);
	$("#answerTextContainer").hide();
	$("#HS_Flav_next").hide();
	$("#flavorText").show();
	$("#HS_Flav_input").show();
	$("#guessField").val("");
	$("#guessField").focus();
}
function getRandomCard() {
	return Cards_With_Flavor[Math.floor(Math.random() * Cards_With_Flavor.length)];
}

// Call this to guess what the card is
function guessCard(guess) {
	if (guess === undefined) {
		guess = $("#guessField").val();
	}
	guess = guess.toLowerCase();

	$("#answerTextContainer").show();

	let currentCardNameLower = Current_Card.name.toLowerCase();
	let similarityScore = similarity(guess, Current_Card.name);
	if (guess === currentCardNameLower) {
		revealCard("That's right!<br><u>The answer is</u>: <i>" + Current_Card.name + "</i>");
	} else if (similarityScore >= SIMILARITY_THRESHOLD) {
		revealCard("Close enough!<br><u>The answer is</u>: <i>" + Current_Card.name + "</i>");
		// console.log("[You had a similarity score of " + similarityScore + "]");
	} else {
		let bestSubstring = bestSubstringMatch(guess, Current_Card.name);
		if (bestSubstring.length >= SUBSTRING_MIN_LENGTH) {
			$("#answerTextContainer").html("Almost! You got this part right: \"" + bestSubstring + "\"");
		} else {
			$("#answerTextContainer").html("Good try but nope.");
		}
		// console.log("[HINT: You had a similarity score of " + similarityScore + "]");
	}
}

// Call this to give up and see the answer
function giveUp() {
	revealCard("Okay, okay...<br><u>The answer is</u>: <i>" + Current_Card.name + "</i>");
}

// When you press enter in the guess input field, it should submit the guess
var input = document.getElementById("guessField");
input.addEventListener("keyup", function(event) {
	if (event.keyCode === 13) {
		guessCard();
	}
});



// ===== UTILITY =====

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
