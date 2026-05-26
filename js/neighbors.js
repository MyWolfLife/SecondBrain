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
var _nbCurrentNeighborhood    = null;  // neighborhood doc being viewed on map page
var _nbMap                    = null;  // Leaflet map instance
var _nbImageOverlay           = null;  // Leaflet imageOverlay
var _nbMarkers                = {};    // houseId -> L.Marker
var _nbHouseDocs              = {};    // houseId -> house data obj
var _nbPlacementMode          = false; // true while user is tapping to place a pin
var _nbViewSaveTimer          = null;  // debounce timer for saving map view

// House detail page state (Phase 2)
var _nbCurrentHouse           = null;  // house doc on house detail page
var _nbPickedContactId        = null;  // selected contact in resident picker
var _nbPickedContactName      = null;
var _nbResidentPickerStep     = 'search'; // 'search' | 'role'
var _nbCurrentResidentHouseId = null;  // houseId for resident add flow
var _nbCurrentNoteHouseId     = null;  // houseId for note add/edit
var _nbEditingNoteId          = null;  // noteId being edited (null = new)

// Archive / delete state (Phase 3)
var _nbDeleteTargetHouse      = null;  // house being deleted or archived
var _nbDeleteChoice           = 'archive'; // 'archive' | 'hard'

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
    await _nbProcessImageFile(file);
}

async function _nbProcessImageFile(file) {
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
        console.error('_nbProcessImageFile:', e);
    }
}

