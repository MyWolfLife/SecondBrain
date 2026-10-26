// ============================================================
// Sharing — Settings → Sharing  (#sharing)
// SharedSpacesBuildPlan.md, chunk S2: connecting people.
//
// An invite document in the top-level `invites` collection IS the connection:
//   invites/{code}: fromUid, fromName, expiresAt, usedBy, usedByName, usedAt
// Person A creates an invite and texts the code to person B. B enters it, which
// fills in usedBy / usedByName / usedAt. After that A and B are "connected".
// Disconnecting deletes the invite document(s) joining the two.
// Security rules for all of this are in firestore.rules (see FirestoreRules.md).
// ============================================================

var INVITE_DAYS = 7;
var _shPeople = [];     // connected people from the last load: [{uid, name, inviteIds[]}]
var _shGroups = [];     // my groups from the last load: [{id, name, memberUids[], memberNames{}}]
// No 0/O, 1/I/L — codes get read aloud and typed from a text message.
var INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Top-level (not per-user) collection, with the Offline Trip Mode write lock applied. */
function topCol(name) {
    return _guardFirestoreRef(db.collection(name));
}

function _shMyUid() {
    var u = firebase.auth().currentUser;
    return u ? u.uid : null;
}

/** "AB12CD34" → "AB12-CD34" for display. */
function _shFormatCode(code) {
    return code.slice(0, 4) + '-' + code.slice(4);
}

/** What the user typed → the document ID ("ab12-cd34 " → "AB12CD34"). */
function _shCleanCode(text) {
    return String(text || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function _shNewCode() {
    var bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    var out = '';
    for (var i = 0; i < bytes.length; i++) out += INVITE_ALPHABET[bytes[i] % INVITE_ALPHABET.length];
    return out;
}

function _shMsg(id, text, isError) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = text || '';
    el.style.color = isError ? '#c0392b' : '#2e7d32';
}

// ─── Your name in Sharing ────────────────────────────────────────────────────

/** Name other people see. Stored in the person's own settings; defaults to the part of the email before the @. */
async function shGetMyName() {
    try {
        var snap = await userCol('settings').doc('sharing').get();
        if (snap.exists && snap.data().displayName) return snap.data().displayName;
    } catch (err) { console.error('shGetMyName:', err); }
    var email = (firebase.auth().currentUser && firebase.auth().currentUser.email) || '';
    return email.split('@')[0];
}

async function shSaveMyName() {
    var input = document.getElementById('shNameInput');
    var name = (input.value || '').trim();
    if (!name) { _shMsg('shNameMsg', 'Enter the name other people should see.', true); return; }
    try {
        await userCol('settings').doc('sharing').set({ displayName: name }, { merge: true });
        _shMsg('shNameMsg', '✓ Saved', false);
    } catch (err) {
        console.error(err);
        _shMsg('shNameMsg', 'Could not save: ' + err.message, true);
    }
}

// ─── Page load ───────────────────────────────────────────────────────────────

async function loadSharingPage() {
    var box = document.getElementById('shCustomFirebaseNote');
    if (box) box.classList.toggle('hidden', !usingCustomFirebase);

    document.getElementById('shNameInput').value = await shGetMyName();
    _shMsg('shNameMsg', '', false);
    _shMsg('shInviteMsg', '', false);
    _shMsg('shEnterMsg', '', false);
    document.getElementById('shInviteResult').classList.add('hidden');
    document.getElementById('shCodeInput').value = '';
    _shMsg('shDisplayMsg', '', false);
    await shLoadPrefs();
    document.getElementById('shShowWhoCheck').checked = shShowWhoEnabled();
    await shRenderPeople();
    await shRenderSharedWithMe();
}

// ─── People list ─────────────────────────────────────────────────────────────

/**
 * Reads every invite document I made or used.
 * Returns { people: [{uid, name, inviteIds[]}], pending: [{id, code, expired}] }.
 */
async function _shLoadConnections() {
    var me = _shMyUid();
    var results = await Promise.all([
        topCol('invites').where('fromUid', '==', me).get(),
        topCol('invites').where('usedBy',  '==', me).get()
    ]);
    var byUid = {};
    var pending = [];
    var now = Date.now();

    results[0].docs.forEach(function(d) {
        var x = d.data();
        if (x.usedBy) {
            var p = byUid[x.usedBy] || (byUid[x.usedBy] = { uid: x.usedBy, name: '', inviteIds: [] });
            p.name = x.usedByName || p.name;
            p.inviteIds.push(d.id);
        } else {
            var exp = x.expiresAt && x.expiresAt.toMillis ? x.expiresAt.toMillis() : 0;
            pending.push({ id: d.id, expired: exp < now, expiresMs: exp });
        }
    });
    results[1].docs.forEach(function(d) {
        var x = d.data();
        var p = byUid[x.fromUid] || (byUid[x.fromUid] = { uid: x.fromUid, name: '', inviteIds: [] });
        p.name = x.fromName || p.name;
        p.inviteIds.push(d.id);
    });

    var people = Object.keys(byUid).map(function(k) { return byUid[k]; })
        .sort(function(a, b) { return (a.name || '').localeCompare(b.name || ''); });
    return { people: people, pending: pending };
}

async function shRenderPeople() {
    var peopleEl  = document.getElementById('shPeopleList');
    var pendingEl = document.getElementById('shPendingList');
    peopleEl.innerHTML = '<p style="color:#888;font-size:0.9rem;">Loading...</p>';
    pendingEl.innerHTML = '';
    var data;
    try {
        data = await _shLoadConnections();
        _shPeople = data.people;
        await shRenderGroups();     // groups depend on who is connected
    } catch (err) {
        console.error(err);
        peopleEl.innerHTML = '<p style="color:#c0392b;font-size:0.9rem;">Could not load people (' + escapeHtml(err.message) +
            '). If this says "permission denied", the new security rules have not been published yet.</p>';
        return;
    }

    if (!data.people.length) {
        peopleEl.innerHTML = '<p style="color:#888;font-size:0.9rem;">Not connected to anyone yet.</p>';
    } else {
        var html = '<div class="lookup-list">';
        data.people.forEach(function(p) {
            html += '<div class="lookup-list-item">' +
                      '<span class="lookup-item-label">' + escapeHtml(p.name || 'Unnamed') + '</span>' +
                      '<div class="lookup-item-actions">' +
                        '<button class="btn btn-danger btn-small" onclick="shDisconnect(\'' + p.uid + '\')">Disconnect</button>' +
                      '</div>' +
                    '</div>';
        });
        peopleEl.innerHTML = html + '</div>';
    }

    if (data.pending.length) {
        var ph = '<h4 style="margin:16px 0 6px;">Invites waiting to be used</h4><div class="lookup-list">';
        data.pending.forEach(function(p) {
            var when = p.expired ? 'expired' : 'expires ' + new Date(p.expiresMs).toLocaleDateString();
            ph += '<div class="lookup-list-item">' +
                    '<span class="lookup-item-label">' + escapeHtml(_shFormatCode(p.id)) + ' <small style="color:#888;">(' + when + ')</small></span>' +
                    '<div class="lookup-item-actions">' +
                      '<button class="btn btn-secondary btn-small" onclick="shCancelInvite(\'' + p.id + '\')">Cancel</button>' +
                    '</div>' +
                  '</div>';
        });
        pendingEl.innerHTML = ph + '</div>';
    }
}

// ─── Invite someone ──────────────────────────────────────────────────────────

async function shCreateInvite() {
    var btn = document.getElementById('shInviteBtn');
    btn.disabled = true;
    _shMsg('shInviteMsg', '', false);
    try {
        var name = await shGetMyName();
        var code = _shNewCode();
        var expires = new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000);
        await topCol('invites').doc(code).set({
            fromUid:    _shMyUid(),
            fromName:   name,
            expiresAt:  firebase.firestore.Timestamp.fromDate(expires),
            usedBy:     null,
            usedByName: null,
            usedAt:     null
        });
        document.getElementById('shInviteCode').textContent = _shFormatCode(code);
        document.getElementById('shInviteExpires').textContent = 'Works once. Expires ' + expires.toLocaleDateString() + '.';
        document.getElementById('shInviteResult').classList.remove('hidden');
        await shRenderPeople();
    } catch (err) {
        console.error(err);
        _shMsg('shInviteMsg', 'Could not create the invite: ' + err.message, true);
    }
    btn.disabled = false;
}

function shCopyInvite() {
    var text = document.getElementById('shInviteCode').textContent;
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(function() { _shMsg('shInviteMsg', '✓ Copied', false); });
}

async function shCancelInvite(code) {
    try {
        await topCol('invites').doc(code).delete();
        await shRenderPeople();
    } catch (err) {
        console.error(err);
        alert('Could not cancel the invite: ' + err.message);
    }
}

// ─── Enter an invite code ────────────────────────────────────────────────────

