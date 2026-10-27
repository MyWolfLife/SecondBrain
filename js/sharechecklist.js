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
        await shareCol(shareId, 'checklistRuns').doc(runId).set(src.data());

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
