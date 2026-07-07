// ============================================================
// App.js — Main application logic
// Handles page routing (hash-based) and shared UI behavior
// ============================================================

// ---------- Shared Utilities ----------

/** Toggle a password input between masked and visible. btn is the Show/Hide button element. */
function _pwToggle(inputId, btn) {
    var inp = document.getElementById(inputId);
    if (!inp) return;
    inp.type = inp.type === 'password' ? 'text' : 'password';
    btn.textContent = inp.type === 'password' ? 'Show' : 'Hide';
}

// ---------- Edit-safe reload tracking ----------
// Prevents a service worker update from reloading the page mid-edit.
// Any input/textarea activity sets the dirty flag; navigation clears it.
// If an update arrives while dirty, it is deferred until the next navigation.
window._bishopDirty        = false;
window._bishopUpdatePending = false;

document.addEventListener('input', function(e) {
    var tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') {
        window._bishopDirty = true;
    }
});

window.addEventListener('hashchange', function() {
    window._bishopDirty = false;
    if (window._bishopUpdatePending) {
        window._bishopUpdatePending = false;
        window.location.reload();
    }
});

// ---------- PWA Service Worker Registration ----------
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        navigator.serviceWorker.register('/SecondBrain/sw.js').then(function(reg) {

            // Check if there's already a waiting SW on load (e.g. user opened a second tab)
            if (reg.waiting) { _swShowUpdateBanner(reg); }

            // Watch for a new SW finishing its install
            reg.addEventListener('updatefound', function() {
                var newSW = reg.installing;
                newSW.addEventListener('statechange', function() {
                    // 'installed' + existing controller = new version waiting to take over
                    if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
                        _swShowUpdateBanner(reg);
                    }
                });
            });

        }).catch(function(err) { console.warn('Service worker registration failed:', err); });

        // When the SW swaps in, reload — but defer if the user is mid-edit
        navigator.serviceWorker.addEventListener('controllerchange', function() {
            if (window._bishopDirty) {
                window._bishopUpdatePending = true;
            } else {
                window.location.reload();
            }
        });
    });
}

function _swShowUpdateBanner(reg) {
    var banner = document.getElementById('swUpdateBanner');
    if (!banner) return;
    banner.classList.remove('hidden');
    document.getElementById('swUpdateBtn').onclick = function() {
        if (reg.waiting) reg.waiting.postMessage('SKIP_WAITING');
    };
}

// ---------- Offline Banner ----------
(function() {
    var banner = document.getElementById('offlineBanner');
    if (!banner) return;
    function update() {
        if (navigator.onLine) {
            banner.classList.add('hidden');
        } else {
            banner.classList.remove('hidden');
        }
    }
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    update(); // set initial state
}());

// ---------- PWA Install Banner ----------
var _pwaDeferred = null; // holds the beforeinstallprompt event for later

(function() {
    // Don't show if already running as installed PWA
    var isStandalone = window.navigator.standalone ||
                       window.matchMedia('(display-mode: standalone)').matches;
    if (isStandalone) return;

    // Don't show if user already dismissed
    if (localStorage.getItem('pwaInstallDismissed')) return;

    var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) &&
                !/crios|fxios/i.test(navigator.userAgent); // exclude Chrome/Firefox on iOS

    if (isIOS) {
        // iOS Safari: can't programmatically prompt — show manual instructions
        var hint = document.getElementById('pwaInstallHint');
        var installBtn = document.getElementById('pwaInstallBtn');
        if (hint) hint.textContent = 'Tap Share ↑ then "Add to Home Screen"';
        if (installBtn) installBtn.style.display = 'none'; // no button needed on iOS
        // Show banner only in Safari (iOS Chrome can't install PWAs)
        var isSafari = /safari/i.test(navigator.userAgent) && !/chrome/i.test(navigator.userAgent);
        if (isSafari) _pwaShowBanner();
        return;
    }

    // Android / desktop: wait for browser install prompt
    window.addEventListener('beforeinstallprompt', function(e) {
        e.preventDefault();
        _pwaDeferred = e;
        _pwaShowBanner();
    });

    // Hide banner if user installs via browser UI (not our button)
    window.addEventListener('appinstalled', function() {
        _pwaHideBanner();
    });
}());

function _pwaShowBanner() {
    var banner = document.getElementById('pwaInstallBanner');
    if (banner) banner.classList.remove('hidden');
}

function _pwaHideBanner() {
    var banner = document.getElementById('pwaInstallBanner');
    if (banner) banner.classList.add('hidden');
}

function _pwaInstall() {
    if (!_pwaDeferred) return;
    _pwaDeferred.prompt();
    _pwaDeferred.userChoice.then(function(result) {
        if (result.outcome === 'accepted') {
            _pwaHideBanner();
        }
        _pwaDeferred = null;
    });
}

function _pwaDismiss() {
    localStorage.setItem('pwaInstallDismissed', '1');
    _pwaHideBanner();
}

// ---------- Router ----------
// We use the URL hash (#main, #home, #house, etc.) to show/hide pages.

/**
 * List of top-level pages that map to nav links.
 * These pages clear the breadcrumb bar when shown.
 */
const TOP_LEVEL_PAGES = ['home', 'weeds', 'calendar', 'maintenance', 'chemicals', 'actions', 'house', 'settings', 'settings-general', 'settings-contact-lists', 'firebase-setup', 'main', 'search', 'activityreport', 'checklists', 'checklist-focus', 'notes', 'chat', 'vehicles', 'garage', 'structures', 'life', 'journal', 'collections', 'changepassword', 'people', 'contacts', 'neighbors', 'places', 'devnotes',
                         'health', 'health-visits', 'health-medications', 'health-conditions', 'health-concerns', 'health-bloodwork',
                         'health-vitals', 'health-insurance', 'health-emergency', 'health-appointments', 'health-care-team',
                         'life-calendar', 'life-projects',
                         'exercise', 'exercise-activities', 'exercise-types', 'exercise-metrics', 'exercise-metric-defs',
                         'exercise-goals',
                         'legacy',
                         'private', 'private-bookmarks', 'private-documents', 'private-photos', 'private-photos-gallery',
                         'credentials',
                         'thoughts', 'top10lists', 'memories', 'views',
                         'budget', 'budget-archive', 'budget-nonmonthly'];

/**
 * All pages that can be shown (includes detail pages not in the nav).
 */
