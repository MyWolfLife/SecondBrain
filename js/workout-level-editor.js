// workout-level-editor.js — the Levels part of the exercise editor (ExerciseLevelsPlan.md, chunk L2)
//
// The exercise editor keeps exercise-wide fields on top (name, measure, sides, push/pull, muscles).
// Everything that can differ per level (level name, difficulty, equipment, cues, video, default amount,
// pictures) lives in #woeLevelGroup, which re-draws on its own when you switch level — so typing in
// the top fields is never lost.
//
// A one-level exercise shows exactly what the editor always showed (plus two small "add a version"
// buttons). Tabs, names and difficulty appear only once a second level exists.
//
// State on _woEdit: levels[] (working copies), curLevel (index being edited), savedLevelIds
// (levels that already exist in the database), _levelsReady. _woEdit.equipment always points at the
// ACTIVE level's equipment array so the existing equipment chips edit it in place.

function _woEnsureLevels() {
    var e = _woEdit;
    if (!e._levelsReady) {
        var had = !!(e.levels && e.levels.length);
        e.levels = woLevelsOf(e);
        if (!had) e.levels[0].equipment = e.equipment || [];        // one level works directly on the exercise's list
        e.curLevel = Math.min(e.curLevel || 0, e.levels.length - 1);
        e.savedLevelIds = e.id ? (had ? e.levels.map(function(l) { return l.id; }) : [WO_BASE_LEVEL_ID]) : [];     // a new exercise has nothing saved yet
        e._levelsReady = true;
    }
    e.equipment = e.levels[e.curLevel].equipment;
}

function _woActiveLevelId() {
    var e = _woEdit;
    return e && e.levels && e.levels[e.curLevel] ? e.levels[e.curLevel].id : WO_BASE_LEVEL_ID;
}

/** Pictures of the level being edited (a one-level exercise simply shows all its pictures). */
function _woLevelFrames() {
    if (!_woEdit || !_woEdit.levels || _woEdit.levels.length < 2) return _woFrames;
    var id = _woActiveLevelId();
    return _woFrames.filter(function(f) { return woFrameLevelId(f) === id; });
}

/** Copies what is typed in the level fields back into the active level object. */
function _woSyncActiveLevel() {
    var e = _woEdit, lv = e && e.levels && e.levels[e.curLevel];
    if (!lv) return;
    var g = function(id) { return document.getElementById(id); };
    if (g('woeCues'))  lv.instructions = g('woeCues').value;
    if (g('woeVideo')) lv.videoUrl = g('woeVideo').value.trim();
    if (g('woeLevelLabel')) lv.label = g('woeLevelLabel').value.trim();
    if (g('woeLevelDiff'))  lv.difficulty = parseInt(g('woeLevelDiff').value, 10) || null;
    if (g('woeLevelAmount')) { var a = parseInt(g('woeLevelAmount').value, 10); lv.defaultAmount = a > 0 ? a : null; }
    if (g('woeLevelWeight')) { var w = parseFloat(g('woeLevelWeight').value); lv.defaultWeight = isNaN(w) ? null : w; }
}

/** Everything the save needs from the levels: mirror fields for old readers, plus levels[] when there is a ladder. */
function woCollectLevelsForSave() {
    _woSyncActiveLevel();
    var L = _woEdit.levels, first = L[0], union = [];
    L.forEach(function(l) { l.equipment.forEach(function(q) { if (union.indexOf(q) === -1) union.push(q); }); });
    var out = { instructions: first.instructions.trim(), videoUrl: (first.videoUrl || '').trim(), equipment: union, levels: null };
    if (L.length > 1) {
        out.levels = L.map(function(l) {
            return { id: l.id, label: l.label.trim(), difficulty: l.difficulty || null, instructions: l.instructions.trim(),
                     equipment: l.equipment.slice(), videoUrl: (l.videoUrl || '').trim(),
                     defaultAmount: l.defaultAmount, defaultWeight: l.defaultWeight, archived: !!l.archived };
        });
    }
    return out;
}

