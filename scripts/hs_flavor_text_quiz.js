// Settings
const SIMILARITY_THRESHOLD = 0.8; // From range [0, 1];
const SUBSTRING_MIN_LENGTH = 4;

// Global variable to store card data
var Card_Data = null;
var All_Cards = null;
var Cards_With_Flavor = null;
var Current_Card = null;


// Fetch the Hearthstone card data from the API
fetch("https://omgvamp-hearthstone-v1.p.rapidapi.com/cards?locale=enUS&collectible=1", {
	// fetch("https://omgvamp-hearthstone-v1.p.rapidapi.com/cards/types/Minion?locale=enUS&collectible=1", {
	"method": "GET",
	"headers": {
		"x-rapidapi-host": "omgvamp-hearthstone-v1.p.rapidapi.com",
		"x-rapidapi-key": "3aa97f32aamshac9667a9345bfd8p1cb277jsne1df2e593145"
	}
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
.then(json => generateQuiz(json))
.catch(err => {
	console.log(err);
});


// Generate quiz questions
function generateQuiz(json) {
	console.log("Full card data:");
	console.log(json);
	Card_Data = json;
	All_Cards = [];
	Cards_With_Flavor = [];

	let entries = Object.entries(json);
	entries.forEach(cardSet => {
		cardSet[1].forEach(card => {
			All_Cards.push(card);
			if (card.flavor !== undefined) {
				Cards_With_Flavor.push(card);
			}
		});
	});
	console.log("All cards:");
	console.log(All_Cards);
	console.log("Cards with flavor:");
	console.log(Cards_With_Flavor);

	setNewCurrentCard();
}

// Sets Current_Card to a new random card
function setNewCurrentCard() {
	if (Current_Card !== null) {
		$("#correctCardImg").attr("src", Current_Card.img);
	}
	Current_Card = getRandomCard();
	console.log("\n");
	console.log("Here's some flavor text:");
	console.log(Current_Card.flavor);
	console.log("Can you guess the card?");
}
function getRandomCard() {
	return Cards_With_Flavor[Math.floor(Math.random() * Cards_With_Flavor.length)];
}

// Call this to guess what the card is
function guessCard(guess) {
	guess = guess.toLowerCase();
	let currentCardNameLower = Current_Card.name.toLowerCase();
	let similarityScore = similarity(guess, Current_Card.name);
	if (guess === currentCardNameLower) {
		console.log("That's right!");
		setNewCurrentCard();
	} else if (similarityScore >= SIMILARITY_THRESHOLD) {
		console.log("Close enough! The answer is: " + Current_Card.name);
		// console.log("[You had a similarity score of " + similarityScore + "]");
		setNewCurrentCard();
	} else {
		let bestSubstring = bestSubstringMatch(guess, Current_Card.name);
		if (bestSubstring.length >= SUBSTRING_MIN_LENGTH) {
			console.log("Almost! You got this part right: " + bestSubstring);
		} else {
			console.log("Good try but nope.");
		}
		// console.log("[HINT: You had a similarity score of " + similarityScore + "]");
	}
}

// Call this to give up and see the answer
function giveUp() {
	console.log("Okay, okay... The answer is: " + Current_Card.name);
	setNewCurrentCard();
}



// UTILITY

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
	var longer = s1;
	var shorter = s2;
	if (s1.length < s2.length) {
		longer = s2;
		shorter = s1;
	}
	var longerLength = longer.length;
	if (longerLength == 0) {
		return 1.0;
	}
	return (longerLength - editDistance(longer, shorter)) / parseFloat(longerLength);
}

function editDistance(s1, s2) {
	s1 = s1.toLowerCase();
	s2 = s2.toLowerCase();

	var costs = new Array();
	for (var i = 0; i <= s1.length; i++) {
		var lastValue = i;
		for (var j = 0; j <= s2.length; j++) {
			if (i == 0) {
				costs[j] = j;
			} else {
				if (j > 0) {
					var newValue = costs[j - 1];
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
