// ============================================================
// Neighbors.js — Neighborhood map + neighbor tracking
// Drop pins on an uploaded neighborhood image, link residents
// to houses, and track interaction recency via pin color.
//
// Firestore collections:
//   neighborhoods         — named map containers
//   neighborHouses        — pins on a neighborhood map
//   neighborHouseResidents — links contacts to houses
//   neighborArchivedFamilies — archived occupant groups
//   neighborHouseNotes    — house-level observations
//   neighborRoles         — custom resident role labels
// ============================================================

// ---------- State ----------
var _nbCurrentNeighborhood = null;  // neighborhood doc being viewed
var _nbMap                 = null;  // Leaflet map instance
var _nbImageOverlay        = null;  // Leaflet imageOverlay
var _nbMarkers             = {};    // houseId -> L.Marker
var _nbHouseDocs           = {};    // houseId -> house data obj
var _nbPlacementMode       = false; // true while user is tapping to place a pin
var _nbViewSaveTimer       = null;  // debounce timer for saving map view

// ---------- Pin color constants ----------
var NB_GREEN = '#16a34a';   // interacted within 60 days
var NB_AMBER = '#d97706';   // interacted 61–365 days ago
var NB_GRAY  = '#6b7280';   // stale or no interactions

// ============================================================
// NEIGHBORHOODS LIST PAGE  (#neighbors)
// ============================================================

async function loadNeighborhoodsPage() {
    var container = document.getElementById('nbNeighborhoodsListContainer');
    var empty     = document.getElementById('nbNeighborhoodsEmpty');
    container.innerHTML = '<p class="loading-text">Loading…</p>';
    empty.classList.add('hidden');

    try {
        var snap = await userCol('neighborhoods').orderBy('createdAt', 'asc').get();
        if (snap.empty) {
            container.innerHTML = '';
            empty.classList.remove('hidden');
            return;
        }

        var neighborhoods = snap.docs.map(function(d) {
            return Object.assign({ id: d.id }, d.data());
        });

        // Fetch house count per neighborhood in parallel
        var countSnaps = await Promise.all(
            neighborhoods.map(function(nb) {
                return userCol('neighborHouses').where('neighborhoodId', '==', nb.id).get();
            })
        );

        container.innerHTML = neighborhoods.map(function(nb, i) {
            var count = countSnaps[i].size;
            var meta  = count + ' house' + (count !== 1 ? 's' : '');
            return '<div class="nb-neighborhood-card" onclick="window.location.hash=\'#neighborhood/' + nb.id + '\'">' +
                '<div class="nb-neighborhood-left">' +
                    '<div class="nb-neighborhood-icon">&#127968;</div>' +
                    '<div>' +
                        '<div class="nb-neighborhood-name">' + escapeHtml(nb.name) + '</div>' +
                        '<div class="nb-neighborhood-meta">' + escapeHtml(meta) + '</div>' +
                    '</div>' +
                '</div>' +
                '<div class="nb-neighborhood-actions">' +
                    '<button class="btn btn-secondary btn-small" ' +
                        'onclick="event.stopPropagation(); openEditNeighborhoodModal(\'' + nb.id + '\')">Edit</button>' +
                    '<button class="btn btn-danger btn-small" ' +
                        'onclick="event.stopPropagation(); _nbDeleteNeighborhood(\'' + nb.id + '\')">Delete</button>' +
                '</div>' +
            '</div>';
        }).join('');

    } catch (e) {
        container.innerHTML = '<p class="error-text">Failed to load neighborhoods.</p>';
        console.error('loadNeighborhoodsPage:', e);
    }
}

// ---------- Add / Edit neighborhood modal ----------

var _nbEditingNeighborhoodId = null;
var _nbPendingImage          = null; // { dataUrl, width, height }

