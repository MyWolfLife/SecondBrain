// ============================================================
// sharethought.js — sharing My Thoughts (Shared Thoughts, chunk T2)
//
// Thoughts → My Thoughts (views, with their history) can be shared one thought at a time ('thought') or all
// at once ('allThoughts', all four types together):
//
//   shares/{shareId}: kind 'thought' | 'allThoughts', thoughtId (single only), title, shareGroups,
//                     viewerUids, editorUids, names
//   shares/{shareId}/views/{id}                          the thought(s) (same IDs as private)
//   shares/{shareId}/views/{id}/history/{hid}            their earlier versions
//   shares/{shareId}/viewCategories/{id}                 categories (all: every one, moved; single: a COPY of
//   shares/{shareId}/viewCategories/{id}/subcategories/{sid}   the thought's category, so the recipient sees real names)
//
// views.js reads and writes through thCol(name) (queries: private + the thought shares I own) and thRef(name, id)
// (the real document reference, wherever the document lives), exactly like memories use memCol / mmRef.
// Thoughts shared WITH me are reachable by id the same way and are listed by thSharedWithMe().
// ============================================================

var TH_COLS = ['views', 'viewCategories'];

var _thOwn     = {};      // {shareId: {data}}   thought shares I own
var _thWithMe  = {};      // {shareId: {role, ownerName, data}}   thought shares shared with me
var _thIdx     = _thEmptyIdx();   // {collection: {docId: shareId}}
function _thEmptyIdx() { var o = {}; TH_COLS.forEach(function(c) { o[c] = {}; }); return o; }
var _thLoadedAt = 0;
var _thLoading  = null;
var _viewNewShareId = null;   // set by "+ New thought in …" in someone's shared thoughts: where the next new thought goes

function _thIsKind(s) { return s.kind === 'thought' || s.kind === 'allThoughts'; }

/** Finds my thought shares and which share each shared document lives in (cached ~5 min; force=true after a change). */
async function thLoad(force) {
    if (!force && _thLoadedAt && Date.now() - _thLoadedAt < 300000) return;
    if (_thLoading) return _thLoading;
    _thLoading = (async function() {
        try {
            var mine   = (await shLoadMyShares()).filter(_thIsKind);
            var withMe = (await shLoadSharedWithMe()).filter(_thIsKind);
            var own = {}, wm = {};
            mine.forEach(function(s) { own[s.id] = { data: s.data }; });
            withMe.forEach(function(s) { wm[s.id] = { role: s.role, ownerName: s.ownerName, data: s.data }; });
            var idx = _thEmptyIdx();
            var ids = Object.keys(own).concat(Object.keys(wm));
            for (var i = 0; i < ids.length; i++) {
                for (var c = 0; c < TH_COLS.length; c++) {
                    try {
                        var snap = await shareCol(ids[i], TH_COLS[c]).get();
                        snap.docs.forEach(function(d) { idx[TH_COLS[c]][d.id] = ids[i]; });
                    } catch (err) { console.warn('thLoad: could not read', TH_COLS[c], 'of a thought share:', err.message); }
                }
            }
            _thOwn = own; _thWithMe = wm; _thIdx = idx; _thLoadedAt = Date.now();
        } finally { _thLoading = null; }
    })();
    return _thLoading;
}

function thShareOf(thoughtId)  { return _thIdx.views[thoughtId] || null; }
/** 'owner' (mine, private or shared) | 'edit' | 'view'. */
function thRoleFor(thoughtId) {
    var sid = thShareOf(thoughtId);
    if (!sid) return 'owner';
    if (_thOwn[sid]) return 'owner';
    return _thWithMe[sid] ? _thWithMe[sid].role : 'owner';
}
/** Info about the share a thought lives in, or null. */
function thInfo(thoughtId) {
    var sid = thShareOf(thoughtId);
    if (!sid) return null;
    return _thOwn[sid] ? { shareId: sid, role: 'owner', data: _thOwn[sid].data }
                       : { shareId: sid, role: _thWithMe[sid].role, ownerName: _thWithMe[sid].ownerName, data: _thWithMe[sid].data };
}
/** The share of kind 'thought' that holds exactly this thought (the one I shared), or null. */
function thShareIdOfRoot(thoughtId) {
    var ids = Object.keys(_thOwn);
    for (var i = 0; i < ids.length; i++) if (_thOwn[ids[i]].data.kind === 'thought' && _thOwn[ids[i]].data.thoughtId === thoughtId) return ids[i];
    return null;
}
/** The share ID of my "all thoughts" share, or null. */
function thOwnAllShareId() {
    var ids = Object.keys(_thOwn);
    for (var i = 0; i < ids.length; i++) if (_thOwn[ids[i]].data.kind === 'allThoughts') return ids[i];
    return null;
}

