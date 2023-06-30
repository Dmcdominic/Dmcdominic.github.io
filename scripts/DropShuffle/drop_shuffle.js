// Code for Drop-Shuffle.html

// https://developers.google.com/youtube/iframe_api_reference


// ----- USER FACING SETTINGS -----
var volume = 30; // Out of 100

var shuffle_drop_odds = 0.6; // 0 to 1
var pivot_same_song_drop_to_build_odds = 0.7; // 0 to 1


// ----- INTERNAL SYSTEM TUNING -----
const CROSSFADE_BUILD_DURATION_SECONDS = 0.15; // Amount of time during which the build fades out. Consider in tandem with CROSSFADE_BUILD_FADE_LEAD_TIME
const CROSSFADE_DROP_DURATION_SECONDS = 0.02; // Amount of time during which the drop fades in

const CROSSFADE_BUILD_FADE_LEAD_TIME = 0.1; // How far in advance of the actual build ending should it start fading out. Should always be less than CROSSFADE_BUILD_DURATION_SECONDS
const CROSSFADE_DROP_LEAD_TIME = 0.25; // Amount of time before the build ends that the drop will be scheduled to start

const CROSSFADE_PRIMING_WINDOW_SECONDS = 3;
const PIVOT_SAME_SONG_DROP_TO_BUILD_MINIMUM_GAP_SECONDS = 5;

const SKIP_TO_CHANGEUP_GAP_SECONDS = 4; // NOTE - this should probably stay above CROSSFADE_PRIMING_WINDOW_SECONDS
const EDITOR_TEST_TIME_WARMUP_SECONDS = 3; // For an editor test time, this is how far before the build/drop it will start
const EDITOR_TEST_HANGTIME_SECONDS = 1.5; // While doing an editor test time, this is the duration which it will pause between build and drop

const CHECK_FOR_UPDATES_INTERVAL_MS = 5; // With limited testing, this seems to have a minimum of ~5ms


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
// default songs list is defined in drop_shuffle_data.js
var songs = songs_obj["songsList"];
var available_songs = [[], [], []]; // available_songs[0] == Builds, [1] == Drops, [2] == All songs
var song_history = [];
var song_priority_queue = [];

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

var editor_track = {
    "song": null,
    "build": null,
    "drop": null,
    "state": null,
    "player": null
}
var editor_savedTime = 0;
var editor_priming_testing_time = false;
var editor_testing_time = false;
var editor_resumeTestTime = false;


// ----- UI Elements -----
var Settings_Volume_Slider = document.getElementById("volumeSlider");
var Settings_Volume_Display = document.getElementById("volumeDisplay");
Settings_Volume_Slider.value = volume;
Settings_Volume_Display.innerHTML = volume + "%";
Settings_Volume_Slider.oninput = function() {
    updateVolume(this.value);
}

var Settings_ShuffleDropOdds_Slider = document.getElementById("settings_shuffleDropOdds");
var Settings_ShuffleDropOdds_Display = document.getElementById("settings_shuffleDropOddsDisplay");
Settings_ShuffleDropOdds_Slider.value = shuffle_drop_odds * 100;
Settings_ShuffleDropOdds_Display.innerHTML = (shuffle_drop_odds * 100) + "%";
Settings_ShuffleDropOdds_Slider.oninput = function() {
    updateShuffleDropOdds(this.value);
}

var Settings_PivotSameSongOdds_Slider = document.getElementById("settings_pivotSameSongOdds");
var Settings_PivotSameSongOdds_Display = document.getElementById("settings_pivotSameSongOddsDisplay");
Settings_PivotSameSongOdds_Slider.value = pivot_same_song_drop_to_build_odds * 100;
Settings_PivotSameSongOdds_Display.innerHTML = (pivot_same_song_drop_to_build_odds * 100) + "%";
Settings_PivotSameSongOdds_Slider.oninput = function() {
    updatePivotSameSongOdds(this.value);
}


// ----- Initialization -----

// Load the IFrame Player API code asynchronously.
var tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
var firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

restartSongs();
setInterval(checkForUpdatesOnInterval, CHECK_FOR_UPDATES_INTERVAL_MS);
refreshSongList();


// ----- Functions -----

