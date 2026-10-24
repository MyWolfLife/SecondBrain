// workout-start-levels.js — levels on the Start screen (ExerciseLevelsPlan.md, chunk L4)
//
// For a workout with multi-level exercises the Start screen:
//   1. asks ONCE "Which version can you do?" for each such exercise that follows My level and has no
//      saved level yet (the answer is saved when you tap Start);
//   2. shows a "Level today" dropdown on each step, preselected to the level it will play — change it
//      for today only, or tap "Make this my level" to keep it;
//   3. at Start, snapshots the level each step will play into the run copy of the steps
//      (runLevelId / runLevelLabel) — the saved workout is never touched.
//
// State on _woS: runLevels { stepPath → levelId } (today-only choices), myPick { exerciseId → levelId }
// (answers to the first-time question, saved at Start).

function woStartLevelsInit() {
    _woS.runLevels = {};
    _woS.myPick = {};
}

/** The level a step will play today (null for one-level exercises). */
function woStartLevelFor(step, path) {
    var ex = _woExMap[step.exerciseId];
    if (!ex || !woIsMultiLevel(ex)) return null;
    var pick = function(id) { var l = id && woLevelById(ex, id); return l && !l.archived ? l : null; };
    var chosen = pick(_woS.runLevels[path]);                         // an explicit choice for this step today
    if (chosen) return chosen;
    if (step.levelMode === 'pinned') return woResolveLevel(step, ex);
    return pick(_woS.myPick[ex.id]) || woResolveLevel(step, ex);     // first-time answer, else my level
}

/** Every exercise that follows My level but has no saved level: [{ex, levels}] */
function woStartLevelsToAsk() {
    var seen = {}, out = [];
    _woFlatExercises(_woS.workout.steps).forEach(function(st) {
        if (st.levelMode === 'pinned') return;
        var ex = _woExMap[st.exerciseId];
        if (!ex || seen[ex.id] || !woNeedsMyLevel(ex)) return;
        seen[ex.id] = true;
        out.push(ex);
    });
    return out;
}

function _woPathOf(i, j) { return j == null ? String(i) : i + '.' + j; }

/** The first-time question, as a card above the date. */
function woStartLevelsAskHtml() {
    var ask = woStartLevelsToAsk();
    if (!ask.length) return '';
    return '<div class="wo-banner wo-level-ask" id="wosLevelAsk">' +
        '<strong>Which version can you do?</strong> <span class="wo-hint">Answer once — it is remembered, and you can change it any time on the exercise.</span>' +
        ask.map(function(ex) {
            var mine = _woS.myPick[ex.id] || woActiveLevelsOf(ex)[0].id;
            return '<div class="wo-ask-ex"><div class="wo-ask-name">' + _woEsc(ex.name) + '</div>' +
                woActiveLevelsOf(ex).map(function(l) {
                    var idx = woLevelsOf(ex).findIndex(function(x) { return x.id === l.id; });
                    return '<label class="wo-ask-opt"><input type="radio" name="wosAsk_' + _woEsc(ex.id) + '" value="' + _woEsc(l.id) + '" data-ask-ex="' + _woEsc(ex.id) + '"' + (mine === l.id ? ' checked' : '') + '> ' +
                        '<img class="wo-ask-pic hidden" data-ask-pic="' + _woEsc(ex.id) + '|' + _woEsc(l.id) + '" alt=""> ' +
                        '<span>' + (idx + 1) + '. ' + _woEsc(woLevelDisplay(l, idx)) + (l.difficulty ? ' <span class="wo-hint">difficulty ' + l.difficulty + '</span>' : '') + '</span></label>';
                }).join('') + '</div>';
        }).join('') + '</div>';
}