const ALL_PAGES = [
    ...TOP_LEVEL_PAGES,
    'zone', 'plant', 'weed', 'chemical', 'gpsmap', 'yardmap',
    'floor', 'room', 'thing', 'subthing', 'item', 'floorplan', 'panel', 'rooms', 'things', 'house-problems', 'house-projects', 'house-calendar-events', 'yard-projects', 'yard-problems', 'floorplanitem',
    'backup', 'vehicle',
    'garageroom', 'garagething', 'garagesubthing',
    'structure', 'structurething', 'structuresubthing',
    'journal-entry', 'journal-tracking', 'journal-categories',
    'collection', 'collectionitem', 'beneficiaries',
    'place',
    'person', 'contact',
    'neighborhood', 'neighborhouse', 'neighborarchive',
    'notebook', 'note',
    'devnote',
    'health-allergies', 'health-supplements', 'health-vaccinations', 'health-eye',
    'health-visit', 'health-visit-step2', 'health-medications', 'health-conditions', 'health-concerns', 'health-concern', 'health-condition',
    'health-bloodwork-detail', 'health-insurance-detail',
    'life-event',
    'life-projects', 'life-project',
    'legacy', 'legacy-burial', 'legacy-service', 'legacy-obituary', 'legacy-social',
    'legacy-accounts', 'legacy-financial-accounts', 'legacy-financial-loans', 'legacy-loans-form',
    'legacy-financial-bills', 'legacy-bills-form', 'legacy-financial-insurance', 'legacy-insurance-form', 'legacy-financial-plan',
    'legacy-documents', 'legacy-household',
    'legacy-pets', 'legacy-notify', 'legacy-letters', 'legacy-letter', 'legacy-intro', 'legacy-message',
    'top10list-create', 'top10list-edit',
    'memory-create', 'memory-edit',
    'view', 'view-history', 'views-categories',
    'credentials-add', 'credentials-edit', 'credentials-categories',
    'investments', 'investments-accounts', 'investments-account', 'investments-groups', 'investments-form', 'investments-summary', 'investments-snapshots', 'investments-snapshots-type', 'investments-stocks',
    'investments-ss-benefits', 'investments-ss-form', 'investments-ai-setup', 'investments-ai', 'investments-import',
    'budget', 'budget-archive', 'budget-nonmonthly',
    'exercise-activity', 'exercise-metric', 'exercise-goals-month', 'exercise-goal-exercises',
    'help'
];

/**
 * House-context pages — switching to any of these shows the house nav.
 * Yard-context pages — switching to any of these shows the yard nav.
 * Shared pages (calendar, settings) keep whichever context was last active.
 */
const HOUSE_PAGES = ['house', 'floor', 'room', 'thing', 'subthing', 'item', 'floorplan', 'panel', 'rooms', 'things', 'house-problems', 'house-projects', 'house-calendar-events', 'floorplanitem', 'beneficiaries'];
const YARD_PAGES  = ['main', 'home', 'zones', 'zone', 'plant', 'weeds', 'weed', 'chemicals', 'chemical', 'actions', 'gpsmap', 'yardmap', 'activityreport',
                     'structures', 'structure', 'structurething', 'structuresubthing', 'yard-projects', 'yard-problems'];
// NOTE: 'checklists' is intentionally NOT in any context list — it is a shared page
// that inherits the nav context that was active when the user clicked the Checklists link.
const THOUGHTS_PAGES = ['thoughts', 'top10lists', 'top10list-create', 'top10list-edit',
                        'memories', 'memory-create', 'memory-edit',
                        'views', 'view', 'view-history', 'views-categories'];

// Settings pages — hide all section navbars (yard/house/life/thoughts)
const SETTINGS_PAGES = ['settings', 'settings-general', 'settings-contact-lists', 'firebase-setup', 'changepassword', 'backup', 'devnotes', 'devnote', 'sb-issues'];

const LIFE_PAGES  = ['life', 'journal', 'journal-entry', 'journal-tracking', 'journal-categories', 'people', 'contacts', 'person', 'contact',
                     'neighbors', 'neighborhood', 'neighborhouse', 'neighborarchive',
                     'notes', 'notebook', 'note',
                     'health', 'health-visits', 'health-visit', 'health-visit-step2',
                     'health-medications', 'health-conditions', 'health-concerns', 'health-concern', 'health-condition',
                     'health-allergies', 'health-supplements', 'health-vaccinations', 'health-eye',
                     'health-bloodwork', 'health-bloodwork-detail',
                     'health-vitals', 'health-insurance', 'health-insurance-detail', 'health-emergency',
                     'health-appointments', 'health-care-team',
                     'life-calendar', 'life-event',
                     'life-projects', 'life-project',
                     'legacy', 'legacy-burial', 'legacy-service', 'legacy-obituary', 'legacy-social',
                     'legacy-accounts', 'legacy-financial-accounts', 'legacy-financial-loans', 'legacy-loans-form',
                     'legacy-financial-bills', 'legacy-bills-form', 'legacy-financial-insurance', 'legacy-insurance-form', 'legacy-financial-plan',
                     'legacy-documents', 'legacy-household',
                     'legacy-pets', 'legacy-notify', 'legacy-letters', 'legacy-letter', 'legacy-message',
                     'private', 'private-bookmarks', 'private-documents', 'private-photos', 'private-photos-gallery',
                     'credentials', 'credentials-add', 'credentials-edit', 'credentials-categories',
                     'investments', 'investments-accounts', 'investments-account', 'investments-groups', 'investments-form', 'investments-summary', 'investments-snapshots', 'investments-snapshots-type', 'investments-stocks',
                     'investments-ss-benefits', 'investments-ss-form', 'investments-ai-setup', 'investments-ai', 'investments-import',
                     'budget', 'budget-archive', 'budget-nonmonthly',
                     'exercise', 'exercise-activities', 'exercise-activity', 'exercise-types',
                     'exercise-metrics', 'exercise-metric', 'exercise-metric-defs',
                     'exercise-goals', 'exercise-goals-month', 'exercise-goal-exercises'];

/** Tracks which nav context is currently active ('yard', 'house', or 'life'). */
var currentNavContext = 'yard';

/**
 * Tracks the type of entity most recently loaded ('zone', 'floor', 'room',
 * 'vehicle', or null for top-level pages).  Used by clCaptureContext() to
 * determine which entity global is current vs. stale from a prior page.
 * Set in handleRoute() before each page load.
 */
window.clLastEntityType = null;

