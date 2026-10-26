// ============================================================
// Chemicals.js — Chemicals / Products CRUD and display logic
// Manages the list of chemicals/products used in yard care.
// Stored in Firestore collection: "chemicals"
// ============================================================

// Maps targetType values (other than plant/zone/weed) to their Firestore collection names
var CHEM_USAGE_COLLECTIONS = {
    vehicle:           'vehicles',
    floor:             'floors',
    room:              'rooms',
    thing:             'things',
    subthing:          'subThings',
    item:              'subThingItems',
    garageroom:        'garageRooms',
    garagething:       'garageThings',
    garagesubthing:    'garageSubThings',
    structure:         'structures',
    structurething:    'structureThings',
    structuresubthing: 'structureSubThings',
};

// Maps targetType values to their hash-route prefixes for clickable links
var CHEM_USAGE_PREFIXES = {
    plant:             '#plant/',
    zone:              '#zone/',
    weed:              '#weed/',
    vehicle:           '#vehicle/',
    floor:             '#floor/',
    room:              '#room/',
    thing:             '#thing/',
    subthing:          '#subthing/',
    item:              '#item/',
    garageroom:        '#garageroom/',
    garagething:       '#garagething/',
    garagesubthing:    '#garagesubthing/',
    structure:         '#structure/',
    structurething:    '#structurething/',
    structuresubthing: '#structuresubthing/',
};

// ---------- Load & Display Chemicals Page ----------

/**
 * Loads all chemicals and displays them on the Chemicals page.
 */
async function loadChemicalsList() {
    const container = document.getElementById('chemicalsListContainer');
    const emptyState = document.getElementById('chemicalsEmptyState');

    try {
        const snapshot = await yardCol('chemicals').get();

        container.innerHTML = '';

        if (snapshot.empty) {
            emptyState.textContent = 'No products added yet.';
            emptyState.style.display = 'block';
            return;
        }

        emptyState.style.display = 'none';

        // Sort alphabetically by name
        const chemicals = [];
        snapshot.forEach(function(doc) {
            chemicals.push({ id: doc.id, ...doc.data() });
        });
        chemicals.sort(function(a, b) {
            return a.name.localeCompare(b.name);
        });

        chemicals.forEach(function(chemical) {
            const item = createChemicalItem(chemical);
            container.appendChild(item);
        });

    } catch (error) {
        console.error('Error loading chemicals:', error);
        emptyState.textContent = 'Error loading products.';
        emptyState.style.display = 'block';
    }
}

// ---------- Create a Chemical Item Element ----------

/**
 * Creates a DOM element representing a single chemical/product.
 * @param {Object} chemical - The chemical data (id, name, notes).
 * @returns {HTMLElement} The chemical item element.
 */
function createChemicalItem(chemical) {
    const item = document.createElement('div');
    item.className = 'chemical-item card';
    // Clicking the card body navigates to the chemical detail page
    item.addEventListener('click', function() {
        window.location.hash = 'chemical/' + chemical.id;
    });

    const info = document.createElement('div');
    info.style.flex = '1';

    const title = document.createElement('div');
    title.className = 'card-title card-title--link';
    title.textContent = chemical.name;
    info.appendChild(title);

    if (chemical.notes) {
        const notes = document.createElement('div');
        notes.className = 'card-subtitle';
        notes.textContent = chemical.notes;
        info.appendChild(notes);
    }

    item.appendChild(info);

    return item;
}

// ---------- Add Chemical ----------

/**
 * Opens the add-chemical modal.
 */
function openAddChemicalModal() {
    const modal = document.getElementById('chemicalModal');
    const modalTitle = document.getElementById('chemicalModalTitle');
    const nameInput = document.getElementById('chemicalNameInput');
    const notesInput = document.getElementById('chemicalNotesInput');

    modalTitle.textContent = 'Add Product';
    nameInput.value = '';
    notesInput.value = '';

    modal.dataset.mode = 'add';

    // Hide facts section, scan row, and delete button — no ID yet for a new chemical
    document.getElementById('chemicalFactsSection').style.display  = 'none';
    document.getElementById('chemicalScanRow').style.display       = 'none';
    document.getElementById('chemicalModalDeleteBtn').style.display = 'none';

    // Reset LLM pending state and status
    _chemPendingFacts  = null;
    _chemPendingImages = null;
    document.getElementById('chemPicStatus').classList.add('hidden');
    document.getElementById('chemPicFactsPreview').style.display = 'none';

    // Show scan-from-photo section if LLM is configured
    chemCheckLlmForModal();

    openModal('chemicalModal');
    nameInput.focus();
}

// ---------- Edit Chemical ----------

/**
 * Opens the edit-chemical modal with existing data.
 * @param {Object} chemical - The chemical data (including id).
 */