function openAddNeighborhoodModal() {
    _nbEditingNeighborhoodId = null;
    _nbPendingImage = null;
    document.getElementById('nbNeighborhoodModalTitle').textContent = 'Add Neighborhood';
    document.getElementById('nbNeighborhoodName').value = '';
    document.getElementById('nbNeighborhoodImageFile').value = '';
    document.getElementById('nbNeighborhoodImagePreview').src = '';
    document.getElementById('nbNeighborhoodImagePreview').classList.add('hidden');
    document.getElementById('nbNeighborhoodImageHint').textContent = 'Upload a screenshot of your neighborhood map (required)';
    document.getElementById('nbNeighborhoodSaveBtn').disabled = true;
    openModal('nbNeighborhoodModal');
}

async function openEditNeighborhoodModal(id) {
    _nbEditingNeighborhoodId = id;
    _nbPendingImage = null;

    try {
        var snap = await userCol('neighborhoods').doc(id).get();
        if (!snap.exists) return;
        var nb = snap.data();

        document.getElementById('nbNeighborhoodModalTitle').textContent = 'Edit Neighborhood';
        document.getElementById('nbNeighborhoodName').value = nb.name || '';
        document.getElementById('nbNeighborhoodImageFile').value = '';

        if (nb.imageData) {
            document.getElementById('nbNeighborhoodImagePreview').src = nb.imageData;
            document.getElementById('nbNeighborhoodImagePreview').classList.remove('hidden');
            document.getElementById('nbNeighborhoodImageHint').textContent = 'Upload a new image to replace the current one (optional)';
        } else {
            document.getElementById('nbNeighborhoodImagePreview').src = '';
            document.getElementById('nbNeighborhoodImagePreview').classList.add('hidden');
            document.getElementById('nbNeighborhoodImageHint').textContent = 'Upload a screenshot of your neighborhood map (required)';
        }
        document.getElementById('nbNeighborhoodSaveBtn').disabled = false;
        openModal('nbNeighborhoodModal');
    } catch (e) {
        console.error('openEditNeighborhoodModal:', e);
    }
}

async function _nbHandleImageSelect(input) {
    var file = input.files[0];
    if (!file) return;

    document.getElementById('nbNeighborhoodImageHint').textContent = 'Compressing image…';
    try {
        _nbPendingImage = await _nbCompressMapImage(file);
        document.getElementById('nbNeighborhoodImagePreview').src = _nbPendingImage.dataUrl;
        document.getElementById('nbNeighborhoodImagePreview').classList.remove('hidden');
        var sizeKB = Math.round(_nbPendingImage.dataUrl.length / 1024);
        document.getElementById('nbNeighborhoodImageHint').textContent =
            'Image ready — ' + _nbPendingImage.width + '×' + _nbPendingImage.height + 'px, ' + sizeKB + 'KB';
        document.getElementById('nbNeighborhoodSaveBtn').disabled = false;
    } catch (e) {
        document.getElementById('nbNeighborhoodImageHint').textContent = 'Error loading image — please try again';
        console.error('_nbHandleImageSelect:', e);
    }
}