async function shRedeemInvite() {
    var code = _shCleanCode(document.getElementById('shCodeInput').value);
    if (code.length !== 8) { _shMsg('shEnterMsg', 'Invite codes have 8 letters and numbers.', true); return; }
    var btn = document.getElementById('shConnectBtn');
    btn.disabled = true;
    _shMsg('shEnterMsg', '', false);
    try {
        var ref = topCol('invites').doc(code);
        var snap = await ref.get();
        var x = snap.exists ? snap.data() : null;
        var exp = x && x.expiresAt && x.expiresAt.toMillis ? x.expiresAt.toMillis() : 0;
        // One message for "no such code" and "already used" so a stranger can't probe for valid codes.
        if (!x || x.usedBy) { _shMsg('shEnterMsg', 'That code is not valid. Check it, or ask for a new one.', true); }
        else if (x.fromUid === _shMyUid()) { _shMsg('shEnterMsg', 'That is your own invite. Send it to the other person.', true); }
        else if (exp < Date.now()) { _shMsg('shEnterMsg', 'That code has expired. Ask for a new one.', true); }
        else {
            var name = await shGetMyName();
            await ref.update({
                usedBy:     _shMyUid(),
                usedByName: name,
                usedAt:     firebase.firestore.FieldValue.serverTimestamp()
            });
            document.getElementById('shCodeInput').value = '';
            _shMsg('shEnterMsg', '✓ Connected to ' + (x.fromName || 'them') + '.', false);
            await shRenderPeople();
        }
    } catch (err) {
        console.error(err);
        _shMsg('shEnterMsg', 'Could not connect: ' + err.message, true);
    }
    btn.disabled = false;
}

// ─── Disconnect ──────────────────────────────────────────────────────────────

async function shDisconnect(uid) {
    try {
        var data = await _shLoadConnections();
        var person = data.people.filter(function(p) { return p.uid === uid; })[0];
        if (!person) { await shRenderPeople(); return; }
        if (!confirm('Disconnect from ' + (person.name || 'this person') + '?\n\n' +
                     'They will no longer be able to be added to your groups, and you will not be able to add them to theirs. ' +
                     'To connect again you need a new invite code.')) return;
        for (var i = 0; i < person.inviteIds.length; i++) {
            await topCol('invites').doc(person.inviteIds[i]).delete();
        }
        // Take them out of every group of mine too.
        var groups = await _shLoadGroups();
        for (var g = 0; g < groups.length; g++) {
            if ((groups[g].memberUids || []).indexOf(uid) !== -1) await _shRemoveFromGroup(groups[g].id, uid);
        }
        await shRecomputeShares();
        await shRenderPeople();
    } catch (err) {
        console.error(err);
        alert('Could not disconnect: ' + err.message);
    }
}

// ─── Groups ──────────────────────────────────────────────────────────────────
// groups/{groupId}: ownerUid, name, memberUids[], memberNames{uid: name}, createdAt
// A group is just a named list of connected people. Only its owner can see or change it.
// (Sharing things with a group comes in S5.)

async function _shLoadGroups() {
    var snap = await topCol('groups').where('ownerUid', '==', _shMyUid()).get();
    return snap.docs.map(function(d) { var g = d.data(); g.id = d.id; return g; })
        .sort(function(a, b) { return (a.name || '').localeCompare(b.name || ''); });
}

/**
 * Keeps groups honest against the current people list: someone who is no longer
 * connected (the other person disconnected) is removed, and renamed people get their new name.
 */
async function _shReconcileGroups(groups) {
    var byUid = {};
    _shPeople.forEach(function(p) { byUid[p.uid] = p; });
    var anyChanged = false;
    for (var i = 0; i < groups.length; i++) {
        var g = groups[i];
        var uids = (g.memberUids || []).filter(function(u) { return byUid[u]; });
        var names = {};
        uids.forEach(function(u) { names[u] = byUid[u].name || 'Unnamed'; });
        var changed = uids.length !== (g.memberUids || []).length ||
                      uids.some(function(u) { return (g.memberNames || {})[u] !== names[u]; });
        if (changed) {
            await topCol('groups').doc(g.id).update({ memberUids: uids, memberNames: names });
            g.memberUids = uids;
            g.memberNames = names;
            anyChanged = true;
        }
    }
    if (anyChanged) await shRecomputeShares();     // access follows the groups
}

async function shRenderGroups() {
    var el = document.getElementById('shGroupsList');
    if (!el) return;
    try {
        _shGroups = await _shLoadGroups();
        await _shReconcileGroups(_shGroups);
    } catch (err) {
        console.error(err);
        el.innerHTML = '<p style="color:#c0392b;font-size:0.9rem;">Could not load groups (' + escapeHtml(err.message) + ').</p>';
        return;
    }
    if (!_shGroups.length) {
        el.innerHTML = '<p style="color:#888;font-size:0.9rem;">No groups yet. Try one like Family, Wife or Guest.</p>';
        return;
    }
    var html = '';
    _shGroups.forEach(function(g) {
        var members = g.memberUids || [];
        html += '<div class="sh-group" style="border:1px solid #ddd; border-radius:8px; padding:10px 12px; margin-bottom:10px;">' +
                  '<div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">' +
                    '<strong style="flex:1; min-width:120px;">' + escapeHtml(g.name) + '</strong>' +
                    '<button class="btn btn-secondary btn-small" onclick="shRenameGroup(\'' + g.id + '\')">Rename</button>' +
                    '<button class="btn btn-danger btn-small" onclick="shDeleteGroup(\'' + g.id + '\')">Delete</button>' +
                  '</div>' +
                  '<div style="margin:8px 0; display:flex; flex-wrap:wrap; gap:6px;">';
        if (!members.length) html += '<span style="color:#888; font-size:0.9rem;">No one in this group yet.</span>';
        members.forEach(function(u) {
            html += '<span style="background:#eef3ee; border-radius:14px; padding:3px 6px 3px 10px; font-size:0.9rem;">' +
                      escapeHtml((g.memberNames || {})[u] || 'Unnamed') +
                      ' <button type="button" title="Remove from group" style="border:none; background:none; cursor:pointer; padding:0 4px;" onclick="shRemoveMember(\'' + g.id + '\',\'' + u + '\')">&#10005;</button>' +
                    '</span>';
        });
        html += '</div>';
        var addable = _shPeople.filter(function(p) { return members.indexOf(p.uid) === -1; });
        if (addable.length) {
            html += '<select onchange="shAddMember(\'' + g.id + '\', this)"><option value="">+ Add a person…</option>';
            addable.forEach(function(p) { html += '<option value="' + p.uid + '">' + escapeHtml(p.name || 'Unnamed') + '</option>'; });
            html += '</select>';
        } else if (!_shPeople.length) {
            html += '<span style="color:#888; font-size:0.85rem;">Connect to someone first (below) to add people.</span>';
        }
        html += '</div>';
    });
    el.innerHTML = html;
}

async function shCreateGroup() {
    var input = document.getElementById('shGroupNameInput');
    var name = (input.value || '').trim();
    if (!name) { _shMsg('shGroupMsg', 'Give the group a name.', true); return; }
    if (_shGroups.some(function(g) { return (g.name || '').toLowerCase() === name.toLowerCase(); })) {
        _shMsg('shGroupMsg', 'You already have a group with that name.', true); return;
    }
    try {
        await topCol('groups').add({
            ownerUid:    _shMyUid(),
            name:        name,
            memberUids:  [],
            memberNames: {},
            createdAt:   firebase.firestore.FieldValue.serverTimestamp()
        });
        input.value = '';
        _shMsg('shGroupMsg', '', false);
        await shRenderGroups();
    } catch (err) {
        console.error(err);
        _shMsg('shGroupMsg', 'Could not create the group: ' + err.message, true);
    }
}

async function shRenameGroup(id) {
    var g = _shGroups.filter(function(x) { return x.id === id; })[0];
    if (!g) return;
    var name = prompt('New name for this group:', g.name);
    if (name === null) return;
    name = name.trim();
    if (!name) return;
    try {
        await topCol('groups').doc(id).update({ name: name });
        await shRenderGroups();
    } catch (err) {
        console.error(err);
        alert('Could not rename: ' + err.message);
    }
}

async function shDeleteGroup(id) {
    var g = _shGroups.filter(function(x) { return x.id === id; })[0];
    if (!g) return;
    if (!confirm('Delete the group "' + g.name + '"?\n\nThe people in it are not affected. Anything shared with this group will stop being shared with its members.')) return;
    try {
        await topCol('groups').doc(id).delete();
        await shRecomputeShares();
        await shRenderGroups();
    } catch (err) {
        console.error(err);
        alert('Could not delete: ' + err.message);
    }
}

async function shAddMember(groupId, selectEl) {
    var uid = selectEl.value;
    if (!uid) return;
    var person = _shPeople.filter(function(p) { return p.uid === uid; })[0];
    if (!person) return;
    try {
        var upd = { memberUids: firebase.firestore.FieldValue.arrayUnion(uid) };
        upd['memberNames.' + uid] = person.name || 'Unnamed';
        await topCol('groups').doc(groupId).update(upd);
        await shRecomputeShares();
        await shRenderGroups();
    } catch (err) {
        console.error(err);
        alert('Could not add: ' + err.message);
    }
}

async function _shRemoveFromGroup(groupId, uid) {
    var upd = { memberUids: firebase.firestore.FieldValue.arrayRemove(uid) };
    upd['memberNames.' + uid] = firebase.firestore.FieldValue.delete();
    await topCol('groups').doc(groupId).update(upd);
}

