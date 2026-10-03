// ============================================================
// bucketlist.js — Bucket List: places, trails, events you want to visit
//
// Firestore collection: userCol('bucketList')
// Plan document: saveplacesPlan.md
//
// Document shape:
//   name, kind, why, notes, tags[]
//   geo    : { country, countryCode, region, city, venue, address, lat, lng, precision }
//   timing : { type: none|months|date|range, months[], season, startDate, endDate, yearly, label }
//   website, links[{url,label}]
//   status : want | planned | visited | dismissed
//   priority: 1 = high, 2 = medium, 3 = low
//   visitedDate (ISO), source, createdAt, updatedAt
//
// Photos and facts reuse the shared photos.js / facts.js with targetType 'bucketItem'.
//
// Routes: #bucketlist (list), #bucketitem/{id} (detail)
// ============================================================

// ---------- Constants ----------

var BL_KINDS = {
    country   : { icon: '🌍', label: 'Country' },
    region    : { icon: '🗺️', label: 'Region / State' },
    town      : { icon: '🏘️', label: 'Town / City' },
    park      : { icon: '🌲', label: 'Park / Nature' },
    trail     : { icon: '🥾', label: 'Trail / Hike' },
    waterfall : { icon: '💦', label: 'Waterfall' },
    scenic    : { icon: '📸', label: 'Scenic Spot' },
    bar       : { icon: '🍺', label: 'Bar / Brewery' },
    restaurant: { icon: '🍽️', label: 'Restaurant' },
    event     : { icon: '🎉', label: 'Event' },
    other     : { icon: '📍', label: 'Other' }
};

var BL_STATUSES = {
    want     : 'Want',
    planned  : 'Planned',
    visited  : 'Visited',
    dismissed: 'Dismissed'
};

var BL_PRIORITIES = { 1: 'High', 2: 'Medium', 3: 'Low' };

var BL_MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Season → months. Winter wraps the year end.
var BL_SEASONS = {
    spring: [3, 4, 5],
    summer: [6, 7, 8],
    fall  : [9, 10, 11],
    winter: [12, 1, 2]
};

// ---------- Module state ----------

var _blItems       = [];     // all loaded items: [{ id, data }]
var _blEditId      = null;   // id being edited (null = add mode)
var _blModalGeo    = null;   // geo object being built in the modal (lat/lng/countryCode etc.)
var _blDetailMap   = null;   // Leaflet map on the detail page
var _blSearchResults = [];   // location search results shown in the modal

// Current list filters. status 'active' = Want + Planned.
var _blFilters = { text: '', status: 'active', kind: '', priority: '', month: '', sort: 'priority' };

var _blView      = 'list';   // 'list' or 'map'
var _blMap       = null;     // Leaflet map for the map view
var _blCluster   = null;     // marker cluster layer on that map
var _blLocating  = false;    // true while approximate positions are being geocoded
var _blBrowse    = { country: '', region: '', city: '' };   // drill-down position ('' = not drilled)
var _blEditGeoOrig = null;   // geo block of the item being edited (to keep its cached map position)

// ============================================================
// Small helpers
// ============================================================

/** Today as an ISO date string (yyyy-mm-dd) in local time. */
function _blTodayIso() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/** Split an ISO date into numbers without timezone surprises. Returns {y, m, d} or null. */
function _blParseIso(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
    var p = iso.split('-');
    return { y: parseInt(p[0], 10), m: parseInt(p[1], 10), d: parseInt(p[2], 10) };
}

/** "Nov 28" or "Nov 28, 2026". */
function _blFmtDate(iso, withYear) {
    var p = _blParseIso(iso);
    if (!p) return '';
    return BL_MONTH_NAMES[p.m - 1] + ' ' + p.d + (withYear ? ', ' + p.y : '');
}

/**
 * Format a month list compactly: [5] → "May", [10,11] → "Oct–Nov",
 * [12,1,2] → "Dec–Feb", [3,7] → "Mar, Jul".
 */
function _blFmtMonths(months) {
    var set = {};
    (months || []).forEach(function(m) { set[m] = true; });
    var sorted = Object.keys(set).map(Number).sort(function(a, b) { return a - b; });
    if (sorted.length === 0) return '';
    if (sorted.length === 12) return 'Year-round';

    // Build runs of consecutive months
    var runs = [];
    sorted.forEach(function(m) {
        var last = runs[runs.length - 1];
        if (last && last[last.length - 1] === m - 1) last.push(m);
        else runs.push([m]);
    });
    // A run ending in Dec and another starting in Jan are really one run (wraps the year)
    if (runs.length > 1 && runs[0][0] === 1 && runs[runs.length - 1][runs[runs.length - 1].length - 1] === 12) {
        var tail = runs.pop();
        runs[0] = tail.concat(runs[0]);
    }
    return runs.map(function(r) {
        var first = BL_MONTH_NAMES[r[0] - 1];
        return r.length === 1 ? first : first + '–' + BL_MONTH_NAMES[r[r.length - 1] - 1];
    }).join(', ');
}

/** Months (1-12) an item is "good" in. Used by the Month filter. */
function _blMonthsOf(timing) {
    if (!timing) return [];
    if (timing.type === 'months') return timing.months || [];
    var s = _blParseIso(timing.startDate);
    if (timing.type === 'date') return s ? [s.m] : [];
    if (timing.type === 'range') {
        var e = _blParseIso(timing.endDate);
        if (!s) return [];
        if (!e) return [s.m];
        var out = [];
        var m = s.m;
        for (var i = 0; i < 12; i++) {
            out.push(m);
            if (m === e.m) break;
            m = (m % 12) + 1;
        }
        return out;
    }
    return [];
}

/** Human-readable timing text for cards and detail ("May", "Nov 28 – Jan 1 · yearly"). */
function _blTimingText(timing) {
    if (!timing || timing.type === 'none' || !timing.type) return '';
    var text = '';
    if (timing.type === 'months') {
        text = _blFmtMonths(timing.months);
    } else if (timing.type === 'date') {
        text = _blFmtDate(timing.startDate, !timing.yearly);
    } else if (timing.type === 'range') {
        text = _blFmtDate(timing.startDate, !timing.yearly) + ' – ' + _blFmtDate(timing.endDate, !timing.yearly);
    }
    if (timing.yearly && (timing.type === 'date' || timing.type === 'range')) text += ' (yearly)';
    if (timing.label) text += text ? ' · ' + timing.label : timing.label;
    return text;
}

