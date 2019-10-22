
var keys = [];
window.addEventListener("keydown",
function(e){
	keys[e.keyCode] = true;
	checkCombinations(e);
},
false);

window.addEventListener('keyup',
function(e){
	keys[e.keyCode] = false;
},
false);

// Check keycodes here: https://keycode.info/
function checkCombinations(e){
	if(keys[65] && keys[76] && keys[69] && keys[67]) {
		window.location.href = "/games/Alec-29/";
	}

	if(keys[72] && keys[83] && keys[68]){
		window.location.href = "/Hearthstone-Design";
	}
}
