// ============================================================
// workout-links.js — Fitness → Workout Links
// A list of web links (reels, YouTube, web pages) to workouts the user wants to do later.
//
// Pages:
//   #workout-links        list: search box, tag chips (Any / All), favorites first, sort menu
//   #workout-link/new     add a link    (#workout-link/:id = edit)
//   #workout-link-tags    rename / delete tags across every link
//
// Firestore (per-user, userCol): workoutLinks
//   { name, url, description, tags[] (lowercase strings), favorite (bool),
//     doneLog[] ({ id, date 'YYYY-MM-DD', minutes|null, note, activityId|null }), createdAt }
//
// There is no separate tags collection: the tag list is every tag used on any link, so a new
// tag joins the list the moment it is saved on a link, and drops off when no link uses it.
//
// "Open" only opens the link. "✓ Did it" is what counts: it adds a doneLog entry AND creates a
// Fitness Activity (type "Workout", via _woWorkoutTypeId in workout-player.js).
// ============================================================

var WL_NO_TAGS = '__none__';   // the "No tags" filter chip

var _wlLinks = [];             // every link, loaded by the list page
var _wlFilter = {              // list filters — kept while you move around the app
    text: '',
    tags: [],                  // selected tag chips (or [WL_NO_TAGS])
    match: 'any',              // 'any' | 'all' when more than one tag is picked
    sort: 'newest'             // 'newest' | 'name' | 'most' | 'stale'
};
var _wlEdit = null;            // the link being edited { id|null, tags[] }
var _wlDidLinkId = null;       // link the "Did it" dialog is for
var _wlPendingShare = null;    // {url, name, description} from the phone share sheet, used by #workout-link/new

// ─── Small helpers ───────────────────────────────────────────────────────────

function _wlCrumbs(crumbs) {
    _woSetChrome(crumbs);   // workouts.js: Life › Fitness › …
}

