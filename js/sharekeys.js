// ============================================================
// sharekeys.js — keys for sharing sensitive info (Shared Financial, chunk F1)
//
// Problem: a Financial account's sensitive info (account number, username, password) is locked
// with ONE person's passphrase, and one piece of data can't have two passphrases. So it works
// in two layers, like a safe and the keys to the safe:
//
//   1. The sensitive info of a shared person is locked ONCE with a random DATA KEY (AES-GCM).
//   2. The data key is stored in a small locked ENVELOPE for each person with access, in
//      shares/{shareId}/keyEnvelopes/{uid}. An envelope is the data key locked with that
//      person's PUBLIC key (RSA-OAEP), so the owner can make one for anybody without ever
//      knowing their passphrase. Only that person's PRIVATE key opens it.
//
// Each person's key pair lives in users/{uid}/legacyMeta/keys: the public key in the clear, the
// private key locked with the same passphrase key as Legacy / Financial (legacyEncrypt), so the
// passphrase they already use opens everything. The public key is also published in
// publicKeys/{uid} (readable by any signed-in person) so owners can find it.
//
// Nothing in the app calls this yet (F1 is plumbing). F4 uses it for the sensitive boxes.
// ============================================================

var SK_RSA = { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };
var _skPair = null;            // {uid, publicKey, privateKey, publicB64} while the passphrase is unlocked
var _skShareKeys = {};         // {shareId: data key} opened this session (cleared when locked)

// ---------- Small helpers ----------

function _skB64(bytes) {
    return btoa(String.fromCharCode.apply(null, new Uint8Array(bytes)));
}

function _skBytes(b64) {
    return Uint8Array.from(atob(b64), function(c) { return c.charCodeAt(0); });
}

/** Runs `then` once the passphrase is unlocked (asks for it when it is not). */
function skUnlockThen(then) {
    if (legacyIsUnlocked()) then(); else _legacyRequireUnlock(then);
}

// ---------- My key pair ----------

/**
 * My key pair: created the first time (needs the passphrase unlocked), opened from
 * legacyMeta/keys afterwards. Throws an error named 'SkLocked' when the passphrase is not unlocked.
 */
async function skLoadMyKeyPair() {
    if (!legacyIsUnlocked()) {
        _skPair = null;
        _skShareKeys = {};
        var e = new Error('Unlock your passphrase first.');
        e.name = 'SkLocked';
        throw e;
    }
    var uid = _shMyUid();
    if (_skPair && _skPair.uid === uid) return _skPair;

    var ref = userCol('legacyMeta').doc('keys');
    var snap = await ref.get();
    if (snap.exists && snap.data().privateKeyEnc && snap.data().publicKey) {
        var pkcs8B64 = await legacyDecrypt(snap.data().privateKeyEnc);
        if (!pkcs8B64) throw new Error('Could not open your sharing key with this passphrase.');
        _skPair = {
            uid: uid, publicB64: snap.data().publicKey,
            privateKey: await crypto.subtle.importKey('pkcs8', _skBytes(pkcs8B64), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['decrypt']),
            publicKey:  await crypto.subtle.importKey('spki', _skBytes(snap.data().publicKey), { name: 'RSA-OAEP', hash: 'SHA-256' }, true, ['encrypt'])
        };
        await skEnsurePublished(_skPair.publicB64);
    } else {
        _skPair = await _skCreateKeyPair(ref, uid);
    }
    return _skPair;
}

