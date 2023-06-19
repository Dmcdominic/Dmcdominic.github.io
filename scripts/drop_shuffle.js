// Code for Drop-Shuffle.html

// https://developers.google.com/youtube/iframe_api_reference


// ----- USER FACING SETTINGS -----
var volume = 50; // Out of 100

const SHUFFLE_DROP_ODDS = 1.0; // 0.8
const PIVOT_SAME_SONG_DROP_TO_BUILD_ODDS = 1; // 0.75

const CROSSFADE_DURATION_SECONDS = 0.15; // Amount of time during which the build fades out and the drop fades in


// ----- INTERNAL SYSTEM TUNING -----
const CROSSFADE_PRIMING_WINDOW_SECONDS = 4;
const PIVOT_SAME_SONG_DROP_TO_BUILD_MINIMUM_GAP_SECONDS = 5;
const SKIP_TO_CHANGEUP_GAP_SECONDS = 6;

const CHECK_FOR_UPDATES_INTERVAL_MS = 10; // With limited testing, this seems to have a minimum of ~5ms


// ----- Constants -----
const BUILD = 0;
const DROP = 1;
const BoD_ANY = 2;

const STATE_NONE = 0;
const STATE_PAUSED = 1;
const STATE_BUILDING = 2;
const STATE_DROPPING = 3;
const STATE_FULLPLAYING = 4;
const STATE_WAITING_TO_BUILD = 5;
const STATE_WAITING_TO_DROP = 6;
const STATE_WAITING_TO_FULLPLAY = 7;
const STATE_PHASING_OUT_OF_BUILD = 8;
const STATE_PHASING_INTO_DROP = 9;
const STATE_ENDED = 10;


// ----- Variables -----
// songs are defined in drop_shuffle_data.js
var available_songs = [[], [], []]; // available_songs[0] == Builds, [1] == Drops, [2] == All songs

var tracks = [
    {
        "song": null,
        "build": null,
        "drop": null,
        "state": null,
        "player": null
    },
    {
        "song": null,
        "build": null,
        "drop": null,
        "state": null,
        "player": null
    }
];


// ----- UI Elements -----
var UI_Volume_Slider = document.getElementById("volumeSlider");
var UI_Volume_Display = document.getElementById("volumeDisplay");
UI_Volume_Slider.value = volume;
UI_Volume_Slider.oninput = function() {
    updateVolume(this.value);
}


// ----- Initialization -----

// Load the IFrame Player API code asynchronously.
var tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
var firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

generateAvailableSongs();
let first_BoD = (SHUFFLE_DROP_ODDS > Math.random()) ? BUILD : BoD_ANY;
setTrackToRandomSong(tracks[0], first_BoD);
setTrackToRandomSong(tracks[1], getInverseBoD(first_BoD));
setInterval(checkForUpdatesOnInterval, CHECK_FOR_UPDATES_INTERVAL_MS);


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
            'onReady': onPlayerReady(tracks[0]),
            'onStateChange': onPlayerStateChange
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
            'onReady': onPlayerReady(tracks[1]),
            'onStateChange': onPlayerStateChange
        }
    });
}

// Loads the video for a track on its player.
// Assumes that the track has its song and player set up already.
function loadTrackVideo(track) {
    let startSeconds = 0;
    if (track["state"] == STATE_DROPPING || track["state"] == STATE_WAITING_TO_DROP) {
        startSeconds = track["drop"]["dropStart"] - getNextCrossfadePrimingWindow(track);
    }
    track["player"].cueVideoById(track["song"]["videoId"], startSeconds);
}

// The API will call this function when the video player is ready (meaning only the first video).
function onPlayerReady(track) {
    return event => {
        event.target.setVolume(volume);
        let build_or_drop = getTrackBoDRaw(track);
        if (build_or_drop == BUILD || build_or_drop == BoD_ANY) {
            event.target.seekTo(0, true);
            event.target.pauseVideo();
        } else if (build_or_drop == DROP) {
            event.target.seekTo(track["drop"]["dropStart"] - getNextCrossfadePrimingWindow(track), true);
            event.target.pauseVideo();
        }
    };
}

