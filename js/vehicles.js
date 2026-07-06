// ============================================================
// vehicles.js — Vehicles Feature
// Handles the vehicle list page (#vehicles) and the vehicle
// detail page (#vehicle/:id), including:
//   - Vehicle CRUD (add, edit via inline info form, archive/unarchive)
//   - Mileage log (add / delete entries)
//   - Cross-entity sections wired via targetType:'vehicle':
//       photos, activities, calendar events, problems, facts, projects
// ============================================================

// ---- State ----
/** The vehicle document currently being viewed on the detail page. */
window.currentVehicle = null;

// ============================================================
// VEHICLE LIST PAGE  (#vehicles)
// Lists all active (non-archived) vehicles as cards.
// ============================================================

/**
 * Load and render the vehicle list page.
 * Fetches all non-archived vehicles and renders them as cards.
 * Called by app.js when routing to #vehicles.
 */
function loadVehiclesPage() {
    var container  = document.getElementById('vehiclesList');
    var archived   = document.getElementById('archivedVehiclesList');
    var toggle     = document.getElementById('showArchivedToggle');

    container.innerHTML = '<p class="empty-state">Loading&hellip;</p>';

    // Breadcrumb: House › Vehicles
    var bar = document.getElementById('breadcrumbBar');
    if (bar) bar.innerHTML = '<a href="#house">House</a><span class="separator">&rsaquo;</span><span>Vehicles</span>';
    if (archived) archived.innerHTML = '';

    // Reset the archived toggle so it doesn't stay checked between navigations
    if (toggle) toggle.checked = false;
    if (archived) archived.classList.add('hidden');

    // Wire up the "Add Vehicle" button
    var addBtn = document.getElementById('addVehicleBtn');
    if (addBtn) {
        // Remove any prior listener by replacing with a clone
        var newAddBtn = addBtn.cloneNode(true);
        addBtn.parentNode.replaceChild(newAddBtn, addBtn);
        newAddBtn.addEventListener('click', openAddVehicleModal);
    }

    // Wire up the "Show Archived" toggle
    if (toggle) {
        var newToggle = toggle.cloneNode(true);
        toggle.parentNode.replaceChild(newToggle, toggle);
        newToggle.addEventListener('change', function() {
            if (this.checked) {
                loadArchivedVehicles();
                document.getElementById('archivedVehiclesList').classList.remove('hidden');
            } else {
                document.getElementById('archivedVehiclesList').classList.add('hidden');
                document.getElementById('archivedVehiclesList').innerHTML = '';
            }
        });
    }

    userCol('vehicles')
        .where('archived', '==', false)
        .get()
        .then(function(snapshot) {
            container.innerHTML = '';

            if (snapshot.empty) {
                container.innerHTML = '<p class="empty-state">No vehicles yet. Click &ldquo;+ Add Vehicle&rdquo; to add one.</p>';
                return;
            }

            // Sort client-side by createdAt ascending (oldest first)
            var docs = [];
            snapshot.forEach(function(doc) { docs.push(doc); });
            docs.sort(function(a, b) {
                var ta = a.data().createdAt ? a.data().createdAt.toMillis() : 0;
                var tb = b.data().createdAt ? b.data().createdAt.toMillis() : 0;
                return ta - tb;
            });

            docs.forEach(function(doc) {
                container.appendChild(buildVehicleCard(doc.id, doc.data(), false));
            });
        })
        .catch(function(err) {
            console.error('loadVehiclesPage error:', err);
            container.innerHTML = '<p class="empty-state">Error loading vehicles.</p>';
        });
}

/**
 * Load archived vehicles and render them in the archived section.
 * Called when the user enables the "Show Archived" toggle.
 */
