// ============================================================
// sharebudget.js — sharing one budget at a time (Shared Financial, chunk F6)
//
// A budget (Financial → Budgets) is shared on its own: the owner picks which budgets and which
// groups (View only / Can edit). One share of kind 'budget' per budget:
//
//   shares/{shareId}: kind 'budget', budgetId, title (the budget name), shareGroups, viewerUids,
//                     editorUids, names
//   shares/{shareId}/budgets/{budgetId}                       the budget document (name, isArchived …)
//   shares/{shareId}/budgets/{budgetId}/{categories|lineItems|incomeItems|nonMonthlyItems}/{id}
//
// The budget keeps its ID, so "default budget" and the retire estimate's selected budget keep
// working for the owner. People a budget is shared with see it in their Budgets list marked
// "shared by …". The budget has no sensitive info, so no keys are involved.
// ============================================================

var BG_SUBS = ['categories', 'lineItems', 'incomeItems', 'nonMonthlyItems'];
var _bgOwn    = {};      // {budgetId: {shareId, role: 'owner', data}} budgets I own that live in a share
var _bgWithMe = {};      // {budgetId: {shareId, role, ownerName, data}} budgets shared with me
var _bgLoaded = false;

/** Finds the budget shares I own and the ones shared with me (cached; force=true after a change). */
async function bgLoad(force) {
    if (_bgLoaded && !force) return;
    var mine = (await shLoadMyShares()).filter(function(s) { return s.kind === 'budget'; });
    var withMe = (await shLoadSharedWithMe()).filter(function(s) { return s.kind === 'budget'; });
    _bgOwn = {};
    mine.forEach(function(s) { if (s.data.budgetId) _bgOwn[s.data.budgetId] = { shareId: s.id, role: 'owner', data: s.data }; });
    _bgWithMe = {};
    withMe.forEach(function(s) { if (s.data.budgetId) _bgWithMe[s.data.budgetId] = { shareId: s.id, role: s.role, ownerName: s.ownerName, data: s.data }; });
    _bgLoaded = true;
}

function bgInfo(budgetId)        { return _bgOwn[budgetId] || _bgWithMe[budgetId] || null; }
function bgShareIdFor(budgetId)  { var i = bgInfo(budgetId); return i ? i.shareId : null; }
/** 'owner' (mine, shared or not) | 'edit' | 'view'. */
function bgRoleFor(budgetId)     { var i = bgInfo(budgetId); return i ? i.role : 'owner'; }
function bgCanEdit(budgetId)     { return bgRoleFor(budgetId) !== 'view'; }
function bgIsOwner(budgetId)     { return bgRoleFor(budgetId) === 'owner'; }

/** The budget document: private, or inside its share. */
function bgRef(budgetId) {
    var sid = bgShareIdFor(budgetId);
    return sid ? shareCol(sid, 'budgets').doc(budgetId) : userCol('budgets').doc(budgetId);
}

/** Budget document snapshots I own (private and in my own shares) whose archived flag matches. */
async function bgOwnDocs(archived) {
    await bgLoad();
    var snap = await userCol('budgets').where('isArchived', '==', archived).get();
    var out = snap.docs.slice();
    var ids = Object.keys(_bgOwn);
    for (var i = 0; i < ids.length; i++) {
        var d = await shareCol(_bgOwn[ids[i]].shareId, 'budgets').doc(ids[i]).get();
        if (d.exists && !!d.data().isArchived === archived) out.push(d);
    }
    return out;
}

/** Budget document snapshots other people shared with me (not archived). */
async function bgSharedWithMeDocs() {
    await bgLoad();
    var out = [];
    var ids = Object.keys(_bgWithMe);
    for (var i = 0; i < ids.length; i++) {
        var d = await shareCol(_bgWithMe[ids[i]].shareId, 'budgets').doc(ids[i]).get();
        if (d.exists && !d.data().isArchived) out.push(d);
    }
    return out;
}

// ---------- Moving a budget into / out of a share ----------

async function bgReadBundle(budgetId, shareId) {
    var ref = shareId ? shareCol(shareId, 'budgets').doc(budgetId) : userCol('budgets').doc(budgetId);
    var doc = await ref.get();
    if (!doc.exists) throw new Error('That budget no longer exists.');
    var subs = {};
    for (var i = 0; i < BG_SUBS.length; i++) subs[BG_SUBS[i]] = (await ref.collection(BG_SUBS[i]).get()).docs;
    return { doc: doc, subs: subs };
}