async function _nbPasteMapImage() {
    if (!navigator.clipboard || !navigator.clipboard.read) {
        alert('Clipboard paste is not supported in this browser. Use Choose File instead.');
        return;
    }
    document.getElementById('nbNeighborhoodImageHint').textContent = 'Reading clipboard…';
    try {
        var items = await navigator.clipboard.read();
        var imageBlob = null;
        for (var i = 0; i < items.length; i++) {
            var imageType = items[i].types.find(function(t) { return t.startsWith('image/'); });
            if (imageType) { imageBlob = await items[i].getType(imageType); break; }
        }
        if (!imageBlob) {
            document.getElementById('nbNeighborhoodImageHint').textContent = 'No image on clipboard — right-click an image and choose "Copy image", then try again.';
            return;
        }
        var ext  = imageBlob.type === 'image/png' ? '.png' : '.jpg';
        var file = new File([imageBlob], 'pasted-map' + ext, { type: imageBlob.type });
        await _nbProcessImageFile(file);
    } catch (err) {
        if (err.name === 'NotAllowedError') {
            document.getElementById('nbNeighborhoodImageHint').textContent = 'Clipboard access denied — click Allow when prompted, then try again.';
        } else {
            document.getElementById('nbNeighborhoodImageHint').textContent = 'Could not read clipboard. Use Choose File instead.';
            console.error('_nbPasteMapImage:', err);
        }
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
    document.getElementById('nbHouseSaveBtn').disabled = true;
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
    document.getElementById('nbHouseSaveBtn').disabled = !(house.nickname || '').trim();
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
            // Update map pin if we're on the map page
            var house = _nbHouseDocs[_nbEditingHouseId];
            if (house) {
                house.nickname = nickname;
                house.address  = address;
                var marker = _nbMarkers[_nbEditingHouseId];
                if (marker) marker.setIcon(_nbPinIcon(nickname, _nbPinColor(house.lastInteractionAt)));
            }
            // Update house detail page header if we're viewing this house
            if (_nbCurrentHouse && _nbCurrentHouse.id === _nbEditingHouseId) {
                _nbCurrentHouse.nickname = nickname;
                _nbCurrentHouse.address  = address;
                _nbRenderHouseHeader(_nbCurrentHouse);
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
// HOUSE DETAIL PAGE  (#neighborhouse/{id})  — Phase 2
// ============================================================

async function loadNeighborHousePage(id) {
    _nbCurrentHouse = null;
    try {
        var snap = await userCol('neighborHouses').doc(id).get();
        if (!snap.exists) { window.location.hash = '#neighbors'; return; }
        _nbCurrentHouse = Object.assign({ id: snap.id }, snap.data());
        var house = _nbCurrentHouse;

        document.getElementById('breadcrumbBar').innerHTML =
            '<a href="#neighbors">Neighborhoods</a> &rsaquo; ' +
            '<a href="#neighborhood/' + house.neighborhoodId + '">Map</a>';

        _nbRenderHouseHeader(house);

        document.getElementById('nbAddExistingResidentBtn').onclick = function() {
            _nbOpenAddResidentModal(id);
        };
        document.getElementById('nbAddNewResidentBtn').onclick = function() {
            _nbOpenNewPersonModal(id);
        };
        document.getElementById('nbAddHouseNoteBtn').onclick = function() {
            _nbOpenHouseNoteModal(id, null);
        };

        await Promise.all([
            _nbLoadResidents(id),
            _nbLoadHouseNotes(id),
            _nbLoadPreviousFamilies(id),
            _nbLoadJournalMentions(id)
        ]);
    } catch (e) {
        console.error('loadNeighborHousePage:', e);
    }
}

function _nbRenderHouseHeader(house) {
    document.getElementById('nbHouseName').textContent = house.nickname || 'House';
    var addrEl = document.getElementById('nbHouseDetailAddress');
    addrEl.textContent = house.address || '';
    addrEl.style.display = house.address ? '' : 'none';

    document.getElementById('nbHouseEditBtn').onclick = function() {
        _nbOpenEditHouseFromDetail();
    };
    document.getElementById('nbHouseDeleteBtn').onclick = function() {
        _nbOpenDeleteHouseModal(house);
    };
}

// Open the edit-house modal when on the house detail page
function _nbOpenEditHouseFromDetail() {
    if (!_nbCurrentHouse) return;
    _nbEditingHouseId   = _nbCurrentHouse.id;
    _nbPendingPinLatLng = null;
    document.getElementById('nbHouseModalTitle').textContent = 'Edit House';
    document.getElementById('nbHouseNickname').value = _nbCurrentHouse.nickname || '';
    document.getElementById('nbHouseAddress').value  = _nbCurrentHouse.address  || '';
    document.getElementById('nbHouseSaveBtn').disabled = !(_nbCurrentHouse.nickname || '').trim();
    openModal('nbHouseModal');
}

// ============================================================
// RESIDENTS
// ============================================================

async function _nbLoadResidents(houseId) {
    var container = document.getElementById('nbResidentsContainer');
    var emptyEl   = document.getElementById('nbResidentsEmpty');
    container.innerHTML = '<p class="loading-text">Loading…</p>';
    emptyEl.classList.add('hidden');

    try {
        var snap = await userCol('neighborHouseResidents')
            .where('houseId', '==', houseId)
            .where('archived', '==', false)
            .get();

        if (snap.empty) {
            container.innerHTML = '';
            emptyEl.classList.remove('hidden');
            return;
        }

        var residents = snap.docs.map(function(d) {
            return Object.assign({ id: d.id }, d.data());
        });

        var residentData = await Promise.all(residents.map(function(r) {
            return _nbLoadResidentData(r);
        }));

        container.innerHTML = residentData.map(function(d) {
            return _nbBuildResidentCardHtml(d.resident, d.person, d.facts, d.interactions);
        }).join('');

    } catch (e) {
        container.innerHTML = '<p class="error-text">Failed to load residents.</p>';
        console.error('_nbLoadResidents:', e);
    }
}

async function _nbLoadResidentData(resident) {
    try {
        var [personSnap, factsSnap, intSnap] = await Promise.all([
            userCol('people').doc(resident.personId).get(),
            userCol('facts')
                .where('targetType', '==', 'person')
                .where('targetId', '==', resident.personId)
                .get(),
            userCol('peopleInteractions')
                .where('personId', '==', resident.personId)
                .get()
        ]);

        var person = personSnap.exists
            ? Object.assign({ id: personSnap.id }, personSnap.data())
            : { id: resident.personId, name: '(Unknown)' };

        var facts = factsSnap.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });
        facts.sort(function(a, b) {
            var ta = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
            var tb = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
            return tb - ta;
        });
        facts = facts.slice(0, 2);

        var interactions = [];
        intSnap.forEach(function(d) { interactions.push(Object.assign({ id: d.id }, d.data())); });
        interactions.sort(function(a, b) { return (b.date || '').localeCompare(a.date || ''); });
        interactions = interactions.slice(0, 2);

        return { resident: resident, person: person, facts: facts, interactions: interactions };
    } catch (e) {
        console.error('_nbLoadResidentData:', resident.personId, e);
        return { resident: resident, person: { id: resident.personId, name: '(Load error)' }, facts: [], interactions: [] };
    }
}

function _nbBuildResidentCardHtml(resident, person, facts, interactions) {
    var avatarHtml;
    if (person.profilePhotoData) {
        avatarHtml = '<img class="nb-resident-avatar" src="' + person.profilePhotoData + '" alt="">';
    } else {
        var initials = (person.name || '?')
            .split(' ').map(function(w) { return w[0] || ''; }).slice(0, 2).join('').toUpperCase();
        avatarHtml = '<div class="nb-resident-avatar nb-resident-avatar--initials">' + escapeHtml(initials) + '</div>';
    }

    var lastContactText = interactions.length > 0
        ? 'Last contact: ' + _nbFormatDate(interactions[0].date)
        : 'No interactions yet';

    var intelHtml = '';
    if (facts.length > 0) {
        intelHtml += '<div class="nb-intel-group"><div class="nb-intel-group-label">Facts</div>' +
            facts.map(function(f) {
                return '<div class="nb-intel-row"><span class="nb-intel-key">' + escapeHtml(f.label || '') + ':</span>' +
                    '<span class="nb-intel-val">' + escapeHtml(f.value || '') + '</span></div>';
            }).join('') + '</div>';
    }
    if (interactions.length > 0) {
        intelHtml += '<div class="nb-intel-group"><div class="nb-intel-group-label">Recent Interactions</div>' +
            interactions.map(function(i) {
                return '<div class="nb-intel-row">' +
                    '<span class="nb-intel-int-date">' + escapeHtml(_nbFormatDate(i.date)) + '</span>' +
                    '<span class="nb-intel-int-text">' + escapeHtml(i.text || '') + '</span></div>';
            }).join('') + '</div>';
    }
    if (!intelHtml) {
        intelHtml = '<div class="nb-intel-empty">No facts or interactions logged yet.</div>';
    }

    var hasIntel = facts.length > 0 || interactions.length > 0;

    return '<div class="nb-resident-card">' +
        '<div class="nb-resident-header">' +
            avatarHtml +
            '<div class="nb-resident-info">' +
                '<div class="nb-resident-name">' + escapeHtml(person.name || '') + '</div>' +
                '<span class="nb-resident-role-badge">' + escapeHtml(resident.role || 'Resident') + '</span>' +
                '<div class="nb-resident-last-contact">' + escapeHtml(lastContactText) + '</div>' +
            '</div>' +
            '<div class="nb-resident-actions">' +
                (hasIntel ? '<button class="btn btn-link nb-intel-toggle" onclick="_nbToggleIntelPanel(this)">&#9660; Intel</button>' : '') +
                '<button class="btn btn-link" onclick="window.location.hash=\'#contact/' + resident.personId + '\'">Full Profile</button>' +
                '<button class="nb-remove-btn" onclick="_nbRemoveResident(\'' + resident.id + '\')" title="Remove from house">&times;</button>' +
            '</div>' +
        '</div>' +
        '<div class="nb-intel-panel hidden">' + intelHtml + '</div>' +
    '</div>';
}

function _nbToggleIntelPanel(btn) {
    var card  = btn.closest('.nb-resident-card');
    var panel = card.querySelector('.nb-intel-panel');
    var open  = !panel.classList.contains('hidden');
    panel.classList.toggle('hidden', open);
    btn.innerHTML = open ? '&#9660; Intel' : '&#9650; Intel';
}

async function _nbRemoveResident(residentId) {
    if (!confirm('Remove this person from the house? Their contact record will not be deleted.')) return;
    try {
        await userCol('neighborHouseResidents').doc(residentId).delete();
        if (_nbCurrentHouse) _nbLoadResidents(_nbCurrentHouse.id);
    } catch (e) {
        alert('Failed to remove resident.');
        console.error('_nbRemoveResident:', e);
    }
}

// ============================================================
// ADD EXISTING CONTACT — resident picker modal
// ============================================================

function _nbOpenAddResidentModal(houseId) {
    _nbCurrentResidentHouseId = houseId;
    _nbPickedContactId    = null;
    _nbPickedContactName  = null;
    _nbResidentPickerStep = 'search';
    document.getElementById('nbResidentSearchInput').value = '';
    document.getElementById('nbResidentSearchResults').innerHTML = '';
    document.getElementById('nbResidentRoleInput').value = '';
    document.getElementById('nbResidentSearchStep').classList.remove('hidden');
    document.getElementById('nbResidentRoleStep').classList.add('hidden');
    document.getElementById('nbResidentPickerSaveBtn').classList.add('hidden');
    document.getElementById('nbResidentPickerBackBtn').classList.add('hidden');
    openModal('nbResidentPickerModal');
    setTimeout(function() { document.getElementById('nbResidentSearchInput').focus(); }, 100);
}

async function _nbSearchContactsForResident() {
    var query   = document.getElementById('nbResidentSearchInput').value.trim().toLowerCase();
    var results = document.getElementById('nbResidentSearchResults');
    if (!query) { results.innerHTML = ''; return; }

    try {
        var snap = await userCol('people').orderBy('name').get();
        var matches = [];
        snap.forEach(function(d) {
            var p = Object.assign({ id: d.id }, d.data());
            if ((p.name || '').toLowerCase().includes(query)) matches.push(p);
        });
        matches = matches.slice(0, 8);

        if (matches.length === 0) {
            results.innerHTML = '<p class="nb-search-empty">No contacts found.</p>';
            return;
        }

        results.innerHTML = matches.map(function(p) {
            var avatarHtml;
            if (p.profilePhotoData) {
                avatarHtml = '<img class="nb-search-avatar" src="' + p.profilePhotoData + '" alt="">';
            } else {
                var initials = (p.name || '?')
                    .split(' ').map(function(w) { return w[0] || ''; }).slice(0, 2).join('').toUpperCase();
                avatarHtml = '<div class="nb-search-avatar nb-search-avatar--initials">' + escapeHtml(initials) + '</div>';
            }
            return '<div class="nb-search-result" onclick="_nbSelectContact(\'' + p.id + '\',\'' + encodeURIComponent(p.name || '') + '\')">' +
                avatarHtml +
                '<span>' + escapeHtml(p.name || '(No name)') + '</span>' +
            '</div>';
        }).join('');
    } catch (e) {
        results.innerHTML = '<p class="error-text">Search failed.</p>';
        console.error('_nbSearchContactsForResident:', e);
    }
}

function _nbSelectContact(personId, encodedName) {
    _nbPickedContactId   = personId;
    _nbPickedContactName = decodeURIComponent(encodedName);
    document.getElementById('nbResidentRolePersonName').textContent = 'Adding: ' + _nbPickedContactName;
    document.getElementById('nbResidentRoleInput').value = '';
    document.getElementById('nbResidentSearchStep').classList.add('hidden');
    document.getElementById('nbResidentRoleStep').classList.remove('hidden');
    document.getElementById('nbResidentPickerSaveBtn').classList.remove('hidden');
    document.getElementById('nbResidentPickerBackBtn').classList.remove('hidden');
    setTimeout(function() { document.getElementById('nbResidentRoleInput').focus(); }, 80);
}

function _nbResidentPickerBack() {
    document.getElementById('nbResidentSearchStep').classList.remove('hidden');
    document.getElementById('nbResidentRoleStep').classList.add('hidden');
    document.getElementById('nbResidentPickerSaveBtn').classList.add('hidden');
    document.getElementById('nbResidentPickerBackBtn').classList.add('hidden');
}

async function _nbSaveResident() {
    var role = document.getElementById('nbResidentRoleInput').value.trim();
    if (!role) { alert('Please enter a role.'); return; }
    if (!_nbPickedContactId || !_nbCurrentResidentHouseId) return;

    var btn = document.getElementById('nbResidentPickerSaveBtn');
    btn.disabled = true; btn.textContent = 'Adding…';
    try {
        await userCol('neighborHouseResidents').add({
            houseId:         _nbCurrentResidentHouseId,
            personId:        _nbPickedContactId,
            role:            role,
            archived:        false,
            archivedGroupId: null,
            createdAt:       firebase.firestore.FieldValue.serverTimestamp()
        });
        closeModal('nbResidentPickerModal');
        _nbLoadResidents(_nbCurrentResidentHouseId);
    } catch (e) {
        alert('Failed to add resident.');
        console.error('_nbSaveResident:', e);
    } finally {
        btn.disabled = false; btn.textContent = 'Add Resident';
    }
}

// ============================================================
// ADD NEW PERSON — create contact + link to house
// ============================================================

function _nbOpenNewPersonModal(houseId) {
    _nbCurrentResidentHouseId = houseId;
    document.getElementById('nbNewNeighborName').value  = '';
    document.getElementById('nbNewNeighborRole').value  = '';
    document.getElementById('nbNewNeighborPhone').value = '';
    document.getElementById('nbNewNeighborEmail').value = '';
    document.getElementById('nbNewNeighborSaveBtn').disabled = true;
    openModal('nbNewNeighborModal');
    setTimeout(function() { document.getElementById('nbNewNeighborName').focus(); }, 100);
}

function _nbUpdateNewNeighborSaveBtn() {
    var name = document.getElementById('nbNewNeighborName').value.trim();
    var role = document.getElementById('nbNewNeighborRole').value.trim();
    document.getElementById('nbNewNeighborSaveBtn').disabled = !(name && role);
}

async function _nbSaveNewNeighbor() {
    var name  = document.getElementById('nbNewNeighborName').value.trim();
    var role  = document.getElementById('nbNewNeighborRole').value.trim();
    var phone = document.getElementById('nbNewNeighborPhone').value.trim();
    var email = document.getElementById('nbNewNeighborEmail').value.trim();

    if (!name) { alert('Please enter a name.'); return; }
    if (!role) { alert('Please enter a role.'); return; }

    var btn = document.getElementById('nbNewNeighborSaveBtn');
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
        var personRef = await userCol('people').add({
            name:          name,
            category:      'Personal',
            personalType:  'Neighbor',
            phone:         phone || '',
            email:         email || '',
            quickMention:  false,
            isMe:          false,
            createdAt:     firebase.firestore.FieldValue.serverTimestamp()
        });
        await userCol('neighborHouseResidents').add({
            houseId:         _nbCurrentResidentHouseId,
            personId:        personRef.id,
            role:            role,
            archived:        false,
            archivedGroupId: null,
            createdAt:       firebase.firestore.FieldValue.serverTimestamp()
        });
        closeModal('nbNewNeighborModal');
        _nbLoadResidents(_nbCurrentResidentHouseId);
    } catch (e) {
        alert('Failed to save. Please try again.');
        console.error('_nbSaveNewNeighbor:', e);
    } finally {
        btn.disabled = false; btn.textContent = 'Add Person';
    }
}