function loadArchivedVehicles() {
    var container = document.getElementById('archivedVehiclesList');
    container.innerHTML = '<p class="empty-state">Loading&hellip;</p>';

    userCol('vehicles')
        .where('archived', '==', true)
        .get()
        .then(function(snapshot) {
            container.innerHTML = '';

            if (snapshot.empty) {
                container.innerHTML = '<p class="empty-state">No archived vehicles.</p>';
                return;
            }

            var heading = document.createElement('h3');
            heading.className = 'section-heading';
            heading.style.marginTop = '8px';
            heading.textContent = 'Archived Vehicles';
            container.appendChild(heading);

            var docs = [];
            snapshot.forEach(function(doc) { docs.push(doc); });
            docs.sort(function(a, b) {
                var ta = a.data().createdAt ? a.data().createdAt.toMillis() : 0;
                var tb = b.data().createdAt ? b.data().createdAt.toMillis() : 0;
                return ta - tb;
            });

            docs.forEach(function(doc) {
                container.appendChild(buildVehicleCard(doc.id, doc.data(), true));
            });
        })
        .catch(function(err) {
            console.error('loadArchivedVehicles error:', err);
            container.innerHTML = '<p class="empty-state">Error loading archived vehicles.</p>';
        });
}

/**
 * Build a clickable card element for a vehicle.
 * @param {string}  id        - Firestore document ID
 * @param {object}  data      - Vehicle document data
 * @param {boolean} archived  - Whether to apply the archived (grayed-out) style
 * @returns {HTMLElement}
 */
function buildVehicleCard(id, data, archived) {
    var card = document.createElement('div');
    card.className = 'vehicle-card' + (archived ? ' vehicle-archived' : '');

    // Title: "2021 Toyota Tacoma" — year + make + model
    var titleParts = [data.year, data.make, data.model].filter(Boolean);
    var title = titleParts.length > 0 ? titleParts.join(' ') : 'Unnamed Vehicle';

    // Subtitle: color, license plate
    var subtitleParts = [];
    if (data.color)        subtitleParts.push(data.color);
    if (data.licensePlate) subtitleParts.push('Plate: ' + data.licensePlate);
    var subtitle = subtitleParts.join('  \u00b7  ');

    card.innerHTML =
        (data.profilePhotoData ? '<img class="entity-card-thumb" alt="">' : '') +
        '<div class="card-main">' +
            '<span class="vehicle-card-title">' + escapeHtml(title) + '</span>' +
            (subtitle ? '<span class="vehicle-card-subtitle">' + escapeHtml(subtitle) + '</span>' : '') +
        '</div>' +
        '<span class="card-arrow">\u203a</span>';

    // Set src via DOM (avoids any base64 content concerns with innerHTML)
    if (data.profilePhotoData) {
        card.querySelector('.entity-card-thumb').src = data.profilePhotoData;
    }

    card.addEventListener('click', function() {
        window.location.hash = '#vehicle/' + id;
    });

    return card;
}

// ============================================================
// ADD VEHICLE MODAL
// ============================================================

/**
 * Open the Add Vehicle modal in "add" mode.
 */
function openAddVehicleModal() {
    var modal = document.getElementById('vehicleModal');
    if (!modal) return;

    // Clear all fields
    document.getElementById('vehicleModalYear').value         = '';
    document.getElementById('vehicleModalMake').value         = '';
    document.getElementById('vehicleModalModel').value        = '';
    document.getElementById('vehicleModalTrim').value         = '';
    document.getElementById('vehicleModalColor').value        = '';
    document.getElementById('vehicleModalVin').value          = '';
    document.getElementById('vehicleModalLicensePlate').value = '';
    document.getElementById('vehicleModalPurchaseDate').value = '';
    document.getElementById('vehicleModalPurchasePrice').value= '';
    document.getElementById('vehicleModalNotes').value        = '';

    modal.dataset.mode   = 'add';
    modal.dataset.editId = '';

    openModal('vehicleModal');
    document.getElementById('vehicleModalYear').focus();
}

/**
 * Save handler for the Add Vehicle modal.
 * Validates required fields, then writes to Firestore.
 */