/** True when a one-off dated item is in the past. Yearly and month-based items never expire. */
function _blIsExpired(data) {
    var t = data.timing;
    if (!t || t.yearly) return false;
    var cutoff = t.type === 'range' ? t.endDate : (t.type === 'date' ? t.startDate : null);
    if (!cutoff) return false;
    return cutoff < _blTodayIso();
}

/** "Dublin, Ireland" style location line from the geo block. */
function _blLocationText(geo) {
    if (!geo) return '';
    var parts = [];
    if (geo.venue) parts.push(geo.venue);
    if (geo.city) parts.push(geo.city);
    if (geo.region && geo.region !== geo.city) parts.push(geo.region);
    if (geo.country) parts.push(geo.country);
    return parts.join(', ');
}

/** Add https:// to a URL typed without a scheme. Returns '' for blank input. */
function _blNormalizeUrl(url) {
    url = (url || '').trim();
    if (!url) return '';
    return /^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : 'https://' + url;
}

/** Canonical spelling for a country/region/city: reuse an existing item's spelling if one matches. */
function _blCanonPlace(value, field) {
    if (!value) return null;
    var key = _blNorm(value);
    for (var i = 0; i < _blItems.length; i++) {
        if (_blItems[i].id === _blEditId) continue;
        var existing = (_blItems[i].data.geo || {})[field];
        if (existing && _blNorm(existing) === key) return existing.trim();
    }
    return value;
}

/** Signature of the text location, used to tell whether an edit changed where the item is. */
function _blGeoSig(geo) {
    return [geo.venue, geo.city, geo.region, geo.country].map(_blNorm).join('|');
}

/** Work out how precise a location is from which geo fields are filled in. */
function _blPrecision(geo) {
    if (geo.lat != null && geo.lng != null) return 'exact';
    if (geo.city) return 'city';
    if (geo.region) return 'region';
    if (geo.country) return 'country';
    return null;
}

// ============================================================
// List page
// ============================================================

/** Called by app.js when routing to #bucketlist. */
async function loadBucketListPage() {
    var container  = document.getElementById('blListContainer');
    var emptyState = document.getElementById('blEmptyState');

    container.innerHTML = '';
    emptyState.textContent = 'Loading...';
    emptyState.classList.remove('hidden');

    _blWireListControls();

    try {
        await _blLoadItems();
        _blRenderList();
    } catch (err) {
        console.error('Error loading bucket list:', err);
        emptyState.textContent = 'Error loading bucket list.';
    }
}

/** Read every bucket list document into _blItems. */
async function _blLoadItems() {
    var snap = await userCol('bucketList').get();
    _blItems = [];
    snap.forEach(function(doc) { _blItems.push({ id: doc.id, data: doc.data() }); });
}

/** Hook up the Add button, search box, filter dropdowns and view toggle (safe to call repeatedly). */
function _blWireListControls() {
    document.getElementById('blAddBtn').onclick = function() { _blOpenModal(null, null); };
    document.getElementById('blImportBtn').onclick = openBucketImportModal;

    var search = document.getElementById('blSearchInput');
    search.value = _blFilters.text;
    search.oninput = function() { _blFilters.text = search.value.trim().toLowerCase(); _blRenderList(); };

    var map = {
        blStatusFilter  : 'status',
        blKindFilter    : 'kind',
        blPriorityFilter: 'priority',
        blMonthFilter   : 'month',
        blSortSelect    : 'sort'
    };
    Object.keys(map).forEach(function(id) {
        var el = document.getElementById(id);
        el.value = _blFilters[map[id]];
        el.onchange = function() { _blFilters[map[id]] = el.value; _blRenderList(); };
    });

    // "Good now" shortcut toggles the Month filter between "now" and "any"
    document.getElementById('blGoodNowBtn').onclick = function() {
        _blFilters.month = (_blFilters.month === 'now') ? '' : 'now';
        document.getElementById('blMonthFilter').value = _blFilters.month;
        _blRenderList();
    };

    // List / Map toggle
    document.getElementById('blViewListBtn').onclick = function() { _blSetView('list'); };
    document.getElementById('blViewMapBtn').onclick  = function() { _blSetView('map'); };
}

/** Switch between the list and the map. */
function _blSetView(view) {
    _blView = view;
    _blRenderList();
}

// ---------- Filtering ----------

/** Case/whitespace-insensitive key used to group places ("ireland" and "Ireland " are one). */
function _blNorm(s) {
    return (s || '').trim().toLowerCase();
}

/**
 * Is this item "good" sometime in the next 60 days? Month-based items match if any month in the
 * window is in their list; dated items match if their dates overlap the window (yearly items are
 * checked against last, this and next year).
 */
function _blGoodNow(data) {
    var t = data.timing;
    if (!t || t.type === 'none' || !t.type) return false;
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var end = new Date(today.getTime() + 60 * 86400000);

    if (t.type === 'months') {
        var windowMonths = {};
        for (var d = new Date(today); d <= end; d = new Date(d.getTime() + 86400000)) {
            windowMonths[d.getMonth() + 1] = true;
        }
        return (t.months || []).some(function(m) { return windowMonths[m]; });
    }

    var s = _blParseIso(t.startDate);
    if (!s) return false;
    var e = _blParseIso(t.type === 'range' ? t.endDate : t.startDate) || s;

    if (!t.yearly) {
        return new Date(s.y, s.m - 1, s.d) <= end && new Date(e.y, e.m - 1, e.d) >= today;
    }
    // Yearly: re-project the month/day window onto nearby years
    var wraps = (e.m < s.m) || (e.m === s.m && e.d < s.d);   // e.g. Nov 28 – Jan 1
    for (var y = today.getFullYear() - 1; y <= today.getFullYear() + 1; y++) {
        var start = new Date(y, s.m - 1, s.d);
        var stop  = new Date(y + (wraps ? 1 : 0), e.m - 1, e.d);
        if (start <= end && stop >= today) return true;
    }
    return false;
}

/** Does this item pass the non-location filters (status, type, priority, month, text)? */
function _blMatches(data) {
    var f = _blFilters;
    var status = data.status || 'want';

    if (f.status === 'active') {
        if (status !== 'want' && status !== 'planned') return false;
    } else if (f.status !== 'all' && status !== f.status) {
        return false;
    }
    if (f.kind && data.kind !== f.kind) return false;
    if (f.priority && String(data.priority || 2) !== f.priority) return false;
    if (f.month === 'now') {
        if (!_blGoodNow(data)) return false;
    } else if (f.month && _blMonthsOf(data.timing).indexOf(parseInt(f.month, 10)) === -1) {
        return false;
    }

    if (f.text) {
        var hay = [
            data.name, data.why, data.notes, (data.tags || []).join(' '), _blLocationText(data.geo),
            _blTimingText(data.timing)
        ].join(' ').toLowerCase();
        if (hay.indexOf(f.text) === -1) return false;
    }
    return true;
}