function openEditChemicalModal(chemical) {
    const modal = document.getElementById('chemicalModal');
    const modalTitle = document.getElementById('chemicalModalTitle');
    const nameInput = document.getElementById('chemicalNameInput');
    const notesInput = document.getElementById('chemicalNotesInput');

    modalTitle.textContent = 'Edit Product';
    nameInput.value = chemical.name || '';
    notesInput.value = chemical.notes || '';

    modal.dataset.mode = 'edit';
    modal.dataset.editId = chemical.id;

    // Show facts section, scan row, and delete button in edit mode
    document.getElementById('chemicalFactsSection').style.display  = 'block';
    document.getElementById('chemicalScanRow').style.display       = 'block';
    document.getElementById('chemicalScanResult').style.display    = 'none';
    document.getElementById('chemicalModalDeleteBtn').style.display = '';
    loadFacts('chemical', chemical.id, 'chemicalModalFactsContainer', 'chemicalModalFactsEmptyState');

    // Reset LLM pending state and status
    _chemPendingFacts  = null;
    _chemPendingImages = null;
    document.getElementById('chemPicStatus').classList.add('hidden');
    document.getElementById('chemPicFactsPreview').style.display = 'none';

    // Show scan-from-photo section if LLM is configured
    chemCheckLlmForModal();

    openModal('chemicalModal');
    nameInput.focus();
}

// ---------- Save Chemical (Add or Edit) ----------

/**
 * Handles the save button in the chemical modal.
 */
