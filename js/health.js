'use strict';

// =================================================================
//  health.js — My Health
//  H1: Allergies, Supplements, Vaccinations, Eye/Glasses
//  H2: Health Visits
// =================================================================

/* ── Severity ordering for allergy sort ───────────────────────── */
var HEALTH_SEVERITY_ORDER = { Severe: 0, Moderate: 1, Mild: 2 };

// -----------------------------------------------------------------
//  HEALTH HUB  (CH4 + CH5)
// -----------------------------------------------------------------

/** Module-level cache so _healthSelectContact can re-render without a reload. */
var _healthContactsCache = [];
var _healthMeIdCache = null;

function loadHealthPage() {
    runHealthContactMigration();   // CH3: one-time migration, no-op after first run
    _healthHubInit();              // CH4+CH5: contact selection strip
}

async function _healthHubInit() {
    try {
        var meId = await ensureMeContact();
        if (!meId) return;
        _healthMeIdCache = meId;
        window.healthActiveContactId = meId;   // always reset to Me on every entry
        await _healthLoadAndRenderContacts(meId);
    } catch (err) {
        console.error('_healthHubInit:', err);
    }
}

async function _healthLoadAndRenderContacts(meId) {
    try {
        var snap = await userCol('healthTrackedContacts').doc('default').get();
        var ids = (snap.exists && snap.data().contactIds) ? snap.data().contactIds.slice() : [];

        // Me is always first; insert if missing
        ids = [meId].concat(ids.filter(function(id) { return id !== meId; }));

        // Persist normalised list if it changed
        var stored = snap.exists ? (snap.data().contactIds || []) : [];
        if (stored.length !== ids.length || stored[0] !== meId) {
            userCol('healthTrackedContacts').doc('default')
                .set({ contactIds: ids }, { merge: true })
                .catch(function() {});
        }

        // Fetch contact docs
        var contacts = [];
        for (var i = 0; i < ids.length; i++) {
            var pSnap = await userCol('people').doc(ids[i]).get();
            if (pSnap.exists) contacts.push(Object.assign({ id: pSnap.id }, pSnap.data()));
        }
        _healthContactsCache = contacts;
        _healthRenderContactCards(contacts, meId);
    } catch (err) {
        console.error('_healthLoadAndRenderContacts:', err);
    }
}

function _healthRenderContactCards(contacts, meId) {
    var strip = document.getElementById('healthContactStrip');
    if (!strip) return;
    strip.innerHTML = '';

    var activeId = window.healthActiveContactId || meId;

    contacts.forEach(function(c) {
        var isActive = c.id === activeId;
        var isMe = !!c.isMe;
        var icon = c.category === 'Pet' ? '🐾' : '👤';

        var card = document.createElement('div');
        card.className = 'health-contact-card' + (isActive ? ' health-contact-card--active' : '');
        card.onclick = function() { _healthSelectContact(c.id); };

        var html = '<div class="health-contact-card-top">'
            + '<span class="health-contact-name">' + icon + ' ' + escapeHtml(c.name) + '</span>';
        if (isActive) html += '<span class="health-contact-active-badge">&#10003;</span>';
        html += '</div>';
        if (isActive && c.category && !isMe) {
            html += '<div class="health-contact-meta">' + escapeHtml(c.category) + '</div>';
        }
        if (!isMe) {
            html += '<button class="health-contact-remove-btn" onclick="event.stopPropagation();_healthRemoveTrackedContact(\''
                + c.id + '\',\'' + escapeHtml(c.name).replace(/'/g, '\\\'') + '\')">Remove</button>';
        }
        card.innerHTML = html;
        strip.appendChild(card);
    });

    // "+ Add Person" card
    var addCard = document.createElement('div');
    addCard.className = 'health-contact-card health-contact-card--add';
    addCard.innerHTML = '<span class="health-contact-name">+ Add Person</span>';
    addCard.onclick = _healthOpenAddContactModal;
    strip.appendChild(addCard);

    // Hide Emergency Info and Care Team tiles for non-Me contacts
    var meActive = activeId === meId;
    var emergencyTile = document.getElementById('healthEmergencyTile');
    var careTeamTile  = document.getElementById('healthCareTeamTile');
    if (emergencyTile) emergencyTile.style.display = meActive ? '' : 'none';
    if (careTeamTile)  careTeamTile.style.display  = meActive ? '' : 'none';
}

function _healthSelectContact(contactId) {
    window.healthActiveContactId = contactId;
    _healthRenderContactCards(_healthContactsCache, _healthMeIdCache);
}

function _healthOpenAddContactModal() {
    var pickerDiv = document.getElementById('healthAddContactPicker');
    if (!pickerDiv) return;
    pickerDiv.innerHTML = '';
    buildContactPicker('healthAddContactPicker', {
        placeholder: 'Search contacts…',
        onSelect: function(id, name) {
            _healthAddTrackedContact(id);
        }
    });
    openModal('healthAddContactModal');
}

async function _healthAddTrackedContact(contactId) {
    if (!contactId) return;
    try {
        var snap = await userCol('healthTrackedContacts').doc('default').get();
        var ids = (snap.exists && snap.data().contactIds) ? snap.data().contactIds.slice() : [];
        if (ids.indexOf(contactId) === -1) {
            ids.push(contactId);
            await userCol('healthTrackedContacts').doc('default').set({ contactIds: ids }, { merge: true });
        }
        closeModal('healthAddContactModal');
        await _healthLoadAndRenderContacts(_healthMeIdCache);
    } catch (err) {
        alert('Error adding contact: ' + err.message);
    }
}

async function _healthRemoveTrackedContact(contactId, name) {
    if (!confirm('Remove ' + name + ' from health tracking?\n\nTheir health records will not be deleted.')) return;
    try {
        var snap = await userCol('healthTrackedContacts').doc('default').get();
        var ids = (snap.exists && snap.data().contactIds) ? snap.data().contactIds.slice() : [];
        ids = ids.filter(function(id) { return id !== contactId; });
        await userCol('healthTrackedContacts').doc('default').set({ contactIds: ids }, { merge: true });
        if (window.healthActiveContactId === contactId) {
            window.healthActiveContactId = _healthMeIdCache;
        }
        await _healthLoadAndRenderContacts(_healthMeIdCache);
    } catch (err) {
        alert('Error removing contact: ' + err.message);
    }
}

// -----------------------------------------------------------------
//  CH3 — ONE-TIME MIGRATION: stamp contactId on legacy health records
//  Runs once when the health hub loads; guarded by healthConverted flag.
// -----------------------------------------------------------------
async function runHealthContactMigration() {
    try {
        var stateSnap = await userCol('settings').doc('appState').get();
        if (stateSnap.exists && stateSnap.data().healthConverted) return;

        var meId = await ensureMeContact();
        if (!meId) { console.error('runHealthContactMigration: could not resolve Me contact'); return; }

        var HEALTH_COLLECTIONS = [
            'allergies', 'supplements', 'vaccinations', 'eyePrescriptions',
            'healthVisits', 'medications', 'conditions', 'healthConditionLogs',
            'concerns', 'concernUpdates', 'bloodWorkRecords', 'vitals',
            'insurancePolicies', 'healthAppointments'
        ];

        // Collect all document refs that still have contactId == null
        var refs = [];
        for (var i = 0; i < HEALTH_COLLECTIONS.length; i++) {
            var snap = await userCol(HEALTH_COLLECTIONS[i]).get();
            snap.docs.forEach(function(d) {
                if (d.data().contactId == null) refs.push(d.ref);
            });
        }

        // Commit in batches of 400 (Firestore batch limit)
        for (var start = 0; start < refs.length; start += 400) {
            var batch = db.batch();
            refs.slice(start, start + 400).forEach(function(ref) {
                batch.update(ref, { contactId: meId });
            });
            await batch.commit();
        }

        await userCol('settings').doc('appState').set({ healthConverted: true }, { merge: true });
        console.log('runHealthContactMigration: stamped ' + refs.length + ' records with contactId=' + meId);
    } catch (err) {
        console.error('runHealthContactMigration error:', err);
    }
}

// =================================================================
//  ALLERGIES
// =================================================================

function loadAllergyPage() {
    var list = document.getElementById('allergyList');
    if (!list) return;
    list.innerHTML = '<p class="empty-state">Loading…</p>';

    userCol('allergies').get()
        .then(function(snap) {
            if (snap.empty) {
                list.innerHTML = '<p class="empty-state">No allergies recorded yet. Tap + Add to add one.</p>';
                return;
            }
            // Sort client-side: Severe → Moderate → Mild → Unknown, then A-Z within each
            var docs = snap.docs.map(function(d) {
                return Object.assign({ id: d.id }, d.data());
            });
            docs.sort(function(a, b) {
                var sa = HEALTH_SEVERITY_ORDER[a.severity] !== undefined ? HEALTH_SEVERITY_ORDER[a.severity] : 9;
                var sb = HEALTH_SEVERITY_ORDER[b.severity] !== undefined ? HEALTH_SEVERITY_ORDER[b.severity] : 9;
                if (sa !== sb) return sa - sb;
                return (a.allergen || '').localeCompare(b.allergen || '');
            });
            list.innerHTML = '';
            docs.forEach(function(doc) {
                list.appendChild(buildAllergyCard(doc));
            });
        })
        .catch(function(err) {
            list.innerHTML = '<p class="empty-state">Error loading allergies.</p>';
            console.error('loadAllergyPage:', err);
        });
}

function buildAllergyCard(doc) {
    var severityClass = 'health-badge--severity-' + (doc.severity || 'unknown').toLowerCase();
    var div = document.createElement('div');
    div.className = 'health-card';
    div.innerHTML =
        '<div class="health-card-main">' +
            '<div class="health-card-title">' + escapeHtml(doc.allergen || '') + '</div>' +
            '<div class="health-card-meta">' +
                (doc.type     ? '<span class="health-badge">' + escapeHtml(doc.type) + '</span>' : '') +
                (doc.severity ? '<span class="health-badge ' + severityClass + '">' + escapeHtml(doc.severity) + '</span>' : '') +
            '</div>' +
            (doc.reaction ? '<div class="health-card-sub">Reaction: ' + escapeHtml(doc.reaction) + '</div>' : '') +
            (doc.notes    ? '<div class="health-card-sub">' + escapeHtml(doc.notes) + '</div>' : '') +
        '</div>' +
        '<div class="health-card-actions">' +
            '<button class="btn btn-secondary btn-small" onclick="openAllergyModal(\'' + doc.id + '\')">Edit</button>' +
            '<button class="btn btn-danger btn-small" onclick="deleteAllergy(\'' + doc.id + '\')">Delete</button>' +
        '</div>';
    return div;
}

function openAllergyModal(id) {
    var modal = document.getElementById('allergyModal');
    modal.dataset.editId = id || '';
    document.getElementById('allergyModalTitle').textContent = id ? 'Edit Allergy' : 'Add Allergy';

    // Clear all fields
    document.getElementById('allergyAllergen').value  = '';
    document.getElementById('allergyType').value      = '';
    document.getElementById('allergyReaction').value  = '';
    document.getElementById('allergySeverity').value  = '';
    document.getElementById('allergyDate').value      = '';
    document.getElementById('allergyNotes').value     = '';

    if (id) {
        userCol('allergies').doc(id).get().then(function(snap) {
            if (!snap.exists) return;
            var d = snap.data();
            document.getElementById('allergyAllergen').value  = d.allergen        || '';
            document.getElementById('allergyType').value      = d.type            || '';
            document.getElementById('allergyReaction').value  = d.reaction        || '';
            document.getElementById('allergySeverity').value  = d.severity        || '';
            document.getElementById('allergyDate').value      = d.dateDiscovered  || '';
            document.getElementById('allergyNotes').value     = d.notes           || '';
        });
    }
    openModal('allergyModal');
}

function saveAllergy() {
    var allergen = document.getElementById('allergyAllergen').value.trim();
    if (!allergen) { alert('Allergen name is required.'); return; }

    var data = {
        allergen:       allergen,
        type:           document.getElementById('allergyType').value,
        reaction:       document.getElementById('allergyReaction').value.trim(),
        severity:       document.getElementById('allergySeverity').value,
        dateDiscovered: document.getElementById('allergyDate').value || null,
        notes:          document.getElementById('allergyNotes').value.trim()
    };

    var modal  = document.getElementById('allergyModal');
    var editId = modal.dataset.editId;
    var op;
    if (editId) {
        op = userCol('allergies').doc(editId).update(data);
    } else {
        data.contactId = null;
        op = userCol('allergies').add(data);
    }

    op.then(function() {
        closeModal('allergyModal');
        loadAllergyPage();
    }).catch(function(err) {
        alert('Error saving allergy: ' + err.message);
    });
}

function deleteAllergy(id) {
    if (!confirm('Delete this allergy record?')) return;
    userCol('allergies').doc(id).delete()
        .then(function() { loadAllergyPage(); })
        .catch(function(err) { alert('Error deleting: ' + err.message); });
}

// =================================================================
//  SUPPLEMENTS
// =================================================================

function loadSupplementPage() {
    var activeList   = document.getElementById('supplementActiveList');
    var stoppedList  = document.getElementById('supplementStoppedList');
    var stoppedSect  = document.getElementById('supplementStoppedSection');
    if (!activeList) return;

    activeList.innerHTML = '<p class="empty-state">Loading…</p>';

    userCol('supplements').orderBy('name').get()
        .then(function(snap) {
            var activeDocs = [], stoppedDocs = [];
            snap.docs.forEach(function(d) {
                var rec = Object.assign({ id: d.id }, d.data());
                if (rec.status === 'stopped') {
                    stoppedDocs.push(rec);
                } else {
                    activeDocs.push(rec);
                }
            });

            // Active section
            if (activeDocs.length === 0) {
                activeList.innerHTML = '<p class="empty-state">No current supplements. Tap + Add to add one.</p>';
            } else {
                activeList.innerHTML = '';
                activeDocs.forEach(function(rec) {
                    activeList.appendChild(buildSupplementCard(rec));
                });
            }

            // Stopped section
            if (stoppedDocs.length === 0) {
                stoppedSect.style.display = 'none';
            } else {
                stoppedSect.style.display = '';
                stoppedList.innerHTML = '';
                stoppedDocs.forEach(function(rec) {
                    stoppedList.appendChild(buildSupplementCard(rec));
                });
            }
        })
        .catch(function(err) {
            activeList.innerHTML = '<p class="empty-state">Error loading supplements.</p>';
            console.error('loadSupplementPage:', err);
        });
}

function buildSupplementCard(doc) {
    var isStopped = doc.status === 'stopped';
    var div = document.createElement('div');
    div.className = 'health-card' + (isStopped ? ' health-card--dim' : '');

    var dosage = doc.dosage ? ' — ' + escapeHtml(doc.dosage) : '';
    div.innerHTML =
        '<div class="health-card-main">' +
            '<div class="health-card-title">' + escapeHtml(doc.name || '') + dosage + '</div>' +
            '<div class="health-card-meta">' +
                (doc.brand ? '<span class="health-badge">' + escapeHtml(doc.brand) + '</span>' : '') +
            '</div>' +
            (doc.reason    ? '<div class="health-card-sub">' + escapeHtml(doc.reason) + '</div>' : '') +
            (doc.frequency ? '<div class="health-card-sub">Frequency: ' + escapeHtml(doc.frequency) + '</div>' : '') +
            (isStopped && doc.endDate ? '<div class="health-card-sub">Stopped: ' + escapeHtml(doc.endDate) + '</div>' : '') +
        '</div>' +
        '<div class="health-card-actions">' +
            '<button class="btn btn-secondary btn-small" onclick="openSupplementModal(\'' + doc.id + '\')">Edit</button>' +
            (!isStopped ? '<button class="btn btn-secondary btn-small" onclick="stopSupplement(\'' + doc.id + '\')">Stop</button>' : '') +
            '<button class="btn btn-danger btn-small" onclick="deleteSupplement(\'' + doc.id + '\')">Delete</button>' +
        '</div>';
    return div;
}

function openSupplementModal(id) {
    var modal = document.getElementById('supplementModal');
    modal.dataset.editId = id || '';
    document.getElementById('supplementModalTitle').textContent = id ? 'Edit Supplement' : 'Add Supplement';

    // Clear all fields
    ['supplementName','supplementDosage','supplementBrand','supplementReason',
     'supplementFrequency','supplementStartDate','supplementNotes'].forEach(function(f) {
        document.getElementById(f).value = '';
    });

    if (id) {
        userCol('supplements').doc(id).get().then(function(snap) {
            if (!snap.exists) return;
            var d = snap.data();
            document.getElementById('supplementName').value      = d.name      || '';
            document.getElementById('supplementDosage').value    = d.dosage    || '';
            document.getElementById('supplementBrand').value     = d.brand     || '';
            document.getElementById('supplementReason').value    = d.reason    || '';
            document.getElementById('supplementFrequency').value = d.frequency || '';
            document.getElementById('supplementStartDate').value = d.startDate || '';
            document.getElementById('supplementNotes').value     = d.notes     || '';
        });
    }
    openModal('supplementModal');
}

function saveSupplement() {
    var name = document.getElementById('supplementName').value.trim();
    if (!name) { alert('Supplement name is required.'); return; }

    var data = {
        name:      name,
        dosage:    document.getElementById('supplementDosage').value.trim(),
        brand:     document.getElementById('supplementBrand').value.trim(),
        reason:    document.getElementById('supplementReason').value.trim(),
        frequency: document.getElementById('supplementFrequency').value.trim(),
        startDate: document.getElementById('supplementStartDate').value || null,
        notes:     document.getElementById('supplementNotes').value.trim()
    };

    var modal  = document.getElementById('supplementModal');
    var editId = modal.dataset.editId;
    var op;
    if (editId) {
        op = userCol('supplements').doc(editId).update(data);
    } else {
        data.status    = 'active';
        data.contactId = null;
        data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        op = userCol('supplements').add(data);
    }

    op.then(function() {
        closeModal('supplementModal');
        loadSupplementPage();
    }).catch(function(err) {
        alert('Error saving supplement: ' + err.message);
    });
}

function stopSupplement(id) {
    var endDate = prompt('When did you stop? (YYYY-MM-DD, or leave blank):');
    if (endDate === null) return;  // user hit Cancel
    userCol('supplements').doc(id).update({
        status:  'stopped',
        endDate: endDate.trim() || null
    }).then(function() {
        loadSupplementPage();
    }).catch(function(err) {
        alert('Error: ' + err.message);
    });
}

function deleteSupplement(id) {
    if (!confirm('Delete this supplement record?')) return;
    userCol('supplements').doc(id).delete()
        .then(function() { loadSupplementPage(); })
        .catch(function(err) { alert('Error deleting: ' + err.message); });
}

// =================================================================
//  VACCINATIONS
// =================================================================

function loadVaccinationPage() {
    var list = document.getElementById('vaccinationList');
    if (!list) return;
    list.innerHTML = '<p class="empty-state">Loading…</p>';

    userCol('vaccinations').orderBy('date', 'desc').get()
        .then(function(snap) {
            if (snap.empty) {
                list.innerHTML = '<p class="empty-state">No vaccinations recorded yet. Tap + Add to add one.</p>';
                return;
            }
            list.innerHTML = '';
            snap.docs.forEach(function(d) {
                list.appendChild(buildVaccinationCard(Object.assign({ id: d.id }, d.data())));
            });
        })
        .catch(function(err) {
            list.innerHTML = '<p class="empty-state">Error loading vaccinations.</p>';
            console.error('loadVaccinationPage:', err);
        });
}

function buildVaccinationCard(doc) {
    var dateLabel = (doc.dateApproximate ? '~' : '') + (doc.date || 'Date unknown');
    var div = document.createElement('div');
    div.className = 'health-card';
    div.innerHTML =
        '<div class="health-card-main">' +
            '<div class="health-card-title">' + escapeHtml(doc.name || '') + '</div>' +
            '<div class="health-card-meta">' +
                '<span class="health-badge">' + escapeHtml(dateLabel) + '</span>' +
                (doc.nextDueDate ? '<span class="health-badge health-badge--due">Next: ' + escapeHtml(doc.nextDueDate) + '</span>' : '') +
            '</div>' +
            (doc.provider ? '<div class="health-card-sub">Provider: ' + escapeHtml(doc.provider) + '</div>' : '') +
            (doc.lotNumber ? '<div class="health-card-sub">Lot: ' + escapeHtml(doc.lotNumber) + '</div>' : '') +
            (doc.notes    ? '<div class="health-card-sub">' + escapeHtml(doc.notes) + '</div>' : '') +
        '</div>' +
        '<div class="health-card-actions">' +
            '<button class="btn btn-secondary btn-small" onclick="openVaccinationModal(\'' + doc.id + '\')">Edit</button>' +
            '<button class="btn btn-danger btn-small" onclick="deleteVaccination(\'' + doc.id + '\')">Delete</button>' +
        '</div>';
    return div;
}

function openVaccinationModal(id) {
    var modal = document.getElementById('vaccinationModal');
    modal.dataset.editId = id || '';
    document.getElementById('vaccinationModalTitle').textContent = id ? 'Edit Vaccination' : 'Add Vaccination';

    ['vaccinationName','vaccinationDate','vaccinationProvider',
     'vaccinationLot','vaccinationNextDue','vaccinationNotes'].forEach(function(f) {
        document.getElementById(f).value = '';
    });
    document.getElementById('vaccinationApprox').checked = false;

    if (id) {
        userCol('vaccinations').doc(id).get().then(function(snap) {
            if (!snap.exists) return;
            var d = snap.data();
            document.getElementById('vaccinationName').value    = d.name        || '';
            document.getElementById('vaccinationDate').value    = d.date        || '';
            document.getElementById('vaccinationApprox').checked = !!d.dateApproximate;
            document.getElementById('vaccinationProvider').value = d.provider   || '';
            document.getElementById('vaccinationLot').value     = d.lotNumber   || '';
            document.getElementById('vaccinationNextDue').value = d.nextDueDate || '';
            document.getElementById('vaccinationNotes').value   = d.notes       || '';
        });
    }
    openModal('vaccinationModal');
}

function saveVaccination() {
    var name = document.getElementById('vaccinationName').value.trim();
    if (!name) { alert('Vaccine name is required.'); return; }

    var data = {
        name:           name,
        date:           document.getElementById('vaccinationDate').value || null,
        dateApproximate: document.getElementById('vaccinationApprox').checked,
        provider:       document.getElementById('vaccinationProvider').value.trim(),
        lotNumber:      document.getElementById('vaccinationLot').value.trim(),
        nextDueDate:    document.getElementById('vaccinationNextDue').value || null,
        notes:          document.getElementById('vaccinationNotes').value.trim()
    };

    var modal  = document.getElementById('vaccinationModal');
    var editId = modal.dataset.editId;
    var op;
    if (editId) {
        op = userCol('vaccinations').doc(editId).update(data);
    } else {
        data.contactId = null;
        data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        op = userCol('vaccinations').add(data);
    }

    op.then(function() {
        closeModal('vaccinationModal');
        loadVaccinationPage();
    }).catch(function(err) {
        alert('Error saving vaccination: ' + err.message);
    });
}

function deleteVaccination(id) {
    if (!confirm('Delete this vaccination record?')) return;
    userCol('vaccinations').doc(id).delete()
        .then(function() { loadVaccinationPage(); })
        .catch(function(err) { alert('Error deleting: ' + err.message); });
}

// =================================================================
//  EYE / GLASSES PRESCRIPTIONS
// =================================================================

function loadEyePage() {
    var distanceList = document.getElementById('eyeDistanceList');
    var readingList  = document.getElementById('eyeReadingList');
    if (!distanceList || !readingList) return;

    distanceList.innerHTML = '<p class="empty-state">Loading…</p>';
    readingList.innerHTML  = '';

    userCol('eyePrescriptions').orderBy('date', 'desc').get()
        .then(function(snap) {
            var distanceDocs = [], readingDocs = [];
            snap.docs.forEach(function(d) {
                var rec = Object.assign({ id: d.id }, d.data());
                if (rec.type === 'Reading') {
                    readingDocs.push(rec);
                } else {
                    distanceDocs.push(rec);
                }
            });

            // Distance section
            if (distanceDocs.length === 0) {
                distanceList.innerHTML = '<p class="empty-state">No distance prescriptions recorded.</p>';
            } else {
                distanceList.innerHTML = '';
                distanceDocs.forEach(function(rec) {
                    distanceList.appendChild(buildEyeCard(rec));
                });
            }

            // Reading section
            if (readingDocs.length === 0) {
                readingList.innerHTML = '<p class="empty-state">No reading prescriptions recorded.</p>';
            } else {
                readingList.innerHTML = '';
                readingDocs.forEach(function(rec) {
                    readingList.appendChild(buildEyeCard(rec));
                });
            }
        })
        .catch(function(err) {
            distanceList.innerHTML = '<p class="empty-state">Error loading prescriptions.</p>';
            console.error('loadEyePage:', err);
        });
}

/* Format one eye's Rx fields into a readable string. */
function formatEyeRx(eye) {
    if (!eye) return '—';
    var parts = [];
    if (eye.sphere)   parts.push('SPH ' + eye.sphere);
    if (eye.cylinder) parts.push('CYL ' + eye.cylinder);
    if (eye.axis)     parts.push('Axis ' + eye.axis);
    if (eye.add)      parts.push('Add '  + eye.add);
    return parts.length ? parts.join(', ') : '—';
}

function buildEyeCard(doc) {
    var div = document.createElement('div');
    div.className = 'health-card';
    div.innerHTML =
        '<div class="health-card-main">' +
            '<div class="health-card-title">' + escapeHtml(doc.date || '—') + '</div>' +
            '<div class="health-eye-rx">' +
                '<div><strong>OD (right):</strong> ' + escapeHtml(formatEyeRx(doc.rightEye)) + '</div>' +
                '<div><strong>OS (left):</strong> '  + escapeHtml(formatEyeRx(doc.leftEye))  + '</div>' +
            '</div>' +
            (doc.pd       ? '<div class="health-card-sub">PD: ' + escapeHtml(doc.pd) + '</div>' : '') +
            (doc.provider ? '<div class="health-card-sub">Provider: ' + escapeHtml(doc.provider) + '</div>' : '') +
            (doc.notes    ? '<div class="health-card-sub">' + escapeHtml(doc.notes) + '</div>' : '') +
        '</div>' +
        '<div class="health-card-actions">' +
            '<button class="btn btn-secondary btn-small" onclick="openEyeModal(\'' + doc.id + '\')">Edit</button>' +
            '<button class="btn btn-danger btn-small" onclick="deleteEye(\'' + doc.id + '\')">Delete</button>' +
        '</div>';
    return div;
}

