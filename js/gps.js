// ============================================================
// GPS.js — GPS Shape Recording and Map Display
// Walk a zone perimeter with your phone to record a 2D shape.
// Uses Leaflet.js + OpenStreetMap (free, no API key needed).
// ============================================================

// ---------- Constants ----------

// Dark, high-contrast colors for shape display
const GPS_COLORS = ['#2E7D32', '#1565C0', '#E65100', '#6A1B9A',
                    '#C62828', '#00695C', '#4E342E', '#AD1457'];

const TILE_URL   = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTR  = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// ---------- Module State ----------

var gpsWatchId        = null;     // geolocation watchPosition ID
var gpsRecordedPoints = [];       // points collected during current recording
var gpsLastPoint      = null;     // last accepted point (for jump detection)
var gpsCurrentZoneId  = null;     // zone being viewed/recorded
var gpsCurrentShape   = null;     // loaded Firestore shape doc for current zone

// Leaflet map instances — only one should be active at a time
var gpsViewMap       = null;
var gpsViewTileLayer = null;
var gpsEditMap              = null;
var gpsEditTileLayer        = null;
var gpsEditBoundaryLayer    = null;  // property boundary overlay in edit mode
var gpsYardMap       = null;
var gpsYardTileLayer = null;

// Point editor state
var gpsEditPoints  = [];   // working copy of points in the editor
var gpsEditMarkers = [];   // Leaflet Marker objects for each edit point
var gpsEditPolygon = null; // Leaflet Polygon drawn in edit mode

// Live recording map state
var gpsRecordMap         = null;
var gpsRecordTileLayer   = null;
var gpsRecordPolyline    = null;  // path walked so far
var gpsRecordClosingLine = null;  // dashed line closing the shape back to start
var gpsRecordDot         = null;  // red dot showing current position

// Drop Points mode state
var gpsDropWatchId       = null;  // watchPosition ID for drop-points GPS monitor
var gpsDropPoints        = [];    // accumulated dropped points
var gpsDropCurrentPos    = null;  // most recent GPS position (used when Drop Point is tapped)
var gpsDropMap           = null;
var gpsDropTileLayer     = null;
var gpsDropPolyline      = null;  // lines connecting dropped points
var gpsDropMarkers       = [];    // circle markers at each dropped point

// ---------- Page Entry: loadGpsMapPage ----------

/**
 * Called by app.js when routing to #gpsmap/{zoneId}.
 * Loads the zone and its existing shape (if any), then shows the right mode.
 */
async function loadGpsMapPage(zoneId) {
    gpsCurrentZoneId = zoneId;

    // Load zone name if not already in window.currentZone
    if (!window.currentZone || window.currentZone.id !== zoneId) {
        try {
            var zDoc = await yardCol('zones').doc(zoneId).get();
            if (zDoc.exists) {
                window.currentZone = { id: zDoc.id, ...zDoc.data() };
            }
        } catch (e) {
            console.error('GPS: error loading zone', e);
        }
    }

    var zoneName = window.currentZone ? window.currentZone.name : 'Zone';
    document.getElementById('gpsmapTitle').textContent = zoneName + ' — Map';
    document.getElementById('gpsmapRecordZoneName').textContent = zoneName;

    // Destroy any leftover maps from previous navigation
    destroyMap('view');
    destroyMap('edit');

    // Load existing shape
    gpsCurrentShape = await loadShapeForZone(zoneId);

    if (gpsCurrentShape) {
        showGpsViewMode();
    } else {
        showGpsViewMode(); // View mode still shows Record button when no shape
    }
}

// ---------- Mode Switching ----------

/**
 * Show the view-mode panel (displays existing shape or "no shape yet").
 */
function showGpsViewMode() {
    document.getElementById('gpsmapViewMode').classList.remove('hidden');
    document.getElementById('gpsmapRecordMode').classList.add('hidden');
    document.getElementById('gpsmapEditMode').classList.add('hidden');

    destroyMap('view');
    destroyMap('edit');

    var excludeLabel = document.getElementById('gpsmapExcludeLabel');

    if (gpsCurrentShape) {
        document.getElementById('gpsmapEditBtn').style.display   = 'inline-flex';
        document.getElementById('gpsmapDeleteBtn').style.display = 'inline-flex';
        document.getElementById('gpsmapHouseBtn').style.display  = 'none';
        document.getElementById('gpsmapRecordBtn').textContent   = 'Re-record Shape';

        // Show gross area + perimeter immediately; net area loads async
        var perim = perimeterFt(gpsCurrentShape.points);
        document.getElementById('gpsmapAreaDisplay').innerHTML =
            '<div class="gps-area-gross">' + formatArea(gpsCurrentShape.areaSqft) + '</div>' +
            '<div class="gps-area-perimeter">' + formatPerimeter(perim) + '</div>';
        updateGpsNetDisplay(gpsCurrentZoneId, gpsCurrentShape.areaSqft, perim);

        // Show exclude toggle and reflect the current saved state
        excludeLabel.classList.remove('hidden');
        document.getElementById('gpsmapExcludeToggle').checked = !!gpsCurrentShape.excludeFromParent;

        // Init the view map after a brief delay so the container is visible
        setTimeout(function() { initViewMap(gpsCurrentShape.points, gpsCurrentShape.color); }, 120);
    } else {
        document.getElementById('gpsmapEditBtn').style.display   = 'none';
        document.getElementById('gpsmapDeleteBtn').style.display = 'none';
        document.getElementById('gpsmapHouseBtn').style.display  = 'inline-flex';
        document.getElementById('gpsmapRecordBtn').textContent   = 'Record Shape';
        document.getElementById('gpsmapAreaDisplay').innerHTML   = '';
        excludeLabel.classList.add('hidden');
    }
}

/**
 * Fetch excluded-descendant area and update the area display with gross + net.
 * Called after showGpsViewMode() sets the gross area — updates in place once loaded.
 */
async function updateGpsNetDisplay(zoneId, grossSqft, perimFt) {
    var netSqft = await calculateNetSqft(zoneId, grossSqft);
    var display = document.getElementById('gpsmapAreaDisplay');
    if (!display) return;

    var perimRow = perimFt ? '<div class="gps-area-perimeter">' + formatPerimeter(perimFt) + '</div>' : '';

    if (netSqft < grossSqft) {
        display.innerHTML =
            '<div class="gps-area-gross">Gross: ' + formatArea(grossSqft) + '</div>' +
            '<div class="gps-area-net">Net: '     + formatArea(netSqft)   + '</div>' +
            perimRow;
    } else {
        display.innerHTML =
            '<div class="gps-area-gross">' + formatArea(grossSqft) + '</div>' +
            perimRow;
    }
}

/**
 * Show the recording mode panel (walk perimeter flow).
 */
function showGpsRecordMode() {
    document.getElementById('gpsmapViewMode').classList.add('hidden');
    document.getElementById('gpsmapRecordMode').classList.remove('hidden');
    document.getElementById('gpsmapEditMode').classList.add('hidden');
    showRecordPicker();
}

/**
 * Show the mode-picker screen (Walk the Path / Drop Points).
 */
function showRecordPicker() {
    document.getElementById('gpsmapRecordPicker').classList.remove('hidden');
    document.getElementById('gpsmapWalkScreen').classList.add('hidden');
    document.getElementById('gpsmapDropScreen').classList.add('hidden');
}

/**
 * Enter the Walk-the-Path sub-screen (existing continuous recording flow).
 */
function showWalkScreen() {
    document.getElementById('gpsmapRecordPicker').classList.add('hidden');
    document.getElementById('gpsmapWalkScreen').classList.remove('hidden');

    // Reset UI to pre-start state
    document.getElementById('gpsmapStartBtn').classList.remove('hidden');
    var stopBtn = document.getElementById('gpsmapStopBtn');
    stopBtn.classList.add('hidden');
    stopBtn.textContent = '■ Stop Recording';
    stopBtn.disabled = false;
    document.getElementById('gpsmapRecordStats').classList.add('hidden');
    updateRecordStats(0, 0, null);
}

/**
 * Enter the Drop Points sub-screen.
 */
