// Bishop Service Worker — Phase 2
// Caches all local static assets so the app loads offline.
// IMPORTANT: Bump CACHE_NAME on every deploy so users get fresh files.

var CACHE_NAME = 'bishop-v346';

var STATIC_ASSETS = [
    '/BishopHome/',
    '/BishopHome/index.html',
    '/BishopHome/manifest.json',
    '/BishopHome/css/styles.css',
    '/BishopHome/js/firebase-config.js',
    '/BishopHome/js/auth.js',
    '/BishopHome/js/zones.js',
    '/BishopHome/js/plants.js',
    '/BishopHome/js/problems.js',
    '/BishopHome/js/facts.js',
    '/BishopHome/js/projects.js',
    '/BishopHome/js/chemicals.js',
    '/BishopHome/js/activities.js',
    '/BishopHome/js/photos.js',
    '/BishopHome/js/weeds.js',
    '/BishopHome/js/calendar.js',
    '/BishopHome/js/gps.js',
    '/BishopHome/js/settings.js',
    '/BishopHome/js/devnotes.js',
    '/BishopHome/js/house.js',
    '/BishopHome/js/floorplan.js',
    '/BishopHome/js/floorplanitem.js',
    '/BishopHome/js/search.js',
    '/BishopHome/js/activityreport.js',
    '/BishopHome/js/checklists.js',
    '/BishopHome/js/bulkactivity.js',
    '/BishopHome/js/vehicles.js',
    '/BishopHome/js/garage.js',
    '/BishopHome/js/structures.js',
    '/BishopHome/js/moveThings.js',
    '/BishopHome/js/journal.js',
    '/BishopHome/js/contacts.js',
    '/BishopHome/js/people.js',
    '/BishopHome/js/collections.js',
    '/BishopHome/js/beneficiaries.js',
    '/BishopHome/js/health.js',
    '/BishopHome/js/notes.js',
    '/BishopHome/js/lifecalendar.js',
    '/BishopHome/js/life-projects.js',
    '/BishopHome/js/chat.js',
    '/BishopHome/js/secondbrain.js',
    '/BishopHome/js/sbissues.js',
    '/BishopHome/js/places.js',
    '/BishopHome/js/thoughts.js',
    '/BishopHome/js/top10lists.js',
    '/BishopHome/js/memories.js',
    '/BishopHome/js/firebasesetup.js',
    '/BishopHome/js/views.js',
    '/BishopHome/js/legacy-crypto.js',
    '/BishopHome/js/legacy.js',
    '/BishopHome/js/credentials.js',
    '/BishopHome/js/investments.js',
    '/BishopHome/js/app.js',
    '/BishopHome/icons/icon-192.png',
    '/BishopHome/icons/icon-512.png',
    '/BishopHome/icons/icon-maskable-512.png'
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
    if (e.request.method !== 'GET' || !url.includes('/BishopHome/')) {
        return;
    }

    e.respondWith(
        caches.match(e.request, { ignoreSearch: true }).then(function(cached) {
            return cached || fetch(e.request);
        })
    );
});