function openEyeModal(id) {
    var modal = document.getElementById('eyeModal');
    modal.dataset.editId = id || '';
    document.getElementById('eyeModalTitle').textContent = id ? 'Edit Prescription' : 'Add Prescription';

    ['eyeDate','eyeRightSphere','eyeRightCylinder','eyeRightAxis','eyeRightAdd',
     'eyeLeftSphere','eyeLeftCylinder','eyeLeftAxis','eyeLeftAdd',
     'eyePD','eyeProvider','eyeNotes'].forEach(function(f) {
        document.getElementById(f).value = '';
    });
    document.getElementById('eyeType').value = 'Distance';

    if (id) {
        userCol('eyePrescriptions').doc(id).get().then(function(snap) {
            if (!snap.exists) return;
            var d = snap.data();
            var r = d.rightEye || {};
            var l = d.leftEye  || {};
            document.getElementById('eyeDate').value            = d.date        || '';
            document.getElementById('eyeType').value            = d.type        || 'Distance';
            document.getElementById('eyeRightSphere').value     = r.sphere      || '';
            document.getElementById('eyeRightCylinder').value   = r.cylinder    || '';
            document.getElementById('eyeRightAxis').value       = r.axis        || '';
            document.getElementById('eyeRightAdd').value        = r.add         || '';
            document.getElementById('eyeLeftSphere').value      = l.sphere      || '';
            document.getElementById('eyeLeftCylinder').value    = l.cylinder    || '';
            document.getElementById('eyeLeftAxis').value        = l.axis        || '';
            document.getElementById('eyeLeftAdd').value         = l.add         || '';
            document.getElementById('eyePD').value              = d.pd          || '';
            document.getElementById('eyeProvider').value        = d.provider    || '';
            document.getElementById('eyeNotes').value           = d.notes       || '';
        });
    }
    openModal('eyeModal');
}

function saveEye() {
    var date = document.getElementById('eyeDate').value;
    if (!date) { alert('Date is required.'); return; }

    var data = {
        date:     date,
        type:     document.getElementById('eyeType').value,
        rightEye: {
            sphere:   document.getElementById('eyeRightSphere').value.trim()   || null,
            cylinder: document.getElementById('eyeRightCylinder').value.trim() || null,
            axis:     document.getElementById('eyeRightAxis').value.trim()     || null,
            add:      document.getElementById('eyeRightAdd').value.trim()      || null
        },
        leftEye: {
            sphere:   document.getElementById('eyeLeftSphere').value.trim()    || null,
            cylinder: document.getElementById('eyeLeftCylinder').value.trim()  || null,
            axis:     document.getElementById('eyeLeftAxis').value.trim()      || null,
            add:      document.getElementById('eyeLeftAdd').value.trim()       || null
        },
        pd:       document.getElementById('eyePD').value.trim(),
        provider: document.getElementById('eyeProvider').value.trim(),
        notes:    document.getElementById('eyeNotes').value.trim()
    };

    var modal  = document.getElementById('eyeModal');
    var editId = modal.dataset.editId;
    var op;
    if (editId) {
        op = userCol('eyePrescriptions').doc(editId).update(data);
    } else {
        data.contactId = null;
        data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        op = userCol('eyePrescriptions').add(data);
    }

    op.then(function() {
        closeModal('eyeModal');
        loadEyePage();
    }).catch(function(err) {
        alert('Error saving prescription: ' + err.message);
    });
}

function deleteEye(id) {
    if (!confirm('Delete this prescription record?')) return;
    userCol('eyePrescriptions').doc(id).delete()
        .then(function() { loadEyePage(); })
        .catch(function(err) { alert('Error deleting: ' + err.message); });
}

// =================================================================
//  HEALTH VISITS (H2)
// =================================================================

/** Cached visit list for client-side filter re-render. */
var _healthVisitCache = [];

function loadHealthVisitsPage() {
    var list = document.getElementById('visitList');
    if (!list) return;
    list.innerHTML = '<p class="empty-state">Loading\u2026</p>';

    userCol('healthVisits').orderBy('date', 'desc').get()
        .then(async function(snap) {
            _healthVisitCache = snap.docs.map(function(d) {
                return Object.assign({ id: d.id }, d.data());
            });

            // Collect unique providerContactIds so we can resolve their names
            var providerIds = [];
            _healthVisitCache.forEach(function(v) {
                if (v.providerContactId && providerIds.indexOf(v.providerContactId) === -1) {
                    providerIds.push(v.providerContactId);
                }
            });
            var contactMap = {};
            if (providerIds.length > 0) {
                var contactSnaps = await Promise.all(
                    providerIds.map(function(id) { return userCol('people').doc(id).get(); })
                );
                contactSnaps.forEach(function(s) {
                    if (s.exists) contactMap[s.id] = s.data().name || '';
                });
            }

            var filter = document.getElementById('visitTypeFilter');
            renderVisitList(_healthVisitCache, filter ? filter.value : '', contactMap);
        })
        .catch(function(err) {
            list.innerHTML = '<p class="empty-state">Error loading visits.</p>';
            console.error('loadHealthVisitsPage:', err);
        });
}

function renderVisitList(visits, typeFilter, contactMap) {
    var list = document.getElementById('visitList');
    if (!list) return;
    contactMap = contactMap || {};

    var filtered = typeFilter
        ? visits.filter(function(v) { return v.providerType === typeFilter; })
        : visits;

    if (filtered.length === 0) {
        list.innerHTML = '<p class="empty-state">' +
            (typeFilter ? 'No visits with this provider type.' : 'No visits recorded yet. Tap + Add Visit.') +
            '</p>';
        return;
    }

    list.innerHTML = '';
    var lastYear = null;
    filtered.forEach(function(visit) {
        var year = (visit.date || '').substring(0, 4) || 'Unknown';
        if (year !== lastYear) {
            var yearDiv = document.createElement('div');
            yearDiv.className = 'health-year-label';
            yearDiv.textContent = year;
            list.appendChild(yearDiv);
            lastYear = year;
        }
        list.appendChild(buildVisitCard(visit, contactMap));
    });
}

function buildVisitCard(visit, contactMap) {
    contactMap = contactMap || {};
    var div = document.createElement('div');
    div.className = 'health-card health-card--clickable';
    div.onclick = function() { location.hash = '#health-visit/' + visit.id; };

    // Prefer new visit.type badge; fall back to legacy providerType badge
    var badge = visit.type
        ? '<span class="appt-type-badge">' + escapeHtml(visit.type) + '</span>'
        : (visit.providerType ? '<span class="health-badge">' + escapeHtml(visit.providerType) + '</span>' : '');

    var sub = visit.reason
        ? escapeHtml(visit.reason)
        : '<em style="color:#aaa">No reason noted</em>';

    // Resolve provider display: linked contact > providerText > legacy provider field
    var providerDisplay = (visit.providerContactId && contactMap[visit.providerContactId])
        ? contactMap[visit.providerContactId]
        : (visit.providerText || visit.provider || 'Unknown provider');

    div.innerHTML =
        '<div class="health-card-main">' +
            '<div class="health-card-title">' + escapeHtml(visit.date || '\u2014') + ' \u2014 ' + escapeHtml(providerDisplay) + '</div>' +
            '<div class="health-card-meta">' + badge + '</div>' +
            '<div class="health-card-sub">' + sub + '</div>' +
        '</div>' +
        '<div class="health-card-arrow">\u203a</div>';
    return div;
}

// ── Detail page ───────────────────────────────────────────────────

function loadHealthVisitDetail(id) {
    var titleEl = document.getElementById('visitDetailTitle');
    if (titleEl) titleEl.textContent = 'Loading\u2026';

    userCol('healthVisits').doc(id).get()
        .then(function(snap) {
            if (!snap.exists) {
                alert('Visit not found.');
                location.hash = '#health-visits';
                return;
            }
            window.currentHealthVisit = Object.assign({ id: snap.id }, snap.data());
            renderVisitDetail(window.currentHealthVisit);
        })
        .catch(function(err) {
            console.error('loadHealthVisitDetail:', err);
        });
}

async function renderVisitDetail(visit) {
    // Breadcrumb
    var crumb = document.getElementById('breadcrumbBar');
    if (crumb) crumb.innerHTML =
        '<a href="#health">Health</a><span class="separator">&rsaquo;</span>' +
        '<a href="#health-visits">Visits</a>';

    // Title: "[Type] — [formatted date]", fall back to "Visit — [date]" for older records
    var titleType = visit.type || 'Visit';
    var titleDate = visit.date ? _apptFormatDate(visit.date) : '\u2014';
    document.getElementById('visitDetailTitle').textContent = titleType + ' \u2014 ' + titleDate;

    // Facility row — show if facilityContactId or facilityText set
    var facilityRow = document.getElementById('visitDetailFacilityRow');
    var facilityEl  = document.getElementById('visitDetailFacility');
    if (visit.facilityContactId) {
        facilityRow.style.display = '';
        facilityEl.innerHTML = 'Loading\u2026';
        userCol('people').doc(visit.facilityContactId).get().then(function(snap) {
            var name = snap.exists ? (snap.data().name || visit.facilityContactId) : visit.facilityContactId;
            facilityEl.innerHTML = '<a href="#contact/' + visit.facilityContactId + '" class="appt-contact-link">' + escapeHtml(name) + '</a>';
        }).catch(function() { facilityEl.textContent = visit.facilityContactId; });
    } else if (visit.facilityText) {
        facilityRow.style.display = '';
        facilityEl.textContent = visit.facilityText;
    } else {
        facilityRow.style.display = 'none';
    }

    // Provider row — prefer linked contact, fall back to providerText then legacy provider
    var providerEl  = document.getElementById('visitDetailProvider');
    var typeEl      = document.getElementById('visitDetailType');
    // Default type from visit record (legacy or visit type)
    typeEl.textContent = visit.providerType || visit.type || '\u2014';

    if (visit.providerContactId) {
        providerEl.innerHTML = 'Loading\u2026';
        userCol('people').doc(visit.providerContactId).get().then(function(snap) {
            var name = snap.exists ? (snap.data().name || visit.providerContactId) : visit.providerContactId;
            providerEl.innerHTML = '<a href="#contact/' + visit.providerContactId + '" class="appt-contact-link">' + escapeHtml(name) + '</a>';
            // Pull provider type from contact specialty if available
            if (snap.exists && snap.data().specialty) {
                typeEl.textContent = snap.data().specialty;
            }
        }).catch(function() { providerEl.textContent = visit.providerContactId; });
    } else if (visit.providerText) {
        providerEl.textContent = visit.providerText;
    } else {
        providerEl.textContent = visit.provider || '\u2014';
    }
    document.getElementById('visitDetailReason').textContent   = visit.reason       || '\u2014';
    document.getElementById('visitDetailWhatDone').textContent = visit.whatWasDone  || '\u2014';
    document.getElementById('visitDetailOutcome').textContent  = visit.outcome      || '\u2014';
    document.getElementById('visitDetailCost').textContent     = visit.cost ? '$' + visit.cost : '\u2014';
    document.getElementById('visitDetailNotes').textContent    = visit.notes        || '\u2014';

    // Legacy single-concern link (backwards compat)
    var concernSection = document.getElementById('visitDetailConcernSection');
    var concernEl      = document.getElementById('visitDetailConcern');
    if (visit.concernId) {
        concernSection.style.display = '';
        concernEl.textContent = 'Loading\u2026';
        userCol('concerns').doc(visit.concernId).get().then(function(snap) {
            concernEl.textContent = snap.exists ? (snap.data().title || visit.concernId) : 'Unknown concern';
        }).catch(function() { concernEl.textContent = visit.concernId; });
    } else {
        concernSection.style.display = 'none';
    }

    // "This visit covered" — tappable concern/condition tags from Phase 3 arrays
    var coveredSection = document.getElementById('visitDetailCoveredSection');
    var coveredTags    = document.getElementById('visitDetailCoveredTags');
    var concernIds   = visit.concernIds   || [];
    var conditionIds = visit.conditionIds || [];
    if (concernIds.length > 0 || conditionIds.length > 0) {
        coveredSection.style.display = '';
        coveredTags.innerHTML = '<span style="color:#94a3b8; font-size:0.85rem;">Loading\u2026</span>';
        try {
            var fetches = [];
            concernIds.forEach(function(cid) {
                fetches.push(userCol('concerns').doc(cid).get().then(function(s) {
                    return { id: cid, kind: 'concern', title: s.exists ? (s.data().title || cid) : cid };
                }));
            });
            conditionIds.forEach(function(cid) {
                fetches.push(userCol('conditions').doc(cid).get().then(function(s) {
                    return { id: cid, kind: 'condition', title: s.exists ? (s.data().title || cid) : cid };
                }));
            });
            var coveredItems = await Promise.all(fetches);
            coveredTags.innerHTML = coveredItems.map(function(item) {
                var icon = item.kind === 'concern' ? '\u26a0\ufe0f' : '\ud83d\udccb';
                var href = item.kind === 'concern'
                    ? '#health-concern/' + item.id
                    : '#health-condition/' + item.id;
                return '<a href="' + href + '" class="health-chip health-chip--' + item.kind + ' health-chip--link">' +
                    icon + ' ' + escapeHtml(item.title) + '</a>';
            }).join('');
        } catch(e) {
            coveredTags.innerHTML = '<span style="color:#dc2626; font-size:0.85rem;">Error loading</span>';
        }
    } else {
        coveredSection.style.display = 'none';
    }

    // Photos
    loadPhotos('healthVisit', visit.id, 'visitPhotoContainer', 'visitPhotoEmptyState');

    // Linked records
    loadVisitLinkedNotes(visit.id);
    loadVisitLinkedMeds(visit.id);
    loadVisitLinkedConditions(visit.id);
    loadVisitLinkedBloodWork(visit.id);

    // Journal button — "View Journal" if already linked, "Create Journal" otherwise
    _updateVisitJournalBtn(visit);
}

/**
 * Set the visit journal button label based on whether a linked journal entry exists.
 * If the visit has a linkedJournalEntryId, verify it still exists in Firestore
 * (guards against stale links if the user deleted the journal entry).
 */
async function _updateVisitJournalBtn(visit) {
    var btn = document.getElementById('visitJournalBtn');
    if (!btn) return;
    btn.disabled = false;   // always re-enable on page load (may have been disabled during creation)
    if (visit.linkedJournalEntryId) {
        try {
            var snap = await userCol('journalEntries').doc(visit.linkedJournalEntryId).get();
            if (snap.exists) {
                btn.textContent = 'View Journal';
                return;
            }
            // Stale link — clear it silently
            userCol('healthVisits').doc(visit.id).update({ linkedJournalEntryId: null }).catch(function(){});
            window.currentHealthVisit.linkedJournalEntryId = null;
        } catch(e) { /* ignore — fall through to default */ }
    }
    btn.textContent = 'Create Journal';
}

/**
 * Dispatched by the Visit Journal button.
 * Either opens the existing linked journal entry or starts creation.
 */
function visitJournalAction() {
    var visit = window.currentHealthVisit;
    if (!visit) return;
    if (visit.linkedJournalEntryId) {
        // Navigate to the existing journal entry in edit mode
        openEditJournalEntry(visit.linkedJournalEntryId);
    } else {
        createVisitJournalEntry();
    }
}

/**
 * Gather all visit data (including async sub-collections) and open the journal
 * entry form pre-populated with labeled lines.
 * If an LLM is configured, prompts the user to have AI write the entry.
 */
async function createVisitJournalEntry() {
    var visit = window.currentHealthVisit;
    if (!visit) return;
    var btn = document.getElementById('visitJournalBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Loading…'; }

    try {
        // --- Resolve facility name ---
        var facilityName = '';
        if (visit.facilityContactId) {
            var fSnap = await userCol('people').doc(visit.facilityContactId).get();
            facilityName = fSnap.exists ? (fSnap.data().name || '') : '';
        } else if (visit.facilityText) {
            facilityName = visit.facilityText;
        }

        // --- Resolve provider name ---
        var providerName = visit.providerText || visit.provider || '';
        if (visit.providerContactId) {
            var pSnap = await userCol('people').doc(visit.providerContactId).get();
            if (pSnap.exists) providerName = pSnap.data().name || providerName;
        }

        // --- Resolve concern/condition names covered ---
        var coveredNames = [];
        var concernIds   = visit.concernIds   || [];
        var conditionIds = visit.conditionIds || [];
        await Promise.all([
            ...concernIds.map(async function(cid) {
                var s = await userCol('concerns').doc(cid).get();
                if (s.exists) coveredNames.push(s.data().title || cid);
            }),
            ...conditionIds.map(async function(cid) {
                var s = await userCol('conditions').doc(cid).get();
                if (s.exists) coveredNames.push(s.data().name || cid);
            })
        ]);

        // --- Visit notes (from concernUpdates + healthConditionLogs) ---
        var [cUpdateSnap, condLogSnap] = await Promise.all([
            userCol('concernUpdates').where('visitId', '==', visit.id).get(),
            userCol('healthConditionLogs').where('visitId', '==', visit.id).get()
        ]);
        var visitNoteLines = [];
        await Promise.all([
            ...cUpdateSnap.docs.filter(function(d) { return d.data().note; }).map(async function(d) {
                var u = d.data();
                var ns = await userCol('concerns').doc(u.concernId).get();
                var name = ns.exists ? (ns.data().title || u.concernId) : u.concernId;
                visitNoteLines.push(name + ': ' + u.note);
            }),
            ...condLogSnap.docs.filter(function(d) { return d.data().note; }).map(async function(d) {
                var u = d.data();
                var ns = await userCol('conditions').doc(u.conditionId).get();
                var name = ns.exists ? (ns.data().name || u.conditionId) : u.conditionId;
                visitNoteLines.push(name + ': ' + u.note);
            })
        ]);

        // --- Medications prescribed at this visit ---
        var medSnap = await userCol('medications').where('prescribedAtVisitId', '==', visit.id).get();
        var medLines = medSnap.docs.map(function(d) {
            var m = d.data();
            return m.name + (m.dosage ? ' — ' + m.dosage : '');
        }).filter(Boolean);

        // --- Blood work ordered at this visit ---
        var bwSnap = await userCol('bloodWorkRecords').where('orderedAtVisitId', '==', visit.id).get();

        // --- Check if LLM is configured ---
        var llmDoc = await userCol('settings').doc('llm').get();
        var useLLM = false;
        if (llmDoc.exists) {
            var llmCfg = llmDoc.data();
            if (llmCfg.provider && llmCfg.apiKey) {
                useLLM = confirm('Have AI create entry?');
            }
        }

        if (useLLM) {
            // ── AI path ─────────────────────────────────────────────────────
            if (btn) btn.textContent = 'AI Writing…';

            var llmCfg = llmDoc.data();
            var provider = llmCfg.provider;
            var apiKey   = llmCfg.apiKey;
            var model    = llmCfg.model || '';

            // Build the full visit context for the LLM prompt
            var ctx = [];
            var addCtx = function(label, value) {
                if (value && String(value).trim()) ctx.push(label + ': ' + String(value).trim());
            };
            addCtx('Date',             visit.date);
            addCtx('Time',             visit.time);
            addCtx('Facility',         facilityName);
            addCtx('Provider',         providerName);
            addCtx('Provider Type',    visit.providerType);
            addCtx('Reason for Visit', visit.reason);
            addCtx('What Was Done',    visit.whatWasDone);
            addCtx('Outcome / Next Steps', visit.outcome);
            addCtx('Cost',             visit.cost ? '$' + visit.cost : '');
            addCtx('Notes',            visit.notes);
            if (coveredNames.length > 0) {
                ctx.push('Concerns / Conditions Addressed: ' + coveredNames.join(', '));
            }
            if (visitNoteLines.length > 0) {
                ctx.push('Visit Notes:\n' + visitNoteLines.map(function(l) { return '  ' + l; }).join('\n'));
            }
            if (medLines.length > 0) {
                ctx.push('Medications Prescribed:\n' + medLines.map(function(l) { return '  ' + l; }).join('\n'));
            }

            // Blood work results
            if (!bwSnap.empty) {
                bwSnap.docs.forEach(function(d) {
                    var bw = d.data();
                    var bwLines = ['Blood Work — ' + (bw.date || 'Date unknown') + (bw.lab ? ' at ' + bw.lab : '')];
                    if (bw.notes) bwLines.push('  Notes: ' + bw.notes);
                    (bw.markers || []).forEach(function(m) {
                        var markerLine = '  ' + m.name + ': ' + m.value + (m.unit ? ' ' + m.unit : '');
                        if (m.flagged) markerLine += ' [FLAGGED]';
                        if (m.note)    markerLine += ' — ' + m.note;
                        bwLines.push(markerLine);
                    });
                    ctx.push(bwLines.join('\n'));
                });
            }

            // Full history for each addressed concern (all prior updates, not just this visit)
            await Promise.all(concernIds.map(async function(cid) {
                var [concernSnap, allUpdates] = await Promise.all([
                    userCol('concerns').doc(cid).get(),
                    userCol('concernUpdates').where('concernId', '==', cid).orderBy('date', 'asc').get().catch(function() {
                        // fallback without orderBy if no index
                        return userCol('concernUpdates').where('concernId', '==', cid).get();
                    })
                ]);
                if (!concernSnap.exists) return;
                var c = concernSnap.data();
                var histLines = ['Concern History — ' + (c.title || cid)];
                if (c.description) histLines.push('  Description: ' + c.description);
                if (c.status)      histLines.push('  Status: ' + c.status);
                allUpdates.docs.forEach(function(ud) {
                    var u = ud.data();
                    if (!u.note && !u.status) return;
                    var line = '  [' + (u.date || '?') + ']';
                    if (u.status) line += ' Status: ' + u.status;
                    if (u.note)   line += ' — ' + u.note;
                    histLines.push(line);
                });
                ctx.push(histLines.join('\n'));
            }));

            // Full history for each addressed condition (all prior logs, not just this visit)
            await Promise.all(conditionIds.map(async function(cid) {
                var [condSnap, allLogs] = await Promise.all([
                    userCol('conditions').doc(cid).get(),
                    userCol('healthConditionLogs').where('conditionId', '==', cid).orderBy('date', 'asc').get().catch(function() {
                        return userCol('healthConditionLogs').where('conditionId', '==', cid).get();
                    })
                ]);
                if (!condSnap.exists) return;
                var c = condSnap.data();
                var histLines = ['Condition History — ' + (c.name || cid)];
                if (c.description) histLines.push('  Description: ' + c.description);
                if (c.status)      histLines.push('  Status: ' + c.status);
                if (c.diagnosedDate) histLines.push('  Diagnosed: ' + c.diagnosedDate);
                allLogs.docs.forEach(function(ld) {
                    var l = ld.data();
                    if (!l.note && !l.status) return;
                    var line = '  [' + (l.date || '?') + ']';
                    if (l.status) line += ' Status: ' + l.status;
                    if (l.note)   line += ' — ' + l.note;
                    histLines.push(line);
                });
                ctx.push(histLines.join('\n'));
            }));

            var systemPrompt =
                'You are a compassionate writing assistant helping someone write a personal health journal entry. ' +
                'Write in first person, conversational tone — this is NOT a clinical note, it is a personal journal. ' +
                'Focus on how the person might feel about the visit, what they learned, and what comes next. ' +
                'Keep it concise (3–6 sentences) unless the detail warrants more. ' +
                'Do not use medical jargon. Do not invent information not provided. Output plain text only — no headers, no bullet points.';

            var userPrompt =
                'Here is the information from my medical visit. Please write a personal journal entry about it.\n\n' +
                ctx.join('\n\n');

            // Resolve provider endpoint and model
            var endpoint, llmModel;
            if (provider === 'openai') {
                endpoint = 'https://api.openai.com/v1/chat/completions';
                llmModel = model || 'gpt-4o';
            } else if (provider === 'anthropic') {
                endpoint = 'https://api.anthropic.com/v1/messages';
                llmModel = model || 'claude-opus-4-6';
            } else if (provider === 'grok') {
                endpoint = 'https://api.x.ai/v1/chat/completions';
                llmModel = model || 'grok-3-mini';
            } else if (provider === 'openrouter') {
                endpoint = 'https://openrouter.ai/api/v1/chat/completions';
                llmModel = model || 'openai/gpt-4o';
            } else {
                throw new Error('Unknown LLM provider: ' + provider);
            }

            var tokenParam = (provider === 'openai') ? 'max_completion_tokens' : 'max_tokens';
            var reqBody = {
                model    : llmModel,
                messages : [
                    { role: 'user', content: userPrompt }
                ]
            };
            reqBody[tokenParam] = 1000;

            var headers = {
                'Content-Type'  : 'application/json',
                'Authorization' : 'Bearer ' + apiKey
            };
            if (provider === 'anthropic') {
                headers['x-api-key'] = apiKey;
                delete headers['Authorization'];
                headers['anthropic-version'] = '2023-06-01';
                reqBody.system = systemPrompt;
            } else {
                // For OpenAI-compatible providers, prepend system message
                reqBody.messages.unshift({ role: 'system', content: systemPrompt });
            }

            var response = await fetch(endpoint, {
                method  : 'POST',
                headers : headers,
                body    : JSON.stringify(reqBody)
            });
            if (!response.ok) {
                var errText = await response.text();
                throw new Error('LLM error ' + response.status + ': ' + errText.slice(0, 200));
            }
            var data = await response.json();
            var aiText = (data.choices && data.choices[0] && data.choices[0].message)
                ? data.choices[0].message.content
                : (data.content && data.content[0] ? data.content[0].text : '');

            openVisitJournalEntryPreFilled(visit.date, visit.time || '', aiText.trim(), visit.id);

        } else {
            // ── Manual path — assemble labeled lines ──────────────────────
            var lines = [];
            var add = function(label, value) {
                if (value && value.trim()) lines.push(label + ': ' + value.trim());
            };
            add('Facility',        facilityName);
            add('Provider',        providerName);
            add('Provider Type',   visit.providerType || '');
            add('Reason for Visit', visit.reason       || '');
            add('What Was Done',   visit.whatWasDone   || '');
            add('Outcome / Next Steps', visit.outcome  || '');
            add('Cost',            visit.cost ? '$' + visit.cost : '');
            add('Notes',           visit.notes         || '');
            if (coveredNames.length > 0)   lines.push('Conditions / Concerns: ' + coveredNames.join(', '));
            if (visitNoteLines.length > 0) lines.push('Visit Notes:\n' + visitNoteLines.map(function(l) { return '  ' + l; }).join('\n'));
            if (medLines.length > 0)       lines.push('Medications Prescribed:\n' + medLines.map(function(l) { return '  ' + l; }).join('\n'));

            // Blood work summary (manual path)
            if (!bwSnap.empty) {
                var bwSummary = bwSnap.docs.map(function(d) {
                    var bw = d.data();
                    return (bw.date || 'Date unknown') + (bw.lab ? ' at ' + bw.lab : '');
                });
                lines.push('Blood Work: ' + bwSummary.join('; '));
            }

            var preText = lines.join('\n');
            openVisitJournalEntryPreFilled(visit.date, visit.time || '', preText, visit.id);
        }

    } catch(err) {
        console.error('createVisitJournalEntry error:', err);
        alert('Error preparing journal entry. See console for details.');
        if (btn) { btn.disabled = false; btn.textContent = 'Create Journal'; }
    }
}

function loadVisitLinkedMeds(visitId) {
    var el = document.getElementById('visitMedsContainer');
    if (!el) return;
    el.innerHTML = '';
    userCol('medications').where('prescribedAtVisitId', '==', visitId).get()
        .then(function(snap) {
            if (snap.empty) { el.innerHTML = '<p class="empty-state">None recorded.</p>'; return; }
            snap.docs.forEach(function(d) {
                var m = d.data();
                var row = document.createElement('div');
                row.className = 'health-linked-item';
                row.textContent = (m.name || '\u2014') + (m.dosage ? ' \u2014 ' + m.dosage : '');
                el.appendChild(row);
            });
        }).catch(function() { el.innerHTML = '<p class="empty-state">\u2014</p>'; });
}

