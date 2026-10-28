// ============================================================
// sharememory.js — sharing memories (Shared Thoughts, chunk T1)
//
// Thoughts → Memories can be shared one memory at a time ('memory') or all at once ('allMemories'):
//
//   shares/{shareId}: kind 'memory' | 'allMemories', memoryId (single only), title, shareGroups,
//                     viewerUids, editorUids, names
//   shares/{shareId}/memories/{id}       the memory / memories (same IDs as private)
//   shares/{shareId}/memoryLinks/{id}    links between memories (all: every link whose two ends moved;
//                                        single: none — a link only lives where both memories live)
//   shares/{shareId}/memoryTags/{id}     the tag list (all: every tag, moved; single: copies of the
//                                        tags that memory uses, so the recipient sees real tag pills)
//
// memories.js reads and writes through memCol(name) instead of userCol(name), exactly like contacts use
// pplCol: it looks in my private data AND in the memory shares I own (queries), and sends a single
// document to wherever it lives. Memories shared WITH me are reachable by id the same way, and are
// listed by mmSharedWithMe().
// ============================================================

var MM_COLS = ['memories', 'memoryLinks', 'memoryTags'];

var _mmOwn     = {};      // {shareId: {data}}   memory shares I own
var _mmWithMe  = {};      // {shareId: {role, ownerName, data}}   memory shares shared with me
var _mmIdx     = _mmEmptyIdx();   // {collection: {docId: shareId}}
function _mmEmptyIdx() { var o = {}; MM_COLS.forEach(function(c) { o[c] = {}; }); return o; }
var _mmLoadedAt = 0;
var _mmLoading  = null;
var _memNewShareId = null;   // set by "+ New memory" in someone's shared memories: where the next new memory goes

function _mmIsKind(s) { return s.kind === 'memory' || s.kind === 'allMemories'; }

/** Finds my memory shares and which share each shared document lives in (cached ~5 min; force=true after a change). */
async function mmLoad(force) {
    if (!force && _mmLoadedAt && Date.now() - _mmLoadedAt < 300000) return;
    if (_mmLoading) return _mmLoading;
    _mmLoading = (async function() {
        try {
            var mine   = (await shLoadMyShares()).filter(_mmIsKind);
            var withMe = (await shLoadSharedWithMe()).filter(_mmIsKind);
            var own = {}, wm = {};
            mine.forEach(function(s) { own[s.id] = { data: s.data }; });
            withMe.forEach(function(s) { wm[s.id] = { role: s.role, ownerName: s.ownerName, data: s.data }; });
            var idx = _mmEmptyIdx();
            var ids = Object.keys(own).concat(Object.keys(wm));
            for (var i = 0; i < ids.length; i++) {
                for (var c = 0; c < MM_COLS.length; c++) {
                    try {
                        var snap = await shareCol(ids[i], MM_COLS[c]).get();
                        snap.docs.forEach(function(d) { idx[MM_COLS[c]][d.id] = ids[i]; });
                    } catch (err) { console.warn('mmLoad: could not read', MM_COLS[c], 'of a memory share:', err.message); }
                }
            }
            _mmOwn = own; _mmWithMe = wm; _mmIdx = idx; _mmLoadedAt = Date.now();
        } finally { _mmLoading = null; }
    })();
    return _mmLoading;
}

function mmShareOf(memoryId)   { return _mmIdx.memories[memoryId] || null; }
/** 'owner' (mine, private or shared) | 'edit' | 'view'. */
function mmRoleFor(memoryId) {
    var sid = mmShareOf(memoryId);
    if (!sid) return 'owner';
    if (_mmOwn[sid]) return 'owner';
    return _mmWithMe[sid] ? _mmWithMe[sid].role : 'owner';
}
function mmCanEdit(memoryId)   { return mmRoleFor(memoryId) !== 'view'; }
/** Info about the share a memory lives in, or null. */
function mmInfo(memoryId) {
    var sid = mmShareOf(memoryId);
    if (!sid) return null;
    return _mmOwn[sid] ? { shareId: sid, role: 'owner', data: _mmOwn[sid].data }
                       : { shareId: sid, role: _mmWithMe[sid].role, ownerName: _mmWithMe[sid].ownerName, data: _mmWithMe[sid].data };
}
/** The share of kind 'memory' that holds exactly this memory (the one I shared), or null. */
function mmShareIdOfRoot(memoryId) {
    var ids = Object.keys(_mmOwn);
    for (var i = 0; i < ids.length; i++) if (_mmOwn[ids[i]].data.kind === 'memory' && _mmOwn[ids[i]].data.memoryId === memoryId) return ids[i];
    return null;
}
/** The share ID of my "all memories" share, or null. */
function mmOwnAllShareId() {
    var ids = Object.keys(_mmOwn);
    for (var i = 0; i < ids.length; i++) if (_mmOwn[ids[i]].data.kind === 'allMemories') return ids[i];
    return null;
}