function handleVehicleModalSave() {
    var modal = document.getElementById('vehicleModal');
    var year  = document.getElementById('vehicleModalYear').value.trim();
    var make  = document.getElementById('vehicleModalMake').value.trim();
    var model = document.getElementById('vehicleModalModel').value.trim();

    if (!year)  { alert('Year is required.'); return; }
    if (!make)  { alert('Make is required.'); return; }
    if (!model) { alert('Model is required.'); return; }

    var data = {
        year:          year,
        make:          make,
        model:         model,
        trim:          document.getElementById('vehicleModalTrim').value.trim()         || '',
        color:         document.getElementById('vehicleModalColor').value.trim()        || '',
        vin:           document.getElementById('vehicleModalVin').value.trim()          || '',
        licensePlate:  document.getElementById('vehicleModalLicensePlate').value.trim() || '',
        purchaseDate:  document.getElementById('vehicleModalPurchaseDate').value.trim() || '',
        purchasePrice: document.getElementById('vehicleModalPurchasePrice').value.trim()|| '',
        notes:         document.getElementById('vehicleModalNotes').value.trim()        || '',
        archived:  false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    userCol('vehicles').add(data)
        .then(function(docRef) {
            closeModal('vehicleModal');
            // Navigate straight to the new vehicle's detail page
            window.location.hash = '#vehicle/' + docRef.id;
        })
        .catch(function(err) {
            console.error('Add vehicle error:', err);
            alert('Error saving vehicle. Please try again.');
        });
}

// Wire the Save / Cancel buttons (DOM is ready when this script runs)
document.getElementById('vehicleModalSaveBtn').addEventListener('click', handleVehicleModalSave);
document.getElementById('vehicleModalCancelBtn').addEventListener('click', function() {
    closeModal('vehicleModal');
});

// ============================================================
// VEHICLE DETAIL PAGE  (#vehicle/:id)
// ============================================================

/**
 * Load the vehicle detail page.
 * Fetches the vehicle document, stores it in window.currentVehicle,
 * then renders all sections.
 * Called by app.js when routing to #vehicle/{id}.
 * @param {string} vehicleId - Firestore document ID of the vehicle
 */
function loadVehiclePage(vehicleId) {
    userCol('vehicles').doc(vehicleId).get()
        .then(function(doc) {
            if (!doc.exists) {
                // Vehicle not found — go back to list
                window.location.hash = '#vehicles';
                return;
            }

            window.currentVehicle = Object.assign({ id: doc.id }, doc.data());
            renderVehicleDetail(window.currentVehicle);
        })
        .catch(function(err) {
            console.error('loadVehiclePage error:', err);
            window.location.hash = '#vehicles';
        });
}

/**
 * Render all sections of the vehicle detail page.
 * @param {object} vehicle - The vehicle document with id + all fields
 */
function renderVehicleDetail(vehicle) {
    // ---- Page title ----
    var titleParts = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean);
    var title = titleParts.length > 0 ? titleParts.join(' ') : 'Vehicle';
    document.getElementById('vehicleDetailTitle').textContent = title;

    // ---- Breadcrumb ----
    var crumb = document.getElementById('breadcrumbBar');
    if (crumb) {
        crumb.innerHTML =
            '<a href="#house">House</a>' +
            '<span class="separator">&rsaquo;</span>' +
            '<a href="#vehicles">Vehicles</a>' +
            '<span class="separator">&rsaquo;</span>' +
            '<span>' + escapeHtml(title) + '</span>';
    }

    // ---- Archive banner ----
    var banner = document.getElementById('vehicleArchiveBanner');
    if (vehicle.archived) {
        var bannerText = 'Archived';
        if (vehicle.archivedReason) bannerText += ' \u2014 ' + vehicle.archivedReason;
        if (vehicle.archivedAt) {
            var archivedDate = vehicle.archivedAt.toDate
                ? vehicle.archivedAt.toDate().toLocaleDateString()
                : '';
            if (archivedDate) bannerText += ' on ' + archivedDate;
        }
        document.getElementById('vehicleArchiveBannerText').textContent = bannerText;
        banner.classList.remove('hidden');
    } else {
        banner.classList.add('hidden');
    }

    // ---- Info fields ----
    document.getElementById('vehicleInfoYear').value         = vehicle.year          || '';
    document.getElementById('vehicleInfoMake').value         = vehicle.make          || '';
    document.getElementById('vehicleInfoModel').value        = vehicle.model         || '';
    document.getElementById('vehicleInfoTrim').value         = vehicle.trim          || '';
    document.getElementById('vehicleInfoColor').value        = vehicle.color         || '';
    document.getElementById('vehicleInfoVin').value          = vehicle.vin           || '';
    document.getElementById('vehicleInfoLicensePlate').value = vehicle.licensePlate  || '';
    document.getElementById('vehicleInfoPurchaseDate').value = vehicle.purchaseDate  || '';
    document.getElementById('vehicleInfoPurchasePrice').value= vehicle.purchasePrice || '';
    document.getElementById('vehicleInfoNotes').value        = vehicle.notes         || '';

    // ---- Archive / Unarchive buttons ----
    var archiveBtn   = document.getElementById('vehicleArchiveBtn');
    var unarchiveBtn = document.getElementById('vehicleUnarchiveBtn');
    if (vehicle.archived) {
        if (archiveBtn)   archiveBtn.classList.add('hidden');
        if (unarchiveBtn) unarchiveBtn.classList.remove('hidden');
    } else {
        if (archiveBtn)   archiveBtn.classList.remove('hidden');
        if (unarchiveBtn) unarchiveBtn.classList.add('hidden');
    }

    // ---- Load mileage log ----
    loadMileageLog(vehicle.id);

    // ---- Load cross-entity sections ----
    loadPhotos('vehicle', vehicle.id, 'vehiclePhotoContainer', 'vehiclePhotoEmptyState')
        .then(function() { _setPhotoAccCount('vehiclePhotosAccCount', 'vehicle'); });
    loadActivities('vehicle', vehicle.id, 'vehicleActivitiesContainer', 'vehicleActivitiesEmptyState')
        .then(function() { _setDetailAccCount('vehicleActivityAccCount', 'vehicleActivitiesContainer'); });
    loadProblems('vehicle', vehicle.id, 'vehicleProblemsContainer', 'vehicleProblemsEmptyState')
        .then(function() { _setDetailAccCount('vehicleProblemsAccCount', 'vehicleProblemsContainer'); });
    loadFacts('vehicle', vehicle.id, 'vehicleFactsContainer', 'vehicleFactsEmptyState')
        .then(function() { _setDetailAccCount('vehicleFactsAccCount', 'vehicleFactsContainer'); });
    loadProjects('vehicle', vehicle.id, 'vehicleProjectsContainer', 'vehicleProjectsEmptyState')
        .then(function() { _setDetailAccCount('vehicleTasksAccCount', 'vehicleProjectsContainer'); });

    if (typeof loadEventsForTarget === 'function') {
        var months = parseInt(document.getElementById('vehicleCalendarRangeSelect').value, 10) || 3;
        loadEventsForTarget('vehicle', vehicle.id,
            'vehicleCalendarEventsContainer', 'vehicleCalendarEventsEmptyState', months)
            .then(function() { _setDetailAccCount('vehicleCalendarAccCount', 'vehicleCalendarEventsContainer'); });
    }
}