function showDropScreen() {
    document.getElementById('gpsmapRecordPicker').classList.add('hidden');
    document.getElementById('gpsmapDropScreen').classList.remove('hidden');

    // Reset drop state
    gpsDropPoints      = [];
    gpsDropCurrentPos  = null;
    document.getElementById('gpsmapDropCount').textContent    = '0';
    document.getElementById('gpsmapDropAccuracy').textContent = 'Waiting…';
    document.getElementById('gpsmapDropPointBtn').disabled    = true;
    document.getElementById('gpsmapDropStopBtn').disabled     = true;
    document.getElementById('gpsmapDropMapContainer').classList.add('hidden');

    // Destroy any leftover drop map
    destroyDropMap();

    // Start watching GPS position so accuracy shows live
    if (gpsDropWatchId !== null) {
        navigator.geolocation.clearWatch(gpsDropWatchId);
    }
    gpsDropWatchId = navigator.geolocation.watchPosition(
        handleDropGpsUpdate,
        handleGpsError,
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    );
}

/**
 * Show the point-editor mode panel.
 * @param {Array} points - Array of {lat, lng} to start editing.
 */
function showGpsEditMode(points) {
    document.getElementById('gpsmapViewMode').classList.add('hidden');
    document.getElementById('gpsmapRecordMode').classList.add('hidden');
    document.getElementById('gpsmapEditMode').classList.remove('hidden');

    // Copy points into working state
    gpsEditPoints = points.map(function(p) { return { lat: p.lat, lng: p.lng }; });

    destroyMap('edit');
    setTimeout(function() { initEditMap(gpsEditPoints); }, 120);
}

// ---------- Recording ----------

/**
 * Start GPS watchPosition and begin collecting points.
 */
function startRecording() {
    if (!navigator.geolocation) {
        alert('GPS is not available on this device or browser.');
        return;
    }

    gpsRecordedPoints = [];
    gpsLastPoint      = null;
    destroyRecordMap(); // clear any previous recording map

    document.getElementById('gpsmapStartBtn').classList.add('hidden');
    document.getElementById('gpsmapStopBtn').classList.remove('hidden');
    document.getElementById('gpsmapRecordStats').classList.remove('hidden');

    gpsWatchId = navigator.geolocation.watchPosition(
        handleGpsPosition,
        handleGpsError,
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    );
}

/**
 * Stop GPS recording and move to the point editor.
 */
function stopRecording() {
    if (gpsWatchId !== null) {
        navigator.geolocation.clearWatch(gpsWatchId);
        gpsWatchId = null;
    }

    // Give immediate visual feedback that recording has stopped
    var stopBtn = document.getElementById('gpsmapStopBtn');
    stopBtn.textContent = '⏹ Recording Stopped';
    stopBtn.disabled = true;

    if (gpsRecordedPoints.length < 3) {
        alert('Not enough points recorded (need at least 3 to form a shape). Try walking a larger area.');
        showGpsRecordMode();
        return;
    }

    // Tear down the live recording map before opening the editor
    destroyRecordMap();

    // Move directly to the point editor for cleanup
    showGpsEditMode(gpsRecordedPoints);
}

// ---------- Drop Points Mode ----------

/**
 * Called continuously by watchPosition in drop-points mode.
 * Updates the accuracy display and stores the current position for use
 * when the user taps "Drop Point".
 */
function handleDropGpsUpdate(position) {
    var accuracy = position.coords.accuracy;
    gpsDropCurrentPos = { lat: position.coords.latitude, lng: position.coords.longitude };

    var accEl = document.getElementById('gpsmapDropAccuracy');
    accEl.textContent = Math.round(accuracy) + ' m';
    // Color-code accuracy: green < 5m, yellow < 15m, red >= 15m
    accEl.style.color = accuracy < 5 ? '#2E7D32' : accuracy < 15 ? '#E65100' : '#C62828';

    // Enable Drop Point button once we have a GPS fix
    document.getElementById('gpsmapDropPointBtn').disabled = false;
}

/**
 * Drop a point at the current GPS location.
 */
function dropPoint() {
    if (!gpsDropCurrentPos) {
        alert('No GPS fix yet — wait for accuracy to appear.');
        return;
    }

    gpsDropPoints.push({ lat: gpsDropCurrentPos.lat, lng: gpsDropCurrentPos.lng });

    var count = gpsDropPoints.length;
    document.getElementById('gpsmapDropCount').textContent = count;

    // Enable the Finish button once we have at least 3 points
    if (count >= 3) {
        document.getElementById('gpsmapDropStopBtn').disabled = false;
    }

    // Show/update the live map
    updateDropMap(gpsDropPoints);
}

/**
 * Create or update the drop-points live map.
 */
function updateDropMap(points) {
    var mapEl = document.getElementById('gpsmapDropMapContainer');

    if (!gpsDropMap) {
        mapEl.classList.remove('hidden');
        gpsDropMap       = L.map('gpsmapDropMapContainer');
        gpsDropTileLayer = L.tileLayer(TILE_URL, { attribution: TILE_ATTR }).addTo(gpsDropMap);
        addPropertyBoundaryOverlay(gpsDropMap);
    }

    // Remove old markers and polyline
    gpsDropMarkers.forEach(function(m) { gpsDropMap.removeLayer(m); });
    gpsDropMarkers = [];
    if (gpsDropPolyline) { gpsDropMap.removeLayer(gpsDropPolyline); gpsDropPolyline = null; }

    // Draw each dropped point as a numbered circle
    points.forEach(function(pt, i) {
        var icon = L.divIcon({
            className:  '',
            html:       '<div class="gps-drop-marker">' + (i + 1) + '</div>',
            iconSize:   [24, 24],
            iconAnchor: [12, 12]
        });
        var m = L.marker([pt.lat, pt.lng], { icon: icon }).addTo(gpsDropMap);
        gpsDropMarkers.push(m);
    });

    // Draw connecting lines (open polyline so user can see the shape forming)
    if (points.length >= 2) {
        var latLngs = points.map(function(p) { return [p.lat, p.lng]; });
        // Close the line back to point 1 if >= 3 points
        if (points.length >= 3) latLngs.push([points[0].lat, points[0].lng]);
        gpsDropPolyline = L.polyline(latLngs, { color: '#1565C0', weight: 2, dashArray: '6 4' }).addTo(gpsDropMap);
    }

    // Fit map to show all points
    var lls = points.map(function(p) { return [p.lat, p.lng]; });
    if (lls.length === 1) {
        gpsDropMap.setView(lls[0], 19);
    } else {
        gpsDropMap.fitBounds(L.latLngBounds(lls), { padding: [30, 30] });
    }
}

/**
 * Finish drop-points recording and move to the editor.
 */
function finishDropPoints() {
    if (gpsDropWatchId !== null) {
        navigator.geolocation.clearWatch(gpsDropWatchId);
        gpsDropWatchId = null;
    }

    var stopBtn = document.getElementById('gpsmapDropStopBtn');
    stopBtn.textContent = '⏹ Done';
    stopBtn.disabled    = true;

    if (gpsDropPoints.length < 3) {
        alert('Need at least 3 points to form a shape.');
        showDropScreen();
        return;
    }

    destroyDropMap();
    showGpsEditMode(gpsDropPoints);
}

/**
 * Destroy the drop-points map and clean up state.
 */
function destroyDropMap() {
    if (gpsDropMap) {
        gpsDropMarkers.forEach(function(m) { gpsDropMap.removeLayer(m); });
        gpsDropMarkers = [];
        if (gpsDropPolyline) { gpsDropMap.removeLayer(gpsDropPolyline); gpsDropPolyline = null; }
        gpsDropMap.remove();
        gpsDropMap       = null;
        gpsDropTileLayer = null;
    }
}

/**
 * Called by watchPosition for each new GPS reading.
 * Applies accuracy and jump filters before accepting the point.
 */
