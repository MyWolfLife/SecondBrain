// ============================================================
// Projects.js — Future Projects CRUD and display logic
// Projects can be attached to plants or zones via targetType/targetId.
// Each project has a title, notes, status (active/completed), and a checklist.
// Checklist items have: text, done, completedAt, notes.
// Completed projects are hidden by default (toggle with checkbox).
// Stored in Firestore collection: "projects"
// ============================================================

// ---------- Load & Display Projects ----------

/**
 * Loads and displays projects for a given target (plant or zone).
 * Completed projects are hidden unless the "show completed" checkbox is checked.
 * @param {string} targetType - "plant" or "zone"
 * @param {string} targetId - The Firestore document ID of the plant or zone.
 * @param {string} containerId - The ID of the container element to render into.
 * @param {string} emptyStateId - The ID of the empty-state message element.
 */
// ---------- Checkbox map for all entity types ----------
var PROJECT_CHECKBOX_MAP = {
    'plant':             'showCompletedPlantProjects',
    'zone':              'showCompletedZoneProjects',
    'floor':             'showCompletedFloorProjects',
    'room':              'showCompletedRoomProjects',
    'thing':             'showCompletedThingProjects',
    'subthing':          'showCompletedSubThingProjects',
    'garageroom':        'showCompletedGarageRoomProjects',
    'garagething':       'showCompletedGarageThingProjects',
    'garagesubthing':    'showCompletedGarageSubThingProjects',
    'structure':         'showCompletedStructureProjects',
    'structurething':    'showCompletedStructureThingProjects',
    'structuresubthing': 'showCompletedStructureSubThingProjects',
    'vehicle':           'showCompletedVehicleProjects',
};

/**
 * Recursively gathers ALL projects for an entity and every descendant.
 * Root entity's projects get sourceLabel=null; descendants get their own name.
 * Uses PROBLEM_CHILD_MAP (defined in problems.js) — same hierarchy applies.
 */
async function _gatherProjects(entityType, entityId, sourceLabel) {
    var items = [];

    var snap = await userCol('projects')
        .where('targetType', '==', entityType)
        .where('targetId',   '==', entityId)
        .get();
    snap.forEach(function(doc) {
        items.push({
            project:     Object.assign({ id: doc.id }, doc.data()),
            targetType:  entityType,
            targetId:    entityId,
            sourceLabel: sourceLabel
        });
    });

    var childDef = PROBLEM_CHILD_MAP[entityType];
    if (childDef) {
        var childSnap = await userCol(childDef.collection)
            .where(childDef.parentField, '==', entityId)
            .get();
        var childPromises = [];
        childSnap.forEach(function(childDoc) {
            var childName = childDoc.data().name || 'Unknown';
            childPromises.push(
                _gatherProjects(childDef.childType, childDoc.id, childName)
                    .then(function(childItems) {
                        childItems.forEach(function(ci) { items.push(ci); });
                    })
            );
        });
        await Promise.all(childPromises);
    }
    return items;
}

/**
 * Load projects for a parent entity AND ALL descendants (recursive roll-up).
 */
async function loadProjectsWithChildren(targetType, targetId, containerId, emptyStateId) {
    var container  = document.getElementById(containerId);
    var emptyState = document.getElementById(emptyStateId);

    var cb = document.getElementById(PROJECT_CHECKBOX_MAP[targetType]);
    var showCompleted = cb ? cb.checked : false;

    // Capture expanded state before clearing
    var expandedIds = {};
    container.querySelectorAll('[data-project-id]').forEach(function(el) {
        if (el.querySelector('.project-body.expanded')) expandedIds[el.dataset.projectId] = true;
    });
    container.innerHTML = '';

    try {
        var allItems = await _gatherProjects(targetType, targetId, null);

        var activeItems    = allItems.filter(function(i) { return i.project.status !== 'completed'; });
        var completedItems = allItems.filter(function(i) { return i.project.status === 'completed'; });

        // Separate own (this entity) from rollup (descendants) within each group
        var ownActive      = activeItems.filter(function(i)    { return i.sourceLabel === null; });
        var rollupActive   = activeItems.filter(function(i)    { return i.sourceLabel !== null; });
        var ownCompleted   = completedItems.filter(function(i) { return i.sourceLabel === null; });
        var rollupCompleted = completedItems.filter(function(i) { return i.sourceLabel !== null; });

        var sortByTitle = function(a, b) { return (a.project.title || '').localeCompare(b.project.title || ''); };
        ownActive.sort(sortByTitle);
        rollupActive.sort(sortByTitle);
        ownCompleted.sort(sortByTitle);
        rollupCompleted.sort(sortByTitle);

        // Build ordered display: own first (active then completed), rollup second
        var displayOwnItems    = showCompleted ? ownActive.concat(ownCompleted)       : ownActive;
        var displayRollupItems = showCompleted ? rollupActive.concat(rollupCompleted) : rollupActive;
        var displayItems       = displayOwnItems.concat(displayRollupItems);

        if (displayItems.length === 0) {
            emptyState.textContent = (completedItems.length > 0)
                ? 'All tasks completed! Check "Show completed" to see them.'
                : 'No quick tasks yet.';
            emptyState.style.display = 'block';
            return;
        }

        emptyState.style.display = 'none';

        function renderItem(item) {
            var card = createProjectCard(item.project, item.targetType, item.targetId, item.sourceLabel);
            if (expandedIds[item.project.id]) {
                var body = card.querySelector('.project-body');
                var chevron = card.querySelector('.project-toggle');
                if (body) body.classList.add('expanded');
                if (chevron) chevron.textContent = '\u25BE';
            }
            container.appendChild(card);
        }

        displayOwnItems.forEach(renderItem);

        // Divider between own tasks and sub-entity rollups
        if (displayOwnItems.length > 0 && displayRollupItems.length > 0) {
            var divider = document.createElement('div');
            divider.className = 'project-rollup-divider';
            divider.textContent = 'From Sub-zones';
            container.appendChild(divider);
        }

        displayRollupItems.forEach(renderItem);

    } catch (err) {
        console.error('loadProjectsWithChildren error:', err);
        emptyState.textContent = 'Error loading quick tasks.';
        emptyState.style.display = 'block';
    }
}