async function shRemoveMember(groupId, uid) {
    try {
        await _shRemoveFromGroup(groupId, uid);
        await shRecomputeShares();
        await shRenderGroups();
    } catch (err) {
        console.error(err);
        alert('Could not remove: ' + err.message);
    }
}

// ─── Shared data plumbing (S4) ───────────────────────────────────────────────
// A share is a container: shares/{shareId} holds the guest list, and everything that
// was shared lives inside it as subcollections with the SAME names as in a person's
// private area (collections, collectionItems, photos, ...). Document IDs are kept
// when something is moved in, so every link between documents survives.
//
//   shares/{shareId}: ownerUid, kind, title, shareGroups{groupId: 'view'|'edit'},
//                     viewerUids[], editorUids[], names{uid: name}, createdAt

/** A collection inside a share, with the Offline Trip Mode write lock applied. */
function shareCol(shareId, name) {
    return _guardFirestoreRef(db.collection('shares').doc(shareId).collection(name));
}

/**
 * The one helper features call: the share's collection when the thing lives in a
 * share, otherwise the person's own private collection.
 *     dataCol('collectionItems', window.currentShareId)
 */
function dataCol(name, shareId) {
    return shareId ? shareCol(shareId, name) : userCol(name);
}

/**
 * Who-did-it stamps (decision G8). Add to every write that goes into a share:
 *     shareCol(id, 'collectionItems').add(shStamp(data, true))      // new document
 *     shareCol(id, 'collectionItems').doc(x).update(shStamp(data))  // change
 * Returns a copy; private writes don't use this.
 */
function shStamp(data, isNew) {
    var out = Object.assign({}, data);
    var uid = _shMyUid();
    var now = firebase.firestore.FieldValue.serverTimestamp();
    if (isNew) { out.createdBy = uid; out.createdAt = now; }
    out.updatedBy = uid;
    out.updatedAt = now;
    return out;
}

// ─── "Show who added/modified" (per person) ──────────────────────────────────

var _shPrefs = { showWhoEdited: false };

async function shLoadPrefs() {
    try {
        var snap = await userCol('settings').doc('sharing').get();
        if (snap.exists) _shPrefs.showWhoEdited = !!snap.data().showWhoEdited;
    } catch (err) { console.error('shLoadPrefs:', err); }
}

function shShowWhoEnabled() {
    return !!_shPrefs.showWhoEdited;
}

async function shSaveShowWho(checked) {
    _shPrefs.showWhoEdited = !!checked;
    try {
        await userCol('settings').doc('sharing').set({ showWhoEdited: !!checked }, { merge: true });
        _shMsg('shDisplayMsg', '✓ Saved', false);
    } catch (err) {
        console.error(err);
        _shMsg('shDisplayMsg', 'Could not save: ' + err.message, true);
    }
}

/**
 * The "Added by Sam · Oct 26, 2026 / Changed by Steve · Oct 27, 2026" text for a document
 * in a share, or '' when the setting is off or the document has no stamps (older items).
 * `share` is the share document's data, whose names{} maps uid → name.
 */
function shWhoLabel(docData, share) {
    if (!shShowWhoEnabled() || !docData || !docData.createdBy) return '';
    var names = (share && share.names) || {};
    function who(uid) { return uid === _shMyUid() ? 'you' : (names[uid] || 'someone'); }
    function when(ts) { return ts && ts.toDate ? ' · ' + ts.toDate().toLocaleDateString() : ''; }
    var text = 'Added by ' + who(docData.createdBy) + when(docData.createdAt);
    var changed = docData.updatedBy && docData.updatedAt && docData.createdAt &&
                  docData.updatedAt.toMillis && docData.createdAt.toMillis &&
                  docData.updatedAt.toMillis() - docData.createdAt.toMillis() > 60000;
    if (changed) text += ' · Changed by ' + who(docData.updatedBy) + when(docData.updatedAt);
    return text;
}

// ─── Finding shares ──────────────────────────────────────────────────────────

/** Everything shared WITH me by other people: [{id, title, kind, ownerUid, ownerName, role, data}] */
async function shLoadSharedWithMe() {
    var me = _shMyUid();
    var results = await Promise.all([
        db.collection('shares').where('editorUids', 'array-contains', me).get(),
        db.collection('shares').where('viewerUids', 'array-contains', me).get()
    ]);
    var byId = {};
    results.forEach(function(snap, i) {
        snap.docs.forEach(function(d) {
            if (byId[d.id]) return;          // already found as an editor: edit wins
            var x = d.data();
            byId[d.id] = {
                id: d.id, title: x.title || 'Untitled', kind: x.kind || '',
                ownerUid: x.ownerUid, ownerName: (x.names || {})[x.ownerUid] || 'Someone',
                role: i === 0 ? 'edit' : 'view', data: x
            };
        });
    });
    return Object.keys(byId).map(function(k) { return byId[k]; })
        .sort(function(a, b) { return (a.title || '').localeCompare(b.title || ''); });
}

/** Everything I have shared with others (I am the owner): [{id, title, kind, data}] */
async function shLoadMyShares() {
    var snap = await db.collection('shares').where('ownerUid', '==', _shMyUid()).get();
    return snap.docs.map(function(d) { var x = d.data(); return { id: d.id, title: x.title || 'Untitled', kind: x.kind || '', data: x }; })
        .sort(function(a, b) { return (a.title || '').localeCompare(b.title || ''); });
}

async function shRenderSharedWithMe() {
    var el = document.getElementById('shSharedWithMeList');
    if (!el) return;
    try {
        var list = await shLoadSharedWithMe();
        if (!list.length) { el.innerHTML = '<p style="color:#888;font-size:0.9rem;">Nothing has been shared with you.</p>'; return; }
        var html = '<div class="lookup-list">';
        list.forEach(function(s) {
            html += '<div class="lookup-list-item">' +
                      '<span class="lookup-item-label">' +
                        '<span style="background:#eef3ee; border-radius:10px; padding:1px 8px; font-size:0.8rem; margin-right:6px;">' + (s.role === 'edit' ? 'Can edit' : 'View only') + '</span>' +
                        escapeHtml(s.title) + ' <small style="color:#888;">from ' + escapeHtml(s.ownerName) + '</small>' +
                      '</span>' +
                    '</div>';
        });
        el.innerHTML = html + '</div>';
    } catch (err) {
        console.error(err);
        el.innerHTML = '<p style="color:#c0392b;font-size:0.9rem;">Could not load shared items (' + escapeHtml(err.message) + ').</p>';
    }
}

// ─── Guest lists (S5) ────────────────────────────────────────────────────────
// A share keeps shareGroups{groupId: 'view'|'edit'} (what the owner chose) and the
// flattened lists the security rules read: viewerUids[], editorUids[], names{}.

/** Turn the owner's group choices into the flat guest lists. Edit beats view if someone is in both. */
function shFlatten(shareGroups, groups, ownerUid, ownerName) {
    var editors = {}, viewers = {}, names = {};
    names[ownerUid] = ownerName || 'Owner';
    groups.forEach(function(g) {
        var role = (shareGroups || {})[g.id];
        if (!role) return;
        (g.memberUids || []).forEach(function(u) {
            if (u === ownerUid) return;
            names[u] = (g.memberNames || {})[u] || names[u] || 'Unnamed';
            if (role === 'edit') editors[u] = true; else viewers[u] = true;
        });
    });
    var editorUids = Object.keys(editors);
    var viewerUids = Object.keys(viewers).filter(function(u) { return !editors[u]; });
    return { viewerUids: viewerUids, editorUids: editorUids, names: names };
}

/**
 * Re-computes the guest list of every share I own from my current groups.
 * Called after any group change (add/remove person, delete group, disconnect) so access
 * follows the groups at once. Groups that no longer exist are dropped from the share.
 */
async function shRecomputeShares() {
    var me = _shMyUid();
    var groups = await _shLoadGroups();
    var shares = await shLoadMyShares();
    var myName = await shGetMyName();
    var live = {};
    groups.forEach(function(g) { live[g.id] = true; });
    for (var i = 0; i < shares.length; i++) {
        var s = shares[i].data;
        var sg = {};
        Object.keys(s.shareGroups || {}).forEach(function(id) { if (live[id]) sg[id] = s.shareGroups[id]; });
        var flat = shFlatten(sg, groups, me, myName);
        var same = JSON.stringify([sg, flat.viewerUids.slice().sort(), flat.editorUids.slice().sort(), flat.names]) ===
                   JSON.stringify([s.shareGroups || {}, (s.viewerUids || []).slice().sort(), (s.editorUids || []).slice().sort(), s.names || {}]);
        if (!same) {
            await topCol('shares').doc(shares[i].id).update({
                shareGroups: sg, viewerUids: flat.viewerUids, editorUids: flat.editorUids, names: flat.names
            });
        }
    }
}

// ─── Moving data (S5) ────────────────────────────────────────────────────────

var SH_BATCH_MAX_OPS   = 400;
var SH_BATCH_MAX_BYTES = 6 * 1024 * 1024;   // Firestore refuses a batch over ~10 MB; photos are big

