// ─── Exercise tags: "only" / "hide" filter chips ───────────────────────────────
//
// An exercise's tags = its own `tags` list plus its `source` (so everything imported as "YAYOG" is tagged "yayog"
// without any migration). Tags are compared lower-case.
//
// The filter is shared by the Exercises list and the exercise picker, and is remembered on this device:
//   woTagFilter = { only: ['yayog'], hide: ['band'] }
// A chip cycles  neutral → only (green) → hide (red, struck through) → neutral.
// Several "only" tags mean the exercise must have ALL of them; any "hide" tag hides the exercise.

var WO_TAG_FILTER_KEY = 'woTagFilter';
var woTagFilter = _woTagLoad();

function _woTagLoad() {
    try {
        var f = JSON.parse(localStorage.getItem(WO_TAG_FILTER_KEY) || '{}');
        return { only: Array.isArray(f.only) ? f.only : [], hide: Array.isArray(f.hide) ? f.hide : [] };
    } catch (e) { return { only: [], hide: [] }; }
}
function _woTagSave() { try { localStorage.setItem(WO_TAG_FILTER_KEY, JSON.stringify(woTagFilter)); } catch (e) { /* storage blocked — filter just isn't remembered */ } }

/** "Yoga, Band , yoga" → ['yoga', 'band'] */
function woParseTags(text) {
    var out = [];
    String(text || '').split(',').forEach(function(t) {
        t = t.trim().toLowerCase().slice(0, 30);
        if (t && out.indexOf(t) === -1) out.push(t);
    });
    return out;
}

/** All of an exercise's tags (its own list + its source), lower-case, no duplicates. */
function woExTags(e) {
    var out = (e.tags || []).map(function(t) { return String(t).toLowerCase(); });
    var s = String(e.source || '').trim().toLowerCase();
    if (s && out.indexOf(s) === -1) out.push(s);
    return out;
}

/** Every tag in use, with how many exercises carry it, A–Z. [{tag, count}] */
function woAllTags(exercises) {
    var counts = {};
    exercises.forEach(function(e) { if (!e.archived) woExTags(e).forEach(function(t) { counts[t] = (counts[t] || 0) + 1; }); });
    return Object.keys(counts).sort().map(function(t) { return { tag: t, count: counts[t] }; });
}

/** Does the exercise pass the current tag filter? */
function woTagPass(e) {
    var tags = woExTags(e);
    for (var i = 0; i < woTagFilter.hide.length; i++) if (tags.indexOf(woTagFilter.hide[i]) !== -1) return false;
    for (var j = 0; j < woTagFilter.only.length; j++) if (tags.indexOf(woTagFilter.only[j]) === -1) return false;
    return true;
}

function woTagActive() { return woTagFilter.only.length + woTagFilter.hide.length > 0; }

function _woTagState(t) { return woTagFilter.only.indexOf(t) !== -1 ? 'only' : (woTagFilter.hide.indexOf(t) !== -1 ? 'hide' : ''); }

/** The chip row (empty string when no exercise has any tag). */
function woTagChipsHtml(exercises) {
    var tags = woAllTags(exercises);
    // a tag that is filtered but no longer exists would be invisible and un-clearable — keep showing it
    woTagFilter.only.concat(woTagFilter.hide).forEach(function(t) { if (!tags.some(function(x) { return x.tag === t; })) tags.push({ tag: t, count: 0 }); });
    if (!tags.length) return '';
    return '<div class="wo-tagbar"><span class="wo-hint">Tags:</span> ' + tags.map(function(x) {
        var st = _woTagState(x.tag);
        return '<button type="button" class="wo-tagchip' + (st ? ' wo-tagchip--' + st : '') + '" data-wotag="' + _woEsc(x.tag) + '" title="Tap to cycle: only → hide → off">' +
               (st === 'only' ? '✓ only ' : (st === 'hide' ? '✕ hide ' : '')) + _woEsc(x.tag) + ' <span class="wo-tagcount">' + x.count + '</span></button>';
    }).join(' ') + (woTagActive() ? ' <button type="button" class="wo-link-btn" data-wotag-clear="1">Clear tags</button>' : '') + '</div>';
}

/** Wire the chips inside `root`; onChange runs after every tap (re-render the list, and the chips themselves). */
function woTagChipsWire(root, onChange) {
    root.querySelectorAll('[data-wotag]').forEach(function(b) {
        b.addEventListener('click', function() {
            var t = this.getAttribute('data-wotag'), st = _woTagState(t);
            woTagFilter.only = woTagFilter.only.filter(function(x) { return x !== t; });
            woTagFilter.hide = woTagFilter.hide.filter(function(x) { return x !== t; });
            if (st === '') woTagFilter.only.push(t); else if (st === 'only') woTagFilter.hide.push(t);
            _woTagSave(); onChange();
        });
    });
    var clr = root.querySelector('[data-wotag-clear]');
    if (clr) clr.addEventListener('click', function() { woTagFilter = { only: [], hide: [] }; _woTagSave(); onChange(); });
}