/** Tags are stored lowercase and trimmed so "Cardio" and "cardio " are the same tag. */
function _wlCleanTag(t) {
    return String(t || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Adds https:// when the user leaves it off. */
function _wlCleanUrl(u) {
    u = String(u || '').trim();
    if (u && !/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) u = 'https://' + u;
    return u;
}

/** "youtube.com", "instagram.com" … for the card. */
function _wlHost(u) {
    try { return new URL(u).hostname.replace(/^www\.|^m\./, ''); } catch (e) { return ''; }
}

/** A small icon by site, since reels and pages can't be previewed for free. */
function _wlIcon(u) {
    var h = _wlHost(u);
    if (/youtube\.com|youtu\.be/.test(h)) return '▶️';
    if (/instagram\.com/.test(h)) return '📸';
    if (/tiktok\.com/.test(h)) return '🎵';
    if (/facebook\.com|fb\.watch/.test(h)) return '📘';
    return '🔗';
}

function _wlFmtDate(iso) {
    if (!iso) return '';
    var p = iso.split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}

/** Latest done date on a link, or '' if never done. */
function _wlLastDone(link) {
    var last = '';
    (link.doneLog || []).forEach(function(e) { if (e.date > last) last = e.date; });
    return last;
}

/** Every tag in use, A–Z, with how many links carry it. */
function _wlAllTags(links) {
    var counts = {};
    links.forEach(function(l) { (l.tags || []).forEach(function(t) { counts[t] = (counts[t] || 0) + 1; }); });
    return Object.keys(counts).sort().map(function(t) { return { tag: t, count: counts[t] }; });
}

async function _wlLoadLinks() {
    var snap = await userCol('workoutLinks').get();
    _wlLinks = snap.docs.map(function(d) { var l = d.data(); l.id = d.id; return l; });
}

// ─── List page (#workout-links) ──────────────────────────────────────────────

async function loadWorkoutLinksPage() {
    _wlCrumbs([['Workout Links']]);
    var el = document.getElementById('page-workout-links');
    el.innerHTML = '<div class="page-header"><h2>Workout Links</h2></div><div class="ex-status">Loading…</div>';
    try {
        await _wlLoadLinks();
    } catch (err) {
        console.error('Workout Links: failed to load:', err);
        el.innerHTML = '<div class="page-header"><h2>Workout Links</h2></div><div class="ex-status">Could not load links.</div>';
        return;
    }
    // Drop selected tags that no longer exist (renamed / deleted)
    var known = _wlAllTags(_wlLinks).map(function(t) { return t.tag; });
    _wlFilter.tags = _wlFilter.tags.filter(function(t) { return t === WL_NO_TAGS || known.indexOf(t) !== -1; });

    el.innerHTML =
        '<div class="page-header">' +
            '<h2>Workout Links</h2>' +
            '<div class="page-header-actions">' +
                '<a href="#workout-link-tags" class="btn btn-secondary">🏷️ Manage tags</a> ' +
                '<a href="#workout-link/new" class="btn btn-primary">+ Add Link</a>' +
            '</div>' +
        '</div>' +
        '<div class="ex-toolbar">' +
            '<div class="ex-toolbar-row">' +
                '<input type="search" id="wlText" class="filter-input" placeholder="Search name, description, or link…" value="' + _woEsc(_wlFilter.text) + '">' +
                '<select id="wlSort" class="wl-sort" title="Sort (favorites always stay on top)">' +
                    '<option value="newest">Newest added</option>' +
                    '<option value="name">Name A–Z</option>' +
                    '<option value="most">Most done</option>' +
                    '<option value="stale">Least recently done</option>' +
                '</select>' +
            '</div>' +
            '<div class="ex-toolbar-row"><div id="wlTagChips" class="wl-tag-chips"></div></div>' +
        '</div>' +
        '<div id="wlCount" class="wl-count"></div>' +
        '<div id="wlList"></div>';

    document.getElementById('wlSort').value = _wlFilter.sort;
    document.getElementById('wlText').addEventListener('input', function() { _wlFilter.text = this.value; _wlRenderList(); });
    document.getElementById('wlSort').addEventListener('change', function() { _wlFilter.sort = this.value; _wlRenderList(); });
    document.getElementById('wlTagChips').addEventListener('click', _wlOnChipClick);
    document.getElementById('wlList').addEventListener('click', _wlOnListClick);
    _wlRenderChips();
    _wlRenderList();
}

function _wlRenderChips() {
    var wrap = document.getElementById('wlTagChips');
    if (!wrap) return;
    var sel = _wlFilter.tags;
    var chip = function(value, label, on) {
        return '<button type="button" class="wl-chip' + (on ? ' wl-chip--on' : '') + '" data-tag="' + _woEsc(value) + '">' + _woEsc(label) + '</button>';
    };
    var html = chip('', 'All', !sel.length);
    _wlAllTags(_wlLinks).forEach(function(t) { html += chip(t.tag, t.tag + ' (' + t.count + ')', sel.indexOf(t.tag) !== -1); });
    var untagged = _wlLinks.filter(function(l) { return !(l.tags || []).length; }).length;
    html += chip(WL_NO_TAGS, 'No tags (' + untagged + ')', sel.indexOf(WL_NO_TAGS) !== -1);
    // Any / All only matters once two or more real tags are picked
    var realPicked = sel.filter(function(t) { return t !== WL_NO_TAGS; }).length;
    if (realPicked > 1) {
        html += '<span class="wl-match">Match: ' +
            '<button type="button" class="wl-match-btn' + (_wlFilter.match === 'any' ? ' wl-match-btn--on' : '') + '" data-match="any">Any</button>' +
            '<button type="button" class="wl-match-btn' + (_wlFilter.match === 'all' ? ' wl-match-btn--on' : '') + '" data-match="all">All</button>' +
        '</span>';
    }
    wrap.innerHTML = html;
}

function _wlOnChipClick(ev) {
    var m = ev.target.closest('[data-match]');
    if (m) { _wlFilter.match = m.getAttribute('data-match'); _wlRenderChips(); _wlRenderList(); return; }
    var c = ev.target.closest('[data-tag]');
    if (!c) return;
    var tag = c.getAttribute('data-tag');
    var sel = _wlFilter.tags;
    if (!tag) {
        sel = [];                                           // All
    } else if (tag === WL_NO_TAGS) {
        sel = sel.indexOf(WL_NO_TAGS) !== -1 ? [] : [WL_NO_TAGS];   // "No tags" stands alone
    } else {
        sel = sel.filter(function(t) { return t !== WL_NO_TAGS; });
        var i = sel.indexOf(tag);
        if (i === -1) sel.push(tag); else sel.splice(i, 1);
    }
    _wlFilter.tags = sel;
    _wlRenderChips();
    _wlRenderList();
}

/** The links that pass the search box and tag chips, sorted (favorites first). */
function _wlFiltered() {
    var text = _wlFilter.text.trim().toLowerCase();
    var sel = _wlFilter.tags;
    var rows = _wlLinks.filter(function(l) {
        var tags = l.tags || [];
        if (sel.length) {
            if (sel[0] === WL_NO_TAGS) {
                if (tags.length) return false;
            } else if (_wlFilter.match === 'all') {
                if (!sel.every(function(t) { return tags.indexOf(t) !== -1; })) return false;
            } else if (!sel.some(function(t) { return tags.indexOf(t) !== -1; })) {
                return false;
            }
        }
        if (text) {
            var hay = [l.name, l.description, l.url].join(' ').toLowerCase();
            if (hay.indexOf(text) === -1) return false;
        }
        return true;
    });
    var created = function(l) { return l.createdAt && l.createdAt.toMillis ? l.createdAt.toMillis() : 0; };
    rows.sort(function(a, b) {
        if (!!a.favorite !== !!b.favorite) return a.favorite ? -1 : 1;
        switch (_wlFilter.sort) {
            case 'name': return (a.name || '').localeCompare(b.name || '');
            case 'most': return (b.doneLog || []).length - (a.doneLog || []).length || (a.name || '').localeCompare(b.name || '');
            case 'stale':   // never done first, then the longest ago
                return _wlLastDone(a).localeCompare(_wlLastDone(b)) || (a.name || '').localeCompare(b.name || '');
            default: return created(b) - created(a);
        }
    });
    return rows;
}

function _wlRenderList() {
    var list = document.getElementById('wlList');
    if (!list) return;
    var rows = _wlFiltered();
    document.getElementById('wlCount').textContent = _wlLinks.length
        ? rows.length + ' of ' + _wlLinks.length + ' link' + (_wlLinks.length === 1 ? '' : 's') : '';
    if (!rows.length) {
        list.innerHTML = '<div class="ex-status">' + (_wlLinks.length
            ? 'No links match.'
            : 'No links yet. Tap <strong>+ Add Link</strong> to save a reel, video, or page you want to try.') + '</div>';
        return;
    }
    list.innerHTML = rows.map(function(l) {
        var done = (l.doneLog || []).length;
        var meta = [_wlHost(l.url)];
        meta.push(done ? 'Done ' + done + '× · last ' + _wlFmtDate(_wlLastDone(l)) : 'Not done yet');
        return '<div class="wo-card wl-card" data-id="' + l.id + '">' +
                   '<div class="wo-thumb">' + _wlIcon(l.url) + '</div>' +
                   '<div class="wo-card-main">' +
                       '<div class="wo-card-name">' +
                           '<button type="button" class="wl-star' + (l.favorite ? ' wl-star--on' : '') + '" data-star="' + l.id + '" title="Favorite (shows on top)">' + (l.favorite ? '★' : '☆') + '</button> ' +
                           _woEsc(l.name) +
                       '</div>' +
                       '<div class="wo-card-meta">' + _woEsc(meta.filter(Boolean).join(' · ')) + '</div>' +
                       (l.description ? '<div class="wo-card-meta wl-desc">' + _woEsc(l.description) + '</div>' : '') +
                       ((l.tags || []).length ? '<div class="wo-chips">' + l.tags.map(function(t) { return '<span class="wo-chip wo-chip--also">' + _woEsc(t) + '</span>'; }).join('') + '</div>' : '') +
                       '<div class="wl-card-actions">' +
                           '<a class="btn btn-secondary btn-small" href="' + _woEsc(l.url) + '" target="_blank" rel="noopener">Open ↗</a>' +
                           '<button type="button" class="btn btn-primary btn-small" data-did="' + l.id + '">✓ Did it</button>' +
                           '<a class="btn btn-secondary btn-small" href="#workout-link/' + l.id + '">Edit</a>' +
                       '</div>' +
                   '</div>' +
               '</div>';
    }).join('');
}

async function _wlOnListClick(ev) {
    var star = ev.target.closest('[data-star]');
    if (star) {
        var link = _wlLinks.find(function(l) { return l.id === star.getAttribute('data-star'); });
        if (!link) return;
        link.favorite = !link.favorite;
        _wlRenderList();
        try {
            await userCol('workoutLinks').doc(link.id).update({ favorite: link.favorite });
        } catch (err) {
            console.error('Workout Links: favorite failed:', err);
            link.favorite = !link.favorite;
            _wlRenderList();
            alert('Could not save the favorite. Please try again.');
        }
        return;
    }
    var did = ev.target.closest('[data-did]');
    if (did) { wlOpenDidIt(did.getAttribute('data-did')); }
}

// ─── Add / edit page (#workout-link/new, #workout-link/:id) ──────────────────

async function loadWorkoutLinkPage(id) {
    var isNew = id === 'new';
    _wlCrumbs([['Workout Links', '#workout-links'], [isNew ? 'Add Link' : 'Edit Link']]);
    var el = document.getElementById('page-workout-link');
    el.innerHTML = '<div class="ex-status">Loading…</div>';

    var link = { name: '', url: '', description: '', tags: [], favorite: false, doneLog: [] };
    try {
        await _wlLoadLinks();   // for the tag suggestions
        if (!isNew) {
            var doc = await userCol('workoutLinks').doc(id).get();
            if (!doc.exists) { el.innerHTML = '<div class="ex-status">This link was not found.</div>'; return; }
            link = doc.data();
        }
    } catch (err) {
        console.error('Workout Links: failed to load link:', err);
        el.innerHTML = '<div class="ex-status">Could not load the link.</div>';
        return;
    }
    if (isNew && _wlPendingShare) {   // arrived from the phone share sheet
        link.url = _wlPendingShare.url || '';
        link.name = _wlPendingShare.name || '';
        link.description = _wlPendingShare.description || '';
        _wlPendingShare = null;
    }
    _wlEdit = { id: isNew ? null : id, tags: (link.tags || []).slice(), doneLog: link.doneLog || [] };

    el.innerHTML =
        '<div class="page-header"><h2>' + (isNew ? 'Add Workout Link' : 'Edit Workout Link') + '</h2></div>' +
        '<div class="wl-form">' +
            '<div class="form-group">' +
                '<label for="wlUrl">Link <span class="required">*</span></label>' +
                '<div class="wl-url-row">' +
                    '<input type="url" id="wlUrl" placeholder="Paste a reel, YouTube, or web page link" value="' + _woEsc(link.url) + '">' +
                    '<button type="button" class="btn btn-secondary btn-small" id="wlPasteBtn">📋 Paste</button>' +
                '</div>' +
            '</div>' +
            '<div class="form-group">' +
                '<label for="wlName">Name <span class="required">*</span></label>' +
                '<input type="text" id="wlName" placeholder="e.g. 20-min band upper body" value="' + _woEsc(link.name) + '">' +
            '</div>' +
            '<div class="form-group">' +
                '<label for="wlDesc">Description</label>' +
                '<textarea id="wlDesc" rows="3" placeholder="What it is, why you liked it">' + _woEsc(link.description) + '</textarea>' +
            '</div>' +
            '<div class="form-group">' +
                '<label for="wlTagInput">Tags</label>' +
                '<div id="wlTagsOn" class="wl-tag-chips"></div>' +
                '<div class="wl-url-row">' +
                    '<input type="text" id="wlTagInput" placeholder="Type a tag, e.g. cardio, bands" autocomplete="off">' +
                    '<button type="button" class="btn btn-secondary btn-small" id="wlTagAddBtn">Add</button>' +
                '</div>' +
                '<div id="wlTagSuggest" class="wl-tag-chips wl-tag-suggest"></div>' +
            '</div>' +
            '<label class="wo-inline-check"><input type="checkbox" id="wlFav"' + (link.favorite ? ' checked' : '') + '> ★ Favorite (shows on top of the list)</label>' +
            '<div class="wl-form-buttons">' +
                '<button type="button" class="btn btn-primary" id="wlSaveBtn">Save</button>' +
                '<a href="#workout-links" class="btn btn-secondary">Cancel</a>' +
                (isNew ? '' : '<button type="button" class="btn btn-danger" id="wlDeleteBtn">Delete</button>') +
            '</div>' +
        '</div>' +
        (isNew ? '' :
            '<div class="wl-done-section">' +
                '<div class="wl-done-head"><h3>Times done</h3><button type="button" class="btn btn-primary btn-small" id="wlDidBtn">✓ Did it</button></div>' +
                '<div id="wlDoneList"></div>' +
            '</div>');

    document.getElementById('wlPasteBtn').addEventListener('click', _wlPasteUrl);
    document.getElementById('wlTagAddBtn').addEventListener('click', _wlAddTagFromInput);
    document.getElementById('wlTagInput').addEventListener('keydown', function(ev) {
        if (ev.key === 'Enter' || ev.key === ',') { ev.preventDefault(); _wlAddTagFromInput(); }
    });
    document.getElementById('wlTagInput').addEventListener('input', _wlRenderTagEditor);
    document.getElementById('wlTagsOn').addEventListener('click', function(ev) {
        var b = ev.target.closest('[data-remove]');
        if (!b) return;
        _wlEdit.tags = _wlEdit.tags.filter(function(t) { return t !== b.getAttribute('data-remove'); });
        _wlRenderTagEditor();
    });
    document.getElementById('wlTagSuggest').addEventListener('click', function(ev) {
        var b = ev.target.closest('[data-add]');
        if (!b) return;
        _wlAddTag(b.getAttribute('data-add'));
        document.getElementById('wlTagInput').value = '';
        _wlRenderTagEditor();
    });
    document.getElementById('wlSaveBtn').addEventListener('click', _wlSave);
    if (!isNew) {
        document.getElementById('wlDeleteBtn').addEventListener('click', _wlDelete);
        document.getElementById('wlDidBtn').addEventListener('click', function() { wlOpenDidIt(id); });
        document.getElementById('wlDoneList').addEventListener('click', function(ev) {
            var b = ev.target.closest('[data-del-done]');
            if (b) _wlDeleteDone(b.getAttribute('data-del-done'));
        });
        _wlRenderDoneList();
    }
    _wlRenderTagEditor();
    if (isNew && !link.url) document.getElementById('wlUrl').focus();
}

async function _wlPasteUrl() {
    try {
        var text = await navigator.clipboard.readText();
        var m = (text || '').match(/https?:\/\/\S+/);
        document.getElementById('wlUrl').value = m ? m[0] : (text || '').trim();
        if (!document.getElementById('wlName').value.trim()) document.getElementById('wlName').focus();
    } catch (err) {
        alert('Could not read the clipboard. Long-press the Link box and choose Paste instead.');
    }
}

function _wlAddTag(raw) {
    var t = _wlCleanTag(raw);
    if (t && _wlEdit.tags.indexOf(t) === -1) _wlEdit.tags.push(t);
}

/** "cardio, bands" in the box → two tags. */
function _wlAddTagFromInput() {
    var input = document.getElementById('wlTagInput');
    input.value.split(',').forEach(_wlAddTag);
    input.value = '';
    _wlRenderTagEditor();
    input.focus();
}

/** Tags on this link (tap ✕ to remove) + existing tags to tap-add, narrowed by what's typed. */
function _wlRenderTagEditor() {
    document.getElementById('wlTagsOn').innerHTML = _wlEdit.tags.length
        ? _wlEdit.tags.map(function(t) {
            return '<span class="wl-chip wl-chip--on">' + _woEsc(t) + ' <button type="button" class="wl-chip-x" data-remove="' + _woEsc(t) + '" title="Remove">✕</button></span>';
          }).join('')
        : '<span class="wl-hint">No tags — this link shows under "No tags".</span>';
    var typed = _wlCleanTag(document.getElementById('wlTagInput').value);
    var others = _wlAllTags(_wlLinks).map(function(x) { return x.tag; }).filter(function(t) {
        return _wlEdit.tags.indexOf(t) === -1 && (!typed || t.indexOf(typed) !== -1);
    });
    document.getElementById('wlTagSuggest').innerHTML = others.length
        ? '<span class="wl-hint">Tap to add:</span>' + others.map(function(t) {
            return '<button type="button" class="wl-chip" data-add="' + _woEsc(t) + '">+ ' + _woEsc(t) + '</button>';
          }).join('')
        : (typed ? '<span class="wl-hint">New tag — tap Add.</span>' : '');
}

async function _wlSave() {
    var url = _wlCleanUrl(document.getElementById('wlUrl').value);
    var name = document.getElementById('wlName').value.trim();
    if (!url) { alert('Please enter the link.'); return; }
    if (!name) { alert('Please give the link a name.'); return; }
    // A tag typed but not "Added" still counts
    var pending = document.getElementById('wlTagInput').value;
    if (pending.trim()) pending.split(',').forEach(_wlAddTag);

    var data = {
        url: url,
        name: name,
        description: document.getElementById('wlDesc').value.trim(),
        tags: _wlEdit.tags.slice().sort(),
        favorite: document.getElementById('wlFav').checked
    };
    var btn = document.getElementById('wlSaveBtn');
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
        if (_wlEdit.id) {
            await userCol('workoutLinks').doc(_wlEdit.id).update(data);
        } else {
            data.doneLog = [];
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await userCol('workoutLinks').add(data);
        }
        location.hash = '#workout-links';
    } catch (err) {
        console.error('Workout Links: save failed:', err);
        alert('Failed to save. Please try again.');
        btn.disabled = false; btn.textContent = 'Save';
    }
}

async function _wlDelete() {
    if (!confirm('Delete this link? Its Fitness activities stay in your Activities list.')) return;
    try {
        await userCol('workoutLinks').doc(_wlEdit.id).delete();
        location.hash = '#workout-links';
    } catch (err) {
        console.error('Workout Links: delete failed:', err);
        alert('Failed to delete. Please try again.');
    }
}

function _wlRenderDoneList() {
    var wrap = document.getElementById('wlDoneList');
    if (!wrap) return;
    var log = _wlEdit.doneLog.slice().sort(function(a, b) { return b.date.localeCompare(a.date); });
    if (!log.length) { wrap.innerHTML = '<div class="wl-hint">Not done yet. Opening the link doesn\'t count — tap ✓ Did it after you do the workout.</div>'; return; }
    wrap.innerHTML = log.map(function(e) {
        var bits = [_wlFmtDate(e.date)];
        if (e.minutes) bits.push(e.minutes + ' min');
        return '<div class="wl-done-row">' +
                   '<div><strong>' + _woEsc(bits.join(' · ')) + '</strong>' + (e.note ? '<div class="wo-card-meta">' + _woEsc(e.note) + '</div>' : '') + '</div>' +
                   '<button type="button" class="btn btn-secondary btn-small" data-del-done="' + _woEsc(e.id) + '">Delete</button>' +
               '</div>';
    }).join('');
}

/** Removes one "done" entry and the Fitness activity it created. */
async function _wlDeleteDone(entryId) {
    var entry = _wlEdit.doneLog.find(function(e) { return e.id === entryId; });
    if (!entry) return;
    if (!confirm('Delete this entry? The matching Fitness activity is deleted too.')) return;
    try {
        var log = _wlEdit.doneLog.filter(function(e) { return e.id !== entryId; });
        await userCol('workoutLinks').doc(_wlEdit.id).update({ doneLog: log });
        if (entry.activityId) {
            try { await userCol('exerciseActivities').doc(entry.activityId).delete(); }
            catch (e2) { console.warn('Workout Links: could not delete the activity:', e2); }
        }
        _wlEdit.doneLog = log;
        _wlRenderDoneList();
    } catch (err) {
        console.error('Workout Links: delete entry failed:', err);
        alert('Failed to delete. Please try again.');
    }
}

// ─── "✓ Did it" dialog (#wlDidModal in index.html) ───────────────────────────

function wlOpenDidIt(linkId) {
    _wlDidLinkId = linkId;
    var link = _wlLinks.find(function(l) { return l.id === linkId; });
    document.getElementById('wlDidTitle').textContent = '✓ Did it: ' + (link ? link.name : '');
    document.getElementById('wlDidDate').value = _woTodayISO();
    document.getElementById('wlDidMinutes').value = '';
    document.getElementById('wlDidNote').value = '';
    var btn = document.getElementById('wlDidSaveBtn');
    btn.disabled = false; btn.textContent = 'Save';
    openModal('wlDidModal');
}

/** Saves the done entry on the link, then creates the "Workout" Fitness activity. */
async function wlSaveDidIt() {
    var date = document.getElementById('wlDidDate').value;
    if (!date) { alert('Please pick the date.'); return; }
    var minRaw = document.getElementById('wlDidMinutes').value.trim();
    var minutes = minRaw ? parseFloat(minRaw) : null;
    if (minRaw && (isNaN(minutes) || minutes <= 0)) { alert('Minutes must be a number above 0.'); return; }
    var note = document.getElementById('wlDidNote').value.trim();

    var btn = document.getElementById('wlDidSaveBtn');
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
        var ref = userCol('workoutLinks').doc(_wlDidLinkId);
        var doc = await ref.get();
        if (!doc.exists) throw new Error('link not found');
        var link = doc.data();

        var activityId = null;
        try {
            var typeId = await _woWorkoutTypeId();   // workout-player.js
            if (typeId) {
                var act = await userCol('exerciseActivities').add({
                    typeId:          typeId,
                    activityDate:    _woLocalDateTime(date, Date.now()),
                    durationMinutes: minutes,
                    miles: null, runMiles: null, withDogs: null, calories: null,
                    comment:         note,
                    workoutName:     link.name,          // Activities list shows "Workout: <name>"
                    workoutLinkId:   _wlDidLinkId,
                    createdAt:       firebase.firestore.FieldValue.serverTimestamp()
                });
                activityId = act.id;
            }
        } catch (e2) {
            console.error('Workout Links: could not create the Fitness activity:', e2);
        }

        var entry = { id: String(Date.now()), date: date, minutes: minutes, note: note, activityId: activityId };
        await ref.update({ doneLog: firebase.firestore.FieldValue.arrayUnion(entry) });

        // Keep whichever page is open in step
        var cached = _wlLinks.find(function(l) { return l.id === _wlDidLinkId; });
        if (cached) cached.doneLog = (cached.doneLog || []).concat([entry]);
        if (_wlEdit && _wlEdit.id === _wlDidLinkId) { _wlEdit.doneLog = _wlEdit.doneLog.concat([entry]); _wlRenderDoneList(); }
        _wlRenderList();
        closeModal('wlDidModal');
        if (!activityId) alert('Saved, but the Fitness activity could not be created.');
    } catch (err) {
        console.error('Workout Links: did-it save failed:', err);
        alert('Failed to save. Please try again.');
        btn.disabled = false; btn.textContent = 'Save';
    }
}