async function _nbSaveNeighborhood() {
    var name = document.getElementById('nbNeighborhoodName').value.trim();
    if (!name) { alert('Please enter a neighborhood name.'); return; }

    var isNew = !_nbEditingNeighborhoodId;
    if (isNew && !_nbPendingImage) { alert('Please upload a map image.'); return; }

    var btn = document.getElementById('nbNeighborhoodSaveBtn');
    btn.disabled = true; btn.textContent = 'Saving…';

    try {
        var data = { name: name };
        if (_nbPendingImage) {
            data.imageData   = _nbPendingImage.dataUrl;
            data.imageWidth  = _nbPendingImage.width;
            data.imageHeight = _nbPendingImage.height;
        }

        if (isNew) {
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            var ref = await userCol('neighborhoods').add(data);
            var newId = ref.id;
            closeModal('nbNeighborhoodModal');
            // Defer navigation so closeModal's history.back() settles before we push the new hash
            setTimeout(function() { window.location.hash = '#neighborhood/' + newId; }, 50);
        } else {
            await userCol('neighborhoods').doc(_nbEditingNeighborhoodId).update(data);
            // Refresh map image if we're currently viewing this neighborhood
            if (_nbPendingImage && _nbCurrentNeighborhood &&
                    _nbCurrentNeighborhood.id === _nbEditingNeighborhoodId) {
                _nbCurrentNeighborhood.imageData   = _nbPendingImage.dataUrl;
                _nbCurrentNeighborhood.imageWidth  = _nbPendingImage.width;
                _nbCurrentNeighborhood.imageHeight = _nbPendingImage.height;
                _nbUpdateMapImage();
            }
            if (_nbCurrentNeighborhood && _nbCurrentNeighborhood.id === _nbEditingNeighborhoodId) {
                _nbCurrentNeighborhood.name = name;
                document.getElementById('nbMapNeighborhoodName').textContent = name;
            }
            closeModal('nbNeighborhoodModal');
            loadNeighborhoodsPage();
        }
    } catch (e) {
        alert('Save failed. Please try again.');
        console.error('_nbSaveNeighborhood:', e);
    } finally {
        btn.disabled = false; btn.textContent = 'Save';
    }
}

async function _nbDeleteNeighborhood(id) {
    if (!confirm('Delete this neighborhood? All house pins and data will be permanently removed. Contacts will not be affected.')) return;

    try {
        var housesSnap = await userCol('neighborHouses').where('neighborhoodId', '==', id).get();
        await Promise.all(housesSnap.docs.map(function(d) { return _nbDeleteHouseData(d.id); }));
        await userCol('neighborhoods').doc(id).delete();
        loadNeighborhoodsPage();
    } catch (e) {
        alert('Delete failed. Please try again.');
        console.error('_nbDeleteNeighborhood:', e);
    }
}

// Delete all Firestore data tied to a house (not the linked contacts themselves)
async function _nbDeleteHouseData(houseId) {
    var batch = db.batch();
    var [residentsSnap, notesSnap, archivesSnap] = await Promise.all([
        userCol('neighborHouseResidents').where('houseId', '==', houseId).get(),
        userCol('neighborHouseNotes').where('houseId', '==', houseId).get(),
        userCol('neighborArchivedFamilies').where('houseId', '==', houseId).get()
    ]);
    residentsSnap.forEach(function(d) { batch.delete(d.ref); });
    notesSnap.forEach(function(d) { batch.delete(d.ref); });
    archivesSnap.forEach(function(d) { batch.delete(d.ref); });
    batch.delete(userCol('neighborHouses').doc(houseId));
    await batch.commit();
}

// ============================================================
// NEIGHBORHOOD MAP PAGE  (#neighborhood/{id})
// ============================================================

async function loadNeighborhoodMapPage(id) {
    _nbCleanupMap();

    try {
        var snap = await userCol('neighborhoods').doc(id).get();
        if (!snap.exists) { window.location.hash = '#neighbors'; return; }
        _nbCurrentNeighborhood = Object.assign({ id: snap.id }, snap.data());

        document.getElementById('nbMapNeighborhoodName').textContent = _nbCurrentNeighborhood.name;
        document.getElementById('nbEditNeighborhoodBtn').onclick = function() {
            openEditNeighborhoodModal(id);
        };

        // Breadcrumb
        document.getElementById('breadcrumbBar').innerHTML =
            '<a href="#neighbors">Neighborhoods</a>';

        _nbInitMap(_nbCurrentNeighborhood);
        await _nbLoadPins(id);
    } catch (e) {
        console.error('loadNeighborhoodMapPage:', e);
    }
}