/** Is this item inside the country / region / city currently drilled into? */
function _blInBrowse(data) {
    var g = data.geo || {};
    var b = _blBrowse;
    if (b.country && _blNorm(g.country) !== _blNorm(b.country)) return false;
    if (b.region  && _blNorm(g.region)  !== _blNorm(b.region))  return false;
    if (b.city    && _blNorm(g.city)    !== _blNorm(b.city))    return false;
    return true;
}

// ---------- Where browser (country → region → city) ----------

/**
 * Draw the drill-down bar: a crumb trail (All places › Ireland › Leinster) plus a chip for each
 * place one level down, with a count. `pool` is every item that passes the non-location filters.
 */
function _blRenderBrowse(pool) {
    var bar = document.getElementById('blBrowseBar');
    var b = _blBrowse;

    // Which level are we choosing from, and which items are candidates for it?
    var level = !b.country ? 'country' : (!b.region ? 'region' : (!b.city ? 'city' : null));
    var candidates = pool.filter(function(it) { return _blInBrowse(it.data); });

    // Group candidates by the next level down; keep the first-seen spelling for display
    var groups = {};
    if (level) {
        candidates.forEach(function(it) {
            var raw = (it.data.geo || {})[level];
            var key = _blNorm(raw);
            if (!key) return;
            if (!groups[key]) groups[key] = { name: raw.trim(), count: 0 };
            groups[key].count++;
        });
    }
    var chips = Object.keys(groups).map(function(k) { return groups[k]; })
        .sort(function(a, b) { return b.count - a.count || a.name.localeCompare(b.name); });

    // Nothing to browse and nothing drilled into → hide the bar
    if (chips.length === 0 && !b.country) { bar.classList.add('hidden'); bar.innerHTML = ''; return; }
    bar.classList.remove('hidden');
    bar.innerHTML = '';

    // Crumb trail
    var crumbs = document.createElement('div');
    crumbs.className = 'bl-browse-crumbs';
    function addCrumb(label, onClick, isLast) {
        if (crumbs.childNodes.length) {
            var sep = document.createElement('span');
            sep.className = 'bl-browse-sep';
            sep.textContent = '›';
            crumbs.appendChild(sep);
        }
        var el = document.createElement(isLast ? 'span' : 'button');
        el.className = isLast ? 'bl-browse-current' : 'bl-browse-crumb';
        el.textContent = label;
        if (!isLast) { el.type = 'button'; el.onclick = onClick; }
        crumbs.appendChild(el);
    }
    var trail = [];
    if (b.country) trail.push({ label: b.country, set: { region: '', city: '' } });
    if (b.region)  trail.push({ label: b.region,  set: { city: '' } });
    if (b.city)    trail.push({ label: b.city,    set: {} });
    addCrumb('All places', function() { _blBrowse = { country: '', region: '', city: '' }; _blRenderList(); }, trail.length === 0);
    trail.forEach(function(step, i) {
        addCrumb(step.label, function() {
            Object.keys(step.set).forEach(function(k) { _blBrowse[k] = step.set[k]; });
            _blRenderList();
        }, i === trail.length - 1);
    });
    bar.appendChild(crumbs);

    // Chips for the next level down
    if (chips.length) {
        var row = document.createElement('div');
        row.className = 'bl-browse-chips';
        chips.forEach(function(g) {
            var chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'bl-browse-chip';
            chip.innerHTML = escapeHtml(g.name) + ' <span class="bl-browse-count">' + g.count + '</span>';
            chip.onclick = function() { _blBrowse[level] = g.name; _blRenderList(); };
            row.appendChild(chip);
        });
        bar.appendChild(row);
    }
}

// ---------- Rendering ----------

/** Filter, sort and draw the list (or the map, depending on the current view). */
function _blRenderList() {
    var container  = document.getElementById('blListContainer');
    var emptyState = document.getElementById('blEmptyState');
    var countEl    = document.getElementById('blCountLine');

    // Pool = passes status/type/priority/month/text; shown = pool narrowed by the drill-down
    var pool  = _blItems.filter(function(it) { return _blMatches(it.data); });
    var shown = pool.filter(function(it) { return _blInBrowse(it.data); });

    _blRenderBrowse(pool);

    shown.sort(function(a, b) {
        if (_blFilters.sort === 'name') return (a.data.name || '').localeCompare(b.data.name || '');
        if (_blFilters.sort === 'newest') return _blCreatedMs(b.data) - _blCreatedMs(a.data);
        // Default: priority (High first), then name
        var pa = a.data.priority || 2, pb = b.data.priority || 2;
        if (pa !== pb) return pa - pb;
        return (a.data.name || '').localeCompare(b.data.name || '');
    });

    // Highlight the active view button / Good-now button
    document.getElementById('blViewListBtn').classList.toggle('bl-view-active', _blView === 'list');
    document.getElementById('blViewMapBtn').classList.toggle('bl-view-active', _blView === 'map');
    document.getElementById('blGoodNowBtn').classList.toggle('bl-view-active', _blFilters.month === 'now');
    document.getElementById('blMapWrap').classList.toggle('hidden', _blView !== 'map');
    container.classList.toggle('hidden', _blView === 'map');

    container.innerHTML = '';
    countEl.textContent = _blItems.length ? (shown.length + ' of ' + _blItems.length + ' items') : '';

    if (shown.length === 0) {
        emptyState.textContent = _blItems.length === 0
            ? 'Nothing on your bucket list yet. Tap + Add to save your first place.'
            : 'No items match these filters.';
        emptyState.classList.remove('hidden');
    } else {
        emptyState.classList.add('hidden');
    }

    if (_blView === 'map') {
        _blRenderMap(shown);
    } else {
        shown.forEach(function(it) { container.appendChild(_blRenderCard(it.id, it.data)); });
    }
}

// ============================================================
// Map view (Leaflet + marker clustering)
// ============================================================

/**
 * Where should this item's pin go? Exact coordinates win; otherwise the approximate point we
 * geocoded from its city/region/country. Returns { lat, lng, approx } or null.
 */