// ---------- thCol / thRef: thoughts' collections, private + my shares ----------

function _thCol(name, sid) { return sid ? shareCol(sid, name) : userCol(name); }

/** The real document reference (sync; needs thLoad done): a thought's history / a category's subcategories hang off it. */
function thRef(name, id) { return _thCol(name, _thIdx[name][id] || null).doc(id); }

/** A new top-level document reference: in my "all thoughts" share when I have one (new thoughts and categories join it). */
function thNewRef(name) {
    var sid = thOwnAllShareId();
    var ref = _thCol(name, sid).doc();
    if (sid) _thIdx[name][ref.id] = sid;
    return ref;
}

function _ThQuery(name, ops) { this.name = name; this.ops = ops; }
['where', 'orderBy', 'limit'].forEach(function(m) {
    _ThQuery.prototype[m] = function() { return new _ThQuery(this.name, this.ops.concat([{ t: m, a: Array.prototype.slice.call(arguments) }])); };
});
_ThQuery.prototype._on = function(col) {
    var q = col;
    this.ops.forEach(function(op) { q = q[op.t].apply(q, op.a); });
    return q;
};
/** Runs the query on my private data and on every thought share I own; merges the results like one snapshot (same id once). */
_ThQuery.prototype.get = async function() {
    await thLoad();
    var self = this;
    var sids = Object.keys(_thOwn);
    var sources = [self._on(userCol(self.name))].concat(sids.map(function(sid) { return self._on(shareCol(sid, self.name)); }));
    var results = await Promise.all(sources.map(function(q) { return q.get(); }));
    var docs = [], seen = {};
    results.forEach(function(r) { r.docs.forEach(function(d) { if (!seen[d.id]) { seen[d.id] = true; docs.push(d); } }); });
    var order = self.ops.filter(function(o) { return o.t === 'orderBy'; })[0];
    if (order && results.length > 1) {
        var f = order.a[0], dir = order.a[1] === 'desc' ? -1 : 1;
        docs.sort(function(a, b) { var x = a.data()[f], y = b.data()[f]; return (x < y ? -1 : x > y ? 1 : 0) * dir; });
    }
    var lim = self.ops.filter(function(o) { return o.t === 'limit'; })[0];
    if (lim && results.length > 1) docs = docs.slice(0, lim.a[0]);
    return { docs: docs, size: docs.length, empty: docs.length === 0,
             forEach: function(fn) { docs.forEach(fn); }, metadata: { fromCache: false } };
};
/** A new document: in my "all thoughts" share when I have one, otherwise private. */
_ThQuery.prototype.add = async function(data) {
    await thLoad();
    var sid = thOwnAllShareId();
    var ref = await _thCol(this.name, sid).add(data);
    if (sid) _thIdx[this.name][ref.id] = sid;
    return ref;
};

/** Use instead of userCol('views' | 'viewCategories') for queries. */
function thCol(name) { return new _ThQuery(name, []); }

/** Reads one document wherever it lives (private, a share I own, or one shared with me): a snapshot (maybe not exists). */
async function thDocGet(name, id) {
    await thLoad();
    if (_thIdx[name][id]) return thRef(name, id).get();
    var priv = userCol(name).doc(id);
    var snap = await priv.get();
    if (snap.exists || !(Object.keys(_thOwn).length + Object.keys(_thWithMe).length)) return snap;
    await thLoad(true);                                     // maybe added to a share since the last load
    return _thIdx[name][id] ? thRef(name, id).get() : snap;
}

