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

/**
 * Keeps the shared #offlineBanner in sync with two different states:
 * deliberate Offline Trip Mode (takes priority) vs. an ordinary loss of
 * signal (navigator.onLine). Replaces the simpler banner logic that used
 * to live in app.js, since there are now two things it needs to reflect.
 */
function updateOfflineModeBanner() {
    var banner = document.getElementById('offlineBanner');
    if (!banner) return;
    if (isOfflineModeActive()) {
        banner.textContent = "🔒 Offline Trip Mode is ON — using data saved on this device. Tap “Go Online” in Settings when you're back on a connection.";
        banner.classList.remove('hidden');
    } else if (!navigator.onLine) {
        banner.textContent = "⚡ You're offline — changes will sync when you reconnect";
        banner.classList.remove('hidden');
    } else {
        banner.classList.add('hidden');
    }
}

window.addEventListener('online', updateOfflineModeBanner);
window.addEventListener('offline', updateOfflineModeBanner);

document.addEventListener('DOMContentLoaded', function() {
    updateOfflineModeBanner();
    renderOfflineSyncSection();
});