async function handleChemicalModalSave() {
    const modal = document.getElementById('chemicalModal');
    const nameInput = document.getElementById('chemicalNameInput');
    const notesInput = document.getElementById('chemicalNotesInput');

    const name = nameInput.value.trim();
    const notes = notesInput.value.trim();

    if (!name) {
        alert('Please enter a name.');
        return;
    }

    const mode = modal.dataset.mode;

    try {
        var chemicalId;

        if (mode === 'add') {
            var docRef = await yardCol('chemicals').add({
                name: name,
                notes: notes,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            chemicalId = docRef.id;
            console.log('Chemical added:', name);

        } else if (mode === 'edit') {
            chemicalId = modal.dataset.editId;
            await yardCol('chemicals').doc(chemicalId).update({
                name: name,
                notes: notes
            });
            console.log('Chemical updated:', name);
        }

        // Save any facts the LLM extracted from the bottle scan
        if (_chemPendingFacts && _chemPendingFacts.length && chemicalId) {
            for (var i = 0; i < _chemPendingFacts.length; i++) {
                var f = _chemPendingFacts[i];
                if (f.label && f.value) {
                    await yTargetCol('facts', 'chemical').add({
                        targetType: 'chemical',
                        targetId:   chemicalId,
                        label:      f.label,
                        value:      f.value
                    });
                }
            }
        }

        // Save any photos captured during the bottle scan
        if (_chemPendingImages && _chemPendingImages.length && chemicalId) {
            for (var j = 0; j < _chemPendingImages.length; j++) {
                await yTargetCol('photos', 'chemical').add({
                    targetType: 'chemical',
                    targetId:   chemicalId,
                    imageData:  _chemPendingImages[j],
                    caption:    '',
                    createdAt:  firebase.firestore.FieldValue.serverTimestamp()
                });
            }
        }

        _chemPendingFacts  = null;
        _chemPendingImages = null;

        closeModal('chemicalModal');
        // Reload the appropriate view depending on where we are
        var hash = window.location.hash.slice(1) || 'home';
        if (hash.startsWith('chemical/')) {
            loadChemicalDetail(hash.split('/')[1]);
        } else {
            loadChemicalsList();
        }

    } catch (error) {
        console.error('Error saving chemical:', error);
        alert('Error saving product. Check console for details.');
    }
}

// ---------- Delete Chemical ----------

/**
 * Deletes a chemical after confirmation.
 * @param {string} chemicalId - The chemical's Firestore document ID.
 */
async function handleDeleteChemical(chemicalId) {
    if (!confirm('Are you sure you want to delete this chemical/product?')) {
        return;
    }

    try {
        await yardCol('chemicals').doc(chemicalId).delete();
        console.log('Chemical deleted:', chemicalId);
        // If we were on the detail page, go back to the list
        window.location.hash = 'chemicals';

    } catch (error) {
        console.error('Error deleting chemical:', error);
        alert('Error deleting product. Check console for details.');
    }
}

// ---------- Chemical Detail Page ----------

/**
 * Loads and displays the detail page for a single chemical.
 * Sets window.currentChemical for use by the Edit/Delete buttons and facts.js.
 * @param {string} chemicalId - The chemical's Firestore document ID.
 */
async function loadChemicalDetail(chemicalId) {
    try {
        await yardEnsureFor('chemicals', chemicalId);
        const doc = await yardCol('chemicals').doc(chemicalId).get();

        if (!doc.exists) {
            document.getElementById('chemicalDetailName').textContent = 'Product not found';
            return;
        }

        const chemical = { id: doc.id, ...doc.data() };
        window.currentChemical = chemical;
        yShowWho('chemicalDetailName', chemical);

        document.getElementById('chemicalDetailName').textContent = chemical.name;

        // Set breadcrumb in sticky header
        var crumb = document.getElementById('breadcrumbBar');
        if (crumb) {
            crumb.innerHTML =
                '<a href="#chemicals">Chemicals</a>' +
                '<span class="separator">&rsaquo;</span>' +
                '<span>' + escapeHtml(chemical.name) + '</span>';
        }

        // Show notes section if notes are present
        const notesSection = document.getElementById('chemicalDetailNotesSection');
        if (chemical.notes) {
            document.getElementById('chemicalDetailNotes').textContent = chemical.notes;
            notesSection.style.display = 'block';
        } else {
            notesSection.style.display = 'none';
        }

        // Load facts for this chemical
        loadFacts('chemical', chemicalId, 'chemicalFactsContainer', 'chemicalFactsEmptyState');

        // Load photos for this chemical
        loadPhotos('chemical', chemicalId, 'chemicalPhotoContainer', 'chemicalPhotoEmptyState');

        // Load usage history (activities that used this chemical)
        loadChemicalUsageHistory(chemicalId);

    } catch (error) {
        console.error('Error loading chemical detail:', error);
        document.getElementById('chemicalDetailName').textContent = 'Error loading product';
    }
}

// ---------- Chemical Usage History ----------

/**
 * Loads all activities that used this chemical and renders them on the
 * chemical detail page under "Usage History".
 *
 * Queries two fields to handle both old records (chemicalId singular) and
 * new records (chemicalIds array), then merges + deduplicates.
 *
 * @param {string} chemicalId - The chemical's Firestore document ID.
 */
async function loadChemicalUsageHistory(chemicalId) {
    var container = document.getElementById('chemicalUsageContainer');
    var emptyEl   = document.getElementById('chemicalUsageEmptyState');

    container.innerHTML = '<p class="ar-summary">Loading…</p>';
    emptyEl.style.display = 'none';

    try {
        // Query both storage formats in parallel
        var [newSnap, oldSnap, plantsSnap, zonesSnap, weedsSnap] = await Promise.all([
            yGetAll('activities', function(c) { return c.where('chemicalIds', 'array-contains', chemicalId); }),
            yGetAll('activities', function(c) { return c.where('chemicalId', '==', chemicalId); }),
            yardCol('plants').get(),
            yardCol('zones').get(),
            yardCol('weeds').get(),
        ]);

        // Merge and deduplicate by document ID
        var seen = {};
        var activities = [];
        function collect(snap) {
            snap.forEach(function(doc) {
                if (!seen[doc.id]) {
                    seen[doc.id] = true;
                    activities.push({ id: doc.id, ...doc.data() });
                }
            });
        }
        collect(newSnap);
        collect(oldSnap);

        // Sort newest first
        activities.sort(function(a, b) {
            return (b.date || '').localeCompare(a.date || '');
        });

        container.innerHTML = '';

        if (activities.length === 0) {
            emptyEl.style.display = 'block';
            return;
        }

        // Build name maps for resolving target names (start with yard entities)
        var nameMap = { plant: {}, zone: {}, weed: {} };
        plantsSnap.forEach(function(doc) { nameMap.plant[doc.id] = doc.data().name || ''; });
        zonesSnap.forEach(function(doc)  { nameMap.zone[doc.id]  = doc.data().name || ''; });
        weedsSnap.forEach(function(doc)  { nameMap.weed[doc.id]  = doc.data().name || ''; });

        // Find any targetTypes in these activities that need extra collection fetches
        var extraTypes = {};
        activities.forEach(function(a) {
            var t = a.targetType;
            if (t && !nameMap[t] && CHEM_USAGE_COLLECTIONS[t]) {
                extraTypes[t] = true;
            }
        });
        var extraFetches = Object.keys(extraTypes).map(function(t) {
            return yNameCol(CHEM_USAGE_COLLECTIONS[t]).get().then(function(snap) {
                nameMap[t] = {};
                snap.forEach(function(doc) { nameMap[t][doc.id] = doc.data().name || ''; });
            });
        });
        await Promise.all(extraFetches);

        // Render a summary count
        var summary = document.createElement('p');
        summary.className = 'ar-summary';
        summary.textContent = activities.length + ' activit' + (activities.length === 1 ? 'y' : 'ies');
        container.appendChild(summary);

        // Render each activity as a card (reuses ar-* classes from activity report)
        activities.forEach(function(a) {
            container.appendChild(chemUsageBuildCard(a, nameMap));
        });

    } catch (err) {
        console.error('Error loading chemical usage history:', err);
        container.innerHTML = '';
        emptyEl.textContent = 'Error loading usage history.';
        emptyEl.style.display = 'block';
    }
}

/**
 * Builds a single usage-history card for one activity.
 * Reuses the ar-* card styles from the Activity History Report (NF-2).
 * @param {Object} a       - Activity data object.
 * @param {Object} nameMap - { plant: {id:name}, zone: {id:name}, weed: {id:name}, thing: {id:name}, ... }
 * @returns {HTMLElement}
 */
function chemUsageBuildCard(a, nameMap) {
    var card = document.createElement('div');
    card.className = 'ar-card';

    // Top row: date badge + type chip + target link
    var topRow = document.createElement('div');
    topRow.className = 'ar-card-top';

    var dateBadge = document.createElement('span');
    dateBadge.className   = 'ar-date-badge';
    dateBadge.textContent = a.date || '—';
    topRow.appendChild(dateBadge);

    var typeName = a.targetType || '';
    var typeChip = document.createElement('span');
    typeChip.className   = 'ar-type-chip ar-type-' + typeName;
    typeChip.textContent = typeName ? (typeName.charAt(0).toUpperCase() + typeName.slice(1)) : '?';
    topRow.appendChild(typeChip);

    // Resolve target name and build a clickable link
    var map     = nameMap[typeName] || {};
    var rawName = map[a.targetId];
    var targetName = rawName !== undefined ? (rawName || '(Unnamed)') : '(Deleted)';
    var prefix  = CHEM_USAGE_PREFIXES[typeName];

    var targetEl;
    if (prefix && a.targetId) {
        targetEl      = document.createElement('a');
        targetEl.href = prefix + a.targetId;
    } else {
        targetEl = document.createElement('span');
    }
    targetEl.className   = 'ar-target-link';
    targetEl.textContent = targetName;
    topRow.appendChild(targetEl);

    card.appendChild(topRow);

    // Description
    if (a.description) {
        var desc = document.createElement('div');
        desc.className   = 'ar-description';
        desc.textContent = a.description;
        card.appendChild(desc);
    }

    // Amount used (when recorded)
    if (a.amountUsed) {
        var amount = document.createElement('div');
        amount.className   = 'ar-notes';
        amount.textContent = '⚗️ ' + a.amountUsed;
        card.appendChild(amount);
    }

    // Notes (muted)
    if (a.notes) {
        var notes = document.createElement('div');
        notes.className   = 'ar-notes';
        notes.textContent = a.notes;
        card.appendChild(notes);
    }

    return card;
}

// ---------- Helper: Get chemicals for dropdown ----------

/**
 * Loads all chemicals and returns them as an array (for use in dropdowns).
 * @returns {Promise<Array>} Array of {id, name, notes} objects sorted by name.
 */
async function getAllChemicals() {
    const snapshot = await yardCol('chemicals').get();
    const chemicals = [];
    snapshot.forEach(function(doc) {
        chemicals.push({ id: doc.id, ...doc.data() });
    });
    chemicals.sort(function(a, b) {
        return a.name.localeCompare(b.name);
    });
    return chemicals;
}

// ============================================================
// CHEMICAL IDENTIFICATION FROM PHOTO (LLM)
// Takes a photo of a chemical bottle and asks the LLM to return
// the product name, general notes, and a set of facts (mixing
// ratios, active ingredients, application info, etc.).
// ============================================================

// Pending LLM data — set by chemSendToLlm, consumed by handleChemicalModalSave
var _chemPendingFacts  = null;  // Array of {label, value} to save as facts
var _chemPendingImages = null;  // Array of base64 data URLs to save as photos

// The prompt sent to the LLM for chemical bottle scanning.
var CHEM_ID_PROMPT = [
    'You are a chemical/product label reading assistant. Analyze the provided image(s) of a chemical or product bottle/label and return ONLY a valid JSON object.',
    'No explanation, no markdown, no code blocks, no extra text of any kind.',
    'Your entire response must be parseable by JSON.parse().',
    '',
    'Return this exact structure:',
    '{',
    '  "name": "",',
    '  "notes": "",',
    '  "facts": [',
    '    { "label": "", "value": "" }',
    '  ]',
    '}',
    '',
    'Field rules:',
    '- name: the full product name as printed on the label, e.g. "Roundup Weed & Grass Killer Concentrate Plus"',
    '- notes: a brief 1-2 sentence summary of what the product does and any important safety caution. 50 words or less.',
    '- facts: an array of key facts extracted from the label. Include as many as are visible and useful. Good fact labels include:',
    '  "Active Ingredient", "Mixing Ratio", "Coverage", "Application Method", "Reentry Interval",',
    '  "Pre-Harvest Interval", "Target Pests", "Do Not Apply When", "Storage", "First Aid"',
    '  Use the exact label text for values where possible. Omit facts you cannot clearly read.',
    '- If you cannot read the label clearly, return name and notes as "" and explain in notes.',
    '- additionalMessage: omit this field entirely (not needed).'
].join('\n');

/**
 * Checks if an LLM is configured and shows the bottle-scan section in the chemical modal.
 */
async function chemCheckLlmForModal() {
    try {
        var doc = await userCol('settings').doc('llm').get();
        var ok  = doc.exists && doc.data().provider && doc.data().apiKey;
        document.getElementById('chemFromPictureSection').classList.toggle('hidden', !ok);
    } catch (e) { /* leave hidden */ }
}

/**
 * Parses the LLM response text into a structured object.
 * Strips markdown code fences if present.
 */
function chemParseLlmResponse(text) {
    var clean = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    return JSON.parse(clean);
}

/**
 * Sends compressed images to the LLM for chemical bottle analysis.
 * On success, pre-fills the modal name/notes fields and stores pending facts + images.
 * @param {string[]} images - Array of base64 data URLs (already compressed by staging flow)
 */
async function chemSendToLlm(images) {
    var statusEl   = document.getElementById('chemPicStatus');
    var galleryBtn = document.getElementById('chemPicGalleryBtn');
    var cameraBtn  = document.getElementById('chemPicCameraBtn');
    var saveBtn    = document.getElementById('chemicalModalSaveBtn');

    statusEl.textContent = 'Reading label\u2026';
    statusEl.classList.remove('hidden');
    galleryBtn.disabled = true;
    cameraBtn.disabled  = true;
    saveBtn.disabled    = true;

    try {
        // Load LLM config
        var settingsDoc = await userCol('settings').doc('llm').get();
        if (!settingsDoc.exists) { alert('LLM not configured. Go to Settings > AI.'); return; }
        var cfg      = settingsDoc.data();
        var provider = cfg.provider;
        var apiKey   = cfg.apiKey;
        var model    = cfg.model || '';

        // Determine endpoint and model
        var endpoint, llmModel;
        if (provider === 'openai') {
            endpoint = 'https://api.openai.com/v1/chat/completions';
            llmModel = model || 'gpt-4o';
        } else if (provider === 'anthropic') {
            endpoint = 'https://api.anthropic.com/v1/messages';
            llmModel = model || 'claude-opus-4-6';
        } else if (provider === 'openrouter') {
            endpoint = 'https://openrouter.ai/api/v1/chat/completions';
            llmModel = model || 'openai/gpt-4o';
        } else {
            alert('Unknown LLM provider.'); return;
        }

        // Build content: prompt + images
        var content = [{ type: 'text', text: CHEM_ID_PROMPT }];
        images.forEach(function(url) {
            content.push({ type: 'image_url', image_url: { url: url } });
        });

        // OpenAI o-series models require max_completion_tokens; other providers use max_tokens
        var tokenParam = (provider === 'openai') ? 'max_completion_tokens' : 'max_tokens';
        var reqBody = { model: llmModel, messages: [{ role: 'user', content: content }] };
        reqBody[tokenParam] = 1000;

        // Call the LLM
        var response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + apiKey
            },
            body: JSON.stringify(reqBody)
        });

        if (!response.ok) {
            var errText = await response.text();
            throw new Error('LLM error ' + response.status + ': ' + errText.slice(0, 200));
        }

        var data   = await response.json();
        var raw    = (data.choices && data.choices[0] && data.choices[0].message)
                     ? data.choices[0].message.content
                     : (data.content && data.content[0] ? data.content[0].text : '');
        var parsed = chemParseLlmResponse(raw);

        // Pre-fill modal fields
        if (parsed.name)  document.getElementById('chemicalNameInput').value  = parsed.name;
        if (parsed.notes) document.getElementById('chemicalNotesInput').value = parsed.notes;

        // Store pending data for save handler
        _chemPendingFacts  = (parsed.facts && parsed.facts.length) ? parsed.facts : null;
        _chemPendingImages = images.length ? images : null;

        // Show facts preview
        var previewEl  = document.getElementById('chemPicFactsPreview');
        var listEl     = document.getElementById('chemPicFactsList');
        if (_chemPendingFacts && _chemPendingFacts.length) {
            listEl.innerHTML = _chemPendingFacts.map(function(f) {
                return '<div><strong>' + escapeHtml(f.label) + ':</strong> ' + escapeHtml(f.value) + '</div>';
            }).join('');
            previewEl.style.display = 'block';
        } else {
            previewEl.style.display = 'none';
        }

        statusEl.textContent = 'Label read. Review the fields below and click Save.';

    } catch (err) {
        console.error('Chem LLM error:', err);
        statusEl.textContent = 'Error: ' + err.message;
        _chemPendingFacts  = null;
        _chemPendingImages = null;
    } finally {
        galleryBtn.disabled = false;
        cameraBtn.disabled  = false;
        saveBtn.disabled    = false;
    }
}

