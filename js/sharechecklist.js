// ============================================================
// sharechecklist.js — sharing one checklist (run) at a time (Shared Checklists, chunk K1)
//
// A running checklist (Life → Checklists) is shared on its own: the owner picks which list and which
// groups (View only / Can edit). One share of kind 'checklist' per list:
//
//   shares/{shareId}: kind 'checklist', runId, title (the list name), shareGroups, viewerUids,
//                     editorUids, names
//   shares/{shareId}/checklistRuns/{runId}      the list document (items, tags, dates …) — same ID
//
// Only the list is shared, not the template it was started from: the owner starts the next list.
// People a list is shared with see it in their Checklists page under "Shared with me". The list has
// no sensitive info, so no keys are involved.
// ============================================================

var _clOwn      = {};     // {runId: {shareId, role: 'owner', data}} lists I own that live in a share
var _clWithMe   = {};     // {runId: {shareId, role, ownerName, data}} lists shared with me
var _clShLoaded = false;

/** Finds the checklist shares I own and the ones shared with me (cached; force=true after a change). */
async function clShLoad(force) {
    if (_clShLoaded && !force) return;
    var mine   = (await shLoadMyShares()).filter(function(s) { return s.kind === 'checklist'; });
    var withMe = (await shLoadSharedWithMe()).filter(function(s) { return s.kind === 'checklist'; });
    _clOwn = {};
    mine.forEach(function(s) { if (s.data.runId) _clOwn[s.data.runId] = { shareId: s.id, role: 'owner', data: s.data }; });
    _clWithMe = {};
    withMe.forEach(function(s) { if (s.data.runId) _clWithMe[s.data.runId] = { shareId: s.id, role: s.role, ownerName: s.ownerName, data: s.data }; });
    _clShLoaded = true;
}

function clShInfo(runId)      { return _clOwn[runId] || _clWithMe[runId] || null; }
function clShareIdFor(runId)  { var i = clShInfo(runId); return i ? i.shareId : null; }
/** 'owner' (mine, shared or not) | 'edit' | 'view'. */
function clRoleFor(runId)     { var i = clShInfo(runId); return i ? i.role : 'owner'; }
function clCanEdit(runId)     { return clRoleFor(runId) !== 'view'; }
function clIsOwner(runId)     { return clRoleFor(runId) === 'owner'; }
function clIsShared(runId)    { return !!clShInfo(runId); }

/** The list document: private, or inside its share. */
function clRunRef(runId) {
    var sid = clShareIdFor(runId);
    return sid ? shareCol(sid, 'checklistRuns').doc(runId) : userCol('checklistRuns').doc(runId);
}

/**
 * Snapshots of lists I own: the private ones the query returns, plus my own shared lists that pass
 * `keep(data)`. Used by every place that lists my checklists.
 */
async function clOwnRunDocs(privateQuery, keep) {
    await clShLoad();
    var snap = await privateQuery.get();
    var out = snap.docs.slice();
    var ids = Object.keys(_clOwn);
    for (var i = 0; i < ids.length; i++) {
        var d = await shareCol(_clOwn[ids[i]].shareId, 'checklistRuns').doc(ids[i]).get();
        if (d.exists && keep(d.data())) out.push(d);
    }
    return out;
}

/** Active (not completed, not archived) lists other people shared with me. */
async function clSharedWithMeDocs() {
    await clShLoad();
    var out = [];
    var ids = Object.keys(_clWithMe);
    for (var i = 0; i < ids.length; i++) {
        try {
            var d = await shareCol(_clWithMe[ids[i]].shareId, 'checklistRuns').doc(ids[i]).get();
            if (d.exists && !d.data().completedAt && !d.data().archived) out.push(d);
        } catch (err) { console.warn('Could not read a shared checklist:', err); }
    }
    return out;
}

// ---------- Moving a list into / out of a share ----------

function _clBackupJson(doc, kind) {
    return { version: 1, type: 'checklist-' + kind, exportedAt: new Date().toISOString(),
             run: { id: doc.id, data: backupSerialize(doc.data()) } };
}

