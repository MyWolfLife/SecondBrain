// ============================================================
// Weeds.js — Weed type CRUD, zone assignment, and display logic
// Tracks weed types found in the yard: their treatment methods,
// application timing, affected zones, photos, and activity history.
// Firestore collection: "weeds"
// ============================================================

// ---------- Load & Display: Weed List Page ----------

/**
 * Loads all weed types and displays them on the weeds list page.
 */
async function loadWeedsList() {
    var container = document.getElementById('weedsListContainer');
    var emptyState = document.getElementById('weedsEmptyState');

    try {
        var snapshot = await yardCol('weeds').get();

        container.innerHTML = '';

        if (snapshot.empty) {
            emptyState.textContent = 'No weeds tracked yet — add one to get started!';
            emptyState.style.display = 'block';
            return;
        }

        emptyState.style.display = 'none';

        // Sort alphabetically by name
        var weeds = [];
        snapshot.forEach(function(doc) {
            weeds.push({ id: doc.id, ...doc.data() });
        });
        weeds.sort(function(a, b) {
            return a.name.localeCompare(b.name);
        });

        // Build a card for each weed — thumbnail comes from profilePhotoData on the doc
        weeds.forEach(function(weed) {
            var card = createWeedCard(weed.id, weed, weed.profilePhotoData || null);
            container.appendChild(card);
        });

    } catch (error) {
        console.error('Error loading weeds:', error);
        emptyState.textContent = 'Error loading weeds. Check console for details.';
        emptyState.style.display = 'block';
    }
}

// ---------- Create a Weed Card Element ----------

/**
 * Creates a clickable card element for a weed type.
 * @param {string} id - The weed's Firestore document ID.
 * @param {Object} weed - The weed data.
 * @returns {HTMLElement} The card element.
 */
function createWeedCard(id, weed, thumbData) {
    var card = document.createElement('div');
    card.className = 'card';
    card.addEventListener('click', function() {
        window.location.hash = 'weed/' + id;
    });

    // Profile thumbnail on the left side (if set)
    if (thumbData) {
        var thumb = document.createElement('img');
        thumb.src = thumbData;
        thumb.className = 'entity-card-thumb';
        thumb.alt = weed.name;
        card.appendChild(thumb);
    }

    var info = document.createElement('div');
    info.style.flex = '1';

    var title = document.createElement('div');
    title.className = 'card-title';
    title.textContent = weed.name;
    info.appendChild(title);

    // Show treatment method as subtitle
    var subtitleParts = [];
    if (weed.treatmentMethod) subtitleParts.push(weed.treatmentMethod);
    if (weed.applicationTiming) subtitleParts.push(weed.applicationTiming);
    if (subtitleParts.length > 0) {
        var subtitle = document.createElement('div');
        subtitle.className = 'card-subtitle';
        subtitle.textContent = subtitleParts.join(' | ');
        info.appendChild(subtitle);
    }

    card.appendChild(info);

    var arrow = document.createElement('span');
    arrow.className = 'card-arrow';
    arrow.textContent = '\u203A';
    card.appendChild(arrow);

    return card;
}

// ---------- Load & Display: Weed Detail Page ----------

/**
 * Loads a weed's details: info, affected zones, photos, and activity history.
 * @param {string} weedId - The Firestore document ID of the weed.
 */