/** Thoughts other people shared with me: [{id, data, shareId, role, ownerName, kind}] (a shared thought, or all of someone's). */
async function thSharedWithMe() {
    await thLoad();
    var out = [];
    var ids = Object.keys(_thWithMe);
    for (var i = 0; i < ids.length; i++) {
        var w = _thWithMe[ids[i]];
        try {
            var docs = [];
            if (w.data.kind === 'allThoughts') docs = (await shareCol(ids[i], 'views').get()).docs;
            else { var d = await shareCol(ids[i], 'views').doc(w.data.thoughtId).get(); if (d.exists) docs = [d]; }
            docs.forEach(function(d) {
                out.push({ id: d.id, data: d.data(), shareId: ids[i], role: w.role, ownerName: w.ownerName, kind: w.data.kind });
            });
        } catch (err) { console.warn('Could not read a shared thought:', err); }
    }
    return out;
}

/** Counts for the Thoughts landing page: {own, shared}. */
async function thCounts() {
    var own = (await thCol('views').get()).size;
    var shared = (await thSharedWithMe()).length;
    return { own: own, shared: shared };
}

/**
 * Category documents for a type, in display order: [{id, ref, data()}] — mine (private + shares I own), or with
 * opts.shareId the categories living in that share too (opts.only = only that share's, for adding to someone's all-thoughts share).
 */
async function thCatDocs(opts) {
    opts = opts || {};
    await thLoad();
    var docs = [], seen = {};
    function take(snap) { snap.docs.forEach(function(d) { if (!seen[d.id]) { seen[d.id] = true; docs.push(d); } }); }
    if (opts.shareId) take(await shareCol(opts.shareId, 'viewCategories').get());
    if (!opts.only) take(await thCol('viewCategories').get());
    return docs;
}

// ---------- Screen controls ----------

/** Detail page: Share… button, the "Shared …" badge, and the View-only look. */
function thRenderDetailControls(id) {
    var box = document.getElementById('viewDetailContent');
    if (!box) return;
    var info = thInfo(id);
    var role = thRoleFor(id);
    var ro = role === 'view';
    window._viewReadOnly = ro;
    box.classList.toggle('th-viewonly', ro);
    ['viewTitleInput', 'viewShortInput', 'viewLongInput'].forEach(function(eid) {
        var el = document.getElementById(eid);
        if (el) el.readOnly = ro;
    });
    ['viewMajorCatSelect', 'viewSubCatSelect'].forEach(function(eid) {
        var el = document.getElementById(eid);
        if (el && ro) el.disabled = true;
    });

    var actions = box.querySelector('.view-header-actions');
    var del = actions && actions.querySelector('.btn-danger');
    if (del) del.style.display = role === 'owner' ? '' : 'none';

    if (actions) {
        var shareBtn = document.getElementById('viewShareBtn');
        if (!shareBtn) {
            shareBtn = document.createElement('button');
            shareBtn.className = 'btn btn-secondary btn-small';
            shareBtn.id = 'viewShareBtn';
            actions.insertBefore(shareBtn, del || null);
        }
        var inAll = info && info.data.kind === 'allThoughts';
        shareBtn.style.display = (role === 'owner' && !inAll) ? '' : 'none';
        shareBtn.textContent = info ? 'Sharing…' : 'Share…';
        shareBtn.onclick = function() {
            shOpenThoughtShareDialog(id, (document.getElementById('viewTitleInput') || {}).value || 'this thought');
        };
        if (info) {
            var badge = document.createElement('span');
            badge.className = 'views-history-badge';
            badge.style.marginLeft = '8px';
            badge.textContent = info.role === 'owner' ? '👥 Shared'
                : '👥 Shared by ' + info.ownerName + ' · ' + (info.role === 'edit' ? 'Can edit' : 'View only');
            actions.appendChild(badge);
        }
    }
}

/** Earlier-version page: the View-only look. */
function thRenderHistoryControls(viewId) {
    var box = document.getElementById('viewHistoryContent');
    if (!box) return;
    var role = thRoleFor(viewId);
    box.classList.toggle('th-viewonly', role === 'view');
    var del = box.querySelector('.btn-danger');
    if (del && role !== 'owner') del.style.display = 'none';
}

/** List page: the "Share all…" button next to + New Thought. */
function thRenderListControls() {
    var addBtn = document.querySelector('#page-views .page-header-actions .btn-primary');
    var btn = document.getElementById('viewsShareAllBtn');
    if (addBtn && !btn) {
        btn = document.createElement('button');
        btn.className = 'btn btn-secondary';
        btn.id = 'viewsShareAllBtn';
        btn.onclick = function() { shOpenAllThoughtsShareDialog(); };
        addBtn.parentNode.insertBefore(btn, addBtn);
    }
    if (btn) thLoad().then(function() { btn.textContent = thOwnAllShareId() ? 'Sharing all…' : 'Share all…'; });
}

