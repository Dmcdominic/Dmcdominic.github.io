// Code for Drop-Shuffle.html


// 2. This code loads the IFrame Player API code asynchronously.
var tag = document.createElement('script');

tag.src = "https://www.youtube.com/iframe_api";
var firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

// 3. This function creates an <iframe> (and YouTube player)
//    after the API code downloads.
var player_0;
var player_1;
function onYouTubeIframeAPIReady() {
    player_0 = new YT.Player('player_0', {
        height: '390',
        width: '640',
        videoId: 'yBLdQ1a4-JI',
        playerVars: {
            'playsinline': 1
        },
        events: {
            'onReady': onPlayer0Ready,
            'onStateChange': onPlayer0StateChange
        }
    });
    
    player_1 = new YT.Player('player_1', {
        height: '390',
        width: '640',
        videoId: 'TKfS5zVfGBc',
        playerVars: {
            'playsinline': 1
        },
        events: {
            'onReady': onPlayer1Ready,
            // 'onStateChange': onPlayerStateChange
        }
    });
}

// 4. The API will call this function when the video player is ready.
function onPlayer0Ready(event) {
    console.log("onPlayer0Ready(event) called");
    // We can't play the video directly here because Chrome prevents autoplay if there hasn't been user input yet (I think)
}

function onPlayer1Ready(event) {
    console.log("onPlayer1Ready(event) called");
    event.target.seekTo(3.5, true);
}

// 5. The API calls this function when the player's state changes.
//    The function indicates that when playing a video (state=1),
//    the player should play for six seconds and then stop.
var done = false;
function onPlayer0StateChange(event) {
    if (event.data == YT.PlayerState.PLAYING && !done) {
        setTimeout(stopVideo0, 12900);
        done = true;
    }
}

function stopVideo0() {
    setTimeout(function() {
        player_0.stopVideo();
        console.log(player_0.getCurrentTime());
    }, 100);
    player_1.playVideo();
}