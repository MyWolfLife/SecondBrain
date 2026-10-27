// ============================================================
// sharefin.js — Financial people in shares (Shared Financial, chunk F2)
//
// A person tracked under Life → Financial (my wife, Danielle, Stephen …) can be shared, with their
// accounts, holdings, Social Security, and the Financial group that holds only them. Plan:
// SharedFinancialPlan.md. A shared person is one share of kind 'financialPerson':
//
//   shares/{shareId}: kind 'financialPerson', personId (the owner's contact ID for this person),
//                     personName, title, shareGroups, viewerUids[], editorUids[], names{}
//   shares/{shareId}/accounts/{accountId}                 same fields as investments/{ns}/accounts
//   shares/{shareId}/accounts/{accountId}/holdings/{id}   same fields as the private holdings
//   shares/{shareId}/ssBenefits | investmentSnapshots | investmentGroups | investmentConfig
//
// "Namespace" (ns) is what investments.js already calls the person: 'self' or a contact ID.
// Here a third kind exists: 'share:<shareId>' = a person someone else shared with me. For the owner
// the ns stays the contact ID; once that person is shared, finShareIdFor(ns) points it at the share
// (the data moved there), so the same code works either way.
//
// Everything below is plumbing: with no financialPerson share nothing changes for anyone.
// ============================================================

var FIN_NS_PREFIX = 'share:';
var FIN_HOUSEHOLD = 'household';     // the "person" id of the shared joint accounts (personId of that share)
var _finOwn    = {};        // {personId: shareId} person shares I own (their data lives in the share)
var _finWithMe = [];        // [{ns, shareId, name, personName, ownerName, role, data}] people shared with me
var _finLoaded = false;


/** True for a 'share:<id>' namespace (a person someone else shared with me). */
function finIsShareNs(ns) {
    return typeof ns === 'string' && ns.indexOf(FIN_NS_PREFIX) === 0;
}

/**
 * Finds the financial-person shares I own and the ones shared with me. Call (and await) before using
 * the helpers below; it caches, so pass force=true after sharing / stopping.
 */
async function finLoad(force) {
    if (_finLoaded && !force) return;
    var mine = (await shLoadMyShares()).filter(function(s) { return s.kind === 'financialPerson'; });
    var withMe = (await shLoadSharedWithMe()).filter(function(s) { return s.kind === 'financialPerson'; });
    _finOwn = {};
    _finOwnList = mine.map(function(s) { return { id: s.id, personId: s.data.personId, data: s.data }; });
    mine.forEach(function(s) { if (s.data.personId) _finOwn[s.data.personId] = s.id; });
    _finWithMe = withMe.map(function(s) {
        var personName = s.data.personName || 'Someone';
        return {
            ns: FIN_NS_PREFIX + s.id, shareId: s.id, role: s.role, data: s.data,
            personName: personName, ownerName: s.ownerName,
            name: personName + ' (shared by ' + s.ownerName + ')'
        };
    }).sort(function(a, b) { return a.name.localeCompare(b.name); });
    _finLoaded = true;
}

/** The share a namespace lives in, or null when it is in my private data. */
function finShareIdFor(ns) {
    if (finIsShareNs(ns)) return ns.slice(FIN_NS_PREFIX.length);
    return _finOwn[ns] || null;
}

/** The people shared with me as drop-down entries: [{id: ns, name}] (not part of "my enrolled people"). */
function finSharedPeople() {
    return _finWithMe.map(function(p) { return { id: p.ns, name: p.name }; });
}

/** The display name for a namespace when it is a shared person, else null. */
function finSharedName(ns) {
    var p = _finWithMe.filter(function(x) { return x.ns === ns; })[0];
    return p ? p.name : null;
}

/** 'owner' (my own data, shared or not) | 'edit' | 'view'. */
function finRoleFor(ns) {
    if (!finIsShareNs(ns)) return 'owner';
    var p = _finWithMe.filter(function(x) { return x.ns === ns; })[0];
    return p ? p.role : 'view';
}

function finCanEdit(ns) { return finRoleFor(ns) !== 'view'; }
function finIsOwner(ns) { return finRoleFor(ns) === 'owner'; }

/** The accounts collection of a person: private, or inside their share. */
function finAcctCol(ns) {
    var sid = finShareIdFor(ns);
    return sid ? shareCol(sid, 'accounts') : userCol('investments').doc(ns).collection('accounts');
}

/** The holdings of one account. */
function finHoldingCol(ns, accountId) {
    return finAcctCol(ns).doc(accountId).collection('holdings');
}

