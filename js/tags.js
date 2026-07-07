// ============================================================
// Tags.js — Tag management (managed list, soft-delete via `active` flag)
// Stored in Firestore collection: "tags"
// Tags let calendar events and quick tasks be grouped together across
// different entities (e.g. a "Yard Plan" view or a multi-item project).
// This phase (TAG-1) only builds the managed list itself — nothing
// references tagIds[] yet; that comes in later phases.
// ============================================================

// ---------- Load & Display Active Tags ----------

/**
 * Loads all active tags and displays them on the Tags page.
 */
async function loadTagsList() {
    const container = document.getElementById('tagsListContainer');
    const emptyState = document.getElementById('tagsEmptyState');

    try {
        const snapshot = await userCol('tags').get();

        container.innerHTML = '';

        // Treat missing `active` field as active (safety net, shouldn't happen going forward)
        const tags = [];
        snapshot.forEach(function(doc) {
            var data = doc.data();
            if (data.active !== false) tags.push({ id: doc.id, ...data });
        });

        if (tags.length === 0) {
            emptyState.textContent = 'No tags yet.';
            emptyState.style.display = 'block';
            return;
        }

        emptyState.style.display = 'none';

        tags.sort(function(a, b) { return a.name.localeCompare(b.name); });

        tags.forEach(function(tag) {
            container.appendChild(createTagItem(tag, false));
        });

    } catch (error) {
        console.error('Error loading tags:', error);
        emptyState.textContent = 'Error loading tags.';
        emptyState.style.display = 'block';
    }
}

/**
 * Loads all archived tags and renders them in the Archived section.
 * Called when the "Show archived" toggle is checked.
 */
async function loadArchivedTags() {
    const container = document.getElementById('tagsArchivedContainer');
    const emptyState = document.getElementById('tagsArchivedEmptyState');

    container.innerHTML = '';
    emptyState.classList.add('hidden');

    try {
        const snapshot = await userCol('tags').where('active', '==', false).get();

        const tags = [];
        snapshot.forEach(function(doc) {
            tags.push({ id: doc.id, ...doc.data() });
        });

        if (tags.length === 0) {
            emptyState.classList.remove('hidden');
            return;
        }

        tags.sort(function(a, b) { return a.name.localeCompare(b.name); });

        tags.forEach(function(tag) {
            container.appendChild(createTagItem(tag, true));
        });

    } catch (error) {
        console.error('Error loading archived tags:', error);
        container.innerHTML = '<p class="empty-state">Error loading archived tags.</p>';
    }
}

// ---------- Create a Tag Item Element ----------

/**
 * Creates a DOM element representing a single tag.
 * @param {Object} tag - The tag data (id, name, active).
 * @param {boolean} isArchived - Whether this card is being rendered in the Archived section.
 * @returns {HTMLElement} The tag item element.
 */
function createTagItem(tag, isArchived) {
    const item = document.createElement('div');
    item.className = isArchived ? 'cl-archived-card' : 'card tag-item';

    const info = document.createElement('div');
    info.className = isArchived ? 'cl-archived-info' : '';
    info.style.flex = '1';

    const title = document.createElement('div');
    title.className = 'card-title';
    title.textContent = tag.name;
    info.appendChild(title);

    item.appendChild(info);

    const btnGroup = document.createElement('div');
    btnGroup.className = isArchived ? 'cl-archived-btns' : 'card-list-btns';
    btnGroup.style.display = 'flex';
    btnGroup.style.gap = '6px';
    btnGroup.style.flexShrink = '0';

    if (isArchived) {
        const unarchiveBtn = document.createElement('button');
        unarchiveBtn.className = 'btn btn-secondary btn-small';
        unarchiveBtn.textContent = 'Unarchive';
        unarchiveBtn.addEventListener('click', function() { handleArchiveTag(tag.id, true); });
        btnGroup.appendChild(unarchiveBtn);
    } else {
        const editBtn = document.createElement('button');
        editBtn.className = 'btn btn-secondary btn-small';
        editBtn.textContent = 'Edit';
        editBtn.addEventListener('click', function() { openEditTagModal(tag); });
        btnGroup.appendChild(editBtn);
    }

    item.appendChild(btnGroup);

    return item;
}

// ---------- Add Tag ----------

/**
 * Opens the add-tag modal.
 */
function openAddTagModal() {
    const modal = document.getElementById('tagModal');
    const modalTitle = document.getElementById('tagModalTitle');
    const nameInput = document.getElementById('tagNameInput');

    modalTitle.textContent = 'Add Tag';
    nameInput.value = '';
    modal.dataset.mode = 'add';
    document.getElementById('tagModalArchiveBtn').style.display = 'none';

    openModal('tagModal');
    nameInput.focus();
}

// ---------- Edit Tag ----------

/**
 * Opens the edit-tag modal with existing data.
 * @param {Object} tag - The tag data (including id).
 */
