// Code for Drop-Shuffle.html

// https://developers.google.com/youtube/iframe_api_reference


// ----- Constants -----
const DROP_EARLY_PHASEIN_SECONDS = 0.1; // Amount of time the drop should start playing before the build ends, and overlap
const BUILD_END_BLEED_SECONDS = 0.1; // Amount of time that the build song should keep playing after the drop kicks in, and overlap
const PIVOT_SAME_SONG_DROP_TO_BUILD_GAP_SECONDS = 5;
const PIVOT_SAME_SONG_DROP_TO_BUILD_ODDS = 1; // 0.75
const SKIP_TO_CHANGEUP_GAP_SECONDS = 3;
const SHUFFLE_DROP_ODDS = 1.0; // 0.8

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
        "preloading": false,
        "player": null
    },
    {
        "song": null,
        "build": null,
        "drop": null,
        "state": null,
        "preloading": false,
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
generateAvailableSongs();
let first_BoD = (SHUFFLE_DROP_ODDS > Math.random()) ? BUILD : BoD_ANY;
setTrackToRandomSong(tracks[0], first_BoD);
setTrackToRandomSong(tracks[1], getInverseBoD(first_BoD));
setInterval(checkForUpdatesOnInterval, 50);


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
        startSeconds = track["drop"]["dropStart"];
    }
    track["player"].cueVideoById(track["song"]["videoId"], startSeconds);
}