// ============================================================
// BARCODE SCANNER
// Uses native browser APIs — no third-party library needed.
//   • getUserMedia  — direct camera stream attached to a <video> element
//   • BarcodeDetector — native Chrome barcode API (Android Chrome 83+)
// Falls back gracefully if BarcodeDetector is not available.
//
// Lookup APIs (free, no key):
//   1. UPC Item DB  — https://api.upcitemdb.com/prod/trial/lookup
//   2. Open Food Facts — https://world.openfoodfacts.org/api/v0/product/
// ============================================================

var bcStream          = null;   // MediaStream from getUserMedia
var bcDetecting       = false;  // scan-loop flag
var bcCaptureCallback = null;   // set by openBarcodeScanner; called with the confirmed barcode string

/**
 * Build a fullscreen overlay, attach the rear camera to a <video> element
 * we create ourselves, then start the BarcodeDetector scan loop.
 */
/**
 * Open the fullscreen barcode scanner.
 * @param {Function} [captureCallback] - Called with the confirmed barcode string.
 *   Defaults to lookupBarcode() (show product info popup) when omitted.
 */
function openBarcodeScanner(captureCallback) {
    // Store callback — bcShowConfirm and manual-entry fallback both use it
    bcCaptureCallback = captureCallback || function(code) { lookupBarcode(code); };

    // Stop any existing stream
    bcStopStream();

    // Remove any leftover overlay
    var old = document.getElementById('barcodeScanOverlay');
    if (old) old.remove();

    // Build the fullscreen overlay with our own <video> element
    var overlay = document.createElement('div');
    overlay.id = 'barcodeScanOverlay';

    var video = document.createElement('video');
    video.id = 'barcodeScanVideo';
    video.setAttribute('playsinline', '');  // required for iOS; also helps Android
    video.setAttribute('autoplay', '');
    video.setAttribute('muted', '');
    video.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;background:#000;';

    var status = document.createElement('p');
    status.id = 'barcodeScanStatus';
    status.className = 'barcode-scan-status';
    status.textContent = 'Starting camera\u2026';

    var cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-secondary';
    cancelBtn.style.cssText = 'display:block;margin:12px auto;';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', closeBarcodeScanner);

    overlay.appendChild(video);
    overlay.appendChild(status);
    overlay.appendChild(cancelBtn);
    document.body.appendChild(overlay);

    // Request the rear camera
    navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }
    }).then(function(stream) {
        bcStream = stream;
        video.srcObject = stream;
        video.play();
        status.textContent = 'Point camera at a barcode\u2026';
        bcStartDetecting(video, status);
    }).catch(function(err) {
        var msg = String(err).toLowerCase();
        var denied = msg.includes('notallowed') || msg.includes('permission') ||
                     msg.includes('denied') || msg.includes('dismissed');
        status.className = 'barcode-scan-status barcode-scan-error';
        status.innerHTML = denied
            ? '<strong>Camera permission denied.</strong><br><br>' +
              'Tap the \uD83D\uDD12 lock in your browser address bar \u2192 ' +
              'Site settings \u2192 Camera \u2192 Allow, then reload the page.'
            : 'Camera error: ' + err;
    });
}