function _shDocBytes(data) {
    var n = 200;
    Object.keys(data || {}).forEach(function(k) {
        var v = data[k];
        n += k.length + (typeof v === 'string' ? v.length : 60);
    });
    return n;
}

/** ops: [{ref, data}] set in size-aware batches. */
async function shBatchSet(ops, onProgress) {
    var i = 0, done = 0;
    while (i < ops.length) {
        var batch = db.batch(), count = 0, bytes = 0;
        while (i < ops.length && count < SH_BATCH_MAX_OPS && (count === 0 || bytes + _shDocBytes(ops[i].data) < SH_BATCH_MAX_BYTES)) {
            batch.set(ops[i].ref, ops[i].data);
            bytes += _shDocBytes(ops[i].data);
            count++; i++;
        }
        await batch.commit();
        done += count;
        if (onProgress) onProgress(done, ops.length);
    }
}

/** refs: DocumentReference[] deleted in batches. */
async function shBatchDelete(refs, onProgress) {
    for (var i = 0; i < refs.length; i += SH_BATCH_MAX_OPS) {
        var batch = db.batch();
        refs.slice(i, i + SH_BATCH_MAX_OPS).forEach(function(r) { batch.delete(r); });
        await batch.commit();
        if (onProgress) onProgress(Math.min(i + SH_BATCH_MAX_OPS, refs.length), refs.length);
    }
}

/** Reads everything that belongs to a collection from a given place (private when shareId is null). */
async function shReadCollectionBundle(collId, shareId) {
    var colDoc = await dataCol('collections', shareId).doc(collId).get();
    if (!colDoc.exists) throw new Error('That collection no longer exists.');
    var itemSnap = await dataCol('collectionItems', shareId).where('collectionId', '==', collId).get();
    var itemIds = {};
    itemSnap.docs.forEach(function(d) { itemIds[d.id] = true; });
    // Photos are one big collection; read the two kinds that belong to collections, keep ours.
    var photoDocs = [];
    var kinds = [['collection', null], ['collectionitem', itemIds]];
    for (var k = 0; k < kinds.length; k++) {
        var snap = await dataCol('photos', shareId).where('targetType', '==', kinds[k][0]).get();
        snap.docs.forEach(function(d) {
            var t = d.data().targetId;
            if (kinds[k][1] ? kinds[k][1][t] : t === collId) photoDocs.push(d);
        });
    }
    return { collection: colDoc, items: itemSnap.docs, photos: photoDocs };
}

function _shBundleToJson(bundle) {
    function rows(docs) { return docs.map(function(d) { return { id: d.id, data: backupSerialize(d.data()) }; }); }
    return { version: 1, type: 'collection-before-share', exportedAt: new Date().toISOString(),
             collection: rows([bundle.collection]), collectionItems: rows(bundle.items), photos: rows(bundle.photos) };
}

/** Small progress panel inside the share dialog. */
function _shProgress(text, isError) {
    var el = document.getElementById('shDlgProgress');
    if (!el) return;
    el.classList.remove('hidden');
    el.style.color = isError ? '#c0392b' : '';
    el.textContent = text;
}

/**
 * Share a private collection (S5). Steps: read → download a backup file → create the share
 * document → copy everything in (same IDs) → check the counts → delete the private originals.
 * If anything fails before the originals are deleted, the copy is removed again and the
 * original is untouched.
 */