/**
 * Another per-person collection ('ssBenefits', 'investmentSnapshots', 'investmentGroups',
 * 'investmentConfig'): the share's copy for a shared person, otherwise my private one.
 */
function finCol(ns, name) {
    var sid = finShareIdFor(ns);
    return sid ? shareCol(sid, name) : userCol(name);
}

/** After a person is shared or unshared, or the people shared with me changed. */
async function finRefresh() {
    await finLoad(true);
}

// ---------- Groups, snapshots and settings of a shared person (F3) ----------
// A Financial group (investmentGroups) holding only the shared person moves into the share with its
// snapshots and its all-time-high settings. investments.js loads those groups next to the private
// ones; a group carries _shareId (and _role) when it lives in a share.

var _finOwnList = [];       // [{id, personId, data}] financial-person shares I own
var _finShareConfigs = {};  // {shareId: investmentConfig/main data} for the shares loaded by finLoadSharedGroups

/** The groups that live in person shares (mine and shared with me): [{id, ...fields, _shareId, _role}]. */
async function finLoadSharedGroups() {
    await finLoad();
    var shares = _finOwnList.map(function(s) { return { id: s.id, role: 'owner' }; })
        .concat(_finWithMe.map(function(p) { return { id: p.shareId, role: p.role }; }));
    var groups = [];
    _finShareConfigs = {};
    for (var i = 0; i < shares.length; i++) {
        var gs = await shareCol(shares[i].id, 'investmentGroups').get();
        gs.forEach(function(d) {
            groups.push(Object.assign({ id: d.id }, d.data(), { _shareId: shares[i].id, _role: shares[i].role }));
        });
        var cfg = await shareCol(shares[i].id, 'investmentConfig').doc('main').get();
        if (cfg.exists) _finShareConfigs[shares[i].id] = cfg.data();
    }
    return groups;
}

/** Copies the all-time-high settings of shared groups into the config object investments.js reads. */
function finMergeShareConfigs(config) {
    Object.keys(_finShareConfigs).forEach(function(sid) {
        var d = _finShareConfigs[sid];
        Object.keys(d).forEach(function(k) { if (k.indexOf('allTimeHigh') === 0) config[k] = d[k]; });
    });
}

/** 'owner' | 'edit' | 'view' for a group (private groups and groups in my own shares are 'owner'). */
function finGroupRole(group) {
    if (!group || !group._shareId) return 'owner';
    return group._role || 'view';
}
function finGroupCanEdit(group) { return finGroupRole(group) !== 'view'; }

/** A group's own place for a per-group collection ('investmentSnapshots' | 'investmentConfig' | 'investmentGroups'). */
function finGroupCol(group, name) {
    return (group && group._shareId) ? shareCol(group._shareId, name) : userCol(name);
}

/**
 * The namespace to read a person of this group from: the person's own ns for private groups and
 * groups in my own shares; 'share:<id>' for the person of a group someone shared with me;
 * null for anyone else in such a group (not part of what was shared).
 */
function finGroupNs(group, personId) {
    if (!group || !group._shareId) return personId;
    var p = _finWithMe.filter(function(x) { return x.shareId === group._shareId; })[0];
    if (!p) return personId;                                     // a group in my own share
    return personId === p.data.personId ? p.ns : null;
}

/** The person's display name inside a shared group, or null. */
function finGroupPersonName(group, personId) {
    if (!group || !group._shareId) return null;
    var p = _finWithMe.filter(function(x) { return x.shareId === group._shareId; })[0];
    return (p && personId === p.data.personId) ? p.personName : null;
}

/** The person ID rows are stored under: for 'share:<id>' the owner's person ID of that share, else the ns itself. */
function finPersonIdOf(ns) {
    if (!finIsShareNs(ns)) return ns;
    var p = _finWithMe.filter(function(x) { return x.ns === ns; })[0];
    return p ? p.data.personId : ns;
}

// ---------- Sensitive info of a shared person (F4) ----------
// An account's account number / username / password are locked, not with a passphrase key, but with
// the share's DATA KEY when the account lives in a share (sharekeys.js): every person with access
// opens their own envelope with their own passphrase, and the envelope opens the one stored copy.
// Accounts that are not in a share stay locked with the owner's passphrase key, as before.

var FIN_SENSITIVE_FIELDS = ['accountNumberEnc', 'usernameEnc', 'passwordEnc'];