// ─── Manage tags (#workout-link-tags) ────────────────────────────────────────

async function loadWorkoutLinkTagsPage() {
    _wlCrumbs([['Workout Links', '#workout-links'], ['Manage tags']]);
    var el = document.getElementById('page-workout-link-tags');
    el.innerHTML = '<div class="ex-status">Loading…</div>';
    try {
        await _wlLoadLinks();
    } catch (err) {
        console.error('Workout Links: failed to load tags:', err);
        el.innerHTML = '<div class="ex-status">Could not load tags.</div>';
        return;
    }
    var tags = _wlAllTags(_wlLinks);
    el.innerHTML =
        '<div class="page-header"><h2>Manage Tags</h2></div>' +
        '<p class="wl-hint">Tags are added when you save them on a link. Renaming or deleting a tag changes every link that has it.</p>' +
        (tags.length
            ? tags.map(function(t) {
                return '<div class="wl-done-row">' +
                           '<div><strong>' + _woEsc(t.tag) + '</strong> <span class="wo-card-meta">' + t.count + ' link' + (t.count === 1 ? '' : 's') + '</span></div>' +
                           '<div class="wl-row-btns">' +
                               '<button type="button" class="btn btn-secondary btn-small" data-rename="' + _woEsc(t.tag) + '">Rename</button>' +
                               '<button type="button" class="btn btn-danger btn-small" data-deltag="' + _woEsc(t.tag) + '">Delete</button>' +
                           '</div>' +
                       '</div>';
              }).join('')
            : '<div class="ex-status">No tags yet.</div>');
    el.onclick = function(ev) {
        var r = ev.target.closest('[data-rename]');
        if (r) { _wlRenameTag(r.getAttribute('data-rename')); return; }
        var d = ev.target.closest('[data-deltag]');
        if (d) _wlDeleteTag(d.getAttribute('data-deltag'));
    };
}