// The API calls this function when a player's state changes.
// Can't yet fully handle the user playing/pausing videos manually, outside of the initial Play
function onPlayerStateChange(event) {
    let track = getTrackFromPlayer(event.target);
    switch (event.data) {
        case YT.PlayerState.UNSTARTED:
            // Any state update needed here?
            break;
        case YT.PlayerState.ENDED:
            startNewSongAfterSongEnd();
            break;
        case YT.PlayerState.PLAYING:
            // If the track state already indicates that it should be playing, no need to update it. Otherwise, the user probably pressed play on the player, so let's update it.
            if (!isStatePlaying(track["state"])) {
                track["state"] = getPlayingStateRaw(track);
            }
            // Ever need to update the state of the other track, and/or even pause the other track if it was playing?
            break;
        case YT.PlayerState.PAUSED:
            // track["state"] = STATE_PAUSED;
            // track["state"] = STATE_ENDED;
            // Any state update needed here?
            break;
        case YT.PlayerState.BUFFERING:
            // Any state update needed here?
            break;
        case YT.PlayerState.CUED:
            // Any state update needed here?
            // Play then pause the video real quick to make sure it's preloaded
            track["player"].setVolume(0);
            track["player"].playVideo();
            track["player"].pauseVideo();
            break;
        default:
            console.error("Unknown event.data passed into onPlayerStateChange(event). Event dump:");
            console.error(event);
            break;
    }
}

// Called at frequent intervals to check for updates such as crossfading and track swap
function checkForUpdatesOnInterval() {
    checkForTrackSwap();
    updateCrossfade();
}

// Called at frequent intervals to check if we're in the middle of phasing between 2 songs and need to update their volumes
function updateCrossfade() {
    let track_fading_out = null;
    let track_fading_in = null;
    if (tracks[0]["state"] == STATE_PHASING_OUT_OF_BUILD) {
        if (!tracks[1]["state"] == STATE_PHASING_INTO_DROP) console.error("tracks[0][\"state\"] == STATE_PHASING_OUT_OF_BUILD but !tracks[1][\"state\"] == STATE_PHASING_INTO_DROP");
        track_fading_out = tracks[0];
        track_fading_in = tracks[1];
    } else if (tracks[1]["state"] == STATE_PHASING_OUT_OF_BUILD) {
        if (!tracks[0]["state"] == STATE_PHASING_INTO_DROP) console.error("tracks[1][\"state\"] == STATE_PHASING_OUT_OF_BUILD but !tracks[0][\"state\"] == STATE_PHASING_INTO_DROP");
        track_fading_out = tracks[1];
        track_fading_in = tracks[0];
    } else {
        return;
    }
    // TODO - should we check for correction needed? (between build end and drop start times lining up) At least try console logging how far off we are from the desired timing
    // Adjust volume
    let current_time = track_fading_out["player"].getCurrentTime();
    let build_end_time = track_fading_out["build"]["buildEnd"];
    let lerp = (current_time - build_end_time) / CROSSFADE_DURATION_SECONDS;
    lerp = clamp(lerp, 0, 1);
    track_fading_in["player"].setVolume(lerp * volume);
    track_fading_out["player"].setVolume((1 - lerp) * volume);
    // Check if the crossfade is done
    if (lerp == 1) {
        track_fading_in["state"] = STATE_DROPPING;
        track_fading_out["state"] = STATE_ENDED;
        track_fading_out["player"].pauseVideo();
        tryPivotTrackToBuild(track_fading_in);
        // Now set up the next next track
        setupNextTrack();
    }
}

// Called by the volume slider to update the volume variable and the current track's volume
function updateVolume(new_volume) {
    volume = new_volume;
    UI_Volume_Display.innerHTML = new_volume + "%";
    let current_track = getCurrentTrack();
    if (current_track != null) {
        current_track["player"].setVolume(volume);
    }
}

