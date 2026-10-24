// workout-levels.js — exercise levels: helpers and "my level"
//
// Plan: ExerciseLevelsPlan.md (chunk L1). An exercise can have a ladder of levels (easiest → hardest),
// stored as ex.levels = [{ id, label, difficulty, instructions, equipment[], videoUrl,
//                          defaultAmount, defaultWeight, archived }].
// An exercise WITHOUT ex.levels is read as one level with id 'base' built from its own fields —
// so every existing exercise works untouched and nothing needs migrating.
//
// "My level" is personal, so it lives in userCol('workoutMyLevels') (doc id = exerciseId),
// not in the shared-able exercise library.

var WO_BASE_LEVEL_ID = 'base';
var _woMyLevels = null;          // exerciseId → levelId (null until woLoadMyLevels runs)

function woNewLevelId() { return 'lv' + Math.random().toString(36).slice(2, 8); }

/** Always returns at least one level, as fresh copies (safe to edit). */
function woLevelsOf(ex) {
    var src = ex && ex.levels && ex.levels.length ? ex.levels : null;
    if (!src) {
        return [{
            id: WO_BASE_LEVEL_ID, label: '', difficulty: null,
            instructions: (ex && ex.instructions) || '', equipment: ((ex && ex.equipment) || []).slice(),
            videoUrl: (ex && ex.videoUrl) || '', defaultAmount: null, defaultWeight: null, archived: false
        }];
    }
    return src.map(function(l) {
        return {
            id: l.id || woNewLevelId(), label: l.label || '',
            difficulty: l.difficulty > 0 ? l.difficulty : null,
            instructions: l.instructions || '', equipment: (l.equipment || []).slice(),
            videoUrl: l.videoUrl || '',
            defaultAmount: l.defaultAmount != null ? l.defaultAmount : null,
            defaultWeight: l.defaultWeight != null ? l.defaultWeight : null,
            archived: !!l.archived
        };
    });
}

/** Levels you can currently pick (archived ones are hidden but kept for history). */
function woActiveLevelsOf(ex) {
    var all = woLevelsOf(ex);
    var act = all.filter(function(l) { return !l.archived; });
    return act.length ? act : all.slice(0, 1);
}

/** True only when there is a real ladder to choose from. One-level exercises never show level UI. */
function woIsMultiLevel(ex) { return woActiveLevelsOf(ex).length > 1; }

function woLevelById(ex, id) {
    return woLevelsOf(ex).filter(function(l) { return l.id === id; })[0] || null;
}

/** "Chair", or "Level 3" when the level has no name. idx is its 0-based position among all levels. */
function woLevelDisplay(lv, idx) { return (lv && lv.label) || ('Level ' + ((idx || 0) + 1)); }

function woLevelLabel(ex, levelId) {
    var all = woLevelsOf(ex);
    for (var i = 0; i < all.length; i++) if (all[i].id === levelId) return woLevelDisplay(all[i], i);
    return '';
}

/** Which level a picture belongs to: pictures saved before levels existed belong to 'base'. */
function woFrameLevelId(frame) { return (frame && frame.levelId) || WO_BASE_LEVEL_ID; }

/** Best / last / history lines are kept per exercise AND level; old lines (no levelId) are 'base'. */
function woRecordKey(line) { return (line.exerciseId || '') + '|' + (line.levelId || WO_BASE_LEVEL_ID); }

// ─── My level (personal) ──────────────────────────────────────────────────────

async function woLoadMyLevels(force) {
    if (_woMyLevels && !force) return _woMyLevels;
    var snap = await userCol('workoutMyLevels').get();
    _woMyLevels = {};
    snap.docs.forEach(function(d) { _woMyLevels[d.id] = (d.data() || {}).levelId || null; });
    return _woMyLevels;
}

/** My level for an exercise: the saved one if it still exists and is active, otherwise the easiest active level. */
function woMyLevelId(ex) {
    var act = woActiveLevelsOf(ex);
    var saved = _woMyLevels && ex && _woMyLevels[ex.id];
    if (saved && act.some(function(l) { return l.id === saved; })) return saved;
    return act[0].id;
}

/** True when the person has never told us their level for this multi-level exercise. */
function woNeedsMyLevel(ex) {
    return woIsMultiLevel(ex) && !(_woMyLevels && _woMyLevels[ex.id] && woActiveLevelsOf(ex).some(function(l) { return l.id === _woMyLevels[ex.id]; }));
}

async function woSetMyLevel(exerciseId, levelId) {
    await userCol('workoutMyLevels').doc(exerciseId).set({
        levelId: levelId, updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    if (!_woMyLevels) _woMyLevels = {};
    _woMyLevels[exerciseId] = levelId;
}

async function woClearMyLevel(exerciseId) {
    try { await userCol('workoutMyLevels').doc(exerciseId).delete(); } catch (e) { /* nothing to clear */ }
    if (_woMyLevels) delete _woMyLevels[exerciseId];
}

/**
 * The level a workout step should play: pinned → that level (or the nearest easier one if it was
 * removed/archived); otherwise my level. One-level exercises always resolve to their only level.
 */
function woResolveLevel(step, ex) {
    var all = woLevelsOf(ex), act = woActiveLevelsOf(ex);
    if (act.length < 2) return act[0];
    if (step && step.levelMode === 'pinned' && step.levelId) {
        var idx = -1;
        all.forEach(function(l, i) { if (l.id === step.levelId) idx = i; });
        if (idx !== -1 && !all[idx].archived) return all[idx];
        if (idx !== -1) {                                             // archived: nearest easier active level
            for (var i = idx - 1; i >= 0; i--) if (!all[i].archived) return all[i];
            return act[0];
        }
        // the level no longer exists at all: fall through to my level
    }
    var mine = woMyLevelId(ex);
    return act.filter(function(l) { return l.id === mine; })[0] || act[0];
}