async function loadProjects(targetType, targetId, containerId, emptyStateId) {
    // Types with children use recursive roll-up
    if (PROBLEM_CHILD_MAP[targetType]) {
        return loadProjectsWithChildren(targetType, targetId, containerId, emptyStateId);
    }

    const container = document.getElementById(containerId);
    const emptyState = document.getElementById(emptyStateId);

    // Check if "show completed" checkbox is checked
    const checkboxId = PROJECT_CHECKBOX_MAP[targetType] || 'showCompletedZoneProjects';
    const checkbox = document.getElementById(checkboxId);
    const showCompleted = checkbox ? checkbox.checked : false;

    try {
        const snapshot = await userCol('projects')
            .where('targetType', '==', targetType)
            .where('targetId', '==', targetId)
            .get();

        // Capture which projects are currently expanded before clearing
        var expandedIds = {};
        container.querySelectorAll('[data-project-id]').forEach(function(el) {
            if (el.querySelector('.project-body.expanded')) {
                expandedIds[el.dataset.projectId] = true;
            }
        });

        container.innerHTML = '';

        if (snapshot.empty) {
            emptyState.textContent = 'No quick tasks yet.';
            emptyState.style.display = 'block';
            return;
        }

        // Collect all projects
        const allProjects = [];
        snapshot.forEach(function(doc) {
            allProjects.push({ id: doc.id, ...doc.data() });
        });

        // Separate active and completed
        const activeProjects = allProjects.filter(function(p) {
            return p.status !== 'completed';
        });
        const completedProjects = allProjects.filter(function(p) {
            return p.status === 'completed';
        });

        // Sort each group alphabetically by title
        activeProjects.sort(function(a, b) {
            return (a.title || '').localeCompare(b.title || '');
        });
        completedProjects.sort(function(a, b) {
            return (a.title || '').localeCompare(b.title || '');
        });

        // Build display list: active always shown, completed only if checkbox checked
        const displayProjects = showCompleted
            ? activeProjects.concat(completedProjects)
            : activeProjects;

        if (displayProjects.length === 0) {
            if (completedProjects.length > 0) {
                emptyState.textContent = 'All tasks completed! Check "Show completed" to see them.';
            } else {
                emptyState.textContent = 'No quick tasks yet.';
            }
            emptyState.style.display = 'block';
            return;
        }

        emptyState.style.display = 'none';

        displayProjects.forEach(function(project) {
            const card = createProjectCard(project, targetType, targetId);
            // Restore expanded state if this project was open before reload
            if (expandedIds[project.id]) {
                var body = card.querySelector('.project-body');
                var chevron = card.querySelector('.project-toggle');
                if (body) body.classList.add('expanded');
                if (chevron) chevron.textContent = '\u25BE'; // ▾
            }
            container.appendChild(card);
        });

    } catch (error) {
        console.error('Error loading projects:', error);
        emptyState.textContent = 'Error loading quick tasks.';
        emptyState.style.display = 'block';
    }
}

// ---------- Load All Projects (for My Yard home page) ----------

/**
 * Loads ALL projects across the entire yard and displays them on the home page.
 * Each project card includes a label showing which zone/plant it belongs to.
 */
async function loadAllProjects() {
    var container = document.getElementById('homeProjectsContainer');
    var emptyState = document.getElementById('homeProjectsEmptyState');

    var checkbox = document.getElementById('showCompletedHomeProjects');
    var showCompleted = checkbox ? checkbox.checked : false;

    try {
        var snapshot = await userCol('projects')
            .where('targetType', 'in', ['zone', 'plant', 'weed']).get();

        // Capture which projects are currently expanded before clearing
        var expandedIds = {};
        container.querySelectorAll('[data-project-id]').forEach(function(el) {
            if (el.querySelector('.project-body.expanded')) {
                expandedIds[el.dataset.projectId] = true;
            }
        });

        container.innerHTML = '';

        if (snapshot.empty) {
            emptyState.textContent = 'No quick tasks yet.';
            emptyState.style.display = 'block';
            return;
        }

        var allProjects = [];
        snapshot.forEach(function(doc) {
            allProjects.push({ id: doc.id, ...doc.data() });
        });

        // Separate active and completed
        var activeProjects = allProjects.filter(function(p) { return p.status !== 'completed'; });
        var completedProjects = allProjects.filter(function(p) { return p.status === 'completed'; });

        activeProjects.sort(function(a, b) { return (a.title || '').localeCompare(b.title || ''); });
        completedProjects.sort(function(a, b) { return (a.title || '').localeCompare(b.title || ''); });

        var displayProjects = showCompleted
            ? activeProjects.concat(completedProjects)
            : activeProjects;

        if (displayProjects.length === 0) {
            emptyState.textContent = completedProjects.length > 0
                ? 'All tasks completed! Check "Show completed" to see them.'
                : 'No quick tasks yet.';
            emptyState.style.display = 'block';
            return;
        }

        emptyState.style.display = 'none';

        // Resolve target names for labeling
        var nameCache = {};
        for (var i = 0; i < displayProjects.length; i++) {
            var p = displayProjects[i];
            var cacheKey = p.targetType + ':' + p.targetId;
            if (!nameCache[cacheKey]) {
                try {
                    var collection = p.targetType === 'plant' ? 'plants' : 'zones';
                    var targetDoc = await userCol(collection).doc(p.targetId).get();
                    nameCache[cacheKey] = targetDoc.exists ? targetDoc.data().name : '(unknown)';
                } catch (e) {
                    nameCache[cacheKey] = '(unknown)';
                }
            }
        }

        displayProjects.forEach(function(project) {
            var card = createProjectCard(project, project.targetType, project.targetId);

            // Add a source label at the top of the card
            var sourceLabel = document.createElement('div');
            sourceLabel.className = 'project-source-label';
            var cacheKey = project.targetType + ':' + project.targetId;
            var icon = project.targetType === 'plant' ? '\uD83C\uDF31' : '\uD83D\uDCCD'; // 🌱 or 📍
            sourceLabel.textContent = icon + ' ' + (nameCache[cacheKey] || '(unknown)');
            card.insertBefore(sourceLabel, card.firstChild);

            // Restore expanded state if this project was open before reload
            if (expandedIds[project.id]) {
                var body = card.querySelector('.project-body');
                var chevron = card.querySelector('.project-toggle');
                if (body) body.classList.add('expanded');
                if (chevron) chevron.textContent = '\u25BE'; // ▾
            }

            container.appendChild(card);
        });

    } catch (error) {
        console.error('Error loading all projects:', error);
        emptyState.textContent = 'Error loading quick tasks.';
        emptyState.style.display = 'block';
    }
}