// ---------- memCol: memories' collections, private + my shares ----------

function _mmCol(name, sid) { return sid ? shareCol(sid, name) : userCol(name); }

/** The real document reference for a document that already exists (sync; needs mmLoad done). */
function mmRef(name, id) { return _mmCol(name, _mmIdx[name][id] || null).doc(id); }

/** Which share a NEW memory belongs to: my "all memories" share, if I have one. */
function _mmShareForNew(name) { return name === 'memories' ? (mmOwnAllShareId() || null) : null; }

function _MmQuery(name, ops) { this.name = name; this.ops = ops; }
['where', 'orderBy', 'limit'].forEach(function(m) {
    _MmQuery.prototype[m] = function() { return new _MmQuery(this.name, this.ops.concat([{ t: m, a: Array.prototype.slice.call(arguments) }])); };
});
_MmQuery.prototype._on = function(col) {
    var q = col;
    this.ops.forEach(function(op) { q = q[op.t].apply(q, op.a); });
    return q;
};
/** Runs the query on my private data and on every memory share I own; merges the results like one snapshot. */
_MmQuery.prototype.get = async function() {
    await mmLoad();
    var self = this;
    var sids = Object.keys(_mmOwn);
    // A link query about a memory that was shared WITH me also reads that share
    Object.keys(_mmWithMe).forEach(function(sid) {
        var scoped = self.name === 'memoryLinks' && self.ops.some(function(o) {
            return o.t === 'where' && o.a[0] === 'memoryIds' && o.a[1] === 'array-contains' && _mmIdx.memories[o.a[2]] === sid;
        });
        if (scoped) sids.push(sid);
    });
    var sources = [self._on(userCol(self.name))].concat(sids.map(function(sid) { return self._on(shareCol(sid, self.name)); }));
    var results = await Promise.all(sources.map(function(q) { return q.get(); }));
    var docs = [];
    results.forEach(function(r) { docs = docs.concat(r.docs); });
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
_MmQuery.prototype.add = async function(data) {
    await mmLoad();
    var sid = _mmShareForNew(this.name);
    var ref = await _mmCol(this.name, sid).add(data);
    if (sid) _mmIdx[this.name][ref.id] = sid;
    return ref;
};
_MmQuery.prototype.doc = function(id) {
    if (id === undefined) return userCol(this.name).doc();
    return new _MmDoc(this.name, id);
};

function _MmDoc(name, id) { this.name = name; this.id = id; }
/** Where this document lives: the index knows documents present at the last load; otherwise look in my private data, then in each share. */
_MmDoc.prototype._ref = async function() {
    await mmLoad();
    if (_mmIdx[this.name][this.id]) return mmRef(this.name, this.id);
    var shareIds = Object.keys(_mmOwn).concat(Object.keys(_mmWithMe));
    var priv = userCol(this.name).doc(this.id);
    if (!shareIds.length) return priv;
    if ((await priv.get()).exists) return priv;
    for (var i = 0; i < shareIds.length; i++) {
        try {
            var r = shareCol(shareIds[i], this.name).doc(this.id);
            if ((await r.get()).exists) { _mmIdx[this.name][this.id] = shareIds[i]; return r; }
        } catch (e) { /* not readable: not there */ }
    }
    return priv;
};
_MmDoc.prototype.get    = async function() { return (await this._ref()).get(); };
_MmDoc.prototype.set    = async function() { var r = await this._ref(); return r.set.apply(r, arguments); };
_MmDoc.prototype.update = async function() { var r = await this._ref(); return r.update.apply(r, arguments); };
_MmDoc.prototype.delete = async function() { var r = await this._ref(); var res = await r.delete(); delete _mmIdx[this.name][this.id]; return res; };

/** Use instead of userCol('memories' | 'memoryLinks' | 'memoryTags'). */
function memCol(name) { return new _MmQuery(name, []); }

/** Memories other people shared with me: [{id, data, shareId, role, ownerName, kind}] (a shared memory, or all of someone's). */
async function mmSharedWithMe() {
    await mmLoad();
    var out = [];
    var ids = Object.keys(_mmWithMe);
    for (var i = 0; i < ids.length; i++) {
        var w = _mmWithMe[ids[i]];
        try {
            var docs = [];
            if (w.data.kind === 'allMemories') docs = (await shareCol(ids[i], 'memories').get()).docs;
            else { var d = await shareCol(ids[i], 'memories').doc(w.data.memoryId).get(); if (d.exists) docs = [d]; }
            docs.forEach(function(d) {
                out.push({ id: d.id, data: d.data(), shareId: ids[i], role: w.role, ownerName: w.ownerName, kind: w.data.kind });
            });
        } catch (err) { console.warn('Could not read a shared memory:', err); }
    }
    return out;
}

/** Counts for the Thoughts landing page: {own, shared}. */
async function mmCounts() {
    var own = (await memCol('memories').get()).size;
    var shared = (await mmSharedWithMe()).length;
    return { own: own, shared: shared };
}

/** Tag names usable on this memory: my tags (private + shares I own) plus the tags of the share it lives in. */
async function mmTagNames(memoryId) {
    var names = {};
    (await memCol('memoryTags').get()).forEach(function(d) { names[d.data().name] = true; });
    var sid = mmShareOf(memoryId);
    if (sid && _mmWithMe[sid]) {
        (await shareCol(sid, 'memoryTags').get()).forEach(function(d) { names[d.data().name] = true; });
    }
    return Object.keys(names).sort();
}

/** Where a new tag created while editing this memory goes: its share, or private. */
function mmTagCol(memoryId) { return _mmCol('memoryTags', mmShareOf(memoryId)); }

// ---------- Screen controls ----------

/** Edit page: Share… button, the "Shared …" badge, and the View-only look. */
function mmRenderEditControls(memoryId) {
    var page = document.getElementById('page-memory-edit');
    var info = mmInfo(memoryId);
    var role = mmRoleFor(memoryId);
    var ro = role === 'view';
    window._memReadOnly = ro;
    if (page) page.classList.toggle('mm-viewonly', ro);
    ['memoryEditTitle', 'memoryEditDateText', 'memoryEditLocation', 'memoryEditBody'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.readOnly = ro;
    });
    var ip = document.getElementById('memoryEditInProgress');
    if (ip) ip.disabled = ro;

    var del = document.getElementById('memoryEditDelete');
    if (del) del.style.display = role === 'owner' ? '' : 'none';
    var cancel = document.getElementById('memoryEditCancel');
    if (cancel) cancel.style.display = ro ? 'none' : '';

    var shareBtn = document.getElementById('memoryShareBtn');
    if (!shareBtn && del) {
        shareBtn = document.createElement('button');
        shareBtn.className = 'btn btn-secondary';
        shareBtn.id = 'memoryShareBtn';
        del.parentNode.insertBefore(shareBtn, del);
    }
    if (shareBtn) {
        var inAll = info && info.data.kind === 'allMemories';
        shareBtn.style.display = (role === 'owner' && !inAll) ? '' : 'none';
        shareBtn.textContent = info ? 'Sharing…' : 'Share…';
        shareBtn.onclick = function() {
            shOpenMemoryShareDialog(memoryId, (document.getElementById('memoryEditTitle') || {}).value || 'this memory');
        };
    }

    var badge = document.getElementById('memoryShareBadge');
    if (!badge) {
        badge = document.createElement('span');
        badge.id = 'memoryShareBadge';
        badge.className = 'memory-in-progress-tag';
        var row = page && page.querySelector('.memory-edit-header-row');
        if (row) row.insertBefore(badge, row.firstChild.nextSibling);
    }
    if (info) {
        badge.textContent = info.role === 'owner' ? '👥 Shared'
            : '👥 Shared by ' + info.ownerName + ' · ' + (info.role === 'edit' ? 'Can edit' : 'View only');
        badge.style.display = '';
    } else {
        badge.style.display = 'none';
    }
}