// ============================================================
// HOUSE NOTES
// ============================================================

async function _nbLoadHouseNotes(houseId) {
    var container = document.getElementById('nbHouseNotesContainer');
    var emptyEl   = document.getElementById('nbHouseNotesEmpty');
    container.innerHTML = '<p class="loading-text">Loading…</p>';
    emptyEl.classList.add('hidden');

    try {
        var snap = await userCol('neighborHouseNotes')
            .where('houseId', '==', houseId)
            .get();

        if (snap.empty) {
            container.innerHTML = '';
            emptyEl.classList.remove('hidden');
            return;
        }

        var notes = snap.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });
        notes.sort(function(a, b) { return (b.date || '').localeCompare(a.date || ''); });

        container.innerHTML = notes.map(function(note) {
            return '<div class="nb-note-item">' +
                '<div class="nb-note-meta">' +
                    '<span class="nb-note-date">' + escapeHtml(_nbFormatDate(note.date)) + '</span>' +
                    '<div class="nb-note-actions">' +
                        '<button class="btn btn-link" onclick="_nbOpenHouseNoteModal(\'' + houseId + '\',\'' + note.id + '\')">Edit</button>' +
                        '<button class="btn btn-link btn-link--danger" onclick="_nbDeleteHouseNote(\'' + note.id + '\',\'' + houseId + '\')">Delete</button>' +
                    '</div>' +
                '</div>' +
                '<div class="nb-note-text">' + escapeHtml(note.text || '') + '</div>' +
            '</div>';
        }).join('');
    } catch (e) {
        container.innerHTML = '<p class="error-text">Failed to load notes.</p>';
        console.error('_nbLoadHouseNotes:', e);
    }
}

