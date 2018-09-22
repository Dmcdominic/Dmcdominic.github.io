$(function(){
	$("#nav-bar").load("nav.html");

	var page_pathname = window.location.pathname;
	var pages = { "index" 	: ".index-active",
								"about" 	: ".about-active",
								"work" 		: ".work-active",
								"contact" : ".contact-active"};

	for (var page_name in pages) {
		if (page_pathname.includes(page_name)) {
			var nav_link = pages[page_name];
			setTimeout(function() {
				$(nav_link).addClass("active");
			}, 50);
		}
	}

});
