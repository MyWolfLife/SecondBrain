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
    await shRenderPeople();
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
        // TODO (S5): re-compute the guest list of anything I shared with them.
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
        }
    }
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
        // TODO (S5): re-compute the guest list of every share that used this group.
        await topCol('groups').doc(id).delete();
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
        // TODO (S5): re-compute the guest list of every share that uses this group.
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
        // TODO (S5): re-compute the guest list of every share that uses this group.
        await shRenderGroups();
    } catch (err) {
        console.error(err);
        alert('Could not remove: ' + err.message);
    }
}
