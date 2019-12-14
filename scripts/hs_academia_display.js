
// Add the update function as a listener
$(function() {
    $('.abstract_checkbox').change(function() {
        update_abstracts_display();
    });
});

// This is called whenever the checkbox is switched
function update_abstracts_display() {
    // Figure out if abstracts should be displayed or not
    var display_abstracts = false;
    var checkboxes = $('.abstract_checkbox');
    checkboxes.each(function(index, box) {
        display_abstracts = (box.checked || $(box).prop('checked'));
    });

    // Enable/disable them accordingly
    var abstracts = $('.abstract_section');
    abstracts.each(function(index, abstract_section) {
        var element = $(abstract_section);
				if (display_abstracts) {
        	element.css("display", "block");
				} else {
					element.css("display", "none");
				}
    });
}


// Update the display when the page loads
update_abstracts_display();