function _blPoint(data) {
    var g = data.geo || {};
    if (g.lat != null && g.lng != null) return { lat: g.lat, lng: g.lng, approx: false };
    if (g.approxLat != null && g.approxLng != null) return { lat: g.approxLat, lng: g.approxLng, approx: true };
    return null;
}

/** Popup content for a pin: name (link), location, timing. Built with DOM calls so text is escaped. */
function _blPopupEl(id, data, approx) {
    var kind = BL_KINDS[data.kind] || BL_KINDS.other;
    var box = document.createElement('div');
    box.className = 'bl-popup';
    var a = document.createElement('a');
    a.href = '#bucketitem/' + id;
    a.textContent = kind.icon + ' ' + (data.name || '(unnamed)');
    a.className = 'bl-popup-name';
    box.appendChild(a);
    var loc = _blLocationText(data.geo);
    var timing = _blTimingText(data.timing);
    [loc && ('📍 ' + loc), timing && ('🗓️ ' + timing), approx && 'Approximate pin (town/region center)']
        .forEach(function(t) {
            if (!t) return;
            var line = document.createElement('div');
            line.className = 'bl-popup-line';
            line.textContent = t;
            box.appendChild(line);
        });
    return box;
}

/** Draw the clustered map for the items currently shown; kick off geocoding for unplaced ones. */
function _blRenderMap(shown) {
    var status = document.getElementById('blMapStatus');
    var unplacedEl = document.getElementById('blMapUnplaced');

    if (typeof L === 'undefined' || !L.markerClusterGroup) {
        status.textContent = 'The map library could not be loaded (are you offline?).';
        return;
    }

    if (!_blMap) {
        _blMap = L.map('blMap').setView([20, 0], 2);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(_blMap);
    }
    if (_blCluster) _blMap.removeLayer(_blCluster);
    _blCluster = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 50 });

    var bounds = [];
    var unplaced = [];
    shown.forEach(function(it) {
        var p = _blPoint(it.data);
        if (!p) { unplaced.push(it); return; }
        var marker = L.marker([p.lat, p.lng], { title: it.data.name || '', opacity: p.approx ? 0.7 : 1 });
        marker.bindPopup(_blPopupEl(it.id, it.data, p.approx));
        _blCluster.addLayer(marker);
        bounds.push([p.lat, p.lng]);
    });
    _blMap.addLayer(_blCluster);

    // The container was hidden until now, so Leaflet needs to re-measure it before fitting
    setTimeout(function() {
        _blMap.invalidateSize();
        if (bounds.length) _blMap.fitBounds(bounds, { padding: [30, 30], maxZoom: 12 });
    }, 50);

    // Items that still can't be pinned: list them below the map
    unplacedEl.innerHTML = '';
    if (unplaced.length) {
        var head = document.createElement('div');
        head.className = 'bl-unplaced-head';
        head.textContent = 'Not on the map (' + unplaced.length + ') — no location to pin';
        unplacedEl.appendChild(head);
        unplaced.forEach(function(it) {
            var link = document.createElement('a');
            link.href = '#bucketitem/' + it.id;
            link.className = 'bl-unplaced-link';
            link.textContent = (BL_KINDS[it.data.kind] || BL_KINDS.other).icon + ' ' + (it.data.name || '(unnamed)');
            unplacedEl.appendChild(link);
        });
    }
    status.textContent = shown.length === 0 ? 'Nothing to show on the map with these filters.' : '';

    _blLocateMissing(shown);
}

/**
 * Geocode items that have a city/region/country but no pin yet (one request per second, as
 * Nominatim asks). The approximate point is saved on the item (geo.approxLat/approxLng) so each
 * item is only ever looked up once. A failed lookup is remembered (geo.approxFailed) so it isn't
 * retried every time the map opens; editing the item's location clears that.
 */
async function _blLocateMissing(shown) {
    if (_blLocating) return;
    var todo = shown.filter(function(it) {
        var g = it.data.geo || {};
        if (_blPoint(it.data) || g.approxFailed) return false;
        return !!(g.venue || g.city || g.region || g.country);
    });
    if (todo.length === 0) return;

    _blLocating = true;
    var status = document.getElementById('blMapStatus');
    var placedAny = false;
    try {
        for (var i = 0; i < todo.length; i++) {
            if (_blView !== 'map' || window.location.hash !== '#bucketlist') break;   // user moved on
            status.textContent = 'Locating items on the map… (' + (i + 1) + ' of ' + todo.length + ')';
            var it = todo[i];
            var g = it.data.geo;
            // First try the specific place (venue, or the item's own name for a trail/waterfall/bar
            // etc. when we know the city or region), then fall back to just the city/region/country.
            var specific = ['country', 'region', 'town'].indexOf(it.data.kind) === -1;
            var lead = g.venue || ((specific && (g.city || g.region)) ? it.data.name : null);
            var area = [g.city, g.region, g.country].filter(Boolean).join(', ');
            var queries = [];
            if (lead) queries.push([lead, area].filter(Boolean).join(', '));
            if (lead && g.country && area !== g.country) queries.push(lead + ', ' + g.country);   // fewer words often matches better
            if (area) queries.push(area);
            var found = null, lookupFailed = false;
            for (var q = 0; q < queries.length && !found; q++) {
                try {
                    await _placesNominatimRateLimit();
                    var resp = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1&q=' +
                                           encodeURIComponent(queries[q]), { headers: { 'Accept-Language': 'en' } });
                    if (!resp.ok) { lookupFailed = true; break; }   // temporary problem: try again next time
                    found = (await resp.json())[0] || null;
                } catch (netErr) { lookupFailed = true; break; }
            }
            if (!found && lookupFailed) continue;

            var update = {};
            if (found) {
                g.approxLat = parseFloat(found.lat);
                g.approxLng = parseFloat(found.lon);
                update['geo.approxLat'] = g.approxLat;
                update['geo.approxLng'] = g.approxLng;
                if (!g.countryCode && found.address && found.address.country_code) {
                    g.countryCode = found.address.country_code.toUpperCase();
                    update['geo.countryCode'] = g.countryCode;
                }
                placedAny = true;
            } else {
                g.approxFailed = true;
                update['geo.approxFailed'] = true;
            }
            try { await userCol('bucketList').doc(it.id).update(update); }
            catch (saveErr) { console.warn('Could not save map position (read-only?):', saveErr); }
        }
    } finally {
        _blLocating = false;
        status.textContent = '';
    }
    if (placedAny && _blView === 'map' && window.location.hash === '#bucketlist') _blRenderList();
}

