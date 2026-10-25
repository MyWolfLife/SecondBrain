// ============================================================
// web-links.js — Life → Web Links
// A catch-all list of saved web links (recipes, things to buy, woodworking builds, …).
// Same idea as Fitness → Workout Links (workout-links.js), minus "Did it", plus one category per link.
//
// Pages:
//   #web-links         list: search box, category chips, tag chips (Any / All), favorites first, sort menu
//   #web-link/new      add a link    (#web-link/:id = edit)
//   #web-link-manage   rename / delete categories and tags across every link
//
// Firestore (per-user, userCol): webLinks
//   { name, url, description, category ('' = none), tags[] (lowercase), favorite (bool), createdAt }
//
// Like Workout Links there is no separate category or tag collection: the lists are whatever is in
// use on some link, so a new one appears as soon as it is saved on a link.
//
// Shared helpers come from workout-links.js: _wlCleanTag, _wlCleanUrl, _wlHost, _wlIcon,
// _wlAllTags, _wlCloseModalThen, WL_NO_TAGS. _woEsc is from workouts.js.
// ============================================================

var WEB_NO_CATEGORY = '__none__';   // the "No category" filter chip

var _webLinks = [];             // every link, loaded by the list page
var _webFilter = {              // list filters — kept while you move around the app
    text: '',
    category: '',               // '' = all, WEB_NO_CATEGORY, or a category name
    tags: [],                   // selected tag chips (or [WL_NO_TAGS])
    match: 'any',               // 'any' | 'all' when more than one tag is picked
    sort: 'newest'              // 'newest' | 'oldest' | 'name' | 'category'
};
var _webEdit = null;            // the link being edited { id|null, tags[] }
var _webPendingShare = null;    // {url, name, description} from the phone share sheet, used by #web-link/new

// ─── Small helpers ───────────────────────────────────────────────────────────

function _webCrumbs(crumbs) {
    var html = '<a href="#life">Life</a>';
    crumbs.forEach(function(c) {
        html += '<span class="separator">&rsaquo;</span>' +
                (c[1] ? '<a href="' + c[1] + '">' + c[0] + '</a>' : '<span>' + c[0] + '</span>');
    });
    window.scrollTo(0, 0);
    document.getElementById('breadcrumbBar').innerHTML = html;
    document.getElementById('headerTitle').innerHTML =
        '<a href="#main" class="home-link">' + (window.appName || 'My Life') + '</a>';
}

/** Categories keep the case the user typed ("Woodworking"), trimmed. */
function _webCleanCategory(c) {
    return String(c || '').trim().replace(/\s+/g, ' ');
}

/** Every category in use, A–Z, with how many links are in it. Matching ignores case. */
function _webAllCategories(links) {
    var counts = {};
    links.forEach(function(l) { if (l.category) counts[l.category] = (counts[l.category] || 0) + 1; });
    return Object.keys(counts).sort(function(a, b) { return a.toLowerCase().localeCompare(b.toLowerCase()); })
        .map(function(c) { return { category: c, count: counts[c] }; });
}

/** If a category with the same letters (any case) already exists, use that spelling. */
function _webMatchCategory(c) {
    c = _webCleanCategory(c);
    var hit = _webAllCategories(_webLinks).find(function(x) { return x.category.toLowerCase() === c.toLowerCase(); });
    return hit ? hit.category : c;
}

async function _webLoadLinks() {
    var snap = await userCol('webLinks').get();
    _webLinks = snap.docs.map(function(d) { var l = d.data(); l.id = d.id; return l; });
}

// ─── List page (#web-links) ──────────────────────────────────────────────────