// Create an <iframe> (and YouTube player) after the API code downloads.
function onYouTubeIframeAPIReady() {
    tracks[0]["player"] = new YT.Player('player_0', {
        height: '450',
        width: '800',
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
        height: '450',
        width: '800',
        videoId: tracks[1]["song"]["videoId"],
        playerVars: {
            'playsinline': 1
        },
        events: {
            'onReady': onPlayerReady(tracks[1]),
            'onStateChange': onPlayerStateChange
        }
    });
    
    editor_track["player"] = new YT.Player('editor_player', {
        height: '390',
        width: '640',
        videoId: null,
        playerVars: {
            'playsinline': 1
        },
        events: {
            // 'onReady': onPlayerReady(tracks[1]),
            'onStateChange': onEditorPlayerStateChange
        }
    });
}

// Loads the video for a track on its player.
// Assumes that the track has its song and player set up already.
function loadTrackVideo(track, play_immediately = false) {
    let startSeconds = 0;
    if (track["state"] == STATE_DROPPING || track["state"] == STATE_WAITING_TO_DROP) {
        startSeconds = track["drop"]["dropStart"] - getNextCrossfadePrimingWindow(track);
    }
    if (play_immediately) {
        track["player"].loadVideoById(track["song"]["videoId"], startSeconds);
        track["player"].setVolume(volume);
    } else {
        track["player"].cueVideoById(track["song"]["videoId"], startSeconds);
    }
    song_history.push(track["song"]);
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
        song_history.push(track["song"]);
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
            track["player"].setVolume(volume);
            break;
        default:
            console.error("Unknown event.data passed into onPlayerStateChange(event). Event dump:");
            console.error(event);
            break;
    }
}

// Resets the available_songs lists 
function restartSongs() {
    generateAvailableSongs();
    let first_BoD = (shuffle_drop_odds > Math.random()) ? BUILD : BoD_ANY;
    setTrackToRandomSong(tracks[0], first_BoD);
    setTrackToRandomSong(tracks[1], getInverseBoD(first_BoD));
}

// Called at frequent intervals to check for updates such as crossfading and track swap
function checkForUpdatesOnInterval() {
    checkForTrackSwap();
    updateCrossfade();
    if (editor_testing_time) {
        updateEditorTestingTime();
    }
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
    let current_build_time = track_fading_out["player"].getCurrentTime();
    let current_drop_time = track_fading_in["player"].getCurrentTime();
    let build_end_time = track_fading_out["build"]["buildEnd"] - CROSSFADE_BUILD_FADE_LEAD_TIME;
    let drop_end_time = track_fading_in["drop"]["dropStart"];
    let lerp_build = 1 - ((current_build_time - build_end_time) / CROSSFADE_BUILD_DURATION_SECONDS);
    let lerp_drop = (current_drop_time - drop_end_time) / CROSSFADE_DROP_DURATION_SECONDS;
    lerp_build = clamp(lerp_build, 0, 1);
    lerp_drop = clamp(lerp_drop, 0, 1);
    track_fading_out["player"].setVolume(lerp_build * volume);
    track_fading_in["player"].setVolume(lerp_drop * volume);
    // Check if the crossfade is done
    if (lerp_build <= 0 && lerp_drop >= 1) {
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
    Settings_Volume_Display.innerHTML = new_volume + "%";
    let current_track = getCurrentTrack();
    if (current_track != null) {
        current_track["player"].setVolume(volume);
    }
    if (editor_track != null && editor_track["player"]) {
        editor_track["player"].setVolume(volume);
    }
}

function updateShuffleDropOdds(new_odds) {
    shuffle_drop_odds = new_odds / 100;
    Settings_ShuffleDropOdds_Display.innerHTML = new_odds + "%";
}
function updatePivotSameSongOdds(new_odds) {
    pivot_same_song_drop_to_build_odds = new_odds / 100;
    Settings_PivotSameSongOdds_Display.innerHTML = new_odds + "%";
}


// Called at frequent intervals to check if we're building and the buildEnd time has arrived
function checkForTrackSwap() {
    let current_track = getCurrentTrack();
    if (!current_track || !current_track["song"] || !current_track["player"]) return;
    if (current_track["state"] == STATE_BUILDING) {
        let next_track = getNextTrack();
        if (current_track["player"].getCurrentTime() > current_track["build"]["buildEnd"] - getNextCrossfadePrimingWindow(next_track) - CROSSFADE_DROP_LEAD_TIME) {
            // Prime the crossfade by starting the drop track early (at 0 volume) so that it can be faded in at the right time
            current_track["state"] = STATE_PHASING_OUT_OF_BUILD;
            next_track["state"] = STATE_PHASING_INTO_DROP;
            next_track["player"].setVolume(0);
            next_track["player"].playVideo();
        }
    }
}


// Sets the specified track to a random build song
function setTrackToRandomSong(track, build_or_drop, play_immediately = false) {
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
        loadTrackVideo(track, play_immediately);
    }
}


