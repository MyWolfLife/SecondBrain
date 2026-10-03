// ============================================================
// Facts.js — Facts list CRUD and display logic
// Facts can be attached to plants or zones via targetType/targetId.
// Each fact is a label/value pair (e.g., "Square Feet" / "200").
// Stored in Firestore collection: "facts"
// ============================================================

// ---------- Load & Display Facts ----------

/**
 * Loads and displays facts for a given target (plant or zone).
 * @param {string} targetType - "plant" or "zone"
 * @param {string} targetId - The Firestore document ID of the plant or zone.
 * @param {string} containerId - The ID of the container element to render into.
 * @param {string} emptyStateId - The ID of the empty-state message element.
 */
async function loadFacts(targetType, targetId, containerId, emptyStateId) {
    const container = document.getElementById(containerId);
    const emptyState = document.getElementById(emptyStateId);

    try {
        const snapshot = await userCol('facts')
            .where('targetType', '==', targetType)
            .where('targetId', '==', targetId)
            .get();

        container.innerHTML = '';

        if (snapshot.empty) {
            emptyState.textContent = 'No facts recorded.';
            emptyState.style.display = 'block';
            return;
        }

        emptyState.style.display = 'none';

        // Collect and sort alphabetically by label
        const facts = [];
        snapshot.forEach(function(doc) {
            facts.push({ id: doc.id, ...doc.data() });
        });
        facts.sort(function(a, b) {
            return (a.label || '').localeCompare(b.label || '');
        });

        // Build a table-like layout
        const table = document.createElement('div');
        table.className = 'facts-table';

        facts.forEach(function(fact) {
            const row = createFactRow(fact, targetType, targetId);
            table.appendChild(row);
        });

        container.appendChild(table);

    } catch (error) {
        console.error('Error loading facts:', error);
        emptyState.textContent = 'Error loading facts.';
        emptyState.style.display = 'block';
    }
}

// ---------- Create a Fact Row Element ----------

/**
 * Creates a DOM element representing a single fact row.
 * @param {Object} fact - The fact data (id, label, value).
 * @param {string} targetType - "plant" or "zone"
 * @param {string} targetId - The target's Firestore document ID.
 * @returns {HTMLElement} The fact row element.
 */
function createFactRow(fact, targetType, targetId) {
    const row = document.createElement('div');
    row.className = 'fact-row';

    const labelEl = document.createElement('span');
    labelEl.className = 'fact-label';
    labelEl.textContent = fact.label;
    row.appendChild(labelEl);

    const valueEl = document.createElement('span');
    valueEl.className = 'fact-value';
    // Render URLs as clickable links that open in a new tab
    if (fact.value && (fact.value.startsWith('http://') || fact.value.startsWith('https://'))) {
        const link = document.createElement('a');
        link.href = fact.value;
        link.textContent = fact.value;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        valueEl.appendChild(link);
    } else {
        valueEl.textContent = fact.value;
    }
    row.appendChild(valueEl);

    const actions = document.createElement('span');
    actions.className = 'fact-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn-small btn-secondary';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', function() {
        openEditFactModal(fact, targetType, targetId);
    });
    actions.appendChild(editBtn);

    row.appendChild(actions);

    return row;
}

// ---------- Add Fact ----------

/**
 * Opens the add-fact modal.
 * @param {string} targetType - "plant" or "zone"
 * @param {string} targetId - The target's Firestore document ID.
 */
function openAddFactModal(targetType, targetId) {
    const modal = document.getElementById('factModal');
    const modalTitle = document.getElementById('factModalTitle');
    const labelInput = document.getElementById('factLabelInput');
    const valueInput = document.getElementById('factValueInput');

    modalTitle.textContent = 'Add Fact';
    labelInput.value = '';
    valueInput.value = '';

    modal.dataset.mode = 'add';
    modal.dataset.targetType = targetType;
    modal.dataset.targetId = targetId;
    modal.dataset.editId = '';

    // Delete only applies to existing facts — hide it in add mode
    document.getElementById('factModalDeleteBtn').classList.add('hidden');

    openModal('factModal');
    labelInput.focus();
}

// ---------- Edit Fact ----------

