// workout-commands.js — voice commands for the guided player ("done", "pause", "skip"…)
//
// Plan: WorkoutsPlan.md §4.1a
//
// Uses the browser's built-in speech recognition (free; Chrome sends the audio to Google to
// turn it into text). Only SHORT exact phrases count — a command word buried in a long
// sentence (or a song lyric) is ignored. Tapping always works as a backup.
//
// Started/stopped by workout-voice.js (_woVStart / _woVStop). Test hooks:
//   woHandleTranscript(text, ctx)  → applies a recognised phrase, returns the action name or null.

var WO_CMD_WORDS = {
    done:       ['done', 'next', 'finished', 'finish', 'im done', "i'm done", 'next one'],
    pause:      ['pause', 'stop', 'hold on', 'hold up', 'wait'],
    resume:     ['go', 'resume', 'start', 'continue', 'keep going'],
    ready:      ['ready', 'im ready', "i'm ready", 'lets go', "let's go"],
    skip:       ['skip', 'skip it', 'skip this'],
    back:       ['back', 'previous', 'go back'],
    more_time:  ['more time', 'add time', 'add more time', 'plus fifteen', 'plus 15', '15 more seconds'],
    repeat:     ['repeat', 'say again', 'say that again', 'what', 'what was that'],
    whats_next: ['whats next', "what's next", 'what is next', 'what next', 'whats up next'],
    how_long:   ['how long', 'time', 'time left', 'how much time'],
    end:        ['end workout', 'end', 'stop workout', 'finish workout', 'quit'],
    yes:        ['yes', 'yeah', 'yep', 'sure', 'confirm'],
    no:         ['no', 'nope', 'cancel', 'never mind']
};

// What the flash on screen says for each action
var WO_CMD_LABELS = {
    done: 'DONE ✓', pause: 'PAUSE', resume: 'GO', ready: 'READY', skip: 'SKIP', back: 'BACK',
    more_time: '+15 SEC', repeat: 'REPEAT', whats_next: 'WHAT’S NEXT', how_long: 'HOW LONG',
    end: 'END WORKOUT?', yes: 'YES', no: 'NO'
};

var WO_CMD_MAX_WORDS     = 4;
var WO_CMD_END_CONFIRM_MS = 10000;

var _woCmd = {
    ctx: null, active: false, rec: null, listening: false, muted: false, denied: false,
    restartTimer: null, pendingEnd: 0, lastText: '', lastAt: 0
};
var _woCmdLookup = null;

// ─── Recognising a phrase ─────────────────────────────────────────────────────