async function loadWeedDetail(weedId) {
    var titleEl = document.getElementById('weedTitle');

    try {
        await yardEnsureFor('weeds', weedId);
        var doc = await yardCol('weeds').doc(weedId).get();

        if (!doc.exists) {
            titleEl.textContent = 'Weed not found';
            return;
        }

        var weed = doc.data();
        titleEl.textContent = weed.name;

        // Store current weed info for use by buttons
        window.currentWeed = { id: doc.id, ...weed };
        yShowWho('weedTitle', weed);

        // Build breadcrumbs: Home (Weeds) > Weed Name
        buildWeedBreadcrumbs(weed.name);

        // Display treatment info
        var treatmentEl = document.getElementById('weedTreatmentMethod');
        treatmentEl.textContent = weed.treatmentMethod || 'Not specified';
        if (!weed.treatmentMethod) treatmentEl.classList.add('empty-field');
        else treatmentEl.classList.remove('empty-field');

        var timingEl = document.getElementById('weedApplicationTiming');
        timingEl.textContent = weed.applicationTiming || 'Not specified';
        if (!weed.applicationTiming) timingEl.classList.add('empty-field');
        else timingEl.classList.remove('empty-field');

        var notesEl = document.getElementById('weedNotesDisplay');
        notesEl.textContent = weed.notes || 'No notes.';
        if (!weed.notes) notesEl.classList.add('empty-field');
        else notesEl.classList.remove('empty-field');

        // Load affected zones
        await loadWeedZones(weed.zoneIds || []);

        // Load facts
        loadFacts('weed', doc.id, 'weedFactsContainer', 'weedFactsEmptyState');

        // Load photos
        loadPhotos('weed', doc.id, 'weedPhotoContainer', 'weedPhotoEmptyState');

        // Load activity history
        loadActivities('weed', doc.id, 'weedActivityContainer', 'weedActivityEmptyState');

    } catch (error) {
        console.error('Error loading weed detail:', error);
        titleEl.textContent = 'Error loading weed';
    }
}

// ---------- Weed Breadcrumbs ----------

/**
 * Builds breadcrumbs for the weed detail page: Weeds > Weed Name
 * @param {string} weedName - The weed's name.
 */
function buildWeedBreadcrumbs(weedName) {
    var breadcrumbBar = document.getElementById('breadcrumbBar');
    var html = '<a href="#weeds">Weeds</a>';
    html += '<span class="separator">&rsaquo;</span>';
    html += '<span>' + escapeHtml(weedName) + '</span>';
    breadcrumbBar.innerHTML = html;
}

// ---------- Load Affected Zones ----------

/**
 * Loads and displays the affected zones for a weed.
 * Shows zone names as clickable links.
 * @param {Array} zoneIds - Array of zone IDs the weed is found in.
 */
async function loadWeedZones(zoneIds) {
    var container = document.getElementById('weedZonesContainer');
    var emptyState = document.getElementById('weedZonesEmptyState');

    container.innerHTML = '';

    if (!zoneIds || zoneIds.length === 0) {
        emptyState.textContent = 'No zones assigned yet.';
        emptyState.style.display = 'block';
        return;
    }

    emptyState.style.display = 'none';

    // Load zone names and build links
    for (var i = 0; i < zoneIds.length; i++) {
        try {
            var zoneDoc = await yardCol('zones').doc(zoneIds[i]).get();
            if (zoneDoc.exists) {
                var zonePath = await getZonePath(zoneIds[i]);
                var link = document.createElement('a');
                link.className = 'weed-zone-link';
                link.href = '#zone/' + zoneIds[i];
                link.innerHTML = zonePath;
                container.appendChild(link);
            }
        } catch (e) {
            console.error('Error loading zone for weed:', e);
        }
    }
}

// ---------- Add/Edit Weed Modal ----------

/**
 * Opens the add-weed modal.
 */
function openAddWeedModal() {
    var modal = document.getElementById('weedModal');
    var modalTitle = document.getElementById('weedModalTitle');
    var nameInput = document.getElementById('weedNameInput');
    var treatmentInput = document.getElementById('weedTreatmentInput');
    var timingInput = document.getElementById('weedTimingInput');
    var notesInput = document.getElementById('weedNotesInput');

    modalTitle.textContent = 'Add Weed';
    nameInput.value = '';
    treatmentInput.value = '';
    timingInput.value = '';
    notesInput.value = '';

    modal.dataset.mode = 'add';

    // Reset and conditionally show From Picture section
    document.getElementById('weedFromPictureSection').classList.add('hidden');
    document.getElementById('weedPicStatus').classList.add('hidden');
    document.getElementById('weedPicStatus').textContent = '';
    document.getElementById('weedPicInput').value = '';
    document.getElementById('weedCamInput').value = '';
    weedCheckLlmForModal();

    openModal('weedModal');
    nameInput.focus();
}

/**
 * Opens the edit-weed modal for an existing weed.
 */