// Called at frequent intervals to check if we're building and the buildEnd time has arrived
function checkForTrackSwap() {
    let current_track = getCurrentTrack();
    if (!current_track || !current_track["song"] || !current_track["player"]) return;
    if (current_track["state"] == STATE_BUILDING) {
        let next_track = getNextTrack();
        if (current_track["player"].getCurrentTime() > current_track["build"]["buildEnd"] - getNextCrossfadePrimingWindow(next_track)) {
            // Prime the crossfade by starting the drop track early (at 0 volume) so that it can be faded in at the right time
            current_track["state"] = STATE_PHASING_OUT_OF_BUILD;
            next_track["state"] = STATE_PHASING_INTO_DROP;
            next_track["player"].setVolume(0);
            next_track["player"].playVideo();
        }
    }
}


// Sets the specified track to a random build song
function setTrackToRandomSong(track, build_or_drop) {
    if (available_songs[build_or_drop].length == 0) {
        console.log("Ran out of available " + BoDToString(build_or_drop) + ". Regenerating all lists of all available songs!");
        generateAvailableSongs();
    }

    let song = popAvailableSong(build_or_drop);
    track["song"] = song;

    if (build_or_drop == BUILD) {
        track["build"] = getRandomItemFromArray(song["builds"]);
        track["drop"] = null;
        track["state"] = STATE_WAITING_TO_BUILD;
    } else if (build_or_drop == DROP) {
        track["build"] = null;
        track["drop"] = getRandomItemFromArray(song["drops"]);
        track["state"] = STATE_WAITING_TO_DROP;
    } else if (build_or_drop == BoD_ANY) {
        track["build"] = null;
        track["drop"] = null;
        track["state"] = STATE_WAITING_TO_FULLPLAY;
    } else {
        console.error("Invalid build_or_drop: " + build_or_drop);
    }

    if (track["player"]) {
        loadTrackVideo(track);
    }
}


// Generate the lists of available build songs, drop songs, and all songs
function generateAvailableSongs() {
    available_songs = [[], [], []];
    songs.forEach(song => {
        if (song["builds"].length > 0) {
            available_songs[0].push(song);
        }
        if (song["drops"].length > 0) {
            available_songs[1].push(song);
        }
        available_songs[2].push(song);
    });
    shuffleArray(available_songs[0]);
    shuffleArray(available_songs[1]);
    shuffleArray(available_songs[2]);
}

// Pops an available song from the corresponding build or drop list, and removes it from the other list too
function popAvailableSong(list_index) {
    let song = available_songs[list_index].pop();
    for (let i=0; i <= 2; i++) {
        if (i != list_index) {
            available_songs[i] = available_songs[i].filter(s => {
                return s != song;
            });
        }
    }
    return song;
}

// After a drop or fullplay song is over, start the next totally new song
function startNewSongAfterSongEnd() {
    let current_track = getCurrentTrack(); // The song that just ended should still have a "playing" state
    let next_track = getNextTrack();
    if (!current_track || !next_track) console.error("Invalid current_track or next_track in startNewSongAfterSongEnd()");
    current_track["state"] = STATE_ENDED;
    next_track["state"] = getPlayingStateRaw(next_track);
    next_track["player"].setVolume(volume);
    next_track["player"].playVideo();
    // Now set up the next next track
    setupNextTrack();
}

// Sets up the next song, given that a new song just got setup and playing, typically after a crossfade is done or a song just ended.
function setupNextTrack() {
    let current_track = getCurrentTrack();
    let next_track = getNextTrack();
    if (!current_track || !next_track) console.error("Invalid current_track or next_track in setupNextNextTrack()");
    let next_BoD = null;
    if (current_track["state"] == STATE_BUILDING) {
        next_BoD = DROP;
    } else if (SHUFFLE_DROP_ODDS > Math.random()) {
        next_BoD = BUILD;
    } else {
        next_BoD = BoD_ANY;
    }
    setTrackToRandomSong(next_track, next_BoD);
}