/** The equipment manager renamed/deleted an item: apply it to every level of the open exercise (in place). */
function _woEditApplyEquipChange(oldName, newName) {
    if (!_woEdit) return;
    var lists = _woEdit.levels ? _woEdit.levels.map(function(l) { return l.equipment; }) : [_woEdit.equipment];
    lists.forEach(function(a) {
        var i = a.indexOf(oldName);
        if (i === -1) return;
        if (newName && a.indexOf(newName) === -1) a[i] = newName; else a.splice(i, 1);
    });
}

// ─── Drawing ──────────────────────────────────────────────────────────────────

var WO_DIFFICULTY_WORDS = { 1: '1 – easiest', 2: '2', 3: '3', 4: '4 – hardest' };

function _woLevelGroupHtml() {
    var e = _woEdit, L = e.levels, i = e.curLevel, lv = L[i], multi = L.length > 1, isNew = !e.id;

    var allEquip = _woEquipment.map(function(q) { return q.name; });
    lv.equipment.forEach(function(q) { if (allEquip.indexOf(q) === -1) allEquip.push(q); });

    var tabs = '', actions = '', fields = '', mine = '';
    if (multi) {
        tabs = '<div class="wo-level-tabs">' + L.map(function(l, j) {
            return '<button type="button" class="wo-level-tab' + (j === i ? ' wo-level-tab--on' : '') + (l.archived ? ' wo-level-tab--off' : '') +
                   '" data-lv="' + j + '">' + (j + 1) + '. ' + _woEsc(woLevelDisplay(l, j)) + (l.archived ? ' (archived)' : '') + '</button>';
        }).join('') + '</div>';

        var saved = e.savedLevelIds.indexOf(lv.id) !== -1;
        actions = '<div class="wo-level-actions">' +
            '<button type="button" class="btn btn-secondary btn-small" id="woeLvEasier">＋ Easier version</button>' +
            '<button type="button" class="btn btn-secondary btn-small" id="woeLvHarder">＋ Harder version</button>' +
            '<button type="button" class="btn btn-secondary btn-small" id="woeLvLeft"' + (i === 0 ? ' disabled' : '') + ' title="Make this level easier (move earlier)">◀</button>' +
            '<button type="button" class="btn btn-secondary btn-small" id="woeLvRight"' + (i === L.length - 1 ? ' disabled' : '') + ' title="Make this level harder (move later)">▶</button>' +
            (saved ? '<button type="button" class="btn btn-secondary btn-small" id="woeLvArchive">' + (lv.archived ? 'Unarchive level' : 'Archive level') + '</button>'
                   : '<button type="button" class="btn btn-danger btn-small" id="woeLvRemove">Remove level</button>') +
            '</div>';

        if (saved && !isNew) {
            var mineId = woMyLevelId({ id: e.id, levels: L });
            var mineIdx = 0; L.forEach(function(l, j) { if (l.id === mineId) mineIdx = j; });
            mine = '<div class="wo-hint">My level: <strong>' + _woEsc(woLevelDisplay(L[mineIdx], mineIdx)) + '</strong>' +
                   (mineId === lv.id ? ' (this one)' : ' <button type="button" class="wo-link-btn" id="woeLvMine">Make this level my level</button>') + '</div>';
        }

        fields =
            '<div class="ex-form-group"><label class="ex-label" for="woeLevelLabel">Level name</label>' +
                '<input type="text" id="woeLevelLabel" maxlength="40" value="' + _woEsc(lv.label) + '" placeholder="e.g. Hands on a chair"></div>' +
            '<div class="ex-form-group"><label class="ex-label" for="woeLevelDiff">Difficulty</label><select id="woeLevelDiff">' +
                '<option value="">Not rated</option>' + [1, 2, 3, 4].map(function(n) {
                    return '<option value="' + n + '"' + (lv.difficulty === n ? ' selected' : '') + '>' + WO_DIFFICULTY_WORDS[n] + '</option>'; }).join('') + '</select></div>' +
            '<div class="ex-form-group"><label class="ex-label" for="woeLevelAmount" id="woeLevelAmountLabel">' + (e.measure === 'time' ? 'This level\'s default seconds' : 'This level\'s default reps') + ' <span class="wo-hint">blank = same as the exercise</span></label>' +
                '<input type="number" class="wo-w-narrow" id="woeLevelAmount" min="1" step="1" value="' + (lv.defaultAmount != null ? lv.defaultAmount : '') + '"></div>' +
            (e.usesWeight ? '<div class="ex-form-group"><label class="ex-label" for="woeLevelWeight">This level\'s default weight (lb) <span class="wo-hint">blank = same as the exercise</span></label>' +
                '<input type="number" class="wo-w-narrow" id="woeLevelWeight" min="0" step="0.5" value="' + (lv.defaultWeight != null ? lv.defaultWeight : '') + '"></div>' : '');
    } else {
        actions = '<div class="wo-level-actions"><span class="wo-hint">Has easier or harder versions (wall, chair, floor…)?</span> ' +
            '<button type="button" class="btn btn-secondary btn-small" id="woeLvEasier">＋ Easier version</button>' +
            '<button type="button" class="btn btn-secondary btn-small" id="woeLvHarder">＋ Harder version</button></div>';
    }

    return '<div class="wo-level-wrap' + (multi ? ' wo-level-wrap--multi' : '') + '">' +
        (multi ? '<label class="ex-label">Levels <span class="wo-hint">easiest → hardest. Each level has its own equipment, cues and pictures.</span></label>' : '') +
        tabs + actions + mine +
        '<div class="wo-level-box' + (multi ? ' wo-level-box--multi' : '') + '">' + fields +

        '<div class="collapsible-section wo-acc' + (isNew ? '' : ' collapsed') + '">' +
            '<div class="collapsible-header wo-acc-head">' +
                '<span class="wo-acc-title">Equipment<span class="wo-acc-answer" id="woeEquipAnswer">' + _woEquipAnswerHtml() + '</span></span>' +
                '<span class="collapsible-chevron">▼</span>' +
            '</div>' +
            '<div class="collapsible-body">' +
            '<div class="wo-chips" id="woeEquip">' +
                allEquip.map(function(q) {
                    return '<button type="button" class="wo-chip-toggle" data-equip="' + _woEsc(q) + '" data-state="' +
                           (lv.equipment.indexOf(q) !== -1 ? 'main' : 'off') + '">' + _woEsc(q) + '</button>';
                }).join('') +
            '</div>' +
            '<div class="wo-add-equip"><input type="text" id="woeEquipNew" placeholder="Other equipment…" maxlength="40">' +
                '<button type="button" class="btn btn-secondary btn-small" id="woeEquipAdd">Add</button>' +
                '<button type="button" class="btn btn-secondary btn-small" id="woeEquipEdit">Edit</button></div>' +
            '</div>' +
        '</div>' +

        '<div class="ex-form-group">' +
            '<label class="ex-label" for="woeCues">How to do it / form cues</label>' +
            '<textarea id="woeCues" class="wo-cues" rows="4" placeholder="One cue per line">' + _woEsc(lv.instructions) + '</textarea>' +
        '</div>' +

        '<div class="ex-form-group">' +
            '<label class="ex-label" for="woeVideo">Video link (optional)</label>' +
            '<input type="url" class="wo-w-wide" id="woeVideo" value="' + _woEsc(lv.videoUrl) + '" placeholder="https://…">' +
        '</div>' +

        '<div class="ex-form-group" id="woeFramesGroup">' +
            '<label class="ex-label">Pictures</label>' +
            '<p class="wo-hint">' + (isNew ? 'Add the exercise first — you will then be able to add the pictures that show the motion.' : 'Loading…') + '</p>' +
        '</div>' +
        '</div></div>';
}