/**
 * Load notes saved from this visit (from concernUpdates and healthConditionLogs)
 * and display them as "Name — note" rows. Hidden when no notes exist.
 */
async function loadVisitLinkedNotes(visitId) {
    var section = document.getElementById('visitNotesSection');
    var el      = document.getElementById('visitNotesContainer');
    if (!section || !el) return;
    el.innerHTML = '';

    try {
        var [concernSnap, conditionSnap] = await Promise.all([
            userCol('concernUpdates').where('visitId',    '==', visitId).get(),
            userCol('healthConditionLogs').where('visitId', '==', visitId).get()
        ]);

        var rows = [];

        // Concerns: load names in parallel
        var cUpdates = concernSnap.docs.filter(function(d) { return d.data().note; });
        var condUpdates = conditionSnap.docs.filter(function(d) { return d.data().note; });

        await Promise.all(cUpdates.map(async function(d) {
            var u = d.data();
            var nameSnap = await userCol('concerns').doc(u.concernId).get();
            var name = nameSnap.exists ? (nameSnap.data().title || u.concernId) : u.concernId;
            rows.push({ kind: 'concern', name: name, note: u.note });
        }));

        await Promise.all(condUpdates.map(async function(d) {
            var u = d.data();
            var nameSnap = await userCol('conditions').doc(u.conditionId).get();
            var name = nameSnap.exists ? (nameSnap.data().name || u.conditionId) : u.conditionId;
            rows.push({ kind: 'condition', name: name, note: u.note });
        }));

        if (rows.length === 0) {
            section.style.display = 'none';
            return;
        }

        rows.forEach(function(r) {
            var icon = r.kind === 'concern' ? '\u26a0\ufe0f' : '\ud83d\udccb';
            var row = document.createElement('div');
            row.className = 'health-linked-item health-linked-item--note';
            row.innerHTML =
                '<div class="health-linked-item-title">' + icon + ' ' + escapeHtml(r.name) + '</div>' +
                '<div class="health-linked-item-note">' + escapeHtml(r.note) + '</div>';
            el.appendChild(row);
        });
        section.style.display = '';

    } catch(err) {
        console.error('loadVisitLinkedNotes:', err);
        section.style.display = 'none';
    }
}

function loadVisitLinkedConditions(visitId) {
    var el = document.getElementById('visitConditionsContainer');
    if (!el) return;
    el.innerHTML = '';
    userCol('conditions').where('diagnosedAtVisitId', '==', visitId).get()
        .then(function(snap) {
            if (snap.empty) { el.innerHTML = '<p class="empty-state">None recorded.</p>'; return; }
            snap.docs.forEach(function(d) {
                var row = document.createElement('div');
                row.className = 'health-linked-item';
                row.textContent = d.data().name || '\u2014';
                el.appendChild(row);
            });
        }).catch(function() { el.innerHTML = '<p class="empty-state">\u2014</p>'; });
}

function loadVisitLinkedBloodWork(visitId) {
    var el = document.getElementById('visitBloodWorkContainer');
    if (!el) return;
    el.innerHTML = '';
    userCol('bloodWorkRecords').where('orderedAtVisitId', '==', visitId).get()
        .then(function(snap) {
            if (snap.empty) { el.innerHTML = '<p class="empty-state">None recorded.</p>'; return; }
            snap.docs.forEach(function(d) {
                var bw  = d.data();
                var row = document.createElement('div');
                row.className = 'health-linked-item health-linked-item--clickable';
                row.onclick   = function() { location.hash = '#health-bloodwork/' + d.id; };
                var markerCount = (bw.markers && bw.markers.length) ? ' (' + bw.markers.length + ' markers)' : '';
                row.textContent = (bw.date || '\u2014') + (bw.lab ? ' \u2014 ' + bw.lab : '') + markerCount;
                el.appendChild(row);
            });
        }).catch(function() { el.innerHTML = '<p class="empty-state">\u2014</p>'; });
}

// ── Add / Edit modal ──────────────────────────────────────────────

async function openVisitModal(id) {
    var modal = document.getElementById('visitModal');
    modal.dataset.editId = id || '';
    modal.dataset.concernRestore = '';
    document.getElementById('visitModalTitle').textContent = id ? 'Edit Visit' : 'Add Visit';

    ['visitDate','visitProvider','visitReason','visitWhatDone',
     'visitOutcome','visitCost','visitNotes'].forEach(function(f) {
        document.getElementById(f).value = '';
    });
    document.getElementById('visitProviderType').value = '';

    var checkedConcernIds   = [];
    var checkedConditionIds = [];

    if (id) {
        try {
            var vSnap = await userCol('healthVisits').doc(id).get();
            if (vSnap.exists) {
                var d = vSnap.data();
                document.getElementById('visitDate').value         = d.date         || '';
                // Prefer new providerText field, fall back to legacy provider
                document.getElementById('visitProvider').value     = d.providerText || d.provider || '';
                document.getElementById('visitProviderType').value = d.providerType || '';
                document.getElementById('visitReason').value       = d.reason       || '';
                document.getElementById('visitWhatDone').value     = d.whatWasDone  || '';
                document.getElementById('visitOutcome').value      = d.outcome      || '';
                document.getElementById('visitCost').value         = d.cost         || '';
                document.getElementById('visitNotes').value        = d.notes        || '';
                checkedConcernIds   = d.concernIds   || (d.concernId ? [d.concernId] : []);
                checkedConditionIds = d.conditionIds || [];
            }
        } catch(e) { /* ignore — fields stay blank */ }
    }

    // Build concerns & conditions checkbox list (same pattern as appointment modal)
    var ccList = document.getElementById('visitCCList');
    ccList.innerHTML = '<p style="margin:4px 0; font-size:0.85rem; color:#64748b;">Loading...</p>';
    try {
        var ccResults = await Promise.all([
            userCol('concerns').where('status', '==', 'open').get(),
            userCol('conditions').where('status', 'in', ['active', 'managed']).get()
        ]);
        var items = [];
        ccResults[0].docs.forEach(function(cd) {
            items.push({ id: cd.id, kind: 'concern',   label: '\u26a0\ufe0f ' + (cd.data().title || cd.id) });
        });
        ccResults[1].docs.forEach(function(cd) {
            items.push({ id: cd.id, kind: 'condition', label: '\ud83d\udccb ' + (cd.data().name  || cd.id) });
        });
        if (items.length === 0) {
            ccList.innerHTML = '<p style="margin:4px 0; font-size:0.85rem; color:#94a3b8;">No open concerns or active conditions.</p>';
        } else {
            items.sort(function(a, b) { return a.label.localeCompare(b.label); });
            ccList.innerHTML = items.map(function(item) {
                var checked = (item.kind === 'concern'   && checkedConcernIds.indexOf(item.id)   !== -1) ||
                              (item.kind === 'condition' && checkedConditionIds.indexOf(item.id) !== -1)
                    ? 'checked' : '';
                return '<label class="appt-concern-item">' +
                    '<input type="checkbox" value="' + item.id + '" data-kind="' + item.kind + '" ' + checked + '> ' +
                    escapeHtml(item.label) + '</label>';
            }).join('');
        }
    } catch(e) {
        ccList.innerHTML = '<p style="margin:4px 0; font-size:0.85rem; color:#dc2626;">Error loading</p>';
    }

    openModal('visitModal');
}

function saveVisit() {
    var date = document.getElementById('visitDate').value;
    if (!date) { alert('Date is required.'); return; }

    // Collect checked concerns and conditions
    var concernIds   = [];
    var conditionIds = [];
    document.querySelectorAll('#visitCCList input[type="checkbox"]:checked').forEach(function(cb) {
        if (cb.dataset.kind === 'concern')   concernIds.push(cb.value);
        if (cb.dataset.kind === 'condition') conditionIds.push(cb.value);
    });

    var providerText = document.getElementById('visitProvider').value.trim();
    var data = {
        date:         date,
        providerText: providerText,
        provider:     providerText,   // keep legacy field in sync for old views
        providerType: document.getElementById('visitProviderType').value,
        concernIds:   concernIds,
        conditionIds: conditionIds,
        reason:       document.getElementById('visitReason').value.trim(),
        whatWasDone:  document.getElementById('visitWhatDone').value.trim(),
        outcome:      document.getElementById('visitOutcome').value.trim(),
        cost:         document.getElementById('visitCost').value.trim(),
        notes:        document.getElementById('visitNotes').value.trim()
    };

    var modal  = document.getElementById('visitModal');
    var editId = modal.dataset.editId;
    var p;
    if (editId) {
        p = userCol('healthVisits').doc(editId).update(data).then(function() { return editId; });
    } else {
        data.contactId = null;
        data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        p = userCol('healthVisits').add(data).then(function(ref) { return ref.id; });
    }

    p.then(function(id) {
        document.getElementById('visitModal').classList.remove('open');
        history.replaceState(null, '', '#health-visit/' + id);
        handleRoute();
    }).catch(function(err) {
        alert('Error saving visit: ' + err.message);
    });
}

function editCurrentVisit() {
    if (window.currentHealthVisit) openVisitModal(window.currentHealthVisit.id);
}

function deleteCurrentVisit() {
    if (!window.currentHealthVisit) return;
    if (!confirm('Delete this visit record? Photos will not be deleted.')) return;
    userCol('healthVisits').doc(window.currentHealthVisit.id).delete()
        .then(function() { location.hash = '#health-visits'; })
        .catch(function(err) { alert('Error deleting: ' + err.message); });
}

// =================================================================
//  MEDICATIONS (H3)
// =================================================================

function loadMedicationsPage() {
    var activeList  = document.getElementById('medicationActiveList');
    var histList    = document.getElementById('medicationHistList');
    var histSection = document.getElementById('medicationHistSection');
    if (!activeList) return;
    activeList.innerHTML = '<p class="empty-state">Loading\u2026</p>';

    userCol('medications').orderBy('name').get()
        .then(function(snap) {
            var active = [], hist = [];
            snap.docs.forEach(function(d) {
                var rec = Object.assign({ id: d.id }, d.data());
                if (rec.status === 'completed') hist.push(rec); else active.push(rec);
            });

            if (active.length === 0) {
                activeList.innerHTML = '<p class="empty-state">No current medications. Tap + Add to add one.</p>';
            } else {
                activeList.innerHTML = '';
                active.forEach(function(rec) { activeList.appendChild(buildMedCard(rec)); });
            }

            if (hist.length === 0) {
                histSection.style.display = 'none';
            } else {
                histSection.style.display = '';
                histList.innerHTML = '';
                hist.forEach(function(rec) { histList.appendChild(buildMedCard(rec)); });
            }
        })
        .catch(function(err) {
            activeList.innerHTML = '<p class="empty-state">Error loading medications.</p>';
            console.error('loadMedicationsPage:', err);
        });
}

function buildMedCard(doc) {
    var isCompleted = doc.status === 'completed';
    var div = document.createElement('div');
    div.className = 'health-card' + (isCompleted ? ' health-card--dim' : '');
    var dosage = doc.dosage ? ' \u2014 ' + escapeHtml(doc.dosage) : '';
    var typeBadge = doc.type ? '<span class="health-badge">' + escapeHtml(doc.type) + '</span>' : '';
    var dates = isCompleted
        ? '<div class="health-card-sub">' + escapeHtml(doc.startDate || '') + ' \u2192 ' + escapeHtml(doc.endDate || '') + '</div>'
        : (doc.startDate ? '<div class="health-card-sub">Since ' + escapeHtml(doc.startDate) + '</div>' : '');

    div.innerHTML =
        '<div class="health-card-main">' +
            '<div class="health-card-title">' + escapeHtml(doc.name || '') + dosage + '</div>' +
            '<div class="health-card-meta">' + typeBadge + '</div>' +
            (doc.purpose ? '<div class="health-card-sub">' + escapeHtml(doc.purpose) + '</div>' : '') +
            dates +
        '</div>' +
        '<div class="health-card-actions">' +
            '<button class="btn btn-secondary btn-small" onclick="openMedModal(\'' + doc.id + '\')">Edit</button>' +
            '<button class="btn btn-secondary btn-small" onclick="openMedPhotoModal(\'' + doc.id + '\')">Photos</button>' +
            (!isCompleted ? '<button class="btn btn-secondary btn-small" onclick="markMedDone(\'' + doc.id + '\')">Done</button>' : '') +
            '<button class="btn btn-danger btn-small" onclick="deleteMed(\'' + doc.id + '\')">Delete</button>' +
        '</div>';
    return div;
}

/* Populate the "Prescribed at Visit" dropdown used in medication and condition modals. */
function populateVisitDropdown(selectId, selectedVisitId) {
    var sel = document.getElementById(selectId);
    if (!sel) return;
    sel.innerHTML = '<option value="">\u2014 Not linked to a visit \u2014</option>';
    userCol('healthVisits').orderBy('date', 'desc').limit(60).get()
        .then(function(snap) {
            snap.docs.forEach(function(d) {
                var v = d.data();
                var opt = document.createElement('option');
                opt.value = d.id;
                opt.textContent = (v.date || '?') + (v.provider ? ' \u2014 ' + v.provider : '');
                sel.appendChild(opt);
            });
            if (selectedVisitId) sel.value = selectedVisitId;
        }).catch(function() {});
}

// ── Medication Photos ────────────────────────────────────────────────────────

/**
 * Opens the photo viewer modal for a specific medication.
 * Uses a fixed container (medPhotoContainer) shared across all medications —
 * the current medication ID is stored in window._medPhotoModalId.
 */
function openMedPhotoModal(id) {
    window._medPhotoModalId = id;
    loadPhotos('medication', id, 'medPhotoContainer', 'medPhotoEmptyState');
    openModal('medPhotoModal');
}

// ── Scan Rx Label (LLM Vision) ───────────────────────────────────────────────

/**
 * Triggers the appropriate image source for scanning a prescription label.
 * mode: 'camera'  — opens device camera (mobile)
 *       'gallery' — opens file/photo picker
 *       'paste'   — reads image from clipboard
 */
async function _medScanRx(mode) {
    if (mode === 'paste') {
        if (!navigator.clipboard || !navigator.clipboard.read) {
            alert('Clipboard paste is not supported in this browser. Try Camera or Gallery instead.');
            return;
        }
        try {
            var items = await navigator.clipboard.read();
            var imageBlob = null;
            for (var i = 0; i < items.length; i++) {
                var imageType = items[i].types.find(function(t) { return t.startsWith('image/'); });
                if (imageType) { imageBlob = await items[i].getType(imageType); break; }
            }
            if (!imageBlob) {
                alert('No image on the clipboard.\n\nRight-click an image and choose "Copy image", then click Paste.');
                return;
            }
            var ext  = imageBlob.type === 'image/png' ? '.png' : '.jpg';
            var file = new File([imageBlob], 'pasted-rx' + ext, { type: imageBlob.type });
            await _medProcessRxFile(file);
        } catch (err) {
            if (err.name === 'NotAllowedError') {
                alert('Clipboard access was denied. Click "Allow" when the browser asks, then try again.');
            } else {
                alert('Could not read clipboard: ' + err.message);
            }
        }
        return;
    }

    // Camera or Gallery — use a temporary file input
    var input = document.getElementById('medRxScanInput');
    input.value = '';
    if (mode === 'camera') {
        input.setAttribute('capture', 'environment');
    } else {
        input.removeAttribute('capture');
    }
    input.click();
}

/**
 * Called when the user selects a file via the hidden file input.
 */
async function _medHandleRxScan(input) {
    if (!input.files || !input.files[0]) return;
    await _medProcessRxFile(input.files[0]);
}

/**
 * Compresses an image file, sends it to the LLM for prescription data
 * extraction, and auto-populates the medication form fields.
 * Also stores the compressed image so saveMed() can attach it as a photo.
 */
async function _medProcessRxFile(file) {
    var statusEl = document.getElementById('medScanStatus');

    statusEl.textContent = 'Compressing image…';
    var base64DataUrl;
    try {
        base64DataUrl = await compressImage(file);
    } catch (e) {
        statusEl.textContent = 'Error compressing image.';
        console.error('_medProcessRxFile compress:', e);
        return;
    }

    // Store so saveMed() can attach it as a photo after saving
    document.getElementById('medicationModal').dataset.pendingRxPhoto = base64DataUrl;

    statusEl.textContent = 'Reading label with AI…';
    var parsed;
    try {
        parsed = await _medCallLLMVision(base64DataUrl);
    } catch (e) {
        statusEl.textContent = 'AI error: ' + e.message;
        console.error('_medProcessRxFile LLM:', e);
        return;
    }

    // Populate form fields — only overwrite if the LLM returned a value
    if (parsed.name)          document.getElementById('medName').value         = parsed.name;
    if (parsed.dosage)        document.getElementById('medDosage').value       = parsed.dosage;
    if (parsed.prescribedBy)  document.getElementById('medPrescribedBy').value = parsed.prescribedBy;
    if (parsed.startDate)     document.getElementById('medStartDate').value    = parsed.startDate;
    if (parsed.type)          document.getElementById('medType').value         = parsed.type;
    if (parsed.notes)         document.getElementById('medNotes').value        = parsed.notes;

    statusEl.textContent = '✓ Fields filled — review and save.';
}

/**
 * Calls the configured LLM with a vision prompt to extract prescription data
 * from a Base64 image.  Returns a plain object with the extracted fields.
 *
 * Extracted fields: name, dosage, prescribedBy, startDate, type, notes.
 */