/** List page: the "Shared with me" block above my thoughts, for the current type tab. */
async function thRenderSharedWithMe(thoughtType) {
    var wrap = document.getElementById('viewsSharedWrap');
    if (!wrap) {
        var acc = document.getElementById('viewsAccordion');
        if (!acc) return;
        wrap = document.createElement('div');
        wrap.id = 'viewsSharedWrap';
        acc.parentNode.insertBefore(wrap, acc);
    }
    var all = await thSharedWithMe();
    var items = all.filter(function(t) { return t.data.thoughtType === thoughtType; })
        .sort(function(a, b) { return (a.data.title || '').localeCompare(b.data.title || ''); });
    var newBtns = '';
    Object.keys(_thWithMe).forEach(function(sid) {
        var w = _thWithMe[sid];
        if (w.data.kind === 'allThoughts' && w.role === 'edit') {
            newBtns += '<button class="btn btn-secondary btn-small" style="margin:0 8px 8px 0;" onclick="thNewInShare(\'' + sid + '\')">+ New thought in ' + escapeHtml(w.ownerName) + '’s thoughts</button>';
        }
    });
    if (!items.length && !newBtns) { wrap.innerHTML = ''; return; }
    var html = '<h3 class="section-heading">Shared with me</h3>' + newBtns;
    items.forEach(function(t) {
        var d = t.data;
        html += '<a href="#view/' + t.id + '" class="views-card">' +
            '<div class="views-card-header"><span class="views-card-title">' + escapeHtml(d.title || '(Untitled)') + '</span>' +
            '<span class="views-card-date">' + escapeHtml(_viewFormatDate(d.currentDate || d.createdAt)) + '</span></div>' +
            (d.shortVersion ? '<p class="views-card-short">' + escapeHtml(d.shortVersion) + '</p>' : '') +
            '<div class="views-card-footer"><span class="views-history-badge">👥 ' + escapeHtml(t.ownerName) + ' · ' + (t.role === 'edit' ? 'Can edit' : 'View only') + '</span></div>' +
        '</a>';
    });
    if (items.length) html += '<h3 class="section-heading">My thoughts</h3>';
    wrap.innerHTML = html;
}

function thNewInShare(shareId) {
    _viewNewShareId = shareId;
    window.location.hash = '#view/new';
}

/** After sharing / stopping / changing who: show the same page again. */
async function _thAfterShareChange() {
    await thLoad(true);
    var page = document.getElementById('page-view');
    if (page && !page.classList.contains('hidden') && typeof _viewId !== 'undefined' && _viewId) loadViewDetailPage(_viewId);
    else loadViewsPage();
}

// ---------- Moving thoughts into / out of a share ----------

function _thStamp() { return new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16); }
function _thBackupName(name) { return 'Bishop_Thought_' + (name || 'Thought').replace(/[^A-Za-z0-9]+/g, '_') + '_Backup_' + _thStamp() + '.json'; }

/**
 * Reads thoughts (+ history) and categories (+ subcategories) from `shareId` (or my private data when null).
 * thoughtIds / catIds: null = all of them; otherwise just those ids (missing ones skipped).
 */