function handleGpsPosition(position) {
    var lat      = position.coords.latitude;
    var lng      = position.coords.longitude;
    var accuracy = position.coords.accuracy; // meters

    // Update stats display regardless of whether point is accepted
    updateRecordStats(gpsRecordedPoints.length, totalDistanceFt(gpsRecordedPoints), accuracy);

    // Filter 1: reject if GPS accuracy is too poor
    if (accuracy > 20) { return; }

    var newPoint = { lat: lat, lng: lng };

    if (gpsLastPoint !== null) {
        var dist = haversineDistance(gpsLastPoint, newPoint);

        // Filter 2: reject GPS jumps (> 15m since last accepted point)
        if (dist > 15) { return; }

        // Filter 3: skip duplicate/stationary readings (< 1m movement)
        if (dist < 1) { return; }
    }

    gpsRecordedPoints.push(newPoint);
    gpsLastPoint = newPoint;
    updateRecordStats(gpsRecordedPoints.length, totalDistanceFt(gpsRecordedPoints), accuracy);
    updateRecordMap(gpsRecordedPoints);
}

function handleGpsError(error) {
    // Transient errors are normal — log but don't stop recording
    console.warn('GPS position error:', error.message);
}

// ---------- Live Recording Map ----------

/**
 * Called after each accepted GPS point to update the live map.
 * On the first point, initializes the Leaflet map and shows the container.
 * On subsequent points, updates the polyline and pans to follow.
 */
function updateRecordMap(points) {
    var container = document.getElementById('gpsmapRecordMapContainer');
    var last = points[points.length - 1];

    if (points.length === 1) {
        // First point — initialize the map centered here
        container.classList.remove('hidden');

        gpsRecordMap       = L.map('gpsmapRecordMapContainer').setView([last.lat, last.lng], 19);
        gpsRecordTileLayer = L.tileLayer(TILE_URL, { attribution: TILE_ATTR }).addTo(gpsRecordMap);

        // Blue polyline for the path walked
        gpsRecordPolyline = L.polyline([[last.lat, last.lng]], {
            color:  '#1565C0',
            weight: 4
        }).addTo(gpsRecordMap);

        // Red dot for current position
        gpsRecordDot = L.circleMarker([last.lat, last.lng], {
            radius:      9,
            color:       '#fff',
            weight:      2,
            fillColor:   '#C62828',
            fillOpacity: 1
        }).addTo(gpsRecordMap);

        addPropertyBoundaryOverlay(gpsRecordMap);

    } else if (gpsRecordPolyline) {
        // Update path and move the current-position dot
        var latLngs = points.map(function(p) { return [p.lat, p.lng]; });
        gpsRecordPolyline.setLatLngs(latLngs);
        gpsRecordDot.setLatLng([last.lat, last.lng]);

        // Pan smoothly to keep the dot in view
        gpsRecordMap.panTo([last.lat, last.lng]);

        // Once we have 3+ points draw a dashed closing line back to the start
        if (points.length >= 3) {
            var first = points[0];
            if (gpsRecordClosingLine) {
                gpsRecordClosingLine.setLatLngs([[last.lat, last.lng], [first.lat, first.lng]]);
            } else {
                gpsRecordClosingLine = L.polyline([[last.lat, last.lng], [first.lat, first.lng]], {
                    color:     '#888',
                    weight:    2,
                    dashArray: '6 5'
                }).addTo(gpsRecordMap);
            }
        }
    }
}

/**
 * Tear down the live recording map and hide the container.
 */
function destroyRecordMap() {
    if (gpsRecordMap) {
        gpsRecordMap.remove();
        gpsRecordMap         = null;
        gpsRecordTileLayer   = null;
        gpsRecordPolyline    = null;
        gpsRecordClosingLine = null;
        gpsRecordDot         = null;
    }
    var container = document.getElementById('gpsmapRecordMapContainer');
    if (container) container.classList.add('hidden');
}

/**
 * Update the live stats display during recording.
 */
function updateRecordStats(pointCount, distanceFt, accuracy) {
    document.getElementById('gpsmapPointCount').textContent = pointCount;
    document.getElementById('gpsmapDistance').textContent   = Math.round(distanceFt) + ' ft';
    document.getElementById('gpsmapAccuracy').textContent   = accuracy ? Math.round(accuracy) + ' m' : '—';
}

// ---------- Property Boundary Overlay ----------

/**
 * Fetch the property boundary from Firestore and draw it as a dashed outline
 * on the given Leaflet map instance. Fire-and-forget (async, non-blocking).
 */
async function addPropertyBoundaryOverlay(mapInstance) {
    if (!mapInstance) return null;
    try {
        var snap = await yardCol('gpsShapes')
            .where('zoneId', '==', '__property__')
            .limit(1)
            .get();
        if (snap.empty) return null;
        var pts = snap.docs[0].data().points;
        if (!pts || pts.length < 3) return null;
        var latLngs = pts.map(function(p) { return [p.lat, p.lng]; });
        var layer = L.polygon(latLngs, {
            color:       '#000000',
            fillColor:   '#000000',
            fillOpacity: 0.04,
            weight:      2,
            dashArray:   '8, 6'
        }).addTo(mapInstance).bindTooltip('Property Boundary', { sticky: true });
        return layer;
    } catch (e) {
        return null;
    }
}

// ---------- View Map ----------

function initViewMap(points, color) {
    var latLngs = points.map(function(p) { return [p.lat, p.lng]; });
    gpsViewMap       = L.map('gpsmapViewMapContainer');
    gpsViewTileLayer = L.tileLayer(TILE_URL, { attribution: TILE_ATTR }).addTo(gpsViewMap);

    var poly = L.polygon(latLngs, {
        color:       color || GPS_COLORS[0],
        fillColor:   color || GPS_COLORS[0],
        fillOpacity: 0.35,
        weight:      3
    }).addTo(gpsViewMap);

    gpsViewMap.fitBounds(poly.getBounds(), { padding: [20, 20] });
    addPropertyBoundaryOverlay(gpsViewMap);
}

// ---------- Edit Map ----------

function initEditMap(points) {
    var latLngs = points.map(function(p) { return [p.lat, p.lng]; });
    gpsEditMap       = L.map('gpsmapEditMapContainer');
    gpsEditTileLayer = L.tileLayer(TILE_URL, { attribution: TILE_ATTR }).addTo(gpsEditMap);

    gpsEditPolygon = L.polygon(latLngs, {
        color:       '#333',
        fillColor:   '#4CAF50',
        fillOpacity: 0.15,
        weight:      2,
        dashArray:   '6 4'
    }).addTo(gpsEditMap);

    gpsEditMap.fitBounds(gpsEditPolygon.getBounds(), { padding: [30, 30] });

    // Click on a polygon edge to see that segment's length
    gpsEditPolygon.on('click', handlePolygonEdgeClick);

    rebuildEditMarkers();
    showEditorInfo('Tap a vertex handle to select. Drag to move. Tap Auto-Simplify to clean up extra points.');

    // Load boundary overlay and store reference so toggle button can show/hide it
    gpsEditBoundaryLayer = null;
    addPropertyBoundaryOverlay(gpsEditMap).then(function(layer) {
        gpsEditBoundaryLayer = layer;
        // Sync toggle button state — starts as "shown"
        var btn = document.getElementById('gpsmapToggleBoundaryEditBtn');
        if (btn) btn.textContent = '🏠 Hide Property Line';
    });
}

/**
 * Rebuild draggable vertex markers after any point change.
 */