async function _nbOpenHouseNoteModal(houseId, noteId) {
    _nbCurrentNoteHouseId = houseId;
    _nbEditingNoteId      = noteId || null;

    if (noteId) {
        document.getElementById('nbHouseNoteModalTitle').textContent = 'Edit Note';
        try {
            var snap = await userCol('neighborHouseNotes').doc(noteId).get();
            var note = snap.data() || {};
            document.getElementById('nbHouseNoteDate').value = note.date || '';
            document.getElementById('nbHouseNoteText').value = note.text || '';
        } catch (e) { console.error('_nbOpenHouseNoteModal fetch:', e); }
    } else {
        document.getElementById('nbHouseNoteModalTitle').textContent = 'Add House Note';
        document.getElementById('nbHouseNoteDate').value = new Date().toISOString().split('T')[0];
        document.getElementById('nbHouseNoteText').value = '';
    }
    openModal('nbHouseNoteModal');
    setTimeout(function() { document.getElementById('nbHouseNoteText').focus(); }, 100);
}

async function _nbSaveHouseNote() {
    var date = document.getElementById('nbHouseNoteDate').value;
    var text = document.getElementById('nbHouseNoteText').value.trim();
    if (!text) { alert('Please enter a note.'); return; }

    var btn = document.getElementById('nbHouseNoteSaveBtn');
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
        if (_nbEditingNoteId) {
            await userCol('neighborHouseNotes').doc(_nbEditingNoteId).update({ date: date, text: text });
        } else {
            await userCol('neighborHouseNotes').add({
                houseId:   _nbCurrentNoteHouseId,
                date:      date || new Date().toISOString().split('T')[0],
                text:      text,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        closeModal('nbHouseNoteModal');
        _nbLoadHouseNotes(_nbCurrentNoteHouseId);
    } catch (e) {
        alert('Save failed. Please try again.');
        console.error('_nbSaveHouseNote:', e);
    } finally {
        btn.disabled = false; btn.textContent = 'Save';
    }
}

async function _nbDeleteHouseNote(noteId, houseId) {
    if (!confirm('Delete this note?')) return;
    try {
        await userCol('neighborHouseNotes').doc(noteId).delete();
        _nbLoadHouseNotes(houseId);
    } catch (e) {
        alert('Failed to delete note.');
        console.error('_nbDeleteHouseNote:', e);
    }
}

// ============================================================
// DELETE / ARCHIVE MODAL  (Phase 3)
// ============================================================

function _nbOpenDeleteHouseModal(house) {
    _nbDeleteTargetHouse = house;
    _nbDeleteChoice      = 'archive';
    document.getElementById('nbDeleteMoveNote').value = '';
    document.getElementById('nbDeleteArchiveExtra').style.display = '';
    // Reset visual selection to archive
    document.getElementById('nbDeleteOptionArchive').classList.add('nb-delete-option--active');
    document.getElementById('nbDeleteOptionHard').classList.remove('nb-delete-option--active');
    document.getElementById('nbDeleteRadioArchive').textContent = '●';
    document.getElementById('nbDeleteRadioHard').textContent = '○';
    openModal('nbDeleteHouseModal');
}

function _nbSelectDeleteOption(choice) {
    _nbDeleteChoice = choice;
    var archiveEl = document.getElementById('nbDeleteOptionArchive');
    var hardEl    = document.getElementById('nbDeleteOptionHard');
    var radioA    = document.getElementById('nbDeleteRadioArchive');
    var radioH    = document.getElementById('nbDeleteRadioHard');
    var extra     = document.getElementById('nbDeleteArchiveExtra');

    if (choice === 'archive') {
        archiveEl.classList.add('nb-delete-option--active');
        hardEl.classList.remove('nb-delete-option--active');
        radioA.textContent = '●';
        radioH.textContent = '○';
        extra.style.display = '';
    } else {
        hardEl.classList.add('nb-delete-option--active');
        archiveEl.classList.remove('nb-delete-option--active');
        radioH.textContent = '●';
        radioA.textContent = '○';
        extra.style.display = 'none';
    }
}

async function _nbConfirmHouseAction() {
    if (!_nbDeleteTargetHouse) return;
    var btn = document.getElementById('nbDeleteHouseConfirmBtn');
    btn.disabled = true; btn.textContent = 'Working…';
    try {
        if (_nbDeleteChoice === 'archive') {
            await _nbArchiveFamily(_nbDeleteTargetHouse);
        } else {
            await _nbHardDeleteHouse(_nbDeleteTargetHouse);
        }
    } catch (e) {
        alert('Action failed. Please try again.');
        console.error('_nbConfirmHouseAction:', e);
    } finally {
        btn.disabled = false; btn.textContent = 'Confirm';
    }
}

// Archive flow: snapshot current residents, mark them archived, clear lastInteractionAt
async function _nbArchiveFamily(house) {
    var moveNote = document.getElementById('nbDeleteMoveNote').value.trim();

    // Snapshot all current residents
    var residentsSnap = await userCol('neighborHouseResidents')
        .where('houseId', '==', house.id)
        .where('archived', '==', false)
        .get();

    // Create archived family record
    var archiveRef = await userCol('neighborArchivedFamilies').add({
        houseId:    house.id,
        address:    house.address || house.nickname || '',
        archivedAt: firebase.firestore.FieldValue.serverTimestamp(),
        notes:      moveNote
    });

    // Batch: mark all current residents archived + clear house lastInteractionAt
    var batch = db.batch();
    residentsSnap.forEach(function(d) {
        batch.update(d.ref, { archived: true, archivedGroupId: archiveRef.id });
    });
    batch.update(userCol('neighborHouses').doc(house.id), { lastInteractionAt: null });
    await batch.commit();

    closeModal('nbDeleteHouseModal');
    // Reload the house page to show empty residents + new Previous Families entry
    loadNeighborHousePage(house.id);
}

// Hard delete: remove pin, all notes, resident links, archived family records
async function _nbHardDeleteHouse(house) {
    await _nbDeleteHouseData(house.id);
    closeModal('nbDeleteHouseModal');
    window.location.hash = '#neighborhood/' + house.neighborhoodId;
}

// ============================================================
// PREVIOUS FAMILIES (Phase 3)
// ============================================================

async function _nbLoadPreviousFamilies(houseId) {
    var section   = document.getElementById('nbPreviousFamiliesSection');
    var container = document.getElementById('nbPreviousFamiliesContainer');

    try {
        var snap = await userCol('neighborArchivedFamilies')
            .where('houseId', '==', houseId)
            .get();

        if (snap.empty) {
            section.classList.add('hidden');
            return;
        }

        var archives = snap.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });
        archives.sort(function(a, b) {
            var ta = a.archivedAt && a.archivedAt.toMillis ? a.archivedAt.toMillis() : 0;
            var tb = b.archivedAt && b.archivedAt.toMillis ? b.archivedAt.toMillis() : 0;
            return tb - ta;
        });

        section.classList.remove('hidden');
        container.innerHTML = archives.map(function(a) {
            return _nbBuildArchiveCardHtml(a);
        }).join('');
    } catch (e) {
        console.error('_nbLoadPreviousFamilies:', e);
    }
}