async function _medCallLLMVision(base64DataUrl) {
    var doc = await userCol('settings').doc('llm').get();
    if (!doc.exists) throw new Error('LLM not configured. Go to Settings → QuickLog to add your API key.');

    var cfg      = doc.data();
    var provider = cfg.provider || 'openai';
    var apiKey   = cfg.apiKey   || '';
    var model    = cfg.model    || '';

    var ENDPOINTS = {
        openai: { url: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o' },
        grok:   { url: 'https://api.x.ai/v1/chat/completions',       model: 'grok-2-vision-1212' }
    };
    var ep = ENDPOINTS[provider] || ENDPOINTS.openai;

    var systemPrompt =
        'You are a prescription label reader. Extract medication information from the image ' +
        'and return ONLY a valid JSON object with these fields:\n' +
        '  name        – drug name and strength (e.g. "Albendazole 200 MG")\n' +
        '  dosage      – dosage instructions including qty and days supply (e.g. "200mg, 4 tablets, 2-day supply")\n' +
        '  prescribedBy – prescriber name only (e.g. "Nathan Szakal")\n' +
        '  startDate   – fill date as YYYY-MM-DD (e.g. "2026-04-07")\n' +
        '  type        – one of: "Ongoing", "Short-term", "As-needed" — infer from days supply\n' +
        '  notes       – one compact line: Rx#, NDC, qty, refills, insurance savings if shown\n' +
        'Return ONLY the JSON object, no markdown, no explanation.';

    var res = await fetch(ep.url, {
        method : 'POST',
        headers: {
            'Content-Type' : 'application/json',
            'Authorization': 'Bearer ' + apiKey
        },
        body: JSON.stringify({
            model: model || ep.model,
            max_completion_tokens: 400,
            messages: [{
                role: 'user',
                content: [
                    { type: 'text',      text: systemPrompt },
                    { type: 'image_url', image_url: { url: base64DataUrl, detail: 'high' } }
                ]
            }]
        })
    });

    if (!res.ok) {
        var errBody = await res.text();
        throw new Error('LLM error ' + res.status + ': ' + errBody.slice(0, 200));
    }
    var json    = await res.json();
    var content = json.choices[0].message.content.trim();

    // Strip markdown code fences if the model added them
    content = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

    try {
        return JSON.parse(content);
    } catch (e) {
        throw new Error('Could not parse LLM response: ' + content.slice(0, 100));
    }
}

/**
 * Open the Add/Edit Medication modal.
 * @param {string|null} id        - Medication doc ID to edit, or null for new.
 * @param {object}      [options] - Optional: { presetVisitId: string } pre-selects
 *                                  the "Prescribed at Visit" dropdown (used when
 *                                  opening from Step 2 where the visit is known).
 */
function openMedModal(id, options) {
    var modal = document.getElementById('medicationModal');
    modal.dataset.editId = id || '';
    document.getElementById('medicationModalTitle').textContent = id ? 'Edit Medication' : 'Add Medication';

    ['medName','medDosage','medPurpose','medPrescribedBy','medStartDate','medEndDate','medNotes'].forEach(function(f) {
        document.getElementById(f).value = '';
    });
    document.getElementById('medType').value   = '';
    document.getElementById('medStatus').value = 'active';
    document.getElementById('medScanStatus').textContent = '';
    document.getElementById('medicationModal').dataset.pendingRxPhoto = '';

    var visitId = '';
    if (id) {
        userCol('medications').doc(id).get().then(function(snap) {
            if (!snap.exists) return;
            var d = snap.data();
            document.getElementById('medName').value         = d.name         || '';
            document.getElementById('medDosage').value       = d.dosage       || '';
            document.getElementById('medType').value         = d.type         || '';
            document.getElementById('medPurpose').value      = d.purpose      || '';
            document.getElementById('medPrescribedBy').value = d.prescribedBy || '';
            document.getElementById('medStartDate').value    = d.startDate    || '';
            document.getElementById('medEndDate').value      = d.endDate      || '';
            document.getElementById('medStatus').value       = d.status       || 'active';
            document.getElementById('medNotes').value        = d.notes        || '';
            visitId = d.prescribedAtVisitId || '';
            populateVisitDropdown('medVisitId', visitId);
        });
    } else {
        // Pre-select the visit if called from a context where it's already known
        var presetVisitId = (options && options.presetVisitId) ? options.presetVisitId : '';
        populateVisitDropdown('medVisitId', presetVisitId);
    }
    openModal('medicationModal');
}

function saveMed() {
    var name = document.getElementById('medName').value.trim();
    if (!name) { alert('Medication name is required.'); return; }

    var data = {
        name:                name,
        dosage:              document.getElementById('medDosage').value.trim(),
        type:                document.getElementById('medType').value,
        purpose:             document.getElementById('medPurpose').value.trim(),
        prescribedBy:        document.getElementById('medPrescribedBy').value.trim(),
        prescribedAtVisitId: document.getElementById('medVisitId').value || null,
        startDate:           document.getElementById('medStartDate').value || null,
        endDate:             document.getElementById('medEndDate').value || null,
        status:              document.getElementById('medStatus').value || 'active',
        notes:               document.getElementById('medNotes').value.trim()
    };

    var modal  = document.getElementById('medicationModal');
    var editId = modal.dataset.editId;
    var op;
    if (editId) {
        op = userCol('medications').doc(editId).update(data);
    } else {
        data.contactId = null;
        data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        op = userCol('medications').add(data);
    }
    op.then(function(ref) {
        var savedId   = ref ? ref.id : editId;  // ref is set on add, undefined on update
        var rxPhoto   = document.getElementById('medicationModal').dataset.pendingRxPhoto || '';
        // If opened from med picker, return to picker instead of navigating to medications
        var cb = window._medPickerCallback || null;
        var afterClose = cb ? function() { cb(savedId); } : function() { loadMedicationsPage(); };

        if (rxPhoto && savedId) {
            // Attach the scanned Rx receipt image as a photo on this medication
            userCol('photos').add({
                targetType : 'medication',
                targetId   : savedId,
                imageData  : rxPhoto,
                caption    : 'Rx receipt',
                createdAt  : firebase.firestore.FieldValue.serverTimestamp()
            }).catch(function(e) { console.error('Failed to save Rx photo:', e); });
        }

        closeModal('medicationModal');
        afterClose();
    }).catch(function(err) { alert('Error saving: ' + err.message); });
}

function markMedDone(id) {
    var endDate = prompt('End date (YYYY-MM-DD, or leave blank for today):');
    if (endDate === null) return;
    var today = new Date().toISOString().slice(0, 10);
    userCol('medications').doc(id).update({
        status:  'completed',
        endDate: endDate.trim() || today
    }).then(function() { loadMedicationsPage(); })
      .catch(function(err) { alert('Error: ' + err.message); });
}

function deleteMed(id) {
    if (!confirm('Delete this medication record?')) return;
    userCol('medications').doc(id).delete()
        .then(function() { loadMedicationsPage(); })
        .catch(function(err) { alert('Error deleting: ' + err.message); });
}

// =================================================================
//  CONDITIONS (H3)
// =================================================================

function loadConditionsPage() {
    var activeList  = document.getElementById('conditionActiveList');
    var resolvedList    = document.getElementById('conditionResolvedList');
    var resolvedSection = document.getElementById('conditionResolvedSection');
    if (!activeList) return;
    activeList.innerHTML = '<p class="empty-state">Loading\u2026</p>';

    userCol('conditions').get()
        .then(function(snap) {
            var active = [], resolved = [];
            snap.docs.forEach(function(d) {
                var rec = Object.assign({ id: d.id }, d.data());
                if (rec.status === 'resolved') resolved.push(rec); else active.push(rec);
            });
            // Sort each group alphabetically
            active.sort(function(a,b)   { return (a.name||'').localeCompare(b.name||''); });
            resolved.sort(function(a,b) { return (a.name||'').localeCompare(b.name||''); });

            if (active.length === 0) {
                activeList.innerHTML = '<p class="empty-state">No conditions recorded. Tap + Add to add one.</p>';
            } else {
                activeList.innerHTML = '';
                active.forEach(function(rec) { activeList.appendChild(buildConditionCard(rec)); });
            }

            if (resolved.length === 0) {
                resolvedSection.style.display = 'none';
            } else {
                resolvedSection.style.display = '';
                resolvedList.innerHTML = '';
                resolved.forEach(function(rec) { resolvedList.appendChild(buildConditionCard(rec)); });
            }
        })
        .catch(function(err) {
            activeList.innerHTML = '<p class="empty-state">Error loading conditions.</p>';
            console.error('loadConditionsPage:', err);
        });
}

function buildConditionCard(doc) {
    var isResolved = doc.status === 'resolved';
    var statusClass = 'health-badge--status-' + (doc.status || 'active');
    var div = document.createElement('div');
    div.className = 'health-card health-card--clickable' + (isResolved ? ' health-card--dim' : '');
    div.onclick = function(e) {
        // Don't navigate if a button inside was clicked
        if (e.target.closest('button')) return;
        location.hash = '#health-condition/' + doc.id;
    };
    div.innerHTML =
        '<div class="health-card-main">' +
            '<div class="health-card-title">' + escapeHtml(doc.name || '') + '</div>' +
            '<div class="health-card-meta">' +
                (doc.category ? '<span class="health-badge">' + escapeHtml(doc.category) + '</span>' : '') +
                (doc.status   ? '<span class="health-badge ' + statusClass + '">' + escapeHtml(doc.status) + '</span>' : '') +
            '</div>' +
            (doc.diagnosedDate     ? '<div class="health-card-sub">Diagnosed: ' + escapeHtml(doc.diagnosedDate) + '</div>' : '') +
            (doc.managementNotes   ? '<div class="health-card-sub">' + escapeHtml(doc.managementNotes) + '</div>' : '') +
        '</div>' +
        '<div class="health-card-arrow">\u203a</div>';
    return div;
}

function openConditionModal(id) {
    var modal = document.getElementById('conditionModal');
    modal.dataset.editId = id || '';
    document.getElementById('conditionModalTitle').textContent = id ? 'Edit Condition' : 'Add Condition';

    ['conditionName','conditionDiagnosedDate','conditionDiagnosedBy','conditionManagementNotes','conditionNotes'].forEach(function(f) {
        document.getElementById(f).value = '';
    });
    document.getElementById('conditionCategory').value = '';
    document.getElementById('conditionStatus').value   = 'active';

    if (id) {
        userCol('conditions').doc(id).get().then(function(snap) {
            if (!snap.exists) return;
            var d = snap.data();
            document.getElementById('conditionName').value             = d.name             || '';
            document.getElementById('conditionCategory').value         = d.category         || '';
            document.getElementById('conditionStatus').value           = d.status           || 'active';
            document.getElementById('conditionDiagnosedDate').value    = d.diagnosedDate    || '';
            document.getElementById('conditionDiagnosedBy').value      = d.diagnosedBy      || '';
            document.getElementById('conditionManagementNotes').value  = d.managementNotes  || '';
            document.getElementById('conditionNotes').value            = d.notes            || '';
            populateVisitDropdown('conditionVisitId', d.diagnosedAtVisitId || '');
        });
    } else {
        populateVisitDropdown('conditionVisitId', '');
    }
    openModal('conditionModal');
}

function saveCondition() {
    var name = document.getElementById('conditionName').value.trim();
    if (!name) { alert('Condition name is required.'); return; }

    var data = {
        name:               name,
        category:           document.getElementById('conditionCategory').value,
        status:             document.getElementById('conditionStatus').value || 'active',
        diagnosedDate:      document.getElementById('conditionDiagnosedDate').value || null,
        diagnosedBy:        document.getElementById('conditionDiagnosedBy').value.trim(),
        diagnosedAtVisitId: document.getElementById('conditionVisitId').value || null,
        managementNotes:    document.getElementById('conditionManagementNotes').value.trim(),
        notes:              document.getElementById('conditionNotes').value.trim()
    };

    var modal  = document.getElementById('conditionModal');
    var editId = modal.dataset.editId;
    var op;
    if (editId) {
        op = userCol('conditions').doc(editId).update(data);
    } else {
        data.contactId = null;
        data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        op = userCol('conditions').add(data);
    }
    op.then(function(ref) {
        var savedId = ref ? ref.id : editId;
        closeModal('conditionModal');
        // If currently viewing a condition detail page, reload it; otherwise reload the list
        if (location.hash.startsWith('#health-condition/') && savedId) {
            loadConditionDetail(savedId);
        } else {
            loadConditionsPage();
        }
    }).catch(function(err) { alert('Error saving: ' + err.message); });
}

function deleteCondition(id) {
    if (!confirm('Delete this condition record?')) return;
    userCol('conditions').doc(id).delete()
        .then(function() { loadConditionsPage(); })
        .catch(function(err) { alert('Error deleting: ' + err.message); });
}

// =================================================================
//  CONCERNS (H3)
// =================================================================

function loadConcernsPage() {
    var openList       = document.getElementById('concernOpenList');
    var resolvedList   = document.getElementById('concernResolvedList');
    var resolvedSection = document.getElementById('concernResolvedSection');
    if (!openList) return;
    openList.innerHTML = '<p class="empty-state">Loading\u2026</p>';

    userCol('concerns').get()
        .then(function(snap) {
            var open = [], resolved = [];
            snap.docs.forEach(function(d) {
                var rec = Object.assign({ id: d.id }, d.data());
                if (rec.status === 'resolved') resolved.push(rec); else open.push(rec);
            });
            // Newest first within each group (by startDate desc)
            open.sort(function(a,b)     { return (b.startDate||'').localeCompare(a.startDate||''); });
            resolved.sort(function(a,b) { return (b.resolvedDate||b.startDate||'').localeCompare(a.resolvedDate||a.startDate||''); });

            if (open.length === 0) {
                openList.innerHTML = '<p class="empty-state">No open concerns. Tap + Add to log one.</p>';
            } else {
                openList.innerHTML = '';
                open.forEach(function(rec) { openList.appendChild(buildConcernCard(rec)); });
            }

            if (resolved.length === 0) {
                resolvedSection.style.display = 'none';
            } else {
                resolvedSection.style.display = '';
                resolvedList.innerHTML = '';
                resolved.forEach(function(rec) { resolvedList.appendChild(buildConcernCard(rec)); });
            }
        })
        .catch(function(err) {
            openList.innerHTML = '<p class="empty-state">Error loading concerns.</p>';
            console.error('loadConcernsPage:', err);
        });
}

function buildConcernCard(concern) {
    var div = document.createElement('div');
    div.className = 'health-card health-card--clickable';
    div.onclick = function() { location.hash = '#health-concern/' + concern.id; };
    var statusBadge = concern.status === 'resolved'
        ? '<span class="health-badge health-badge--resolved">Resolved</span>'
        : '<span class="health-badge health-badge--open">Open</span>';
    div.innerHTML =
        '<div class="health-card-main">' +
            '<div class="health-card-title">' + escapeHtml(concern.title || '') + '</div>' +
            '<div class="health-card-meta">' +
                statusBadge +
                (concern.bodyArea ? '<span class="health-badge">' + escapeHtml(concern.bodyArea) + '</span>' : '') +
            '</div>' +
            (concern.startDate ? '<div class="health-card-sub">Since ' + escapeHtml(concern.startDate) + '</div>' : '') +
        '</div>' +
        '<div class="health-card-arrow">\u203a</div>';
    return div;
}

// ── Condition detail page ─────────────────────────────────────────

function loadConditionDetail(id) {
    var titleEl = document.getElementById('conditionDetailTitle');
    if (titleEl) titleEl.textContent = 'Loading\u2026';

    userCol('conditions').doc(id).get()
        .then(function(snap) {
            if (!snap.exists) {
                alert('Condition not found.');
                location.hash = '#health-conditions';
                return;
            }
            window.currentHealthCondition = Object.assign({ id: snap.id }, snap.data());
            renderConditionDetail(window.currentHealthCondition);
        })
        .catch(function(err) { console.error('loadConditionDetail:', err); });
}

function renderConditionDetail(condition) {
    document.getElementById('conditionDetailTitle').textContent = condition.name || 'Condition';

    var statusEl = document.getElementById('conditionDetailStatus');
    var statusText = condition.status === 'active' ? 'Active'
                   : condition.status === 'managed' ? 'Managed'
                   : condition.status === 'resolved' ? 'Resolved' : (condition.status || '');
    statusEl.textContent = statusText;
    statusEl.className   = 'health-badge health-badge--status-' + (condition.status || 'active');

    var catEl = document.getElementById('conditionDetailCategory');
    if (catEl) catEl.textContent = condition.category || '';
    var ddEl = document.getElementById('conditionDetailDiagnosedDate');
    if (ddEl) ddEl.textContent = condition.diagnosedDate ? 'Diagnosed: ' + condition.diagnosedDate : '';
    var mgEl = document.getElementById('conditionDetailManagementNotes');
    if (mgEl) mgEl.textContent = condition.managementNotes || condition.notes || '\u2014';

    // Status cycle button label
    var statusBtn = document.getElementById('conditionStatusBtn');
    if (statusBtn) {
        statusBtn.textContent = condition.status === 'active'   ? 'Mark Managed'
                              : condition.status === 'managed'  ? 'Mark Resolved'
                              : 'Mark Active';
    }

    // Initialize Journal section open, rest collapsed
    var journalSec = document.getElementById('conditionSectionJournal');
    if (journalSec) {
        journalSec.classList.remove('collapsed');
        var body = journalSec.querySelector('.collapsible-body');
        if (body) body.style.display = '';
    }
    ['conditionSectionMeds','conditionSectionAppts','conditionSectionPhotos','conditionSectionFacts','conditionSectionProjects'].forEach(function(secId) {
        var sec = document.getElementById(secId);
        if (!sec) return;
        sec.classList.add('collapsed');
        var body = sec.querySelector('.collapsible-body');
        if (body) body.style.display = 'none';
    });

    // Wire up photo buttons
    var camBtn = document.getElementById('addConditionCameraBtn');
    var galBtn = document.getElementById('addConditionGalleryBtn');
    if (camBtn) camBtn.onclick = function() { openPhotoModal('condition', condition.id, 'camera'); };
    if (galBtn) galBtn.onclick = function() { openPhotoModal('condition', condition.id, 'gallery'); };

    // Watch containers loaded by external modules (photos/facts/projects)
    _watchContainerForCount('conditionPhotoContainer',   'conditionSectionPhotos');
    _watchContainerForCount('conditionFactsContainer',   'conditionSectionFacts');
    _watchContainerForCount('conditionProjectsContainer','conditionSectionProjects');

    // Load all section content
    loadConditionLogs(condition.id);
    loadConditionMeds(condition.id);
    loadConditionApptVisits(condition.id);
    loadPhotos('condition', condition.id, 'conditionPhotoContainer', 'conditionPhotoEmptyState');
    loadFacts('condition', condition.id, 'conditionFactsContainer', 'conditionFactsEmpty');
    loadProjects('condition', condition.id, 'conditionProjectsContainer', 'conditionProjectsEmpty');
}

function cycleConditionStatus() {
    var condition = window.currentHealthCondition;
    if (!condition) return;
    var next = condition.status === 'active'  ? 'managed'
             : condition.status === 'managed' ? 'resolved'
             : 'active';
    userCol('conditions').doc(condition.id).update({ status: next })
        .then(function() { loadConditionDetail(condition.id); })
        .catch(function(err) { alert('Error: ' + err.message); });
}

function editCurrentCondition() {
    if (window.currentHealthCondition) openConditionModal(window.currentHealthCondition.id);
}

function deleteCurrentCondition() {
    if (!window.currentHealthCondition) return;
    if (!confirm('Delete this condition and all its journal entries? Photos will not be deleted.')) return;
    var id = window.currentHealthCondition.id;
    userCol('healthConditionLogs').where('conditionId', '==', id).get()
        .then(function(snap) {
            var batch = db.batch();
            snap.docs.forEach(function(d) { batch.delete(d.ref); });
            return batch.commit();
        })
        .then(function() { return userCol('conditions').doc(id).delete(); })
        .then(function() { location.hash = '#health-conditions'; })
        .catch(function(err) { alert('Error deleting: ' + err.message); });
}

// ── Condition journal logs ────────────────────────────────────────

function loadConditionLogs(conditionId) {
    var container = document.getElementById('conditionUpdatesList');
    if (!container) return;
    container.innerHTML = '<p class="empty-state">Loading\u2026</p>';

    userCol('healthConditionLogs').where('conditionId', '==', conditionId).get()
        .then(function(snap) {
            var logs = snap.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });
            logs.sort(function(a, b) { return (b.date || '').localeCompare(a.date || ''); });

            _setSectionCount('conditionSectionJournal', logs.length);
            if (logs.length === 0) {
                container.innerHTML = '<p class="empty-state">No journal entries yet.</p>';
                return;
            }
            container.innerHTML = '';
            logs.forEach(function(u) {
                var visitTag = u.visitId
                    ? ' <a class="health-badge health-badge--visit-link" href="#health-visit-step2/' + u.visitId + '" onclick="event.stopPropagation()">Visit \u203a</a>'
                    : '';
                var div = document.createElement('div');
                div.className = 'health-card';
                div.innerHTML =
                    '<div class="health-card-main">' +
                        '<div class="health-card-title">' + escapeHtml(u.date || '') + visitTag + '</div>' +
                        (u.painScale ? '<div class="health-card-meta"><span class="health-badge">Pain: ' + escapeHtml(String(u.painScale)) + '/10</span></div>' : '') +
                        '<div class="health-card-sub">' + escapeHtml(u.note || '') + '</div>' +
                    '</div>' +
                    '<div class="health-card-actions">' +
                        '<button class="btn btn-danger btn-small" onclick="deleteConditionUpdate(\'' + u.id + '\',\'' + conditionId + '\')">Delete</button>' +
                    '</div>';
                container.appendChild(div);
            });
        })
        .catch(function(err) {
            container.innerHTML = '<p class="empty-state">Error loading journal.</p>';
            console.error('loadConditionLogs:', err);
        });
}

function openConditionUpdateModal() {
    var today = new Date().toISOString().slice(0, 10);
    document.getElementById('conditionUpdateDate').value  = today;
    document.getElementById('conditionUpdateNote').value  = '';
    document.getElementById('conditionUpdatePain').value  = '';
    openModal('conditionUpdateModal');
}

function saveConditionUpdate() {
    var condition = window.currentHealthCondition;
    if (!condition) return;
    var note = document.getElementById('conditionUpdateNote').value.trim();
    if (!note) { alert('Note is required.'); return; }

    var painRaw = document.getElementById('conditionUpdatePain').value.trim();
    var pain    = painRaw ? parseInt(painRaw, 10) : null;
    if (pain !== null && (isNaN(pain) || pain < 1 || pain > 10)) {
        alert('Pain scale must be 1\u201310 or left blank.'); return;
    }

    var data = {
        conditionId: condition.id,
        date:        document.getElementById('conditionUpdateDate').value || new Date().toISOString().slice(0, 10),
        note:        note,
        painScale:   pain,
        type:        'manual',
        contactId:   null,
        createdAt:   firebase.firestore.FieldValue.serverTimestamp()
    };

    userCol('healthConditionLogs').add(data)
        .then(function() {
            closeModal('conditionUpdateModal');
            loadConditionLogs(condition.id);
        })
        .catch(function(err) { alert('Error saving: ' + err.message); });
}

function deleteConditionUpdate(logId, conditionId) {
    if (!confirm('Delete this journal entry?')) return;
    userCol('healthConditionLogs').doc(logId).delete()
        .then(function() { loadConditionLogs(conditionId); })
        .catch(function(err) { alert('Error deleting: ' + err.message); });
}

// ── Condition medications ─────────────────────────────────────────

function loadConditionMeds(conditionId) {
    var container = document.getElementById('conditionMedsList');
    if (!container) return;
    container.innerHTML = '<p class="empty-state">Loading\u2026</p>';

    userCol('medications').where('conditionIds', 'array-contains', conditionId).get()
        .then(function(snap) {
            var meds = snap.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });
            meds.sort(function(a, b) { return (a.name || '').localeCompare(b.name || ''); });

            _setSectionCount('conditionSectionMeds', meds.length);
            if (meds.length === 0) {
                container.innerHTML = '<p class="empty-state">No medications linked.</p>';
                return;
            }
            container.innerHTML = '';
            meds.forEach(function(m) {
                var row = document.createElement('div');
                row.className = 'linked-med-row';
                row.innerHTML =
                    '<div class="linked-med-info">' +
                        '<a class="linked-med-name" href="#health-medication/' + m.id + '">' + escapeHtml(m.name || '') + '</a>' +
                        (m.dosage ? '<span class="linked-med-dosage">' + escapeHtml(m.dosage) + '</span>' : '') +
                    '</div>' +
                    '<button class="btn btn-danger btn-small" onclick="removeConditionMed(\'' + m.id + '\',\'' + conditionId + '\')">Unlink</button>';
                container.appendChild(row);
            });
        })
        .catch(function(err) {
            container.innerHTML = '<p class="empty-state">Error loading medications.</p>';
            console.error('loadConditionMeds:', err);
        });
}

function removeConditionMed(medId, conditionId) {
    if (!confirm('Unlink this medication from the condition?')) return;
    userCol('medications').doc(medId).update({
        conditionIds: firebase.firestore.FieldValue.arrayRemove(conditionId)
    }).then(function() {
        loadConditionMeds(conditionId);
    }).catch(function(err) { alert('Error: ' + err.message); });
}

// ── Condition appointments & visits ──────────────────────────────

async function loadConditionApptVisits(conditionId) {
    var container = document.getElementById('conditionApptVisitsList');
    if (!container) return;
    container.innerHTML = '<p class="empty-state">Loading\u2026</p>';

    try {
        var apptSnap  = await userCol('appointments').where('conditionIds', 'array-contains', conditionId).get();
        var visitSnap = await userCol('healthVisits').where('conditionIds', 'array-contains', conditionId).get();

        var items = [];
        apptSnap.docs.forEach(function(d) {
            items.push(Object.assign({ id: d.id, _kind: 'appt' }, d.data()));
        });
        visitSnap.docs.forEach(function(d) {
            items.push(Object.assign({ id: d.id, _kind: 'visit' }, d.data()));
        });
        items.sort(function(a, b) { return (b.date || '').localeCompare(a.date || ''); });

        _setSectionCount('conditionSectionAppts', items.length);
        if (items.length === 0) {
            container.innerHTML = '<p class="empty-state">No appointments or visits linked.</p>';
            return;
        }
        container.innerHTML = '';
        items.forEach(function(item) {
            var div   = document.createElement('div');
            div.className = 'concern-appt-visit-item';
            var isVisit = item._kind === 'visit';
            var hash    = isVisit ? '#health-visit/' + item.id : '#health-appointments';
            var label   = isVisit ? (item.type || 'Visit') : (item.appointmentType || 'Appointment');
            var who     = item.providerText || item.provider || '';
            var meta    = [label, who].filter(Boolean).join(' \u2014 ');
            div.innerHTML =
                '<a href="' + hash + '" class="concern-appt-visit-date">' + escapeHtml(item.date || '\u2014') + '</a>' +
                '<div class="concern-appt-visit-meta">' + escapeHtml(meta) + '</div>';
            container.appendChild(div);
        });
    } catch(err) {
        container.innerHTML = '<p class="empty-state">Error loading appointments.</p>';
        console.error('loadConditionApptVisits:', err);
    }
}

// Patch saveCondition to reload detail page if currently viewing one
var _origSaveCondition = null;

// ── Section count helpers ─────────────────────────────────────────

// Set the count badge on a collapsible section header label.
// Pass n=0 to clear (hides via :empty CSS rule).
function _setSectionCount(sectionId, n) {
    var sec = document.getElementById(sectionId);
    if (!sec) return;
    var span = sec.querySelector('.collapsible-header .section-count');
    if (!span) return;
    span.textContent = n > 0 ? '(' + n + ')' : '';
}

// Watch a container div with MutationObserver so the section badge stays
// accurate for sections loaded by external modules (photos, facts, projects).
function _watchContainerForCount(containerId, sectionId) {
    var container = document.getElementById(containerId);
    if (!container) return;
    var update = function() {
        // Count real content children (skip empty-state paragraphs)
        var count = Array.from(container.children).filter(function(c) {
            return !c.classList.contains('empty-state');
        }).length;
        _setSectionCount(sectionId, count);
    };
    new MutationObserver(update).observe(container, { childList: true });
}

// ── Collapsible section helper ────────────────────────────────────

function toggleSection(sectionEl) {
    var isCollapsed = sectionEl.classList.contains('collapsed');
    sectionEl.classList.toggle('collapsed', !isCollapsed);
    var body = sectionEl.querySelector('.collapsible-body');
    if (body) body.style.display = isCollapsed ? '' : 'none';
}

// ── Med Picker overlay ────────────────────────────────────────────

// Opens the medPickerModal scoped to a concern or condition
function openMedPicker(targetType, targetId) {
    var modal = document.getElementById('medPickerModal');
    modal.dataset.targetType = targetType;
    modal.dataset.targetId   = targetId;

    var list = document.getElementById('medPickerList');
    list.innerHTML = '<p class="empty-state">Loading\u2026</p>';
    openModal('medPickerModal');

    // Load all non-discontinued meds; pre-check ones already linked
    userCol('medications').get().then(function(snap) {
        var meds = snap.docs
            .map(function(d) { return Object.assign({ id: d.id }, d.data()); })
            .filter(function(m) { return m.status !== 'discontinued'; })
            .sort(function(a, b) { return (a.name || '').localeCompare(b.name || ''); });

        if (meds.length === 0) {
            list.innerHTML = '<p class="empty-state">No medications on file.</p>';
            return;
        }

        // Determine which meds are already linked (concernIds or conditionIds contains targetId)
        var arrayField = targetType === 'concern' ? 'concernIds' : 'conditionIds';

        list.innerHTML = '';
        meds.forEach(function(m) {
            var linked = Array.isArray(m[arrayField]) && m[arrayField].indexOf(targetId) !== -1;
            var item = document.createElement('div');
            item.className = 'med-picker-item';
            item.innerHTML =
                '<input type="checkbox" class="med-picker-check" value="' + m.id + '"' +
                    (linked ? ' checked' : '') + '>' +
                '<div class="med-picker-item-info">' +
                    '<div class="med-picker-item-name">' + escapeHtml(m.name || '') + '</div>' +
                    (m.dosage ? '<div class="med-picker-item-dosage">' + escapeHtml(m.dosage) + '</div>' : '') +
                '</div>';
            list.appendChild(item);
        });
    }).catch(function(err) {
        list.innerHTML = '<p class="empty-state">Error loading medications.</p>';
        console.error('openMedPicker:', err);
    });
}

// Called from "Add New Medication" button inside medPickerModal
function _openMedPickerAddNew() {
    // Stash a callback so saveMed() can return to the picker instead of navigating away
    var targetType = document.getElementById('medPickerModal').dataset.targetType;
    var targetId   = document.getElementById('medPickerModal').dataset.targetId;
    closeModal('medPickerModal');

    window._medPickerCallback = function(newMedId) {
        window._medPickerCallback = null;
        openMedPicker(targetType, targetId);
    };
    openMedModal(null);   // open blank add-med modal
}

// Save the picker selection — diffs old vs new and updates medications
function saveMedPickerSelection() {
    var modal      = document.getElementById('medPickerModal');
    var targetType = modal.dataset.targetType;
    var targetId   = modal.dataset.targetId;
    var arrayField = targetType === 'concern' ? 'concernIds' : 'conditionIds';

    var checks = modal.querySelectorAll('.med-picker-check');
    var nowChecked = [];
    checks.forEach(function(cb) { if (cb.checked) nowChecked.push(cb.value); });

    // Build the original set from what was pre-checked
    var wasChecked = [];
    checks.forEach(function(cb) {
        // We stored initial state via the checked attribute — read defaultChecked
        if (cb.defaultChecked) wasChecked.push(cb.value);
    });

    var toAdd    = nowChecked.filter(function(id) { return wasChecked.indexOf(id) === -1; });
    var toRemove = wasChecked.filter(function(id) { return nowChecked.indexOf(id) === -1; });

    if (toAdd.length === 0 && toRemove.length === 0) {
        closeModal('medPickerModal');
        return;
    }

    var batch = firebase.firestore().batch();
    toAdd.forEach(function(medId) {
        batch.update(userCol('medications').doc(medId), {
            [arrayField]: firebase.firestore.FieldValue.arrayUnion(targetId)
        });
    });
    toRemove.forEach(function(medId) {
        batch.update(userCol('medications').doc(medId), {
            [arrayField]: firebase.firestore.FieldValue.arrayRemove(targetId)
        });
    });

    batch.commit().then(function() {
        closeModal('medPickerModal');
        if (window._medPickerAfterSave) {
            var cb = window._medPickerAfterSave;
            window._medPickerAfterSave = null;
            cb();
        } else if (targetType === 'concern') {
            loadConcernMeds(targetId);
        } else if (targetType === 'condition') {
            loadConditionMeds(targetId);
        }
    }).catch(function(err) { alert('Error saving: ' + err.message); });
}

// Load medications linked to this concern
function loadConcernMeds(concernId) {
    var container = document.getElementById('concernMedsList');
    if (!container) return;
    container.innerHTML = '<p class="empty-state">Loading\u2026</p>';

    userCol('medications').where('concernIds', 'array-contains', concernId).get()
        .then(function(snap) {
            var meds = snap.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });
            meds.sort(function(a, b) { return (a.name || '').localeCompare(b.name || ''); });

            _setSectionCount('concernSectionMeds', meds.length);
            if (meds.length === 0) {
                container.innerHTML = '<p class="empty-state">No medications linked.</p>';
                return;
            }
            container.innerHTML = '';
            meds.forEach(function(m) {
                var row = document.createElement('div');
                row.className = 'linked-med-row';
                row.innerHTML =
                    '<div class="linked-med-info">' +
                        '<a class="linked-med-name" href="#health-medication/' + m.id + '">' + escapeHtml(m.name || '') + '</a>' +
                        (m.dosage ? '<span class="linked-med-dosage">' + escapeHtml(m.dosage) + '</span>' : '') +
                    '</div>' +
                    '<button class="btn btn-danger btn-small" onclick="removeConcernMed(\'' + m.id + '\',\'' + concernId + '\')">Unlink</button>';
                container.appendChild(row);
            });
        })
        .catch(function(err) {
            container.innerHTML = '<p class="empty-state">Error loading medications.</p>';
            console.error('loadConcernMeds:', err);
        });
}

// Unlink a medication from this concern
function removeConcernMed(medId, concernId) {
    if (!confirm('Unlink this medication from the concern?')) return;
    userCol('medications').doc(medId).update({
        concernIds: firebase.firestore.FieldValue.arrayRemove(concernId)
    }).then(function() {
        loadConcernMeds(concernId);
    }).catch(function(err) { alert('Error: ' + err.message); });
}

// Load appointments and visits linked to this concern
async function loadConcernApptVisits(concernId) {
    var container = document.getElementById('concernApptVisitsList');
    if (!container) return;
    container.innerHTML = '<p class="empty-state">Loading\u2026</p>';

    try {
        // Appointments with this concern in concernIds[]
        var apptSnap = await userCol('appointments').where('concernIds', 'array-contains', concernId).get();
        // Visits with this concern in concernIds[] (new pattern)
        var visitSnap = await userCol('healthVisits').where('concernIds', 'array-contains', concernId).get();
        // Legacy visits where concernId == concernId (single-field)
        var legacySnap = await userCol('healthVisits').where('concernId', '==', concernId).get();

        var items = [];

        apptSnap.docs.forEach(function(d) {
            var a = Object.assign({ id: d.id, _kind: 'appt' }, d.data());
            items.push(a);
        });

        var visitIds = new Set();
        visitSnap.docs.forEach(function(d) {
            if (!visitIds.has(d.id)) {
                visitIds.add(d.id);
                items.push(Object.assign({ id: d.id, _kind: 'visit' }, d.data()));
            }
        });
        legacySnap.docs.forEach(function(d) {
            if (!visitIds.has(d.id)) {
                visitIds.add(d.id);
                items.push(Object.assign({ id: d.id, _kind: 'visit' }, d.data()));
            }
        });

        items.sort(function(a, b) { return (b.date || '').localeCompare(a.date || ''); });

        _setSectionCount('concernSectionAppts', items.length);
        if (items.length === 0) {
            container.innerHTML = '<p class="empty-state">No appointments or visits linked.</p>';
            return;
        }

        container.innerHTML = '';
        items.forEach(function(item) {
            var div = document.createElement('div');
            div.className = 'concern-appt-visit-item';

            var isVisit = item._kind === 'visit';
            var hash    = isVisit ? '#health-visit/' + item.id : '#health-appointments';
            var label   = isVisit ? (item.type || 'Visit') : (item.appointmentType || 'Appointment');
            var who     = item.providerText || item.provider || '';
            var meta    = [label, who].filter(Boolean).join(' \u2014 ');

            div.innerHTML =
                '<a href="' + hash + '" class="concern-appt-visit-date">' + escapeHtml(item.date || '\u2014') + '</a>' +
                '<div class="concern-appt-visit-meta">' + escapeHtml(meta) + '</div>';
            container.appendChild(div);
        });
    } catch(err) {
        container.innerHTML = '<p class="empty-state">Error loading appointments.</p>';
        console.error('loadConcernApptVisits:', err);
    }
}