/** List page: the "Share all…" button next to + New Memory. */
function mmRenderListControls() {
    var addBtn = document.getElementById('addMemoryBtn');
    var btn = document.getElementById('memoriesShareAllBtn');
    if (addBtn && !btn) {
        btn = document.createElement('button');
        btn.className = 'btn btn-secondary';
        btn.id = 'memoriesShareAllBtn';
        btn.onclick = function() { shOpenAllMemoriesShareDialog(); };
        addBtn.parentNode.insertBefore(btn, addBtn);
    }
    if (btn) mmLoad().then(function() { btn.textContent = mmOwnAllShareId() ? 'Sharing all…' : 'Share all…'; });
}

var _mmSharedList = [];
/** List page: the "Shared with me" block above my memories. */
async function mmRenderSharedWithMe(inProgressOnly) {
    var wrap = document.getElementById('memoriesSharedWrap');
    if (!wrap) {
        var list = document.getElementById('memoriesList');
        if (!list) return;
        wrap = document.createElement('div');
        wrap.id = 'memoriesSharedWrap';
        list.parentNode.insertBefore(wrap, list);
    }
    if (inProgressOnly === undefined) _mmSharedList = await mmSharedWithMe();
    var items = _mmSharedList.filter(function(m) { return !inProgressOnly || m.data.inProgress; })
        .sort(function(a, b) { return (a.data.sortOrder || 0) - (b.data.sortOrder || 0); });
    if (!_mmSharedList.length) { wrap.innerHTML = ''; return; }
    var html = '<h3 class="section-heading">Shared with me</h3>';
    var newBtns = '';
    Object.keys(_mmWithMe).forEach(function(sid) {
        var w = _mmWithMe[sid];
        if (w.data.kind === 'allMemories' && w.role === 'edit') {
            newBtns += '<button class="btn btn-secondary btn-small" style="margin:0 8px 8px 0;" onclick="mmNewInShare(\'' + sid + '\')">+ New memory in ' + escapeHtml(w.ownerName) + '’s memories</button>';
        }
    });
    html += newBtns;
    if (!items.length) html += '<p class="memory-empty-msg">No in-progress shared memories.</p>';
    items.forEach(function(m) {
        var d = m.data;
        html += '<div class="memory-list-row" data-id="' + m.id + '">' +
            '<div class="memory-list-content" onclick="window.location.hash=\'#memory-edit/' + m.id + '\'">' +
                (d.inProgress ? '<span class="memory-in-progress-tag">In Progress</span>' : '') +
                '<span class="memory-list-title">' + escapeHtml(d.title || 'Untitled') + '</span>' +
                (d.dateText ? '<span class="memory-list-date">' + escapeHtml(d.dateText) + '</span>' : '') +
                '<span class="memory-in-progress-tag" style="background:#e3eefc;color:#1f4e8c;">👥 ' + escapeHtml(m.ownerName) + ' · ' + (m.role === 'edit' ? 'Can edit' : 'View only') + '</span>' +
            '</div>' +
        '</div>';
    });
    if (_mmOwnHeadingNeeded()) html += '<h3 class="section-heading">My memories</h3>';
    wrap.innerHTML = html;
}
function _mmOwnHeadingNeeded() { return _mmSharedList.length > 0; }