/**
 * Save the editable info fields back to Firestore.
 * Called by the "Save Info" button on the detail page.
 */
function saveVehicleInfo() {
    if (!window.currentVehicle) return;

    var saveBtn  = document.getElementById('vehicleInfoSaveBtn');
    var savedMsg = document.getElementById('vehicleInfoSavedMsg');

    if (saveBtn) saveBtn.disabled = true;

    var data = {
        year:          document.getElementById('vehicleInfoYear').value.trim()         || '',
        make:          document.getElementById('vehicleInfoMake').value.trim()         || '',
        model:         document.getElementById('vehicleInfoModel').value.trim()        || '',
        trim:          document.getElementById('vehicleInfoTrim').value.trim()         || '',
        color:         document.getElementById('vehicleInfoColor').value.trim()        || '',
        vin:           document.getElementById('vehicleInfoVin').value.trim()          || '',
        licensePlate:  document.getElementById('vehicleInfoLicensePlate').value.trim() || '',
        purchaseDate:  document.getElementById('vehicleInfoPurchaseDate').value.trim() || '',
        purchasePrice: document.getElementById('vehicleInfoPurchasePrice').value.trim()|| '',
        notes:         document.getElementById('vehicleInfoNotes').value.trim()        || ''
    };

    // Validate required fields
    if (!data.year)  { alert('Year is required.'); if (saveBtn) saveBtn.disabled = false; return; }
    if (!data.make)  { alert('Make is required.'); if (saveBtn) saveBtn.disabled = false; return; }
    if (!data.model) { alert('Model is required.'); if (saveBtn) saveBtn.disabled = false; return; }

    userCol('vehicles').doc(window.currentVehicle.id).update(data)
        .then(function() {
            // Merge update into local state
            Object.assign(window.currentVehicle, data);

            // Update the page title to reflect any name change
            var titleParts = [data.year, data.make, data.model].filter(Boolean);
            document.getElementById('vehicleDetailTitle').textContent =
                titleParts.length > 0 ? titleParts.join(' ') : 'Vehicle';

            if (saveBtn) saveBtn.disabled = false;
            if (savedMsg) {
                savedMsg.classList.remove('hidden');
                setTimeout(function() { savedMsg.classList.add('hidden'); }, 2500);
            }
        })
        .catch(function(err) {
            console.error('saveVehicleInfo error:', err);
            alert('Error saving. Please try again.');
            if (saveBtn) saveBtn.disabled = false;
        });
}