async function shShareCollection(collId, shareGroups) {
    var me = _shMyUid();
    var groups = await _shLoadGroups();
    var myName = await shGetMyName();
    var flat = shFlatten(shareGroups, groups, me, myName);

    _shProgress('Reading the collection…');
    var bundle = await shReadCollectionBundle(collId, null);
    var title = bundle.collection.data().name || 'Collection';

    _shProgress('Saving a backup file…');
    var stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
    backupDownload('Bishop_Collection_Backup_' + title.replace(/[^A-Za-z0-9]+/g, '_') + '_' + stamp + '.json', _shBundleToJson(bundle));

    var shareRef = db.collection('shares').doc();
    var shareId = shareRef.id;
    var created = false;
    try {
        _shProgress('Creating the shared area…');
        // Must be its own write, before anything goes inside: the rules read this document.
        await topCol('shares').doc(shareId).set({
            ownerUid: me, kind: 'collection', title: title, collectionId: collId,
            shareGroups: shareGroups, viewerUids: flat.viewerUids, editorUids: flat.editorUids, names: flat.names,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        created = true;

        var ops = [];
        function add(docs, name) {
            docs.forEach(function(d) {
                var data = Object.assign({}, d.data());
                data.createdBy = data.createdBy || me;
                data.updatedBy = data.updatedBy || me;
                ops.push({ ref: shareCol(shareId, name).doc(d.id), data: data, name: name });
            });
        }
        add([bundle.collection], 'collections');
        add(bundle.items, 'collectionItems');
        add(bundle.photos, 'photos');
        await shBatchSet(ops, function(n, total) { _shProgress('Copying… ' + n + ' of ' + total); });

        _shProgress('Checking the copy…');
        var check = await shReadCollectionBundle(collId, shareId);
        if (check.items.length !== bundle.items.length || check.photos.length !== bundle.photos.length || !check.collection.exists) {
            throw new Error('The copy does not match the original (' + check.items.length + ' of ' + bundle.items.length + ' items, ' +
                            check.photos.length + ' of ' + bundle.photos.length + ' photos).');
        }
    } catch (err) {
        console.error('shShareCollection failed, rolling back:', err);
        _shProgress('Something went wrong — undoing. Your collection has not been changed.', true);
        if (created) { try { await shDeleteShareContents(shareId); await topCol('shares').doc(shareId).delete(); } catch (e2) { console.error('rollback failed:', e2); } }
        throw err;
    }

    // The copy is verified: remove the private originals.
    try {
        _shProgress('Removing the private copy…');
        var refs = bundle.photos.map(function(d) { return d.ref; })
            .concat(bundle.items.map(function(d) { return d.ref; }), [bundle.collection.ref]);
        await shBatchDelete(refs);
    } catch (err) {
        console.error('Could not remove the private originals:', err);
        throw new Error('Shared, but the private copy could not be fully removed (' + err.message + '). Nothing is lost; open Collections and try Share again or tell the developer.');
    }
    return shareId;
}

/** Deletes everything inside a share (not the share document itself). */
async function shDeleteShareContents(shareId, names) {
    names = names || ['photos', 'collectionItems', 'collections'];
    for (var i = 0; i < names.length; i++) {
        var snap = await shareCol(shareId, names[i]).get();
        await shBatchDelete(snap.docs.map(function(d) { return d.ref; }));
    }
}

/** Owner deletes a whole shared collection: contents first (the rules need the share document to exist), then the share. */
async function shDeleteSharedCollection(shareId) {
    await shDeleteShareContents(shareId);
    await topCol('shares').doc(shareId).delete();
}

/** Owner changes who a share is shared with (groups and roles). Data does not move. */
async function shUpdateShareGroups(shareId, shareGroups) {
    var me = _shMyUid();
    var groups = await _shLoadGroups();
    var flat = shFlatten(shareGroups, groups, me, await shGetMyName());
    await topCol('shares').doc(shareId).update({
        shareGroups: shareGroups, viewerUids: flat.viewerUids, editorUids: flat.editorUids, names: flat.names
    });
}

// ─── Which place does this collection / item live in? (S5) ───────────────────

/** Sets the global context that dataCol() callers (collections.js, photos.js) read. */
function _shSetCtx(shareId, role, shareData) {
    window.currentShareId   = shareId || null;
    window.currentShareRole = role || 'owner';   // 'owner' (also for private) | 'edit' | 'view'
    window.currentShareData = shareData || null;
}

/** Shares of kind 'collection' that I own or that were shared with me: [{id, role, data}] */
async function shLoadCollectionShares() {
    var mine = await shLoadMyShares();
    var withMe = await shLoadSharedWithMe();
    return mine.filter(function(s) { return s.kind === 'collection'; })
        .map(function(s) { return { id: s.id, role: 'owner', data: s.data }; })
        .concat(withMe.filter(function(s) { return s.kind === 'collection'; })
            .map(function(s) { return { id: s.id, role: s.role, data: s.data }; }));
}

/** Finds where collection `collId` lives (private or a share) and sets the global context. */
async function shResolveCollectionContext(collId) {
    var priv = await userCol('collections').doc(collId).get();
    if (priv.exists) { _shSetCtx(null, 'owner', null); return; }
    var shares = await shLoadCollectionShares();
    for (var i = 0; i < shares.length; i++) {
        if (shares[i].data.collectionId === collId) { _shSetCtx(shares[i].id, shares[i].role, shares[i].data); return; }
    }
    _shSetCtx(null, 'owner', null);     // not found anywhere: the page shows "not found"
}

/** Same for a collection item (the item page only has the item's ID). */
async function shResolveItemContext(itemId) {
    if (window.currentShareId) {      // fast path: we were just on that share's collection page
        var cur = await shareCol(window.currentShareId, 'collectionItems').doc(itemId).get();
        if (cur.exists) return;
    }
    var priv = await userCol('collectionItems').doc(itemId).get();
    if (priv.exists) { _shSetCtx(null, 'owner', null); return; }
    var shares = await shLoadCollectionShares();
    for (var i = 0; i < shares.length; i++) {
        var d = await shareCol(shares[i].id, 'collectionItems').doc(itemId).get();
        if (d.exists) { _shSetCtx(shares[i].id, shares[i].role, shares[i].data); return; }
    }
    _shSetCtx(null, 'owner', null);
}

/** collections.js / photos.js helper: the collection in the current context (private or share). */
function collCol(name) {
    return dataCol(name, window.currentShareId);
}

/** Stamp writes only when the thing lives in a share (private writes stay as they were). */
function shMaybeStamp(data, isNew) {
    return window.currentShareId ? shStamp(data, isNew) : data;
}

/** True when the current collection context lets the person add/change/delete items. */
function shCanEdit() {
    return !window.currentShareId || window.currentShareRole === 'owner' || window.currentShareRole === 'edit';
}

/** True only for the person who owns the thing (always true for private data). */
function shIsOwner() {
    return !window.currentShareId || window.currentShareRole === 'owner';
}

// ─── Share dialog (S5) ───────────────────────────────────────────────────────

var _shDlg = { kind: 'collection', collId: null, shareId: null, existingGroups: {} };

/** Opens the Share dialog for the collection on screen (owner only). */
async function shOpenShareDialog() {
    var col = window.currentCollection;
    if (!col || !shIsOwner()) return;
    _shDlg.kind = 'collection';
    _shDlg.collId = col.id;
    _shDlg.shareId = window.currentShareId || null;
    _shDlg.existingGroups = (window.currentShareData && window.currentShareData.shareGroups) || {};
    await _shShowShareDialog(
        (_shDlg.shareId ? 'Sharing “' : 'Share “') + (col.name || 'Collection') + '”',
        'Sharing moves this collection, its items and photos into a shared area. A backup file downloads first, and you stay the owner. Editors can add, change and delete items; only you can stop sharing or delete the whole collection.');
}

/** Opens the Share dialog for the whole Yard (owner only). */
async function shOpenYardShareDialog() {
    if (!yIsOwner()) return;
    _shDlg.kind = 'yard';
    _shDlg.collId = null;
    _shDlg.shareId = window.yardShareId || null;
    _shDlg.existingGroups = (window.yardShareData && window.yardShareData.shareGroups) || {};
    await _shShowShareDialog(
        _shDlg.shareId ? 'Sharing your Yard' : 'Share your Yard',
        'Sharing moves the whole yard into a shared area: zones, plants, weeds, chemicals, saved actions, map shapes, and their photos, facts, problems, quick tasks and activities. Calendar events stay private. A backup file downloads first, and you stay the owner. Editors can add, change and delete anything in the yard; only you can stop sharing.');
}

/** Fills and opens the shared dialog body (title, groups with View/Edit, buttons). */
async function _shShowShareDialog(titleText, noteNew) {
    var groups = [];
    try { groups = await _shLoadGroups(); } catch (err) { console.error(err); }

    document.getElementById('shDlgTitle').textContent = titleText;
    document.getElementById('shDlgProgress').classList.add('hidden');
    var body = document.getElementById('shDlgGroups');
    var note = document.getElementById('shDlgNote');
    var okBtn = document.getElementById('shDlgOkBtn');
    okBtn.disabled = false;
    okBtn.textContent = _shDlg.shareId ? 'Save' : 'Share';
    document.getElementById('shDlgCancelBtn').disabled = false;
    var stopBtn = document.getElementById('shDlgStopBtn');
    stopBtn.classList.toggle('hidden', !_shDlg.shareId);     // Stop sharing only exists for something already shared
    stopBtn.disabled = false;

    if (!groups.length) {
        body.innerHTML = '<p>You have no groups yet. Make one under <a href="#sharing" onclick="closeModal(\'shareDialogModal\')">Settings → Sharing</a> (for example Family), add people to it, then come back.</p>';
        okBtn.disabled = true;
    } else {
        var html = '';
        groups.forEach(function(g) {
            var cur = _shDlg.existingGroups[g.id] || '';
            var n = (g.memberUids || []).length;
            html += '<div class="form-group" style="display:flex; align-items:center; gap:8px;">' +
                      '<label style="flex:1; margin:0; min-width:110px;">' + escapeHtml(g.name) + ' <small style="color:#888; white-space:nowrap;">(' + n + ' ' + (n === 1 ? 'person' : 'people') + ')</small></label>' +
                      '<select data-group-id="' + g.id + '" style="width:auto; flex:0 0 auto;">' +
                        '<option value=""' + (cur === '' ? ' selected' : '') + '>Not shared</option>' +
                        '<option value="view"' + (cur === 'view' ? ' selected' : '') + '>View only</option>' +
                        '<option value="edit"' + (cur === 'edit' ? ' selected' : '') + '>Can edit</option>' +
                      '</select>' +
                    '</div>';
        });
        body.innerHTML = html;
    }
    note.textContent = _shDlg.shareId
        ? 'Changing who it is shared with does not move anything. People you remove lose access right away.'
        : noteNew;
    openModal('shareDialogModal');
}

async function shSubmitShareDialog() {
    var choice = {};
    document.querySelectorAll('#shDlgGroups select').forEach(function(sel) { if (sel.value) choice[sel.dataset.groupId] = sel.value; });
    var okBtn = document.getElementById('shDlgOkBtn');
    var cancelBtn = document.getElementById('shDlgCancelBtn');
    if (!_shDlg.shareId && !Object.keys(choice).length) { _shProgress('Pick at least one group first.', true); return; }
    okBtn.disabled = true; cancelBtn.disabled = true;
    try {
        if (_shDlg.kind === 'yard') {
            if (_shDlg.shareId) await shUpdateShareGroups(_shDlg.shareId, choice);
            else { _shProgress('Starting…'); await shShareYard(choice); }
            closeModal('shareDialogModal');
            await _shRefreshYardAfterChange();
        } else if (_shDlg.shareId) {
            await shUpdateShareGroups(_shDlg.shareId, choice);
            closeModal('shareDialogModal');
            loadCollectionPage(_shDlg.collId);
        } else {
            _shProgress('Starting…');
            var shareId = await shShareCollection(_shDlg.collId, choice);
            closeModal('shareDialogModal');
            loadCollectionPage(_shDlg.collId);     // stay on the collection; it now shows as Shared
        }
    } catch (err) {
        console.error(err);
        _shProgress('Could not finish: ' + err.message, true);
        okBtn.disabled = false; cancelBtn.disabled = false;
    }
}

// ─── Photos inside shares (S5) ───────────────────────────────────────────────
// photos.js calls these for every photo read/write.

/**
 * Which Firestore collection holds photos / thumbnails for this target type.
 * Collection photos live in the shared area while a collection is being used through a share
 * (window.currentShareId, set by collections.js); everything else is the person's own data.
 */
function _pCol(name, targetType) {
    var shareId = _pShareId(targetType);
    return shareId ? shareCol(shareId, name) : userCol(name);
}

/** The share a photo's target lives in right now (collections: the open collection; yard things: the active yard), or null. */
function _pShareId(targetType) {
    if (targetType === 'collectionitem' || targetType === 'collection') return window.currentShareId || null;
    if (_yIsYardTarget(targetType)) return window.yardShareId || null;
    return null;
}

/** Adds who-did-it stamps to a new photo when it goes into a share. */
function _pStamp(data, targetType) {
    return _pShareId(targetType) ? shStamp(data, true) : data;
}

// ─── Stop sharing / photo permissions / labels (S6) ──────────────────────────

/** False for someone who may only view the shared collection the photo belongs to. */
function _pCanEditPhoto(targetType) {
    if (!_pShareId(targetType)) return true;
    return _yIsYardTarget(targetType) ? yCanEdit() : shCanEdit();
}

/**
 * Stop sharing a collection (owner only): the reverse of shShareCollection. Everything,
 * including what other people added, is copied back to the owner's private area with the
 * same IDs, checked, and only then removed from the share. A backup file downloads first.
 * If the copy fails, the private copies are removed again and the share stays as it was.
 */
async function shUnshareCollection(shareId, collId) {
    _shProgress('Reading the shared collection…');
    var bundle = await shReadCollectionBundle(collId, shareId);
    var title = bundle.collection.data().name || 'Collection';

    _shProgress('Saving a backup file…');
    var stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
    backupDownload('Bishop_Collection_Backup_' + title.replace(/[^A-Za-z0-9]+/g, '_') + '_' + stamp + '.json', _shBundleToJson(bundle));

    var ops = [];
    function add(docs, name) {
        docs.forEach(function(d) { ops.push({ ref: userCol(name).doc(d.id), data: Object.assign({}, d.data()) }); });
    }
    add([bundle.collection], 'collections');
    add(bundle.items, 'collectionItems');
    add(bundle.photos, 'photos');

    try {
        await shBatchSet(ops, function(n, total) { _shProgress('Moving back… ' + n + ' of ' + total); });
        _shProgress('Checking the copy…');
        var check = await shReadCollectionBundle(collId, null);
        if (!check.collection.exists || check.items.length !== bundle.items.length || check.photos.length !== bundle.photos.length) {
            throw new Error('The copy does not match (' + check.items.length + ' of ' + bundle.items.length + ' items, ' +
                            check.photos.length + ' of ' + bundle.photos.length + ' photos).');
        }
    } catch (err) {
        console.error('shUnshareCollection failed, rolling back:', err);
        _shProgress('Something went wrong — undoing. The collection is still shared.', true);
        try { await shBatchDelete(ops.map(function(o) { return o.ref; })); } catch (e2) { console.error('rollback failed:', e2); }
        throw err;
    }

    _shProgress('Removing the shared copy…');
    await shDeleteSharedCollection(shareId);
}

async function shStopSharingFromDialog() {
    if (!_shDlg.shareId) return;
    var what = _shDlg.kind === 'yard' ? 'your Yard' : 'this collection';
    if (!confirm('Stop sharing ' + what + '?\n\nEverything — including what other people added — moves back to your private area. ' +
                 'The people it was shared with lose access. A backup file downloads first.')) return;
    var okBtn = document.getElementById('shDlgOkBtn');
    var stopBtn = document.getElementById('shDlgStopBtn');
    var cancelBtn = document.getElementById('shDlgCancelBtn');
    okBtn.disabled = true; stopBtn.disabled = true; cancelBtn.disabled = true;
    try {
        if (_shDlg.kind === 'yard') {
            await shUnshareYard(_shDlg.shareId);
            closeModal('shareDialogModal');
            await _shRefreshYardAfterChange();
        } else {
            await shUnshareCollection(_shDlg.shareId, _shDlg.collId);
            closeModal('shareDialogModal');
            loadCollectionPage(_shDlg.collId);       // resolves to the private copy now
        }
    } catch (err) {
        console.error(err);
        _shProgress('Could not finish: ' + err.message, true);
        okBtn.disabled = false; stopBtn.disabled = false; cancelBtn.disabled = false;
    }
}

/** The "Added by … / Changed by …" text for a document, only for things that live in a share. */
function shWhoLabelHere(docData) {
    return window.currentShareId ? shWhoLabel(docData, window.currentShareData) : '';
}

// ─── Other parts of the app that read collections (S7) ──────────────────────

/** Documents of `name` ('collections' | 'collectionItems') from collection shares: [{id, data()}...] — owned shares only when ownedOnly. */
async function shSharedDocs(name, ownedOnly) {
    var shares = await shLoadCollectionShares();
    var docs = [];
    for (var i = 0; i < shares.length; i++) {
        if (ownedOnly && shares[i].role !== 'owner') continue;
        var snap = await shareCol(shares[i].id, name).get();
        snap.docs.forEach(function(d) { docs.push(d); });
    }
    return docs;
}

/**
 * Like userCol(name).get(), but the result also includes that collection's documents from the
 * shares I OWN (they are still mine — e.g. for "Who Gets What"). Result supports forEach() only.
 */
async function shPrivateAndOwnedSnap(name) {
    var snap = await userCol(name).get();
    var extra = [];
    try { extra = await shSharedDocs(name, true); } catch (err) { console.error('Could not read my shared ' + name + ':', err); }
    return { forEach: function(fn) { snap.forEach(fn); extra.forEach(fn); } };
}

// ─── Backup and restore of shared collections I own (S7) ─────────────────────
// Added to the normal Data / Photos backup files as extra top-level keys
// (sharedCollections / sharedPhotos), so older restore code simply ignores them.

function _shRows(docs) { return docs.map(function(d) { return { id: d.id, data: backupSerialize(d.data()) }; }); }

/** Collection records + items of every collection I have shared. */
async function shBackupSharedCollections() {
    var mine = (await shLoadMyShares()).filter(function(s) { return s.kind === 'collection'; });
    var out = [];
    for (var i = 0; i < mine.length; i++) {
        var id = mine[i].id;
        var cols  = await shareCol(id, 'collections').get();
        var items = await shareCol(id, 'collectionItems').get();
        out.push({ shareId: id, collectionId: mine[i].data.collectionId, title: mine[i].title,
                   share: backupSerialize(mine[i].data), collections: _shRows(cols.docs), collectionItems: _shRows(items.docs) });
    }
    return out;
}

/** Photos of every collection I have shared. */
async function shBackupSharedPhotos() {
    var mine = (await shLoadMyShares()).filter(function(s) { return s.kind === 'collection'; });
    var out = [];
    for (var i = 0; i < mine.length; i++) {
        var snap = await shareCol(mine[i].id, 'photos').get();
        out.push({ shareId: mine[i].id, collectionId: mine[i].data.collectionId, photos: _shRows(snap.docs) });
    }
    return out;
}

/** True when `collId` is a collection that is currently shared by me (so a restore must not duplicate it). */
async function _shIsStillShared(collId) {
    return (await shLoadMyShares()).some(function(s) { return s.kind === 'collection' && s.data.collectionId === collId; });
}

/**
 * Data restore: a collection that was shared when the backup was taken comes back as a PRIVATE
 * collection (not re-shared) — unless it is still shared right now, in which case it is left alone.
 */
async function shRestoreSharedCollections(payload, log) {
    var list = payload.sharedCollections || [];
    for (var i = 0; i < list.length; i++) {
        var e = list[i];
        if (await _shIsStillShared(e.collectionId)) { log('• Shared collection “' + e.title + '” is still shared — left as it is.'); continue; }
        var ops = [];
        e.collections.forEach(function(r) { ops.push({ ref: userCol('collections').doc(r.id), data: r.data }); });
        e.collectionItems.forEach(function(r) { ops.push({ ref: userCol('collectionItems').doc(r.id), data: r.data }); });
        await shBatchSet(ops);
        log('✓ Shared collection “' + e.title + '” restored as a private collection (' + e.collectionItems.length + ' items). Share it again if you want.', '#2e7d32');
    }
}

/** Photos restore: photos of those collections go back only where the private collection exists and it is not shared. */
async function shRestoreSharedPhotos(payload, log) {
    var list = payload.sharedPhotos || [];
    for (var i = 0; i < list.length; i++) {
        var e = list[i];
        if (await _shIsStillShared(e.collectionId)) continue;
        var exists = (await userCol('collections').doc(e.collectionId).get()).exists;
        if (!exists) { log('• Photos of a shared collection were skipped (restore the Data file first).'); continue; }
        await shBatchSet(e.photos.map(function(r) { return { ref: userCol('photos').doc(r.id), data: r.data }; }));
        log('✓ ' + e.photos.length + ' photo(s) of a formerly shared collection restored.', '#2e7d32');
    }
}

// ─── The Yard in shares (Y1) ─────────────────────────────────────────────────
// The whole Yard is one share (kind 'yard'): zones, plants, weeds, chemicals and saved
// actions live in it, and so do the activities / photos / problems / facts / projects whose
// targetType is zone, plant, weed or chemical (see SharedYardPlan.md). The person looks at
// one yard at a time:
//   window.yardShareId   null = the person's own private yard, otherwise a share ID
//   window.yardRole      'owner' (also for private) | 'edit' | 'view'
//   window.yardShareData the share document's data (names{} for the "Added by" labels)

var YARD_TARGET_TYPES = ['zone', 'plant', 'weed', 'chemical'];
var YARD_CHOICE_KEY   = 'bishopYardChoice';     // per-device convenience: which yard was last open

window.yardShareId   = null;
window.yardRole      = 'owner';
window.yardShareData = null;
var _yardOptions = [{ id: null, role: 'owner', data: null, label: 'My yard' }];

/** True for the target types whose rows belong to the yard (the rest stay private). */
function _yIsYardTarget(targetType) {
    // Facts and photos on a problem follow the problem: yard while a yard problem's dialog is open.
    if (targetType === 'problem') return !!window.yardProblemOpen;
    return YARD_TARGET_TYPES.indexOf(targetType) !== -1;
}

/** A yard collection (zones, plants, weeds, chemicals, savedActions ...) in the active yard. */
function yardCol(name) {
    var col = dataCol(name, window.yardShareId);
    // In a share every write also records who/when (Y6); private yards are left exactly as they were.
    return window.yardShareId ? _yStampedRef(col) : col;
}

/**
 * Wraps a collection/document reference so add() / set() / update() add the who-did-it stamps.
 * Reads, deletes and batch use pass straight through (same pattern as _guardFirestoreRef).
 */
function _yStampedRef(ref) {
    return new Proxy(ref, {
        get: function(target, prop) {
            var orig = target[prop];
            if (typeof orig !== 'function') return orig;
            if (prop === 'add') return function(data) { return orig.call(target, shStamp(data, true)); };
            if (prop === 'update') return function(data) {
                return typeof data === 'object' && data !== null && arguments.length === 1
                    ? orig.call(target, shStamp(data)) : orig.apply(target, arguments);
            };
            if (prop === 'set') return function(data, opts) {
                return orig.call(target, shStamp(data, !(opts && opts.merge)), opts);
            };
            if (prop === 'doc') return function() { return _yStampedRef(orig.apply(target, arguments)); };
            return orig.bind(target);
        }
    });
}

/**
 * For the collections that also hold non-yard rows (activities, photos, problems, facts,
 * projects): the yard's collection when the row's target is a yard thing, else the person's own.
 */
function yTargetCol(name, targetType) {
    return _yIsYardTarget(targetType) ? yardCol(name) : userCol(name);
}

/** Stamp a yard write with who/when, only when the yard lives in a share. */
function yStamp(data, isNew) {
    return window.yardShareId ? shStamp(data, isNew) : data;
}

/** True when the person may add / change / delete inside the active yard. */
function yCanEdit() {
    return !window.yardShareId || window.yardRole === 'owner' || window.yardRole === 'edit';
}

/** True only for the owner of the active yard (always true for the private yard). */
function yIsOwner() {
    return !window.yardShareId || window.yardRole === 'owner';
}

function _ySetActive(opt) {
    window.yardShareId   = opt.id || null;
    window.yardRole      = opt.role || 'owner';
    window.yardShareData = opt.data || null;
}

/**
 * Works out which yards this person can open and which one is active: their own (private,
 * or the share it moved into) plus any yard shared with them. The last choice on this device
 * wins; otherwise their own yard. Never throws: on any failure the private yard stays active.
 */
async function shResolveYard() {
    try {
        var mine   = (await shLoadMyShares()).filter(function(s) { return s.kind === 'yard'; });
        var withMe = (await shLoadSharedWithMe()).filter(function(s) { return s.kind === 'yard'; });
        var options = [];
        if (mine.length) options.push({ id: mine[0].id, role: 'owner', data: mine[0].data, label: 'My yard' });
        else             options.push({ id: null, role: 'owner', data: null, label: 'My yard' });
        withMe.forEach(function(s) {
            options.push({ id: s.id, role: s.role, data: s.data, label: s.ownerName + '’s yard' });
        });
        var saved = null;
        try { saved = localStorage.getItem(YARD_CHOICE_KEY); } catch (e) { /* storage blocked: fine */ }
        var pick = options[0];
        options.forEach(function(o) { if ((o.id || 'private') === saved) pick = o; });
        _yardOptions = options;
        _ySetActive(pick);
        yApplyViewOnlyMode();
    } catch (err) {
        console.error('shResolveYard:', err);
        _yardOptions = [{ id: null, role: 'owner', data: null, label: 'My yard' }];
        _ySetActive(_yardOptions[0]);
    }
}

/** Started at sign-in (app.js); screens that need the answer wait on it. */
function yardReady() {
    if (!window._yardReadyPromise) window._yardReadyPromise = shResolveYard();
    return window._yardReadyPromise;
}

/** Fills the "Yard: …" picker on the Yard home. Hidden unless there is more than one yard to open. */
async function shRenderYardSwitcher() {
    var box = document.getElementById('yardSwitcher');
    var title = document.getElementById('yardHomeTitle');
    if (!box) return;
    await yardReady();
    var active = window.yardShareId || 'private';
    var cur = _yardOptions.filter(function(o) { return (o.id || 'private') === active; })[0] || _yardOptions[0];
    if (title) title.textContent = cur.label === 'My yard' ? 'My Yard' : cur.label.replace(/^./, function(c) { return c.toUpperCase(); });
    var shareBtn = document.getElementById('shareYardBtn');     // only the owner shares, and only their own yard
    if (shareBtn) {
        shareBtn.classList.toggle('hidden', !yIsOwner());
        shareBtn.textContent = window.yardShareId ? 'Sharing…' : 'Share…';
    }
    var banner = document.getElementById('yardRoleBanner');
    if (banner) {
        var who = cur.id && cur.data && cur.data.names ? (cur.data.names[cur.data.ownerUid] || 'someone') : '';
        banner.textContent = !cur.id ? '' :
            cur.role === 'owner' ? 'Shared yard — you are the owner.' :
            (cur.role === 'edit' ? 'Can edit' : 'View only') + ' · shared by ' + who;
        banner.style.display = banner.textContent ? '' : 'none';
    }
    if (_yardOptions.length < 2) { box.classList.add('hidden'); box.innerHTML = ''; return; }
    var html = '<label style="font-size:0.9rem; color:#666;">Yard: </label><select id="yardSwitcherSelect" onchange="shSwitchYard(this.value)" style="width:auto;">';
    _yardOptions.forEach(function(o) {
        var key = o.id || 'private';
        var role = o.id && o.role === 'edit' ? ' (can edit)' : (o.id && o.role === 'view' ? ' (view only)' : '');
        html += '<option value="' + key + '"' + (key === active ? ' selected' : '') + '>' + escapeHtml(o.label + role) + '</option>';
    });
    box.innerHTML = html + '</select>';
    box.classList.remove('hidden');
}

/** Picker changed: remember the choice, make that yard active and redraw the Yard home. */
function shSwitchYard(key) {
    var opt = _yardOptions.filter(function(o) { return (o.id || 'private') === key; })[0];
    if (!opt) return;
    try { localStorage.setItem(YARD_CHOICE_KEY, key); } catch (e) { /* storage blocked: fine */ }
    _ySetActive(opt);
    yApplyViewOnlyMode();
    loadZonesList();
    shRenderYardSwitcher();
}

/**
 * A collection by name for screens that follow a link to "whatever this is" (zones, plants,
 * weeds, chemicals, saved actions belong to the yard; every other name is the person's own).
 */
var YARD_WHOLE_COLLECTIONS = ['zones', 'plants', 'weeds', 'chemicals', 'savedActions', 'gpsShapes'];
function yNameCol(name) {
    return YARD_WHOLE_COLLECTIONS.indexOf(name) !== -1 ? yardCol(name) : userCol(name);
}

/**
 * For screens that need ALL rows of a mixed collection (e.g. every activity that used a chemical):
 * same as yReadAll (private area plus every yard the person can open).
 */
async function yGetAll(name, build) { return yReadAll(name, build); }

/**
 * Deep links (#plant/abc, #zone/abc ...) carry only an ID. If the thing is not in the active
 * yard but is in another yard the person can open, switch to that yard first.
 */
async function yardEnsureFor(name, id) {
    await yardReady();
    if (_yardOptions.length < 2 || !id) return;
    try { if ((await yardCol(name).doc(id).get()).exists) return; } catch (e) { /* fall through to the others */ }
    for (var i = 0; i < _yardOptions.length; i++) {
        var o = _yardOptions[i];
        if ((o.id || null) === (window.yardShareId || null)) continue;
        try {
            if ((await dataCol(name, o.id).doc(id).get()).exists) {
                try { localStorage.setItem(YARD_CHOICE_KEY, o.id || 'private'); } catch (e) { /* ok */ }
                _ySetActive(o);
                yApplyViewOnlyMode();
                shRenderYardSwitcher();
                return;
            }
        } catch (e) { /* not readable: skip */ }
    }
}

// ─── View-only yards (Y2) ────────────────────────────────────────────────────
// The security rules are what really stop a viewer from writing. This only tidies the screens:
// in a view-only yard, buttons that add / change / delete are hidden on the yard pages, and
// checklist boxes are disabled. Matching is by the button's words, so it covers buttons that
// the screens draw later too.

var YARD_PAGE_IDS = ['page-home', 'page-yard-projects', 'page-yard-problems', 'page-zone', 'page-plant', 'page-weeds',
                     'page-weed', 'page-chemicals', 'page-chemical', 'page-actions', 'page-gpsmap', 'page-yardmap'];
var _YARD_EDIT_WORDS = /^\s*(\+|add\b|edit\b|delete\b|remove\b|log\b|save\b|move\b|copy\b|clone\b|complete\b|reopen\b|resolve\b|new\b|set\b|crop\b|caption\b|rename\b|import\b|scan\b|draw\b|bulk\b|take\b|upload\b|choose\b|📷|📋|✏|🗑|➕)/i;
var _yVoTimer = null, _yVoObserver = null;

function _yVoSweep() {
    var on = window.yardShareId && window.yardRole === 'view';
    YARD_PAGE_IDS.forEach(function(pid) {
        var page = document.getElementById(pid);
        if (!page) return;
        page.querySelectorAll('button').forEach(function(b) {
            if (b.dataset.yardKeep) return;
            if (on && _YARD_EDIT_WORDS.test(b.textContent || '')) b.classList.add('yard-vo-hide');
            else b.classList.remove('yard-vo-hide');
        });
        page.querySelectorAll('[data-project-id] input[type=checkbox]').forEach(function(c) { c.disabled = !!on; });
        page.querySelectorAll('.add-checklist-row').forEach(function(r) { r.classList.toggle('yard-vo-hide', !!on); });
    });
}

/** Turns the view-only tidy-up on or off to match the active yard. */
function yApplyViewOnlyMode() {
    var on = !!(window.yardShareId && window.yardRole === 'view');
    document.body.classList.toggle('yard-view-only', on);
    if (on && !_yVoObserver && window.MutationObserver) {
        _yVoObserver = new MutationObserver(function() {
            clearTimeout(_yVoTimer);
            _yVoTimer = setTimeout(_yVoSweep, 120);
        });
        _yVoObserver.observe(document.body, { childList: true, subtree: true });
    }
    if (!on && _yVoObserver) { _yVoObserver.disconnect(); _yVoObserver = null; }
    _yVoSweep();
}

/** Small "Added by … / Changed by …" line under a yard page's title (only when Show who added/modified is on). */
function yShowWho(titleElId, data) {
    var title = document.getElementById(titleElId);
    if (!title) return;
    var header = title.closest('.page-header') || title.parentElement;
    var el = header.nextElementSibling;
    if (!el || !el.classList.contains('yard-who-label')) {
        el = document.createElement('p');
        el.className = 'yard-who-label';
        el.style.cssText = 'color:#888; font-size:0.85rem; margin:0 16px 8px;';
        header.parentNode.insertBefore(el, header.nextSibling);
    }
    var text = window.yardShareId ? shWhoLabel(data, window.yardShareData) : '';
    el.textContent = text;
    el.style.display = text ? '' : 'none';
}

/**
 * Every place yard rows can live for this person: their own private area plus every yard share
 * they can open (their own, or shared with them). Used by screens that look across all yards.
 */
async function yPlaces() {
    await yardReady();
    var ids = [null];
    _yardOptions.forEach(function(o) { if (o.id) ids.push(o.id); });
    return ids;
}

/**
 * Like userCol(name).get() but across ALL the person's yards (see yPlaces). `build` optionally
 * turns each collection into a query: yReadAll('activities', function(c) { return c.where(...); }).
 * Returns a snapshot-like object: forEach, docs, size, empty.
 */
async function yReadAll(name, build) {
    var places = await yPlaces();
    var snaps = await Promise.all(places.map(function(id) {
        var col = dataCol(name, id);
        return (build ? build(col) : col).get();
    }));
    var docs = [];
    snaps.forEach(function(s) { s.forEach(function(d) { docs.push(d); }); });
    return { docs: docs, size: docs.length, empty: docs.length === 0, forEach: function(fn) { docs.forEach(fn); } };
}

// ─── Share / Stop sharing the Yard (Y4) ──────────────────────────────────────
// Same recipe as a collection (backup → create the share → copy with the same IDs → check the
// counts → delete the originals), but the yard is many collections. Whole collections move as
// they are; activities / photos / problems / facts / projects move only for yard targets.

var YARD_SHARE_WHOLE = ['zones', 'plants', 'weeds', 'chemicals', 'savedActions', 'gpsShapes'];
var YARD_SHARE_MIXED = ['activities', 'photos', 'problems', 'facts', 'projects'];
var YARD_SHARE_ALL   = YARD_SHARE_MIXED.concat(YARD_SHARE_WHOLE);   // delete order: children before parents

/**
 * Everything that belongs to the yard in one place: { collectionName: [docSnapshots] }.
 * From a share (shareId given) every document there is the yard's. From the private area the
 * mixed collections are cut down to yard targets, plus the facts/photos on yard problems.
 */
async function shReadYardBundle(shareId) {
    var out = {};
    for (var i = 0; i < YARD_SHARE_WHOLE.length; i++) {
        out[YARD_SHARE_WHOLE[i]] = (await dataCol(YARD_SHARE_WHOLE[i], shareId).get()).docs;
    }
    for (var j = 0; j < YARD_SHARE_MIXED.length; j++) {
        var name = YARD_SHARE_MIXED[j];
        out[name] = shareId
            ? (await dataCol(name, shareId).get()).docs
            : (await userCol(name).where('targetType', 'in', YARD_TARGET_TYPES).get()).docs;
    }
    if (!shareId) {      // facts and photos on a yard problem follow the problem
        var problemIds = {};
        out.problems.forEach(function(d) { problemIds[d.id] = true; });
        var nested = ['facts', 'photos'];
        for (var k = 0; k < nested.length; k++) {
            var snap = await userCol(nested[k]).where('targetType', '==', 'problem').get();
            snap.docs.forEach(function(d) { if (problemIds[d.data().targetId]) out[nested[k]].push(d); });
        }
    }
    return out;
}

function _shYardCounts(bundle) {
    var c = {};
    YARD_SHARE_ALL.forEach(function(n) { c[n] = (bundle[n] || []).length; });
    return c;
}

/** Per-collection comparison; returns '' when every collection has at least the expected number. */
function _shYardCompare(expected, actual) {
    var bad = YARD_SHARE_ALL.filter(function(n) { return actual[n] < expected[n]; })
        .map(function(n) { return n + ' ' + actual[n] + ' of ' + expected[n]; });
    return bad.join(', ');
}

function _shYardBundleToJson(bundle, type) {
    var cols = {};
    YARD_SHARE_ALL.forEach(function(n) {
        cols[n] = (bundle[n] || []).map(function(d) { return { id: d.id, data: backupSerialize(d.data()) }; });
    });
    return { version: 1, type: type, exportedAt: new Date().toISOString(), collections: cols };
}

function _shYardBackupFile(bundle, type) {
    var stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
    backupDownload('Bishop_Yard_Backup_' + stamp + '.json', _shYardBundleToJson(bundle, type));
}

/** Share my private yard. Nothing private is removed until the shared copy is checked. */
async function shShareYard(shareGroups) {
    var me = _shMyUid();
    var existing = (await shLoadMyShares()).filter(function(s) { return s.kind === 'yard'; });
    if (existing.length) throw new Error('Your yard is already shared.');
    var groups = await _shLoadGroups();
    var flat = shFlatten(shareGroups, groups, me, await shGetMyName());

    _shProgress('Reading the yard…');
    var bundle = await shReadYardBundle(null);
    var expected = _shYardCounts(bundle);

    _shProgress('Saving a backup file…');
    _shYardBackupFile(bundle, 'yard-before-share');

    var shareId = db.collection('shares').doc().id;
    var created = false;
    try {
        _shProgress('Creating the shared area…');
        await topCol('shares').doc(shareId).set({      // its own write first: the rules read this document
            ownerUid: me, kind: 'yard', title: 'Yard',
            shareGroups: shareGroups, viewerUids: flat.viewerUids, editorUids: flat.editorUids, names: flat.names,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        created = true;

        var ops = [];
        YARD_SHARE_WHOLE.concat(YARD_SHARE_MIXED).forEach(function(name) {
            bundle[name].forEach(function(d) {
                var data = Object.assign({}, d.data());
                data.createdBy = data.createdBy || me;
                data.updatedBy = data.updatedBy || me;
                ops.push({ ref: shareCol(shareId, name).doc(d.id), data: data });
            });
        });
        await shBatchSet(ops, function(n, total) { _shProgress('Copying… ' + n + ' of ' + total); });

        _shProgress('Checking the copy…');
        var problem = _shYardCompare(expected, _shYardCounts(await shReadYardBundle(shareId)));
        if (problem) throw new Error('The copy does not match the original (' + problem + ').');
    } catch (err) {
        console.error('shShareYard failed, rolling back:', err);
        _shProgress('Something went wrong — undoing. Your yard has not been changed.', true);
        if (created) {
            try { await shDeleteShareContents(shareId, YARD_SHARE_ALL); await topCol('shares').doc(shareId).delete(); }
            catch (e2) { console.error('rollback failed:', e2); }
        }
        throw err;
    }

    try {
        _shProgress('Removing the private copy…');
        var refs = [];
        YARD_SHARE_ALL.forEach(function(name) { bundle[name].forEach(function(d) { refs.push(d.ref); }); });
        await shBatchDelete(refs, function(n, total) { _shProgress('Removing the private copy… ' + n + ' of ' + total); });
    } catch (err) {
        console.error('Could not remove the private originals:', err);
        throw new Error('Shared, but the private copy could not be fully removed (' + err.message + '). Nothing is lost; tell the developer before changing anything.');
    }
    return shareId;
}

/** Stop sharing the yard: everything (including what others added) comes back to my private area. */
async function shUnshareYard(shareId) {
    _shProgress('Reading the shared yard…');
    var bundle = await shReadYardBundle(shareId);
    var expected = _shYardCounts(bundle);

    _shProgress('Saving a backup file…');
    _shYardBackupFile(bundle, 'yard-before-unshare');

    var ops = [];
    YARD_SHARE_WHOLE.concat(YARD_SHARE_MIXED).forEach(function(name) {
        bundle[name].forEach(function(d) { ops.push({ ref: userCol(name).doc(d.id), data: Object.assign({}, d.data()) }); });
    });
    try {
        await shBatchSet(ops, function(n, total) { _shProgress('Moving back… ' + n + ' of ' + total); });
        _shProgress('Checking the copy…');
        var problem = _shYardCompare(expected, _shYardCounts(await shReadYardBundle(null)));
        if (problem) throw new Error('The copy does not match (' + problem + ').');
    } catch (err) {
        console.error('shUnshareYard failed, rolling back:', err);
        _shProgress('Something went wrong — undoing. The yard is still shared.', true);
        try { await shBatchDelete(ops.map(function(o) { return o.ref; })); } catch (e2) { console.error('rollback failed:', e2); }
        throw err;
    }

    _shProgress('Removing the shared copy…');
    await shDeleteShareContents(shareId, YARD_SHARE_ALL);
    await topCol('shares').doc(shareId).delete();
}

/** After sharing, changing who it is shared with, or stopping: pick the active yard again and redraw. */
async function _shRefreshYardAfterChange() {
    try { localStorage.removeItem(YARD_CHOICE_KEY); } catch (e) { /* ok */ }
    window._yardReadyPromise = null;
    await yardReady();
    if (typeof loadZonesList === 'function') loadZonesList();
    shRenderYardSwitcher();
}