// Generate the lists of available build songs, drop songs, and all songs
function generateAvailableSongs() {
    available_songs = [[], [], []];
    songs.forEach(song => {
        // If this song is in the priority queue, skip it
        for (let i=0; i < song_priority_queue.length; i++) {
            if (song_priority_queue[i]["videoId"] == song["videoId"]) return;
        }
        if (song["builds"] && song["builds"].length > 0) {
            available_songs[0].push(song);
        }
        if (song["drops"] && song["drops"].length > 0) {
            available_songs[1].push(song);
        }
        available_songs[2].push(song);
    });
    shuffleArray(available_songs[0]);
    shuffleArray(available_songs[1]);
    shuffleArray(available_songs[2]);
}

// Pops an available song from the corresponding build or drop list, and removes it from the other list too
function popAvailableSong(build_or_drop) {
    // First check for valid priority queue options
    for (let i=0; i < song_priority_queue.length; i++) {
        let song = song_priority_queue[i];
        if (build_or_drop == BoD_ANY ||
            build_or_drop == BUILD && song["builds"].length > 0 ||
            build_or_drop == DROP && song["drops"].length > 0) {
            song_priority_queue = getArrayWithItemRemoved(song_priority_queue, song);
            return song;
        } 
    }
    if (available_songs[build_or_drop].length == 0) {
        console.log("Ran out of available " + BoDToString(build_or_drop) + ". Regenerating all lists of all available songs!");
        generateAvailableSongs();
    }
    let song = available_songs[build_or_drop].pop();
    removeSongFromAvailableSongLists(song);
    return song;
}