/**
 * Captures the current navigation context for the Checklists page.
 * Called in handleRoute() immediately before navigating to #checklists,
 * while entity globals (currentZone, currentRoom, etc.) are still fresh.
 *
 * Uses clLastEntityType to distinguish "I'm on a zone page" from "I was
 * on a zone page earlier but am now on a top-level yard page."
 *
 * @returns {Object}  — { type, id?, name? }
 */
function clCaptureContext() {
    var lastType = window.clLastEntityType;

    if (currentNavContext === 'life') {
        return { type: 'life' };
    }

    if (currentNavContext === 'house') {
        if (lastType === 'room' && window.currentRoom) {
            return { type: 'room', id: window.currentRoom.id, name: window.currentRoom.name };
        }
        if (lastType === 'floor' && window.currentFloor) {
            return { type: 'floor', id: window.currentFloor.id, name: window.currentFloor.name };
        }
        return { type: 'house' };
    }

    // Yard context (also covers garage / vehicle pages which share the yard nav)
    if (lastType === 'vehicle' && window.currentVehicle) {
        var v = window.currentVehicle;
        var vName = [v.year, v.make, v.model].filter(Boolean).join(' ') || 'Vehicle';
        return { type: 'vehicle', id: v.id, name: vName };
    }
    if (lastType === 'zone' && window.currentZone) {
        return { type: 'zone', id: window.currentZone.id, name: window.currentZone.name };
    }
    return { type: 'yard' };
}

/**
 * Navigate to a page by showing/hiding the right section.
 * Also swaps the nav bar between yard and house contexts.
 * @param {string} page - The page name (e.g., "home", "zone", "house")
 */
function showPage(page) {
    // Hide all page sections
    ALL_PAGES.forEach(function(p) {
        const el = document.getElementById('page-' + p);
        if (el) el.classList.add('hidden');
    });

    // Show the requested page
    const targetPage = document.getElementById('page-' + page);
    if (targetPage) targetPage.classList.remove('hidden');

    // Update nav context (shared pages keep the current context)
    var isSettingsPage = SETTINGS_PAGES.indexOf(page) !== -1;
    if (HOUSE_PAGES.indexOf(page) !== -1)          currentNavContext = 'house';
    else if (YARD_PAGES.indexOf(page) !== -1)      currentNavContext = 'yard';
    else if (LIFE_PAGES.indexOf(page) !== -1)      currentNavContext = 'life';
    else if (THOUGHTS_PAGES.indexOf(page) !== -1)  currentNavContext = 'thoughts';

    // Toggle yard / house / life / thoughts nav bars (desktop + mobile)
    // Settings pages hide all section navbars entirely.
    var isHouse    = !isSettingsPage && currentNavContext === 'house';
    var isLife     = !isSettingsPage && currentNavContext === 'life';
    var isThoughts = !isSettingsPage && currentNavContext === 'thoughts';
    var isYard     = !isSettingsPage && currentNavContext === 'yard';
    var yardNavEl           = document.getElementById('yardNav');
    var houseNavEl          = document.getElementById('houseNav');
    var lifeNavEl           = document.getElementById('lifeNav');
    var thoughtsNavEl       = document.getElementById('thoughtsNav');
    var mobileYardNavEl     = document.getElementById('mobileNavYard');
    var mobileHouseNavEl    = document.getElementById('mobileNavHouse');
    var mobileLifeNavEl     = document.getElementById('mobileNavLife');
    var mobileThoughtsNavEl = document.getElementById('mobileNavThoughts');
    if (yardNavEl)           yardNavEl.classList.toggle('hidden',  !isYard);
    if (houseNavEl)          houseNavEl.classList.toggle('hidden', !isHouse);
    if (lifeNavEl)           lifeNavEl.classList.toggle('hidden',  !isLife);
    if (thoughtsNavEl)       thoughtsNavEl.classList.toggle('hidden', !isThoughts);
    if (mobileYardNavEl)     mobileYardNavEl.classList.toggle('hidden',  !isYard);
    if (mobileHouseNavEl)    mobileHouseNavEl.classList.toggle('hidden', !isHouse);
    if (mobileLifeNavEl)     mobileLifeNavEl.classList.toggle('hidden',  !isLife);
    if (mobileThoughtsNavEl) mobileThoughtsNavEl.classList.toggle('hidden', !isThoughts);

    // Determine which nav link should be highlighted
    var navPage = page;
    if (page === 'zone' || page === 'plant' || page === 'gpsmap' || page === 'yardmap') navPage = 'home';
    if (page === 'structure' || page === 'structurething' || page === 'structuresubthing') navPage = 'structures';
    if (page === 'weed')       navPage = 'weeds';
    if (page === 'chemical')   navPage = 'chemicals';
    if (page === 'floor')      navPage = 'house';
    if (page === 'room')       navPage = 'house';
    if (page === 'thing')      navPage = 'house';
    if (page === 'floorplan')     navPage = 'house';
    if (page === 'floorplanitem') navPage = 'house';
    if (page === 'panel')         navPage = 'house';
    if (page === 'subthing')   navPage = 'house';
    if (page === 'item')       navPage = 'house';
    if (page === 'person')        navPage = 'people';   // Sub-page of people (legacy)
    if (page === 'contact')       navPage = 'contacts'; // Sub-page of contacts
    if (page === 'neighborhood')    navPage = 'contacts'; // Neighbor map — contacts section
    if (page === 'neighborhouse')   navPage = 'contacts'; // House detail — contacts section
    if (page === 'neighborarchive') navPage = 'contacts'; // Archived family view — contacts section
    if (page === 'notebook')   navPage = 'notes';  // Sub-page of notes
    if (page === 'note')       navPage = 'notes';  // Sub-page of notes
    if (page === 'main')           navPage = '';       // No link highlighted on the landing page
    if (page === 'view')           navPage = 'views';
    if (page === 'view-history')   navPage = 'views';
    if (page === 'views-categories') navPage = 'views';

    document.querySelectorAll('.nav-link').forEach(function(link) {
        link.classList.remove('active');
        if (navPage && link.getAttribute('data-page') === navPage) {
            link.classList.add('active');
        }
    });

    // On the landing page show only Settings + Sign Out in the nav;
    // on all other pages restore the full nav.
    document.body.classList.toggle('main-page', page === 'main');

    // Close mobile nav if open
    closeMobileNav();

    // Clear breadcrumbs and reset header title for top-level pages
    if (TOP_LEVEL_PAGES.includes(page)) {
        document.getElementById('breadcrumbBar').innerHTML = '';
        document.getElementById('headerTitle').innerHTML =
            '<a href="#main" class="home-link">' +
            escapeHtml(window.appName || 'My House') + '</a>';
    }

    // Refresh the favorite star to reflect the newly visible page
    if (typeof favUpdateStar === 'function') favUpdateStar();
}