/**
 * Run the BarcodeDetector scan loop on the live video feed.
 * Falls back to a manual-entry prompt if the API is not available.
 */
function bcStartDetecting(video, statusEl) {
    if (!('BarcodeDetector' in window)) {
        // BarcodeDetector not available — offer manual entry as fallback
        statusEl.textContent = '';
        var msg = document.createElement('div');
        msg.style.cssText = 'color:#fff;text-align:center;padding:0 12px;';
        msg.innerHTML = 'Automatic barcode detection is not supported in this browser.<br><br>' +
            '<label style="display:block;margin-bottom:6px;">Enter barcode manually:</label>';
        var inp = document.createElement('input');
        inp.type = 'text';
        inp.inputMode = 'numeric';
        inp.style.cssText = 'width:100%;max-width:280px;padding:8px;font-size:1rem;border-radius:6px;border:none;';
        inp.placeholder = 'e.g. 071121009071';
        var goBtn = document.createElement('button');
        goBtn.className = 'btn btn-primary';
        goBtn.style.cssText = 'display:block;margin:10px auto 0;';
        goBtn.textContent = 'Look Up';
        goBtn.addEventListener('click', function() {
            var val = inp.value.trim();
            if (val) { closeBarcodeScanner(); bcCaptureCallback(val); }
        });
        msg.appendChild(inp);
        msg.appendChild(goBtn);
        statusEl.parentNode.insertBefore(msg, statusEl);
        return;
    }

    var detector = new BarcodeDetector({
        formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code']
    });

    bcDetecting = true;

    function scan() {
        if (!bcDetecting) return;
        if (video.readyState < 2) { requestAnimationFrame(scan); return; }

        detector.detect(video).then(function(results) {
            if (results.length > 0) {
                // Pause scanning — show what was found and let the user confirm
                bcDetecting = false;
                bcShowConfirm(results[0].rawValue, statusEl, video, detector);
            } else {
                requestAnimationFrame(scan);
            }
        }).catch(function() {
            if (bcDetecting) requestAnimationFrame(scan);
        });
    }
    scan();
}