/**
 * Opens the edit-fact modal with existing data.
 * @param {Object} fact - The fact data (including id).
 * @param {string} targetType - "plant" or "zone"
 * @param {string} targetId - The target's Firestore document ID.
 */
function openEditFactModal(fact, targetType, targetId) {
    const modal = document.getElementById('factModal');
    const modalTitle = document.getElementById('factModalTitle');
    const labelInput = document.getElementById('factLabelInput');
    const valueInput = document.getElementById('factValueInput');

    modalTitle.textContent = 'Edit Fact';
    labelInput.value = fact.label || '';
    valueInput.value = fact.value || '';

    modal.dataset.mode = 'edit';
    modal.dataset.editId = fact.id;
    modal.dataset.targetType = targetType;
    modal.dataset.targetId = targetId;

    // Show Delete button in edit mode
    document.getElementById('factModalDeleteBtn').classList.remove('hidden');

    openModal('factModal');
    labelInput.focus();
}

// ---------- Save Fact (Add or Edit) ----------

/**
 * Handles the save button in the fact modal.
 */
async function handleFactModalSave() {
    const modal = document.getElementById('factModal');
    const labelInput = document.getElementById('factLabelInput');
    const valueInput = document.getElementById('factValueInput');

    const label = labelInput.value.trim();
    const value = valueInput.value.trim();

    if (!label) {
        alert('Please enter a label.');
        return;
    }

    if (!value) {
        alert('Please enter a value.');
        return;
    }

    const mode = modal.dataset.mode;
    const targetType = modal.dataset.targetType;
    const targetId = modal.dataset.targetId;

    try {
        if (mode === 'add') {
            await userCol('facts').add({
                targetType: targetType,
                targetId: targetId,
                label: label,
                value: value,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            console.log('Fact added:', label, '=', value);

        } else if (mode === 'edit') {
            const factId = modal.dataset.editId;
            await userCol('facts').doc(factId).update({
                label: label,
                value: value
            });
            console.log('Fact updated:', label, '=', value);
        }

        closeModal('factModal');
        reloadFactsForCurrentTarget(targetType, targetId);

    } catch (error) {
        console.error('Error saving fact:', error);
        alert('Error saving fact. Check console for details.');
    }
}

// ---------- Delete Fact ----------

/**
 * Deletes a fact after confirmation.
 * @param {string} factId - The fact's Firestore document ID.
 * @param {string} targetType - "plant" or "zone"
 * @param {string} targetId - The target's Firestore document ID.
 */
async function handleDeleteFact(factId, targetType, targetId) {
    if (!confirm('Are you sure you want to delete this fact?')) {
        return;
    }

    try {
        await userCol('facts').doc(factId).delete();
        console.log('Fact deleted:', factId);
        reloadFactsForCurrentTarget(targetType, targetId);

    } catch (error) {
        console.error('Error deleting fact:', error);
        alert('Error deleting fact. Check console for details.');
    }
}

// ---------- Reload Helper ----------

/**
 * Reloads the facts list for the current target.
 * @param {string} targetType - "plant" or "zone"
 * @param {string} targetId - The target's Firestore document ID.
 */
function reloadFactsForCurrentTarget(targetType, targetId) {
    // Chemical is special: different container depending on whether modal is open
    if (targetType === 'chemical') {
        var chemModal = document.getElementById('chemicalModal');
        if (chemModal && chemModal.classList.contains('open')) {
            loadFacts('chemical', targetId, 'chemicalModalFactsContainer', 'chemicalModalFactsEmptyState');
        } else {
            loadFacts('chemical', targetId, 'chemicalFactsContainer', 'chemicalFactsEmptyState');
        }
        return;
    }

    var map = {
        'plant':            ['plantFactsContainer',              'plantFactsEmptyState'],
        'zone':             ['zoneFactsContainer',               'zoneFactsEmptyState'],
        'weed':             ['weedFactsContainer',               'weedFactsEmptyState'],
        'problem':          ['problemFactsContainer',            'problemFactsEmptyState'],
        'vehicle':          ['vehicleFactsContainer',            'vehicleFactsEmptyState'],
        'panel':            ['panelFactsContainer',              'panelFactsEmptyState'],
        'floor':            ['floorFactsContainer',              'floorFactsEmptyState'],
        'room':             ['roomFactsContainer',               'roomFactsEmptyState'],
        'thing':            ['thingFactsContainer',              'thingFactsEmptyState'],
        'subthing':         ['stFactsContainer',                 'stFactsEmptyState'],
        'garageroom':       ['garageRoomFactsContainer',         'garageRoomFactsEmpty'],
        'garagething':      ['garageThingFactsContainer',        'garageThingFactsEmpty'],
        'garagesubthing':   ['garageSubThingFactsContainer',     'garageSubThingFactsEmpty'],
        'structure':        ['structureFactsContainer',          'structureFactsEmpty'],
        'structurething':   ['structureThingFactsContainer',     'structureThingFactsEmpty'],
        'structuresubthing':['structureSubThingFactsContainer',  'structureSubThingFactsEmpty'],
        'person':           ['personFactsContainer',             'personFactsEmptyState'],
        'bucketItem':       ['blFactsContainer',                 'blFactsEmptyState'],
    };
    var ids = map[targetType];
    if (ids) {
        loadFacts(targetType, targetId, ids[0], ids[1]);
    }
}

// ---------- Event Listeners ----------

document.addEventListener('DOMContentLoaded', function() {

    // "Add Fact" buttons (plant, zone, and chemical detail pages)
    document.getElementById('addPlantFactBtn').addEventListener('click', function() {
        if (window.currentPlant) {
            openAddFactModal('plant', window.currentPlant.id);
        }
    });

    document.getElementById('addZoneFactBtn').addEventListener('click', function() {
        if (window.currentZone) {
            openAddFactModal('zone', window.currentZone.id);
        }
    });

    document.getElementById('addChemicalFactBtn').addEventListener('click', function() {
        if (window.currentChemical) {
            openAddFactModal('chemical', window.currentChemical.id);
        }
    });

    document.getElementById('addWeedFactBtn').addEventListener('click', function() {
        if (window.currentWeed) {
            openAddFactModal('weed', window.currentWeed.id);
        }
    });

    document.getElementById('addBucketFactBtn').addEventListener('click', function() {
        if (window.currentBucketItem) {
            openAddFactModal('bucketItem', window.currentBucketItem.id);
        }
    });

    document.getElementById('addPlaceFactBtn').addEventListener('click', function() {
        if (window.currentPlace) {
            openAddFactModal('place', window.currentPlace.id);
        }
    });

    document.getElementById('addProblemFactBtn').addEventListener('click', async function() {
        // ensureProblemSaved() handles both add mode (saves first) and edit mode (returns existing ID)
        var problemId = await ensureProblemSaved();
        if (problemId) {
            openAddFactModal('problem', problemId);
        }
    });

    document.getElementById('addChemicalModalFactBtn').addEventListener('click', function() {
        var chemicalId = document.getElementById('chemicalModal').dataset.editId;
        if (chemicalId) {
            openAddFactModal('chemical', chemicalId);
        }
    });

    // Fact modal — Delete button (only visible in edit mode)
    document.getElementById('factModalDeleteBtn').addEventListener('click', function() {
        const modal = document.getElementById('factModal');
        const factId = modal.dataset.editId;
        const targetType = modal.dataset.targetType;
        const targetId = modal.dataset.targetId;
        if (!factId) return;
        // Confirm before closing modal, so user can cancel without losing the modal
        if (!confirm('Delete this fact?')) return;
        closeModal('factModal');
        handleDeleteFact(factId, targetType, targetId);
    });

    // Fact modal — Save button
    document.getElementById('factModalSaveBtn').addEventListener('click', handleFactModalSave);

    // Fact modal — Enter key in value field submits
    document.getElementById('factValueInput').addEventListener('keydown', function(e) {
        if (e.key === 'Enter') handleFactModalSave();
    });

    // Fact modal — Cancel button
    document.getElementById('factModalCancelBtn').addEventListener('click', function() {
        closeModal('factModal');
    });

    // Fact modal — Close on overlay click
    document.getElementById('factModal').addEventListener('click', function(e) {
        if (e.target === this) closeModal('factModal');
    });
});