/** Draws the level group into the editor and wires it up. Safe to call again after any level change. */
function woLevelGroupRender() {
    var host = document.getElementById('woeLevelGroup');
    if (!host || !_woEdit) return;
    clearInterval(_woFlipTimer);
    _woEnsureLevels();
    host.innerHTML = _woLevelGroupHtml();
    _woBindLevelGroup(host);
}

function _woBindLevelGroup(host) {
    var e = _woEdit, isNew = !e.id;
    var on = function(id, fn) { var b = document.getElementById(id); if (b) b.addEventListener('click', fn); };

    host.querySelectorAll('.wo-acc-head').forEach(function(h) {
        h.addEventListener('click', function() { h.parentNode.classList.toggle('collapsed'); });
    });
    host.querySelectorAll('.wo-chip-toggle[data-equip]').forEach(function(btn) {
        btn.addEventListener('click', function() { _woToggleEquip(this); });
    });
    on('woeEquipAdd', _woAddCustomEquip);
    on('woeEquipEdit', woOpenEquipmentManager);
    document.getElementById('woeEquipNew').addEventListener('keydown', function(ev) {
        if (ev.key === 'Enter') { ev.preventDefault(); _woAddCustomEquip(); }
    });
    _woRememberCuesSize();

    host.querySelectorAll('.wo-level-tab').forEach(function(t) {
        t.addEventListener('click', function() { _woSwitchLevel(parseInt(this.getAttribute('data-lv'), 10)); });
    });
    var lab = document.getElementById('woeLevelLabel');
    if (lab) lab.addEventListener('input', function() {            // keep the tab's name in step with what is typed
        var tab = host.querySelector('.wo-level-tab--on');
        if (tab) tab.textContent = (e.curLevel + 1) + '. ' + (this.value.trim() || 'Level ' + (e.curLevel + 1)) + (e.levels[e.curLevel].archived ? ' (archived)' : '');
    });
    on('woeLvEasier', function() { _woAddLevel('before'); });
    on('woeLvHarder', function() { _woAddLevel('after'); });
    on('woeLvLeft',  function() { _woMoveLevel(-1); });
    on('woeLvRight', function() { _woMoveLevel(1); });
    on('woeLvArchive', _woToggleArchiveLevel);
    on('woeLvRemove', _woRemoveLevel);
    on('woeLvMine', async function() {
        try { await woSetMyLevel(e.id, _woActiveLevelId()); woLevelGroupRender(); }
        catch (err) { console.error('Workouts: could not save my level:', err); alert('Could not save. Please try again.'); }
    });

    if (!isNew) {
        if (_woFramesFor === e.id) _woRenderFrames();
        else _woLoadFrames().then(_woRenderFrames).catch(function(err) {
            console.error('Workouts: failed to load frames:', err);
            var g = document.getElementById('woeFramesGroup');
            if (g) g.innerHTML = '<label class="ex-label">Pictures</label><p class="wo-hint">Could not load pictures.</p>';
        });
    }
}