async function thRead(shareId, thoughtIds, catIds) {
    var col = function(n) { return shareId ? shareCol(shareId, n) : userCol(n); };
    async function pick(name, ids) {
        if (!ids) return (await col(name).get()).docs;
        var out = [];
        for (var i = 0; i < ids.length; i++) { var d = await col(name).doc(ids[i]).get(); if (d.exists) out.push(d); }
        return out;
    }
    var views = await pick('views', thoughtIds), history = [];
    for (var i = 0; i < views.length; i++) history = history.concat((await views[i].ref.collection('history').get()).docs);
    var cats = await pick('viewCategories', catIds), subs = [];
    for (var j = 0; j < cats.length; j++) subs = subs.concat((await cats[j].ref.collection('subcategories').get()).docs);
    return { views: views, history: history, cats: cats, subs: subs };
}
/** The id of the thought / category a history / subcategory document hangs off, or null for a top-level document. */
function _thParentId(d) { var p = d.ref.parent.id; return (p === 'history' || p === 'subcategories') ? d.ref.parent.parent.id : null; }
function _thCounts(b) { return { views: b.views.length, history: b.history.length, cats: b.cats.length, subs: b.subs.length }; }
/** [{ref, data}] writing the bundle into `destShareId` (or private when null); skipCats leaves the categories out. */
function _thOps(b, destShareId, skipCats) {
    var col = function(n) { return _thCol(n, destShareId); };
    var ops = [];
    b.views.forEach(function(d) { ops.push({ ref: col('views').doc(d.id), data: d.data() }); });
    b.history.forEach(function(d) { ops.push({ ref: col('views').doc(d.ref.parent.parent.id).collection('history').doc(d.id), data: d.data() }); });
    if (!skipCats) {
        b.cats.forEach(function(d) { ops.push({ ref: col('viewCategories').doc(d.id), data: d.data() }); });
        b.subs.forEach(function(d) { ops.push({ ref: col('viewCategories').doc(d.ref.parent.parent.id).collection('subcategories').doc(d.id), data: d.data() }); });
    }
    return ops;
}
function _thRefs(b, withCats) {
    var all = [].concat(b.views, b.history, withCats ? b.cats : [], withCats ? b.subs : []);
    return all.map(function(d) { return d.ref; });
}
function _thJson(b, kind) {
    function rows(docs) { return docs.map(function(d) { return { id: d.id, parentId: _thParentId(d), data: backupSerialize(d.data()) }; }); }
    return { version: 1, type: 'thoughts-' + kind, exportedAt: new Date().toISOString(),
             views: rows(b.views), history: rows(b.history), viewCategories: rows(b.cats), subcategories: rows(b.subs) };
}

/** Deletes everything in a thought share (nested documents first), then optionally the share document. */
async function thPurgeShare(shareId, alsoShareDoc) {
    for (var c = 0; c < TH_COLS.length; c++) {
        var sub = c === 0 ? 'history' : 'subcategories';
        var snap = await shareCol(shareId, TH_COLS[c]).get();
        for (var i = 0; i < snap.docs.length; i++) {
            var kids = await snap.docs[i].ref.collection(sub).get();
            await shBatchDelete(kids.docs.map(function(d) { return d.ref; }));
        }
        await shBatchDelete(snap.docs.map(function(d) { return d.ref; }));
    }
    if (alsoShareDoc) await topCol('shares').doc(shareId).delete();
}