/** Rewrites the tag on every link that has it; newTag null = delete. Renaming onto an existing tag merges them. */
async function _wlRewriteTag(oldTag, newTag) {
    var batch = db.batch();
    var n = 0;
    _wlLinks.forEach(function(l) {
        var tags = l.tags || [];
        if (tags.indexOf(oldTag) === -1) return;
        var next = tags.filter(function(t) { return t !== oldTag; });
        if (newTag && next.indexOf(newTag) === -1) next.push(newTag);
        batch.update(userCol('workoutLinks').doc(l.id), { tags: next.sort() });
        n++;
    });
    if (n) await batch.commit();
}

async function _wlRenameTag(oldTag) {
    var raw = prompt('Rename tag "' + oldTag + '" to:', oldTag);
    if (raw == null) return;
    var newTag = _wlCleanTag(raw);
    if (!newTag || newTag === oldTag) return;
    try {
        await _wlRewriteTag(oldTag, newTag);
        loadWorkoutLinkTagsPage();
    } catch (err) {
        console.error('Workout Links: rename tag failed:', err);
        alert('Failed to rename. Please try again.');
    }
}

async function _wlDeleteTag(tag) {
    if (!confirm('Delete tag "' + tag + '"? It is removed from every link (the links stay).')) return;
    try {
        await _wlRewriteTag(tag, null);
        loadWorkoutLinkTagsPage();
    } catch (err) {
        console.error('Workout Links: delete tag failed:', err);
        alert('Failed to delete. Please try again.');
    }
}