function _nbInitMap(neighborhood) {
    document.getElementById('nbMapContainer').innerHTML = '';

    _nbMap = L.map('nbMapContainer', {
        crs:      L.CRS.Simple,
        minZoom:  -3,
        maxZoom:  4,
        zoomSnap: 0.5
    });

    var w = neighborhood.imageWidth  || 1000;
    var h = neighborhood.imageHeight || 800;
    var bounds = [[0, 0], [h, w]];

    _nbImageOverlay = L.imageOverlay(neighborhood.imageData, bounds).addTo(_nbMap);

    // Restore saved view or fit image to container
    if (neighborhood.defaultZoom !== undefined && neighborhood.defaultPanX !== undefined) {
        _nbMap.setView([neighborhood.defaultPanX, neighborhood.defaultPanY], neighborhood.defaultZoom);
    } else {
        _nbMap.fitBounds(bounds, { padding: [20, 20] });
    }

    // Debounced save of current view position
    _nbMap.on('moveend zoomend', function() {
        clearTimeout(_nbViewSaveTimer);
        _nbViewSaveTimer = setTimeout(_nbSaveMapView, 800);
    });

    // Tap handler — only active in placement mode
    _nbMap.on('click', function(e) {
        if (!_nbPlacementMode) return;
        _nbExitPlacementMode();
        _nbOpenAddHouseModal(e.latlng);
    });
}

function _nbUpdateMapImage() {
    if (!_nbMap || !_nbCurrentNeighborhood || !_nbImageOverlay) return;
    var w = _nbCurrentNeighborhood.imageWidth  || 1000;
    var h = _nbCurrentNeighborhood.imageHeight || 800;
    _nbImageOverlay.setUrl(_nbCurrentNeighborhood.imageData);
    _nbImageOverlay.setBounds([[0, 0], [h, w]]);
}

async function _nbLoadPins(neighborhoodId) {
    _nbMarkers   = {};
    _nbHouseDocs = {};

    try {
        var snap = await userCol('neighborHouses').where('neighborhoodId', '==', neighborhoodId).get();
        snap.forEach(function(d) {
            var house = Object.assign({ id: d.id }, d.data());
            _nbHouseDocs[house.id] = house;
            _nbAddMarkerToMap(house);
        });
    } catch (e) {
        console.error('_nbLoadPins:', e);
    }
}

function _nbAddMarkerToMap(house) {
    if (!_nbMap || !_nbCurrentNeighborhood) return;

    var w = _nbCurrentNeighborhood.imageWidth  || 1000;
    var h = _nbCurrentNeighborhood.imageHeight || 800;

    // pinX/pinY are 0-1 fractions from top-left.
    // Leaflet CRS.Simple has origin at bottom-left, so Y is flipped.
    var lat = (1 - (house.pinY || 0.5)) * h;
    var lng = (house.pinX || 0.5) * w;

    var color  = _nbPinColor(house.lastInteractionAt);
    var marker = L.marker([lat, lng], {
        icon:      _nbPinIcon(house.nickname, color),
        draggable: true
    });

    marker.on('dragend', function(e) {
        var ll      = e.target.getLatLng();
        var newPinX = Math.max(0, Math.min(1, ll.lng / w));
        var newPinY = Math.max(0, Math.min(1, 1 - ll.lat / h));
        house.pinX  = newPinX;
        house.pinY  = newPinY;
        userCol('neighborHouses').doc(house.id)
            .update({ pinX: newPinX, pinY: newPinY })
            .catch(function(err) { console.error('pin dragend save:', err); });
    });

    marker.on('click', function() {
        if (_nbPlacementMode) return;
        window.location.hash = '#neighborhouse/' + house.id;
    });

    marker.addTo(_nbMap);
    _nbMarkers[house.id] = marker;
}

// ---------- Placement mode ----------

function _nbEnterPlacementMode() {
    _nbPlacementMode = true;
    document.getElementById('nbPlacementBanner').classList.remove('hidden');
    document.getElementById('nbAddHouseBtn').classList.add('hidden');
    document.getElementById('nbMapContainer').classList.add('nb-crosshair');
}