// ── Concern detail page ───────────────────────────────────────────

function loadConcernDetail(id) {
    var titleEl = document.getElementById('concernDetailTitle');
    if (titleEl) titleEl.textContent = 'Loading\u2026';

    userCol('concerns').doc(id).get()
        .then(function(snap) {
            if (!snap.exists) {
                alert('Concern not found.');
                location.hash = '#health-concerns';
                return;
            }
            window.currentHealthConcern = Object.assign({ id: snap.id }, snap.data());
            renderConcernDetail(window.currentHealthConcern);
        })
        .catch(function(err) { console.error('loadConcernDetail:', err); });
}

function renderConcernDetail(concern) {
    document.getElementById('concernDetailTitle').textContent = concern.title || 'Concern';

    var isPromoted = concern.status === 'promoted';
    var pageEl = document.getElementById('page-health-concern');

    // Archived state (promoted)
    var archivedBanner = document.getElementById('concernArchivedBanner');
    var promoteRow     = document.getElementById('concernPromoteRow');
    if (isPromoted) {
        pageEl.classList.add('concern-archived');
        archivedBanner.style.display = '';
        document.getElementById('concernArchivedDate').textContent =
            concern.promotedDate ? 'Promoted on ' + concern.promotedDate : '';
        var link = document.getElementById('concernArchivedLink');
        link.href = '#health-condition/' + (concern.promotedToConditionId || '');
        link.onclick = function(e) {
            e.preventDefault();
            location.hash = '#health-condition/' + concern.promotedToConditionId;
        };
        if (promoteRow) promoteRow.style.display = 'none';
    } else {
        pageEl.classList.remove('concern-archived');
        archivedBanner.style.display = 'none';
        if (promoteRow) promoteRow.style.display = '';
    }

    var statusEl = document.getElementById('concernDetailStatus');
    statusEl.textContent  = isPromoted    ? 'Promoted'
                          : concern.status === 'resolved' ? 'Resolved' : 'Open';
    statusEl.className    = 'health-badge ' + (isPromoted    ? 'health-badge--promoted'
                          : concern.status === 'resolved' ? 'health-badge--resolved' : 'health-badge--open');

    // Summary card fields
    var bodyAreaEl = document.getElementById('concernDetailBodyArea');
    if (bodyAreaEl) bodyAreaEl.textContent = concern.bodyArea || '';
    var startDateEl = document.getElementById('concernDetailStartDate');
    if (startDateEl) startDateEl.textContent = concern.startDate ? 'Since ' + concern.startDate : '';
    var summaryEl = document.getElementById('concernDetailSummary');
    if (summaryEl) summaryEl.textContent = concern.summary || '\u2014';

    // Resolved date inline
    var resolvedDateEl = document.getElementById('concernDetailResolvedDate');
    if (resolvedDateEl) {
        if (concern.status === 'resolved' && concern.resolvedDate) {
            resolvedDateEl.textContent = 'Resolved: ' + concern.resolvedDate;
            resolvedDateEl.style.display = '';
        } else {
            resolvedDateEl.style.display = 'none';
        }
    }

    // Resolve/Reopen button
    var resolveBtn = document.getElementById('concernResolveBtn');
    if (resolveBtn) resolveBtn.textContent = concern.status === 'resolved' ? 'Reopen' : 'Mark Resolved';

    // Initialize all collapsible sections as open (body visible)
    document.querySelectorAll('#page-health-concern .collapsible-section').forEach(function(sec) {
        var body = sec.querySelector('.collapsible-body');
        if (body) body.style.display = '';
    });

    // Watch containers loaded by external modules (photos, facts)
    _watchContainerForCount('concernPhotoContainer', 'concernSectionPhotos');
    _watchContainerForCount('concernFactsContainer', 'concernSectionFacts');

    // Load all section content
    loadConcernUpdates(concern.id);
    loadConcernMeds(concern.id);
    loadConcernApptVisits(concern.id);
    loadPhotos('concern', concern.id, 'concernPhotoContainer', 'concernPhotoEmptyState');
    loadFacts('concern', concern.id, 'concernFactsContainer', 'concernFactsEmpty');
}

// ── Promote concern → condition ───────────────────────────────────

function openPromoteModal() {
    var concern = window.currentHealthConcern;
    if (!concern) return;

    // Pre-fill name from concern title; clear category
    document.getElementById('promoteConditionName').value     = concern.title || '';
    document.getElementById('promoteConditionCategory').value = '';

    // Reset conflict section
    document.getElementById('promoteConflictSection').style.display = 'none';
    document.getElementById('promoteConflictName').textContent       = '';
    document.getElementById('promoteModal').dataset.conflictConditionId = '';
    var submitBtn = document.getElementById('promoteSubmitBtn');
    submitBtn.style.display  = '';
    submitBtn.disabled       = false;

    openModal('promoteModal');
}

async function submitPromoteModal() {
    var name = document.getElementById('promoteConditionName').value.trim();
    if (!name) { alert('Condition name is required.'); return; }

    var submitBtn = document.getElementById('promoteSubmitBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Checking\u2026';

    try {
        // Fetch all conditions and check for name conflict (case-insensitive)
        var snap     = await userCol('conditions').get();
        var nameLow  = name.toLowerCase();
        var existing = snap.docs.find(function(d) {
            return (d.data().name || '').toLowerCase() === nameLow;
        });

        if (!existing) {
            // No conflict — create new condition directly
            await _confirmPromoteNew();
        } else {
            // Show conflict UI
            document.getElementById('promoteModal').dataset.conflictConditionId = existing.id;
            document.getElementById('promoteConflictName').textContent = existing.data().name;
            document.getElementById('promoteConflictSection').style.display = '';
            submitBtn.style.display  = 'none';
            submitBtn.disabled       = false;
            submitBtn.textContent    = 'Promote';
        }
    } catch(err) {
        alert('Error: ' + err.message);
        submitBtn.disabled    = false;
        submitBtn.textContent = 'Promote';
    }
}

async function _confirmPromoteNew() {
    var concern  = window.currentHealthConcern;
    var name     = document.getElementById('promoteConditionName').value.trim();
    var category = document.getElementById('promoteConditionCategory').value;

    var submitBtn = document.getElementById('promoteSubmitBtn');
    submitBtn.disabled    = true;
    submitBtn.textContent = 'Promoting\u2026';

    try {
        // Create new condition record
        var condRef = await userCol('conditions').add({
            name:          name,
            category:      category,
            status:        'active',
            diagnosedDate: concern.startDate || null,
            contactId:     null,
            createdAt:     firebase.firestore.FieldValue.serverTimestamp()
        });
        await _doPromotionWork(concern, condRef.id, name, false);
        closeModal('promoteModal');
        location.hash = '#health-condition/' + condRef.id;
    } catch(err) {
        alert('Error promoting: ' + err.message);
        submitBtn.disabled    = false;
        submitBtn.textContent = 'Promote';
    }
}

async function _confirmPromoteMerge() {
    var concern     = window.currentHealthConcern;
    var existingId  = document.getElementById('promoteModal').dataset.conflictConditionId;
    if (!existingId) return;

    // Disable both conflict buttons
    var btns = document.querySelectorAll('#promoteConflictSection button');
    btns.forEach(function(b) { b.disabled = true; });

    try {
        await _doPromotionWork(concern, existingId, '', true);
        closeModal('promoteModal');
        location.hash = '#health-condition/' + existingId;
    } catch(err) {
        alert('Error merging: ' + err.message);
        btns.forEach(function(b) { b.disabled = false; });
    }
}

// Core promotion migration — runs for both Create New and Merge paths
async function _doPromotionWork(concern, conditionId, conditionName, isMerge) {
    var today = new Date().toISOString().slice(0, 10);
    var batch = db.batch();

    // 1. Add first journal entry to the condition (provenance note)
    var firstLogRef = userCol('healthConditionLogs').doc();
    batch.set(firstLogRef, {
        conditionId: conditionId,
        date:        today,
        note:        (isMerge ? 'Merged from concern: ' : 'Promoted from concern: ') + concern.title + ' on ' + today + '.',
        type:        'system',
        contactId:   null,
        createdAt:   firebase.firestore.FieldValue.serverTimestamp()
    });

    // 2. Copy concern journal entries → condition logs
    var logsSnap = await userCol('concernUpdates').where('concernId', '==', concern.id).get();
    logsSnap.docs.forEach(function(d) {
        var u      = d.data();
        var newRef = userCol('healthConditionLogs').doc();
        batch.set(newRef, {
            conditionId: conditionId,
            date:        u.date || today,
            note:        'Imported from concern: ' + concern.title + ' \u2014 ' + (u.note || ''),
            painScale:   u.painScale || null,
            type:        'system',
            contactId:   null,
            createdAt:   firebase.firestore.FieldValue.serverTimestamp()
        });
    });

    // 3. Link medications
    var medsSnap = await userCol('medications').where('concernIds', 'array-contains', concern.id).get();
    medsSnap.docs.forEach(function(d) {
        batch.update(d.ref, {
            conditionIds: firebase.firestore.FieldValue.arrayUnion(conditionId)
        });
    });

    // 4. Link appointments
    var apptSnap = await userCol('appointments').where('concernIds', 'array-contains', concern.id).get();
    apptSnap.docs.forEach(function(d) {
        batch.update(d.ref, {
            conditionIds: firebase.firestore.FieldValue.arrayUnion(conditionId)
        });
    });

    // 5. Link health visits
    var visitSnap = await userCol('healthVisits').where('concernIds', 'array-contains', concern.id).get();
    visitSnap.docs.forEach(function(d) {
        batch.update(d.ref, {
            conditionIds: firebase.firestore.FieldValue.arrayUnion(conditionId)
        });
    });

    // 6. Re-point photos from concern → condition
    var photoSnap = await userCol('photos')
        .where('targetType', '==', 'concern')
        .where('targetId',   '==', concern.id)
        .get();
    photoSnap.docs.forEach(function(d) {
        batch.update(d.ref, { targetType: 'condition', targetId: conditionId });
    });

    // 7. Mark concern as promoted
    batch.update(userCol('concerns').doc(concern.id), {
        status:                'promoted',
        promotedToConditionId: conditionId,
        promotedDate:          today
    });

    await batch.commit();
}

function loadConcernUpdates(concernId) {
    var container = document.getElementById('concernUpdatesList');
    if (!container) return;
    container.innerHTML = '<p class="empty-state">Loading\u2026</p>';

    userCol('concernUpdates').where('concernId', '==', concernId).get()
        .then(function(snap) {
            var updates = snap.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });
            updates.sort(function(a, b) { return (b.date || '').localeCompare(a.date || ''); });

            _setSectionCount('concernSectionJournal', updates.length);
            if (updates.length === 0) {
                container.innerHTML = '<p class="empty-state">No journal entries yet.</p>';
                return;
            }
            container.innerHTML = '';
            updates.forEach(function(u) {
                var visitTag = u.visitId
                    ? ' <a class="health-badge health-badge--visit-link" href="#health-visit-step2/' + u.visitId + '" onclick="event.stopPropagation()">Visit \u203a</a>'
                    : '';
                var div = document.createElement('div');
                div.className = 'health-card';
                div.innerHTML =
                    '<div class="health-card-main">' +
                        '<div class="health-card-title">' + escapeHtml(u.date || '') + visitTag + '</div>' +
                        (u.painScale ? '<div class="health-card-meta"><span class="health-badge">Pain: ' + escapeHtml(String(u.painScale)) + '/10</span></div>' : '') +
                        '<div class="health-card-sub">' + escapeHtml(u.note || '') + '</div>' +
                    '</div>' +
                    '<div class="health-card-actions">' +
                        '<button class="btn btn-danger btn-small" onclick="deleteConcernUpdate(\'' + u.id + '\', \'' + concernId + '\')">Delete</button>' +
                    '</div>';
                container.appendChild(div);
            });
        })
        .catch(function(err) {
            container.innerHTML = '<p class="empty-state">Error loading updates.</p>';
            console.error(err);
        });
}

// Kept for backward compat — routes to the new combined loader
function loadConcernLinkedVisits(concernId) {
    loadConcernApptVisits(concernId);
}

function openConcernModal(id) {
    var modal = document.getElementById('concernModal');
    modal.dataset.editId = id || '';
    document.getElementById('concernModalTitle').textContent = id ? 'Edit Concern' : 'Add Concern';

    ['concernTitle','concernBodyArea','concernStartDate','concernSummary'].forEach(function(f) {
        document.getElementById(f).value = '';
    });
    document.getElementById('concernStatus').value = 'open';

    if (id) {
        userCol('concerns').doc(id).get().then(function(snap) {
            if (!snap.exists) return;
            var d = snap.data();
            document.getElementById('concernTitle').value     = d.title     || '';
            document.getElementById('concernBodyArea').value  = d.bodyArea  || '';
            document.getElementById('concernStartDate').value = d.startDate || '';
            document.getElementById('concernSummary').value   = d.summary   || '';
            document.getElementById('concernStatus').value    = d.status    || 'open';
        });
    }
    openModal('concernModal');
}

function saveConcern() {
    var title = document.getElementById('concernTitle').value.trim();
    if (!title) { alert('Title is required.'); return; }

    var data = {
        title:     title,
        bodyArea:  document.getElementById('concernBodyArea').value.trim(),
        startDate: document.getElementById('concernStartDate').value || null,
        summary:   document.getElementById('concernSummary').value.trim(),
        status:    document.getElementById('concernStatus').value || 'open'
    };
    if (data.status === 'resolved' && !data.resolvedDate) {
        data.resolvedDate = new Date().toISOString().slice(0, 10);
    }

    var modal  = document.getElementById('concernModal');
    var editId = modal.dataset.editId;
    var op;
    if (editId) {
        op = userCol('concerns').doc(editId).update(data);
    } else {
        data.contactId = null;
        data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        op = userCol('concerns').add(data);
    }
    op.then(function(ref) {
        document.getElementById('concernModal').classList.remove('open');
        var id = editId || (ref && ref.id);
        var dest = id ? '#health-concern/' + id : '#health-concerns';
        history.replaceState(null, '', dest);
        handleRoute();
    }).catch(function(err) { alert('Error saving: ' + err.message); });
}

function toggleConcernResolved() {
    var concern = window.currentHealthConcern;
    if (!concern) return;
    var isOpen = concern.status !== 'resolved';
    var update = isOpen
        ? { status: 'resolved', resolvedDate: new Date().toISOString().slice(0, 10) }
        : { status: 'open',     resolvedDate: null };
    userCol('concerns').doc(concern.id).update(update)
        .then(function() { loadConcernDetail(concern.id); })
        .catch(function(err) { alert('Error: ' + err.message); });
}

function editCurrentConcern() {
    if (window.currentHealthConcern) openConcernModal(window.currentHealthConcern.id);
}

function deleteCurrentConcern() {
    if (!window.currentHealthConcern) return;
    if (!confirm('Delete this concern and all its journal entries? Photos will not be deleted.')) return;
    var id = window.currentHealthConcern.id;
    // Delete all journal entries for this concern first
    userCol('concernUpdates').where('concernId', '==', id).get()
        .then(function(snap) {
            var batch = db.batch();
            snap.docs.forEach(function(d) { batch.delete(d.ref); });
            return batch.commit();
        })
        .then(function() { return userCol('concerns').doc(id).delete(); })
        .then(function() { location.hash = '#health-concerns'; })
        .catch(function(err) { alert('Error deleting: ' + err.message); });
}

// ── Concern journal updates ───────────────────────────────────────

function openConcernUpdateModal() {
    var today = new Date().toISOString().slice(0, 10);
    document.getElementById('concernUpdateDate').value      = today;
    document.getElementById('concernUpdateNote').value      = '';
    document.getElementById('concernUpdatePain').value      = '';
    openModal('concernUpdateModal');
}

function saveConcernUpdate() {
    var concern = window.currentHealthConcern;
    if (!concern) return;
    var note = document.getElementById('concernUpdateNote').value.trim();
    if (!note) { alert('Note is required.'); return; }

    var painRaw = document.getElementById('concernUpdatePain').value.trim();
    var pain    = painRaw ? parseInt(painRaw, 10) : null;
    if (pain !== null && (isNaN(pain) || pain < 1 || pain > 10)) {
        alert('Pain scale must be 1\u201310 or left blank.'); return;
    }

    var data = {
        concernId:  concern.id,
        date:       document.getElementById('concernUpdateDate').value || new Date().toISOString().slice(0, 10),
        note:       note,
        painScale:  pain,
        contactId:  null,
        createdAt:  firebase.firestore.FieldValue.serverTimestamp()
    };

    userCol('concernUpdates').add(data)
        .then(function() {
            closeModal('concernUpdateModal');
            loadConcernUpdates(concern.id);
        })
        .catch(function(err) { alert('Error saving: ' + err.message); });
}

function deleteConcernUpdate(updateId, concernId) {
    if (!confirm('Delete this journal entry?')) return;
    userCol('concernUpdates').doc(updateId).delete()
        .then(function() { loadConcernUpdates(concernId); })
        .catch(function(err) { alert('Error deleting: ' + err.message); });
}

// =================================================================
//  BLOOD WORK (H4)
// =================================================================

/* ── Cached record list (used by both list page and trend picker) ─ */
var _bwAllRecords = [];

// ── List page ────────────────────────────────────────────────────

function loadBloodWorkPage() {
    var list = document.getElementById('bloodWorkList');
    if (!list) return;
    list.innerHTML = '<p class="empty-state">Loading\u2026</p>';

    userCol('bloodWorkRecords').get()
        .then(function(snap) {
            _bwAllRecords = snap.docs.map(function(d) {
                return Object.assign({ id: d.id }, d.data());
            });
            _bwAllRecords.sort(function(a, b) {
                return (b.date || '').localeCompare(a.date || '');
            });

            if (_bwAllRecords.length === 0) {
                list.innerHTML = '<p class="empty-state">No blood work records yet. Tap + Add to add one.</p>';
                return;
            }
            list.innerHTML = '';
            _bwAllRecords.forEach(function(bw) { list.appendChild(buildBloodWorkCard(bw)); });
        })
        .catch(function(err) {
            list.innerHTML = '<p class="empty-state">Error loading records.</p>';
            console.error('loadBloodWorkPage:', err);
        });
}

function buildBloodWorkCard(bw) {
    var div = document.createElement('div');
    div.className = 'health-card health-card--clickable';
    div.onclick = function() { location.hash = '#health-bloodwork/' + bw.id; };

    var markerCount  = (bw.markers && bw.markers.length) ? bw.markers.length + ' markers' : 'No markers';
    var flaggedCount = (bw.markers || []).filter(function(m) { return m.flagged; }).length;
    var flaggedBadge = flaggedCount > 0
        ? '<span class="health-badge health-badge--severity-severe">' + flaggedCount + ' flagged</span>'
        : '';

    div.innerHTML =
        '<div class="health-card-main">' +
            '<div class="health-card-title">' + escapeHtml(bw.date || '\u2014') + '</div>' +
            '<div class="health-card-meta">' +
                (bw.lab ? '<span class="health-badge">' + escapeHtml(bw.lab) + '</span>' : '') +
                flaggedBadge +
            '</div>' +
            '<div class="health-card-sub">' + escapeHtml(markerCount) + (bw.orderedBy ? ' \u2014 ' + escapeHtml(bw.orderedBy) : '') + '</div>' +
        '</div>' +
        '<div class="health-card-arrow">\u203a</div>';
    return div;
}

// ── Detail page ──────────────────────────────────────────────────

function loadBloodWorkDetail(id) {
    var titleEl = document.getElementById('bwDetailTitle');
    if (titleEl) titleEl.textContent = 'Loading\u2026';

    userCol('bloodWorkRecords').doc(id).get()
        .then(function(snap) {
            if (!snap.exists) {
                alert('Record not found.');
                location.hash = '#health-bloodwork';
                return;
            }
            window.currentBloodWork = Object.assign({ id: snap.id }, snap.data());
            renderBloodWorkDetail(window.currentBloodWork);
        })
        .catch(function(err) { console.error('loadBloodWorkDetail:', err); });
}

function renderBloodWorkDetail(bw) {
    document.getElementById('bwDetailTitle').textContent      = bw.date || 'Blood Work';
    document.getElementById('bwDetailDate').textContent       = bw.date      || '\u2014';
    document.getElementById('bwDetailLab').textContent        = bw.lab       || '\u2014';
    document.getElementById('bwDetailOrderedBy').textContent  = bw.orderedBy || '\u2014';
    document.getElementById('bwDetailNotes').textContent      = bw.notes     || '\u2014';

    // Linked visit
    var visitRow = document.getElementById('bwDetailVisitRow');
    var visitEl  = document.getElementById('bwDetailVisit');
    if (bw.orderedAtVisitId) {
        visitRow.style.display = '';
        userCol('healthVisits').doc(bw.orderedAtVisitId).get()
            .then(function(snap) {
                if (snap.exists) {
                    var v = snap.data();
                    var label = escapeHtml((v.date || '') + (v.provider ? ' \u2014 ' + v.provider : ''));
                    visitEl.innerHTML = '<span class="health-linked-item health-linked-item--clickable" ' +
                        'onclick="location.hash=\'#health-visit/' + bw.orderedAtVisitId + '\'">' +
                        label + '</span>';
                } else {
                    visitEl.textContent = '\u2014';
                }
            }).catch(function() { visitEl.textContent = '\u2014'; });
    } else {
        visitRow.style.display = 'none';
    }

    _bwRenderMarkerTable(bw.markers || [], 'bwDetailMarkersContainer');
}