function openEditWeedModal() {
    if (!window.currentWeed) return;

    var modal = document.getElementById('weedModal');
    var modalTitle = document.getElementById('weedModalTitle');
    var nameInput = document.getElementById('weedNameInput');
    var treatmentInput = document.getElementById('weedTreatmentInput');
    var timingInput = document.getElementById('weedTimingInput');
    var notesInput = document.getElementById('weedNotesInput');

    modalTitle.textContent = 'Edit Weed';
    nameInput.value = window.currentWeed.name || '';
    treatmentInput.value = window.currentWeed.treatmentMethod || '';
    timingInput.value = window.currentWeed.applicationTiming || '';
    notesInput.value = window.currentWeed.notes || '';

    modal.dataset.mode = 'edit';
    modal.dataset.editId = window.currentWeed.id;

    openModal('weedModal');
    nameInput.focus();
}

/**
 * Handles the save button in the weed modal (add or edit).
 */
async function handleWeedModalSave() {
    var modal = document.getElementById('weedModal');
    var nameInput = document.getElementById('weedNameInput');
    var treatmentInput = document.getElementById('weedTreatmentInput');
    var timingInput = document.getElementById('weedTimingInput');
    var notesInput = document.getElementById('weedNotesInput');

    var name = nameInput.value.trim();
    var treatmentMethod = treatmentInput.value.trim();
    var applicationTiming = timingInput.value.trim();
    var notes = notesInput.value.trim();

    if (!name) {
        alert('Please enter a weed name.');
        return;
    }

    var mode = modal.dataset.mode;

    try {
        if (mode === 'add') {
            await yardCol('weeds').add({
                name: name,
                treatmentMethod: treatmentMethod,
                applicationTiming: applicationTiming,
                notes: notes,
                zoneIds: [],
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            console.log('Weed added:', name);

        } else if (mode === 'edit') {
            var weedId = modal.dataset.editId;
            await yardCol('weeds').doc(weedId).update({
                name: name,
                treatmentMethod: treatmentMethod,
                applicationTiming: applicationTiming,
                notes: notes
            });
            console.log('Weed updated:', name);
        }

        closeModal('weedModal');

        // Refresh the current view
        var hash = window.location.hash.slice(1) || 'home';
        var parts = hash.split('/');
        if (parts[0] === 'weed' && parts[1]) {
            loadWeedDetail(parts[1]);
        } else {
            loadWeedsList();
        }

    } catch (error) {
        console.error('Error saving weed:', error);
        alert('Error saving weed. Check console for details.');
    }
}

// ---------- Delete Weed ----------

/**
 * Deletes a weed after confirmation.
 */
async function handleDeleteWeed() {
    if (!window.currentWeed) return;

    if (!confirm('Are you sure you want to delete "' + window.currentWeed.name + '"? This will also remove all associated activities and photos.')) {
        return;
    }

    try {
        var weedId = window.currentWeed.id;

        // Delete associated activities
        var actSnapshot = await yTargetCol('activities', 'weed')
            .where('targetType', '==', 'weed')
            .where('targetId', '==', weedId)
            .get();
        var deletePromises = [];
        actSnapshot.forEach(function(doc) {
            deletePromises.push(doc.ref.delete());
        });

        // Delete associated photos
        var photoSnapshot = await yTargetCol('photos', 'weed')
            .where('targetType', '==', 'weed')
            .where('targetId', '==', weedId)
            .get();
        photoSnapshot.forEach(function(doc) {
            deletePromises.push(doc.ref.delete());
        });

        await Promise.all(deletePromises);

        // Delete the weed itself
        await yardCol('weeds').doc(weedId).delete();
        console.log('Weed deleted:', window.currentWeed.name);

        // Navigate back to weeds list
        window.location.hash = 'weeds';

    } catch (error) {
        console.error('Error deleting weed:', error);
        alert('Error deleting weed. Check console for details.');
    }
}

// ---------- Zone Assignment Modal ----------

/**
 * Opens the zone assignment modal for the current weed.
 * Shows checkboxes for all zones with hierarchy indentation.
 */
async function openWeedZoneModal() {
    if (!window.currentWeed) return;

    var container = document.getElementById('weedZoneCheckboxList');
    container.innerHTML = '<p class="empty-state">Loading zones...</p>';

    openModal('weedZoneModal');

    try {
        // Load all zones
        var snapshot = await yardCol('zones').get();
        var allZones = [];
        snapshot.forEach(function(doc) {
            allZones.push({ id: doc.id, ...doc.data() });
        });

        // Build flat list with hierarchy indentation (reuse from plants.js)
        var options = buildZoneOptionsTree(allZones, null, '');

        container.innerHTML = '';

        if (options.length === 0) {
            container.innerHTML = '<p class="empty-state">No zones created yet.</p>';
            return;
        }

        var currentZoneIds = window.currentWeed.zoneIds || [];

        options.forEach(function(opt) {
            var wrapper = document.createElement('label');
            wrapper.className = 'zone-checkbox-item';

            var checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = opt.id;
            checkbox.checked = currentZoneIds.indexOf(opt.id) !== -1;

            var text = document.createElement('span');
            text.textContent = opt.label;

            wrapper.appendChild(checkbox);
            wrapper.appendChild(text);
            container.appendChild(wrapper);
        });

    } catch (error) {
        console.error('Error loading zones for weed assignment:', error);
        container.innerHTML = '<p class="empty-state">Error loading zones.</p>';
    }
}

/**
 * Saves the zone assignments from the zone assignment modal.
 */
async function handleWeedZoneSave() {
    if (!window.currentWeed) return;

    var container = document.getElementById('weedZoneCheckboxList');
    var checkboxes = container.querySelectorAll('input[type="checkbox"]');
    var selectedZoneIds = [];

    checkboxes.forEach(function(cb) {
        if (cb.checked) {
            selectedZoneIds.push(cb.value);
        }
    });

    try {
        await yardCol('weeds').doc(window.currentWeed.id).update({
            zoneIds: selectedZoneIds
        });

        console.log('Weed zones updated:', selectedZoneIds.length, 'zones');
        closeModal('weedZoneModal');

        // Update local state and refresh zones display
        window.currentWeed.zoneIds = selectedZoneIds;
        await loadWeedZones(selectedZoneIds);

    } catch (error) {
        console.error('Error saving weed zones:', error);
        alert('Error saving zone assignments. Check console for details.');
    }
}

// ---------- Event Listeners ----------

document.addEventListener('DOMContentLoaded', function() {

    // "Add Weed" button on weeds list page
    document.getElementById('addWeedBtn').addEventListener('click', function() {
        openAddWeedModal();
    });

    // "Edit" button on weed detail page
    document.getElementById('editWeedBtn').addEventListener('click', function() {
        openEditWeedModal();
    });

    // "Delete" button on weed detail page
    document.getElementById('deleteWeedBtn').addEventListener('click', function() {
        handleDeleteWeed();
    });

    // "Manage Zones" button on weed detail page
    document.getElementById('manageWeedZonesBtn').addEventListener('click', function() {
        openWeedZoneModal();
    });

    // "Log Activity" button on weed detail page
    document.getElementById('logWeedActivityBtn').addEventListener('click', function() {
        if (window.currentWeed) {
            openLogActivityModal('weed', window.currentWeed.id);
        }
    });

    document.getElementById('addWeedCameraBtn').addEventListener('click', function() {
        if (window.currentWeed) triggerCameraUpload('weed', window.currentWeed.id);
    });
    document.getElementById('addWeedGalleryBtn').addEventListener('click', function() {
        if (window.currentWeed) triggerGalleryUpload('weed', window.currentWeed.id);
    });

    // Weed modal — Save button
    document.getElementById('weedModalSaveBtn').addEventListener('click', handleWeedModalSave);

    // Weed modal — Cancel button
    document.getElementById('weedModalCancelBtn').addEventListener('click', function() {
        closeModal('weedModal');
    });

    // Weed modal — Close on overlay click
    document.getElementById('weedModal').addEventListener('click', function(e) {
        if (e.target === this) closeModal('weedModal');
    });

    // Weed modal — Enter key to save (on name input)
    document.getElementById('weedNameInput').addEventListener('keydown', function(e) {
        if (e.key === 'Enter') handleWeedModalSave();
    });

    // Zone assignment modal — Save button
    document.getElementById('weedZoneSaveBtn').addEventListener('click', handleWeedZoneSave);

    // Zone assignment modal — Cancel button
    document.getElementById('weedZoneCancelBtn').addEventListener('click', function() {
        closeModal('weedZoneModal');
    });

    // Zone assignment modal — Close on overlay click
    document.getElementById('weedZoneModal').addEventListener('click', function(e) {
        if (e.target === this) closeModal('weedZoneModal');
    });

    // From Picture — gallery and camera buttons inside the Add Weed modal
    // These use the staging flow so the user can add up to 4 photos with crop support.
    document.getElementById('weedPicGalleryBtn').addEventListener('click', function() {
        openLlmPhotoStaging('Identify Weed', function(images) {
            weedSendToLlm(images);
        });
    });
    document.getElementById('weedPicCameraBtn').addEventListener('click', function() {
        openLlmPhotoStaging('Identify Weed', function(images) {
            weedSendToLlm(images);
        });
    });
    // Legacy file inputs kept in HTML but no longer used as primary triggers.
    // Kept wired for safety in case another code path fires them.
    document.getElementById('weedPicInput').addEventListener('change', function() {
        if (this.files && this.files.length > 0) weedHandleFromPicture(this.files);
    });
    document.getElementById('weedCamInput').addEventListener('change', function() {
        if (this.files && this.files.length > 0) weedHandleFromPicture(this.files);
    });

    // "+Photo" button on the weeds LIST page — quick-identify without opening Add Weed modal
    var weedQuickPhotoBtn = document.getElementById('weedQuickPhotoBtn');
    if (weedQuickPhotoBtn) {
        weedQuickPhotoBtn.addEventListener('click', async function() {
            // Check LLM configured before opening staging
            try {
                var doc = await userCol('settings').doc('llm').get();
                var ok  = doc.exists && doc.data().provider && doc.data().apiKey;
                if (!ok) { alert('LLM not configured. Go to Settings.'); return; }
            } catch (e) {
                alert('Error checking LLM config. Please try again.');
                return;
            }
            openLlmPhotoStaging('Identify Weed', function(images) {
                weedSendToLlm(images);
            });
        });
    }

    // Review modal — Add It
    document.getElementById('weedReviewAddBtn').addEventListener('click', async function() {
        if (!weedLlmPending) return;
        var btn          = this;
        var nameOverride = document.getElementById('weedReviewName').value.trim();

        // Duplicate detection: check if the LLM flagged an existing weed match
        var pending = weedLlmPending;
        if (pending.parsed.existingWeedId && pending.existingWeedsMap && pending.existingWeedsMap[pending.parsed.existingWeedId]) {
            var matchName = pending.existingWeedsMap[pending.parsed.existingWeedId];
            weedLlmPending = null;
            closeModal('weedLlmReviewModal');
            var goToIt = confirm(
                '\u26a0\ufe0f "' + matchName + '" already exists in your weed collection.\n\n' +
                'Would you like to go to that weed?'
            );
            if (goToIt) {
                location.hash = '#weed/' + pending.parsed.existingWeedId;
            } else {
                location.hash = '#weeds';
            }
            return;
        }

        btn.disabled     = true;
        btn.textContent  = 'Saving\u2026';
        try {
            await weedSaveFromLlm(pending.parsed, pending.images, nameOverride);
            weedLlmPending = null;
            closeModal('weedLlmReviewModal');
            loadWeedsList();
        } catch (err) {
            console.error('Error saving weed from LLM:', err);
            alert('Error saving weed. Please try again.');
            btn.disabled    = false;
            btn.textContent = 'Add It';
        }
    });

    // Review modal — Cancel
    document.getElementById('weedReviewCancelBtn').addEventListener('click', function() {
        weedLlmPending = null;
        closeModal('weedLlmReviewModal');
    });
    document.getElementById('weedLlmReviewModal').addEventListener('click', function(e) {
        if (e.target === this) {
            weedLlmPending = null;
            closeModal('weedLlmReviewModal');
        }
    });
});

// ============================================================
// WEED IDENTIFICATION FROM PICTURE
// ============================================================

var WEED_ID_PROMPT = [
    'You are a weed identification assistant. Analyze the provided image(s) and return ONLY a valid JSON object.',
    'No explanation, no markdown, no code blocks, no extra text of any kind.',
    'Your entire response must be parseable by JSON.parse().',
    '',
    'Return this exact structure:',
    '{',
    '  "name": "",',
    '  "treatmentMethod": "",',
    '  "applicationTiming": "",',
    '  "whatToLookFor": "",',
    '  "urlMoreInfo": "",',
    '  "existingWeedId": "",',
    '  "additionalMessage": ""',
    '}',
    '',
    'Field rules:',
    '- name: the most recognizable common name, e.g. "Crabgrass", "Wild Onion", "Dandelion"',
    '- treatmentMethod: how to treat or eliminate this weed. 100 words or less.',
    '- applicationTiming: when to apply the treatment, e.g. "Pre-emergent in early spring", "As-needed", "Fall application"',
    '- whatToLookFor: key visual characteristics to help identify this weed in the future. 100 words or less.',
    '- urlMoreInfo: MUST be a real, working URL that directly corresponds to the identified weed.',
    '  Prefer .edu, .gov, or university extension websites.',
    '  The page MUST clearly reference the weed in the title or main content.',
    '  Do NOT guess or fabricate URLs.',
    '  If you are not completely certain the URL is correct, return "".',
    '- existingWeedId: if the identified weed appears to match one of the existing weeds provided below,',
    '  return its exact ID string. If there is no match, return "".',
    '- additionalMessage: use for issues such as unclear image or weed not recognized. Leave "" if no issues.',
    '',
    'If you cannot identify the weed, return all fields as "" and explain in additionalMessage.'
].join('\n');

// Pending data while the review modal is open
var weedLlmPending = null;

/**
 * Check if an LLM is configured and show the From Picture section if so.
 */
async function weedCheckLlmForModal() {
    try {
        var doc = await userCol('settings').doc('llm').get();
        var ok  = doc.exists && doc.data().provider && doc.data().apiKey;
        document.getElementById('weedFromPictureSection').classList.toggle('hidden', !ok);
    } catch (e) { /* leave hidden */ }
}

/**
 * Handle file selection for weed identification (from within the Add Weed modal).
 * Images are already-compressed base64 strings (passed from the staging flow, or
 * directly from the in-modal gallery/camera inputs for backward compatibility).
 * @param {FileList|File[]} files - Raw files from the in-modal inputs (legacy path)
 */
async function weedHandleFromPicture(files) {
    if (!files || files.length === 0) return;

    var statusEl   = document.getElementById('weedPicStatus');
    var saveBtn    = document.getElementById('weedModalSaveBtn');
    var galleryBtn = document.getElementById('weedPicGalleryBtn');
    var cameraBtn  = document.getElementById('weedPicCameraBtn');

    statusEl.textContent = 'Identifying weed\u2026';
    statusEl.classList.remove('hidden');
    saveBtn.disabled    = true;
    galleryBtn.disabled = true;
    cameraBtn.disabled  = true;

    try {
        // Compress images (up to 4)
        var images = [];
        for (var i = 0; i < Math.min(files.length, 4); i++) {
            images.push(await compressImage(files[i]));
        }
        await weedSendToLlm(images);
    } catch (err) {
        console.error('Weed ID error:', err);
        statusEl.textContent = 'Error: ' + err.message;
    } finally {
        saveBtn.disabled    = false;
        galleryBtn.disabled = false;
        cameraBtn.disabled  = false;
        document.getElementById('weedPicInput').value = '';
        document.getElementById('weedCamInput').value = '';
    }
}

/**
 * Send already-compressed base64 images to the LLM for weed identification.
 * Called from both the in-modal flow (weedHandleFromPicture) and the staging flow.
 * @param {string[]} images - Array of base64 data URL strings (already compressed)
 */
async function weedSendToLlm(images) {
    var statusEl   = document.getElementById('weedPicStatus');
    var saveBtn    = document.getElementById('weedModalSaveBtn');
    var galleryBtn = document.getElementById('weedPicGalleryBtn');
    var cameraBtn  = document.getElementById('weedPicCameraBtn');

    // Show status in modal if it's open, otherwise we run silently
    var modalOpen = document.getElementById('weedModal') &&
                    document.getElementById('weedModal').classList.contains('active');
    if (modalOpen && statusEl) {
        statusEl.textContent = 'Identifying weed\u2026';
        statusEl.classList.remove('hidden');
        if (saveBtn)    saveBtn.disabled    = true;
        if (galleryBtn) galleryBtn.disabled = true;
        if (cameraBtn)  cameraBtn.disabled  = true;
    }

    try {
        // Load LLM config
        var cfgDoc = await userCol('settings').doc('llm').get();
        var cfg    = cfgDoc.exists ? cfgDoc.data() : null;
        if (!cfg || !cfg.provider || !cfg.apiKey) {
            if (modalOpen && statusEl) statusEl.textContent = 'No LLM configured. Go to Settings.';
            else alert('No LLM configured. Go to Settings.');
            return;
        }
        var llm = LLM_PROVIDERS[cfg.provider];
        if (!llm) {
            if (modalOpen && statusEl) statusEl.textContent = 'Unknown LLM provider.';
            else alert('Unknown LLM provider.');
            return;
        }

        // Append city/state and today's date for seasonal/regional context
        var mainDoc   = await userCol('settings').doc('main').get();
        var cityState = (mainDoc.exists && mainDoc.data().cityState) ? mainDoc.data().cityState.trim() : '';
        var todayStr  = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        var prompt    = WEED_ID_PROMPT;
        if (cityState) prompt += '\n\nLocation: ' + cityState;
        prompt += '\nThis picture was taken ' + todayStr + '.';

        // Fetch existing weeds and append to the prompt so the LLM can detect duplicates
        var existingWeedsSnap = await yardCol('weeds').get();
        var existingWeedsMap  = {};  // id → name, used for the confirm message
        if (!existingWeedsSnap.empty) {
            var weedLines = existingWeedsSnap.docs.map(function(d) {
                existingWeedsMap[d.id] = d.data().name || 'Unknown';
                return d.id + ' | ' + (d.data().name || 'Unknown');
            });
            prompt += '\n\nExisting weeds in this collection (ID | Name):\n' + weedLines.join('\n');
        }

        // Build content: prompt + images (already compressed base64)
        var content = [{ type: 'text', text: prompt }];
        images.forEach(function(url) {
            content.push({ type: 'image_url', image_url: { url: url } });
        });

        var activeModel  = cfg.model || llm.model;
        var responseText = await chatCallOpenAICompat(llm, cfg.apiKey, content, activeModel);
        var parsed       = weedParseLlmResponse(responseText);

        var showToggle = document.getElementById('weedShowResponseToggle');
        if (modalOpen && showToggle && showToggle.checked) {
            weedLlmPending = { parsed: parsed, images: images, existingWeedsMap: existingWeedsMap };
            if (statusEl) { statusEl.textContent = ''; statusEl.classList.add('hidden'); }
            closeModal('weedModal');
            weedShowReviewModal(prompt, responseText, parsed);
        } else {
            // --- Duplicate detection: LLM matched an existing weed ---
            if (parsed.existingWeedId && existingWeedsMap[parsed.existingWeedId]) {
                var matchName = existingWeedsMap[parsed.existingWeedId];
                if (modalOpen) { closeModal('weedModal'); }
                var goToIt = confirm(
                    '\u26a0\ufe0f "' + matchName + '" already exists in your weed collection.\n\n' +
                    'Would you like to go to that weed?'
                );
                if (goToIt) {
                    location.hash = '#weed/' + parsed.existingWeedId;
                } else {
                    location.hash = '#weeds';
                }
                return;
            }

            if (!parsed.name && parsed.additionalMessage) {
                if (modalOpen && statusEl) {
                    statusEl.textContent = '\u26a0 ' + parsed.additionalMessage;
                } else {
                    alert('\u26a0 ' + parsed.additionalMessage);
                }
                return;
            }
            await weedSaveFromLlm(parsed, images, '');
            if (modalOpen && statusEl) { statusEl.textContent = ''; statusEl.classList.add('hidden'); }
            closeModal('weedModal');
            loadWeedsList();
        }

    } catch (err) {
        console.error('Weed ID error:', err);
        if (modalOpen && statusEl) {
            statusEl.textContent = 'Error: ' + err.message;
        } else {
            alert('Error identifying weed: ' + err.message);
        }
    } finally {
        if (modalOpen) {
            if (saveBtn)    saveBtn.disabled    = false;
            if (galleryBtn) galleryBtn.disabled = false;
            if (cameraBtn)  cameraBtn.disabled  = false;
            var picIn = document.getElementById('weedPicInput');
            var camIn = document.getElementById('weedCamInput');
            if (picIn) picIn.value = '';
            if (camIn) camIn.value = '';
        }
    }
}

/**
 * Parse the LLM's JSON response, stripping accidental markdown fences.
 */
function weedParseLlmResponse(text) {
    try {
        var clean = text.trim()
            .replace(/^```json\s*/i, '')
            .replace(/^```\s*/,      '')
            .replace(/```\s*$/,      '');
        return JSON.parse(clean);
    } catch (e) {
        return {
            name: '', treatmentMethod: '', applicationTiming: '',
            additionalMessage: 'Could not parse response: ' + text.substring(0, 120)
        };
    }
}

/**
 * Show the review modal with prompt, raw response, and parsed fields.
 */
function weedShowReviewModal(prompt, rawResponse, parsed) {
    document.getElementById('weedReviewPromptText').textContent  = prompt;
    document.getElementById('weedReviewResponseText').textContent = rawResponse;
    document.getElementById('weedReviewName').value              = parsed.name || '';
    document.getElementById('reviewWeedTreatment').textContent   = parsed.treatmentMethod   || '—';
    document.getElementById('reviewWeedTiming').textContent      = parsed.applicationTiming || '—';
    document.getElementById('reviewWeedWhatToLookFor').textContent = parsed.whatToLookFor   || '—';
    document.getElementById('reviewWeedUrlMoreInfo').textContent   = parsed.urlMoreInfo      || '—';

    var msgEl = document.getElementById('weedReviewMessage');
    if (parsed.additionalMessage) {
        msgEl.textContent = '\u26a0 ' + parsed.additionalMessage;
        msgEl.classList.remove('hidden');
    } else {
        msgEl.classList.add('hidden');
    }

    openModal('weedLlmReviewModal');
}

/**
 * Save the weed record and photos from the LLM response.
 */
async function weedSaveFromLlm(parsed, images, nameOverride) {
    var weedName = (nameOverride || parsed.name || 'Unknown Weed').trim();

    var newRef = await yardCol('weeds').add({
        name              : weedName,
        treatmentMethod   : parsed.treatmentMethod   || '',
        applicationTiming : parsed.applicationTiming || '',
        notes             : parsed.whatToLookFor     || '',   // "what to look for" goes into notes
        zoneIds           : [],
        createdAt         : firebase.firestore.FieldValue.serverTimestamp()
    });

    var identified = !!(parsed.name || nameOverride);

    // Save a fact for the reference URL if the LLM returned one
    if (identified && parsed.urlMoreInfo && parsed.urlMoreInfo.trim()) {
        await yTargetCol('facts', 'weed').add({
            targetType : 'weed',
            targetId   : newRef.id,
            label      : 'More Info',
            value      : parsed.urlMoreInfo.trim(),
            createdAt  : firebase.firestore.FieldValue.serverTimestamp()
        });
    }

    // Save photos only when identification succeeded
    if (identified) {
        for (var i = 0; i < images.length; i++) {
            await yTargetCol('photos', 'weed').add({
                targetType : 'weed',
                targetId   : newRef.id,
                imageData  : images[i],
                caption    : '',
                createdAt  : firebase.firestore.FieldValue.serverTimestamp()
            });
        }
    }

    return newRef.id;
}