/** Share one thought (with its history and a copy of its category) with the groups in `shareGroups` (owner). Returns the share ID. */
async function thShareThought(thoughtId, shareGroups) {
    await thLoad(true);
    if (thOwnAllShareId() && thShareOf(thoughtId) === thOwnAllShareId()) throw new Error('This thought is already included in your "all thoughts" share.');
    var me = _shMyUid();
    var groups = await _shLoadGroups();
    var flat = shFlatten(shareGroups, groups, me, await shGetMyName());

    _shProgress('Reading the thought…');
    var one = await userCol('views').doc(thoughtId).get();
    if (!one.exists) throw new Error('That thought no longer exists.');
    var catId = one.data().categoryId;
    var b = await thRead(null, [thoughtId], catId ? [catId] : []);
    var name = one.data().title || 'Thought';

    _shProgress('Saving a backup file…');
    backupDownload(_thBackupName(name), _thJson(b, 'before-share'));

    var shareId = db.collection('shares').doc().id;
    var created = false;
    try {
        _shProgress('Creating the shared area…');
        await topCol('shares').doc(shareId).set({
            ownerUid: me, kind: 'thought', title: name, thoughtId: thoughtId,
            shareGroups: shareGroups, viewerUids: flat.viewerUids, editorUids: flat.editorUids, names: flat.names,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        created = true;
        await shBatchSet(_thOps(b, shareId, false), function(n, total) { _shProgress('Copying… ' + n + ' of ' + total); });

        _shProgress('Checking the copy…');
        var check = await thRead(shareId, null, null);
        if (JSON.stringify(_thCounts(check)) !== JSON.stringify(_thCounts(b))) {
            throw new Error('The copy does not match the original (' + JSON.stringify(_thCounts(check)) + ' instead of ' + JSON.stringify(_thCounts(b)) + ').');
        }
    } catch (err) {
        console.error('thShareThought failed, rolling back:', err);
        _shProgress('Something went wrong — undoing. Your thought has not been changed.', true);
        if (created) { try { await thPurgeShare(shareId, true); } catch (e2) { console.error('rollback failed:', e2); } }
        throw err;
    }

    try {
        _shProgress('Removing the private copy…');
        await shBatchDelete(_thRefs(b, false));      // the category stays in my private list too
    } catch (err) {
        console.error('Could not remove the private original:', err);
        throw new Error('Shared, but the private copy could not be fully removed (' + err.message + '). Nothing is lost; open My Thoughts and try again, or tell the developer.');
    }
    await thLoad(true);
    return shareId;
}

/** Stop sharing one thought (owner): it, its history and any changes others made come back to my private data. */
async function thUnshareThought(shareId) {
    var entry = _thOwn[shareId];
    if (!entry) throw new Error('That is not one of your shared thoughts.');
    var thoughtId = entry.data.thoughtId;

    _shProgress('Reading the shared thought…');
    var b = await thRead(shareId, null, null);
    var name = (b.views[0] && b.views[0].data().title) || 'Thought';

    _shProgress('Saving a backup file…');
    backupDownload(_thBackupName(name), _thJson(b, 'before-unshare'));

    // The category copy goes back only if my private category is gone
    var needCats = false;
    if (b.cats[0]) needCats = !(await userCol('viewCategories').doc(b.cats[0].id).get()).exists;
    var ops = _thOps(b, null, !needCats);
    try {
        await shBatchSet(ops, function(n, total) { _shProgress('Moving back… ' + n + ' of ' + total); });
        _shProgress('Checking the copy…');
        var check = await thRead(null, [thoughtId], null);
        if (check.views.length !== 1 || check.history.length !== b.history.length) throw new Error('The copy does not match.');
    } catch (err) {
        console.error('thUnshareThought failed, rolling back:', err);
        _shProgress('Something went wrong — undoing. The thought is still shared.', true);
        try { await shBatchDelete(ops.map(function(o) { return o.ref; })); } catch (e2) { console.error('rollback failed:', e2); }
        throw err;
    }
    _shProgress('Removing the shared copy…');
    await thPurgeShare(shareId, true);
    await thLoad(true);
}

/** After the owner deleted a shared thought: remove what is left in its share (the category copy) and the share document. */
async function thFinishDelete(thoughtId) {
    var sid = thShareIdOfRoot(thoughtId);
    if (!sid) return;
    await thPurgeShare(sid, true);
    await thLoad(true);
}

/** Share all thoughts (every type, with history and all categories) with the groups in `shareGroups` (owner). Returns the share ID. */
async function thShareAll(shareGroups) {
    await thLoad(true);
    if (thOwnAllShareId()) throw new Error('You already share all your thoughts.');
    var me = _shMyUid();
    var groups = await _shLoadGroups();
    var flat = shFlatten(shareGroups, groups, me, await shGetMyName());

    _shProgress('Reading your thoughts…');
    var b = await thRead(null, null, null);

    _shProgress('Saving a backup file…');
    backupDownload(_thBackupName('All_thoughts'), _thJson(b, 'before-share'));

    var shareId = db.collection('shares').doc().id;
    var created = false;
    try {
        _shProgress('Creating the shared area…');
        await topCol('shares').doc(shareId).set({
            ownerUid: me, kind: 'allThoughts', title: 'All thoughts',
            shareGroups: shareGroups, viewerUids: flat.viewerUids, editorUids: flat.editorUids, names: flat.names,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        created = true;
        await shBatchSet(_thOps(b, shareId, false), function(n, total) { _shProgress('Copying… ' + n + ' of ' + total); });

        _shProgress('Checking the copy…');
        var check = await thRead(shareId, null, null);
        if (JSON.stringify(_thCounts(check)) !== JSON.stringify(_thCounts(b))) {
            throw new Error('The copy does not match the original (' + JSON.stringify(_thCounts(check)) + ' instead of ' + JSON.stringify(_thCounts(b)) + ').');
        }
    } catch (err) {
        console.error('thShareAll failed, rolling back:', err);
        _shProgress('Something went wrong — undoing. Your thoughts have not been changed.', true);
        if (created) { try { await thPurgeShare(shareId, true); } catch (e2) { console.error('rollback failed:', e2); } }
        throw err;
    }

    try {
        _shProgress('Removing the private copies…');
        await shBatchDelete(_thRefs(b, true));
    } catch (err) {
        console.error('Could not remove the private originals:', err);
        throw new Error('Shared, but the private copies could not be fully removed (' + err.message + '). Nothing is lost; open My Thoughts and try again, or tell the developer.');
    }
    await thLoad(true);
    return shareId;
}

/** Stop sharing all thoughts (owner): everything, including what others added or changed, comes back to my private data. */
async function thUnshareAll(shareId) {
    if (!_thOwn[shareId]) throw new Error('That is not your all-thoughts share.');
    _shProgress('Reading the shared thoughts…');
    var b = await thRead(shareId, null, null);

    _shProgress('Saving a backup file…');
    backupDownload(_thBackupName('All_thoughts'), _thJson(b, 'before-unshare'));

    var ops = _thOps(b, null, false);
    try {
        await shBatchSet(ops, function(n, total) { _shProgress('Moving back… ' + n + ' of ' + total); });
        _shProgress('Checking the copy…');
        var check = await thRead(null, null, null), want = _thCounts(b), got = _thCounts(check);
        if (got.views < want.views || got.history < want.history || got.cats < want.cats || got.subs < want.subs) throw new Error('The copy does not match.');
    } catch (err) {
        console.error('thUnshareAll failed, rolling back:', err);
        _shProgress('Something went wrong — undoing. Your thoughts are still shared.', true);
        try { await shBatchDelete(ops.map(function(o) { return o.ref; })); } catch (e2) { console.error('rollback failed:', e2); }
        throw err;
    }
    _shProgress('Removing the shared copy…');
    await thPurgeShare(shareId, true);
    await thLoad(true);
}

// ---------- Backup and restore of my shared thoughts ----------
// Added to the Data backup file as the extra key sharedThoughts: one entry per thought share I own, with every
// document in it (history and subcategories included). Restored as PRIVATE data, skipping anything still shared.

async function thBackupShared() {
    await thLoad(true);
    var ids = Object.keys(_thOwn);
    if (!ids.length) return null;
    var out = [];
    for (var i = 0; i < ids.length; i++) {
        var sid = ids[i], data = _thOwn[sid].data;
        var b = await thRead(sid, null, null);
        var rows = function(docs) { return docs.map(function(d) { return { id: d.id, parentId: _thParentId(d), data: backupSerialize(d.data()) }; }); };
        out.push({ shareId: sid, kind: data.kind, thoughtId: data.thoughtId || null, share: backupSerialize(data),
                   views: rows(b.views), history: rows(b.history), viewCategories: rows(b.cats), subcategories: rows(b.subs) });
    }
    return out;
}

async function thRestoreShared(payload, log) {
    var list = payload.sharedThoughts || [];
    if (!list.length) return;
    await thLoad(true);
    var restored = 0, skipped = 0;
    for (var i = 0; i < list.length; i++) {
        var e = list[i];
        var stillShared = e.kind === 'allThoughts' ? !!thOwnAllShareId() : (e.thoughtId && !!thShareOf(e.thoughtId));
        if (stillShared) { skipped++; continue; }
        var ops = [];
        e.views.forEach(function(r) { ops.push({ ref: userCol('views').doc(r.id), data: r.data }); });
        e.history.forEach(function(r) { ops.push({ ref: userCol('views').doc(r.parentId).collection('history').doc(r.id), data: r.data }); });
        e.viewCategories.forEach(function(r) { ops.push({ ref: userCol('viewCategories').doc(r.id), data: r.data }); });
        e.subcategories.forEach(function(r) { ops.push({ ref: userCol('viewCategories').doc(r.parentId).collection('subcategories').doc(r.id), data: r.data }); });
        await shBatchSet(ops);
        restored++;
    }
    if (restored) log('✓ ' + restored + ' shared thought share(s) restored as your private thoughts. Share them again if you want.', '#2e7d32');
    if (skipped) log('• ' + skipped + ' thought share(s) are still shared — left as they are.');
}
