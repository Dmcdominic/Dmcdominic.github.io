
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

function checkCombinations(e){
	if(keys[72] && keys[83] && keys[68]){
		window.location.href = "/Hearthstone-Design";
	}
}