function mmNewInShare(shareId) {
    _memNewShareId = shareId;
    window.location.hash = '#memory-create';
}

/** After sharing / stopping / changing who: show the same page again. */
async function _mmAfterShareChange() {
    await mmLoad(true);
    var edit = document.getElementById('page-memory-edit');
    if (edit && !edit.classList.contains('hidden') && window._memId !== undefined && _memId) {
        loadMemoryEditPage(_memId);
    } else {
        loadMemoriesPage();
    }
}

// ---------- Moving memories into / out of a share ----------

function _mmStamp() { return new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16); }
function _mmBackupName(name) { return 'Bishop_Memory_' + (name || 'Memory').replace(/[^A-Za-z0-9]+/g, '_') + '_Backup_' + _mmStamp() + '.json'; }
function _mmRows(docs) { return docs.map(function(d) { return { id: d.id, data: backupSerialize(d.data()) }; }); }

/** Deletes everything in a memory share, then optionally the share document. */
async function mmPurgeShare(shareId, alsoShareDoc) {
    for (var i = 0; i < MM_COLS.length; i++) {
        var snap = await shareCol(shareId, MM_COLS[i]).get();
        await shBatchDelete(snap.docs.map(function(d) { return d.ref; }));
    }
    if (alsoShareDoc) await topCol('shares').doc(shareId).delete();
}