/**
 * Barcode detected — pause and ask the user to confirm before looking it up.
 * Shows the barcode value, a "Use This" button, and a "Scan Again" button.
 */
function bcShowConfirm(code, statusEl, video, detector) {
    statusEl.textContent = '';

    var box = document.createElement('div');
    box.id = 'bcConfirmBox';
    box.style.cssText = 'background:rgba(0,0,0,0.82);color:#fff;text-align:center;' +
                        'padding:14px 16px;border-radius:8px;margin:8px 0;';
    box.innerHTML = '<div style="font-size:0.8rem;opacity:0.7;margin-bottom:4px;">Barcode detected:</div>' +
                    '<div style="font-size:1.1rem;font-weight:700;letter-spacing:0.05em;margin-bottom:12px;">' +
                    escapeHtml(code) + '</div>';

    var useBtn = document.createElement('button');
    useBtn.className = 'btn btn-primary';
    useBtn.style.cssText = 'margin-right:10px;';
    useBtn.textContent = 'Look Up This One';
    useBtn.addEventListener('click', function() {
        closeBarcodeScanner();
        bcCaptureCallback(code);
    });

    var againBtn = document.createElement('button');
    againBtn.className = 'btn btn-secondary';
    againBtn.textContent = 'Scan Again';
    againBtn.addEventListener('click', function() {
        box.remove();
        statusEl.textContent = 'Point camera at a barcode\u2026';
        // Resume scan loop
        bcDetecting = true;
        (function scan() {
            if (!bcDetecting) return;
            if (video.readyState < 2) { requestAnimationFrame(scan); return; }
            detector.detect(video).then(function(results) {
                if (results.length > 0) {
                    bcDetecting = false;
                    bcShowConfirm(results[0].rawValue, statusEl, video, detector);
                } else {
                    requestAnimationFrame(scan);
                }
            }).catch(function() { if (bcDetecting) requestAnimationFrame(scan); });
        })();
    });

    box.appendChild(useBtn);
    box.appendChild(againBtn);
    statusEl.parentNode.insertBefore(box, statusEl);
}

/** Stop camera stream and scan loop. */
function bcStopStream() {
    bcDetecting = false;
    if (bcStream) {
        bcStream.getTracks().forEach(function(t) { t.stop(); });
        bcStream = null;
    }
}

/**
 * Stop camera, remove overlay.
 */
function closeBarcodeScanner() {
    bcStopStream();
    var overlay = document.getElementById('barcodeScanOverlay');
    if (overlay) overlay.remove();
}

/**
 * Query UPC Item DB first, then Open Food Facts as a fallback.
 * Both are free with no API key required.
 * @param {string} barcode
 */
/**
 * Look up a barcode and show results in a fresh body-level overlay.
 * Avoids the modal system entirely so nothing can block it from appearing.
 */
/**
 * Save two facts for a scanned barcode: the barcode number and a Barcode Lookup URL.
 * @param {string} targetType  - 'chemical' or 'subthing'
 * @param {string} targetId    - Firestore document ID of the owner
 * @param {string} barcode     - The scanned barcode string
 * @param {string} resultElId  - ID of an element to show a ✓/error message in
 */