// ---------- Yard Problems Panel + Page ----------

/**
 * Render the single "All Problems" panel card on the Yard home page.
 * Shows an open-problem count; clicking navigates to #yard-problems.
 */
async function renderYardProblemsPanel() {
    var container = document.getElementById('yardProblemsPanelContainer');
    if (!container) return;

    try {
        var snap = await userCol('problems')
            .where('targetType', 'in', ['zone', 'plant', 'weed'])
            .where('status', '==', 'open')
            .get();
        var count = snap.size;

        var card = document.createElement('div');
        card.className = 'card card--clickable';
        var metaText = count === 0
            ? 'No open problems'
            : count + ' open problem' + (count !== 1 ? 's' : '');
        card.innerHTML =
            '<div class="card-main">' +
                '<span class="card-title">Open Problems</span>' +
                '<span class="house-floor-meta"> &middot; ' + escapeHtml(metaText) + '</span>' +
            '</div>' +
            '<span class="card-arrow">›</span>';
        card.addEventListener('click', function() {
            window.location.hash = '#yard-problems';
        });
        container.innerHTML = '';
        container.appendChild(card);
    } catch (err) {
        console.error('renderYardProblemsPanel error:', err);
    }
}

/**
 * Load the Yard Open Problems list page (#yard-problems).
 * Shows all open problems across zones, plants, and weeds.
 * Each card links to the owning entity.
 */
async function loadYardProblemsPage() {
    var container  = document.getElementById('yardProblemsListContainer');
    var emptyState = document.getElementById('yardProblemsListEmpty');
    var bar        = document.getElementById('breadcrumbBar');

    if (!container) return;
    container.innerHTML = '<p class="empty-state">Loading…</p>';
    if (emptyState) emptyState.textContent = '';
    if (bar) bar.innerHTML = '<a href="#zones">Yard</a><span class="separator">&rsaquo;</span><span>Open Problems</span>';

    try {
        var [problemSnap, zoneSnap, plantSnap, weedSnap] = await Promise.all([
            userCol('problems').where('targetType', 'in', ['zone', 'plant', 'weed'])
                               .where('status', '==', 'open').get(),
            userCol('zones').get(),
            userCol('plants').get(),
            userCol('weeds').get()
        ]);

        // Build lookup maps
        var zoneById  = {};
        zoneSnap.forEach(function(d)  { zoneById[d.id]  = d.data(); });
        var plantById = {};
        plantSnap.forEach(function(d) { plantById[d.id] = d.data(); });
        var weedById  = {};
        weedSnap.forEach(function(d)  { weedById[d.id]  = d.data(); });

        // Collect open problems
        var openProblems = [];
        problemSnap.forEach(function(d) { openProblems.push({ id: d.id, data: d.data() }); });

        container.innerHTML = '';

        if (openProblems.length === 0) {
            if (emptyState) emptyState.textContent = 'No open problems — all clear!';
            return;
        }

        openProblems.forEach(function(prob) {
            var data = prob.data;
            var targetName = '';
            if (data.targetType === 'zone') {
                var z = zoneById[data.targetId];
                targetName = z ? (z.name || 'Zone') : 'Zone';
            } else if (data.targetType === 'plant') {
                var pl = plantById[data.targetId];
                targetName = pl ? (pl.name || 'Plant') : 'Plant';
                if (pl && pl.zoneId && zoneById[pl.zoneId]) {
                    targetName = (zoneById[pl.zoneId].name || 'Zone') + ' › ' + targetName;
                }
            } else if (data.targetType === 'weed') {
                var w = weedById[data.targetId];
                targetName = w ? (w.name || 'Weed') : 'Weed';
            }

            var hash = '#' + (data.targetType || 'zone') + '/' + data.targetId;

            var card = document.createElement('div');
            card.className = 'card card--clickable';
            card.innerHTML =
                '<div class="card-main">' +
                    '<span class="card-title">' + escapeHtml(data.description || 'Problem') + '</span>' +
                    (targetName ? '<span class="card-meta">' + escapeHtml(targetName) + '</span>' : '') +
                '</div>' +
                '<span class="card-arrow">›</span>';
            card.addEventListener('click', (function(h) {
                return function() { window.location.hash = h; };
            })(hash));

            container.appendChild(card);
        });

    } catch (err) {
        console.error('loadYardProblemsPage error:', err);
        container.innerHTML = '<p class="empty-state" style="color:var(--danger)">Failed to load problems.</p>';
    }
}

// ---------- Yard Projects Panel + Page ----------

/**
 * Render the single "All Projects" panel card on the Yard home page.
 * Shows a project count; clicking navigates to #yard-projects.
 */