function _nbBuildArchiveCardHtml(archive) {
    var dateStr = '';
    if (archive.archivedAt) {
        var d = archive.archivedAt.toDate ? archive.archivedAt.toDate() : new Date(archive.archivedAt);
        dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
    return '<div class="nb-archive-card" onclick="window.location.hash=\'#neighborarchive/' + archive.id + '\'">' +
        '<div class="nb-archive-card-body">' +
            '<div class="nb-archive-date">Archived ' + escapeHtml(dateStr || 'unknown date') + '</div>' +
            (archive.notes ? '<div class="nb-archive-note">' + escapeHtml(archive.notes) + '</div>' : '') +
        '</div>' +
        '<div class="nb-archive-arrow">&#8250;</div>' +
    '</div>';
}

// ============================================================
// JOURNAL MENTIONS  (Phase 4)
// Shows journal entries that mention any current resident.
// ============================================================

async function _nbLoadJournalMentions(houseId) {
    var section   = document.getElementById('nbJournalMentionsSection');
    var container = document.getElementById('nbJournalMentionsContainer');

    try {
        // Get current resident person IDs for this house
        var resSnap = await userCol('neighborHouseResidents')
            .where('houseId', '==', houseId)
            .where('archived', '==', false)
            .get();

        if (resSnap.empty) {
            section.classList.add('hidden');
            return;
        }

        // Firestore array-contains-any supports max 10 values
        var personIds = resSnap.docs.map(function(d) { return d.data().personId; }).slice(0, 10);

        var entriesSnap = await userCol('journalEntries')
            .where('mentionedPersonIds', 'array-contains-any', personIds)
            .orderBy('date', 'desc')
            .limit(20)
            .get();

        if (entriesSnap.empty) {
            section.classList.add('hidden');
            return;
        }

        section.classList.remove('hidden');
        container.innerHTML = entriesSnap.docs.map(function(d) {
            return _nbBuildJournalMentionCardHtml(Object.assign({ id: d.id }, d.data()));
        }).join('');

    } catch (e) {
        console.error('_nbLoadJournalMentions:', e);
        section.classList.add('hidden');
    }
}

function _nbBuildJournalMentionCardHtml(entry) {
    var dateStr = _nbFormatDate(entry.date);
    var preview = (entry.entryText || '').trim();
    if (preview.length > 140) preview = preview.slice(0, 140) + '…';
    return '<div class="nb-journal-mention-card" onclick="window.location.hash=\'#journal-entry/' + entry.id + '\'">' +
        '<div class="nb-journal-mention-date">' + escapeHtml(dateStr) + '</div>' +
        '<div class="nb-journal-mention-text">' + escapeHtml(preview) + '</div>' +
    '</div>';
}

// ============================================================
// ARCHIVED FAMILY VIEW  (#neighborarchive/{archivedGroupId})
// ============================================================

async function loadNeighborArchivePage(archivedGroupId) {
    try {
        var archiveSnap = await userCol('neighborArchivedFamilies').doc(archivedGroupId).get();
        if (!archiveSnap.exists) { window.location.hash = '#neighbors'; return; }
        var archive = Object.assign({ id: archiveSnap.id }, archiveSnap.data());

        // Load house for breadcrumb + name
        var houseSnap = await userCol('neighborHouses').doc(archive.houseId).get();
        var house = houseSnap.exists
            ? Object.assign({ id: houseSnap.id }, houseSnap.data())
            : { id: archive.houseId, nickname: 'House', neighborhoodId: '' };

        // Breadcrumb
        document.getElementById('breadcrumbBar').innerHTML =
            '<a href="#neighbors">Neighborhoods</a> &rsaquo; ' +
            '<a href="#neighborhood/' + house.neighborhoodId + '">Map</a> &rsaquo; ' +
            '<a href="#neighborhouse/' + archive.houseId + '">' + escapeHtml(house.nickname || 'House') + '</a>';

        // Header
        document.getElementById('nbArchiveHouseName').textContent = house.nickname || 'House';

        var dateStr = '';
        if (archive.archivedAt) {
            var d = archive.archivedAt.toDate ? archive.archivedAt.toDate() : new Date(archive.archivedAt);
            dateStr = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        }
        document.getElementById('nbArchiveBannerDate').textContent =
            'This family no longer lives here' + (dateStr ? ' — archived ' + dateStr : '');

        var noteEl = document.getElementById('nbArchiveMoveNote');
        if (archive.notes) {
            noteEl.textContent = '"' + archive.notes + '"';
            noteEl.style.display = '';
        } else {
            noteEl.style.display = 'none';
        }

        // Load residents in this archive group
        var residentsSnap = await userCol('neighborHouseResidents')
            .where('archivedGroupId', '==', archivedGroupId)
            .get();

        var container = document.getElementById('nbArchiveResidentsContainer');
        var emptyEl   = document.getElementById('nbArchiveResidentsEmpty');

        if (residentsSnap.empty) {
            container.innerHTML = '';
            emptyEl.classList.remove('hidden');
            return;
        }

        emptyEl.classList.add('hidden');
        var residents = residentsSnap.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });

        var personSnaps = await Promise.all(residents.map(function(r) {
            return userCol('people').doc(r.personId).get();
        }));

        container.innerHTML = residents.map(function(resident, i) {
            var snap   = personSnaps[i];
            var person = snap.exists
                ? Object.assign({ id: snap.id }, snap.data())
                : { id: resident.personId, name: '(Unknown)' };
            return _nbBuildArchivedResidentHtml(resident, person);
        }).join('');

    } catch (e) {
        console.error('loadNeighborArchivePage:', e);
    }
}