/**
 * Parse the URL hash and route to the correct page + load its data.
 */
function handleRoute() {
    const hash  = window.location.hash.slice(1) || 'main';
    const parts = hash.split('/');
    const page  = parts[0];
    const id    = parts[1] || null;

    // Clean up the neighbor map when navigating away from it
    if (page !== 'neighborhood' && typeof _nbCleanupMap === 'function') {
        _nbCleanupMap();
    }

    if (page === 'zone' && id) {
        window.clLastEntityType = 'zone';
        showPage('zone');
        loadZoneDetail(id);
    } else if (page === 'plant' && id) {
        showPage('plant');
        loadPlantDetail(id);
    } else if (page === 'weed' && id) {
        showPage('weed');
        loadWeedDetail(id);
    } else if (page === 'home') {
        // #home was the original yard zones route, now redirects to main tiles landing page.
        // This ensures Android shortcuts and old bookmarks land on the correct screen.
        window.location.replace('#main');
        return;
    } else if (page === 'zones') {
        window.clLastEntityType = null;
        showPage('home');
        loadZonesList();
    } else if (page === 'main') {
        window.clLastEntityType = null;
        showPage('main');
        if (typeof favRenderHomeSection === 'function') favRenderHomeSection();
    } else if (page === 'weeds') {
        showPage('weeds');
        loadWeedsList();
    } else if (page === 'calendar') {
        showPage('calendar');
        loadCalendar();
    } else if (page === 'maintenance') {
        showPage('maintenance');
        loadMaintenanceList();
    } else if (page === 'chemical' && id) {
        showPage('chemical');
        loadChemicalDetail(id);
    } else if (page === 'chemicals') {
        showPage('chemicals');
        loadChemicalsList();
    } else if (page === 'actions') {
        showPage('actions');
        loadSavedActionsList();
    } else if (page === 'gpsmap' && id) {
        showPage('gpsmap');
        loadGpsMapPage(id);
    } else if (page === 'yardmap') {
        showPage('yardmap');
        loadYardMapPage();
    } else if (page === 'house') {
        window.clLastEntityType = null;
        showPage('house');
        loadHousePage();
    } else if (page === 'rooms') {
        showPage('rooms');
        loadRoomsPage();
    } else if (page === 'things') {
        showPage('things');
        loadThingsPage();
    } else if (page === 'yard-problems') {
        showPage('yard-problems');
        loadYardProblemsPage();
    } else if (page === 'yard-projects') {
        showPage('yard-projects');
        loadYardProjectsPage();
    } else if (page === 'house-projects') {
        showPage('house-projects');
        loadHouseProjectsPage();
    } else if (page === 'house-problems') {
        showPage('house-problems');
        loadHouseProblemsPage();
    } else if (page === 'house-calendar-events') {
        showPage('house-calendar-events');
        loadHouseCalendarEventsPage();
    } else if (page === 'floor' && id) {
        window.clLastEntityType = 'floor';
        showPage('floor');
        loadFloorDetail(id);
    } else if (page === 'room' && id) {
        window.clLastEntityType = 'room';
        showPage('room');
        loadRoomDetail(id);
    } else if (page === 'thing' && id) {
        showPage('thing');
        loadThingDetail(id);
    } else if (page === 'floorplan' && id) {
        showPage('floorplan');
        loadFloorPlanPage(id);
    } else if (page === 'floorplanitem' && id) {
        showPage('floorplanitem');
        loadFloorPlanItemPage(id, parts[2], parts[3]);
    } else if (page === 'panel' && id) {
        showPage('panel');
        loadPanelDetail(id);
    } else if (page === 'subthing' && id) {
        showPage('subthing');
        loadSubThingDetail(id);
    } else if (page === 'item' && id) {
        showPage('item');
        loadItemDetail(id);
    } else if (page === 'checklist-focus') {
        // #checklist-focus/{runId}/{targetType}/{targetId?}
        // Sets a focus run ID so loadChecklistsPage() auto-expands it.
        var focusRunId = parts[1] || null;
        var fcType     = parts[2] || 'yard';
        var fcId       = parts[3] || null;
        if (focusRunId) _clFocusRunId = focusRunId;
        window.checklistsContext = { type: fcType, id: fcId || null };
        currentNavContext = (fcType === 'house' || fcType === 'floor' || fcType === 'room') ? 'house'
                          : fcType === 'life' ? 'life' : 'yard';
        showPage('checklists');
        loadChecklistsPage();
    } else if (page === 'checklists') {
        // Context is encoded in the hash: #checklists/{type}/{id?}
        // e.g. #checklists/house, #checklists/zone/abc123, #checklists/yard
        // This makes the context survive browser refresh.
        var ctxType = parts[1] || null;
        var ctxId   = parts[2] || null;
        if (ctxType) {
            // Restore context from hash (e.g. on refresh or back-navigation)
            window.checklistsContext = { type: ctxType, id: ctxId || null };
            // Set the nav bar to match the context so the right links show on refresh
            if (ctxType === 'house' || ctxType === 'floor' || ctxType === 'room') {
                currentNavContext = 'house';
            } else if (ctxType === 'life') {
                currentNavContext = 'life';
            } else {
                currentNavContext = 'yard';
            }
        } else {
            // Direct navigation with no context in hash (e.g. old bookmark): capture from globals
            window.checklistsContext = clCaptureContext();
        }
        showPage('checklists');
        loadChecklistsPage();
    } else if (page === 'activityreport') {
        showPage('activityreport');
        loadActivityReportPage();
    } else if (page === 'search') {
        showPage('search');
        loadSearchPage();
    } else if (page === 'settings') {
        showPage('settings');
        loadSettingsHub();
    } else if (page === 'settings-general') {
        showPage('settings-general');
        loadSettingsGeneralPage();
    } else if (page === 'settings-contact-lists') {
        showPage('settings-contact-lists');
        loadContactListsPage();
    } else if (page === 'firebase-setup') {
        showPage('firebase-setup');
        renderFirebaseSetupPage();
    } else if (page === 'changepassword') {
        showPage('changepassword');
        loadChangePasswordPage();
    } else if (page === 'backup') {
        showPage('backup');
        loadBackupPage();
    } else if (page === 'chat') {
        showPage('chat');
        loadChatPage();
    } else if (page === 'vehicles') {
        window.clLastEntityType = null;
        showPage('vehicles');
        loadVehiclesPage();
    } else if (page === 'vehicle' && id) {
        window.clLastEntityType = 'vehicle';
        showPage('vehicle');
        loadVehiclePage(id);
    } else if (page === 'garage') {
        window.clLastEntityType = null;
        showPage('garage');
        loadGaragePage();
    } else if (page === 'garageroom' && id) {
        showPage('garageroom');
        loadGarageRoomPage(id);
    } else if (page === 'garagething' && id) {
        showPage('garagething');
        loadGarageThingPage(id);
    } else if (page === 'garagesubthing' && id) {
        showPage('garagesubthing');
        loadGarageSubThingPage(id);
    } else if (page === 'structures') {
        showPage('structures');
        loadStructuresPage();
    } else if (page === 'structure' && id) {
        showPage('structure');
        loadStructurePage(id);
    } else if (page === 'structurething' && id) {
        showPage('structurething');
        loadStructureThingPage(id);
    } else if (page === 'structuresubthing' && id) {
        showPage('structuresubthing');
        loadStructureSubThingPage(id);
    // ---------- Collections routes ----------
    } else if (page === 'collections') {
        showPage('collections');
        loadCollectionsPage();
    } else if (page === 'collection' && id) {
        showPage('collection');
        loadCollectionPage(id);
    } else if (page === 'collectionitem' && id) {
        showPage('collectionitem');
        loadCollectionItemPage(id);
    } else if (page === 'beneficiaries') {
        showPage('beneficiaries');
        loadBeneficiariesPage();
    // ---------- Life / Contacts routes ----------
    } else if (page === 'contacts') {
        showPage('contacts');
        loadContactsPage();
    } else if (page === 'contact' && id) {
        showPage('contact');
        loadContactDetail(id);
    // ---------- Neighbors routes ----------
    } else if (page === 'neighbors') {
        showPage('neighbors');
        loadNeighborhoodsPage();
    } else if (page === 'neighborhood' && id) {
        showPage('neighborhood');
        loadNeighborhoodMapPage(id);
    } else if (page === 'neighborhouse' && id) {
        showPage('neighborhouse');
        loadNeighborHousePage(id);
    } else if (page === 'neighborarchive' && id) {
        showPage('neighborarchive');
        loadNeighborArchivePage(id);
    // ---------- Life / People routes (legacy aliases — redirect to contacts) ----------
    } else if (page === 'people') {
        window.location.replace('#contacts');
        return;
    } else if (page === 'person' && id) {
        window.location.replace('#contact/' + id);
        return;
    // ---------- Life / Journal routes ----------
    } else if (page === 'life') {
        showPage('life');
        loadLifePage();
    } else if (page === 'journal') {
        showPage('journal');
        loadJournalPage();
    } else if (page === 'journal-entry' && id) {
        showPage('journal-entry');
        openEditJournalEntry(id);
    } else if (page === 'journal-entry') {
        showPage('journal-entry');
        // Form state is managed by openAddJournalEntry() or openEditJournalEntry().
        // If the user navigates here directly (e.g. back button) just show the page.
    } else if (page === 'journal-tracking') {
        showPage('journal-tracking');
        // Form state is managed by openAddTracking() or openEditTrackingItem().
    } else if (page === 'journal-categories') {
        showPage('journal-categories');
        loadJournalCategoriesPage();
    // ---------- Dev Notes routes (shared scratchpad) ----------
    } else if (page === 'devnote' && id === 'new') {
        showPage('devnote');
        loadNewDevNotePage();
    } else if (page === 'devnote' && id) {
        showPage('devnote');
        loadDevNotePage(id);
    } else if (page === 'devnotes') {
        showPage('devnotes');
        loadDevNotesPage();
    // ---------- Notes routes ----------
    } else if (page === 'notes') {
        showPage('notes');
        loadNotesPage();
    } else if (page === 'notebook' && id) {
        showPage('notebook');
        loadNotebookPage(id);
    } else if (page === 'note' && id === 'new') {
        showPage('note');
        loadNewNotePage();
    } else if (page === 'note' && id) {
        showPage('note');
        loadNotePage(id);
    // ---------- Vitals routes ----------
    } else if (page === 'health-vitals') {
        showPage('health-vitals');
        loadVitalsPage();
    // ---------- Insurance routes ----------
    } else if (page === 'health-insurance' && id) {
        showPage('health-insurance-detail');
        loadInsuranceDetailPage(id);
    } else if (page === 'health-insurance') {
        showPage('health-insurance');
        loadInsurancePage();
    // ---------- Emergency Info route ----------
    } else if (page === 'health-emergency') {
        showPage('health-emergency');
        loadEmergencyPage();
    // ---------- Blood Work routes ----------
    } else if (page === 'health-bloodwork' && id) {
        showPage('health-bloodwork-detail');
        loadBloodWorkDetail(id);
    } else if (page === 'health-bloodwork') {
        showPage('health-bloodwork');
        loadBloodWorkPage();
    } else if (page === 'sb-issues') {
        showPage('sb-issues');
        loadSbIssuesPage();
    // ---------- My Health routes ----------
    } else if (page === 'health-visits') {
        showPage('health-visits');
        loadHealthVisitsPage();
    } else if (page === 'health-visit' && id) {
        showPage('health-visit');
        loadHealthVisitDetail(id);
    } else if (page === 'health-visit-step2' && id) {
        showPage('health-visit-step2');
        loadStep2Page(id);
    } else if (page === 'health-medications') {
        showPage('health-medications');
        loadMedicationsPage();
    } else if (page === 'health-conditions') {
        showPage('health-conditions');
        loadConditionsPage();
    } else if (page === 'health-concerns') {
        showPage('health-concerns');
        loadConcernsPage();
    } else if (page === 'health-concern' && id) {
        showPage('health-concern');
        loadConcernDetail(id);
    } else if (page === 'health-condition' && id) {
        showPage('health-condition');
        loadConditionDetail(id);
    // ---------- Appointments route ----------
    } else if (page === 'health-appointments') {
        showPage('health-appointments');
        loadAppointmentsPage();
    } else if (page === 'health-care-team') {
        showPage('health-care-team');
        loadCareTeam();
    } else if (page === 'health') {
        showPage('health');
        loadHealthPage();
    } else if (page === 'health-allergies') {
        showPage('health-allergies');
        loadAllergyPage();
    } else if (page === 'health-supplements') {
        showPage('health-supplements');
        loadSupplementPage();
    } else if (page === 'health-vaccinations') {
        showPage('health-vaccinations');
        loadVaccinationPage();
    } else if (page === 'health-eye') {
        showPage('health-eye');
        loadEyePage();
    } else if (page === 'life-calendar') {
        showPage('life-calendar');
        loadLifeCalendarPage();
    } else if (page === 'life-event' && id === 'new') {
        showPage('life-event');
        loadNewLifeEventPage();
    } else if (page === 'life-event' && id) {
        showPage('life-event');
        loadLifeEventPage(id);
    // ---------- Life Projects routes ----------
    } else if (page === 'life-projects') {
        showPage('life-projects');
        loadLifeProjectsPage();
    } else if (page === 'life-project' && id) {
        showPage('life-project');
        loadLifeProjectDetailPage(id);
    // ---------- Exercise routes ----------
    } else if (page === 'exercise') {
        showPage('exercise');
        loadExercisePage();
    } else if (page === 'exercise-activities') {
        showPage('exercise-activities');
        loadExerciseActivitiesPage();
    } else if (page === 'exercise-activity' && id) {
        showPage('exercise-activity');
        loadExerciseActivityPage(id);
    } else if (page === 'exercise-types') {
        showPage('exercise-types');
        loadExerciseTypesPage();
    } else if (page === 'exercise-metrics') {
        showPage('exercise-metrics');
        loadExerciseMetricsPage();
    } else if (page === 'exercise-metric' && id) {
        showPage('exercise-metric');
        loadExerciseMetricPage(id);
    } else if (page === 'exercise-metric-defs') {
        showPage('exercise-metric-defs');
        loadExerciseMetricDefsPage();
    } else if (page === 'exercise-goals' && id && parts[2] === 'exercises') {
        showPage('exercise-goal-exercises');
        loadExerciseGoalExercisesPage(id);
    } else if (page === 'exercise-goals' && id && parts[2]) {
        showPage('exercise-goals-month');
        loadExerciseGoalsMonthPage(id, parts[2]);
    } else if (page === 'exercise-goals') {
        showPage('exercise-goals');
        loadExerciseGoalsPage(id);
    // ---------- My Legacy routes ----------
    } else if (page === 'legacy' && id === 'burial') {
        showPage('legacy-burial');
        loadLegacyBurialPage();
    } else if (page === 'legacy' && id === 'service') {
        showPage('legacy-service');
        loadLegacyServicePage();
    } else if (page === 'legacy' && id === 'obituary') {
        showPage('legacy-obituary');
        loadLegacyObituaryPage();
    } else if (page === 'legacy' && id === 'social') {
        showPage('legacy-social');
        loadLegacySocialPage();
    } else if (page === 'legacy' && id === 'accounts' && parts[2] === 'accounts') {
        showPage('legacy-financial-accounts');
        loadLegacyFinancialAccountsPage();
    } else if (page === 'legacy' && id === 'accounts' && parts[2] === 'loans' && parts[3] === 'add') {
        showPage('legacy-loans-form');
        loadLegacyLoansFormPage(null);
    } else if (page === 'legacy' && id === 'accounts' && parts[2] === 'loans' && parts[3] === 'edit' && parts[4]) {
        showPage('legacy-loans-form');
        loadLegacyLoansFormPage(parts[4]);
    } else if (page === 'legacy' && id === 'accounts' && parts[2] === 'loans') {
        showPage('legacy-financial-loans');
        loadLegacyFinancialLoansPage();
    } else if (page === 'legacy' && id === 'accounts' && parts[2] === 'bills' && parts[3] === 'add') {
        showPage('legacy-bills-form');
        loadLegacyBillsFormPage(null);
    } else if (page === 'legacy' && id === 'accounts' && parts[2] === 'bills' && parts[3] === 'edit' && parts[4]) {
        showPage('legacy-bills-form');
        loadLegacyBillsFormPage(parts[4]);
    } else if (page === 'legacy' && id === 'accounts' && parts[2] === 'bills') {
        showPage('legacy-financial-bills');
        loadLegacyFinancialBillsPage();
    } else if (page === 'legacy' && id === 'accounts' && parts[2] === 'insurance' && parts[3] === 'add') {
        showPage('legacy-insurance-form');
        loadLegacyInsuranceFormPage(null);
    } else if (page === 'legacy' && id === 'accounts' && parts[2] === 'insurance' && parts[3] === 'edit' && parts[4]) {
        showPage('legacy-insurance-form');
        loadLegacyInsuranceFormPage(parts[4]);
    } else if (page === 'legacy' && id === 'accounts' && parts[2] === 'insurance') {
        showPage('legacy-financial-insurance');
        loadLegacyFinancialInsurancePage();
    } else if (page === 'legacy' && id === 'accounts' && parts[2] === 'plan') {
        showPage('legacy-financial-plan');
        loadLegacyFinancialPlanPage();
    } else if (page === 'legacy' && id === 'accounts') {
        showPage('legacy-accounts');
        loadLegacyAccountsPage();
    } else if (page === 'legacy' && id === 'documents') {
        showPage('legacy-documents');
        loadLegacyDocumentsPage();
    } else if (page === 'legacy' && id === 'household') {
        showPage('legacy-household');
        loadLegacyHouseholdPage();
    } else if (page === 'legacy' && id === 'pets') {
        showPage('legacy-pets');
        loadLegacyPetsPage();
    } else if (page === 'legacy' && id === 'notify') {
        showPage('legacy-notify');
        loadLegacyNotifyPage();
    } else if (page === 'legacy' && id === 'letters' && !parts[2]) {
        showPage('legacy-letters');
        loadLegacyLettersPage();
    } else if (page === 'legacy' && id === 'letter' && parts[2]) {
        showPage('legacy-letter');
        loadLegacyLetterDetailPage(parts[2]);
    } else if (page === 'legacy' && id === 'intro') {
        showPage('legacy-intro');
        loadLegacyIntroPage();
    } else if (page === 'legacy' && id === 'message') {
        showPage('legacy-message');
        loadLegacyMessagePage();
    } else if (page === 'legacy') {
        showPage('legacy');
        loadLegacyPage();
    // ---------- Budget routes ----------
    } else if (page === 'budget' && id === 'nonmonthly' && parts[2]) {
        showPage('budget-nonmonthly');
        loadBudgetNonMonthlyPage(parts[2]);
    } else if (page === 'budget' && id === 'archive') {
        showPage('budget-archive');
        loadBudgetArchivePage();
    } else if (page === 'budget') {
        showPage('budget');
        loadBudgetPage();
    // ---------- Investments routes ----------
    } else if (page === 'investments' && id === 'ss-benefits' && parts[2] === 'new') {
        showPage('investments-ss-form');
        loadInvestmentsSsFormPage(null);
    } else if (page === 'investments' && id === 'ss-benefits' && parts[2] === 'edit' && parts[3]) {
        showPage('investments-ss-form');
        loadInvestmentsSsFormPage(decodeURIComponent(parts[3]));
    } else if (page === 'investments' && id === 'ss-benefits') {
        showPage('investments-ss-benefits');
        loadInvestmentsSsBenefitsPage();
    } else if (page === 'investments' && id === 'stocks') {
        showPage('investments-stocks');
        loadInvestmentsStocksPage();
    } else if (page === 'investments' && id === 'snapshots' && parts[2]) {
        showPage('investments-snapshots-type');
        loadInvestmentsSnapshotTypePage(parts[2]);
    } else if (page === 'investments' && id === 'snapshots') {
        showPage('investments-snapshots');
        loadInvestmentsSnapshotsPage();
    } else if (page === 'investments' && id === 'summary') {
        showPage('investments-summary');
        loadInvestmentsSummaryPage();
    } else if (page === 'investments' && id === 'groups') {
        showPage('investments-groups');
        loadInvestmentsGroupsPage();
    } else if (page === 'investments' && id === 'group' && parts[2] === 'new') {
        showPage('investments-group-edit');
        loadInvestmentsGroupEditPage(null);
    } else if (page === 'investments' && id === 'group' && parts[2] === 'edit' && parts[3]) {
        showPage('investments-group-edit');
        loadInvestmentsGroupEditPage(parts[3]);
    } else if (page === 'investments' && id === 'account' && parts[2] && parts[3]) {
        showPage('investments-account');
        loadInvestmentsAccountPage(parts[2], parts[3]);
    } else if (page === 'investments' && id === 'accounts' && parts[2] === 'add') {
        showPage('investments-form');
        loadInvestmentsFormPage(null);
    } else if (page === 'investments' && id === 'accounts' && parts[2] === 'edit' && parts[3]) {
        showPage('investments-form');
        loadInvestmentsFormPage(parts[3]);
    } else if (page === 'investments' && id === 'accounts') {
        showPage('investments-accounts');
        loadInvestmentsAccountsPage();
    } else if (page === 'investments' && id === 'ai-setup') {
        showPage('investments-ai-setup');
        loadInvestmentsAiSetupPage();
    } else if (page === 'investments' && id === 'ai-analysis') {
        showPage('investments-ai');
        loadInvestmentsAiPage();
    } else if (page === 'investments' && id === 'import') {
        showPage('investments-import');
        loadInvestmentsImportPage();
    } else if (page === 'investments') {
        showPage('investments');
        loadInvestmentsPage();
    // ---------- Credentials routes ----------
    } else if (page === 'credentials' && id === 'edit' && parts[2]) {
        showPage('credentials-edit');
        loadCredentialEditPage(parts[2]);
    } else if (page === 'credentials' && id === 'add') {
        showPage('credentials-add');
        loadCredentialAddPage();
    } else if (page === 'credentials' && id === 'categories') {
        showPage('credentials-categories');
        loadCredentialCategoriesPage();
    } else if (page === 'credentials') {
        showPage('credentials');
        loadCredentialsPage();
    // ---------- Private Vault routes ----------
    } else if (page === 'private' && id === 'bookmarks') {
        if (!privateIsUnlocked()) { window.location.hash = '#private'; return; }
        showPage('private-bookmarks');
        if (typeof loadPrivateBookmarksPage === 'function') loadPrivateBookmarksPage();
    } else if (page === 'private' && id === 'documents') {
        if (!privateIsUnlocked()) { window.location.hash = '#private'; return; }
        showPage('private-documents');
        if (typeof loadPrivateDocumentsPage === 'function') loadPrivateDocumentsPage();
    } else if (page === 'private' && id === 'photos' && parts[2] === 'album') {
        if (!privateIsUnlocked()) { window.location.hash = '#private'; return; }
        showPage('private-photos-gallery');
        if (typeof loadPrivatePhotosGallery === 'function') loadPrivatePhotosGallery(parts[3] || null);
    } else if (page === 'private' && id === 'photos') {
        if (!privateIsUnlocked()) { window.location.hash = '#private'; return; }
        showPage('private-photos');
        if (typeof loadPrivatePhotosPage === 'function') loadPrivatePhotosPage();
    } else if (page === 'private') {
        showPage('private');
        if (typeof privateNavigateTo === 'function') privateNavigateTo('home');
    // ---------- Thoughts routes ----------
    } else if (page === 'thoughts') {
        showPage('thoughts');
        loadThoughtsPage();
    } else if (page === 'top10lists') {
        showPage('top10lists');
        loadTop10ListsPage();
    } else if (page === 'top10list-create') {
        showPage('top10list-edit');
        loadTop10ListCreatePage();
    } else if (page === 'top10list-edit' && id) {
        showPage('top10list-edit');
        loadTop10ListEditPage(id);
    // ---------- Memories routes ----------
    } else if (page === 'memories') {
        showPage('memories');
        loadMemoriesPage();
    } else if (page === 'memory-create') {
        showPage('memory-create');
        loadMemoryCreatePage();
    } else if (page === 'memory-edit' && id) {
        showPage('memory-edit');
        loadMemoryEditPage(id);
    // ---------- Views routes ----------
    } else if (page === 'views') {
        showPage('views');
        loadViewsPage();
    } else if (page === 'view' && id) {
        showPage('view');
        loadViewDetailPage(id);
    } else if (page === 'view-history' && id) {
        showPage('view-history');
        loadViewHistoryPage(id, parts[2] || null);
    } else if (page === 'views-categories') {
        showPage('views-categories');
        loadViewsCategoriesPage();
    // ---------- Places routes ----------
    } else if (page === 'places') {
        showPage('places');
        loadPlacesPage();
    } else if (page === 'place' && id) {
        showPage('place');
        loadPlaceDetailPage(id);
    // ---------- Help route ----------
    } else if (page === 'help') {
        showPage('help');
        loadHelpPage(id || 'main');
    } else if (TOP_LEVEL_PAGES.includes(page)) {
        showPage(page);
    } else {
        // Unknown route — go to landing page
        showPage('main');
    }
}