// ─── Level actions ────────────────────────────────────────────────────────────

function _woSwitchLevel(i) {
    _woSyncActiveLevel();
    _woEdit.curLevel = i;
    woLevelGroupRender();
}

/** where: 'before' = an easier version than the one being edited, 'after' = a harder one. */
function _woAddLevel(where) {
    _woSyncActiveLevel();
    var e = _woEdit, src = e.levels[e.curLevel];
    var lv = { id: woNewLevelId(), label: '', difficulty: null, instructions: src.instructions, equipment: src.equipment.slice(),
               videoUrl: '', defaultAmount: null, defaultWeight: null, archived: false };
    var at = where === 'before' ? e.curLevel : e.curLevel + 1;
    e.levels.splice(at, 0, lv);
    e.curLevel = at;
    woLevelGroupRender();
    var lab = document.getElementById('woeLevelLabel');
    if (lab) lab.focus();
}

function _woMoveLevel(dir) {
    _woSyncActiveLevel();
    var e = _woEdit, i = e.curLevel, j = i + dir;
    if (j < 0 || j >= e.levels.length) return;
    var t = e.levels[i]; e.levels[i] = e.levels[j]; e.levels[j] = t;
    e.curLevel = j;
    woLevelGroupRender();
}

function _woToggleArchiveLevel() {
    _woSyncActiveLevel();
    var e = _woEdit, lv = e.levels[e.curLevel];
    if (!lv.archived && e.levels.filter(function(l) { return !l.archived; }).length < 2) {
        alert('At least one level has to stay active.');
        return;
    }
    lv.archived = !lv.archived;
    woLevelGroupRender();
}

/** Only for levels that were added in this editing session and not saved yet. */
function _woRemoveLevel() {
    var e = _woEdit, lv = e.levels[e.curLevel];
    if (lv.id === WO_BASE_LEVEL_ID || e.savedLevelIds.indexOf(lv.id) !== -1) return;
    if (!confirm('Remove this new level?')) return;
    e.levels.splice(e.curLevel, 1);
    e.curLevel = Math.max(0, e.curLevel - 1);
    woLevelGroupRender();
}