// ============================================================
// MILEAGE LOG
// ============================================================

/**
 * Load and render the mileage log for a vehicle.
 * Queries mileageLogs where vehicleId == vehicleId, newest-first.
 * @param {string} vehicleId - Firestore document ID of the vehicle
 */
function loadMileageLog(vehicleId) {
    var container  = document.getElementById('mileageLogList');
    var emptyState = document.getElementById('mileageLogEmptyState');

    container.innerHTML    = '';
    emptyState.textContent = 'Loading\u2026';

    userCol('mileageLogs')
        .where('vehicleId', '==', vehicleId)
        .get()
        .then(function(snapshot) {
            emptyState.textContent = '';

            if (snapshot.empty) {
                emptyState.textContent = 'No mileage entries yet.';
                return;
            }

            // Sort newest-first client-side (avoids composite index requirement)
            var docs = [];
            snapshot.forEach(function(doc) { docs.push(doc); });
            docs.sort(function(a, b) {
                var da = a.data().date || '';
                var db = b.data().date || '';
                return db.localeCompare(da);   // descending
            });

            docs.forEach(function(doc) {
                container.appendChild(buildMileageEntry(doc.id, doc.data()));
            });
            _setDetailAccCount('vehicleMileageAccCount', 'mileageLogList');
        })
        .catch(function(err) {
            console.error('loadMileageLog error:', err);
            emptyState.textContent = 'Error loading mileage log.';
        });
}

/**
 * Build a single mileage log entry element.
 * @param {string} id    - Firestore document ID of the mileage entry
 * @param {object} data  - Entry data: date, mileage, notes
 * @returns {HTMLElement}
 */