// ---------- Mobile Navigation ----------

const hamburgerBtn = document.getElementById('hamburgerBtn');
const mobileNav    = document.getElementById('mobileNav');

function closeMobileNav() {
    mobileNav.classList.remove('open');
    hamburgerBtn.classList.remove('open');
}

hamburgerBtn.addEventListener('click', function() {
    mobileNav.classList.toggle('open');
    hamburgerBtn.classList.toggle('open');
});

// Close mobile nav when clicking any nav link inside it (both contexts)
mobileNav.querySelectorAll('.nav-link').forEach(function(link) {
    link.addEventListener('click', closeMobileNav);
});

// Wire house-context sign-out buttons to delegate to the main sign-out button
var signOutBtnHouse       = document.getElementById('signOutBtnHouse');
var signOutBtnMobileHouse = document.getElementById('signOutBtnMobileHouse');
if (signOutBtnHouse) {
    signOutBtnHouse.addEventListener('click', function() {
        document.getElementById('signOutBtn').click();
    });
}
if (signOutBtnMobileHouse) {
    signOutBtnMobileHouse.addEventListener('click', function() {
        document.getElementById('signOutBtnMobile').click();
    });
}

// Wire life-context sign-out buttons
var signOutBtnLife       = document.getElementById('signOutBtnLife');
var signOutBtnMobileLife = document.getElementById('signOutBtnMobileLife');
if (signOutBtnLife) {
    signOutBtnLife.addEventListener('click', function() {
        document.getElementById('signOutBtn').click();
    });
}
if (signOutBtnMobileLife) {
    signOutBtnMobileLife.addEventListener('click', function() {
        document.getElementById('signOutBtnMobile').click();
    });
}