async function renderYardProjectsPanel() {
    var container = document.getElementById('yardProjectsPanelContainer');
    if (!container) return;

    try {
        var snap = await userCol('projects')
            .where('targetType', 'in', ['zone', 'plant', 'weed']).get();
        var count = snap.size;

        var card = document.createElement('div');
        card.className = 'card card--clickable';
        var metaText = count === 0
            ? 'No quick tasks'
            : count + ' quick task' + (count !== 1 ? 's' : '');
        card.innerHTML =
            '<div class="card-main">' +
                '<span class="card-title">All Quick Tasks</span>' +
                '<span class="house-floor-meta"> &middot; ' + escapeHtml(metaText) + '</span>' +
            '</div>' +
            '<span class="card-arrow">›</span>';
        card.addEventListener('click', function() {
            window.location.hash = '#yard-projects';
        });
        container.innerHTML = '';
        container.appendChild(card);
    } catch (err) {
        console.error('renderYardProjectsPanel error:', err);
    }
}

/**
 * Load the Yard All Quick Task Lists page (#yard-projects).
 * Sets the breadcrumb then delegates to loadAllProjects() for rendering.
 */
function loadYardProjectsPage() {
    var bar = document.getElementById('breadcrumbBar');
    if (bar) bar.innerHTML = '<a href="#zones">Yard</a><span class="separator">&rsaquo;</span><span>All Quick Tasks</span>';
    loadAllProjects();
}

// ---------- Yard Checklists Panel ----------

/**
 * Render the "Checklists" panel card in the Yard More section.
 * Shows a count of active (non-completed) runs scoped to the yard context
 * (targetType === 'yard' OR targetType === 'zone').
 * Clicking navigates to #checklists/yard.
 */
async function renderYardChecklistsPanel() {
    var container = document.getElementById('yardChecklistsPanelContainer');
    if (!container) return;

    try {
        // Fetch all active (non-completed) checklist runs and filter to yard context
        var snap = await userCol('checklistRuns').where('completedAt', '==', null).get();
        var count = 0;
        snap.forEach(function(doc) {
            var t = doc.data().targetType;
            if (t === 'yard' || t === 'zone') count++;
        });

        var metaText = count === 0
            ? 'No active checklists'
            : count + ' active checklist' + (count !== 1 ? 's' : '');

        var card = document.createElement('div');
        card.className = 'card card--clickable';
        card.innerHTML =
            '<div class="card-main">' +
                '<span class="card-title">Checklists</span>' +
                '<span class="house-floor-meta"> &middot; ' + escapeHtml(metaText) + '</span>' +
            '</div>' +
            '<span class="card-arrow">›</span>';
        card.addEventListener('click', function() {
            window.location.hash = '#checklists/yard';
        });
        container.innerHTML = '';
        container.appendChild(card);
    } catch (err) {
        console.error('renderYardChecklistsPanel error:', err);
    }
}

// ---------- Create a Project Card Element ----------

/**
 * Creates a DOM element representing a single project with its checklist.
 * Shows completion timestamp for completed projects.
 * Checklist items show completion timestamps and support notes.
 * @param {Object} project - The project data.
 * @param {string} targetType - "plant" or "zone"
 * @param {string} targetId - The target's Firestore document ID.
 * @returns {HTMLElement} The project card element.
 */
