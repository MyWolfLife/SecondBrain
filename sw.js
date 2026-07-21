// Bishop Service Worker — Phase 2
// Caches all local static assets so the app loads offline.
// IMPORTANT: Bump CACHE_NAME on every deploy so users get fresh files.

var CACHE_NAME = 'bishop-v516';

var STATIC_ASSETS = [
    '/SecondBrain/',
    '/SecondBrain/index.html',
    '/SecondBrain/manifest.json',
    '/SecondBrain/css/styles.css',
    '/SecondBrain/js/firebase-config.js',
    '/SecondBrain/js/auth.js',
    '/SecondBrain/js/zones.js',
    '/SecondBrain/js/plants.js',
    '/SecondBrain/js/problems.js',
    '/SecondBrain/js/facts.js',
    '/SecondBrain/js/projects.js',
    '/SecondBrain/js/chemicals.js',
    '/SecondBrain/js/tags.js',
    '/SecondBrain/js/activities.js',
    '/SecondBrain/js/photos.js',
    '/SecondBrain/js/weeds.js',
    '/SecondBrain/js/calendar.js',
    '/SecondBrain/js/gps.js',
    '/SecondBrain/js/settings.js',
    '/SecondBrain/js/devnotes.js',
    '/SecondBrain/js/house.js',
    '/SecondBrain/js/floorplan.js',
    '/SecondBrain/js/floorplanitem.js',
    '/SecondBrain/js/search.js',
    '/SecondBrain/js/activityreport.js',
    '/SecondBrain/js/checklists.js',
    '/SecondBrain/js/bulkactivity.js',
    '/SecondBrain/js/vehicles.js',
    '/SecondBrain/js/garage.js',
    '/SecondBrain/js/structures.js',
    '/SecondBrain/js/moveThings.js',
    '/SecondBrain/js/journal.js',
    '/SecondBrain/js/contacts.js',
    '/SecondBrain/js/people.js',
    '/SecondBrain/js/collections.js',
    '/SecondBrain/js/beneficiaries.js',
    '/SecondBrain/js/health.js',
    '/SecondBrain/js/notes.js',
    '/SecondBrain/js/lifecalendar.js',
    '/SecondBrain/js/life-projects.js',
    '/SecondBrain/js/chat.js',
    '/SecondBrain/js/secondbrain.js',
    '/SecondBrain/js/sbissues.js',
    '/SecondBrain/js/places.js',
    '/SecondBrain/js/thoughts.js',
    '/SecondBrain/js/top10lists.js',
    '/SecondBrain/js/memories.js',
    '/SecondBrain/js/firebasesetup.js',
    '/SecondBrain/js/views.js',
    '/SecondBrain/js/legacy-crypto.js',
    '/SecondBrain/js/legacy.js',
    '/SecondBrain/js/credentials.js',
    '/SecondBrain/js/investments.js',
    '/SecondBrain/js/analyzer.js',
    '/SecondBrain/js/analyzer-fmp.js',
    '/SecondBrain/js/analyzer-data.js',
    '/SecondBrain/js/analyzer-engine.js',
    '/SecondBrain/js/analyzer-backtest.js',
    '/SecondBrain/js/analyzer-scan.js',
    '/SecondBrain/js/analyzer-trades.js',
    '/SecondBrain/js/analyzer-scoreboard.js',
    '/SecondBrain/js/analyzer-dualmomentum.js',
    '/SecondBrain/js/analyzer-stockmomentum.js',
    '/SecondBrain/js/analyzer-holdingshealth.js',
    '/SecondBrain/js/analyzer-qualityvalue.js',
    '/SecondBrain/js/analyzer-pead.js',
    '/SecondBrain/js/analyzer-news.js',
    '/SecondBrain/js/app.js',
    '/SecondBrain/icons/icon-192.png',
    '/SecondBrain/icons/icon-512.png',
    '/SecondBrain/icons/icon-maskable-512.png'
];

// Install: cache all static assets
self.addEventListener('install', function(e) {
    e.waitUntil(
        caches.open(CACHE_NAME).then(function(cache) {
            return cache.addAll(STATIC_ASSETS);
        })
    );
    self.skipWaiting();
});

// Activate: delete any old caches from previous versions
self.addEventListener('activate', function(e) {
    e.waitUntil(
        caches.keys().then(function(keys) {
            return Promise.all(
                keys.filter(function(k) { return k !== CACHE_NAME; })
                    .map(function(k) { return caches.delete(k); })
            );
        })
    );
    self.clients.claim();
});

// When the app tells us to skip waiting (user tapped "Update Now"), activate immediately
self.addEventListener('message', function(e) {
    if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

// Fetch: serve from cache when available, fall back to network.
// ignoreSearch: true means js/app.js?v=506 matches the cached js/app.js entry.
// External CDN requests (Firebase, Leaflet, etc.) always go to the network.
self.addEventListener('fetch', function(e) {
    var url = e.request.url;

    // Skip non-GET requests and external CDN URLs
    if (e.request.method !== 'GET' || !url.includes('/SecondBrain/')) {
        return;
    }

    e.respondWith(
        caches.match(e.request, { ignoreSearch: true }).then(function(cached) {
            return cached || fetch(e.request);
        })
    );
});
