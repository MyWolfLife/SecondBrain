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

    var holders = await skEnvelopeHolders(shareId);
    var removed = Object.keys(holders).filter(function(u) { return !want[u]; });
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

    var missing = Object.keys(want).filter(function(u) { return u !== me && !holders[u]; });
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
