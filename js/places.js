// ============================================================
// places.js — Places CRUD, GPS capture, Nominatim reverse geocode
//
// Firestore collection: userCol('places')
// Fields: name, address, category, lat, lng, osmId, status, createdAt
//
// status: 1 = active, 0 = soft-deleted
// osmId: OpenStreetMap node/way ID — used for dedup in Phase 3
// ============================================================

// Global reference to the place being edited (null = add mode)
var _placeEditId = null;

// Cache of the GPS coordinates captured in the modal
var _placeModalLat = null;
var _placeModalLng = null;

// Remember which page launched the place detail (for back button + breadcrumb).
// Set by the router (app.js) from the previous hash; defaults to the places list.
var _placeDetailFrom = '#places';

// Map the origin hash to a clickable breadcrumb crumb { label, href } so the place detail
// page leads back to wherever the user actually came from (journal, search, places list, or
// an entity page), rather than showing a stale, unclickable crumb from the previous screen.
function _placeOriginCrumb() {
    var from = _placeDetailFrom || '#places';
    var base = from.split('/')[0];   // e.g. '#journal', '#places', '#plant'
    var known = {
        '#journal': { label: 'Journal', href: '#journal' },
        '#places':  { label: 'Places',  href: '#places' },
        '#search':  { label: 'Search',  href: '#search' }
    };
    if (known[base]) return known[base];
    // Any other origin (an entity's activity list, etc.) — link back to that exact page.
    return { label: '‹ Back', href: from };
}

// Render the place detail breadcrumb: {origin link} › {place name}.
function _placeSetBreadcrumb(placeName) {
    var crumb = document.getElementById('breadcrumbBar');
    if (!crumb) return;
    var o = _placeOriginCrumb();
    crumb.innerHTML =
        '<a href="' + o.href + '">' + escapeHtml(o.label) + '</a>' +
        '<span class="separator">&rsaquo;</span>' +
        '<span>' + escapeHtml(placeName || 'Place') + '</span>';
}

// ============================================================
// Places List Page
// ============================================================

/**
 * Load the #places page — fetch all active places and render the list.
 * Called by app.js when routing to #places.
 */
async function loadPlacesPage() {
    var container  = document.getElementById('placesListContainer');
    var emptyState = document.getElementById('placesEmptyState');
    var searchInput = document.getElementById('placesSearchInput');

    container.innerHTML  = '';
    emptyState.textContent = 'Loading...';
    emptyState.classList.remove('hidden');

    // Wire up Add button
    document.getElementById('addPlaceBtn').onclick = function() {
        _placesOpenModal(null);
    };

    // Wire up search filter
    searchInput.value = '';
    searchInput.oninput = function() {
        _placesFilterList(searchInput.value.trim().toLowerCase());
    };

    try {
        var snap = await userCol('places')
            .where('status', '==', 1)
            .get();

        if (snap.empty) {
            emptyState.textContent = 'No places yet. Tap + Add to get started.';
            return;
        }

        // Sort client-side to avoid needing a composite Firestore index
        var docs = [];
        snap.forEach(function(doc) { docs.push({ id: doc.id, data: doc.data() }); });
        docs.sort(function(a, b) { return (a.data.name || '').localeCompare(b.data.name || ''); });

        emptyState.classList.add('hidden');
        docs.forEach(function(d) {
            container.appendChild(_placesRenderRow(d.id, d.data));
        });

    } catch (err) {
        console.error('Error loading places:', err);
        emptyState.textContent = 'Error loading places.';
    }
}

/**
 * Build a single place list row element.
 */
function _placesRenderRow(id, data) {
    var row = document.createElement('div');
    row.className = 'card-list-item place-list-item';
    row.dataset.name = (data.name || '').toLowerCase();

    var main = document.createElement('div');
    main.className = 'place-list-main';
    main.style.cursor = 'pointer';
    main.onclick = function() {
        _placeDetailFrom = '#places';
        window.location.hash = '#place/' + id;
    };

    var nameEl = document.createElement('div');
    nameEl.className = 'place-list-name';
    nameEl.textContent = data.name || '(unnamed)';

    var subEl = document.createElement('div');
    subEl.className = 'place-list-sub';
    var parts = [];
    if (data.category) parts.push(data.category);
    if (data.address)  parts.push(data.address);
    subEl.textContent = parts.join(' · ');

    main.appendChild(nameEl);
    main.appendChild(subEl);

    var editBtn = document.createElement('button');
    editBtn.className = 'btn btn-secondary btn-small';
    editBtn.textContent = 'Edit';
    editBtn.onclick = function(e) {
        e.stopPropagation();
        _placesOpenModal(id, data);
    };

    row.appendChild(main);
    row.appendChild(editBtn);
    return row;
}