function buildMileageEntry(id, data) {
    var entry = document.createElement('div');
    entry.className = 'mileage-entry';

    // Format date for display: "June 1, 2025"
    var dateDisplay = data.date || '\u2014';
    if (data.date) {
        var d = new Date(data.date + 'T00:00:00');
        dateDisplay = d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    }

    // Format mileage with comma separator
    var mileageDisplay = data.mileage != null
        ? Number(data.mileage).toLocaleString() + ' mi'
        : '\u2014';

    var left = document.createElement('div');
    left.className = 'mileage-entry-info';
    left.innerHTML =
        '<span class="mileage-entry-odometer">' + escapeHtml(mileageDisplay) + '</span>' +
        '<span class="mileage-entry-date">' + escapeHtml(dateDisplay) + '</span>' +
        (data.notes ? '<span class="mileage-entry-notes">' + escapeHtml(data.notes) + '</span>' : '');

    var delBtn = document.createElement('button');
    delBtn.className = 'btn btn-danger btn-small';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', function() {
        deleteMileageEntry(id);
    });

    entry.appendChild(left);
    entry.appendChild(delBtn);

    return entry;
}

/**
 * Add a new mileage entry from the inline form fields.
 * Reads mileageDate, mileageOdometer, mileageNotes inputs on the page.
 */
