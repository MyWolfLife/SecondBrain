// ============================================================
// Devnotes.js — Shared dev scratchpad
// Notes stored in shared Firestore collection visible to ALL users.
// Photos stored in a shared subcollection so any user can view them.
//
// Shared collection (NOT under /users/{uid}/):
//   sharedDevNotes              — { text, author, createdAt, fixed, fixedDate, fixedNote }
//   sharedDevNotes/{id}/photos  — { imageData, caption, createdAt }
// ============================================================

/** Firestore ID of the note currently open on #devnote page. */
var _dnCurrentId = null;

/** All notes loaded from Firestore for the list page. */
var _dnAllNotes = [];

/** Current list filter: 'open' or 'fixed'. */
var _dnFilter = 'open';

/** Photos loaded for the currently open note. Array of { id, imageData, createdAt } */
var _dnPhotos = [];

/** Photo index open in the lightbox. */
var _dnLightboxIdx = -1;

/** Pending copy-to-notebook data — set by _dnOpenCopyModal, read by _dnExecuteCopy. */
var _dnCopyNoteId = null;
var _dnCopyText   = '';

// ---------- Date formatting ----------

/**
 * Formats a YYYY-MM-DD date string (as stored in fixedDate) to "May 5, 2026".
 * Returns empty string if input is blank or unparseable.
 * @param {string} dateStr
 * @returns {string}
 */
function _dnFormatDateStr(dateStr) {
    if (!dateStr) return '';
    // Parse as local date to avoid UTC offset shifting the day
    var parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    var d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ---------- Author ----------

function _devNoteAuthor() {
    var user = firebase.auth().currentUser;
    if (!user) return 'Unknown';
    return user.email || user.displayName || 'Unknown';
}

// ============================================================
// LIST PAGE  (#devnotes)
// ============================================================

/**
 * Loads all dev notes from Firestore, stores them, then renders with current filter.
 * Called by router for #devnotes.
 */
async function loadDevNotesPage() {
    var crumb = document.getElementById('breadcrumbBar');
    if (crumb) crumb.innerHTML = '<a href="#settings">Settings</a><span class="separator">&rsaquo;</span><span>Dev Notes</span>';

    // Reset filter to 'open' each time the page is freshly loaded
    _dnFilter = 'open';
    _dnSetFilterButtons('open');

    var emptyState = document.getElementById('devNotesEmptyState');
    emptyState.textContent   = 'Loading…';
    emptyState.style.display = 'block';
    document.getElementById('devNotesContainer').innerHTML = '';
    document.getElementById('devNotesSearch').value = '';

    try {
        var snap = await db.collection('sharedDevNotes').orderBy('createdAt', 'desc').get();
        emptyState.style.display = 'none';
        _dnAllNotes = [];
        snap.forEach(function(doc) {
            _dnAllNotes.push({ id: doc.id, data: doc.data() });
        });
        _dnRenderList();
    } catch (err) {
        console.error('loadDevNotesPage error:', err);
        emptyState.textContent   = 'Error loading notes.';
        emptyState.style.display = 'block';
    }
}

/** Re-renders the list applying the current filter and search query. */
function _dnRenderList() {
    var query     = (document.getElementById('devNotesSearch').value || '').trim().toLowerCase();
    var container = document.getElementById('devNotesContainer');
    var emptyState = document.getElementById('devNotesEmptyState');
    container.innerHTML = '';

    var filtered = _dnAllNotes.filter(function(n) {
        var isFixed = !!n.data.fixed;
        if (_dnFilter === 'open'  && isFixed)  return false;
        if (_dnFilter === 'fixed' && !isFixed) return false;
        if (query) {
            var haystack = ((n.data.text || '') + ' ' + (n.data.fixedNote || '')).toLowerCase();
            if (!haystack.includes(query)) return false;
        }
        return true;
    });

    if (filtered.length === 0) {
        var msg = query ? 'No notes match your search.' :
                  (_dnFilter === 'fixed' ? 'No fixed notes yet.' : 'No open notes.');
        emptyState.textContent   = msg;
        emptyState.style.display = 'block';
        return;
    }
    emptyState.style.display = 'none';
    filtered.forEach(function(n) {
        container.appendChild(_dnBuildListCard(n.id, n.data));
    });
}

function _dnSetFilterButtons(filter) {
    document.querySelectorAll('.devnotes-filter-btn').forEach(function(btn) {
        btn.classList.toggle('active', btn.dataset.filter === filter);
    });
}

/**
 * Builds a card for the dev notes list.
 */
function _dnBuildListCard(noteId, data) {
    var card = document.createElement('div');
    card.className = 'note-card';

    // Fixed badge (if resolved)
    if (data.fixed) {
        var badge = document.createElement('div');
        badge.className = 'devnote-fixed-badge';
        var fixedDateStr = _dnFormatDateStr(data.fixedDate);
        badge.textContent = '✓ Fixed' + (fixedDateStr ? ' · ' + fixedDateStr : '');
        card.appendChild(badge);
    }

    // Doc ID badge
    var idBadge = document.createElement('div');
    idBadge.className = 'devnote-list-docid';
    idBadge.textContent = 'ID: ' + noteId;
    card.appendChild(idBadge);

    // Date + author — label "Reported:" on fixed notes so both dates are distinguishable
    var meta = document.createElement('div');
    meta.className = 'note-date';
    var createdStr = '';
    if (data.createdAt && data.createdAt.toDate) {
        createdStr = data.createdAt.toDate().toLocaleString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
            hour: 'numeric', minute: '2-digit'
        });
    }
    var metaLabel = data.fixed ? 'Reported: ' : '';
    meta.textContent = metaLabel + createdStr + (data.author ? ' · ' + data.author : '');
    card.appendChild(meta);

    // Note text (truncated preview)
    var textEl = document.createElement('div');
    textEl.className = 'note-text';
    var preview = (data.text || '').slice(0, 200);
    if ((data.text || '').length > 200) preview += '…';
    textEl.textContent = preview;
    card.appendChild(textEl);

    // Resolution preview (fixed notes only)
    if (data.fixed && data.fixedNote) {
        var fixPreview = document.createElement('div');
        fixPreview.className = 'devnote-fixed-note-preview';
        fixPreview.textContent = 'Fix: ' + data.fixedNote.slice(0, 120) + (data.fixedNote.length > 120 ? '…' : '');
        card.appendChild(fixPreview);
    }

    // Actions row
    var actions = document.createElement('div');
    actions.className = 'note-actions';

    var editBtn = document.createElement('button');
    editBtn.className   = 'btn btn-small btn-secondary';
    editBtn.textContent = 'Open';
    editBtn.addEventListener('click', function() {
        location.hash = '#devnote/' + noteId;
    });
    actions.appendChild(editBtn);

    var deleteBtn = document.createElement('button');
    deleteBtn.className   = 'btn btn-small btn-danger';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', function() {
        if (!confirm('Delete this note and all its photos?')) return;
        _dnDeleteNote(noteId);
    });
    actions.appendChild(deleteBtn);

    card.appendChild(actions);
    return card;
}