function rebuildEditMarkers() {
    // Remove old markers
    gpsEditMarkers.forEach(function(m) { gpsEditMap.removeLayer(m); });
    gpsEditMarkers = [];

    // Custom small square icon for vertex handles
    var markerIcon = L.divIcon({
        className: 'gps-edit-marker',
        iconSize:  [14, 14],
        iconAnchor: [7, 7]
    });

    gpsEditPoints.forEach(function(pt, index) {
        var marker = L.marker([pt.lat, pt.lng], {
            draggable:    true,
            icon:         markerIcon,
            zIndexOffset: 1000
        }).addTo(gpsEditMap);

        // While dragging: update polygon and adjacent segment lengths live
        marker.on('drag', function(e) {
            var ll = e.target.getLatLng();
            gpsEditPoints[index] = { lat: ll.lat, lng: ll.lng };
            updateEditPolygon();

            // Show live adjacent segment lengths
            var n    = gpsEditPoints.length;
            var prev = (index - 1 + n) % n;
            var next = (index + 1) % n;
            var d1   = Math.round(haversineDistance(gpsEditPoints[prev], gpsEditPoints[index]) * 3.28084);
            var d2   = Math.round(haversineDistance(gpsEditPoints[index], gpsEditPoints[next]) * 3.28084);
            showEditorInfo('← ' + d1 + ' ft  |  ' + d2 + ' ft →');
        });

        // Click: popup with delete button and adjacent segment lengths
        marker.on('click', function() {
            var n    = gpsEditPoints.length;
            var prev = (index - 1 + n) % n;
            var next = (index + 1) % n;
            var d1   = Math.round(haversineDistance(gpsEditPoints[prev], gpsEditPoints[index]) * 3.28084);
            var d2   = Math.round(haversineDistance(gpsEditPoints[index], gpsEditPoints[next]) * 3.28084);

            var content = '<div class="gps-point-popup">' +
                '<div class="gps-popup-lengths">← ' + d1 + ' ft &nbsp;|&nbsp; ' + d2 + ' ft →</div>' +
                '<button class="btn btn-danger btn-small" onclick="deleteEditPoint(' + index + ')">Delete Point</button>' +
                '</div>';

            marker.bindPopup(content, { closeButton: false, offset: L.point(0, -10) }).openPopup();
        });

        gpsEditMarkers.push(marker);
    });
}

/**
 * Delete a vertex by index. Minimum 3 points required.
 * Called from inline onclick in Leaflet popup HTML.
 */
function deleteEditPoint(index) {
    if (gpsEditPoints.length <= 3) {
        alert('Cannot delete — a shape needs at least 3 points.');
        return;
    }
    gpsEditPoints.splice(index, 1);
    updateEditPolygon();
    rebuildEditMarkers();
    showEditorInfo('Point deleted. ' + gpsEditPoints.length + ' points remaining.');
}

/**
 * Click on the polygon to show the nearest segment length.
 */
function handlePolygonEdgeClick(e) {
    var n       = gpsEditPoints.length;
    var bestIdx = 0;
    var bestD   = Infinity;

    // Find segment whose midpoint is closest to the click
    for (var i = 0; i < n; i++) {
        var j   = (i + 1) % n;
        var mid = {
            lat: (gpsEditPoints[i].lat + gpsEditPoints[j].lat) / 2,
            lng: (gpsEditPoints[i].lng + gpsEditPoints[j].lng) / 2
        };
        var d = haversineDistance(e.latlng, mid);
        if (d < bestD) { bestD = d; bestIdx = i; }
    }

    var j    = (bestIdx + 1) % n;
    var dist = Math.round(haversineDistance(gpsEditPoints[bestIdx], gpsEditPoints[j]) * 3.28084);
    showEditorInfo('Side length: ' + dist + ' ft  (' + Math.round(dist / 3.281) + ' m)');
}

/**
 * Sync the Leaflet polygon to the current gpsEditPoints array.
 */
function updateEditPolygon() {
    if (gpsEditPolygon) {
        gpsEditPolygon.setLatLngs(gpsEditPoints.map(function(p) { return [p.lat, p.lng]; }));
    }
}

function showEditorInfo(msg) {
    document.getElementById('gpsmapEditorInfo').textContent = msg;
}

// ---------- Auto-Simplify ----------

/**
 * Run Ramer-Douglas-Peucker (built into Leaflet) to remove redundant
 * middle points while preserving the overall shape.
 */
function simplifyEditPoints() {
    if (gpsEditPoints.length < 4) {
        showEditorInfo('Not enough points to simplify (need at least 4).');
        return;
    }

    var before     = gpsEditPoints.length;
    var tolerance  = 0.000045; // ~5 meters in degrees

    // L.LineUtil.simplify expects {x, y} objects
    var pts        = gpsEditPoints.map(function(p) { return { x: p.lng, y: p.lat }; });
    var simplified = L.LineUtil.simplify(pts, tolerance);
    gpsEditPoints  = simplified.map(function(p) { return { lat: p.y, lng: p.x }; });

    // Need at least 3 points
    if (gpsEditPoints.length < 3) {
        gpsEditPoints = pts.slice(0, 3).map(function(p) { return { lat: p.y, lng: p.x }; });
    }

    updateEditPolygon();
    rebuildEditMarkers();
    showEditorInfo('Simplified: ' + before + ' → ' + gpsEditPoints.length + ' points.');
}

// ---------- Save Shape ----------

/**
 * Save the edited points to Firestore (create or update).
 */
async function saveGpsShape() {
    if (gpsEditPoints.length < 3) {
        alert('Need at least 3 points to save a shape.');
        return;
    }

    var saveBtn = document.getElementById('gpsmapSaveEditBtn');
    saveBtn.disabled    = true;
    saveBtn.textContent = 'Saving...';

    try {
        var areaSqft = calculateAreaSqft(gpsEditPoints);
        var color    = gpsCurrentShape ? gpsCurrentShape.color : assignColor(gpsCurrentZoneId);

        var shapeData = {
            zoneId:            gpsCurrentZoneId,
            name:              window.currentZone ? window.currentZone.name : 'Zone Shape',
            points:            gpsEditPoints,
            areaSqft:          areaSqft,
            color:             color,
            excludeFromParent: gpsCurrentShape ? (gpsCurrentShape.excludeFromParent || false) : false,
            updatedAt:         firebase.firestore.FieldValue.serverTimestamp()
        };

        if (gpsCurrentShape) {
            await yardCol('gpsShapes').doc(gpsCurrentShape.id).update(shapeData);
            gpsCurrentShape = { id: gpsCurrentShape.id, ...shapeData };
        } else {
            shapeData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            var ref = await yardCol('gpsShapes').add(shapeData);
            gpsCurrentShape = { id: ref.id, ...shapeData };
        }

        saveBtn.disabled    = false;
        saveBtn.textContent = 'Save Shape';
        destroyMap('edit');
        showGpsViewMode();

    } catch (err) {
        console.error('Error saving GPS shape:', err);
        alert('Error saving shape — check console.');
        saveBtn.disabled    = false;
        saveBtn.textContent = 'Save Shape';
    }
}

// ---------- Delete Shape ----------

async function deleteGpsShape() {
    if (!gpsCurrentShape) return;
    if (!confirm('Delete this shape? This cannot be undone.')) return;

    try {
        await yardCol('gpsShapes').doc(gpsCurrentShape.id).delete();
        gpsCurrentShape = null;
        destroyMap('view');
        showGpsViewMode();
    } catch (err) {
        console.error('Error deleting shape:', err);
        alert('Error deleting shape.');
    }
}

// ---------- Net Sq Ft: Excluded Descendants ----------

/**
 * Return all descendant zone IDs (up to 3 levels) for the given zoneId.
 * Walks level1 children, then level2 children of each — max depth Bishop supports.
 */
async function getDescendantZoneIds(zoneId) {
    var ids    = [];
    var level1 = await yardCol('zones').where('parentId', '==', zoneId).get();
    var level1Ids = [];
    level1.forEach(function(doc) {
        level1Ids.push(doc.id);
        ids.push(doc.id);
    });
    for (var i = 0; i < level1Ids.length; i++) {
        var level2 = await yardCol('zones').where('parentId', '==', level1Ids[i]).get();
        level2.forEach(function(doc) { ids.push(doc.id); });
    }
    return ids;
}

/**
 * Calculate net square footage by subtracting any excluded descendant shapes.
 * Returns grossSqft unchanged if there are no excluded descendants.
 */
async function calculateNetSqft(zoneId, grossSqft) {
    try {
        var descendantIds = await getDescendantZoneIds(zoneId);
        if (descendantIds.length === 0) return grossSqft;

        var snap = await yardCol('gpsShapes')
            .where('zoneId', 'in', descendantIds)
            .where('excludeFromParent', '==', true)
            .get();

        var excludedArea = 0;
        snap.forEach(function(doc) { excludedArea += doc.data().areaSqft || 0; });

        return Math.max(0, grossSqft - excludedArea);
    } catch (err) {
        console.error('GPS: error calculating net sqft:', err);
        return grossSqft;
    }
}

