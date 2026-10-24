// workout-view.js — read-only "View exercise" card
//
// Opened by the 👁 button on workout steps (builder and Start screen) and on the picker rows, so
// you can compare two similar exercises without leaving what you are doing. It stacks on top of
// whatever is open (the picker stays where it was) and changes nothing.
//
// An exercise with levels shows one tab per level (starting on my level); each level has its own
// pictures, cues, equipment and video.

var _woViewFrames = {};     // exerciseId → [{ data, levelId }] in order (loaded once per page visit)
var _woViewTimer  = null;

async function _woViewLoadFrames(exerciseId) {
    if (_woViewFrames[exerciseId]) return _woViewFrames[exerciseId];
    var snap = await woLibCol('photos').where('targetType', '==', 'workoutExercise').where('targetId', '==', exerciseId).get();
    var list = snap.docs.map(function(d) { var p = d.data(); return { order: p.frameOrder || 0, data: p.imageData, levelId: p.levelId || null }; });
    list.sort(function(a, b) { return a.order - b.order; });
    return (_woViewFrames[exerciseId] = list);
}

function woCloseExerciseView() {
    clearInterval(_woViewTimer);
    var ov = document.getElementById('woViewOverlay');
    if (ov) ov.remove();
    document.removeEventListener('keydown', _woViewKey);
}

function _woViewKey(ev) { if (ev.key === 'Escape') woCloseExerciseView(); }

async function woViewExercise(exerciseId) {
    var e = _woExMap[exerciseId];
    if (!e) { alert('That exercise is no longer in your library.'); return; }
    woCloseExerciseView();

    var levels = woActiveLevelsOf(e), multi = levels.length > 1;
    if (multi) { try { await woLoadMyLevels(); } catch (err) { console.error('Workouts: could not read my levels:', err); } }
    var mineId = multi ? woMyLevelId(e) : levels[0].id;
    var cur = 0;
    levels.forEach(function(l, i) { if (l.id === mineId) cur = i; });

    var sm = woSideModeOf(e);
    var how = sm === 'each' ? 'One side, then the other' + (e.startSide === 'right' ? ' (right first)' : (e.startSide === 'weaker' ? ' (weaker side first)' : ' (left first)')) + (e.swapStart ? ', swapping the starting side each set' : '')
            : sm === 'alternate' ? 'Alternating sides' : 'Both together';
    var chips = _woTargetChips(e.targets);

    var ov = document.createElement('div');
    ov.id = 'woViewOverlay';
    ov.className = 'wo-grab-overlay';
    ov.style.zIndex = 2100;                      // above the picker, which may be open underneath
    ov.innerHTML = '<div class="wo-grab-box wo-view">' +
        '<h3>' + _woEsc(e.name) + ' ' + _woPushPullBadge(e.pushPull) + '</h3>' +
        (multi ? '<div class="wo-view-tabs" id="woViewTabs"></div>' : '') +
        '<div id="woViewBody"></div>' +
        '<div class="wo-view-row"><strong>How:</strong> ' + _woEsc(how) + '</div>' +
        '<div class="wo-view-row"><strong>Works:</strong> ' + (chips ? '<span class="wo-chips">' + chips + '</span>' : '<span class="wo-hint">not set</span>') + '</div>' +
        '<div class="ex-form-actions"><button type="button" class="btn btn-primary" id="woViewClose">Close</button>' +
        '<a class="btn btn-secondary" href="#workout-exercise/' + e.id + '" target="_blank" rel="noopener">Edit exercise ↗</a></div>' +
        '</div>';
    document.body.appendChild(ov);
    ov.querySelector('#woViewClose').addEventListener('click', woCloseExerciseView);
    ov.addEventListener('click', function(ev) { if (ev.target === ov) woCloseExerciseView(); });
    document.addEventListener('keydown', _woViewKey);

    function paint(i) {
        clearInterval(_woViewTimer);
        var lv = levels[i];
        if (multi) {
            ov.querySelector('#woViewTabs').innerHTML = levels.map(function(l, j) {
                return '<button type="button" class="wo-level-tab' + (j === i ? ' wo-level-tab--on' : '') + '" data-i="' + j + '">' +
                       _woEsc(woLevelDisplay(l, j)) + (l.id === mineId ? ' ★' : '') + '</button>';
            }).join('');
            ov.querySelectorAll('#woViewTabs .wo-level-tab').forEach(function(b) {
                b.addEventListener('click', function() { paint(parseInt(this.getAttribute('data-i'), 10)); });
            });
        }
        var amt = lv.defaultAmount != null ? lv.defaultAmount : e.defaultAmount;
        var wt  = e.usesWeight ? (lv.defaultWeight != null ? lv.defaultWeight : e.defaultWeight) : null;
        var equip = lv.equipment.map(function(q) { return '<span class="wo-chip wo-chip--also">' + _woEsc(q) + '</span>'; }).join('');
        var cues = (lv.instructions || '').split('\n').map(function(c) { return c.trim(); }).filter(Boolean);
        var safeVideo = /^https?:\/\//i.test(lv.videoUrl || '') ? lv.videoUrl : '';
        ov.querySelector('#woViewBody').innerHTML =
            (multi ? '<div class="wo-view-row"><strong>Level ' + (i + 1) + ' of ' + levels.length + '</strong>' +
                (lv.difficulty ? ' · difficulty ' + lv.difficulty + ' of 4' : '') + (lv.id === mineId ? ' · <strong>your level</strong>' : '') + '</div>' : '') +
            '<div id="woViewPics"><div class="wo-flip-ph">🤸</div></div>' +
            '<div class="wo-view-row"><strong>Default:</strong> ' + _woEsc(woFmtAmount(e.measure, amt, wt) || '—') + '</div>' +
            '<div class="wo-view-row"><strong>Equipment:</strong> ' + (equip ? '<span class="wo-chips">' + equip + '</span>' : '<span class="wo-hint">none</span>') + '</div>' +
            (cues.length ? '<div class="wo-view-row"><strong>Cues:</strong><ul class="wo-view-cues">' + cues.map(function(c) { return '<li>' + _woEsc(c) + '</li>'; }).join('') + '</ul></div>' : '') +
            (safeVideo ? '<div class="wo-view-row"><a href="' + _woEsc(safeVideo) + '" target="_blank" rel="noopener">▶ Video</a></div>' : '');

        _woViewLoadFrames(exerciseId).then(function(all) {
            var frames = (multi ? all.filter(function(f) { return woFrameLevelId(f) === lv.id; }) : all).map(function(f) { return f.data; });
            var box = document.getElementById('woViewPics');
            if (!box || !document.getElementById('woViewOverlay')) return;
            if (!frames.length) { box.innerHTML = '<p class="wo-hint">No pictures yet.</p>'; return; }
            box.innerHTML = '<img class="wo-flip" id="woViewFlip" alt="' + _woEsc(e.name) + '" src="' + frames[0] + '">';
            if (frames.length < 2) return;
            var n = 0;
            clearInterval(_woViewTimer);
            _woViewTimer = setInterval(function() {
                var img = document.getElementById('woViewFlip');
                if (!img) { clearInterval(_woViewTimer); return; }
                n = (n + 1) % frames.length;
                img.src = frames[n];
            }, WO_FLIP_MS);
        }).catch(function(err) {
            console.error('Workouts: could not load pictures for view:', err);
            var box = document.getElementById('woViewPics');
            if (box) box.innerHTML = '<p class="wo-hint">Could not load pictures.</p>';
        });
    }
    paint(cur);
}