function _nbBuildArchivedResidentHtml(resident, person) {
    var avatarHtml;
    if (person.profilePhotoData) {
        avatarHtml = '<img class="nb-resident-avatar" src="' + person.profilePhotoData + '" alt="">';
    } else {
        var initials = (person.name || '?')
            .split(' ').map(function(w) { return w[0] || ''; }).slice(0, 2).join('').toUpperCase();
        avatarHtml = '<div class="nb-resident-avatar nb-resident-avatar--initials">' + escapeHtml(initials) + '</div>';
    }
    return '<div class="nb-resident-card">' +
        '<div class="nb-resident-header">' +
            avatarHtml +
            '<div class="nb-resident-info">' +
                '<div class="nb-resident-name">' + escapeHtml(person.name || '') + '</div>' +
                '<span class="nb-resident-role-badge">' + escapeHtml(resident.role || 'Resident') + '</span>' +
            '</div>' +
            '<div class="nb-resident-actions">' +
                '<button class="btn btn-link" onclick="window.location.hash=\'#contact/' + resident.personId + '\'">View Contact</button>' +
            '</div>' +
        '</div>' +
    '</div>';
}

// ============================================================
// lastInteractionAt UPDATE HOOK
// Called by contacts.js after a new peopleInteraction is saved.
// Updates lastInteractionAt on any house where this person is a
// current (non-archived) resident.
// ============================================================

async function _nbUpdateHouseLastInteraction(personId, date) {
    try {
        var snap = await userCol('neighborHouseResidents')
            .where('personId', '==', personId)
            .where('archived', '==', false)
            .get();
        if (snap.empty) return;

        var ts = date ? new Date(date) : new Date();
        var batch = db.batch();
        snap.forEach(function(d) {
            batch.update(userCol('neighborHouses').doc(d.data().houseId), { lastInteractionAt: ts });
        });
        await batch.commit();

        // Update in-memory house if we're currently on that house detail page
        if (_nbCurrentHouse) {
            var match = snap.docs.find(function(d) { return d.data().houseId === _nbCurrentHouse.id; });
            if (match) _nbCurrentHouse.lastInteractionAt = ts;
        }
    } catch (e) {
        console.error('_nbUpdateHouseLastInteraction:', e);
    }
}

// ============================================================
// DATE HELPER
// ============================================================

function _nbFormatDate(dateStr) {
    if (!dateStr) return '';
    var d = new Date(dateStr + 'T12:00:00'); // noon prevents timezone-off-by-one
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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