/** createdAt as milliseconds (Firestore Timestamp or missing). */
function _blCreatedMs(data) {
    return (data.createdAt && data.createdAt.toMillis) ? data.createdAt.toMillis() : 0;
}

/** Build the small badge row shown on cards and detail pages (left-aligned). */
function _blBadgesHtml(data) {
    var badges = [];
    var status = data.status || 'want';
    if (status !== 'want') badges.push('<span class="bl-badge bl-badge--' + status + '">' + escapeHtml(BL_STATUSES[status] || status) + '</span>');
    var pr = data.priority || 2;
    badges.push('<span class="bl-badge bl-badge--p' + pr + '">' + escapeHtml(BL_PRIORITIES[pr]) + '</span>');
    if ((status === 'want' || status === 'planned') && _blIsExpired(data)) {
        badges.push('<span class="bl-badge bl-badge--expired">Expired</span>');
    }
    return badges.join('');
}

/** One list card. */
function _blRenderCard(id, data) {
    var kind = BL_KINDS[data.kind] || BL_KINDS.other;
    var row = document.createElement('div');
    row.className = 'card-list-item bl-card';

    var main = document.createElement('div');
    main.className = 'bl-card-main';
    main.style.cursor = 'pointer';
    main.onclick = function() { window.location.hash = '#bucketitem/' + id; };

    var loc = _blLocationText(data.geo);
    var timing = _blTimingText(data.timing);

    main.innerHTML =
        '<div class="bl-card-name">' + kind.icon + ' ' + escapeHtml(data.name || '(unnamed)') + '</div>' +
        '<div class="bl-badges">' + _blBadgesHtml(data) + '</div>' +
        (loc    ? '<div class="bl-card-sub">📍 ' + escapeHtml(loc) + '</div>' : '') +
        (timing ? '<div class="bl-card-sub">🗓️ ' + escapeHtml(timing) + '</div>' : '') +
        (data.why ? '<div class="bl-card-why">' + escapeHtml(data.why) + '</div>' : '');

    var editBtn = document.createElement('button');
    editBtn.className = 'btn btn-secondary btn-small';
    editBtn.textContent = 'Edit';
    editBtn.onclick = function(e) { e.stopPropagation(); _blOpenModal(id, data); };

    row.appendChild(main);
    row.appendChild(editBtn);
    return row;
}

// ============================================================
// Detail page
// ============================================================

/** Called by app.js when routing to #bucketitem/{id}. */
async function loadBucketItemPage(itemId) {
    var nameEl   = document.getElementById('blDetailName');
    var infoEl   = document.getElementById('blDetailInfo');
    var mapWrap  = document.getElementById('blDetailMapWrap');
    var actionEl = document.getElementById('blDetailActions');

    nameEl.textContent = 'Loading...';
    infoEl.innerHTML = '';
    actionEl.innerHTML = '';
    _blSetBreadcrumb(null);

    if (_blDetailMap) { _blDetailMap.remove(); _blDetailMap = null; }
    mapWrap.classList.add('hidden');

    document.getElementById('blDetailBackBtn').onclick = function() { window.location.hash = '#bucketlist'; };

    try {
        var doc = await userCol('bucketList').doc(itemId).get();
        if (!doc.exists) { nameEl.textContent = 'Item not found'; return; }

        var data = doc.data();
        window.currentBucketItem = { id: itemId, ...data };   // global for photo/fact buttons
        var kind = BL_KINDS[data.kind] || BL_KINDS.other;

        nameEl.textContent = kind.icon + ' ' + (data.name || '(unnamed)');
        _blSetBreadcrumb(data.name || '(unnamed)');
        document.getElementById('blDetailEditBtn').onclick = function() { _blOpenModal(itemId, data); };

        // ── Status quick actions ─────────────────────────────────
        var status = data.status || 'want';
        if (status !== 'visited') actionEl.appendChild(_blStatusButton(itemId, 'visited', '✅ Mark Visited', true));
        if (status === 'want')    actionEl.appendChild(_blStatusButton(itemId, 'planned', '📅 Mark Planned'));
        if (status !== 'want' && status !== 'planned') actionEl.appendChild(_blStatusButton(itemId, 'want', '↩ Back to Want'));
        if (status !== 'dismissed') actionEl.appendChild(_blStatusButton(itemId, 'dismissed', 'Dismiss'));
        // Journal / trip / calendar buttons (bucketlist-links.js)
        if (typeof _blAddIntegrationButtons === 'function') _blAddIntegrationButtons(actionEl, itemId, data);

        // ── Info table ───────────────────────────────────────────
        var geo = data.geo || {};
        var rows = [];
        rows.push({ label: 'Status', html: _blBadgesHtml(data) + (data.visitedDate ? ' <span class="bl-visited-date">on ' + escapeHtml(_blFmtDate(data.visitedDate, true)) + '</span>' : '') });
        rows.push({ label: 'Type', text: kind.label });
        var loc = _blLocationText(geo);
        if (loc) rows.push({ label: 'Where', text: loc });
        if (geo.address) rows.push({ label: 'Address', text: geo.address });
        var timing = _blTimingText(data.timing);
        if (timing) rows.push({ label: 'When', text: timing });
        if (data.why)   rows.push({ label: 'Why', text: data.why });
        if (data.notes) rows.push({ label: 'Notes', text: data.notes, pre: true });
        if (data.tags && data.tags.length) rows.push({ label: 'Tags', text: data.tags.join(', ') });
        if (data.trips && data.trips.length) {
            rows.push({ label: 'Trips', html: data.trips.map(function(t) {
                return '<a href="#life-project/' + encodeURIComponent(t.projectId) + '">' + escapeHtml(t.title || 'Trip') + '</a>';
            }).join(', ') });
        }
        if (data.website) rows.push({ label: 'Website', link: { url: data.website, label: data.website } });
        (data.links || []).forEach(function(l, i) {
            rows.push({ label: i === 0 ? 'Links' : '', link: { url: l.url, label: l.label || l.url } });
        });
        if (geo.lat != null && geo.lng != null) {
            rows.push({ label: 'Coordinates', html:
                escapeHtml(Number(geo.lat).toFixed(5) + ', ' + Number(geo.lng).toFixed(5)) +
                ' &nbsp;<a href="https://www.google.com/maps?q=' + encodeURIComponent(geo.lat + ',' + geo.lng) +
                '" target="_blank" rel="noopener">Open in Maps</a>' });
        }

        var table = document.createElement('div');
        table.className = 'place-detail-table';
        rows.forEach(function(r) {
            var row = document.createElement('div');
            row.className = 'place-detail-row';
            var label = document.createElement('span');
            label.className = 'place-detail-label';
            label.textContent = r.label;
            var value = document.createElement('span');
            value.className = 'place-detail-value';
            if (r.html !== undefined) value.innerHTML = r.html;
            else if (r.link) {
                var a = document.createElement('a');
                a.href = r.link.url; a.target = '_blank'; a.rel = 'noopener';
                a.textContent = r.link.label;
                value.appendChild(a);
            } else {
                value.textContent = r.text;
                if (r.pre) value.style.whiteSpace = 'pre-wrap';
            }
            row.appendChild(label);
            row.appendChild(value);
            table.appendChild(row);
        });
        infoEl.appendChild(table);

        // ── Leaflet map ──────────────────────────────────────────
        var pin = _blPoint(data);
        if (pin && typeof L !== 'undefined') {
            mapWrap.classList.remove('hidden');
            setTimeout(function() {
                _blDetailMap = L.map('blDetailMap').setView([pin.lat, pin.lng], pin.approx ? 9 : 13);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                }).addTo(_blDetailMap);
                L.marker([pin.lat, pin.lng], { opacity: pin.approx ? 0.7 : 1 }).addTo(_blDetailMap);
                _blDetailMap.invalidateSize();
            }, 50);
        }

        // ── Facts & photos (shared modules) ──────────────────────
        loadFacts('bucketItem', itemId, 'blFactsContainer', 'blFactsEmptyState');
        loadPhotos('bucketItem', itemId, 'blPhotoContainer', 'blPhotoEmptyState');

    } catch (err) {
        console.error('Error loading bucket item:', err);
        nameEl.textContent = 'Error loading item';
    }
}

