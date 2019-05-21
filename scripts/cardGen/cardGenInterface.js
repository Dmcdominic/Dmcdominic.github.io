// MINIONS
function generateMinion() {
	var newMinion = generateFullRandom("Minion");
	$("#minions-container").prepend("<p>" + newMinion + "</p>");
}

function clearMinions() {
	$("#minions-container").empty();
}

// SPELLS
function generateSpell() {
	var newSpell = generateFullRandom("Spell");
	$("#spells-container").prepend("<p>" + newSpell + "</p>");
}

function clearSpells() {
	$("#spells-container").empty();
}