function saveBarcodeFacts(targetType, targetId, barcode, resultElId) {
    var entries = [
        { label: 'Barcode',        value: barcode },
        { label: 'Barcode Lookup', value: 'https://www.barcodelookup.com/' + barcode }
    ];

    var batch = db.batch();
    entries.forEach(function(f) {
        batch.set(yTargetCol('facts', targetType).doc(), {
            targetType : targetType,
            targetId   : targetId,
            label      : f.label,
            value      : f.value,
            createdAt  : firebase.firestore.FieldValue.serverTimestamp()
        });
    });

    batch.commit().then(function() {
        var el = document.getElementById(resultElId);
        if (el) {
            el.textContent     = '\u2713 Barcode saved as 2 facts';
            el.style.color     = '#2e7d32';
            el.style.display   = 'block';
            setTimeout(function() { el.style.display = 'none'; }, 3500);
        }
    }).catch(function(err) {
        var el = document.getElementById(resultElId);
        if (el) {
            el.textContent   = 'Error saving: ' + err.message;
            el.style.color   = '#c62828';
            el.style.display = 'block';
        }
    });
}

async function lookupBarcode(barcode) {
    // Build result overlay and attach to body immediately
    var old = document.getElementById('barcodeResultOverlay');
    if (old) old.remove();

    var overlay = document.createElement('div');
    overlay.id = 'barcodeResultOverlay';

    var title = document.createElement('h3');
    title.style.cssText = 'margin:0 0 12px;font-size:1.1rem;';
    title.textContent = 'Product Information';

    var body = document.createElement('div');
    body.id = 'barcodeResultBody';
    body.style.cssText = 'flex:1;overflow-y:auto;';
    body.innerHTML = '<p style="color:#aaa;">Looking up ' + escapeHtml(barcode) + '\u2026</p>';

    var closeBtn = document.createElement('button');
    closeBtn.className = 'btn btn-secondary';
    closeBtn.style.cssText = 'display:block;margin:14px auto 0;';
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', function() { overlay.remove(); });

    overlay.appendChild(title);
    overlay.appendChild(body);
    overlay.appendChild(closeBtn);
    document.body.appendChild(overlay);

    // Helper: fetch with a 8-second timeout
    function fetchWithTimeout(url) {
        var controller = new AbortController();
        var timer = setTimeout(function() { controller.abort(); }, 8000);
        return fetch(url, { signal: controller.signal })
            .finally(function() { clearTimeout(timer); });
    }

    // Now do the lookup — try each API independently so one failure
    // doesn't prevent the other from running.
    var found = false;

    // ---- Attempt 1: Open Food Facts (reliable CORS, good for many products) ----
    try {
        var ffRes  = await fetchWithTimeout('https://world.openfoodfacts.org/api/v0/product/' +
                                            encodeURIComponent(barcode) + '.json');
        var ffData = await ffRes.json();
        if (ffData.status === 1 && ffData.product) {
            var p = ffData.product;
            body.innerHTML = buildBarcodeTable([
                { label: 'Barcode',     value: barcode },
                { label: 'Name',        value: p.product_name || p.product_name_en },
                { label: 'Brand',       value: p.brands },
                { label: 'Categories',  value: p.categories },
                { label: 'Quantity',    value: p.quantity },
                { label: 'Ingredients', value: p.ingredients_text },
                { label: 'Countries',   value: p.countries },
                { label: 'Source',      value: 'Open Food Facts' }
            ], p.image_front_url || p.image_url || null);
            found = true;
        }
    } catch (e) { /* network/CORS error — fall through to next API */ }

    if (found) return;

    // ---- Attempt 2: UPC Item DB trial (good for general retail products) ----
    try {
        var upcRes  = await fetchWithTimeout('https://api.upcitemdb.com/prod/trial/lookup?upc=' +
                                             encodeURIComponent(barcode));
        var upcData = await upcRes.json();
        if (upcData.items && upcData.items.length > 0) {
            var item = upcData.items[0];
            body.innerHTML = buildBarcodeTable([
                { label: 'Barcode',       value: barcode },
                { label: 'Title',         value: item.title },
                { label: 'Brand',         value: item.brand },
                { label: 'Description',   value: item.description },
                { label: 'Category',      value: item.category },
                { label: 'Size / Weight', value: item.size },
                { label: 'Color',         value: item.color },
                { label: 'Model #',       value: item.model },
                { label: 'ASIN',          value: item.asin },
                { label: 'EAN',           value: item.ean },
                { label: 'Offers found',  value: item.offers ? String(item.offers.length) : null },
                { label: 'Source',        value: 'UPC Item DB' }
            ], item.images && item.images.length ? item.images[0] : null);
            found = true;
        }
    } catch (e) { /* network/CORS error — fall through */ }

    if (found) return;

    // ---- Nothing found — show barcode + lookup links as fallback ----
    var barcodeUrl = 'https://www.barcodelookup.com/' + encodeURIComponent(barcode);
    var googleUrl  = 'https://www.google.com/search?q=' + encodeURIComponent(barcode + ' barcode product');
    var btnStyle   = 'display:inline-block;padding:9px 18px;border-radius:6px;' +
                     'text-decoration:none;font-weight:600;color:#fff;margin:4px 6px 4px 0;';
    body.innerHTML =
        '<p style="margin-bottom:12px;"><strong>Barcode:</strong> ' + escapeHtml(barcode) + '</p>' +
        '<p style="color:#555;line-height:1.6;margin-bottom:16px;">' +
        'No product info found in free databases.<br>' +
        'Try one of these to look it up:</p>' +
        '<a href="' + barcodeUrl + '" target="_blank" rel="noopener" ' +
        'style="' + btnStyle + 'background:#2e7d32;">Barcode Lookup</a>' +
        '<a href="' + googleUrl + '" target="_blank" rel="noopener" ' +
        'style="' + btnStyle + 'background:#4A90E2;">Search Google</a>';
}

