// ============================================================
// life-projects.js — Life Projects (Vacation, Build, General)
// Rich project management with itineraries, bookings, packing,
// to-dos, notes, and cost tracking.
// ============================================================

// ---------- Constants ----------

const LP_TEMPLATES = {
    vacation: { label: 'Vacation', icon: '✈️', enabled: true },
    build:    { label: 'Build',    icon: '🔨', enabled: false },
    general:  { label: 'General',  icon: '📋', enabled: false }
};

const LP_STATUSES = {
    planning: { label: 'Planning', color: '#2563eb' },
    active:   { label: 'Active',   color: '#16a34a' },
    'on-hold':{ label: 'On Hold',  color: '#d97706' },
    done:     { label: 'Done',     color: '#6b7280' }
};

const LP_DEFAULT_BOOKING_TYPES = [
    'Lodging', 'Flight', 'Car Rental', 'Excursion', 'Sports Event'
];

const LP_VACATION_TODO_STARTERS = [
    'Book flights',
    'Book hotel / lodging',
    'Book rental car',
    'Request time off from work',
    'Arrange pet care',
    'Check passport expiration',
    'Set up mail hold',
    'Download offline maps',
    'Notify bank of travel dates',
    'Print confirmations'
];

/**
 * Load the user's editable "new vacation" to-do starter list (edited from the
 * Projects page). Falls back to the built-in LP_VACATION_TODO_STARTERS default.
 * Stored in userCol('settings').doc('lifeProjects').vacationTodos.
 */
async function _lpGetVacationTodos() {
    try {
        const doc = await userCol('settings').doc('lifeProjects').get();
        if (doc.exists && Array.isArray(doc.data().vacationTodos)) {
            const list = doc.data().vacationTodos.map(s => (s || '').trim()).filter(Boolean);
            if (list.length) return list;
        }
    } catch (e) {
        console.warn('Could not load vacation to-do template:', e);
    }
    return [...LP_VACATION_TODO_STARTERS];
}

/** Open the editor for the new-vacation to-do template (from the Projects page). */
async function _lpOpenTodoTemplateModal() {
    const list = await _lpGetVacationTodos();
    document.getElementById('lpTodoTemplateText').value = list.join('\n');
    openModal('lpTodoTemplateModal');
}

/** Reset the template editor to the built-in defaults (not saved until Save). */
function _lpResetTodoTemplate() {
    document.getElementById('lpTodoTemplateText').value = LP_VACATION_TODO_STARTERS.join('\n');
}