/** Breadcrumb: Bucket List › {name}. */
function _blSetBreadcrumb(name) {
    var crumb = document.getElementById('breadcrumbBar');
    if (!crumb) return;
    crumb.innerHTML =
        '<a href="#bucketlist">Bucket List</a>' +
        '<span class="separator">&rsaquo;</span>' +
        '<span>' + escapeHtml(name || 'Item') + '</span>';
}

/** Detail-page button that sets the item's status. */
function _blStatusButton(itemId, newStatus, label, primary) {
    var btn = document.createElement('button');
    btn.className = 'btn btn-small ' + (primary ? 'btn-primary' : 'btn-secondary');
    btn.textContent = label;
    btn.onclick = async function() {
        var update = { status: newStatus, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
        if (newStatus === 'visited') update.visitedDate = _blTodayIso();
        try {
            await userCol('bucketList').doc(itemId).update(update);
            loadBucketItemPage(itemId);
        } catch (err) {
            console.error('Error updating status:', err);
            alert('Error updating status — please try again.');
        }
    };
    return btn;
}

// ============================================================
// Add / Edit modal
// ============================================================

/** Open the modal in add mode (id null) or edit mode. */
function _blOpenModal(id, data) {
    _blEditId = id;
    data = data || {};
    var geo = data.geo || {};
    _blEditGeoOrig = data.geo || null;
    var timing = data.timing || { type: 'none', months: [], yearly: false };

    document.getElementById('blModalTitle').textContent = id ? 'Edit Bucket List Item' : 'Add to Bucket List';
    document.getElementById('blModalDeleteBtn').style.display = id ? '' : 'none';

    document.getElementById('blNameInput').value = data.name || '';
    document.getElementById('blKindSelect').value = data.kind || 'other';
    document.getElementById('blStatusSelect').value = data.status || 'want';
    document.getElementById('blPrioritySelect').value = String(data.priority || 2);
    document.getElementById('blVisitedDate').value = data.visitedDate || '';
    _blToggleVisitedRow();

    // Location
    _blModalGeo = { lat: geo.lat != null ? geo.lat : null, lng: geo.lng != null ? geo.lng : null, countryCode: geo.countryCode || null };
    document.getElementById('blLocSearchInput').value = '';
    document.getElementById('blLocResults').innerHTML = '';
    document.getElementById('blCountryInput').value = geo.country || '';
    document.getElementById('blRegionInput').value = geo.region || '';
    document.getElementById('blCityInput').value = geo.city || '';
    document.getElementById('blVenueInput').value = geo.venue || '';
    document.getElementById('blAddressInput').value = geo.address || '';
    _blUpdateCoordsLabel();

    // Timing
    document.getElementById('blTimingType').value = timing.type || 'none';
    var monthBoxes = document.querySelectorAll('#blMonthGrid input[type=checkbox]');
    monthBoxes.forEach(function(cb) { cb.checked = (timing.months || []).indexOf(parseInt(cb.value, 10)) !== -1; });
    document.getElementById('blStartDate').value = timing.startDate || '';
    document.getElementById('blEndDate').value = timing.endDate || '';
    document.getElementById('blYearly').checked = !!timing.yearly;
    document.getElementById('blTimingLabel').value = timing.label || '';
    _blToggleTimingRows();

    // Text + links
    document.getElementById('blWhyInput').value = data.why || '';
    document.getElementById('blNotesInput').value = data.notes || '';
    document.getElementById('blTagsInput').value = (data.tags || []).join(', ');
    document.getElementById('blWebsiteInput').value = data.website || '';
    var linksWrap = document.getElementById('blLinksContainer');
    linksWrap.innerHTML = '';
    (data.links || []).forEach(function(l) { _blAddLinkRow(l.url, l.label); });

    // Wire controls
    document.getElementById('blModalCancelBtn').onclick = function() { closeModal('blModal'); };
    document.getElementById('blModalSaveBtn').onclick = _blSave;
    document.getElementById('blModalDeleteBtn').onclick = function() {
        closeModal('blModal');
        setTimeout(function() { _blConfirmDelete(_blEditId); }, 50);
    };
    document.getElementById('blStatusSelect').onchange = function() {
        // Default the visited date to today the first time "Visited" is picked
        if (this.value === 'visited' && !document.getElementById('blVisitedDate').value) {
            document.getElementById('blVisitedDate').value = _blTodayIso();
        }
        _blToggleVisitedRow();
    };
    document.getElementById('blTimingType').onchange = _blToggleTimingRows;
    document.getElementById('blLocSearchBtn').onclick = _blRunLocationSearch;
    document.getElementById('blLocSearchInput').onkeydown = function(e) {
        if (e.key === 'Enter') { e.preventDefault(); _blRunLocationSearch(); }
    };
    document.getElementById('blClearCoordsBtn').onclick = function() { _blModalGeo.lat = null; _blModalGeo.lng = null; _blUpdateCoordsLabel(); };
    document.getElementById('blAddLinkBtn').onclick = function() { _blAddLinkRow('', ''); };
    document.querySelectorAll('#blSeasonButtons button').forEach(function(btn) {
        btn.onclick = function() { _blApplySeason(btn.dataset.season); };
    });

    openModal('blModal');
}

/** Show the visited-date row only when status is Visited. */
function _blToggleVisitedRow() {
    var isVisited = document.getElementById('blStatusSelect').value === 'visited';
    document.getElementById('blVisitedRow').classList.toggle('hidden', !isVisited);
}

/** Show the sub-fields that match the chosen timing type. */
function _blToggleTimingRows() {
    var type = document.getElementById('blTimingType').value;
    document.getElementById('blMonthsRow').classList.toggle('hidden', type !== 'months');
    document.getElementById('blDatesRow').classList.toggle('hidden', type !== 'date' && type !== 'range');
    document.getElementById('blEndDateWrap').classList.toggle('hidden', type !== 'range');
    document.getElementById('blYearlyRow').classList.toggle('hidden', type !== 'date' && type !== 'range');
    document.getElementById('blTimingLabelRow').classList.toggle('hidden', type === 'none');
}

/** Tick the months of a season (replaces the current selection). */
function _blApplySeason(season) {
    var months = BL_SEASONS[season] || [];
    document.querySelectorAll('#blMonthGrid input[type=checkbox]').forEach(function(cb) {
        cb.checked = months.indexOf(parseInt(cb.value, 10)) !== -1;
    });
}

/** Add one URL + label row to the extra-links list. */
function _blAddLinkRow(url, label) {
    var row = document.createElement('div');
    row.className = 'bl-link-row';
    row.innerHTML =
        '<input type="text" class="bl-link-label" placeholder="Label (optional)">' +
        '<input type="text" class="bl-link-url" placeholder="https://...">' +
        '<button type="button" class="btn btn-secondary btn-small bl-link-remove" title="Remove">&times;</button>';
    row.querySelector('.bl-link-label').value = label || '';
    row.querySelector('.bl-link-url').value = url || '';
    row.querySelector('.bl-link-remove').onclick = function() { row.remove(); };
    document.getElementById('blLinksContainer').appendChild(row);
}

/** Show the saved coordinates (or "none") in the modal. */
function _blUpdateCoordsLabel() {
    var has = _blModalGeo && _blModalGeo.lat != null && _blModalGeo.lng != null;
    document.getElementById('blCoordsLabel').textContent = has
        ? '📍 ' + Number(_blModalGeo.lat).toFixed(5) + ', ' + Number(_blModalGeo.lng).toFixed(5)
        : '📍 No coordinates';
    document.getElementById('blClearCoordsBtn').style.display = has ? '' : 'none';
}

// ---------- Location search (OpenStreetMap / Nominatim) ----------

/**
 * Search OpenStreetMap for a place name and show structured results.
 * OSM covers countries, towns, trails, waterfalls and parks, which suits this list.
 */
async function _blRunLocationSearch() {
    var query = document.getElementById('blLocSearchInput').value.trim();
    var resultsEl = document.getElementById('blLocResults');
    if (!query) return;

    resultsEl.innerHTML = '<div class="bl-loc-status">Searching...</div>';
    try {
        await _placesNominatimRateLimit();   // shared 1 request/second guard from places.js
        var url = 'https://nominatim.openstreetmap.org/search?format=json&limit=8&addressdetails=1&namedetails=1&q=' +
                  encodeURIComponent(query);
        var resp = await fetch(url, { headers: { 'Accept-Language': 'en' } });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        _blSearchResults = (await resp.json()).map(_blMapNominatim);
    } catch (err) {
        console.warn('Bucket list location search failed:', err);
        resultsEl.innerHTML = '<div class="bl-loc-status">Search failed — check your connection or fill the fields in by hand.</div>';
        return;
    }

    if (_blSearchResults.length === 0) {
        resultsEl.innerHTML = '<div class="bl-loc-status">No matches. Try a different spelling, or fill the fields in by hand.</div>';
        return;
    }
    resultsEl.innerHTML = '';
    _blSearchResults.forEach(function(r, i) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'bl-loc-result';
        btn.innerHTML = '<strong>' + escapeHtml(r.name) + '</strong><span>' + escapeHtml(r.display) + '</span>';
        btn.onclick = function() { _blApplySearchResult(i); };
        resultsEl.appendChild(btn);
    });
}