// Wire thoughts-context sign-out buttons
var signOutBtnThoughts       = document.getElementById('signOutBtnThoughts');
var signOutBtnMobileThoughts = document.getElementById('signOutBtnMobileThoughts');
if (signOutBtnThoughts) {
    signOutBtnThoughts.addEventListener('click', function() {
        document.getElementById('signOutBtn').click();
    });
}
if (signOutBtnMobileThoughts) {
    signOutBtnMobileThoughts.addEventListener('click', function() {
        document.getElementById('signOutBtnMobile').click();
    });
}

// ---------- Initialize ----------

window.addEventListener('hashchange', handleRoute);

/**
 * Intercept all Checklists nav link clicks and replace the plain #checklists
 * href with a context-aware hash like #checklists/house or #checklists/zone/id.
 * This encodes the context in the URL so it survives browser refresh.
 * Runs after the DOM is fully built (auth.js calls initApp which follows DOMContentLoaded).
 */
function _initChecklistsNavLinks() {
    document.querySelectorAll('a[data-page="checklists"]').forEach(function(link) {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            var ctx  = clCaptureContext();
            var hash = 'checklists/' + ctx.type + (ctx.id ? '/' + ctx.id : '');
            window.location.hash = hash;
        });
    });
}

/**
 * Handle the Android (and desktop) back button.
 * If a modal is open, close it instead of letting the browser navigate away.
 * Because our routing uses hashchange (not popstate), this listener only fires
 * when a modal's pushState entry is being popped — the hash has NOT changed,
 * so handleRoute is NOT called.
 */