// ============================================================
// DETAIL / EDIT PAGE  (#devnote/new  and  #devnote/{id})
// ============================================================

/**
 * Loads the "new note" page. Called by router for #devnote/new.
 */
function loadNewDevNotePage() {
    _dnCurrentId = null;
    _dnPhotos    = [];

    document.getElementById('devNotePageTitle').textContent = 'New Dev Note';
    document.getElementById('devNoteTextarea').value        = '';
    document.getElementById('devNoteDocIdRow').classList.add('hidden');
    document.getElementById('devNoteActionRow').classList.add('hidden');
    document.getElementById('devNotePhotosGrid').innerHTML  = '';
    document.getElementById('devNotePhotosEmpty').classList.remove('hidden');
    _dnSetFixedFields(false, '', '');

    _dnSetBreadcrumb(null);
}

/**
 * Loads an existing note detail page. Called by router for #devnote/{id}.
 * @param {string} noteId
 */
async function loadDevNotePage(noteId) {
    _dnCurrentId = noteId;
    _dnPhotos    = [];

    document.getElementById('devNotePageTitle').textContent = 'Dev Note';
    document.getElementById('devNoteTextarea').value        = 'Loading…';
    var saveBtn = document.getElementById('devNoteSaveBtn');
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save'; }
    document.getElementById('devNoteDocIdRow').classList.add('hidden');
    document.getElementById('devNoteActionRow').classList.add('hidden');
    document.getElementById('devNotePhotosGrid').innerHTML  = '';
    document.getElementById('devNotePhotosEmpty').classList.remove('hidden');
    _dnSetFixedFields(false, '', '');

    _dnSetBreadcrumb(noteId);

    try {
        var doc = await db.collection('sharedDevNotes').doc(noteId).get();
        if (!doc.exists) {
            document.getElementById('devNoteTextarea').value = '(Note not found)';
            return;
        }

        var d = doc.data();
        document.getElementById('devNoteTextarea').value = d.text || '';
        _dnSetFixedFields(!!d.fixed, d.fixedDate || '', d.fixedNote || '', d.createdAt || null);

        // Show doc ID
        document.getElementById('devNoteDocId').textContent = noteId;
        document.getElementById('devNoteDocIdRow').classList.remove('hidden');

        // Show action row (Copy to Notebook + Delete)
        document.getElementById('devNoteActionRow').classList.remove('hidden');

        // Load photos
        await _dnLoadPhotos(noteId);

    } catch (err) {
        console.error('loadDevNotePage error:', err);
        document.getElementById('devNoteTextarea').value = 'Error loading note.';
    }
}

