// workout-voice.js — sound and screen-awake support for the guided player (Fitness → Workouts)
//
// Plan: WorkoutsPlan.md §4.1 / §4.1a
//
// The player (workout-player.js) calls these hooks if they exist:
//   woVoiceOnPhase(phase, index, ctx)   a new phase began      → beep + spoken cue
//   woVoiceOnTick(info, ctx)            every ~200 ms           → "10 seconds", 3-2-1 beeps
//   woVoiceOnEnd(ctx)                   workout finished/left   → release wake lock, "Workout complete"
// ctx is the player state (ctx.session.voiceCues = spoken cues on/off, ctx.runner, ctx.finished).
//
// Beeps ALWAYS play (they cut through music); speech follows the Start-screen switch / 🔊 button.
// Test hooks: set window.woSpeakHook / window.woBeepHook to capture what would be said/played.

var _woV = {
    started: false, phase: -1, said: {}, lastSection: null,
    speaking: false, lastSpeechEnd: 0, completeSpoken: false,
    audio: null, wake: null, visHandler: null, unlockHandler: null
};

/** True while the app is talking — voice commands (chunk 2.5) pause listening so the app can't hear itself. */
function woIsSpeaking() {
    // also true for a moment after speech ends, so the tail of the app's own voice isn't heard as a command
    return _woV.speaking || (Date.now() - _woV.lastSpeechEnd) < 600;
}

// ─── Speech ───────────────────────────────────────────────────────────────────

function _woPickVoice() {
    if (!('speechSynthesis' in window)) return null;
    var voices = window.speechSynthesis.getVoices() || [];
    var en = voices.filter(function(v) { return /^en[-_]US/i.test(v.lang); });
    return (en.filter(function(v) { return v.localService; })[0]) || en[0] || voices.filter(function(v) { return /^en/i.test(v.lang); })[0] || null;
}

/** Says text, cutting off anything still being said (cues must never pile up). */
function woSpeak(text) {
    if (!text) return;
    if (window.woSpeakHook) window.woSpeakHook(text);
    if (!('speechSynthesis' in window)) return;
    try {
        window.speechSynthesis.cancel();
        var u = new SpeechSynthesisUtterance(text);
        u.lang = 'en-US';
        u.rate = 1.0;
        var voice = _woPickVoice();
        if (voice) u.voice = voice;
        u.onstart = function() { _woV.speaking = true; };
        u.onend   = u.onerror = function() { _woV.speaking = false; _woV.lastSpeechEnd = Date.now(); };
        window.speechSynthesis.speak(u);
    } catch (e) { console.error('Workouts: speech failed:', e); }
}

/** What the voice says for a phase's target: "10 reps", "6 to 12 reps", "as many as you can". */
function _woSayPhase(p) {
    var wt = p.weight != null ? ', ' + p.weight + ' pounds' : '';
    if (p.failure) return (p.measure === 'time' ? 'as long as you can' : (p.amount > 1 ? 'at least ' + p.amount + ', as many as you can' : 'as many as you can')) + wt;
    if (p.amountMax != null && p.measure !== 'time') return p.amount + ' to ' + p.amountMax + ' reps' + wt;
    return _woSayAmount(p.measure, p.amount, p.weight);
}

function _woSayAmount(measure, amount, weight) {
    var out = '';
    if (measure === 'time') {
        out = amount >= 120 && amount % 60 === 0 ? (amount / 60) + ' minutes' : amount + ' seconds';
    } else if (amount != null) {
        out = amount + (amount === 1 ? ' rep' : ' reps');
    }
    if (weight != null) out += (out ? ', ' : '') + weight + ' pounds';
    return out;
}

function _woSayNumberWord(n) {
    var w = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
    return n >= 0 && n <= 10 ? w[n] : String(n);
}

/** What to say when a phase starts. */
function _woPhaseSpeech(p, ctx) {
    var parts = [];

    // Section changes ("Warm-up." / "Main set." / "Cool-down.")
    if ((p.kind === 'getready' || p.kind === 'work') && p.section !== _woV.lastSection) {
        var label = { warmup: 'Warm-up.', main: 'Main set.', cooldown: 'Cool-down.' }[p.section];
        if (label && (p.section !== 'main' || _woV.lastSection !== null)) parts.push(label);
        _woV.lastSection = p.section;
    }

    if (p.kind === 'getready') {
        var first = ctx.runner.nextWork();
        parts.push('Get ready.');
        if (first) parts.push('First up: ' + woSpokenName(first) + '.');
    } else if (p.kind === 'switch') {
        parts.push('Switch sides.');
    } else if (p.kind === 'rest') {
        parts.push('Rest.');
        var next = ctx.runner.nextWork();
        if (next) parts.push('Up next: ' + woSpokenName(next) + (next.side ? ', ' + next.side + ' side' : '') + ', ' + _woSayPhase(next) + '.');
        if (p.durationSec == null) parts.push('Say ready, or tap, when you are ready.');
    } else if (p.kind === 'work') {
        if (p.round && p.itemIndex === 0) parts.push('Round ' + p.round + ' of ' + p.rounds + '.');
        var line = woSpokenName(p) + '.';
        if (p.side) line += ' ' + (p.side === 'left' ? 'Left' : 'Right') + ' side.';
        if (!p.round && p.setCount > 1) line += ' Set ' + (p.setIndex + 1) + ' of ' + p.setCount + '.';
        if (p.sideMode === 'alternate') line += ' Alternate sides.';
        line += ' ' + _woSayPhase(p) + '.';
        if (p.durationSec != null) line += ' Go.';
        parts.push(line);
    }
    return parts.join(' ');
}