/**
 * The lock for a person's accounts: {state: 'ok', encrypt(text), decrypt(b64)} or a state explaining why not:
 *   'locked'  — the passphrase is not unlocked yet (ask for it, then try again)
 *   'waiting' — I am in the share but have no envelope yet (the owner has not finished giving me access)
 *   'stale'   — my envelope does not open with my key (my key changed; ask the owner to re-send access)
 * `decrypt` also tries the owner's previous key while a key replacement is unfinished.
 */
async function finCipher(ns) {
    if (!legacyIsUnlocked()) return { state: 'locked' };
    var sid = finShareIdFor(ns);
    if (!sid) return { state: 'ok', encrypt: legacyEncrypt, decrypt: legacyDecrypt };
    var keys;
    try {
        keys = (finRoleFor(ns) === 'owner') ? await skOpenShareKeys(sid)
             : { key: await skOpenShareKey(sid), prev: null };
    } catch (err) {
        if (err && err.name === 'SkLocked') return { state: 'locked' };
        console.error('Could not open the shared key:', err);
        return { state: 'stale' };
    }
    if (!keys || !keys.key) return { state: 'waiting' };
    return {
        state: 'ok',
        encrypt: function(text) { return skEncrypt(keys.key, text); },
        decrypt: async function(b64) {
            var plain = await skDecrypt(keys.key, b64);
            if (plain === null && keys.prev) plain = await skDecrypt(keys.prev, b64);
            return plain;
        }
    };
}

/** Plain-language text for a non-ok finCipher state. */
function finCipherMessage(state) {
    if (state === 'waiting') return 'You do not have access to the sensitive info yet. The owner needs to open Financial once to give it to you.';
    if (state === 'stale') return 'Your sharing key has changed, so the sensitive info cannot be opened. Ask the owner to re-send your access.';
    return 'Unlock your passphrase first.';
}

/**
 * Returns a copy of an account document with its sensitive fields converted: each is opened with
 * `decryptFn` and locked again with `encryptFn` (sharing a person, stopping, or replacing the key).
 * A field that cannot be opened throws, so nothing is half converted.
 */
async function finConvertFields(data, decryptFn, encryptFn) {
    var out = Object.assign({}, data);
    for (var i = 0; i < FIN_SENSITIVE_FIELDS.length; i++) {
        var f = FIN_SENSITIVE_FIELDS[i];
        if (!out[f]) continue;
        var plain = await decryptFn(out[f]);
        if (plain === null || plain === undefined) throw new Error('Could not open ' + f + ' on "' + (out.nickname || 'an account') + '".');
        out[f] = await encryptFn(plain);
    }
    return out;
}

/** True when the document has any sensitive field. */
function finHasSensitive(data) {
    return FIN_SENSITIVE_FIELDS.some(function(f) { return !!data[f]; });
}

/**
 * Owner: makes the envelopes match who is in the share (owner + viewers + editors). Needs my
 * passphrase unlocked. Missing envelopes are made (a person with no published key is "waiting").
 * If someone has lost access, the data key is REPLACED: every account is re-locked with a new key
 * (the owner's envelope keeps the old key until that is finished, so a failure cannot lose anything),
 * and only the people who remain get envelopes for the new key.
 * Returns {granted: [uid], waiting: [uid], removed: [uid], rotated: bool}.
 */