/**
 * Build an HTML string: optional product image + a two-column table of fields.
 * Skips rows where value is null / empty.
 */
function buildBarcodeTable(fields, imageUrl) {
    var html = '';
    if (imageUrl) {
        html += '<img src="' + escapeHtml(imageUrl) +
                '" class="barcode-result-img" alt="Product image">';
    }
    html += '<table class="barcode-result-table">';
    fields.forEach(function(f) {
        if (f.value === null || f.value === undefined || f.value === '') return;
        html += '<tr>' +
                '<td class="barcode-result-label">' + escapeHtml(f.label) + '</td>' +
                '<td class="barcode-result-value">' + escapeHtml(String(f.value)) + '</td>' +
                '</tr>';
    });
    html += '</table>';
    return html;
}

// ---------- Event Listeners ----------

document.addEventListener('DOMContentLoaded', function() {

    // "Add Chemical" button on chemicals page
    document.getElementById('addChemicalBtn').addEventListener('click', openAddChemicalModal);

    // Chemical modal — Save button
    document.getElementById('chemicalModalSaveBtn').addEventListener('click', handleChemicalModalSave);

    // Chemical modal — Cancel button
    document.getElementById('chemicalModalCancelBtn').addEventListener('click', function() {
        closeModal('chemicalModal');
    });

    // Chemical modal — Close on overlay click
    document.getElementById('chemicalModal').addEventListener('click', function(e) {
        if (e.target === this) closeModal('chemicalModal');
    });

    // Chemical modal — Enter key to save
    document.getElementById('chemicalNameInput').addEventListener('keydown', function(e) {
        if (e.key === 'Enter') handleChemicalModalSave();
    });

    // Chemical modal — Scan barcode button (edit mode only)
    document.getElementById('chemicalModalScanBtn').addEventListener('click', function() {
        var editId = document.getElementById('chemicalModal').dataset.editId;
        if (!editId) return;
        openBarcodeScanner(function(code) {
            saveBarcodeFacts('chemical', editId, code, 'chemicalScanResult');
            // Reload facts list so the new facts appear immediately
            loadFacts('chemical', editId, 'chemicalModalFactsContainer', 'chemicalModalFactsEmptyState');
        });
    });

    // Chemical modal — Delete button (edit mode only)
    document.getElementById('chemicalModalDeleteBtn').addEventListener('click', function() {
        var editId = document.getElementById('chemicalModal').dataset.editId;
        if (!editId) return;
        closeModal('chemicalModal');
        handleDeleteChemical(editId);
    });

    // Chemical detail — Edit button
    document.getElementById('editChemicalDetailBtn').addEventListener('click', function() {
        if (window.currentChemical) {
            openEditChemicalModal(window.currentChemical);
        }
    });

    // Chemical detail — Delete button
    document.getElementById('deleteChemicalDetailBtn').addEventListener('click', function() {
        if (window.currentChemical) {
            handleDeleteChemical(window.currentChemical.id);
        }
    });

    // Chemical detail — Camera button (add photo directly to this chemical)
    document.getElementById('addChemicalCameraBtn').addEventListener('click', function() {
        if (window.currentChemical) triggerCameraUpload('chemical', window.currentChemical.id);
    });

    // Chemical detail — Gallery button
    document.getElementById('addChemicalGalleryBtn').addEventListener('click', function() {
        if (window.currentChemical) triggerGalleryUpload('chemical', window.currentChemical.id);
    });

    // Chemical modal — LLM bottle scan: Gallery button (opens file picker, not camera)
    document.getElementById('chemPicGalleryBtn').addEventListener('click', function() {
        openLlmPhotoStagingGallery('Scan Chemical Bottle', function(images) {
            chemSendToLlm(images);
        });
    });

    // Chemical modal — LLM bottle scan: Camera button
    document.getElementById('chemPicCameraBtn').addEventListener('click', function() {
        openLlmPhotoStaging('Scan Chemical Bottle', function(images) {
            chemSendToLlm(images);
        });
    });

    // Barcode scanner — Scan Barcode button on chemicals list page
    // scanBarcodeBtn removed from chemicals list — scan is now in the edit modal only

    // Barcode scanner — Cancel button inside scanner modal
    document.getElementById('barcodeCancelBtn').addEventListener('click', closeBarcodeScanner);

    // Barcode scanner — clicking the overlay closes the scanner
    document.getElementById('barcodeScanModal').addEventListener('click', function(e) {
        if (e.target === this) closeBarcodeScanner();
    });

    // Barcode result — Close button
    document.getElementById('barcodeResultCloseBtn').addEventListener('click', function() {
        closeModal('barcodeResultModal');
    });

    // Barcode result — clicking the overlay closes it
    document.getElementById('barcodeResultModal').addEventListener('click', function(e) {
        if (e.target === this) closeModal('barcodeResultModal');
    });
});