function _woNormalizeSpeech(text) {
    return String(text || '').toLowerCase().replace(/[^a-z0-9' ]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Returns the action for a short exact phrase, or null. */
function woParseCommand(text) {
    if (!_woCmdLookup) {
        _woCmdLookup = {};
        Object.keys(WO_CMD_WORDS).forEach(function(action) {
            WO_CMD_WORDS[action].forEach(function(p) { _woCmdLookup[_woNormalizeSpeech(p)] = action; });
        });
    }
    var t = _woNormalizeSpeech(text);
    // polite fillers around the command ("ok pause", "done please")
    t = t.replace(/^(okay|ok|hey|um|uh|please)\s+/, '').replace(/\s+(please|now)$/, '');
    if (!t || t.split(' ').length > WO_CMD_MAX_WORDS) return null;
    return _woCmdLookup[t] || null;
}

// ─── Doing it ─────────────────────────────────────────────────────────────────

/** Apply a command to the running player. Returns true if it did something. */
function _woCmdApply(action, ctx) {
    var R = ctx.runner;
    if (!R || R.state === 'done' || R.state === 'idle') return false;
    var p = R.current();

    // "End workout?" waits for yes / no; any other command cancels it
    var pending = _woCmd.pendingEnd && (Date.now() - _woCmd.pendingEnd) < WO_CMD_END_CONFIRM_MS;
    if (action === 'yes' || action === 'no') {
        if (!pending) return false;
        _woCmd.pendingEnd = 0;
        if (action === 'yes') { R.end(); return true; }
        woSpeak('Okay, carrying on.');
        return true;
    }
    _woCmd.pendingEnd = 0;

    switch (action) {
        case 'done':      R.done(); return true;
        case 'pause':     if (R.state === 'running') { R.pause(); return true; } return false;
        case 'resume':    if (R.state === 'paused')  { R.resume(); return true; } return false;
        case 'ready':     if (p && (p.kind === 'rest' || p.kind === 'getready' || p.kind === 'switch')) { R.done(); return true; } return false;
        case 'skip':      R.skip(); return true;
        case 'back':      R.back(); return true;
        case 'more_time': if (p && p.durationSec != null) { R.addTime(15); return true; } return false;
        case 'repeat':    woSpeak(_woRepeatSpeech(p, ctx)); return true;
        case 'whats_next': {
            var next = R.nextWork();
            woSpeak(next ? 'Next: ' + next.exerciseName + (next.side ? ', ' + next.side + ' side' : '') + ', ' + _woSayAmount(next.measure, next.amount, next.weight) + '.'
                         : 'That is the last one.');
            return true;
        }
        case 'how_long': {
            var left = R.secondsLeft(), mins = Math.max(1, Math.round(R.remainingEstimateSec() / 60));
            woSpeak((left != null ? left + ' seconds left in this step. ' : '') + 'About ' + mins + (mins === 1 ? ' minute' : ' minutes') + ' left in the workout.');
            return true;
        }
        case 'end':
            _woCmd.pendingEnd = Date.now();
            woSpeak('End the workout? Say yes or no.');
            return true;
    }
    return false;
}

/** The cue for the current phase again, without re-announcing the section. */
function _woRepeatSpeech(p, ctx) {
    if (!p) return '';
    var saved = _woV.lastSection;
    _woV.lastSection = p.section;
    var text = _woPhaseSpeech(p, ctx);
    _woV.lastSection = saved;
    return text;
}

/**
 * Entry point for recognised speech (also used by tests). Returns the action that was applied, or null.
 * Ignores duplicates delivered twice by the browser.
 */
function woHandleTranscript(text, ctx) {
    ctx = ctx || _woCmd.ctx;
    if (!ctx) return null;
    var action = woParseCommand(text);
    if (!action) return null;
    var now = Date.now(), key = _woNormalizeSpeech(text);
    if (key === _woCmd.lastText && now - _woCmd.lastAt < 1200) return null;
    _woCmd.lastText = key; _woCmd.lastAt = now;

    if (!_woCmdApply(action, ctx)) return null;
    woBeep(1040, 80);
    woCommandFlash(WO_CMD_LABELS[action] || action.toUpperCase());
    return action;
}

/** Big label that confirms what was heard; lives on <body> so a phase change can't wipe it. */
function woCommandFlash(label) {
    var el = document.getElementById('woFlash');
    if (!el) {
        el = document.createElement('div');
        el.id = 'woFlash';
        el.className = 'wo-flash';
        document.body.appendChild(el);
    }
    el.textContent = label;
    el.classList.remove('wo-flash--show');
    void el.offsetWidth;                      // restart the fade animation
    el.classList.add('wo-flash--show');
    clearTimeout(el._t);
    el._t = setTimeout(function() { if (el.parentNode) el.parentNode.removeChild(el); }, 1000);
}

// ─── Listening ────────────────────────────────────────────────────────────────

function woCommandsSupported() { return !!woSpeechRecognitionCtor(); }

function woCommandsStart(ctx) {
    _woCmd.ctx = ctx;
    _woCmd.muted = false; _woCmd.denied = false; _woCmd.pendingEnd = 0;
    _woCmd.active = !!(ctx.session.voiceCmds && woCommandsSupported());
    if (_woCmd.active) _woCmdBegin();
    woCommandsRefreshUi();
}

/** Stops and discards the current recogniser (its handlers are detached so a late 'end' can't restart it). */
function _woCmdKillRec() {
    clearTimeout(_woCmd.restartTimer);
    if (_woCmd.rec) {
        var rec = _woCmd.rec;
        _woCmd.rec = null;
        rec.onend = rec.onerror = rec.onresult = rec.onstart = null;
        try { rec.abort(); } catch (e) {}
    }
    _woCmd.listening = false;
}

function woCommandsStop() {
    _woCmd.active = false;
    _woCmdKillRec();
    _woCmd.ctx = null;
}

function _woCmdBegin() {
    if (!_woCmd.active || _woCmd.muted || _woCmd.denied || _woCmd.rec) return;
    var Ctor = woSpeechRecognitionCtor();
    if (!Ctor) return;
    var rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = 'en-US';
    rec.maxAlternatives = 3;

    rec.onstart = function() { _woCmd.listening = true; woCommandsRefreshUi(); };
    rec.onresult = function(ev) {
        // The app's own voice must not trigger commands ("Up next…" contains "next")
        if (woIsSpeaking()) return;
        for (var i = ev.resultIndex; i < ev.results.length; i++) {
            if (!ev.results[i].isFinal) continue;
            for (var j = 0; j < ev.results[i].length; j++) {
                if (woHandleTranscript(ev.results[i][j].transcript, _woCmd.ctx)) break;
            }
        }
    };
    rec.onerror = function(ev) {
        if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
            _woCmd.denied = true;                   // mic blocked — stop trying, show it on the button
            woCommandsRefreshUi();
        }
        // 'no-speech', 'aborted', 'network' … are normal — onend restarts listening
    };
    rec.onend = function() {
        _woCmd.rec = null; _woCmd.listening = false;
        woCommandsRefreshUi();
        // Chrome stops after a stretch of silence — quietly start again
        if (_woCmd.active && !_woCmd.muted && !_woCmd.denied) {
            clearTimeout(_woCmd.restartTimer);
            _woCmd.restartTimer = setTimeout(_woCmdBegin, 300);
        }
    };
    _woCmd.rec = rec;
    try { rec.start(); }
    catch (e) { _woCmd.rec = null; _woCmd.restartTimer = setTimeout(_woCmdBegin, 1000); }
}

// ─── Mic button in the player's top bar ───────────────────────────────────────

function _woCmdUiState() {
    if (_woCmd.denied) return { text: '🎙️⚠', title: 'Microphone is blocked — tap to try again' };
    if (_woCmd.muted)  return { text: '🎙️✕', title: 'Voice commands are off — tap to turn on' };
    return { text: '🎙️', title: _woCmd.listening ? 'Listening for voice commands — tap to mute' : 'Voice commands on — tap to mute' };
}

/** HTML for the button (empty when voice commands are off / unsupported for this workout). */
function woCommandsButtonHtml(ctx) {
    if (!(ctx && ctx.session && ctx.session.voiceCmds && woCommandsSupported())) return '';
    var s = _woCmdUiState();
    return '<button type="button" class="wo-end-btn' + (_woCmd.listening && !_woCmd.muted ? ' wo-mic--live' : '') + '" id="woMic" title="' + s.title + '">' + s.text + '</button>';
}

function woCommandsBindUi() {
    var b = document.getElementById('woMic');
    if (!b) return;
    b.addEventListener('click', function() {
        if (_woCmd.denied) { _woCmd.denied = false; _woCmd.muted = false; _woCmdBegin(); }
        else if (_woCmd.muted) { _woCmd.muted = false; _woCmdBegin(); }
        else { _woCmd.muted = true; _woCmdKillRec(); }
        woCommandsRefreshUi();
    });
}

function woCommandsRefreshUi() {
    var b = document.getElementById('woMic');
    if (!b) return;
    var s = _woCmdUiState();
    b.textContent = s.text;
    b.title = s.title;
    b.classList.toggle('wo-mic--live', _woCmd.listening && !_woCmd.muted && !_woCmd.denied);
}