/** "Level today" row (plain step) or inline select (circuit item). */
function woStartLevelRowHtml(step, path, inline) {
    var ex = _woExMap[step.exerciseId];
    if (!ex || !woIsMultiLevel(ex)) return '';
    var cur = woStartLevelFor(step, path), mineId = woMyLevelId(ex);
    var all = woLevelsOf(ex);
    var sel = '<select class="wo-level-select" data-lvl-run="' + path + '" title="Which version to do today">' +
        all.map(function(l, i) {
            if (l.archived) return '';
            return '<option value="' + _woEsc(l.id) + '"' + (cur.id === l.id ? ' selected' : '') + '>' + (i + 1) + '. ' + _woEsc(woLevelDisplay(l, i)) + (l.id === mineId ? ' ★' : '') + '</option>';
        }).join('') + '</select>';
    var differs = cur.id !== mineId && !woNeedsMyLevel(ex);          // no button while the first-time question is pending
    var mineBtn = '<button type="button" class="wo-link-btn' + (differs ? '' : ' hidden') + '" data-lvl-mine="' + path + '">Make this my level</button>';
    if (inline) return ' ' + sel + mineBtn;
    return '<div class="wo-rest-row"><span class="wo-rest-label">Level today</span>' + sel + ' ' + mineBtn + '</div>';
}

/** Loads the little pictures in the first-time question (first picture of each level). */
function woStartLevelsLoadPics() {
    var imgs = document.querySelectorAll('#wosLevelAsk [data-ask-pic]');
    var byEx = {};
    imgs.forEach(function(img) { var k = img.getAttribute('data-ask-pic').split('|'); (byEx[k[0]] = byEx[k[0]] || []).push([k[1], img]); });
    Object.keys(byEx).forEach(function(exId) {
        _woViewLoadFrames(exId).then(function(frames) {
            byEx[exId].forEach(function(pair) {
                var f = frames.filter(function(fr) { return woFrameLevelId(fr) === pair[0]; })[0];
                if (f) { pair[1].src = f.data; pair[1].classList.remove('hidden'); }
            });
        }).catch(function(err) { console.error('Workouts: could not load level pictures:', err); });
    });
}

/** Wires the first-time question and the per-step dropdowns (called after every Start-screen render). */
function woStartLevelsBind() {
    var el = document.getElementById('page-workout-start');
    el.querySelectorAll('input[data-ask-ex]').forEach(function(r) {
        r.addEventListener('change', function() {
            _woS.myPick[this.getAttribute('data-ask-ex')] = this.value;
            _woRenderStartPage();
        });
    });
    var box = document.getElementById('wosSteps');
    box.addEventListener('change', function(ev) {
        var sel = ev.target.closest('[data-lvl-run]');
        if (!sel) return;
        _woS.runLevels[sel.getAttribute('data-lvl-run')] = sel.value;
        _woRenderStartPage();
    });
    box.addEventListener('click', async function(ev) {
        var b = ev.target.closest('[data-lvl-mine]');
        if (!b) return;
        var path = b.getAttribute('data-lvl-mine').split('.');
        var step = _woS.workout.steps[parseInt(path[0], 10)];
        if (path.length > 1) step = (step.items || [])[parseInt(path[1], 10)];
        var lv = woStartLevelFor(step, b.getAttribute('data-lvl-mine'));
        if (!lv) return;
        b.disabled = true;
        try { await woSetMyLevel(step.exerciseId, lv.id); delete _woS.myPick[step.exerciseId]; _woRenderStartPage(); }
        catch (err) { console.error('Workouts: could not save my level:', err); alert('Could not save. Please try again.'); b.disabled = false; }
    });
    woStartLevelsLoadPics();
}

/** At Start: save the first-time answers (an unanswered question counts as the easiest level). */
async function woStartLevelsCommit() {
    var ask = woStartLevelsToAsk();
    for (var i = 0; i < ask.length; i++) {
        var ex = ask[i];
        await woSetMyLevel(ex.id, _woS.myPick[ex.id] || woActiveLevelsOf(ex)[0].id);
    }
}

/** Stamps runLevelId / runLevelLabel onto a COPY of the steps (same shape as _woS.workout.steps). */
function woStartApplyRunLevels(copySteps) {
    copySteps.forEach(function(st, i) {
        var stamp = function(it, path) {
            var lv = woStartLevelFor(it, path);
            if (!lv) { delete it.runLevelId; delete it.runLevelLabel; return; }
            var ex = _woExMap[it.exerciseId];
            var idx = woLevelsOf(ex).findIndex(function(x) { return x.id === lv.id; });
            it.runLevelId = lv.id; it.runLevelLabel = woLevelDisplay(lv, idx);
        };
        if (st.type === 'circuit') (st.items || []).forEach(function(it, j) { stamp(it, _woPathOf(i, j)); });
        else stamp(st, _woPathOf(i));
    });
    return copySteps;
}
