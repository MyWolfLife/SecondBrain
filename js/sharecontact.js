// ============================================================
// sharecontact.js — sharing one contact (Shared Contacts, chunk P1)
//
// A contact (Life → Contacts) is shared with its whole family tree: the contact itself, the family
// members / staff listed under it (and theirs), and everything on them. One share of kind 'contact' per
// shared contact:
//
//   shares/{shareId}: kind 'contact', personId (the contact I shared), title (its name), shareGroups,
//                     viewerUids, editorUids, names
//   shares/{shareId}/people/{id}                  the contact and its family members (same IDs)
//   shares/{shareId}/peopleInteractions/{id}      interactions
//   shares/{shareId}/peopleImportantDates/{id}    important dates
//   shares/{shareId}/photos/{id}, facts/{id}      photos and facts whose target is one of those contacts
//
// Contacts are used all over the app (journal, health, neighbors, calendar …) and they read them with
// userCol('people') …, so those places must keep finding a contact that now lives in a share. Every one
// of those reads/writes goes through pplCol(name) instead: it looks in my private data AND in the
// contact shares I own (queries), and sends a single document to wherever it lives. A recipient's
// shared-with-me contacts are reachable by id the same way (so the contact page can open them).
// ============================================================

var CX_COLS = ['people', 'peopleInteractions', 'peopleImportantDates'];      // collections routed by pplCol
var CX_SHARE_COLS = ['people', 'peopleInteractions', 'peopleImportantDates', 'photos', 'facts'];   // what lives in a contact share

var _cxOwn     = {};      // {shareId: {personId, data}}  contact shares I own
var _cxWithMe  = {};      // {shareId: {personId, role, ownerName, data}}  contact shares shared with me
var _cxIdx     = { people: {}, peopleInteractions: {}, peopleImportantDates: {} };   // {collection: {docId: shareId}}
var _cxLoadedAt = 0;
var _cxLoading  = null;

/** Finds my contact shares and which share each shared document lives in (cached ~60 s; force=true after a change). */
async function cxLoad(force) {
    if (!force && _cxLoadedAt && Date.now() - _cxLoadedAt < 60000) return;
    if (_cxLoading) return _cxLoading;
    _cxLoading = (async function() {
        try {
            var mine   = (await shLoadMyShares()).filter(function(s) { return s.kind === 'contact'; });
            var withMe = (await shLoadSharedWithMe()).filter(function(s) { return s.kind === 'contact'; });
            var own = {}, wm = {};
            mine.forEach(function(s) { own[s.id] = { personId: s.data.personId, data: s.data }; });
            withMe.forEach(function(s) { wm[s.id] = { personId: s.data.personId, role: s.role, ownerName: s.ownerName, data: s.data }; });
            var idx = { people: {}, peopleInteractions: {}, peopleImportantDates: {} };
            var ids = Object.keys(own).concat(Object.keys(wm));
            for (var i = 0; i < ids.length; i++) {
                for (var c = 0; c < CX_COLS.length; c++) {
                    try {
                        var snap = await shareCol(ids[i], CX_COLS[c]).get();
                        snap.docs.forEach(function(d) { idx[CX_COLS[c]][d.id] = ids[i]; });
                    } catch (err) { console.warn('cxLoad: could not read', CX_COLS[c], 'of a contact share:', err.message); }
                }
            }
            _cxOwn = own; _cxWithMe = wm; _cxIdx = idx; _cxLoadedAt = Date.now();
        } finally { _cxLoading = null; }
    })();
    return _cxLoading;
}

function cxShareOf(personId)   { return _cxIdx.people[personId] || null; }
/** 'owner' (mine, private or shared) | 'edit' | 'view'. */
function cxRoleFor(personId) {
    var sid = cxShareOf(personId);
    if (!sid) return 'owner';
    if (_cxOwn[sid]) return 'owner';
    return _cxWithMe[sid] ? _cxWithMe[sid].role : 'owner';
}
function cxCanEdit(personId)   { return cxRoleFor(personId) !== 'view'; }
function cxIsOwner(personId)   { return cxRoleFor(personId) === 'owner'; }
function cxIsShared(personId)  { return !!cxShareOf(personId); }
/** Info about the share a contact lives in, or null. */
function cxInfo(personId) {
    var sid = cxShareOf(personId);
    if (!sid) return null;
    return _cxOwn[sid] ? { shareId: sid, role: 'owner', rootId: _cxOwn[sid].personId, data: _cxOwn[sid].data }
                       : { shareId: sid, role: _cxWithMe[sid].role, ownerName: _cxWithMe[sid].ownerName, rootId: _cxWithMe[sid].personId, data: _cxWithMe[sid].data };
}
/** The share whose root contact is this one (the contact I shared), or null. */
function cxShareIdOfRoot(personId) {
    var ids = Object.keys(_cxOwn);
    for (var i = 0; i < ids.length; i++) if (_cxOwn[ids[i]].personId === personId) return ids[i];
    return null;
}

