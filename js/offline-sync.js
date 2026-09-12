// ============================================================
// Offline Sync — "Go Offline" / "Go Online" (Phase 2.5 of the PWA plan)
//
// Purpose: a manual, deliberate offline mode for trips with no signal
// for days or weeks (e.g. a vacation with no cell service). Rather than
// relying on Firestore's automatic caching (which only holds whatever
// was recently viewed), "Go Offline" downloads a full copy of the
// user's data first, then forces the app to stop trying to reach the
// network at all. "Go Online" reconnects and lets Firestore's normal
// queued-write sync take over from there.
//
// See PwaPlan.md, Phase 2.5, for the full design notes.
// ============================================================

/** True when running as the installed home-screen app, not a regular browser tab. */
function isStandalonePWA() {
    return window.matchMedia('(display-mode: standalone)').matches ||
           window.navigator.standalone === true;
}

/** True when this device currently has Offline Trip Mode turned on. */
function isOfflineModeActive() {
    return localStorage.getItem('bishopOfflineMode') === 'true';
}

/**
 * Downloads a full copy of the user's data to this device, then switches
 * the app into offline-only mode. Reuses backupReadCollections() from
 * settings.js so the same collection list (kept up to date for Backup &
 * Restore) is what gets prefetched here — nothing extra to maintain.
 */