async function loadWebLinksPage() {
    _webCrumbs([['Web Links']]);
    var el = document.getElementById('page-web-links');
    el.innerHTML = '<div class="page-header"><h2>Web Links</h2></div><div class="ex-status">Loading…</div>';
    try {
        await _webLoadLinks();
    } catch (err) {
        console.error('Web Links: failed to load:', err);
        el.innerHTML = '<div class="page-header"><h2>Web Links</h2></div><div class="ex-status">Could not load links.</div>';
        return;
    }
    // Drop selections that no longer exist (renamed / deleted)
    var cats = _webAllCategories(_webLinks).map(function(c) { return c.category; });
    if (_webFilter.category && _webFilter.category !== WEB_NO_CATEGORY && cats.indexOf(_webFilter.category) === -1) _webFilter.category = '';
    var known = _wlAllTags(_webLinks).map(function(t) { return t.tag; });
    _webFilter.tags = _webFilter.tags.filter(function(t) { return t === WL_NO_TAGS || known.indexOf(t) !== -1; });

    el.innerHTML =
        '<div class="page-header">' +
            '<h2>Web Links</h2>' +
            '<div class="page-header-actions">' +
                '<a href="#web-link-manage" class="btn btn-secondary">🏷️ Categories &amp; tags</a> ' +
                '<a href="#web-link/new" class="btn btn-primary">+ Add Link</a>' +
            '</div>' +
        '</div>' +
        '<div class="ex-toolbar">' +
            '<div class="ex-toolbar-row">' +
                '<input type="search" id="webText" class="filter-input" placeholder="Search name, description, or link…" value="' + _woEsc(_webFilter.text) + '">' +
                '<select id="webSort" class="wl-sort" title="Sort (favorites always stay on top)">' +
                    '<option value="newest">Newest added</option>' +
                    '<option value="oldest">Oldest added</option>' +
                    '<option value="name">Name A–Z</option>' +
                    '<option value="category">Category</option>' +
                '</select>' +
            '</div>' +
            '<div class="ex-toolbar-row"><span class="wl-row-label">Category</span><div id="webCatChips" class="wl-tag-chips"></div></div>' +
            '<div class="ex-toolbar-row"><span class="wl-row-label">Tags</span><div id="webTagChips" class="wl-tag-chips"></div></div>' +
        '</div>' +
        '<div id="webCount" class="wl-count"></div>' +
        '<div id="webList"></div>';

    document.getElementById('webSort').value = _webFilter.sort;
    document.getElementById('webText').addEventListener('input', function() { _webFilter.text = this.value; _webRenderList(); });
    document.getElementById('webSort').addEventListener('change', function() { _webFilter.sort = this.value; _webRenderList(); });
    document.getElementById('webCatChips').addEventListener('click', _webOnCatClick);
    document.getElementById('webTagChips').addEventListener('click', _webOnTagClick);
    document.getElementById('webList').addEventListener('click', _webOnListClick);
    _webRenderChips();
    _webRenderList();
}

function _webChip(attr, value, label, on) {
    return '<button type="button" class="wl-chip' + (on ? ' wl-chip--on' : '') + '" ' + attr + '="' + _woEsc(value) + '">' + _woEsc(label) + '</button>';
}

function _webRenderChips() {
    // Category row: pick one
    var cat = _webFilter.category;
    var html = _webChip('data-cat', '', 'All', !cat);
    _webAllCategories(_webLinks).forEach(function(c) { html += _webChip('data-cat', c.category, c.category + ' (' + c.count + ')', cat === c.category); });
    var noCat = _webLinks.filter(function(l) { return !l.category; }).length;
    html += _webChip('data-cat', WEB_NO_CATEGORY, 'No category (' + noCat + ')', cat === WEB_NO_CATEGORY);
    document.getElementById('webCatChips').innerHTML = html;

    // Tag row: pick several, Any / All
    var sel = _webFilter.tags;
    html = _webChip('data-tag', '', 'All', !sel.length);
    _wlAllTags(_webLinks).forEach(function(t) { html += _webChip('data-tag', t.tag, t.tag + ' (' + t.count + ')', sel.indexOf(t.tag) !== -1); });
    var untagged = _webLinks.filter(function(l) { return !(l.tags || []).length; }).length;
    html += _webChip('data-tag', WL_NO_TAGS, 'No tags (' + untagged + ')', sel.indexOf(WL_NO_TAGS) !== -1);
    if (sel.filter(function(t) { return t !== WL_NO_TAGS; }).length > 1) {
        html += '<span class="wl-match">Match: ' +
            '<button type="button" class="wl-match-btn' + (_webFilter.match === 'any' ? ' wl-match-btn--on' : '') + '" data-match="any">Any</button>' +
            '<button type="button" class="wl-match-btn' + (_webFilter.match === 'all' ? ' wl-match-btn--on' : '') + '" data-match="all">All</button>' +
        '</span>';
    }
    document.getElementById('webTagChips').innerHTML = html;
}