// ---------- pplCol: contacts' collections, private + my shares ----------

function _cxCol(name, sid) { return sid ? shareCol(sid, name) : userCol(name); }

/** Where a document of `name` lives: its share ID, or null for private. */
function _cxLocate(name, id) { return (_cxIdx[name] && _cxIdx[name][id]) || null; }

/** The real document reference for a document that already exists (sync; needs cxLoad done). */
function cxRef(name, id) { return _cxCol(name, _cxLocate(name, id)).doc(id); }

/** A new document reference for a row about contact `personId` (interactions, important dates): in the contact's share when it has one. */
function cxNewRef(name, personId) {
    var sid = personId ? cxShareOf(personId) : null;
    var ref = _cxCol(name, sid).doc();
    if (sid) _cxIdx[name][ref.id] = sid;
    return ref;
}

/** Which share a NEW row belongs to, from its data (person rows follow their parent, other rows follow their contact). */
function _cxShareForNew(name, data) {
    if (name === 'people') return data && data.parentPersonId ? cxShareOf(data.parentPersonId) : null;
    return data && data.personId ? cxShareOf(data.personId) : null;
}

function _PplQuery(name, ops) { this.name = name; this.ops = ops; }
['where', 'orderBy', 'limit'].forEach(function(m) {
    _PplQuery.prototype[m] = function() { return new _PplQuery(this.name, this.ops.concat([{ t: m, a: Array.prototype.slice.call(arguments) }])); };
});
_PplQuery.prototype._on = function(col) {
    var q = col;
    this.ops.forEach(function(op) { q = q[op.t].apply(q, op.a); });
    return q;
};
/** Runs the query on my private data and on every contact share I own; merges the results like one snapshot. */
_PplQuery.prototype.get = async function() {
    await cxLoad();
    var self = this;
    var sids = Object.keys(_cxOwn);
    // A query scoped to a contact that was shared WITH me (its family members, its interactions …) also reads that share
    Object.keys(_cxWithMe).forEach(function(sid) {
        var scoped = self.ops.some(function(o) {
            return o.t === 'where' && (o.a[0] === 'parentPersonId' || o.a[0] === 'personId') && o.a[1] === '==' && _cxIdx.people[o.a[2]] === sid;
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
/** A new document: in the contact's share when its parent contact / contact is shared, otherwise private. */
_PplQuery.prototype.add = async function(data) {
    await cxLoad();
    var sid = _cxShareForNew(this.name, data);
    var ref = await _cxCol(this.name, sid).add(data);
    if (sid) _cxIdx[this.name][ref.id] = sid;
    return ref;
};
_PplQuery.prototype.doc = function(id) {
    if (id === undefined) return userCol(this.name).doc();       // a fresh ID (callers that need a routed one use cxNewRef)
    return new _PplDoc(this.name, id);
};

function _PplDoc(name, id) { this.name = name; this.id = id; }
_PplDoc.prototype._ref = async function() { await cxLoad(); return cxRef(this.name, this.id); };
_PplDoc.prototype.get = async function() { return (await this._ref()).get(); };
_PplDoc.prototype.set = async function() { var r = await this._ref(); return r.set.apply(r, arguments); };
_PplDoc.prototype.update = async function() { var r = await this._ref(); return r.update.apply(r, arguments); };
_PplDoc.prototype.delete = async function() { var r = await this._ref(); var res = await r.delete(); delete _cxIdx[this.name][this.id]; return res; };

/** Use instead of userCol('people' | 'peopleInteractions' | 'peopleImportantDates'). */
function pplCol(name) { return new _PplQuery(name, []); }

/** Contact documents other people shared with me (root contacts only), for the Contacts list. */
async function cxSharedWithMeRoots() {
    await cxLoad();
    var out = [];
    var ids = Object.keys(_cxWithMe);
    for (var i = 0; i < ids.length; i++) {
        try {
            var d = await shareCol(ids[i], 'people').doc(_cxWithMe[ids[i]].personId).get();
            if (d.exists) out.push(d);
        } catch (err) { console.warn('Could not read a shared contact:', err); }
    }
    return out;
}

/** The share a photo / fact on a contact belongs to: the contact page's open contact, if it is in a share. */
function cxCurrentPersonShareId() {
    return window.currentPerson ? cxShareOf(window.currentPerson.id) : null;
}
/** May the person change photos / facts on the open contact? */
function cxCanEditCurrentPerson() {
    return window.currentPerson ? cxCanEdit(window.currentPerson.id) : true;
}

// ---------- Moving a contact into / out of a share ----------

/** The contact, its family tree and everything on them, read from `shareId` (or my private data when null). */
async function cxReadBundle(rootId, shareId) {
    var col = function(n) { return shareId ? shareCol(shareId, n) : userCol(n); };
    var rootDoc = await col('people').doc(rootId).get();
    if (!rootDoc.exists) throw new Error('That contact no longer exists.');
    var people = [rootDoc], queue = [rootId], seen = {};
    seen[rootId] = true;
    while (queue.length) {
        var pid = queue.shift();
        var kids = await col('people').where('parentPersonId', '==', pid).get();
        kids.docs.forEach(function(d) { if (!seen[d.id]) { seen[d.id] = true; people.push(d); queue.push(d.id); } });
    }
    var b = { rootId: rootId, people: people, interactions: [], dates: [], photos: [], facts: [] };
    for (var i = 0; i < people.length; i++) {
        var id = people[i].id;
        b.interactions = b.interactions.concat((await col('peopleInteractions').where('personId', '==', id).get()).docs);
        b.dates        = b.dates.concat((await col('peopleImportantDates').where('personId', '==', id).get()).docs);
        b.photos       = b.photos.concat((await col('photos').where('targetType', '==', 'person').where('targetId', '==', id).get()).docs);
        b.facts        = b.facts.concat((await col('facts').where('targetType', '==', 'person').where('targetId', '==', id).get()).docs);
    }
    return b;
}

function _cxCounts(b) {
    return { people: b.people.length, interactions: b.interactions.length, dates: b.dates.length, photos: b.photos.length, facts: b.facts.length };
}

/** [{ref, data}] writing the bundle into `destShareId` (or private when null). */
function _cxOps(b, destShareId) {
    var col = function(n) { return destShareId ? shareCol(destShareId, n) : userCol(n); };
    var ops = [];
    function add(docs, name) { docs.forEach(function(d) { ops.push({ ref: col(name).doc(d.id), data: d.data() }); }); }
    add(b.people, 'people'); add(b.interactions, 'peopleInteractions'); add(b.dates, 'peopleImportantDates');
    add(b.photos, 'photos'); add(b.facts, 'facts');
    return ops;
}

function _cxAllRefs(b) {
    return [].concat(b.people, b.interactions, b.dates, b.photos, b.facts).map(function(d) { return d.ref; });
}

function _cxBackupJson(b, kind) {
    function rows(docs) { return docs.map(function(d) { return { id: d.id, data: backupSerialize(d.data()) }; }); }
    return { version: 1, type: 'contact-' + kind, exportedAt: new Date().toISOString(), rootId: b.rootId,
             people: rows(b.people), peopleInteractions: rows(b.interactions), peopleImportantDates: rows(b.dates),
             photos: rows(b.photos), facts: rows(b.facts) };
}

function _cxStamp() { return new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16); }
function _cxBackupName(name) { return 'Bishop_Contact_' + (name || 'Contact').replace(/[^A-Za-z0-9]+/g, '_') + '_Backup_' + _cxStamp() + '.json'; }

/** Deletes everything in a contact share (all collections), then optionally the share document. */
async function cxPurgeShare(shareId, alsoShareDoc) {
    for (var i = 0; i < CX_SHARE_COLS.length; i++) {
        var snap = await shareCol(shareId, CX_SHARE_COLS[i]).get();
        await shBatchDelete(snap.docs.map(function(d) { return d.ref; }));
    }
    if (alsoShareDoc) await topCol('shares').doc(shareId).delete();
}

/** Share a contact (with its family tree) with the groups in `shareGroups` (owner). Returns the share ID. */
async function cxSharePerson(personId, shareGroups) {
    await cxLoad(true);
    var me = _shMyUid();
    var groups = await _shLoadGroups();
    var flat = shFlatten(shareGroups, groups, me, await shGetMyName());

    _shProgress('Reading the contact…');
    var bundle = await cxReadBundle(personId, null);
    var root = bundle.people[0].data();
    if (root.isMe) throw new Error('The "Me" contact cannot be shared.');
    for (var i = 1; i < bundle.people.length; i++) {
        if (cxShareOf(bundle.people[i].id)) throw new Error('A family member under this contact is already shared on its own. Stop sharing them first.');
    }
    var name = root.name || 'Contact';

    _shProgress('Saving a backup file…');
    backupDownload(_cxBackupName(name), _cxBackupJson(bundle, 'before-share'));

    var shareId = db.collection('shares').doc().id;
    var created = false;
    try {
        _shProgress('Creating the shared area…');
        await topCol('shares').doc(shareId).set({           // its own write, before anything goes inside (the rules read it)
            ownerUid: me, kind: 'contact', title: name, personId: personId,
            shareGroups: shareGroups, viewerUids: flat.viewerUids, editorUids: flat.editorUids, names: flat.names,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        created = true;
        await shBatchSet(_cxOps(bundle, shareId), function(n, total) { _shProgress('Copying… ' + n + ' of ' + total); });

        _shProgress('Checking the copy…');
        var check = await cxReadBundle(personId, shareId);
        if (JSON.stringify(_cxCounts(check)) !== JSON.stringify(_cxCounts(bundle))) {
            throw new Error('The copy does not match the original (' + JSON.stringify(_cxCounts(check)) + ' instead of ' + JSON.stringify(_cxCounts(bundle)) + ').');
        }
    } catch (err) {
        console.error('cxSharePerson failed, rolling back:', err);
        _shProgress('Something went wrong — undoing. Your contact has not been changed.', true);
        if (created) { try { await cxPurgeShare(shareId, true); } catch (e2) { console.error('rollback failed:', e2); } }
        throw err;
    }

    try {
        _shProgress('Removing the private copy…');
        await shBatchDelete(_cxAllRefs(bundle));
    } catch (err) {
        console.error('Could not remove the private originals:', err);
        throw new Error('Shared, but the private copy could not be fully removed (' + err.message + '). Nothing is lost; open Contacts and try again, or tell the developer.');
    }
    await cxLoad(true);
    return shareId;
}

/** Stop sharing a contact (owner): it, its family tree and everything others changed come back to my private data. */
async function cxUnsharePerson(shareId) {
    var entry = _cxOwn[shareId];
    if (!entry) throw new Error('That is not one of your shared contacts.');
    var personId = entry.personId;

    _shProgress('Reading the shared contact…');
    var bundle = await cxReadBundle(personId, shareId);
    var name = bundle.people[0].data().name || 'Contact';

    _shProgress('Saving a backup file…');
    backupDownload(_cxBackupName(name), _cxBackupJson(bundle, 'before-unshare'));

    var ops = _cxOps(bundle, null);
    try {
        await shBatchSet(ops, function(n, total) { _shProgress('Moving back… ' + n + ' of ' + total); });
        _shProgress('Checking the copy…');
        var check = await cxReadBundle(personId, null);
        if (JSON.stringify(_cxCounts(check)) !== JSON.stringify(_cxCounts(bundle))) throw new Error('The copy does not match.');
    } catch (err) {
        console.error('cxUnsharePerson failed, rolling back:', err);
        _shProgress('Something went wrong — undoing. The contact is still shared.', true);
        try { await shBatchDelete(ops.map(function(o) { return o.ref; })); } catch (e2) { console.error('rollback failed:', e2); }
        throw err;
    }
    _shProgress('Removing the shared copy…');
    await cxPurgeShare(shareId, true);
    await cxLoad(true);
}

/** After the owner deleted a shared contact: remove what is left in its share (photos, facts) and the share document. */
async function cxFinishDelete(rootId) {
    var sid = cxShareIdOfRoot(rootId);
    if (!sid) return;
    await cxPurgeShare(sid, true);
    await cxLoad(true);
}