/**
 * Filter the displayed list rows by the search term.
 */
function _placesFilterList(term) {
    var rows       = document.querySelectorAll('.place-list-item');
    var emptyState = document.getElementById('placesEmptyState');
    var anyVisible = false;

    rows.forEach(function(row) {
        var match = !term || row.dataset.name.includes(term);
        row.style.display = match ? '' : 'none';
        if (match) anyVisible = true;
    });

    emptyState.textContent = anyVisible ? '' : 'No places match your search.';
    emptyState.classList.toggle('hidden', anyVisible);
}

// ============================================================
// Place Detail Page (stub — full detail built in Phase 6)
// ============================================================

/**
 * Load the #place/{id} detail page.
 * Called by app.js when routing to #place/{id}.
 */
/** Leaflet map instance for the place detail page (destroyed on re-load). */
var _placeDetailMap = null;

async function loadPlaceDetailPage(placeId) {
    var nameEl     = document.getElementById('placeDetailName');
    var infoEl     = document.getElementById('placeDetailInfo');
    var summaryEl  = document.getElementById('placeDetailSummary');
    var mapWrap    = document.getElementById('placeDetailMapWrap');
    var backBtn    = document.getElementById('placeDetailBackBtn');
    var editBtn    = document.getElementById('editPlaceDetailBtn');

    nameEl.textContent   = 'Loading...';
    infoEl.innerHTML     = '';
    if (summaryEl)  summaryEl.textContent = '';

    // Replace any stale breadcrumb from the previous page right away; refined with the
    // place name once the record loads below.
    _placeSetBreadcrumb(null);

    // Destroy any previous map instance so Leaflet doesn't complain
    if (_placeDetailMap) {
        _placeDetailMap.remove();
        _placeDetailMap = null;
    }
    if (mapWrap) mapWrap.classList.add('hidden');

    backBtn.onclick = function() {
        window.location.hash = _placeDetailFrom || '#places';
    };

    editBtn.onclick = function() {
        _placesOpenModal(placeId, window._placeDetailData);
    };

    try {
        var doc = await userCol('places').doc(placeId).get();
        if (!doc.exists || doc.data().status === 0) {
            nameEl.textContent = 'Place not found';
            return;
        }

        var data = doc.data();
        window._placeDetailData = data;  // cache for edit button
        window.currentPlace = { id: placeId, ...data };  // global for photo/fact/activity buttons

        nameEl.textContent = data.name || '(unnamed)';
        _placeSetBreadcrumb(data.name || '(unnamed)');

        // ── Info table ───────────────────────────────────────────
        var rows = [];
        if (data.category) rows.push({ label: 'Category', value: data.category });
        if (data.address)  rows.push({ label: 'Address',  value: data.address });
        if (data.lat && data.lng) {
            rows.push({ label: 'Coordinates', value: data.lat.toFixed(6) + ', ' + data.lng.toFixed(6) });
        }

        infoEl.innerHTML = '';
        if (rows.length > 0) {
            var table = document.createElement('div');
            table.className = 'place-detail-table';
            rows.forEach(function(r) {
                var row = document.createElement('div');
                row.className = 'place-detail-row';
                row.innerHTML = '<span class="place-detail-label">' + escapeHtml(r.label) + '</span>' +
                                '<span class="place-detail-value">' + escapeHtml(r.value) + '</span>';
                table.appendChild(row);
            });
            infoEl.appendChild(table);
        }

        // ── Leaflet map ──────────────────────────────────────────
        if (data.lat && data.lng && typeof L !== 'undefined' && mapWrap) {
            mapWrap.classList.remove('hidden');
            // Give the container a moment to become visible before init
            setTimeout(function() {
                _placeDetailMap = L.map('placeDetailMap').setView([data.lat, data.lng], 16);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                }).addTo(_placeDetailMap);
                L.marker([data.lat, data.lng]).addTo(_placeDetailMap);
                _placeDetailMap.invalidateSize();
            }, 50);
        }

        // ── Facts ────────────────────────────────────────────────
        loadFacts('place', placeId, 'placeFactsContainer', 'placeFactsEmptyState');

        // ── Photos ───────────────────────────────────────────────
        loadPhotos('place', placeId, 'placePhotoContainer', 'placePhotoEmptyState');

        // ── Activities ───────────────────────────────────────────
        loadActivities('place', placeId, 'placeActivityContainer', 'placeActivityEmptyState');

        // ── Journal entries at this place ────────────────────────
        _placeLoadJournalEntries(placeId);

        // ── Summary line ─────────────────────────────────────────
        _placeLoadSummary(placeId, summaryEl);

    } catch (err) {
        console.error('Error loading place detail:', err);
        nameEl.textContent = 'Error loading place';
    }
}

