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