function _nbExitPlacementMode() {
    _nbPlacementMode = false;
    document.getElementById('nbPlacementBanner').classList.add('hidden');
    document.getElementById('nbAddHouseBtn').classList.remove('hidden');
    document.getElementById('nbMapContainer').classList.remove('nb-crosshair');
}

// ---------- Add / Edit house modal ----------

var _nbPendingPinLatLng = null;
var _nbEditingHouseId   = null;

function _nbOpenAddHouseModal(latlng) {
    _nbPendingPinLatLng = latlng;
    _nbEditingHouseId   = null;
    document.getElementById('nbHouseModalTitle').textContent = 'Name This House';
    document.getElementById('nbHouseNickname').value = '';
    document.getElementById('nbHouseAddress').value  = '';
    openModal('nbHouseModal');
    setTimeout(function() { document.getElementById('nbHouseNickname').focus(); }, 100);
}

function _nbOpenEditHouseModal(houseId) {
    var house = _nbHouseDocs[houseId];
    if (!house) return;
    _nbEditingHouseId   = houseId;
    _nbPendingPinLatLng = null;
    document.getElementById('nbHouseModalTitle').textContent = 'Edit House';
    document.getElementById('nbHouseNickname').value = house.nickname || '';
    document.getElementById('nbHouseAddress').value  = house.address  || '';
    openModal('nbHouseModal');
}

async function _nbSaveHouse() {
    var nickname = document.getElementById('nbHouseNickname').value.trim();
    var address  = document.getElementById('nbHouseAddress').value.trim();
    if (!nickname) { alert('Please enter a name for this house.'); return; }

    var btn = document.getElementById('nbHouseSaveBtn');
    btn.disabled = true; btn.textContent = 'Saving…';

    try {
        if (_nbEditingHouseId) {
            await userCol('neighborHouses').doc(_nbEditingHouseId).update({ nickname: nickname, address: address });
            var house = _nbHouseDocs[_nbEditingHouseId];
            if (house) {
                house.nickname = nickname;
                house.address  = address;
                var marker = _nbMarkers[_nbEditingHouseId];
                if (marker) marker.setIcon(_nbPinIcon(nickname, _nbPinColor(house.lastInteractionAt)));
            }
            closeModal('nbHouseModal');

        } else {
            // Convert Leaflet latlng → 0-1 fractions (Y flipped)
            var w    = _nbCurrentNeighborhood.imageWidth  || 1000;
            var h    = _nbCurrentNeighborhood.imageHeight || 800;
            var pinX = Math.max(0, Math.min(1, _nbPendingPinLatLng.lng / w));
            var pinY = Math.max(0, Math.min(1, 1 - _nbPendingPinLatLng.lat / h));

            var ref  = await userCol('neighborHouses').add({
                neighborhoodId:    _nbCurrentNeighborhood.id,
                nickname:          nickname,
                address:           address,
                pinX:              pinX,
                pinY:              pinY,
                lastInteractionAt: null,
                createdAt:         firebase.firestore.FieldValue.serverTimestamp()
            });

            var newHouse = {
                id:                ref.id,
                neighborhoodId:    _nbCurrentNeighborhood.id,
                nickname:          nickname,
                address:           address,
                pinX:              pinX,
                pinY:              pinY,
                lastInteractionAt: null
            };
            _nbHouseDocs[ref.id] = newHouse;
            _nbAddMarkerToMap(newHouse);
            closeModal('nbHouseModal');
        }
    } catch (e) {
        alert('Save failed. Please try again.');
        console.error('_nbSaveHouse:', e);
    } finally {
        btn.disabled = false; btn.textContent = 'Save';
    }
}

function _nbSaveMapView() {
    if (!_nbMap || !_nbCurrentNeighborhood) return;
    var center = _nbMap.getCenter();
    userCol('neighborhoods').doc(_nbCurrentNeighborhood.id).update({
        defaultZoom: _nbMap.getZoom(),
        defaultPanX: center.lat,
        defaultPanY: center.lng
    }).catch(function(e) { console.error('_nbSaveMapView:', e); });
}