window.addEventListener('popstate', function() {
    // If a file picker (camera/gallery) is open, the mobile browser may fire
    // a popstate when the camera app closes. Ignore it — whatever modal
    // triggered the camera should stay open when the user returns.
    if (window._filePickerOpen) return;

    // If closeModal() itself called history.back(), this popstate was triggered
    // intentionally to keep history in sync — NOT by the user pressing back.
    // Ignore it so we don't accidentally close the next open modal in the stack.
    if (window._modalHistoryBack) {
        window._modalHistoryBack = false;
        return;
    }

    var openOverlay = document.querySelector('.modal-overlay.open');
    if (openOverlay) {
        // closeModal won't call history.back() again here because popstate has
        // already moved history.state back to the pre-modal entry.
        closeModal(openOverlay.id);
    }
});

/**
 * Called by auth.js once the user is confirmed signed in.
 * Loads the app name from Firestore first, then routes to the correct page.
 */
function initApp() {
    initAppName().then(function() {
        handleRoute();
    });
    // Check Private vault activation state (shows/hides Life tile)
    if (typeof privateCheckActivated === 'function') privateCheckActivated();
    // Pre-load GCal settings so gcalIsConnected() works on any page without visiting Settings first
    if (typeof gcalLoadSettings === 'function') gcalLoadSettings();
    // Load favorites (star button + home page widget)
    if (typeof favInit === 'function') favInit();
    _initTabIndentTextareas();
    _initChecklistsNavLinks();
    console.log("Bishop app initialized.");
}