// If the given track is currently a drop but also has a build later in the song, Pivot it to that build, without pausing it!
// Returns true if pivot was valid and completed, and false otherwise.
function tryPivotTrackToBuild(track) {
    let drop = track["drop"];
    if (!drop) return;
    let current_time = track["player"].getCurrentTime();
    let builds = track["song"]["builds"];
    for (let i=0; i < builds.length; i++) {
        let build = builds[i];
        // Had to subtract the crossfade priming window to make sure that this doesn't trigger right as the crossfade ends
        if (current_time < build["buildEnd"] - CROSSFADE_PRIMING_WINDOW_SECONDS && drop["dropStart"] < build["buildEnd"] + PIVOT_SAME_SONG_DROP_TO_BUILD_MINIMUM_GAP_SECONDS) {
            if (PIVOT_SAME_SONG_DROP_TO_BUILD_ODDS > Math.random()) {
                track["drop"] = null;
                track["build"] = build;
                track["state"] = STATE_BUILDING;
                return true;
            }
        }
    }
    return false;
}

// Skips the current track to a few seconds before its changeup (end of build or end of song)
function skipToChangeup() {
    let current_track = getCurrentTrack();
    if (current_track == null) return;
    let player = current_track["player"];
    if (player == null) return;
    if (current_track["state"] == STATE_BUILDING) {
        player.seekTo(current_track["build"]["buildEnd"] - SKIP_TO_CHANGEUP_GAP_SECONDS, true);
    } else if (current_track["state"] == STATE_DROPPING || current_track["state"] == STATE_FULLPLAYING) {
        player.seekTo(player.getDuration() - SKIP_TO_CHANGEUP_GAP_SECONDS, true);
    }
}


// ------------ YOUTUBE PLAYER UTILITY -------------
// Returns the track that is currently playing, or null if neither are.
function getCurrentTrack() {
    let current_track_index = getCurrentTrackIndex();
    if (current_track_index == null) return null;
    return tracks[current_track_index];
}

// Returns the track that is NOT currently playing, or null if neither are playing.
function getNextTrack() {
    let next_track_index = getInverseTrackIndex(getCurrentTrackIndex());
    if (next_track_index == null) return null;
    return tracks[next_track_index];
}

// Returns the index of the track that is currently playing, or null if neither/both are (e.g. while paused or during a crossfade phasing in/out)
function getCurrentTrackIndex() {
    // if (tracks[0]["player"] && tracks[0]["player"].getPlayerState && tracks[0]["player"].getPlayerState() == YT.PlayerState.PLAYING) return 0;
    // if (tracks[1]["player"] && tracks[1]["player"].getPlayerState && tracks[1]["player"].getPlayerState() == YT.PlayerState.PLAYING) return 1;
    // if (tracks[0]["player"] && tracks[0]["player"].getPlayerState && tracks[0]["player"].getPlayerState() == YT.PlayerState.ENDED) return 0;
    // if (tracks[1]["player"] && tracks[1]["player"].getPlayerState && tracks[1]["player"].getPlayerState() == YT.PlayerState.ENDED) return 1;
    if (tracks[0]["state"] == STATE_BUILDING || tracks[0]["state"] == STATE_DROPPING || tracks[0]["state"] == STATE_FULLPLAYING) return 0;
    if (tracks[1]["state"] == STATE_BUILDING || tracks[1]["state"] == STATE_DROPPING || tracks[1]["state"] == STATE_FULLPLAYING) return 1;
    return null;
}

function getInverseTrackIndex(track_index) {
    if (track_index == null) return null;
    return 1 - track_index;
}

// Returns the state that the given track should be in, assuming that it's playing, based on if it has a build or drop (or neither) set
function getPlayingStateRaw(track) {
    return getStateFromBoD(getTrackBoDRaw(track));
}

function getTrackBoDRaw(track) {
    if (track["build"]) return BUILD;
    if (track["drop"]) return DROP;
    return BoD_ANY;
}

function getStateFromBoD(build_or_drop) {
    if (build_or_drop == BUILD) return STATE_BUILDING;
    if (build_or_drop == DROP) return STATE_DROPPING;
    if (build_or_drop == BoD_ANY) return STATE_FULLPLAYING;
    return null;
}