/** Convert a raw Nominatim result into the pieces we store. */
function _blMapNominatim(item) {
    var a = item.address || {};
    var parts = (item.display_name || '').split(',').map(function(s) { return s.trim(); });
    var name = (item.namedetails && (item.namedetails.name || item.namedetails['name:en'])) || parts[0] || '';
    // Administrative areas and generic "place" results are towns/regions, not a specific venue
    var isArea = item.class === 'boundary' || item.class === 'place';
    return {
        name       : name,
        display    : parts.slice(1, 4).join(', ') || (a.country || ''),
        isArea     : isArea,
        country    : a.country || '',
        countryCode: (a.country_code || '').toUpperCase(),
        region     : a.state || a.region || a.province || a.state_district || '',
        city       : a.city || a.town || a.village || a.hamlet || a.municipality || '',   // county deliberately excluded — it isn't a city
        address    : item.display_name || '',
        lat        : parseFloat(item.lat),
        lng        : parseFloat(item.lon),
        osmType    : item.type || ''
    };
}

/** Copy a chosen search result into the modal fields. */
function _blApplySearchResult(index) {
    var r = _blSearchResults[index];
    if (!r) return;
    document.getElementById('blCountryInput').value = r.country;
    document.getElementById('blRegionInput').value = r.region;
    // For a town/area result the name IS the city; for a venue, keep the city separate
    document.getElementById('blCityInput').value = r.isArea && !r.city ? r.name : r.city;
    document.getElementById('blVenueInput').value = r.isArea ? '' : r.name;
    document.getElementById('blAddressInput').value = r.address;
    _blModalGeo.lat = r.lat;
    _blModalGeo.lng = r.lng;
    _blModalGeo.countryCode = r.countryCode || null;
    _blUpdateCoordsLabel();
    // Fill the name only if the user hasn't typed one yet
    var nameInput = document.getElementById('blNameInput');
    if (!nameInput.value.trim()) nameInput.value = r.name;
    document.getElementById('blLocResults').innerHTML = '';
}