// The API will call this function when the video player is ready (meaning only the first video).
function onPlayerReady(track) {
    return event => {
        let build_or_drop = getTrackBoDRaw(track);
        if (build_or_drop == BUILD || build_or_drop == BoD_ANY) {
            event.target.seekTo(0, true);
            event.target.pauseVideo();
        } else if (build_or_drop == DROP) {
            event.target.seekTo(track["drop"]["dropStart"], true);
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
            // TODO - update this section to appropriately handle the phasing in/out
            if (track["preloading"]) {
                track["preloading"] = false;
            }
            // If the track state already indicates that it should be playing, no need to update it. Otherwise, the user probably pressed play on the player, so let's update it.
            if (!isStatePlaying(track["state"])) {
                track["state"] = getStateFromBoD(getTrackBoDRaw(track));
            }
            // Ever need to update the state of the other track, and/or even pause the other track if it was playing?
            setTimeout(function() {
                tryPivotTrackToBuild(track);
                // Try an assertion here that the other track (determined by inverse, not by getNextTrack()) is not building or dropping (and not YT player playing at all)?
                let next_track = getNextTrack();
                // Should we also check if the next_track is currently the wrong BoD, and if so, pick a new song to fix it? (since maybe we pivoted or something?)
                if (next_track["state"] == STATE_ENDED) {
                    let next_BoD = null;
                    if (getTrackBoDRaw(track) == BUILD) {
                        next_BoD = DROP;
                    } else if (SHUFFLE_DROP_ODDS > Math.random()) {
                        next_BoD = BUILD;
                    } else {
                        next_BoD = BoD_ANY;
                    }
                    setTrackToRandomSong(next_track, next_BoD);
                }
            }, (DROP_EARLY_PHASEIN_SECONDS + BUILD_END_BLEED_SECONDS) * 1000); // For this amount of time because that's the max that their playing can overlap, in theory
            break;
        case YT.PlayerState.PAUSED:
            // track["preloading"] = false;
            // track["state"] = STATE_PAUSED;
            // track["state"] = STATE_DONE;
            // Any state update needed here?
            break;
        case YT.PlayerState.BUFFERING:
            // Any state update needed here?
            break;
        case YT.PlayerState.CUED:
            // Any state update needed here?
            // Play then pause the video real quick to make sure it's preloaded
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
    // TODO - adjust volume if applicable
    // TODO - check for crossfade ending
}

// Called at frequent intervals to check if we're building and the buildEnd time has arrived
function checkForTrackSwap() {
    let track = getCurrentTrack();
    if (!track || !track["song"] || !track["player"]) return;
    if (track["state"] == STATE_BUILDING) {
        if (track["player"].getCurrentTime() > track["build"]["buildEnd"] - DROP_EARLY_PHASEIN_SECONDS) {
            primeCrossfade();
        }
    }
}


// Sets the specified track to a random build song
function setTrackToRandomSong(track, build_or_drop) {
    if (available_songs[build_or_drop].length == 0) {
        console.log("Ran out of available " + BoDToString(build_or_drop) + ". Regenerating lists of all available songs!");
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

// Starts playing the drop track so that it can be faded in at the right time
function primeCrossfade() {
    // TODO (the logic below is just a copy-paste from the old swapCurrentTrackPlaying())
    let current_track = getCurrentTrack();
    let next_track = getNextTrack();
    if (!current_track || !next_track) console.error("Invalid current_track or next_track in primeCrossfade()");
    // TODO - update this whole function with new STATE_PHASING_IN stuff
    next_track["state"] = getStateFromBoD(getTrackBoDRaw(next_track));
    next_track["player"].playVideo();
    if (current_track["state"] == STATE_BUILDING) {
        current_track["state"] = STATE_PHASING_OUT_OF_BUILD;
        // TODO - as part of, or instead of, this timeout we need to crossfade the songs
        setTimeout(function() {
            if (current_track["state"] == STATE_PHASING_OUT_OF_BUILD) {
                current_track["player"].stopVideo();
                current_track["state"] = STATE_ENDED;
                // let next_next_BoD = getInverseBoD(getTrackBoDRaw(next_track));
                // setTrackToRandomSong(current_track, next_next_BoD);
            }
        }, (DROP_EARLY_PHASEIN_SECONDS + BUILD_END_BLEED_SECONDS) * 1000);
    } else {
        current_track["state"] = STATE_ENDED;
    }
}

// Called when the build has finished fading out and the drop has finished fading in.
// Now the finished build can be swapped out for the next song.
function finishCrossfade() {
    // TODO
}

// After a drop or fullplay song is over, start the next totally new song
function startNewSongAfterSongEnd() {
    let current_track = getCurrentTrack();
    let next_track = getNextTrack();
    if (!current_track || !next_track) console.error("Invalid current_track or next_track in startNewSongAfterSongEnd()");
    current_track["state"] = STATE_ENDED;
    next_track["state"] = getStateFromBoD(getTrackBoDRaw(next_track));
    next_track["player"].playVideo();
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
        if (current_time < build["buildEnd"] && drop["dropStart"] < build["buildEnd"] + PIVOT_SAME_SONG_DROP_TO_BUILD_GAP_SECONDS) {
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
    // TODO - should this check track states rather than assuming it is the inverse of the current track? (e.g. maybe it's supposed to be null sometimes). Consider use cases of this function and maybe they need different checks
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

function getTrackBoDRaw(track) {
    if (track["build"]) return BUILD;
    if (track["drop"]) return DROP;
    return BoD_ANY;
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

function getStateFromBoD(build_or_drop) {
    if (build_or_drop == BUILD) return STATE_BUILDING;
    if (build_or_drop == DROP) return STATE_DROPPING;
    if (build_or_drop == BoD_ANY) return STATE_FULLPLAYING;
    return null;
}

// Returns true if the input indicates a state that is "playing" in any way
function isStatePlaying(state) {
    return state == STATE_BUILDING || state == STATE_DROPPING || state == STATE_FULLPLAYING || state == STATE_PHASING_OUT_OF_BUILD || state == STATE_PHASING_INTO_DROP;
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
            return "STATE_DONE";
        default:
            return "(invalid or unknown state)";
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
            return "(invalid or unknown ytPlayerState)";
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
            return "(invalid or unknown build_or_drop)";
    }
}