function _bwRenderMarkerTable(markers, containerId) {
    var container = document.getElementById(containerId);
    if (!container) return;

    if (markers.length === 0) {
        container.innerHTML = '<p class="empty-state">No markers recorded.</p>';
        return;
    }

    var html = '<div class="bw-table-wrap"><table class="bw-marker-table">' +
        '<thead><tr>' +
            '<th>Marker</th><th>Value</th><th>Unit</th><th>Reference Range</th><th></th>' +
        '</tr></thead><tbody>';

    markers.forEach(function(m) {
        var rowClass = m.flagged ? ' class="bw-marker-flagged"' : '';
        html += '<tr' + rowClass + '>' +
            '<td>' + escapeHtml(m.name || '') + '</td>' +
            '<td><strong>' + escapeHtml(m.value || '') + '</strong></td>' +
            '<td>' + escapeHtml(m.unit || '') + '</td>' +
            '<td>' + escapeHtml(m.referenceRange || '') + '</td>' +
            '<td>' + (m.flagged ? '<span class="bw-flag-icon">\u26a0\ufe0f</span>' : '') + '</td>' +
        '</tr>';
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;
}

// ── Add/Edit modal ───────────────────────────────────────────────

function openBloodWorkModal(id) {
    var modal = document.getElementById('bloodWorkModal');
    modal.dataset.editId = id || '';
    document.getElementById('bwModalTitle').textContent = id ? 'Edit Blood Work' : 'Add Blood Work';

    ['bwLab', 'bwOrderedBy', 'bwNotes'].forEach(function(f) {
        document.getElementById(f).value = '';
    });
    document.getElementById('bwDate').value = new Date().toISOString().slice(0, 10);
    document.getElementById('bwModalMarkersBody').innerHTML = '';

    if (id) {
        userCol('bloodWorkRecords').doc(id).get().then(function(snap) {
            if (!snap.exists) return;
            var d = snap.data();
            document.getElementById('bwDate').value      = d.date      || '';
            document.getElementById('bwLab').value       = d.lab       || '';
            document.getElementById('bwOrderedBy').value = d.orderedBy || '';
            document.getElementById('bwNotes').value     = d.notes     || '';
            populateVisitDropdown('bwVisitId', d.orderedAtVisitId || '');
            (d.markers || []).forEach(function(m) { _bwAddMarkerRow(m); });
        });
    } else {
        populateVisitDropdown('bwVisitId', '');
    }
    openModal('bloodWorkModal');
}

function saveBloodWork() {
    var date = document.getElementById('bwDate').value;
    if (!date) { alert('Date is required.'); return; }

    var data = {
        date:             date,
        lab:              document.getElementById('bwLab').value.trim(),
        orderedBy:        document.getElementById('bwOrderedBy').value.trim(),
        orderedAtVisitId: document.getElementById('bwVisitId').value || null,
        notes:            document.getElementById('bwNotes').value.trim(),
        markers:          _bwCollectMarkers()
    };

    var modal  = document.getElementById('bloodWorkModal');
    var editId = modal.dataset.editId;
    var op;
    if (editId) {
        op = userCol('bloodWorkRecords').doc(editId).update(data).then(function() { return editId; });
    } else {
        data.contactId = null;
        data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        op = userCol('bloodWorkRecords').add(data).then(function(ref) { return ref.id; });
    }
    op.then(function(id) {
        // Use replaceState to swap the modal history entry for the detail URL,
        // then call handleRoute() directly.  A plain location.hash assignment
        // would push a new entry; history.back() inside closeModal would then
        // pop that new entry instead of the modal's, sending us back to the list.
        document.getElementById('bloodWorkModal').classList.remove('open');
        history.replaceState(null, '', '#health-bloodwork/' + id);
        handleRoute();
    }).catch(function(err) { alert('Error saving: ' + err.message); });
}

function editCurrentBloodWork() {
    if (window.currentBloodWork) openBloodWorkModal(window.currentBloodWork.id);
}

function deleteCurrentBloodWork() {
    if (!window.currentBloodWork) return;
    if (!confirm('Delete this blood work record?')) return;
    userCol('bloodWorkRecords').doc(window.currentBloodWork.id).delete()
        .then(function() { location.hash = '#health-bloodwork'; })
        .catch(function(err) { alert('Error deleting: ' + err.message); });
}

// ── Marker row management ─────────────────────────────────────────

function _bwAddMarkerRow(marker) {
    marker = marker || {};
    var tbody = document.getElementById('bwModalMarkersBody');
    var tr = document.createElement('tr');
    tr.className = 'bw-marker-row';
    tr.innerHTML =
        '<td><input type="text" class="bw-input bw-input-name"  value="' + escapeHtml(marker.name           || '') + '" placeholder="e.g. LDL"></td>' +
        '<td><input type="text" class="bw-input bw-input-value" value="' + escapeHtml(marker.value          || '') + '" placeholder="112"></td>' +
        '<td><input type="text" class="bw-input bw-input-unit"  value="' + escapeHtml(marker.unit           || '') + '" placeholder="mg/dL"></td>' +
        '<td><input type="text" class="bw-input bw-input-range" value="' + escapeHtml(marker.referenceRange || '') + '" placeholder="&lt;100"></td>' +
        '<td class="bw-flag-cell"><label><input type="checkbox" class="bw-input-flag"' + (marker.flagged ? ' checked' : '') + '> Flag</label></td>' +
        '<td><button type="button" class="btn btn-danger btn-small" onclick="_bwRemoveMarkerRow(this)">&times;</button></td>';
    tbody.appendChild(tr);
}

function _bwRemoveMarkerRow(btn) {
    var tr = btn.closest('tr');
    if (tr) tr.remove();
}

function _bwCollectMarkers() {
    var rows = document.querySelectorAll('#bwModalMarkersBody .bw-marker-row');
    var markers = [];
    rows.forEach(function(tr) {
        var name = tr.querySelector('.bw-input-name').value.trim();
        if (!name) return;
        markers.push({
            name:           name,
            value:          tr.querySelector('.bw-input-value').value.trim(),
            unit:           tr.querySelector('.bw-input-unit').value.trim(),
            referenceRange: tr.querySelector('.bw-input-range').value.trim(),
            flagged:        tr.querySelector('.bw-input-flag').checked
        });
    });
    return markers;
}

// ── LLM import ───────────────────────────────────────────────────

function openImportModal() {
    document.getElementById('bwImportText').value    = '';
    document.getElementById('bwImportStatus').innerHTML = '';
    document.getElementById('bwImportBtn').disabled  = false;
    openModal('bloodWorkImportModal');
}

async function parseLabReport() {
    var text = document.getElementById('bwImportText').value.trim();
    if (!text) { alert('Please paste some lab report text first.'); return; }

    var statusEl = document.getElementById('bwImportStatus');
    var btn      = document.getElementById('bwImportBtn');
    statusEl.textContent = 'Parsing with AI\u2026';
    btn.disabled = true;

    var systemPrompt =
        'You are a medical lab report parser. Extract all lab test markers from the text provided.\n' +
        'Return ONLY valid JSON in this exact format \u2014 no explanations, no markdown, no code fences:\n' +
        '{"markers":[{"name":"LDL","value":"112","unit":"mg/dL","referenceRange":"<100","flagged":true}]}\n' +
        'Rules:\n' +
        '- name: the test name as shown in the report\n' +
        '- value: the numeric result as a string\n' +
        '- unit: unit of measure (e.g., mg/dL, %, g/dL) \u2014 empty string if not shown\n' +
        '- referenceRange: the normal/reference range as shown (e.g., "<100", "3.5-5.0") \u2014 empty string if not shown\n' +
        '- flagged: true if marked High (H), Low (L), *, or otherwise out of range; false otherwise\n' +
        '- Include every marker that has a numeric value\n' +
        '- Do not include markers with no value';

    try {
        var raw = await _bwCallLLM(systemPrompt, text);
        // Strip markdown code fences if the model adds them anyway
        var cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
        var parsed  = JSON.parse(cleaned);
        if (!parsed.markers || !Array.isArray(parsed.markers)) throw new Error('Unexpected response format');
        _bwApplyImportedMarkers(parsed.markers);
        closeModal('bloodWorkImportModal');
    } catch(err) {
        statusEl.textContent = 'Parse failed: ' + err.message + '. Edit markers manually or try again.';
        btn.disabled = false;
    }
}

async function _bwCallLLM(systemPrompt, userText) {
    var doc = await userCol('settings').doc('llm').get();
    if (!doc.exists) throw new Error('LLM not configured. Go to Settings \u2192 QuickLog to add your API key.');

    var cfg      = doc.data();
    var provider = cfg.provider || 'openai';
    var apiKey   = cfg.apiKey   || '';
    var model    = cfg.model    || '';

    var ENDPOINTS = {
        openai: { url: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o' },
        grok:   { url: 'https://api.x.ai/v1/chat/completions',       model: 'grok-3'  }
    };
    var ep = ENDPOINTS[provider] || ENDPOINTS.openai;

    var res = await fetch(ep.url, {
        method : 'POST',
        headers: {
            'Content-Type' : 'application/json',
            'Authorization': 'Bearer ' + apiKey
        },
        body: JSON.stringify({
            model   : model || ep.model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user',   content: userText      }
            ]
        })
    });

    if (!res.ok) {
        var errBody = await res.text();
        throw new Error('LLM error ' + res.status + ': ' + errBody.slice(0, 200));
    }
    var json = await res.json();
    return json.choices[0].message.content;
}

function _bwApplyImportedMarkers(markers) {
    document.getElementById('bwModalMarkersBody').innerHTML = '';
    markers.forEach(function(m) { _bwAddMarkerRow(m); });
}

// ── Trend view ───────────────────────────────────────────────────

function openTrendModal() {
    var sel      = document.getElementById('bwTrendSelect');
    var tableDiv = document.getElementById('bwTrendTable');
    sel.innerHTML = '<option value="">\u2014 Select a marker \u2014</option>';
    tableDiv.innerHTML = '';

    // Collect all unique marker names from cached list
    var seen = {};
    _bwAllRecords.forEach(function(bw) {
        (bw.markers || []).forEach(function(m) {
            if (m.name) seen[m.name] = true;
        });
    });
    var names = Object.keys(seen).sort();
    if (names.length === 0) {
        tableDiv.innerHTML = '<p class="empty-state">No markers recorded yet.</p>';
    }
    names.forEach(function(name) {
        var opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        sel.appendChild(opt);
    });

    openModal('bloodWorkTrendModal');
}

function renderTrendTable(markerName) {
    var tableDiv = document.getElementById('bwTrendTable');
    if (!markerName) { tableDiv.innerHTML = ''; return; }

    var rows = [];
    _bwAllRecords.forEach(function(bw) {
        (bw.markers || []).forEach(function(m) {
            if (m.name === markerName) {
                rows.push({ date: bw.date, value: m.value, unit: m.unit, ref: m.referenceRange, flagged: m.flagged });
            }
        });
    });
    rows.sort(function(a, b) { return (b.date || '').localeCompare(a.date || ''); });

    if (rows.length === 0) {
        tableDiv.innerHTML = '<p class="empty-state">No data for this marker.</p>';
        return;
    }

    var html = '<div class="bw-table-wrap"><table class="bw-marker-table">' +
        '<thead><tr><th>Date</th><th>Value</th><th>Unit</th><th>Reference Range</th><th></th></tr></thead><tbody>';

    rows.forEach(function(r) {
        var rowClass = r.flagged ? ' class="bw-marker-flagged"' : '';
        html += '<tr' + rowClass + '>' +
            '<td>' + escapeHtml(r.date || '') + '</td>' +
            '<td><strong>' + escapeHtml(r.value || '') + '</strong></td>' +
            '<td>' + escapeHtml(r.unit || '') + '</td>' +
            '<td>' + escapeHtml(r.ref || '') + '</td>' +
            '<td>' + (r.flagged ? '<span class="bw-flag-icon">\u26a0\ufe0f</span>' : '') + '</td>' +
        '</tr>';
    });

    html += '</tbody></table></div>';
    tableDiv.innerHTML = html;
}

// =================================================================
//  VITALS (H5)
// =================================================================

var VITAL_UNITS = {
    'Blood Pressure': 'mmHg',
    'Heart Rate':     'bpm',
    'O2 Sat':         '%',
    'Blood Glucose':  'mg/dL',
    'Temperature':    '\u00b0F',
    'Other':          ''
};

// ── List page ────────────────────────────────────────────────────

function loadVitalsPage(filterType) {
    var sel  = document.getElementById('vitalTypeFilter');
    var list = document.getElementById('vitalsList');
    if (!list) return;
    // Sync filter select to the value passed in (e.g. on first load)
    if (filterType !== undefined && sel) sel.value = filterType || '';
    var activeFilter = sel ? sel.value : (filterType || '');
    list.innerHTML = '<p class="empty-state">Loading\u2026</p>';

    userCol('vitals').get()
        .then(function(snap) {
            var all = snap.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });
            all.sort(function(a, b) {
                return ((b.date || '') + ' ' + (b.time || '')).localeCompare((a.date || '') + ' ' + (a.time || ''));
            });
            window._vitalsAllRecords = all;

            var filtered = activeFilter ? all.filter(function(v) { return v.type === activeFilter; }) : all;

            if (filtered.length === 0) {
                list.innerHTML = '<p class="empty-state">' +
                    (activeFilter ? 'No ' + escapeHtml(activeFilter) + ' readings recorded.' : 'No vitals recorded yet. Tap + Add to add one.') +
                    '</p>';
                return;
            }
            list.innerHTML = '';
            filtered.forEach(function(v) { list.appendChild(buildVitalCard(v)); });
        })
        .catch(function(err) {
            list.innerHTML = '<p class="empty-state">Error loading vitals.</p>';
            console.error('loadVitalsPage:', err);
        });
}

function buildVitalCard(v) {
    var div = document.createElement('div');
    div.className = 'health-card';
    div.innerHTML =
        '<div class="health-card-main">' +
            '<div class="health-card-title">' + escapeHtml(_vitalDisplayValue(v)) + '</div>' +
            '<div class="health-card-meta"><span class="health-badge">' + escapeHtml(v.type || '') + '</span></div>' +
            '<div class="health-card-sub">' + escapeHtml(v.date || '') + (v.time ? ' \u2014 ' + escapeHtml(v.time) : '') + '</div>' +
            (v.notes ? '<div class="health-card-sub">' + escapeHtml(v.notes) + '</div>' : '') +
        '</div>' +
        '<div class="health-card-actions">' +
            '<button class="btn btn-secondary btn-small" onclick="openVitalModal(\'' + v.id + '\')">Edit</button>' +
            '<button class="btn btn-danger btn-small" onclick="deleteVital(\'' + v.id + '\')">Delete</button>' +
        '</div>';
    return div;
}

function _vitalDisplayValue(v) {
    if (v.type === 'Blood Pressure') return (v.value1 || '?') + '/' + (v.value2 || '?') + ' mmHg';
    var val  = v.value1 || '?';
    var unit = v.unit   || '';
    if (unit === '%')       return val + '%';
    if (unit === '\u00b0F') return val + '\u00b0F';
    return val + (unit ? ' ' + unit : '');
}

// ── Add/Edit modal ───────────────────────────────────────────────

function openVitalModal(id) {
    var modal = document.getElementById('vitalModal');
    modal.dataset.editId = id || '';
    document.getElementById('vitalModalTitle').textContent = id ? 'Edit Vital' : 'Add Vital';

    document.getElementById('vitalDate').value   = new Date().toISOString().slice(0, 10);
    document.getElementById('vitalTime').value   = '';
    document.getElementById('vitalType').value   = '';
    document.getElementById('vitalValue1').value = '';
    document.getElementById('vitalValue2').value = '';
    document.getElementById('vitalUnit').value   = '';
    document.getElementById('vitalNotes').value  = '';
    _vitalToggleValue2(false);

    if (id) {
        userCol('vitals').doc(id).get().then(function(snap) {
            if (!snap.exists) return;
            var d = snap.data();
            document.getElementById('vitalDate').value   = d.date    || '';
            document.getElementById('vitalTime').value   = d.time    || '';
            document.getElementById('vitalType').value   = d.type    || '';
            document.getElementById('vitalValue1').value = d.value1  || '';
            document.getElementById('vitalValue2').value = d.value2  || '';
            document.getElementById('vitalUnit').value   = d.unit    || '';
            document.getElementById('vitalNotes').value  = d.notes   || '';
            _vitalToggleValue2(d.type === 'Blood Pressure');
        });
    }
    openModal('vitalModal');
}

function _vitalOnTypeChange() {
    var type = document.getElementById('vitalType').value;
    document.getElementById('vitalUnit').value = VITAL_UNITS[type] !== undefined ? VITAL_UNITS[type] : '';
    _vitalToggleValue2(type === 'Blood Pressure');
}

function _vitalToggleValue2(show) {
    var row = document.getElementById('vitalValue2Row');
    if (row) row.style.display = show ? '' : 'none';
}

function saveVital() {
    var date = document.getElementById('vitalDate').value;
    var type = document.getElementById('vitalType').value;
    if (!date) { alert('Date is required.'); return; }
    if (!type) { alert('Type is required.'); return; }

    var data = {
        date:   date,
        time:   document.getElementById('vitalTime').value.trim()   || null,
        type:   type,
        value1: document.getElementById('vitalValue1').value.trim(),
        value2: type === 'Blood Pressure' ? document.getElementById('vitalValue2').value.trim() : null,
        unit:   document.getElementById('vitalUnit').value          || (VITAL_UNITS[type] || ''),
        notes:  document.getElementById('vitalNotes').value.trim()
    };

    var modal  = document.getElementById('vitalModal');
    var editId = modal.dataset.editId;
    var op;
    if (editId) {
        op = userCol('vitals').doc(editId).update(data);
    } else {
        data.contactId = null;
        data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        op = userCol('vitals').add(data);
    }
    op.then(function() {
        closeModal('vitalModal');
        loadVitalsPage();
    }).catch(function(err) { alert('Error saving: ' + err.message); });
}

function deleteVital(id) {
    if (!confirm('Delete this vital reading?')) return;
    userCol('vitals').doc(id).delete()
        .then(function() { loadVitalsPage(); })
        .catch(function(err) { alert('Error: ' + err.message); });
}

// ── Trend view ───────────────────────────────────────────────────

function openVitalTrendModal() {
    var sel      = document.getElementById('vitalTrendSelect');
    var tableDiv = document.getElementById('vitalTrendTable');
    sel.innerHTML = '<option value="">\u2014 Select a type \u2014</option>';
    tableDiv.innerHTML = '';

    var all  = window._vitalsAllRecords || [];
    var seen = {};
    all.forEach(function(v) { if (v.type) seen[v.type] = true; });
    ['Blood Pressure','Heart Rate','O2 Sat','Blood Glucose','Temperature','Other'].forEach(function(t) {
        if (!seen[t]) return;
        var opt = document.createElement('option');
        opt.value = t; opt.textContent = t;
        sel.appendChild(opt);
    });
    if (Object.keys(seen).length === 0) {
        tableDiv.innerHTML = '<p class="empty-state">No vitals recorded yet.</p>';
    }
    openModal('vitalTrendModal');
}

function renderVitalTrend(type) {
    var tableDiv = document.getElementById('vitalTrendTable');
    if (!type) { tableDiv.innerHTML = ''; return; }

    var all  = window._vitalsAllRecords || [];
    var rows = all.filter(function(v) { return v.type === type; });
    rows.sort(function(a, b) {
        return ((b.date || '') + ' ' + (b.time || '')).localeCompare((a.date || '') + ' ' + (a.time || ''));
    });
    if (rows.length === 0) { tableDiv.innerHTML = '<p class="empty-state">No data for this type.</p>'; return; }

    var isBP = type === 'Blood Pressure';
    var html = '<div class="bw-table-wrap"><table class="bw-marker-table"><thead><tr>' +
        '<th>Date</th><th>Time</th>' +
        (isBP ? '<th>Systolic</th><th>Diastolic</th>' : '<th>Value</th>') +
        '<th>Unit</th><th>Notes</th></tr></thead><tbody>';

    rows.forEach(function(r) {
        html += '<tr>' +
            '<td>' + escapeHtml(r.date  || '') + '</td>' +
            '<td>' + escapeHtml(r.time  || '') + '</td>' +
            (isBP
                ? '<td><strong>' + escapeHtml(r.value1 || '') + '</strong></td><td><strong>' + escapeHtml(r.value2 || '') + '</strong></td>'
                : '<td><strong>' + escapeHtml(r.value1 || '') + '</strong></td>') +
            '<td>' + escapeHtml(r.unit  || '') + '</td>' +
            '<td>' + escapeHtml(r.notes || '') + '</td>' +
        '</tr>';
    });
    html += '</tbody></table></div>';
    tableDiv.innerHTML = html;
}

// =================================================================
//  INSURANCE (H5)
// =================================================================

function loadInsurancePage() {
    var list = document.getElementById('insuranceList');
    if (!list) return;
    list.innerHTML = '<p class="empty-state">Loading\u2026</p>';

    userCol('insurancePolicies').get()
        .then(function(snap) {
            if (snap.empty) {
                list.innerHTML = '<p class="empty-state">No insurance policies recorded. Tap + Add to add one.</p>';
                return;
            }
            var policies = snap.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });
            policies.sort(function(a, b) {
                var sa = a.status === 'inactive' ? 1 : 0;
                var sb = b.status === 'inactive' ? 1 : 0;
                if (sa !== sb) return sa - sb;
                if ((a.type || '') !== (b.type || '')) return (a.type || '').localeCompare(b.type || '');
                return (a.carrier || '').localeCompare(b.carrier || '');
            });

            list.innerHTML = '';
            var currentType = null;
            policies.forEach(function(p) {
                if (p.type !== currentType) {
                    currentType = p.type;
                    var hdr = document.createElement('div');
                    hdr.className = 'health-year-label';
                    hdr.textContent = currentType || 'Other';
                    list.appendChild(hdr);
                }
                list.appendChild(buildInsuranceCard(p));
            });
        })
        .catch(function(err) {
            list.innerHTML = '<p class="empty-state">Error loading insurance.</p>';
            console.error('loadInsurancePage:', err);
        });
}

function buildInsuranceCard(p) {
    var div = document.createElement('div');
    div.className = 'health-card health-card--clickable' + (p.status === 'inactive' ? ' health-card--dim' : '');
    div.onclick = function() { location.hash = '#health-insurance/' + p.id; };
    div.innerHTML =
        '<div class="health-card-main">' +
            '<div class="health-card-title">' + escapeHtml(p.carrier || '\u2014') + '</div>' +
            '<div class="health-card-meta">' +
                (p.planName ? '<span class="health-badge">' + escapeHtml(p.planName) + '</span>' : '') +
                (p.status === 'inactive' ? '<span class="health-badge health-badge--resolved">Inactive</span>' : '') +
            '</div>' +
            (p.memberId ? '<div class="health-card-sub">Member ID: ' + escapeHtml(p.memberId) + '</div>' : '') +
        '</div>' +
        '<div class="health-card-arrow">\u203a</div>';
    return div;
}

// ── Detail page ──────────────────────────────────────────────────

function loadInsuranceDetailPage(id) {
    var titleEl = document.getElementById('insuranceDetailTitle');
    if (titleEl) titleEl.textContent = 'Loading\u2026';
    userCol('insurancePolicies').doc(id).get()
        .then(function(snap) {
            if (!snap.exists) { alert('Policy not found.'); location.hash = '#health-insurance'; return; }
            window.currentInsurance = Object.assign({ id: snap.id }, snap.data());
            renderInsuranceDetail(window.currentInsurance);
        })
        .catch(function(err) { console.error('loadInsuranceDetailPage:', err); });
}

function renderInsuranceDetail(p) {
    document.getElementById('insuranceDetailTitle').textContent = p.carrier || 'Insurance Policy';

    var pairs = [
        ['insuranceDetailType',    p.type                  || '\u2014'],
        ['insuranceDetailCarrier', p.carrier               || '\u2014'],
        ['insuranceDetailPlan',    p.planName              || '\u2014'],
        ['insuranceDetailMember',  p.memberId              || '\u2014'],
        ['insuranceDetailGroup',   p.groupNumber           || '\u2014'],
        ['insuranceDetailPolicy',  p.policyNumber          || '\u2014'],
        ['insuranceDetailStart',   p.startDate             || '\u2014'],
        ['insuranceDetailEnd',     p.endDate               || 'Ongoing'],
        ['insuranceDetailPremium', p.premiumAmount ? '$' + p.premiumAmount + '/mo' : '\u2014'],
        ['insuranceDetailDeduct',  p.deductible    ? '$' + p.deductible            : '\u2014'],
        ['insuranceDetailOOP',     p.outOfPocketMax ? '$' + p.outOfPocketMax       : '\u2014'],
        ['insuranceDetailBenef',   p.beneficiaries         || '\u2014'],
        ['insuranceDetailPhone',   p.customerServicePhone  || '\u2014'],
        ['insuranceDetailNotes',   p.notes                 || '\u2014']
    ];
    pairs.forEach(function(pair) {
        var el = document.getElementById(pair[0]);
        if (el) el.textContent = pair[1];
    });

    var websiteEl = document.getElementById('insuranceDetailWebsite');
    if (websiteEl) {
        if (p.website) {
            websiteEl.innerHTML = '<a href="' + escapeHtml(p.website) + '" target="_blank" rel="noopener">' + escapeHtml(p.website) + '</a>';
        } else {
            websiteEl.textContent = '\u2014';
        }
    }

    var statusEl = document.getElementById('insuranceDetailStatus');
    if (statusEl) {
        statusEl.textContent = p.status === 'inactive' ? 'Inactive' : 'Active';
        statusEl.className   = 'health-badge ' + (p.status === 'inactive' ? 'health-badge--resolved' : 'health-badge--open');
    }
    var toggleBtn = document.getElementById('insuranceToggleBtn');
    if (toggleBtn) toggleBtn.textContent = p.status === 'inactive' ? 'Reactivate' : 'Deactivate';

    loadPhotos('insurancePolicy', p.id, 'insurancePhotoContainer', 'insurancePhotoEmptyState');
}

function editCurrentInsurance() {
    if (window.currentInsurance) openInsuranceModal(window.currentInsurance.id);
}

function toggleInsuranceStatus() {
    if (!window.currentInsurance) return;
    var label     = window.currentInsurance.status === 'inactive' ? 'reactivate' : 'deactivate';
    if (!confirm('Are you sure you want to ' + label + ' this policy?')) return;
    var newStatus = window.currentInsurance.status === 'inactive' ? 'active' : 'inactive';
    userCol('insurancePolicies').doc(window.currentInsurance.id).update({ status: newStatus })
        .then(function() { loadInsuranceDetailPage(window.currentInsurance.id); })
        .catch(function(err) { alert('Error: ' + err.message); });
}

// ── Add/Edit modal ───────────────────────────────────────────────

function openInsuranceModal(id) {
    var modal = document.getElementById('insuranceModal');
    modal.dataset.editId = id || '';
    document.getElementById('insuranceModalTitle').textContent = id ? 'Edit Policy' : 'Add Policy';

    ['insuranceCarrier','insurancePlanName','insuranceMemberId','insuranceGroupNumber',
     'insurancePolicyNumber','insuranceStartDate','insuranceEndDate','insurancePremium',
     'insuranceDeductible','insuranceOOPMax','insuranceBeneficiaries',
     'insurancePhone','insuranceWebsite','insuranceNotes'].forEach(function(fid) {
        var el = document.getElementById(fid);
        if (el) el.value = '';
    });
    document.getElementById('insuranceType').value   = '';
    document.getElementById('insuranceStatus').value = 'active';

    if (id) {
        userCol('insurancePolicies').doc(id).get().then(function(snap) {
            if (!snap.exists) return;
            var d = snap.data();
            document.getElementById('insuranceType').value            = d.type                 || '';
            document.getElementById('insuranceCarrier').value         = d.carrier              || '';
            document.getElementById('insurancePlanName').value        = d.planName             || '';
            document.getElementById('insuranceMemberId').value        = d.memberId             || '';
            document.getElementById('insuranceGroupNumber').value     = d.groupNumber          || '';
            document.getElementById('insurancePolicyNumber').value    = d.policyNumber         || '';
            document.getElementById('insuranceStartDate').value       = d.startDate            || '';
            document.getElementById('insuranceEndDate').value         = d.endDate              || '';
            document.getElementById('insurancePremium').value         = d.premiumAmount        || '';
            document.getElementById('insuranceDeductible').value      = d.deductible           || '';
            document.getElementById('insuranceOOPMax').value          = d.outOfPocketMax       || '';
            document.getElementById('insuranceBeneficiaries').value   = d.beneficiaries        || '';
            document.getElementById('insurancePhone').value           = d.customerServicePhone || '';
            document.getElementById('insuranceWebsite').value         = d.website              || '';
            document.getElementById('insuranceNotes').value           = d.notes                || '';
            document.getElementById('insuranceStatus').value          = d.status               || 'active';
        });
    }
    openModal('insuranceModal');
}

function saveInsurance() {
    var carrier = document.getElementById('insuranceCarrier').value.trim();
    if (!carrier) { alert('Carrier name is required.'); return; }

    var data = {
        type:                 document.getElementById('insuranceType').value,
        carrier:              carrier,
        planName:             document.getElementById('insurancePlanName').value.trim(),
        memberId:             document.getElementById('insuranceMemberId').value.trim(),
        groupNumber:          document.getElementById('insuranceGroupNumber').value.trim(),
        policyNumber:         document.getElementById('insurancePolicyNumber').value.trim(),
        startDate:            document.getElementById('insuranceStartDate').value  || null,
        endDate:              document.getElementById('insuranceEndDate').value    || null,
        premiumAmount:        document.getElementById('insurancePremium').value.trim(),
        deductible:           document.getElementById('insuranceDeductible').value.trim(),
        outOfPocketMax:       document.getElementById('insuranceOOPMax').value.trim(),
        beneficiaries:        document.getElementById('insuranceBeneficiaries').value.trim(),
        customerServicePhone: document.getElementById('insurancePhone').value.trim(),
        website:              document.getElementById('insuranceWebsite').value.trim(),
        notes:                document.getElementById('insuranceNotes').value.trim(),
        status:               document.getElementById('insuranceStatus').value || 'active'
    };

    var editId = document.getElementById('insuranceModal').dataset.editId;
    var op;
    if (editId) {
        op = userCol('insurancePolicies').doc(editId).update(data).then(function() { return editId; });
    } else {
        data.contactId = null;
        data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        op = userCol('insurancePolicies').add(data).then(function(ref) { return ref.id; });
    }
    op.then(function(id) {
        document.getElementById('insuranceModal').classList.remove('open');
        history.replaceState(null, '', '#health-insurance/' + id);
        handleRoute();
    }).catch(function(err) { alert('Error saving: ' + err.message); });
}

// =================================================================
//  EMERGENCY INFO (H5)
// =================================================================

function loadEmergencyPage() {
    var container = document.getElementById('emergencyInfoContainer');
    if (!container) return;
    container.innerHTML = '<p class="empty-state">Loading\u2026</p>';

    userCol('emergencyInfo').doc('main').get()
        .then(function(snap) {
            renderEmergencyInfo(snap.exists ? snap.data() : {});
        })
        .catch(function(err) {
            container.innerHTML = '<p class="empty-state">Error loading emergency info.</p>';
            console.error('loadEmergencyPage:', err);
        });
}

function renderEmergencyInfo(info) {
    Promise.all([
        userCol('conditions').get(),
        (info.criticalMedicationIds || []).length
            ? Promise.all((info.criticalMedicationIds).map(function(id) { return userCol('medications').doc(id).get(); }))
            : Promise.resolve([])
    ]).then(function(results) {
        var activeConds = results[0].docs
            .map(function(d) { return Object.assign({ id: d.id }, d.data()); })
            .filter(function(c) { return c.status !== 'resolved'; })
            .sort(function(a, b) { return (a.name || '').localeCompare(b.name || ''); });
        var critMeds = results[1]
            .filter(function(s) { return s.exists; })
            .map(function(s) { return Object.assign({ id: s.id }, s.data()); });
        _renderEmergencyCard(info, activeConds, critMeds);
    }).catch(function() { _renderEmergencyCard(info, [], []); });
}