function _nbCleanupMap() {
    clearTimeout(_nbViewSaveTimer);
    _nbExitPlacementModeSilent();
    if (_nbMap) { _nbMap.remove(); _nbMap = null; }
    _nbImageOverlay        = null;
    _nbMarkers             = {};
    _nbHouseDocs           = {};
    _nbCurrentNeighborhood = null;
}

function _nbExitPlacementModeSilent() {
    _nbPlacementMode = false;
    var banner = document.getElementById('nbPlacementBanner');
    var addBtn  = document.getElementById('nbAddHouseBtn');
    var mapEl   = document.getElementById('nbMapContainer');
    if (banner) banner.classList.add('hidden');
    if (addBtn) addBtn.classList.remove('hidden');
    if (mapEl)  mapEl.classList.remove('nb-crosshair');
}

// ============================================================
// HOUSE DETAIL STUB  (#neighborhouse/{id})  — Phase 1 placeholder
// Full implementation in Phase 2
// ============================================================

async function loadNeighborHousePage(id) {
    try {
        var snap = await userCol('neighborHouses').doc(id).get();
        if (!snap.exists) { window.location.hash = '#neighbors'; return; }
        var house = Object.assign({ id: snap.id }, snap.data());

        document.getElementById('nbHouseStubName').textContent = house.nickname || 'House';
        document.getElementById('nbHouseStubAddress').textContent = house.address || '';
        document.getElementById('nbHouseStubBackBtn').onclick = function() {
            window.location.hash = '#neighborhood/' + house.neighborhoodId;
        };

        // Breadcrumb
        document.getElementById('breadcrumbBar').innerHTML =
            '<a href="#neighbors">Neighborhoods</a> &rsaquo; ' +
            '<a href="#neighborhood/' + house.neighborhoodId + '">Map</a>';

    } catch (e) {
        console.error('loadNeighborHousePage:', e);
    }
}

// ============================================================
// HELPERS
// ============================================================

function _nbPinColor(lastInteractionAt) {
    if (!lastInteractionAt) return NB_GRAY;
    var date = lastInteractionAt.toDate ? lastInteractionAt.toDate() : new Date(lastInteractionAt);
    var daysAgo = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
    if (daysAgo <= 60)  return NB_GREEN;
    if (daysAgo <= 365) return NB_AMBER;
    return NB_GRAY;
}

function _nbPinIcon(nickname, color) {
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32">' +
        '<circle cx="12" cy="12" r="11" fill="' + color + '" stroke="rgba(0,0,0,0.22)" stroke-width="1.5"/>' +
        '<polygon points="12,3 3,10 3,20 9,20 9,14 15,14 15,20 21,20 21,10" fill="white"/>' +
        '</svg>';
    return L.divIcon({
        html:      '<div class="nb-pin-wrap">' + svg +
                   '<div class="nb-pin-label">' + escapeHtml(nickname) + '</div></div>',
        className: 'nb-pin',
        iconSize:  [32, 54],
        iconAnchor:[16, 16]
    });
}

// Compress map image — allows up to 500KB, max 1600px on longest side
// (higher quality than photos.js compressImage to keep map detail readable when zoomed)
function _nbCompressMapImage(file) {
    return new Promise(function(resolve, reject) {
        var reader = new FileReader();
        reader.onload = function(e) {
            var img = new Image();
            img.onload = function() {
                var maxDim = 1600, w = img.width, h = img.height;
                if (w > maxDim || h > maxDim) {
                    if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
                    else       { w = Math.round(w * maxDim / h); h = maxDim; }
                }
                var canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                var quality = 0.82;
                var dataUrl = canvas.toDataURL('image/jpeg', quality);
                while (dataUrl.length > 520000 && quality > 0.4) {
                    quality -= 0.1;
                    dataUrl = canvas.toDataURL('image/jpeg', quality);
                }
                resolve({ dataUrl: dataUrl, width: w, height: h });
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}
