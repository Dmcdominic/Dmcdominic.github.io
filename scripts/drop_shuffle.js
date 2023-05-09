// Code for Drop-Shuffle.html

// https://developers.google.com/youtube/iframe_api_reference


// ----- Constants -----
const BUILD = 0;
const DROP = 1;


// ----- Variables -----
// songs are defined in drop_shuffle_data.js
var available_songs = [[], []]; // available_songs[0] == Builds, [1] == Drops

var tracks = [
    {
        "song": null,
        "build": null,
        "drop": null,
        "player": null,
    },
    {
        "song": null,
        "build": null,
        "drop": null,
        "player": null
    }
];


// ----- Initialization -----

// Load the IFrame Player API code asynchronously.
var tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
var firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

songs.shift(); // Drop the song example template
setTrackToRandomSong(0, BUILD);
setTrackToRandomSong(1, DROP);
setInterval(checkForTrackSwap, 50);


// ----- Functions -----

// Create an <iframe> (and YouTube player) after the API code downloads.
function onYouTubeIframeAPIReady() {
    tracks[0]["player"] = new YT.Player('player_0', {
        height: '390',
        width: '640',
        videoId: tracks[0]["song"]["videoId"],
        playerVars: {
            'playsinline': 1
        },
        events: {
            'onReady': onPlayerReady(0, BUILD),
            // 'onStateChange': onPlayer0StateChange
        }
    });
    
    tracks[1]["player"] = new YT.Player('player_1', {
        height: '390',
        width: '640',
        videoId: tracks[1]["song"]["videoId"],
        playerVars: {
            'playsinline': 1
        },
        events: {
            'onReady': onPlayerReady(1, DROP),
            // 'onStateChange': onPlayerStateChange
        }
    });
}

// The API will call this function when the video player is ready.
function onPlayerReady(track_index, build_or_drop) {
    return event => {
        if (build_or_drop == BUILD) {
            // event.target.seekTo(0, true);
        } else {
            event.target.seekTo(tracks[track_index]["drop"]["dropStart"], true);
        }
    };
}


// TODO - use this for player video end?
// 5. The API calls this function when the player's state changes.
//    The function indicates that when playing a video (state=1),
//    the player should play for six seconds and then stop.

// function onPlayer0StateChange(event) {
//     if (event.data == YT.PlayerState.PLAYING && !done) {
//         setTimeout(stopVideo0, 12900);
//         done = true;
//     }
// }


// Called at frequent intervals to check if the buildEnd time has arrived
//   TODO: or if the drop song is about to end? or handle that with a video end event listener?
function checkForTrackSwap() {
    let current_track_index = getTrackIndexCurrentlyPlaying();
    if (current_track_index == null) return;
    let track = tracks[current_track_index];
    if (!track["song"] || !track["player"]) return;
    if (track["build"]) {
        if (track["player"].getCurrentTime() > track["build"]["buildEnd"]) {
            swapCurrentTrackPlaying();
        }
    } else if (track["drop"]) {
        // TODO: or if the drop song is about to end? or handle that with a video end event listener?
    } else {
        console.error("Track " + getTrackIndexCurrentlyPlaying() + " has a song and player but no build or drop set");
        return;
    }
}


// Sets the specified track to a random build song
function setTrackToRandomSong(track_index, build_or_drop) {
    if (available_songs[build_or_drop].length == 0) {
        generateAvailableSongs(build_or_drop);
    }

    let song = available_songs[build_or_drop].pop();
    tracks[track_index]["song"] = song;
    if (build_or_drop == BUILD) {
        tracks[track_index]["build"] = getRandomItemFromArray(song["builds"]);
        tracks[track_index]["drop"] = null;
    } else {
        tracks[track_index]["build"] = null;
        tracks[track_index]["drop"] = getRandomItemFromArray(song["drops"]);
    }
}


// Generate the list of available build songs or drop songs
function generateAvailableSongs(build_or_drop) {
    available_songs[build_or_drop] = [];
    let key = (build_or_drop ? "drops" : "builds");
    songs.forEach(song => {
        if (song[key].length > 0) {
            available_songs[build_or_drop].push(song);
        }
    });
    shuffleArray(available_songs[build_or_drop]);
}

// Stops the current track (with a small delay) and plays the next one
function swapCurrentTrackPlaying() {
    let current_track_index = getTrackIndexCurrentlyPlaying();
    let next_track_index = 1 - current_track_index;
    let current_track = tracks[current_track_index];
    let next_track = tracks[next_track_index];
    setTimeout(function() {
        current_track["player"].stopVideo();
    }, 100);
    next_track["player"].playVideo();
    // TODO - initialize the next track(s)
}

// Returns the index of the track that is currently playing, or null if neither are.
function getTrackIndexCurrentlyPlaying() {
    if (tracks[0]["player"] && tracks[0]["player"].getPlayerState && tracks[0]["player"].getPlayerState() == 1) return 0;
    if (tracks[1]["player"] && tracks[1]["player"].getPlayerState && tracks[1]["player"].getPlayerState() == 1) return 1;
    return null;
}


// ------------ UTILITY ------------
function getRandomItemFromArray(array) {
    return array[Math.floor(Math.random()*array.length)];
}

// https://stackoverflow.com/questions/2450954/how-to-randomize-shuffle-a-javascript-array
function shuffleArray(array) {
    let currentIndex = array.length;
    // While there remain elements to shuffle.
    while (currentIndex != 0) {
      // Pick a remaining element.
      let randomIndex = Math.floor(Math.random() * currentIndex);
      currentIndex--;
      // And swap it with the current element.
      [array[currentIndex], array[randomIndex]] = [
        array[randomIndex], array[currentIndex]];
    }
}