// ─── Beeps (Web Audio) ────────────────────────────────────────────────────────

function _woAudioCtx() {
    if (_woV.audio) return _woV.audio;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { _woV.audio = new AC(); } catch (e) { return null; }
    return _woV.audio;
}

/** Plays a short tone. freq in Hz, ms long. */
function woBeep(freq, ms) {
    if (window.woBeepHook) window.woBeepHook(freq, ms);
    var ac = _woAudioCtx();
    if (!ac) return;
    try {
        if (ac.state === 'suspended') ac.resume();
        var osc = ac.createOscillator(), gain = ac.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        var t0 = ac.currentTime;
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.6, t0 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);
        osc.connect(gain); gain.connect(ac.destination);
        osc.start(t0); osc.stop(t0 + ms / 1000 + 0.05);
    } catch (e) { console.error('Workouts: beep failed:', e); }
}

// ─── Wake lock (screen stays on) ──────────────────────────────────────────────

async function _woAcquireWake() {
    if (!('wakeLock' in navigator)) return;
    try {
        _woV.wake = await navigator.wakeLock.request('screen');
        _woV.wake.addEventListener('release', function() { _woV.wake = null; });
    } catch (e) { /* denied or unsupported — the workout still works */ }
}

function _woReleaseWake() {
    if (_woV.wake) { try { _woV.wake.release(); } catch (e) {} _woV.wake = null; }
}

// ─── Hooks called by the player ───────────────────────────────────────────────

function _woVStart(ctx) {
    _woV.started = true;
    _woV.phase = -1; _woV.said = {}; _woV.lastSection = null; _woV.completeSpoken = false;
    _woAcquireWake();
    // The first tap/click inside the player also unlocks audio on browsers that need a gesture
    _woV.unlockHandler = function() { var ac = _woAudioCtx(); if (ac && ac.state === 'suspended') ac.resume(); };
    document.addEventListener('pointerdown', _woV.unlockHandler);
    _woV.visHandler = function() { if (document.visibilityState === 'visible' && _woV.started && !_woV.wake) _woAcquireWake(); };
    document.addEventListener('visibilitychange', _woV.visHandler);
    // Preload the voice list (some browsers fill it in lazily)
    if ('speechSynthesis' in window) window.speechSynthesis.getVoices();
    if (typeof woCommandsStart === 'function') woCommandsStart(ctx);   // voice commands (workout-commands.js)
}

function woVoiceOnPhase(p, index, ctx) {
    if (!_woV.started) _woVStart(ctx);
    _woV.phase = index;
    _woV.said = {};
    if (index > 0) woBeep(p.kind === 'rest' || p.kind === 'switch' ? 440 : 880, 260);   // transition beep: low = rest, high = go
    if (ctx.session.voiceCues) woSpeak(_woPhaseSpeech(p, ctx));
}

function woVoiceOnTick(info, ctx) {
    var p = info.phase;
    if (!p || info.state !== 'running' || info.secondsLeft == null || p.durationSec == null) return;
    var sec = info.secondsLeft;
    if (sec >= 1 && sec <= 3 && !_woV.said['b' + sec]) {          // 3-2-1 beeps
        _woV.said['b' + sec] = true;
        woBeep(660, 120);
    }
    if (sec === 10 && p.durationSec >= 20 && !_woV.said.ten && ctx.session.voiceCues) {
        _woV.said.ten = true;
        woSpeak('Ten seconds.');
    }
}

function woVoiceOnEnd(ctx) {
    var finished = ctx && ctx.finished;
    if (finished && !_woV.completeSpoken) {
        _woV.completeSpoken = true;
        woBeep(880, 500);
        if (ctx.session.voiceCues) woSpeak('Workout complete. Nice work.');
    }
    if (!finished || ctx.runner.state === 'done') _woVStop(!finished);
}

/** Stops everything: wake lock, listeners, and (when leaving early) any speech in progress. */
function _woVStop(cancelSpeech) {
    if (typeof woCommandsStop === 'function') woCommandsStop();
    _woReleaseWake();
    if (_woV.unlockHandler) document.removeEventListener('pointerdown', _woV.unlockHandler);
    if (_woV.visHandler)    document.removeEventListener('visibilitychange', _woV.visHandler);
    _woV.unlockHandler = _woV.visHandler = null;
    _woV.started = false;
    if (cancelSpeech && 'speechSynthesis' in window) { try { window.speechSynthesis.cancel(); } catch (e) {} }
    _woV.speaking = false;
}