function _dnSetBreadcrumb(noteId) {
    var crumb = document.getElementById('breadcrumbBar');
    if (!crumb) return;
    if (noteId) {
        crumb.innerHTML = '<a href="#settings">Settings</a><span class="separator">&rsaquo;</span><a href="#devnotes">Dev Notes</a><span class="separator">&rsaquo;</span><span>Note</span>';
    } else {
        crumb.innerHTML = '<a href="#settings">Settings</a><span class="separator">&rsaquo;</span><a href="#devnotes">Dev Notes</a><span class="separator">&rsaquo;</span><span>New Note</span>';
    }
}

// ---------- Fixed fields helpers ----------

/** Populates the fixed/resolved section on the detail page. */
function _dnSetFixedFields(fixed, fixedDate, fixedNote, createdAt) {
    document.getElementById('devNoteFixedToggle').checked = fixed;
    document.getElementById('devNoteFixedDate').value     = fixedDate;
    document.getElementById('devNoteFixedNote').value     = fixedNote;
    document.getElementById('devNoteFixedDetails').classList.toggle('hidden', !fixed);

    // Show the reported (created) date when viewing a fixed note
    var reportedEl = document.getElementById('devNoteReportedDate');
    if (reportedEl) {
        var reportedStr = '';
        if (createdAt) {
            var ts = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
            if (!isNaN(ts.getTime())) {
                reportedStr = ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            }
        }
        reportedEl.textContent = reportedStr;
    }
}

/** Reads the fixed fields from the detail page UI. */
function _dnGetFixedFields() {
    var fixed = document.getElementById('devNoteFixedToggle').checked;
    return {
        fixed:     fixed,
        fixedDate: fixed ? (document.getElementById('devNoteFixedDate').value || '') : '',
        fixedNote: fixed ? (document.getElementById('devNoteFixedNote').value.trim() || '') : ''
    };
}

// ---------- Save ----------

/**
 * Saves the current note.
 * @param {boolean} navigateAfter - If true, navigates back to the list after saving.
 *   Pass false when calling internally (e.g. auto-save before photo upload).
 */