function createProjectCard(project, targetType, targetId, sourceLabel) {
    var isCompleted = project.status === 'completed';
    var items = project.items || [];

    var card = document.createElement('div');
    card.className = 'project-card' + (isCompleted ? ' project-completed' : '');
    card.dataset.projectId = project.id;

    // Header row: chevron + title + item count + action buttons
    var header = document.createElement('div');
    header.className = 'project-header';

    var titleArea = document.createElement('div');
    titleArea.className = 'project-title-area';

    // Expand/collapse chevron
    var chevron = document.createElement('span');
    chevron.className = 'project-toggle';
    chevron.textContent = '\u25B8'; // ▸ right-pointing triangle
    chevron.title = 'Expand / Collapse';
    titleArea.appendChild(chevron);

    var title = document.createElement('span');
    title.className = 'project-title';
    title.textContent = project.title;
    titleArea.appendChild(title);

    // Roll-up source label (e.g. "from: Kitchen")
    if (sourceLabel) {
        var fromLabel = document.createElement('span');
        fromLabel.className = 'project-source-label';
        fromLabel.textContent = 'from: ' + sourceLabel;
        titleArea.appendChild(fromLabel);
    }

    // Item count badge (e.g., "2/5")
    if (items.length > 0) {
        var doneCount = items.filter(function(i) { return i.done; }).length;
        var countBadge = document.createElement('span');
        countBadge.className = 'project-item-count';
        countBadge.textContent = doneCount + '/' + items.length;
        titleArea.appendChild(countBadge);
    }

    // Show completion timestamp if completed
    if (isCompleted && project.completedAt) {
        var completedDate = document.createElement('div');
        completedDate.className = 'project-completed-date';
        completedDate.textContent = 'Completed: ' + formatDateTime(project.completedAt);
        titleArea.appendChild(completedDate);
    }

    header.appendChild(titleArea);

    var headerActions = document.createElement('div');
    headerActions.className = 'project-header-actions';

    // Complete / Reopen button
    var toggleBtn = document.createElement('button');
    toggleBtn.className = 'btn btn-small ' + (isCompleted ? 'btn-secondary' : 'btn-primary');
    toggleBtn.textContent = isCompleted ? 'Reopen' : 'Complete';
    toggleBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        toggleProjectStatus(project.id, project.status, targetType, targetId);
    });
    headerActions.appendChild(toggleBtn);

    var editBtn = document.createElement('button');
    editBtn.className = 'btn btn-small btn-secondary';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        openEditProjectModal(project, targetType, targetId);
    });
    headerActions.appendChild(editBtn);

    var deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn-small btn-danger';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        handleDeleteProject(project.id, targetType, targetId);
    });
    headerActions.appendChild(deleteBtn);

    header.appendChild(headerActions);
    card.appendChild(header);

    // Collapsible body: notes + checklist + add-item row
    var body = document.createElement('div');
    body.className = 'project-body';

    // Toggle expand/collapse when clicking header
    header.style.cursor = 'pointer';
    header.addEventListener('click', function() {
        var isExpanded = body.classList.toggle('expanded');
        chevron.textContent = isExpanded ? '\u25BE' : '\u25B8'; // ▾ or ▸
    });

    // Notes (if any)
    if (project.notes) {
        var notes = document.createElement('div');
        notes.className = 'project-notes';
        notes.textContent = project.notes;
        body.appendChild(notes);
    }

    // Checklist items
    if (items.length > 0) {
        var checklist = document.createElement('div');
        checklist.className = 'project-checklist';

        items.forEach(function(item, index) {
            // Wrapper for the item row, notes display, and notes edit area
            var wrapper = document.createElement('div');
            wrapper.className = 'checklist-item-wrapper';

            // Main item row (div, not label, to avoid checkbox toggle on button clicks)
            var row = document.createElement('div');
            row.className = 'checklist-item' + (item.done ? ' checked' : '');

            var checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = item.done;
            checkbox.addEventListener('change', function() {
                toggleChecklistItem(project.id, index, !item.done, targetType, targetId);
            });
            row.appendChild(checkbox);

            // Text + completion timestamp column
            var textCol = document.createElement('div');
            textCol.className = 'checklist-text-col';

            var textSpan = document.createElement('span');
            textSpan.className = 'checklist-text';
            // Render URLs as clickable links that open in a new tab
            if (item.text && (item.text.startsWith('http://') || item.text.startsWith('https://'))) {
                var link = document.createElement('a');
                link.href = item.text;
                link.textContent = item.text;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                textSpan.appendChild(link);
            } else {
                textSpan.textContent = item.text;
            }
            textCol.appendChild(textSpan);

            // Show completion timestamp if item is done
            if (item.done && item.completedAt) {
                var completedStamp = document.createElement('div');
                completedStamp.className = 'checklist-completed-date';
                completedStamp.textContent = formatDateTime(item.completedAt);
                textCol.appendChild(completedStamp);
            }

            // Clicking the text area toggles the checkbox (like a label)
            textCol.style.cursor = 'pointer';
            textCol.addEventListener('click', function() {
                checkbox.click();
            });

            row.appendChild(textCol);

            // Notes toggle button
            var notesBtn = document.createElement('button');
            notesBtn.className = 'checklist-notes-btn' + (item.notes ? ' has-notes' : '');
            notesBtn.textContent = 'Notes';
            notesBtn.title = item.notes ? 'View/edit notes' : 'Add notes';
            notesBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                var editArea = wrapper.querySelector('.checklist-notes-edit');
                if (editArea.style.display === 'none') {
                    editArea.style.display = 'block';
                    editArea.querySelector('textarea').focus();
                } else {
                    editArea.style.display = 'none';
                }
            });
            row.appendChild(notesBtn);

            // Remove button
            var removeBtn = document.createElement('button');
            removeBtn.className = 'checklist-remove';
            removeBtn.textContent = '\u00D7';  // × symbol
            removeBtn.title = 'Remove item';
            removeBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                removeChecklistItem(project.id, index, targetType, targetId);
            });
            row.appendChild(removeBtn);

            wrapper.appendChild(row);

            // Display existing notes below the item (read-only text)
            if (item.notes) {
                var notesDisplay = document.createElement('div');
                notesDisplay.className = 'checklist-item-notes-display';
                notesDisplay.textContent = item.notes;
                wrapper.appendChild(notesDisplay);
            }

            // Notes edit area (hidden by default, shown when Notes button clicked)
            var editArea = document.createElement('div');
            editArea.className = 'checklist-notes-edit';
            editArea.style.display = 'none';

            var textarea = document.createElement('textarea');
            textarea.className = 'checklist-notes-input';
            textarea.placeholder = 'Add notes for this item...';
            textarea.value = item.notes || '';
            textarea.rows = 2;
            editArea.appendChild(textarea);

            var saveNotesBtn = document.createElement('button');
            saveNotesBtn.className = 'btn btn-small btn-primary';
            saveNotesBtn.textContent = 'Save Notes';
            saveNotesBtn.style.marginTop = '4px';
            saveNotesBtn.addEventListener('click', function() {
                var newNotes = textarea.value.trim();
                updateChecklistItemNotes(project.id, index, newNotes, targetType, targetId);
            });
            editArea.appendChild(saveNotesBtn);

            wrapper.appendChild(editArea);

            checklist.appendChild(wrapper);
        });

        body.appendChild(checklist);
    }

    // "Add checklist item" inline form (only for active projects)
    if (!isCompleted) {
        var addItemRow = document.createElement('div');
        addItemRow.className = 'add-checklist-row';

        var addItemInput = document.createElement('input');
        addItemInput.type = 'text';
        addItemInput.className = 'add-checklist-input';
        addItemInput.placeholder = 'Add checklist item...';
        addItemRow.appendChild(addItemInput);

        var addItemBtn = document.createElement('button');
        addItemBtn.className = 'btn btn-small btn-primary';
        addItemBtn.textContent = '+ Add';
        addItemBtn.addEventListener('click', function() {
            var text = addItemInput.value.trim();
            if (text) {
                addChecklistItem(project.id, text, targetType, targetId);
                addItemInput.value = '';
            }
        });
        addItemRow.appendChild(addItemBtn);

        // Allow Enter key to add item
        addItemInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                var text = addItemInput.value.trim();
                if (text) {
                    addChecklistItem(project.id, text, targetType, targetId);
                    addItemInput.value = '';
                }
            }
        });

        body.appendChild(addItemRow);
    }

    card.appendChild(body);
    return card;
}

// ---------- Add Project ----------

/**
 * Opens the add-project modal.
 * @param {string} targetType - "plant" or "zone"
 * @param {string} targetId - The target's Firestore document ID.
 */
function openAddProjectModal(targetType, targetId) {
    var modal = document.getElementById('projectModal');
    var modalTitle = document.getElementById('projectModalTitle');
    var titleInput = document.getElementById('projectTitleInput');
    var notesInput = document.getElementById('projectNotesInput');

    modalTitle.textContent = 'Add Quick Task';
    titleInput.value = '';
    notesInput.value = '';

    modal.dataset.mode = 'add';
    modal.dataset.targetType = targetType;
    modal.dataset.targetId = targetId;

    openModal('projectModal');
    titleInput.focus();
}

