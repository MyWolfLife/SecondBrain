// workout-view.js — read-only "View exercise" card
//
// Opened by the 👁 button on workout steps (builder and Start screen) and on the picker rows, so
// you can compare two similar exercises without leaving what you are doing. It stacks on top of
// whatever is open (the picker stays where it was) and changes nothing.

var _woViewFrames = {};     // exerciseId → [imageData] (loaded once per page visit)
var _woViewTimer  = null;

async function _woViewLoadFrames(exerciseId) {
    if (_woViewFrames[exerciseId]) return _woViewFrames[exerciseId];
    var snap = await woLibCol('photos').where('targetType', '==', 'workoutExercise').where('targetId', '==', exerciseId).get();
    var list = snap.docs.map(function(d) { var p = d.data(); return { order: p.frameOrder || 0, data: p.imageData }; });
    list.sort(function(a, b) { return a.order - b.order; });
    return (_woViewFrames[exerciseId] = list.map(function(f) { return f.data; }));
}

function woCloseExerciseView() {
    clearInterval(_woViewTimer);
    var ov = document.getElementById('woViewOverlay');
    if (ov) ov.remove();
    document.removeEventListener('keydown', _woViewKey);
}

function _woViewKey(ev) { if (ev.key === 'Escape') woCloseExerciseView(); }

function woViewExercise(exerciseId) {
    var e = _woExMap[exerciseId];
    if (!e) { alert('That exercise is no longer in your library.'); return; }
    woCloseExerciseView();

    var sm = woSideModeOf(e);
    var how = sm === 'each' ? 'One side, then the other' + (e.startSide === 'right' ? ' (right first)' : ' (left first)')
            : sm === 'alternate' ? 'Alternating sides' : 'Both together';
    var chips = _woTargetChips(e.targets);
    var equip = (e.equipment || []).map(function(q) { return '<span class="wo-chip wo-chip--also">' + _woEsc(q) + '</span>'; }).join('');
    var cues = (e.instructions || '').split('\n').map(function(c) { return c.trim(); }).filter(Boolean);
    var safeVideo = /^https?:\/\//i.test(e.videoUrl || '') ? e.videoUrl : '';

    var ov = document.createElement('div');
    ov.id = 'woViewOverlay';
    ov.className = 'wo-grab-overlay';
    ov.style.zIndex = 2100;                      // above the picker, which may be open underneath
    ov.innerHTML = '<div class="wo-grab-box wo-view">' +
        '<h3>' + _woEsc(e.name) + ' ' + _woPushPullBadge(e.pushPull) + '</h3>' +
        '<div id="woViewPics"><div class="wo-flip-ph">🤸</div></div>' +
        '<div class="wo-view-row"><strong>Default:</strong> ' + _woEsc(woFmtAmount(e.measure, e.defaultAmount, e.usesWeight ? e.defaultWeight : null) || '—') + '</div>' +
        '<div class="wo-view-row"><strong>How:</strong> ' + _woEsc(how) + '</div>' +
        '<div class="wo-view-row"><strong>Works:</strong> ' + (chips ? '<span class="wo-chips">' + chips + '</span>' : '<span class="wo-hint">not set</span>') + '</div>' +
        '<div class="wo-view-row"><strong>Equipment:</strong> ' + (equip ? '<span class="wo-chips">' + equip + '</span>' : '<span class="wo-hint">none</span>') + '</div>' +
        (cues.length ? '<div class="wo-view-row"><strong>Cues:</strong><ul class="wo-view-cues">' + cues.map(function(c) { return '<li>' + _woEsc(c) + '</li>'; }).join('') + '</ul></div>' : '') +
        (safeVideo ? '<div class="wo-view-row"><a href="' + _woEsc(safeVideo) + '" target="_blank" rel="noopener">▶ Video</a></div>' : '') +
        '<div class="ex-form-actions"><button type="button" class="btn btn-primary" id="woViewClose">Close</button>' +
        '<a class="btn btn-secondary" href="#workout-exercise/' + e.id + '" target="_blank" rel="noopener">Edit exercise ↗</a></div>' +
        '</div>';
    document.body.appendChild(ov);
    ov.querySelector('#woViewClose').addEventListener('click', woCloseExerciseView);
    ov.addEventListener('click', function(ev) { if (ev.target === ov) woCloseExerciseView(); });
    document.addEventListener('keydown', _woViewKey);

    _woViewLoadFrames(exerciseId).then(function(frames) {
        var box = document.getElementById('woViewPics');
        if (!box || !frames.length) { if (box) box.innerHTML = '<p class="wo-hint">No pictures yet.</p>'; return; }
        box.innerHTML = '<img class="wo-flip" id="woViewFlip" alt="' + _woEsc(e.name) + '" src="' + frames[0] + '">';
        if (frames.length < 2) return;
        var i = 0;
        _woViewTimer = setInterval(function() {
            var img = document.getElementById('woViewFlip');
            if (!img) { clearInterval(_woViewTimer); return; }
            i = (i + 1) % frames.length;
            img.src = frames[i];
        }, WO_FLIP_MS);
    }).catch(function(err) {
        console.error('Workouts: could not load pictures for view:', err);
        var box = document.getElementById('woViewPics');
        if (box) box.innerHTML = '<p class="wo-hint">Could not load pictures.</p>';
    });
}