function getInverseBoD(build_or_drop) {
    if (build_or_drop == BUILD) return DROP;
    if (build_or_drop == DROP) return BUILD;
    if (build_or_drop == BoD_ANY) return BoD_ANY;
    console.error("inverseBoD was passed an invalid input: " + build_or_drop);
    return null;
}

function getIndexOfTrack(track) {
    if (track == tracks[0]) return 0;
    if (track == tracks[1]) return 1;
    return null;
}

function getTrackFromPlayer(player) {
    if (player == tracks[0]["player"]) return tracks[0];
    if (player == tracks[1]["player"]) return tracks[1];
    return null;
}

// Returns true if the input indicates a state that is "playing" in any way
function isStatePlaying(state) {
    return state == STATE_BUILDING || state == STATE_DROPPING || state == STATE_FULLPLAYING || state == STATE_PHASING_OUT_OF_BUILD || state == STATE_PHASING_INTO_DROP;
}

// Returns the amount of time that the given track should be playing silently in advance before the crossfade
function getNextCrossfadePrimingWindow(track) {
    return Math.min(CROSSFADE_PRIMING_WINDOW_SECONDS, track["drop"]["dropStart"]);
}


// ------------ ARRAY UTILITY ------------
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


// ------------ OTHER UTILITY ------------
function clamp(x, min, max) {
    return Math.max(min, Math.min(x, max));
}


// ------------ DEBUG UTILITY -------------
function dumpStatus() {
    console.log("------------------ STATUS DUMP ------------------");
    let today = new Date();
    console.log("\tIRL time: " + today.toTimeString());
    console.log(trackToString(0));
    console.log(trackToString(1));
}

function trackToString(track_index) {
    let track = tracks[track_index];
    str = "===== TRACK " + track_index + " =====\n";
    str += stateToString(track["state"]);
    str += "\nSONG:\n\t";
    str += JSON.stringify(track["song"]);
    str += "\nBUILD:\n\t";
    str += JSON.stringify(track["build"]);
    str += "\nDROP:\n\t";
    str += JSON.stringify(track["drop"]);
    str += "\nPLAYER:\n";
    str += playerToString(track["player"]);
    return str;
}

function playerToString(player) {
    str = "\tCurrent time: " + player.getCurrentTime();
    str += "\n\tCurrent player state: " + ytPlayerStateToString(player.getPlayerState());
    return str;
}

function stateToString(state) {
    switch (state) {
        case STATE_NONE:
            return "STATE_NONE";
        case STATE_PAUSED:
            return "STATE_PAUSED";
        case STATE_BUILDING:
            return "STATE_BUILDING";
        case STATE_DROPPING:
            return "STATE_DROPPING";
        case STATE_FULLPLAYING:
            return "STATE_FULLPLAYING";
        case STATE_WAITING_TO_BUILD:
            return "STATE_WAITING_TO_BUILD";
        case STATE_WAITING_TO_DROP:
            return "STATE_WAITING_TO_DROP";
        case STATE_WAITING_TO_FULLPLAY:
            return "STATE_WAITING_TO_FULLPLAY";
        case STATE_PHASING_OUT_OF_BUILD:
            return "STATE_PHASING_OUT_OF_BUILD";
        case STATE_PHASING_INTO_DROP:
            return "STATE_PHASING_INTO_DROP";
        case STATE_ENDED:
            return "STATE_ENDED";
        default:
            return "(invalid or unknown state: " + state + ")";
    }
}

function ytPlayerStateToString(playerState) {
    switch (playerState) {
        case -1:
            return "unstarted";
        case 0:
            return "ended";
        case 1:
            return "playing";
        case 2:
            return "paused";
        case 3:
            return "buffering";
        case 5:
            return "video cued";
        default:
            return "(invalid or unknown ytPlayerState: " + playerState + ")";
    }
}

function BoDToString(build_or_drop) {
    switch (build_or_drop) {
        case BUILD:
            return "BUILD";
        case DROP:
            return "DROP";
        case BoD_ANY:
            return "BoD_ANY";
        default:
            return "(invalid or unknown build_or_drop: " + build_or_drop + ")";
    }
}