// Removes the given song from all available songs lists, and the priority queue (but not the main song list, for use when restarted or exported)
function removeSongFromAvailableSongLists(song) {
    for (let i=0; i <= 2; i++) {
        available_songs[i] = getArrayWithItemRemoved(available_songs[i], song);
    }
    song_priority_queue = getArrayWithItemRemoved(song_priority_queue, song);
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
    } else if (shuffle_drop_odds > Math.random()) {
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
            if (pivot_same_song_drop_to_build_odds > Math.random()) {
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
// Pauses all players and sets their states to STATE_PAUSED, which might lose some info relevant for resuming.
function pauseAllPlayersRough() {
    tracks.forEach(track => {
        if (track["player"]) {
            track["player"].pauseVideo();
            track["state"] = STATE_PAUSED;
        }
    });
    if (editor_track && editor_track["player"]) {
        editor_track["player"].pauseVideo();
        editor_track["state"] = STATE_PAUSED;
        editor_priming_testing_time = false;
        editor_testing_time = false;
    }
}

// Takes in a videoId and returns the song with that ID, or null if it isn't in the song list
function tryGetSongByVideoId(videoId) {
    for (let i=0; i < songs.length; i++) {
        if (songs[i]["videoId"] == videoId) {
            return songs[i];
        }
    }
    return null;
}

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


// ------------ SETTINGS -------------
function toggleShowEditor(event) {
    if (event.target.checked) {
        $("#editor_section").attr("hidden", "");
    } else {
        $("#editor_section").removeAttr("hidden");
    }
}

function toggleShowSongList(event) {
    if (event.target.checked) {
        $("#song_list_section").attr("hidden", "");
    } else {
        $("#song_list_section").removeAttr("hidden");
    }
}


// ------------ EDITOR -------------
function onEditorPlayerStateChange(event) {
    switch (event.data) {
        case YT.PlayerState.UNSTARTED:
            break;
        case YT.PlayerState.ENDED:
            break;
        case YT.PlayerState.PLAYING:
            if (editor_priming_testing_time) {
                editor_priming_testing_time = false;
                editor_testing_time = true;
            }
            break;
        case YT.PlayerState.PAUSED:
            break;
        case YT.PlayerState.BUFFERING:
            break;
        case YT.PlayerState.CUED:
            break;
        default:
            console.error("Unknown event.data passed into onEditorPlayerStateChange(event). Event dump:");
            console.error(event);
            break;
    }
}

// Add New Song
var editor_videoId = document.getElementById("editor_videoId");
var editor_songName = document.getElementById("editor_songName");
var editor_artist = document.getElementById("editor_artist");
var editor_new_song_form = document.getElementById("editor_new_song_form");

function editor_SubmitNewSong(event){
    //Preventing page refresh - https://www.tutorialspoint.com/how-to-stop-refreshing-the-page-on-submit-in-javascript
    event.preventDefault();
    // Pause all players first
    pauseAllPlayersRough();
    // Polish - Could check if song is already in the list?
    let new_song = {
        "name": editor_songName.value,
        "artist": editor_artist.value,
        "videoId": editor_videoId.value,
        "builds": [],
        "drops": []
    }
    let dup_song = tryFindDuplicateSong(new_song);
    if (dup_song != null) {
        if (!confirm("WARNING - This song may be a duplicate of the existing song: \"" + dup_song["name"] + "\" by " + dup_song["artist"] + " [Video ID: " + dup_song["videoId"] + "]. Press \"OK\" to add anyway.")) {
            return;
        }
    }
    songs.push(new_song);
    editor_load_song(new_song);
    refreshSongList();
}
editor_new_song_form.addEventListener('submit', editor_SubmitNewSong);

// Sets the editor track to the song, loads the video into the player, and resets the saved time
function editor_load_song(song, set_saved_time = 0) {
    editor_track["song"] = song;
    editor_track["player"].loadVideoById(song["videoId"], 0);
    // editor_track["player"].setPlaybackRate(0.5);
    editor_updateSavedTime(set_saved_time);
}


// Sync & display time
var editor_savedTimeDisplay = document.getElementById("editor_savedTimeDisplay");
var editor_syncTimeButton = document.getElementById("editor_syncTime");
function editor_SyncTime(event) {
    editor_updateSavedTime(editor_track["player"].getCurrentTime());
}
editor_syncTimeButton.addEventListener("click", editor_SyncTime);

// Nudge time
document.getElementById("editor_timeDown").addEventListener("click", () => { editor_updateSavedTime(editor_savedTime - 0.5); });
document.getElementById("editor_timeDownNudge").addEventListener("click", () => { editor_updateSavedTime(editor_savedTime - 0.05); });
document.getElementById("editor_timeUpNudge").addEventListener("click", () => { editor_updateSavedTime(editor_savedTime + 0.05); });
document.getElementById("editor_timeUp").addEventListener("click", () => { editor_updateSavedTime(editor_savedTime + 0.5); });

function editor_updateSavedTime(new_time) {
    new_time = Math.max(0, new_time);
    editor_savedTime = new_time;
    let pct_minutes = Math.floor(editor_savedTime / 60);
    let pct_seconds = Math.floor(editor_savedTime % 60);
    let pct_str = ((pct_minutes < 10) ? "0" : "") + pct_minutes + ":" + ((pct_seconds < 10) ? "0" : "") + pct_seconds;
    editor_savedTimeDisplay.innerHTML = "Saved Time: &nbsp; " + pct_str + " &nbsp; (" + editor_savedTime + ")";
    editor_addAsBuildButton.disabled = false;
    editor_addAsDropButton.disabled = false;
}

// Test time with pause - Directly in the editor player
var editor_testTimeWithPauseButton = document.getElementById("editor_testTimeWithPause");
function editor_testTimeWithPause(event) {
    // Pause all players first
    pauseAllPlayersRough();
    editor_priming_testing_time = true;
    editor_testing_time = false;
    editor_track["state"] = STATE_BUILDING;
    editor_track["player"].seekTo(editor_savedTime - EDITOR_TEST_TIME_WARMUP_SECONDS, true);
    editor_track["player"].setVolume(volume);
    editor_track["player"].playVideo();
}
editor_testTimeWithPauseButton.addEventListener("click", editor_testTimeWithPause);

// Test time as build/drop - Uses the main players with the new song and a random complementary song
var editor_testTimeAsBuildButton = document.getElementById("editor_testAsBuild");
var editor_testTimeAsDropButton = document.getElementById("editor_testAsDrop");
function editor_testTimeAsBuild(event) {
    editor_track["state"] = STATE_PAUSED;
    editor_track["player"].pauseVideo();
    editor_priming_testing_time = false;
    editor_testing_time = false;
    let track = tracks[0];
    let song = editor_track["song"];
    removeSongFromAvailableSongLists(song);
    track["song"] = song;
    track["build"] = { "buildEnd": editor_savedTime };
    track["drop"] = null;
    track["state"] = STATE_WAITING_TO_BUILD;
    loadTrackVideo(track, true);
    setTrackToRandomSong(tracks[1], DROP, false);
}
function editor_testTimeAsDrop(event) {
    editor_track["state"] = STATE_PAUSED;
    editor_track["player"].pauseVideo();
    editor_priming_testing_time = false;
    editor_testing_time = false;
    let track = tracks[1];
    let song = editor_track["song"];
    removeSongFromAvailableSongLists(song);
    track["song"] = song;
    track["build"] = null;
    track["drop"] = { "dropStart": editor_savedTime };
    track["state"] = STATE_WAITING_TO_DROP;
    loadTrackVideo(track, false);
    setTrackToRandomSong(tracks[0], BUILD, true);
}
editor_testTimeAsBuildButton.addEventListener("click", editor_testTimeAsBuild);
editor_testTimeAsDropButton.addEventListener("click", editor_testTimeAsDrop);


// Add as build or drop
var editor_addAsBuildButton = document.getElementById("editor_addAsBuild");
var editor_addAsDropButton = document.getElementById("editor_addAsDrop");
function editor_addAsBuild(event) {
    let song = editor_track["song"];
    let rounded_time = Math.round(editor_savedTime * 1000) / 1000;
    let new_build = {
        "buildEnd": rounded_time
    }
    song["builds"].push(new_build);
    editor_addAsBuildButton.disabled = true;
    console.log("Added new build: " + rounded_time);
    console.log(song);
}
function editor_addAsDrop(event) {
    let song = editor_track["song"];
    let rounded_time = Math.round(editor_savedTime * 1000) / 1000;
    let new_drop = {
        "dropStart": rounded_time
    }
    song["drops"].push(new_drop);
    editor_addAsDropButton.disabled = true;
    console.log("Added new drop: " + rounded_time);
    console.log(song);
}
editor_addAsBuildButton.addEventListener("click", editor_addAsBuild);
editor_addAsDropButton.addEventListener("click", editor_addAsDrop);

// While editor_testing_time is true, this is called on every update interval to see if we should pause/unpause
function updateEditorTestingTime() {
    let current_player_time = editor_track["player"].getCurrentTime();
    if (editor_track["state"] == STATE_BUILDING) {
        if (current_player_time >= editor_savedTime) {
            editor_resumeTestTime = false;
            setTimeout(() => { editor_resumeTestTime = true; }, EDITOR_TEST_HANGTIME_SECONDS * 1000);
            editor_track["player"].pauseVideo();
            editor_track["state"] = STATE_PAUSED;
        }
    } else if (editor_track["state"] == STATE_PAUSED) {
        if (editor_resumeTestTime) {
            editor_track["player"].playVideo();
            editor_resumeTestTime = false;
            editor_testing_time = false;
            editor_track["state"] = STATE_DROPPING;
        }
    }
}

// If one exists, returns a song with the same name or video ID. Otherwise, returns null.
function tryFindDuplicateSong(song_to_check) {
    for (let i=0; i < songs.length; i++) {
        song = songs[i];
        if (song["name"] == song_to_check["name"] || song["videoId"] == song_to_check["videoId"]) {
            return song;
        }
    }
    return null;
}


// ------------ SONG LIST IMPORT/EXPORT ------------
var UI_Songlist_Import = document.getElementById("songListImport");
UI_Songlist_Import.addEventListener("change", importSongList);

// Called when the user selects a file to upload their custom song list
function importSongList() {
    if (songs.length == 0 || confirm("Importing a song list will ADD those songs to the current list. If you'd like to load ONLY the new songs, please click the red 'Reset to empty song list' button first.")) {
        if (UI_Songlist_Import.files.length > 0) {
            let file_reader = new FileReader();
            file_reader.addEventListener("load", () => {
                let imported_songs_obj = JSON.parse(file_reader.result);
                let imported_songs = imported_songs_obj["songsList"];
                console.log("Imported songs:");
                console.log(imported_songs);
                if (songs.length == 0) {
                    songs = imported_songs;
                } else {
                    imported_songs.forEach(new_song => {
                        songs.push(new_song);
                    });
                }
                console.log("New song list:");
                console.log(songs);
                UI_Songlist_Import.value = null;
            });
            file_reader.readAsText(UI_Songlist_Import.files[0]);
        }
    } else {
        UI_Songlist_Import.value = null;
    }
}

// Called when the user clicks the button to export the current song list
function exportSongList() {
    let new_songs_obj = { "songsList": songs };
    let element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(JSON.stringify(new_songs_obj)));
    element.setAttribute('download', "DropShuffleSongListExport.json");
  
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
}

// Called when the user clicks the scary red button
function resetToEmptySongList() {
    if (confirm("Are you SURE you want to reset to an empty song list? If you have any songs you want to save, export them first! The currently playing list will not reset automatically.")) {
        songs = [];
    }
}


// ------------ Song List Display ------------
// Clears the current song list and then populates it with every song in songs
function refreshSongList() {
    // Empty the current list
    let song_list_row = $("#song_list_row");
    song_list_row.empty();
    // Sort the songs list
    let sorted_songs = [...songs].sort((a, b) => {
        return a["name"].localeCompare(b["name"]);
    });
    // Create an item for each song
    sorted_songs.forEach(song => {
        // Clone the template column
        let song_list_template_col = $("#song_list_template_col");
        new_song_list_col = song_list_template_col.clone();
        // Set up the title, artist, & buttons
        new_song_list_col.find(".song_list_title").html("<b>" + song["name"] + "</b> - <i>" + song["artist"] + "</i>");
        new_song_list_col.find(".song_list_addToQueue").attr("videoId", song["videoId"]);
        new_song_list_col.find(".song_list_removeFromCurrentPlaythrough").attr("videoId", song["videoId"]);
        new_song_list_col.find(".song_list_removeFromSongs").attr("videoId", song["videoId"]);
        new_song_list_col.find(".song_list_openInEditor").attr("videoId", song["videoId"]);
        // Append it to the song list row and reveal it
        new_song_list_col.appendTo(song_list_row);
        new_song_list_col.removeAttr("hidden");
    });
}

// Adds the song to the front of the queue which prioritizes songs for upcoming plays
function songListAddToQueue(event) {
    let videoId = event.target.getAttribute("videoId");
    let song = tryGetSongByVideoId(videoId);
    if (song) {
        removeSongFromAvailableSongLists(song);
        song_priority_queue.unshift(song);
    }
}

// Removes the song from the queue (and from all the available songs lists)
function songListRemoveFromQueue(event) {
    let videoId = event.target.getAttribute("videoId");
    let song = tryGetSongByVideoId(videoId);
    if (song) {
        removeSongFromAvailableSongLists(song);
    }
}

// Removes the song from the songs list entirely
function songListRemoveFromSongs(event) {
    let videoId = event.target.getAttribute("videoId");
    let song = tryGetSongByVideoId(videoId);
    if (song) {
        if (confirm("Are you sure you want to remove this song from the full songs list? Make sure to export first if you need it saved.")) {
            removeSongFromAvailableSongLists(song);
            songs = getArrayWithItemRemoved(songs, song);
            refreshSongList();
        }
    }
}

// Opens the song in the editor
function songListOpenInEditor(event) {
    let videoId = event.target.getAttribute("videoId");
    let song = tryGetSongByVideoId(videoId);
    if (song) {
        pauseAllPlayersRough();
        // TODO - improve this.
        let possible_times = [];
        if (song["builds"]) {
            song["builds"].forEach(build => {
                possible_times.push(build["buildEnd"]);
            });
        }
        if (song["drops"]) {
            song["drops"].forEach(drop => {
                possible_times.push(drop["dropStart"]);
            });
        }
        if (possible_times.length == 0) {
            possible_times.push(0);
        }
        editor_load_song(song, getRandomItemFromArray(possible_times));
    }
}


// ------------ ARRAY UTILITY ------------
function getArrayWithItemRemoved(array, item) {
    return array.filter(i => {
        return i != item;
    });
}

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
function dumpSongHistory() {
    console.log("------------------ SONG HISTORY ------------------");
    console.log(song_history);
}

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