// ---------- Save ----------

/** Read the modal and write the document. */
async function _blSave() {
    var name = document.getElementById('blNameInput').value.trim();
    if (!name) {
        alert('Please enter a name.');
        document.getElementById('blNameInput').focus();
        return;
    }

    // Make sure we know the existing places so spellings can be matched (e.g. saving from a detail page)
    if (_blItems.length === 0) { try { await _blLoadItems(); } catch (e) { /* non-fatal */ } }

    // Timing
    var type = document.getElementById('blTimingType').value;
    var timing = { type: type, months: [], season: null, startDate: null, endDate: null, yearly: false, label: null };
    if (type === 'months') {
        document.querySelectorAll('#blMonthGrid input[type=checkbox]:checked').forEach(function(cb) {
            timing.months.push(parseInt(cb.value, 10));
        });
        timing.months.sort(function(a, b) { return a - b; });
        if (timing.months.length === 0) { timing.type = 'none'; }
        // Record the season name when the picked months exactly match one
        Object.keys(BL_SEASONS).forEach(function(s) {
            var sm = BL_SEASONS[s].slice().sort(function(a, b) { return a - b; });
            if (sm.join(',') === timing.months.join(',')) timing.season = s;
        });
    } else if (type === 'date' || type === 'range') {
        timing.startDate = document.getElementById('blStartDate').value || null;
        timing.endDate = type === 'range' ? (document.getElementById('blEndDate').value || null) : null;
        timing.yearly = document.getElementById('blYearly').checked;
        if (!timing.startDate) {
            alert('Please choose a start date, or set "When" to "No specific time".');
            return;
        }
        if (type === 'range' && timing.endDate && timing.endDate < timing.startDate) {
            alert('The end date is before the start date.');
            return;
        }
        if (type === 'range' && !timing.endDate) timing.type = 'date';
    }
    if (timing.type !== 'none') timing.label = document.getElementById('blTimingLabel').value.trim() || null;

    // Location
    var geo = {
        country    : document.getElementById('blCountryInput').value.trim() || null,
        countryCode: _blModalGeo.countryCode || null,
        region     : document.getElementById('blRegionInput').value.trim() || null,
        city       : document.getElementById('blCityInput').value.trim() || null,
        venue      : document.getElementById('blVenueInput').value.trim() || null,
        address    : document.getElementById('blAddressInput').value.trim() || null,
        lat        : _blModalGeo.lat,
        lng        : _blModalGeo.lng
    };
    // Use the spelling already in the list for the same country/region/city, so "ireland" and
    // "Ireland" can never become two separate groups
    geo.country = _blCanonPlace(geo.country, 'country');
    geo.region  = _blCanonPlace(geo.region,  'region');
    geo.city    = _blCanonPlace(geo.city,    'city');
    geo.precision = _blPrecision(geo);

    // Keep the cached map position if the text location didn't change (saves a re-lookup)
    if (_blEditId && _blEditGeoOrig && geo.lat == null && _blGeoSig(_blEditGeoOrig) === _blGeoSig(geo)) {
        if (_blEditGeoOrig.approxLat != null) { geo.approxLat = _blEditGeoOrig.approxLat; geo.approxLng = _blEditGeoOrig.approxLng; }
        if (_blEditGeoOrig.approxFailed) geo.approxFailed = true;
    }

    // Links
    var links = [];
    document.querySelectorAll('#blLinksContainer .bl-link-row').forEach(function(row) {
        var url = _blNormalizeUrl(row.querySelector('.bl-link-url').value);
        if (url) links.push({ url: url, label: row.querySelector('.bl-link-label').value.trim() || null });
    });

    var tags = document.getElementById('blTagsInput').value.split(',')
        .map(function(t) { return t.trim().toLowerCase(); })
        .filter(function(t, i, arr) { return t && arr.indexOf(t) === i; });

    var status = document.getElementById('blStatusSelect').value;
    var payload = {
        name       : name,
        kind       : document.getElementById('blKindSelect').value,
        why        : document.getElementById('blWhyInput').value.trim() || null,
        notes      : document.getElementById('blNotesInput').value.trim() || null,
        tags       : tags,
        geo        : geo,
        timing     : timing,
        website    : _blNormalizeUrl(document.getElementById('blWebsiteInput').value) || null,
        links      : links,
        status     : status,
        priority   : parseInt(document.getElementById('blPrioritySelect').value, 10) || 2,
        visitedDate: status === 'visited' ? (document.getElementById('blVisitedDate').value || _blTodayIso()) : null,
        updatedAt  : firebase.firestore.FieldValue.serverTimestamp()
    };

    var saveBtn = document.getElementById('blModalSaveBtn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';

    try {
        if (_blEditId) {
            await userCol('bucketList').doc(_blEditId).update(payload);
        } else {
            payload.source = 'manual';
            payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await userCol('bucketList').add(payload);
        }
        closeModal('blModal');
        // Refresh whichever page is showing
        if (window.location.hash.indexOf('#bucketitem/') === 0) loadBucketItemPage(_blEditId);
        else loadBucketListPage();
    } catch (err) {
        console.error('Error saving bucket list item:', err);
        alert('Error saving — please try again.');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save';
    }
}

// ---------- Delete ----------

/** Permanently delete an item along with its photos and facts. */
async function _blConfirmDelete(id) {
    if (!id) return;
    if (!confirm('Delete this item, including its photos and facts? This cannot be undone.\n\n(Tip: use Dismiss instead to hide it but keep it.)')) return;
    try {
        var types = ['photos', 'facts'];
        for (var i = 0; i < types.length; i++) {
            var snap = await userCol(types[i]).where('targetType', '==', 'bucketItem').where('targetId', '==', id).get();
            for (var j = 0; j < snap.docs.length; j++) { await snap.docs[j].ref.delete(); }
        }
        await userCol('bucketList').doc(id).delete();
        // Changing the hash triggers the router; if we're already on the list, reload it directly
        if (window.location.hash === '#bucketlist') loadBucketListPage();
        else window.location.hash = '#bucketlist';
    } catch (err) {
        console.error('Error deleting bucket list item:', err);
        alert('Error deleting — please try again.');
    }
}