function addMileageEntry() {
    if (!window.currentVehicle) return;

    var dateVal     = document.getElementById('mileageDate').value.trim();
    var odometerVal = document.getElementById('mileageOdometer').value.trim();
    var notesVal    = document.getElementById('mileageNotes').value.trim();

    if (!dateVal)     { alert('Date is required.'); return; }
    if (!odometerVal) { alert('Odometer reading is required.'); return; }

    var mileageNum = parseFloat(odometerVal);
    if (isNaN(mileageNum)) { alert('Odometer must be a number.'); return; }

    var data = {
        vehicleId: window.currentVehicle.id,
        date:      dateVal,
        mileage:   mileageNum,
        notes:     notesVal || '',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    userCol('mileageLogs').add(data)
        .then(function() {
            // Clear the inline form
            document.getElementById('mileageDate').value      = '';
            document.getElementById('mileageOdometer').value  = '';
            document.getElementById('mileageNotes').value     = '';
            // Reload the list
            loadMileageLog(window.currentVehicle.id);
        })
        .catch(function(err) {
            console.error('addMileageEntry error:', err);
            alert('Error saving mileage entry. Please try again.');
        });
}

/**
 * Delete a mileage log entry after confirmation.
 * @param {string} entryId - Firestore document ID of the mileage entry
 */
function deleteMileageEntry(entryId) {
    if (!confirm('Delete this mileage entry? This cannot be undone.')) return;

    userCol('mileageLogs').doc(entryId).delete()
        .then(function() {
            if (window.currentVehicle) loadMileageLog(window.currentVehicle.id);
        })
        .catch(function(err) {
            console.error('deleteMileageEntry error:', err);
            alert('Error deleting entry. Please try again.');
        });
}

// ============================================================
// ARCHIVE / UNARCHIVE
// ============================================================

/**
 * Open the archive confirmation modal.
 * The modal has an optional reason field + Confirm button.
 */
function archiveVehicle() {
    if (!window.currentVehicle) return;
    // Clear the reason field each time
    var reasonEl = document.getElementById('vehicleArchiveReason');
    if (reasonEl) reasonEl.value = '';
    openModal('vehicleArchiveModal');
}

/**
 * Confirm the archive action from the archive modal.
 * Sets archived:true, archivedAt, archivedReason on the Firestore doc.
 */
function confirmArchiveVehicle() {
    if (!window.currentVehicle) return;

    var reasonEl = document.getElementById('vehicleArchiveReason');
    var reason   = reasonEl ? reasonEl.value.trim() : '';

    var data = {
        archived:       true,
        archivedAt:     firebase.firestore.FieldValue.serverTimestamp(),
        archivedReason: reason || ''
    };

    userCol('vehicles').doc(window.currentVehicle.id).update(data)
        .then(function() {
            closeModal('vehicleArchiveModal');
            // Return to the vehicle list
            window.location.hash = '#vehicles';
        })
        .catch(function(err) {
            console.error('confirmArchiveVehicle error:', err);
            alert('Error archiving vehicle. Please try again.');
        });
}

/**
 * Unarchive the current vehicle.
 * Clears the archived fields and reloads the detail page.
 */
function unarchiveVehicle() {
    if (!window.currentVehicle) return;
    if (!confirm('Unarchive this vehicle? It will appear in the active list again.')) return;

    userCol('vehicles').doc(window.currentVehicle.id).update({
        archived:       false,
        archivedAt:     firebase.firestore.FieldValue.delete(),
        archivedReason: firebase.firestore.FieldValue.delete()
    })
        .then(function() {
            loadVehiclePage(window.currentVehicle.id);
        })
        .catch(function(err) {
            console.error('unarchiveVehicle error:', err);
            alert('Error unarchiving vehicle. Please try again.');
        });
}

// ============================================================
// VEHICLE DETAIL — BUTTON WIRING
// (Problems, Facts, Projects, Activities, Photos, Calendar Events)
// ============================================================

document.getElementById('vehicleInfoSaveBtn').addEventListener('click', saveVehicleInfo);

document.getElementById('vehicleMileageAddBtn').addEventListener('click', addMileageEntry);

document.getElementById('addVehicleCameraBtn').addEventListener('click', function() {
    if (window.currentVehicle) triggerCameraUpload('vehicle', window.currentVehicle.id);
});
document.getElementById('addVehicleGalleryBtn').addEventListener('click', function() {
    if (window.currentVehicle) triggerGalleryUpload('vehicle', window.currentVehicle.id);
});

document.getElementById('logVehicleActivityBtn').addEventListener('click', function() {
    if (window.currentVehicle) openLogActivityModal('vehicle', window.currentVehicle.id);
});

document.getElementById('addVehicleProblemBtn').addEventListener('click', function() {
    if (window.currentVehicle) openAddProblemModal('vehicle', window.currentVehicle.id);
});

document.getElementById('addVehicleFactBtn').addEventListener('click', function() {
    if (window.currentVehicle) openAddFactModal('vehicle', window.currentVehicle.id);
});

document.getElementById('addVehicleProjectBtn').addEventListener('click', function() {
    if (window.currentVehicle) openAddProjectModal('vehicle', window.currentVehicle.id);
});

document.getElementById('addVehicleCalendarEventBtn').addEventListener('click', function() {
    if (window.currentVehicle && typeof openAddCalendarEventModal === 'function') {
        var reloadFn = function() {
            var months = parseInt(document.getElementById('vehicleCalendarRangeSelect').value, 10) || 3;
            loadEventsForTarget('vehicle', window.currentVehicle.id,
                'vehicleCalendarEventsContainer', 'vehicleCalendarEventsEmptyState', months);
        };
        openAddCalendarEventModal('vehicle', window.currentVehicle.id, reloadFn);
    }
});

document.getElementById('vehicleCalendarRangeSelect').addEventListener('change', function() {
    if (window.currentVehicle && typeof loadEventsForTarget === 'function') {
        var months = parseInt(this.value, 10) || 3;
        loadEventsForTarget('vehicle', window.currentVehicle.id,
            'vehicleCalendarEventsContainer', 'vehicleCalendarEventsEmptyState', months);
    }
});

// Archive / Unarchive buttons
document.getElementById('vehicleArchiveBtn').addEventListener('click', archiveVehicle);
document.getElementById('vehicleUnarchiveBtn').addEventListener('click', unarchiveVehicle);

// Archive modal Confirm / Cancel
document.getElementById('vehicleArchiveConfirmBtn').addEventListener('click', confirmArchiveVehicle);
document.getElementById('vehicleArchiveCancelBtn').addEventListener('click', function() {
    closeModal('vehicleArchiveModal');
});