// ---------- Firestore: Load Shape ----------

async function loadShapeForZone(zoneId) {
    try {
        var snap = await yardCol('gpsShapes')
            .where('zoneId', '==', zoneId)
            .limit(1)
            .get();
        if (snap.empty) return null;
        var d = snap.docs[0];
        return { id: d.id, ...d.data() };
    } catch (err) {
        console.error('Error loading GPS shape:', err);
        return null;
    }
}

// ---------- Zone Detail GPS Section ----------

/**
 * Called from zones.js after loading a zone detail page.
 * Shows a small area badge if a shape exists, or "no shape" message.
 */
async function loadGpsSection(zoneId) {
    var preview    = document.getElementById('zoneGpsPreview');
    var emptyState = document.getElementById('zoneGpsEmptyState');

    preview.innerHTML    = '';
    emptyState.style.display = 'none';

    try {
        var shape = await loadShapeForZone(zoneId);

        if (shape) {
            var grossSqft = shape.areaSqft || 0;
            var netSqft   = await calculateNetSqft(zoneId, grossSqft);
            var perim     = perimeterFt(shape.points);

            var areaText = netSqft < grossSqft
                ? 'Gross: ' + formatArea(grossSqft) + ' · Net: ' + formatArea(netSqft)
                : formatArea(grossSqft);

            var badge      = document.createElement('div');
            badge.className = 'gps-zone-preview';
            badge.innerHTML = '<span class="gps-color-dot" style="background:' + shape.color + '"></span>' +
                              '<span class="gps-area-badge">📐 ' + areaText +
                              (perim > 0 ? ' · 📏 ' + formatPerimeter(perim) : '') + '</span>';
            preview.appendChild(badge);
        } else {
            emptyState.textContent   = 'No shape recorded yet. Tap 📍 Map to record one.';
            emptyState.style.display = 'block';
        }
    } catch (err) {
        console.error('Error loading GPS section:', err);
    }
}

// ---------- Map Background Toggle ----------

/**
 * Toggle the OpenStreetMap tile layer on/off for any map instance.
 * @param {L.Map} mapInstance
 * @param {L.TileLayer} tileLayer
 * @param {string} btnId - ID of the toggle button to update text
 */
function toggleMapBg(mapInstance, tileLayer, btnId) {
    var btn = document.getElementById(btnId);
    if (!mapInstance || !tileLayer) return;

    if (mapInstance.hasLayer(tileLayer)) {
        mapInstance.removeLayer(tileLayer);
        if (btn) btn.textContent = 'Show Map';
    } else {
        tileLayer.addTo(mapInstance);
        if (btn) btn.textContent = 'Hide Map';
    }
}

// ---------- Yard Map Page ----------

/**
 * Loads ALL gpsShapes from Firestore and displays them layered on one map.
 * Called by app.js when routing to #yardmap.
 */
async function loadYardMapPage() {
    var togglesEl  = document.getElementById('yardmapShapeToggles');
    var emptyState = document.getElementById('yardmapEmptyState');

    togglesEl.innerHTML      = '';
    emptyState.style.display = 'none';

    destroyMap('yard');
    updateImportBoundaryBtn();

    try {
        var snap = await yardCol('gpsShapes').get();

        // Separate property boundary from zone shapes
        var propertyBoundary = null;
        var shapes = [];
        snap.forEach(function(doc) {
            var d = { id: doc.id, ...doc.data() };
            if (d.zoneId === '__property__') { propertyBoundary = d; }
            else                             { shapes.push(d); }
        });

        if (!propertyBoundary && shapes.length === 0) {
            emptyState.textContent   = 'No shapes recorded yet. Open a zone and tap 📍 Map to record its boundary.';
            emptyState.style.display = 'block';
            return;
        }

        // Initialize the Leaflet map
        setTimeout(function() {
            gpsYardMap       = L.map('yardmapContainer');
            gpsYardTileLayer = L.tileLayer(TILE_URL, { attribution: TILE_ATTR }).addTo(gpsYardMap);

            var allBounds    = null;
            var shapePolys   = {};  // shapeId → L.Polygon, for toggle control

            // Draw property boundary first (so it renders underneath zone shapes)
            if (propertyBoundary && propertyBoundary.points && propertyBoundary.points.length >= 3) {
                var boundaryLatLngs = propertyBoundary.points.map(function(p) { return [p.lat, p.lng]; });
                var boundaryPoly    = L.polygon(boundaryLatLngs, {
                    color:       '#000000',
                    fillColor:   '#000000',
                    fillOpacity: 0.05,
                    weight:      2,
                    dashArray:   '8, 6'
                }).addTo(gpsYardMap);

                boundaryPoly.bindTooltip('Property Boundary', {
                    permanent:  false,
                    direction:  'center',
                    className:  'gps-shape-label'
                });

                shapePolys[propertyBoundary.id] = boundaryPoly;
                var bBounds = boundaryPoly.getBounds();
                allBounds   = allBounds ? allBounds.extend(bBounds) : bBounds;

                // Toggle row for property boundary
                var bRow = document.createElement('label');
                bRow.className = 'gps-shape-toggle-row gps-shape-toggle-boundary';
                bRow.innerHTML =
                    '<input type="checkbox" checked data-sid="' + propertyBoundary.id + '">' +
                    '<span class="gps-color-swatch gps-color-swatch--boundary"></span>' +
                    '<span class="gps-toggle-name">Property Boundary</span>' +
                    '<span class="gps-toggle-area">' + formatArea(propertyBoundary.areaSqft) + '</span>';
                bRow.querySelector('input').addEventListener('change', function(e) {
                    var p = shapePolys[e.target.dataset.sid];
                    if (e.target.checked) { p.addTo(gpsYardMap); }
                    else                  { gpsYardMap.removeLayer(p); }
                });
                togglesEl.appendChild(bRow);
            }

            shapes.forEach(function(shape) {
                if (!shape.points || shape.points.length < 3) return;

                var latLngs = shape.points.map(function(p) { return [p.lat, p.lng]; });
                var poly    = L.polygon(latLngs, {
                    color:       shape.color || GPS_COLORS[0],
                    fillColor:   shape.color || GPS_COLORS[0],
                    fillOpacity: 0.35,
                    weight:      3
                }).addTo(gpsYardMap);

                poly.bindTooltip(shape.name, {
                    permanent:  true,
                    direction:  'center',
                    className:  'gps-shape-label'
                });

                shapePolys[shape.id] = poly;
                var bounds           = poly.getBounds();
                allBounds            = allBounds ? allBounds.extend(bounds) : bounds;

                // Build toggle row
                var row = document.createElement('label');
                row.className = 'gps-shape-toggle-row';
                var shapePerim = perimeterFt(shape.points);
                row.innerHTML =
                    '<input type="checkbox" checked data-sid="' + shape.id + '">' +
                    '<span class="gps-color-swatch" style="background:' + shape.color + '"></span>' +
                    '<span class="gps-toggle-name">' + shape.name + '</span>' +
                    '<span class="gps-toggle-area">' + formatArea(shape.areaSqft) +
                    (shapePerim > 0 ? '<br><small>' + formatPerimeter(shapePerim) + '</small>' : '') + '</span>';

                row.querySelector('input').addEventListener('change', function(e) {
                    var p = shapePolys[e.target.dataset.sid];
                    if (e.target.checked) { p.addTo(gpsYardMap); }
                    else                  { gpsYardMap.removeLayer(p); }
                });

                togglesEl.appendChild(row);
            });

            if (allBounds) {
                gpsYardMap.fitBounds(allBounds, { padding: [20, 20] });
            }
        }, 120);

    } catch (err) {
        console.error('Error loading yard map:', err);
        emptyState.textContent   = 'Error loading shapes.';
        emptyState.style.display = 'block';
    }
}

// ---------- Map Destroy Helpers ----------