// ---------- Edit Project ----------

/**
 * Opens the edit-project modal with existing data.
 * @param {Object} project - The project data (including id).
 * @param {string} targetType - "plant" or "zone"
 * @param {string} targetId - The target's Firestore document ID.
 */
function openEditProjectModal(project, targetType, targetId) {
    var modal = document.getElementById('projectModal');
    var modalTitle = document.getElementById('projectModalTitle');
    var titleInput = document.getElementById('projectTitleInput');
    var notesInput = document.getElementById('projectNotesInput');

    modalTitle.textContent = 'Edit Quick Task';
    titleInput.value = project.title || '';
    notesInput.value = project.notes || '';

    modal.dataset.mode = 'edit';
    modal.dataset.editId = project.id;
    modal.dataset.targetType = targetType;
    modal.dataset.targetId = targetId;

    openModal('projectModal');
    titleInput.focus();
}

// ---------- Save Project (Add or Edit) ----------

/**
 * Handles the save button in the project modal.
 * New projects start with status "active".
 */
async function handleProjectModalSave() {
    var modal = document.getElementById('projectModal');
    var titleInput = document.getElementById('projectTitleInput');
    var notesInput = document.getElementById('projectNotesInput');

    var title = titleInput.value.trim();
    var notes = notesInput.value.trim();

    if (!title) {
        alert('Please enter a title.');
        return;
    }

    var mode = modal.dataset.mode;
    var targetType = modal.dataset.targetType;
    var targetId = modal.dataset.targetId;

    try {
        if (mode === 'add') {
            await userCol('projects').add({
                targetType: targetType,
                targetId: targetId,
                title: title,
                notes: notes,
                items: [],          // Empty checklist to start
                status: 'active',   // New projects start as active
                completedAt: null,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            console.log('Project added:', title);

        } else if (mode === 'edit') {
            var projectId = modal.dataset.editId;
            await userCol('projects').doc(projectId).update({
                title: title,
                notes: notes
            });
            console.log('Project updated:', title);
        }

        closeModal('projectModal');
        reloadProjectsForCurrentTarget(targetType, targetId);

    } catch (error) {
        console.error('Error saving project:', error);
        alert('Error saving quick task. Check console for details.');
    }
}

// ---------- Toggle Project Status (Complete / Reopen) ----------

/**
 * Toggles a project between active and completed.
 * When completing, records a completedAt timestamp.
 * When reopening, clears the completedAt timestamp.
 * @param {string} projectId - The project's Firestore document ID.
 * @param {string} currentStatus - The current status ("active" or "completed").
 * @param {string} targetType - "plant" or "zone"
 * @param {string} targetId - The target's Firestore document ID.
 */
async function toggleProjectStatus(projectId, currentStatus, targetType, targetId) {
    var newStatus = currentStatus === 'completed' ? 'active' : 'completed';

    try {
        var updateData = { status: newStatus };

        if (newStatus === 'completed') {
            updateData.completedAt = new Date().toISOString();
        } else {
            updateData.completedAt = null;
        }

        await userCol('projects').doc(projectId).update(updateData);
        console.log('Project status changed to:', newStatus);
        reloadProjectsForCurrentTarget(targetType, targetId);

    } catch (error) {
        console.error('Error toggling project status:', error);
        alert('Error updating quick task. Check console for details.');
    }
}

// ---------- Checklist Item Operations ----------

/**
 * Adds a new checklist item to a project.
 * Uses read-modify-write to support the full item structure (text, done, notes, completedAt).
 * @param {string} projectId - The project's Firestore document ID.
 * @param {string} text - The checklist item text.
 * @param {string} targetType - "plant" or "zone"
 * @param {string} targetId - The target's Firestore document ID.
 */
async function addChecklistItem(projectId, text, targetType, targetId) {
    try {
        var doc = await userCol('projects').doc(projectId).get();
        if (!doc.exists) return;

        var items = doc.data().items || [];
        items.push({ text: text, done: false, notes: '', completedAt: null });

        await userCol('projects').doc(projectId).update({ items: items });
        console.log('Checklist item added:', text);
        reloadProjectsForCurrentTarget(targetType, targetId);

    } catch (error) {
        console.error('Error adding checklist item:', error);
        alert('Error adding checklist item. Check console for details.');
    }
}

/**
 * Toggles a checklist item's done status and updates the completion timestamp.
 * When checking off, records a completedAt timestamp.
 * When unchecking, clears the completedAt timestamp.
 * @param {string} projectId - The project's Firestore document ID.
 * @param {number} index - The index of the item in the items array.
 * @param {boolean} newDone - The new done state.
 * @param {string} targetType - "plant" or "zone"
 * @param {string} targetId - The target's Firestore document ID.
 */
async function toggleChecklistItem(projectId, index, newDone, targetType, targetId) {
    try {
        var doc = await userCol('projects').doc(projectId).get();
        if (!doc.exists) return;

        var items = doc.data().items || [];
        if (index >= 0 && index < items.length) {
            items[index].done = newDone;
            items[index].completedAt = newDone ? new Date().toISOString() : null;
            await userCol('projects').doc(projectId).update({ items: items });
            console.log('Checklist item toggled:', items[index].text, '->', newDone);
            reloadProjectsForCurrentTarget(targetType, targetId);
        }

    } catch (error) {
        console.error('Error toggling checklist item:', error);
    }
}

/**
 * Updates notes on a specific checklist item.
 * Saves the notes and reloads the project list to reflect changes.
 * @param {string} projectId - The project's Firestore document ID.
 * @param {number} index - The index of the item in the items array.
 * @param {string} notes - The new notes text.
 * @param {string} targetType - "plant" or "zone"
 * @param {string} targetId - The target's Firestore document ID.
 */
async function updateChecklistItemNotes(projectId, index, notes, targetType, targetId) {
    try {
        var doc = await userCol('projects').doc(projectId).get();
        if (!doc.exists) return;

        var items = doc.data().items || [];
        if (index >= 0 && index < items.length) {
            items[index].notes = notes;
            await userCol('projects').doc(projectId).update({ items: items });
            console.log('Checklist item notes updated');
            reloadProjectsForCurrentTarget(targetType, targetId);
        }

    } catch (error) {
        console.error('Error updating checklist item notes:', error);
    }
}

/**
 * Removes a checklist item from a project.
 * @param {string} projectId - The project's Firestore document ID.
 * @param {number} index - The index of the item to remove.
 * @param {string} targetType - "plant" or "zone"
 * @param {string} targetId - The target's Firestore document ID.
 */
async function removeChecklistItem(projectId, index, targetType, targetId) {
    if (!confirm('Remove this checklist item?')) return;

    try {
        var doc = await userCol('projects').doc(projectId).get();
        if (!doc.exists) return;

        var items = doc.data().items || [];
        if (index >= 0 && index < items.length) {
            items.splice(index, 1);
            await userCol('projects').doc(projectId).update({ items: items });
            console.log('Checklist item removed');
            reloadProjectsForCurrentTarget(targetType, targetId);
        }

    } catch (error) {
        console.error('Error removing checklist item:', error);
    }
}

// ---------- Delete Project ----------

/**
 * Deletes an entire project after confirmation.
 * @param {string} projectId - The project's Firestore document ID.
 * @param {string} targetType - "plant" or "zone"
 * @param {string} targetId - The target's Firestore document ID.
 */
async function handleDeleteProject(projectId, targetType, targetId) {
    if (!confirm('Are you sure you want to delete this entire quick task and all its checklist items?')) {
        return;
    }

    try {
        await userCol('projects').doc(projectId).delete();
        console.log('Project deleted:', projectId);
        reloadProjectsForCurrentTarget(targetType, targetId);

    } catch (error) {
        console.error('Error deleting project:', error);
        alert('Error deleting quick task. Check console for details.');
    }
}

// ---------- Load Sub-Zone Projects (Mod 6) ----------

/**
 * Loads projects from all sub-zones and plants within the entire zone hierarchy.
 * Appends them (with source labels) to the zone's project container.
 * Called when the "Include sub-zones" checkbox is checked.
 * @param {string} zoneId - The current zone's Firestore document ID.
 */
async function loadSubZoneProjects(zoneId) {
    var container = document.getElementById('zoneProjectsContainer');
    var emptyState = document.getElementById('zoneProjectsEmptyState');

    var showCompleted = document.getElementById('showCompletedZoneProjects').checked;

    try {
        // Step 1: Get all descendant zone IDs (reuses function from plants.js)
        var allZoneIds = await getDescendantZoneIds(zoneId);
        // Remove the current zone itself — those projects are already loaded
        var subZoneIds = allZoneIds.filter(function(id) { return id !== zoneId; });

        if (subZoneIds.length === 0) {
            // No sub-zones, nothing to add
            return;
        }

        // Step 2: Collect all plant IDs within those sub-zones
        var plantIds = [];
        // Firestore 'in' queries are limited to 30 items; chunk the sub-zone IDs
        for (var i = 0; i < subZoneIds.length; i += 30) {
            var chunk = subZoneIds.slice(i, i + 30);
            var plantSnap = await userCol('plants')
                .where('zoneId', 'in', chunk)
                .get();
            plantSnap.forEach(function(doc) {
                plantIds.push(doc.id);
            });
        }

        // Step 3: Query projects for sub-zones
        var subProjects = [];
        for (var i = 0; i < subZoneIds.length; i += 30) {
            var chunk = subZoneIds.slice(i, i + 30);
            var snap = await userCol('projects')
                .where('targetType', '==', 'zone')
                .where('targetId', 'in', chunk)
                .get();
            snap.forEach(function(doc) {
                subProjects.push({ id: doc.id, ...doc.data() });
            });
        }

        // Step 4: Query projects for plants within sub-zones
        for (var i = 0; i < plantIds.length; i += 30) {
            var chunk = plantIds.slice(i, i + 30);
            var snap = await userCol('projects')
                .where('targetType', '==', 'plant')
                .where('targetId', 'in', chunk)
                .get();
            snap.forEach(function(doc) {
                subProjects.push({ id: doc.id, ...doc.data() });
            });
        }

        if (subProjects.length === 0) return;

        // Step 5: Filter by completed status
        var displayProjects;
        if (showCompleted) {
            displayProjects = subProjects;
        } else {
            displayProjects = subProjects.filter(function(p) { return p.status !== 'completed'; });
        }

        if (displayProjects.length === 0) return;

        // Sort alphabetically by title
        displayProjects.sort(function(a, b) { return (a.title || '').localeCompare(b.title || ''); });

        // Step 6: Resolve names for source labels
        var nameCache = {};
        for (var i = 0; i < displayProjects.length; i++) {
            var p = displayProjects[i];
            var cacheKey = p.targetType + ':' + p.targetId;
            if (!nameCache[cacheKey]) {
                try {
                    var collection = p.targetType === 'plant' ? 'plants' : 'zones';
                    var targetDoc = await userCol(collection).doc(p.targetId).get();
                    nameCache[cacheKey] = targetDoc.exists ? targetDoc.data().name : '(unknown)';
                } catch (e) {
                    nameCache[cacheKey] = '(unknown)';
                }
            }
        }

        // Step 7: Render sub-zone project cards with source labels
        // Hide empty state if we found projects
        emptyState.style.display = 'none';

        displayProjects.forEach(function(project) {
            var card = createProjectCard(project, project.targetType, project.targetId);

            // Add a source label at the top of the card
            var sourceLabel = document.createElement('div');
            sourceLabel.className = 'project-source-label';
            sourceLabel.dataset.subzoneProject = 'true';
            var cacheKey = project.targetType + ':' + project.targetId;
            var icon = project.targetType === 'plant' ? '\uD83C\uDF31' : '\uD83D\uDCCD'; // 🌱 or 📍
            sourceLabel.textContent = icon + ' ' + (nameCache[cacheKey] || '(unknown)');
            card.insertBefore(sourceLabel, card.firstChild);
            card.dataset.subzoneProject = 'true';

            container.appendChild(card);
        });

    } catch (error) {
        console.error('Error loading sub-zone projects:', error);
    }
}

// ---------- Reload Helper ----------

/**
 * Reloads the projects list for the current target.
 * @param {string} targetType - "plant" or "zone"
 * @param {string} targetId - The target's Firestore document ID.
 */
function reloadProjectsForCurrentTarget(targetType, targetId) {
    // Map every targetType to its container, empty-state, and count badge element IDs
    var map = {
        'plant':            ['plantProjectsContainer',              'plantProjectsEmptyState',       'plantTasksAccCount'],
        'zone':             ['zoneProjectsContainer',               'zoneProjectsEmptyState',        'zoneTasksAccCount'],
        'vehicle':          ['vehicleProjectsContainer',            'vehicleProjectsEmptyState',     'vehicleTasksAccCount'],
        'floor':            ['floorProjectsContainer',              'floorProjectsEmptyState',       'floorTasksAccCount'],
        'room':             ['roomProjectsContainer',               'roomProjectsEmptyState',        'roomTasksAccCount'],
        'thing':            ['thingProjectsContainer',              'thingProjectsEmptyState',       'thingTasksAccCount'],
        'subthing':         ['stProjectsContainer',                 'stProjectsEmptyState',          'stTasksAccCount'],
        'garageroom':       ['garageRoomProjectsContainer',         'garageRoomProjectsEmpty',       'garageRoomTasksAccCount'],
        'garagething':      ['garageThingProjectsContainer',        'garageThingProjectsEmpty',      'garageThingTasksAccCount'],
        'garagesubthing':   ['garageSubThingProjectsContainer',     'garageSubThingProjectsEmpty',   'garageSubThingTasksAccCount'],
        'structure':        ['structureProjectsContainer',          'structureProjectsEmpty',        'structureTasksAccCount'],
        'structurething':   ['structureThingProjectsContainer',     'structureThingProjectsEmpty',   'structureThingTasksAccCount'],
        'structuresubthing':['structureSubThingProjectsContainer',  'structureSubThingProjectsEmpty','structureSubThingTasksAccCount'],
    };

    var ids = map[targetType];
    if (ids) {
        loadProjects(targetType, targetId, ids[0], ids[1])
            .then(function() {
                if (ids[2] && typeof _setDetailAccCount === 'function') {
                    _setDetailAccCount(ids[2], ids[0]);
                }
            });
    }

    // Also refresh yard projects page if it's currently visible
    var yardProjectsPage = document.getElementById('page-yard-projects');
    if (yardProjectsPage && !yardProjectsPage.classList.contains('hidden')) {
        loadAllProjects();
    }
}

// ---------- Event Listeners ----------

document.addEventListener('DOMContentLoaded', function() {

    // "Add Project" buttons (plant and zone detail pages)
    document.getElementById('addPlantProjectBtn').addEventListener('click', function() {
        if (window.currentPlant) {
            openAddProjectModal('plant', window.currentPlant.id);
        }
    });

    document.getElementById('addZoneProjectBtn').addEventListener('click', function() {
        if (window.currentZone) {
            openAddProjectModal('zone', window.currentZone.id);
        }
    });

    // "Show completed" checkboxes — reload projects list when toggled
    document.getElementById('showCompletedZoneProjects').addEventListener('change', function() {
        if (window.currentZone) {
            loadProjects('zone', window.currentZone.id, 'zoneProjectsContainer', 'zoneProjectsEmptyState');
            // Re-apply sub-zone projects if that checkbox is checked
            var subCheckbox = document.getElementById('showSubZoneProjects');
            if (subCheckbox && subCheckbox.checked) {
                // Small delay to let the zone's own projects load first
                setTimeout(function() {
                    loadSubZoneProjects(window.currentZone.id);
                }, 300);
            }
        }
    });

    // "Include sub-zones" checkbox — load or remove sub-zone projects
    document.getElementById('showSubZoneProjects').addEventListener('change', function() {
        if (!window.currentZone) return;
        if (this.checked) {
            loadSubZoneProjects(window.currentZone.id);
        } else {
            // Remove sub-zone project cards and reload just the zone's own projects
            loadProjects('zone', window.currentZone.id, 'zoneProjectsContainer', 'zoneProjectsEmptyState');
        }
    });

    document.getElementById('showCompletedPlantProjects').addEventListener('change', function() {
        if (window.currentPlant) {
            loadProjects('plant', window.currentPlant.id, 'plantProjectsContainer', 'plantProjectsEmptyState');
        }
    });

    // "Show completed" checkbox for home page (All Projects)
    document.getElementById('showCompletedHomeProjects').addEventListener('change', function() {
        loadAllProjects();
    });

    // Project modal — voice-to-text on the Notes textarea
    if (typeof initVoiceToText === 'function') {
        initVoiceToText('projectNotesInput', 'projectNotesVoiceBtn');
    }

    // Project modal — Save buttons (bottom and top)
    document.getElementById('projectModalSaveBtn').addEventListener('click', handleProjectModalSave);
    document.getElementById('projectModalSaveBtnTop').addEventListener('click', handleProjectModalSave);

    // Project modal — Cancel buttons (bottom and top)
    document.getElementById('projectModalCancelBtn').addEventListener('click', function() {
        closeModal('projectModal');
    });
    document.getElementById('projectModalCancelBtnTop').addEventListener('click', function() {
        closeModal('projectModal');
    });

    // Project modal — Close on overlay click
    document.getElementById('projectModal').addEventListener('click', function(e) {
        if (e.target === this) closeModal('projectModal');
    });
});