function _renderEmergencyCard(info, conditions, medications) {
    var container = document.getElementById('emergencyInfoContainer');
    if (!container) return;

    var condsHtml = conditions.length
        ? conditions.map(function(c) {
            return '<div class="health-linked-item">' + escapeHtml(c.name || '') +
                (c.managementNotes ? ' \u2014 ' + escapeHtml(c.managementNotes) : '') + '</div>';
          }).join('')
        : '<p class="empty-state">No active or managed conditions.</p>';

    var medsHtml = medications.length
        ? medications.map(function(m) {
            return '<div class="health-linked-item">' + escapeHtml(m.name || '') +
                (m.dosage ? ' \u2014 ' + escapeHtml(m.dosage) : '') + '</div>';
          }).join('')
        : '<p class="empty-state">None selected.</p>';

    var contactsHtml = (info.emergencyContacts || []).length
        ? (info.emergencyContacts || []).map(function(c) {
            return '<div class="health-linked-item">' +
                escapeHtml(c.name || '') +
                (c.relationship ? ' \u2014 ' + escapeHtml(c.relationship) : '') +
                (c.phone ? ' \u2014 ' + escapeHtml(c.phone) : '') + '</div>';
          }).join('')
        : '<p class="empty-state">None entered.</p>';

    container.innerHTML =
        '<div class="emergency-grid">' +
            '<div class="emergency-field"><span class="health-detail-label">Blood Type</span>' +
                '<span class="health-detail-value">' + escapeHtml(info.bloodType || '\u2014') + '</span></div>' +
            '<div class="emergency-field"><span class="health-detail-label">Organ Donor</span>' +
                '<span class="health-detail-value">' + escapeHtml(info.organDonor || '\u2014') + '</span></div>' +
        '</div>' +
        '<div class="section-heading">Primary Care Doctor</div>' +
        '<div class="health-detail-card">' + escapeHtml(info.primaryCareDoctor || '\u2014') + '</div>' +
        '<div class="section-heading">Emergency Contacts</div>' + contactsHtml +
        '<div class="section-heading">Known Conditions <span class="health-badge">auto-pulled</span></div>' + condsHtml +
        '<div class="section-heading">Critical Medications</div>' + medsHtml +
        '<div class="section-heading">Critical Allergies</div>' +
        '<div class="health-detail-card">' + escapeHtml(info.criticalAllergies || '\u2014') + '</div>' +
        '<div class="section-heading">Additional Notes</div>' +
        '<div class="health-detail-card">' + escapeHtml(info.notes || '\u2014') + '</div>';
}

// ── Edit modal ───────────────────────────────────────────────────

async function openEmergencyModal() {
    ['emergencyBloodType','emergencyDoctor','emergencyAllergies','emergencyNotes'].forEach(function(fid) {
        document.getElementById(fid).value = '';
    });
    document.getElementById('emergencyOrganDonor').value  = '';
    document.getElementById('emergencyContactsList').innerHTML = '';
    document.getElementById('emergencyMedChecklist').innerHTML = '<p class="empty-state">Loading\u2026</p>';

    var snap = await userCol('emergencyInfo').doc('main').get().catch(function() { return { exists: false }; });
    var info = snap.exists ? snap.data() : {};

    document.getElementById('emergencyBloodType').value  = info.bloodType         || '';
    document.getElementById('emergencyOrganDonor').value = info.organDonor        || '';
    document.getElementById('emergencyDoctor').value     = info.primaryCareDoctor || '';
    document.getElementById('emergencyAllergies').value  = info.criticalAllergies || '';
    document.getElementById('emergencyNotes').value      = info.notes             || '';
    (info.emergencyContacts || []).forEach(function(c) { _emergencyAddContactRow(c); });

    var savedIds = info.criticalMedicationIds || [];
    userCol('medications').get()
        .then(function(medSnap) {
            var active = medSnap.docs
                .map(function(d) { return Object.assign({ id: d.id }, d.data()); })
                .filter(function(m) { return m.status !== 'completed'; })
                .sort(function(a, b) { return (a.name || '').localeCompare(b.name || ''); });

            var cl = document.getElementById('emergencyMedChecklist');
            if (active.length === 0) {
                cl.innerHTML = '<p class="empty-state">No active medications.</p>';
                return;
            }
            cl.innerHTML = '';
            active.forEach(function(m) {
                var label = document.createElement('label');
                label.className = 'emergency-med-item';
                var cb = document.createElement('input');
                cb.type    = 'checkbox';
                cb.value   = m.id;
                cb.checked = savedIds.indexOf(m.id) !== -1;
                label.appendChild(cb);
                label.appendChild(document.createTextNode(
                    ' ' + (m.name || '') + (m.dosage ? ' \u2014 ' + m.dosage : '')
                ));
                cl.appendChild(label);
            });
        })
        .catch(function() {
            document.getElementById('emergencyMedChecklist').innerHTML =
                '<p class="empty-state">Could not load medications.</p>';
        });

    openModal('emergencyModal');
}

function _emergencyAddContactRow(contact) {
    contact = contact || {};
    var list = document.getElementById('emergencyContactsList');
    var div  = document.createElement('div');
    div.className = 'emergency-contact-row';
    div.innerHTML =
        '<input type="text" class="em-input em-name"  placeholder="Name"         value="' + escapeHtml(contact.name         || '') + '">' +
        '<input type="text" class="em-input em-rel"   placeholder="Relationship" value="' + escapeHtml(contact.relationship || '') + '">' +
        '<input type="text" class="em-input em-phone" placeholder="Phone"        value="' + escapeHtml(contact.phone        || '') + '">' +
        '<button type="button" class="btn btn-danger btn-small" onclick="_emergencyRemoveContactRow(this)">&times;</button>';
    list.appendChild(div);
}

function _emergencyRemoveContactRow(btn) {
    var row = btn.closest('.emergency-contact-row');
    if (row) row.remove();
}

function saveEmergencyInfo() {
    var critMedIds = [];
    document.querySelectorAll('#emergencyMedChecklist input[type="checkbox"]:checked')
        .forEach(function(cb) { critMedIds.push(cb.value); });

    var contacts = [];
    document.querySelectorAll('#emergencyContactsList .emergency-contact-row').forEach(function(row) {
        var name = row.querySelector('.em-name').value.trim();
        if (!name) return;
        contacts.push({
            name:         name,
            relationship: row.querySelector('.em-rel').value.trim(),
            phone:        row.querySelector('.em-phone').value.trim()
        });
    });

    var data = {
        bloodType:             document.getElementById('emergencyBloodType').value.trim(),
        organDonor:            document.getElementById('emergencyOrganDonor').value,
        primaryCareDoctor:     document.getElementById('emergencyDoctor').value.trim(),
        criticalAllergies:     document.getElementById('emergencyAllergies').value.trim(),
        notes:                 document.getElementById('emergencyNotes').value.trim(),
        emergencyContacts:     contacts,
        criticalMedicationIds: critMedIds,
        updatedAt:             firebase.firestore.FieldValue.serverTimestamp()
    };

    userCol('emergencyInfo').doc('main').set(data, { merge: true })
        .then(function() {
            closeModal('emergencyModal');
            loadEmergencyPage();
        })
        .catch(function(err) { alert('Error saving: ' + err.message); });
}


// ════════════════════════════════════════════════════════════════
// H6 — APPOINTMENTS
// Firestore collection: healthAppointments
// Fields: date, time, provider, type, notes, status, linkedVisitId
// ════════════════════════════════════════════════════════════════

/** Maps appointment type dropdown value to providerType for the Visit form. */
var APPT_TYPE_TO_PROVIDER_TYPE = {
    'Physical':        'Primary Care',
    'Follow-up':       'Primary Care',
    'Dental Cleaning': 'Dentist',
    'Specialist':      'Specialist',
    'Lab Work':        'Primary Care',
    'Eye Exam':        'Optometrist',
    'Other':           'Other'
};

/** Cache of appointments for the list page (used by convert modal). */
var _apptAllRecords = [];

// ── List page ────────────────────────────────────────────────────

async function loadAppointmentsPage() {
    var container = document.getElementById('appointmentsList');
    container.innerHTML = '<p class="empty-state">Loading...</p>';

    try {
        // Parallel fetch: appointments + lookup maps for contacts, concerns, conditions
        var results = await Promise.all([
            userCol('healthAppointments').orderBy('date', 'asc').get(),
            userCol('people').get(),
            userCol('concerns').get(),
            userCol('conditions').get()
        ]);
        var apptSnap      = results[0];
        var contactSnap   = results[1];
        var concernSnap   = results[2];
        var conditionSnap = results[3];

        _apptAllRecords = apptSnap.docs.map(function(d) {
            return Object.assign({ id: d.id }, d.data());
        });

        // Build id → data maps for resolving linked records
        var contactMap = {};
        contactSnap.docs.forEach(function(d) { contactMap[d.id] = d.data(); });
        var concernMap = {};
        concernSnap.docs.forEach(function(d) { concernMap[d.id] = d.data(); });
        var conditionMap = {};
        conditionSnap.docs.forEach(function(d) { conditionMap[d.id] = d.data(); });

        if (_apptAllRecords.length === 0) {
            container.innerHTML = '<p class="empty-state">No appointments yet. Tap + Add to schedule one.</p>';
            return;
        }

        var today    = new Date().toISOString().slice(0, 10);
        // 'converted' appointments (Mark Done flow) go to Past; only truly open ones in upcoming/overdue
        var upcoming = _apptAllRecords.filter(function(a) {
            return a.status !== 'completed' && a.status !== 'cancelled' && a.status !== 'converted' && a.date >= today;
        });
        var overdue  = _apptAllRecords.filter(function(a) {
            return a.status !== 'completed' && a.status !== 'cancelled' && a.status !== 'converted' && a.date < today;
        });
        var past     = _apptAllRecords.filter(function(a) {
            return a.status === 'completed' || a.status === 'cancelled' || a.status === 'converted';
        });

        var opts = { contactMap: contactMap, concernMap: concernMap, conditionMap: conditionMap };
        var html = '';

        if (overdue.length > 0) {
            overdue.forEach(function(a) { html += buildAppointmentCard(a, true, opts); });
        }
        if (upcoming.length > 0) {
            html += '<div class="section-heading">Upcoming</div>';
            upcoming.forEach(function(a) { html += buildAppointmentCard(a, false, opts); });
        }
        if (upcoming.length === 0 && overdue.length === 0) {
            html = '<p class="empty-state">No upcoming appointments.</p>' + html;
        }
        if (past.length > 0) {
            html += '<div class="section-heading">Past Appointments</div>';
            past.slice(0, 30).forEach(function(a) { html += buildAppointmentCard(a, false, opts); });
        }

        container.innerHTML = html;
    } catch(err) {
        container.innerHTML = '<p class="empty-state">Error loading: ' + escapeHtml(err.message) + '</p>';
    }
}

function buildAppointmentCard(a, isOverdue, opts) {
    opts = opts || {};
    var contactMap   = opts.contactMap   || {};
    var concernMap   = opts.concernMap   || {};
    var conditionMap = opts.conditionMap || {};

    var isConverted = a.status === 'converted';
    var statusClass = isConverted                ? 'appt-badge--converted'
                    : a.status === 'completed'   ? 'appt-badge--completed'
                    : a.status === 'cancelled'   ? 'appt-badge--cancelled'
                    : isOverdue                  ? 'appt-badge--overdue'
                    :                              'appt-badge--scheduled';
    var statusLabel = isConverted                ? 'Converted'
                    : a.status === 'completed'   ? 'Completed'
                    : a.status === 'cancelled'   ? 'Cancelled'
                    : isOverdue                  ? 'Overdue'
                    :                              'Scheduled';

    var dateStr = a.date ? _apptFormatDate(a.date) : '—';
    if (a.time) dateStr += ' at ' + _apptFormatTime(a.time);

    // Type badge in card title area
    var typeBadgeHtml = a.type
        ? '<span class="appt-type-badge">' + escapeHtml(a.type) + '</span>'
        : '<span style="color:#94a3b8;">Appointment</span>';

    // Facility line — prefer linked contact, fall back to free text or legacy provider field
    var facilityHtml = '';
    if (a.facilityContactId && contactMap[a.facilityContactId]) {
        facilityHtml = '<a href="#contact/' + a.facilityContactId + '" class="appt-contact-link">' +
            escapeHtml(contactMap[a.facilityContactId].name || '') + '</a>';
    } else if (a.facilityText) {
        facilityHtml = escapeHtml(a.facilityText);
    }

    // Provider line — prefer linked contact, fall back to free text or legacy provider field
    var providerHtml = '';
    if (a.providerContactId && contactMap[a.providerContactId]) {
        providerHtml = '<a href="#contact/' + a.providerContactId + '" class="appt-contact-link">' +
            escapeHtml(contactMap[a.providerContactId].name || '') + '</a>';
    } else if (a.providerText) {
        providerHtml = escapeHtml(a.providerText);
    } else if (a.provider) {
        // backwards compat — old plain-text provider field
        providerHtml = escapeHtml(a.provider);
    }

    // Concern / condition chips
    var chips = '';
    (a.concernIds || []).forEach(function(cid) {
        var title = concernMap[cid] ? (concernMap[cid].title || cid) : cid;
        chips += '<span class="health-chip health-chip--concern">\u26a0\ufe0f ' + escapeHtml(title) + '</span>';
    });
    (a.conditionIds || []).forEach(function(cid) {
        var title = conditionMap[cid] ? (conditionMap[cid].title || cid) : cid;
        chips += '<span class="health-chip health-chip--condition">\ud83d\udccb ' + escapeHtml(title) + '</span>';
    });

    // Action buttons — converted appointments are read-only (no Edit, no Mark Done)
    // Delete is in the edit modal, not the card
    var actionsHtml = '';
    if (!isConverted) {
        actionsHtml += '<button class="btn btn-secondary btn-small" onclick="openApptModal(\'' + a.id + '\')">Edit</button>';
    }
    if (a.status !== 'completed' && a.status !== 'cancelled' && !isConverted) {
        actionsHtml += '<button class="btn btn-primary btn-small" onclick="openConvertToVisitModal(\'' + a.id + '\')">\u2713 Mark Done</button>';
    }
    if ((isConverted || a.status === 'completed') && a.linkedVisitId) {
        actionsHtml += '<a href="#health-visit/' + a.linkedVisitId + '" class="btn btn-secondary btn-small">View Visit</a>';
    }

    // Date — tappable shortcut to edit (converted appts open read-only edit; no-op for converted)
    var dateHtml = isConverted
        ? '<div class="appt-card-date">' + dateStr + '</div>'
        : '<div class="appt-card-date appt-card-date--link" onclick="openApptModal(\'' + a.id + '\')">' + dateStr + '</div>';

    return '<div class="health-card appt-card">' +
        '<div class="appt-card-top">' +
            typeBadgeHtml +
            '<span class="appt-badge ' + statusClass + '">' + statusLabel + '</span>' +
        '</div>' +
        dateHtml +
        (facilityHtml ? '<div class="appt-detail-row"><span class="appt-detail-label">Facility:</span> ' + facilityHtml + '</div>' : '') +
        (providerHtml ? '<div class="appt-detail-row"><span class="appt-detail-label">Provider:</span> ' + providerHtml + '</div>' : '') +
        (chips ? '<div class="appt-chips">' + chips + '</div>' : '') +
        (a.notes ? '<div class="health-card-notes">' + escapeHtml(a.notes) + '</div>' : '') +
        '<div class="appt-card-actions">' + actionsHtml + '</div>' +
    '</div>';
}

function _apptFormatDate(iso) {
    var p = iso.split('-');
    if (p.length !== 3) return iso;
    var d = new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]));
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function _apptFormatTime(t) {
    if (!t) return '';
    var p = t.split(':');
    var h = parseInt(p[0]), m = p[1];
    var ampm = h >= 12 ? 'PM' : 'AM';
    var h12 = h % 12 || 12;
    return h12 + ':' + m + ' ' + ampm;
}

// ── Add / Edit modal ─────────────────────────────────────────────

async function openApptModal(id) {
    var modal = document.getElementById('apptModal');
    modal.dataset.editId = id || '';
    document.getElementById('apptModalTitle').textContent = id ? 'Edit Appointment' : 'Add Appointment';
    // Show Delete button only when editing an existing appointment
    var apptDeleteBtn = document.getElementById('apptDeleteBtn');
    if (apptDeleteBtn) apptDeleteBtn.style.display = id ? '' : 'none';
    // Cancel Appointment button shown only for active (non-cancelled, non-converted) appointments
    // Will be updated below after loading the appointment status
    var apptCancelBtn = document.getElementById('apptCancelBtn');
    if (apptCancelBtn) apptCancelBtn.style.display = 'none';

    // Reset fields
    document.getElementById('apptDate').value   = '';
    document.getElementById('apptTime').value   = '';
    document.getElementById('apptType').value   = '';
    document.getElementById('apptStatus').value = 'scheduled';
    document.getElementById('apptNotes').value  = '';

    var facInitId = '', facInitName = '', provInitId = '', provInitName = '';
    var checkedConcernIds = [], checkedConditionIds = [];

    // If editing, load existing appointment data first so pickers can pre-populate
    if (id) {
        try {
            var snap = await userCol('healthAppointments').doc(id).get();
            if (snap.exists) {
                var d = snap.data();
                document.getElementById('apptDate').value   = d.date   || '';
                document.getElementById('apptTime').value   = d.time   || '';
                document.getElementById('apptType').value   = d.type   || '';
                document.getElementById('apptStatus').value = d.status || 'scheduled';
                document.getElementById('apptNotes').value  = d.notes  || '';
                // Show "Cancel Appointment" only for active (scheduled/overdue) appts
                var isActive = d.status !== 'cancelled' && d.status !== 'completed' && d.status !== 'converted';
                if (apptCancelBtn) apptCancelBtn.style.display = isActive ? '' : 'none';
                checkedConcernIds   = d.concernIds   || [];
                checkedConditionIds = d.conditionIds || [];
                facInitId  = d.facilityContactId || '';
                provInitId = d.providerContactId || '';

                // Fetch contact names needed to pre-populate the pickers
                var namePromises = [];
                if (facInitId)  namePromises.push(userCol('people').doc(facInitId).get());
                if (provInitId) namePromises.push(userCol('people').doc(provInitId).get());
                if (namePromises.length > 0) {
                    var nameSnaps = await Promise.all(namePromises);
                    var ni = 0;
                    if (facInitId)  { facInitName  = (nameSnaps[ni] && nameSnaps[ni].exists) ? (nameSnaps[ni].data().name || '') : ''; ni++; }
                    if (provInitId) { provInitName = (nameSnaps[ni] && nameSnaps[ni].exists) ? (nameSnaps[ni].data().name || '') : ''; }
                }
            }
        } catch(e) { /* ignore — pickers will just open empty */ }
    }

    // Build ContactPickers (with initial values already loaded above if editing)
    buildContactPicker('apptFacilityPicker', {
        filterCategory: 'Medical Facility',
        allowCreate:    true,
        placeholder:    'Search facilities...',
        initialId:      facInitId   || undefined,
        initialName:    facInitName || undefined
    });
    buildContactPicker('apptProviderPicker', {
        filterCategory:  'Medical Professional',
        allowCreate:     true,
        placeholder:     'Search providers... (optional)',
        initialId:       provInitId   || undefined,
        initialName:     provInitName || undefined,
        facilityPickerId: 'apptFacilityPicker'   // show facility staff on focus
    });

    // Load concern/condition checkboxes
    var concernsList = document.getElementById('apptConcernsList');
    concernsList.innerHTML = '<p style="margin:4px 0; font-size:0.85rem; color:#64748b;">Loading...</p>';
    try {
        var ccResults = await Promise.all([
            userCol('concerns').where('status', '==', 'open').get(),
            userCol('conditions').where('status', 'in', ['active', 'managed']).get()
        ]);
        var concernSnap   = ccResults[0];
        var conditionSnap = ccResults[1];

        var items = [];
        concernSnap.docs.forEach(function(cd) {
            items.push({ id: cd.id, title: cd.data().title || cd.id, kind: 'concern' });
        });
        conditionSnap.docs.forEach(function(cd) {
            items.push({ id: cd.id, title: cd.data().title || cd.id, kind: 'condition' });
        });
        items.sort(function(a, b) { return a.title.localeCompare(b.title); });

        if (items.length === 0) {
            concernsList.innerHTML = '<p style="margin:4px 0; font-size:0.85rem; color:#94a3b8;">No open concerns or active conditions.</p>';
        } else {
            concernsList.innerHTML = items.map(function(item) {
                var icon    = item.kind === 'concern' ? '\u26a0\ufe0f' : '\ud83d\udccb';
                var checked = (item.kind === 'concern'   && checkedConcernIds.indexOf(item.id)   !== -1) ||
                              (item.kind === 'condition' && checkedConditionIds.indexOf(item.id) !== -1);
                return '<label class="appt-concern-item">' +
                    '<input type="checkbox" class="appt-concern-chk"' +
                    ' data-id="' + item.id + '" data-kind="' + item.kind + '"' +
                    (checked ? ' checked' : '') + '> ' +
                    '<span class="appt-concern-icon">' + icon + '</span> ' +
                    '<span>' + escapeHtml(item.title) + '</span>' +
                '</label>';
            }).join('');
        }
    } catch(err) {
        concernsList.innerHTML = '<p style="color:#dc2626; font-size:0.85rem;">Error: ' + escapeHtml(err.message) + '</p>';
    }

    openModal('apptModal');
}

function saveAppointment() {
    var date = document.getElementById('apptDate').value;
    if (!date) { alert('Date is required.'); return; }

    // Collect ContactPicker selections
    var facPicker  = document.getElementById('apptFacilityPicker');
    var provPicker = document.getElementById('apptProviderPicker');
    var facilityContactId = (facPicker  && facPicker._getSelectedId)  ? (facPicker._getSelectedId()  || null) : null;
    var providerContactId = (provPicker && provPicker._getSelectedId) ? (provPicker._getSelectedId() || null) : null;

    // Collect checked concern / condition IDs
    var concernIds   = [];
    var conditionIds = [];
    document.querySelectorAll('#apptConcernsList .appt-concern-chk:checked').forEach(function(chk) {
        if (chk.dataset.kind === 'concern')   concernIds.push(chk.dataset.id);
        if (chk.dataset.kind === 'condition') conditionIds.push(chk.dataset.id);
    });

    var data = {
        date:             date,
        time:             document.getElementById('apptTime').value.trim(),
        type:             document.getElementById('apptType').value,
        status:           document.getElementById('apptStatus').value || 'scheduled',
        notes:            document.getElementById('apptNotes').value.trim(),
        facilityContactId: facilityContactId,
        providerContactId: providerContactId,
        concernIds:        concernIds,
        conditionIds:      conditionIds
    };

    var modal  = document.getElementById('apptModal');
    var editId = modal.dataset.editId;
    var p;
    if (editId) {
        p = userCol('healthAppointments').doc(editId).update(data);
    } else {
        data.contactId = null;
        data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        p = userCol('healthAppointments').add(data);
    }

    p.then(function() {
        document.getElementById('apptModal').classList.remove('open');
        history.replaceState(null, '', '#health-appointments');
        handleRoute();
    }).catch(function(err) { alert('Error saving: ' + err.message); });
}

function deleteAppointment(id) {
    if (!confirm('Delete this appointment?')) return;
    userCol('healthAppointments').doc(id).delete().then(function() {
        loadAppointmentsPage();
    }).catch(function(err) { alert('Error: ' + err.message); });
}

// Called from the edit modal — saves notes + marks cancelled in one step
function cancelApptFromModal() {
    var modal = document.getElementById('apptModal');
    var id    = modal.dataset.editId;
    if (!id) return;
    if (!confirm('Mark this appointment as cancelled?')) return;
    var notes = document.getElementById('apptNotes').value.trim();
    var update = { status: 'cancelled' };
    if (notes) update.notes = notes;
    closeModal('apptModal');
    userCol('healthAppointments').doc(id).update(update).then(function() {
        loadAppointmentsPage();
    }).catch(function(err) { alert('Error: ' + err.message); });
}

function cancelAppointment(id) {
    if (!confirm('Mark this appointment as cancelled?')) return;
    userCol('healthAppointments').doc(id).update({ status: 'cancelled' }).then(function() {
        loadAppointmentsPage();
    }).catch(function(err) { alert('Error: ' + err.message); });
}

// ── Appointment to Visit conversion ──────────────────────────────

/**
 * Opens a conversion form pre-filled from the appointment.
 * User reviews/edits the visit details, then saves — creating the visit
 * and marking the appointment completed with linkedVisitId set.
 */
async function openConvertToVisitModal(apptId) {
    var appt = _apptAllRecords.find(function(a) { return a.id === apptId; });
    if (!appt) return;

    var modal = document.getElementById('apptConvertModal');
    modal.dataset.apptId            = apptId;
    modal.dataset.facilityContactId = appt.facilityContactId || '';
    modal.dataset.providerContactId = appt.providerContactId || '';
    modal.dataset.concernIds        = JSON.stringify(appt.concernIds  || []);
    modal.dataset.conditionIds      = JSON.stringify(appt.conditionIds || []);

    // Date pre-filled from the appointment's date (not today)
    document.getElementById('acvDate').value = appt.date || new Date().toISOString().slice(0, 10);
    document.getElementById('acvTime').value = appt.time || '';

    // Visit type — pre-filled from appointment type
    document.getElementById('acvType').value = appt.type || '';

    // Clear editable fields
    ['acvReason','acvWhatDone','acvOutcome','acvCost','acvNotes','acvProviderWho'].forEach(function(id) {
        document.getElementById(id).value = '';
    });

    // Facility display row
    var facilityRow = document.getElementById('acvFacilityRow');
    var facilityDisplay = document.getElementById('acvFacilityDisplay');
    if (appt.facilityContactId) {
        facilityRow.style.display = '';
        facilityDisplay.textContent = 'Loading\u2026';
        userCol('people').doc(appt.facilityContactId).get().then(function(snap) {
            var name = snap.exists ? (snap.data().name || 'Unknown') : 'Unknown';
            facilityDisplay.innerHTML = '<a href="#contact/' + appt.facilityContactId + '">' + escapeHtml(name) + '</a>';
        }).catch(function() { facilityDisplay.textContent = appt.facilityText || ''; });
    } else if (appt.facilityText) {
        facilityRow.style.display = '';
        facilityDisplay.textContent = appt.facilityText;
    } else {
        facilityRow.style.display = 'none';
    }

    // Provider — pre-fill "Who did you see?" from providerText or contact name
    if (appt.providerContactId) {
        userCol('people').doc(appt.providerContactId).get().then(function(snap) {
            document.getElementById('acvProviderWho').value =
                snap.exists ? (snap.data().name || '') : (appt.providerText || '');
        }).catch(function() {
            document.getElementById('acvProviderWho').value = appt.providerText || '';
        });
    } else {
        document.getElementById('acvProviderWho').value = appt.providerText || '';
    }

    // Reset save button
    var saveBtn = document.getElementById('acvSaveBtn');
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save & Continue \u2192'; }

    openModal('apptConvertModal');
}