function destroyMap(which) {
    if (which === 'view' && gpsViewMap) {
        gpsViewMap.remove();
        gpsViewMap       = null;
        gpsViewTileLayer = null;
    }
    if (which === 'edit' && gpsEditMap) {
        gpsEditMap.remove();
        gpsEditMap       = null;
        gpsEditTileLayer = null;
        gpsEditPolygon   = null;
        gpsEditMarkers   = [];
    }
    if (which === 'yard' && gpsYardMap) {
        gpsYardMap.remove();
        gpsYardMap       = null;
        gpsYardTileLayer = null;
    }
}

// ---------- Math Utilities ----------

/**
 * Haversine formula — straight-line distance between two lat/lng points.
 * Returns distance in METERS.
 */
function haversineDistance(p1, p2) {
    var R    = 6371000; // Earth radius, meters
    var dLat = (p2.lat - p1.lat) * Math.PI / 180;
    var dLng = (p2.lng - p1.lng) * Math.PI / 180;
    var lat1 = p1.lat * Math.PI / 180;
    var lat2 = p2.lat * Math.PI / 180;
    var a    = Math.sin(dLat/2) * Math.sin(dLat/2) +
               Math.cos(lat1)   * Math.cos(lat2) *
               Math.sin(dLng/2) * Math.sin(dLng/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Sum of all segment distances in a recorded point array.
 * Returns total perimeter in FEET.
 */
function totalDistanceFt(points) {
    var total = 0;
    for (var i = 1; i < points.length; i++) {
        total += haversineDistance(points[i - 1], points[i]);
    }
    return total * 3.28084; // meters → feet
}

/**
 * Shoelace formula for polygon area, corrected for lat/lng curvature.
 * Returns area in SQUARE FEET.
 */
function calculateAreaSqft(points) {
    if (points.length < 3) return 0;

    var latRef  = points[0].lat;
    var lngRef  = points[0].lng;
    var R       = 6371000;
    var latRad  = latRef * Math.PI / 180;
    var mPerDeg = R * Math.PI / 180;

    // Project lat/lng to approximate x/y in meters relative to first point
    var xy = points.map(function(p) {
        return {
            x: (p.lng - lngRef) * Math.cos(latRad) * mPerDeg,
            y: (p.lat - latRef) * mPerDeg
        };
    });

    // Shoelace
    var area = 0;
    var n    = xy.length;
    for (var i = 0; i < n; i++) {
        var j = (i + 1) % n;
        area += xy[i].x * xy[j].y;
        area -= xy[j].x * xy[i].y;
    }
    area = Math.abs(area) / 2; // square meters

    return area * 10.7639; // m² → ft²
}

/**
 * Calculate the perimeter of a closed polygon in feet.
 * Sums all sides including the closing segment back to the first point.
 */
function perimeterFt(points) {
    if (!points || points.length < 2) return 0;
    var total = 0;
    for (var i = 0; i < points.length; i++) {
        var next = (i + 1) % points.length;
        total += haversineDistance(points[i], points[next]);
    }
    return total * 3.28084; // meters → feet
}

/**
 * Format a perimeter in feet for display.
 */
function formatPerimeter(feet) {
    if (!feet || feet <= 0) return '';
    return Math.round(feet).toLocaleString() + ' ft perimeter';
}

/**
 * Format square footage for display, adding acreage for large areas.
 */
function formatArea(sqft) {
    if (!sqft || sqft <= 0) return '';
    var result = Math.round(sqft).toLocaleString() + ' sq ft';
    if (sqft >= 43560) {
        result += ' (' + (sqft / 43560).toFixed(2) + ' acres)';
    }
    return result;
}

/**
 * Assign a consistent color from the palette based on the zone ID string.
 * Same zone always gets the same color.
 */
function assignColor(zoneId) {
    var hash = 0;
    for (var i = 0; i < zoneId.length; i++) {
        hash = ((hash * 31) + zoneId.charCodeAt(i)) | 0;
    }
    return GPS_COLORS[Math.abs(hash) % GPS_COLORS.length];
}

// ---------- Ruler Tool ----------

var gpsRulerActive   = false;  // is ruler mode on?
var gpsRulerPointA   = null;   // first click lat/lng
var gpsRulerLine     = null;   // Leaflet polyline between A and B
var gpsRulerMarkerA  = null;
var gpsRulerMarkerB  = null;
var gpsRulerMapRef   = null;   // which map the ruler is currently on
var gpsRulerStatusId = null;   // element ID for the status bar

/**
 * Toggle ruler mode on a given Leaflet map.
 * @param {L.Map} mapInstance
 * @param {string} btnId       - the toggle button element ID
 * @param {string} statusElId  - element ID to show the measurement result
 */
function toggleRuler(mapInstance, btnId, statusElId) {
    var btn    = document.getElementById(btnId);
    var status = document.getElementById(statusElId);

    if (gpsRulerActive && gpsRulerMapRef === mapInstance) {
        // Turn off
        clearRuler();
        btn.textContent = '📏 Ruler';
        btn.classList.remove('btn-active');
        status.textContent = '';
        status.classList.add('hidden');
        return;
    }

    // Clear any ruler on a different map first
    clearRuler();

    gpsRulerActive   = true;
    gpsRulerMapRef   = mapInstance;
    gpsRulerStatusId = statusElId;

    btn.textContent = '📏 Ruler ON';
    btn.classList.add('btn-active');
    status.textContent = 'Tap point A on the map';
    status.classList.remove('hidden');

    mapInstance.on('click', handleRulerClick);
    mapInstance.getContainer().style.cursor = 'crosshair';
}

function handleRulerClick(e) {
    if (!gpsRulerActive) return;
    var status = document.getElementById(gpsRulerStatusId);

    if (!gpsRulerPointA) {
        // First click — place point A
        gpsRulerPointA = e.latlng;
        gpsRulerMarkerA = L.circleMarker(e.latlng, {
            radius: 6, color: '#C62828', fillColor: '#C62828', fillOpacity: 1, weight: 2
        }).addTo(gpsRulerMapRef);
        status.textContent = 'Point A set — now tap point B';
    } else {
        // Second click — place point B, show distance
        var ptA = { lat: gpsRulerPointA.lat, lng: gpsRulerPointA.lng };
        var ptB = { lat: e.latlng.lat,       lng: e.latlng.lng };
        var meters = haversineDistance(ptA, ptB);
        var feet   = meters * 3.28084;

        gpsRulerMarkerB = L.circleMarker(e.latlng, {
            radius: 6, color: '#1565C0', fillColor: '#1565C0', fillOpacity: 1, weight: 2
        }).addTo(gpsRulerMapRef);

        if (gpsRulerLine) gpsRulerMapRef.removeLayer(gpsRulerLine);
        gpsRulerLine = L.polyline([gpsRulerPointA, e.latlng], {
            color: '#333', weight: 2, dashArray: '5 4'
        }).addTo(gpsRulerMapRef);

        var label = Math.round(feet) + ' ft  (' + meters.toFixed(1) + ' m)';
        status.textContent = '📏 Distance: ' + label;

        // Reset for a new measurement from B
        if (gpsRulerMarkerA) gpsRulerMapRef.removeLayer(gpsRulerMarkerA);
        gpsRulerPointA  = e.latlng;
        gpsRulerMarkerA = gpsRulerMarkerB;
        gpsRulerMarkerB = null;
    }
}

function clearRuler() {
    if (gpsRulerMapRef) {
        gpsRulerMapRef.off('click', handleRulerClick);
        gpsRulerMapRef.getContainer().style.cursor = '';
    }
    if (gpsRulerLine    && gpsRulerMapRef) gpsRulerMapRef.removeLayer(gpsRulerLine);
    if (gpsRulerMarkerA && gpsRulerMapRef) gpsRulerMapRef.removeLayer(gpsRulerMarkerA);
    if (gpsRulerMarkerB && gpsRulerMapRef) gpsRulerMapRef.removeLayer(gpsRulerMarkerB);
    gpsRulerActive  = false;
    gpsRulerPointA  = null;
    gpsRulerLine    = null;
    gpsRulerMarkerA = null;
    gpsRulerMarkerB = null;
    gpsRulerMapRef  = null;
    gpsRulerStatusId = null;
}

// ---------- Insert Point in Edit Mode ----------

var gpsAddPointMode = false;  // true while waiting for user to tap map to add a point

/**
 * Toggle "add point" mode. In this mode, tapping the map inserts a new vertex
 * at the nearest segment, then exits add-point mode.
 */
function toggleAddPointMode() {
    var btn = document.getElementById('gpsmapAddPointBtn');
    if (gpsAddPointMode) {
        gpsAddPointMode = false;
        gpsEditMap.off('click', handleAddPointClick);
        gpsEditMap.getContainer().style.cursor = '';
        btn.textContent = '+ Add Point';
        btn.classList.remove('btn-active');
        showEditorInfo('Tap a vertex handle to select. Drag to move.');
    } else {
        gpsAddPointMode = true;
        gpsEditMap.on('click', handleAddPointClick);
        gpsEditMap.getContainer().style.cursor = 'crosshair';
        btn.textContent = '+ Adding...';
        btn.classList.add('btn-active');
        showEditorInfo('Tap anywhere on the map to insert a point on the nearest edge.');
    }
}

function handleAddPointClick(e) {
    if (!gpsAddPointMode) return;

    var newPt = { lat: e.latlng.lat, lng: e.latlng.lng };
    var n     = gpsEditPoints.length;

    // Find the segment whose midpoint is closest to the tap
    var bestIdx = 0;
    var bestD   = Infinity;
    for (var i = 0; i < n; i++) {
        var j   = (i + 1) % n;
        var mid = {
            lat: (gpsEditPoints[i].lat + gpsEditPoints[j].lat) / 2,
            lng: (gpsEditPoints[i].lng + gpsEditPoints[j].lng) / 2
        };
        var d = haversineDistance(newPt, mid);
        if (d < bestD) { bestD = d; bestIdx = i; }
    }

    // Insert after bestIdx
    gpsEditPoints.splice(bestIdx + 1, 0, newPt);
    updateEditPolygon();
    rebuildEditMarkers();

    // Exit add-point mode
    gpsAddPointMode = false;
    gpsEditMap.off('click', handleAddPointClick);
    gpsEditMap.getContainer().style.cursor = '';
    var btn = document.getElementById('gpsmapAddPointBtn');
    btn.textContent = '+ Add Point';
    btn.classList.remove('btn-active');
    showEditorInfo('Point added. ' + gpsEditPoints.length + ' points total.');
}

// ---------- House Footprint (Microsoft Building Footprints) ----------

/**
 * Fetch the building footprint for the current zone's location from the
 * Microsoft US Building Footprints dataset via the Overture Maps API.
 * Falls back to a simple lat/lng-based query against the OSM Overpass API.
 *
 * Strategy: Use the zone's existing shape centroid (or the property boundary
 * centroid) to find the nearest building polygon, then offer to create a new
 * shape from it.
 */
async function fetchHouseFootprint() {
    var btn = document.getElementById('gpsmapHouseBtn');
    btn.textContent = 'Fetching...';
    btn.disabled    = true;

    try {
        // Get a reference lat/lng — prefer current shape centroid, else property boundary
        var refLat, refLng;
        if (gpsCurrentShape && gpsCurrentShape.points.length >= 3) {
            var pts = gpsCurrentShape.points;
            refLat = pts.reduce(function(s, p) { return s + p.lat; }, 0) / pts.length;
            refLng = pts.reduce(function(s, p) { return s + p.lng; }, 0) / pts.length;
        } else {
            // Use property boundary centroid
            var snap = await yardCol('gpsShapes').where('zoneId','==','__property__').limit(1).get();
            if (snap.empty) {
                alert('No reference location found. Record a shape or import your property boundary first.');
                return;
            }
            var bPts = snap.docs[0].data().points;
            refLat   = bPts.reduce(function(s, p) { return s + p.lat; }, 0) / bPts.length;
            refLng   = bPts.reduce(function(s, p) { return s + p.lng; }, 0) / bPts.length;
        }

        // Query Overpass API for building polygons near this point (50m radius)
        var delta = 0.0005; // ~55m
        var bbox  = (refLat - delta) + ',' + (refLng - delta) + ',' +
                    (refLat + delta) + ',' + (refLng + delta);
        var query = '[out:json];way["building"](' + bbox + ');out geom;';
        var url   = 'https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(query);

        var resp  = await fetch(url);
        var data  = await resp.json();
        var ways  = (data.elements || []).filter(function(el) {
            return el.type === 'way' && el.geometry && el.geometry.length >= 3;
        });

        if (ways.length === 0) {
            alert('No building found in OpenStreetMap near this location.\n\nTip: You may need to walk the house perimeter if it hasn\'t been mapped in OSM.');
            return;
        }

        // Pick the way whose centroid is closest to refLat/refLng
        var best = ways[0];
        if (ways.length > 1) {
            var bestD = Infinity;
            ways.forEach(function(w) {
                var cLat = w.geometry.reduce(function(s, p) { return s + p.lat; }, 0) / w.geometry.length;
                var cLng = w.geometry.reduce(function(s, p) { return s + p.lon; }, 0) / w.geometry.length;
                var d    = haversineDistance({ lat: refLat, lng: refLng }, { lat: cLat, lng: cLng });
                if (d < bestD) { bestD = d; best = w; }
            });
        }

        // Convert to {lat, lng} array (drop duplicate closing point)
        var footprintPts = best.geometry.map(function(p) { return { lat: p.lat, lng: p.lon }; });
        // OSM ways close the ring — remove last point if it duplicates the first
        if (footprintPts.length > 1) {
            var first = footprintPts[0], last = footprintPts[footprintPts.length - 1];
            if (Math.abs(first.lat - last.lat) < 0.000001 && Math.abs(first.lng - last.lng) < 0.000001) {
                footprintPts.pop();
            }
        }

        var areaSqft = calculateAreaSqft(footprintPts);
        var confirm  = window.confirm(
            'Found a building footprint with ' + footprintPts.length + ' points (' +
            Math.round(areaSqft).toLocaleString() + ' sq ft).\n\nUse this as the shape for this zone?'
        );
        if (!confirm) return;

        // Load into edit mode so user can review before saving
        gpsEditPoints = footprintPts;
        showGpsEditMode(footprintPts);

    } catch (err) {
        console.error('Error fetching building footprint:', err);
        alert('Error fetching building footprint. Check your internet connection and try again.');
    } finally {
        btn.textContent = '🏠 Get House Footprint';
        btn.disabled    = false;
    }
}

// ---------- Button Wire-Up ----------

document.getElementById('viewYardMapBtn').addEventListener('click', function() {
    window.location.hash = 'yardmap';
});

document.getElementById('zoneGpsBtn').addEventListener('click', function() {
    if (window.currentZone) {
        window.location.hash = 'gpsmap/' + window.currentZone.id;
    }
});

document.getElementById('gpsmapRecordBtn').addEventListener('click', function() {
    showGpsRecordMode();
});

document.getElementById('gpsmapEditBtn').addEventListener('click', function() {
    if (gpsCurrentShape) { showGpsEditMode(gpsCurrentShape.points); }
});

document.getElementById('gpsmapDeleteBtn').addEventListener('click', deleteGpsShape);

// Record mode — picker buttons
document.getElementById('gpsmapPickWalk').addEventListener('click', showWalkScreen);
document.getElementById('gpsmapPickDrop').addEventListener('click', showDropScreen);
document.getElementById('gpsmapCancelPickerBtn').addEventListener('click', function() {
    showGpsViewMode();
});

// Walk the Path buttons
document.getElementById('gpsmapStartBtn').addEventListener('click', startRecording);
document.getElementById('gpsmapStopBtn').addEventListener('click', stopRecording);
document.getElementById('gpsmapCancelRecordBtn').addEventListener('click', function() {
    showRecordPicker();
    if (gpsWatchId !== null) {
        navigator.geolocation.clearWatch(gpsWatchId);
        gpsWatchId = null;
    }
    destroyRecordMap();
});

// Drop Points buttons
document.getElementById('gpsmapDropPointBtn').addEventListener('click', dropPoint);
document.getElementById('gpsmapDropStopBtn').addEventListener('click', finishDropPoints);
document.getElementById('gpsmapCancelDropBtn').addEventListener('click', function() {
    if (gpsDropWatchId !== null) {
        navigator.geolocation.clearWatch(gpsDropWatchId);
        gpsDropWatchId = null;
    }
    destroyDropMap();
    showRecordPicker();
});


document.getElementById('gpsmapSimplifyBtn').addEventListener('click', simplifyEditPoints);

document.getElementById('gpsmapSaveEditBtn').addEventListener('click', saveGpsShape);

document.getElementById('gpsmapCancelEditBtn').addEventListener('click', function() {
    destroyMap('edit');
    showGpsViewMode();
});

document.getElementById('gpsmapToggleBgBtn').addEventListener('click', function() {
    toggleMapBg(gpsViewMap, gpsViewTileLayer, 'gpsmapToggleBgBtn');
});

document.getElementById('gpsmapRulerBtn').addEventListener('click', function() {
    toggleRuler(gpsViewMap, 'gpsmapRulerBtn', 'gpsmapRulerStatus');
});

document.getElementById('gpsmapToggleBgEditBtn').addEventListener('click', function() {
    toggleMapBg(gpsEditMap, gpsEditTileLayer, 'gpsmapToggleBgEditBtn');
});

document.getElementById('gpsmapAddPointBtn').addEventListener('click', toggleAddPointMode);

document.getElementById('gpsmapToggleBoundaryEditBtn').addEventListener('click', function() {
    var btn = document.getElementById('gpsmapToggleBoundaryEditBtn');
    if (!gpsEditBoundaryLayer || !gpsEditMap) {
        btn.textContent = '🏠 No Property Line';
        return;
    }
    if (gpsEditMap.hasLayer(gpsEditBoundaryLayer)) {
        gpsEditMap.removeLayer(gpsEditBoundaryLayer);
        btn.textContent = '🏠 Show Property Line';
    } else {
        gpsEditBoundaryLayer.addTo(gpsEditMap);
        btn.textContent = '🏠 Hide Property Line';
    }
});

document.getElementById('gpsmapRulerEditBtn').addEventListener('click', function() {
    toggleRuler(gpsEditMap, 'gpsmapRulerEditBtn', 'gpsmapEditorInfo');
});

document.getElementById('gpsmapHouseBtn').addEventListener('click', fetchHouseFootprint);

document.getElementById('yardmapToggleBgBtn').addEventListener('click', function() {
    toggleMapBg(gpsYardMap, gpsYardTileLayer, 'yardmapToggleBgBtn');
});

document.getElementById('yardmapRulerBtn').addEventListener('click', function() {
    toggleRuler(gpsYardMap, 'yardmapRulerBtn', 'yardmapRulerStatus');
});

// ---------- Property Boundary Import ----------

// Default coordinates for 3398 Townside Dr, Bishop, GA 30621
// Source: Oconee County parcel data (PIN A 07D 022), converted from SRID 2239
var DEFAULT_BOUNDARY_POINTS = [
    {"lat":33.8194707,"lng":-83.4471415},
    {"lat":33.8194168,"lng":-83.4472162},
    {"lat":33.8193584,"lng":-83.4472860},
    {"lat":33.8192958,"lng":-83.4473504},
    {"lat":33.8192294,"lng":-83.4474091},
    {"lat":33.8198136,"lng":-83.4482588},
    {"lat":33.8202074,"lng":-83.4480610}
];

/**
 * Check if a property boundary shape exists and update the import button label.
 * Called when the yard map page loads.
 */
async function updateImportBoundaryBtn() {
    var btn = document.getElementById('importBoundaryBtn');
    if (!btn) return;
    try {
        var snap = await yardCol('gpsShapes')
            .where('zoneId', '==', '__property__')
            .limit(1)
            .get();
        btn.textContent = snap.empty ? '📥 Import Property Boundary' : '📥 Re-import Property Boundary';
    } catch (err) {
        console.error('Error checking property boundary:', err);
    }
}

/**
 * Show the import panel, pre-filled with existing boundary points or the default.
 */
async function openImportBoundaryPanel() {
    var panel  = document.getElementById('importBoundaryPanel');
    var input  = document.getElementById('importBoundaryInput');
    var errEl  = document.getElementById('importBoundaryError');

    errEl.classList.add('hidden');

    // Try to load existing boundary first
    try {
        var snap = await yardCol('gpsShapes')
            .where('zoneId', '==', '__property__')
            .limit(1)
            .get();
        if (!snap.empty) {
            input.value = JSON.stringify(snap.docs[0].data().points, null, 2);
        } else {
            input.value = JSON.stringify(DEFAULT_BOUNDARY_POINTS, null, 2);
        }
    } catch (err) {
        input.value = JSON.stringify(DEFAULT_BOUNDARY_POINTS, null, 2);
    }

    panel.classList.remove('hidden');
    input.focus();
}

/**
 * Parse the textarea, validate, and save to Firestore as the property boundary shape.
 */
async function saveImportedBoundary() {
    var input   = document.getElementById('importBoundaryInput');
    var errEl   = document.getElementById('importBoundaryError');
    var saveBtn = document.getElementById('importBoundarySaveBtn');

    errEl.classList.add('hidden');

    // Parse JSON
    var points;
    try {
        points = JSON.parse(input.value.trim());
    } catch (e) {
        errEl.textContent = 'Invalid JSON — check the format and try again.';
        errEl.classList.remove('hidden');
        return;
    }

    // Validate: must be array of {lat, lng}
    if (!Array.isArray(points) || points.length < 3) {
        errEl.textContent = 'Must be an array of at least 3 points.';
        errEl.classList.remove('hidden');
        return;
    }
    for (var i = 0; i < points.length; i++) {
        if (typeof points[i].lat !== 'number' || typeof points[i].lng !== 'number') {
            errEl.textContent = 'Each point must have numeric "lat" and "lng" fields.';
            errEl.classList.remove('hidden');
            return;
        }
    }

    saveBtn.textContent = 'Saving...';
    saveBtn.disabled    = true;

    try {
        var areaSqft = calculateAreaSqft(points);

        // Check for existing boundary doc to update or create new
        var snap = await yardCol('gpsShapes')
            .where('zoneId', '==', '__property__')
            .limit(1)
            .get();

        if (!snap.empty) {
            await yardCol('gpsShapes').doc(snap.docs[0].id).update({
                points:    points,
                areaSqft:  areaSqft,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } else {
            await yardCol('gpsShapes').add({
                zoneId:    '__property__',
                name:      'Property Boundary',
                points:    points,
                areaSqft:  areaSqft,
                color:     '#000000',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }

        document.getElementById('importBoundaryPanel').classList.add('hidden');
        document.getElementById('importBoundaryBtn').textContent = '📥 Re-import Property Boundary';

        // Reload the yard map to show the new boundary
        loadYardMapPage();

    } catch (err) {
        console.error('Error saving property boundary:', err);
        errEl.textContent = 'Error saving — please try again.';
        errEl.classList.remove('hidden');
    } finally {
        saveBtn.textContent = 'Save Boundary';
        saveBtn.disabled    = false;
    }
}

document.getElementById('importBoundaryBtn').addEventListener('click', openImportBoundaryPanel);
document.getElementById('importBoundarySaveBtn').addEventListener('click', saveImportedBoundary);
document.getElementById('importBoundaryCancelBtn').addEventListener('click', function() {
    document.getElementById('importBoundaryPanel').classList.add('hidden');
});

// Exclude toggle — save immediately to Firestore when user flips the checkbox
document.getElementById('gpsmapExcludeToggle').addEventListener('change', async function() {
    if (!gpsCurrentShape) return;
    var exclude   = this.checked;
    var checkbox  = this;

    try {
        await yardCol('gpsShapes').doc(gpsCurrentShape.id).update({
            excludeFromParent: exclude,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        // Update in-memory shape so re-renders stay consistent
        gpsCurrentShape.excludeFromParent = exclude;
    } catch (err) {
        console.error('Error saving excludeFromParent:', err);
        // Revert checkbox on failure so the UI stays honest
        checkbox.checked = !exclude;
        alert('Error saving — please try again.');
    }
});