/** Makes a new key pair, saves it (private half locked with the passphrase) and publishes the public half. */
async function _skCreateKeyPair(ref, uid) {
    var pair = await crypto.subtle.generateKey(SK_RSA, true, ['encrypt', 'decrypt']);
    var pkcs8 = await crypto.subtle.exportKey('pkcs8', pair.privateKey);
    var spki  = await crypto.subtle.exportKey('spki', pair.publicKey);
    var publicB64 = _skB64(spki);
    await ref.set({
        publicKey: publicB64,
        privateKeyEnc: await legacyEncrypt(_skB64(pkcs8)),
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await skEnsurePublished(publicB64);
    return {
        uid: uid, publicB64: publicB64, publicKey: pair.publicKey,
        privateKey: await crypto.subtle.importKey('pkcs8', pkcs8, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['decrypt'])
    };
}

/** Publishes my public key where owners can read it (publicKeys/{uid}). Returns false when it could not be written. */
async function skEnsurePublished(publicB64) {
    try {
        var ref = topCol('publicKeys').doc(_shMyUid());
        var cur = await ref.get();
        if (cur.exists && cur.data().publicKey === publicB64) return true;
        await ref.set({ publicKey: publicB64, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
        return true;
    } catch (err) {
        console.error('Could not publish the sharing key (are the Firestore rules deployed?):', err);
        return false;
    }
}

/** A person's published public key as a CryptoKey, or null when they have not set one up yet. */
async function skGetPublicKey(uid) {
    var snap = await topCol('publicKeys').doc(uid).get();
    if (!snap.exists || !snap.data().publicKey) return null;
    return crypto.subtle.importKey('spki', _skBytes(snap.data().publicKey), { name: 'RSA-OAEP', hash: 'SHA-256' }, true, ['encrypt']);
}

// ---------- Data keys and envelopes ----------

async function skNewDataKey() {
    return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

/** Same format as legacyEncrypt: Base64 of (12-byte IV + ciphertext). */
async function skEncrypt(dataKey, plaintext) {
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, dataKey, new TextEncoder().encode(plaintext));
    var all = new Uint8Array(iv.length + cipher.byteLength);
    all.set(iv, 0);
    all.set(new Uint8Array(cipher), iv.length);
    return _skB64(all);
}

/** Plaintext, or null when the key is wrong or the data is damaged. */
async function skDecrypt(dataKey, b64) {
    if (!dataKey || !b64) return null;
    try {
        var bytes = _skBytes(b64);
        var plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, dataKey, bytes.slice(12));
        return new TextDecoder().decode(plain);
    } catch (e) { return null; }
}

/** The data key locked for one person (their public key): Base64. */
async function skWrapDataKey(dataKey, publicKey) {
    var raw = await crypto.subtle.exportKey('raw', dataKey);
    return _skB64(await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, raw));
}

async function skUnwrapDataKey(wrappedB64, privateKey) {
    var raw = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, _skBytes(wrappedB64));
    return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
}

// ---------- Envelopes inside a share ----------

/**
 * Owner starts the locked box for a share: a new data key with my own envelope.
 * Returns the data key (keep it in memory only while locking/unlocking things).
 */
async function skCreateShareKey(shareId) {
    var pair = await skLoadMyKeyPair();
    var dk = await skNewDataKey();
    await shareCol(shareId, 'keyEnvelopes').doc(pair.uid).set({
        forUid: pair.uid, wrappedKey: await skWrapDataKey(dk, pair.publicKey),
        createdBy: pair.uid, createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    _skShareKeys[shareId] = dk;
    return dk;
}

/** Opens my envelope for this share. Returns the data key, or null when I have no envelope yet ("waiting"). */
async function skOpenShareKey(shareId) {
    var pair = await skLoadMyKeyPair();
    if (_skShareKeys[shareId]) return _skShareKeys[shareId];
    var snap = await shareCol(shareId, 'keyEnvelopes').doc(pair.uid).get();
    if (!snap.exists) return null;
    var dk = await skUnwrapDataKey(snap.data().wrappedKey, pair.privateKey);
    _skShareKeys[shareId] = dk;
    return dk;
}

/**
 * Owner gives people access: an envelope for each. Returns {ok: [uid…], waiting: [uid…]};
 * "waiting" = that person has not set up a passphrase / key yet (nothing is made for them).
 */
async function skGrantAccess(shareId, dataKey, uids) {
    var me = _shMyUid();
    var result = { ok: [], waiting: [] };
    for (var i = 0; i < uids.length; i++) {
        var pub = await skGetPublicKey(uids[i]);
        if (!pub) { result.waiting.push(uids[i]); continue; }
        await shareCol(shareId, 'keyEnvelopes').doc(uids[i]).set({
            forUid: uids[i], wrappedKey: await skWrapDataKey(dataKey, pub),
            createdBy: me, createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        result.ok.push(uids[i]);
    }
    return result;
}

/** Owner removes someone's envelope. (F4 also replaces the data key and re-locks the info so a copy they kept opens nothing.) */
async function skRevokeAccess(shareId, uid) {
    await shareCol(shareId, 'keyEnvelopes').doc(uid).delete();
}

/** Who has an envelope for this share: {uid: true}. */
async function skEnvelopeHolders(shareId) {
    var snap = await shareCol(shareId, 'keyEnvelopes').get();
    var out = {};
    snap.docs.forEach(function(d) { out[d.id] = true; });
    return out;
}

// ---------- Self-test (run from the browser console: await skSelfTest()) ----------

/** Pure crypto round trip with throwaway keys, no database: returns an array of [check, passed]. */
async function skSelfTest() {
    var out = [];
    var owner = await crypto.subtle.generateKey(SK_RSA, true, ['encrypt', 'decrypt']);
    var daughter = await crypto.subtle.generateKey(SK_RSA, true, ['encrypt', 'decrypt']);
    var stranger = await crypto.subtle.generateKey(SK_RSA, true, ['encrypt', 'decrypt']);
    var dk = await skNewDataKey();
    var locked = await skEncrypt(dk, 'acct 12345 / pw');
    out.push(['data key unlocks its own data', (await skDecrypt(dk, locked)) === 'acct 12345 / pw']);
    var envOwner = await skWrapDataKey(dk, owner.publicKey);
    var envDaughter = await skWrapDataKey(dk, daughter.publicKey);
    var dkOwner = await skUnwrapDataKey(envOwner, owner.privateKey);
    var dkDaughter = await skUnwrapDataKey(envDaughter, daughter.privateKey);
    out.push(['owner opens own envelope', (await skDecrypt(dkOwner, locked)) === 'acct 12345 / pw']);
    out.push(['daughter opens her envelope', (await skDecrypt(dkDaughter, locked)) === 'acct 12345 / pw']);
    var strangerFails = false;
    try { await skUnwrapDataKey(envDaughter, stranger.privateKey); } catch (e) { strangerFails = true; }
    out.push(['someone else cannot open her envelope', strangerFails]);
    out.push(['wrong data key gives nothing', (await skDecrypt(await skNewDataKey(), locked)) === null]);
    return out;
}

/**
 * Like skOpenShareKey, but for the owner during a key replacement: {key, prev}. `prev` is the key
 * before the replacement (kept in the owner's envelope until every account is re-locked), else null.
 */
async function skOpenShareKeys(shareId) {
    var pair = await skLoadMyKeyPair();
    var snap = await shareCol(shareId, 'keyEnvelopes').doc(pair.uid).get();
    if (!snap.exists) return null;
    var key = await skUnwrapDataKey(snap.data().wrappedKey, pair.privateKey);
    var prev = snap.data().prevWrappedKey ? await skUnwrapDataKey(snap.data().prevWrappedKey, pair.privateKey) : null;
    _skShareKeys[shareId] = key;
    return { key: key, prev: prev };
}

/**
 * A new key pair for me (needs the passphrase unlocked): used after a passphrase reset, when the old
 * private key can no longer be opened. Owners then re-send access (finRegrant) so the new key opens
 * their envelopes. Envelopes made for the old key stop working.
 */
async function skRegenerateKeyPair() {
    if (!legacyIsUnlocked()) {
        var e = new Error('Unlock your passphrase first.');
        e.name = 'SkLocked';
        throw e;
    }
    _skPair = null;
    _skShareKeys = {};
    _skPair = await _skCreateKeyPair(userCol('legacyMeta').doc('keys'), _shMyUid());
    return _skPair;
}