/** One memory plus copies of the tags it uses, read from `shareId` (or private data when null). */
async function mmReadOne(memoryId, shareId) {
    var col = function(n) { return shareId ? shareCol(shareId, n) : userCol(n); };
    var mem = await col('memories').doc(memoryId).get();
    if (!mem.exists) throw new Error('That memory no longer exists.');
    var used = {};
    (mem.data().tags || []).forEach(function(t) { used[t] = true; });
    var tagSnap = shareId ? await shareCol(shareId, 'memoryTags').get() : await memCol('memoryTags').get();
    var tags = tagSnap.docs.filter(function(d) { return used[d.data().name] || shareId; });
    return { memory: mem, tags: tags };
}

/** Share one memory with the groups in `shareGroups` (owner). Returns the share ID. */
async function mmShareMemory(memoryId, shareGroups) {
    await mmLoad(true);
    if (mmOwnAllShareId() && mmShareOf(memoryId) === mmOwnAllShareId()) throw new Error('This memory is already included in your "all memories" share.');
    var me = _shMyUid();
    var groups = await _shLoadGroups();
    var flat = shFlatten(shareGroups, groups, me, await shGetMyName());

    _shProgress('Reading the memory…');
    var b = await mmReadOne(memoryId, null);
    var name = b.memory.data().title || 'Memory';

    _shProgress('Saving a backup file…');
    backupDownload(_mmBackupName(name), { version: 1, type: 'memory-before-share', exportedAt: new Date().toISOString(),
        memories: _mmRows([b.memory]), memoryTags: _mmRows(b.tags) });

    var shareId = db.collection('shares').doc().id;
    var created = false;
    try {
        _shProgress('Creating the shared area…');
        await topCol('shares').doc(shareId).set({
            ownerUid: me, kind: 'memory', title: name, memoryId: memoryId,
            shareGroups: shareGroups, viewerUids: flat.viewerUids, editorUids: flat.editorUids, names: flat.names,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        created = true;
        var ops = [{ ref: shareCol(shareId, 'memories').doc(memoryId), data: b.memory.data() }];
        b.tags.forEach(function(t) { ops.push({ ref: shareCol(shareId, 'memoryTags').doc(t.id), data: t.data() }); });
        await shBatchSet(ops, function(n, total) { _shProgress('Copying… ' + n + ' of ' + total); });

        _shProgress('Checking the copy…');
        var check = await mmReadOne(memoryId, shareId);
        if (!check.memory.exists || check.tags.length !== b.tags.length) throw new Error('The copy does not match the original.');
    } catch (err) {
        console.error('mmShareMemory failed, rolling back:', err);
        _shProgress('Something went wrong — undoing. Your memory has not been changed.', true);
        if (created) { try { await mmPurgeShare(shareId, true); } catch (e2) { console.error('rollback failed:', e2); } }
        throw err;
    }

    try {
        _shProgress('Removing the private copy…');
        await b.memory.ref.delete();            // the tags stay in my private list too
    } catch (err) {
        console.error('Could not remove the private original:', err);
        throw new Error('Shared, but the private copy could not be removed (' + err.message + '). Nothing is lost; open Memories and try again, or tell the developer.');
    }
    await mmLoad(true);
    return shareId;
}

/** Stop sharing one memory (owner): it, with any changes others made, comes back to my private data. */
async function mmUnshareMemory(shareId) {
    var entry = _mmOwn[shareId];
    if (!entry) throw new Error('That is not one of your shared memories.');
    var memoryId = entry.data.memoryId;

    _shProgress('Reading the shared memory…');
    var b = await mmReadOne(memoryId, shareId);
    var name = b.memory.data().title || 'Memory';

    _shProgress('Saving a backup file…');
    backupDownload(_mmBackupName(name), { version: 1, type: 'memory-before-unshare', exportedAt: new Date().toISOString(),
        memories: _mmRows([b.memory]), memoryTags: _mmRows(b.tags) });

    var privNames = {};
    (await userCol('memoryTags').get()).forEach(function(d) { privNames[d.data().name] = true; });
    var ops = [{ ref: userCol('memories').doc(memoryId), data: b.memory.data() }];
    b.tags.forEach(function(t) { if (!privNames[t.data().name]) { privNames[t.data().name] = true; ops.push({ ref: userCol('memoryTags').doc(t.id), data: t.data() }); } });
    try {
        await shBatchSet(ops, function(n, total) { _shProgress('Moving back… ' + n + ' of ' + total); });
        _shProgress('Checking the copy…');
        if (!(await userCol('memories').doc(memoryId).get()).exists) throw new Error('The copy does not match.');
    } catch (err) {
        console.error('mmUnshareMemory failed, rolling back:', err);
        _shProgress('Something went wrong — undoing. The memory is still shared.', true);
        try { await userCol('memories').doc(memoryId).delete(); } catch (e2) { console.error('rollback failed:', e2); }
        throw err;
    }
    _shProgress('Removing the shared copy…');
    await mmPurgeShare(shareId, true);
    await mmLoad(true);
}

/** After the owner deleted a shared memory: remove what is left in its share (tag copies) and the share document. */
async function mmFinishDelete(memoryId) {
    var sid = mmShareIdOfRoot(memoryId);
    if (!sid) return;
    await mmPurgeShare(sid, true);
    await mmLoad(true);
}

// ---------- Sharing ALL memories ----------
// One share of kind 'allMemories' per owner: every private memory, every link between them and the whole
// tag list. Memories already shared one at a time stay in their own shares. New memories I add later join
// this share automatically (see _mmShareForNew).

/** Everything of "all memories", read from `shareId` (or my private data when null): {memories, memoryLinks, memoryTags} of docs. */
async function mmReadAll(shareId) {
    var col = function(n) { return shareId ? shareCol(shareId, n) : userCol(n); };
    var memories = (await col('memories').get()).docs;
    var ids = {};
    memories.forEach(function(d) { ids[d.id] = true; });
    var links = (await col('memoryLinks').get()).docs.filter(function(d) {
        var m = d.data().memoryIds || [];
        return m.length === 2 && ids[m[0]] && ids[m[1]];     // a link whose other end lives elsewhere stays where it is
    });
    var tags = (await col('memoryTags').get()).docs;
    return { memories: memories, memoryLinks: links, memoryTags: tags };
}
function _mmAllCounts(l) { return { memories: l.memories.length, memoryLinks: l.memoryLinks.length, memoryTags: l.memoryTags.length }; }
function _mmAllOps(l, destShareId, skipTagNames) {
    var ops = [];
    MM_COLS.forEach(function(n) {
        var col = destShareId ? shareCol(destShareId, n) : userCol(n);
        l[n].forEach(function(d) {
            if (n === 'memoryTags' && skipTagNames && skipTagNames[d.data().name]) return;
            ops.push({ ref: col.doc(d.id), data: d.data() });
        });
    });
    return ops;
}
function _mmAllRefs(l) { var r = []; MM_COLS.forEach(function(n) { l[n].forEach(function(d) { r.push(d.ref); }); }); return r; }
function _mmAllJson(l, kind) {
    return { version: 1, type: 'allmemories-' + kind, exportedAt: new Date().toISOString(),
             memories: _mmRows(l.memories), memoryLinks: _mmRows(l.memoryLinks), memoryTags: _mmRows(l.memoryTags) };
}

/** Share all memories with the groups in `shareGroups` (owner). Returns the share ID. */
async function mmShareAll(shareGroups) {
    await mmLoad(true);
    if (mmOwnAllShareId()) throw new Error('You already share all your memories.');
    var me = _shMyUid();
    var groups = await _shLoadGroups();
    var flat = shFlatten(shareGroups, groups, me, await shGetMyName());

    _shProgress('Reading your memories…');
    var lists = await mmReadAll(null);

    _shProgress('Saving a backup file…');
    backupDownload(_mmBackupName('All_memories'), _mmAllJson(lists, 'before-share'));

    var shareId = db.collection('shares').doc().id;
    var created = false;
    try {
        _shProgress('Creating the shared area…');
        await topCol('shares').doc(shareId).set({
            ownerUid: me, kind: 'allMemories', title: 'All memories',
            shareGroups: shareGroups, viewerUids: flat.viewerUids, editorUids: flat.editorUids, names: flat.names,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        created = true;
        await shBatchSet(_mmAllOps(lists, shareId), function(n, total) { _shProgress('Copying… ' + n + ' of ' + total); });

        _shProgress('Checking the copy…');
        var check = await mmReadAll(shareId);
        if (JSON.stringify(_mmAllCounts(check)) !== JSON.stringify(_mmAllCounts(lists))) {
            throw new Error('The copy does not match the original (' + JSON.stringify(_mmAllCounts(check)) + ' instead of ' + JSON.stringify(_mmAllCounts(lists)) + ').');
        }
    } catch (err) {
        console.error('mmShareAll failed, rolling back:', err);
        _shProgress('Something went wrong — undoing. Your memories have not been changed.', true);
        if (created) { try { await mmPurgeShare(shareId, true); } catch (e2) { console.error('rollback failed:', e2); } }
        throw err;
    }

    try {
        _shProgress('Removing the private copies…');
        await shBatchDelete(_mmAllRefs(lists));
    } catch (err) {
        console.error('Could not remove the private originals:', err);
        throw new Error('Shared, but the private copies could not be fully removed (' + err.message + '). Nothing is lost; open Memories and try again, or tell the developer.');
    }
    await mmLoad(true);
    return shareId;
}

/** Stop sharing all memories (owner): everything, including what others added or changed, comes back to my private data. */
async function mmUnshareAll(shareId) {
    if (!_mmOwn[shareId]) throw new Error('That is not your all-memories share.');
    _shProgress('Reading the shared memories…');
    var lists = await mmReadAll(shareId);

    _shProgress('Saving a backup file…');
    backupDownload(_mmBackupName('All_memories'), _mmAllJson(lists, 'before-unshare'));

    var privNames = {};
    (await userCol('memoryTags').get()).forEach(function(d) { privNames[d.data().name] = true; });
    var ops = _mmAllOps(lists, null, privNames);
    try {
        await shBatchSet(ops, function(n, total) { _shProgress('Moving back… ' + n + ' of ' + total); });
        _shProgress('Checking the copy…');
        var check = await mmReadAll(null);
        var want = _mmAllCounts(lists), got = _mmAllCounts(check);
        if (got.memories < want.memories || got.memoryLinks < want.memoryLinks) throw new Error('The copy does not match.');
    } catch (err) {
        console.error('mmUnshareAll failed, rolling back:', err);
        _shProgress('Something went wrong — undoing. Your memories are still shared.', true);
        try { await shBatchDelete(ops.map(function(o) { return o.ref; })); } catch (e2) { console.error('rollback failed:', e2); }
        throw err;
    }
    _shProgress('Removing the shared copy…');
    await mmPurgeShare(shareId, true);
    await mmLoad(true);
}

// ---------- Backup and restore of my shared memories ----------
// Added to the Data backup file as the extra key sharedMemories: one entry per memory share I own, with every
// document in it. Restored as PRIVATE data, skipping anything that is still shared.

async function mmBackupShared() {
    await mmLoad(true);
    var ids = Object.keys(_mmOwn);
    if (!ids.length) return null;
    var out = [];
    for (var i = 0; i < ids.length; i++) {
        var sid = ids[i], data = _mmOwn[sid].data, cols = {};
        for (var c = 0; c < MM_COLS.length; c++) cols[MM_COLS[c]] = _mmRows((await shareCol(sid, MM_COLS[c]).get()).docs);
        out.push({ shareId: sid, kind: data.kind, memoryId: data.memoryId || null, share: backupSerialize(data), collections: cols });
    }
    return out;
}

async function mmRestoreShared(payload, log) {
    var list = payload.sharedMemories || [];
    if (!list.length) return;
    await mmLoad(true);
    var restored = 0, skipped = 0;
    for (var i = 0; i < list.length; i++) {
        var e = list[i];
        var stillShared = e.kind === 'allMemories' ? !!mmOwnAllShareId() : (e.memoryId && !!mmShareOf(e.memoryId));
        if (stillShared) { skipped++; continue; }
        var ops = [];
        Object.keys(e.collections).forEach(function(n) {
            e.collections[n].forEach(function(r) { ops.push({ ref: userCol(n).doc(r.id), data: r.data }); });
        });
        await shBatchSet(ops);
        restored++;
    }
    if (restored) log('✓ ' + restored + ' shared memory share(s) restored as your private memories. Share them again if you want.', '#2e7d32');
    if (skipped) log('• ' + skipped + ' memory share(s) are still shared — left as they are.');
}