async function _dnSaveNote(navigateAfter, allowEmptyText) {
    var text = document.getElementById('devNoteTextarea').value.trim();
    if (!text && !allowEmptyText) { alert('Please enter some text.'); return; }

    var btn = document.getElementById('devNoteSaveBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

    var fixedFields = _dnGetFixedFields();

    try {
        if (_dnCurrentId) {
            await db.collection('sharedDevNotes').doc(_dnCurrentId).update(
                Object.assign({ text: text }, fixedFields)
            );
        } else {
            var ref = await db.collection('sharedDevNotes').add(
                Object.assign({
                    text:      text,
                    author:    _devNoteAuthor(),
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                }, fixedFields)
            );
            _dnCurrentId = ref.id;

            // Show doc ID and action row now that the note exists
            document.getElementById('devNoteDocId').textContent = _dnCurrentId;
            document.getElementById('devNoteDocIdRow').classList.remove('hidden');
            document.getElementById('devNoteActionRow').classList.remove('hidden');
            _dnSetBreadcrumb(_dnCurrentId);
            history.replaceState(null, '', '#devnote/' + _dnCurrentId);
        }

        if (navigateAfter) {
            if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
            location.hash = '#devnotes';
        } else {
            if (btn) { btn.disabled = false; btn.textContent = 'Saved ✓'; setTimeout(function() { if (btn) btn.textContent = 'Save'; }, 2000); }
        }
    } catch (err) {
        console.error('_dnSaveNote error:', err);
        alert('Error saving note.');
        if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
    }
}

// ---------- Delete ----------

async function _dnDeleteNote(noteId) {
    try {
        // Delete all photos in the shared subcollection
        var photoSnap = await db.collection('sharedDevNotes').doc(noteId).collection('photos').get();
        var batch = db.batch();
        photoSnap.forEach(function(d) { batch.delete(d.ref); });
        await batch.commit();

        await db.collection('sharedDevNotes').doc(noteId).delete();

        // If already on the list page reload it; otherwise navigate there
        if (location.hash === '#devnotes') {
            loadDevNotesPage();
        } else {
            location.hash = '#devnotes';
        }
    } catch (err) {
        console.error('_dnDeleteNote error:', err);
        alert('Error deleting note.');
    }
}

// ============================================================
// PHOTOS
// ============================================================

async function _dnLoadPhotos(noteId) {
    try {
        var snap = await db.collection('sharedDevNotes').doc(noteId).collection('photos')
            .orderBy('createdAt', 'asc').get();

        _dnPhotos = [];
        snap.forEach(function(doc) {
            _dnPhotos.push(Object.assign({ id: doc.id }, doc.data()));
        });
        _dnRenderPhotos();
    } catch (err) {
        console.error('_dnLoadPhotos error:', err);
    }
}

function _dnRenderPhotos() {
    var grid  = document.getElementById('devNotePhotosGrid');
    var empty = document.getElementById('devNotePhotosEmpty');
    grid.innerHTML = '';

    if (_dnPhotos.length === 0) {
        empty.classList.remove('hidden');
        return;
    }
    empty.classList.add('hidden');

    _dnPhotos.forEach(function(photo, idx) {
        var thumb = document.createElement('div');
        thumb.className = 'devnote-photo-thumb';

        var img = document.createElement('img');
        img.src = photo.imageData;
        img.alt = 'Photo ' + (idx + 1);
        img.addEventListener('click', function() { _dnOpenLightbox(idx); });
        thumb.appendChild(img);

        grid.appendChild(thumb);
    });
}

async function _dnAddPhotoFromFile(file) {
    if (!file || !file.type.startsWith('image/')) return;

    // Auto-save note first if it hasn't been saved yet (text is optional at this point)
    if (!_dnCurrentId) {
        await _dnSaveNote(false, true);
        if (!_dnCurrentId) return; // save failed
    }

    try {
        var imageData = await compressImage(file);
        await db.collection('sharedDevNotes').doc(_dnCurrentId).collection('photos').add({
            imageData: imageData,
            caption:   '',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        await _dnLoadPhotos(_dnCurrentId);
    } catch (err) {
        console.error('_dnAddPhotoFromFile error:', err);
        alert('Error saving photo.');
    }
}

async function _dnPastePhoto() {
    try {
        var items = await navigator.clipboard.read();
        var imageBlob = null;
        for (var i = 0; i < items.length; i++) {
            var type = items[i].types.find(function(t) { return t.startsWith('image/'); });
            if (type) { imageBlob = await items[i].getType(type); break; }
        }
        if (!imageBlob) {
            alert('No image on the clipboard.\n\nRight-click a screenshot and choose "Copy image", then click Paste.');
            return;
        }
        var ext  = imageBlob.type === 'image/png' ? '.png' : '.jpg';
        var file = new File([imageBlob], 'pasted-photo' + ext, { type: imageBlob.type });
        await _dnAddPhotoFromFile(file);
    } catch (err) {
        if (err.name === 'NotAllowedError') {
            alert('Clipboard access denied. Please allow clipboard access or use "Add from Gallery" instead.');
        } else {
            console.error('_dnPastePhoto error:', err);
            alert('Could not read clipboard image.');
        }
    }
}

// ---------- Lightbox ----------

function _dnOpenLightbox(idx) {
    _dnLightboxIdx = idx;
    var photo = _dnPhotos[idx];
    document.getElementById('devNotePhotoModalImg').src = photo.imageData;
    document.getElementById('devNotePhotoDeleteBtn').dataset.photoId = photo.id;
    openModal('devNotePhotoModal');
}

async function _dnDeleteLightboxPhoto(photoId) {
    if (!confirm('Delete this photo?')) return;
    try {
        await db.collection('sharedDevNotes').doc(_dnCurrentId).collection('photos').doc(photoId).delete();
        closeModal('devNotePhotoModal');
        if (_dnCurrentId) await _dnLoadPhotos(_dnCurrentId);
    } catch (err) {
        console.error('_dnDeleteLightboxPhoto error:', err);
        alert('Error deleting photo.');
    }
}

// ============================================================
// COPY TO NOTEBOOK
// ============================================================

/**
 * Opens the "Copy to Notebook" picker modal for a given note.
 * Can be called from the list page (noteId + text passed in) or from the
 * detail page (uses _dnCurrentId + textarea value).
 */
async function _dnOpenCopyModal(noteId, text) {
    _dnCopyNoteId = noteId;
    _dnCopyText   = text;
    var select = document.getElementById('devNoteCopySelect');
    select.innerHTML = '<option value="">— loading notebooks… —</option>';
    openModal('devNoteCopyModal');

    try {
        var snap = await userCol('notebooks').orderBy('name', 'asc').get();
        select.innerHTML = '<option value="">— select a notebook —</option>';
        if (snap.empty) {
            select.innerHTML = '<option value="">No notebooks found</option>';
            return;
        }
        snap.forEach(function(doc) {
            var opt = document.createElement('option');
            opt.value       = doc.id;
            opt.textContent = doc.data().name || 'Untitled';
            select.appendChild(opt);
        });
    } catch (err) {
        console.error('_dnOpenCopyModal error:', err);
        select.innerHTML = '<option value="">Error loading notebooks</option>';
    }
}

/**
 * Executes the copy: creates a note in the chosen notebook and copies all photos.
 */
async function _dnExecuteCopy() {
    var select     = document.getElementById('devNoteCopySelect');
    var notebookId = select.value;
    var noteId     = _dnCopyNoteId;
    var text       = _dnCopyText;

    if (!notebookId) { alert('Please select a notebook.'); return; }

    var btn = document.getElementById('devNoteCopyConfirmBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Copying…'; }

    try {
        // Create the note in the user's personal notes collection
        var newNoteRef = await userCol('notes').add({
            notebookId: notebookId,
            body:       text,
            createdAt:  firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt:  firebase.firestore.FieldValue.serverTimestamp()
        });

        // Increment note count on the notebook
        await userCol('notebooks').doc(notebookId).update({
            noteCount: firebase.firestore.FieldValue.increment(1)
        });

        // Copy photos: create new photo docs pointing at the new note
        if (noteId) {
            var photoSnap = await db.collection('sharedDevNotes').doc(noteId).collection('photos').get();

            var batch = db.batch();
            photoSnap.forEach(function(pDoc) {
                var newRef = userCol('photos').doc();
                batch.set(newRef, {
                    targetType: 'note',
                    targetId:   newNoteRef.id,
                    imageData:  pDoc.data().imageData,
                    caption:    '',
                    createdAt:  pDoc.data().createdAt || firebase.firestore.FieldValue.serverTimestamp()
                });
            });
            await batch.commit();
        }

        closeModal('devNoteCopyModal');
        if (btn) { btn.disabled = false; btn.textContent = 'Copy'; }

        // Navigate to the notebook
        location.hash = '#notebook/' + notebookId;

    } catch (err) {
        console.error('_dnExecuteCopy error:', err);
        alert('Error copying note.');
        if (btn) { btn.disabled = false; btn.textContent = 'Copy'; }
    }
}

// ============================================================
// EVENT LISTENERS
// ============================================================

document.addEventListener('DOMContentLoaded', function() {

    // List page — Add Note button
    var addBtn = document.getElementById('addDevNoteBtn');
    if (addBtn) addBtn.addEventListener('click', function() {
        location.hash = '#devnote/new';
    });

    // List page — filter toggle buttons
    document.querySelectorAll('.devnotes-filter-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            _dnFilter = this.dataset.filter;
            _dnSetFilterButtons(_dnFilter);
            _dnRenderList();
        });
    });

    // List page — search input
    var searchInput = document.getElementById('devNotesSearch');
    if (searchInput) searchInput.addEventListener('input', _dnRenderList);

    // Detail page — Fixed toggle shows/hides the date+note fields and defaults date to today
    var fixedToggle = document.getElementById('devNoteFixedToggle');
    if (fixedToggle) fixedToggle.addEventListener('change', function() {
        var details = document.getElementById('devNoteFixedDetails');
        details.classList.toggle('hidden', !this.checked);
        if (this.checked && !document.getElementById('devNoteFixedDate').value) {
            // Default to today
            document.getElementById('devNoteFixedDate').value = new Date().toISOString().slice(0, 10);
        }
    });

    // Detail page — Back button
    var backBtn = document.getElementById('devNoteBackBtn');
    if (backBtn) backBtn.addEventListener('click', function() {
        location.hash = '#devnotes';
    });

    // Detail page — Save button
    var saveBtn = document.getElementById('devNoteSaveBtn');
    if (saveBtn) saveBtn.addEventListener('click', function() { _dnSaveNote(true); });

    // Detail page — Ctrl+Enter to save
    var textarea = document.getElementById('devNoteTextarea');
    if (textarea) textarea.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) _dnSaveNote();
    });

    // Detail page — Doc ID copy-on-click
    var docIdEl = document.getElementById('devNoteDocId');
    if (docIdEl) docIdEl.addEventListener('click', function() {
        var id = this.textContent;
        if (!id) return;
        navigator.clipboard.writeText(id).then(function() {
            var copied = document.getElementById('devNoteDocIdCopied');
            if (copied) {
                copied.classList.remove('hidden');
                setTimeout(function() { copied.classList.add('hidden'); }, 2000);
            }
        }).catch(function() {});
    });

    // Detail page — Add from Gallery
    var addPhotoBtn = document.getElementById('devNoteAddPhotoBtn');
    var photoInput  = document.getElementById('devNotePhotoInput');
    if (addPhotoBtn && photoInput) {
        addPhotoBtn.addEventListener('click', function() { photoInput.click(); });
        photoInput.addEventListener('change', function() {
            if (this.files && this.files[0]) {
                _dnAddPhotoFromFile(this.files[0]);
                this.value = '';
            }
        });
    }

    // Detail page — Paste photo
    var pasteBtn = document.getElementById('devNotePastePhotoBtn');
    if (pasteBtn) pasteBtn.addEventListener('click', _dnPastePhoto);

    // Detail page — Delete button
    var deleteBtn = document.getElementById('devNoteDeleteBtn');
    if (deleteBtn) deleteBtn.addEventListener('click', function() {
        if (!_dnCurrentId) return;
        if (!confirm('Delete this note and all its photos?')) return;
        _dnDeleteNote(_dnCurrentId);
    });

    // Detail page — Copy to Notebook button
    var copyBtn = document.getElementById('devNoteCopyBtn');
    if (copyBtn) copyBtn.addEventListener('click', function() {
        if (!_dnCurrentId) { alert('Save the note first before copying.'); return; }
        var text = document.getElementById('devNoteTextarea').value.trim();
        _dnOpenCopyModal(_dnCurrentId, text);
    });

    // Photo lightbox — Delete
    var photoDeleteBtn = document.getElementById('devNotePhotoDeleteBtn');
    if (photoDeleteBtn) photoDeleteBtn.addEventListener('click', function() {
        _dnDeleteLightboxPhoto(this.dataset.photoId);
    });

    // Photo lightbox — close on overlay click
    var photoModal = document.getElementById('devNotePhotoModal');
    if (photoModal) photoModal.addEventListener('click', function(e) {
        if (e.target === this) closeModal('devNotePhotoModal');
    });

    // Copy modal — Confirm
    var copyConfirmBtn = document.getElementById('devNoteCopyConfirmBtn');
    if (copyConfirmBtn) copyConfirmBtn.addEventListener('click', _dnExecuteCopy);

    // Copy modal — close on overlay click
    var copyModal = document.getElementById('devNoteCopyModal');
    if (copyModal) copyModal.addEventListener('click', function(e) {
        if (e.target === this) closeModal('devNoteCopyModal');
    });
});