function saveConvertedVisit() {
    var date = document.getElementById('acvDate').value;
    if (!date) { alert('Date is required.'); return; }

    var modal = document.getElementById('apptConvertModal');
    var apptId = modal.dataset.apptId;

    var saveBtn = document.getElementById('acvSaveBtn');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving\u2026'; }

    var visitData = {
        date:               date,
        type:               document.getElementById('acvType').value || '',
        facilityContactId:  modal.dataset.facilityContactId || null,
        providerText:       document.getElementById('acvProviderWho').value.trim(),
        providerContactId:  modal.dataset.providerContactId || null,
        concernIds:         JSON.parse(modal.dataset.concernIds  || '[]'),
        conditionIds:       JSON.parse(modal.dataset.conditionIds || '[]'),
        reason:             document.getElementById('acvReason').value.trim(),
        whatWasDone:        document.getElementById('acvWhatDone').value.trim(),
        outcome:            document.getElementById('acvOutcome').value.trim(),
        cost:               document.getElementById('acvCost').value.trim(),
        notes:              document.getElementById('acvNotes').value.trim(),
        contactId:          null,
        createdAt:          firebase.firestore.FieldValue.serverTimestamp()
    };

    userCol('healthVisits').add(visitData).then(function(ref) {
        return userCol('healthAppointments').doc(apptId).update({
            status:        'converted',
            linkedVisitId: ref.id
        }).then(function() { return ref.id; });
    }).then(function(visitId) {
        // Navigate first, THEN close the modal.
        // closeModal calls history.back() asynchronously; if we closed first,
        // that back() would override the hash we just set and return to #health-appointments.
        location.hash = '#health-visit-step2/' + visitId;
        document.getElementById('apptConvertModal').classList.remove('open');
    }).catch(function(err) {
        alert('Error saving visit: ' + err.message);
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save & Continue \u2192'; }
    });
}

// =================================================================
//  VISIT STEP 2 — Per-Concern/Condition Notes & Prescriptions
//  Route: #health-visit-step2/{visitId}
// =================================================================

/** Current visit being processed in Step 2. */
var _step2Visit = null;

async function loadStep2Page(visitId) {
    var accordion = document.getElementById('step2AccordionList');
    accordion.innerHTML = '<p class="empty-state">Loading\u2026</p>';

    document.getElementById('step2NewConcernForm').style.display      = 'none';
    document.getElementById('step2NewConditionForm').style.display    = 'none';
    document.getElementById('step2ExistingConcernForm').style.display  = 'none';
    document.getElementById('step2ExistingConditionForm').style.display = 'none';
    document.getElementById('step2NewConcernTitle').value              = '';
    document.getElementById('step2NewConcernArea').value               = '';
    document.getElementById('step2NewConditionName').value             = '';

    try {
        var snap = await userCol('healthVisits').doc(visitId).get();
        if (!snap.exists) {
            accordion.innerHTML = '<p class="empty-state">Visit not found.</p>';
            return;
        }
        _step2Visit = Object.assign({ id: snap.id }, snap.data());

        var concernIds   = _step2Visit.concernIds   || [];
        var conditionIds = _step2Visit.conditionIds || [];

        if (concernIds.length === 0 && conditionIds.length === 0) {
            accordion.innerHTML = '<p class="empty-state" style="margin:16px;">No concerns or conditions linked yet. Use the buttons below to add some.</p>';
        } else {
            var [concernSnap, conditionSnap] = await Promise.all([
                concernIds.length   ? userCol('concerns').get()   : Promise.resolve({ docs: [] }),
                conditionIds.length ? userCol('conditions').get() : Promise.resolve({ docs: [] })
            ]);
            var concernMap  = {};
            concernSnap.docs.forEach(function(d) { concernMap[d.id]  = d.data().title || d.id; });
            var conditionMap = {};
            conditionSnap.docs.forEach(function(d) { conditionMap[d.id] = d.data().name  || d.id; });

            accordion.innerHTML = '';
            concernIds.forEach(function(cid) {
                accordion.appendChild(_step2BuildAccordionItem('concern',   cid, concernMap[cid]   || cid));
                _step2InitItemVoice('concern',   cid);
                _step2LoadPriorNotes('concern',  cid);
            });
            conditionIds.forEach(function(cid) {
                accordion.appendChild(_step2BuildAccordionItem('condition', cid, conditionMap[cid] || cid));
                _step2InitItemVoice('condition', cid);
                _step2LoadPriorNotes('condition', cid);
            });
            concernIds.forEach(function(cid)   { _step2LoadMedsForItem('concern',   cid); });
            conditionIds.forEach(function(cid)  { _step2LoadMedsForItem('condition', cid); });
        }
    } catch(err) {
        accordion.innerHTML = '<p class="empty-state">Error: ' + escapeHtml(err.message) + '</p>';
        console.error('loadStep2Page:', err);
    }
}

function _step2BuildAccordionItem(type, id, name) {
    var icon = type === 'concern' ? '\u26a0\ufe0f' : '\ud83d\udccb';
    var div  = document.createElement('div');
    div.className = 'step2-accordion-item';
    div.id = 'step2-item-' + type + '-' + id;
    var speakBtnId = 'step2SpeakBtn-' + type + '-' + id;
    div.innerHTML =
        '<div class="step2-accordion-header" onclick="toggleStep2Item(this.parentElement)">' +
            '<span class="step2-item-icon">' + icon + '</span>' +
            '<span class="step2-item-name">' +
                '<span class="health-badge health-badge--' + (type === 'concern' ? 'open' : 'status-active') + '">' +
                    (type === 'concern' ? 'Concern' : 'Condition') +
                '</span> ' + escapeHtml(name) +
            '</span>' +
            '<span class="step2-chevron">\u25bc</span>' +
        '</div>' +
        '<div class="step2-accordion-body">' +
            '<div class="form-group">' +
                '<label style="display:flex;align-items:center;justify-content:space-between;">' +
                    'Notes from this visit:' +
                    '<button class="btn btn-secondary btn-small" id="' + speakBtnId + '">\uD83C\uDFA4 Speak</button>' +
                '</label>' +
                '<textarea id="step2Note-' + type + '-' + id + '" rows="3" placeholder="Add a note about this ' + type + ' from this visit\u2026"></textarea>' +
            '</div>' +
            '<div class="step2-meds-header">' +
                '<span>Medications</span>' +
                '<div style="display:flex;gap:6px;">' +
                    '<button class="btn btn-secondary btn-small" onclick="_step2AddNewMed(\'' + type + '\',\'' + id + '\')">+ New Med</button>' +
                    '<button class="btn btn-primary btn-small" onclick="_step2OpenMedPicker(\'' + type + '\',\'' + id + '\')">+ Link Existing</button>' +
                '</div>' +
            '</div>' +
            '<div class="step2-meds-list" id="step2Meds-' + type + '-' + id + '"></div>' +
        '</div>';
    return div;
}

/** Call after appending a new accordion item to wire up voice-to-text. */
function _step2InitItemVoice(type, id) {
    initVoiceToText('step2Note-' + type + '-' + id, 'step2SpeakBtn-' + type + '-' + id);
}

/**
 * If a note was already saved for this concern/condition from the current
 * visit, load it into the textarea for editing and store the doc ID on the
 * textarea so saveStep2AndDone() can UPDATE instead of INSERT.
 */
function _step2LoadPriorNotes(type, id) {
    if (!_step2Visit) return;
    var ta = document.getElementById('step2Note-' + type + '-' + id);
    if (!ta) return;
    var collection = type === 'concern' ? 'concernUpdates' : 'healthConditionLogs';
    var idField    = type === 'concern' ? 'concernId'      : 'conditionId';
    userCol(collection)
        .where(idField,   '==', id)
        .where('visitId', '==', _step2Visit.id)
        .get()
        .then(function(snap) {
            if (snap.empty) return;
            // Take the most recent entry if somehow there are multiples
            var sorted = snap.docs.slice().sort(function(a, b) {
                return (b.data().date || '').localeCompare(a.data().date || '');
            });
            var doc = sorted[0];
            ta.value = doc.data().note || '';
            ta.dataset.existingNoteId = doc.id;  // used by saveStep2AndDone to UPDATE
        })
        .catch(function(err) { console.warn('_step2LoadPriorNotes:', err); });
}

function toggleStep2Item(itemEl) {
    var body    = itemEl.querySelector('.step2-accordion-body');
    var chevron = itemEl.querySelector('.step2-chevron');
    var isOpen  = body.style.display !== 'none';
    body.style.display = isOpen ? 'none' : '';
    if (chevron) chevron.textContent = isOpen ? '\u25b6' : '\u25bc';
}

function _step2LoadMedsForItem(type, id) {
    var container = document.getElementById('step2Meds-' + type + '-' + id);
    if (!container) return;
    container.innerHTML = '';
    var arrayField = type === 'concern' ? 'concernIds' : 'conditionIds';
    userCol('medications').where(arrayField, 'array-contains', id).get()
        .then(function(snap) {
            snap.docs.forEach(function(d) {
                var m   = d.data();
                var row = document.createElement('div');
                row.className = 'step2-med-row';
                row.innerHTML =
                    '<span>' + escapeHtml(m.name || '') + (m.dosage ? ' <small>(' + escapeHtml(m.dosage) + ')</small>' : '') + '</span>' +
                    '<button class="btn btn-danger btn-small" onclick="_step2UnlinkMed(\'' + d.id + '\',\'' + type + '\',\'' + id + '\')">&#10005;</button>';
                container.appendChild(row);
            });
        })
        .catch(function(err) { console.error('_step2LoadMedsForItem:', err); });
}

function _step2OpenMedPicker(type, id) {
    window._medPickerAfterSave = function() { _step2LoadMedsForItem(type, id); };
    openMedPicker(type, id);
}

/**
 * Open the blank "Add Medication" modal from Step 2.
 * After the user saves the new med, it is automatically linked to this
 * concern/condition and the meds list for this accordion item is refreshed.
 * The user sees the med modal, saves, and lands back on Step 2.
 */
function _step2AddNewMed(type, id) {
    // _medPickerCallback is called by openMedModal's save handler with the new med's ID.
    window._medPickerCallback = function(newMedId) {
        window._medPickerCallback = null;
        var arrayField = type === 'concern' ? 'concernIds' : 'conditionIds';
        userCol('medications').doc(newMedId).update({
            [arrayField]: firebase.firestore.FieldValue.arrayUnion(id)
        }).then(function() {
            _step2LoadMedsForItem(type, id);
        }).catch(function(err) { console.error('_step2AddNewMed link error:', err); });
    };
    // Pass the current visit so it's pre-selected in "Prescribed at Visit"
    openMedModal(null, { presetVisitId: _step2Visit ? _step2Visit.id : '' });
}

function _step2UnlinkMed(medId, type, id) {
    var arrayField = type === 'concern' ? 'concernIds' : 'conditionIds';
    userCol('medications').doc(medId).update({
        [arrayField]: firebase.firestore.FieldValue.arrayRemove(id)
    }).then(function() {
        _step2LoadMedsForItem(type, id);
    }).catch(function(err) { alert('Error: ' + err.message); });
}

function _step2ToggleNewConcernForm() {
    var form = document.getElementById('step2NewConcernForm');
    form.style.display = form.style.display === 'none' ? '' : 'none';
    if (form.style.display !== 'none') document.getElementById('step2NewConcernTitle').focus();
}

function _step2ToggleNewConditionForm() {
    var form = document.getElementById('step2NewConditionForm');
    form.style.display = form.style.display === 'none' ? '' : 'none';
    if (form.style.display !== 'none') document.getElementById('step2NewConditionName').focus();
}

/** Show/hide the "Add Existing Concern" picker, populating it with open concerns not yet on this visit. */
async function _step2ToggleExistingConcernForm() {
    var form = document.getElementById('step2ExistingConcernForm');
    var isHiding = form.style.display !== 'none';
    form.style.display = isHiding ? 'none' : '';
    if (isHiding) return;

    // Close the new-concern form if open
    document.getElementById('step2NewConcernForm').style.display = 'none';

    var sel = document.getElementById('step2ExistingConcernSelect');
    sel.innerHTML = '<option value="">Loading…</option>';
    try {
        var snap = await userCol('concerns').where('status', '==', 'open').get();
        var already = new Set(_step2Visit ? (_step2Visit.concernIds || []) : []);
        var opts = '<option value="">— Select a concern —</option>';
        snap.docs.forEach(function(d) {
            if (!already.has(d.id)) {
                opts += '<option value="' + d.id + '">' + escapeHtml(d.data().title || d.id) + '</option>';
            }
        });
        sel.innerHTML = opts;
    } catch(err) {
        sel.innerHTML = '<option value="">Error loading</option>';
    }
}

/** Show/hide the "Add Existing Condition" picker, populating it with active conditions not yet on this visit. */
async function _step2ToggleExistingConditionForm() {
    var form = document.getElementById('step2ExistingConditionForm');
    var isHiding = form.style.display !== 'none';
    form.style.display = isHiding ? 'none' : '';
    if (isHiding) return;

    // Close the new-condition form if open
    document.getElementById('step2NewConditionForm').style.display = 'none';

    var sel = document.getElementById('step2ExistingConditionSelect');
    sel.innerHTML = '<option value="">Loading…</option>';
    try {
        var snap = await userCol('conditions').where('status', '==', 'active').get();
        var already = new Set(_step2Visit ? (_step2Visit.conditionIds || []) : []);
        var opts = '<option value="">— Select a condition —</option>';
        snap.docs.forEach(function(d) {
            if (!already.has(d.id)) {
                opts += '<option value="' + d.id + '">' + escapeHtml(d.data().name || d.id) + '</option>';
            }
        });
        sel.innerHTML = opts;
    } catch(err) {
        sel.innerHTML = '<option value="">Error loading</option>';
    }
}

/** Link a selected existing concern to this visit. */
async function _step2AddExistingConcern() {
    if (!_step2Visit) return;
    var sel = document.getElementById('step2ExistingConcernSelect');
    var id  = sel.value;
    if (!id) { alert('Please select a concern.'); return; }
    var name = sel.options[sel.selectedIndex].text;
    try {
        await userCol('healthVisits').doc(_step2Visit.id).update({
            concernIds: firebase.firestore.FieldValue.arrayUnion(id)
        });
        _step2Visit.concernIds = (_step2Visit.concernIds || []).concat(id);
        var accordion = document.getElementById('step2AccordionList');
        var emptyEl   = accordion.querySelector('.empty-state');
        if (emptyEl) emptyEl.remove();
        accordion.appendChild(_step2BuildAccordionItem('concern', id, name));
        _step2InitItemVoice('concern', id);
        _step2LoadPriorNotes('concern', id);
        _step2LoadMedsForItem('concern', id);
        _step2ToggleExistingConcernForm();   // hides the form
    } catch(err) { alert('Error: ' + err.message); }
}

/** Link a selected existing condition to this visit. */
async function _step2AddExistingCondition() {
    if (!_step2Visit) return;
    var sel = document.getElementById('step2ExistingConditionSelect');
    var id  = sel.value;
    if (!id) { alert('Please select a condition.'); return; }
    var name = sel.options[sel.selectedIndex].text;
    try {
        await userCol('healthVisits').doc(_step2Visit.id).update({
            conditionIds: firebase.firestore.FieldValue.arrayUnion(id)
        });
        _step2Visit.conditionIds = (_step2Visit.conditionIds || []).concat(id);
        var accordion = document.getElementById('step2AccordionList');
        var emptyEl   = accordion.querySelector('.empty-state');
        if (emptyEl) emptyEl.remove();
        accordion.appendChild(_step2BuildAccordionItem('condition', id, name));
        _step2InitItemVoice('condition', id);
        _step2LoadPriorNotes('condition', id);
        _step2LoadMedsForItem('condition', id);
        _step2ToggleExistingConditionForm();  // hides the form
    } catch(err) { alert('Error: ' + err.message); }
}

async function _step2SaveNewConcern() {
    if (!_step2Visit) return;
    var title    = document.getElementById('step2NewConcernTitle').value.trim();
    if (!title) { alert('Concern title is required.'); return; }
    var bodyArea = document.getElementById('step2NewConcernArea').value.trim();
    try {
        var ref = await userCol('concerns').add({
            title:     title,
            bodyArea:  bodyArea,
            status:    'open',
            startDate: _step2Visit.date || new Date().toISOString().slice(0, 10),
            contactId: null,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        await userCol('healthVisits').doc(_step2Visit.id).update({
            concernIds: firebase.firestore.FieldValue.arrayUnion(ref.id)
        });
        _step2Visit.concernIds = (_step2Visit.concernIds || []).concat(ref.id);
        var accordion = document.getElementById('step2AccordionList');
        var emptyEl   = accordion.querySelector('.empty-state');
        if (emptyEl) emptyEl.remove();
        accordion.appendChild(_step2BuildAccordionItem('concern', ref.id, title));
        _step2InitItemVoice('concern', ref.id);
        _step2LoadPriorNotes('concern', ref.id);
        _step2ToggleNewConcernForm();
        document.getElementById('step2NewConcernTitle').value = '';
        document.getElementById('step2NewConcernArea').value  = '';
    } catch(err) { alert('Error: ' + err.message); }
}

async function _step2SaveNewCondition() {
    if (!_step2Visit) return;
    var name = document.getElementById('step2NewConditionName').value.trim();
    if (!name) { alert('Condition name is required.'); return; }
    try {
        var ref = await userCol('conditions').add({
            name:      name,
            status:    'active',
            contactId: null,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        await userCol('healthVisits').doc(_step2Visit.id).update({
            conditionIds: firebase.firestore.FieldValue.arrayUnion(ref.id)
        });
        _step2Visit.conditionIds = (_step2Visit.conditionIds || []).concat(ref.id);
        var accordion = document.getElementById('step2AccordionList');
        var emptyEl   = accordion.querySelector('.empty-state');
        if (emptyEl) emptyEl.remove();
        accordion.appendChild(_step2BuildAccordionItem('condition', ref.id, name));
        _step2InitItemVoice('condition', ref.id);
        _step2LoadPriorNotes('condition', ref.id);
        _step2ToggleNewConditionForm();
        document.getElementById('step2NewConditionName').value = '';
    } catch(err) { alert('Error: ' + err.message); }
}

async function saveStep2AndDone() {
    if (!_step2Visit) { location.hash = '#health-visits'; return; }

    var visitId    = _step2Visit.id;
    var today      = _step2Visit.date || new Date().toISOString().slice(0, 10);
    var batch      = db.batch();
    var hasChanges = false;

    (_step2Visit.concernIds || []).forEach(function(cid) {
        var ta = document.getElementById('step2Note-concern-' + cid);
        if (!ta) return;
        var note = ta.value.trim();
        if (!note) return;
        if (ta.dataset.existingNoteId) {
            batch.update(userCol('concernUpdates').doc(ta.dataset.existingNoteId), { note: note });
        } else {
            batch.set(userCol('concernUpdates').doc(), {
                concernId: cid,
                date:      today,
                note:      note,
                type:      'visit-note',
                visitId:   visitId,
                contactId: null,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        hasChanges = true;
    });

    (_step2Visit.conditionIds || []).forEach(function(cid) {
        var ta = document.getElementById('step2Note-condition-' + cid);
        if (!ta) return;
        var note = ta.value.trim();
        if (!note) return;
        if (ta.dataset.existingNoteId) {
            batch.update(userCol('healthConditionLogs').doc(ta.dataset.existingNoteId), { note: note });
        } else {
            batch.set(userCol('healthConditionLogs').doc(), {
                conditionId: cid,
                date:        today,
                note:        note,
                type:        'visit-note',
                visitId:     visitId,
                contactId:   null,
                createdAt:   firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        hasChanges = true;
    });

    try {
        if (hasChanges) await batch.commit();
        var returnId = _step2Visit.id;
        _step2Visit = null;
        location.hash = '#health-visit/' + returnId;
    } catch(err) {
        alert('Error saving notes: ' + err.message);
    }
}

// =================================================================
//  MY CARE TEAM
//  Data: userCol('healthCareTeam').doc('default')
//        { members: [ { role, providerContactId, facilityContactId } ] }
// =================================================================

/** Index of the member currently being edited in the modal (-1 = new). */
var _careTeamEditIndex = -1;

/**
 * Load and render the My Care Team page.
 * Called by app.js when route is #health-care-team.
 */
async function loadCareTeam() {
    var list    = document.getElementById('careTeamList');
    var emptyEl = document.getElementById('careTeamEmpty');
    list.innerHTML = '<p class="empty-state">Loading…</p>';
    emptyEl.style.display = 'none';

    try {
        var doc     = await userCol('healthCareTeam').doc('default').get();
        var members = doc.exists ? (doc.data().members || []) : [];

        list.innerHTML = '';

        if (members.length === 0) {
            emptyEl.style.display = '';
            return;
        }

        // Collect all referenced contact IDs then fetch names in one pass
        var contactIds = new Set();
        members.forEach(function(m) {
            if (m.providerContactId) contactIds.add(m.providerContactId);
            if (m.facilityContactId) contactIds.add(m.facilityContactId);
        });

        var contactMap = {};
        if (contactIds.size > 0) {
            var snap = await userCol('people').get();
            snap.forEach(function(d) {
                if (contactIds.has(d.id)) contactMap[d.id] = d.data().name || 'Unknown';
            });
        }

        members.forEach(function(member, idx) {
            list.appendChild(_buildCareTeamCard(member, idx, contactMap));
        });

    } catch (err) {
        console.error('loadCareTeam error:', err);
        list.innerHTML = '<p class="empty-state">Error loading care team.</p>';
    }
}

/** Build a single care team member card. */
function _buildCareTeamCard(member, idx, contactMap) {
    var card = document.createElement('div');
    card.className = 'care-team-card';

    var providerName = member.providerContactId ? (contactMap[member.providerContactId] || 'Unknown') : null;
    var facilityName = member.facilityContactId ? (contactMap[member.facilityContactId] || 'Unknown') : null;

    var providerHtml = providerName
        ? '<div class="care-team-row">' +
              '<span class="care-team-row-label">Provider</span>' +
              '<a class="care-team-link" href="#contact/' + escapeHtml(member.providerContactId) + '">' +
                  escapeHtml(providerName) + ' \u2192</a>' +
          '</div>'
        : '<div class="care-team-row"><span class="care-team-row-label">Provider</span><span class="care-team-none">\u2014</span></div>';

    var facilityHtml = facilityName
        ? '<div class="care-team-row">' +
              '<span class="care-team-row-label">Facility</span>' +
              '<a class="care-team-link" href="#contact/' + escapeHtml(member.facilityContactId) + '">' +
                  escapeHtml(facilityName) + ' \u2192</a>' +
          '</div>'
        : '<div class="care-team-row"><span class="care-team-row-label">Facility</span><span class="care-team-none">\u2014</span></div>';

    card.innerHTML =
        '<div class="care-team-card-body">' +
            '<div class="care-team-role">' + escapeHtml(member.role || 'Unknown Role') + '</div>' +
            providerHtml +
            facilityHtml +
        '</div>' +
        '<button class="btn btn-secondary btn-small care-team-edit-btn">Edit</button>';

    card.querySelector('.care-team-edit-btn').addEventListener('click', function() {
        openEditCareTeamMember(idx, member, contactMap);
    });

    return card;
}

/** Open the Add Care Team Member modal. */
function openAddCareTeamMember() {
    _careTeamEditIndex = -1;
    document.getElementById('careTeamModalTitle').textContent = 'Add Care Team Member';
    document.getElementById('careTeamRoleInput').value = '';
    document.getElementById('careTeamDeleteBtn').style.display = 'none';

    buildContactPicker('careTeamProviderPicker', {
        filterCategory: 'Medical Professional',
        placeholder:    'Search doctors, specialists\u2026',
        allowCreate:    true
    });
    buildContactPicker('careTeamFacilityPicker', {
        filterCategory: 'Medical Facility',
        placeholder:    'Search clinics, hospitals\u2026',
        allowCreate:    true
    });

    openModal('careTeamModal');
    document.getElementById('careTeamRoleInput').focus();
}

/** Open the Edit Care Team Member modal. */
function openEditCareTeamMember(idx, member, contactMap) {
    _careTeamEditIndex = idx;
    document.getElementById('careTeamModalTitle').textContent = 'Edit Care Team Member';
    document.getElementById('careTeamRoleInput').value = member.role || '';
    document.getElementById('careTeamDeleteBtn').style.display = '';

    var providerName = member.providerContactId ? (contactMap[member.providerContactId] || '') : '';
    var facilityName = member.facilityContactId ? (contactMap[member.facilityContactId] || '') : '';

    buildContactPicker('careTeamProviderPicker', {
        filterCategory: 'Medical Professional',
        placeholder:    'Search doctors, specialists\u2026',
        allowCreate:    true,
        initialId:      member.providerContactId || '',
        initialName:    providerName
    });
    buildContactPicker('careTeamFacilityPicker', {
        filterCategory: 'Medical Facility',
        placeholder:    'Search clinics, hospitals\u2026',
        allowCreate:    true,
        initialId:      member.facilityContactId || '',
        initialName:    facilityName
    });

    openModal('careTeamModal');
    document.getElementById('careTeamRoleInput').focus();
}

/** Save the care team member (add or update). */
async function handleCareTeamSave() {
    var role = document.getElementById('careTeamRoleInput').value.trim();
    if (!role) { alert('Role is required.'); return; }

    var providerContainer = document.getElementById('careTeamProviderPicker');
    var facilityContainer = document.getElementById('careTeamFacilityPicker');
    var providerContactId = (providerContainer && providerContainer._getSelectedId) ? providerContainer._getSelectedId() : '';
    var facilityContactId = (facilityContainer && facilityContainer._getSelectedId) ? facilityContainer._getSelectedId() : '';

    var newMember = {
        role:              role,
        providerContactId: providerContactId || null,
        facilityContactId: facilityContactId || null
    };

    try {
        var docRef  = userCol('healthCareTeam').doc('default');
        var snap    = await docRef.get();
        var members = snap.exists ? (snap.data().members || []) : [];

        if (_careTeamEditIndex === -1) {
            members.push(newMember);
        } else {
            members[_careTeamEditIndex] = newMember;
        }

        await docRef.set({ members: members });
        closeModal('careTeamModal');
        loadCareTeam();
    } catch (err) {
        console.error('handleCareTeamSave error:', err);
        alert('Error saving care team member.');
    }
}

/** Remove the currently-edited care team member. */
async function handleCareTeamDelete() {
    if (_careTeamEditIndex === -1) return;
    if (!confirm('Remove this care team member?')) return;

    closeModal('careTeamModal');
    try {
        var docRef  = userCol('healthCareTeam').doc('default');
        var snap    = await docRef.get();
        var members = snap.exists ? (snap.data().members || []) : [];
        members.splice(_careTeamEditIndex, 1);
        await docRef.set({ members: members });
        loadCareTeam();
    } catch (err) {
        console.error('handleCareTeamDelete error:', err);
        alert('Error removing care team member.');
    }
}

// Care Team event listeners wired on DOMContentLoaded
document.addEventListener('DOMContentLoaded', function() {
    var addBtn = document.getElementById('addCareTeamMemberBtn');
    if (addBtn) addBtn.addEventListener('click', openAddCareTeamMember);

    var saveBtn = document.getElementById('careTeamSaveBtn');
    if (saveBtn) saveBtn.addEventListener('click', handleCareTeamSave);

    var cancelBtn = document.getElementById('careTeamCancelBtn');
    if (cancelBtn) cancelBtn.addEventListener('click', function() { closeModal('careTeamModal'); });

    var deleteBtn = document.getElementById('careTeamDeleteBtn');
    if (deleteBtn) deleteBtn.addEventListener('click', handleCareTeamDelete);

    var overlay = document.getElementById('careTeamModal');
    if (overlay) overlay.addEventListener('click', function(e) {
        if (e.target === this) closeModal('careTeamModal');
    });
});