/**
 * Make Tab key insert spaces (instead of moving focus) in designated textareas.
 * Uses event delegation on document so it works even if the textarea
 * is rendered after this runs (modals, dynamically added pages, etc.).
 * Applies to: #journalEntryText, #noteTextInput
 */
function _initTabIndentTextareas() {
    var TAB_TARGETS = ['journalEntryText', 'noteTextInput'];
    var TAB_SPACES  = '    '; // 4 spaces per Tab press

    document.addEventListener('keydown', function(e) {
        if (e.key !== 'Tab') return;
        var el = e.target;
        if (!el || el.tagName !== 'TEXTAREA') return;
        if (TAB_TARGETS.indexOf(el.id) === -1) return;

        // Prevent the browser from moving focus
        e.preventDefault();

        // Insert spaces at the cursor position
        var start = el.selectionStart;
        var end   = el.selectionEnd;
        el.value  = el.value.substring(0, start) + TAB_SPACES + el.value.substring(end);

        // Move cursor to after the inserted spaces
        el.selectionStart = el.selectionEnd = start + TAB_SPACES.length;
    });
}


// ── Detail-page accordion toggle (shared across all entity detail pages) ──
/**
 * Toggle a detail-page accordion open/closed.
 * @param {string} id - The element ID of the .detail-acc div.
 */
function toggleDetailAcc(id) {
    var el = document.getElementById(id);
    if (el) el.classList.toggle('open');
}