function _bgCounts(b) {
    var c = {};
    BG_SUBS.forEach(function(s) { c[s] = b.subs[s].length; });
    return c;
}

function _bgBackupJson(b, kind) {
    function rows(docs) { return docs.map(function(d) { return { id: d.id, data: backupSerialize(d.data()) }; }); }
    var subs = {};
    BG_SUBS.forEach(function(s) { subs[s] = rows(b.subs[s]); });
    return { version: 1, type: 'budget-' + kind, exportedAt: new Date().toISOString(),
             budget: { id: b.doc.id, data: backupSerialize(b.doc.data()) }, subcollections: subs };
}

function _bgStamp() { return new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16); }

/** Deletes everything of a budget inside its share (the subcollections, then the budget document). Not the share document. */
async function bgDeleteShareContents(shareId, budgetId) {
    var ref = shareCol(shareId, 'budgets').doc(budgetId);
    for (var i = 0; i < BG_SUBS.length; i++) {
        var snap = await ref.collection(BG_SUBS[i]).get();
        await shBatchDelete(snap.docs.map(function(d) { return d.ref; }));
    }
    await ref.delete();
}

/** Share one budget with the groups in `shareGroups` (owner). Returns the share ID. */
async function bgShareBudget(budgetId, shareGroups) {
    var me = _shMyUid();
    var groups = await _shLoadGroups();
    var flat = shFlatten(shareGroups, groups, me, await shGetMyName());

    _shProgress('Reading the budget…');
    var bundle = await bgReadBundle(budgetId, null);
    var name = bundle.doc.data().name || 'Budget';

    _shProgress('Saving a backup file…');
    backupDownload('Bishop_Budget_' + name.replace(/[^A-Za-z0-9]+/g, '_') + '_Backup_' + _bgStamp() + '.json', _bgBackupJson(bundle, 'before-share'));

    var shareId = db.collection('shares').doc().id;
    var created = false;
    try {
        _shProgress('Creating the shared area…');
        await topCol('shares').doc(shareId).set({           // its own write, before anything goes inside (the rules read it)
            ownerUid: me, kind: 'budget', title: name, budgetId: budgetId,
            shareGroups: shareGroups, viewerUids: flat.viewerUids, editorUids: flat.editorUids, names: flat.names,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        created = true;
        var destRef = shareCol(shareId, 'budgets').doc(budgetId);
        var ops = [{ ref: destRef, data: bundle.doc.data() }];
        BG_SUBS.forEach(function(s) {
            bundle.subs[s].forEach(function(d) { ops.push({ ref: destRef.collection(s).doc(d.id), data: d.data() }); });
        });
        await shBatchSet(ops, function(n, total) { _shProgress('Copying… ' + n + ' of ' + total); });

        _shProgress('Checking the copy…');
        var check = await bgReadBundle(budgetId, shareId);
        if (JSON.stringify(_bgCounts(check)) !== JSON.stringify(_bgCounts(bundle))) {
            throw new Error('The copy does not match the original (' + JSON.stringify(_bgCounts(check)) + ' instead of ' + JSON.stringify(_bgCounts(bundle)) + ').');
        }
    } catch (err) {
        console.error('bgShareBudget failed, rolling back:', err);
        _shProgress('Something went wrong — undoing. Your budget has not been changed.', true);
        if (created) { try { await bgDeleteShareContents(shareId, budgetId); await topCol('shares').doc(shareId).delete(); } catch (e2) { console.error('rollback failed:', e2); } }
        throw err;
    }

    try {
        _shProgress('Removing the private copy…');
        for (var i = 0; i < BG_SUBS.length; i++) await shBatchDelete(bundle.subs[BG_SUBS[i]].map(function(d) { return d.ref; }));
        await bundle.doc.ref.delete();
    } catch (err) {
        console.error('Could not remove the private originals:', err);
        throw new Error('Shared, but the private copy could not be fully removed (' + err.message + '). Nothing is lost; open Budgets and try again, or tell the developer.');
    }
    await bgLoad(true);
    return shareId;
}

/** Stop sharing a budget (owner): everything, including what other people changed, comes back to my private area. */
async function bgUnshareBudget(shareId) {
    var entry = Object.keys(_bgOwn).map(function(id) { return { id: id, info: _bgOwn[id] }; })
        .filter(function(x) { return x.info.shareId === shareId; })[0];
    if (!entry) throw new Error('That is not one of your shared budgets.');
    var budgetId = entry.id;

    _shProgress('Reading the shared budget…');
    var bundle = await bgReadBundle(budgetId, shareId);
    var name = bundle.doc.data().name || 'Budget';

    _shProgress('Saving a backup file…');
    backupDownload('Bishop_Budget_' + name.replace(/[^A-Za-z0-9]+/g, '_') + '_Backup_' + _bgStamp() + '.json', _bgBackupJson(bundle, 'before-unshare'));

    var destRef = userCol('budgets').doc(budgetId);
    var ops = [{ ref: destRef, data: bundle.doc.data() }];
    BG_SUBS.forEach(function(s) {
        bundle.subs[s].forEach(function(d) { ops.push({ ref: destRef.collection(s).doc(d.id), data: d.data() }); });
    });
    try {
        await shBatchSet(ops, function(n, total) { _shProgress('Moving back… ' + n + ' of ' + total); });
        _shProgress('Checking the copy…');
        var check = await bgReadBundle(budgetId, null);
        if (JSON.stringify(_bgCounts(check)) !== JSON.stringify(_bgCounts(bundle))) throw new Error('The copy does not match.');
    } catch (err) {
        console.error('bgUnshareBudget failed, rolling back:', err);
        _shProgress('Something went wrong — undoing. The budget is still shared.', true);
        try { await shBatchDelete(ops.map(function(o) { return o.ref; })); } catch (e2) { console.error('rollback failed:', e2); }
        throw err;
    }
    _shProgress('Removing the shared copy…');
    await bgDeleteShareContents(shareId, budgetId);
    await topCol('shares').doc(shareId).delete();
    await bgLoad(true);
}

/** Owner deletes a budget that lives in a share: contents first, then the share document. */
async function bgDeleteSharedBudget(budgetId) {
    var sid = bgShareIdFor(budgetId);
    if (!sid || !bgIsOwner(budgetId)) return;
    await bgDeleteShareContents(sid, budgetId);
    await topCol('shares').doc(sid).delete();
    await bgLoad(true);
}

// ---------- Backup and restore of my shared budgets ----------
// Added to the Data backup file as the extra key sharedBudgets. Restored as PRIVATE budgets, skipping
// any that are still shared.

async function bgBackupShared() {
    await bgLoad(true);
    var ids = Object.keys(_bgOwn);
    if (!ids.length) return null;
    var out = [];
    for (var i = 0; i < ids.length; i++) {
        var b = await bgReadBundle(ids[i], _bgOwn[ids[i]].shareId);
        var j = _bgBackupJson(b, 'backup');
        out.push({ shareId: _bgOwn[ids[i]].shareId, share: backupSerialize(_bgOwn[ids[i]].data), budget: j.budget, subcollections: j.subcollections });
    }
    return out;
}

async function bgRestoreShared(payload, log) {
    var list = payload.sharedBudgets || [];
    if (!list.length) return;
    await bgLoad(true);
    var restored = 0, skipped = 0;
    for (var i = 0; i < list.length; i++) {
        var e = list[i];
        if (_bgOwn[e.budget.id]) { skipped++; continue; }
        var ref = userCol('budgets').doc(e.budget.id);
        var ops = [{ ref: ref, data: e.budget.data }];
        BG_SUBS.forEach(function(s) {
            (e.subcollections[s] || []).forEach(function(r) { ops.push({ ref: ref.collection(s).doc(r.id), data: r.data }); });
        });
        await shBatchSet(ops);
        restored++;
    }
    if (restored) log('✓ ' + restored + ' shared budget(s) restored as your private budgets. Share them again if you want.', '#2e7d32');
    if (skipped) log('• ' + skipped + ' shared budget(s) are still shared — left as they are.');
}

// ---------- View only ----------

/**
 * Disables every field and button inside `root` except what matches `keep` (a selector). For a budget
 * shared as View only: the security rules refuse the writes, this just removes the controls.
 */
function bgApplyViewOnly(root, keep) {
    if (!root) return;
    root.querySelectorAll('input, select, textarea, button').forEach(function(el) {
        if (keep && el.matches(keep)) return;
        if (el.tagName === 'BUTTON') el.style.display = 'none'; else el.disabled = true;
    });
    root.querySelectorAll('[draggable="true"]').forEach(function(el) { el.draggable = false; });
}