// ─── Phone share sheet ───────────────────────────────────────────────────────

/**
 * Called by bucketShareCheck (bucketlist-links.js) when a link (no screenshot) is shared to the app:
 * asks whether it goes to Web Links, Workout Links, or the Bucket List. onBucket() opens the Bucket List dialog.
 */
function wlAskShareDestination(shared, onBucket) {
    document.getElementById('wlShareUrl').textContent = shared.url || shared.name || '';
    document.getElementById('wlShareWorkoutBtn').onclick = function() {
        _wlCloseModalThen('wlShareModal', function() {
            _wlPendingShare = shared;
            if (location.hash === '#workout-link/new') loadWorkoutLinkPage('new');
            else location.hash = '#workout-link/new';
        });
    };
    document.getElementById('wlShareBucketBtn').onclick = function() {
        _wlCloseModalThen('wlShareModal', onBucket);
    };
    document.getElementById('wlShareWebBtn').onclick = function() {   // web-links.js
        _wlCloseModalThen('wlShareModal', function() { webStartSharedLink(shared); });
    };
    openModal('wlShareModal');
}

/**
 * closeModal() steps browser history back (the modal pushed an entry for the Android back button).
 * That back step finishes later and would undo a hash change made right away — so wait for it.
 */
function _wlCloseModalThen(modalId, fn) {
    var willGoBack = history.state && history.state.modal === modalId;
    if (willGoBack) {
        window.addEventListener('popstate', function once() {
            window.removeEventListener('popstate', once);
            setTimeout(fn, 0);
        });
    }
    closeModal(modalId);
    if (!willGoBack) fn();
}