async function goOffline() {
    if (!isStandalonePWA()) {
        alert('Offline Trip Mode requires the installed app.\n\nAdd this app to your Home Screen first (Share button → Add to Home Screen on iPhone, or the install prompt on Android), then open it from that icon and try again.\n\nA regular browser tab can have its saved data cleared after a few days of inactivity, which would defeat the purpose of Offline Trip Mode.');
        return;
    }
    if (!navigator.onLine) {
        alert('You need an internet connection to go offline — this step has to download a full copy of your data first.');
        return;
    }

    var offlineBtn = document.getElementById('goOfflineBtn');
    var statusEl = document.getElementById('offlineSyncStatus');
    if (offlineBtn) { offlineBtn.disabled = true; offlineBtn.textContent = 'Downloading your data…'; }
    if (statusEl) statusEl.textContent = 'Downloading all your data — this can take a minute…';

    try {
        // Same collections Backup & Restore uses, so anything added there
        // is automatically included here too.
        await backupReadCollections(BACKUP_DATA_COLLECTIONS);
        await backupReadCollections(['photos']);

        // Write the read-only lock flag BEFORE disconnecting, while we still
        // have a connection to write it. Any other session (the web app,
        // another device) will see this via the live listener in
        // offlineLockInit() and switch to read-only. This device is exempt
        // from its own lock — see applyDataLock().
        await userCol('settings').doc('offlineMode').set({
            active: true,
            device: navigator.userAgent,
            startedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        await firebase.firestore().disableNetwork();
        localStorage.setItem('bishopOfflineMode', 'true');

        updateOfflineModeBanner();
        if (statusEl) statusEl.textContent = '✓ Offline Trip Mode is ON — your data is saved to this device.';
    } catch (err) {
        console.error('Go Offline failed:', err);
        if (statusEl) statusEl.textContent = 'Something went wrong downloading your data — check your connection and try again.';
    } finally {
        if (offlineBtn) { offlineBtn.disabled = false; offlineBtn.textContent = 'Go Offline'; }
        renderOfflineSyncSection();
    }
}

/** Reconnects to Firestore and lets any queued offline changes sync up. */
async function goOnline() {
    var onlineBtn = document.getElementById('goOnlineBtn');
    var statusEl = document.getElementById('offlineSyncStatus');
    if (onlineBtn) { onlineBtn.disabled = true; onlineBtn.textContent = 'Reconnecting…'; }
    if (statusEl) statusEl.textContent = 'Reconnecting and syncing any changes you made…';

    try {
        await firebase.firestore().enableNetwork();

        // Clear the lock flag now that we're back online. Any writes made
        // while offline were already queued locally by Firestore and will
        // flush automatically now that the network is back on.
        await userCol('settings').doc('offlineMode').set({
            active: false,
            endedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        localStorage.removeItem('bishopOfflineMode');

        updateOfflineModeBanner();
        if (statusEl) statusEl.textContent = '✓ Back online — any changes you made are syncing now.';
    } catch (err) {
        console.error('Go Online failed:', err);
        if (statusEl) statusEl.textContent = 'Something went wrong reconnecting — try again.';
    } finally {
        if (onlineBtn) { onlineBtn.disabled = false; onlineBtn.textContent = 'Go Online'; }
        renderOfflineSyncSection();
    }
}

/** Shows the Go Offline button or the Go Online button, whichever applies right now. */
function renderOfflineSyncSection() {
    var offlineBtn = document.getElementById('goOfflineBtn');
    var onlineBtn = document.getElementById('goOnlineBtn');
    if (!offlineBtn || !onlineBtn) return;
    var active = isOfflineModeActive();
    offlineBtn.classList.toggle('hidden', active);
    onlineBtn.classList.toggle('hidden', !active);
}

// Set by offlineLockInit()'s live listener: whether SOME device (this one or
// another) currently has an active Offline Trip Mode session, per Firestore.
var _sharedOfflineLockActive = false;

/**
 * Keeps the shared #offlineBanner in sync with three possible states:
 * 1. This device is itself in Offline Trip Mode (takes priority)
 * 2. Another device has an active Offline Trip Mode session, so this
 *    session is read-only
 * 3. An ordinary loss of signal (navigator.onLine)
 * Replaces the simpler banner logic that used to live in app.js, since
 * there's more than one thing to reflect now.
 */
function updateOfflineModeBanner() {
    var banner = document.getElementById('offlineBanner');
    if (!banner) return;
    if (isOfflineModeActive()) {
        banner.textContent = "🔒 Offline Trip Mode is ON — using data saved on this device. Tap “Go Online” in Settings when you're back on a connection.";
        banner.classList.remove('hidden');
    } else if (_sharedOfflineLockActive) {
        banner.textContent = "🔒 Read-only — another device is in Offline Trip Mode. Editing here is disabled until it reconnects (or use Force Unlock in Settings).";
        banner.classList.remove('hidden');
    } else if (!navigator.onLine) {
        banner.textContent = "⚡ You're offline — changes will sync when you reconnect";
        banner.classList.remove('hidden');
    } else {
        banner.classList.add('hidden');
    }
}

/**
 * Applies (or lifts) the read-only lock on this session's UI. This device
 * is exempt from its own lock (isOfflineModeActive() true) — otherwise a
 * phone that just went offline would lock itself out of editing.
 *
 * Covers the standard modal-based add/edit/delete pattern used by most of
 * the app (every modal shares the .modal-overlay wrapper): while locked,
 * every Save button (.btn-primary) and Delete button (.btn-danger) inside
 * a modal is hidden and disabled. Modals still open normally, so existing
 * data can still be viewed — only saving/deleting is blocked.
 *
 * Known gap: a smaller number of features use their own inline add/delete
 * buttons instead of the shared modal pattern (Investments/Stock Analyzer,
 * Checklists, Life Projects, Journal, Health, Photos gallery, Notes,
 * Legacy, Memories, Neighbors, Views) and are NOT yet covered by this
 * lock — see PwaPlan.md Phase 2.5.
 */
function applyDataLock(sharedLockActive) {
    _sharedOfflineLockActive = sharedLockActive;
    var exemptSelf = isOfflineModeActive();
    var locked = sharedLockActive && !exemptSelf;

    document.body.classList.toggle('data-locked', locked);
    document.querySelectorAll('.modal-overlay .btn-primary, .modal-overlay .btn-danger').forEach(function(btn) {
        btn.disabled = locked;
    });

    var forceUnlockRow = document.getElementById('forceUnlockRow');
    if (forceUnlockRow) forceUnlockRow.classList.toggle('hidden', !locked);

    updateOfflineModeBanner();
}

/**
 * Starts a live listener on the shared offline-mode lock flag so this
 * session reacts immediately if another device goes offline or comes back
 * online, without needing a page reload. Called once from initApp() in
 * app.js, after sign-in.
 */
function offlineLockInit() {
    userCol('settings').doc('offlineMode').onSnapshot(function(doc) {
        var data = doc.data();
        applyDataLock(!!(data && data.active));
    }, function(err) {
        console.warn('Offline-lock listener error:', err);
    });
}

/**
 * Escape hatch for when the device that went offline can't come back to
 * clear the lock itself (lost, dead battery, forgot to sync). Clears the
 * shared lock flag from this session instead. Warns first, since forcing
 * this while that device still has queued offline changes risks it later
 * overwriting whatever gets edited here in the meantime.
 */
async function forceUnlockOfflineData() {
    var warned = confirm(
        'This removes the read-only lock without waiting for the offline device to reconnect.\n\n' +
        'Only do this if that device is lost, out of battery, or otherwise cannot be brought back online to sync normally — forcing this risks it later overwriting changes you make here in the meantime.\n\n' +
        'Continue?'
    );
    if (!warned) return;

    try {
        await userCol('settings').doc('offlineMode').set({
            active: false,
            forceUnlockedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    } catch (err) {
        console.error('Force unlock failed:', err);
        alert('Something went wrong removing the lock — check your connection and try again.');
    }
}

window.addEventListener('online', updateOfflineModeBanner);
window.addEventListener('offline', updateOfflineModeBanner);

document.addEventListener('DOMContentLoaded', function() {
    updateOfflineModeBanner();
    renderOfflineSyncSection();
});