function _clStamp() { return new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16); }

function _clBackupName(title) { return 'Bishop_Checklist_' + (title || 'List').replace(/[^A-Za-z0-9]+/g, '_') + '_Backup_' + _clStamp() + '.json'; }

/** Deletes a list from its share (not the share document). */
async function clDeleteShareContents(shareId, runId) {
    await shareCol(shareId, 'checklistRuns').doc(runId).delete();
}

/** Share one list with the groups in `shareGroups` (owner). Returns the share ID. */
async function clShareRun(runId, shareGroups) {
    var me = _shMyUid();
    var groups = await _shLoadGroups();
    var flat = shFlatten(shareGroups, groups, me, await shGetMyName());

    _shProgress('Reading the checklist…');
    var srcRef = userCol('checklistRuns').doc(runId);
    var src = await srcRef.get();
    if (!src.exists) throw new Error('That checklist no longer exists.');
    var title = src.data().templateName || 'Checklist';
    var itemCount = (src.data().items || []).length;

    _shProgress('Saving a backup file…');
    backupDownload(_clBackupName(title), _clBackupJson(src, 'before-share'));

    var shareId = db.collection('shares').doc().id;
    var created = false;
    try {
        _shProgress('Creating the shared area…');
        await topCol('shares').doc(shareId).set({           // its own write, before anything goes inside (the rules read it)
            ownerUid: me, kind: 'checklist', title: title, runId: runId,
            shareGroups: shareGroups, viewerUids: flat.viewerUids, editorUids: flat.editorUids, names: flat.names,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        created = true;
        _shProgress('Copying…');
        var copy = Object.assign({}, src.data());
        copy.items = (copy.items || []).map(function(it) { return it.id ? it : Object.assign({ id: clNewItemId() }, it); });   // every item gets an ID (K2)
        await shareCol(shareId, 'checklistRuns').doc(runId).set(copy);

        _shProgress('Checking the copy…');
        var check = await shareCol(shareId, 'checklistRuns').doc(runId).get();
        if (!check.exists || (check.data().items || []).length !== itemCount) {
            throw new Error('The copy does not match the original.');
        }
    } catch (err) {
        console.error('clShareRun failed, rolling back:', err);
        _shProgress('Something went wrong — undoing. Your checklist has not been changed.', true);
        if (created) { try { await clDeleteShareContents(shareId, runId); await topCol('shares').doc(shareId).delete(); } catch (e2) { console.error('rollback failed:', e2); } }
        throw err;
    }

    try {
        _shProgress('Removing the private copy…');
        await srcRef.delete();
    } catch (err) {
        console.error('Could not remove the private original:', err);
        throw new Error('Shared, but the private copy could not be removed (' + err.message + '). Nothing is lost; open Checklists and try again, or tell the developer.');
    }
    await clShLoad(true);
    return shareId;
}

/** Stop sharing a list (owner): it, including what other people changed, comes back to my private area. */
async function clUnshareRun(shareId) {
    var entry = Object.keys(_clOwn).map(function(id) { return { id: id, info: _clOwn[id] }; })
        .filter(function(x) { return x.info.shareId === shareId; })[0];
    if (!entry) throw new Error('That is not one of your shared checklists.');
    var runId = entry.id;

    _shProgress('Reading the shared checklist…');
    var src = await shareCol(shareId, 'checklistRuns').doc(runId).get();
    if (!src.exists) throw new Error('That checklist no longer exists.');
    var title = src.data().templateName || 'Checklist';
    var itemCount = (src.data().items || []).length;

    _shProgress('Saving a backup file…');
    backupDownload(_clBackupName(title), _clBackupJson(src, 'before-unshare'));

    var destRef = userCol('checklistRuns').doc(runId);
    try {
        await destRef.set(src.data());
        _shProgress('Checking the copy…');
        var check = await destRef.get();
        if (!check.exists || (check.data().items || []).length !== itemCount) throw new Error('The copy does not match.');
    } catch (err) {
        console.error('clUnshareRun failed, rolling back:', err);
        _shProgress('Something went wrong — undoing. The checklist is still shared.', true);
        try { await destRef.delete(); } catch (e2) { console.error('rollback failed:', e2); }
        throw err;
    }
    _shProgress('Removing the shared copy…');
    await clDeleteShareContents(shareId, runId);
    await topCol('shares').doc(shareId).delete();
    await clShLoad(true);
}

/** Owner deletes a list that lives in a share: the list first, then the share document. */
async function clDeleteSharedRun(runId) {
    var sid = clShareIdFor(runId);
    if (!sid || !clIsOwner(runId)) return;
    await clDeleteShareContents(sid, runId);
    await topCol('shares').doc(sid).delete();
    await clShLoad(true);
}

// ---------- Safe item changes (K2) ----------
// A list's items are one array inside one document. Two people changing it at the same moment must not
// overwrite each other, so every change runs in a Firestore transaction: read the current items,
// change only what this person did, write back. The item they acted on is found by its ID (not its
// position, which may have moved) — every item gets an ID the first time it is saved.

var _clRendered = {};     // {runId: items array as last drawn} — to find the ID of the item at a position

function clNewItemId() { return 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

function clRememberItems(runId, items) { _clRendered[runId] = items; }

/**
 * Changes a list's items in one transaction.
 *   idx — position of the item the user acted on in what is drawn (null when the change is not about one item)
 *   fn(items, at) — edits/returns the items array; `at` is that item's current position (-1 if someone removed it)
 * Returns {items, data, at}, or null if the list no longer exists or fn returned false (nothing to change).
 */
async function clChangeItems(runId, idx, fn) {
    var ref = clRunRef(runId);
    var shown = idx == null ? null : (_clRendered[runId] || [])[idx];
    var wantId = shown && shown.id;
    var out = null;
    await db.runTransaction(async function(tx) {
        out = null;
        var snap = await tx.get(ref);
        if (!snap.exists) return;
        var data = snap.data();
        var items = (data.items || []).map(function(it) { return it.id ? it : Object.assign({ id: clNewItemId() }, it); });
        var at = idx == null ? -1 : (wantId ? items.findIndex(function(x) { return x.id === wantId; }) : idx);
        if (idx != null && (at === -1 || at >= items.length)) return;   // the item was removed by someone else: nothing to do
        var next = fn(items, at);
        if (next === false) return;
        tx.update(ref, { items: next || items });
        out = { items: next || items, data: data, at: at };
    });
    return out;
}

// ---------- Live updates (K2) ----------
// Every shared list that is on screen (mine or shared with me) is watched with a Firestore listener, so a
// tick or a new item shows up on the other person's screen as it happens. Only the list's items are
// redrawn, and not while the person is typing in that card (it is applied when they click away).

var _clLive = {};             // {runId: {unsub, pending}}
var _clLiveLastRefresh = 0;

function clStopLive() {
    Object.keys(_clLive).forEach(function(id) { try { _clLive[id].unsub(); } catch (e) {} });
    _clLive = {};
}

/** The card of a list on the page, or null. */
function _clCardFor(runId) {
    return document.querySelector('#clSharedWithMeContainer .cl-run-card[data-id="' + runId + '"], #clActiveRunsContainer .cl-run-card[data-id="' + runId + '"]');
}

/** Reloads the page's lists (a list was completed, archived, removed or is no longer shared). Not more than once every few seconds. */
function _clLiveReloadAll() {
    var now = Date.now();
    if (now - _clLiveLastRefresh < 4000) return;
    _clLiveLastRefresh = now;
    clStopLive();
    clShLoad(true).then(function() { return clLoadActiveRuns(); }).catch(function(e) { console.error(e); });
}

/** Redraws the items (and the count) of a card from new list data. */
function _clLiveApply(runId, data) {
    var card = _clCardFor(runId);
    if (!card) return;
    var items = data.items || [];
    clRerenderRunItems(runId, items, data.templateId || null, card);
    var count = card.querySelector('.cl-run-count');
    if (count) count.textContent = items.length + ' item' + (items.length !== 1 ? 's' : '');
}

function _clLiveOnData(runId, data) {
    var card = _clCardFor(runId);
    if (!card) { if (_clLive[runId]) { try { _clLive[runId].unsub(); } catch (e) {} delete _clLive[runId]; } return; }
    if (data.completedAt || data.archived) { _clLiveReloadAll(); return; }
    if (JSON.stringify(data.items || []) === JSON.stringify(_clRendered[runId] || [])) return;   // nothing new (e.g. my own change coming back)
    var a = document.activeElement;
    if (a && card.contains(a) && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) {       // typing here: wait until they click away
        _clLive[runId].pending = data;
        return;
    }
    _clLiveApply(runId, data);
}

/** Starts watching every shared list that is on the page. Call after the lists are drawn. */
function clStartLive() {
    clStopLive();
    document.querySelectorAll('#clSharedWithMeContainer .cl-run-card[data-id], #clActiveRunsContainer .cl-run-card[data-id]').forEach(function(card) {
        var runId = card.dataset.id;
        if (!clIsShared(runId) || _clLive[runId]) return;
        var entry = { pending: null, unsub: null };
        _clLive[runId] = entry;
        entry.unsub = clRunRef(runId).onSnapshot(function(snap) {
            if (!snap.exists) { _clLiveReloadAll(); return; }
            _clLiveOnData(runId, snap.data());
        }, function(err) {
            console.warn('Live checklist listener stopped:', err.message);       // e.g. sharing was stopped
            _clLiveReloadAll();
        });
        card.addEventListener('focusout', function() {
            setTimeout(function() {
                var p = _clLive[runId] && _clLive[runId].pending;
                var a = document.activeElement;
                if (p && !(a && card.contains(a) && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA'))) {
                    _clLive[runId].pending = null;
                    _clLiveApply(runId, p);
                }
            }, 200);
        });
    });
}

/** Re-reads one list and redraws its items (the item someone acted on was removed by another person). */
async function clRefreshRunNow(runId) {
    try {
        var d = await clRunRef(runId).get();
        if (d.exists) _clLiveApply(runId, d.data()); else _clLiveReloadAll();
    } catch (e) { console.error(e); }
}

// ---------- Backup and restore of my shared lists (K3) ----------
// Added to the Data backup file as the extra key sharedChecklists. The private backup of checklistRuns
// misses them because the list lives in the share. Restored as PRIVATE lists, skipping any list that is
// still shared (share it again if you want).

async function clBackupShared() {
    await clShLoad(true);
    var ids = Object.keys(_clOwn);
    if (!ids.length) return null;
    var out = [];
    for (var i = 0; i < ids.length; i++) {
        var d = await shareCol(_clOwn[ids[i]].shareId, 'checklistRuns').doc(ids[i]).get();
        if (!d.exists) continue;
        out.push({ shareId: _clOwn[ids[i]].shareId, share: backupSerialize(_clOwn[ids[i]].data), run: { id: d.id, data: backupSerialize(d.data()) } });
    }
    return out;
}

async function clRestoreShared(payload, log) {
    var list = payload.sharedChecklists || [];
    if (!list.length) return;
    await clShLoad(true);
    var restored = 0, skipped = 0;
    for (var i = 0; i < list.length; i++) {
        var e = list[i];
        if (_clOwn[e.run.id]) { skipped++; continue; }
        await userCol('checklistRuns').doc(e.run.id).set(e.run.data);
        restored++;
    }
    if (restored) log('✓ ' + restored + ' shared checklist(s) restored as your private checklists. Share them again if you want.', '#2e7d32');
    if (skipped) log('• ' + skipped + ' shared checklist(s) are still shared — left as they are.');
}