async function finSyncAccess(shareId) {
    var me = _shMyUid();
    var shareSnap = await topCol('shares').doc(shareId).get();
    if (!shareSnap.exists) throw new Error('That share no longer exists.');
    var share = shareSnap.data();
    if (share.ownerUid !== me) throw new Error('Only the owner can change who has access.');

    var want = {};
    want[me] = true;
    (share.viewerUids || []).forEach(function(u) { want[u] = true; });
    (share.editorUids || []).forEach(function(u) { want[u] = true; });

    var st = await finAccessStatus(shareId);      // missing / stale (their key changed) / removed envelopes
    var removed = st.removed;
    var keys = await skOpenShareKeys(shareId);
    var result = { granted: [], waiting: [], removed: removed, rotated: false };

    if (!keys) {                       // first time for this share: make the key and my own envelope
        keys = { key: await skCreateShareKey(shareId), prev: null };
    }
    var dk = keys.key;

    if (removed.length) {
        // Someone lost access: replace the key. The old key stays in my envelope until every account is re-locked.
        var pair = await skLoadMyKeyPair();
        var newKey = await skNewDataKey();
        await shareCol(shareId, 'keyEnvelopes').doc(me).set({
            forUid: me, wrappedKey: await skWrapDataKey(newKey, pair.publicKey),
            prevWrappedKey: await skWrapDataKey(dk, pair.publicKey),
            createdBy: me, createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        var accts = await shareCol(shareId, 'accounts').get();
        var ops = [];
        for (var i = 0; i < accts.docs.length; i++) {
            var d = accts.docs[i].data();
            if (!finHasSensitive(d)) continue;
            var converted = await finConvertFields(d, function(b64) { return skDecrypt(dk, b64); }, function(t) { return skEncrypt(newKey, t); });
            ops.push({ ref: accts.docs[i].ref, data: converted });
        }
        await shBatchSet(ops);
        // Everyone who remains gets an envelope for the new key; mine drops the old key; removed people lose theirs
        var others = Object.keys(want).filter(function(u) { return u !== me; });
        var granted = await skGrantAccess(shareId, newKey, others);
        result.granted = granted.ok;
        result.waiting = granted.waiting;
        await shareCol(shareId, 'keyEnvelopes').doc(me).set({
            forUid: me, wrappedKey: await skWrapDataKey(newKey, pair.publicKey),
            createdBy: me, createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        for (var r = 0; r < removed.length; r++) await skRevokeAccess(shareId, removed[r]);
        _skShareKeys[shareId] = newKey;
        result.rotated = true;
        return result;
    }

    var missing = st.missing.concat(st.stale);    // stale = their key changed after their envelope was made: make it again
    var g = await skGrantAccess(shareId, dk, missing);
    result.granted = g.ok;
    result.waiting = g.waiting;
    return result;
}

/** Owner: makes a new envelope for one person (for example after they reset their passphrase and made a new key). */
async function finRegrant(shareId, uid) {
    var keys = await skOpenShareKeys(shareId);
    if (!keys) throw new Error('This share has no key yet.');
    return skGrantAccess(shareId, keys.key, [uid]);
}

// ---------- Sharing and stopping a person (F5) ----------
// Sharing person P moves everything that belongs to them into a new share (kind 'financialPerson'),
// same document IDs: their accounts with holdings, their Social Security rows, the Financial group
// that holds ONLY them with its snapshots and its all-time-high settings. Joint accounts and groups of
// several people stay private (they are household things). The sensitive fields of the accounts are
// re-locked from my passphrase key to the share's data key on the way in, and back on the way out.
// Same safety steps as the Yard / House: backup file first, copy, check the counts, only then delete
// the originals, undo everything if a step fails.

function _finIsSoloGroup(g, personId) {
    return (g.personIds || []).length === 1 && g.personIds[0] === personId;
}

/** Everything that belongs to one person, from the private area (shareId null) or from their share. */
async function finReadPersonBundle(personId, shareId) {
    // The Household (joint accounts) is a "person" whose private accounts are the joint ones stored under 'self'
    var isHousehold = personId === FIN_HOUSEHOLD;
    var acctCol = shareId ? shareCol(shareId, 'accounts') : userCol('investments').doc(isHousehold ? 'self' : personId).collection('accounts');
    var acctSnap = await acctCol.get();
    var acctDocs = acctSnap.docs.filter(function(d) { return !isHousehold || shareId || d.data().ownerType === 'joint'; });
    var holdings = [];
    for (var i = 0; i < acctDocs.length; i++) {
        var hs = await acctDocs[i].ref.collection('holdings').get();
        hs.docs.forEach(function(h) { holdings.push({ acctId: acctDocs[i].id, doc: h }); });
    }
    if (isHousehold) return { accts: acctDocs, holdings: holdings, ss: [], groups: [], snaps: [], ath: {} };
    function col(name) { return shareId ? shareCol(shareId, name) : userCol(name); }
    var ss = (await col('ssBenefits').get()).docs.filter(function(d) { return d.data().personId === personId; });
    var groups = (await col('investmentGroups').get()).docs.filter(function(d) { return _finIsSoloGroup(d.data(), personId); });
    var groupIds = {};
    groups.forEach(function(g) { groupIds[g.id] = true; });
    var snaps = (await col('investmentSnapshots').get()).docs.filter(function(d) { return groupIds[d.data().groupId]; });
    var cfg = await col('investmentConfig').doc('main').get();
    var ath = {};
    if (cfg.exists) {
        Object.keys(cfg.data()).forEach(function(k) {
            var m = /^allTimeHigh[A-Za-z]+_(.+)$/.exec(k);
            if (m && groupIds[m[1]]) ath[k] = cfg.data()[k];
        });
    }
    return { accts: acctDocs, holdings: holdings, ss: ss, groups: groups, snaps: snaps, ath: ath };
}

function _finBundleCounts(b) {
    return { accounts: b.accts.length, holdings: b.holdings.length, ss: b.ss.length,
             groups: b.groups.length, snapshots: b.snaps.length, ath: Object.keys(b.ath).length };
}

function _finBundleBackup(b, convertedAccts, kind, personId, personName) {
    function rows(docs) { return docs.map(function(d) { return { id: d.id, data: backupSerialize(d.data()) }; }); }
    return {
        version: 1, type: 'financial-person-' + kind, exportedAt: new Date().toISOString(),
        personId: personId, personName: personName,
        accounts: rows(b.accts), holdings: b.holdings.map(function(h) { return { acctId: h.acctId, id: h.doc.id, data: backupSerialize(h.doc.data()) }; }),
        ssBenefits: rows(b.ss), investmentGroups: rows(b.groups), investmentSnapshots: rows(b.snaps),
        allTimeHighs: backupSerialize(b.ath)
    };
}

/** Deletes everything inside a financial-person share (not the share document). */
async function finDeleteShareContents(shareId) {
    var accts = await shareCol(shareId, 'accounts').get();
    for (var i = 0; i < accts.docs.length; i++) {
        var hs = await accts.docs[i].ref.collection('holdings').get();
        await shBatchDelete(hs.docs.map(function(d) { return d.ref; }));
    }
    await shBatchDelete(accts.docs.map(function(d) { return d.ref; }));
    var names = ['ssBenefits', 'investmentGroups', 'investmentSnapshots', 'investmentConfig', 'keyEnvelopes'];
    for (var n = 0; n < names.length; n++) {
        var snap = await shareCol(shareId, names[n]).get();
        await shBatchDelete(snap.docs.map(function(d) { return d.ref; }));
    }
}

function _finStamp() { return new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16); }

/**
 * Share person `personId` (a contact I track) with the groups in `shareGroups`. Needs my passphrase
 * unlocked (it re-locks their sensitive fields). Returns {shareId, access} where access is the
 * finSyncAccess result (people who have not set up a key yet are "waiting").
 */
async function finSharePerson(personId, personName, shareGroups) {
    if (!legacyIsUnlocked()) { var e = new Error('Unlock your passphrase first.'); e.name = 'SkLocked'; throw e; }
    if (!personId || personId === 'self') throw new Error('Only people you track (not "Me") can be shared.');
    if (finShareIdFor(personId)) throw new Error('This person is already shared.');
    var me = _shMyUid();
    var groups = await _shLoadGroups();
    var flat = shFlatten(shareGroups, groups, me, await shGetMyName());

    _shProgress('Reading ' + personName + '…');
    var bundle = await finReadPersonBundle(personId, null);
    var dk = await skNewDataKey();

    // Re-lock every account's sensitive fields with the new data key BEFORE anything is written (fails early, changes nothing)
    _shProgress('Locking the sensitive info with the shared key…');
    var converted = [];
    for (var i = 0; i < bundle.accts.length; i++) {
        converted.push(await finConvertFields(bundle.accts[i].data(), legacyDecrypt, function(t) { return skEncrypt(dk, t); }));
    }

    _shProgress('Saving a backup file…');
    backupDownload('Bishop_Financial_' + personName.replace(/[^A-Za-z0-9]+/g, '_') + '_Backup_' + _finStamp() + '.json',
                   _finBundleBackup(bundle, converted, 'before-share', personId, personName));

    var shareId = db.collection('shares').doc().id;
    var created = false;
    try {
        _shProgress('Creating the shared area…');
        await topCol('shares').doc(shareId).set({           // its own write, before anything goes inside (the rules read it)
            ownerUid: me, kind: 'financialPerson', title: 'Financial — ' + personName,
            personId: personId, personName: personName,
            shareGroups: shareGroups, viewerUids: flat.viewerUids, editorUids: flat.editorUids, names: flat.names,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        created = true;
        await skCreateShareKey(shareId, dk);                // my own envelope

        var ops = [];
        bundle.accts.forEach(function(d, idx) { ops.push({ ref: shareCol(shareId, 'accounts').doc(d.id), data: converted[idx] }); });
        bundle.holdings.forEach(function(h) { ops.push({ ref: shareCol(shareId, 'accounts').doc(h.acctId).collection('holdings').doc(h.doc.id), data: h.doc.data() }); });
        bundle.ss.forEach(function(d) { ops.push({ ref: shareCol(shareId, 'ssBenefits').doc(d.id), data: d.data() }); });
        bundle.groups.forEach(function(d) { ops.push({ ref: shareCol(shareId, 'investmentGroups').doc(d.id), data: d.data() }); });
        bundle.snaps.forEach(function(d) { ops.push({ ref: shareCol(shareId, 'investmentSnapshots').doc(d.id), data: d.data() }); });
        if (Object.keys(bundle.ath).length) ops.push({ ref: shareCol(shareId, 'investmentConfig').doc('main'), data: bundle.ath });
        await shBatchSet(ops, function(n, total) { _shProgress('Copying… ' + n + ' of ' + total); });

        _shProgress('Checking the copy…');
        var check = await finReadPersonBundle(personId, shareId);
        var a = _finBundleCounts(bundle), b = _finBundleCounts(check);
        if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error('The copy does not match the original (' + JSON.stringify(b) + ' instead of ' + JSON.stringify(a) + ').');
    } catch (err) {
        console.error('finSharePerson failed, rolling back:', err);
        _shProgress('Something went wrong — undoing. Nothing has been changed.', true);
        if (created) { try { await finDeleteShareContents(shareId); await topCol('shares').doc(shareId).delete(); } catch (e2) { console.error('rollback failed:', e2); } }
        throw err;
    }

    // The copy is verified: give people their envelopes, then remove the private originals
    _shProgress('Giving people access…');
    var access = await finSyncAccess(shareId);
    try {
        _shProgress('Removing the private copy…');
        await shBatchDelete(bundle.holdings.map(function(h) { return h.doc.ref; }));
        await shBatchDelete(bundle.accts.map(function(d) { return d.ref; }));
        await shBatchDelete(bundle.ss.map(function(d) { return d.ref; }));
        await shBatchDelete(bundle.snaps.map(function(d) { return d.ref; }));
        await shBatchDelete(bundle.groups.map(function(d) { return d.ref; }));
        var athKeys = Object.keys(bundle.ath);
        if (athKeys.length) {
            var del = {};
            athKeys.forEach(function(k) { del[k] = firebase.firestore.FieldValue.delete(); });
            await userCol('investmentConfig').doc('main').update(del);
        }
    } catch (err) {
        console.error('Could not remove the private originals:', err);
        throw new Error('Shared, but the private copy could not be fully removed (' + err.message + '). Nothing is lost; open Financial and share again, or tell the developer.');
    }
    await finRefresh();
    return { shareId: shareId, access: access };
}

/**
 * Stop sharing a person (owner): everything, including what other people added or changed, goes back
 * to my private area and the sensitive fields are locked with my passphrase key again. Needs the
 * passphrase unlocked.
 */
async function finUnsharePerson(shareId) {
    if (!legacyIsUnlocked()) { var e = new Error('Unlock your passphrase first.'); e.name = 'SkLocked'; throw e; }
    var own = _finOwnList.filter(function(s) { return s.id === shareId; })[0];
    if (!own) throw new Error('That is not one of your shared people.');
    var personId = own.personId, personName = own.data.personName || 'this person';
    var ns = personId;                                  // maps to the share while it exists
    _shProgress('Reading the shared ' + personName + '…');
    var bundle = await finReadPersonBundle(personId, shareId);

    _shProgress('Unlocking the sensitive info…');
    var cipher = await finCipher(ns);
    if (cipher.state !== 'ok') throw new Error(finCipherMessage(cipher.state));
    var converted = [];
    for (var i = 0; i < bundle.accts.length; i++) {
        converted.push(await finConvertFields(bundle.accts[i].data(), cipher.decrypt, legacyEncrypt));
    }

    _shProgress('Saving a backup file…');
    backupDownload('Bishop_Financial_' + personName.replace(/[^A-Za-z0-9]+/g, '_') + '_Backup_' + _finStamp() + '.json',
                   _finBundleBackup(bundle, converted, 'before-unshare', personId, personName));

    var acctCol = userCol('investments').doc(personId === FIN_HOUSEHOLD ? 'self' : personId).collection('accounts');
    var ops = [];
    bundle.accts.forEach(function(d, idx) { ops.push({ ref: acctCol.doc(d.id), data: converted[idx] }); });
    bundle.holdings.forEach(function(h) { ops.push({ ref: acctCol.doc(h.acctId).collection('holdings').doc(h.doc.id), data: h.doc.data() }); });
    bundle.ss.forEach(function(d) { ops.push({ ref: userCol('ssBenefits').doc(d.id), data: d.data() }); });
    bundle.groups.forEach(function(d) { ops.push({ ref: userCol('investmentGroups').doc(d.id), data: d.data() }); });
    bundle.snaps.forEach(function(d) { ops.push({ ref: userCol('investmentSnapshots').doc(d.id), data: d.data() }); });
    try {
        await shBatchSet(ops, function(n, total) { _shProgress('Moving back… ' + n + ' of ' + total); });
        if (Object.keys(bundle.ath).length) await userCol('investmentConfig').doc('main').set(bundle.ath, { merge: true });
        _shProgress('Checking the copy…');
        var check = await finReadPersonBundle(personId, null);
        var a = _finBundleCounts(bundle), b = _finBundleCounts(check);
        if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error('The copy does not match (' + JSON.stringify(b) + ' instead of ' + JSON.stringify(a) + ').');
    } catch (err) {
        console.error('finUnsharePerson failed, rolling back:', err);
        _shProgress('Something went wrong — undoing. The person is still shared.', true);
        try { await shBatchDelete(ops.map(function(o) { return o.ref; })); } catch (e2) { console.error('rollback failed:', e2); }
        throw err;
    }
    _shProgress('Removing the shared copy…');
    await finDeleteShareContents(shareId);
    await topCol('shares').doc(shareId).delete();
    await finRefresh();
}

/**
 * Who needs an envelope change: {missing: [uid] (in the share, no envelope), stale: [uid] (their key
 * changed after their envelope was made), removed: [uid] (have an envelope but no longer in the share)}.
 */
async function finAccessStatus(shareId) {
    var me = _shMyUid();
    var share = (await topCol('shares').doc(shareId).get()).data();
    var want = {};
    (share.viewerUids || []).forEach(function(u) { want[u] = true; });
    (share.editorUids || []).forEach(function(u) { want[u] = true; });
    var envSnap = await shareCol(shareId, 'keyEnvelopes').get();
    var env = {};
    envSnap.docs.forEach(function(d) { env[d.id] = d.data(); });
    var status = { missing: [], stale: [], removed: [] };
    Object.keys(want).forEach(function(u) { if (!env[u]) status.missing.push(u); });
    Object.keys(env).forEach(function(u) { if (u !== me && !want[u]) status.removed.push(u); });
    var members = Object.keys(want).filter(function(u) { return env[u]; });
    for (var i = 0; i < members.length; i++) {
        var pk = await topCol('publicKeys').doc(members[i]).get();
        var pkMs = pk.exists && pk.data().updatedAt && pk.data().updatedAt.toMillis ? pk.data().updatedAt.toMillis() : 0;
        var envMs = env[members[i]].createdAt && env[members[i]].createdAt.toMillis ? env[members[i]].createdAt.toMillis() : 0;
        if (pkMs > envMs) status.stale.push(members[i]);
    }
    return status;
}

/** For the owner's Accounts page: the plain-language line when access needs updating, else ''. */
async function finAccessNotice(shareId) {
    var st = await finAccessStatus(shareId);
    var share = (await topCol('shares').doc(shareId).get()).data();
    var names = share.names || {};
    function list(uids) { return uids.map(function(u) { return names[u] || 'someone'; }).join(', '); }
    var parts = [];
    if (st.removed.length) parts.push('Access was removed for ' + st.removed.length + (st.removed.length === 1 ? ' person' : ' people') + ' — the shared key has to be replaced so they cannot open the sensitive info.');
    if (st.stale.length) parts.push(list(st.stale) + ' made a new key — their access has to be re-sent.');
    if (st.missing.length) parts.push(list(st.missing) + ' ' + (st.missing.length === 1 ? 'has' : 'have') + ' not been given access to the sensitive info yet.');
    return parts.join(' ');
}

/** Plain-language result of giving people access: '' when everything is done. */
function _finAccessResultText(res) {
    if (!res) return '';
    var parts = [];
    if (res.rotated) parts.push('The shared key was replaced, so people who lost access can no longer open the account numbers and passwords.');
    if (res.waiting && res.waiting.length) {
        parts.push(res.waiting.length + (res.waiting.length === 1 ? ' person has' : ' people have') +
            ' not set up a sharing key yet, so ' + (res.waiting.length === 1 ? 'they cannot' : 'they cannot') +
            ' open the account numbers and passwords yet. Each needs to open Financial and unlock their passphrase once; then use "Update access" on your Accounts page.');
    }
    return parts.join('\n\n');
}

// ---------- Backup and restore of my shared Financial people and Household (F7) ----------
// Added to the Data backup file as the extra key sharedFinancial: one entry per person (or the
// Household) I have shared. The private backup of investments misses them because their data lives
// in the share. Each entry carries the person's accounts + holdings, Social Security rows, their own
// group with snapshots and all-time highs.
// The sensitive fields are saved in one of two ways:
//   mode 'passphrase'  — my passphrase was unlocked: they were re-locked with my passphrase key, so a
//                        restore needs nothing (same as every other private account);
//   mode 'shared-key'  — my passphrase was locked: they are saved as stored (locked with the share's
//                        data key) together with my envelope for that key; a restore then needs my
//                        passphrase unlocked to open the envelope and re-lock them.
// Restored as PRIVATE data (share again if you want), skipping anyone who is still shared.

async function finBackupShared() {
    await finLoad(true);
    if (!_finOwnList.length) return null;
    var me = _shMyUid();
    var unlocked = legacyIsUnlocked();
    var out = [];
    for (var i = 0; i < _finOwnList.length; i++) {
        var s = _finOwnList[i];
        var b = await finReadPersonBundle(s.personId, s.id);
        var j = _finBundleBackup(b, null, 'backup', s.personId, s.data.personName || s.personId);
        var hasSensitive = b.accts.some(function(d) { return finHasSensitive(d.data()); });
        var mode = 'passphrase', envelope = null;
        if (hasSensitive) {
            if (unlocked) {
                var cipher = await finCipher(s.personId);
                if (cipher.state !== 'ok') throw new Error(finCipherMessage(cipher.state));
                for (var a = 0; a < j.accounts.length; a++) {
                    j.accounts[a].data = backupSerialize(await finConvertFields(b.accts[a].data(), cipher.decrypt, legacyEncrypt));
                }
            } else {
                mode = 'shared-key';
                var env = await shareCol(s.id, 'keyEnvelopes').doc(me).get();
                envelope = env.exists ? backupSerialize(env.data()) : null;
            }
        }
        out.push({
            shareId: s.id, share: backupSerialize(s.data), personId: s.personId, personName: j.personName,
            mode: mode, ownerEnvelope: envelope,
            accounts: j.accounts, holdings: j.holdings, ssBenefits: j.ssBenefits,
            investmentGroups: j.investmentGroups, investmentSnapshots: j.investmentSnapshots, allTimeHighs: j.allTimeHighs
        });
    }
    return out;
}

async function finRestoreShared(payload, log) {
    var list = payload.sharedFinancial || [];
    if (!list.length) return;
    await finLoad(true);
    for (var i = 0; i < list.length; i++) {
        var e = list[i];
        var label = e.personName || e.personId;
        if (finShareIdFor(e.personId)) { log('• ' + label + ' is still shared — left as it is.'); continue; }

        var convert = null;                    // function that turns a stored account into a private one
        if (e.mode === 'shared-key') {
            if (!legacyIsUnlocked()) {
                log('• ' + label + ' was saved with the shared lock. Unlock your passphrase (open Financial and reveal something), then restore this file again to bring ' + label + ' back.');
                continue;
            }
            try {
                var pair = await skLoadMyKeyPair();
                var dk = await skUnwrapDataKey(e.ownerEnvelope.wrappedKey, pair.privateKey);
                convert = function(data) { return finConvertFields(data, function(b64) { return skDecrypt(dk, b64); }, legacyEncrypt); };
            } catch (err) {
                console.error('Could not open the saved key for ' + label + ':', err);
                log('• ' + label + ': the saved shared key could not be opened with your key, so it was not restored (' + err.message + ').');
                continue;
            }
        }

        var privNs = e.personId === FIN_HOUSEHOLD ? 'self' : e.personId;
        var acctCol = userCol('investments').doc(privNs).collection('accounts');
        var ops = [];
        for (var a = 0; a < e.accounts.length; a++) {
            var data = e.accounts[a].data;
            if (convert) data = await convert(data);
            ops.push({ ref: acctCol.doc(e.accounts[a].id), data: data });
        }
        e.holdings.forEach(function(h) { ops.push({ ref: acctCol.doc(h.acctId).collection('holdings').doc(h.id), data: h.data }); });
        e.ssBenefits.forEach(function(r) { ops.push({ ref: userCol('ssBenefits').doc(r.id), data: r.data }); });
        e.investmentGroups.forEach(function(r) { ops.push({ ref: userCol('investmentGroups').doc(r.id), data: r.data }); });
        e.investmentSnapshots.forEach(function(r) { ops.push({ ref: userCol('investmentSnapshots').doc(r.id), data: r.data }); });
        await shBatchSet(ops);
        if (e.allTimeHighs && Object.keys(e.allTimeHighs).length) await userCol('investmentConfig').doc('main').set(e.allTimeHighs, { merge: true });
        log('✓ ' + label + ' restored as private (' + e.accounts.length + ' account(s)). Share again if you want.', '#2e7d32');
    }
}