function openEditTagModal(tag) {
    const modal = document.getElementById('tagModal');
    const modalTitle = document.getElementById('tagModalTitle');
    const nameInput = document.getElementById('tagNameInput');

    modalTitle.textContent = 'Edit Tag';
    nameInput.value = tag.name || '';
    modal.dataset.mode = 'edit';
    modal.dataset.editId = tag.id;
    document.getElementById('tagModalArchiveBtn').style.display = '';

    openModal('tagModal');
    nameInput.focus();
}

// ---------- Save Tag (Add or Edit) ----------

/**
 * Handles the save button in the tag modal.
 */
async function handleTagModalSave() {
    const modal = document.getElementById('tagModal');
    const nameInput = document.getElementById('tagNameInput');

    const name = nameInput.value.trim();

    if (!name) {
        alert('Please enter a name.');
        return;
    }

    const mode = modal.dataset.mode;

    try {
        if (mode === 'add') {
            await userCol('tags').add({
                name: name,
                active: true,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            console.log('Tag added:', name);

        } else if (mode === 'edit') {
            const tagId = modal.dataset.editId;
            await userCol('tags').doc(tagId).update({ name: name });
            console.log('Tag updated:', name);
        }

        closeModal('tagModal');
        loadTagsList();
        if (document.getElementById('tagsShowArchivedToggle').checked) loadArchivedTags();

    } catch (error) {
        console.error('Error saving tag:', error);
        alert('Error saving tag. Check console for details.');
    }
}

// ---------- Archive / Unarchive Tag ----------

/**
 * Archives or unarchives a tag by toggling the `active` flag.
 * Soft delete only — per the plan, tags are never hard-deleted, since
 * existing tagIds[] references on events/projects must keep resolving.
 * @param {string} tagId
 * @param {boolean} active - true to unarchive (make active), false to archive
 */
async function handleArchiveTag(tagId, active) {
    if (!active && !confirm('Archive this tag? It will be hidden from the tag picker but existing tagged items keep it.')) {
        return;
    }

    try {
        await userCol('tags').doc(tagId).update({ active: active });
        console.log('Tag ' + (active ? 'unarchived' : 'archived') + ':', tagId);

        closeModal('tagModal');
        loadTagsList();
        if (document.getElementById('tagsShowArchivedToggle').checked) loadArchivedTags();

    } catch (error) {
        console.error('Error updating tag:', error);
        alert('Error updating tag. Check console for details.');
    }
}

// ---------- Helper: Get all active tags (for future pickers) ----------

/**
 * Loads all active tags and returns them as an array (for use in a picker/dropdown).
 * @returns {Promise<Array>} Array of {id, name} objects sorted by name.
 */
async function getAllTags() {
    const snapshot = await userCol('tags').where('active', '==', true).get();
    const tags = [];
    snapshot.forEach(function(doc) {
        tags.push({ id: doc.id, ...doc.data() });
    });
    tags.sort(function(a, b) { return a.name.localeCompare(b.name); });
    return tags;
}

/**
 * Loads every tag (active AND archived) as an id -> name map, for resolving
 * chip labels on already-tagged items — an archived tag must keep resolving
 * its name even though it no longer appears in the picker.
 * @returns {Promise<Object>} Map of { tagId: tagName }.
 */
async function getTagNameMap() {
    const snapshot = await userCol('tags').get();
    const map = {};
    snapshot.forEach(function(doc) { map[doc.id] = doc.data().name; });
    return map;
}

// ---------- Tag Picker (checkbox list + inline "+ Add new tag" row) ----------
// Reusable component: built for the Calendar Event modal (TAG-2), intended to
// be reused as-is for the Quick Task List modal (TAG-3).

/**
 * Builds a checkbox list of all active tags inside a container element,
 * with an inline "+ Add new tag" row at the top that creates a tag
 * immediately and checks it — no detour to the Tags management page.
 * @param {string} containerId - The ID of the div to populate.
 * @param {string[]} selectedIds - Array of tag IDs to pre-check.
 */
async function buildTagCheckboxList(containerId, selectedIds) {
    var container = document.getElementById(containerId);
    container.innerHTML = '<em style="color:#888;font-size:0.85em;">Loading...</em>';

    try {
        var tags = await getAllTags();

        // If any currently-selected tag has since been archived, it won't be in the
        // active list above — include it anyway (marked archived) so it round-trips
        // through a save instead of silently being dropped just because the event
        // was re-edited for something unrelated. Archiving only blocks *new* picks.
        if (selectedIds && selectedIds.length) {
            var activeIds = tags.map(function(t) { return t.id; });
            var missingIds = selectedIds.filter(function(id) { return activeIds.indexOf(id) === -1; });
            if (missingIds.length) {
                var nameMap = await getTagNameMap();
                missingIds.forEach(function(id) {
                    if (nameMap[id]) tags.push({ id: id, name: nameMap[id], archived: true });
                });
                tags.sort(function(a, b) { return a.name.localeCompare(b.name); });
            }
        }

        container.innerHTML = '';

        // Inline "+ Add new tag" row — always shown at the top of the list
        var addRow = document.createElement('div');
        addRow.className = 'tag-picker-add-row';

        var addInput = document.createElement('input');
        addInput.type = 'text';
        addInput.className = 'tag-picker-add-input';
        addInput.placeholder = '+ Add new tag';

        var addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'btn btn-secondary btn-small';
        addBtn.textContent = 'Add';

        async function doAddNewTag() {
            var name = addInput.value.trim();
            if (!name) return;
            addBtn.disabled = true;
            try {
                var docRef = await userCol('tags').add({
                    name: name,
                    active: true,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                var stillChecked = getCheckedTagIds(containerId);
                stillChecked.push(docRef.id);
                await buildTagCheckboxList(containerId, stillChecked);
            } catch (e) {
                console.error('Error adding tag from picker:', e);
                alert('Error adding tag.');
                addBtn.disabled = false;
            }
        }

        addBtn.addEventListener('click', doAddNewTag);
        addInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') { e.preventDefault(); doAddNewTag(); }
        });

        addRow.appendChild(addInput);
        addRow.appendChild(addBtn);
        container.appendChild(addRow);

        if (tags.length === 0) {
            var none = document.createElement('em');
            none.style.cssText = 'color:#888;font-size:0.85em;display:block;padding:6px 14px;';
            none.textContent = 'No tags yet — add one above.';
            container.appendChild(none);
        } else {
            tags.forEach(function(tag) {
                var label = document.createElement('label');
                label.className = 'zone-checkbox-item';

                var checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.value = tag.id;
                checkbox.checked = selectedIds && selectedIds.indexOf(tag.id) >= 0;

                label.appendChild(checkbox);
                label.appendChild(document.createTextNode(' ' + tag.name + (tag.archived ? ' (archived)' : '')));
                container.appendChild(label);
            });
        }

    } catch (e) {
        console.error('Error loading tags for checkbox list:', e);
        container.innerHTML = '<em style="color:#888;font-size:0.85em;">Error loading tags.</em>';
    }
}

/**
 * Reads all checked tag IDs from a tag picker checkbox list container.
 * @param {string} containerId - The ID of the checkbox list container.
 * @returns {string[]} Array of checked tag IDs.
 */
function getCheckedTagIds(containerId) {
    var container = document.getElementById(containerId);
    var checked = [];
    var checkboxes = container.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(function(cb) {
        if (cb.checked) checked.push(cb.value);
    });
    return checked;
}

/**
 * Renders tag chips into a container element for a given set of tag IDs.
 * Resolves names via getTagNameMap() (active + archived), since an already-
 * tagged item must keep showing the tag name even after it's archived.
 * @param {HTMLElement} containerEl - Element to render chips into.
 * @param {string[]} tagIds - Array of tag IDs to display.
 */
async function renderTagChips(containerEl, tagIds) {
    if (!tagIds || tagIds.length === 0) return;

    try {
        var nameMap = await getTagNameMap();
        containerEl.innerHTML = '';
        tagIds.forEach(function(id) {
            var name = nameMap[id];
            if (!name) return; // tag was hard-deleted (shouldn't happen — soft delete only)
            var chip = document.createElement('span');
            chip.className = 'mtag-chip';
            chip.textContent = name;
            containerEl.appendChild(chip);
        });
    } catch (e) {
        console.error('Error rendering tag chips:', e);
    }
}

// ---------- Event Listeners ----------

document.addEventListener('DOMContentLoaded', function() {

    // "Add Tag" button on tags page
    document.getElementById('addTagBtn').addEventListener('click', openAddTagModal);

    // Tag modal — Save button
    document.getElementById('tagModalSaveBtn').addEventListener('click', handleTagModalSave);

    // Tag modal — Cancel button
    document.getElementById('tagModalCancelBtn').addEventListener('click', function() {
        closeModal('tagModal');
    });

    // Tag modal — Close on overlay click
    document.getElementById('tagModal').addEventListener('click', function(e) {
        if (e.target === this) closeModal('tagModal');
    });

    // Tag modal — Enter key to save
    document.getElementById('tagNameInput').addEventListener('keydown', function(e) {
        if (e.key === 'Enter') handleTagModalSave();
    });

    // Tag modal — Archive button (edit mode only)
    document.getElementById('tagModalArchiveBtn').addEventListener('click', function() {
        var editId = document.getElementById('tagModal').dataset.editId;
        if (!editId) return;
        handleArchiveTag(editId, false);
    });

    // Tags page — "Show archived" toggle
    document.getElementById('tagsShowArchivedToggle').addEventListener('change', function() {
        var container = document.getElementById('tagsArchivedContainer');
        if (this.checked) {
            container.classList.remove('hidden');
            loadArchivedTags();
        } else {
            container.classList.add('hidden');
            document.getElementById('tagsArchivedEmptyState').classList.add('hidden');
        }
    });
});