/**
 * Load and render journal entries that include this place in their placeIds[].
 * Uses Firestore array-contains query — no composite index needed.
 */
async function _placeLoadJournalEntries(placeId) {
    var container = document.getElementById('placeJournalContainer');
    var emptyEl   = document.getElementById('placeJournalEmptyState');
    if (!container || !emptyEl) return;

    container.innerHTML = '';
    emptyEl.style.display = 'none';

    try {
        var snap = await userCol('journalEntries')
            .where('placeIds', 'array-contains', placeId)
            .get();

        if (snap.empty) {
            emptyEl.style.display = 'block';
            return;
        }

        // Sort newest first client-side
        var entries = [];
        snap.forEach(function(d) { entries.push({ id: d.id, ...d.data() }); });
        entries.sort(function(a, b) {
            var da = a.date || '';
            var db = b.date || '';
            return db.localeCompare(da);
        });

        var html = '';
        entries.forEach(function(e) {
            var isCheckin = e.isCheckin ? '<span class="place-journal-checkin-badge">📍 Check-In</span>' : '';
            var snippet   = (e.entryText || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            if (snippet.length > 120) snippet = snippet.slice(0, 120) + '…';
            html += '<div class="place-journal-item" onclick="openEditJournalEntry(\'' + e.id + '\')">' +
                        '<div class="place-journal-header">' +
                            '<span class="place-journal-date">' + escapeHtml(e.date || '') + '</span>' +
                            isCheckin +
                        '</div>' +
                        (snippet ? '<div class="place-journal-text">' + snippet + '</div>' : '') +
                    '</div>';
        });
        container.innerHTML = html;

    } catch (err) {
        console.error('Error loading place journal entries:', err);
        emptyEl.textContent = 'Error loading journal entries.';
        emptyEl.style.display = 'block';
    }
}

/**
 * Load counts of journal check-ins and activities for the summary line.
 */
async function _placeLoadSummary(placeId, el) {
    if (!el) return;
    try {
        var [journalSnap, activitySnap] = await Promise.all([
            userCol('journalEntries').where('placeIds', 'array-contains', placeId).get(),
            userCol('activities').where('targetType', '==', 'place').where('targetId', '==', placeId).get()
        ]);

        var checkins   = 0;
        var nonCheckin = 0;
        journalSnap.forEach(function(d) {
            if (d.data().isCheckin) checkins++; else nonCheckin++;
        });
        var activityCount = activitySnap.size;

        var parts = [];
        if (checkins > 0)   parts.push(checkins + ' check-in' + (checkins > 1 ? 's' : ''));
        if (nonCheckin > 0) parts.push(nonCheckin + ' journal entr' + (nonCheckin > 1 ? 'ies' : 'y'));
        if (activityCount > 0) parts.push(activityCount + ' activit' + (activityCount > 1 ? 'ies' : 'y'));

        el.textContent = parts.length > 0 ? parts.join(' · ') : '';
    } catch (err) {
        // Summary is non-critical; ignore errors
        console.warn('Could not load place summary:', err);
    }
}

// ============================================================
// Add / Edit Modal
// ============================================================

/**
 * Open the place modal in add mode (placeId = null) or edit mode.
 * @param {string|null} placeId  - null for add, doc ID for edit
 * @param {object}      [data]   - existing place data (edit mode only)
 */
function _placesOpenModal(placeId, data) {
    _placeEditId    = placeId;
    _placeModalLat  = null;
    _placeModalLng  = null;

    var title     = document.getElementById('placeModalTitle');
    var nameInput = document.getElementById('placeNameInput');
    var addrInput = document.getElementById('placeAddressInput');
    var catInput  = document.getElementById('placeCategoryInput');
    var deleteBtn = document.getElementById('placeModalDeleteBtn');
    var gpsStatus = document.getElementById('placeGpsStatus');

    // Clear form
    nameInput.value = '';
    addrInput.value = '';
    catInput.value  = '';
    document.getElementById('placeLatInput').value = '';
    document.getElementById('placeLngInput').value = '';
    gpsStatus.textContent = '📍 No location captured';

    if (placeId && data) {
        // Edit mode
        title.textContent   = 'Edit Place';
        nameInput.value     = data.name     || '';
        addrInput.value     = data.address  || '';
        catInput.value      = data.category || '';
        deleteBtn.style.display = '';

        if (data.lat && data.lng) {
            _placeModalLat = data.lat;
            _placeModalLng = data.lng;
            document.getElementById('placeLatInput').value = data.lat;
            document.getElementById('placeLngInput').value = data.lng;
            gpsStatus.textContent = '📍 ' + data.lat.toFixed(5) + ', ' + data.lng.toFixed(5);
        }
    } else {
        // Add mode — auto-capture GPS
        title.textContent       = 'Add Place';
        deleteBtn.style.display = 'none';
        _placesCaptureGps();
    }

    // Wire buttons
    document.getElementById('placeModalCancelBtn').onclick = function() {
        closeModal('placeModal');
    };
    document.getElementById('placeModalSaveBtn').onclick  = _placesSave;
    document.getElementById('placeRecaptureGpsBtn').onclick = _placesCaptureGps;
    document.getElementById('placeModalDeleteBtn').onclick = function() {
        closeModal('placeModal');
        setTimeout(function() { _placesConfirmDelete(_placeEditId); }, 50);
    };

    openModal('placeModal');
}

/**
 * Capture GPS coordinates and attempt a Nominatim reverse geocode.
 * Updates the GPS status label and pre-fills the address if empty.
 */
function _placesCaptureGps() {
    var gpsStatus = document.getElementById('placeGpsStatus');
    var addrInput = document.getElementById('placeAddressInput');

    if (!navigator.geolocation) {
        gpsStatus.textContent = '⚠️ GPS not supported by this browser';
        return;
    }

    gpsStatus.textContent = '📍 Capturing location...';

    navigator.geolocation.getCurrentPosition(
        async function(pos) {
            var lat = pos.coords.latitude;
            var lng = pos.coords.longitude;
            _placeModalLat = lat;
            _placeModalLng = lng;
            document.getElementById('placeLatInput').value = lat;
            document.getElementById('placeLngInput').value = lng;
            gpsStatus.textContent = '📍 ' + lat.toFixed(5) + ', ' + lng.toFixed(5);

            // Reverse geocode only if address field is empty
            if (!addrInput.value.trim()) {
                gpsStatus.textContent += '  (looking up address...)';
                var addr = await _placesReverseGeocode(lat, lng);
                if (addr) {
                    addrInput.value = addr;
                    gpsStatus.textContent = '📍 ' + lat.toFixed(5) + ', ' + lng.toFixed(5);
                } else {
                    gpsStatus.textContent = '📍 ' + lat.toFixed(5) + ', ' + lng.toFixed(5) + ' (no address found)';
                }
            }
        },
        function(err) {
            console.warn('GPS error:', err);
            gpsStatus.textContent = '⚠️ Location unavailable — enter address manually';
        },
        { timeout: 10000, maximumAge: 30000 }
    );
}

/**
 * Reverse geocode lat/lng to a human-readable address using Nominatim.
 * Returns a formatted address string, or null if not found.
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<string|null>}
 */
async function _placesReverseGeocode(lat, lng) {
    try {
        await _placesNominatimRateLimit();
        var url = 'https://nominatim.openstreetmap.org/reverse?format=json&lat=' +
                  lat + '&lon=' + lng + '&zoom=18&addressdetails=1';
        var resp = await fetch(url, {
            headers: { 'Accept-Language': 'en', 'User-Agent': 'MyLifeApp/1.0' }
        });
        if (!resp.ok) return null;

        var data = await resp.json();
        if (!data.address) return null;

        var a = data.address;
        var parts = [];

        // House number + street
        var street = [a.house_number, a.road || a.pedestrian || a.path].filter(Boolean).join(' ');
        if (street) parts.push(street);

        // City
        var city = a.city || a.town || a.village || a.suburb || a.hamlet;
        if (city) parts.push(city);

        // State + postcode
        if (a.state && a.postcode) {
            parts.push(a.state + ' ' + a.postcode);
        } else if (a.state) {
            parts.push(a.state);
        }

        return parts.join(', ') || data.display_name || null;

    } catch (err) {
        console.warn('Nominatim reverse geocode error:', err);
        return null;
    }
}

// ============================================================
// Save
// ============================================================

/**
 * Save a new place or update an existing one.
 */
async function _placesSave() {
    var name     = document.getElementById('placeNameInput').value.trim();
    var address  = document.getElementById('placeAddressInput').value.trim();
    var category = document.getElementById('placeCategoryInput').value.trim();
    var saveBtn  = document.getElementById('placeModalSaveBtn');

    if (!name) {
        alert('Please enter a place name.');
        document.getElementById('placeNameInput').focus();
        return;
    }

    saveBtn.disabled    = true;
    saveBtn.textContent = 'Saving\u2026';

    var payload = {
        name    : name,
        address : address  || null,
        category: category || null,
        lat     : _placeModalLat || null,
        lng     : _placeModalLng || null,
        status  : 1
    };

    try {
        if (_placeEditId) {
            // Edit existing
            payload.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
            await userCol('places').doc(_placeEditId).update(payload);
            closeModal('placeModal');
            // Refresh whichever page is showing
            if (window.location.hash.startsWith('#place/')) {
                window._placeDetailData = Object.assign(window._placeDetailData || {}, payload);
                loadPlaceDetailPage(_placeEditId);
            } else {
                loadPlacesPage();
            }
        } else {
            // New place
            payload.osmId     = null;
            payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            var ref = await userCol('places').add(payload);
            closeModal('placeModal');
            loadPlacesPage();
            // Fire LLM enrichment non-blocking — user is already moving on
            placesEnrichWithLLM(ref.id);
        }
    } catch (err) {
        console.error('Error saving place:', err);
        alert('Error saving place — please try again.');
        saveBtn.disabled    = false;
        saveBtn.textContent = 'Save';
    }
}

// ============================================================
// Delete (soft)
// ============================================================

/**
 * Confirm and soft-delete a place (sets status to 0).
 */
async function _placesConfirmDelete(placeId) {
    if (!placeId) return;
    if (!confirm('Delete this place? It will be hidden but not permanently removed.')) return;

    try {
        await userCol('places').doc(placeId).update({
            status   : 0,
            deletedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        // Navigate back to the list
        window.location.hash = '#places';
    } catch (err) {
        console.error('Error deleting place:', err);
        alert('Error deleting place — please try again.');
    }
}

// ============================================================
// Phase 3 — Foursquare + Nominatim Utilities, Dedup, LLM Enrichment
// ============================================================

// Rate-limit guard: Nominatim asks for no more than 1 request/second
var _placesNominatimLastCall = 0;

/**
 * Enforce at least 1 second between Nominatim API calls.
 */
async function _placesNominatimRateLimit() {
    var now  = Date.now();
    var wait = 1000 - (now - _placesNominatimLastCall);
    if (wait > 0) await new Promise(function(r) { setTimeout(r, wait); });
    _placesNominatimLastCall = Date.now();
}

// Cache the Cloudflare Worker URL so we don't hit Firestore on every search
var _placesWorkerUrlCache    = null;
var _placesWorkerUrlCachedAt = 0;

/**
 * Load the Cloudflare Worker URL from Firestore settings (cached for 5 minutes).
 * Returns the URL string (trailing slash stripped), or null if not configured.
 */
async function _placesGetWorkerUrl() {
    var now = Date.now();
    if (_placesWorkerUrlCache && (now - _placesWorkerUrlCachedAt) < 300000) {
        return _placesWorkerUrlCache;
    }
    try {
        var doc = await userCol('settings').doc('places').get();
        var url = (doc.exists && doc.data().workerUrl) || null;
        _placesWorkerUrlCache    = url ? url.replace(/\/$/, '') : null;
        _placesWorkerUrlCachedAt = now;
        return _placesWorkerUrlCache;
    } catch (err) {
        console.warn('Could not load Foursquare Worker URL:', err);
        return null;
    }
}

/**
 * Returns a human-readable distance string (e.g. "0.3 mi") between two lat/lng points.
 * Returns null if any coordinate is missing.
 */
function placesDistanceLabel(lat1, lng1, lat2, lng2) {
    if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return null;
    var R = 3958.8; // Earth radius in miles
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLng = (lng2 - lng1) * Math.PI / 180;
    var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
    var mi = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return mi < 0.1 ? 'nearby' : mi.toFixed(1) + ' mi';
}

/**
 * Map a Foursquare Places API result item to the standard venue object shape.
 * New API (places-api.foursquare.com) uses fsq_place_id and top-level lat/lng.
 */
function _placesMapFsqResult(item) {
    var loc      = item.location || {};
    var cats     = item.categories || [];
    var category = cats.length > 0 ? cats[0].name : null;
    var address  = loc.formatted_address || loc.address || null;

    return {
        name      : item.name || '(unnamed)',
        address   : address,
        category  : category,
        fsqId     : item.fsq_place_id || null,
        osmId     : null,
        lat       : item.latitude  || (item.geocodes && item.geocodes.main && item.geocodes.main.latitude)  || null,
        lng       : item.longitude || (item.geocodes && item.geocodes.main && item.geocodes.main.longitude) || null,
        existingId: null
    };
}

// ============================================================
// placesNearby — Foursquare GPS-based venue search
// ============================================================

/**
 * Find venues within ~500m of (lat, lng) using the Foursquare Places API.
 * Deduplicates against existing saved places by fsqId.
 *
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<Array>} Array of venue objects:
 *   { name, address, category, fsqId, osmId, lat, lng, existingId }
 *   existingId = Firestore doc ID if already in places, null if new
 */
async function placesNearby(lat, lng) {
    var workerUrl = await _placesGetWorkerUrl();
    if (!workerUrl) throw new Error('Cloudflare Worker URL not configured. Go to Settings → General → Places (tap Help for setup instructions).');

    var url = workerUrl + '/places/search?ll=' + lat + ',' + lng + '&limit=20';

    var resp = await fetch(url);
    if (!resp.ok) throw new Error('Foursquare nearby error: ' + resp.status);

    var data   = await resp.json();
    var venues = (data.results || []).map(_placesMapFsqResult);

    // Dedup: check which fsqIds are already in places
    if (venues.length > 0) {
        var fsqIds    = venues.map(function(v) { return v.fsqId; }).filter(Boolean);
        var chunkSize = 30;
        var existingMap = {};
        for (var i = 0; i < fsqIds.length; i += chunkSize) {
            var chunk = fsqIds.slice(i, i + chunkSize);
            var snap  = await userCol('places')
                .where('fsqId', 'in', chunk)
                .where('status', '==', 1)
                .get();
            snap.forEach(function(doc) {
                existingMap[doc.data().fsqId] = doc.id;
            });
        }
        venues.forEach(function(v) {
            v.existingId = existingMap[v.fsqId] || null;
        });
    }

    return venues;
}

// ============================================================
// placesSearchByName — Firestore first, Nominatim fallback
// ============================================================

/**
 * Search for places by name.
 * Priority: saved places (Firestore) first, then Nominatim text search.
 * Results are deduped by osmId so a saved place won't appear twice.
 *
 * @param {string} query - User-typed search string
 * @returns {Promise<Array>} Array of venue objects (same shape as placesNearby)
 */
/**
 * Geocode a free-text location string (e.g. "Destin, FL") to lat/lng using Nominatim.
 * Returns { lat, lng } or null on failure.
 * @param {string} locationText
 */
async function placesGeocodeLocation(locationText) {
    locationText = (locationText || '').trim();
    if (!locationText) return null;
    try {
        await _placesNominatimRateLimit();
        // countrycodes=us anchors bare/ambiguous queries to the United States. Without it a
        // 5-digit ZIP like "72205" geocodes to a same-numbered place abroad (e.g. Lithuania).
        var url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=' +
                  encodeURIComponent(locationText);
        var resp = await fetch(url, {
            headers: { 'Accept-Language': 'en', 'User-Agent': 'MyLifeApp/1.0' }
        });
        if (!resp.ok) return null;
        var items = await resp.json();
        if (!items || items.length === 0) return null;
        return { lat: parseFloat(items[0].lat), lng: parseFloat(items[0].lon) };
    } catch (err) {
        console.warn('Geocode error:', err);
        return null;
    }
}

/**
 * Search for places by name.
 * Priority: saved places (Firestore) first, then Foursquare text search.
 *
 * Location handling: when the user typed a place/area (`nearText`, e.g. "Little Rock, AR"
 * or a ZIP), it is passed to Foursquare as `near` — an AREA search that reliably returns
 * venues anywhere in that area. A geocoded city center used as a point `ll` bias sorts by
 * distance and buries venues in the suburbs (they fall off the result limit). `ll` is only
 * used for a true GPS point (e.g. "Current location") when no `nearText` is given.
 *
 * @param {string} query       - User-typed search string
 * @param {number} [biasLat]   - Latitude for GPS point bias (used only when nearText absent)
 * @param {number} [biasLng]   - Longitude for GPS point bias (used only when nearText absent)
 * @param {string} [nearText]  - Typed location/area to search within (preferred over ll)
 * @returns {Promise<Array>} Merged array of venue objects
 */
async function placesSearchByName(query, biasLat, biasLng, nearText) {
    query = (query || '').trim();
    if (!query) return [];

    var results    = [];
    var seenFsqIds = {};

    // 1) Search saved places in Firestore (client-side name filter)
    var snap = await userCol('places').where('status', '==', 1).get();
    var term = query.toLowerCase();
    snap.forEach(function(doc) {
        var d = doc.data();
        if ((d.name || '').toLowerCase().includes(term)) {
            results.push({
                name      : d.name,
                address   : d.address   || null,
                category  : d.category  || null,
                fsqId     : d.fsqId     || null,
                osmId     : d.osmId     || null,
                lat       : d.lat       || null,
                lng       : d.lng       || null,
                existingId: doc.id
            });
            if (d.fsqId) seenFsqIds[d.fsqId] = true;
        }
    });

    // 2) Foursquare text search for anything not already found
    try {
        var workerUrl = await _placesGetWorkerUrl();
        if (workerUrl) {
            var url = workerUrl + '/places/search?query=' + encodeURIComponent(query) + '&limit=8';

            // Prefer an area search (`near`) for a typed location; fall back to a GPS point
            // bias (`ll`). Never send both — Foursquare treats them as competing anchors.
            var near = (typeof nearText === 'string') ? nearText.trim() : '';
            if (near) {
                url += '&near=' + encodeURIComponent(near);
            } else if (biasLat != null && biasLng != null) {
                url += '&ll=' + biasLat + ',' + biasLng;
            }

            var resp = await fetch(url);
            if (resp.ok) {
                var data = await resp.json();
                (data.results || []).forEach(function(item) {
                    if (seenFsqIds[item.fsq_id]) return; // already from saved places
                    if (item.fsq_id) seenFsqIds[item.fsq_id] = true;
                    results.push(_placesMapFsqResult(item));
                });
            }
        }
    } catch (err) {
        console.warn('Foursquare text search error:', err);
    }

    return results;
}

// ============================================================
// placesSaveNew — dedup + write + enrichment trigger
// ============================================================

/**
 * Save a venue to the places collection, with deduplication by osmId.
 * If a matching active place already exists (same osmId), returns its ID.
 * Otherwise creates a new doc and fires LLM enrichment non-blocking.
 *
 * @param {object} venueObj - Shape: { name, address, category, osmId, lat, lng }
 * @returns {Promise<string>} Firestore doc ID (existing or newly created)
 */
async function placesSaveNew(venueObj) {
    // Dedup by fsqId (Foursquare) or osmId (legacy) when present
    if (venueObj.fsqId) {
        var snapFsq = await userCol('places')
            .where('fsqId', '==', venueObj.fsqId)
            .where('status', '==', 1)
            .get();
        if (!snapFsq.empty) return snapFsq.docs[0].id;
    } else if (venueObj.osmId) {
        var snapOsm = await userCol('places')
            .where('osmId', '==', venueObj.osmId)
            .where('status', '==', 1)
            .get();
        if (!snapOsm.empty) return snapOsm.docs[0].id;
    }

    // Create new place doc
    var ref = await userCol('places').add({
        name     : venueObj.name     || '(unnamed)',
        address  : venueObj.address  || null,
        category : venueObj.category || null,
        lat      : venueObj.lat      || null,
        lng      : venueObj.lng      || null,
        fsqId    : venueObj.fsqId    || null,
        osmId    : venueObj.osmId    || null,
        status   : 1,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Fire enrichment non-blocking
    placesEnrichWithLLM(ref.id);

    return ref.id;
}

// ============================================================
// placesEnrichWithLLM — background fact enrichment
// ============================================================

/**
 * Silently enrich a place with factual data from the configured LLM.
 * Non-blocking — caller should NOT await this function.
 * Skips gracefully if no LLM is configured or if the call fails.
 * Saves any non-null returned values as Facts (targetType: 'place').
 *
 * @param {string} placeId - Firestore places doc ID
 */
/**
 * Ask the configured LLM for factual enrichment (website, phone, hours, etc.)
 * for a place-like object. Returns the parsed object (keys: website, phone,
 * hours, facebook, google_maps) or null. Does NOT read or write Firestore for
 * the place itself — callers decide what to do with the result. The prompt is
 * careful to prefer null over guessing, so fields are frequently null rather
 * than fabricated. Reused by both saved-place enrichment and the Life Projects
 * "find a place" location flow.
 * @param {{name:string, address?:string, category?:string, lat?:number, lng?:number}} place
 * @returns {Promise<Object|null>}
 */
async function placesFetchEnrichment(place) {
    try {
        // Load LLM config
        var cfgDoc = await userCol('settings').doc('llm').get();
        if (!cfgDoc.exists) return null;
        var cfg = cfgDoc.data();
        if (!cfg.provider || !cfg.apiKey) return null;

        // Build context string for the prompt
        var details = [];
        if (place.name)     details.push('Name: '     + place.name);
        if (place.address)  details.push('Address: '  + place.address);
        if (place.category) details.push('Category: ' + place.category);
        if (place.lat && place.lng) {
            details.push('Coordinates: ' + Number(place.lat).toFixed(6) + ', ' + Number(place.lng).toFixed(6));
        }

        var prompt =
            'You are enriching a place record with known factual data. ' +
            'Return only information you are confident is correct. ' +
            'It is perfectly acceptable — and preferred — to return null for any field you are unsure about. ' +
            'Do not guess, infer, or fabricate any values. A null is always better than a wrong answer.\n\n' +
            'Place details:\n' + details.join('\n') + '\n\n' +
            'Return a JSON object with exactly these keys (use null for unknown):\n' +
            '{\n' +
            '  "website": "official website URL or null",\n' +
            '  "phone": "phone number or null",\n' +
            '  "hours": "general hours string e.g. Mon-Sat 9am-9pm, or null",\n' +
            '  "facebook": "Facebook page URL or null",\n' +
            '  "google_maps": "Google Maps URL from address/coordinates or null"\n' +
            '}\n' +
            'Respond with only the JSON object — no explanation, no markdown fences.';

        var endpoint = (cfg.provider === 'openai')
            ? 'https://api.openai.com/v1/chat/completions'
            : 'https://api.x.ai/v1/chat/completions';
        var model = (cfg.provider === 'openai')
            ? (cfg.model || 'gpt-4o-mini')
            : 'grok-3-mini';

        var resp = await fetch(endpoint, {
            method : 'POST',
            headers: {
                'Content-Type' : 'application/json',
                'Authorization': 'Bearer ' + cfg.apiKey
            },
            body: JSON.stringify({
                model                : model,
                messages             : [{ role: 'user', content: prompt }],
                max_completion_tokens: 300
            })
        });

        if (!resp.ok) {
            console.warn('placesFetchEnrichment: LLM call failed', resp.status);
            return null;
        }

        var data    = await resp.json();
        var content = data.choices && data.choices[0] &&
                      data.choices[0].message && data.choices[0].message.content;
        if (!content) return null;

        // Strip markdown code fences if the LLM wrapped the JSON
        content = content.trim()
            .replace(/^```(?:json)?\s*/i, '')
            .replace(/\s*```$/, '');

        try {
            return JSON.parse(content);
        } catch (e) {
            console.warn('placesFetchEnrichment: could not parse JSON', content);
            return null;
        }
    } catch (err) {
        console.warn('placesFetchEnrichment error (non-fatal):', err);
        return null;
    }
}

async function placesEnrichWithLLM(placeId) {
    try {
        // Load place data
        var placeDoc = await userCol('places').doc(placeId).get();
        if (!placeDoc.exists) return;
        var place = placeDoc.data();

        // Ask the LLM for factual enrichment
        var enriched = await placesFetchEnrichment(place);
        if (!enriched) return;

        // Save non-null fields as Facts on the place
        var labelMap = {
            website    : 'Website',
            phone      : 'Phone',
            hours      : 'Hours',
            facebook   : 'Facebook',
            google_maps: 'Google Maps'
        };

        var saves = [];
        Object.keys(labelMap).forEach(function(key) {
            var value = enriched[key];
            if (value && typeof value === 'string' && value.trim() && value !== 'null') {
                saves.push(userCol('facts').add({
                    targetType: 'place',
                    targetId  : placeId,
                    label     : labelMap[key],
                    value     : value.trim()
                }));
            }
        });

        if (saves.length > 0) {
            await Promise.all(saves);
            console.log('placesEnrichWithLLM: saved', saves.length, 'facts for place', placeId);
        }

    } catch (err) {
        // Silently swallow — enrichment is best-effort, never blocks the user
        console.warn('placesEnrichWithLLM error (non-fatal):', err);
    }
}