function _webOnCatClick(ev) {
    var c = ev.target.closest('[data-cat]');
    if (!c) return;
    var cat = c.getAttribute('data-cat');
    _webFilter.category = (_webFilter.category === cat) ? '' : cat;   // tap again to clear
    _webRenderChips();
    _webRenderList();
}

function _webOnTagClick(ev) {
    var m = ev.target.closest('[data-match]');
    if (m) { _webFilter.match = m.getAttribute('data-match'); _webRenderChips(); _webRenderList(); return; }
    var c = ev.target.closest('[data-tag]');
    if (!c) return;
    var tag = c.getAttribute('data-tag');
    var sel = _webFilter.tags;
    if (!tag) {
        sel = [];                                                    // All
    } else if (tag === WL_NO_TAGS) {
        sel = sel.indexOf(WL_NO_TAGS) !== -1 ? [] : [WL_NO_TAGS];    // "No tags" stands alone
    } else {
        sel = sel.filter(function(t) { return t !== WL_NO_TAGS; });
        var i = sel.indexOf(tag);
        if (i === -1) sel.push(tag); else sel.splice(i, 1);
    }
    _webFilter.tags = sel;
    _webRenderChips();
    _webRenderList();
}

/** The links that pass the search box, category and tag chips, sorted (favorites first). */
function _webFiltered() {
    var text = _webFilter.text.trim().toLowerCase();
    var cat = _webFilter.category;
    var sel = _webFilter.tags;
    var rows = _webLinks.filter(function(l) {
        if (cat === WEB_NO_CATEGORY) { if (l.category) return false; }
        else if (cat && l.category !== cat) return false;
        var tags = l.tags || [];
        if (sel.length) {
            if (sel[0] === WL_NO_TAGS) {
                if (tags.length) return false;
            } else if (_webFilter.match === 'all') {
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
    var byName = function(a, b) { return (a.name || '').localeCompare(b.name || ''); };
    rows.sort(function(a, b) {
        if (!!a.favorite !== !!b.favorite) return a.favorite ? -1 : 1;
        switch (_webFilter.sort) {
            case 'name':     return byName(a, b);
            case 'oldest':   return created(a) - created(b);
            case 'category': // no category last
                if (!a.category !== !b.category) return a.category ? -1 : 1;
                return (a.category || '').toLowerCase().localeCompare((b.category || '').toLowerCase()) || byName(a, b);
            default:         return created(b) - created(a);
        }
    });
    return rows;
}

function _webRenderList() {
    var list = document.getElementById('webList');
    if (!list) return;
    var rows = _webFiltered();
    document.getElementById('webCount').textContent = _webLinks.length
        ? rows.length + ' of ' + _webLinks.length + ' link' + (_webLinks.length === 1 ? '' : 's') : '';
    if (!rows.length) {
        list.innerHTML = '<div class="ex-status">' + (_webLinks.length
            ? 'No links match.'
            : 'No links yet. Tap <strong>+ Add Link</strong> to save a recipe, something to buy, a project idea…') + '</div>';
        return;
    }
    list.innerHTML = rows.map(function(l) {
        return '<div class="wo-card wl-card">' +
                   '<div class="wo-thumb">' + _wlIcon(l.url) + '</div>' +
                   '<div class="wo-card-main">' +
                       '<div class="wo-card-name">' +
                           '<button type="button" class="wl-star' + (l.favorite ? ' wl-star--on' : '') + '" data-star="' + l.id + '" title="Favorite (shows on top)">' + (l.favorite ? '★' : '☆') + '</button> ' +
                           _woEsc(l.name) +
                       '</div>' +
                       '<div class="wo-badges">' +
                           (l.category ? '<span class="web-cat-badge">' + _woEsc(l.category) + '</span>' : '') +
                           '<span class="wo-card-meta">' + _woEsc(_wlHost(l.url)) + '</span>' +
                       '</div>' +
                       (l.description ? '<div class="wo-card-meta wl-desc">' + _woEsc(l.description) + '</div>' : '') +
                       ((l.tags || []).length ? '<div class="wo-chips">' + l.tags.map(function(t) { return '<span class="wo-chip wo-chip--also">' + _woEsc(t) + '</span>'; }).join('') + '</div>' : '') +
                       '<div class="wl-card-actions">' +
                           '<a class="btn btn-primary btn-small" href="' + _woEsc(l.url) + '" target="_blank" rel="noopener">Open ↗</a>' +
                           '<a class="btn btn-secondary btn-small" href="#web-link/' + l.id + '">Edit</a>' +
                       '</div>' +
                   '</div>' +
               '</div>';
    }).join('');
}

async function _webOnListClick(ev) {
    var star = ev.target.closest('[data-star]');
    if (!star) return;
    var link = _webLinks.find(function(l) { return l.id === star.getAttribute('data-star'); });
    if (!link) return;
    link.favorite = !link.favorite;
    _webRenderList();
    try {
        await userCol('webLinks').doc(link.id).update({ favorite: link.favorite });
    } catch (err) {
        console.error('Web Links: favorite failed:', err);
        link.favorite = !link.favorite;
        _webRenderList();
        alert('Could not save the favorite. Please try again.');
    }
}

// ─── Add / edit page (#web-link/new, #web-link/:id) ──────────────────────────

async function loadWebLinkPage(id) {
    var isNew = id === 'new';
    _webCrumbs([['Web Links', '#web-links'], [isNew ? 'Add Link' : 'Edit Link']]);
    var el = document.getElementById('page-web-link');
    el.innerHTML = '<div class="ex-status">Loading…</div>';

    var link = { name: '', url: '', description: '', category: '', tags: [], favorite: false };
    try {
        await _webLoadLinks();   // for the category list and tag suggestions
        if (!isNew) {
            var doc = await userCol('webLinks').doc(id).get();
            if (!doc.exists) { el.innerHTML = '<div class="ex-status">This link was not found.</div>'; return; }
            link = doc.data();
        }
    } catch (err) {
        console.error('Web Links: failed to load link:', err);
        el.innerHTML = '<div class="ex-status">Could not load the link.</div>';
        return;
    }
    if (isNew && _webPendingShare) {   // arrived from the phone share sheet
        link.url = _webPendingShare.url || '';
        link.name = _webPendingShare.name || '';
        link.description = _webPendingShare.description || '';
        _webPendingShare = null;
    }
    // A new link starts in the category the list is filtered to (handy when adding several recipes)
    if (isNew && !link.category && _webFilter.category && _webFilter.category !== WEB_NO_CATEGORY) link.category = _webFilter.category;
    _webEdit = { id: isNew ? null : id, tags: (link.tags || []).slice() };

    var catOptions = '<option value="">(No category)</option>' +
        _webAllCategories(_webLinks).map(function(c) {
            return '<option value="' + _woEsc(c.category) + '"' + (c.category === link.category ? ' selected' : '') + '>' + _woEsc(c.category) + '</option>';
        }).join('') +
        '<option value="__new__">+ New category…</option>';

    el.innerHTML =
        '<div class="page-header"><h2>' + (isNew ? 'Add Web Link' : 'Edit Web Link') + '</h2></div>' +
        '<div class="wl-form">' +
            '<div class="form-group">' +
                '<label for="webUrl">Link <span class="required">*</span></label>' +
                '<div class="wl-url-row">' +
                    '<input type="url" id="webUrl" placeholder="Paste a link" value="' + _woEsc(link.url) + '">' +
                    '<button type="button" class="btn btn-secondary btn-small" id="webPasteBtn">📋 Paste</button>' +
                '</div>' +
            '</div>' +
            '<div class="form-group">' +
                '<label for="webName">Name <span class="required">*</span></label>' +
                '<input type="text" id="webName" placeholder="e.g. Crockpot chicken tacos" value="' + _woEsc(link.name) + '">' +
            '</div>' +
            '<div class="form-group">' +
                '<label for="webCat">Category</label>' +
                '<select id="webCat">' + catOptions + '</select>' +
                '<input type="text" id="webCatNew" class="hidden" placeholder="New category, e.g. Woodworking" style="margin-top:8px;">' +
            '</div>' +
            '<div class="form-group">' +
                '<label for="webDesc">Description</label>' +
                '<textarea id="webDesc" rows="3" placeholder="What it is, why you saved it">' + _woEsc(link.description) + '</textarea>' +
            '</div>' +
            '<div class="form-group">' +
                '<label for="webTagInput">Tags</label>' +
                '<div id="webTagsOn" class="wl-tag-chips"></div>' +
                '<div class="wl-url-row">' +
                    '<input type="text" id="webTagInput" placeholder="Type a tag, e.g. chicken, crockpot" autocomplete="off">' +
                    '<button type="button" class="btn btn-secondary btn-small" id="webTagAddBtn">Add</button>' +
                '</div>' +
                '<div id="webTagSuggest" class="wl-tag-chips wl-tag-suggest"></div>' +
            '</div>' +
            '<label class="wo-inline-check"><input type="checkbox" id="webFav"' + (link.favorite ? ' checked' : '') + '> ★ Favorite (shows on top of the list)</label>' +
            '<div class="wl-form-buttons">' +
                '<button type="button" class="btn btn-primary" id="webSaveBtn">Save</button>' +
                '<a href="#web-links" class="btn btn-secondary">Cancel</a>' +
                (isNew ? '' : '<button type="button" class="btn btn-danger" id="webDeleteBtn">Delete</button>') +
            '</div>' +
        '</div>';

    document.getElementById('webCat').addEventListener('change', function() {
        var isNewCat = this.value === '__new__';
        document.getElementById('webCatNew').classList.toggle('hidden', !isNewCat);
        if (isNewCat) document.getElementById('webCatNew').focus();
    });
    document.getElementById('webPasteBtn').addEventListener('click', async function() {
        try {
            var text = await navigator.clipboard.readText();
            var m = (text || '').match(/https?:\/\/\S+/);
            document.getElementById('webUrl').value = m ? m[0] : (text || '').trim();
            if (!document.getElementById('webName').value.trim()) document.getElementById('webName').focus();
        } catch (err) {
            alert('Could not read the clipboard. Long-press the Link box and choose Paste instead.');
        }
    });
    document.getElementById('webTagAddBtn').addEventListener('click', _webAddTagFromInput);
    document.getElementById('webTagInput').addEventListener('keydown', function(ev) {
        if (ev.key === 'Enter' || ev.key === ',') { ev.preventDefault(); _webAddTagFromInput(); }
    });
    document.getElementById('webTagInput').addEventListener('input', _webRenderTagEditor);
    document.getElementById('webTagsOn').addEventListener('click', function(ev) {
        var b = ev.target.closest('[data-remove]');
        if (!b) return;
        _webEdit.tags = _webEdit.tags.filter(function(t) { return t !== b.getAttribute('data-remove'); });
        _webRenderTagEditor();
    });
    document.getElementById('webTagSuggest').addEventListener('click', function(ev) {
        var b = ev.target.closest('[data-add]');
        if (!b) return;
        _webAddTag(b.getAttribute('data-add'));
        document.getElementById('webTagInput').value = '';
        _webRenderTagEditor();
    });
    document.getElementById('webSaveBtn').addEventListener('click', _webSave);
    if (!isNew) document.getElementById('webDeleteBtn').addEventListener('click', _webDelete);
    _webRenderTagEditor();
    if (isNew && !link.url) document.getElementById('webUrl').focus();
}

function _webAddTag(raw) {
    var t = _wlCleanTag(raw);
    if (t && _webEdit.tags.indexOf(t) === -1) _webEdit.tags.push(t);
}

function _webAddTagFromInput() {
    var input = document.getElementById('webTagInput');
    input.value.split(',').forEach(_webAddTag);
    input.value = '';
    _webRenderTagEditor();
    input.focus();
}

/** Tags on this link (tap ✕ to remove) + existing tags to tap-add, narrowed by what's typed. */
function _webRenderTagEditor() {
    document.getElementById('webTagsOn').innerHTML = _webEdit.tags.length
        ? _webEdit.tags.map(function(t) {
            return '<span class="wl-chip wl-chip--on">' + _woEsc(t) + ' <button type="button" class="wl-chip-x" data-remove="' + _woEsc(t) + '" title="Remove">✕</button></span>';
          }).join('')
        : '<span class="wl-hint">No tags — this link shows under "No tags".</span>';
    var typed = _wlCleanTag(document.getElementById('webTagInput').value);
    var others = _wlAllTags(_webLinks).map(function(x) { return x.tag; }).filter(function(t) {
        return _webEdit.tags.indexOf(t) === -1 && (!typed || t.indexOf(typed) !== -1);
    });
    document.getElementById('webTagSuggest').innerHTML = others.length
        ? '<span class="wl-hint">Tap to add:</span>' + others.map(function(t) {
            return '<button type="button" class="wl-chip" data-add="' + _woEsc(t) + '">+ ' + _woEsc(t) + '</button>';
          }).join('')
        : (typed ? '<span class="wl-hint">New tag — tap Add.</span>' : '');
}

async function _webSave() {
    var url = _wlCleanUrl(document.getElementById('webUrl').value);
    var name = document.getElementById('webName').value.trim();
    if (!url) { alert('Please enter the link.'); return; }
    if (!name) { alert('Please give the link a name.'); return; }
    var category = document.getElementById('webCat').value;
    if (category === '__new__') {
        category = _webMatchCategory(document.getElementById('webCatNew').value);
        if (!category) { alert('Please type the new category, or pick one from the list.'); return; }
    }
    var pending = document.getElementById('webTagInput').value;   // a tag typed but not "Added" still counts
    if (pending.trim()) pending.split(',').forEach(_webAddTag);

    var data = {
        url: url,
        name: name,
        description: document.getElementById('webDesc').value.trim(),
        category: category,
        tags: _webEdit.tags.slice().sort(),
        favorite: document.getElementById('webFav').checked
    };
    var btn = document.getElementById('webSaveBtn');
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
        if (_webEdit.id) {
            await userCol('webLinks').doc(_webEdit.id).update(data);
        } else {
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await userCol('webLinks').add(data);
        }
        location.hash = '#web-links';
    } catch (err) {
        console.error('Web Links: save failed:', err);
        alert('Failed to save. Please try again.');
        btn.disabled = false; btn.textContent = 'Save';
    }
}

async function _webDelete() {
    if (!confirm('Delete this link?')) return;
    try {
        await userCol('webLinks').doc(_webEdit.id).delete();
        location.hash = '#web-links';
    } catch (err) {
        console.error('Web Links: delete failed:', err);
        alert('Failed to delete. Please try again.');
    }
}

// ─── Categories & tags (#web-link-manage) ────────────────────────────────────

async function loadWebLinkManagePage() {
    _webCrumbs([['Web Links', '#web-links'], ['Categories & tags']]);
    var el = document.getElementById('page-web-link-manage');
    el.innerHTML = '<div class="ex-status">Loading…</div>';
    try {
        await _webLoadLinks();
    } catch (err) {
        console.error('Web Links: failed to load:', err);
        el.innerHTML = '<div class="ex-status">Could not load.</div>';
        return;
    }
    var row = function(kind, value, count) {
        return '<div class="wl-done-row">' +
                   '<div><strong>' + _woEsc(value) + '</strong> <span class="wo-card-meta">' + count + ' link' + (count === 1 ? '' : 's') + '</span></div>' +
                   '<div class="wl-row-btns">' +
                       '<button type="button" class="btn btn-secondary btn-small" data-rename-' + kind + '="' + _woEsc(value) + '">Rename</button>' +
                       '<button type="button" class="btn btn-danger btn-small" data-del-' + kind + '="' + _woEsc(value) + '">Delete</button>' +
                   '</div>' +
               '</div>';
    };
    var cats = _webAllCategories(_webLinks);
    var tags = _wlAllTags(_webLinks);
    el.innerHTML =
        '<div class="page-header"><h2>Categories &amp; Tags</h2></div>' +
        '<p class="wl-hint">Categories and tags are added when you save them on a link. Renaming or deleting one changes every link that has it.</p>' +
        '<h3 class="web-manage-head">Categories</h3>' +
        (cats.length ? cats.map(function(c) { return row('cat', c.category, c.count); }).join('') : '<div class="wl-hint">No categories yet.</div>') +
        '<h3 class="web-manage-head">Tags</h3>' +
        (tags.length ? tags.map(function(t) { return row('tag', t.tag, t.count); }).join('') : '<div class="wl-hint">No tags yet.</div>');
    el.onclick = function(ev) {
        var b;
        if ((b = ev.target.closest('[data-rename-cat]'))) _webRename('cat', b.getAttribute('data-rename-cat'));
        else if ((b = ev.target.closest('[data-del-cat]'))) _webRemove('cat', b.getAttribute('data-del-cat'));
        else if ((b = ev.target.closest('[data-rename-tag]'))) _webRename('tag', b.getAttribute('data-rename-tag'));
        else if ((b = ev.target.closest('[data-del-tag]'))) _webRemove('tag', b.getAttribute('data-del-tag'));
    };
}

/**
 * Rewrites a category or tag on every link that has it. newValue '' / null = delete.
 * Renaming onto an existing name merges them.
 */
async function _webRewrite(kind, oldValue, newValue) {
    var batch = db.batch();
    var n = 0;
    _webLinks.forEach(function(l) {
        var ref = userCol('webLinks').doc(l.id);
        if (kind === 'cat') {
            if (l.category !== oldValue) return;
            batch.update(ref, { category: newValue || '' });
        } else {
            var tags = l.tags || [];
            if (tags.indexOf(oldValue) === -1) return;
            var next = tags.filter(function(t) { return t !== oldValue; });
            if (newValue && next.indexOf(newValue) === -1) next.push(newValue);
            batch.update(ref, { tags: next.sort() });
        }
        n++;
    });
    if (n) await batch.commit();
}

async function _webRename(kind, oldValue) {
    var label = kind === 'cat' ? 'category' : 'tag';
    var raw = prompt('Rename ' + label + ' "' + oldValue + '" to:', oldValue);
    if (raw == null) return;
    var newValue = kind === 'cat' ? _webMatchCategory(raw) : _wlCleanTag(raw);
    if (!newValue || newValue === oldValue) return;
    try {
        await _webRewrite(kind, oldValue, newValue);
        loadWebLinkManagePage();
    } catch (err) {
        console.error('Web Links: rename failed:', err);
        alert('Failed to rename. Please try again.');
    }
}

async function _webRemove(kind, value) {
    var msg = kind === 'cat'
        ? 'Delete category "' + value + '"? Its links stay, with no category.'
        : 'Delete tag "' + value + '"? It is removed from every link (the links stay).';
    if (!confirm(msg)) return;
    try {
        await _webRewrite(kind, value, null);
        loadWebLinkManagePage();
    } catch (err) {
        console.error('Web Links: delete failed:', err);
        alert('Failed to delete. Please try again.');
    }
}

// ─── Phone share sheet ───────────────────────────────────────────────────────

/** Called by the share chooser (wlAskShareDestination in workout-links.js) for "🔗 Web Links". */
function webStartSharedLink(shared) {
    _webPendingShare = shared;
    if (location.hash === '#web-link/new') loadWebLinkPage('new');
    else location.hash = '#web-link/new';
}
