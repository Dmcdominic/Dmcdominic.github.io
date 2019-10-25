$(function(){
	var page_pathname = window.location.pathname;
	var pages = { "Portfolio" 	: ".portfolio-active",
								"about" 			: ".about-active",
								"Projects" 		: ".projects-active",
								"Samples" 		: ".samples-active",
								"Contact" 		: ".contact-active"};

	for (var page_name in pages) {
		if (page_pathname.includes(page_name)) {
			var nav_link = pages[page_name];
			setTimeout(function() {
				$(nav_link).addClass("active");
			}, 50);
		}
	}

});