/** Save the edited new-vacation to-do template (one item per line). */
async function _lpSaveTodoTemplate() {
    const raw  = document.getElementById('lpTodoTemplateText').value;
    const list = raw.split('\n').map(s => s.trim()).filter(Boolean);
    try {
        await userCol('settings').doc('lifeProjects').set(
            { vacationTodos: list, updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
            { merge: true }
        );
        closeModal('lpTodoTemplateModal');
    } catch (e) {
        console.error('Error saving to-do template:', e);
        alert('Error saving the template. Please try again.');
    }
}

// ---------- Collection helpers ----------

/** Get reference to user-scoped lifeProjects collection */
function lpCol() {
    return userCol('lifeProjects');
}

/** Get subcollection under a project doc */
function lpSub(projectId, subName) {
    return lpCol().doc(projectId).collection(subName);
}

/** User-scoped locations collection (cross-project reuse within the account) */
function lpLocationsCol() {
    return userCol('locations');
}

/** User-scoped distances collection */
function lpDistancesCol() {
    return userCol('distances');
}

// ============================================================
// Project List Page (#life-projects)
// ============================================================

async function loadLifeProjectsPage() {
    // Set breadcrumb in sticky header
    var crumb = document.getElementById('breadcrumbBar');
    if (crumb) crumb.innerHTML = '<a href="#life">Life</a><span class="separator">&rsaquo;</span><span>Projects</span>';

    const page = document.getElementById('page-life-projects');
    page.innerHTML = `
        <div class="page-header">
            <button class="back-btn" onclick="location.hash='#life'">&larr;</button>
            <h2 style="flex:1;">Projects</h2>
        </div>
        <div style="padding:16px;">
            <div id="lpShowArchivedWrap" style="margin-bottom:12px; display:flex; align-items:center; gap:8px;">
                <label style="font-size:0.9em; color:#666; display:flex; align-items:center; gap:6px;">
                    <input type="checkbox" id="lpShowArchived" onchange="renderLifeProjectsList()"> Show archived
                </label>
            </div>
            <div id="lpProjectList"></div>
            <div style="display:flex; gap:8px; margin-top:16px;">
                <button class="btn btn-primary" style="flex:1;" onclick="openNewLifeProjectModal()">+ New Project</button>
                <button class="btn" style="flex:0 0 auto;" onclick="document.getElementById('lpImportFileInput').click()">📥 Import</button>
            </div>
            <div style="margin-top:12px;">
                <a href="#" onclick="event.preventDefault(); _lpOpenTodoTemplateModal();" style="font-size:0.85em; color:#2563eb;">✏️ Edit new-vacation to-do template</a>
            </div>
            <input type="file" id="lpImportFileInput" accept=".json" style="display:none;" onchange="_lpHandleImportFile(event)">

            <!-- Edit Vacation To-Do Template Modal -->
            <div class="modal-overlay" id="lpTodoTemplateModal">
                <div class="modal" style="max-width:460px;">
                    <h3 style="margin:0 0 8px;">New-Vacation To-Do Template</h3>
                    <p style="font-size:0.85em; color:#666; margin:0 0 8px;">One to-do per line. These are added automatically when you create a new <strong>Vacation</strong> project. Editing here does not change projects you've already created.</p>
                    <textarea id="lpTodoTemplateText" class="form-control" rows="12" style="width:100%; box-sizing:border-box; resize:vertical; font-size:0.9em;"></textarea>
                    <div class="modal-actions" style="justify-content:space-between; align-items:center; margin-top:12px;">
                        <button class="btn btn-small" onclick="_lpResetTodoTemplate()">Reset to defaults</button>
                        <div style="display:flex; gap:8px;">
                            <button class="btn" onclick="closeModal('lpTodoTemplateModal')">Cancel</button>
                            <button class="btn btn-primary" onclick="_lpSaveTodoTemplate()">Save</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Import People Linking Modal -->
        <div class="modal-overlay" id="lpImportPeopleModal">
            <div class="modal">
                <h3>Link People</h3>
                <div id="lpImportPeopleBody"></div>
            </div>
        </div>

        <!-- Import Progress Modal -->
        <div class="modal-overlay" id="lpImportProgressModal">
            <div class="modal">
                <h3>Importing Project…</h3>
                <div id="lpImportProgressBody" style="padding:12px 0;">
                    <p style="color:#666;">Creating project and all data…</p>
                </div>
            </div>
        </div>

        <!-- New/Edit Project Modal -->
        <div class="modal-overlay" id="lpProjectModal">
            <div class="modal">
                <h3 id="lpProjectModalTitle">New Project</h3>
                <div id="lpProjectModalBody"></div>
                <div class="modal-actions">
                    <button class="btn" onclick="closeModal('lpProjectModal')">Cancel</button>
                    <button class="btn btn-primary" id="lpProjectSaveBtn" onclick="saveLifeProject()">Create</button>
                </div>
            </div>
        </div>

        <!-- Delete Confirmation Modal -->
        <div class="modal-overlay" id="lpDeleteModal">
            <div class="modal">
                <h3>Delete Project</h3>
                <p id="lpDeleteMsg">Are you sure? This will delete the project and all its data (days, bookings, to-dos, packing list, notes). This cannot be undone.</p>
                <div class="modal-actions">
                    <button class="btn" onclick="closeModal('lpDeleteModal')">Cancel</button>
                    <button class="btn btn-danger" id="lpDeleteConfirmBtn" onclick="confirmDeleteLifeProject()">Delete</button>
                </div>
            </div>
        </div>
    `;

    await renderLifeProjectsList();
}

/** Render the project card list */
async function renderLifeProjectsList() {
    const container = document.getElementById('lpProjectList');
    if (!container) return;
    container.innerHTML = '<p style="color:#999;">Loading projects...</p>';

    try {
        const showArchived = document.getElementById('lpShowArchived')?.checked || false;
        let query = lpCol().orderBy('createdAt', 'desc');
        const snap = await query.get();

        const projects = [];
        snap.forEach(doc => {
            const d = doc.data();
            if (!showArchived && d.archived) return;
            projects.push({ id: doc.id, ...d });
        });

        if (projects.length === 0) {
            container.innerHTML = '<p style="color:#999; text-align:center; margin-top:32px;">No projects yet. Create one to get started!</p>';
            return;
        }

        // Manual order: projects with a sortOrder come in that order; projects
        // without one (never reordered / newly created) float to the top by
        // createdAt-desc. So new projects appear on top, and once you drag,
        // everything gets an explicit sortOrder.
        projects.sort((a, b) => {
            const aHas = typeof a.sortOrder === 'number';
            const bHas = typeof b.sortOrder === 'number';
            if (aHas && bHas) return a.sortOrder - b.sortOrder;
            if (!aHas && !bHas) return _lpProjCreatedMillis(b) - _lpProjCreatedMillis(a);
            return aHas ? 1 : -1; // un-ordered (new) before ordered → top
        });

        container.innerHTML = projects.map(p => _lpProjectCard(p)).join('');

        // Drag-to-reorder (handle only, so tapping a card still opens it)
        if (typeof Sortable !== 'undefined') {
            Sortable.create(container, {
                animation: 150,
                handle: '.lp-drag-handle',
                onEnd: _lpReorderProjects
            });
        }
    } catch (err) {
        console.error('Error loading life projects:', err);
        container.innerHTML = '<p style="color:red;">Error loading projects.</p>';
    }
}

/** Milliseconds of a project's createdAt (0 if missing) — for createdAt-desc fallback. */
function _lpProjCreatedMillis(p) {
    return (p.createdAt && typeof p.createdAt.toMillis === 'function') ? p.createdAt.toMillis() : 0;
}

/** Persist the new project order after a drag: sortOrder = position for each card. */
async function _lpReorderProjects() {
    const ids = [...document.querySelectorAll('#lpProjectList .lp-project-card')].map(el => el.dataset.id);
    if (!ids.length) return;
    try {
        const batch = firebase.firestore().batch();
        ids.forEach((id, i) => batch.update(lpCol().doc(id), { sortOrder: i }));
        await batch.commit();
    } catch (err) {
        console.error('Error saving project order:', err);
        alert('Could not save the new order. Please try again.');
    }
}

/** Build HTML for a single project card */
function _lpProjectCard(p) {
    const tpl = LP_TEMPLATES[p.template] || LP_TEMPLATES.general;
    const st = LP_STATUSES[p.status] || LP_STATUSES.planning;
    const dateRange = _lpFormatDateRange(p.startDate, p.endDate);
    const archivedBadge = p.archived ? '<span style="background:#e5e7eb;color:#6b7280;font-size:0.75em;padding:2px 8px;border-radius:12px;margin-left:6px;">Archived</span>' : '';

    return `
        <div class="card lp-project-card" data-id="${p.id}" style="margin-bottom:12px; ${p.archived ? 'opacity:0.6;' : ''}">
            <div style="display:flex; align-items:flex-start; gap:8px;">
                <span class="lp-drag-handle" onclick="event.stopPropagation()" title="Drag to reorder"
                      style="cursor:grab; color:#cbd5e1; padding:2px; font-size:1.15em; line-height:1; user-select:none; touch-action:none;">⠿</span>
                <div style="flex:1; min-width:0; cursor:pointer;" onclick="location.hash='#life-project/${p.id}'">
                    <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                        <span style="font-size:1.1em;">${tpl.icon}</span>
                        <strong style="font-size:1.05em;">${_lpEsc(p.title)}</strong>
                        ${archivedBadge}
                    </div>
                    ${p.description ? `<p style="color:#666; font-size:0.9em; margin:4px 0 0;">${_lpEsc(p.description)}</p>` : ''}
                    ${dateRange ? `<p style="color:#888; font-size:0.85em; margin:4px 0 0;">${dateRange}</p>` : ''}
                    <div style="margin-top:4px;">
                        <span style="background:${st.color};color:#fff;font-size:0.75em;padding:2px 10px;border-radius:12px;white-space:nowrap;">${st.label}</span>
                    </div>
                </div>
            </div>
            <div style="display:flex; gap:8px; margin-top:8px; justify-content:flex-end;" onclick="event.stopPropagation();">
                <button class="btn btn-small" onclick="openEditLifeProjectModal('${p.id}')" title="Edit">✏️</button>
                <button class="btn btn-small" onclick="toggleArchiveLifeProject('${p.id}', ${!p.archived})" title="${p.archived ? 'Unarchive' : 'Archive'}">${p.archived ? '📤' : '📥'}</button>
                <button class="btn btn-small btn-danger" onclick="openDeleteLifeProject('${p.id}', '${_lpEsc(p.title)}')" title="Delete">🗑️</button>
            </div>
        </div>
    `;
}

/** Format date range for display */
function _lpFormatDateRange(start, end) {
    if (!start) return '';
    const opts = { month: 'short', day: 'numeric', year: 'numeric' };
    const s = new Date(start + 'T00:00:00').toLocaleDateString(undefined, opts);
    if (!end) return s;
    const e = new Date(end + 'T00:00:00').toLocaleDateString(undefined, opts);
    return `${s} — ${e}`;
}

// ============================================================
// New / Edit Project Modal
// ============================================================

function openNewLifeProjectModal() {
    const modal = document.getElementById('lpProjectModal');
    modal.dataset.mode = 'add';
    modal.dataset.editId = '';
    document.getElementById('lpProjectModalTitle').textContent = 'New Project';
    document.getElementById('lpProjectSaveBtn').textContent = 'Create';

    document.getElementById('lpProjectModalBody').innerHTML = `
        <div class="form-group" style="margin-bottom:12px;">
            <label>Template</label>
            <div id="lpTemplatePicker" style="display:flex; gap:8px; flex-wrap:wrap; margin-top:4px;">
                ${Object.entries(LP_TEMPLATES).map(([key, t]) => `
                    <button class="btn ${key === 'vacation' ? 'btn-primary' : ''}"
                            data-template="${key}"
                            onclick="_lpPickTemplate('${key}')"
                            ${!t.enabled ? 'disabled style="opacity:0.4;cursor:not-allowed;"' : ''}>
                        ${t.icon} ${t.label}
                    </button>
                `).join('')}
            </div>
            <input type="hidden" id="lpTemplate" value="vacation">
        </div>
        <div class="form-group" style="margin-bottom:12px;">
            <label for="lpTitle">Title *</label>
            <input type="text" id="lpTitle" class="form-control" placeholder="e.g. Yellowstone 2026">
        </div>
        <div class="form-group" style="margin-bottom:12px;">
            <label for="lpDescription">Description</label>
            <textarea id="lpDescription" class="form-control" rows="2" placeholder="Brief description..."></textarea>
        </div>
        <div style="display:flex; gap:12px; margin-bottom:12px;">
            <div class="form-group" style="flex:1;">
                <label for="lpStartDate">Start Date</label>
                <input type="date" id="lpStartDate" class="form-control">
            </div>
            <div class="form-group" style="flex:1;">
                <label for="lpEndDate">End Date</label>
                <input type="date" id="lpEndDate" class="form-control" onfocus="_lpDefaultEndDate()">
            </div>
        </div>
    `;

    openModal('lpProjectModal');
}

function openEditLifeProjectModal(projectId) {
    const modal = document.getElementById('lpProjectModal');
    modal.dataset.mode = 'edit';
    modal.dataset.editId = projectId;
    document.getElementById('lpProjectModalTitle').textContent = 'Edit Project';
    document.getElementById('lpProjectSaveBtn').textContent = 'Save';

    // Load project data and populate
    lpCol().doc(projectId).get().then(doc => {
        if (!doc.exists) { alert('Project not found.'); return; }
        const p = doc.data();

        document.getElementById('lpProjectModalBody').innerHTML = `
            <div class="form-group" style="margin-bottom:12px;">
                <label>Template</label>
                <p style="margin:4px 0; color:#666;">${(LP_TEMPLATES[p.template] || LP_TEMPLATES.general).icon} ${(LP_TEMPLATES[p.template] || LP_TEMPLATES.general).label} <span style="font-size:0.8em; color:#999;">(locked)</span></p>
            </div>
            <div class="form-group" style="margin-bottom:12px;">
                <label for="lpTitle">Title *</label>
                <input type="text" id="lpTitle" class="form-control" value="${_lpEsc(p.title || '')}">
            </div>
            <div class="form-group" style="margin-bottom:12px;">
                <label for="lpDescription">Description</label>
                <textarea id="lpDescription" class="form-control" rows="2">${_lpEsc(p.description || '')}</textarea>
            </div>
            <div style="display:flex; gap:12px; margin-bottom:12px;">
                <div class="form-group" style="flex:1;">
                    <label for="lpStartDate">Start Date</label>
                    <input type="date" id="lpStartDate" class="form-control" value="${p.startDate || ''}">
                </div>
                <div class="form-group" style="flex:1;">
                    <label for="lpEndDate">End Date</label>
                    <input type="date" id="lpEndDate" class="form-control" value="${p.endDate || ''}" onfocus="_lpDefaultEndDate()">
                </div>
            </div>
            <div class="form-group" style="margin-bottom:12px;">
                <label for="lpStatus">Status</label>
                <select id="lpStatus" class="form-control">
                    ${Object.entries(LP_STATUSES).map(([k, v]) => `<option value="${k}" ${p.status === k ? 'selected' : ''}>${v.label}</option>`).join('')}
                </select>
            </div>
        `;

        openModal('lpProjectModal');
    });
}

/** When focusing the end date with no value, default it to the start date */
function _lpDefaultEndDate() {
    const end   = document.getElementById('lpEndDate');
    const start = document.getElementById('lpStartDate');
    if (end && !end.value && start && start.value) end.value = start.value;
}

/** Template picker highlight */
function _lpPickTemplate(key) {
    document.querySelectorAll('#lpTemplatePicker button').forEach(btn => {
        btn.classList.toggle('btn-primary', btn.dataset.template === key);
    });
    document.getElementById('lpTemplate').value = key;
}

/** Save new or updated project */
async function saveLifeProject() {
    const modal = document.getElementById('lpProjectModal');
    const mode = modal.dataset.mode;
    const editId = modal.dataset.editId;

    const title = document.getElementById('lpTitle')?.value.trim();
    if (!title) { alert('Title is required.'); return; }

    const description = document.getElementById('lpDescription')?.value.trim() || '';
    const startDate = document.getElementById('lpStartDate')?.value || null;
    const endDate = document.getElementById('lpEndDate')?.value || null;

    try {
        if (mode === 'add') {
            const template = document.getElementById('lpTemplate')?.value || 'vacation';
            const now = firebase.firestore.FieldValue.serverTimestamp();

            const docData = {
                title,
                description,
                template,
                status: 'planning',
                mode: 'planning',
                archived: false,
                startDate,
                endDate,
                targetType: 'life',
                targetId: null,
                people: [],
                bookingTypes: [...LP_DEFAULT_BOOKING_TYPES],
                createdAt: now,
                updatedAt: now
            };

            const ref = await lpCol().add(docData);

            // Auto-populate vacation starter to-do items (from the user's editable template)
            if (template === 'vacation') {
                const starters = await _lpGetVacationTodos();
                const batch = firebase.firestore().batch();
                starters.forEach((text, i) => {
                    const todoRef = lpSub(ref.id, 'todoItems').doc();
                    batch.set(todoRef, { text, done: false, notes: '', sortOrder: i });
                });
                await batch.commit();
            }

            closeModal('lpProjectModal');
            // Navigate to the new project detail — delay so closeModal's
            // history.back() settles before we push a new hash
            setTimeout(() => { location.hash = `#life-project/${ref.id}`; }, 50);
        } else {
            // Edit mode
            const status = document.getElementById('lpStatus')?.value || 'planning';
            await lpCol().doc(editId).update({
                title,
                description,
                startDate,
                endDate,
                status,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            closeModal('lpProjectModal');
            await renderLifeProjectsList();
        }
    } catch (err) {
        console.error('Error saving life project:', err);
        alert('Error saving project. Please try again.');
    }
}

// ============================================================
// Archive / Delete
// ============================================================

async function toggleArchiveLifeProject(projectId, archive) {
    try {
        await lpCol().doc(projectId).update({
            archived: archive,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        await renderLifeProjectsList();
    } catch (err) {
        console.error('Error archiving project:', err);
        alert('Error updating project.');
    }
}

/** Store project ID pending deletion */
let _lpDeleteId = null;

function openDeleteLifeProject(projectId, title) {
    _lpDeleteId = projectId;
    document.getElementById('lpDeleteMsg').textContent =
        `Are you sure you want to delete "${title}"? This will delete the project and all its data (days, bookings, to-dos, packing list, notes). This cannot be undone.`;
    openModal('lpDeleteModal');
}

/** Cascade delete: remove all subcollections then the project doc */
async function confirmDeleteLifeProject() {
    if (!_lpDeleteId) return;
    const projectId = _lpDeleteId;
    _lpDeleteId = null;
    closeModal('lpDeleteModal');

    try {
        // Delete all subcollections
        const subs = ['days', 'bookings', 'bookingPhotos', 'projectPhotos', 'itemPhotos', 'itemPhotoData', 'todoItems', 'packingItems', 'projectNotes', 'planningGroups', 'projectLocations'];
        for (const sub of subs) {
            const snap = await lpSub(projectId, sub).get();
            if (!snap.empty) {
                const batch = firebase.firestore().batch();
                snap.forEach(doc => batch.delete(doc.ref));
                await batch.commit();
            }
        }
        // Delete the project doc
        await lpCol().doc(projectId).delete();
        await renderLifeProjectsList();
    } catch (err) {
        console.error('Error deleting life project:', err);
        alert('Error deleting project. Please try again.');
    }
}

// ============================================================
// Project Detail Page (#life-project/:id)
// ============================================================

/** Current project state — shared across accordion sections */
let _lpCurrentProject = null;
let _lpCurrentProjectId = null;

/** Locations linked to this project [{id, locationId, name, address, phone, website, contact, notes}] */
let _lpLocations = [];

/** Distances for this project [{id, fromLocationId, toLocationId, miles, time, mode, notes}] — global collection filtered to project's locations */
let _lpDistances = [];
// Item photos are split across two subcollections on purpose:
//   itemPhotos     - {itemId, name, sortOrder, createdAt}  (light; loaded for the whole project)
//   itemPhotoData  - {imageData}                           (heavy; fetched only when a name is clicked)
// Firestore has no field projection in the client SDK, so keeping the Base64 in the
// same doc would mean listing names downloaded every image.
let _lpItemPhotos = [];
const _lpItemPhotoDataCache = {};  // photoId -> Base64, so re-opening a photo is free

/** When "Add new location first" is clicked inside the picker, we stash the item context here
 *  so we can re-open the picker and auto-select the new location after saving. */
let _lpPickerReturnCtx = null;

async function loadLifeProjectDetailPage(projectId) {
    _lpCurrentProjectId = projectId;
    // Reset expand state so all days/groups start collapsed for each project load
    _lpDayExpanded = new Set();
    _lpGroupExpanded = new Set();
    const page = document.getElementById('page-life-project');

    // Set breadcrumb — will update with project title after load
    var crumb = document.getElementById('breadcrumbBar');
    if (crumb) crumb.innerHTML = '<a href="#life">Life</a><span class="separator">&rsaquo;</span><a href="#life-projects">Projects</a><span class="separator">&rsaquo;</span><span>Loading...</span>';

    page.innerHTML = '<div style="padding:16px;"><p style="color:#999;">Loading project...</p></div>';

    try {
        const doc = await lpCol().doc(projectId).get();
        if (!doc.exists) {
            page.innerHTML = '<div style="padding:16px;"><p style="color:red;">Project not found.</p></div>';
            return;
        }
        _lpCurrentProject = { id: doc.id, ...doc.data() };
        // Update breadcrumb with project title
        var crumb = document.getElementById('breadcrumbBar');
        if (crumb) crumb.innerHTML = '<a href="#life">Life</a><span class="separator">&rsaquo;</span><a href="#life-projects">Projects</a><span class="separator">&rsaquo;</span><span>' + _lpEsc(_lpCurrentProject.title) + '</span>';
        _lpRenderDetailPage(page);
    } catch (err) {
        console.error('Error loading project detail:', err);
        page.innerHTML = '<div style="padding:16px;"><p style="color:red;">Error loading project.</p></div>';
    }
}

function _lpRenderDetailPage(page) {
    const p = _lpCurrentProject;
    const tpl = LP_TEMPLATES[p.template] || LP_TEMPLATES.general;
    const st = LP_STATUSES[p.status] || LP_STATUSES.planning;
    const dateRange = _lpFormatDateRange(p.startDate, p.endDate);
    const travel = _lpIsTravelMode();

    page.innerHTML = `
        <div class="page-header" style="flex-wrap:wrap; gap:8px;">
            <button class="back-btn" onclick="location.hash='#life-projects'">&larr;</button>
            <h2 style="flex:1; min-width:0;">${tpl.icon} ${_lpEsc(p.title)}</h2>
            <div style="display:flex; gap:6px; align-items:center;">
                <span style="background:${st.color};color:#fff;font-size:0.75em;padding:2px 10px;border-radius:12px;">${st.label}</span>
                <button class="btn btn-small" onclick="_lpToggleMode()" id="lpModeToggle" title="Switch mode">
                    ${p.mode === 'travel' ? '🧳 Travel' : '📝 Planning'}
                </button>
            </div>
        </div>
        <div style="padding:16px;">
            ${dateRange ? `<p style="color:#888; font-size:0.9em; margin-bottom:12px;">${dateRange}</p>` : ''}
            ${p.description ? `<p style="color:#555; margin-bottom:16px;">${_lpEsc(p.description)}</p>` : ''}

            <!-- Search box -->
            <div style="margin-bottom:12px; display:flex; gap:6px; align-items:center;">
                <input type="text" id="lpSearchBox" class="form-control" placeholder="Search project..."
                    style="font-size:0.9em; max-width:200px;"
                    onkeydown="if(event.key==='Enter') _lpRunSearch()">
                <button class="btn btn-small btn-primary" onclick="_lpRunSearch()">Search</button>
                <button class="btn btn-small" id="lpSearchClearBtn" onclick="_lpClearSearch()" style="display:none;">✕ Clear</button>
            </div>

            <!-- Item Edit Modal (shared by itinerary and planning board) -->
            <div class="modal-overlay" id="lpItemModal">
                <div class="modal" style="max-width:500px;">
                    <h3 id="lpItemModalTitle">Edit Item</h3>
                    <div style="display:flex; flex-direction:column; gap:10px;">
                        <div>
                            <label class="form-label">Title *</label>
                            <input type="text" id="lpItTitle" class="form-control" placeholder="Item title">
                        </div>
                        <div>
                            <label class="form-label">Status</label>
                            <select id="lpItStatus" class="form-control">
                                <option value="confirmed">Confirmed</option>
                                <option value="maybe">Maybe</option>
                                <option value="idea">Idea</option>
                                <option value="nope">Nope</option>
                            </select>
                        </div>
                        <div>
                            <label class="form-label">Type</label>
                            <select id="lpItType" class="form-control" onchange="_lpApplyItemTypeUI()">
                                <option value="none">None</option>
                                <option value="drive">Drive</option>
                                <option value="flight">Flight</option>
                                <option value="travel">Travel</option>
                                <option value="activity">Activity</option>
                                <option value="hotel">Hotel</option>
                            </select>
                        </div>
                        <div>
                            <label class="form-label">Start Time</label>
                            <input type="text" id="lpItTime" class="form-control" placeholder="e.g. 8:30am">
                        </div>
                        <div>
                            <label class="form-label">Duration</label>
                            <input type="text" id="lpItDuration" class="form-control" placeholder="e.g. 2 hours">
                        </div>
                        <div>
                            <label class="form-label" id="lpItLeaveTimeLabel">Leave By</label>
                            <input type="text" id="lpItLeaveTime" class="form-control" placeholder="e.g. 11:30am">
                        </div>
                        <div style="display:flex; gap:8px; align-items:center;">
                            <input type="checkbox" id="lpItOnTimeline">
                            <label for="lpItOnTimeline" style="font-size:0.9em; margin:0; cursor:pointer;">Part of official timeline</label>
                        </div>
                        <div style="display:flex; gap:8px; align-items:center;">
                            <input type="checkbox" id="lpItNoTravelNeeded">
                            <label for="lpItNoTravelNeeded" style="font-size:0.9em; margin:0; cursor:pointer;" title="Suppresses the &quot;travel time needed&quot; warning on the travel row after this item">No travel time needed</label>
                        </div>
                        <div id="lpItCostWrap">
                            <label class="form-label">Cost ($)</label>
                            <input type="number" id="lpItCost" class="form-control" placeholder="blank = none" step="0.01" min="0">
                        </div>
                        <div id="lpItCostNoteWrap">
                            <label class="form-label">Cost Note</label>
                            <input type="text" id="lpItCostNote" class="form-control" placeholder='e.g. "each", "for 2"'>
                        </div>
                        <div id="lpItConfirmationWrap">
                            <label class="form-label">Confirmation #</label>
                            <input type="text" id="lpItConfirmation" class="form-control">
                        </div>
                        <div id="lpItContactWrap">
                            <label class="form-label">Contact (phone/email)</label>
                            <input type="text" id="lpItContact" class="form-control">
                        </div>
                        <div>
                            <label class="form-label">Notes</label>
                            <textarea id="lpItNotes" class="form-control" rows="4" style="width:100%; box-sizing:border-box; resize:vertical;"></textarea>
                        </div>
                        <div>
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                                <label class="form-label" style="margin:0;">Facts</label>
                                <button class="btn btn-small" type="button" onclick="_lpAddFactRow()" style="padding:2px 8px; font-size:0.8em;">+ Add Fact</button>
                            </div>
                            <div id="lpItFactsContainer" style="display:flex; flex-direction:column; gap:4px;"></div>
                        </div>
                        <div>
                            <label class="form-label" id="lpItLocationLabel">Location</label>
                            <select id="lpItLocation" class="form-control">
                                <option value="">— None —</option>
                            </select>
                        </div>
                        <div id="lpItToLocationWrap" style="display:none;">
                            <label class="form-label">To Location</label>
                            <select id="lpItToLocation" class="form-control">
                                <option value="">— None —</option>
                            </select>
                        </div>
                        <div id="lpItBookingWrap">
                            <label class="form-label">Link to Booking</label>
                            <select id="lpItBooking" class="form-control">
                                <option value="">— None —</option>
                            </select>
                        </div>
                        <div style="display:flex; align-items:center; gap:8px;">
                            <input type="checkbox" id="lpItCalendar">
                            <label for="lpItCalendar" style="font-size:0.9em; margin:0;">Show on calendar</label>
                        </div>
                        <div id="lpItMoveWrap" style="border-top:1px solid #e2e8f0; padding-top:10px; margin-top:4px;">
                            <label class="form-label">Move to…</label>
                            <select id="lpItMoveTo" class="form-control">
                                <option value="">— Stay in place —</option>
                            </select>
                        </div>
                    </div>
                    <div class="modal-actions" style="justify-content:flex-end;">
                        <div style="display:flex; gap:8px;">
                            <button class="btn" onclick="closeModal('lpItemModal')">Cancel</button>
                            <button class="btn btn-danger" onclick="_lpDeleteItemFromModal()" title="Delete this item">🗑️ Delete</button>
                            <button class="btn btn-primary" onclick="_lpSaveItemModal()">Save</button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Per-accordion quick-help modal (opened by the ? icon on each section header) -->
            <div class="modal-overlay" id="lpHelpModal">
                <div class="modal" style="max-width:520px;">
                    <h3 id="lpHelpModalTitle">Help</h3>
                    <div id="lpHelpModalBody" class="lp-help-body" style="max-height:60vh; overflow-y:auto; font-size:0.92em; line-height:1.55;"></div>
                    <div class="modal-actions" style="justify-content:flex-end;">
                        <button class="btn btn-primary" onclick="closeModal('lpHelpModal')">Close</button>
                    </div>
                </div>
            </div>

            <!-- Location picker modal (set location on an item) -->
            <div class="modal-overlay" id="lpLocPickerModal">
                <div class="modal" style="max-width:500px; width:90%;">
                    <h3>Set Location</h3>
                    <div style="display:flex; flex-direction:column; gap:10px;">
                        <div>
                            <label class="form-label">Choose a location linked to this project</label>
                            <select id="lpLocPickerSelect" class="form-control" style="width:100%;">
                                <option value="">— None (clear location) —</option>
                            </select>
                        </div>
                        <div style="text-align:center; color:#999; font-size:0.85em;">— or —</div>
                        <button class="btn btn-small" type="button" onclick="_lpLocPickerAddNew()" style="align-self:flex-start;">+ Add new location first</button>
                    </div>
                    <div class="modal-actions" style="justify-content:flex-end;">
                        <button class="btn" onclick="closeModal('lpLocPickerModal')">Cancel</button>
                        <button class="btn btn-primary" onclick="_lpLocPickerSave()">Set Location</button>
                    </div>
                </div>
            </div>

            <!-- Location add/edit modal -->
            <div class="modal-overlay" id="lpLocationModal">
                <div class="modal" style="max-width:500px;">
                    <h3 id="lpLocationModalTitle">Add Location</h3>
                    <div style="display:flex; flex-direction:column; gap:10px;">
                        <!-- Search existing locations -->
                        <div id="lpLocSearchWrap">
                            <label class="form-label">Search existing locations</label>
                            <input type="text" id="lpLocSearch" class="form-control" placeholder="Type to search…" oninput="_lpLocSearchInput(this.value)">
                            <div id="lpLocSearchResults" style="border:1px solid #e2e8f0; border-radius:6px; max-height:160px; overflow-y:auto; display:none; margin-top:4px;"></div>
                        </div>
                        <div style="text-align:center; color:#999; font-size:0.85em;">— or create a new location —</div>
                        <!-- Find a place (reuses the check-in picker; fills name/address/lat/lng, then LLM enrichment for phone/website) -->
                        <div id="lpLocFindWrap">
                            <button type="button" class="btn btn-small" onclick="_lpFindPlace()" style="width:100%; background:#6366f1; color:#fff; border:none;">🔍 Find a place</button>
                            <div id="lpLocFindStatus" style="font-size:0.82em; color:#888; margin-top:4px; display:none;"></div>
                        </div>
                        <!-- New location fields -->
                        <div>
                            <label class="form-label">Name *</label>
                            <input type="text" id="lpLocName" class="form-control" placeholder="e.g. Mammoth Hot Springs" style="width:100%; box-sizing:border-box;">
                        </div>
                        <div>
                            <label class="form-label">Address</label>
                            <textarea id="lpLocAddress" class="form-control" rows="3" placeholder="Street, City, State ZIP" style="width:100%; box-sizing:border-box;"></textarea>
                        </div>
                        <!-- Coordinates (used for road-distance calculation) -->
                        <div>
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                                <label class="form-label" style="margin:0;">Coordinates (lat, lng)</label>
                                <button type="button" class="btn btn-small" id="lpLocGeocodeBtn" onclick="_lpGetLocationCoords()" style="padding:2px 8px; font-size:0.8em;" title="Look up coordinates from the address">📍 Get lat/lng</button>
                            </div>
                            <div style="display:flex; gap:8px;">
                                <input type="text" id="lpLocLat" class="form-control" placeholder="latitude" style="flex:1;" oninput="_lpSplitCoordPaste()" onfocus="const el=this;setTimeout(function(){el.select();},0);">
                                <input type="text" id="lpLocLng" class="form-control" placeholder="longitude" style="flex:1;">
                            </div>
                            <div id="lpLocGeocodeStatus" style="font-size:0.82em; color:#888; margin-top:4px; display:none;"></div>
                        </div>
                        <div style="display:flex; gap:8px;">
                            <div style="flex:1;">
                                <label class="form-label">Phone</label>
                                <input type="text" id="lpLocPhone" class="form-control">
                            </div>
                            <div style="flex:1;">
                                <label class="form-label">Website</label>
                                <input type="text" id="lpLocWebsite" class="form-control" placeholder="https://…">
                            </div>
                        </div>
                        <div>
                            <label class="form-label">Contact</label>
                            <input type="text" id="lpLocContact" class="form-control" placeholder="Name or email">
                        </div>
                        <div>
                            <label class="form-label">Notes</label>
                            <textarea id="lpLocNotes" class="form-control" rows="5" style="width:100%; box-sizing:border-box;"></textarea>
                        </div>
                        <div id="lpLocAddToPlanningWrap" style="display:flex; align-items:center; gap:8px;">
                            <input type="checkbox" id="lpLocAddToPlanning">
                            <label for="lpLocAddToPlanning" style="font-size:0.9em; margin:0;">Add to Planning Board as a new item</label>
                        </div>
                    </div>
                    <div class="modal-actions" style="justify-content:flex-end;">
                        <button class="btn" onclick="closeModal('lpLocationModal')">Cancel</button>
                        <button class="btn btn-primary" id="lpLocationSaveBtn" onclick="_lpSaveLocation()">Save</button>
                    </div>
                </div>
            </div>

            <!-- Import Locations modal -->
            <div class="modal-overlay" id="lpImportModal">
                <div class="modal" style="max-width:560px; width:92%;">
                    <h3>Import Locations</h3>
                    <div style="display:flex; flex-direction:column; gap:10px;">
                        <p style="font-size:0.85em; color:#666; margin:0;">
                            Paste an exported list of places (e.g. a Google&nbsp;My&nbsp;Maps CSV) or load a file.
                            AI reads whatever format it's in, an address is looked up for each point, and you
                            confirm the list before anything is saved.
                        </p>
                        <textarea id="lpImportText" class="form-control" rows="7" placeholder="Paste CSV / list here…" style="width:100%; box-sizing:border-box; font-family:monospace; font-size:0.82em;"></textarea>
                        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                            <button type="button" class="btn btn-small" onclick="document.getElementById('lpImportFile').click()">📄 Load file…</button>
                            <input type="file" id="lpImportFile" accept=".csv,.txt,.tsv,.kml,text/*" style="display:none;" onchange="_lpImportLoadFile(this)">
                            <button type="button" class="btn btn-primary btn-small" id="lpImportConvertBtn" onclick="_lpImportConvert()">✨ Convert with AI</button>
                        </div>
                        <div id="lpImportStatus" style="font-size:0.85em; color:#888; display:none;"></div>
                        <div id="lpImportPreview" style="display:none;"></div>
                        <div id="lpImportPlanningWrap" style="display:none; flex-direction:column; gap:6px; border-top:1px solid #eee; padding-top:8px;">
                            <div style="display:flex; align-items:center; gap:8px;">
                                <input type="checkbox" id="lpImportAddToPlanning" onchange="_lpImportTogglePlanning()">
                                <label for="lpImportAddToPlanning" style="font-size:0.9em; margin:0;">Add imported locations to the Planning Board</label>
                            </div>
                            <select id="lpImportGroupSelect" class="form-control" style="display:none;"></select>
                        </div>
                    </div>
                    <div class="modal-actions" style="justify-content:flex-end;">
                        <button class="btn" onclick="closeModal('lpImportModal')">Cancel</button>
                        <button class="btn btn-primary" id="lpImportBtn" onclick="_lpImportSelected()" style="display:none;">Import selected</button>
                    </div>
                </div>
            </div>

            <!-- Add/Edit Distance modal -->
            <div class="modal-overlay" id="lpDistanceModal">
                <div class="modal" style="max-width:500px; width:90%;">
                    <h3>Distance</h3>
                    <div style="display:flex; flex-direction:column; gap:10px;">
                        <div>
                            <label class="form-label">From *</label>
                            <div id="lpDistFromLabel" style="font-weight:600; padding:6px 0; color:#1e40af;"></div>
                            <select id="lpDistFrom" class="form-control" style="display:none;" onchange="_lpDistFromChanged()">
                                <option value="">— Select source —</option>
                            </select>
                            <input type="hidden" id="lpDistFromHidden">
                            <input type="hidden" id="lpDistLeaveTime">
                        </div>
                        <div>
                            <label class="form-label">To *</label>
                            <select id="lpDistTo" class="form-control">
                                <option value="">— Select destination —</option>
                            </select>
                        </div>
                        <div style="display:flex; gap:8px;">
                            <div style="flex:1;">
                                <label class="form-label">Time</label>
                                <input type="text" id="lpDistTime" class="form-control" placeholder="e.g. 25 min">
                            </div>
                            <div style="flex:1;">
                                <label class="form-label">Miles</label>
                                <input type="number" id="lpDistMiles" class="form-control" placeholder="e.g. 18" min="0" step="0.1">
                            </div>
                        </div>
                        <div>
                            <label class="form-label">Mode</label>
                            <select id="lpDistMode" class="form-control">
                                <option value="drive">🚗 Drive</option>
                                <option value="fly">✈️ Fly</option>
                                <option value="walk">🚶 Walk</option>
                                <option value="bike">🚲 Bike</option>
                            </select>
                        </div>
                        <div>
                            <label class="form-label">Notes</label>
                            <textarea id="lpDistNotes" class="form-control" rows="4" placeholder="Optional" style="width:100%; resize:vertical;"></textarea>
                        </div>
                    </div>
                    <div class="modal-actions" style="justify-content:space-between; margin-top:16px;">
                        <button class="btn btn-small" id="lpDistCalcBtn" onclick="_lpDistCalculate()" style="background:#6366f1; color:#fff; border:none;" title="Calculate real road distance + time via GraphHopper">🚗 Calculate</button>
                        <div style="display:flex; gap:8px;">
                            <button class="btn" onclick="closeModal('lpDistanceModal')">Cancel</button>
                            <button class="btn btn-primary" id="lpDistSaveBtn" onclick="_lpSaveDistance()">Save</button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Project link add/edit modal -->
            <div class="modal-overlay" id="lpLinkModal">
                <div class="modal" style="max-width:480px; width:90%;">
                    <h3 id="lpLinkModalTitle">Add Link</h3>
                    <div style="display:flex; flex-direction:column; gap:10px;">
                        <div>
                            <label class="form-label">Label</label>
                            <input type="text" id="lpLinkLabel" class="form-control" placeholder="e.g. Google Map, Park Website, Trip Video">
                        </div>
                        <div>
                            <label class="form-label">URL *</label>
                            <input type="url" id="lpLinkUrl" class="form-control" placeholder="https://...">
                        </div>
                    </div>
                    <div class="modal-actions" style="justify-content:flex-end; margin-top:16px;">
                        <button class="btn" onclick="closeModal('lpLinkModal')">Cancel</button>
                        <button class="btn btn-primary" id="lpLinkSaveBtn" onclick="_lpSaveLink()">Save</button>
                    </div>
                </div>
            </div>

            <!-- Note / Journal entry modal -->
            <div class="modal-overlay" id="lpNoteModal">
                <div class="modal" style="max-width:560px; width:90%;">
                    <h3 id="lpNoteModalTitle">Add Journal Entry</h3>
                    <div style="display:flex; flex-direction:column; gap:10px;">
                        <div>
                            <label class="form-label">Title</label>
                            <input type="text" id="lpNoteTitle" class="form-control" placeholder="Optional title">
                        </div>
                        <div>
                            <label class="form-label">Text</label>
                            <textarea id="lpNoteText" class="form-control" rows="12" style="width:100%; resize:vertical;" placeholder="Journal entry…"></textarea>
                        </div>
                        <div>
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                                <label class="form-label" style="margin:0;">Links / Facts</label>
                                <button class="btn btn-small" type="button" onclick="_lpAddNoteFactRow()" style="padding:2px 8px; font-size:0.8em;">+ Add</button>
                            </div>
                            <div id="lpNoteFactsContainer" style="display:flex; flex-direction:column; gap:4px;"></div>
                            <div style="font-size:0.75em; color:#999; margin-top:3px;">URL values become clickable links on the note card.</div>
                        </div>
                    </div>
                    <div class="modal-actions" style="justify-content:flex-end; margin-top:16px;">
                        <button class="btn" onclick="closeModal('lpNoteModal')">Cancel</button>
                        <button class="btn btn-primary" id="lpNoteSaveBtn" onclick="_lpSaveNoteModal()">Save</button>
                    </div>
                </div>
            </div>

            <!-- Accordion sections -->
            <div id="lpAccordion">
                ${_lpAccordionSection('tripInfo', '📍 Trip Info', '', true)}
                ${_lpAccordionSection('itinerary', '📅 Itinerary', '', travel)}
                ${travel ? '' : _lpAccordionSection('planning', '🗺️ Planning Board', '', false)}
                ${travel ? '' : _lpAccordionSection('notes', '📓 Journal', '', false)}
                ${travel ? '' : _lpAccordionSection('todos', '☑️ To-Do', '', false)}
                ${_lpAccordionSection('photos', '📸 Photos', '', false)}
                ${_lpAccordionSection('links', '🔗 Links', '', false)}
                ${_lpAccordionSection('bookings', '🏨 Bookings', '', travel)}
                ${_lpAccordionSection('packing', '🧳 Packing', '', false)}
                ${travel ? '' : _lpAccordionSection('locations', '📌 Locations', '', false)}
                ${travel ? '' : _lpAccordionSection('distances', '🛣️ Distances', '', false)}
                ${_lpAccordionSection('people', '👥 People', _lpPeopleSummary(p), false)}
            </div>
        </div>
    `;

    // Load bookings + days first so Trip Info can show cost rollup, then load visible sections
    _lpLoadInitialData().then(() => {
        _lpLoadTripInfo();
        if (!travel) _lpLoadTodos();
        if (travel) { _lpLoadItinerary(); _lpLoadBookings(); }
    });
}

/** Pre-load all subcollection data needed across sections */
async function _lpLoadInitialData() {
    if (!_lpCurrentProjectId) return;
    try {
        const [daySnap, bookingSnap, pgSnap, plSnap, distSnap, itemPhotoSnap] = await Promise.all([
            lpSub(_lpCurrentProjectId, 'days').orderBy('sortOrder').get(),
            lpSub(_lpCurrentProjectId, 'bookings').orderBy('sortOrder').get(),
            lpSub(_lpCurrentProjectId, 'planningGroups').orderBy('sortOrder').get(),
            lpSub(_lpCurrentProjectId, 'projectLocations').get(),
            lpDistancesCol().get(),
            lpSub(_lpCurrentProjectId, 'itemPhotos').get()
        ]);
        _lpDays = [];
        daySnap.forEach(doc => _lpDays.push({ id: doc.id, ...doc.data() }));
        _lpBookings = [];
        bookingSnap.forEach(doc => _lpBookings.push({ id: doc.id, ...doc.data() }));
        _lpPlanningGroups = [];
        pgSnap.forEach(doc => _lpPlanningGroups.push({ id: doc.id, ...doc.data() }));

        // Load project locations — each projectLocations doc has locationId + cached location fields
        _lpLocations = [];
        plSnap.forEach(doc => _lpLocations.push({ id: doc.id, ...doc.data() }));

        // Pre-load all distances so itinerary travel rows work without opening Distances accordion
        _lpDistances = [];
        distSnap.forEach(doc => _lpDistances.push({ id: doc.id, ...doc.data() }));

        // Item photo index - names and counts only, no image data (see _lpItemPhotos)
        _lpItemPhotos = [];
        itemPhotoSnap.forEach(doc => _lpItemPhotos.push({ id: doc.id, ...doc.data() }));
    } catch (err) {
        console.error('Error pre-loading data:', err);
    }
}

/** Build an accordion section shell */
function _lpAccordionSection(id, title, summary, expanded) {
    return `
        <div class="lp-accordion-section" id="lpAcc_${id}" data-expanded="${expanded}" data-default-open="${expanded}">
            <div class="lp-accordion-header" onclick="_lpToggleAccordion('${id}')" style="display:flex; justify-content:space-between; align-items:center; padding:12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; cursor:pointer; margin-bottom:4px; user-select:none;">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span class="lp-accordion-arrow" id="lpArrow_${id}" style="transition:transform 0.2s; display:inline-block; ${expanded ? 'transform:rotate(90deg);' : ''}"">▶</span>
                    <strong>${title}</strong>
                    <span class="lp-acc-help" onclick="event.stopPropagation(); _lpShowAccordionHelp('${id}')" title="Quick help for this section" style="cursor:help; color:#2563eb; border:1px solid #93c5fd; border-radius:50%; width:17px; height:17px; min-width:17px; display:inline-flex; align-items:center; justify-content:center; font-size:0.72em; font-weight:700; line-height:1;">?</span>
                    ${summary ? `<span style="color:#888; font-size:0.85em; margin-left:4px;">${summary}</span>` : ''}
                </div>
            </div>
            <div class="lp-accordion-body" id="lpBody_${id}" style="padding:12px 8px; ${expanded ? '' : 'display:none;'}">
                <p style="color:#999; font-size:0.9em;">Loading...</p>
            </div>
        </div>
    `;
}

/**
 * Maps each accordion id to its AppHelp.md sub-section key and a display title.
 * Each `## screen:life-project-{key}` section is authored as: an ELI5 paragraph,
 * a `---` divider, then the normal detailed help for that section.
 */
const LP_ACC_HELP = {
    tripInfo:  { key: 'life-project-tripinfo',  title: 'Trip Info' },
    itinerary: { key: 'life-project-itinerary', title: 'Itinerary' },
    planning:  { key: 'life-project-planning',  title: 'Planning Board' },
    notes:     { key: 'life-project-journal',   title: 'Journal' },
    todos:     { key: 'life-project-todo',       title: 'To-Do' },
    photos:    { key: 'life-project-photos',    title: 'Photos' },
    links:     { key: 'life-project-links',     title: 'Links' },
    bookings:  { key: 'life-project-bookings',  title: 'Bookings' },
    packing:   { key: 'life-project-packing',   title: 'Packing' },
    locations: { key: 'life-project-locations', title: 'Locations' },
    distances: { key: 'life-project-distances', title: 'Distances' },
    people:    { key: 'life-project-people',     title: 'People' }
};

/**
 * Open the quick-help modal for one accordion. Pulls its sub-section from
 * AppHelp.md and renders it (ELI5 + divider bar + normal help) using the shared
 * help renderer, so this content stays in sync with the in-app Help system.
 */
async function _lpShowAccordionHelp(id) {
    const cfg = LP_ACC_HELP[id];
    if (!cfg) return;
    document.getElementById('lpHelpModalTitle').textContent = 'Help: ' + cfg.title;
    const bodyEl = document.getElementById('lpHelpModalBody');
    bodyEl.innerHTML = '<p style="color:#999;">Loading…</p>';
    openModal('lpHelpModal');
    try {
        const fullText = await _helpFetch();
        let sectionText = _helpParseSection(fullText, cfg.key);
        if (!sectionText) sectionText = '_No help is available for this section yet._';
        bodyEl.innerHTML = _helpRenderContent(sectionText);
    } catch (err) {
        console.error('Error loading accordion help:', err);
        bodyEl.innerHTML = '<p style="color:#c00;">Could not load help content.</p>';
    }
}

/** Toggle an accordion section open/closed */
function _lpToggleAccordion(id) {
    const section = document.getElementById(`lpAcc_${id}`);
    const body = document.getElementById(`lpBody_${id}`);
    const arrow = document.getElementById(`lpArrow_${id}`);
    const isExpanded = section.dataset.expanded === 'true';

    if (isExpanded) {
        body.style.display = 'none';
        arrow.style.transform = '';
        section.dataset.expanded = 'false';
    } else {
        body.style.display = '';
        arrow.style.transform = 'rotate(90deg)';
        section.dataset.expanded = 'true';
        // Lazy-load content on first expand; re-apply active search after render
        Promise.resolve(_lpLoadAccordionContent(id)).then(() => {
            const q = document.getElementById('lpSearchBox')?.value?.trim();
            if (q) _lpFilterBySearch(q);
        });
    }
}

/** Load content for an accordion section (lazy). Returns a Promise. */
function _lpLoadAccordionContent(id) {
    switch (id) {
        case 'tripInfo':  return Promise.resolve(_lpLoadTripInfo());
        case 'people':    return _lpLoadPeople();
        case 'locations': return _lpLoadLocations();
        case 'distances': return _lpLoadDistances();
        case 'todos':     return _lpLoadTodos();
        case 'planning':  return _lpLoadPlanningBoard();
        case 'itinerary': return _lpLoadItinerary();
        case 'bookings':  return _lpLoadBookings();
        case 'packing':   return _lpLoadPacking();
        case 'photos':    return _lpLoadProjectPhotos();
        case 'links':     return Promise.resolve(_lpLoadLinks());
        case 'notes':     return _lpLoadNotes();
        default:          return Promise.resolve();
    }
}

/** Is the project currently in travel mode? */
function _lpIsTravelMode() {
    return _lpCurrentProject && _lpCurrentProject.mode === 'travel';
}

/** Toggle planning/travel mode — re-renders the entire detail page */
async function _lpToggleMode() {
    if (!_lpCurrentProjectId || !_lpCurrentProject) return;
    const newMode = _lpCurrentProject.mode === 'travel' ? 'planning' : 'travel';
    try {
        await lpCol().doc(_lpCurrentProjectId).update({ mode: newMode, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
        _lpCurrentProject.mode = newMode;
        // Re-render entire detail page to apply mode filtering
        const page = document.getElementById('page-life-project');
        _lpRenderDetailPage(page);
    } catch (err) {
        console.error('Error toggling mode:', err);
    }
}

// ============================================================
// Trip Info Section
// ============================================================

function _lpLoadTripInfo() {
    const body = document.getElementById('lpBody_tripInfo');
    if (!body || !_lpCurrentProject) return;
    const p = _lpCurrentProject;
    const costRollup = _lpCalculateCostRollup();
    const costBreakdown = _lpCostBreakdownText(costRollup);

    body.innerHTML = `
        <div style="display:grid; gap:8px;">
            ${p.startDate ? `<div><strong>Dates:</strong> ${_lpFormatDateRange(p.startDate, p.endDate)}</div>` : '<div style="color:#999;">No dates set</div>'}
            ${p.description ? `<div><strong>Description:</strong> ${_lpEsc(p.description)}</div>` : ''}
            ${costRollup.total > 0 ? `<div style="font-size:1.05em;"><strong>Total Trip Cost:</strong> <span style="color:#16a34a; font-weight:700;">$${costRollup.total.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</span>${costBreakdown ? ` <span style="color:#888; font-size:0.8em;">(${costBreakdown})</span>` : ''}</div>` : ''}
            <div style="margin-top:4px;">
                <button class="btn btn-small" onclick="_lpOpenTripInfoEdit()">✏️ Edit Project Info</button>
            </div>
        </div>
    `;
}

/** Open an inline edit modal for the project's title, description, and dates */
function _lpOpenTripInfoEdit() {
    const p = _lpCurrentProject;
    if (!p) return;

    let modal = document.getElementById('lpTripInfoEditModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'lpTripInfoEditModal';
        modal.className = 'modal-overlay';
        document.getElementById('page-life-project').appendChild(modal);
    }

    modal.innerHTML = `
        <div class="modal" style="max-width:480px;">
            <h3 style="margin:0 0 16px;">Edit Project Info</h3>
            <div class="form-group">
                <label>Title *</label>
                <input type="text" id="lpTripInfoTitle" class="form-control" value="${_lpEsc(p.title || '')}">
            </div>
            <div class="form-group">
                <label>Description</label>
                <textarea id="lpTripInfoDesc" class="form-control" rows="3">${_lpEsc(p.description || '')}</textarea>
            </div>
            <div style="display:flex; gap:12px;">
                <div class="form-group" style="flex:1;">
                    <label>Start Date</label>
                    <input type="date" id="lpTripInfoStart" class="form-control" value="${p.startDate || ''}">
                </div>
                <div class="form-group" style="flex:1;">
                    <label>End Date</label>
                    <input type="date" id="lpTripInfoEnd" class="form-control" value="${p.endDate || ''}">
                </div>
            </div>
            <div class="modal-actions">
                <button class="btn" onclick="closeModal('lpTripInfoEditModal')">Cancel</button>
                <button class="btn btn-primary" onclick="_lpSaveTripInfoEdit()">Save</button>
            </div>
        </div>`;

    openModal('lpTripInfoEditModal');
    setTimeout(() => document.getElementById('lpTripInfoTitle')?.focus(), 50);
}

async function _lpSaveTripInfoEdit() {
    const title       = document.getElementById('lpTripInfoTitle')?.value.trim() || '';
    const description = document.getElementById('lpTripInfoDesc')?.value.trim()  || '';
    const startDate   = document.getElementById('lpTripInfoStart')?.value || null;
    const endDate     = document.getElementById('lpTripInfoEnd')?.value   || null;

    if (!title) { alert('Title is required.'); return; }

    closeModal('lpTripInfoEditModal');
    try {
        await lpCol().doc(_lpCurrentProjectId).update({
            title, description, startDate, endDate,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        // Update in-memory project and refresh header + trip info
        Object.assign(_lpCurrentProject, { title, description, startDate, endDate });
        // Refresh breadcrumb title
        const crumb = document.getElementById('breadcrumbBar');
        if (crumb) crumb.innerHTML = `<a href="#life">Life</a><span class="separator">&rsaquo;</span><a href="#life-projects">Projects</a><span class="separator">&rsaquo;</span><span>${_lpEsc(title)}</span>`;
        // Refresh the project header and trip info panel
        loadLifeProjectDetailPage(_lpCurrentProjectId);
    } catch (err) {
        console.error('Error saving project info:', err);
        alert('Error saving project info.');
    }
}

/** Calculate total cost from bookings + day items */
function _lpCalculateCostRollup() {
    let bookingTotal = 0;
    _lpBookings.forEach(b => { if (b.cost != null && !isNaN(b.cost)) bookingTotal += Number(b.cost); });

    // Sum itinerary-item costs, broken out by item Type ('none'/legacy → 'other').
    const byType = {};
    let itemTotal = 0;
    _lpDays.forEach(d => (d.items || []).forEach(it => {
        if (it.cost != null && !isNaN(it.cost)) {
            const c = Number(it.cost);
            itemTotal += c;
            const key = (it.type && it.type !== 'none') ? it.type : 'other';
            byType[key] = (byType[key] || 0) + c;
        }
    }));

    return { bookings: bookingTotal, items: itemTotal, byType, total: bookingTotal + itemTotal };
}

// Build the "(bookings: $X, hotel: $Y, …)" breakdown for the trip cost line.
// bookings first, then item types in a fixed readable order, omitting any $0 bucket.
function _lpCostBreakdownText(rollup) {
    const parts = [];
    if (rollup.bookings > 0) parts.push('bookings: $' + rollup.bookings.toFixed(2));
    ['hotel', 'flight', 'travel', 'drive', 'activity', 'other'].forEach(key => {
        const v = rollup.byType[key] || 0;
        if (v > 0) parts.push(key + ': $' + v.toFixed(2));
    });
    return parts.join(', ');
}

// ============================================================
// People Section
// ============================================================

function _lpPeopleSummary(p) {
    if (!p.people || p.people.length === 0) return '';
    return `(${p.people.length})`;
}

/** All contacts cache for people picker */
let _lpAllPeople = null;

async function _lpEnsurePeopleCache() {
    if (_lpAllPeople) return _lpAllPeople;
    const snap = await userCol('people').orderBy('name').get();
    _lpAllPeople = snap.docs.map(doc => ({ id: doc.id, name: doc.data().name || '' }));
    return _lpAllPeople;
}

async function _lpLoadPeople() {
    const body = document.getElementById('lpBody_people');
    if (!body || !_lpCurrentProject) return;
    const people = _lpCurrentProject.people || [];

    // Load contacts cache
    await _lpEnsurePeopleCache();

    body.innerHTML = `
        <div class="lc-people-chips" id="lpPeopleChips"></div>
        <div class="lc-people-picker-wrap">
            <input type="text" id="lpPeopleSearch" class="form-control"
                   placeholder="Search by name…" autocomplete="off">
            <ul class="lc-people-dropdown hidden" id="lpPeopleDropdown"></ul>
        </div>
    `;

    // Render existing people as chips
    _lpRenderPeopleChips();

    // Wire search input
    const searchEl = document.getElementById('lpPeopleSearch');
    const dropEl   = document.getElementById('lpPeopleDropdown');

    searchEl.addEventListener('input', function() {
        const q = this.value.trim().toLowerCase();
        if (!q) { dropEl.classList.add('hidden'); dropEl.innerHTML = ''; return; }

        const selectedIds = (people).map(p => p.contactId).filter(Boolean);
        const matches = _lpAllPeople.filter(p =>
            p.name.toLowerCase().includes(q) && !selectedIds.includes(p.id)
        );

        if (matches.length === 0) {
            dropEl.innerHTML = '<li class="lc-people-no-match">No matches</li>';
            dropEl.classList.remove('hidden');
            return;
        }

        dropEl.innerHTML = matches.map(p =>
            `<li data-id="${p.id}" data-name="${_lpEsc(p.name)}">${_lpEsc(p.name)}</li>`
        ).join('');
        dropEl.classList.remove('hidden');

        dropEl.querySelectorAll('li[data-id]').forEach(li => {
            li.addEventListener('click', function() {
                _lpAddPersonFromContact(li.dataset.id, li.dataset.name);
                searchEl.value = '';
                dropEl.innerHTML = '';
                dropEl.classList.add('hidden');
            });
        });
    });

    // Enter key: if exactly one match (or first match), add it
    searchEl.addEventListener('keydown', function(e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const q = this.value.trim().toLowerCase();
        if (!q) return;
        const selectedIds = (_lpCurrentProject.people || []).map(p => p.contactId).filter(Boolean);
        const matches = _lpAllPeople.filter(p =>
            p.name.toLowerCase().includes(q) && !selectedIds.includes(p.id)
        );
        if (matches.length >= 1) {
            _lpAddPersonFromContact(matches[0].id, matches[0].name);
            searchEl.value = '';
            dropEl.innerHTML = '';
            dropEl.classList.add('hidden');
        }
    });

    // Close dropdown on outside click
    document.addEventListener('click', function _lpPickerOutside(e) {
        if (!e.target.closest('#lpPeopleSearch') && !e.target.closest('#lpPeopleDropdown')) {
            dropEl.classList.add('hidden');
            document.removeEventListener('click', _lpPickerOutside);
        }
    });
}

function _lpRenderPeopleChips() {
    const container = document.getElementById('lpPeopleChips');
    if (!container) return;
    container.innerHTML = '';

    const people = _lpCurrentProject.people || [];
    people.forEach((p, i) => {
        const chip = document.createElement('span');
        chip.className = 'lc-person-chip';
        const nameText = p.contactId
            ? `<a href="#person/${p.contactId}" class="lc-chip-name">${_lpEsc(p.name)}</a>`
            : `<span class="lc-chip-name">${_lpEsc(p.name)}</span>`;
        chip.innerHTML = nameText +
            `<button type="button" class="lc-chip-remove" title="Remove">✕</button>`;

        chip.querySelector('.lc-chip-remove').addEventListener('click', () => _lpRemovePerson(i));
        container.appendChild(chip);
    });
}

async function _lpAddPersonFromContact(contactId, name) {
    const people = [...(_lpCurrentProject.people || [])];
    if (people.some(p => p.contactId === contactId)) return; // already added
    people.push({ name: name.trim(), contactId: contactId, notes: '' });

    try {
        await lpCol().doc(_lpCurrentProjectId).update({
            people,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        _lpCurrentProject.people = people;
        _lpRenderPeopleChips();
        _lpUpdateAccordionSummary('people', _lpPeopleSummary(_lpCurrentProject));
    } catch (err) {
        console.error('Error adding person:', err);
    }
}

async function _lpEditPerson(index) {
    const people = [...(_lpCurrentProject.people || [])];
    if (index < 0 || index >= people.length) return;

    const notes = prompt('Notes for ' + people[index].name + ':', people[index].notes || '') || '';
    people[index] = { ...people[index], notes: notes.trim() };

    try {
        await lpCol().doc(_lpCurrentProjectId).update({
            people,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        _lpCurrentProject.people = people;
    } catch (err) {
        console.error('Error editing person:', err);
    }
}

async function _lpRemovePerson(index) {
    const people = [...(_lpCurrentProject.people || [])];
    people.splice(index, 1);

    try {
        await lpCol().doc(_lpCurrentProjectId).update({
            people,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        _lpCurrentProject.people = people;
        _lpRenderPeopleChips();
        _lpUpdateAccordionSummary('people', _lpPeopleSummary(_lpCurrentProject));
    } catch (err) {
        console.error('Error removing person:', err);
    }
}

// ============================================================
// Locations Section
// ============================================================

/** Load and render the Locations accordion body */
async function _lpLoadLocations() {
    const body = document.getElementById('lpBody_locations');
    if (!body) return;
    body.innerHTML = '<p style="color:#999; padding:8px;">Loading…</p>';

    try {
        // Reload from Firestore to get fresh data
        const snap = await lpSub(_lpCurrentProjectId, 'projectLocations').orderBy('name').get();
        _lpLocations = [];
        snap.forEach(doc => _lpLocations.push({ id: doc.id, ...doc.data() }));
        _lpRenderLocations(body);
        _lpUpdateAccordionSummary('locations', _lpLocations.length > 0 ? `(${_lpLocations.length})` : '');
    } catch (err) {
        console.error('Error loading locations:', err);
        body.innerHTML = '<p style="color:red;">Error loading locations.</p>';
    }
}

function _lpRenderLocations(body) {
    if (_lpLocations.length === 0) {
        body.innerHTML = `
            <div style="text-align:center; padding:16px; color:#999;">
                No locations added yet.
            </div>
            <div style="margin-top:8px; display:flex; gap:6px; justify-content:center;">
                <button class="btn btn-primary btn-small" onclick="_lpOpenLocationModal()">+ Add Location</button>
                <button class="btn btn-small" onclick="_lpOpenImportModal()">⬆ Import</button>
            </div>`;
        return;
    }

    const rows = _lpLocations.map(loc => `
        <div class="lp-location-row" style="display:flex; align-items:flex-start; gap:8px; padding:8px 0; border-bottom:1px solid #f0f0f0;">
            <div style="flex:1; min-width:0;">
                <div style="font-weight:600;">${_lpEsc(loc.name)}</div>
                ${loc.address ? `<div style="font-size:0.85em;"><a href="${_lpMapsUrl(loc)}" onclick="event.stopPropagation();window.open(this.href,'_blank');return false;" style="color:#2563eb;" title="Get directions">${_lpEsc(loc.address)}</a></div>` : ''}
                ${loc.phone   ? `<div style="font-size:0.85em;"><a href="tel:${_lpEsc(loc.phone.replace(/\s/g,''))}" style="color:#2563eb;">${_lpEsc(loc.phone)}</a></div>` : ''}
                ${loc.website ? `<div style="font-size:0.85em;"><a href="${_lpEsc(loc.website)}" onclick="event.stopPropagation();window.open(this.href,'_blank');return false;" style="color:#2563eb;">${_lpEsc(loc.website)}</a></div>` : ''}
            </div>
            <div style="display:flex; gap:4px; flex-shrink:0;">
                <button class="btn btn-small" onclick="_lpOpenLocationModal('${loc.id}')" title="Edit location">✏️</button>
                <button class="btn btn-small btn-danger" onclick="_lpUnlinkLocation('${loc.id}')" title="Remove from project">✕</button>
            </div>
        </div>
    `).join('');

    body.innerHTML = `
        <div>${rows}</div>
        <div style="margin-top:10px; display:flex; gap:6px;">
            <button class="btn btn-primary btn-small" onclick="_lpOpenLocationModal()">+ Add Location</button>
            <button class="btn btn-small" onclick="_lpOpenImportModal()">⬆ Import</button>
        </div>`;
}

/** Open the location modal — editId is the projectLocations doc id, null for new */
/** Open the check-in place picker to fill the location form from a real place. */
function _lpFindPlace() {
    if (typeof openCheckIn !== 'function') {
        alert('Place search is unavailable.');
        return;
    }
    // The picker calls this callback with the chosen venue (or null for manual).
    // It layers on top of the location modal (which stays open underneath).
    _checkinPickerCallback = _lpApplyFoundPlace;
    openCheckIn();
}

/**
 * Callback for the check-in picker when used from the location modal.
 * Fills name/address/lat/lng immediately, then runs a best-effort LLM
 * enrichment pass to add phone + website. The user reviews before saving.
 * @param {Object|null} venue — chosen venue, or null if the user chose manual entry.
 */
async function _lpApplyFoundPlace(venue) {
    if (!venue) return; // "Enter Manually" — leave the form for manual entry

    // Make sure the location modal is showing (picker closed itself)
    openModal('lpLocationModal');

    document.getElementById('lpLocName').value    = venue.name || '';
    document.getElementById('lpLocAddress').value = venue.address || '';
    document.getElementById('lpLocLat').value     = venue.lat != null ? venue.lat : '';
    document.getElementById('lpLocLng').value     = venue.lng != null ? venue.lng : '';

    // Best-effort phone/website via the shared LLM enrichment helper
    const status = document.getElementById('lpLocFindStatus');
    if (typeof placesFetchEnrichment !== 'function') return;
    status.style.display = '';
    status.textContent = '🔎 Looking up phone & website…';
    try {
        const enriched = await placesFetchEnrichment({
            name: venue.name, address: venue.address,
            category: venue.category, lat: venue.lat, lng: venue.lng
        });
        const clean = v => (v && typeof v === 'string' && v.trim() && v !== 'null') ? v.trim() : '';
        if (enriched) {
            const phoneEl = document.getElementById('lpLocPhone');
            const webEl   = document.getElementById('lpLocWebsite');
            if (!phoneEl.value && clean(enriched.phone))   phoneEl.value = clean(enriched.phone);
            if (!webEl.value   && clean(enriched.website)) webEl.value   = clean(enriched.website);
        }
        status.textContent = '✓ Filled in — review and Save';
        setTimeout(() => { status.style.display = 'none'; }, 3000);
    } catch (err) {
        console.warn('Location enrichment failed:', err);
        status.style.display = 'none';
    }
}

/**
 * Geocode the location's address (falling back to its name) into lat/lng and
 * fill the coordinate fields. Lets an existing location gain coordinates without
 * being deleted and re-added. Uses the app's Nominatim geocoder (US-anchored).
 */
async function _lpGetLocationCoords() {
    const address = document.getElementById('lpLocAddress').value.trim();
    const name    = document.getElementById('lpLocName').value.trim();
    if (!address && !name) { alert('Enter an address (or at least a name) first, then get coordinates.'); return; }

    // Foursquare-style addresses embed a "(at Cross St)" cross-street note that the
    // Nominatim geocoder can't parse, so strip parentheticals. Try the cleaned
    // address first, then fall back to the location name (major places — airports,
    // parks — geocode reliably by name even when their street address doesn't).
    const cleanAddr = address.replace(/\([^)]*\)/g, '').replace(/\s{2,}/g, ' ').replace(/\s+,/g, ',').trim();
    const tries = [...new Set([cleanAddr || address, name].filter(Boolean))];

    const btn    = document.getElementById('lpLocGeocodeBtn');
    const status = document.getElementById('lpLocGeocodeStatus');
    const orig   = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ Locating…';
    status.style.display = '';
    status.textContent = 'Looking up coordinates…';

    try {
        let coords = null;
        for (const q of tries) {
            if (typeof placesGeocodeLocation === 'function') coords = await placesGeocodeLocation(q);
            if (coords && coords.lat != null && coords.lng != null) break;
        }
        if (coords && coords.lat != null && coords.lng != null) {
            document.getElementById('lpLocLat').value = coords.lat;
            document.getElementById('lpLocLng').value = coords.lng;
            status.textContent = '✓ Found — review and Save';
            setTimeout(() => { status.style.display = 'none'; }, 3000);
        } else {
            status.textContent = 'Could not find coordinates. Try a more complete address, or enter them manually.';
        }
    } catch (err) {
        console.error('Geocode error:', err);
        status.textContent = 'Lookup failed. Try again, or enter coordinates manually.';
    } finally {
        btn.disabled = false;
        btn.textContent = orig;
    }
}

function _lpOpenLocationModal(editId = null) {
    const loc = editId ? _lpLocations.find(l => l.id === editId) : null;
    document.getElementById('lpLocationModalTitle').textContent = loc ? 'Edit Location' : 'Add Location';
    document.getElementById('lpLocName').value    = loc ? (loc.name    || '') : '';
    document.getElementById('lpLocAddress').value = loc ? (loc.address || '') : '';
    document.getElementById('lpLocPhone').value   = loc ? (loc.phone   || '') : '';
    document.getElementById('lpLocWebsite').value = loc ? (loc.website || '') : '';
    document.getElementById('lpLocContact').value = loc ? (loc.contact || '') : '';
    document.getElementById('lpLocNotes').value   = loc ? (loc.notes   || '') : '';
    document.getElementById('lpLocLat').value      = loc && loc.lat != null ? loc.lat : '';
    document.getElementById('lpLocLng').value      = loc && loc.lng != null ? loc.lng : '';
    document.getElementById('lpLocSearch').value  = '';
    document.getElementById('lpLocSearchResults').style.display = 'none';
    document.getElementById('lpLocSearchResults').innerHTML = '';
    document.getElementById('lpLocAddToPlanning').checked = false;

    // Reset the "Find a place" status line
    const findStatus = document.getElementById('lpLocFindStatus');
    findStatus.style.display = 'none';
    findStatus.textContent = '';

    // Reset the "Get lat/lng" status line
    const geoStatus = document.getElementById('lpLocGeocodeStatus');
    geoStatus.style.display = 'none';
    geoStatus.textContent = '';

    // Hide "Add to Planning Board" checkbox when editing
    document.getElementById('lpLocAddToPlanningWrap').style.display = loc ? 'none' : '';
    // Hide search + "Find a place" when editing (they're for creating new locations)
    document.getElementById('lpLocSearchWrap').style.display = loc ? 'none' : '';
    document.getElementById('lpLocFindWrap').style.display = loc ? 'none' : '';

    // Store edit id on the save button
    document.getElementById('lpLocationSaveBtn').dataset.editId = editId || '';
    openModal('lpLocationModal');
    setTimeout(() => document.getElementById(loc ? 'lpLocName' : 'lpLocSearch').focus(), 100);
}

/** Live search filter for existing global locations */
async function _lpLocSearchInput(query) {
    const resultsEl = document.getElementById('lpLocSearchResults');
    if (!query.trim()) { resultsEl.style.display = 'none'; return; }

    // Search global locations collection by name prefix (case-insensitive client-side)
    try {
        const snap = await lpLocationsCol().orderBy('name').get();
        const lower = query.toLowerCase();
        const matches = [];
        snap.forEach(doc => {
            const d = doc.data();
            if (d.name && d.name.toLowerCase().includes(lower)) matches.push({ id: doc.id, ...d });
        });

        if (matches.length === 0) {
            resultsEl.innerHTML = '<div style="padding:8px; color:#999; font-size:0.9em;">No existing locations found — fill in the form below to create one.</div>';
        } else {
            resultsEl.innerHTML = matches.map(m => `
                <div onclick="_lpLinkExistingLocation('${m.id}')"
                     style="padding:8px 12px; cursor:pointer; border-bottom:1px solid #f0f0f0;"
                     onmouseover="this.style.background='#f0f9ff'" onmouseout="this.style.background=''">
                    <div style="font-weight:600; font-size:0.9em;">${_lpEsc(m.name)}</div>
                    ${m.address ? `<div style="font-size:0.8em; color:#888;">${_lpEsc(m.address)}</div>` : ''}
                </div>
            `).join('');
        }
        resultsEl.style.display = 'block';
    } catch (err) {
        console.error('Location search error:', err);
    }
}

/** Link an already-existing global location to this project */
async function _lpLinkExistingLocation(locationId) {
    try {
        // Check not already linked
        const already = _lpLocations.find(l => l.locationId === locationId);
        if (already) { alert('This location is already linked to this project.'); return; }

        // Fetch the location doc to cache its fields
        const locDoc = await lpLocationsCol().doc(locationId).get();
        if (!locDoc.exists) return;
        const locData = locDoc.data();

        // Write to projectLocations subcollection (cache key fields for display without extra reads)
        await lpSub(_lpCurrentProjectId, 'projectLocations').add({
            locationId,
            name:    locData.name    || '',
            address: locData.address || '',
            phone:   locData.phone   || '',
            website: locData.website || '',
            contact: locData.contact || '',
            notes:   locData.notes   || '',
            lat:     locData.lat != null ? locData.lat : null,
            lng:     locData.lng != null ? locData.lng : null,
            addedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        closeModal('lpLocationModal');
        await _lpLoadLocations();
    } catch (err) {
        console.error('Error linking location:', err);
        alert('Error linking location. Please try again.');
    }
}

/** Save handler for location modal — creates new global location or edits existing */
async function _lpSaveLocation() {
    const name = document.getElementById('lpLocName').value.trim();
    if (!name) { alert('Name is required.'); return; }

    const editId = document.getElementById('lpLocationSaveBtn').dataset.editId;
    let newProjLocId = null; // set below when creating a new location
    const latRaw = document.getElementById('lpLocLat').value;
    const lngRaw = document.getElementById('lpLocLng').value;
    const locData = {
        name,
        address: document.getElementById('lpLocAddress').value.trim(),
        phone:   document.getElementById('lpLocPhone').value.trim(),
        website: document.getElementById('lpLocWebsite').value.trim(),
        contact: document.getElementById('lpLocContact').value.trim(),
        notes:   document.getElementById('lpLocNotes').value.trim(),
        lat:     latRaw !== '' && !isNaN(Number(latRaw)) ? Number(latRaw) : null,
        lng:     lngRaw !== '' && !isNaN(Number(lngRaw)) ? Number(lngRaw) : null
    };
    const addToPlanning = !editId && document.getElementById('lpLocAddToPlanning').checked;

    try {
        if (editId) {
            // Editing an existing linked location — update both global doc and cached fields
            const projLoc = _lpLocations.find(l => l.id === editId);
            if (projLoc) {
                await lpLocationsCol().doc(projLoc.locationId).update(locData);
                await lpSub(_lpCurrentProjectId, 'projectLocations').doc(editId).update(locData);
            }
        } else {
            // Create new global location doc
            const newLocRef = await lpLocationsCol().add({
                ...locData,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            // Link to this project (cache fields for fast display)
            const projLocRef = await lpSub(_lpCurrentProjectId, 'projectLocations').add({
                locationId: newLocRef.id,
                ...locData,
                addedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            newProjLocId = projLocRef.id; // capture for post-save routing

            // Optionally add a planning item for this location
            if (addToPlanning) {
                await _lpAddLocationToPlanningBoard(newLocRef.id, projLocRef.id, name);
            }
        }

        closeModal('lpLocationModal');
        await _lpLoadLocations();

        // If we came from a picker or the item edit modal, return to it with the new location selected
        if (_lpPickerReturnCtx) {
            const ctx = _lpPickerReturnCtx;
            _lpPickerReturnCtx = null;
            if (ctx.source === 'itemModal') {
                // Re-populate both item-modal location dropdowns. Pre-select the new
                // location on whichever dropdown triggered the add; preserve the other's
                // current selection. (ctx.field is 'from' or 'to'; default to 'from'.)
                const curFrom = document.getElementById('lpItLocation')?.value || null;
                const curTo   = document.getElementById('lpItToLocation')?.value || null;
                if (ctx.field === 'to') {
                    _lpPopulateItemLocationSelect(curFrom);
                    _lpPopulateItemToLocationSelect(newProjLocId || null);
                } else {
                    _lpPopulateItemLocationSelect(newProjLocId || null);
                    _lpPopulateItemToLocationSelect(curTo);
                }
            } else {
                _lpPickLocation(ctx.type, ctx.parentId, ctx.itemId);
            }
        }
    } catch (err) {
        console.error('Error saving location:', err);
        alert('Error saving location. Please try again.');
    }
}

/**
 * Create a planning board item for a location.
 * @param {string} locationId         - global location doc id (currently unused, kept for signature symmetry)
 * @param {string} projectLocationId  - projectLocations doc id (what item.locationId references)
 * @param {string} name               - item title
 * @param {object} [opts]             - { groupId?: string, type?: string }
 *        groupId → target a specific planning group (default: first group, or a new "General");
 *        type    → set item.type (e.g. 'activity'); omitted for legacy/manual adds (treated as None).
 */
async function _lpAddLocationToPlanningBoard(locationId, projectLocationId, name, opts) {
    opts = opts || {};
    // Target the requested group, else the first group, else create a default one.
    let group = opts.groupId ? _lpPlanningGroups.find(g => g.id === opts.groupId) : _lpPlanningGroups[0];
    if (!group) {
        const ref = await lpSub(_lpCurrentProjectId, 'planningGroups').add({
            name: 'General',
            sortOrder: 0,
            items: []
        });
        group = { id: ref.id, name: 'General', sortOrder: 0, items: [] };
        _lpPlanningGroups.push(group);
    }

    const items = [...(group.items || [])];
    const newItem = {
        id: _lpItemId(),
        title: name,
        time: '', status: 'idea', cost: null, costNote: '',
        notes: '', facts: [], confirmation: '', contact: '',
        duration: '', bookingRef: null,
        locationId: projectLocationId,
        sortOrder: items.reduce((max, it) => Math.max(max, it.sortOrder || 0), -1) + 1,
        showOnCalendar: false
    };
    if (opts.type) newItem.type = opts.type;
    items.push(newItem);
    await lpSub(_lpCurrentProjectId, 'planningGroups').doc(group.id).update({ items });
    group.items = items;
}

// ---------- Import Locations (from a pasted/loaded export) ----------

// Parsed + reverse-geocoded rows awaiting confirmation.
// Each: { name, lat, lng, notes, address, valid, dupe }
let _lpImportRows = [];

/** Open the import modal, resetting all fields. */
function _lpOpenImportModal() {
    _lpImportRows = [];
    const set = (id, fn) => { const el = document.getElementById(id); if (el) fn(el); };
    set('lpImportText',        el => el.value = '');
    set('lpImportStatus',      el => { el.style.display = 'none'; el.textContent = ''; });
    set('lpImportPreview',     el => { el.style.display = 'none'; el.innerHTML = ''; });
    set('lpImportPlanningWrap', el => el.style.display = 'none');
    set('lpImportAddToPlanning', el => el.checked = false);
    set('lpImportGroupSelect', el => el.style.display = 'none');
    set('lpImportBtn',         el => el.style.display = 'none');
    set('lpImportConvertBtn',  el => { el.disabled = false; el.textContent = '✨ Convert with AI'; });
    openModal('lpImportModal');
}

/** Read a chosen file's text into the paste box. */
function _lpImportLoadFile(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => { document.getElementById('lpImportText').value = e.target.result || ''; };
    reader.onerror = () => alert('Could not read that file.');
    reader.readAsText(file);
    input.value = ''; // allow re-selecting the same file later
}

/** Ask the LLM to normalize the raw pasted text into a strict JSON array. */
async function _lpImportLLMConvert(rawText) {
    const cfgDoc = await userCol('settings').doc('llm').get();
    const cfg = cfgDoc.exists ? cfgDoc.data() : null;
    if (!cfg || !cfg.provider || !cfg.apiKey) {
        throw new Error('No AI provider is configured. Set one up in Settings → AI first.');
    }

    const prompt =
        'You are converting an exported list of map places into structured JSON. ' +
        'The input may be CSV, KML, tab-separated, or a freeform list, and may contain ' +
        'headers, blank lines, or non-point rows.\n\n' +
        'Return ONLY a JSON array. Each element is an object with exactly these keys:\n' +
        '{ "name": string, "lat": number, "lng": number, "notes": string }\n\n' +
        'Rules:\n' +
        '- One element per single POINT/place only. Skip lines, routes, polygons, headers, and blank rows.\n' +
        '- In WKT "POINT (X Y)", X is LONGITUDE and Y is LATITUDE. Do not swap them.\n' +
        '- Latitude is between -90 and 90; longitude is between -180 and 180.\n' +
        '- Copy the coordinate digits EXACTLY as given. Do NOT round, truncate, or change precision.\n' +
        '- "notes" comes from any description/comment column; use "" when there is none.\n' +
        '- Respond with ONLY the JSON array — no explanation, no markdown fences.\n\n' +
        'Input:\n' + rawText;

    const endpoint = (cfg.provider === 'openai')
        ? 'https://api.openai.com/v1/chat/completions'
        : 'https://api.x.ai/v1/chat/completions';
    const model = (cfg.provider === 'openai') ? (cfg.model || 'gpt-4o-mini') : 'grok-3-mini';

    const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.apiKey },
        body: JSON.stringify({
            model: model,
            messages: [{ role: 'user', content: prompt }],
            max_completion_tokens: 4000
        })
    });
    if (!resp.ok) throw new Error('AI request failed (' + resp.status + ').');

    const data = await resp.json();
    let content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!content) throw new Error('AI returned no content.');
    content = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.locations)) return parsed.locations;
    if (parsed && Array.isArray(parsed.places)) return parsed.places;
    throw new Error('AI response was not a JSON array.');
}

/** Convert the pasted text, validate, reverse-geocode, and render the preview. */
async function _lpImportConvert() {
    const raw = (document.getElementById('lpImportText').value || '').trim();
    if (!raw) { alert('Paste some data or load a file first.'); return; }

    const btn     = document.getElementById('lpImportConvertBtn');
    const status  = document.getElementById('lpImportStatus');
    const preview = document.getElementById('lpImportPreview');
    btn.disabled = true;
    status.style.display = 'block';
    status.textContent = '✨ Reading your list with AI…';
    preview.style.display = 'none';
    document.getElementById('lpImportBtn').style.display = 'none';
    document.getElementById('lpImportPlanningWrap').style.display = 'none';

    let rows;
    try {
        rows = await _lpImportLLMConvert(raw);
    } catch (err) {
        console.error('Import convert error:', err);
        status.textContent = '⚠️ ' + (err.message || 'Could not read that data.');
        btn.disabled = false;
        return;
    }

    // Validate + normalize each row.
    const valid = [];
    (rows || []).forEach(r => {
        if (!r) return;
        const name = (r.name != null ? String(r.name) : '').trim();
        if (!name) return;
        const lat = parseFloat(r.lat), lng = parseFloat(r.lng);
        const inRange = isFinite(lat) && isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
        valid.push({
            name,
            lat: inRange ? lat : null,
            lng: inRange ? lng : null,
            notes: (r.notes != null ? String(r.notes) : '').trim(),
            address: '',
            valid: inRange,
            dupe: _lpLocations.some(l => (l.name || '').toLowerCase() === name.toLowerCase())
        });
    });

    if (valid.length === 0) {
        status.textContent = '⚠️ No usable point locations were found in that data.';
        btn.disabled = false;
        return;
    }

    _lpImportRows = valid;

    // Reverse-geocode each valid point (throttled) to fill an address.
    const geocodable = valid.filter(v => v.valid);
    for (let i = 0; i < geocodable.length; i++) {
        status.textContent = '🌎 Looking up addresses… ' + (i + 1) + '/' + geocodable.length;
        try {
            const addr = (typeof placesReverseGeocode === 'function')
                ? await placesReverseGeocode(geocodable[i].lat, geocodable[i].lng)
                : null;
            if (addr) geocodable[i].address = addr;
        } catch (e) { /* leave address blank on failure */ }
    }

    status.textContent = 'Found ' + valid.length + ' location' + (valid.length === 1 ? '' : 's') + '. Review and import below.';
    _lpRenderImportPreview();
    _lpPopulateImportGroupSelect();
    document.getElementById('lpImportPlanningWrap').style.display = 'flex';
    document.getElementById('lpImportBtn').style.display = 'inline-block';
    btn.disabled = false;
}

/** Render the confirm list (checkbox per row, dupes/bad-coord rows flagged). */
function _lpRenderImportPreview() {
    const preview = document.getElementById('lpImportPreview');
    let html = '<div style="max-height:280px; overflow-y:auto; border:1px solid #e2e8f0; border-radius:6px;">';
    _lpImportRows.forEach((r, i) => {
        const checked = (r.valid && !r.dupe) ? 'checked' : '';
        let tag = '';
        if (!r.valid) tag = '<span style="color:#b91c1c; font-size:0.75em; font-weight:600;"> ⚠ bad coordinates</span>';
        else if (r.dupe) tag = '<span style="color:#b45309; font-size:0.75em; font-weight:600;"> • already in project</span>';
        const coords = r.valid ? (r.lat.toFixed(5) + ', ' + r.lng.toFixed(5)) : 'missing / out of range';
        html +=
            '<label style="display:flex; gap:8px; align-items:flex-start; padding:8px 10px; border-bottom:1px solid #f0f0f0; cursor:pointer;">' +
                '<input type="checkbox" class="lp-import-check" data-idx="' + i + '" ' + (r.valid ? '' : 'disabled ') + checked + ' style="margin-top:3px;">' +
                '<span style="flex:1; min-width:0;">' +
                    '<span style="font-weight:600;">' + _lpEsc(r.name) + '</span>' + tag +
                    '<div style="font-size:0.78em; color:#64748b;">' + coords + '</div>' +
                    (r.address
                        ? '<div style="font-size:0.8em; color:#475569;">' + _lpEsc(r.address) + '</div>'
                        : '<div style="font-size:0.8em; color:#cbd5e1;">no address found</div>') +
                '</span>' +
            '</label>';
    });
    html += '</div>';
    preview.innerHTML = html;
    preview.style.display = 'block';
}

/** Fill the planning-group dropdown (or offer a to-be-created General group). */
function _lpPopulateImportGroupSelect() {
    const sel = document.getElementById('lpImportGroupSelect');
    if (!sel) return;
    if (_lpPlanningGroups.length === 0) {
        sel.innerHTML = '<option value="__new__">General (will be created)</option>';
    } else {
        sel.innerHTML = _lpPlanningGroups
            .map(g => '<option value="' + g.id + '">' + _lpEsc(g.name) + '</option>')
            .join('');
    }
}

/** Show/hide the group dropdown when the "Add to Planning Board" box is toggled. */
function _lpImportTogglePlanning() {
    const cb = document.getElementById('lpImportAddToPlanning');
    const sel = document.getElementById('lpImportGroupSelect');
    if (sel) sel.style.display = cb.checked ? 'block' : 'none';
}

/** Import the checked rows as project locations (+ optional planning items). */
async function _lpImportSelected() {
    const checks = Array.from(document.querySelectorAll('.lp-import-check')).filter(c => c.checked);
    if (checks.length === 0) { alert('Select at least one location to import.'); return; }

    const addToPlanning = document.getElementById('lpImportAddToPlanning').checked;
    const groupSelVal   = document.getElementById('lpImportGroupSelect').value;
    // '__new__' → let _lpAddLocationToPlanningBoard create/use the default group.
    const targetGroupId = (addToPlanning && groupSelVal && groupSelVal !== '__new__') ? groupSelVal : undefined;

    const btn    = document.getElementById('lpImportBtn');
    const status = document.getElementById('lpImportStatus');
    btn.disabled = true;
    status.style.display = 'block';

    const total = checks.length;
    let done = 0, failed = 0;

    for (let i = 0; i < checks.length; i++) {
        const r = _lpImportRows[parseInt(checks[i].dataset.idx, 10)];
        if (!r) continue;
        status.textContent = 'Importing… ' + (done + failed + 1) + '/' + total;
        const locData = {
            name: r.name,
            address: r.address || '',
            phone: '', website: '', contact: '',
            notes: r.notes || '',
            lat: r.lat, lng: r.lng
        };
        try {
            const newLocRef = await lpLocationsCol().add({
                ...locData,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            const projLocRef = await lpSub(_lpCurrentProjectId, 'projectLocations').add({
                locationId: newLocRef.id,
                ...locData,
                addedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            if (addToPlanning) {
                await _lpAddLocationToPlanningBoard(newLocRef.id, projLocRef.id, r.name, { groupId: targetGroupId, type: 'activity' });
            }
            done++;
        } catch (err) {
            console.error('Import row failed:', r.name, err);
            failed++;
        }
    }

    closeModal('lpImportModal');
    await _lpLoadLocations();
    if (addToPlanning) await _lpLoadPlanningBoard();
    alert('Imported ' + done + ' location' + (done === 1 ? '' : 's') + (failed ? (', ' + failed + ' failed') : '') + '.');
}

/** Remove a location link from this project (does NOT delete the global location) */
async function _lpUnlinkLocation(projLocId) {
    const loc = _lpLocations.find(l => l.id === projLocId);
    if (!loc) return;
    if (!confirm(`Remove "${loc.name}" from this project?`)) return;
    try {
        await lpSub(_lpCurrentProjectId, 'projectLocations').doc(projLocId).delete();
        await _lpLoadLocations();
    } catch (err) {
        console.error('Error unlinking location:', err);
        alert('Error removing location.');
    }
}

// ============================================================
// Distances Section
// ============================================================

async function _lpLoadDistances() {
    const body = document.getElementById('lpBody_distances');
    if (!body) return;
    body.innerHTML = '<p style="color:#999; padding:8px;">Loading…</p>';

    try {
        // Build set of global locationIds for this project
        const globalIds = new Set(_lpLocations.map(l => l.locationId).filter(Boolean));

        if (globalIds.size < 2) {
            body.innerHTML = '<p style="color:#999; font-size:0.9em; padding:8px;">Add at least two locations to this project to record distances.</p>';
            _lpUpdateAccordionSummary('distances', '');
            return;
        }

        // Query distances where fromLocationId is in this project's locations
        // (Firestore doesn't support OR across fields, so fetch all and filter client-side)
        const snap = await lpDistancesCol().get();
        _lpDistances = [];
        snap.forEach(doc => {
            const d = doc.data();
            if (globalIds.has(d.fromLocationId) && globalIds.has(d.toLocationId)) {
                _lpDistances.push({ id: doc.id, ...d });
            }
        });

        _lpRenderDistances(body);
        _lpUpdateAccordionSummary('distances', _lpDistances.length > 0 ? `(${_lpDistances.length})` : '');
    } catch (err) {
        console.error('Error loading distances:', err);
        body.innerHTML = '<p style="color:red;">Error loading distances.</p>';
    }
}

function _lpRenderDistances(body) {
    const addBtn = '<button class="btn btn-small btn-primary" style="margin-top:8px;" onclick="_lpAddDistanceFromAccordion()">+ Add Distance</button>';

    if (_lpDistances.length === 0) {
        body.innerHTML = `<p style="color:#999; font-size:0.9em;">No distances recorded yet. Add one below, or use the 🛣️ button on a planning or itinerary item.</p>${addBtn}`;
        return;
    }

    // Build a map from global locationId → name for display
    const nameMap = {};
    _lpLocations.forEach(l => { if (l.locationId) nameMap[l.locationId] = l.name; });

    const modeLabel = { drive: '🚗 Drive', walk: '🚶 Walk', bike: '🚲 Bike' };

    const rows = _lpDistances.map(d => {
        const fromName = _lpEsc(nameMap[d.fromLocationId] || d.fromLocationId);
        const toName   = _lpEsc(nameMap[d.toLocationId]   || d.toLocationId);
        const parts = [];
        if (d.time)  parts.push(_lpEsc(d.time));
        if (d.miles) parts.push(`${d.miles} mi`);
        if (d.mode)  parts.push(modeLabel[d.mode] || _lpEsc(d.mode));
        return `
        <div class="lp-distance-row" style="display:flex; align-items:center; gap:8px; padding:8px 0; border-bottom:1px solid #f0f0f0; flex-wrap:wrap;">
            <div style="flex:1; min-width:0;">
                <span style="font-weight:600;">${fromName}</span>
                <span style="color:#888; margin:0 4px;">→</span>
                <span style="font-weight:600;">${toName}</span>
                ${parts.length ? `<span style="color:#555; font-size:0.88em; margin-left:8px;">${parts.join(' · ')}</span>` : ''}
                ${d.notes ? `<div style="font-size:0.82em; color:#888; margin-top:2px;">${_lpEsc(d.notes)}</div>` : ''}
            </div>
            <div style="display:flex; gap:4px; flex-shrink:0;">
                <button class="btn btn-small" onclick="_lpEditDistance('${d.id}')" title="Edit distance">✏️</button>
                <button class="btn btn-small btn-danger" onclick="_lpDeleteDistance('${d.id}')" title="Delete distance">✕</button>
            </div>
        </div>`;
    }).join('');

    body.innerHTML = `<div>${rows}</div>${addBtn}`;
}

/** Open the Add/Edit Distance modal.
 *  When called from an item (🛣️ button), fromProjLocId is the projectLocations doc id.
 *  When called from the edit icon in the distances list, distanceId is the Firestore doc id. */
function _lpOpenAddDistance(type, parentId, itemId) {
    // Find the item to get its locationId (projectLocations doc id)
    let item = null;
    if (type === 'planning') {
        const grp = _lpPlanningGroups.find(g => g.id === parentId);
        item = grp ? (grp.items || []).find(i => i.id === itemId) : null;
    } else {
        const day = _lpDays.find(d => d.id === parentId);
        item = day ? (day.items || []).find(i => i.id === itemId) : null;
    }

    if (!item || !item.locationId) {
        alert('Set a location on this item first before adding a distance.');
        return;
    }

    // item.locationId is the projectLocations doc id → find global locationId
    const projLoc = _lpLocations.find(l => l.id === item.locationId);
    if (!projLoc) {
        alert('Location not found. Please re-link the location.');
        return;
    }

    // Pass the item's leave time so Ask AI can include departure context
    const leaveTime = item.leaveTime || item.time || '';

    // Default "To" = the next timeline item in this day that has a location set
    let defaultToGlobalId = null;
    if (type === 'itinerary') {
        const day = _lpDays.find(d => d.id === parentId);
        const dayItems = day ? (day.items || []) : [];
        const idx = dayItems.findIndex(i => i.id === itemId);
        if (idx >= 0) {
            // Look forward for the next onTimeline item with a locationId
            for (let i = idx + 1; i < dayItems.length; i++) {
                const next = dayItems[i];
                if (next.onTimeline && next.locationId) {
                    const nextProjLoc = _lpLocations.find(l => l.id === next.locationId);
                    if (nextProjLoc && nextProjLoc.locationId !== projLoc.locationId) {
                        defaultToGlobalId = nextProjLoc.locationId;
                    }
                    break;
                }
            }
        }
    }

    _lpOpenDistanceModal(null, projLoc.locationId, leaveTime, defaultToGlobalId);
}

function _lpEditDistance(distanceId) {
    _lpOpenDistanceModal(distanceId, null);
}

/** Add a distance straight from the Distances accordion — both From and To are user-selectable. */
function _lpAddDistanceFromAccordion() {
    _lpOpenDistanceModal(null, null, '', null, true);
}

/** Populate the To dropdown with all project locations except `fromId`. */
function _lpPopulateDistToSelect(fromId, selectedToId) {
    const toSel = document.getElementById('lpDistTo');
    toSel.innerHTML = '<option value="">— Select destination —</option>';
    [..._lpLocations]
        .filter(l => l.locationId && l.locationId !== fromId)
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach(l => {
            const opt = document.createElement('option');
            opt.value = l.locationId;
            opt.textContent = l.name;
            if (l.locationId === selectedToId) opt.selected = true;
            toSel.appendChild(opt);
        });
}

/** Populate the From dropdown with all project locations (used when From is user-selectable). */
function _lpPopulateDistFromSelect(selectedFromId) {
    const fromSel = document.getElementById('lpDistFrom');
    fromSel.innerHTML = '<option value="">— Select source —</option>';
    [..._lpLocations]
        .filter(l => l.locationId)
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach(l => {
            const opt = document.createElement('option');
            opt.value = l.locationId;
            opt.textContent = l.name;
            if (l.locationId === selectedFromId) opt.selected = true;
            fromSel.appendChild(opt);
        });
}

/** When the user changes the From dropdown, sync the hidden value and re-filter To. */
function _lpDistFromChanged() {
    const fromId = document.getElementById('lpDistFrom').value;
    document.getElementById('lpDistFromHidden').value = fromId;
    // Keep the current To selection unless it now collides with From
    const toSel = document.getElementById('lpDistTo');
    const currentTo = toSel.value === fromId ? '' : toSel.value;
    _lpPopulateDistToSelect(fromId, currentTo);
}

function _lpOpenDistanceModal(distanceId, fromGlobalId, leaveTime = '', defaultToId = null, fromSelectable = false) {
    const existing = distanceId ? _lpDistances.find(d => d.id === distanceId) : null;

    // Resolve the from global location id
    const fromId = existing ? existing.fromGlobalId || existing.fromLocationId : fromGlobalId;

    // Build name map
    const nameMap = {};
    _lpLocations.forEach(l => { if (l.locationId) nameMap[l.locationId] = l.name; });

    // From: a read-only label when fixed by the triggering item (or when editing),
    // or a dropdown when adding from the Distances accordion.
    const fromLabel = document.getElementById('lpDistFromLabel');
    const fromSel   = document.getElementById('lpDistFrom');
    if (fromSelectable) {
        fromLabel.style.display = 'none';
        fromSel.style.display = '';
        _lpPopulateDistFromSelect(fromId || null);
    } else {
        fromSel.style.display = 'none';
        fromLabel.style.display = '';
        fromLabel.textContent = nameMap[fromId] || fromId || '—';
    }
    document.getElementById('lpDistFromHidden').value = fromId || '';
    document.getElementById('lpDistLeaveTime').value  = leaveTime || '';

    // Populate To dropdown — all project locations except From, sorted alphabetically
    _lpPopulateDistToSelect(fromId, existing ? existing.toLocationId : defaultToId);

    // Fill fields
    document.getElementById('lpDistTime').value  = existing ? (existing.time  || '') : '';
    document.getElementById('lpDistMiles').value = existing ? (existing.miles != null ? existing.miles : '') : '';
    document.getElementById('lpDistMode').value  = existing ? (existing.mode  || 'drive') : 'drive';
    document.getElementById('lpDistNotes').value = existing ? (existing.notes || '') : '';

    // Store the distance doc id (empty if new)
    document.getElementById('lpDistSaveBtn').dataset.distanceId = distanceId || '';

    openModal('lpDistanceModal');
}

async function _lpSaveDistance() {
    const fromId = document.getElementById('lpDistFromHidden').value;
    const toId   = document.getElementById('lpDistTo').value.trim();
    const time   = document.getElementById('lpDistTime').value.trim();
    const miles  = document.getElementById('lpDistMiles').value.trim();
    const mode   = document.getElementById('lpDistMode').value;
    const notes  = document.getElementById('lpDistNotes').value.trim();
    const distanceId = document.getElementById('lpDistSaveBtn').dataset.distanceId;

    if (!fromId) { alert('Please select a source.'); return; }
    if (!toId)   { alert('Please select a destination.'); return; }
    if (fromId === toId) { alert('Source and destination must be different.'); return; }
    if (!time && !miles) { alert('Please enter at least a time or distance.'); return; }

    const data = {
        fromLocationId: fromId,
        toLocationId:   toId,
        time:   time  || '',
        miles:  miles ? parseFloat(miles) : null,
        mode:   mode  || 'drive',
        notes:  notes || ''
    };

    try {
        if (distanceId) {
            await lpDistancesCol().doc(distanceId).update(data);
        } else {
            await lpDistancesCol().add({
                ...data,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        closeModal('lpDistanceModal');
        await _lpLoadDistances();
        // Re-render itinerary so travel rows reflect the new distance
        const itBody = document.getElementById('lpBody_itinerary');
        if (itBody && itBody.children.length > 0) _lpLoadItinerary();
    } catch (err) {
        console.error('Error saving distance:', err);
        alert('Error saving distance. Please try again.');
    }
}

/** Format a duration in minutes as "25 min" or "1 hr 15 min". */
function _lpFormatMinutes(totalMin) {
    totalMin = Math.max(0, Math.round(totalMin));
    if (totalMin < 60) return totalMin + ' min';
    const h = Math.floor(totalMin / 60), m = totalMin % 60;
    return m ? (h + ' hr ' + m + ' min') : (h + ' hr');
}

/**
 * Calculate real road distance + travel time between the two selected locations
 * using the GraphHopper Directions API (key stored in settings/routing). Fills the
 * Miles and Time fields for review. Requires both locations to have coordinates.
 * No LLM fallback — on any failure the user enters the values manually.
 */
async function _lpDistCalculate() {
    const fromGlobalId = document.getElementById('lpDistFromHidden').value;
    const toGlobalId   = document.getElementById('lpDistTo').value;
    const mode         = document.getElementById('lpDistMode').value;

    if (!fromGlobalId) { alert('Please select a source first.'); return; }
    if (!toGlobalId)   { alert('Please select a destination first.'); return; }

    const fromLoc = _lpLocations.find(l => l.locationId === fromGlobalId);
    const toLoc   = _lpLocations.find(l => l.locationId === toGlobalId);
    if (!fromLoc || !toLoc) { alert('Could not find the selected locations.'); return; }

    // Travel mode → GraphHopper profile. Fly has no road route.
    const profileMap = { drive: 'car', walk: 'foot', bike: 'bike' };
    const profile = profileMap[mode];
    if (!profile) {
        alert('Road routing isn’t available for “Fly”. Please enter the distance and time manually.');
        return;
    }

    // Both locations must have coordinates (captured by "Find a place").
    if (fromLoc.lat == null || fromLoc.lng == null || toLoc.lat == null || toLoc.lng == null) {
        alert('One or both locations don’t have map coordinates yet.\n\nRe-add the location with the “🔍 Find a place” button (which captures coordinates), then try again — or enter the distance and time manually.');
        return;
    }

    // Load the GraphHopper API key
    let key = null;
    try {
        const doc = await userCol('settings').doc('routing').get();
        if (doc.exists) key = doc.data().graphhopperKey;
    } catch (e) { /* handled below */ }
    if (!key) {
        alert('No GraphHopper API key is set.\n\nAdd a free key in Settings → General Settings → Distance Routing (GraphHopper).');
        return;
    }

    const btn = document.getElementById('lpDistCalcBtn');
    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ Calculating…';

    try {
        const url = 'https://graphhopper.com/api/1/route'
            + '?point=' + fromLoc.lat + ',' + fromLoc.lng
            + '&point=' + toLoc.lat + ',' + toLoc.lng
            + '&profile=' + profile
            + '&calc_points=false&locale=en&key=' + encodeURIComponent(key);

        const resp = await fetch(url);
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || !data.paths || !data.paths.length) {
            const msg = (data && data.message) ? data.message : ('HTTP ' + resp.status);
            throw new Error(msg);
        }

        const path    = data.paths[0];
        const miles   = path.distance / 1609.344;   // metres → miles
        const minutes = path.time / 60000;          // ms → minutes
        document.getElementById('lpDistMiles').value = miles.toFixed(1);
        document.getElementById('lpDistTime').value  = _lpFormatMinutes(minutes);
    } catch (err) {
        console.error('GraphHopper route error:', err);
        alert('Could not calculate the route: ' + err.message + '\n\nYou can enter the distance and time manually.');
    } finally {
        btn.disabled = false;
        btn.textContent = orig;
    }
}

async function _lpDeleteDistance(distanceId) {
    if (!confirm('Delete this distance?')) return;
    try {
        await lpDistancesCol().doc(distanceId).delete();
        await _lpLoadDistances();
        const itBody = document.getElementById('lpBody_itinerary');
        if (itBody && itBody.children.length > 0) _lpLoadItinerary();
    } catch (err) {
        console.error('Error deleting distance:', err);
        alert('Error deleting distance.');
    }
}

/** Delete a distance directly from a travel row in the itinerary */
async function _lpDeleteDistanceFromRow(distanceId) {
    if (!confirm('Remove this travel distance?')) return;
    try {
        await lpDistancesCol().doc(distanceId).delete();
        await _lpLoadDistances();
        const itBody = document.getElementById('lpBody_itinerary');
        if (itBody && itBody.children.length > 0) _lpLoadItinerary();
    } catch (err) {
        console.error('Error deleting distance:', err);
        alert('Error deleting distance.');
    }
}

// ============================================================
// To-Do Section
// ============================================================

let _lpTodos = [];
let _lpTodoEditId = null;   // id of the to-do currently being edited inline (or null)
let _lpTodoAdding = false;  // whether a blank inline draft row is showing

async function _lpLoadTodos() {
    const body = document.getElementById('lpBody_todos');
    if (!body || !_lpCurrentProjectId) return;

    try {
        const snap = await lpSub(_lpCurrentProjectId, 'todoItems').orderBy('sortOrder').get();
        _lpTodos = [];
        snap.forEach(doc => _lpTodos.push({ id: doc.id, ...doc.data() }));
        _lpRenderTodos(body);
    } catch (err) {
        console.error('Error loading todos:', err);
        body.innerHTML = '<p style="color:red;">Error loading to-dos.</p>';
    }
}

function _lpRenderTodos(body) {
    const doneCount = _lpTodos.filter(t => t.done).length;
    const total = _lpTodos.length;

    // Update accordion summary
    const header = document.querySelector('#lpAcc_todos .lp-accordion-header strong');
    if (header) {
        const parent = header.parentElement;
        const existing = parent.querySelector('.lp-summary');
        if (existing) existing.remove();
        if (total > 0) {
            const span = document.createElement('span');
            span.className = 'lp-summary';
            span.style.cssText = 'color:#888; font-size:0.85em; margin-left:4px;';
            span.textContent = `(${doneCount}/${total})`;
            parent.appendChild(span);
        }
    }

    const isEditing = _lpTodoEditId !== null || _lpTodoAdding;

    if (total === 0 && !_lpTodoAdding) {
        body.innerHTML = `
            <p style="color:#999; font-size:0.9em;">No to-do items yet.</p>
            <button class="btn btn-small btn-primary" onclick="_lpAddTodo()">+ Add Item</button>
        `;
        return;
    }

    // Completed items sink to the bottom; within each group the manual sort order is kept
    // (Array.sort is stable, so unchecked and checked items each stay in their drag order).
    const ordered = [..._lpTodos].sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0));
    const rowsHtml = ordered.map(t => t.id === _lpTodoEditId ? _lpTodoEditRow(t) : _lpTodoItem(t)).join('');
    const draftHtml = _lpTodoAdding ? _lpTodoEditRow(null) : '';

    body.innerHTML = `
        <div id="lpTodoList">${rowsHtml}</div>
        ${draftHtml}
        ${isEditing ? '' : `<button class="btn btn-small btn-primary" style="margin-top:8px;" onclick="_lpAddTodo()">+ Add Item</button>`}
    `;

    // Initialize SortableJS only when no row is being edited (avoids drag/input conflicts)
    if (typeof Sortable !== 'undefined' && !isEditing) {
        const list = document.getElementById('lpTodoList');
        if (list) {
            Sortable.create(list, {
                animation: 150,
                handle: '.lp-drag-handle',
                onEnd: _lpReorderTodos
            });
        }
    }

    // Populate + focus the inline editor. Values are set here (not via HTML attributes)
    // because _lpEsc doesn't escape double quotes, which would break a value="..." attr.
    if (_lpTodoEditId) {
        const t  = _lpTodos.find(x => x.id === _lpTodoEditId);
        const ti = document.getElementById('lpTodoText_' + _lpTodoEditId);
        const ni = document.getElementById('lpTodoNotes_' + _lpTodoEditId);
        if (t && ti) ti.value = t.text || '';
        if (t && ni) ni.value = t.notes || '';
        if (ti) ti.focus();
    } else if (_lpTodoAdding) {
        const ti = document.getElementById('lpTodoText___new__');
        if (ti) ti.focus();
    }
}

/** Inline edit/add row for a to-do. Pass the todo to edit, or null for a new draft. */
function _lpTodoEditRow(t) {
    const isNew    = !t;
    const id       = isNew ? '__new__' : t.id;
    const saveCall = isNew ? '_lpSaveTodoNew()' : `_lpSaveTodoEdit('${id}')`;
    return `
        <div class="lp-todo-edit" data-id="${id}" style="display:flex; flex-direction:column; gap:6px; padding:8px 6px; margin-bottom:4px; border:1px solid #cbd5e1; border-radius:6px; background:#f8fafc;">
            <input type="text" id="lpTodoText_${id}" class="form-control" placeholder="To-do item"
                   onkeydown="if(event.key==='Enter'){event.preventDefault(); ${saveCall};}">
            <textarea id="lpTodoNotes_${id}" class="form-control" rows="2" placeholder="Note / description (optional)" style="resize:vertical;"></textarea>
            <div style="display:flex; gap:6px; justify-content:flex-end;">
                <button class="btn btn-small" onclick="_lpCancelTodoEdit()">Cancel</button>
                <button class="btn btn-small btn-primary" onclick="${saveCall}">Save</button>
            </div>
        </div>
    `;
}

function _lpTodoItem(t) {
    return `
        <div class="lp-todo-item" data-id="${t.id}" style="display:flex; align-items:flex-start; gap:8px; padding:6px 4px; border-bottom:1px solid #f0f0f0;">
            <span class="lp-drag-handle lp-desktop-only" style="cursor:grab; color:#ccc; padding:2px;">⠿</span>
            <input type="checkbox" ${t.done ? 'checked' : ''} onchange="_lpToggleTodo('${t.id}', this.checked)" style="margin-top:3px;">
            <div style="flex:1; min-width:0;">
                <span style="${t.done ? 'text-decoration:line-through; color:#999;' : ''}">${_lpEsc(t.text)}</span>
                ${t.notes ? `<div style="color:#888; font-size:0.85em; margin-top:2px;">${_lpEsc(t.notes)}</div>` : ''}
            </div>
            <div style="display:flex; gap:2px; flex-shrink:0;">
                <button class="btn btn-small" onclick="_lpEditTodo('${t.id}')" title="Edit" style="padding:2px 6px;">✏️</button>
                <button class="btn btn-small btn-danger" onclick="_lpDeleteTodo('${t.id}')" title="Delete" style="padding:2px 6px;">✕</button>
            </div>
        </div>
    `;
}

/** Show a blank inline draft row to add a new to-do. */
function _lpAddTodo() {
    _lpTodoAdding = true;
    _lpTodoEditId = null;
    const body = document.getElementById('lpBody_todos');
    if (body) _lpRenderTodos(body);
}

/** Save the inline draft row as a new to-do. */
async function _lpSaveTodoNew() {
    const text = (document.getElementById('lpTodoText___new__')?.value || '').trim();
    if (!text) { alert('Enter a to-do item.'); return; }
    const notes = (document.getElementById('lpTodoNotes___new__')?.value || '').trim();

    const maxOrder = _lpTodos.reduce((max, t) => Math.max(max, t.sortOrder || 0), -1);

    try {
        await lpSub(_lpCurrentProjectId, 'todoItems').add({
            text,
            done: false,
            notes,
            sortOrder: maxOrder + 1
        });
        _lpTodoAdding = false;
        await _lpLoadTodos();
    } catch (err) {
        console.error('Error adding todo:', err);
        alert('Error adding to-do item.');
    }
}

/** Cancel the current inline add/edit and re-render in display mode. */
function _lpCancelTodoEdit() {
    _lpTodoEditId = null;
    _lpTodoAdding = false;
    const body = document.getElementById('lpBody_todos');
    if (body) _lpRenderTodos(body);
}

async function _lpToggleTodo(todoId, done) {
    try {
        await lpSub(_lpCurrentProjectId, 'todoItems').doc(todoId).update({ done });
        const t = _lpTodos.find(t => t.id === todoId);
        if (t) t.done = done;
        // Re-render to update summary count
        const body = document.getElementById('lpBody_todos');
        if (body) _lpRenderTodos(body);
    } catch (err) {
        console.error('Error toggling todo:', err);
    }
}

/** Switch a to-do row into the inline editor. */
function _lpEditTodo(todoId) {
    const t = _lpTodos.find(t => t.id === todoId);
    if (!t) return;
    _lpTodoEditId = todoId;
    _lpTodoAdding = false;
    const body = document.getElementById('lpBody_todos');
    if (body) _lpRenderTodos(body);
}

/** Save inline edits to an existing to-do. */
async function _lpSaveTodoEdit(todoId) {
    const text = (document.getElementById('lpTodoText_' + todoId)?.value || '').trim();
    if (!text) { alert('Enter a to-do item.'); return; }
    const notes = (document.getElementById('lpTodoNotes_' + todoId)?.value || '').trim();

    try {
        await lpSub(_lpCurrentProjectId, 'todoItems').doc(todoId).update({ text, notes });
        _lpTodoEditId = null;
        await _lpLoadTodos();
    } catch (err) {
        console.error('Error editing todo:', err);
        alert('Error saving to-do item.');
    }
}

async function _lpDeleteTodo(todoId) {
    if (!confirm('Delete this to-do item?')) return;
    try {
        await lpSub(_lpCurrentProjectId, 'todoItems').doc(todoId).delete();
        await _lpLoadTodos();
    } catch (err) {
        console.error('Error deleting todo:', err);
    }
}

async function _lpReorderTodos(evt) {
    const items = document.querySelectorAll('#lpTodoList .lp-todo-item');
    const batch = firebase.firestore().batch();
    items.forEach((el, i) => {
        const id = el.dataset.id;
        batch.update(lpSub(_lpCurrentProjectId, 'todoItems').doc(id), { sortOrder: i });
    });
    try {
        await batch.commit();
        // Update local state
        const idOrder = Array.from(items).map(el => el.dataset.id);
        _lpTodos.sort((a, b) => idOrder.indexOf(a.id) - idOrder.indexOf(b.id));
        _lpTodos.forEach((t, i) => t.sortOrder = i);
    } catch (err) {
        console.error('Error reordering todos:', err);
    }
}

// ============================================================
// Planning Board Section — Research & Ideas by Group
// ============================================================

let _lpPlanningGroups = [];

async function _lpLoadPlanningBoard() {
    const body = document.getElementById('lpBody_planning');
    if (!body || !_lpCurrentProjectId) return;

    try {
        const snap = await lpSub(_lpCurrentProjectId, 'planningGroups').orderBy('sortOrder').get();
        _lpPlanningGroups = [];
        snap.forEach(doc => _lpPlanningGroups.push({ id: doc.id, ...doc.data() }));
        _lpRenderPlanningBoard(body);
    } catch (err) {
        console.error('Error loading planning board:', err);
        body.innerHTML = '<p style="color:red;">Error loading planning board.</p>';
    }
}

function _lpRenderPlanningBoard(body) {
    _lpUpdateAccordionSummary('planning', _lpPlanningGroups.length > 0 ? `(${_lpPlanningGroups.length} groups)` : '');

    if (_lpPlanningGroups.length === 0) {
        body.innerHTML = `
            <p style="color:#999; font-size:0.9em;">No planning groups yet. Create groups to organize research and potential activities by area or theme.</p>
            <button class="btn btn-primary" style="margin-top:8px;" onclick="_lpAddPlanningGroup()">+ Add Group</button>
        `;
        return;
    }

    body.innerHTML = `
        <div id="lpPlanningGroupList">
            ${_lpPlanningGroups.map(g => _lpPlanningGroupCard(g)).join('')}
        </div>
        <button class="btn btn-primary" style="margin-top:8px;" onclick="_lpAddPlanningGroup()">+ Add Group</button>
    `;

    // Init SortableJS for groups if available
    if (typeof Sortable !== 'undefined') {
        Sortable.create(document.getElementById('lpPlanningGroupList'), {
            handle: '.lp-pg-drag',
            animation: 150,
            onEnd: () => _lpReorderPlanningGroups()
        });
        // Init SortableJS for items within each group
        _lpPlanningGroups.forEach(g => {
            const el = document.getElementById(`lpPgItems_${g.id}`);
            if (el) {
                Sortable.create(el, {
                    handle: '.lp-item-drag',
                    animation: 150,
                    // Shared group name lets items be dragged BETWEEN groups
                    // (both groups must be expanded to expose a drop target).
                    group: 'lp-planning-items',
                    onEnd: (evt) => _lpReorderPlanningItems(evt)
                });
            }
        });
    }
}

function _lpPlanningGroupCard(g) {
    const items = (g.items || []).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    const itemCount = items.length;
    const collapsed = !_lpGroupExpanded.has(g.id);
    const chevron = collapsed ? '▸' : '▾';

    return `
        <div class="lp-planning-group" data-id="${g.id}" style="border:1px solid #e2e8f0; border-radius:8px; margin-bottom:12px; overflow:hidden;">
            <div class="lp-group-header" style="background:#eff6ff; padding:10px 12px; display:flex; justify-content:space-between; align-items:center;">
                <div style="display:flex; align-items:center; gap:8px; cursor:pointer;" onclick="_lpToggleGroupCollapse('${g.id}')">
                    <span class="lp-pg-drag" style="cursor:grab; color:#ccc;" onclick="event.stopPropagation()">⠿</span>
                    <span style="color:#888; font-size:0.85em; user-select:none;">${chevron}</span>
                    <strong>🗺️ ${_lpEsc(g.name)}</strong>
                    <span style="color:#888; font-size:0.85em;">(${itemCount})</span>
                </div>
                <div style="display:flex; gap:4px;">
                    <button class="btn btn-small" onclick="_lpRenamePlanningGroup('${g.id}')" title="Rename">✏️</button>
                    <button class="btn btn-small btn-danger" onclick="_lpDeletePlanningGroup('${g.id}')" title="Delete group">✕</button>
                </div>
            </div>
            ${collapsed ? '' : `
            <div style="padding:8px 12px;">
                <div id="lpPgItems_${g.id}" data-group-id="${g.id}">
                    ${items.map(item => _lpPlanningItemRow(g.id, item)).join('')}
                </div>
                ${items.length === 0 ? '<p style="color:#bbb; font-size:0.85em; margin:4px 0;">No items yet.</p>' : ''}
                <button class="btn btn-small" style="margin-top:6px;" onclick="_lpAddPlanningItem('${g.id}')">+ Add Item</button>
            </div>
            `}
        </div>
    `;
}

function _lpPlanningItemRow(groupId, item) {
    const st = LP_ITEM_STATUSES[item.status] || LP_ITEM_STATUSES.idea;
    const hasDetails = item.time || item.cost || item.duration || item.notes || item.confirmation || item.contact || (item.facts && item.facts.length) || (item.links && item.links.length);
    const loc = item.locationId ? _lpLocations.find(l => l.id === item.locationId) : null;
    const locBadge = _lpLocBadge(loc);
    const locBtn = !loc
        ? `<button class="btn btn-small" onclick="_lpPickLocation('planning','${groupId}','${item.id}')" title="Set location" style="padding:2px 6px;">📍</button>`
        : `<button class="btn btn-small" onclick="_lpOpenAddDistance('planning','${groupId}','${item.id}')" title="Add distance from here" style="padding:2px 6px;">🛣️</button>`;

    return `
        <div class="lp-planning-item" data-item-id="${item.id}" style="padding:6px 0; border-bottom:1px solid #f0f0f0;">
            <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                <span class="lp-item-drag" style="cursor:grab; color:#ccc; font-size:0.8em;">⠿</span>
                <span class="lp-desktop-only" style="background:${st.bg};color:${st.color};font-size:0.7em;padding:1px 8px;border-radius:10px;font-weight:600;">${st.label}</span>
                <span style="flex:1; min-width:0; font-weight:500; cursor:pointer;" onclick="_lpTogglePlanningItemDetails('${groupId}','${item.id}')">${_lpEsc(item.title)}</span>
                <span class="lp-item-photo-badge" data-item-id="${item.id}">${_lpItemPhotoBadgeInner(item.id)}</span>
                <span class="lp-desktop-only">${locBadge}</span>
                <div class="lp-desktop-only" style="display:flex; gap:2px; flex-shrink:0;">
                    <button class="btn btn-small" onclick="_lpEditPlanningItem('${groupId}','${item.id}')" title="Edit item" style="padding:2px 6px;">✏️</button>
                    ${locBtn}
                </div>
            </div>
            <div class="lp-planning-item-details" id="lpPgItemDetails_${groupId}_${item.id}" style="display:none; margin-top:6px; padding-left:28px; font-size:0.88em; color:#555;">
                ${_lpItemDetailsContent(item, { type: 'planning', groupId })}
            </div>
        </div>
    `;
}

function _lpTogglePlanningItemDetails(groupId, itemId) {
    const el = document.getElementById(`lpPgItemDetails_${groupId}_${itemId}`);
    if (el) el.style.display = el.style.display === 'none' ? '' : 'none';
}

// ---------- Planning Group CRUD ----------

async function _lpAddPlanningGroup() {
    const name = prompt('Group name (e.g., "Jackson area", "Day trips from hotel"):');
    if (!name || !name.trim()) return;

    const maxOrder = _lpPlanningGroups.reduce((max, g) => Math.max(max, g.sortOrder || 0), -1);

    try {
        const ref = await lpSub(_lpCurrentProjectId, 'planningGroups').add({
            name: name.trim(),
            sortOrder: maxOrder + 1,
            items: []
        });
        _lpGroupExpanded.add(ref.id); // new group starts expanded
        await _lpLoadPlanningBoard();
    } catch (err) {
        console.error('Error adding planning group:', err);
        alert('Error adding group.');
    }
}

async function _lpRenamePlanningGroup(groupId) {
    const group = _lpPlanningGroups.find(g => g.id === groupId);
    if (!group) return;

    const name = prompt('Group name:', group.name);
    if (!name || !name.trim()) return;

    try {
        await lpSub(_lpCurrentProjectId, 'planningGroups').doc(groupId).update({ name: name.trim() });
        group.name = name.trim();
        const body = document.getElementById('lpBody_planning');
        if (body) _lpRenderPlanningBoard(body);
    } catch (err) {
        console.error('Error renaming group:', err);
    }
}

async function _lpDeletePlanningGroup(groupId) {
    const group = _lpPlanningGroups.find(g => g.id === groupId);
    const itemCount = (group?.items || []).length;
    const msg = itemCount > 0
        ? `Delete "${group.name}" and its ${itemCount} item(s)? This cannot be undone.`
        : `Delete "${group.name}"? This cannot be undone.`;
    if (!confirm(msg)) return;

    try {
        await _lpDeletePhotosForItems((group?.items || []).map(it => it.id));
        await lpSub(_lpCurrentProjectId, 'planningGroups').doc(groupId).delete();
        await _lpLoadPlanningBoard();
    } catch (err) {
        console.error('Error deleting planning group:', err);
    }
}

async function _lpReorderPlanningGroups() {
    const groups = document.querySelectorAll('#lpPlanningGroupList .lp-planning-group');
    const batch = firebase.firestore().batch();
    groups.forEach((el, i) => {
        const id = el.dataset.id;
        batch.update(lpSub(_lpCurrentProjectId, 'planningGroups').doc(id), { sortOrder: i });
    });
    try {
        await batch.commit();
        const idOrder = Array.from(groups).map(el => el.dataset.id);
        _lpPlanningGroups.sort((a, b) => idOrder.indexOf(a.id) - idOrder.indexOf(b.id));
        _lpPlanningGroups.forEach((g, i) => g.sortOrder = i);
    } catch (err) {
        console.error('Error reordering planning groups:', err);
    }
}

// ---------- Planning Item CRUD ----------

async function _lpAddPlanningItem(groupId) {
    const group = _lpPlanningGroups.find(g => g.id === groupId);
    if (!group) return;

    const items = [...(group.items || [])];
    const maxOrder = items.reduce((max, it) => Math.max(max, it.sortOrder || 0), -1);
    const newItem = {
        id: _lpItemId(),
        title: 'New Item',
        time: '',
        status: 'idea',
        cost: null,
        costNote: '',
        notes: '',
        facts: [],
        locationId: null,
        confirmation: '',
        contact: '',
        duration: '',
        bookingRef: null,
        sortOrder: maxOrder + 1,
        showOnCalendar: false
    };
    items.push(newItem);

    try {
        await lpSub(_lpCurrentProjectId, 'planningGroups').doc(groupId).update({ items });
        group.items = items;
        // Open modal to fill in details immediately
        _lpItemModalCtx = { type: 'planning', groupId, itemId: newItem.id, dayId: null };
        _lpOpenItemModal('Add Planning Item', newItem, null);
        const body = document.getElementById('lpBody_planning');
        if (body) _lpRenderPlanningBoard(body);
    } catch (err) {
        console.error('Error adding planning item:', err);
    }
}

function _lpEditPlanningItem(groupId, itemId) {
    const group = _lpPlanningGroups.find(g => g.id === groupId);
    if (!group) return;
    const item = (group.items || []).find(it => it.id === itemId);
    if (!item) return;

    _lpItemModalCtx = { type: 'planning', groupId, itemId, dayId: null };
    _lpOpenItemModal('Edit Planning Item', item, null);
}

async function _lpDeletePlanningItem(groupId, itemId, confirmed = false) {
    if (!confirmed && !confirm('Delete this item?')) return;
    const group = _lpPlanningGroups.find(g => g.id === groupId);
    if (!group) return;

    const items = (group.items || []).filter(it => it.id !== itemId);

    try {
        await _lpDeletePhotosForItems([itemId]);
        await lpSub(_lpCurrentProjectId, 'planningGroups').doc(groupId).update({ items });
        group.items = items;
        const body = document.getElementById('lpBody_planning');
        if (body) _lpRenderPlanningBoard(body);
    } catch (err) {
        console.error('Error deleting planning item:', err);
    }
}

// Handles both in-group reorder and cross-group moves. SortableJS only moves
// the DOM node between containers — the item data still lives in whatever group
// it started in — so we resolve items by id across all groups, then rebuild the
// source and destination groups from their DOM order.
async function _lpReorderPlanningItems(evt) {
    const fromGroupId = evt && evt.from ? evt.from.dataset.groupId : null;
    const toGroupId   = evt && evt.to   ? evt.to.dataset.groupId   : null;
    if (!fromGroupId || !toGroupId) return;

    // Lookup of every item object across all groups (id -> item).
    const itemById = {};
    _lpPlanningGroups.forEach(g => (g.items || []).forEach(it => { itemById[it.id] = it; }));

    const groupIds = fromGroupId === toGroupId ? [toGroupId] : [fromGroupId, toGroupId];
    const batch = firebase.firestore().batch();

    groupIds.forEach(gid => {
        const container = document.getElementById(`lpPgItems_${gid}`);
        const group = _lpPlanningGroups.find(g => g.id === gid);
        if (!container || !group) return;
        const els = container.querySelectorAll('.lp-planning-item');
        const reordered = Array.from(els).map((el, i) => {
            const item = itemById[el.dataset.itemId];
            if (item) item.sortOrder = i;
            return item;
        }).filter(Boolean);
        group.items = reordered;
        batch.update(lpSub(_lpCurrentProjectId, 'planningGroups').doc(gid), { items: reordered });
    });

    try {
        await batch.commit();
    } catch (err) {
        console.error('Error reordering planning items:', err);
    }

    // A cross-group move changes each group's item count and leaves stale group
    // references baked into the moved row's buttons/detail ids — re-render to fix.
    if (fromGroupId !== toGroupId) {
        const body = document.getElementById('lpBody_planning');
        if (body) _lpRenderPlanningBoard(body);
    }
}

// ---------- Move between Planning ↔ Itinerary ----------

async function _lpMovePlanningItemToDay(groupId, itemId) {
    const group = _lpPlanningGroups.find(g => g.id === groupId);
    if (!group) return;
    const item = (group.items || []).find(it => it.id === itemId);
    if (!item) return;

    if (_lpDays.length === 0) {
        alert('No days in the itinerary yet. Create days first.');
        return;
    }

    const dayNames = _lpDays.map((d, i) => `${i + 1}. ${d.label || d.date || 'Day'}`).join('\n');
    const input = prompt(`Move "${item.title}" to which day?\n${dayNames}`);
    if (input === null) return;
    const dayIdx = parseInt(input, 10) - 1;
    if (dayIdx < 0 || dayIdx >= _lpDays.length) return;

    const targetDay = _lpDays[dayIdx];
    const newItem = { ...item };
    newItem.sortOrder = (targetDay.items || []).reduce((max, it) => Math.max(max, it.sortOrder || 0), -1) + 1;

    try {
        // Remove from planning group
        const updatedGroupItems = (group.items || []).filter(it => it.id !== itemId);
        await lpSub(_lpCurrentProjectId, 'planningGroups').doc(groupId).update({ items: updatedGroupItems });
        group.items = updatedGroupItems;

        // Add to day
        const dayItems = [...(targetDay.items || []), newItem];
        await lpSub(_lpCurrentProjectId, 'days').doc(targetDay.id).update({ items: dayItems });
        targetDay.items = dayItems;

        // Re-render both sections
        const pgBody = document.getElementById('lpBody_planning');
        if (pgBody) _lpRenderPlanningBoard(pgBody);
        const itBody = document.getElementById('lpBody_itinerary');
        if (itBody) _lpRenderItinerary(itBody);
        _lpLoadTripInfo();
    } catch (err) {
        console.error('Error moving item to day:', err);
    }
}

// ============================================================
// Itinerary Section — Days + Items
// ============================================================

const LP_ITEM_STATUSES = {
    confirmed: { label: 'Confirmed', color: '#16a34a', bg: '#dcfce7' },
    maybe:     { label: 'Maybe',     color: '#d97706', bg: '#fef3c7' },
    idea:      { label: 'Idea',      color: '#2563eb', bg: '#dbeafe' },
    nope:      { label: 'Nope',      color: '#6b7280', bg: '#f3f4f6' }
};

let _lpDays = [];

/** Dates (YYYY-MM-DD) that have at least one journal entry — populated when itinerary loads */
let _lpJournalDates = new Set();

/**
 * Day IDs that are explicitly EXPANDED in the itinerary.
 * Default (not in Set) = collapsed. Empty Set = all collapsed on first open.
 * Persists across accordion close/reopen and re-renders within the session.
 */
let _lpDayExpanded = new Set();

/**
 * Group IDs that are explicitly EXPANDED in the planning board.
 * Same logic as _lpDayExpanded.
 */
let _lpGroupExpanded = new Set();

/** Toggle a day card's expanded state and re-render the itinerary. */
function _lpToggleDayCollapse(dayId) {
    if (_lpDayExpanded.has(dayId)) {
        _lpDayExpanded.delete(dayId);
    } else {
        _lpDayExpanded.add(dayId);
    }
    const body = document.getElementById('lpBody_itinerary');
    if (body) _lpRenderItinerary(body);
}

/** Toggle a planning group's expanded state and re-render the planning board. */
function _lpToggleGroupCollapse(groupId) {
    if (_lpGroupExpanded.has(groupId)) {
        _lpGroupExpanded.delete(groupId);
    } else {
        _lpGroupExpanded.add(groupId);
    }
    const body = document.getElementById('lpBody_planning');
    if (body) _lpRenderPlanningBoard(body);
}

/** State for the shared item edit modal */
let _lpItemModalCtx = null; // { type: 'itinerary'|'planning', dayId, groupId, itemId }

async function _lpLoadItinerary() {
    const body = document.getElementById('lpBody_itinerary');
    if (!body || !_lpCurrentProjectId) return;

    try {
        // Build journal date set for the project date range (1 query, no composite index needed)
        _lpJournalDates = new Set();
        const p = _lpCurrentProject;
        if (p && p.startDate && p.endDate) {
            const jSnap = await userCol('journalEntries')
                .where('date', '>=', p.startDate)
                .where('date', '<=', p.endDate)
                .get();
            jSnap.forEach(doc => _lpJournalDates.add(doc.data().date));
        }

        // Load days and bookings in parallel (bookings needed for booking badges on items)
        const [daySnap, bookingSnap] = await Promise.all([
            lpSub(_lpCurrentProjectId, 'days').orderBy('sortOrder').get(),
            lpSub(_lpCurrentProjectId, 'bookings').orderBy('sortOrder').get()
        ]);
        _lpDays = [];
        daySnap.forEach(doc => _lpDays.push({ id: doc.id, ...doc.data() }));
        _lpBookings = [];
        bookingSnap.forEach(doc => _lpBookings.push({ id: doc.id, ...doc.data() }));
        _lpRenderItinerary(body);
    } catch (err) {
        console.error('Error loading itinerary:', err);
        body.innerHTML = '<p style="color:red;">Error loading itinerary.</p>';
    }
}

/**
 * Open the Life Journal in a new tab, pre-filtered to the given day.
 * Uses localStorage to pass the date across tabs — journal.js reads it on load.
 */
function _lpOpenJournalForDay(date) {
    localStorage.setItem('journalPresetDate', date);
    window.open('index.html#journal', '_blank');
}

function _lpRenderItinerary(body) {
    const total = _lpDays.length;

    // Update accordion summary
    _lpUpdateAccordionSummary('itinerary', total > 0 ? `(${total} day${total !== 1 ? 's' : ''})` : '');

    if (total === 0) {
        const hasDateRange = _lpCurrentProject.startDate && _lpCurrentProject.endDate;
        body.innerHTML = `
            <p style="color:#999; font-size:0.9em;">No days yet.</p>
            ${hasDateRange ? `<button class="btn btn-small btn-primary" style="margin-right:8px;" onclick="_lpAutoGenerateDays()">Generate Days from Dates</button>` : ''}
            <button class="btn btn-small" onclick="_lpAddDay()">+ Add Day Manually</button>
        `;
        return;
    }

    body.innerHTML = `
        <div id="lpDayList">
            ${_lpDays.map(d => _lpDayCard(d)).join('')}
        </div>
        <div style="display:flex; gap:8px; margin-top:12px;">
            <button class="btn btn-small btn-primary" onclick="_lpAddDay()">+ Add Day</button>
        </div>
    `;

    // SortableJS for day reorder
    if (typeof Sortable !== 'undefined') {
        const list = document.getElementById('lpDayList');
        if (list) {
            Sortable.create(list, {
                animation: 150,
                handle: '.lp-day-drag',
                onEnd: _lpReorderDays
            });
        }
    }

    // SortableJS for items within each day
    if (typeof Sortable !== 'undefined') {
        _lpDays.forEach(d => {
            const itemList = document.getElementById(`lpItems_${d.id}`);
            if (itemList && itemList.children.length > 0) {
                Sortable.create(itemList, {
                    animation: 150,
                    handle: '.lp-item-drag',
                    onEnd: (evt) => _lpReorderItems(d.id, evt)
                });
            }
        });
    }
}

/** Update an accordion section's summary text */
function _lpUpdateAccordionSummary(sectionId, text) {
    const header = document.querySelector(`#lpAcc_${sectionId} .lp-accordion-header strong`);
    if (!header) return;
    const parent = header.parentElement;
    const existing = parent.querySelector('.lp-summary');
    if (existing) existing.remove();
    if (text) {
        const span = document.createElement('span');
        span.className = 'lp-summary';
        span.style.cssText = 'color:#888; font-size:0.85em; margin-left:4px;';
        span.textContent = text;
        parent.appendChild(span);
    }
}

// ---------- Day card rendering ----------

function _lpDayCard(d) {
    let items = (d.items || []).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    // Travel mode: hide maybe/idea/nope items
    if (_lpIsTravelMode()) items = items.filter(it => it.status === 'confirmed');
    const dateLabel = d.date ? new Date(d.date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : '';
    const collapsed = !_lpDayExpanded.has(d.id);
    const chevron = collapsed ? '▸' : '▾';

    return `
        <div class="lp-day-card" data-id="${d.id}" style="border:1px solid #e2e8f0; border-radius:8px; margin-bottom:12px; overflow:hidden;">
            <div class="lp-day-header" style="background:#f1f5f9; padding:10px 12px; display:flex; justify-content:space-between; align-items:center;">
                <div style="display:flex; align-items:center; gap:8px; cursor:pointer;" onclick="_lpToggleDayCollapse('${d.id}')">
                    <span class="lp-day-drag" style="cursor:grab; color:#ccc;" onclick="event.stopPropagation()">⠿</span>
                    <span style="color:#888; font-size:0.85em; user-select:none;">${chevron}</span>
                    <strong>${_lpEsc(d.label || dateLabel || 'Day')}</strong>
                    ${d.location ? `<span style="color:#666; font-size:0.9em;">— ${_lpEsc(d.location)}</span>` : ''}
                    ${collapsed && items.length > 0 ? `<span style="color:#94a3b8; font-size:0.8em;">(${items.length}<span class="lp-desktop-only"> item${items.length !== 1 ? 's' : ''}</span>)</span>` : ''}
                </div>
                <div style="display:flex; gap:4px;">
                    <button class="btn btn-small" onclick="_lpEditDay('${d.id}')" title="Edit day">✏️</button>
                    ${d.date && _lpJournalDates.has(d.date) ? `<button class="btn btn-small" onclick="_lpOpenJournalForDay('${d.date}')" title="Journal Entries" style="font-size:1em;">📓</button>` : ''}
                </div>
            </div>
            ${collapsed ? '' : `
            <div style="padding:8px 12px;">
                <div id="lpItems_${d.id}">
                    ${_lpBuildDayItemsHtml(d.id, items)}
                </div>
                ${items.length === 0 ? '<p style="color:#bbb; font-size:0.85em; margin:4px 0;">No items yet.</p>' : ''}
                <button class="btn btn-small" style="margin-top:6px;" onclick="_lpAddItem('${d.id}')">+ Add Item</button>
            </div>
            `}
        </div>
    `;
}


// ============================================================
// Item Photos - pictures attached to an itinerary or planning item
//
// Storage is split so that expanding an item is cheap:
//   itemPhotos/{id}     {itemId, name, sortOrder, createdAt}   loaded for the whole project up front
//   itemPhotoData/{id}  {imageData}                            fetched only when a name is clicked
// (The client SDK cannot project fields, so a single collection would mean
// listing names pulled every Base64 blob with it.)
//
// Capture is paste or file-pick only - no camera button. Note the OS file picker
// on a phone still offers "Take Photo"; that is the platform's, not ours.
// ============================================================

/** Item photos keep more detail than plant photos - a trail map is dense. */
const LP_ITEM_PHOTO_OPTS = { maxDimension: 1600, maxBase64: 360000 };

/** All photos for one item, in display order. */
function _lpItemPhotosFor(itemId) {
    return _lpItemPhotos
        .filter(p => p.itemId === itemId)
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
}

/** The clickable name list shown inside an item's detail panel. */
function _lpItemPhotoListHtml(itemId) {
    const photos = _lpItemPhotosFor(itemId);
    if (!photos.length) return '<span style="color:#bbb;">No photos yet.</span>';
    return photos.map(p => `
        <div style="padding:1px 0;">
            <a onclick="event.stopPropagation(); _lpOpenItemPhoto('${p.id}');" style="color:#2563eb; cursor:pointer;">🖼️ ${_lpEsc(p.name || 'Photo')}</a>
        </div>`).join('');
}

/** Inner HTML for the collapsed-row count badge (empty when the item has no photos). */
function _lpItemPhotoBadgeInner(itemId) {
    const n = _lpItemPhotosFor(itemId).length;
    return n ? `<span title="${n} photo${n === 1 ? '' : 's'}" style="font-size:0.75em; color:#666;">📷 ${n}</span>` : '';
}

/** The whole Photos block for an item's detail panel. */
function _lpItemPhotoSectionHtml(itemId) {
    return `
        <div style="margin-top:6px; padding-top:6px; border-top:1px solid #f0f0f0;">
            <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-bottom:3px;">
                <strong>Photos</strong>
                <button class="btn btn-small" type="button" onclick="event.stopPropagation(); _lpItemPhotoPaste('${itemId}')" title="Paste an image from the clipboard" style="padding:1px 6px; font-size:0.8em;">📋 Paste</button>
                <button class="btn btn-small" type="button" onclick="event.stopPropagation(); _lpItemPhotoChooseFile('${itemId}')" title="Choose an image file" style="padding:1px 6px; font-size:0.8em;">🖼️ Choose File</button>
            </div>
            <div class="lp-item-photo-list" data-item-id="${itemId}">${_lpItemPhotoListHtml(itemId)}</div>
        </div>`;
}

/** Repaint every name list and count badge for one item, in place.
 *  Avoids re-rendering (and re-collapsing) the whole itinerary after each change. */
function _lpRefreshItemPhotoUI(itemId) {
    document.querySelectorAll(`.lp-item-photo-list[data-item-id="${itemId}"]`)
        .forEach(el => { el.innerHTML = _lpItemPhotoListHtml(itemId); });
    document.querySelectorAll(`.lp-item-photo-badge[data-item-id="${itemId}"]`)
        .forEach(el => { el.innerHTML = _lpItemPhotoBadgeInner(itemId); });
}

// ---- Adding ----

async function _lpItemPhotoPaste(itemId) {
    if (!navigator.clipboard || !navigator.clipboard.read) {
        alert('Clipboard paste is not supported in this browser. Use Choose File instead.');
        return;
    }
    try {
        const clipItems = await navigator.clipboard.read();
        let imageBlob = null;
        for (const ci of clipItems) {
            const imageType = ci.types.find(t => t.startsWith('image/'));
            if (imageType) { imageBlob = await ci.getType(imageType); break; }
        }
        if (!imageBlob) {
            alert('No image on the clipboard.\n\nRight-click an image and choose "Copy image", then click Paste.');
            return;
        }
        const ext = imageBlob.type === 'image/png' ? '.png' : '.jpg';
        const file = new File([imageBlob], 'pasted-image' + ext, { type: imageBlob.type });
        const imageData = await compressImage(file, LP_ITEM_PHOTO_OPTS);
        await _lpSaveItemPhoto(itemId, imageData, 'Pasted image');
    } catch (err) {
        if (err.name === 'NotAllowedError') {
            alert('Clipboard access was denied. Click "Allow" when the browser asks, then try again.');
        } else {
            console.error('Item photo paste error:', err);
            alert('Could not read clipboard. Try Choose File instead.');
        }
    }
}

function _lpItemPhotoChooseFile(itemId) {
    // Built on demand and thrown away - no camera capture attribute is set.
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    input.onchange = async () => {
        const file = input.files && input.files[0];
        input.remove();
        if (!file) return;
        try {
            const imageData = await compressImage(file, LP_ITEM_PHOTO_OPTS);
            // Default the name to the filename without its extension
            const defaultName = (file.name || 'Photo').replace(/\.[^.]+$/, '');
            await _lpSaveItemPhoto(itemId, imageData, defaultName);
        } catch (err) {
            console.error('Item photo file error:', err);
            alert('Error processing photo.');
        }
    };
    document.body.appendChild(input);
    input.click();
}

/** Write the light index doc and the heavy data doc together. */
async function _lpSaveItemPhoto(itemId, imageData, defaultName) {
    const typed = await _lpTextPrompt({
        title: 'Name This Photo',
        placeholder: 'e.g. Trail map',
        value: defaultName || '',
        okText: 'Save Photo'
    });
    if (typed === null) return;  // cancelled
    const name = (typed || '').trim() || defaultName || 'Photo';

    try {
        const ref = lpSub(_lpCurrentProjectId, 'itemPhotos').doc();
        const sortOrder = _lpItemPhotosFor(itemId).length;
        const batch = firebase.firestore().batch();
        batch.set(ref, {
            itemId, name, sortOrder,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        batch.set(lpSub(_lpCurrentProjectId, 'itemPhotoData').doc(ref.id), { imageData });
        await batch.commit();

        _lpItemPhotos.push({ id: ref.id, itemId, name, sortOrder });
        _lpItemPhotoDataCache[ref.id] = imageData;
        _lpRefreshItemPhotoUI(itemId);
    } catch (err) {
        console.error('Error saving item photo:', err);
        alert('Error saving photo.');
    }
}

// ---- Viewing ----

/** Open one photo, fetching its image data only now (and only once). */
async function _lpOpenItemPhoto(photoId) {
    const meta = _lpItemPhotos.find(p => p.id === photoId);
    if (!meta) return;

    let data = _lpItemPhotoDataCache[photoId];
    if (!data) {
        _lpRenderItemPhotoLightbox(meta, null);   // show the frame while the blob loads
        try {
            const doc = await lpSub(_lpCurrentProjectId, 'itemPhotoData').doc(photoId).get();
            data = doc.exists ? doc.data().imageData : null;
            if (data) _lpItemPhotoDataCache[photoId] = data;
        } catch (err) {
            console.error('Error loading photo:', err);
        }
    }
    _lpRenderItemPhotoLightbox(meta, data);
}

function _lpRenderItemPhotoLightbox(meta, data) {
    let lb = document.getElementById('lpItemPhotoLightbox');
    if (!lb) {
        lb = document.createElement('div');
        lb.id = 'lpItemPhotoLightbox';
        document.body.appendChild(lb);
    }

    const body = data
        ? `<img src="${data}" style="max-width:92vw; max-height:74vh; object-fit:contain; border-radius:6px; display:block;" alt="${_lpEscAttr(meta.name || 'Photo')}">`
        : `<div style="color:#e2e8f0; padding:40px 20px;">Loading…</div>`;

    lb.innerHTML = `
        <div onclick="_lpCloseItemPhoto()" style="position:fixed; inset:0; background:rgba(0,0,0,0.88); z-index:9999; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:16px; box-sizing:border-box; cursor:pointer;">
            <div onclick="event.stopPropagation()" style="position:relative; max-width:92vw; max-height:82vh; display:flex; flex-direction:column; align-items:center; gap:10px; cursor:default;">
                ${body}
                <div style="color:#e2e8f0; font-size:0.9em; text-align:center;">${_lpEsc(meta.name || 'Photo')}</div>
                <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:center;">
                    <button class="btn btn-small" onclick="_lpRenameItemPhoto('${meta.id}')" style="background:#475569; color:#fff; border:none;">✏️ Rename</button>
                    <button class="btn btn-small btn-danger" onclick="_lpDeleteItemPhoto('${meta.id}')">🗑️ Delete</button>
                    <button class="btn btn-small" onclick="_lpCloseItemPhoto()" style="background:#475569; color:#fff; border:none;">✕ Close</button>
                </div>
            </div>
        </div>`;

    lb.style.display = 'block';
    if (!lb._escHandler) {
        lb._escHandler = (e) => { if (e.key === 'Escape') _lpCloseItemPhoto(); };
        document.addEventListener('keydown', lb._escHandler);
    }
}

function _lpCloseItemPhoto() {
    const lb = document.getElementById('lpItemPhotoLightbox');
    if (!lb) return;
    lb.style.display = 'none';
    lb.innerHTML = '';                       // drop the Base64 out of the DOM
    if (lb._escHandler) { document.removeEventListener('keydown', lb._escHandler); lb._escHandler = null; }
}

// ---- Rename / delete ----

async function _lpRenameItemPhoto(photoId) {
    const meta = _lpItemPhotos.find(p => p.id === photoId);
    if (!meta) return;
    const typed = await _lpTextPrompt({
        title: 'Rename Photo',
        placeholder: 'Photo name',
        value: meta.name || '',
        okText: 'Save'
    });
    if (typed === null) return;
    const name = (typed || '').trim();
    if (!name) return;

    try {
        await lpSub(_lpCurrentProjectId, 'itemPhotos').doc(photoId).update({ name });
        meta.name = name;
        _lpRefreshItemPhotoUI(meta.itemId);
        _lpRenderItemPhotoLightbox(meta, _lpItemPhotoDataCache[photoId] || null);
    } catch (err) {
        console.error('Error renaming photo:', err);
        alert('Error renaming photo.');
    }
}

async function _lpDeleteItemPhoto(photoId) {
    const meta = _lpItemPhotos.find(p => p.id === photoId);
    if (!meta) return;
    if (!confirm(`Delete "${meta.name || 'this photo'}"? This cannot be undone.`)) return;

    try {
        const batch = firebase.firestore().batch();
        batch.delete(lpSub(_lpCurrentProjectId, 'itemPhotos').doc(photoId));
        batch.delete(lpSub(_lpCurrentProjectId, 'itemPhotoData').doc(photoId));
        await batch.commit();

        _lpItemPhotos = _lpItemPhotos.filter(p => p.id !== photoId);
        delete _lpItemPhotoDataCache[photoId];
        _lpCloseItemPhoto();
        _lpRefreshItemPhotoUI(meta.itemId);
    } catch (err) {
        console.error('Error deleting photo:', err);
        alert('Error deleting photo.');
    }
}

/** Cascade: drop every photo belonging to any of these item ids.
 *  Called when an item, a day, or a planning group is deleted - orphaned Base64
 *  is invisible in the UI and would cost quota forever. */
async function _lpDeletePhotosForItems(itemIds) {
    if (!itemIds || !itemIds.length) return;
    const ids = new Set(itemIds);
    const doomed = _lpItemPhotos.filter(p => ids.has(p.itemId));
    if (!doomed.length) return;

    try {
        // Two writes per photo, and a batch caps at 500 operations
        for (let i = 0; i < doomed.length; i += 200) {
            const chunk = doomed.slice(i, i + 200);
            const batch = firebase.firestore().batch();
            chunk.forEach(p => {
                batch.delete(lpSub(_lpCurrentProjectId, 'itemPhotos').doc(p.id));
                batch.delete(lpSub(_lpCurrentProjectId, 'itemPhotoData').doc(p.id));
            });
            await batch.commit();
        }
        _lpItemPhotos = _lpItemPhotos.filter(p => !ids.has(p.itemId));
        doomed.forEach(p => delete _lpItemPhotoDataCache[p.id]);
    } catch (err) {
        console.error('Error deleting item photos:', err);
    }
}

// ---------- Day item rendering ----------

function _lpItemRow(dayId, item) {
    const st = LP_ITEM_STATUSES[item.status] || LP_ITEM_STATUSES.idea;
    const hasDetails = item.time || item.cost || item.duration || item.notes || item.confirmation || item.contact || (item.facts && item.facts.length) || (item.links && item.links.length);
    const loc = item.locationId ? _lpLocations.find(l => l.id === item.locationId) : null;
    const locBadge = _lpLocBadge(loc);
    const locBtn = !loc
        ? `<button class="btn btn-small" onclick="_lpPickLocation('itinerary','${dayId}','${item.id}')" title="Set location" style="padding:2px 6px;">📍</button>`
        : `<button class="btn btn-small" onclick="_lpOpenAddDistance('itinerary','${dayId}','${item.id}')" title="Add distance from here" style="padding:2px 6px;">🛣️</button>`;

    // Timeline left time column — shown only for official timeline items
    const isTimeline = !!item.onTimeline;
    let timeColHtml = '';
    if (isTimeline) {
        const timeParts = [];
        if (item.time) timeParts.push(`<div style="white-space:nowrap;">⏰ ${_lpEsc(item.time)}</div>`);
        if (item.duration) timeParts.push(`<div style="white-space:nowrap;">⏱ ${_lpEsc(item.duration)}</div>`);
        if (item.leaveTime) timeParts.push(`<div style="white-space:nowrap;">🚀 ${_lpEsc(item.leaveTime)}</div>`);
        timeColHtml = `<div style="min-width:82px; max-width:82px; font-size:0.72em; color:#555; line-height:1.6; flex-shrink:0; padding-top:2px;">${timeParts.join('') || '<span style="color:#ccc;">—</span>'}</div>`;
    }

    const borderStyle = isTimeline ? 'border-left:3px solid #0ea5e9; padding-left:6px;' : 'padding-left:9px;';

    return `
        <div class="lp-item-row" data-item-id="${item.id}" style="padding:6px 0; border-bottom:1px solid #f0f0f0; ${borderStyle}">
            <div style="display:flex; align-items:flex-start; gap:6px;">
                ${timeColHtml}
                <div style="flex:1; min-width:0;">
                    <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                        <span class="lp-item-drag" style="cursor:grab; color:#ccc; font-size:0.8em;">⠿</span>
                        <span class="lp-desktop-only" style="background:${st.bg};color:${st.color};font-size:0.7em;padding:1px 8px;border-radius:10px;font-weight:600;">${st.label}</span>
                        ${!isTimeline && item.time ? `<span style="color:#888; font-size:0.85em;">${_lpEsc(item.time)}</span>` : ''}
                        <span style="flex:1; min-width:0; font-weight:500; cursor:pointer;" onclick="_lpToggleItemDetails('${dayId}','${item.id}')">${_lpEsc(item.title)}</span>
                        <span class="lp-desktop-only">${_lpBookingBadge(item.bookingRef)}</span>
                        ${item.showOnCalendar ? '<span title="On calendar" style="font-size:0.75em;">📅</span>' : ''}
                        <span class="lp-item-photo-badge" data-item-id="${item.id}">${_lpItemPhotoBadgeInner(item.id)}</span>
                        <span class="lp-desktop-only">${locBadge}</span>
                        <div class="lp-desktop-only" style="display:flex; gap:2px; flex-shrink:0;">
                            <button class="btn btn-small" onclick="_lpEditItem('${dayId}','${item.id}')" title="Edit item" style="padding:2px 6px;">✏️</button>
                            ${locBtn}
                        </div>
                    </div>
                    <div class="lp-item-details" id="lpItemDetails_${dayId}_${item.id}" style="display:none; margin-top:6px; padding-left:28px; font-size:0.88em; color:#555;">
                        ${_lpItemDetailsContent(item, { type: 'itinerary', dayId })}
                    </div>
                </div>
            </div>
        </div>
    `;
}

/** Build travel row between two consecutive timeline items */
/**
 * Parse a time string like "7:00 am", "11am", "2:15 pm" into minutes since midnight.
 * Returns null if unparseable.
 */
function _lpParseTimeStr(str) {
    if (!str) return null;
    str = str.trim().toLowerCase();
    // H:MM am/pm or HH:MM am/pm
    let m = str.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/);
    if (m) {
        let h = parseInt(m[1]), min = parseInt(m[2]);
        if (m[3] === 'pm' && h !== 12) h += 12;
        if (m[3] === 'am' && h === 12) h = 0;
        return h * 60 + min;
    }
    // H am/pm (no minutes)
    m = str.match(/^(\d{1,2})\s*(am|pm)$/);
    if (m) {
        let h = parseInt(m[1]);
        if (m[2] === 'pm' && h !== 12) h += 12;
        if (m[2] === 'am' && h === 12) h = 0;
        return h * 60;
    }
    return null;
}

/**
 * Parse a travel duration string like "45 min", "2 hours", "1 hr 30 min",
 * "2 hours 15 min", "1.5 hours" into total minutes. Returns null if unparseable.
 */
function _lpParseDurationStr(str) {
    if (!str) return null;
    str = str.trim().toLowerCase();
    let total = 0, found = false;
    const hrs = str.match(/(\d+(?:\.\d+)?)\s*h(?:r|ours?)?/);
    if (hrs) { total += parseFloat(hrs[1]) * 60; found = true; }
    const mins = str.match(/(\d+)\s*m(?:in(?:utes?)?)?/);
    if (mins) { total += parseInt(mins[1]); found = true; }
    if (!found) { const bare = str.match(/^(\d+)$/); if (bare) { total = parseInt(bare[1]); found = true; } }
    return found ? Math.round(total) : null;
}

/**
 * Format minutes-since-midnight as "7:45 am", rounding to nearest 5 min first.
 */
function _lpFormatArrivalTime(totalMin) {
    totalMin = Math.round(totalMin / 5) * 5;
    totalMin = ((totalMin % 1440) + 1440) % 1440; // wrap past midnight
    const h24 = Math.floor(totalMin / 60);
    const min = totalMin % 60;
    const ampm = h24 < 12 ? 'am' : 'pm';
    const h12 = h24 % 12 || 12;
    return `${h12}:${String(min).padStart(2, '0')} ${ampm}`;
}

function _lpTravelRow(fromItem, toItem) {
    const fromLoc = fromItem.locationId ? _lpLocations.find(l => l.id === fromItem.locationId) : null;
    const toLoc   = toItem.locationId   ? _lpLocations.find(l => l.id === toItem.locationId)   : null;

    // Look up distance using global locationId fields stored on the _lpLocations entries
    const fromGlobalId = fromLoc ? fromLoc.locationId : null;
    const toGlobalId   = toLoc   ? toLoc.locationId   : null;

    const dist = (fromGlobalId && toGlobalId)
        ? _lpDistances.find(d =>
            (d.fromLocationId === fromGlobalId && d.toLocationId === toGlobalId) ||
            (d.fromLocationId === toGlobalId   && d.toLocationId === fromGlobalId))
        : null;

    // Compute estimated arrival = leaveTime + travel duration, rounded to nearest 5 min
    let arrivalStr = '';
    if (fromItem.leaveTime && dist && dist.time) {
        const departMin = _lpParseTimeStr(fromItem.leaveTime);
        const durationMin = _lpParseDurationStr(dist.time);
        if (departMin !== null && durationMin !== null) {
            arrivalStr = ` → <span style="font-weight:600;">${_lpFormatArrivalTime(departMin + durationMin)}</span>`;
        }
    }

    const departStr = fromItem.leaveTime
        ? `<span style="font-weight:600;">Depart ${_lpEsc(fromItem.leaveTime)}</span>${arrivalStr}&ensp;`
        : '';

    let distHtml = '';
    let actionBtns = '';
    if (dist) {
        const modeIcon = dist.mode === 'walk' ? '🚶' : dist.mode === 'bike' ? '🚴' : dist.mode === 'fly' ? '✈️' : '🚗';
        const parts = [modeIcon];
        if (dist.time) parts.push(dist.time);
        if (dist.miles) parts.push(`${dist.miles} mi`);
        distHtml = parts.join(' ');
        // Edit and delete buttons — shown on hover via opacity trick
        actionBtns = `
            <span style="margin-left:auto; display:flex; gap:2px; opacity:0.5;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.5">
                <button class="btn btn-small" onclick="_lpEditDistance('${dist.id}')" title="Edit distance" style="padding:1px 5px; font-size:0.8em;">✏️</button>
                <button class="btn btn-small btn-danger" onclick="_lpDeleteDistanceFromRow('${dist.id}')" title="Delete distance" style="padding:1px 5px; font-size:0.8em;">🗑️</button>
            </span>`;
    } else if (!fromItem.noTravelNeeded) {
        // No distance on file, and the user hasn't marked this leg as needing no travel time
        distHtml = '<span style="color:#f59e0b;">⚠️ travel time needed</span>';
    }

    const routeStr = (fromLoc && toLoc)
        ? `<span style="color:#bbb; margin-left:8px;">${_lpEsc(fromLoc.name)} → ${_lpEsc(toLoc.name)}</span>`
        : '';

    // Warning suppressed and nothing else to show — skip the row entirely
    if (!distHtml && !departStr && !routeStr) return '';

    return `
        <div style="padding:3px 0 3px 9px; border-bottom:1px solid #f0f0f0; border-left:3px solid #d1d5db; background:#f8fafc; font-size:0.76em; color:#6b7280; display:flex; align-items:center; gap:4px; flex-wrap:wrap;">
            ${departStr}${distHtml}${routeStr}${actionBtns}
        </div>`;
}

/** Render all items for a day, inserting travel rows between consecutive timeline items */
function _lpBuildDayItemsHtml(dayId, items) {
    let html = '';
    let lastTimelineItem = null;
    for (const item of items) {
        if (item.onTimeline && lastTimelineItem) {
            html += _lpTravelRow(lastTimelineItem, item);
        }
        html += _lpItemRow(dayId, item);
        if (item.onTimeline) lastTimelineItem = item;
    }
    return html;
}

/**
 * Render the expanded detail content for an itinerary or planning item.
 * @param {object} item - The item data
 * @param {object} ctx  - Context: { type: 'itinerary'|'planning', dayId?, groupId? }
 *                        Used to render mobile-only action buttons inside the detail panel.
 */
function _lpItemDetailsContent(item, ctx) {
    ctx = ctx || {};
    const travel = _lpIsTravelMode();
    const parts = [];

    // ---- Mobile-only header: status badge + location badge + booking + action buttons ----
    // On desktop these live in the collapsed row; on mobile they move here.
    {
        const st = LP_ITEM_STATUSES[item.status] || LP_ITEM_STATUSES.idea;
        const mLoc = item.locationId ? _lpLocations.find(l => l.id === item.locationId) : null;
        const mLocBadge = mLoc
            ? `<span title="${_lpEsc(mLoc.name)}${mLoc.address ? '\n'+mLoc.address : ''}${mLoc.phone ? '\n'+mLoc.phone : ''}" style="font-size:0.75em; color:#2563eb; white-space:nowrap;">📍 ${_lpEsc(mLoc.name)}</span>`
            : '';
        const mBookingBadge = _lpBookingBadge(item.bookingRef);
        const parentId = ctx.type === 'itinerary' ? ctx.dayId : ctx.groupId;
        const mEditBtn = ctx.type === 'itinerary'
            ? `<button class="btn btn-small" onclick="_lpEditItem('${ctx.dayId}','${item.id}')" style="padding:2px 6px;">✏️</button>`
            : `<button class="btn btn-small" onclick="_lpEditPlanningItem('${ctx.groupId}','${item.id}')" style="padding:2px 6px;">✏️</button>`;
        const mLocBtn = !mLoc
            ? `<button class="btn btn-small" onclick="_lpPickLocation('${ctx.type}','${parentId}','${item.id}')" title="Set location" style="padding:2px 6px;">📍</button>`
            : `<button class="btn btn-small" onclick="_lpOpenAddDistance('${ctx.type}','${parentId}','${item.id}')" title="Add distance from here" style="padding:2px 6px;">🛣️</button>`;

        parts.push(`
            <div class="lp-mobile-only" style="flex-direction:column; gap:6px; margin-bottom:8px; padding-bottom:8px; border-bottom:1px solid #e2e8f0;">
                <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                    <span style="background:${st.bg};color:${st.color};font-size:0.7em;padding:1px 8px;border-radius:10px;font-weight:600;">${st.label}</span>
                    ${mLocBadge}
                    ${mBookingBadge}
                </div>
                <div style="display:flex; gap:4px;">
                    ${mEditBtn}
                    ${mLocBtn}
                </div>
            </div>`);
    }

    // Location row — always first when expanded
    const loc = item.locationId ? _lpLocations.find(l => l.id === item.locationId) : null;
    if (loc) {
        const namePart = _lpEsc(loc.name);
        const addrPart = loc.address
            ? `<a href="${_lpMapsUrl(loc)}" onclick="event.stopPropagation();window.open(this.href,'_blank');return false;" style="color:#2563eb;" title="Open in Google Maps">${_lpEsc(loc.address)}</a>`
            : '';
        const phonePart = loc.phone
            ? `<a href="tel:${_lpEsc(loc.phone.replace(/\s/g,''))}" onclick="event.stopPropagation();" style="color:#2563eb;">${_lpEsc(loc.phone)}</a>`
            : '';
        const locParts = [namePart, addrPart, phonePart].filter(Boolean);
        parts.push(`<div style="margin-bottom:4px; padding:4px 6px; background:#f0f9ff; border-radius:4px; border-left:3px solid #2563eb;">
            <strong>📍</strong> ${locParts.join(' · ')}
        </div>`);
    }

    if (item.duration) parts.push(`<div><strong>Duration:</strong> ${_lpEsc(item.duration)}</div>`);
    if (!travel && item.cost != null && item.cost !== '') parts.push(`<div><strong>Cost:</strong> $${Number(item.cost).toFixed(2)}${item.costNote ? ` <span style="color:#888;">(${_lpEsc(item.costNote)})</span>` : ''}</div>`);
    // In travel mode, confirmation and contact are prominent
    if (item.confirmation) parts.push(`<div${travel ? ' style="font-size:1.05em;"' : ''}><strong>Confirmation:</strong> ${_lpEsc(item.confirmation)}</div>`);
    if (item.contact) {
        // If it looks like a phone number, make it a clickable tel: link
        const looksLikePhone = /^[\d\s\-\(\)\+\.]{7,}$/.test(item.contact.trim());
        const contactHtml = looksLikePhone
            ? `<a href="tel:${_lpEsc(item.contact.replace(/\s/g,''))}" onclick="event.stopPropagation();" style="color:#2563eb;">${_lpEsc(item.contact)}</a>`
            : _lpEsc(item.contact);
        parts.push(`<div${travel ? ' style="font-size:1.05em;"' : ''}><strong>Contact:</strong> ${contactHtml}</div>`);
    }
    if (!travel && item.notes) parts.push(`<div><strong>Notes:</strong> ${_lpEsc(item.notes)}</div>`);
    // Facts — show label: value, with URLs as clickable links.
    // Shown in travel mode too: a booking link or trail map is most useful on the trip.
    if (item.facts && item.facts.length) {
        item.facts.forEach(f => {
            const isUrl = /^https?:\/\//i.test(f.value);
            const valHtml = isUrl
                ? `<a href="${_lpEscAttr(f.value)}" onclick="event.stopPropagation();window.open(this.href,'_blank');return false;" style="color:#2563eb;cursor:pointer;">${_lpEsc(f.value)}</a>`
                : _lpEsc(f.value);
            parts.push(`<div${travel ? ' style="font-size:1.05em;"' : ''}><strong>${_lpEsc(f.label || 'Fact')}:</strong> ${valHtml}</div>`);
        });
    }
    // Photos - names only; the image is fetched when a name is clicked.
    // Shown in travel mode too: a trail map matters most at the trailhead.
    parts.push(_lpItemPhotoSectionHtml(item.id));
    // Legacy links support (old data) — same reasoning, shown in travel mode too
    if (item.links && item.links.length) {
        item.links.forEach(l => {
            if (!l.url) return;
            parts.push(`<div><a href="${_lpEsc(l.url)}" onclick="event.stopPropagation();window.open(this.href,'_blank');return false;" style="color:#2563eb;cursor:pointer;">${_lpEsc(l.label || l.url)}</a></div>`);
        });
    }
    return parts.length ? parts.join('') : '<span style="color:#bbb;">No additional details.</span>';
}

function _lpToggleItemDetails(dayId, itemId) {
    const el = document.getElementById(`lpItemDetails_${dayId}_${itemId}`);
    if (el) el.style.display = el.style.display === 'none' ? '' : 'none';
}

// ---------- Auto-generate days ----------

async function _lpAutoGenerateDays() {
    const p = _lpCurrentProject;
    if (!p.startDate || !p.endDate) { alert('Set start and end dates first.'); return; }

    const preDays = parseInt(prompt('How many travel/pre-trip days before the start date?', '1') || '0', 10);
    const postDays = parseInt(prompt('How many travel/post-trip days after the end date?', '1') || '0', 10);

    const start = new Date(p.startDate + 'T00:00:00');
    const end = new Date(p.endDate + 'T00:00:00');

    // Build array of dates
    const dates = [];
    const actualStart = new Date(start);
    actualStart.setDate(actualStart.getDate() - Math.max(0, preDays));
    const actualEnd = new Date(end);
    actualEnd.setDate(actualEnd.getDate() + Math.max(0, postDays));

    for (let d = new Date(actualStart); d <= actualEnd; d.setDate(d.getDate() + 1)) {
        dates.push(new Date(d));
    }

    if (dates.length > 60) { alert('Too many days (max 60). Adjust your dates.'); return; }
    if (!confirm(`This will create ${dates.length} days. Continue?`)) return;

    try {
        const batch = firebase.firestore().batch();
        const existingMax = _lpDays.reduce((max, d) => Math.max(max, d.sortOrder || 0), -1);

        dates.forEach((dt, i) => {
            const iso = dt.toISOString().split('T')[0];
            const label = _lpDayLabel(i + 1, iso);

            const ref = lpSub(_lpCurrentProjectId, 'days').doc();
            batch.set(ref, {
                date: iso,
                label,
                location: '',
                sortOrder: existingMax + 1 + i,
                items: []
            });
        });
        await batch.commit();
        await _lpLoadItinerary();
    } catch (err) {
        console.error('Error generating days:', err);
        alert('Error generating days.');
    }
}

// ---------- Day CRUD ----------

async function _lpAddDay() {
    const label = prompt('Day label (e.g., "Day 5 — Sat Jul 20"):', '');
    if (!label || !label.trim()) return;
    const date = prompt('Date (YYYY-MM-DD, or leave blank):', '') || '';
    const location = prompt('Location (optional):', '') || '';

    const maxOrder = _lpDays.reduce((max, d) => Math.max(max, d.sortOrder || 0), -1);

    try {
        const ref = await lpSub(_lpCurrentProjectId, 'days').add({
            date: date.trim(),
            label: label.trim(),
            location: location.trim(),
            sortOrder: maxOrder + 1,
            items: []
        });
        _lpDayExpanded.add(ref.id); // new day starts expanded
        await _lpLoadItinerary();
    } catch (err) {
        console.error('Error adding day:', err);
        alert('Error adding day.');
    }
}

/** Standard day label, e.g. "Day 3 — Sat Sep 19" (or "Day 3" when no date). */
function _lpDayLabel(dayNum, iso) {
    if (!iso) return `Day ${dayNum}`;
    const dt  = new Date(iso + 'T00:00:00');
    const dow = dt.toLocaleDateString(undefined, { weekday: 'short' });
    const md  = dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return `Day ${dayNum} — ${dow} ${md}`;
}

/** Whole-day difference (iso2 − iso1) in days. Uses local midnight to dodge DST drift. */
function _lpDayDiff(iso1, iso2) {
    const a = new Date(iso1 + 'T00:00:00');
    const b = new Date(iso2 + 'T00:00:00');
    return Math.round((b - a) / 86400000);
}

/** Add `delta` days to an ISO date, formatting from LOCAL parts (never toISOString,
 *  which can roll back a day in negative-offset timezones). */
function _lpAddDays(iso, delta) {
    if (!iso) return iso;
    const d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() + delta);
    const y   = d.getFullYear();
    const m   = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/** 1-based position of a day within the sortOrder-ordered list. */
function _lpDayNumber(dayId) {
    const ordered = [..._lpDays].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    return ordered.findIndex(d => d.id === dayId) + 1;
}

function _lpEditDay(dayId) {
    const day = _lpDays.find(d => d.id === dayId);
    if (!day) return;

    // Build or reuse the edit-day modal
    let modal = document.getElementById('lpEditDayModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'lpEditDayModal';
        modal.className = 'modal-overlay';
        document.getElementById('page-life-project').appendChild(modal);
    }

    modal.innerHTML = `
        <div class="modal" style="max-width:420px;">
            <h3 style="margin:0 0 16px;">Edit Day</h3>
            <div class="form-group">
                <label>Label</label>
                <input type="text" id="lpEditDayLabel" class="form-control" value="${_lpEsc(day.label || '')}">
            </div>
            <div class="form-group">
                <label>Date</label>
                <input type="date" id="lpEditDayDate" class="form-control" value="${day.date || ''}">
            </div>
            <div class="form-group">
                <label>Location</label>
                <input type="text" id="lpEditDayLocation" class="form-control" value="${_lpEsc(day.location || '')}">
            </div>
            <div class="modal-actions" style="justify-content:space-between; align-items:center;">
                <button class="btn btn-danger btn-small" onclick="_lpDeleteDayFromModal('${dayId}')">🗑️ Delete Day</button>
                <div style="display:flex; gap:8px;">
                    <button class="btn" onclick="closeModal('lpEditDayModal')">Cancel</button>
                    <button class="btn btn-primary" onclick="_lpSaveEditDay('${dayId}')">Save</button>
                </div>
            </div>
        </div>`;

    openModal('lpEditDayModal');
    setTimeout(() => document.getElementById('lpEditDayLabel')?.focus(), 50);
}

async function _lpSaveEditDay(dayId) {
    const label    = document.getElementById('lpEditDayLabel')?.value.trim() || '';
    const date     = document.getElementById('lpEditDayDate')?.value.trim()  || '';
    const location = document.getElementById('lpEditDayLocation')?.value.trim() || '';
    if (!label) { alert('Label is required.'); return; }

    const day     = _lpDays.find(d => d.id === dayId);
    const oldDate = day ? (day.date || '') : '';

    // When this day's date moved, offer an all-or-nothing shift of the other
    // dated days by the same number of days (and rebuild every day's label).
    let delta = 0;
    if (date && oldDate && date !== oldDate) delta = _lpDayDiff(oldDate, date);
    const otherDated = _lpDays.filter(d => d.id !== dayId && d.date);
    let doShift = false;
    if (delta !== 0 && otherDated.length > 0) {
        const dir = delta > 0 ? 'forward' : 'back';
        const n   = otherDated.length;
        const abs = Math.abs(delta);
        doShift = confirm(
            `Move the other ${n} day${n !== 1 ? 's' : ''} ${dir} by ${abs} day${abs !== 1 ? 's' : ''} to match?\n\n` +
            `Each day's label will be rebuilt from its new date.`
        );
    }

    closeModal('lpEditDayModal');

    try {
        if (doShift) {
            // Apply the new date/location to the edited day, shift the others,
            // then rebuild every day's label from its (new) date + position.
            if (day) { day.date = date; day.location = location; }
            otherDated.forEach(d => { d.date = _lpAddDays(d.date, delta); });

            const ordered = [..._lpDays].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
            const batch   = firebase.firestore().batch();
            ordered.forEach((d, i) => {
                d.label = _lpDayLabel(i + 1, d.date);
                batch.update(lpSub(_lpCurrentProjectId, 'days').doc(d.id), {
                    date: d.date || '', label: d.label, location: d.location != null ? d.location : ''
                });
            });
            await batch.commit();
        } else {
            // Only the edited day changed. If its date moved, rebuild just its label.
            const newLabel = (date && date !== oldDate) ? _lpDayLabel(_lpDayNumber(dayId), date) : label;
            await lpSub(_lpCurrentProjectId, 'days').doc(dayId).update({ label: newLabel, date, location });
            if (day) Object.assign(day, { label: newLabel, date, location });
        }
        const body = document.getElementById('lpBody_itinerary');
        if (body) _lpRenderItinerary(body);
    } catch (err) {
        console.error('Error saving day:', err);
        alert('Error saving day.');
    }
}

async function _lpDeleteDayFromModal(dayId) {
    closeModal('lpEditDayModal');
    await _lpDeleteDay(dayId);
}

async function _lpDeleteDay(dayId) {
    const day = _lpDays.find(d => d.id === dayId);
    const itemCount = (day?.items || []).length;
    const msg = itemCount > 0
        ? `Delete this day and its ${itemCount} item(s)? This cannot be undone.`
        : 'Delete this day? This cannot be undone.';
    if (!confirm(msg)) return;

    try {
        await _lpDeletePhotosForItems((day?.items || []).map(it => it.id));
        await lpSub(_lpCurrentProjectId, 'days').doc(dayId).delete();
        await _lpLoadItinerary();
    } catch (err) {
        console.error('Error deleting day:', err);
    }
}

async function _lpReorderDays(evt) {
    const cards = document.querySelectorAll('#lpDayList .lp-day-card');
    const batch = firebase.firestore().batch();
    cards.forEach((el, i) => {
        const id = el.dataset.id;
        batch.update(lpSub(_lpCurrentProjectId, 'days').doc(id), { sortOrder: i });
    });
    try {
        await batch.commit();
        const idOrder = Array.from(cards).map(el => el.dataset.id);
        _lpDays.sort((a, b) => idOrder.indexOf(a.id) - idOrder.indexOf(b.id));
        _lpDays.forEach((d, i) => d.sortOrder = i);
    } catch (err) {
        console.error('Error reordering days:', err);
    }
}

// ---------- Item CRUD ----------

/** Generate a short unique ID for items within a day's items array */
function _lpItemId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

async function _lpAddItem(dayId) {
    const day = _lpDays.find(d => d.id === dayId);
    if (!day) return;

    // Create a blank item, save it, then open the modal to fill in details
    const items = [...(day.items || [])];
    const maxOrder = items.reduce((max, it) => Math.max(max, it.sortOrder || 0), -1);
    const newItem = {
        id: _lpItemId(),
        title: 'New Item',
        time: '',
        status: 'idea',
        cost: null,
        costNote: '',
        notes: '',
        facts: [],
        locationId: null,
        confirmation: '',
        contact: '',
        duration: '',
        bookingRef: null,
        sortOrder: maxOrder + 1,
        showOnCalendar: false
    };
    items.push(newItem);

    try {
        await lpSub(_lpCurrentProjectId, 'days').doc(dayId).update({ items });
        day.items = items;
        // Open modal to fill in details immediately
        _lpItemModalCtx = { type: 'itinerary', dayId, itemId: newItem.id, groupId: null };
        _lpOpenItemModal('Add Itinerary Item', newItem, dayId);
        const body = document.getElementById('lpBody_itinerary');
        if (body) _lpRenderItinerary(body);
    } catch (err) {
        console.error('Error adding item:', err);
        alert('Error adding item.');
    }
}

function _lpEditItem(dayId, itemId) {
    const day = _lpDays.find(d => d.id === dayId);
    if (!day) return;
    const item = (day.items || []).find(it => it.id === itemId);
    if (!item) return;

    _lpItemModalCtx = { type: 'itinerary', dayId, itemId, groupId: null };
    _lpOpenItemModal('Edit Itinerary Item', item, dayId);
}

/** Open the shared item edit modal and populate fields */
// ============================================================
// Fact rows - shared by the item modal and the journal-note modal
//
// A fact row has two states:
//   - edit: Label + Value inputs, ACCEPT to commit, DELETE to remove
//   - chip: read-only "Label: value"; URL values render as clickable links
//
// The committed values live in the row's dataset, NOT in the inputs, because a
// chip row has no inputs left to read from. _lpCollectFacts reads the dataset for
// chip rows and the live inputs for any row still open in edit mode - so a fact
// the user typed but never accepted is still saved instead of silently lost.
// ============================================================

/** Escape a string for use inside a double-quoted HTML attribute.
 *  (_lpEsc alone is not enough - it doesn't escape quotes.) */
function _lpEscAttr(str) {
    return _lpEsc(str).replace(/"/g, '&quot;');
}

/** Build a fact row and append it to the given container. */
function _lpAppendFactRow(containerId, label, value, startInEdit) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const row = document.createElement('div');
    row.className = 'lp-fact-row';
    row.dataset.label = label || '';
    row.dataset.value = value || '';
    row.dataset.editing = startInEdit ? '1' : '';
    container.appendChild(row);
    _lpPaintFactRow(row);
    if (startInEdit) row.querySelector('.lp-fact-input-label')?.focus();
}

/** Render a fact row in whichever state its dataset says it is in. */
function _lpPaintFactRow(row) {
    const label = row.dataset.label || '';
    const value = row.dataset.value || '';

    if (row.dataset.editing) {
        row.style.cssText = 'display:flex; gap:6px; align-items:center;';
        row.innerHTML = `
            <input type="text" class="form-control lp-fact-input-label" placeholder="Label" style="flex:0 0 38%; min-width:0;">
            <input type="text" class="form-control lp-fact-input-value" placeholder="Value or URL" style="flex:1; min-width:0;">
            <button class="btn btn-small btn-primary" type="button" onclick="_lpAcceptFactRow(this)" title="Accept" style="padding:2px 8px; flex-shrink:0;">✓</button>
            <button class="btn btn-small btn-danger" type="button" onclick="this.closest('.lp-fact-row').remove()" title="Delete" style="padding:2px 6px; flex-shrink:0;">✕</button>
        `;
        // Values are assigned here rather than as value="..." attributes because
        // _lpEsc doesn't escape double quotes, which would break the attribute.
        const li = row.querySelector('.lp-fact-input-label');
        const vi = row.querySelector('.lp-fact-input-value');
        li.value = label;
        vi.value = value;
        const onEnter = e => { if (e.key === 'Enter') { e.preventDefault(); _lpAcceptFactRow(li); } };
        li.addEventListener('keydown', onEnter);
        vi.addEventListener('keydown', onEnter);
        return;
    }

    // Chip state - a URL value links out, using the label as the link text when there
    // is one (a raw booking URL would otherwise blow out the modal width).
    const isUrl = /^https?:\/\//i.test(value);
    const valHtml = isUrl
        ? `<a href="${_lpEscAttr(value)}" target="_blank" rel="noopener" style="color:#2563eb;">🔗 ${_lpEsc(label || value)}</a>`
        : _lpEsc(value);
    const labelHtml = (label && !isUrl) ? `<strong>${_lpEsc(label)}:</strong> ` : '';
    row.style.cssText = 'display:flex; gap:6px; align-items:center; padding:4px 6px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px;';
    row.innerHTML = `
        <span style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:0.9em;">${labelHtml}${valHtml}</span>
        <button class="btn btn-small" type="button" onclick="_lpEditFactRow(this)" title="Edit" style="padding:2px 6px; flex-shrink:0;">✏️</button>
        <button class="btn btn-small btn-danger" type="button" onclick="this.closest('.lp-fact-row').remove()" title="Delete" style="padding:2px 6px; flex-shrink:0;">✕</button>
    `;
}

/** Commit a row's inputs into its dataset and switch it to chip state. */
function _lpAcceptFactRow(el) {
    const row = el.closest('.lp-fact-row');
    if (!row) return;
    const label = (row.querySelector('.lp-fact-input-label')?.value || '').trim();
    const value = (row.querySelector('.lp-fact-input-value')?.value || '').trim();
    if (!label && !value) { row.remove(); return; }  // accepting a blank row discards it
    row.dataset.label = label;
    row.dataset.value = value;
    row.dataset.editing = '';
    _lpPaintFactRow(row);
}

/** Switch a chip row back into its inputs. */
function _lpEditFactRow(el) {
    const row = el.closest('.lp-fact-row');
    if (!row) return;
    row.dataset.editing = '1';
    _lpPaintFactRow(row);
    row.querySelector('.lp-fact-input-value')?.focus();
}

/** Read every fact row in a container back out as [{label, value}]. */
function _lpCollectFacts(containerId) {
    const facts = [];
    document.querySelectorAll(`#${containerId} > .lp-fact-row`).forEach(row => {
        const editing = !!row.dataset.editing;
        const label = editing
            ? (row.querySelector('.lp-fact-input-label')?.value || '').trim()
            : (row.dataset.label || '').trim();
        const value = editing
            ? (row.querySelector('.lp-fact-input-value')?.value || '').trim()
            : (row.dataset.value || '').trim();
        if (label || value) facts.push({ label, value });
    });
    return facts;
}

/** Add a fact row to the item modal. A brand-new row opens in edit mode. */
function _lpAddFactRow(label = '', value = '') {
    _lpAppendFactRow('lpItFactsContainer', label, value, !label && !value);
}

/** Populate (or re-populate) the location select in the item edit modal */
function _lpPopulateItemLocationSelect(selectedId) {
    const locSelect = document.getElementById('lpItLocation');
    locSelect.innerHTML = '';

    const noneOpt = document.createElement('option');
    noneOpt.value = '';
    noneOpt.textContent = '— None —';
    locSelect.appendChild(noneOpt);

    const addOpt = document.createElement('option');
    addOpt.value = '__add_new__';
    addOpt.textContent = '＋ Add new location…';
    locSelect.appendChild(addOpt);

    [..._lpLocations]
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach(l => {
            const opt = document.createElement('option');
            opt.value = l.id;
            opt.textContent = l.name;
            if (l.id === selectedId) opt.selected = true;
            locSelect.appendChild(opt);
        });

    // Handler: if user picks "Add new location…", open the location modal and return here
    locSelect.onchange = function() {
        if (this.value !== '__add_new__') return;
        this.value = selectedId || ''; // revert selection while user fills out modal
        _lpPickerReturnCtx = { source: 'itemModal', field: 'from' };
        _lpOpenLocationModal();
    };
}

/** Populate the item modal's "To Location" dropdown (used for travel-type items).
 *  None + existing project locations + an "add new location…" option (same flow
 *  as the From dropdown). */
function _lpPopulateItemToLocationSelect(selectedId) {
    const sel = document.getElementById('lpItToLocation');
    if (!sel) return;
    sel.innerHTML = '';

    const noneOpt = document.createElement('option');
    noneOpt.value = '';
    noneOpt.textContent = '— None —';
    sel.appendChild(noneOpt);

    const addOpt = document.createElement('option');
    addOpt.value = '__add_new__';
    addOpt.textContent = '＋ Add new location…';
    sel.appendChild(addOpt);

    [..._lpLocations]
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach(l => {
            const opt = document.createElement('option');
            opt.value = l.id;
            opt.textContent = l.name;
            if (l.id === selectedId) opt.selected = true;
            sel.appendChild(opt);
        });

    // Handler: if user picks "Add new location…", open the location modal and return here
    sel.onchange = function() {
        if (this.value !== '__add_new__') return;
        this.value = selectedId || ''; // revert selection while user fills out modal
        _lpPickerReturnCtx = { source: 'itemModal', field: 'to' };
        _lpOpenLocationModal();
    };
}

function _lpOpenItemModal(title, item, currentDayId) {
    document.getElementById('lpItemModalTitle').textContent = title;

    // Basic fields
    document.getElementById('lpItTitle').value = item.title || '';
    document.getElementById('lpItStatus').value = item.status || 'idea';
    document.getElementById('lpItType').value = item.type || 'none'; // null/legacy → None
    document.getElementById('lpItTime').value = item.time || '';
    document.getElementById('lpItDuration').value = item.duration || '';
    document.getElementById('lpItCost').value = item.cost != null ? item.cost : '';
    document.getElementById('lpItCostNote').value = item.costNote || '';
    document.getElementById('lpItConfirmation').value = item.confirmation || '';
    document.getElementById('lpItContact').value = item.contact || '';
    document.getElementById('lpItNotes').value = item.notes || '';
    document.getElementById('lpItCalendar').checked = !!item.showOnCalendar;
    document.getElementById('lpItLeaveTime').value = item.leaveTime || '';
    document.getElementById('lpItOnTimeline').checked = !!item.onTimeline;
    document.getElementById('lpItNoTravelNeeded').checked = !!item.noTravelNeeded;

    // Facts — render rows
    const factsContainer = document.getElementById('lpItFactsContainer');
    factsContainer.innerHTML = '';
    const facts = item.facts || [];
    facts.forEach(f => _lpAddFactRow(f.label || '', f.value || ''));

    // Location dropdown — sorted alphabetically, with "Add new" option
    _lpPopulateItemLocationSelect(item.locationId || null);
    // To Location dropdown (shown only for travel types by _lpApplyItemTypeUI)
    _lpPopulateItemToLocationSelect(item.toLocationId || null);

    // Booking dropdown
    const bkSelect = document.getElementById('lpItBooking');
    bkSelect.innerHTML = '<option value="">— None —</option>';
    _lpBookings.forEach(b => {
        const opt = document.createElement('option');
        opt.value = b.id;
        opt.textContent = b.name;
        if (b.id === item.bookingRef) opt.selected = true;
        bkSelect.appendChild(opt);
    });
    document.getElementById('lpItBookingWrap').style.display = _lpBookings.length > 0 ? '' : 'none';

    // Move-to dropdown: days + planning groups
    const moveSelect = document.getElementById('lpItMoveTo');
    moveSelect.innerHTML = '<option value="">— Stay in place —</option>';

    // Day options (only for itinerary items)
    if (_lpItemModalCtx.type === 'itinerary') {
        const dayGroup = document.createElement('optgroup');
        dayGroup.label = 'Move to Day';
        _lpDays.forEach(d => {
            const opt = document.createElement('option');
            opt.value = 'day:' + d.id;
            opt.textContent = d.label || d.date || 'Day';
            if (d.id === currentDayId) opt.textContent += ' (current)';
            dayGroup.appendChild(opt);
        });
        if (_lpDays.length > 0) moveSelect.appendChild(dayGroup);
    }

    // Planning group options (for both types)
    if (_lpPlanningGroups.length > 0) {
        const pgGroup = document.createElement('optgroup');
        pgGroup.label = 'Move to Planning Board';
        _lpPlanningGroups.forEach(g => {
            const opt = document.createElement('option');
            opt.value = 'pg:' + g.id;
            opt.textContent = '🗺️ ' + g.name;
            if (_lpItemModalCtx.type === 'planning' && g.id === _lpItemModalCtx.groupId) {
                opt.textContent += ' (current)';
            }
            pgGroup.appendChild(opt);
        });
        moveSelect.appendChild(pgGroup);
    }

    // For planning items, add day options too
    if (_lpItemModalCtx.type === 'planning' && _lpDays.length > 0) {
        const dayGroup = document.createElement('optgroup');
        dayGroup.label = 'Move to Day';
        _lpDays.forEach(d => {
            const opt = document.createElement('option');
            opt.value = 'day:' + d.id;
            opt.textContent = d.label || d.date || 'Day';
            dayGroup.appendChild(opt);
        });
        moveSelect.appendChild(dayGroup);
    }

    // Apply Type-driven field visibility + leave-time label before showing
    _lpApplyItemTypeUI();

    openModal('lpItemModal');
    setTimeout(() => document.getElementById('lpItTitle')?.focus(), 100);
}

/**
 * Show/hide the booking-detail fields and set the leave-time label based on the
 * currently selected item Type. Called on modal open and on Type change.
 *   - Cost / Cost Note / Confirmation / Contact: shown only for Flight and Activity
 *   - Leave-time label: "Arrival Time" for Drive/Flight/Travel, "Leave By" for None/Activity
 *   - Location: for Drive/Flight/Travel the label becomes "From Location" and a
 *     "To Location" row appears below it; otherwise the label is "Location" and
 *     the To Location row is hidden.
 */
function _lpApplyItemTypeUI() {
    const type = document.getElementById('lpItType').value || 'none';
    const isTravelType = (type === 'drive' || type === 'flight' || type === 'travel');

    // Hotel is a stay (like Activity): single location, booking fields shown.
    const showBookingFields = (type === 'flight' || type === 'activity' || type === 'hotel');
    ['lpItCostWrap', 'lpItCostNoteWrap', 'lpItConfirmationWrap', 'lpItContactWrap'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = showBookingFields ? '' : 'none';
    });

    const lbl = document.getElementById('lpItLeaveTimeLabel');
    if (lbl) lbl.textContent = type === 'hotel' ? 'Check-in Time' : (isTravelType ? 'Arrival Time' : 'Leave By');

    // From/To location: travel types get a From→To pair; others get a single "Location"
    const locLabel = document.getElementById('lpItLocationLabel');
    if (locLabel) locLabel.textContent = isTravelType ? 'From Location' : 'Location';
    const toWrap = document.getElementById('lpItToLocationWrap');
    if (toWrap) toWrap.style.display = isTravelType ? '' : 'none';
}

/** Save handler for the item modal */
async function _lpSaveItemModal() {
    const title = document.getElementById('lpItTitle').value.trim();
    if (!title) { alert('Title is required.'); return; }

    const costRaw = document.getElementById('lpItCost').value;
    const cost = costRaw && !isNaN(Number(costRaw)) ? Number(costRaw) : null;

    // Collect facts from the dynamic rows (rows still open in edit mode are committed too)
    const facts = _lpCollectFacts('lpItFactsContainer');

    const moveVal = document.getElementById('lpItMoveTo').value;

    const updatedItem = {
        title,
        status: document.getElementById('lpItStatus').value,
        type: document.getElementById('lpItType').value || 'none',
        time: document.getElementById('lpItTime').value.trim(),
        duration: document.getElementById('lpItDuration').value.trim(),
        cost,
        costNote: document.getElementById('lpItCostNote').value.trim(),
        confirmation: document.getElementById('lpItConfirmation').value.trim(),
        contact: document.getElementById('lpItContact').value.trim(),
        notes: document.getElementById('lpItNotes').value.trim(),
        facts,
        locationId: document.getElementById('lpItLocation').value || null,
        toLocationId: document.getElementById('lpItToLocation').value || null,
        bookingRef: document.getElementById('lpItBooking').value || null,
        showOnCalendar: document.getElementById('lpItCalendar').checked,
        leaveTime: document.getElementById('lpItLeaveTime').value.trim(),
        onTimeline: document.getElementById('lpItOnTimeline').checked,
        noTravelNeeded: document.getElementById('lpItNoTravelNeeded').checked
    };

    closeModal('lpItemModal');

    const ctx = _lpItemModalCtx;
    if (!ctx) return;

    try {
        if (ctx.type === 'itinerary') {
            const day = _lpDays.find(d => d.id === ctx.dayId);
            if (!day) return;
            const items = [...(day.items || [])];
            const idx = items.findIndex(it => it.id === ctx.itemId);
            if (idx < 0) return;
            const fullItem = { ...items[idx], ...updatedItem };

            if (moveVal.startsWith('day:')) {
                // Move to different day
                const targetDayId = moveVal.slice(4);
                const targetDay = _lpDays.find(d => d.id === targetDayId);
                if (targetDay && targetDay.id !== ctx.dayId) {
                    const srcItems = items.filter(it => it.id !== ctx.itemId);
                    await lpSub(_lpCurrentProjectId, 'days').doc(ctx.dayId).update({ items: srcItems });
                    day.items = srcItems;
                    const destItems = [...(targetDay.items || [])];
                    fullItem.sortOrder = destItems.reduce((max, it) => Math.max(max, it.sortOrder || 0), -1) + 1;
                    destItems.push(fullItem);
                    await lpSub(_lpCurrentProjectId, 'days').doc(targetDay.id).update({ items: destItems });
                    targetDay.items = destItems;
                } else {
                    items[idx] = fullItem;
                    await lpSub(_lpCurrentProjectId, 'days').doc(ctx.dayId).update({ items });
                    day.items = items;
                }
            } else if (moveVal.startsWith('pg:')) {
                // Move to planning group
                const targetGroupId = moveVal.slice(3);
                const group = _lpPlanningGroups.find(g => g.id === targetGroupId);
                if (group) {
                    const srcItems = items.filter(it => it.id !== ctx.itemId);
                    await lpSub(_lpCurrentProjectId, 'days').doc(ctx.dayId).update({ items: srcItems });
                    day.items = srcItems;
                    const groupItems = [...(group.items || [])];
                    fullItem.sortOrder = groupItems.reduce((max, it) => Math.max(max, it.sortOrder || 0), -1) + 1;
                    groupItems.push(fullItem);
                    await lpSub(_lpCurrentProjectId, 'planningGroups').doc(group.id).update({ items: groupItems });
                    group.items = groupItems;
                    const pgBody = document.getElementById('lpBody_planning');
                    if (pgBody) _lpRenderPlanningBoard(pgBody);
                }
            } else {
                // Stay in place — just update
                items[idx] = fullItem;
                await lpSub(_lpCurrentProjectId, 'days').doc(ctx.dayId).update({ items });
                day.items = items;
            }

            const body = document.getElementById('lpBody_itinerary');
            if (body) _lpRenderItinerary(body);
            _lpLoadTripInfo();

        } else if (ctx.type === 'planning') {
            const group = _lpPlanningGroups.find(g => g.id === ctx.groupId);
            if (!group) return;
            const items = [...(group.items || [])];
            const idx = items.findIndex(it => it.id === ctx.itemId);
            if (idx < 0) return;
            const fullItem = { ...items[idx], ...updatedItem };

            if (moveVal.startsWith('day:')) {
                // Move to itinerary day
                const targetDayId = moveVal.slice(4);
                const targetDay = _lpDays.find(d => d.id === targetDayId);
                if (targetDay) {
                    const srcItems = items.filter(it => it.id !== ctx.itemId);
                    await lpSub(_lpCurrentProjectId, 'planningGroups').doc(ctx.groupId).update({ items: srcItems });
                    group.items = srcItems;
                    const dayItems = [...(targetDay.items || [])];
                    fullItem.sortOrder = dayItems.reduce((max, it) => Math.max(max, it.sortOrder || 0), -1) + 1;
                    dayItems.push(fullItem);
                    await lpSub(_lpCurrentProjectId, 'days').doc(targetDay.id).update({ items: dayItems });
                    targetDay.items = dayItems;
                    const itBody = document.getElementById('lpBody_itinerary');
                    if (itBody) _lpRenderItinerary(itBody);
                    _lpLoadTripInfo();
                }
            } else if (moveVal.startsWith('pg:')) {
                // Move to different planning group
                const targetGroupId = moveVal.slice(3);
                const targetGroup = _lpPlanningGroups.find(g => g.id === targetGroupId);
                if (targetGroup && targetGroup.id !== ctx.groupId) {
                    const srcItems = items.filter(it => it.id !== ctx.itemId);
                    await lpSub(_lpCurrentProjectId, 'planningGroups').doc(ctx.groupId).update({ items: srcItems });
                    group.items = srcItems;
                    const destItems = [...(targetGroup.items || [])];
                    fullItem.sortOrder = destItems.reduce((max, it) => Math.max(max, it.sortOrder || 0), -1) + 1;
                    destItems.push(fullItem);
                    await lpSub(_lpCurrentProjectId, 'planningGroups').doc(targetGroup.id).update({ items: destItems });
                    targetGroup.items = destItems;
                } else {
                    items[idx] = fullItem;
                    await lpSub(_lpCurrentProjectId, 'planningGroups').doc(ctx.groupId).update({ items });
                    group.items = items;
                }
            } else {
                // Stay in place
                items[idx] = fullItem;
                await lpSub(_lpCurrentProjectId, 'planningGroups').doc(ctx.groupId).update({ items });
                group.items = items;
            }

            const pgBody = document.getElementById('lpBody_planning');
            if (pgBody) _lpRenderPlanningBoard(pgBody);
        }
    } catch (err) {
        console.error('Error saving item:', err);
        alert('Error saving item.');
    }
}

/** Delete the current item from within the edit modal */
async function _lpDeleteItemFromModal() {
    const ctx = _lpItemModalCtx;
    if (!ctx) return;
    if (!confirm('Delete this item?')) return;
    closeModal('lpItemModal');

    if (ctx.type === 'itinerary') {
        await _lpDeleteItem(ctx.dayId, ctx.itemId, true); // true = already confirmed
    } else {
        await _lpDeletePlanningItem(ctx.groupId, ctx.itemId, true);
    }
}

/** Open the compact location picker for an item */
function _lpPickLocation(type, parentId, itemId) {
    const sel = document.getElementById('lpLocPickerSelect');
    sel.innerHTML = '<option value="">— None (clear location) —</option>';
    [..._lpLocations].sort((a, b) => a.name.localeCompare(b.name)).forEach(l => {
        const opt = document.createElement('option');
        opt.value = l.id;
        opt.textContent = l.name + (l.address ? ' — ' + l.address : '');
        sel.appendChild(opt);
    });

    // Set current location if any
    const item = type === 'itinerary'
        ? (_lpDays.find(d => d.id === parentId)?.items || []).find(it => it.id === itemId)
        : (_lpPlanningGroups.find(g => g.id === parentId)?.items || []).find(it => it.id === itemId);
    if (item?.locationId) sel.value = item.locationId;

    // Store context on the modal
    sel.dataset.type     = type;
    sel.dataset.parentId = parentId;
    sel.dataset.itemId   = itemId;
    openModal('lpLocPickerModal');
}

/** "Add new location first" in the picker — saves context, then opens the Add Location modal.
 *  After the location is saved, _lpSaveLocation() checks _lpPickerReturnCtx and re-opens
 *  the picker with the new location pre-selected. */
function _lpLocPickerAddNew() {
    const sel = document.getElementById('lpLocPickerSelect');
    _lpPickerReturnCtx = {
        type:     sel.dataset.type,
        parentId: sel.dataset.parentId,
        itemId:   sel.dataset.itemId
    };
    closeModal('lpLocPickerModal');
    _lpOpenLocationModal();
}

/** Save the picked location onto the item */
async function _lpLocPickerSave() {
    const sel = document.getElementById('lpLocPickerSelect');
    const { type, parentId, itemId } = sel.dataset;
    const locationId = sel.value || null;

    closeModal('lpLocPickerModal');

    try {
        if (type === 'itinerary') {
            const day = _lpDays.find(d => d.id === parentId);
            if (!day) return;
            const items = [...(day.items || [])];
            const idx = items.findIndex(it => it.id === itemId);
            if (idx < 0) return;
            items[idx] = { ...items[idx], locationId };
            await lpSub(_lpCurrentProjectId, 'days').doc(parentId).update({ items });
            day.items = items;
            const body = document.getElementById('lpBody_itinerary');
            if (body) _lpRenderItinerary(body);
        } else {
            const group = _lpPlanningGroups.find(g => g.id === parentId);
            if (!group) return;
            const items = [...(group.items || [])];
            const idx = items.findIndex(it => it.id === itemId);
            if (idx < 0) return;
            items[idx] = { ...items[idx], locationId };
            await lpSub(_lpCurrentProjectId, 'planningGroups').doc(parentId).update({ items });
            group.items = items;
            const body = document.getElementById('lpBody_planning');
            if (body) _lpRenderPlanningBoard(body);
        }
    } catch (err) {
        console.error('Error setting location:', err);
        alert('Error setting location.');
    }
}


async function _lpDeleteItem(dayId, itemId, confirmed = false) {
    if (!confirmed && !confirm('Delete this item?')) return;
    const day = _lpDays.find(d => d.id === dayId);
    if (!day) return;

    const items = (day.items || []).filter(it => it.id !== itemId);

    try {
        await _lpDeletePhotosForItems([itemId]);
        await lpSub(_lpCurrentProjectId, 'days').doc(dayId).update({ items });
        day.items = items;
        const body = document.getElementById('lpBody_itinerary');
        if (body) _lpRenderItinerary(body);
        _lpLoadTripInfo();
    } catch (err) {
        console.error('Error deleting item:', err);
    }
}

async function _lpReorderItems(dayId, evt) {
    const day = _lpDays.find(d => d.id === dayId);
    if (!day) return;

    const itemEls = document.querySelectorAll(`#lpItems_${dayId} .lp-item-row`);
    const newOrder = Array.from(itemEls).map(el => el.dataset.itemId);

    const items = [...(day.items || [])];
    items.sort((a, b) => newOrder.indexOf(a.id) - newOrder.indexOf(b.id));
    items.forEach((it, i) => it.sortOrder = i);

    try {
        await lpSub(_lpCurrentProjectId, 'days').doc(dayId).update({ items });
        day.items = items;
    } catch (err) {
        console.error('Error reordering items:', err);
    }
}

// ============================================================
// Bookings Section (Phase 6)
// ============================================================

const LP_PAYMENT_STATUSES = {
    paid:          { label: 'Paid',          color: '#16a34a' },
    deposit:       { label: 'Deposit Paid',  color: '#d97706' },
    'balance-owed':{ label: 'Balance Owed',  color: '#dc2626' }
};

let _lpBookings = [];
let _lpBookingPhotoCounts = {}; // bookingId → photo count

async function _lpLoadBookings() {
    const body = document.getElementById('lpBody_bookings');
    if (!body || !_lpCurrentProjectId) return;

    try {
        const [bookingSnap, photoSnap] = await Promise.all([
            lpSub(_lpCurrentProjectId, 'bookings').orderBy('sortOrder').get(),
            lpSub(_lpCurrentProjectId, 'bookingPhotos').get()
        ]);
        _lpBookings = [];
        bookingSnap.forEach(doc => _lpBookings.push({ id: doc.id, ...doc.data() }));

        // Build photo count map
        _lpBookingPhotoCounts = {};
        photoSnap.forEach(doc => {
            const bid = doc.data().bookingId;
            if (bid) _lpBookingPhotoCounts[bid] = (_lpBookingPhotoCounts[bid] || 0) + 1;
        });

        _lpRenderBookings(body);
    } catch (err) {
        console.error('Error loading bookings:', err);
        body.innerHTML = '<p style="color:red;">Error loading bookings.</p>';
    }
}

function _lpRenderBookings(body) {
    const total = _lpBookings.length;
    _lpUpdateAccordionSummary('bookings', total > 0 ? `(${total})` : '');

    if (total === 0) {
        body.innerHTML = `
            <p style="color:#999; font-size:0.9em;">No bookings yet.</p>
            <button class="btn btn-small btn-primary" onclick="_lpAddBooking()">+ Add Booking</button>
        `;
        return;
    }

    body.innerHTML = `
        <div id="lpBookingList">
            ${_lpBookings.map(b => _lpBookingCard(b)).join('')}
        </div>
        <button class="btn btn-small btn-primary" style="margin-top:8px;" onclick="_lpAddBooking()">+ Add Booking</button>
    `;

    if (typeof Sortable !== 'undefined') {
        const list = document.getElementById('lpBookingList');
        if (list) Sortable.create(list, { animation: 150, handle: '.lp-booking-drag', onEnd: _lpReorderBookings });
    }
}

function _lpBookingCard(b) {
    const ps = LP_PAYMENT_STATUSES[b.paymentStatus] || {};
    const dateStr = b.startDate ? new Date(b.startDate + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
    const endStr = b.multiDay && b.endDate ? ' — ' + new Date(b.endDate + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
    const timeStr = [b.startTime, b.endTime].filter(Boolean).join(' — ');

    return `
        <div class="lp-booking-card card" data-id="${b.id}" id="lpBooking_${b.id}" style="margin-bottom:10px; padding:10px 12px;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <div style="flex:1; min-width:0;">
                    <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                        <span class="lp-booking-drag lp-desktop-only" style="cursor:grab; color:#ccc;">⠿</span>
                        <strong style="cursor:pointer;" onclick="_lpEditBooking('${b.id}')">${_lpEsc(b.name)}</strong>
                        ${b.type ? `<span style="background:#e0e7ff;color:#4338ca;font-size:0.7em;padding:1px 8px;border-radius:10px;">${_lpEsc(b.type)}</span>` : ''}
                        ${ps.label ? `<span style="color:${ps.color};font-size:0.75em;font-weight:600;">${ps.label}</span>` : ''}
                    </div>
                    ${dateStr ? `<div style="color:#666; font-size:0.85em; margin-top:2px;">${dateStr}${endStr}${timeStr ? ` &middot; ${_lpEsc(timeStr)}` : ''}</div>` : ''}
                    ${!_lpIsTravelMode() && b.cost != null && b.cost !== '' ? `<div style="color:#555; font-size:0.85em;">$${Number(b.cost).toFixed(2)}${b.costNote ? ` (${_lpEsc(b.costNote)})` : ''}</div>` : ''}
                </div>
                <div style="display:flex; gap:4px; flex-shrink:0; align-items:center;">
                    <button class="btn btn-small lp-desktop-only" onclick="_lpEditBooking('${b.id}')" title="Edit">✏️</button>
                    <button class="btn btn-small lp-desktop-only" onclick="_lpBookingScreenshots('${b.id}')" title="Screenshots${_lpBookingPhotoCounts[b.id] ? ` (${_lpBookingPhotoCounts[b.id]})` : ''}" style="${_lpBookingPhotoCounts[b.id] ? 'background:#16a34a; color:#fff;' : ''}">📷</button>
                    ${_lpBookingPhotoCounts[b.id] ? `<span class="lp-mobile-only" onclick="_lpBookingScreenshots('${b.id}')" style="background:#16a34a; color:#fff; font-size:0.75em; padding:2px 8px; border-radius:10px; cursor:pointer;">📷 ${_lpBookingPhotoCounts[b.id]}</span>` : ''}
                </div>
            </div>
            ${_lpBookingDetailsHtml(b)}
        </div>
    `;
}

function _lpBookingDetailsHtml(b) {
    const parts = [];
    if (b.confirmation) parts.push(`<strong>Confirmation:</strong> ${_lpEsc(b.confirmation)}`);
    if (b.contact) {
        // If it looks like a phone number, make it a tel: link
        const isPhone = /^[\d\s\+\-\(\)\.]{7,}$/.test(b.contact.trim());
        const contactHtml = isPhone
            ? `<a href="tel:${_lpEsc(b.contact.replace(/\s/g,''))}" style="color:#2563eb;">${_lpEsc(b.contact)}</a>`
            : _lpEsc(b.contact);
        parts.push(`<strong>Contact:</strong> ${contactHtml}`);
    }
    if (b.address) parts.push(`<strong>Address:</strong> <a href="https://maps.google.com/?q=${encodeURIComponent(b.address)}" target="_blank" rel="noopener" style="color:#2563eb;" title="Get directions">${_lpEsc(b.address)}</a>`);
    if (b.link) parts.push(`<strong>Link:</strong> <a href="${_lpEsc(b.link)}" target="_blank" rel="noopener" style="color:#2563eb;">${_lpEsc(b.link)}</a>`);
    if (b.notes) parts.push(`<strong>Notes:</strong> ${_lpEsc(b.notes)}`);
    if (!parts.length) return '';
    return `<div style="margin-top:6px; font-size:0.85em; color:#555; display:grid; gap:2px;">${parts.map(p => `<div>${p}</div>`).join('')}</div>`;
}

// ---------- Booking type dropdown helper ----------

function _lpBookingTypeOptions(selected) {
    const types = _lpCurrentProject.bookingTypes || LP_DEFAULT_BOOKING_TYPES;
    return types.map(t => `<option value="${_lpEsc(t)}" ${t === selected ? 'selected' : ''}>${_lpEsc(t)}</option>`).join('') +
        '<option value="__add_new__">+ Add new type...</option>';
}

// ---------- Booking CRUD ----------

async function _lpAddBooking() {
    _lpShowBookingModal(null);
}

async function _lpEditBooking(bookingId) {
    const b = _lpBookings.find(x => x.id === bookingId);
    if (!b) return;
    _lpShowBookingModal(b);
}

function _lpShowBookingModal(booking) {
    const isEdit = !!booking;
    const b = booking || {};

    // Build modal HTML dynamically in the page
    const page = document.getElementById('page-life-project');
    let modal = document.getElementById('lpBookingModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'lpBookingModal';
        modal.className = 'modal-overlay';
        page.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="modal" style="max-height:85vh; overflow-y:auto;">
            <h3>${isEdit ? 'Edit Booking' : 'New Booking'}</h3>
            <div class="form-group" style="margin-bottom:10px;">
                <label for="lpBkName">Name *</label>
                <input type="text" id="lpBkName" class="form-control" value="${_lpEsc(b.name || '')}" placeholder="e.g. Canyon Lodge">
            </div>
            <div class="form-group" style="margin-bottom:10px;">
                <label for="lpBkType">Type</label>
                <select id="lpBkType" class="form-control" onchange="_lpBookingTypeChange(this)">
                    <option value="">— Select —</option>
                    ${_lpBookingTypeOptions(b.type || '')}
                </select>
            </div>
            <div style="display:flex; gap:10px; margin-bottom:10px;">
                <div class="form-group" style="flex:1;">
                    <label for="lpBkStartDate">Start Date</label>
                    <input type="date" id="lpBkStartDate" class="form-control" value="${b.startDate || ''}">
                </div>
                <div class="form-group" style="flex:1;">
                    <label style="display:flex;align-items:center;gap:6px;">
                        <input type="checkbox" id="lpBkMultiDay" ${b.multiDay ? 'checked' : ''} onchange="document.getElementById('lpBkEndDateWrap').style.display=this.checked?'':'none'"> Multi-day
                    </label>
                    <div id="lpBkEndDateWrap" style="${b.multiDay ? '' : 'display:none;'}">
                        <input type="date" id="lpBkEndDate" class="form-control" value="${b.endDate || ''}">
                    </div>
                </div>
            </div>
            <div style="display:flex; gap:10px; margin-bottom:10px;">
                <div class="form-group" style="flex:1;">
                    <label for="lpBkStartTime">Start Time</label>
                    <input type="text" id="lpBkStartTime" class="form-control" value="${_lpEsc(b.startTime || '')}" placeholder="3:00 PM">
                </div>
                <div class="form-group" style="flex:1;">
                    <label for="lpBkEndTime">End Time</label>
                    <input type="text" id="lpBkEndTime" class="form-control" value="${_lpEsc(b.endTime || '')}" placeholder="5:30 PM">
                </div>
            </div>
            <div class="form-group" style="margin-bottom:10px;">
                <label for="lpBkConfirmation">Confirmation #</label>
                <input type="text" id="lpBkConfirmation" class="form-control" value="${_lpEsc(b.confirmation || '')}">
            </div>
            <div style="display:flex; gap:10px; margin-bottom:10px;">
                <div class="form-group" style="flex:1;">
                    <label for="lpBkCost">Cost</label>
                    <input type="number" id="lpBkCost" class="form-control" step="0.01" value="${b.cost != null ? b.cost : ''}" placeholder="0.00">
                </div>
                <div class="form-group" style="flex:1;">
                    <label for="lpBkCostNote">Cost Note</label>
                    <input type="text" id="lpBkCostNote" class="form-control" value="${_lpEsc(b.costNote || '')}" placeholder="each, total, deposit">
                </div>
            </div>
            <div class="form-group" style="margin-bottom:10px;">
                <label for="lpBkPayment">Payment Status</label>
                <select id="lpBkPayment" class="form-control">
                    <option value="">— None —</option>
                    ${Object.entries(LP_PAYMENT_STATUSES).map(([k, v]) => `<option value="${k}" ${b.paymentStatus === k ? 'selected' : ''}>${v.label}</option>`).join('')}
                </select>
            </div>
            <div class="form-group" style="margin-bottom:10px;">
                <label for="lpBkContact">Contact</label>
                <input type="text" id="lpBkContact" class="form-control" value="${_lpEsc(b.contact || '')}" placeholder="Phone or email">
            </div>
            <div class="form-group" style="margin-bottom:10px;">
                <label for="lpBkAddress">Address</label>
                <input type="text" id="lpBkAddress" class="form-control" value="${_lpEsc(b.address || '')}">
            </div>
            <div class="form-group" style="margin-bottom:10px;">
                <label for="lpBkLink">Link / URL</label>
                <input type="url" id="lpBkLink" class="form-control" value="${_lpEsc(b.link || '')}" placeholder="https://...">
            </div>
            <div class="form-group" style="margin-bottom:10px;">
                <label for="lpBkNotes">Notes</label>
                <textarea id="lpBkNotes" class="form-control" rows="2">${_lpEsc(b.notes || '')}</textarea>
            </div>
            ${isEdit ? `
            <div style="border-top:1px solid #e2e8f0; margin-top:12px; padding-top:12px;">
                <div style="font-weight:600; margin-bottom:8px; font-size:0.95em;">📷 Screenshots</div>
                <div id="lpBkScreenshotSection" style="color:#999; font-size:0.9em;">Loading…</div>
            </div>` : ''}
            <div class="modal-actions" style="border-top:1px solid #e2e8f0; margin-top:16px; padding-top:12px;">
                ${isEdit ? `<button class="btn btn-danger" onclick="closeModal('lpBookingModal');_lpDeleteBooking('${b.id}')" style="margin-right:auto;">Delete</button>` : ''}
                <button class="btn" onclick="closeModal('lpBookingModal')">Cancel</button>
                <button class="btn btn-primary" onclick="_lpSaveBooking('${isEdit ? b.id : ''}')">${isEdit ? 'Save' : 'Create'}</button>
            </div>
        </div>
    `;

    openModal('lpBookingModal');

    // Async-load screenshots section if editing
    if (isEdit) _lpLoadBookingModalScreenshots(b.id);
}

/** Load and render the screenshots section inside the edit booking modal */
async function _lpLoadBookingModalScreenshots(bookingId) {
    const section = document.getElementById('lpBkScreenshotSection');
    if (!section) return;
    try {
        let photos = [];
        try {
            const snap = await lpSub(_lpCurrentProjectId, 'bookingPhotos').where('bookingId', '==', bookingId).orderBy('createdAt', 'desc').get();
            snap.forEach(doc => photos.push({ id: doc.id, ...doc.data() }));
        } catch {
            const snap = await lpSub(_lpCurrentProjectId, 'bookingPhotos').where('bookingId', '==', bookingId).get();
            snap.forEach(doc => photos.push({ id: doc.id, ...doc.data() }));
        }
        _lpRenderBookingModalScreenshots(bookingId, photos);
    } catch (err) {
        if (section) section.innerHTML = '<span style="color:red;">Error loading screenshots.</span>';
    }
}

/** Render thumbnails + add buttons into the edit modal screenshots section */
function _lpRenderBookingModalScreenshots(bookingId, photos) {
    const section = document.getElementById('lpBkScreenshotSection');
    if (!section) return;

    const thumbs = photos.map(ph => `
        <div style="position:relative; padding-bottom:100%; background:#f1f5f9; border-radius:6px; overflow:hidden;">
            <img src="${ph.imageData}" style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover; cursor:pointer;"
                onclick="_lpBkModalViewPhoto('${ph.id}')" alt="Screenshot">
            <button onclick="_lpBkModalDeletePhoto('${bookingId}','${ph.id}')"
                style="position:absolute; top:2px; right:2px; background:rgba(0,0,0,0.55); color:#fff; border:none; border-radius:4px; font-size:0.7em; padding:1px 5px; cursor:pointer;">✕</button>
        </div>`).join('');

    section.innerHTML = `
        ${photos.length > 0
            ? `<div style="display:grid; grid-template-columns:repeat(4,1fr); gap:6px; margin-bottom:10px;">${thumbs}</div>`
            : '<p style="color:#999; font-size:0.85em; margin-bottom:8px;">No screenshots yet.</p>'}
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <label class="btn btn-small btn-primary" style="cursor:pointer;">
                📷 Add Screenshot
                <input type="file" accept="image/*" style="display:none;" onchange="_lpBkModalUpload('${bookingId}', this.files)">
            </label>
            <button class="btn btn-small btn-primary" onclick="_lpBkModalPaste('${bookingId}')">📋 Paste</button>
        </div>`;
}

async function _lpBkModalUpload(bookingId, files) {
    if (!files || !files.length) return;
    try {
        const imageData = await compressImage(files[0]);
        const caption = prompt('Caption (optional):') || '';
        await lpSub(_lpCurrentProjectId, 'bookingPhotos').add({
            bookingId, imageData, caption: caption.trim(),
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        _lpUpdateBookingCameraIcon(bookingId, +1);
        await _lpLoadBookingModalScreenshots(bookingId);
    } catch (err) {
        console.error('Error uploading screenshot:', err);
        alert('Error uploading screenshot.');
    }
}

async function _lpBkModalPaste(bookingId) {
    if (!navigator.clipboard || !navigator.clipboard.read) {
        alert('Clipboard paste is not supported in this browser. Try the Add Screenshot button instead.');
        return;
    }
    try {
        const items = await navigator.clipboard.read();
        let imageBlob = null;
        for (const item of items) {
            const imageType = item.types.find(t => t.startsWith('image/'));
            if (imageType) { imageBlob = await item.getType(imageType); break; }
        }
        if (!imageBlob) { alert('No image on the clipboard.\n\nRight-click a screenshot and choose "Copy image", then click Paste.'); return; }
        const ext = imageBlob.type === 'image/png' ? '.png' : '.jpg';
        const file = new File([imageBlob], 'pasted-screenshot' + ext, { type: imageBlob.type });
        const imageData = await compressImage(file);
        const caption = prompt('Caption (optional):') || '';
        await lpSub(_lpCurrentProjectId, 'bookingPhotos').add({
            bookingId, imageData, caption: caption.trim(),
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        _lpUpdateBookingCameraIcon(bookingId, +1);
        await _lpLoadBookingModalScreenshots(bookingId);
    } catch (err) {
        if (err.name === 'NotAllowedError') alert('Clipboard access was denied. Click "Allow" when the browser asks, then try again.');
        else { console.error('Paste error:', err); alert('Could not read clipboard. Try the Add Screenshot button instead.'); }
    }
}

async function _lpBkModalDeletePhoto(bookingId, photoId) {
    if (!confirm('Delete this screenshot?')) return;
    try {
        await lpSub(_lpCurrentProjectId, 'bookingPhotos').doc(photoId).delete();
        _lpUpdateBookingCameraIcon(bookingId, -1);
        await _lpLoadBookingModalScreenshots(bookingId);
    } catch (err) {
        console.error('Error deleting screenshot:', err);
    }
}

function _lpBkModalViewPhoto(photoId) {
    // Find photo across all booking photos loaded in the screenshot modal, or fetch
    const allPhotos = [];
    document.querySelectorAll('#lpBkScreenshotSection img').forEach(img => {
        // Build minimal objects from rendered thumbnails for lightbox
    });
    // Open standalone lightbox with the image src
    const img = document.querySelector(`#lpBkScreenshotSection img[onclick*="${photoId}"]`);
    if (!img) return;
    const lb = document.createElement('div');
    lb.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.88);z-index:10000;display:flex;align-items:center;justify-content:center;cursor:pointer;';
    lb.onclick = () => document.body.removeChild(lb);
    lb.innerHTML = `<img src="${img.src}" style="max-width:92vw;max-height:90vh;object-fit:contain;border-radius:6px;cursor:default;" onclick="event.stopPropagation()">`;
    document.body.appendChild(lb);
}

function _lpBookingTypeChange(sel) {
    if (sel.value === '__add_new__') {
        const newType = prompt('New booking type:');
        if (newType && newType.trim()) {
            const types = [...(_lpCurrentProject.bookingTypes || LP_DEFAULT_BOOKING_TYPES)];
            if (!types.includes(newType.trim())) {
                types.push(newType.trim());
                _lpCurrentProject.bookingTypes = types;
                lpCol().doc(_lpCurrentProjectId).update({ bookingTypes: types, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
            }
            // Rebuild options and select the new one
            sel.innerHTML = '<option value="">— Select —</option>' + _lpBookingTypeOptions(newType.trim());
        } else {
            sel.value = '';
        }
    }
}

async function _lpSaveBooking(editId) {
    const name = document.getElementById('lpBkName')?.value.trim();
    if (!name) { alert('Name is required.'); return; }

    const costVal = document.getElementById('lpBkCost')?.value;
    const data = {
        name,
        type: document.getElementById('lpBkType')?.value || '',
        startDate: document.getElementById('lpBkStartDate')?.value || '',
        multiDay: document.getElementById('lpBkMultiDay')?.checked || false,
        endDate: document.getElementById('lpBkEndDate')?.value || '',
        startTime: document.getElementById('lpBkStartTime')?.value.trim() || '',
        endTime: document.getElementById('lpBkEndTime')?.value.trim() || '',
        confirmation: document.getElementById('lpBkConfirmation')?.value.trim() || '',
        cost: costVal && !isNaN(Number(costVal)) ? Number(costVal) : null,
        costNote: document.getElementById('lpBkCostNote')?.value.trim() || '',
        paymentStatus: document.getElementById('lpBkPayment')?.value || '',
        contact: document.getElementById('lpBkContact')?.value.trim() || '',
        address: document.getElementById('lpBkAddress')?.value.trim() || '',
        link: document.getElementById('lpBkLink')?.value.trim() || '',
        notes: document.getElementById('lpBkNotes')?.value.trim() || ''
    };

    try {
        if (editId) {
            await lpSub(_lpCurrentProjectId, 'bookings').doc(editId).update(data);
        } else {
            const maxOrder = _lpBookings.reduce((max, b) => Math.max(max, b.sortOrder || 0), -1);
            data.sortOrder = maxOrder + 1;
            await lpSub(_lpCurrentProjectId, 'bookings').add(data);
        }
        closeModal('lpBookingModal');
        await _lpLoadBookings();
        _lpLoadTripInfo();
    } catch (err) {
        console.error('Error saving booking:', err);
        alert('Error saving booking.');
    }
}

async function _lpDeleteBooking(bookingId) {
    if (!confirm('Delete this booking and its screenshots?')) return;
    try {
        // Delete screenshots
        const photoSnap = await lpSub(_lpCurrentProjectId, 'bookingPhotos').where('bookingId', '==', bookingId).get();
        if (!photoSnap.empty) {
            const batch = firebase.firestore().batch();
            photoSnap.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
        }
        await lpSub(_lpCurrentProjectId, 'bookings').doc(bookingId).delete();
        await _lpLoadBookings();
        _lpLoadTripInfo();
    } catch (err) {
        console.error('Error deleting booking:', err);
    }
}

async function _lpReorderBookings(evt) {
    const cards = document.querySelectorAll('#lpBookingList .lp-booking-card');
    const batch = firebase.firestore().batch();
    cards.forEach((el, i) => {
        const id = el.dataset.id;
        batch.update(lpSub(_lpCurrentProjectId, 'bookings').doc(id), { sortOrder: i });
    });
    try {
        await batch.commit();
        const idOrder = Array.from(cards).map(el => el.dataset.id);
        _lpBookings.sort((a, b) => idOrder.indexOf(a.id) - idOrder.indexOf(b.id));
        _lpBookings.forEach((b, i) => b.sortOrder = i);
    } catch (err) {
        console.error('Error reordering bookings:', err);
    }
}

// ---------- Booking Screenshots ----------

async function _lpBookingScreenshots(bookingId) {
    const booking = _lpBookings.find(b => b.id === bookingId);
    if (!booking) return;

    // Load existing screenshots
    let photos = [];
    try {
        const snap = await lpSub(_lpCurrentProjectId, 'bookingPhotos').where('bookingId', '==', bookingId).orderBy('createdAt', 'desc').get();
        snap.forEach(doc => photos.push({ id: doc.id, ...doc.data() }));
    } catch (err) {
        // If index not ready, fallback to unordered
        const snap = await lpSub(_lpCurrentProjectId, 'bookingPhotos').where('bookingId', '==', bookingId).get();
        snap.forEach(doc => photos.push({ id: doc.id, ...doc.data() }));
    }

    const page = document.getElementById('page-life-project');
    let modal = document.getElementById('lpScreenshotModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'lpScreenshotModal';
        modal.className = 'modal-overlay';
        page.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="modal" style="max-height:85vh; overflow-y:auto; max-width:600px;">
            <h3>Screenshots — ${_lpEsc(booking.name)}</h3>
            <div id="lpScreenshotList">
                ${photos.length === 0 ? '<p style="color:#999;">No screenshots yet.</p>' : ''}
                ${photos.map(ph => `
                    <div style="margin-bottom:12px; border:1px solid #e2e8f0; border-radius:8px; overflow:hidden;">
                        <img src="${ph.imageData}" style="width:100%; display:block;" alt="Screenshot">
                        ${ph.caption ? `<div style="padding:6px 10px; font-size:0.85em; color:#555;">${_lpEsc(ph.caption)}</div>` : ''}
                        <div style="padding:4px 10px 8px; text-align:right;">
                            <button class="btn btn-small btn-danger" onclick="_lpDeleteScreenshot('${bookingId}','${ph.id}')">Delete</button>
                        </div>
                    </div>
                `).join('')}
            </div>
            <div style="margin-top:8px; display:flex; gap:8px; flex-wrap:wrap;">
                <label class="btn btn-small btn-primary" style="cursor:pointer;">
                    📷 Add Screenshot
                    <input type="file" accept="image/*" style="display:none;" onchange="_lpUploadScreenshot('${bookingId}', this.files)">
                </label>
                <button class="btn btn-small btn-primary" onclick="_lpPasteScreenshot('${bookingId}')" title="Paste image from clipboard">📋 Paste</button>
            </div>
            <div class="modal-actions" style="margin-top:12px;">
                <button class="btn" onclick="closeModal('lpScreenshotModal')">Close</button>
            </div>
        </div>
    `;

    openModal('lpScreenshotModal');
}

async function _lpUploadScreenshot(bookingId, files) {
    if (!files || !files.length) return;
    try {
        const imageData = await compressImage(files[0]);
        const caption = prompt('Caption (optional):') || '';
        await lpSub(_lpCurrentProjectId, 'bookingPhotos').add({
            bookingId,
            imageData,
            caption: caption.trim(),
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        _lpUpdateBookingCameraIcon(bookingId, +1);
        // Refresh the screenshot modal
        await _lpBookingScreenshots(bookingId);
    } catch (err) {
        console.error('Error uploading screenshot:', err);
        alert('Error uploading screenshot.');
    }
}

async function _lpPasteScreenshot(bookingId) {
    if (!navigator.clipboard || !navigator.clipboard.read) {
        alert('Clipboard paste is not supported in this browser. Try the Add Screenshot button instead.');
        return;
    }
    try {
        const items = await navigator.clipboard.read();
        let imageBlob = null;
        for (const item of items) {
            const imageType = item.types.find(t => t.startsWith('image/'));
            if (imageType) { imageBlob = await item.getType(imageType); break; }
        }
        if (!imageBlob) {
            alert('No image on the clipboard.\n\nRight-click a screenshot and choose "Copy image", then click Paste.');
            return;
        }
        const ext = imageBlob.type === 'image/png' ? '.png' : '.jpg';
        const file = new File([imageBlob], 'pasted-screenshot' + ext, { type: imageBlob.type });
        const imageData = await compressImage(file);
        const caption = prompt('Caption (optional):') || '';
        await lpSub(_lpCurrentProjectId, 'bookingPhotos').add({
            bookingId,
            imageData,
            caption: caption.trim(),
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        _lpUpdateBookingCameraIcon(bookingId, +1);
        await _lpBookingScreenshots(bookingId);
    } catch (err) {
        if (err.name === 'NotAllowedError') {
            alert('Clipboard access was denied. Click "Allow" when the browser asks, then try again.');
        } else {
            console.error('Paste screenshot error:', err);
            alert('Could not read clipboard. Try the Add Screenshot button instead.');
        }
    }
}

async function _lpDeleteScreenshot(bookingId, photoId) {
    if (!confirm('Delete this screenshot?')) return;
    try {
        await lpSub(_lpCurrentProjectId, 'bookingPhotos').doc(photoId).delete();
        _lpUpdateBookingCameraIcon(bookingId, -1);
        await _lpBookingScreenshots(bookingId);
    } catch (err) {
        console.error('Error deleting screenshot:', err);
    }
}

/** Update the camera button and mobile badge on a booking card after add/delete */
function _lpUpdateBookingCameraIcon(bookingId, delta) {
    const prev = _lpBookingPhotoCounts[bookingId] || 0;
    const next = Math.max(0, prev + delta);
    _lpBookingPhotoCounts[bookingId] = next;
    const card = document.getElementById(`lpBooking_${bookingId}`);
    if (!card) return;

    // Desktop camera button
    const btn = card.querySelector('button[title^="Screenshots"]');
    if (btn) {
        btn.style.background = next > 0 ? '#16a34a' : '';
        btn.style.color      = next > 0 ? '#fff'    : '';
        btn.title = next > 0 ? `Screenshots (${next})` : 'Screenshots';
    }

    // Mobile badge — add, update, or remove
    let badge = card.querySelector('.lp-bk-photo-badge');
    if (next > 0) {
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'lp-mobile-only lp-bk-photo-badge';
            badge.style.cssText = 'background:#16a34a;color:#fff;font-size:0.75em;padding:2px 8px;border-radius:10px;cursor:pointer;';
            badge.onclick = () => _lpBookingScreenshots(bookingId);
            card.querySelector('.lp-booking-drag')?.parentElement?.after(badge) ||
                card.querySelector('[style*="flex-shrink:0"]')?.appendChild(badge);
            // Simpler: just append to the button group
            const btnGroup = card.querySelector('[style*="flex-shrink:0"]');
            if (btnGroup && !btnGroup.contains(badge)) btnGroup.appendChild(badge);
        }
        badge.textContent = `📷 ${next}`;
    } else if (badge) {
        badge.remove();
    }
}

// ---------- Booking badge on day items ----------

function _lpBookingBadge(bookingRef) {
    if (!bookingRef) return '';
    const booking = _lpBookings.find(b => b.id === bookingRef);
    if (!booking) return '';
    return `<a href="javascript:void(0)" onclick="event.stopPropagation();document.getElementById('lpBooking_${bookingRef}')?.scrollIntoView({behavior:'smooth',block:'center'})" style="background:#e0e7ff;color:#4338ca;font-size:0.7em;padding:1px 8px;border-radius:10px;text-decoration:none;white-space:nowrap;" title="View booking">🏨 ${_lpEsc(booking.name)}</a>`;
}

// ============================================================
// Packing List Section (Phase 7)
// ============================================================

const LP_PACKING_CATEGORIES = ['Clothes', 'Toiletries', 'Electronics', 'Documents', 'Gear / Other'];

const LP_PACKING_DEFAULTS = {
    'Clothes': ['Underwear','Socks','Jeans / Pants','Shorts','T-shirts','Long sleeve shirts','Light jacket','Heavy coat','Swimsuit / Swim shorts','Hat(s)','Gloves','Comfortable walking shoes','Dress shoes (optional)','Pajamas','Belt'],
    'Toiletries': ['Toothbrush / Toothpaste','Deodorant','Shampoo / Conditioner','Sunscreen','Lip balm','Medications / Prescriptions','First aid basics (band-aids, ibuprofen)','Contact lenses / Solution','Glasses'],
    'Electronics': ['Phone + charger','Camera + charger / batteries','Extra memory cards','Portable battery pack','Headphones / Earbuds','Laptop / Tablet + charger','Power strip','Adapters if international'],
    'Documents': ['Passport','Driver\'s license','Credit cards','Insurance cards','Printed confirmations / Itinerary','Emergency contact info'],
    'Gear / Other': ['Backpack / Day bag','Sunglasses','Umbrella','Reusable water bottle','Snacks','Binoculars','Waterproof bag / Dry bag','Rain jacket / Poncho','Hand warmers (cold weather trips)']
};

let _lpPackingItems = [];

async function _lpLoadPacking() {
    const body = document.getElementById('lpBody_packing');
    if (!body || !_lpCurrentProjectId) return;

    try {
        const snap = await lpSub(_lpCurrentProjectId, 'packingItems').orderBy('sortOrder').get();
        _lpPackingItems = [];
        snap.forEach(doc => _lpPackingItems.push({ id: doc.id, ...doc.data() }));
        _lpRenderPacking(body);
    } catch (err) {
        console.error('Error loading packing list:', err);
        body.innerHTML = '<p style="color:red;">Error loading packing list.</p>';
    }
}

function _lpRenderPacking(body) {
    const total = _lpPackingItems.length;
    const packed = _lpPackingItems.filter(i => i.done).length;
    _lpUpdateAccordionSummary('packing', total > 0 ? `(${packed}/${total} packed)` : '');

    if (total === 0) {
        const isVacation = _lpCurrentProject.template === 'vacation';
        body.innerHTML = `
            <p style="color:#999; font-size:0.9em;">No packing items yet.</p>
            ${isVacation ? `<button class="btn btn-small btn-primary" style="margin-right:8px;" onclick="_lpPopulateDefaultPacking()">Populate Default List</button>` : ''}
            <button class="btn btn-small" onclick="_lpAddPackingItem()">+ Add Item</button>
        `;
        return;
    }

    // Group by category
    const grouped = {};
    LP_PACKING_CATEGORIES.forEach(cat => grouped[cat] = []);
    grouped['Uncategorized'] = [];
    _lpPackingItems.forEach(item => {
        const cat = item.category && grouped[item.category] ? item.category : 'Uncategorized';
        grouped[cat].push(item);
    });

    let html = '';
    for (const [cat, items] of Object.entries(grouped)) {
        if (items.length === 0) continue;
        const catPacked = items.filter(i => i.done).length;
        html += `
            <div style="margin-bottom:12px;">
                <div style="font-weight:600; font-size:0.9em; color:#475569; margin-bottom:4px; border-bottom:1px solid #e2e8f0; padding-bottom:4px;">
                    ${_lpEsc(cat)} <span style="color:#94a3b8; font-weight:400;">(${catPacked}/${items.length})</span>
                </div>
                <div class="lp-packing-group" data-category="${_lpEsc(cat)}">
                    ${items.map(item => _lpPackingItemRow(item)).join('')}
                </div>
            </div>
        `;
    }

    body.innerHTML = `
        ${html}
        <button class="btn btn-small btn-primary" style="margin-top:8px;" onclick="_lpAddPackingItem()">+ Add Item</button>
    `;
}

function _lpPackingItemRow(item) {
    return `
        <div class="lp-packing-item" data-id="${item.id}" style="display:flex; align-items:flex-start; gap:8px; padding:4px 0; border-bottom:1px solid #f8f8f8;">
            <input type="checkbox" ${item.done ? 'checked' : ''} onchange="_lpTogglePackingItem('${item.id}', this.checked)" style="margin-top:3px;">
            <div style="flex:1; min-width:0;">
                <span style="${item.done ? 'text-decoration:line-through; color:#999;' : ''}">${_lpEsc(item.text)}</span>
                ${item.notes ? `<div style="color:#888; font-size:0.8em;">${_lpEsc(item.notes)}</div>` : ''}
            </div>
            <div style="display:flex; gap:2px; flex-shrink:0;">
                <button class="btn btn-small" onclick="_lpEditPackingItem('${item.id}')" title="Edit" style="padding:2px 6px;">✏️</button>
                <button class="btn btn-small btn-danger" onclick="_lpDeletePackingItem('${item.id}')" title="Delete" style="padding:2px 6px;">✕</button>
            </div>
        </div>
    `;
}

async function _lpPopulateDefaultPacking() {
    if (!confirm('Populate the packing list with default items? This will add items to the list.')) return;
    try {
        const batch = firebase.firestore().batch();
        let sortOrder = _lpPackingItems.reduce((max, i) => Math.max(max, i.sortOrder || 0), -1) + 1;
        for (const [cat, items] of Object.entries(LP_PACKING_DEFAULTS)) {
            items.forEach(text => {
                const ref = lpSub(_lpCurrentProjectId, 'packingItems').doc();
                batch.set(ref, { text, done: false, notes: '', category: cat, sortOrder: sortOrder++ });
            });
        }
        await batch.commit();
        await _lpLoadPacking();
    } catch (err) {
        console.error('Error populating packing list:', err);
        alert('Error populating packing list.');
    }
}

async function _lpAddPackingItem() {
    const text = prompt('Packing item:');
    if (!text || !text.trim()) return;
    const category = prompt(`Category (${LP_PACKING_CATEGORIES.join(', ')}):`, 'Gear / Other') || 'Gear / Other';
    const notes = prompt('Notes (optional):') || '';

    const maxOrder = _lpPackingItems.reduce((max, i) => Math.max(max, i.sortOrder || 0), -1);

    try {
        await lpSub(_lpCurrentProjectId, 'packingItems').add({
            text: text.trim(),
            done: false,
            notes: notes.trim(),
            category: category.trim(),
            sortOrder: maxOrder + 1
        });
        await _lpLoadPacking();
    } catch (err) {
        console.error('Error adding packing item:', err);
    }
}

async function _lpTogglePackingItem(itemId, done) {
    try {
        await lpSub(_lpCurrentProjectId, 'packingItems').doc(itemId).update({ done });
        const item = _lpPackingItems.find(i => i.id === itemId);
        if (item) item.done = done;
        const body = document.getElementById('lpBody_packing');
        if (body) _lpRenderPacking(body);
    } catch (err) {
        console.error('Error toggling packing item:', err);
    }
}

async function _lpEditPackingItem(itemId) {
    const item = _lpPackingItems.find(i => i.id === itemId);
    if (!item) return;

    const text = prompt('Packing item:', item.text);
    if (!text || !text.trim()) return;
    const category = prompt(`Category (${LP_PACKING_CATEGORIES.join(', ')}):`, item.category || 'Gear / Other') || 'Gear / Other';
    const notes = prompt('Notes:', item.notes || '') || '';

    try {
        await lpSub(_lpCurrentProjectId, 'packingItems').doc(itemId).update({
            text: text.trim(),
            category: category.trim(),
            notes: notes.trim()
        });
        await _lpLoadPacking();
    } catch (err) {
        console.error('Error editing packing item:', err);
    }
}

async function _lpDeletePackingItem(itemId) {
    if (!confirm('Delete this packing item?')) return;
    try {
        await lpSub(_lpCurrentProjectId, 'packingItems').doc(itemId).delete();
        await _lpLoadPacking();
    } catch (err) {
        console.error('Error deleting packing item:', err);
    }
}

// ============================================================
// Links Section
// ============================================================

function _lpLoadLinks() {
    const body = document.getElementById('lpBody_links');
    if (!body) return;
    const links = (_lpCurrentProject && _lpCurrentProject.links) || [];
    _lpRenderLinks(body, links);
}

function _lpRenderLinks(body, links) {
    _lpUpdateAccordionSummary('links', links.length > 0 ? `(${links.length})` : '');

    if (links.length === 0) {
        body.innerHTML = `
            <p style="color:#999; font-size:0.9em;">No links yet.</p>
            <button class="btn btn-small btn-primary" onclick="_lpOpenLinkModal()">+ Add Link</button>`;
        return;
    }

    const rows = links.map(l => `
        <div style="display:flex; align-items:center; gap:6px; padding:6px 0; border-bottom:1px solid #f0f0f0; flex-wrap:wrap;">
            <a href="${_lpEsc(l.url)}" onclick="event.stopPropagation();window.open(this.href,'_blank');return false;"
               style="color:#2563eb; font-size:0.9em; flex:1; min-width:0; word-break:break-all;">
               🔗 ${_lpEsc(l.label || l.url)}
            </a>
            <div style="display:flex; gap:3px; flex-shrink:0;">
                <button class="btn btn-small" onclick="_lpCopyProjectLink('${_lpEsc(l.url)}',this)" title="Copy link to clipboard" style="padding:2px 6px;">⧉</button>
                <button class="btn btn-small" onclick="_lpOpenLinkModal('${_lpEsc(l.id)}')" title="Edit" style="padding:2px 6px;">✏️</button>
                <button class="btn btn-small btn-danger" onclick="_lpDeleteLink('${_lpEsc(l.id)}')" title="Delete" style="padding:2px 6px;">✕</button>
            </div>
        </div>`).join('');

    body.innerHTML = `
        <div>${rows}</div>
        <button class="btn btn-small btn-primary" style="margin-top:10px;" onclick="_lpOpenLinkModal()">+ Add Link</button>`;
}

function _lpOpenLinkModal(linkId = null) {
    const links = (_lpCurrentProject && _lpCurrentProject.links) || [];
    const existing = linkId ? links.find(l => l.id === linkId) : null;
    document.getElementById('lpLinkModalTitle').textContent = existing ? 'Edit Link' : 'Add Link';
    document.getElementById('lpLinkLabel').value = existing ? (existing.label || '') : '';
    document.getElementById('lpLinkUrl').value   = existing ? (existing.url   || '') : '';
    document.getElementById('lpLinkSaveBtn').dataset.linkId = linkId || '';
    openModal('lpLinkModal');
    setTimeout(() => document.getElementById('lpLinkLabel')?.focus(), 100);
}

async function _lpSaveLink() {
    const label  = document.getElementById('lpLinkLabel').value.trim();
    const url    = document.getElementById('lpLinkUrl').value.trim();
    const linkId = document.getElementById('lpLinkSaveBtn').dataset.linkId;

    if (!url) { alert('URL is required.'); return; }

    const links = [...((_lpCurrentProject && _lpCurrentProject.links) || [])];

    if (linkId) {
        const idx = links.findIndex(l => l.id === linkId);
        if (idx >= 0) links[idx] = { ...links[idx], label, url };
    } else {
        links.push({ id: Date.now().toString(36), label, url });
    }

    closeModal('lpLinkModal');
    try {
        await lpCol().doc(_lpCurrentProjectId).update({ links });
        _lpCurrentProject.links = links;
        const body = document.getElementById('lpBody_links');
        if (body) _lpRenderLinks(body, links);
    } catch (err) {
        console.error('Error saving link:', err);
        alert('Error saving link.');
    }
}

async function _lpDeleteLink(linkId) {
    if (!confirm('Delete this link?')) return;
    const links = ((_lpCurrentProject && _lpCurrentProject.links) || []).filter(l => l.id !== linkId);
    try {
        await lpCol().doc(_lpCurrentProjectId).update({ links });
        _lpCurrentProject.links = links;
        const body = document.getElementById('lpBody_links');
        if (body) _lpRenderLinks(body, links);
    } catch (err) {
        console.error('Error deleting link:', err);
        alert('Error deleting link.');
    }
}

function _lpCopyProjectLink(url, btn) {
    navigator.clipboard.writeText(url).then(() => {
        const orig = btn.textContent;
        btn.textContent = '✓';
        setTimeout(() => { btn.textContent = orig; }, 1500);
    }).catch(() => alert('Could not copy to clipboard.'));
}

// ============================================================
// Project Photos Section
// ============================================================

let _lpProjectPhotos = [];

async function _lpLoadProjectPhotos() {
    const body = document.getElementById('lpBody_photos');
    if (!body || !_lpCurrentProjectId) return;
    body.innerHTML = '<p style="color:#999; font-size:0.9em;">Loading...</p>';

    try {
        const snap = await lpSub(_lpCurrentProjectId, 'projectPhotos').orderBy('createdAt', 'desc').get();
        _lpProjectPhotos = [];
        snap.forEach(doc => _lpProjectPhotos.push({ id: doc.id, ...doc.data() }));
    } catch (err) {
        // Firestore index may not exist yet — fallback to unordered
        try {
            const snap = await lpSub(_lpCurrentProjectId, 'projectPhotos').get();
            _lpProjectPhotos = [];
            snap.forEach(doc => _lpProjectPhotos.push({ id: doc.id, ...doc.data() }));
        } catch (err2) {
            body.innerHTML = '<p style="color:red;">Error loading photos.</p>';
            return;
        }
    }

    _lpUpdateAccordionSummary('photos', _lpProjectPhotos.length > 0 ? `(${_lpProjectPhotos.length})` : '');
    _lpRenderProjectPhotos(body);
}

function _lpRenderProjectPhotos(body) {
    const photos = _lpProjectPhotos;

    body.innerHTML = `
        <div style="display:flex; gap:8px; margin-bottom:12px; flex-wrap:wrap; align-items:center;">
            <label class="btn btn-small btn-primary" style="cursor:pointer;" title="Choose from gallery">
                🖼️ Gallery
                <input type="file" accept="image/*" multiple style="display:none;" onchange="_lpProjHandleFiles(this.files)">
            </label>
            <label class="btn btn-small btn-primary" style="cursor:pointer;" title="Take a photo">
                📷 Camera
                <input type="file" accept="image/*" capture="environment" style="display:none;" onchange="_lpProjHandleFiles(this.files)">
            </label>
            <button class="btn btn-small btn-primary" onclick="_lpProjPaste()" title="Paste from clipboard">📋 Paste</button>
        </div>
        ${photos.length === 0
            ? '<p style="color:#bbb; font-size:0.85em;">No photos yet.</p>'
            : `<div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:8px;">
                ${photos.map(ph => `
                    <div style="position:relative; padding-bottom:100%; background:#f1f5f9; border-radius:6px; overflow:hidden; cursor:pointer;" onclick="_lpProjOpenLightbox('${ph.id}')" title="${_lpEsc(ph.caption || '')}">
                        <img src="${ph.imageData}" style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover;" alt="${_lpEsc(ph.caption || 'Photo')}">
                    </div>
                `).join('')}
               </div>`
        }
    `;
}

async function _lpProjHandleFiles(files) {
    if (!files || !files.length || !_lpCurrentProjectId) return;
    for (const file of Array.from(files)) {
        try {
            // Use crop preview from photos.js if available
            let processedFile = file;
            if (typeof showCropPreview === 'function') {
                try { processedFile = await showCropPreview(file); } catch { return; }
            }
            const imageData = await compressImage(processedFile);
            await _lpProjSavePhoto(imageData);
        } catch (err) {
            console.error('Error processing photo:', err);
            alert('Error processing photo.');
        }
    }
}

async function _lpProjPaste() {
    if (!navigator.clipboard || !navigator.clipboard.read) {
        alert('Clipboard paste is not supported in this browser. Try Gallery instead.');
        return;
    }
    try {
        const items = await navigator.clipboard.read();
        let imageBlob = null;
        for (const item of items) {
            const imageType = item.types.find(t => t.startsWith('image/'));
            if (imageType) { imageBlob = await item.getType(imageType); break; }
        }
        if (!imageBlob) {
            alert('No image on the clipboard.\n\nRight-click an image and choose "Copy image", then click Paste.');
            return;
        }
        const ext = imageBlob.type === 'image/png' ? '.png' : '.jpg';
        const file = new File([imageBlob], 'pasted-image' + ext, { type: imageBlob.type });
        const imageData = await compressImage(file);
        await _lpProjSavePhoto(imageData);
    } catch (err) {
        if (err.name === 'NotAllowedError') {
            alert('Clipboard access was denied. Click "Allow" when the browser asks, then try again.');
        } else {
            console.error('Paste error:', err);
            alert('Could not read clipboard. Try the Gallery button instead.');
        }
    }
}

async function _lpProjSavePhoto(imageData) {
    // Prompt for caption in a small modal
    const caption = await _lpProjCaptionPrompt();
    if (caption === null) return; // cancelled

    try {
        await lpSub(_lpCurrentProjectId, 'projectPhotos').add({
            imageData,
            caption: caption.trim(),
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        await _lpLoadProjectPhotos();
    } catch (err) {
        console.error('Error saving photo:', err);
        alert('Error saving photo.');
    }
}

/**
 * Show a small inline caption prompt modal.
 * Returns the caption string (may be empty), or null if cancelled.
 */
/** Caption prompt for project photos - a thin wrapper over _lpTextPrompt. */
function _lpProjCaptionPrompt() {
    return _lpTextPrompt({ title: 'Add Caption', placeholder: 'Caption (optional)', value: '', okText: 'Save Photo' });
}

/** Small one-field modal. Resolves with the typed string, or null if cancelled. */
function _lpTextPrompt(opts) {
    opts = opts || {};
    return new Promise(resolve => {
        // Build or reuse a lightweight single-input modal
        let modal = document.getElementById('lpProjCaptionModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'lpProjCaptionModal';
            modal.className = 'modal-overlay';
            modal.innerHTML = `
                <div class="modal" style="max-width:360px;">
                    <h3 style="margin:0 0 12px;" id="lpProjCaptionTitle"></h3>
                    <input type="text" id="lpProjCaptionInput" class="form-control" style="width:100%; box-sizing:border-box;">
                    <div class="modal-actions" style="margin-top:12px;">
                        <button class="btn" id="lpProjCaptionCancel">Cancel</button>
                        <button class="btn btn-primary" id="lpProjCaptionOk">Save</button>
                    </div>
                </div>`;
            document.getElementById('page-life-project').appendChild(modal);
        }

        const input = document.getElementById('lpProjCaptionInput');
        const okBtn = document.getElementById('lpProjCaptionOk');
        const cancelBtn = document.getElementById('lpProjCaptionCancel');

        document.getElementById('lpProjCaptionTitle').textContent = opts.title || 'Enter a value';
        input.placeholder = opts.placeholder || '';
        input.value = opts.value || '';
        okBtn.textContent = opts.okText || 'Save';

        const cleanup = () => { modal.classList.remove('open'); okBtn.onclick = null; cancelBtn.onclick = null; };

        okBtn.onclick = () => { cleanup(); resolve(input.value); };
        cancelBtn.onclick = () => { cleanup(); resolve(null); };

        // Enter key submits
        input.onkeydown = (e) => { if (e.key === 'Enter') okBtn.click(); };

        modal.classList.add('open');
        setTimeout(() => { input.focus(); input.select(); }, 50);
    });
}

// ---- Lightbox ----

let _lpLightboxPhotoId = null;

function _lpProjOpenLightbox(photoId) {
    _lpLightboxPhotoId = photoId;
    const photo = _lpProjectPhotos.find(p => p.id === photoId);
    if (!photo) return;

    // Build or reuse lightbox overlay
    let lb = document.getElementById('lpProjLightbox');
    if (!lb) {
        lb = document.createElement('div');
        lb.id = 'lpProjLightbox';
        // Clicking the backdrop closes the lightbox
        lb.onclick = (e) => { if (e.target === lb) _lpProjCloseLightbox(); };
        document.body.appendChild(lb);
    }

    lb.innerHTML = `
        <div onclick="_lpProjCloseLightbox()" style="position:fixed; inset:0; background:rgba(0,0,0,0.88); z-index:9999; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:16px; box-sizing:border-box; cursor:pointer;">
            <div onclick="event.stopPropagation()" style="position:relative; max-width:92vw; max-height:82vh; display:flex; flex-direction:column; align-items:center; gap:10px; cursor:default;">
                <img src="${photo.imageData}" style="max-width:92vw; max-height:74vh; object-fit:contain; border-radius:6px; display:block;" alt="${_lpEsc(photo.caption || 'Photo')}">
                ${photo.caption ? `<div style="color:#e2e8f0; font-size:0.9em; text-align:center;">${_lpEsc(photo.caption)}</div>` : ''}
                <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:center;">
                    <button class="btn btn-small" onclick="_lpProjEditCaption('${photo.id}')" style="background:#475569; color:#fff; border:none;">✏️ Edit Caption</button>
                    <button class="btn btn-small btn-danger" onclick="_lpProjDeletePhoto('${photo.id}')">🗑️ Delete</button>
                    <button class="btn btn-small" onclick="_lpProjCloseLightbox()" style="background:#475569; color:#fff; border:none;">✕ Close</button>
                </div>
            </div>
        </div>
    `;

    lb.style.display = 'block';

    // ESC key closes
    lb._escHandler = (e) => { if (e.key === 'Escape') _lpProjCloseLightbox(); };
    document.addEventListener('keydown', lb._escHandler);
}

function _lpProjCloseLightbox() {
    const lb = document.getElementById('lpProjLightbox');
    if (lb) {
        lb.style.display = 'none';
        if (lb._escHandler) { document.removeEventListener('keydown', lb._escHandler); lb._escHandler = null; }
    }
    _lpLightboxPhotoId = null;
}

async function _lpProjEditCaption(photoId) {
    const photo = _lpProjectPhotos.find(p => p.id === photoId);
    if (!photo) return;

    const newCaption = prompt('Edit caption:', photo.caption || '');
    if (newCaption === null) return; // cancelled

    try {
        await lpSub(_lpCurrentProjectId, 'projectPhotos').doc(photoId).update({ caption: newCaption.trim() });
        photo.caption = newCaption.trim(); // update in-memory
        _lpProjOpenLightbox(photoId);     // re-render lightbox with new caption
        const body = document.getElementById('lpBody_photos');
        if (body) _lpRenderProjectPhotos(body); // refresh thumbnails
    } catch (err) {
        console.error('Error updating caption:', err);
        alert('Error updating caption.');
    }
}

async function _lpProjDeletePhoto(photoId) {
    if (!confirm('Delete this photo?')) return;
    _lpProjCloseLightbox();
    try {
        await lpSub(_lpCurrentProjectId, 'projectPhotos').doc(photoId).delete();
        await _lpLoadProjectPhotos();
    } catch (err) {
        console.error('Error deleting photo:', err);
        alert('Error deleting photo.');
    }
}

// ============================================================
// Notes / Journal Section (Phase 8)
// ============================================================

let _lpNotes = [];

async function _lpLoadNotes() {
    const body = document.getElementById('lpBody_notes');
    if (!body || !_lpCurrentProjectId) return;

    try {
        const snap = await lpSub(_lpCurrentProjectId, 'projectNotes').orderBy('createdAt', 'desc').get();
        _lpNotes = [];
        snap.forEach(doc => _lpNotes.push({ id: doc.id, ...doc.data() }));
        _lpRenderNotes(body);
    } catch (err) {
        console.error('Error loading notes:', err);
        body.innerHTML = '<p style="color:red;">Error loading notes.</p>';
    }
}

function _lpRenderNotes(body) {
    const total = _lpNotes.length;
    _lpUpdateAccordionSummary('notes', total > 0 ? `(${total})` : '');

    if (total === 0) {
        body.innerHTML = `
            <p style="color:#999; font-size:0.9em;">No journal entries yet.</p>
            <button class="btn btn-small btn-primary" onclick="_lpAddNote()">+ Add Entry</button>
        `;
        return;
    }

    body.innerHTML = `
        ${_lpNotes.map(n => _lpNoteCard(n)).join('')}
        <button class="btn btn-small btn-primary" style="margin-top:8px;" onclick="_lpAddNote()">+ Add Entry</button>
    `;
}

function _lpNoteCard(n) {
    const dateStr = n.createdAt ? new Date(n.createdAt.seconds ? n.createdAt.seconds * 1000 : n.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';

    // Render links/facts — URL values become clickable links
    let factsHtml = '';
    if (n.facts && n.facts.length) {
        const factRows = n.facts.filter(f => f.label || f.value).map(f => {
            const isUrl = /^https?:\/\//i.test(f.value);
            if (isUrl) {
                return `<div style="font-size:0.85em;">🔗 <a href="${_lpEsc(f.value)}" onclick="event.stopPropagation();window.open(this.href,'_blank');return false;" style="color:#2563eb;">${_lpEsc(f.label || f.value)}</a></div>`;
            }
            return `<div style="font-size:0.85em;">${f.label ? `<strong>${_lpEsc(f.label)}:</strong> ` : ''}${_lpEsc(f.value)}</div>`;
        });
        if (factRows.length) {
            factsHtml = `<div style="margin-top:8px; padding-top:6px; border-top:1px solid #f0f0f0; display:flex; flex-direction:column; gap:2px;">${factRows.join('')}</div>`;
        }
    }

    return `
        <div class="lp-note-card card" style="margin-bottom:10px; padding:10px 12px;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <div style="flex:1; min-width:0;">
                    ${n.title ? `<strong>${_lpEsc(n.title)}</strong>` : ''}
                    ${dateStr ? `<div style="color:#999; font-size:0.8em;">${dateStr}</div>` : ''}
                </div>
                <div style="display:flex; gap:4px; flex-shrink:0;">
                    <button class="btn btn-small" onclick="_lpEditNote('${n.id}')" title="Edit">✏️</button>
                    <button class="btn btn-small btn-danger" onclick="_lpDeleteNote('${n.id}')" title="Delete">✕</button>
                </div>
            </div>
            ${n.text ? `<div style="margin-top:6px; white-space:pre-wrap; font-size:0.9em; color:#444;">${_lpEsc(n.text)}</div>` : ''}
            ${factsHtml}
        </div>
    `;
}

/** Add a fact/link row to the note modal */
/** Add a fact row to the journal-note modal. A brand-new row opens in edit mode. */
function _lpAddNoteFactRow(label = '', value = '') {
    _lpAppendFactRow('lpNoteFactsContainer', label, value, !label && !value);
}

function _lpAddNote() {
    document.getElementById('lpNoteModalTitle').textContent = 'Add Journal Entry';
    document.getElementById('lpNoteTitle').value = '';
    document.getElementById('lpNoteText').value = '';
    document.getElementById('lpNoteFactsContainer').innerHTML = '';
    document.getElementById('lpNoteSaveBtn').dataset.editId = '';
    openModal('lpNoteModal');
    setTimeout(() => document.getElementById('lpNoteTitle')?.focus(), 100);
}

function _lpEditNote(noteId) {
    const n = _lpNotes.find(x => x.id === noteId);
    if (!n) return;
    document.getElementById('lpNoteModalTitle').textContent = 'Edit Journal Entry';
    document.getElementById('lpNoteTitle').value = n.title || '';
    document.getElementById('lpNoteText').value = n.text || '';
    const container = document.getElementById('lpNoteFactsContainer');
    container.innerHTML = '';
    (n.facts || []).forEach(f => _lpAddNoteFactRow(f.label || '', f.value || ''));
    document.getElementById('lpNoteSaveBtn').dataset.editId = noteId;
    openModal('lpNoteModal');
    setTimeout(() => document.getElementById('lpNoteTitle')?.focus(), 100);
}

async function _lpSaveNoteModal() {
    const title  = document.getElementById('lpNoteTitle').value.trim();
    const text   = document.getElementById('lpNoteText').value.trim();
    const editId = document.getElementById('lpNoteSaveBtn').dataset.editId;

    const facts = _lpCollectFacts('lpNoteFactsContainer');

    closeModal('lpNoteModal');
    try {
        if (editId) {
            await lpSub(_lpCurrentProjectId, 'projectNotes').doc(editId).update({ title, text, facts });
        } else {
            await lpSub(_lpCurrentProjectId, 'projectNotes').add({
                title, text, facts,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                sortOrder: _lpNotes.length
            });
        }
        await _lpLoadNotes();
    } catch (err) {
        console.error('Error saving note:', err);
        alert('Error saving note.');
    }
}

async function _lpDeleteNote(noteId) {
    if (!confirm('Delete this note?')) return;
    try {
        await lpSub(_lpCurrentProjectId, 'projectNotes').doc(noteId).delete();
        await _lpLoadNotes();
    } catch (err) {
        console.error('Error deleting note:', err);
    }
}

// ============================================================
// Search / Filter
// ============================================================

/**
 * Expand all accordion sections (load content if not yet loaded), then filter.
 * Called by pressing Enter in the search box or clicking the Search button.
 */
async function _lpRunSearch() {
    const box = document.getElementById('lpSearchBox');
    const q = (box?.value || '').trim();
    if (!q) { _lpClearSearch(); return; }

    // Show clear button
    const clearBtn = document.getElementById('lpSearchClearBtn');
    if (clearBtn) clearBtn.style.display = '';

    // Expand and load every accordion section that isn't already open
    const allSections = ['tripInfo', 'itinerary', 'planning', 'notes', 'todos',
                         'photos', 'links', 'bookings', 'packing', 'locations',
                         'distances', 'people'];
    const loadPromises = [];
    allSections.forEach(id => {
        const section = document.getElementById(`lpAcc_${id}`);
        const body    = document.getElementById(`lpBody_${id}`);
        const arrow   = document.getElementById(`lpArrow_${id}`);
        if (!section || !body) return; // section may be hidden in travel mode
        if (section.dataset.expanded !== 'true') {
            body.style.display = '';
            if (arrow) arrow.style.transform = 'rotate(90deg)';
            section.dataset.expanded = 'true';
        }
        // Always reload to ensure content is fresh
        loadPromises.push(Promise.resolve(_lpLoadAccordionContent(id)));
    });

    // Also expand all day cards and planning groups
    _lpDayExpanded = new Set(_lpDays.map(d => d.id));
    _lpGroupExpanded = new Set(_lpPlanningGroups.map(g => g.id));

    // Wait a tick for synchronous renders to flush, then filter
    await Promise.allSettled(loadPromises);
    await new Promise(r => setTimeout(r, 150));
    _lpFilterBySearch(q);
}

/** Clear the search, hide Clear button, and restore all hidden elements */
function _lpClearSearch() {
    const box = document.getElementById('lpSearchBox');
    if (box) box.value = '';
    const clearBtn = document.getElementById('lpSearchClearBtn');
    if (clearBtn) clearBtn.style.display = 'none';

    // Restore all hidden items first, then collapse all accordion sections
    _lpFilterBySearch('');

    const allSections = ['tripInfo','itinerary','planning','notes','todos',
                         'photos','links','bookings','packing','locations',
                         'distances','people'];
    allSections.forEach(id => {
        const section = document.getElementById(`lpAcc_${id}`);
        const body    = document.getElementById(`lpBody_${id}`);
        const arrow   = document.getElementById(`lpArrow_${id}`);
        if (!section || !body) return;
        // Only collapse sections that were forcibly opened by the search
        // (Trip Info and Itinerary/Bookings start open — keep them open)
        const defaultOpen = section.dataset.defaultOpen === 'true';
        if (!defaultOpen) {
            body.style.display = 'none';
            if (arrow) arrow.style.transform = '';
            section.dataset.expanded = 'false';
        }
    });
}

function _lpFilterBySearch(query) {
    const q = (query || '').toLowerCase().trim();

    // Helper: does a single element's text match?
    const matches = el => el.textContent.toLowerCase().includes(q);

    // --- Itinerary: filter individual item rows, then hide day card if no match ---
    document.querySelectorAll('.lp-day-card').forEach(card => {
        if (!q) {
            card.style.display = '';
            card.querySelectorAll('.lp-item-row').forEach(r => r.style.display = '');
            return;
        }
        // Check day header (title/date area — everything except item rows)
        const headerText = (card.querySelector('.lp-day-header')?.textContent || '').toLowerCase();
        const headerMatches = headerText.includes(q);

        // Filter individual items
        let visibleItems = 0;
        card.querySelectorAll('.lp-item-row').forEach(row => {
            const show = matches(row);
            row.style.display = show ? '' : 'none';
            if (show) visibleItems++;
        });

        // Show card if header matches OR at least one item matches
        card.style.display = (headerMatches || visibleItems > 0) ? '' : 'none';
    });

    // --- Planning board: filter individual item rows, then hide group if no match ---
    document.querySelectorAll('.lp-planning-group').forEach(group => {
        if (!q) {
            group.style.display = '';
            group.querySelectorAll('.lp-item-row').forEach(r => r.style.display = '');
            return;
        }
        const headerText = (group.querySelector('.lp-group-header')?.textContent || '').toLowerCase();
        const headerMatches = headerText.includes(q);

        let visibleItems = 0;
        group.querySelectorAll('.lp-item-row').forEach(row => {
            const show = matches(row);
            row.style.display = show ? '' : 'none';
            if (show) visibleItems++;
        });

        group.style.display = (headerMatches || visibleItems > 0) ? '' : 'none';
    });

    // --- Booking cards ---
    document.querySelectorAll('.lp-booking-card').forEach(card => {
        if (!q) { card.style.display = ''; return; }
        card.style.display = matches(card) ? '' : 'none';
    });

    // --- To-do items ---
    document.querySelectorAll('.lp-todo-item').forEach(el => {
        if (!q) { el.style.display = ''; return; }
        el.style.display = matches(el) ? '' : 'none';
    });

    // --- Packing items ---
    document.querySelectorAll('.lp-packing-item').forEach(el => {
        if (!q) { el.style.display = ''; return; }
        el.style.display = matches(el) ? '' : 'none';
    });

    // --- Packing groups — hide group if all items hidden ---
    document.querySelectorAll('.lp-packing-group').forEach(group => {
        if (!q) { group.style.display = ''; return; }
        const visible = group.querySelectorAll('.lp-packing-item:not([style*="display: none"])');
        group.style.display = visible.length ? '' : 'none';
    });

    // --- Note cards ---
    document.querySelectorAll('.lp-note-card').forEach(card => {
        if (!q) { card.style.display = ''; return; }
        card.style.display = matches(card) ? '' : 'none';
    });

    // --- Location rows ---
    document.querySelectorAll('.lp-location-row').forEach(row => {
        if (!q) { row.style.display = ''; return; }
        row.style.display = matches(row) ? '' : 'none';
    });

    // --- Distance rows ---
    document.querySelectorAll('.lp-distance-row').forEach(row => {
        if (!q) { row.style.display = ''; return; }
        row.style.display = matches(row) ? '' : 'none';
    });
}

// ============================================================
// Import from JSON
// ============================================================

/** Temporary import state */
let _lpImportData = null;

/** Handle file selection from the hidden input */
function _lpHandleImportFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    event.target.value = ''; // reset so same file can be re-selected

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            if (!data.project || !data.project.title) {
                alert('Invalid import file: missing project data.');
                return;
            }
            _lpImportData = data;
            _lpStartPeopleLinking();
        } catch (err) {
            alert('Error reading file: ' + err.message);
        }
    };
    reader.readAsText(file);
}

/** Start the people-linking step — show modal for each person */
async function _lpStartPeopleLinking() {
    const people = _lpImportData.project.people || [];
    if (people.length === 0) {
        // No people to link — go straight to import
        await _lpExecuteImport();
        return;
    }

    // Load contacts cache
    await _lpEnsurePeopleCache();

    // Walk through each person one at a time
    _lpImportData._linkedPeople = [];
    _lpLinkNextPerson(0);
}

/** Show contact picker for person at index */
function _lpLinkNextPerson(index) {
    const people = _lpImportData.project.people || [];
    if (index >= people.length) {
        // All people processed — apply linked results and import
        closeModal('lpImportPeopleModal');
        _lpImportData.project.people = _lpImportData._linkedPeople;
        _lpExecuteImport();
        return;
    }

    const person = people[index];
    const body = document.getElementById('lpImportPeopleBody');
    body.innerHTML = `
        <p style="margin-bottom:12px;">Person ${index + 1} of ${people.length}: <strong>${_lpEsc(person.name)}</strong></p>
        <p style="font-size:0.9em; color:#666; margin-bottom:8px;">Search contacts to link, or skip to keep unlinked.</p>
        <div class="lc-people-picker-wrap">
            <input type="text" id="lpImportPersonSearch" class="form-control"
                   placeholder="Search contacts…" autocomplete="off">
            <ul class="lc-people-dropdown hidden" id="lpImportPersonDropdown"></ul>
        </div>
        <label style="display:block; margin-top:12px; font-size:0.9em; color:#555;">Notes (optional)</label>
        <textarea id="lpImportPersonNotes" class="form-control" rows="2" placeholder="e.g. travel buddy, meeting there…" style="margin-top:4px;">${_lpEsc(person.notes || '')}</textarea>
        <div style="margin-top:12px; display:flex; gap:8px;">
            <button class="btn" style="flex:1;" onclick="_lpImportSkipPerson(${index})">Don't Link</button>
        </div>
    `;
    openModal('lpImportPeopleModal');

    // Wire search
    const searchEl = document.getElementById('lpImportPersonSearch');
    const dropEl = document.getElementById('lpImportPersonDropdown');

    searchEl.addEventListener('input', function() {
        const q = this.value.trim().toLowerCase();
        if (!q) { dropEl.classList.add('hidden'); dropEl.innerHTML = ''; return; }

        const matches = _lpAllPeople.filter(p => p.name.toLowerCase().includes(q));
        if (matches.length === 0) {
            dropEl.innerHTML = '<li class="lc-people-no-match">No matches</li>';
            dropEl.classList.remove('hidden');
            return;
        }

        dropEl.innerHTML = matches.map(p =>
            `<li data-id="${p.id}" data-name="${_lpEsc(p.name)}">${_lpEsc(p.name)}</li>`
        ).join('');
        dropEl.classList.remove('hidden');

        dropEl.querySelectorAll('li[data-id]').forEach(li => {
            li.addEventListener('click', function() {
                _lpImportSelectPerson(index, li.dataset.id, li.dataset.name);
            });
        });
    });

    // Enter key selects first match
    searchEl.addEventListener('keydown', function(e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const q = this.value.trim().toLowerCase();
        if (!q) return;
        const matches = _lpAllPeople.filter(p => p.name.toLowerCase().includes(q));
        if (matches.length >= 1) {
            _lpImportSelectPerson(index, matches[0].id, matches[0].name);
        }
    });

    // Focus the search input
    setTimeout(() => searchEl.focus(), 100);
}

/** User selected a contact for this person */
function _lpImportSelectPerson(index, contactId, contactName) {
    const notes = (document.getElementById('lpImportPersonNotes')?.value || '').trim();
    _lpImportData._linkedPeople.push({
        name: contactName,
        contactId: contactId,
        notes: notes
    });
    _lpLinkNextPerson(index + 1);
}

/** User chose not to link this person */
function _lpImportSkipPerson(index) {
    const person = _lpImportData.project.people[index];
    const notes = (document.getElementById('lpImportPersonNotes')?.value || '').trim();
    _lpImportData._linkedPeople.push({
        name: person.name,
        contactId: null,
        notes: notes
    });
    _lpLinkNextPerson(index + 1);
}

/** Execute the actual Firestore import after people are linked */
async function _lpExecuteImport() {
    openModal('lpImportProgressModal');
    const prog = document.getElementById('lpImportProgressBody');

    try {
        const d = _lpImportData;
        const p = d.project;

        // 1. Create the project document
        prog.innerHTML = '<p>Creating project…</p>';
        const now = firebase.firestore.FieldValue.serverTimestamp();
        const projectDoc = {
            title: p.title || 'Imported Project',
            description: p.description || '',
            template: p.template || 'vacation',
            status: p.status || 'planning',
            mode: p.mode || 'planning',
            archived: p.archived !== undefined ? p.archived : false,
            startDate: p.startDate || null,
            endDate: p.endDate || null,
            targetType: 'life',
            targetId: null,
            people: p.people || [],
            bookingTypes: p.bookingTypes || [...LP_DEFAULT_BOOKING_TYPES],
            createdAt: now,
            updatedAt: now
        };
        const projectRef = await lpCol().add(projectDoc);
        const projectId = projectRef.id;

        // 2. Import locations — check for existing by name to avoid dupes, build id map
        const locationIdMap = {}; // json_id → { firestoreId, name, address, phone, website, contact, notes }
        if (d.locations && d.locations.length > 0) {
            prog.innerHTML = `<p>Importing ${d.locations.length} locations…</p>`;

            // Fetch existing global locations (for dedup by name)
            const existingSnap = await lpLocationsCol().get();
            const existingByName = {};
            existingSnap.forEach(doc => {
                const n = (doc.data().name || '').trim().toLowerCase();
                if (n) existingByName[n] = { id: doc.id, ...doc.data() };
            });

            const projLocBatch = firebase.firestore().batch();

            for (const loc of d.locations) {
                const nameKey = (loc.name || '').trim().toLowerCase();
                let firestoreId;
                let locData = {
                    name:    loc.name    || '',
                    address: loc.address || '',
                    phone:   loc.phone   || '',
                    website: loc.website || '',
                    contact: loc.contact || '',
                    notes:   loc.notes   || ''
                };

                if (existingByName[nameKey]) {
                    // Reuse existing global location
                    firestoreId = existingByName[nameKey].id;
                    locData = { ...existingByName[nameKey], id: undefined };
                } else {
                    // Create new global location
                    const newRef = await lpLocationsCol().add({
                        ...locData,
                        createdAt: now
                    });
                    firestoreId = newRef.id;
                    existingByName[nameKey] = { id: firestoreId, ...locData };
                }

                locationIdMap[loc.id] = { firestoreId, ...locData };

                // Link to project via projectLocations subcollection
                const projLocRef = lpSub(projectId, 'projectLocations').doc();
                projLocBatch.set(projLocRef, {
                    locationId: firestoreId,
                    name:    locData.name    || '',
                    address: locData.address || '',
                    phone:   locData.phone   || '',
                    website: locData.website || '',
                    contact: locData.contact || '',
                    notes:   locData.notes   || '',
                    addedAt: now
                });

                // Map json_id to the projectLocations doc id for item wiring
                locationIdMap[loc.id].projLocRef = projLocRef.id;
            }

            await projLocBatch.commit();
        }

        // 3. Import distances — map json IDs to global Firestore IDs, skip if pair already exists
        if (d.distances && d.distances.length > 0) {
            prog.innerHTML = `<p>Importing ${d.distances.length} distances…</p>`;

            // Fetch existing distances for dedup
            const existingDistSnap = await lpDistancesCol().get();
            const existingPairs = new Set();
            existingDistSnap.forEach(doc => {
                const { fromLocationId, toLocationId } = doc.data();
                if (fromLocationId && toLocationId) {
                    existingPairs.add(`${fromLocationId}|${toLocationId}`);
                }
            });

            const distBatch = firebase.firestore().batch();
            for (const dist of d.distances) {
                const fromEntry = locationIdMap[dist.fromLocationId];
                const toEntry   = locationIdMap[dist.toLocationId];
                if (!fromEntry || !toEntry) continue; // skip unmapped

                const fromId = fromEntry.firestoreId;
                const toId   = toEntry.firestoreId;
                const pairKey = `${fromId}|${toId}`;
                if (existingPairs.has(pairKey)) continue; // already exists

                const distRef = lpDistancesCol().doc();
                distBatch.set(distRef, {
                    fromLocationId: fromId,
                    toLocationId:   toId,
                    time:   dist.time  || '',
                    miles:  dist.miles != null ? dist.miles : null,
                    mode:   dist.mode  || 'drive',
                    notes:  dist.notes || '',
                    createdAt: now
                });
                existingPairs.add(pairKey);
            }
            await distBatch.commit();
        }

        // 4. Create bookings — track IDs by sortOrder for bookingRef linking
        const bookingIdMap = {}; // confirmation# → Firestore doc ID
        if (d.bookings && d.bookings.length > 0) {
            prog.innerHTML = `<p>Creating ${d.bookings.length} bookings…</p>`;
            const batch = firebase.firestore().batch();
            d.bookings.forEach(b => {
                const ref = lpSub(projectId, 'bookings').doc();
                batch.set(ref, {
                    name: b.name || '',
                    type: b.type || '',
                    startDate: b.startDate || '',
                    multiDay: b.multiDay || false,
                    endDate: b.endDate || '',
                    startTime: b.startTime || '',
                    endTime: b.endTime || '',
                    confirmation: b.confirmation || '',
                    cost: b.cost != null ? b.cost : null,
                    costNote: b.costNote || '',
                    paymentStatus: b.paymentStatus || '',
                    contact: b.contact || '',
                    address: b.address || '',
                    link: b.link || '',
                    notes: b.notes || '',
                    sortOrder: b.sortOrder || 0
                });
                // Map confirmation numbers to doc IDs for bookingRef linking
                if (b.confirmation) {
                    bookingIdMap[b.confirmation] = ref.id;
                }
            });
            await batch.commit();
        }

        // 3. Create days with itinerary items
        if (d.days && d.days.length > 0) {
            prog.innerHTML = `<p>Creating ${d.days.length} days with itinerary…</p>`;
            // May need multiple batches (500 writes max per batch)
            const batch = firebase.firestore().batch();
            d.days.forEach(day => {
                const ref = lpSub(projectId, 'days').doc();
                const items = (day.items || []).map(item => {
                    // Wire up bookingRef if the item has a confirmation that matches a booking
                    let bookingRef = item.bookingRef || null;
                    if (!bookingRef && item.confirmation && bookingIdMap[item.confirmation]) {
                        bookingRef = bookingIdMap[item.confirmation];
                    }
                    // Map json locationId → projectLocations doc id
                    let locationId = null;
                    if (item.locationId && locationIdMap[item.locationId]) {
                        locationId = locationIdMap[item.locationId].projLocRef || null;
                    }
                    return {
                        id: _lpItemId(),
                        title: item.title || '',
                        time: item.time || '',
                        status: item.status || 'idea',
                        cost: item.cost != null ? item.cost : null,
                        costNote: item.costNote || '',
                        notes: item.notes || '',
                        facts: item.facts || [],
                        confirmation: item.confirmation || '',
                        contact: item.contact || '',
                        duration: item.duration || '',
                        bookingRef: bookingRef,
                        locationId: locationId,
                        sortOrder: item.sortOrder || 0,
                        showOnCalendar: item.showOnCalendar || false
                    };
                });
                batch.set(ref, {
                    date: day.date || '',
                    label: day.label || '',
                    location: day.location || '',
                    sortOrder: day.sortOrder || 0,
                    items: items
                });
            });
            await batch.commit();
        }

        // 4. Create to-do items
        if (d.todoItems && d.todoItems.length > 0) {
            prog.innerHTML = `<p>Creating ${d.todoItems.length} to-do items…</p>`;
            const batch = firebase.firestore().batch();
            d.todoItems.forEach(t => {
                const ref = lpSub(projectId, 'todoItems').doc();
                batch.set(ref, {
                    text: t.text || '',
                    done: t.done || false,
                    notes: t.notes || '',
                    sortOrder: t.sortOrder || 0
                });
            });
            await batch.commit();
        }

        // 5. Create packing items
        if (d.packingItems && d.packingItems.length > 0) {
            prog.innerHTML = `<p>Creating ${d.packingItems.length} packing items…</p>`;
            const batch = firebase.firestore().batch();
            d.packingItems.forEach(item => {
                const ref = lpSub(projectId, 'packingItems').doc();
                batch.set(ref, {
                    text: item.text || '',
                    done: item.done || false,
                    notes: item.notes || '',
                    category: item.category || 'Gear / Other',
                    sortOrder: item.sortOrder || 0
                });
            });
            await batch.commit();
        }

        // 6. Create planning groups
        if (d.planningGroups && d.planningGroups.length > 0) {
            prog.innerHTML = `<p>Creating ${d.planningGroups.length} planning groups…</p>`;
            const batch = firebase.firestore().batch();
            d.planningGroups.forEach(g => {
                const ref = lpSub(projectId, 'planningGroups').doc();
                const items = (g.items || []).map(item => {
                    // Map json locationId → projectLocations doc id
                    let locationId = null;
                    if (item.locationId && locationIdMap[item.locationId]) {
                        locationId = locationIdMap[item.locationId].projLocRef || null;
                    }
                    return {
                        id: _lpItemId(),
                        title: item.title || '',
                        time: item.time || '',
                        status: item.status || 'idea',
                        cost: item.cost != null ? item.cost : null,
                        costNote: item.costNote || '',
                        notes: item.notes || '',
                        facts: item.facts || [],
                        confirmation: item.confirmation || '',
                        contact: item.contact || '',
                        duration: item.duration || '',
                        bookingRef: null,
                        locationId: locationId,
                        sortOrder: item.sortOrder || 0,
                        showOnCalendar: false
                    };
                });
                batch.set(ref, {
                    name: g.name || '',
                    sortOrder: g.sortOrder || 0,
                    items: items
                });
            });
            await batch.commit();
        }

        // 7. Create project notes
        if (d.projectNotes && d.projectNotes.length > 0) {
            prog.innerHTML = `<p>Creating ${d.projectNotes.length} notes…</p>`;
            const batch = firebase.firestore().batch();
            d.projectNotes.forEach(n => {
                const ref = lpSub(projectId, 'projectNotes').doc();
                batch.set(ref, {
                    title: n.title || '',
                    text: n.text || '',
                    createdAt: now,
                    sortOrder: n.sortOrder || 0
                });
            });
            await batch.commit();
        }

        // Done!
        _lpImportData = null;
        closeModal('lpImportProgressModal');
        location.hash = '#life-project/' + projectId;

    } catch (err) {
        console.error('Import error:', err);
        prog.innerHTML = `<p style="color:red;">Error: ${err.message}</p>
            <button class="btn" style="margin-top:12px;" onclick="closeModal('lpImportProgressModal')">Close</button>`;
    }
}

// ============================================================
// Utilities
// ============================================================

/** HTML-escape a string */
function _lpEsc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// When the user pastes a combined "lat, lng" pair (e.g. "51.16796, -115.56148")
// into the latitude box, split it and move the longitude into its own box.
// Only fires when a separator is present, so typing a plain latitude is untouched.
function _lpSplitCoordPaste() {
    const latEl = document.getElementById('lpLocLat');
    const lngEl = document.getElementById('lpLocLng');
    if (!latEl || !lngEl) return;
    const val = latEl.value;
    // Accept comma, whitespace, or a mix as the separator between the two numbers.
    const m = val.match(/^\s*(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (m) {
        latEl.value = m[1];
        lngEl.value = m[2];
    }
}

// Build a Google Maps URL for a location. Prefers exact stored coordinates
// (better for lakes, trailheads, and other spots whose address text geocodes
// poorly); falls back to the address text when no coords are stored.
function _lpMapsUrl(loc) {
    if (loc && loc.lat != null && loc.lng != null && loc.lat !== '' && loc.lng !== '') {
        return 'https://maps.google.com/?q=' + encodeURIComponent(loc.lat + ',' + loc.lng);
    }
    return 'https://maps.google.com/?q=' + encodeURIComponent((loc && loc.address) || '');
}

// The 📍 location badge shown on a collapsed item row (planning + itinerary).
// When the location has coordinates or an address it's a Google Maps link
// (coordinate-preferring, same as the Locations list); otherwise a plain label.
// stopPropagation keeps a click from toggling the item's detail panel.
function _lpLocBadge(loc) {
    if (!loc) return '';
    const title = _lpEsc(loc.name) + (loc.address ? '\n' + loc.address : '') + (loc.phone ? '\n' + loc.phone : '');
    const label = '📍 ' + _lpEsc(loc.name);
    const hasCoords = loc.lat != null && loc.lng != null && loc.lat !== '' && loc.lng !== '';
    if (!hasCoords && !loc.address) {
        return `<span title="${title}" style="font-size:0.75em; color:#2563eb; cursor:default; white-space:nowrap;">${label}</span>`;
    }
    return `<a href="${_lpMapsUrl(loc)}" onclick="event.stopPropagation();window.open(this.href,'_blank');return false;" title="${title}\nOpen in Google Maps" style="font-size:0.75em; color:#2563eb; white-space:nowrap; text-decoration:underline;">${label}</a>`;
}
