// ============================================================
// legacy.js — My Legacy section
//
// Handles the My Legacy landing page and all 12 sub-sections.
// Financial and Social sub-sections require the Legacy
// Passphrase before displaying encrypted fields.
// ============================================================

// Sections that require the passphrase gate
var LEGACY_GATED_SECTIONS = ['accounts', 'social'];

// Pending callback to invoke after passphrase is entered
var _legacyPassphraseCallback = null;

// Section metadata: key → { icon, label, route, gated }
var LEGACY_SECTIONS = [
    { key: 'burial',    icon: '⚱️',  label: 'Burial & Remains',      route: '#legacy/burial'    },
    { key: 'service',   icon: '🕊️',  label: 'Service Wishes',         route: '#legacy/service'   },
    { key: 'obituary',  icon: '📜',  label: 'My Obituary',            route: '#legacy/obituary'  },
    { key: 'social',    icon: '📱',  label: 'Social Media',           route: '#legacy/social',   gated: true, stub: true },
    { key: 'accounts',  icon: '💰',  label: 'Financial',              route: '#legacy/accounts', gated: true },
    { key: 'documents', icon: '📁',  label: 'Documents',              route: '#legacy/documents' },
    { key: 'household', icon: '🏠',  label: 'Household Instructions', route: '#legacy/household', stub: true },
    { key: 'pets',      icon: '🐾',  label: 'Pets',                   route: '#legacy/pets'      },
    { key: 'notify',    icon: '📞',  label: 'People to Notify',       route: '#legacy/notify'    },
    { key: 'letters',   icon: '✉️',  label: 'Letters',                route: '#legacy/letters'   },
    { key: 'message',   icon: '💬',  label: 'Final Message',          route: '#legacy/message'   }
];

// ============================================================
// Landing Page
// ============================================================

function loadLegacyPage() {
    var page = document.getElementById('page-legacy');
    if (!page) return;

    var crumb = document.getElementById('breadcrumbBar');
    if (crumb) crumb.innerHTML = '<a href="#life" class="breadcrumb-link">Life</a><span class="breadcrumb-sep"> › </span><span class="breadcrumb-current">My Legacy</span>';

    page.innerHTML =
        '<div class="page-header"><h2>🕊️ My Legacy</h2></div>' +
        '<p class="legacy-intro">Private information for your loved ones. Keep your Legacy Passphrase stored safely alongside your app login.</p>' +
        '<div class="landing-grid landing-grid--3col" id="legacyTileGrid"></div>';

    var grid = document.getElementById('legacyTileGrid');

    // Row 1: empty · Read Me First · empty  (alone in the center slot)
    grid.appendChild(document.createElement('div'));
    var rmf = document.createElement('a');
    rmf.href = '#legacy/intro';
    rmf.className = 'landing-tile landing-tile--legacy-intro';
    rmf.innerHTML =
        '<span class="landing-tile-icon">📖</span>' +
        '<span class="landing-tile-label">Read Me First</span>';
    grid.appendChild(rmf);
    grid.appendChild(document.createElement('div'));

    // Remaining rows: all 12 section tiles
    LEGACY_SECTIONS.forEach(function(s) {
        var tile = document.createElement('a');
        tile.href = s.route;
        tile.className = 'landing-tile landing-tile--legacy-' + s.key;
        tile.innerHTML =
            '<span class="landing-tile-icon">' + s.icon + '</span>' +
            '<span class="landing-tile-label">' + s.label + '</span>' +
            (s.gated ? '<span class="landing-tile-soon">🔒 Encrypted</span>' : '') +
            (s.stub  ? '<span class="landing-tile-soon">Coming Soon</span>' : '');
        grid.appendChild(tile);
    });
}

// ============================================================
// Sub-section Loaders
// ============================================================

async function loadLegacyIntroPage() {
    var page = document.getElementById('page-legacy-intro');
    if (!page) return;

    page.innerHTML =
        '<div class="page-header">' +
            '<h2>📖 Read Me First</h2>' +
        '</div>' +
        '<div class="legacy-section">' +
            '<div class="legacy-obit-block">' +
                '<p class="legacy-hint">Write whatever you want your loved ones to read before they explore the rest of this section — context, important instructions, or just a note of love.</p>' +
                '<textarea id="legacyIntroBody" class="legacy-textarea" rows="20"' +
                    ' placeholder="Start here..."></textarea>' +
            '</div>' +
            '<p class="legacy-save-status" id="legacyIntroSaveStatus"></p>' +
        '</div>';

    var crumb = document.getElementById('breadcrumbBar');
    if (crumb) {
        crumb.innerHTML =
            '<a href="#life">Life</a><span class="separator">&rsaquo;</span>' +
            '<a href="#legacy">My Legacy</a><span class="separator">&rsaquo;</span>' +
            '<span>Read Me First</span>';
    }

    try {
        var doc = await userCol('legacyMeta').doc('intro').get();
        if (doc.exists) {
            document.getElementById('legacyIntroBody').value = doc.data().body || '';
        }
    } catch (e) {
        console.error('Error loading legacy intro:', e);
    }

    document.getElementById('legacyIntroBody').addEventListener('blur', function() {
        var body   = document.getElementById('legacyIntroBody').value || '';
        var status = document.getElementById('legacyIntroSaveStatus');
        userCol('legacyMeta').doc('intro').set({ body: body }, { merge: true })
            .then(function() {
                if (status) { status.textContent = 'Saved.'; setTimeout(function() { if (status) status.textContent = ''; }, 2000); }
            })
            .catch(function(e) {
                console.error('Error saving legacy intro:', e);
                if (status) status.textContent = 'Error saving.';
            });
    });
}

async function loadLegacyBurialPage() {
    var page = document.getElementById('page-legacy-burial');
    if (!page) return;

    page.innerHTML =
        '<div class="page-header">' +
            '<h2>⚱️ Burial & Remains</h2>' +
        '</div>' +
        '<div class="legacy-section">' +

            // Disposition type
            '<div class="legacy-obit-block">' +
                '<label class="legacy-label" for="legacyBurialType">Disposition Type</label>' +
                '<select id="legacyBurialType" class="form-control">' +
                    '<option value="">-- Select --</option>' +
                    '<option value="cremation">Cremation</option>' +
                    '<option value="burial">Burial</option>' +
                    '<option value="body-donation">Body donation to science</option>' +
                    '<option value="natural-burial">Natural / green burial</option>' +
                    '<option value="other">Other</option>' +
                '</select>' +
            '</div>' +

            // My Wishes
            '<div class="legacy-obit-block">' +
                '<label class="legacy-label" for="legacyBurialWishes">My Wishes</label>' +
                '<p class="legacy-hint">Describe everything in plain English — where to scatter ashes, which cemetery, special requests, anything your family needs to know.</p>' +
                '<textarea id="legacyBurialWishes" class="legacy-textarea" rows="8" placeholder="e.g. Cremate me and scatter half at Lake Superior near Two Harbors. Give the other half to Karen. No expensive urn needed."></textarea>' +
            '</div>' +

            // Reference Links
            '<div class="legacy-obit-block">' +
                '<label class="legacy-label">Reference Links</label>' +
                '<p class="legacy-hint">Links your family should look at — tombstone, cemetery, memorial planner, etc.</p>' +
                '<div id="legacyBurialLinks"></div>' +
                '<button class="btn btn-secondary btn-small" onclick="legacyBurialAddLink()" style="margin-top:8px;">+ Add Link</button>' +
            '</div>' +

            // Pre-arrangement
            '<div class="legacy-obit-block">' +
                '<label class="legacy-label">Pre-arrangement</label>' +
                '<div class="legacy-toggle-row">' +
                    '<label class="legacy-toggle-label">' +
                        '<input type="checkbox" id="legacyBurialPreArranged"> I have a pre-arranged funeral plan' +
                    '</label>' +
                '</div>' +
                '<div id="legacyBurialPreArrangementDetails" class="legacy-subsection hidden">' +
                    '<div class="form-group">' +
                        '<label for="legacyBurialFuneralHome">Funeral Home Name</label>' +
                        '<input type="text" id="legacyBurialFuneralHome" class="form-control" placeholder="e.g. Johnson Funeral Home">' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label for="legacyBurialFuneralPhone">Phone Number</label>' +
                        '<input type="tel" id="legacyBurialFuneralPhone" class="form-control" placeholder="e.g. 612-555-1234">' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label for="legacyBurialPayment">Payment Status</label>' +
                        '<select id="legacyBurialPayment" class="form-control">' +
                            '<option value="">-- Select --</option>' +
                            '<option value="paid-in-full">Paid in full</option>' +
                            '<option value="deposit-paid">Deposit paid</option>' +
                            '<option value="not-yet-paid">Not yet paid</option>' +
                        '</select>' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label for="legacyBurialDocsLocation">Where are the documents?</label>' +
                        '<input type="text" id="legacyBurialDocsLocation" class="form-control" placeholder="e.g. Filing cabinet in the office, green folder">' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label for="legacyBurialPreNotes">Notes</label>' +
                        '<textarea id="legacyBurialPreNotes" class="legacy-textarea" rows="3" placeholder="Any other details about the pre-arrangement..."></textarea>' +
                    '</div>' +
                '</div>' +
            '</div>' +

            '<p class="legacy-save-status" id="legacyBurialSaveStatus"></p>' +
        '</div>';

    // Set breadcrumb
    var crumb = document.getElementById('breadcrumbBar');
    if (crumb) {
        crumb.innerHTML =
            '<a href="#life">Life</a><span class="separator">&rsaquo;</span>' +
            '<a href="#legacy">My Legacy</a><span class="separator">&rsaquo;</span>' +
            '<span>Burial & Remains</span>';
    }

    // Load saved data
    try {
        var doc = await userCol('legacyMeta').doc('burial').get();
        if (doc.exists) {
            var d = doc.data();
            document.getElementById('legacyBurialType').value        = d.dispositionType || '';
            document.getElementById('legacyBurialWishes').value      = d.wishes          || '';
            document.getElementById('legacyBurialFuneralHome').value = d.preArrangementName     || '';
            document.getElementById('legacyBurialFuneralPhone').value= d.preArrangementPhone    || '';
            document.getElementById('legacyBurialPayment').value     = d.preArrangementPayment  || '';
            document.getElementById('legacyBurialDocsLocation').value= d.preArrangementDocsLocation || '';
            document.getElementById('legacyBurialPreNotes').value    = d.preArrangementNotes    || '';

            if (d.preArranged) {
                document.getElementById('legacyBurialPreArranged').checked = true;
                document.getElementById('legacyBurialPreArrangementDetails').classList.remove('hidden');
            }

            _legacyBurialRenderLinks(d.links || []);
        } else {
            _legacyBurialRenderLinks([]);
        }
    } catch (e) {
        console.error('Error loading burial data:', e);
        _legacyBurialRenderLinks([]);
    }

    // Toggle pre-arrangement details
    document.getElementById('legacyBurialPreArranged').addEventListener('change', function() {
        var details = document.getElementById('legacyBurialPreArrangementDetails');
        details.classList.toggle('hidden', !this.checked);
        _legacySaveBurial();
    });

    // Auto-save on blur/change for all fields
    ['legacyBurialType', 'legacyBurialWishes', 'legacyBurialFuneralHome',
     'legacyBurialFuneralPhone', 'legacyBurialPayment', 'legacyBurialDocsLocation',
     'legacyBurialPreNotes'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.addEventListener('change', _legacySaveBurial);
        if (el && el.tagName === 'TEXTAREA') el.addEventListener('blur', _legacySaveBurial);
    });
}

function _legacyBurialRenderLinks(links) {
    var container = document.getElementById('legacyBurialLinks');
    if (!container) return;
    container.innerHTML = '';
    links.forEach(function(link, i) {
        container.appendChild(_legacyBurialLinkRow(link.label || '', link.url || '', i));
    });
}

function _legacyBurialLinkRow(label, url, index) {
    var row = document.createElement('div');
    row.className = 'legacy-link-row';
    row.dataset.index = index;
    row.innerHTML =
        '<input type="text" class="form-control legacy-link-label" placeholder="Label (e.g. Tombstone I want)" value="' + _esc(label) + '">' +
        '<input type="url" class="form-control legacy-link-url" placeholder="https://" value="' + _esc(url) + '">' +
        '<button class="btn btn-danger btn-small legacy-link-remove" onclick="legacyBurialRemoveLink(' + index + ')">✕</button>';
    row.querySelector('.legacy-link-label').addEventListener('blur', _legacySaveBurial);
    row.querySelector('.legacy-link-url').addEventListener('blur', _legacySaveBurial);
    return row;
}

function legacyBurialAddLink() {
    var container = document.getElementById('legacyBurialLinks');
    if (!container) return;
    var index = container.children.length;
    container.appendChild(_legacyBurialLinkRow('', '', index));
}

function legacyBurialRemoveLink(index) {
    var links = _legacyBurialGetLinks();
    links.splice(index, 1);
    _legacyBurialRenderLinks(links);
    _legacySaveBurial();
}

function _legacyBurialGetLinks() {
    var rows = document.querySelectorAll('.legacy-link-row');
    var links = [];
    rows.forEach(function(row) {
        var label = row.querySelector('.legacy-link-label').value.trim();
        var url   = row.querySelector('.legacy-link-url').value.trim();
        if (label || url) links.push({ label: label, url: url });
    });
    return links;
}

function _legacySaveBurial() {
    var preArranged = document.getElementById('legacyBurialPreArranged').checked;
    var data = {
        dispositionType          : document.getElementById('legacyBurialType').value,
        wishes                   : document.getElementById('legacyBurialWishes').value,
        links                    : _legacyBurialGetLinks(),
        preArranged              : preArranged,
        preArrangementName       : document.getElementById('legacyBurialFuneralHome').value,
        preArrangementPhone      : document.getElementById('legacyBurialFuneralPhone').value,
        preArrangementPayment    : document.getElementById('legacyBurialPayment').value,
        preArrangementDocsLocation: document.getElementById('legacyBurialDocsLocation').value,
        preArrangementNotes      : document.getElementById('legacyBurialPreNotes').value
    };
    var status = document.getElementById('legacyBurialSaveStatus');
    userCol('legacyMeta').doc('burial').set(data, { merge: true })
        .then(function() {
            if (status) { status.textContent = 'Saved.'; setTimeout(function() { if (status) status.textContent = ''; }, 2000); }
        })
        .catch(function(e) {
            console.error('Error saving burial data:', e);
            if (status) status.textContent = 'Error saving.';
        });
}

// Simple HTML escape for values inserted into innerHTML
function _esc(str) {
    return String(str).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
async function loadLegacyServicePage() {
    var page = document.getElementById('page-legacy-service');
    if (!page) return;

    page.innerHTML =
        '<div class="page-header">' +
            '<h2>🕊️ Service Wishes</h2>' +
        '</div>' +
        '<div class="legacy-section">' +

            // Service type
            '<div class="legacy-obit-block">' +
                '<label class="legacy-label" for="legacyServiceType">Type of Service</label>' +
                '<select id="legacyServiceType" class="form-control">' +
                    '<option value="">-- Select --</option>' +
                    '<option value="traditional-funeral">Traditional Funeral</option>' +
                    '<option value="memorial-service">Memorial Service</option>' +
                    '<option value="celebration-of-life">Celebration of Life</option>' +
                    '<option value="graveside-only">Graveside Only</option>' +
                    '<option value="no-service">No Service</option>' +
                    '<option value="other">Other</option>' +
                '</select>' +
            '</div>' +

            // Location
            '<div class="legacy-obit-block">' +
                '<label class="legacy-label" for="legacyServiceLocation">Location Preference</label>' +
                '<textarea id="legacyServiceLocation" class="legacy-textarea" rows="3"' +
                    ' placeholder="e.g. St. Michael\'s Church, the backyard, no preference"></textarea>' +
            '</div>' +

            // Officiant
            '<div class="legacy-obit-block">' +
                '<label class="legacy-label" for="legacyServiceOfficiant">Who Should Officiate</label>' +
                '<textarea id="legacyServiceOfficiant" class="legacy-textarea" rows="3"' +
                    ' placeholder="e.g. Pastor Dan, a family member, no preference"></textarea>' +
            '</div>' +

            // Wishes
            '<div class="legacy-obit-block">' +
                '<label class="legacy-label" for="legacyServiceWishes">My Wishes</label>' +
                '<p class="legacy-hint">Anything else — flowers vs. donations, open/closed casket, reception, things you definitely don\'t want, etc.</p>' +
                '<div class="legacy-ai-row" style="margin-bottom:8px;">' +
                    '<button class="btn btn-secondary btn-small" id="legacyServiceWishesVoiceBtn">🎙️ Speak</button>' +
                    '<span class="legacy-ai-status" id="legacyServiceWishesVoiceStatus"></span>' +
                '</div>' +
                '<textarea id="legacyServiceWishes" class="legacy-textarea" rows="16"' +
                    ' placeholder="Write whatever you want your family to know about the service..."></textarea>' +
            '</div>' +

            // Music
            '<div class="legacy-obit-block">' +
                '<label class="legacy-label" for="legacyServiceMusic">Music</label>' +
                '<p class="legacy-hint">List any songs you\'d like played — feel free to include artist and when (entry, during, closing, reception).</p>' +
                '<textarea id="legacyServiceMusic" class="legacy-textarea" rows="5"' +
                    ' placeholder="e.g. Amazing Grace (entry)&#10;In My Life – The Beatles (during)&#10;Don\'t Stop Believin\' – Journey (reception)"></textarea>' +
            '</div>' +

            '<p class="legacy-save-status" id="legacyServiceSaveStatus"></p>' +
        '</div>';

    var crumb = document.getElementById('breadcrumbBar');
    if (crumb) {
        crumb.innerHTML =
            '<a href="#life">Life</a><span class="separator">&rsaquo;</span>' +
            '<a href="#legacy">My Legacy</a><span class="separator">&rsaquo;</span>' +
            '<span>Service Wishes</span>';
    }

    try {
        var doc = await userCol('legacyMeta').doc('service').get();
        if (doc.exists) {
            var d = doc.data();
            document.getElementById('legacyServiceType').value     = d.serviceType || '';
            document.getElementById('legacyServiceLocation').value = d.location    || '';
            document.getElementById('legacyServiceOfficiant').value= d.officiant   || '';
            document.getElementById('legacyServiceMusic').value    = d.music       || '';
            document.getElementById('legacyServiceWishes').value   = d.wishes      || '';
        }
    } catch (e) {
        console.error('Error loading service wishes:', e);
    }

    ['legacyServiceType', 'legacyServiceLocation', 'legacyServiceOfficiant',
     'legacyServiceMusic', 'legacyServiceWishes'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', _legacySaveService);
            el.addEventListener('blur',   _legacySaveService);
        }
    });

    if (typeof initVoiceToText === 'function') {
        initVoiceToText('legacyServiceWishes', 'legacyServiceWishesVoiceBtn');
    } else {
        var vBtn = document.getElementById('legacyServiceWishesVoiceBtn');
        if (vBtn) vBtn.style.display = 'none';
    }
}

function _legacySaveService() {
    var data = {
        serviceType: document.getElementById('legacyServiceType').value,
        location:    document.getElementById('legacyServiceLocation').value,
        officiant:   document.getElementById('legacyServiceOfficiant').value,
        music:       document.getElementById('legacyServiceMusic').value,
        wishes:      document.getElementById('legacyServiceWishes').value
    };
    var status = document.getElementById('legacyServiceSaveStatus');
    userCol('legacyMeta').doc('service').set(data, { merge: true })
        .then(function() {
            if (status) { status.textContent = 'Saved.'; setTimeout(function() { if (status) status.textContent = ''; }, 2000); }
        })
        .catch(function(e) {
            console.error('Error saving service wishes:', e);
            if (status) status.textContent = 'Error saving.';
        });
}
async function loadLegacyObituaryPage() {
    var page = document.getElementById('page-legacy-obituary');
    if (!page) return;

    // Render the page shell immediately so the user sees something
    page.innerHTML =
        '<div class="page-header">' +
            '<h2>📜 My Obituary</h2>' +
        '</div>' +
        '<div class="legacy-section">' +

            // Box 1 — Planning Notes
            '<div class="legacy-obit-block">' +
                '<label class="legacy-label" for="legacyObituaryNotes">My Planning Notes</label>' +
                '<p class="legacy-hint">Brain dump — facts, stories, people, anything you\'d want included. No structure needed.</p>' +
                '<textarea id="legacyObituaryNotes" class="legacy-textarea" rows="7" placeholder="Things I want covered: where I grew up, my career, my family, hobbies, a funny story about..."></textarea>' +
                '<div id="legacyObituaryAiRow" class="legacy-ai-row hidden">' +
                    '<button class="btn btn-secondary btn-small" id="legacyObituaryAiBtn" onclick="legacyObituaryAskAI()">✨ Ask AI to Write</button>' +
                    '<span class="legacy-ai-status" id="legacyObituaryAiStatus"></span>' +
                '</div>' +
            '</div>' +

            // Box 2 — My Draft
            '<div class="legacy-obit-block">' +
                '<label class="legacy-label" for="legacyObituaryDraft">My Draft</label>' +
                '<p class="legacy-hint">Write your own obituary, or let the AI generate one from your planning notes above.</p>' +
                '<textarea id="legacyObituaryDraft" class="legacy-textarea" rows="10" placeholder="Write your obituary here..."></textarea>' +
            '</div>' +

            // Box 3 — Instructions for the Writer
            '<div class="legacy-obit-block">' +
                '<label class="legacy-label" for="legacyObituaryInstructions">Instructions for the Writer</label>' +
                '<p class="legacy-hint">Notes for whoever writes or finalizes the real obituary — tone, length, what to include or skip.</p>' +
                '<textarea id="legacyObituaryInstructions" class="legacy-textarea" rows="5" placeholder="Please keep it under 300 words. Mention my love of fishing. Publish in the Star Tribune..."></textarea>' +
            '</div>' +

            '<p class="legacy-save-status" id="legacyObituarySaveStatus"></p>' +
        '</div>';

    // Set breadcrumb
    var crumb = document.getElementById('breadcrumbBar');
    if (crumb) {
        crumb.innerHTML =
            '<a href="#life">Life</a><span class="separator">&rsaquo;</span>' +
            '<a href="#legacy">My Legacy</a><span class="separator">&rsaquo;</span>' +
            '<span>My Obituary</span>';
    }

    // Load saved data
    try {
        var doc = await userCol('legacyMeta').doc('obituary').get();
        if (doc.exists) {
            var d = doc.data();
            document.getElementById('legacyObituaryNotes').value        = d.obituaryNotes        || '';
            document.getElementById('legacyObituaryDraft').value        = d.obituaryDraft        || '';
            document.getElementById('legacyObituaryInstructions').value = d.obituaryInstructions || '';
        }
    } catch (e) {
        console.error('Error loading obituary:', e);
    }

    // Show AI button only if LLM is configured
    _legacyCheckLlm(function(enabled) {
        if (enabled) {
            document.getElementById('legacyObituaryAiRow').classList.remove('hidden');
        }
    });

    // Wire auto-save on blur for all three fields
    ['legacyObituaryNotes', 'legacyObituaryDraft', 'legacyObituaryInstructions'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.addEventListener('blur', _legacySaveObituary);
    });
}

function _legacySaveObituary() {
    var notes   = (document.getElementById('legacyObituaryNotes')        || {}).value || '';
    var draft   = (document.getElementById('legacyObituaryDraft')        || {}).value || '';
    var instrs  = (document.getElementById('legacyObituaryInstructions') || {}).value || '';
    var status  = document.getElementById('legacyObituarySaveStatus');

    userCol('legacyMeta').doc('obituary').set(
        { obituaryNotes: notes, obituaryDraft: draft, obituaryInstructions: instrs },
        { merge: true }
    ).then(function() {
        if (status) { status.textContent = 'Saved.'; setTimeout(function() { if (status) status.textContent = ''; }, 2000); }
    }).catch(function(e) {
        console.error('Error saving obituary:', e);
        if (status) status.textContent = 'Error saving.';
    });
}

async function legacyObituaryAskAI() {
    var notes   = (document.getElementById('legacyObituaryNotes') || {}).value.trim();
    var draftEl = document.getElementById('legacyObituaryDraft');
    var btn     = document.getElementById('legacyObituaryAiBtn');
    var status  = document.getElementById('legacyObituaryAiStatus');

    if (!notes) {
        status.textContent = 'Add some planning notes first.';
        setTimeout(function() { status.textContent = ''; }, 3000);
        return;
    }

    // Confirm before overwriting an existing draft
    if (draftEl.value.trim()) {
        if (!confirm('This will replace your current draft. Continue?')) return;
    }

    btn.disabled = true;
    status.textContent = 'Writing…';

    try {
        var cfgDoc = await userCol('settings').doc('llm').get();
        if (!cfgDoc.exists) throw new Error('No LLM configured');
        var cfg = cfgDoc.data();
        var llm = LLM_PROVIDERS[cfg.provider];
        if (!llm) throw new Error('Unknown provider');

        var prompt =
            'Write a warm, personal obituary based on the following notes written by the person themselves. ' +
            'Use the information naturally. Keep it to 3-4 paragraphs suitable for a newspaper or memorial program. ' +
            'Do not add invented details — only use what is provided.\n\n' + notes;

        var activeModel = cfg.model || llm.model;
        var result = await chatCallOpenAICompat(llm, cfg.apiKey, prompt, activeModel);

        draftEl.value = result;
        _legacySaveObituary();
        status.textContent = 'Done — review and edit as needed.';
        setTimeout(function() { status.textContent = ''; }, 4000);
    } catch (e) {
        console.error('Obituary AI error:', e);
        status.textContent = 'Error: ' + e.message;
    }

    btn.disabled = false;
}

// Checks if LLM is configured and calls cb(true/false)
function _legacyCheckLlm(cb) {
    userCol('settings').doc('llm').get().then(function(doc) {
        cb(doc.exists && !!(doc.data().provider && doc.data().apiKey));
    }).catch(function() { cb(false); });
}
// ============================================================
// Documents
// ============================================================

var _legacyDocCache = {}; // id → data, populated on load

var _LEGACY_DOC_TYPE_LABELS = {
    'will': 'Will', 'trust': 'Trust', 'poa': 'POA',
    'directive': 'Directive', 'insurance': 'Insurance',
    'deed': 'Deed', 'vehicle': 'Vehicle Title',
    'financial': 'Financial', 'medical': 'Medical',
    'other': 'Other', '': 'Document'
};

function loadLegacyDocumentsPage() {
    var page = document.getElementById('page-legacy-documents');
    if (!page) return;

    page.innerHTML =
        '<div class="page-header">' +
            '<h2>📁 Documents</h2>' +
            '<button class="btn btn-primary btn-small" onclick="_legacyDocOpenModal(null)">+ Add Document</button>' +
        '</div>' +
        '<p class="legacy-hint" style="padding:0 16px 8px;">Drag ⠿ to reorder — most important at top.</p>' +
        '<div id="legacyDocList"><p class="empty-state" id="legacyDocEmpty" style="padding:16px;">Loading…</p></div>' +
        '<div id="legacyDocModal" class="modal" role="dialog" aria-modal="true">' +
            '<div class="modal-content">' +
                '<h3 id="legacyDocModalTitle">Add Document</h3>' +
                '<div class="form-group">' +
                    '<label>Kind</label>' +
                    '<select id="legacyDocKind" class="form-control" onchange="_legacyDocKindChanged()">' +
                        '<option value="physical">Physical (Paper)</option>' +
                        '<option value="online">Online (URL)</option>' +
                    '</select>' +
                '</div>' +
                '<div class="form-group">' +
                    '<label>Document Type</label>' +
                    '<select id="legacyDocType" class="form-control">' +
                        '<option value="">-- Select type --</option>' +
                        '<option value="will">Will</option>' +
                        '<option value="trust">Trust</option>' +
                        '<option value="poa">Power of Attorney</option>' +
                        '<option value="directive">Advance Directive / Living Will</option>' +
                        '<option value="insurance">Insurance Policy</option>' +
                        '<option value="deed">Real Estate Deed</option>' +
                        '<option value="vehicle">Vehicle Title</option>' +
                        '<option value="financial">Financial Account</option>' +
                        '<option value="medical">Medical Records</option>' +
                        '<option value="other">Other</option>' +
                    '</select>' +
                '</div>' +
                '<div class="form-group">' +
                    '<label>Title <span style="color:var(--danger)">*</span></label>' +
                    '<input type="text" id="legacyDocTitle" class="form-control" placeholder="e.g. Last Will and Testament">' +
                '</div>' +
                '<div class="form-group">' +
                    '<label>Why it matters</label>' +
                    '<textarea id="legacyDocWhy" class="form-control" rows="3" placeholder="e.g. Names executor and beneficiaries for all assets"></textarea>' +
                '</div>' +
                '<div class="form-group" id="legacyDocUrlGroup">' +
                    '<label>URL</label>' +
                    '<input type="url" id="legacyDocUrl" class="form-control" placeholder="https://...">' +
                '</div>' +
                '<div class="form-group" id="legacyDocWhereGroup">' +
                    '<label>Where is it</label>' +
                    '<textarea id="legacyDocWhere" class="form-control" rows="3"' +
                        ' placeholder="e.g. Filing cabinet in office, red folder&#10;— or —&#10;Attorney Jane Smith, 123 Main St, 612-555-1234"></textarea>' +
                '</div>' +
                '<div class="modal-actions">' +
                    '<button class="btn btn-secondary" onclick="_legacyDocCloseModal()">Cancel</button>' +
                    '<button class="btn btn-danger hidden" id="legacyDocDeleteBtn" onclick="_legacyDocDeleteFromModal()">Delete</button>' +
                    '<button class="btn btn-primary" onclick="_legacyDocSaveModal()">Save</button>' +
                '</div>' +
            '</div>' +
        '</div>';

    var crumb = document.getElementById('breadcrumbBar');
    if (crumb) {
        crumb.innerHTML =
            '<a href="#life">Life</a><span class="separator">&rsaquo;</span>' +
            '<a href="#legacy">My Legacy</a><span class="separator">&rsaquo;</span>' +
            '<span>Documents</span>';
    }

    var modal = document.getElementById('legacyDocModal');
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) _legacyDocCloseModal();
        });
    }

    _legacyDocKindChanged();
    _legacyDocLoadList();
}

async function _legacyDocLoadList() {
    var list = document.getElementById('legacyDocList');
    if (!list) return;
    _legacyDocCache = {};
    list.innerHTML = '<p class="empty-state" id="legacyDocEmpty" style="padding:16px;">Loading…</p>';

    try {
        var snap = await userCol('legacyDocuments').orderBy('sortOrder', 'asc').get();
        if (snap.empty) {
            var emptyEl = document.getElementById('legacyDocEmpty');
            if (emptyEl) emptyEl.textContent = 'No documents yet. Tap + Add Document to get started.';
            return;
        }
        list.innerHTML = '';
        snap.forEach(function(doc) {
            _legacyDocCache[doc.id] = doc.data();
            list.appendChild(_legacyDocCard(doc.id, doc.data()));
        });

        if (typeof Sortable !== 'undefined') {
            Sortable.create(list, {
                animation: 150,
                handle: '.legacy-doc-drag',
                onEnd: _legacyDocReorder
            });
        }
    } catch (e) {
        console.error('Error loading documents:', e);
        list.innerHTML = '<p class="empty-state" style="padding:16px;">Error loading documents.</p>';
    }
}

function _legacyDocCard(id, data) {
    var typeLabel = _LEGACY_DOC_TYPE_LABELS[data.docType] || 'Document';
    var kindLabel = data.isOnline ? 'Online' : 'Physical';
    var kindClass = data.isOnline ? 'legacy-doc-badge--online' : 'legacy-doc-badge--physical';

    var card = document.createElement('div');
    card.className = 'legacy-doc-card';
    card.setAttribute('data-id', id);

    card.innerHTML =
        '<div class="legacy-doc-card-header" onclick="_legacyDocToggle(\'' + id + '\')">' +
            '<span class="legacy-doc-drag" onclick="event.stopPropagation()">⠿</span>' +
            '<span class="legacy-doc-type-badge">' + _esc(typeLabel) + '</span>' +
            '<span class="legacy-doc-title">' + _esc(data.title || 'Untitled') + '</span>' +
            '<span class="legacy-doc-kind-badge ' + kindClass + '">' + kindLabel + '</span>' +
            '<span class="legacy-doc-chevron">▾</span>' +
        '</div>' +
        '<div class="legacy-doc-card-body">' +
            (data.whyMatters
                ? '<div class="legacy-doc-field">' +
                      '<span class="legacy-doc-field-label">Why it matters</span>' +
                      '<span class="legacy-doc-field-value">' + _esc(data.whyMatters) + '</span>' +
                  '</div>'
                : '') +
            (data.isOnline && data.url
                ? '<div class="legacy-doc-field">' +
                      '<span class="legacy-doc-field-label">Link</span>' +
                      '<a href="' + _esc(data.url) + '" target="_blank" rel="noopener" class="legacy-doc-link">' + _esc(data.url) + '</a>' +
                  '</div>'
                : '') +
            (!data.isOnline && data.whereIsIt
                ? '<div class="legacy-doc-field">' +
                      '<span class="legacy-doc-field-label">Where is it</span>' +
                      '<span class="legacy-doc-field-value" style="white-space:pre-wrap;">' + _esc(data.whereIsIt) + '</span>' +
                  '</div>'
                : '') +
            '<div class="legacy-doc-card-footer">' +
                '<button class="btn btn-secondary btn-small"' +
                    ' onclick="event.stopPropagation(); _legacyDocOpenModal(\'' + id + '\')">Edit</button>' +
                '<button class="btn btn-danger btn-small"' +
                    ' onclick="event.stopPropagation(); _legacyDocDeleteFromCard(\'' + id + '\')">Delete</button>' +
            '</div>' +
        '</div>';

    return card;
}

function _legacyDocToggle(id) {
    var card = document.querySelector('.legacy-doc-card[data-id="' + id + '"]');
    if (card) card.classList.toggle('legacy-doc-card--expanded');
}

function _legacyDocKindChanged() {
    var kind = (document.getElementById('legacyDocKind') || {}).value;
    var urlGroup   = document.getElementById('legacyDocUrlGroup');
    var whereGroup = document.getElementById('legacyDocWhereGroup');
    if (urlGroup)   urlGroup.style.display   = (kind === 'online')   ? '' : 'none';
    if (whereGroup) whereGroup.style.display = (kind === 'physical') ? '' : 'none';
}

function _legacyDocOpenModal(id) {
    var modal     = document.getElementById('legacyDocModal');
    var titleEl   = document.getElementById('legacyDocModalTitle');
    var deleteBtn = document.getElementById('legacyDocDeleteBtn');
    if (!modal) return;

    document.getElementById('legacyDocKind').value  = 'physical';
    document.getElementById('legacyDocType').value  = '';
    document.getElementById('legacyDocTitle').value = '';
    document.getElementById('legacyDocWhy').value   = '';
    document.getElementById('legacyDocUrl').value   = '';
    document.getElementById('legacyDocWhere').value = '';
    modal.dataset.editId = id || '';

    if (id) {
        titleEl.textContent = 'Edit Document';
        deleteBtn.classList.remove('hidden');
        var data = _legacyDocCache[id];
        if (data) {
            document.getElementById('legacyDocKind').value  = data.isOnline ? 'online' : 'physical';
            document.getElementById('legacyDocType').value  = data.docType    || '';
            document.getElementById('legacyDocTitle').value = data.title      || '';
            document.getElementById('legacyDocWhy').value   = data.whyMatters || '';
            document.getElementById('legacyDocUrl').value   = data.url        || '';
            document.getElementById('legacyDocWhere').value = data.whereIsIt  || '';
        }
    } else {
        titleEl.textContent = 'Add Document';
        deleteBtn.classList.add('hidden');
    }

    _legacyDocKindChanged();
    modal.classList.add('open');
    setTimeout(function() {
        var el = document.getElementById('legacyDocTitle');
        if (el) el.focus();
    }, 50);
}

function _legacyDocCloseModal() {
    var modal = document.getElementById('legacyDocModal');
    if (modal) modal.classList.remove('open');
}

async function _legacyDocSaveModal() {
    var modal    = document.getElementById('legacyDocModal');
    var id       = modal ? (modal.dataset.editId || '') : '';
    var isOnline = (document.getElementById('legacyDocKind')  || {}).value === 'online';
    var docType  = ((document.getElementById('legacyDocType')  || {}).value || '');
    var title    = ((document.getElementById('legacyDocTitle') || {}).value || '').trim();
    var why      = ((document.getElementById('legacyDocWhy')   || {}).value || '').trim();
    var url      = ((document.getElementById('legacyDocUrl')   || {}).value || '').trim();
    var where    = ((document.getElementById('legacyDocWhere') || {}).value || '').trim();

    if (!title) {
        alert('Please enter a title.');
        var el = document.getElementById('legacyDocTitle');
        if (el) el.focus();
        return;
    }

    var data = {
        isOnline:   isOnline,
        docType:    docType,
        title:      title,
        whyMatters: why,
        url:        isOnline  ? url   : '',
        whereIsIt:  !isOnline ? where : ''
    };

    try {
        if (id) {
            await userCol('legacyDocuments').doc(id).set(data, { merge: true });
            _legacyDocCache[id] = Object.assign(_legacyDocCache[id] || {}, data);
        } else {
            var snap = await userCol('legacyDocuments').orderBy('sortOrder', 'desc').limit(1).get();
            data.sortOrder = snap.empty ? 0 : ((snap.docs[0].data().sortOrder || 0) + 1);
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            var ref = await userCol('legacyDocuments').add(data);
            _legacyDocCache[ref.id] = data;
        }
        _legacyDocCloseModal();
        await _legacyDocLoadList();
    } catch (e) {
        console.error('Error saving document:', e);
        alert('Could not save. Please try again.');
    }
}

async function _legacyDocDeleteFromModal() {
    var modal = document.getElementById('legacyDocModal');
    var id    = modal ? (modal.dataset.editId || '') : '';
    if (!id) return;
    var title = (_legacyDocCache[id] || {}).title || 'this document';
    if (!confirm('Delete "' + title + '"?')) return;
    try {
        await userCol('legacyDocuments').doc(id).delete();
        delete _legacyDocCache[id];
        _legacyDocCloseModal();
        await _legacyDocLoadList();
    } catch (e) {
        console.error('Error deleting document:', e);
        alert('Could not delete. Please try again.');
    }
}

async function _legacyDocDeleteFromCard(id) {
    var title = (_legacyDocCache[id] || {}).title || 'this document';
    if (!confirm('Delete "' + title + '"?')) return;
    try {
        await userCol('legacyDocuments').doc(id).delete();
        delete _legacyDocCache[id];
        await _legacyDocLoadList();
    } catch (e) {
        console.error('Error deleting document:', e);
        alert('Could not delete. Please try again.');
    }
}

async function _legacyDocReorder() {
    var items = document.querySelectorAll('#legacyDocList .legacy-doc-card');
    var batch = firebase.firestore().batch();
    items.forEach(function(el, i) {
        batch.update(userCol('legacyDocuments').doc(el.getAttribute('data-id')), { sortOrder: i });
    });
    try {
        await batch.commit();
    } catch (e) {
        console.error('Error reordering documents:', e);
    }
}
function loadLegacyHouseholdPage() {
    _legacyLoadStub('page-legacy-household', 'Household Instructions', 'household');
}
async function loadLegacyPetsPage() {
    var page = document.getElementById('page-legacy-pets');
    if (!page) return;

    page.innerHTML =
        '<div class="page-header">' +
            '<h2>🐾 Pets</h2>' +
            '<button class="btn btn-primary btn-small" id="legacyPetAddBtn" onclick="_legacyPetAddNew()">+ Add Pet</button>' +
        '</div>' +
        '<div id="legacyPetsList"><p class="empty-state" id="legacyPetsEmpty" style="padding:16px;">Loading…</p></div>';

    var crumb = document.getElementById('breadcrumbBar');
    if (crumb) {
        crumb.innerHTML =
            '<a href="#life">Life</a><span class="separator">&rsaquo;</span>' +
            '<a href="#legacy">My Legacy</a><span class="separator">&rsaquo;</span>' +
            '<span>Pets</span>';
    }

    try {
        var snap = await userCol('legacyPets').orderBy('createdAt', 'asc').get();
        var list = document.getElementById('legacyPetsList');
        var empty = document.getElementById('legacyPetsEmpty');
        if (snap.empty) {
            if (empty) empty.textContent = 'No pets added yet. Use Add Pet to get started.';
        } else {
            if (empty) empty.remove();
            snap.forEach(function(doc) {
                list.appendChild(_legacyPetCard(doc.id, doc.data().name || '', doc.data().instructions || '', false));
            });
        }
    } catch (e) {
        console.error('Error loading pets:', e);
        var empty = document.getElementById('legacyPetsEmpty');
        if (empty) empty.textContent = 'Error loading pets.';
    }
}

function _legacyPetCard(id, name, instructions, expanded) {
    var card = document.createElement('div');
    card.className = 'legacy-pet-card' + (expanded ? ' legacy-pet-card--expanded' : '');
    card.id = 'legacy-pet-card-' + id;
    card.innerHTML =
        '<div class="legacy-pet-card-header" onclick="_legacyPetToggle(\'' + id + '\')">' +
            '<span class="legacy-pet-card-name" id="legacy-pet-preview-' + id + '">' + _esc(name || 'New Pet') + '</span>' +
            '<span class="legacy-pet-card-chevron">▾</span>' +
        '</div>' +
        '<div class="legacy-pet-card-body">' +
            '<div class="form-group">' +
                '<label>Pet\'s Name</label>' +
                '<input type="text" class="form-control" id="legacy-pet-name-' + id + '" value="' + _esc(name) + '" placeholder="e.g. Biscuit">' +
            '</div>' +
            '<div class="form-group">' +
                '<label>Instructions</label>' +
                '<p class="legacy-hint">Who should take this pet? Any care notes, feeding routine, vet info, etc.</p>' +
                '<textarea class="legacy-textarea" id="legacy-pet-instructions-' + id + '" rows="6"' +
                    ' placeholder="e.g. Give to Karen. Eats twice a day — 1 cup dry food. Vet is Dr. Smith at 612-555-1234.">' + _esc(instructions) + '</textarea>' +
            '</div>' +
            '<div class="legacy-pet-card-footer">' +
                '<button class="btn btn-danger btn-small" onclick="_legacyPetDelete(\'' + id + '\')">Delete</button>' +
                '<span class="legacy-save-status" id="legacy-pet-save-' + id + '"></span>' +
            '</div>' +
        '</div>';

    // Auto-save on blur
    var nameEl  = card.querySelector('#legacy-pet-name-' + id);
    var instrEl = card.querySelector('#legacy-pet-instructions-' + id);
    nameEl.addEventListener('blur',  function() { _legacyPetSave(id); });
    instrEl.addEventListener('blur', function() { _legacyPetSave(id); });

    // Update preview label when name changes
    nameEl.addEventListener('input', function() {
        var preview = document.getElementById('legacy-pet-preview-' + id);
        if (preview) preview.textContent = nameEl.value.trim() || 'New Pet';
    });

    return card;
}

function _legacyPetToggle(id) {
    var card = document.getElementById('legacy-pet-card-' + id);
    if (card) card.classList.toggle('legacy-pet-card--expanded');
}

function _legacyPetSave(id) {
    var nameEl  = document.getElementById('legacy-pet-name-' + id);
    var instrEl = document.getElementById('legacy-pet-instructions-' + id);
    var status  = document.getElementById('legacy-pet-save-' + id);
    var name    = nameEl  ? nameEl.value.trim()  : '';
    var instr   = instrEl ? instrEl.value        : '';

    userCol('legacyPets').doc(id).set({ name: name, instructions: instr }, { merge: true })
        .then(function() {
            if (status) { status.textContent = 'Saved.'; setTimeout(function() { if (status) status.textContent = ''; }, 2000); }
        })
        .catch(function(e) {
            console.error('Error saving pet:', e);
            if (status) status.textContent = 'Error saving.';
        });
}

async function _legacyPetAddNew() {
    var btn = document.getElementById('legacyPetAddBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Adding…'; }
    try {
        var ref = await userCol('legacyPets').add({
            name: '', instructions: '',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        var empty = document.getElementById('legacyPetsEmpty');
        if (empty) empty.remove();
        var list = document.getElementById('legacyPetsList');
        var card = _legacyPetCard(ref.id, '', '', true);
        list.insertBefore(card, list.firstChild);
        // Focus the name field
        var nameEl = document.getElementById('legacy-pet-name-' + ref.id);
        if (nameEl) setTimeout(function() { nameEl.focus(); }, 50);
    } catch (e) {
        console.error('Error adding pet:', e);
        alert('Could not add pet. Please try again.');
    }
    if (btn) { btn.disabled = false; btn.textContent = '+ Add Pet'; }
}

function _legacyPetDelete(id) {
    var nameEl = document.getElementById('legacy-pet-name-' + id);
    var name   = nameEl ? (nameEl.value.trim() || 'this pet') : 'this pet';
    if (!confirm('Delete ' + name + '?')) return;
    userCol('legacyPets').doc(id).delete()
        .then(function() {
            var card = document.getElementById('legacy-pet-card-' + id);
            if (card) card.remove();
            // Show empty state if no cards left
            var list = document.getElementById('legacyPetsList');
            if (list && !list.querySelector('.legacy-pet-card')) {
                var p = document.createElement('p');
                p.className = 'empty-state';
                p.id = 'legacyPetsEmpty';
                p.style.padding = '16px';
                p.textContent = 'No pets added yet. Use Add Pet to get started.';
                list.appendChild(p);
            }
        })
        .catch(function(e) { console.error('Error deleting pet:', e); alert('Could not delete. Please try again.'); });
}
// ============================================================
// People to Notify
// ============================================================

async function loadLegacyNotifyPage() {
    var page = document.getElementById('page-legacy-notify');
    if (!page) return;

    page.innerHTML =
        '<div class="page-header">' +
            '<h2>📞 People to Notify</h2>' +
            '<div class="legacy-notify-header-btns">' +
                '<button class="btn btn-secondary btn-small" id="legacyNotifyFromContactsBtn" onclick="_legacyNotifyShowPicker()">+ From Contacts</button>' +
                '<button class="btn btn-primary btn-small" onclick="_legacyNotifyOpenModal(null)">+ Add Manually</button>' +
                '<button class="btn btn-secondary btn-small hidden" id="legacyNotifyAllBtn" onclick="_legacyNotifyOpenCompose()">&#9993; Notify All</button>' +
            '</div>' +
        '</div>' +
        // Inline contact picker — hidden until "From Contacts" is clicked
        '<div id="legacyNotifyPickerArea" class="legacy-notify-picker-area hidden">' +
            '<p class="legacy-hint" style="margin-bottom:6px;">Select a contact to add them to your notify list:</p>' +
            '<div id="legacyNotifyContactPicker"></div>' +
            '<button class="btn btn-secondary btn-small" style="margin-top:8px;" onclick="_legacyNotifyHidePicker()">Cancel</button>' +
        '</div>' +
        '<div id="legacyNotifyList"><p class="empty-state" id="legacyNotifyEmpty" style="padding:16px;">Loading…</p></div>' +
        // Notify All compose modal
        '<div id="legacyNotifyComposeModal" class="modal" role="dialog" aria-modal="true">' +
            '<div class="modal-content">' +
                '<h3>&#9993; Notify All</h3>' +
                '<p style="margin-bottom:12px;font-size:0.9em;color:var(--text-secondary);">Compose your message below. Clicking <strong>Open in Email</strong> will open your email app with all addresses pre-filled.</p>' +
                '<div class="form-group">' +
                    '<label>Subject</label>' +
                    '<input type="text" id="legacyNotifyComposeSubject" class="form-control" placeholder="e.g. Important news about Steve">' +
                '</div>' +
                '<div class="form-group">' +
                    '<label>Message</label>' +
                    '<textarea id="legacyNotifyComposeBody" class="form-control" rows="7" placeholder="Write your message here…"></textarea>' +
                '</div>' +
                '<div class="modal-actions">' +
                    '<button class="btn btn-secondary" onclick="_legacyNotifyCloseCompose()">Cancel</button>' +
                    '<button class="btn btn-primary" onclick="_legacyNotifySendAll()">Open in Email</button>' +
                '</div>' +
            '</div>' +
        '</div>' +
        // Free-form add/edit modal
        '<div id="legacyNotifyModal" class="modal" role="dialog" aria-modal="true">' +
            '<div class="modal-content">' +
                '<h3 id="legacyNotifyModalTitle">Add Person</h3>' +
                '<div class="form-group">' +
                    '<label>Name <span style="color:var(--danger)">*</span></label>' +
                    '<input type="text" id="legacyNotifyName" class="form-control" placeholder="Full name">' +
                '</div>' +
                '<div class="form-group">' +
                    '<label>Phone</label>' +
                    '<input type="text" id="legacyNotifyPhone" class="form-control" placeholder="Phone number">' +
                '</div>' +
                '<div class="form-group">' +
                    '<label>Email</label>' +
                    '<input type="text" id="legacyNotifyEmail" class="form-control" placeholder="Email address">' +
                '</div>' +
                '<div class="form-group">' +
                    '<label>Address</label>' +
                    '<textarea id="legacyNotifyAddress" class="form-control" rows="2" placeholder="Mailing address"></textarea>' +
                '</div>' +
                '<div class="form-group">' +
                    '<label>How do I know them</label>' +
                    '<input type="text" id="legacyNotifyHowKnown" class="form-control" placeholder="e.g. College friend, neighbor, coworker">' +
                '</div>' +
                '<div class="modal-actions">' +
                    '<button class="btn btn-secondary" onclick="_legacyNotifyCloseModal()">Cancel</button>' +
                    '<button class="btn btn-danger hidden" id="legacyNotifyDeleteBtn" onclick="_legacyNotifyDeleteFromModal()">Delete</button>' +
                    '<button class="btn btn-primary" onclick="_legacyNotifySaveModal()">Save</button>' +
                '</div>' +
            '</div>' +
        '</div>';

    var crumb = document.getElementById('breadcrumbBar');
    if (crumb) {
        crumb.innerHTML =
            '<a href="#life">Life</a><span class="separator">&rsaquo;</span>' +
            '<a href="#legacy">My Legacy</a><span class="separator">&rsaquo;</span>' +
            '<span>People to Notify</span>';
    }

    // Close modals on backdrop click
    var modal = document.getElementById('legacyNotifyModal');
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) _legacyNotifyCloseModal();
        });
    }
    var composeModal = document.getElementById('legacyNotifyComposeModal');
    if (composeModal) {
        composeModal.addEventListener('click', function(e) {
            if (e.target === composeModal) _legacyNotifyCloseCompose();
        });
    }

    // Build the inline contact picker
    if (typeof buildContactPicker === 'function') {
        buildContactPicker('legacyNotifyContactPicker', {
            placeholder: 'Search contacts…',
            onSelect: function(person) { _legacyNotifyAddFromContact(person); }
        });
    }

    await _legacyNotifyRenderList();
}

function _legacyNotifyShowPicker() {
    var area = document.getElementById('legacyNotifyPickerArea');
    var btn  = document.getElementById('legacyNotifyFromContactsBtn');
    if (area) area.classList.remove('hidden');
    if (btn)  btn.style.display = 'none';
    var searchEl = document.getElementById('legacyNotifyContactPicker_search');
    if (searchEl) { searchEl.value = ''; searchEl.focus(); }
}

function _legacyNotifyHidePicker() {
    var area = document.getElementById('legacyNotifyPickerArea');
    var btn  = document.getElementById('legacyNotifyFromContactsBtn');
    if (area) area.classList.add('hidden');
    if (btn)  btn.style.display = '';
}

async function _legacyNotifyAddFromContact(person) {
    _legacyNotifyHidePicker();
    try {
        // Prevent duplicates
        var existing = await userCol('legacyNotify').where('contactId', '==', person.id).get();
        if (!existing.empty) {
            alert((person.name || 'That contact') + ' is already in your notify list.');
            return;
        }
        await userCol('legacyNotify').add({
            contactId: person.id,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        await _legacyNotifyRenderList();
    } catch (e) {
        console.error('Error adding contact to notify list:', e);
        alert('Could not add contact. Please try again.');
    }
}

async function _legacyNotifyOpenModal(id) {
    var modal     = document.getElementById('legacyNotifyModal');
    var titleEl   = document.getElementById('legacyNotifyModalTitle');
    var deleteBtn = document.getElementById('legacyNotifyDeleteBtn');
    if (!modal) return;

    // Clear all fields
    ['legacyNotifyName','legacyNotifyPhone','legacyNotifyEmail',
     'legacyNotifyAddress','legacyNotifyHowKnown'].forEach(function(fid) {
        var el = document.getElementById(fid);
        if (el) el.value = '';
    });
    modal.dataset.editId = id || '';

    if (id) {
        titleEl.textContent = 'Edit Person';
        deleteBtn.classList.remove('hidden');
        try {
            var doc = await userCol('legacyNotify').doc(id).get();
            if (doc.exists) {
                var d = doc.data();
                document.getElementById('legacyNotifyName').value     = d.name           || '';
                document.getElementById('legacyNotifyPhone').value    = d.phone          || '';
                document.getElementById('legacyNotifyEmail').value    = d.email          || '';
                document.getElementById('legacyNotifyAddress').value  = d.address        || '';
                document.getElementById('legacyNotifyHowKnown').value = d.howDoIKnowThem || '';
            }
        } catch (e) {
            console.error('Error loading notify entry:', e);
        }
    } else {
        titleEl.textContent = 'Add Person';
        deleteBtn.classList.add('hidden');
    }

    modal.classList.add('open');
    setTimeout(function() {
        var nameEl = document.getElementById('legacyNotifyName');
        if (nameEl) nameEl.focus();
    }, 50);
}

function _legacyNotifyCloseModal() {
    var modal = document.getElementById('legacyNotifyModal');
    if (modal) modal.classList.remove('open');
}

async function _legacyNotifySaveModal() {
    var modal    = document.getElementById('legacyNotifyModal');
    var id       = modal ? (modal.dataset.editId || '') : '';
    var name     = (document.getElementById('legacyNotifyName')     || {}).value.trim();
    var phone    = (document.getElementById('legacyNotifyPhone')    || {}).value.trim();
    var email    = (document.getElementById('legacyNotifyEmail')    || {}).value.trim();
    var address  = (document.getElementById('legacyNotifyAddress')  || {}).value.trim();
    var howKnown = (document.getElementById('legacyNotifyHowKnown') || {}).value.trim();

    if (!name) {
        alert('Please enter a name.');
        var nameEl = document.getElementById('legacyNotifyName');
        if (nameEl) nameEl.focus();
        return;
    }

    var data = {
        contactId:      null,
        name:           name,
        phone:          phone,
        email:          email,
        address:        address,
        howDoIKnowThem: howKnown
    };

    try {
        if (id) {
            await userCol('legacyNotify').doc(id).set(data, { merge: true });
        } else {
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await userCol('legacyNotify').add(data);
        }
        _legacyNotifyCloseModal();
        await _legacyNotifyRenderList();
    } catch (e) {
        console.error('Error saving notify entry:', e);
        alert('Could not save. Please try again.');
    }
}

async function _legacyNotifyDeleteFromModal() {
    var modal = document.getElementById('legacyNotifyModal');
    var id    = modal ? (modal.dataset.editId || '') : '';
    if (!id) return;
    if (!confirm('Remove this person from your notify list?')) return;
    try {
        await userCol('legacyNotify').doc(id).delete();
        _legacyNotifyCloseModal();
        await _legacyNotifyRenderList();
    } catch (e) {
        console.error('Error deleting notify entry:', e);
        alert('Could not delete. Please try again.');
    }
}

function _legacyNotifyDeleteRow(btn) {
    var id   = btn.getAttribute('data-nid');
    var name = btn.getAttribute('data-nname') || 'this person';
    if (!confirm('Remove ' + name + ' from your notify list?')) return;
    userCol('legacyNotify').doc(id).delete()
        .then(function() { _legacyNotifyRenderList(); })
        .catch(function(e) {
            console.error('Error deleting notify entry:', e);
            alert('Could not delete. Please try again.');
        });
}

// Emails collected during the last render — used by Notify All
var _legacyNotifyEmailList = [];

function _legacyNotifyOpenCompose() {
    var modal = document.getElementById('legacyNotifyComposeModal');
    if (modal) modal.classList.add('open');
    var subj = document.getElementById('legacyNotifyComposeSubject');
    if (subj) subj.focus();
}

function _legacyNotifyCloseCompose() {
    var modal = document.getElementById('legacyNotifyComposeModal');
    if (modal) modal.classList.remove('open');
}

function _legacyNotifySendAll() {
    var emails  = _legacyNotifyEmailList;
    var subject = (document.getElementById('legacyNotifyComposeSubject') || {}).value || '';
    var body    = (document.getElementById('legacyNotifyComposeBody') || {}).value || '';

    if (!emails.length) {
        alert('No email addresses found on your notify list.');
        return;
    }

    var mailto = 'mailto:' + emails.join(',') +
        '?subject=' + encodeURIComponent(subject) +
        '&body='    + encodeURIComponent(body);

    window.location.href = mailto;
    _legacyNotifyCloseCompose();
}

async function _legacyNotifyRenderList() {
    var list = document.getElementById('legacyNotifyList');
    if (!list) return;

    _legacyNotifyEmailList = [];
    list.innerHTML = '<p class="empty-state" id="legacyNotifyEmpty" style="padding:16px;">Loading…</p>';

    try {
        var snap = await userCol('legacyNotify').orderBy('createdAt', 'asc').get();

        if (snap.empty) {
            document.getElementById('legacyNotifyEmpty').textContent =
                'No one added yet. Use the buttons above to add people.';
            return;
        }

        var docs = [];
        snap.forEach(function(doc) { docs.push({ id: doc.id, data: doc.data() }); });

        // Fetch people data for contact-linked entries in parallel
        var personFetches = docs.map(function(entry) {
            if (entry.data.contactId) {
                return pplCol('people').doc(entry.data.contactId).get()
                    .then(function(pDoc) { return pDoc.exists ? pDoc.data() : null; })
                    .catch(function() { return null; });
            }
            return Promise.resolve(null);
        });
        var personDatas = await Promise.all(personFetches);

        list.innerHTML = '';
        docs.forEach(function(entry, i) {
            var d          = entry.data;
            var personData = personDatas[i];
            var name, phone, email, howKnown;

            if (d.contactId) {
                name     = (personData && personData.name)     || '(contact not found)';
                phone    = (personData && personData.phone)    || '';
                email    = (personData && personData.email)    || '';
                howKnown = (personData && personData.howKnown) || '';
            } else {
                name     = d.name           || '(no name)';
                phone    = d.phone          || '';
                email    = d.email          || '';
                howKnown = d.howDoIKnowThem || '';
            }

            var metaParts = [];
            if (phone) metaParts.push(_esc(phone));
            if (email) metaParts.push('<a href="mailto:' + _esc(email) + '" onclick="event.stopPropagation()">' + _esc(email) + '</a>');

            var row = document.createElement('div');
            row.className = 'legacy-notify-row';

            // Free-form rows open the edit modal on click
            var contentAttrs = d.contactId ? '' :
                ' onclick="_legacyNotifyOpenModal(\'' + entry.id + '\')" style="cursor:pointer;" title="Click to edit"';

            row.innerHTML =
                '<div class="legacy-notify-row-content"' + contentAttrs + '>' +
                    '<div class="legacy-notify-row-line1">' +
                        '<span class="legacy-notify-name">' + _esc(name) + '</span>' +
                        (metaParts.length
                            ? '<span class="legacy-notify-meta">' + metaParts.join(' · ') + '</span>'
                            : '') +
                    '</div>' +
                    (howKnown ? '<div class="legacy-notify-row-line2">' + _esc(howKnown) + '</div>' : '') +
                '</div>' +
                '<button class="btn btn-danger btn-small"' +
                    ' data-nid="' + entry.id + '"' +
                    ' data-nname="' + _esc(name) + '"' +
                    ' onclick="_legacyNotifyDeleteRow(this)">Delete</button>';

            list.appendChild(row);

            // Track emails for the Notify All button
            if (email) _legacyNotifyEmailList.push(email);
        });

        // Show Notify All button only when at least one person has an email
        var notifyAllBtn = document.getElementById('legacyNotifyAllBtn');
        if (notifyAllBtn) notifyAllBtn.classList.toggle('hidden', _legacyNotifyEmailList.length === 0);

    } catch (e) {
        console.error('Error loading notify list:', e);
        list.innerHTML = '<p class="empty-state" style="padding:16px;">Error loading list.</p>';
    }
}
// Stores createdAt of the currently-open letter for use in print
var _legacyLetterCreatedAt = null;

async function loadLegacyLettersPage() {
    var page = document.getElementById('page-legacy-letters');
    if (!page) return;

    page.innerHTML =
        '<div class="page-header">' +
            '<h2>✉️ Letters</h2>' +
            '<button class="btn btn-primary btn-small" id="legacyLetterAddBtn" onclick="_legacyLetterAddNew()">+ Add Letter</button>' +
        '</div>' +
        '<div id="legacyLettersList" class="legacy-letters-grid"><p class="empty-state" style="grid-column:1/-1">Loading…</p></div>';

    var crumb = document.getElementById('breadcrumbBar');
    if (crumb) {
        crumb.innerHTML =
            '<a href="#life">Life</a><span class="separator">&rsaquo;</span>' +
            '<a href="#legacy">My Legacy</a><span class="separator">&rsaquo;</span>' +
            '<span>Letters</span>';
    }

    try {
        var snap = await userCol('legacyLetters').orderBy('createdAt', 'desc').get();
        var container = document.getElementById('legacyLettersList');
        if (!container) return;
        container.innerHTML = '';

        if (snap.empty) {
            var emptyMsg = document.createElement('p');
            emptyMsg.className = 'empty-state';
            emptyMsg.style.gridColumn = '1 / -1';
            emptyMsg.innerHTML = 'No letters yet. Tap <strong>Add Letter</strong> to write your first one.';
            container.appendChild(emptyMsg);
            return;
        }
        snap.forEach(function(doc) {
            var d = doc.data();
            var title     = d.title         || 'Untitled';
            var recipient = d.recipientName || '(no recipient)';
            var dateStr   = d.createdAt ? d.createdAt.toDate().toLocaleDateString() : '';
            var card = document.createElement('div');
            card.className = 'legacy-letter-card';
            card.onclick = function() { window.location.hash = '#legacy/letter/' + doc.id; };
            card.innerHTML =
                '<div class="legacy-letter-card-title">' + _esc(title) + '</div>' +
                '<div class="legacy-letter-card-meta">To: ' + _esc(recipient) + (dateStr ? ' &nbsp;&middot;&nbsp; ' + dateStr : '') + '</div>';
            container.appendChild(card);
        });
    } catch (e) {
        console.error('Error loading letters:', e);
        var c = document.getElementById('legacyLettersList');
        if (c) c.innerHTML = '<p class="empty-state">Error loading letters.</p>';
    }
}

async function _legacyLetterAddNew() {
    var btn = document.getElementById('legacyLetterAddBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Creating…'; }
    try {
        var ref = await userCol('legacyLetters').add({
            contactId:     null,
            recipientName: '',
            title:         '',
            instructions:  '',
            body:          '',
            createdAt:     firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt:     firebase.firestore.FieldValue.serverTimestamp()
        });
        window.location.hash = '#legacy/letter/' + ref.id;
    } catch (e) {
        console.error('Error creating letter:', e);
        alert('Could not create letter. Please try again.');
        if (btn) { btn.disabled = false; btn.textContent = '+ Add Letter'; }
    }
}

async function loadLegacyLetterDetailPage(id) {
    var page = document.getElementById('page-legacy-letter');
    if (!page) return;
    page.dataset.letterId = id;
    _legacyLetterCreatedAt = null;

    var crumb = document.getElementById('breadcrumbBar');
    if (crumb) crumb.innerHTML = '<a href="#life">Life</a><span class="separator">&rsaquo;</span><a href="#legacy">My Legacy</a><span class="separator">&rsaquo;</span><a href="#legacy/letters">Letters</a><span class="separator">&rsaquo;</span><span>Letter</span>';

    page.innerHTML =
        '<div class="page-header">' +
            '<h2>✉️ Letter</h2>' +
            '<button class="btn btn-secondary btn-small" onclick="_legacyLetterPrint()">🖨️ Print</button>' +
        '</div>' +
        '<div class="legacy-section">' +

            // To: contact picker + typed-name fallback
            '<div class="legacy-obit-block">' +
                '<label class="legacy-label">To</label>' +
                '<div id="legacyLetterContactPicker"></div>' +
                '<p class="legacy-hint" style="margin:8px 0 4px;">Not in contacts? Type the name:</p>' +
                '<input type="text" id="legacyLetterTypedName" class="form-control" placeholder="Recipient\'s name…">' +
            '</div>' +

            // Title
            '<div class="legacy-obit-block">' +
                '<label class="legacy-label" for="legacyLetterTitle">Title ' +
                    '<span class="legacy-hint" style="font-weight:normal;font-size:0.85em;">(for your reference — not printed)</span>' +
                '</label>' +
                '<input type="text" id="legacyLetterTitle" class="form-control" placeholder="e.g. To Karen">' +
            '</div>' +

            // Instructions
            '<div class="legacy-obit-block">' +
                '<label class="legacy-label" for="legacyLetterInstructions">Instructions</label>' +
                '<p class="legacy-hint">When or how to deliver this letter — not printed with the letter.</p>' +
                '<textarea id="legacyLetterInstructions" class="legacy-textarea" rows="3"' +
                    ' placeholder="e.g. Open this on your first birthday after I\'m gone."></textarea>' +
            '</div>' +

            // Body + voice
            '<div class="legacy-obit-block">' +
                '<label class="legacy-label" for="legacyLetterBody">Letter</label>' +
                '<div class="legacy-ai-row" style="margin-bottom:8px;">' +
                    '<button class="btn btn-secondary btn-small" id="legacyLetterVoiceBtn">🎙️ Speak</button>' +
                    '<span class="legacy-ai-status" id="legacyLetterVoiceStatus"></span>' +
                '</div>' +
                '<textarea id="legacyLetterBody" class="legacy-textarea" rows="16"' +
                    ' placeholder="Write your letter here…"></textarea>' +
            '</div>' +

            '<p class="legacy-save-status" id="legacyLetterSaveStatus"></p>' +
        '</div>' +
        // Print-only area — populated on print, hidden on screen
        '<div id="legacyLetterPrintArea" class="legacy-print-area"></div>';

    var crumb = document.getElementById('breadcrumbBar');
    if (crumb) {
        crumb.innerHTML =
            '<a href="#life">Life</a><span class="separator">&rsaquo;</span>' +
            '<a href="#legacy">My Legacy</a><span class="separator">&rsaquo;</span>' +
            '<a href="#legacy/letters">Letters</a><span class="separator">&rsaquo;</span>' +
            '<span>Letter</span>';
    }

    // Load saved data
    var d = { contactId: null, recipientName: '', title: '', instructions: '', body: '', createdAt: null };
    try {
        var doc = await userCol('legacyLetters').doc(id).get();
        if (doc.exists) {
            d = Object.assign(d, doc.data());
            _legacyLetterCreatedAt = d.createdAt;
        }
    } catch (e) {
        console.error('Error loading letter:', e);
    }

    document.getElementById('legacyLetterTitle').value        = d.title        || '';
    document.getElementById('legacyLetterInstructions').value = d.instructions || '';
    document.getElementById('legacyLetterBody').value         = d.body         || '';

    // Typed name: used when no contact is linked
    document.getElementById('legacyLetterTypedName').value = d.contactId ? '' : (d.recipientName || '');

    // Build contact picker; onSelect triggers auto-save and clears typed-name field
    buildContactPicker('legacyLetterContactPicker', {
        placeholder:  'Search contacts…',
        initialId:    d.contactId    || '',
        initialName:  d.contactId    ? (d.recipientName || '') : '',
        allowCreate:  false,
        onSelect: function(cid, cname) {
            if (cid) {
                // Contact selected — clear typed name
                document.getElementById('legacyLetterTypedName').value = '';
            }
            _legacySaveLetter(id);
        }
    });

    // Wire voice-to-text
    if (typeof initVoiceToText === 'function') {
        initVoiceToText('legacyLetterBody', 'legacyLetterVoiceBtn');
    } else {
        var vBtn = document.getElementById('legacyLetterVoiceBtn');
        if (vBtn) vBtn.style.display = 'none';
    }

    // Auto-save on blur for all text fields
    ['legacyLetterTitle', 'legacyLetterInstructions', 'legacyLetterBody', 'legacyLetterTypedName'].forEach(function(fid) {
        var el = document.getElementById(fid);
        if (el) el.addEventListener('blur', function() { _legacySaveLetter(id); });
    });
}

function _legacySaveLetter(id) {
    // Determine recipient: prefer contact picker, fall back to typed name
    var hiddenInput  = document.getElementById('legacyLetterContactPicker_id');
    var searchInput  = document.getElementById('legacyLetterContactPicker_search');
    var contactId    = hiddenInput  ? (hiddenInput.value.trim()  || null) : null;
    var contactName  = searchInput  ? (searchInput.value.trim()  || '')   : '';
    var typedName    = (document.getElementById('legacyLetterTypedName') || {}).value || '';
    var recipientName = contactId ? contactName : (typedName.trim() || contactName);

    var data = {
        contactId:     contactId,
        recipientName: recipientName,
        title:         (document.getElementById('legacyLetterTitle')        || {}).value || '',
        instructions:  (document.getElementById('legacyLetterInstructions') || {}).value || '',
        body:          (document.getElementById('legacyLetterBody')         || {}).value || '',
        updatedAt:     firebase.firestore.FieldValue.serverTimestamp()
    };

    var status = document.getElementById('legacyLetterSaveStatus');
    userCol('legacyLetters').doc(id).set(data, { merge: true })
        .then(function() {
            if (status) { status.textContent = 'Saved.'; setTimeout(function() { if (status) status.textContent = ''; }, 2000); }
        })
        .catch(function(e) {
            console.error('Error saving letter:', e);
            if (status) status.textContent = 'Error saving.';
        });
}

function _legacyLetterPrint() {
    var hiddenInput = document.getElementById('legacyLetterContactPicker_id');
    var searchInput = document.getElementById('legacyLetterContactPicker_search');
    var contactId   = hiddenInput ? hiddenInput.value.trim() : '';
    var contactName = searchInput ? searchInput.value.trim() : '';
    var typedName   = (document.getElementById('legacyLetterTypedName') || {}).value.trim();
    var recipient   = contactId ? contactName : (typedName || contactName || '');

    var body    = (document.getElementById('legacyLetterBody') || {}).value || '';
    var dateStr = _legacyLetterCreatedAt
        ? _legacyLetterCreatedAt.toDate().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
        : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    var printArea = document.getElementById('legacyLetterPrintArea');
    if (!printArea) return;

    printArea.innerHTML =
        (recipient ? '<div class="legacy-print-recipient">To: ' + _esc(recipient) + '</div>' : '') +
        '<div class="legacy-print-date">' + _esc(dateStr) + '</div>' +
        '<div class="legacy-print-body">' + _esc(body).replace(/\n/g, '<br>') + '</div>';

    window.print();
}
async function loadLegacyMessagePage() {
    var page = document.getElementById('page-legacy-message');
    if (!page) return;

    page.innerHTML =
        '<div class="page-header">' +
            '<h2>💬 Final Message</h2>' +
        '</div>' +
        '<div class="legacy-section">' +
            '<div class="legacy-obit-block">' +
                '<label class="legacy-label" for="legacyMessageInstructions">Instructions</label>' +
                '<p class="legacy-hint">When or how should this message be shared — read aloud at the service, sent to everyone, given to a specific person?</p>' +
                '<textarea id="legacyMessageInstructions" class="legacy-textarea" rows="3"' +
                    ' placeholder="e.g. Read this aloud at my memorial service, then send a copy to everyone who attended."></textarea>' +
            '</div>' +
            '<div class="legacy-obit-block">' +
                '<label class="legacy-label" for="legacyMessageBody">Message</label>' +
                '<p class="legacy-hint">Write whatever you want to say — to the room, to your family, to anyone reading this.</p>' +
                '<textarea id="legacyMessageBody" class="legacy-textarea" rows="20"' +
                    ' placeholder="Write your message here…"></textarea>' +
            '</div>' +
            '<p class="legacy-save-status" id="legacyMessageSaveStatus"></p>' +
        '</div>';

    var crumb = document.getElementById('breadcrumbBar');
    if (crumb) {
        crumb.innerHTML =
            '<a href="#life">Life</a><span class="separator">&rsaquo;</span>' +
            '<a href="#legacy">My Legacy</a><span class="separator">&rsaquo;</span>' +
            '<span>Final Message</span>';
    }

    try {
        var doc = await userCol('legacyMeta').doc('message').get();
        if (doc.exists) {
            var d = doc.data();
            document.getElementById('legacyMessageInstructions').value = d.instructions || '';
            document.getElementById('legacyMessageBody').value         = d.body         || '';
        }
    } catch (e) {
        console.error('Error loading final message:', e);
    }

    ['legacyMessageInstructions', 'legacyMessageBody'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.addEventListener('blur', _legacySaveMessage);
    });
}

function _legacySaveMessage() {
    var instructions = (document.getElementById('legacyMessageInstructions') || {}).value || '';
    var body         = (document.getElementById('legacyMessageBody')         || {}).value || '';
    var status       = document.getElementById('legacyMessageSaveStatus');
    userCol('legacyMeta').doc('message').set({ instructions: instructions, body: body }, { merge: true })
        .then(function() {
            if (status) { status.textContent = 'Saved.'; setTimeout(function() { if (status) status.textContent = ''; }, 2000); }
        })
        .catch(function(e) {
            console.error('Error saving final message:', e);
            if (status) status.textContent = 'Error saving.';
        });
}


/** Financial Accounts hub — 5-card landing page. Gated. */
function loadLegacyAccountsPage() {
    _legacyRequireUnlock(function() {
        var page = document.getElementById('page-legacy-accounts');
        if (!page) return;

        var crumb = document.getElementById('breadcrumbBar');
        if (crumb) {
            crumb.innerHTML =
                '<a href="#life">Life</a><span class="separator">&rsaquo;</span>' +
                '<a href="#legacy">My Legacy</a><span class="separator">&rsaquo;</span>' +
                '<span>Financial</span>';
        }

        var cards = [
            { icon: '📋', label: 'Financial Plan',   desc: 'Your big-picture instructions for your loved ones.', route: '#legacy/accounts/plan',      built: true  },
            { icon: '🛡️', label: 'Insurance Policy', desc: 'Life insurance policies and how to file a claim.',   route: '#legacy/accounts/insurance', built: true  },
            { icon: '📄', label: 'Bills',             desc: 'Recurring expenses and auto-pay items.',             route: '#legacy/accounts/bills',     built: true  },
            { icon: '🏦', label: 'Loans',             desc: 'Mortgage, car loans, credit cards, and other debts.',route: '#legacy/accounts/loans',     built: true  },
            { icon: '💼', label: 'Accounts',          desc: 'Bank, retirement, brokerage, and other assets.',     route: '#legacy/accounts/accounts',  built: true  }
        ];

        page.innerHTML =
            '<div class="page-header">' +
                '<h2>💰 Financial</h2>' +
            '</div>' +
            '<div class="legacy-fin-hub" id="legacyFinHub"></div>';

        var hub = document.getElementById('legacyFinHub');
        cards.forEach(function(c) {
            var el = document.createElement(c.built ? 'a' : 'div');
            if (c.built) el.href = c.route;
            el.className = 'legacy-fin-card' + (c.built ? '' : ' legacy-fin-card--soon');
            el.innerHTML =
                '<span class="legacy-fin-card-icon">' + c.icon + '</span>' +
                '<div class="legacy-fin-card-body">' +
                    '<span class="legacy-fin-card-label">' + escapeHtml(c.label) + '</span>' +
                    '<span class="legacy-fin-card-desc">' + escapeHtml(c.desc) + '</span>' +
                    (!c.built ? '<span class="legacy-fin-card-soon-badge">Coming Soon</span>' : '') +
                '</div>' +
                (c.built ? '<span class="legacy-fin-card-arrow">›</span>' : '');
            hub.appendChild(el);
        });
    });
}

// ============================================================
// Legacy Financial — Accounts Sub-page (#legacy/accounts/accounts)
// Reads from investments/{personId}/accounts (canonical storage).
// ============================================================

var _legacyFinPersonFilter = 'self';
var _legacyFinPeople       = [];
var _legacyFinAccounts     = [];
var _legacyFinExpandedIds  = {};
var _legacyFinRevealedIds  = {};
var _legacyFinDecryptCache = {};

function _legacyFinCol() {
    return userCol('investments').doc(_legacyFinPersonFilter).collection('accounts');
}

function loadLegacyFinancialAccountsPage() {
    _legacyRequireUnlock(function() { _legacyFinLoadAndRender(); });
}

async function _legacyFinLoadAndRender() {
    var crumb = document.getElementById('breadcrumbBar');
    if (crumb) {
        crumb.innerHTML =
            '<a href="#life">Life</a><span class="separator">&rsaquo;</span>' +
            '<a href="#legacy">My Legacy</a><span class="separator">&rsaquo;</span>' +
            '<a href="#legacy/accounts">Financial</a><span class="separator">&rsaquo;</span>' +
            '<span>Accounts</span>';
    }
    await _legacyFinLoadAll();
    _legacyFinRenderPage();
}

async function _legacyFinLoadAll() {
    var settingsDoc = await userCol('settings').doc('investments').get();
    _legacyFinPeople = [];
    if (settingsDoc.exists) {
        var enrolledIds = (settingsDoc.data().enrolledPersonIds || []).filter(Boolean);
        var fetches = enrolledIds.map(function(pid) {
            return pplCol('people').doc(pid).get().then(function(d) {
                return d.exists ? { id: pid, name: d.data().name || pid } : null;
            });
        });
        var results = await Promise.all(fetches);
        _legacyFinPeople = results.filter(Boolean).sort(function(a, b) {
            return a.name.localeCompare(b.name);
        });
    }
    await _legacyFinLoadAccounts();
}

async function _legacyFinLoadAccounts() {
    _legacyFinExpandedIds = {};
    _legacyFinRevealedIds = {};
    _legacyFinDecryptCache = {};
    var snap = await _legacyFinCol().orderBy('sortOrder').get();
    _legacyFinAccounts = [];
    snap.forEach(function(doc) {
        _legacyFinAccounts.push(Object.assign({ id: doc.id }, doc.data()));
    });
}

function _legacyFinRenderPage() {
    var page = document.getElementById('page-legacy-financial-accounts');
    if (!page) return;

    var personOpts = '<option value="self"' + (_legacyFinPersonFilter === 'self' ? ' selected' : '') + '>Me</option>';
    _legacyFinPeople.forEach(function(p) {
        personOpts += '<option value="' + escapeHtml(p.id) + '"' +
            (_legacyFinPersonFilter === p.id ? ' selected' : '') + '>' +
            escapeHtml(p.name) + '</option>';
    });

    page.innerHTML =
        '<div class="page-header">' +
            '<h2>💼 Accounts</h2>' +
        '</div>' +
        '<div class="invest-person-row">' +
            '<label class="invest-person-label">Person:</label>' +
            '<select id="legacyFinPersonSel" onchange="_legacyFinOnPersonChange()">' + personOpts + '</select>' +
        '</div>' +
        '<div id="legacyFinAccountList"></div>';

    _legacyFinRenderList();
}

function _legacyFinRenderList() {
    var container = document.getElementById('legacyFinAccountList');
    if (!container) return;

    var active = _legacyFinAccounts.filter(function(a) { return !a.archived; });

    if (active.length === 0) {
        container.innerHTML =
            '<div class="empty-state">No accounts found. ' +
            '<a href="#investments/accounts">Add them in Investments →</a></div>';
        return;
    }

    var html = '';
    active.forEach(function(acct) { html += _legacyFinCardHtml(acct); });
    container.innerHTML = html;
}

function _legacyFinCardHtml(acct) {
    var isExpanded = !!_legacyFinExpandedIds[acct.id];
    var badgeClass = _investBadgeClass(acct.accountType || '');
    var typeLabel  = _investTypeLabel(acct.accountType || '');

    var titleParts = [escapeHtml(acct.nickname || '(untitled)')];
    if (acct.institution) titleParts.push(escapeHtml(acct.institution));

    var header =
        '<div class="invest-card-header" onclick="_legacyFinToggleCard(\'' + acct.id + '\')">' +
            '<span class="invest-type-badge ' + escapeHtml(badgeClass) + '">' + escapeHtml(typeLabel) + '</span>' +
            '<span class="invest-card-title">' + titleParts.join(' — ') +
                (acct.last4 ? '<span class="invest-last4"> ····' + escapeHtml(acct.last4) + '</span>' : '') +
            '</span>' +
            '<span class="invest-chevron">' + (isExpanded ? '▾' : '›') + '</span>' +
        '</div>';

    var body = '';
    if (isExpanded) {
        var isRevealed = !!_legacyFinRevealedIds[acct.id];
        var cache      = _legacyFinDecryptCache[acct.id] || {};
        var hasEnc     = acct.accountNumberEnc || acct.usernameEnc || acct.passwordEnc;

        body = '<div class="invest-card-body">';

        if (acct.url) {
            body += '<div class="invest-detail-row"><span class="invest-detail-label">URL</span>' +
                '<span class="invest-detail-value"><a href="' + escapeHtml(acct.url) + '" target="_blank" rel="noopener">' + escapeHtml(acct.url) + '</a></span></div>';
        }
        if (acct.loginNotes) {
            body += '<div class="invest-detail-row"><span class="invest-detail-label">Login Notes</span>' +
                '<span class="invest-detail-value">' + escapeHtml(acct.loginNotes) + '</span></div>';
        }
        if (acct.beneficiary) {
            body += '<div class="invest-detail-row"><span class="invest-detail-label">Beneficiary</span>' +
                '<span class="invest-detail-value">' + escapeHtml(acct.beneficiary) + '</span></div>';
        }

        if (hasEnc) {
            body += '<div class="invest-sensitive-box">';
            if (!isRevealed) {
                body += '<button class="btn btn-secondary btn-small invest-reveal-btn"' +
                    ' onclick="event.stopPropagation();_legacyFinRevealAccount(\'' + acct.id + '\')">' +
                    '🔓 Reveal All</button>';
            } else {
                body += '<button class="btn btn-secondary btn-small invest-reveal-btn"' +
                    ' onclick="event.stopPropagation();_legacyFinHideAccount(\'' + acct.id + '\')">' +
                    '🔒 Hide</button>';
                if (acct.accountNumberEnc) {
                    body += '<div class="invest-detail-row"><span class="invest-detail-label">Account #</span>' +
                        '<span class="invest-detail-value invest-sensitive-val">' + escapeHtml(cache.accountNumber || '') + '</span></div>';
                }
                if (acct.usernameEnc) {
                    body += '<div class="invest-detail-row"><span class="invest-detail-label">Username</span>' +
                        '<span class="invest-detail-value invest-sensitive-val">' + escapeHtml(cache.username || '') + '</span></div>';
                }
                if (acct.passwordEnc) {
                    body += '<div class="invest-detail-row"><span class="invest-detail-label">Password</span>' +
                        '<span class="invest-detail-value invest-sensitive-val">' + escapeHtml(cache.password || '') + '</span></div>';
                }
            }
            body += '</div>';
        }

        // Legacy overlay fields — editable inline
        body +=
            '<div class="legacy-fin-overlay">' +
                '<div class="legacy-fin-overlay-header">For Your Loved One</div>' +
                '<div class="form-group">' +
                    '<label>Current Value</label>' +
                    '<input type="text" id="legacyFinVal_' + acct.id + '"' +
                        ' class="legacy-fin-inline-input"' +
                        ' value="' + escapeHtml(acct.currentValue || '') + '"' +
                        ' placeholder="e.g. ~$45,000 as of Jan 2025">' +
                '</div>' +
                '<div class="form-group">' +
                    '<label>What to Do</label>' +
                    '<textarea id="legacyFinWtd_' + acct.id + '" class="legacy-fin-inline-textarea" rows="5"' +
                        ' placeholder="Roll over, close, leave alone — specific instructions for your loved one.">' +
                        escapeHtml(acct.whatToDo || '') + '</textarea>' +
                '</div>' +
                '<div class="form-group">' +
                    '<label>Legacy Notes</label>' +
                    '<textarea id="legacyFinNotes_' + acct.id + '" class="legacy-fin-inline-textarea" rows="3"' +
                        ' placeholder="Anything else useful for your loved one.">' +
                        escapeHtml(acct.legacyNotes || '') + '</textarea>' +
                '</div>' +
                '<div class="legacy-fin-overlay-actions">' +
                    '<button class="btn btn-primary btn-small"' +
                        ' onclick="event.stopPropagation();_legacyFinSaveOverlay(\'' + acct.id + '\')">Save</button>' +
                    '<span class="legacy-fin-save-status" id="legacyFinStatus_' + acct.id + '"></span>' +
                '</div>' +
            '</div>';

        body +=
            '<div class="invest-card-actions">' +
                '<a href="#investments/accounts/edit/' + acct.id + '" class="btn btn-secondary btn-small"' +
                    ' onclick="event.stopPropagation()">Edit in Investments →</a>' +
            '</div>' +
        '</div>';
    }

    return '<div class="invest-card' + (isExpanded ? ' invest-card--expanded' : '') +
        '" data-id="' + acct.id + '">' + header + body + '</div>';
}

function _legacyFinToggleCard(id) {
    _legacyFinExpandedIds[id] = !_legacyFinExpandedIds[id];
    if (!_legacyFinExpandedIds[id]) {
        delete _legacyFinRevealedIds[id];
        delete _legacyFinDecryptCache[id];
    }
    _legacyFinRenderList();
}

async function _legacyFinRevealAccount(id) {
    var acct = _legacyFinAccounts.find(function(a) { return a.id === id; });
    if (!acct) return;
    var cache = {};
    try {
        if (acct.accountNumberEnc) cache.accountNumber = await legacyDecrypt(acct.accountNumberEnc) || '';
        if (acct.usernameEnc)      cache.username      = await legacyDecrypt(acct.usernameEnc)      || '';
        if (acct.passwordEnc)      cache.password      = await legacyDecrypt(acct.passwordEnc)      || '';
    } catch (e) { console.error('Legacy financial decrypt error', e); }
    _legacyFinDecryptCache[id] = cache;
    _legacyFinRevealedIds[id]  = true;
    _legacyFinExpandedIds[id]  = true;
    _legacyFinRenderList();
}

function _legacyFinHideAccount(id) {
    delete _legacyFinRevealedIds[id];
    delete _legacyFinDecryptCache[id];
    _legacyFinRenderList();
}

async function _legacyFinOnPersonChange() {
    var sel = document.getElementById('legacyFinPersonSel');
    if (sel) _legacyFinPersonFilter = sel.value || 'self';
    await _legacyFinLoadAccounts();
    _legacyFinRenderList();
}

async function _legacyFinSaveOverlay(id) {
    var currentValue = (document.getElementById('legacyFinVal_'   + id) || {}).value || '';
    var whatToDo     = (document.getElementById('legacyFinWtd_'   + id) || {}).value || '';
    var legacyNotes  = (document.getElementById('legacyFinNotes_' + id) || {}).value || '';

    await _legacyFinCol().doc(id).update({
        currentValue: currentValue,
        whatToDo:     whatToDo,
        legacyNotes:  legacyNotes
    });

    var acct = _legacyFinAccounts.find(function(a) { return a.id === id; });
    if (acct) { acct.currentValue = currentValue; acct.whatToDo = whatToDo; acct.legacyNotes = legacyNotes; }

    var statusEl = document.getElementById('legacyFinStatus_' + id);
    if (statusEl) {
        statusEl.textContent = 'Saved ✓';
        setTimeout(function() { if (statusEl) statusEl.textContent = ''; }, 2000);
    }
}

// ============================================================
// Legacy Financial — Loans
// ============================================================

// ---------- Constants ----------

var LOAN_TYPES = [
    'Mortgage', 'Home Equity / HELOC', 'Car Loan', 'Credit Card',
    'Student Loan', 'Personal Loan', 'Business Loan', 'Furniture', 'Other'
];

var LOAN_HOW_PAID = [
    '', 'Auto Pay – Bank', 'Auto Pay – Credit Card',
    'Ebill – Pay Manually', 'Paper Bill – Pay Manually', 'Other'
];

// ---------- Module State ----------

var _loanLoans        = [];
var _loanExpandedIds  = {};
var _loanRevealedIds  = {};
var _loanDecryptCache = {};
var _loanShowArchived = false;
var _loanFormEditId   = null;
var _loanFormDraft    = null;

// ---------- Firestore Path ----------

function _loanCol() {
    return userCol('legacyFinancial').doc(_legacyFinPersonFilter).collection('loans');
}

// ---------- Page Loader ----------

function loadLegacyFinancialLoansPage() {
    _legacyRequireUnlock(function() { _loanLoadAndRender(); });
}

async function _loanLoadAndRender() {
    var crumb = document.getElementById('breadcrumbBar');
    if (crumb) {
        crumb.innerHTML =
            '<a href="#life">Life</a><span class="separator">&rsaquo;</span>' +
            '<a href="#legacy">My Legacy</a><span class="separator">&rsaquo;</span>' +
            '<a href="#legacy/accounts">Financial</a><span class="separator">&rsaquo;</span>' +
            '<span>Loans</span>';
    }
    await _loanLoadPeople();
    await _loanLoadLoans();
    _loanRenderPage();
}

async function _loanLoadPeople() {
    var settingsDoc = await userCol('settings').doc('investments').get();
    _legacyFinPeople = [];
    if (settingsDoc.exists) {
        var enrolledIds = (settingsDoc.data().enrolledPersonIds || []).filter(Boolean);
        var fetches = enrolledIds.map(function(pid) {
            return pplCol('people').doc(pid).get().then(function(d) {
                return d.exists ? { id: pid, name: d.data().name || pid } : null;
            });
        });
        var results = await Promise.all(fetches);
        _legacyFinPeople = results.filter(Boolean).sort(function(a, b) {
            return a.name.localeCompare(b.name);
        });
    }
}

async function _loanLoadLoans() {
    _loanExpandedIds  = {};
    _loanRevealedIds  = {};
    _loanDecryptCache = {};
    var snap = await _loanCol().orderBy('sortOrder').get();
    _loanLoans = [];
    snap.forEach(function(doc) {
        _loanLoans.push(Object.assign({ id: doc.id }, doc.data()));
    });
}

// ---------- Page Render ----------

function _loanRenderPage() {
    var page = document.getElementById('page-legacy-financial-loans');
    if (!page) return;

    var personOpts = '<option value="self"' + (_legacyFinPersonFilter === 'self' ? ' selected' : '') + '>Me</option>';
    _legacyFinPeople.forEach(function(p) {
        personOpts += '<option value="' + escapeHtml(p.id) + '"' +
            (_legacyFinPersonFilter === p.id ? ' selected' : '') + '>' +
            escapeHtml(p.name) + '</option>';
    });

    page.innerHTML =
        '<div class="page-header">' +
            '<h2>🏦 Loans</h2>' +
        '</div>' +
        '<div class="invest-person-row">' +
            '<label class="invest-person-label">Person:</label>' +
            '<select id="loanPersonSel" onchange="_loanOnPersonChange()">' + personOpts + '</select>' +
        '</div>' +
        '<div class="invest-toolbar">' +
            '<button class="btn btn-primary" onclick="window.location.hash=\'#legacy/accounts/loans/add\'">+ Add Loan</button>' +
            '<label class="loan-archived-toggle">' +
                '<input type="checkbox" id="loanShowArchivedChk"' + (_loanShowArchived ? ' checked' : '') +
                    ' onchange="_loanToggleShowArchived()"> Show Archived' +
            '</label>' +
        '</div>' +
        '<div id="loanList"></div>';

    _loanRenderList();
}

function _loanRenderList() {
    var container = document.getElementById('loanList');
    if (!container) return;

    var list = _loanLoans.filter(function(l) { return _loanShowArchived || !l.archived; });

    if (list.length === 0) {
        container.innerHTML = '<div class="empty-state">No loans yet. Add one above.</div>';
        return;
    }

    var html = '<div id="loanSortableList">';
    list.forEach(function(loan) { html += _loanCardHtml(loan); });
    html += '</div>';
    container.innerHTML = html;

    if (window.Sortable) {
        Sortable.create(document.getElementById('loanSortableList'), {
            handle: '.invest-drag-handle',
            animation: 150,
            onEnd: function(evt) { _loanOnReorder(evt); }
        });
    }
}

// ---------- Card HTML ----------

function _loanCardHtml(loan) {
    var isExpanded = !!_loanExpandedIds[loan.id];
    var payBadge   = _loanPaymentBadge(loan.howItsPaid);

    var titleParts = [escapeHtml(loan.nickname || '(untitled)')];
    if (loan.lender) titleParts.push(escapeHtml(loan.lender));

    var headerMeta = titleParts.join(' — ');
    if (loan.monthlyPayment) headerMeta += '<span class="loan-header-hint"> $' + escapeHtml(String(loan.monthlyPayment)) + '/mo</span>';
    if (payBadge) headerMeta += '<span class="loan-pay-badge loan-pay-badge--' + payBadge.type + '">' + escapeHtml(payBadge.label) + '</span>';
    if (loan.payoffDate) headerMeta += '<span class="loan-header-hint"> Payoff: ' + _loanFmtDate(loan.payoffDate) + '</span>';
    if (loan.inWhoseName) headerMeta += '<span class="loan-header-hint"> (' + escapeHtml(loan.inWhoseName) + ')</span>';

    var header =
        '<div class="invest-card-header" onclick="_loanToggle(\'' + loan.id + '\')">' +
            '<span class="invest-drag-handle" onclick="event.stopPropagation()">⠿</span>' +
            '<span class="loan-type-badge">' + escapeHtml(loan.loanType || 'Loan') + '</span>' +
            '<span class="invest-card-title">' + headerMeta + '</span>' +
            (loan.archived ? '<span class="invest-archived-badge">Archived</span>' : '') +
            '<span class="invest-chevron">' + (isExpanded ? '▾' : '›') + '</span>' +
        '</div>';

    var body = '';
    if (isExpanded) {
        var isRevealed = !!_loanRevealedIds[loan.id];
        var cache      = _loanDecryptCache[loan.id] || {};
        var hasEnc     = loan.accountNumberEnc || loan.usernameEnc || loan.passwordEnc;

        body = '<div class="invest-card-body">';

        if (loan.lender)         body += _loanRow('Lender',        escapeHtml(loan.lender));
        if (loan.inWhoseName)    body += _loanRow('In Whose Name', escapeHtml(loan.inWhoseName));
        if (loan.paymentAddress) body += _loanRow('Payment Address', escapeHtml(loan.paymentAddress).replace(/\n/g, '<br>'));
        if (loan.phone)          body += _loanRow('Phone', '<a href="tel:' + escapeHtml(loan.phone) + '">' + escapeHtml(loan.phone) + '</a>');
        if (loan.monthlyPayment) body += _loanRow('Monthly Payment', '$' + escapeHtml(String(loan.monthlyPayment)));
        if (loan.interestRate)   body += _loanRow('Interest Rate',  escapeHtml(String(loan.interestRate)) + '%');
        if (loan.howItsPaid)     body += _loanRow('How Paid',       escapeHtml(loan.howItsPaid));
        if (loan.startDate)      body += _loanRow('Start Date',     _loanFmtDate(loan.startDate));
        if (loan.payoffDate)     body += _loanRow('Payoff Date',    _loanFmtDate(loan.payoffDate));

        // Calculated fields (only if payoffDate is set)
        var months = _loanMonthsLeft(loan.payoffDate);
        if (months !== null) {
            body += _loanRow('Months Left', String(months));
            if (loan.monthlyPayment) {
                var est = months * parseFloat(String(loan.monthlyPayment).replace(/[^0-9.]/g, ''));
                body +=
                    '<div class="invest-detail-row">' +
                        '<span class="invest-detail-label">Est. Remaining</span>' +
                        '<span class="invest-detail-value">' +
                            '$' + est.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) +
                            ' <span class="loan-calc-tip" title="Includes principal + interest. Not an exact payoff quote — call the lender for that.">ⓘ</span>' +
                        '</span>' +
                    '</div>';
            }
        }

        if (loan.url) {
            body += '<div class="invest-detail-row">' +
                '<span class="invest-detail-label">URL</span>' +
                '<span class="invest-detail-value"><a href="' + escapeHtml(loan.url) + '" target="_blank" rel="noopener">' + escapeHtml(loan.url) + '</a></span>' +
                '</div>';
        }

        // Encrypted fields
        if (hasEnc) {
            body += '<div class="invest-sensitive-box">';
            if (!legacyIsUnlocked()) {
                body += '<div class="invest-sensitive-lock">' +
                    '<span>Sensitive fields are encrypted.</span>' +
                    '<button class="btn btn-secondary btn-small" onclick="event.stopPropagation();_loanReveal(\'' + loan.id + '\')">🔓 Reveal Sensitive Info</button>' +
                    '</div>';
            } else if (!isRevealed) {
                body += '<button class="btn btn-secondary btn-small invest-reveal-btn" onclick="event.stopPropagation();_loanReveal(\'' + loan.id + '\')">🔓 Reveal All</button>';
            } else {
                body += '<button class="btn btn-secondary btn-small invest-reveal-btn" onclick="event.stopPropagation();_loanHide(\'' + loan.id + '\')">🔒 Hide</button>';
                if (loan.accountNumberEnc) body += _loanRow('Account #', '<span class="invest-sensitive-val">' + escapeHtml(cache.accountNumber || '(decrypt failed)') + '</span>');
                if (loan.usernameEnc)      body += _loanRow('Username',  '<span class="invest-sensitive-val">' + escapeHtml(cache.username      || '(decrypt failed)') + '</span>');
                if (loan.passwordEnc)      body += _loanRow('Password',  '<span class="invest-sensitive-val">' + escapeHtml(cache.password      || '(decrypt failed)') + '</span>');
            }
            body += '</div>';
        }

        if (loan.whatToDo) body += _loanRow('Upon My Death', '<span style="white-space:pre-wrap">' + escapeHtml(loan.whatToDo) + '</span>');
        if (loan.notes)    body += _loanRow('Notes',         '<span style="white-space:pre-wrap">' + escapeHtml(loan.notes)    + '</span>');

        body +=
            '<div class="invest-card-actions">' +
                '<button class="btn btn-secondary btn-small" onclick="event.stopPropagation();window.location.hash=\'#legacy/accounts/loans/edit/' + loan.id + '\'">Edit</button>' +
                (loan.archived
                    ? '<button class="btn btn-secondary btn-small" onclick="event.stopPropagation();_loanRestore(\'' + loan.id + '\')">Restore</button>'
                    : '<button class="btn btn-secondary btn-small" onclick="event.stopPropagation();_loanArchive(\'' + loan.id + '\')">Archive</button>') +
            '</div>' +
        '</div>';
    }

    return '<div class="invest-card' +
        (loan.archived ? ' invest-card--archived' : '') +
        (isExpanded    ? ' invest-card--expanded'  : '') +
        '" data-id="' + loan.id + '">' + header + body + '</div>';
}

function _loanRow(label, valueHtml) {
    return '<div class="invest-detail-row">' +
        '<span class="invest-detail-label">' + escapeHtml(label) + '</span>' +
        '<span class="invest-detail-value">' + valueHtml + '</span>' +
        '</div>';
}

function _loanPaymentBadge(howItsPaid) {
    if (!howItsPaid) return null;
    var isAuto = howItsPaid.indexOf('Auto Pay') === 0;
    return { label: isAuto ? 'Auto Pay' : 'Pay Manually', type: isAuto ? 'auto' : 'manual' };
}

function _loanFmtDate(dateStr) {
    if (!dateStr) return '';
    var d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function _loanMonthsLeft(payoffDate) {
    if (!payoffDate) return null;
    var now = new Date();
    var pd  = new Date(payoffDate + 'T00:00:00');
    if (isNaN(pd.getTime())) return null;
    if (pd <= now) return 0;
    var months = (pd.getFullYear() - now.getFullYear()) * 12 + (pd.getMonth() - now.getMonth());
    if (pd.getDate() < now.getDate()) months--;
    return Math.max(0, months);
}

// ---------- Card Interactions ----------

function _loanToggle(id) {
    _loanExpandedIds[id] = !_loanExpandedIds[id];
    if (!_loanExpandedIds[id]) {
        delete _loanRevealedIds[id];
        delete _loanDecryptCache[id];
    }
    _loanRenderList();
}

async function _loanReveal(id) {
    if (!legacyIsUnlocked()) {
        _legacyRequireUnlock(function() { _loanReveal(id); });
        return;
    }
    var loan = _loanLoans.find(function(l) { return l.id === id; });
    if (!loan) return;

    var cache = {};
    try {
        if (loan.accountNumberEnc) cache.accountNumber = await legacyDecrypt(loan.accountNumberEnc) || '';
        if (loan.usernameEnc)      cache.username      = await legacyDecrypt(loan.usernameEnc)      || '';
        if (loan.passwordEnc)      cache.password      = await legacyDecrypt(loan.passwordEnc)      || '';
    } catch (e) { console.error('Loan decrypt error', e); }

    _loanDecryptCache[id] = cache;
    _loanRevealedIds[id]  = true;
    _loanExpandedIds[id]  = true;
    _loanRenderList();
}

function _loanHide(id) {
    delete _loanRevealedIds[id];
    delete _loanDecryptCache[id];
    _loanRenderList();
}

// ---------- Archive / Restore ----------

async function _loanArchive(id) {
    if (!confirm('Archive this loan? It will be hidden from the main list. You can restore it anytime.')) return;
    await _loanCol().doc(id).update({ archived: true });
    delete _loanExpandedIds[id];
    await _loanLoadLoans();
    _loanRenderList();
}

async function _loanRestore(id) {
    await _loanCol().doc(id).update({ archived: false });
    await _loanLoadLoans();
    _loanRenderList();
}

// ---------- Toolbar Interactions ----------

function _loanToggleShowArchived() {
    var chk = document.getElementById('loanShowArchivedChk');
    _loanShowArchived = chk ? chk.checked : false;
    _loanRenderList();
}

async function _loanOnPersonChange() {
    var sel = document.getElementById('loanPersonSel');
    if (sel) _legacyFinPersonFilter = sel.value || 'self';
    await _loanLoadLoans();
    _loanRenderList();
}

// ---------- Drag-to-Reorder ----------

async function _loanOnReorder(evt) {
    if (evt.oldIndex === evt.newIndex) return;
    var list = _loanLoans.filter(function(l) { return _loanShowArchived || !l.archived; });
    var moved = list.splice(evt.oldIndex, 1)[0];
    list.splice(evt.newIndex, 0, moved);

    var batch = firebase.firestore().batch();
    list.forEach(function(loan, i) {
        batch.update(_loanCol().doc(loan.id), { sortOrder: i });
    });
    await batch.commit();
    await _loanLoadLoans();
}

// ---------- Add / Edit Form Page ----------

async function loadLegacyLoansFormPage(id) {
    _loanFormEditId = id || null;
    var isNew = !id;
    var loan  = id ? _loanLoans.find(function(l) { return l.id === id; }) : null;

    if (id && !loan) {
        await _loanLoadPeople();
        await _loanLoadLoans();
        loan = _loanLoans.find(function(l) { return l.id === id; });
    }

    var crumb = document.getElementById('breadcrumbBar');
    if (crumb) {
        crumb.innerHTML =
            '<a href="#life">Life</a><span class="separator">&rsaquo;</span>' +
            '<a href="#legacy">My Legacy</a><span class="separator">&rsaquo;</span>' +
            '<a href="#legacy/accounts">Financial</a><span class="separator">&rsaquo;</span>' +
            '<a href="#legacy/accounts/loans">Loans</a><span class="separator">&rsaquo;</span>' +
            '<span>' + (isNew ? 'Add Loan' : 'Edit Loan') + '</span>';
    }
    document.getElementById('headerTitle').innerHTML =
        '<a href="#main" class="home-link">' + escapeHtml(window.appName || 'My Life') + '</a>';

    var typeDatalist = LOAN_TYPES.map(function(t) {
        return '<option value="' + escapeHtml(t) + '">';
    }).join('');

    var howPaidOpts = LOAN_HOW_PAID.map(function(v) {
        return '<option value="' + escapeHtml(v) + '">' + escapeHtml(v || '— Select —') + '</option>';
    }).join('');

    var page = document.getElementById('page-legacy-loans-form');
    if (!page) return;

    page.innerHTML =
        '<datalist id="loanTypeList">' + typeDatalist + '</datalist>' +
        '<div class="page-header"><h2>' + (isNew ? '+ Add Loan' : 'Edit Loan') + '</h2></div>' +
        '<div class="invest-form">' +

            '<div class="form-group">' +
                '<label>Nickname *</label>' +
                '<input type="text" id="loanFormNickname" placeholder="e.g. Nissan Rogue, Home Mortgage">' +
            '</div>' +
            '<div class="form-group">' +
                '<label>Loan Type</label>' +
                '<input type="text" id="loanFormType" list="loanTypeList" placeholder="e.g. Car Loan, Mortgage">' +
            '</div>' +
            '<div class="form-group">' +
                '<label>Lender (formal name)</label>' +
                '<input type="text" id="loanFormLender" placeholder="e.g. Nissan Motor Acceptance Corp">' +
            '</div>' +
            '<div class="form-group">' +
                '<label>In Whose Name</label>' +
                '<input type="text" id="loanFormWhoseName" placeholder="e.g. Steve, Karen, Joint">' +
            '</div>' +
            '<div class="form-group">' +
                '<label>Payment Address</label>' +
                '<textarea id="loanFormPaymentAddress" rows="2" placeholder="Where to send a check"></textarea>' +
            '</div>' +
            '<div class="form-group">' +
                '<label>Phone</label>' +
                '<input type="tel" id="loanFormPhone" placeholder="Lender customer service number">' +
            '</div>' +
            '<div class="form-group">' +
                '<label>Monthly Payment ($)</label>' +
                '<input type="number" id="loanFormMonthlyPayment" placeholder="e.g. 389.00" step="0.01" min="0">' +
            '</div>' +
            '<div class="form-group">' +
                '<label>Interest Rate (%)</label>' +
                '<input type="number" id="loanFormInterestRate" placeholder="e.g. 4.75" step="0.01" min="0">' +
            '</div>' +
            '<div class="form-group">' +
                '<label>How It\'s Paid</label>' +
                '<select id="loanFormHowPaid">' + howPaidOpts + '</select>' +
            '</div>' +
            '<div class="form-group">' +
                '<label>Loan Start Date</label>' +
                '<input type="date" id="loanFormStartDate">' +
            '</div>' +
            '<div class="form-group">' +
                '<label>Payoff Date</label>' +
                '<input type="date" id="loanFormPayoffDate">' +
            '</div>' +
            '<div class="form-group">' +
                '<label>URL</label>' +
                '<input type="url" id="loanFormUrl" placeholder="https://...">' +
            '</div>' +

            '<div class="invest-form-sensitive-section">' +
                '<div class="invest-modal-sensitive-header">Sensitive Fields</div>' +
                '<div id="loanFormSensitiveContent"></div>' +
            '</div>' +

            '<div class="form-group">' +
                '<label>What to Do Upon My Death</label>' +
                '<textarea id="loanFormWhatToDo" rows="4"' +
                    ' placeholder="e.g. Sell the car and use proceeds to pay off the loan. Contact lender at..."></textarea>' +
            '</div>' +
            '<div class="form-group">' +
                '<label>Notes</label>' +
                '<textarea id="loanFormNotes" rows="3"></textarea>' +
            '</div>' +

            '<div class="invest-form-actions">' +
                '<button class="btn btn-primary" onclick="_loanSaveForm()">Save</button>' +
                '<button class="btn btn-secondary" onclick="_loanCancelForm()">Cancel</button>' +
            '</div>' +
        '</div>';

    var d = _loanFormDraft;
    _loanVal('loanFormNickname',       d ? d.nickname       : (loan ? loan.nickname       || '' : ''));
    _loanVal('loanFormType',           d ? d.loanType       : (loan ? loan.loanType       || '' : ''));
    _loanVal('loanFormLender',         d ? d.lender         : (loan ? loan.lender         || '' : ''));
    _loanVal('loanFormWhoseName',      d ? d.inWhoseName    : (loan ? loan.inWhoseName    || '' : ''));
    _loanVal('loanFormPaymentAddress', d ? d.paymentAddress : (loan ? loan.paymentAddress || '' : ''));
    _loanVal('loanFormPhone',          d ? d.phone          : (loan ? loan.phone          || '' : ''));
    _loanVal('loanFormMonthlyPayment', d ? d.monthlyPayment : (loan ? loan.monthlyPayment || '' : ''));
    _loanVal('loanFormInterestRate',   d ? d.interestRate   : (loan ? loan.interestRate   || '' : ''));
    _loanVal('loanFormHowPaid',        d ? d.howItsPaid     : (loan ? loan.howItsPaid     || '' : ''));
    _loanVal('loanFormStartDate',      d ? d.startDate      : (loan ? loan.startDate      || '' : ''));
    _loanVal('loanFormPayoffDate',     d ? d.payoffDate     : (loan ? loan.payoffDate     || '' : ''));
    _loanVal('loanFormUrl',            d ? d.url            : (loan ? loan.url            || '' : ''));
    _loanVal('loanFormWhatToDo',       d ? d.whatToDo       : (loan ? loan.whatToDo       || '' : ''));
    _loanVal('loanFormNotes',          d ? d.notes          : (loan ? loan.notes          || '' : ''));
    _loanFormDraft = null;

    await _loanRenderSensitiveFields(loan);
}

async function _loanRenderSensitiveFields(loan) {
    var container = document.getElementById('loanFormSensitiveContent');
    if (!container) return;

    if (!legacyIsUnlocked()) {
        container.innerHTML =
            '<div class="invest-modal-lock">' +
                '<span>Enter your Legacy passphrase to edit Account Number, Username, and Password.</span>' +
                '<button class="btn btn-secondary" onclick="_loanUnlockForForm()">🔓 Unlock Sensitive Fields</button>' +
            '</div>';
        return;
    }

    var acctNum = '', uname = '', pwd = '';
    if (loan) {
        try {
            if (loan.accountNumberEnc) acctNum = await legacyDecrypt(loan.accountNumberEnc) || '';
            if (loan.usernameEnc)      uname   = await legacyDecrypt(loan.usernameEnc)      || '';
            if (loan.passwordEnc)      pwd     = await legacyDecrypt(loan.passwordEnc)      || '';
        } catch (e) { console.error('Loan form decrypt error', e); }
    }

    container.innerHTML =
        '<div class="form-group">' +
            '<label>Account Number</label>' +
            '<input type="text" id="loanFormAcctNum" autocomplete="off" placeholder="Loan account number">' +
        '</div>' +
        '<div class="form-group">' +
            '<label>Username</label>' +
            '<input type="text" id="loanFormUsername" autocomplete="off" placeholder="Login username">' +
        '</div>' +
        '<div class="form-group">' +
            '<label>Password</label>' +
            '<input type="text" id="loanFormPassword" autocomplete="off" placeholder="Login password">' +
        '</div>';

    _loanVal('loanFormAcctNum',  acctNum);
    _loanVal('loanFormUsername', uname);
    _loanVal('loanFormPassword', pwd);
}

function _loanUnlockForForm() {
    _loanFormDraft = {
        nickname:       _loanGv('loanFormNickname'),
        loanType:       _loanGv('loanFormType'),
        lender:         _loanGv('loanFormLender'),
        inWhoseName:    _loanGv('loanFormWhoseName'),
        paymentAddress: _loanGv('loanFormPaymentAddress'),
        phone:          _loanGv('loanFormPhone'),
        monthlyPayment: _loanGv('loanFormMonthlyPayment'),
        interestRate:   _loanGv('loanFormInterestRate'),
        howItsPaid:     _loanGv('loanFormHowPaid'),
        startDate:      _loanGv('loanFormStartDate'),
        payoffDate:     _loanGv('loanFormPayoffDate'),
        url:            _loanGv('loanFormUrl'),
        whatToDo:       _loanGv('loanFormWhatToDo'),
        notes:          _loanGv('loanFormNotes')
    };
    _legacyRequireUnlock(function() { loadLegacyLoansFormPage(_loanFormEditId); });
}

async function _loanSaveForm() {
    var nickname = (_loanGv('loanFormNickname') || '').trim();
    if (!nickname) { alert('Please enter a nickname for this loan.'); return; }

    var id    = _loanFormEditId;
    var isNew = !id;

    var data = {
        nickname:       nickname,
        loanType:       (_loanGv('loanFormType')           || '').trim(),
        lender:         (_loanGv('loanFormLender')         || '').trim(),
        inWhoseName:    (_loanGv('loanFormWhoseName')      || '').trim(),
        paymentAddress: (_loanGv('loanFormPaymentAddress') || '').trim(),
        phone:          (_loanGv('loanFormPhone')          || '').trim(),
        monthlyPayment: (_loanGv('loanFormMonthlyPayment') || '').trim(),
        interestRate:   (_loanGv('loanFormInterestRate')   || '').trim(),
        howItsPaid:     (_loanGv('loanFormHowPaid')        || ''),
        startDate:      (_loanGv('loanFormStartDate')      || ''),
        payoffDate:     (_loanGv('loanFormPayoffDate')     || ''),
        url:            (_loanGv('loanFormUrl')            || '').trim(),
        whatToDo:       (_loanGv('loanFormWhatToDo')       || '').trim(),
        notes:          (_loanGv('loanFormNotes')          || '').trim()
    };

    if (legacyIsUnlocked() && document.getElementById('loanFormAcctNum')) {
        var existing   = id ? _loanLoans.find(function(l) { return l.id === id; }) : null;
        var acctNumVal = (_loanGv('loanFormAcctNum')  || '').trim();
        var usernameVal= (_loanGv('loanFormUsername') || '').trim();
        var passwordVal= (_loanGv('loanFormPassword') || '').trim();

        if (acctNumVal) {
            data.accountNumberEnc = await legacyEncrypt(acctNumVal);
        } else if (existing && existing.accountNumberEnc) {
            data.accountNumberEnc = firebase.firestore.FieldValue.delete();
        }
        if (usernameVal) {
            data.usernameEnc = await legacyEncrypt(usernameVal);
        } else if (existing && existing.usernameEnc) {
            data.usernameEnc = firebase.firestore.FieldValue.delete();
        }
        if (passwordVal) {
            data.passwordEnc = await legacyEncrypt(passwordVal);
        } else if (existing && existing.passwordEnc) {
            data.passwordEnc = firebase.firestore.FieldValue.delete();
        }
    }

    if (isNew) {
        data.sortOrder = _loanLoans.filter(function(l) { return !l.archived; }).length;
        data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        await _loanCol().add(data);
    } else {
        await _loanCol().doc(id).update(data);
    }

    _loanFormEditId = null;
    _loanFormDraft  = null;
    window.location.hash = '#legacy/accounts/loans';
}

function _loanCancelForm() {
    _loanFormEditId = null;
    _loanFormDraft  = null;
    window.location.hash = '#legacy/accounts/loans';
}

function _loanVal(id, value) {
    var el = document.getElementById(id);
    if (el) el.value = value !== undefined ? value : '';
}

function _loanGv(id) {
    var el = document.getElementById(id);
    return el ? el.value : '';
}

// ============================================================
// Legacy Financial — Bills
// ============================================================

// ---------- Constants ----------

var BILL_CATEGORIES = [
    'Utilities', 'Insurance', 'Subscriptions', 'Phone / Internet',
    'Medical', 'Mortgage / Rent', 'Car / Transportation', 'Credit Card', 'Other'
];

var BILL_FREQUENCIES = ['', 'Monthly', 'Annual', 'Quarterly', 'Semi-Annual', 'Other'];

// ---------- Module State ----------

var _billBills        = [];
var _billExpandedIds  = {};
var _billShowArchived = false;
var _billFormEditId   = null;
var _billFormDraft    = null;

// ---------- Firestore Path ----------

function _billCol() {
    return userCol('legacyFinancial').doc(_legacyFinPersonFilter).collection('bills');
}

// ---------- Page Loader ----------

function loadLegacyFinancialBillsPage() {
    _legacyRequireUnlock(function() { _billLoadAndRender(); });
}

async function _billLoadAndRender() {
    var crumb = document.getElementById('breadcrumbBar');
    if (crumb) {
        crumb.innerHTML =
            '<a href="#life">Life</a><span class="separator">&rsaquo;</span>' +
            '<a href="#legacy">My Legacy</a><span class="separator">&rsaquo;</span>' +
            '<a href="#legacy/accounts">Financial</a><span class="separator">&rsaquo;</span>' +
            '<span>Bills</span>';
    }
    await _loanLoadPeople();
    await _billLoadBills();
    _billRenderPage();
}

async function _billLoadBills() {
    _billExpandedIds = {};
    var snap = await _billCol().orderBy('sortOrder').get();
    _billBills = [];
    snap.forEach(function(doc) {
        _billBills.push(Object.assign({ id: doc.id }, doc.data()));
    });
}

// ---------- Page Render ----------

function _billRenderPage() {
    var page = document.getElementById('page-legacy-financial-bills');
    if (!page) return;

    var personOpts = '<option value="self"' + (_legacyFinPersonFilter === 'self' ? ' selected' : '') + '>Me</option>';
    _legacyFinPeople.forEach(function(p) {
        personOpts += '<option value="' + escapeHtml(p.id) + '"' +
            (_legacyFinPersonFilter === p.id ? ' selected' : '') + '>' +
            escapeHtml(p.name) + '</option>';
    });

    page.innerHTML =
        '<div class="page-header"><h2>📄 Bills</h2></div>' +
        '<div class="invest-person-row">' +
            '<label class="invest-person-label">Person:</label>' +
            '<select id="billPersonSel" onchange="_billOnPersonChange()">' + personOpts + '</select>' +
        '</div>' +
        '<div class="invest-toolbar">' +
            '<button class="btn btn-primary" onclick="window.location.hash=\'#legacy/accounts/bills/add\'">+ Add Bill</button>' +
            '<label class="loan-archived-toggle">' +
                '<input type="checkbox" id="billShowArchivedChk"' + (_billShowArchived ? ' checked' : '') +
                    ' onchange="_billToggleShowArchived()"> Show Archived' +
            '</label>' +
        '</div>' +
        '<div id="billList"></div>';

    _billRenderList();
}

function _billRenderList() {
    var container = document.getElementById('billList');
    if (!container) return;

    var list = _billBills.filter(function(b) { return _billShowArchived || !b.archived; });

    if (list.length === 0) {
        container.innerHTML = '<div class="empty-state">No bills yet. Add one above.</div>';
        return;
    }

    var html = '<div id="billSortableList">';
    list.forEach(function(bill) { html += _billCardHtml(bill); });
    html += '</div>';
    container.innerHTML = html;

    if (window.Sortable) {
        Sortable.create(document.getElementById('billSortableList'), {
            handle: '.invest-drag-handle',
            animation: 150,
            onEnd: function(evt) { _billOnReorder(evt); }
        });
    }
}

// ---------- Card HTML ----------

function _billCardHtml(bill) {
    var isExpanded = !!_billExpandedIds[bill.id];
    var payBadge   = _loanPaymentBadge(bill.howItsPaid);

    // Collapsed header meta — only filled fields
    var meta = '';
    if (bill.estimatedAmount) meta += '<span class="loan-header-hint"> $' + escapeHtml(String(bill.estimatedAmount));
    if (bill.estimatedAmount && bill.frequency) meta += '/' + _billFreqShort(bill.frequency);
    if (bill.estimatedAmount) meta += '</span>';
    if (payBadge) meta += '<span class="loan-pay-badge loan-pay-badge--' + payBadge.type + '">' + escapeHtml(payBadge.label) + '</span>';
    if (bill.whichCard) meta += '<span class="loan-header-hint"> ' + escapeHtml(bill.whichCard) + '</span>';
    if (bill.dueDate) meta += '<span class="loan-header-hint"> Due: ' + escapeHtml(bill.dueDate) + '</span>';
    if (bill.inWhoseName) meta += '<span class="loan-header-hint"> (' + escapeHtml(bill.inWhoseName) + ')</span>';

    var header =
        '<div class="invest-card-header" onclick="_billToggle(\'' + bill.id + '\')">' +
            '<span class="invest-drag-handle" onclick="event.stopPropagation()">⠿</span>' +
            '<span class="bill-cat-badge">' + escapeHtml(bill.category || 'Bill') + '</span>' +
            '<span class="invest-card-title">' + escapeHtml(bill.name || '(untitled)') + meta + '</span>' +
            (bill.archived ? '<span class="invest-archived-badge">Archived</span>' : '') +
            '<span class="invest-chevron">' + (isExpanded ? '▾' : '›') + '</span>' +
        '</div>';

    var body = '';
    if (isExpanded) {
        body = '<div class="invest-card-body">';

        if (bill.inWhoseName)    body += _billRow('In Whose Name',  escapeHtml(bill.inWhoseName));
        if (bill.estimatedAmount) body += _billRow('Est. Amount',   '$' + escapeHtml(String(bill.estimatedAmount)));
        if (bill.frequency)      body += _billRow('Frequency',      escapeHtml(bill.frequency));
        if (bill.howItsPaid)     body += _billRow('How Paid',       escapeHtml(bill.howItsPaid));
        if (bill.whichCard)      body += _billRow('Which Card / Account', escapeHtml(bill.whichCard));
        if (bill.dueDate)        body += _billRow('Due Date',       escapeHtml(bill.dueDate));
        if (bill.phone)          body += _billRow('Phone', '<a href="tel:' + escapeHtml(bill.phone) + '">' + escapeHtml(bill.phone) + '</a>');
        if (bill.whatToDo)       body += _billRow('Upon My Death',  '<span style="white-space:pre-wrap">' + escapeHtml(bill.whatToDo) + '</span>');
        if (bill.notes)          body += _billRow('Notes',          '<span style="white-space:pre-wrap">' + escapeHtml(bill.notes)    + '</span>');

        body +=
            '<div class="invest-card-actions">' +
                '<button class="btn btn-secondary btn-small" onclick="event.stopPropagation();window.location.hash=\'#legacy/accounts/bills/edit/' + bill.id + '\'">Edit</button>' +
                (bill.archived
                    ? '<button class="btn btn-secondary btn-small" onclick="event.stopPropagation();_billRestore(\'' + bill.id + '\')">Restore</button>'
                    : '<button class="btn btn-secondary btn-small" onclick="event.stopPropagation();_billArchive(\'' + bill.id + '\')">Archive</button>') +
            '</div>' +
        '</div>';
    }

    return '<div class="invest-card' +
        (bill.archived ? ' invest-card--archived' : '') +
        (isExpanded    ? ' invest-card--expanded'  : '') +
        '" data-id="' + bill.id + '">' + header + body + '</div>';
}

function _billRow(label, valueHtml) {
    return '<div class="invest-detail-row">' +
        '<span class="invest-detail-label">' + escapeHtml(label) + '</span>' +
        '<span class="invest-detail-value">' + valueHtml + '</span>' +
        '</div>';
}

function _billFreqShort(freq) {
    var map = { 'Monthly': 'mo', 'Annual': 'yr', 'Quarterly': 'qtr', 'Semi-Annual': 'semi', 'Other': '' };
    return map[freq] || freq.toLowerCase();
}

// ---------- Card Interactions ----------

function _billToggle(id) {
    _billExpandedIds[id] = !_billExpandedIds[id];
    _billRenderList();
}

async function _billArchive(id) {
    if (!confirm('Archive this bill? It will be hidden from the main list. You can restore it anytime.')) return;
    await _billCol().doc(id).update({ archived: true });
    delete _billExpandedIds[id];
    await _billLoadBills();
    _billRenderList();
}

async function _billRestore(id) {
    await _billCol().doc(id).update({ archived: false });
    await _billLoadBills();
    _billRenderList();
}

function _billToggleShowArchived() {
    var chk = document.getElementById('billShowArchivedChk');
    _billShowArchived = chk ? chk.checked : false;
    _billRenderList();
}

async function _billOnPersonChange() {
    var sel = document.getElementById('billPersonSel');
    if (sel) _legacyFinPersonFilter = sel.value || 'self';
    await _billLoadBills();
    _billRenderList();
}

async function _billOnReorder(evt) {
    if (evt.oldIndex === evt.newIndex) return;
    var list = _billBills.filter(function(b) { return _billShowArchived || !b.archived; });
    var moved = list.splice(evt.oldIndex, 1)[0];
    list.splice(evt.newIndex, 0, moved);

    var batch = firebase.firestore().batch();
    list.forEach(function(bill, i) {
        batch.update(_billCol().doc(bill.id), { sortOrder: i });
    });
    await batch.commit();
    await _billLoadBills();
}

// ---------- Add / Edit Form Page ----------

async function loadLegacyBillsFormPage(id) {
    _billFormEditId = id || null;
    var isNew = !id;
    var bill  = id ? _billBills.find(function(b) { return b.id === id; }) : null;

    if (id && !bill) {
        await _loanLoadPeople();
        await _billLoadBills();
        bill = _billBills.find(function(b) { return b.id === id; });
    }

    var crumb = document.getElementById('breadcrumbBar');
    if (crumb) {
        crumb.innerHTML =
            '<a href="#life">Life</a><span class="separator">&rsaquo;</span>' +
            '<a href="#legacy">My Legacy</a><span class="separator">&rsaquo;</span>' +
            '<a href="#legacy/accounts">Financial</a><span class="separator">&rsaquo;</span>' +
            '<a href="#legacy/accounts/bills">Bills</a><span class="separator">&rsaquo;</span>' +
            '<span>' + (isNew ? 'Add Bill' : 'Edit Bill') + '</span>';
    }
    document.getElementById('headerTitle').innerHTML =
        '<a href="#main" class="home-link">' + escapeHtml(window.appName || 'My Life') + '</a>';

    var catDatalist = BILL_CATEGORIES.map(function(c) {
        return '<option value="' + escapeHtml(c) + '">';
    }).join('');

    var freqOpts = BILL_FREQUENCIES.map(function(f) {
        return '<option value="' + escapeHtml(f) + '">' + escapeHtml(f || '— Select —') + '</option>';
    }).join('');

    var howPaidOpts = LOAN_HOW_PAID.map(function(v) {
        return '<option value="' + escapeHtml(v) + '">' + escapeHtml(v || '— Select —') + '</option>';
    }).join('');

    var page = document.getElementById('page-legacy-bills-form');
    if (!page) return;

    page.innerHTML =
        '<datalist id="billCatList">' + catDatalist + '</datalist>' +
        '<div class="page-header"><h2>' + (isNew ? '+ Add Bill' : 'Edit Bill') + '</h2></div>' +
        '<div class="invest-form">' +

            '<div class="form-group">' +
                '<label>Name *</label>' +
                '<input type="text" id="billFormName" placeholder="e.g. Xcel Energy, Netflix, Home Mortgage">' +
            '</div>' +
            '<div class="form-group">' +
                '<label>Category</label>' +
                '<input type="text" id="billFormCategory" list="billCatList" placeholder="e.g. Utilities, Insurance">' +
            '</div>' +
            '<div class="form-group">' +
                '<label>In Whose Name</label>' +
                '<input type="text" id="billFormWhoseName" placeholder="e.g. Steve, Karen, Joint">' +
            '</div>' +
            '<div class="form-group">' +
                '<label>Estimated Amount ($)</label>' +
                '<input type="number" id="billFormAmount" placeholder="e.g. 180.00" step="0.01" min="0">' +
            '</div>' +
            '<div class="form-group">' +
                '<label>Frequency</label>' +
                '<select id="billFormFrequency">' + freqOpts + '</select>' +
            '</div>' +
            '<div class="form-group">' +
                '<label>How It\'s Paid</label>' +
                '<select id="billFormHowPaid">' + howPaidOpts + '</select>' +
            '</div>' +
            '<div class="form-group">' +
                '<label>Which Card / Account</label>' +
                '<input type="text" id="billFormWhichCard" placeholder="e.g. Chase Visa ending 4321">' +
            '</div>' +
            '<div class="form-group">' +
                '<label>Due Date</label>' +
                '<input type="text" id="billFormDueDate" placeholder="e.g. 15th, March each year, 1st of month">' +
            '</div>' +
            '<div class="form-group">' +
                '<label>Address</label>' +
                '<textarea id="billFormAddress" rows="2" placeholder="Where to send a check if needed"></textarea>' +
            '</div>' +
            '<div class="form-group">' +
                '<label>Phone</label>' +
                '<input type="tel" id="billFormPhone" placeholder="Customer service number">' +
            '</div>' +
            '<div class="form-group">' +
                '<label>URL</label>' +
                '<input type="url" id="billFormUrl" placeholder="https://...">' +
            '</div>' +

            '<div class="invest-form-sensitive-section">' +
                '<div class="invest-modal-sensitive-header">Sensitive Fields</div>' +
                '<div id="billFormSensitiveContent"></div>' +
            '</div>' +

            '<div class="form-group">' +
                '<label>What to Do Upon My Death</label>' +
                '<textarea id="billFormWhatToDo" rows="4"' +
                    ' placeholder="e.g. Cancel this subscription. Call 800-xxx-xxxx to cancel."></textarea>' +
            '</div>' +
            '<div class="form-group">' +
                '<label>Notes</label>' +
                '<textarea id="billFormNotes" rows="3"></textarea>' +
            '</div>' +

            '<div class="invest-form-actions">' +
                '<button class="btn btn-primary" onclick="_billSaveForm()">Save</button>' +
                '<button class="btn btn-secondary" onclick="_billCancelForm()">Cancel</button>' +
            '</div>' +
        '</div>';

    var d = _billFormDraft;
    _billVal('billFormName',      d ? d.name         : (bill ? bill.name         || '' : ''));
    _billVal('billFormCategory',  d ? d.category     : (bill ? bill.category     || '' : ''));
    _billVal('billFormWhoseName', d ? d.inWhoseName  : (bill ? bill.inWhoseName  || '' : ''));
    _billVal('billFormAmount',    d ? d.estimatedAmount : (bill ? bill.estimatedAmount || '' : ''));
    _billVal('billFormFrequency', d ? d.frequency    : (bill ? bill.frequency    || '' : ''));
    _billVal('billFormHowPaid',   d ? d.howItsPaid   : (bill ? bill.howItsPaid   || '' : ''));
    _billVal('billFormWhichCard', d ? d.whichCard    : (bill ? bill.whichCard    || '' : ''));
    _billVal('billFormDueDate',   d ? d.dueDate      : (bill ? bill.dueDate      || '' : ''));
    _billVal('billFormAddress',   d ? d.address      : (bill ? bill.address      || '' : ''));
    _billVal('billFormPhone',     d ? d.phone        : (bill ? bill.phone        || '' : ''));
    _billVal('billFormUrl',       d ? d.url          : (bill ? bill.url          || '' : ''));
    _billVal('billFormWhatToDo',  d ? d.whatToDo     : (bill ? bill.whatToDo     || '' : ''));
    _billVal('billFormNotes',     d ? d.notes        : (bill ? bill.notes        || '' : ''));
    _billFormDraft = null;

    await _billRenderSensitiveFields(bill);
}

async function _billRenderSensitiveFields(bill) {
    var container = document.getElementById('billFormSensitiveContent');
    if (!container) return;

    if (!legacyIsUnlocked()) {
        container.innerHTML =
            '<div class="invest-modal-lock">' +
                '<span>Enter your Legacy passphrase to edit Account Number, Username, and Password.</span>' +
                '<button class="btn btn-secondary" onclick="_billUnlockForForm()">🔓 Unlock Sensitive Fields</button>' +
            '</div>';
        return;
    }

    var acctNum = '', uname = '', pwd = '';
    if (bill) {
        try {
            if (bill.accountNumberEnc) acctNum = await legacyDecrypt(bill.accountNumberEnc) || '';
            if (bill.usernameEnc)      uname   = await legacyDecrypt(bill.usernameEnc)      || '';
            if (bill.passwordEnc)      pwd     = await legacyDecrypt(bill.passwordEnc)      || '';
        } catch (e) { console.error('Bill form decrypt error', e); }
    }

    container.innerHTML =
        '<div class="form-group">' +
            '<label>Account Number</label>' +
            '<input type="text" id="billFormAcctNum" autocomplete="off" placeholder="Account number">' +
        '</div>' +
        '<div class="form-group">' +
            '<label>Username</label>' +
            '<input type="text" id="billFormUsername" autocomplete="off" placeholder="Login username">' +
        '</div>' +
        '<div class="form-group">' +
            '<label>Password</label>' +
            '<input type="text" id="billFormPassword" autocomplete="off" placeholder="Login password">' +
        '</div>';

    _billVal('billFormAcctNum',  acctNum);
    _billVal('billFormUsername', uname);
    _billVal('billFormPassword', pwd);
}

function _billUnlockForForm() {
    _billFormDraft = {
        name:            _billGv('billFormName'),
        category:        _billGv('billFormCategory'),
        inWhoseName:     _billGv('billFormWhoseName'),
        estimatedAmount: _billGv('billFormAmount'),
        frequency:       _billGv('billFormFrequency'),
        howItsPaid:      _billGv('billFormHowPaid'),
        whichCard:       _billGv('billFormWhichCard'),
        dueDate:         _billGv('billFormDueDate'),
        address:         _billGv('billFormAddress'),
        phone:           _billGv('billFormPhone'),
        url:             _billGv('billFormUrl'),
        whatToDo:        _billGv('billFormWhatToDo'),
        notes:           _billGv('billFormNotes')
    };
    _legacyRequireUnlock(function() { loadLegacyBillsFormPage(_billFormEditId); });
}

async function _billSaveForm() {
    var name = (_billGv('billFormName') || '').trim();
    if (!name) { alert('Please enter a name for this bill.'); return; }

    var id    = _billFormEditId;
    var isNew = !id;

    var data = {
        name:            name,
        category:        (_billGv('billFormCategory')   || '').trim(),
        inWhoseName:     (_billGv('billFormWhoseName')  || '').trim(),
        estimatedAmount: (_billGv('billFormAmount')     || '').trim(),
        frequency:       (_billGv('billFormFrequency')  || ''),
        howItsPaid:      (_billGv('billFormHowPaid')    || ''),
        whichCard:       (_billGv('billFormWhichCard')  || '').trim(),
        dueDate:         (_billGv('billFormDueDate')    || '').trim(),
        address:         (_billGv('billFormAddress')    || '').trim(),
        phone:           (_billGv('billFormPhone')      || '').trim(),
        url:             (_billGv('billFormUrl')        || '').trim(),
        whatToDo:        (_billGv('billFormWhatToDo')   || '').trim(),
        notes:           (_billGv('billFormNotes')      || '').trim()
    };

    if (legacyIsUnlocked() && document.getElementById('billFormAcctNum')) {
        var existing    = id ? _billBills.find(function(b) { return b.id === id; }) : null;
        var acctNumVal  = (_billGv('billFormAcctNum')  || '').trim();
        var usernameVal = (_billGv('billFormUsername') || '').trim();
        var passwordVal = (_billGv('billFormPassword') || '').trim();

        if (acctNumVal) {
            data.accountNumberEnc = await legacyEncrypt(acctNumVal);
        } else if (existing && existing.accountNumberEnc) {
            data.accountNumberEnc = firebase.firestore.FieldValue.delete();
        }
        if (usernameVal) {
            data.usernameEnc = await legacyEncrypt(usernameVal);
        } else if (existing && existing.usernameEnc) {
            data.usernameEnc = firebase.firestore.FieldValue.delete();
        }
        if (passwordVal) {
            data.passwordEnc = await legacyEncrypt(passwordVal);
        } else if (existing && existing.passwordEnc) {
            data.passwordEnc = firebase.firestore.FieldValue.delete();
        }
    }

    if (isNew) {
        data.sortOrder = _billBills.filter(function(b) { return !b.archived; }).length;
        data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        await _billCol().add(data);
    } else {
        await _billCol().doc(id).update(data);
    }

    _billFormEditId = null;
    _billFormDraft  = null;
    window.location.hash = '#legacy/accounts/bills';
}

function _billCancelForm() {
    _billFormEditId = null;
    _billFormDraft  = null;
    window.location.hash = '#legacy/accounts/bills';
}

function _billVal(id, value) {
    var el = document.getElementById(id);
    if (el) el.value = value !== undefined ? value : '';
}

function _billGv(id) {
    var el = document.getElementById(id);
    return el ? el.value : '';
}

// ============================================================
// Legacy Financial — Insurance
// ============================================================

// ---------- Constants ----------

var INSURANCE_POLICY_TYPES = [
    'Term Life', 'Whole Life', 'Universal Life', 'Group / Employer', 'Other'
];

// ---------- Module State ----------

var _insurPolicies      = [];
var _insurExpandedIds   = {};
var _insurShowArchived  = false;
var _insurFormEditId    = null;
var _insurFormDraft     = null;

// ---------- Firestore Path ----------

function _insurCol() {
    return userCol('legacyFinancial').doc(_legacyFinPersonFilter).collection('insurance');
}

// ---------- Page Loader ----------

function loadLegacyFinancialInsurancePage() {
    _legacyRequireUnlock(function() { _insurLoadAndRender(); });
}

async function _insurLoadAndRender() {
    var crumb = document.getElementById('breadcrumbBar');
    if (crumb) {
        crumb.innerHTML =
            '<a href="#life">Life</a><span class="separator">&rsaquo;</span>' +
            '<a href="#legacy">My Legacy</a><span class="separator">&rsaquo;</span>' +
            '<a href="#legacy/accounts">Financial</a><span class="separator">&rsaquo;</span>' +
            '<span>Insurance</span>';
    }
    await _loanLoadPeople();
    await _insurLoadPolicies();
    _insurRenderPage();
}

async function _insurLoadPolicies() {
    _insurExpandedIds = {};
    var snap = await _insurCol().orderBy('sortOrder').get();
    _insurPolicies = [];
    snap.forEach(function(doc) {
        _insurPolicies.push(Object.assign({ id: doc.id }, doc.data()));
    });
}

// ---------- Page Render ----------

function _insurRenderPage() {
    var page = document.getElementById('page-legacy-financial-insurance');
    if (!page) return;

    var personOpts = '<option value="self"' + (_legacyFinPersonFilter === 'self' ? ' selected' : '') + '>Me</option>';
    _legacyFinPeople.forEach(function(p) {
        personOpts += '<option value="' + escapeHtml(p.id) + '"' +
            (_legacyFinPersonFilter === p.id ? ' selected' : '') + '>' +
            escapeHtml(p.name) + '</option>';
    });

    page.innerHTML =
        '<div class="page-header"><h2>🛡️ Insurance</h2></div>' +
        '<div class="invest-person-row">' +
            '<label class="invest-person-label">Person:</label>' +
            '<select id="insurPersonSel" onchange="_insurOnPersonChange()">' + personOpts + '</select>' +
        '</div>' +
        '<div class="invest-toolbar">' +
            '<button class="btn btn-primary" onclick="window.location.hash=\'#legacy/accounts/insurance/add\'">+ Add Policy</button>' +
            '<label class="loan-archived-toggle">' +
                '<input type="checkbox" id="insurShowArchivedChk"' + (_insurShowArchived ? ' checked' : '') +
                    ' onchange="_insurToggleShowArchived()"> Show Archived' +
            '</label>' +
        '</div>' +
        '<div id="insurList"></div>';

    _insurRenderList();
}

function _insurRenderList() {
    var container = document.getElementById('insurList');
    if (!container) return;

    var list = _insurPolicies.filter(function(p) { return _insurShowArchived || !p.archived; });

    if (list.length === 0) {
        container.innerHTML = '<div class="empty-state">No policies yet. Add one above.</div>';
        return;
    }

    var html = '<div id="insurSortableList">';
    list.forEach(function(policy) { html += _insurCardHtml(policy); });
    html += '</div>';
    container.innerHTML = html;

    if (window.Sortable) {
        Sortable.create(document.getElementById('insurSortableList'), {
            handle: '.invest-drag-handle',
            animation: 150,
            onEnd: function(evt) { _insurOnReorder(evt); }
        });
    }
}

// ---------- Card HTML ----------

function _insurCardHtml(policy) {
    var isExpanded = !!_insurExpandedIds[policy.id];

    // Collapsed header
    var meta = escapeHtml(policy.companyName || '(untitled)');
    if (policy.coverageAmount) meta += '<span class="loan-header-hint"> ' + escapeHtml(policy.coverageAmount) + '</span>';

    var header =
        '<div class="invest-card-header" onclick="_insurToggle(\'' + policy.id + '\')">' +
            '<span class="invest-drag-handle" onclick="event.stopPropagation()">⠿</span>' +
            '<span class="insur-type-badge">' + escapeHtml(policy.policyType || 'Policy') + '</span>' +
            '<span class="invest-card-title">' + meta + '</span>' +
            (policy.archived ? '<span class="invest-archived-badge">Archived</span>' : '') +
            '<span class="invest-chevron">' + (isExpanded ? '▾' : '›') + '</span>' +
        '</div>';

    var body = '';
    if (isExpanded) {
        body = '<div class="invest-card-body">';

        if (policy.policyNumber)    body += _insurRow('Policy #',         escapeHtml(policy.policyNumber));
        if (policy.coverageAmount)  body += _insurRow('Coverage Amount',  escapeHtml(policy.coverageAmount));
        if (policy.beneficiary)     body += _insurRow('Beneficiary',      escapeHtml(policy.beneficiary));
        if (policy.agentName)       body += _insurRow('Agent',            escapeHtml(policy.agentName));
        if (policy.agentPhone)      body += _insurRow('Agent Phone', '<a href="tel:' + escapeHtml(policy.agentPhone) + '">' + escapeHtml(policy.agentPhone) + '</a>');
        if (policy.phone)           body += _insurRow('Claims Phone', '<a href="tel:' + escapeHtml(policy.phone) + '">' + escapeHtml(policy.phone) + '</a>');
        if (policy.paperLocation)   body += _insurRow('Paper Policy',     escapeHtml(policy.paperLocation));
        if (policy.premiumAmount || policy.premiumFrequency) {
            var prem = '';
            if (policy.premiumAmount)    prem += '$' + escapeHtml(String(policy.premiumAmount));
            if (policy.premiumFrequency) prem += (prem ? ' · ' : '') + escapeHtml(policy.premiumFrequency);
            body += _insurRow('Premium', prem);
        }
        if (policy.whatToDo)        body += _insurRow('How to File / What to Do', '<span style="white-space:pre-wrap">' + escapeHtml(policy.whatToDo) + '</span>');
        if (policy.notes)           body += _insurRow('Notes', '<span style="white-space:pre-wrap">' + escapeHtml(policy.notes) + '</span>');

        body +=
            '<div class="invest-card-actions">' +
                '<button class="btn btn-secondary btn-small" onclick="event.stopPropagation();window.location.hash=\'#legacy/accounts/insurance/edit/' + policy.id + '\'">Edit</button>' +
                (policy.archived
                    ? '<button class="btn btn-secondary btn-small" onclick="event.stopPropagation();_insurRestore(\'' + policy.id + '\')">Restore</button>'
                    : '<button class="btn btn-secondary btn-small" onclick="event.stopPropagation();_insurArchive(\'' + policy.id + '\')">Archive</button>') +
            '</div>' +
        '</div>';
    }

    return '<div class="invest-card' +
        (policy.archived ? ' invest-card--archived' : '') +
        (isExpanded      ? ' invest-card--expanded'  : '') +
        '" data-id="' + policy.id + '">' + header + body + '</div>';
}

function _insurRow(label, valueHtml) {
    return '<div class="invest-detail-row">' +
        '<span class="invest-detail-label">' + escapeHtml(label) + '</span>' +
        '<span class="invest-detail-value">' + valueHtml + '</span>' +
        '</div>';
}

// ---------- Card Interactions ----------

function _insurToggle(id) {
    _insurExpandedIds[id] = !_insurExpandedIds[id];
    _insurRenderList();
}

async function _insurArchive(id) {
    if (!confirm('Archive this policy? It will be hidden from the main list. You can restore it anytime.')) return;
    await _insurCol().doc(id).update({ archived: true });
    delete _insurExpandedIds[id];
    await _insurLoadPolicies();
    _insurRenderList();
}

async function _insurRestore(id) {
    await _insurCol().doc(id).update({ archived: false });
    await _insurLoadPolicies();
    _insurRenderList();
}

function _insurToggleShowArchived() {
    var chk = document.getElementById('insurShowArchivedChk');
    _insurShowArchived = chk ? chk.checked : false;
    _insurRenderList();
}

async function _insurOnPersonChange() {
    var sel = document.getElementById('insurPersonSel');
    if (sel) _legacyFinPersonFilter = sel.value || 'self';
    await _insurLoadPolicies();
    _insurRenderList();
}

async function _insurOnReorder(evt) {
    if (evt.oldIndex === evt.newIndex) return;
    var list = _insurPolicies.filter(function(p) { return _insurShowArchived || !p.archived; });
    var moved = list.splice(evt.oldIndex, 1)[0];
    list.splice(evt.newIndex, 0, moved);

    var batch = firebase.firestore().batch();
    list.forEach(function(policy, i) {
        batch.update(_insurCol().doc(policy.id), { sortOrder: i });
    });
    await batch.commit();
    await _insurLoadPolicies();
}

// ---------- Add / Edit Form Page ----------

async function loadLegacyInsuranceFormPage(id) {
    _insurFormEditId = id || null;
    var isNew   = !id;
    var policy  = id ? _insurPolicies.find(function(p) { return p.id === id; }) : null;

    if (id && !policy) {
        await _loanLoadPeople();
        await _insurLoadPolicies();
        policy = _insurPolicies.find(function(p) { return p.id === id; });
    }

    var crumb = document.getElementById('breadcrumbBar');
    if (crumb) {
        crumb.innerHTML =
            '<a href="#life">Life</a><span class="separator">&rsaquo;</span>' +
            '<a href="#legacy">My Legacy</a><span class="separator">&rsaquo;</span>' +
            '<a href="#legacy/accounts">Financial</a><span class="separator">&rsaquo;</span>' +
            '<a href="#legacy/accounts/insurance">Insurance</a><span class="separator">&rsaquo;</span>' +
            '<span>' + (isNew ? 'Add Policy' : 'Edit Policy') + '</span>';
    }
    document.getElementById('headerTitle').innerHTML =
        '<a href="#main" class="home-link">' + escapeHtml(window.appName || 'My Life') + '</a>';

    var typeDatalist = INSURANCE_POLICY_TYPES.map(function(t) {
        return '<option value="' + escapeHtml(t) + '">';
    }).join('');

    var freqOpts = BILL_FREQUENCIES.map(function(f) {
        return '<option value="' + escapeHtml(f) + '">' + escapeHtml(f || '— Select —') + '</option>';
    }).join('');

    var page = document.getElementById('page-legacy-insurance-form');
    if (!page) return;

    page.innerHTML =
        '<datalist id="insurTypeList">' + typeDatalist + '</datalist>' +
        '<div class="page-header"><h2>' + (isNew ? '+ Add Policy' : 'Edit Policy') + '</h2></div>' +
        '<div class="invest-form">' +

            '<div class="form-group">' +
                '<label>Company Name *</label>' +
                '<input type="text" id="insurFormCompany" placeholder="e.g. Northwestern Mutual, MetLife">' +
            '</div>' +
            '<div class="form-group">' +
                '<label>Policy Type</label>' +
                '<input type="text" id="insurFormType" list="insurTypeList" placeholder="e.g. Term Life, Whole Life">' +
            '</div>' +
            '<div class="form-group">' +
                '<label>Policy Number</label>' +
                '<input type="text" id="insurFormPolicyNum" placeholder="Policy number">' +
            '</div>' +
            '<div class="form-group">' +
                '<label>Coverage Amount</label>' +
                '<input type="text" id="insurFormCoverage" placeholder="e.g. $500,000">' +
            '</div>' +
            '<div class="form-group">' +
                '<label>Beneficiary(ies)</label>' +
                '<input type="text" id="insurFormBeneficiary" placeholder="Who gets paid, and in what split">' +
            '</div>' +
            '<div class="form-group">' +
                '<label>Agent Name</label>' +
                '<input type="text" id="insurFormAgentName" placeholder="Your personal insurance agent">' +
            '</div>' +
            '<div class="form-group">' +
                '<label>Agent Phone</label>' +
                '<input type="tel" id="insurFormAgentPhone" placeholder="Agent direct line">' +
            '</div>' +
            '<div class="form-group">' +
                '<label>Claims Phone</label>' +
                '<input type="tel" id="insurFormPhone" placeholder="General claims department">' +
            '</div>' +
            '<div class="form-group">' +
                '<label>Where Is the Paper Policy</label>' +
                '<input type="text" id="insurFormPaperLocation" placeholder="e.g. Filing cabinet, folder labeled Insurance">' +
            '</div>' +
            '<div class="form-group">' +
                '<label>Premium Amount ($)</label>' +
                '<input type="number" id="insurFormPremiumAmount" placeholder="e.g. 120.00" step="0.01" min="0">' +
            '</div>' +
            '<div class="form-group">' +
                '<label>Premium Frequency</label>' +
                '<select id="insurFormPremiumFreq">' + freqOpts + '</select>' +
            '</div>' +
            '<div class="form-group">' +
                '<label>Address</label>' +
                '<textarea id="insurFormAddress" rows="2" placeholder="Mailing address"></textarea>' +
            '</div>' +
            '<div class="form-group">' +
                '<label>URL</label>' +
                '<input type="url" id="insurFormUrl" placeholder="https://...">' +
            '</div>' +

            '<div class="invest-form-sensitive-section">' +
                '<div class="invest-modal-sensitive-header">Sensitive Fields</div>' +
                '<div id="insurFormSensitiveContent"></div>' +
            '</div>' +

            '<div class="form-group">' +
                '<label>How to File a Claim / What to Do</label>' +
                '<textarea id="insurFormWhatToDo" rows="5"' +
                    ' placeholder="e.g. Call agent first. Then call claims at 800-xxx-xxxx. Have policy number ready. Expect 2–4 weeks for payout."></textarea>' +
            '</div>' +
            '<div class="form-group">' +
                '<label>Notes</label>' +
                '<textarea id="insurFormNotes" rows="3"></textarea>' +
            '</div>' +

            '<div class="invest-form-actions">' +
                '<button class="btn btn-primary" onclick="_insurSaveForm()">Save</button>' +
                '<button class="btn btn-secondary" onclick="_insurCancelForm()">Cancel</button>' +
            '</div>' +
        '</div>';

    var d = _insurFormDraft;
    _insurVal('insurFormCompany',       d ? d.companyName      : (policy ? policy.companyName      || '' : ''));
    _insurVal('insurFormType',          d ? d.policyType       : (policy ? policy.policyType       || '' : ''));
    _insurVal('insurFormPolicyNum',     d ? d.policyNumber     : (policy ? policy.policyNumber     || '' : ''));
    _insurVal('insurFormCoverage',      d ? d.coverageAmount   : (policy ? policy.coverageAmount   || '' : ''));
    _insurVal('insurFormBeneficiary',   d ? d.beneficiary      : (policy ? policy.beneficiary      || '' : ''));
    _insurVal('insurFormAgentName',     d ? d.agentName        : (policy ? policy.agentName        || '' : ''));
    _insurVal('insurFormAgentPhone',    d ? d.agentPhone       : (policy ? policy.agentPhone       || '' : ''));
    _insurVal('insurFormPhone',         d ? d.phone            : (policy ? policy.phone            || '' : ''));
    _insurVal('insurFormPaperLocation', d ? d.paperLocation    : (policy ? policy.paperLocation    || '' : ''));
    _insurVal('insurFormPremiumAmount', d ? d.premiumAmount    : (policy ? policy.premiumAmount    || '' : ''));
    _insurVal('insurFormPremiumFreq',   d ? d.premiumFrequency : (policy ? policy.premiumFrequency || '' : ''));
    _insurVal('insurFormAddress',       d ? d.address          : (policy ? policy.address          || '' : ''));
    _insurVal('insurFormUrl',           d ? d.url              : (policy ? policy.url              || '' : ''));
    _insurVal('insurFormWhatToDo',      d ? d.whatToDo         : (policy ? policy.whatToDo         || '' : ''));
    _insurVal('insurFormNotes',         d ? d.notes            : (policy ? policy.notes            || '' : ''));
    _insurFormDraft = null;

    await _insurRenderSensitiveFields(policy);
}

async function _insurRenderSensitiveFields(policy) {
    var container = document.getElementById('insurFormSensitiveContent');
    if (!container) return;

    if (!legacyIsUnlocked()) {
        container.innerHTML =
            '<div class="invest-modal-lock">' +
                '<span>Enter your Legacy passphrase to edit Username and Password.</span>' +
                '<button class="btn btn-secondary" onclick="_insurUnlockForForm()">🔓 Unlock Sensitive Fields</button>' +
            '</div>';
        return;
    }

    var uname = '', pwd = '';
    if (policy) {
        try {
            if (policy.usernameEnc) uname = await legacyDecrypt(policy.usernameEnc) || '';
            if (policy.passwordEnc) pwd   = await legacyDecrypt(policy.passwordEnc) || '';
        } catch (e) { console.error('Insurance form decrypt error', e); }
    }

    container.innerHTML =
        '<div class="form-group">' +
            '<label>Username</label>' +
            '<input type="text" id="insurFormUsername" autocomplete="off" placeholder="Online portal username">' +
        '</div>' +
        '<div class="form-group">' +
            '<label>Password</label>' +
            '<input type="text" id="insurFormPassword" autocomplete="off" placeholder="Online portal password">' +
        '</div>';

    _insurVal('insurFormUsername', uname);
    _insurVal('insurFormPassword', pwd);
}

function _insurUnlockForForm() {
    _insurFormDraft = {
        companyName:      _insurGv('insurFormCompany'),
        policyType:       _insurGv('insurFormType'),
        policyNumber:     _insurGv('insurFormPolicyNum'),
        coverageAmount:   _insurGv('insurFormCoverage'),
        beneficiary:      _insurGv('insurFormBeneficiary'),
        agentName:        _insurGv('insurFormAgentName'),
        agentPhone:       _insurGv('insurFormAgentPhone'),
        phone:            _insurGv('insurFormPhone'),
        paperLocation:    _insurGv('insurFormPaperLocation'),
        premiumAmount:    _insurGv('insurFormPremiumAmount'),
        premiumFrequency: _insurGv('insurFormPremiumFreq'),
        address:          _insurGv('insurFormAddress'),
        url:              _insurGv('insurFormUrl'),
        whatToDo:         _insurGv('insurFormWhatToDo'),
        notes:            _insurGv('insurFormNotes')
    };
    _legacyRequireUnlock(function() { loadLegacyInsuranceFormPage(_insurFormEditId); });
}

async function _insurSaveForm() {
    var companyName = (_insurGv('insurFormCompany') || '').trim();
    if (!companyName) { alert('Please enter the insurance company name.'); return; }

    var id    = _insurFormEditId;
    var isNew = !id;

    var data = {
        companyName:      companyName,
        policyType:       (_insurGv('insurFormType')          || '').trim(),
        policyNumber:     (_insurGv('insurFormPolicyNum')     || '').trim(),
        coverageAmount:   (_insurGv('insurFormCoverage')      || '').trim(),
        beneficiary:      (_insurGv('insurFormBeneficiary')   || '').trim(),
        agentName:        (_insurGv('insurFormAgentName')     || '').trim(),
        agentPhone:       (_insurGv('insurFormAgentPhone')    || '').trim(),
        phone:            (_insurGv('insurFormPhone')         || '').trim(),
        paperLocation:    (_insurGv('insurFormPaperLocation') || '').trim(),
        premiumAmount:    (_insurGv('insurFormPremiumAmount') || '').trim(),
        premiumFrequency: (_insurGv('insurFormPremiumFreq')   || ''),
        address:          (_insurGv('insurFormAddress')       || '').trim(),
        url:              (_insurGv('insurFormUrl')           || '').trim(),
        whatToDo:         (_insurGv('insurFormWhatToDo')      || '').trim(),
        notes:            (_insurGv('insurFormNotes')         || '').trim()
    };

    if (legacyIsUnlocked() && document.getElementById('insurFormUsername')) {
        var existing    = id ? _insurPolicies.find(function(p) { return p.id === id; }) : null;
        var usernameVal = (_insurGv('insurFormUsername') || '').trim();
        var passwordVal = (_insurGv('insurFormPassword') || '').trim();

        if (usernameVal) {
            data.usernameEnc = await legacyEncrypt(usernameVal);
        } else if (existing && existing.usernameEnc) {
            data.usernameEnc = firebase.firestore.FieldValue.delete();
        }
        if (passwordVal) {
            data.passwordEnc = await legacyEncrypt(passwordVal);
        } else if (existing && existing.passwordEnc) {
            data.passwordEnc = firebase.firestore.FieldValue.delete();
        }
    }

    if (isNew) {
        data.sortOrder = _insurPolicies.filter(function(p) { return !p.archived; }).length;
        data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        await _insurCol().add(data);
    } else {
        await _insurCol().doc(id).update(data);
    }

    _insurFormEditId = null;
    _insurFormDraft  = null;
    window.location.hash = '#legacy/accounts/insurance';
}

function _insurCancelForm() {
    _insurFormEditId = null;
    _insurFormDraft  = null;
    window.location.hash = '#legacy/accounts/insurance';
}

function _insurVal(id, value) {
    var el = document.getElementById(id);
    if (el) el.value = value !== undefined ? value : '';
}

function _insurGv(id) {
    var el = document.getElementById(id);
    return el ? el.value : '';
}

// ============================================================
// Legacy Financial — Financial Plan
// Narrative sections written by the user as a guide for loved ones.
// Stored as fields on the top-level legacyFinancial/{personId} doc.
// No encryption — narrative text, not credentials.
// ============================================================

var _planPersonFilter = 'self';
var _planPeople       = [];
var _planSaveTimers   = {};  // debounce timers keyed by field id

var PLAN_SECTIONS = [
    {
        id:     'planBigPicture',
        label:  'The Big Picture',
        prompt: 'What should your loved one know about your overall financial situation? Are things in good shape? Any major complications or concerns they should know upfront?',
        rows:   8,
        voice:  true
    },
    {
        id:     'planFirstThings',
        label:  'First Things — What to Do',
        prompt: 'In the first week or two, what should they focus on? What bills auto-pay and can wait? What will stop if no one acts? Who should they call before making any big decisions?',
        rows:   8,
        voice:  true
    },
    {
        id:     'planKeyPeople',
        label:  'Key People to Call',
        prompt: 'Financial advisor, accountant, attorney, mortgage servicer, HR/benefits office? Name, firm, phone, and why to call them. You can also add them to Contacts or People to Notify.',
        rows:   6,
        voice:  false
    },
    {
        id:     'planInvestments',
        label:  'Investments & Retirement',
        prompt: 'What should they know about the investment and retirement accounts? Anything they should or should NOT do with them? Tax implications, rollover guidance, time horizon?',
        rows:   6,
        voice:  false
    },
    {
        id:     'planWishes',
        label:  'My Wishes for the Money',
        prompt: 'How do you want the money used? Keep the house or sell it? Help the kids or grandkids? Charitable giving? Your big-picture intent, in your own words.',
        rows:   6,
        voice:  true
    },
    {
        id:     'planOther',
        label:  'Anything Else',
        prompt: 'Whatever doesn\'t fit above — anything you want them to know.',
        rows:   5,
        voice:  true
    }
];

function loadLegacyFinancialPlanPage() {
    _legacyRequireUnlock(function() { _planLoadAndRender(); });
}

async function _planLoadAndRender() {
    var page = document.getElementById('page-legacy-financial-plan');
    if (!page) return;

    var crumb = document.getElementById('breadcrumbBar');
    if (crumb) crumb.innerHTML =
        '<a href="#life">Life</a><span class="separator">&rsaquo;</span>' +
        '<a href="#legacy">My Legacy</a><span class="separator">&rsaquo;</span>' +
        '<a href="#legacy/accounts">Financial</a><span class="separator">&rsaquo;</span>' +
        '<span>Financial Plan</span>';

    // Load people list (reuse loan loader)
    await _loanLoadPeople();
    _planPeople = _legacyFinPeople;
    _planPersonFilter = _legacyFinPersonFilter;

    // Build person switcher HTML
    var personOptions = '<option value="self"' + (_planPersonFilter === 'self' ? ' selected' : '') + '>Me</option>';
    _planPeople.forEach(function(p) {
        personOptions += '<option value="' + escapeHtml(p.id) + '"' +
            (_planPersonFilter === p.id ? ' selected' : '') + '>' + escapeHtml(p.name) + '</option>';
    });

    // Build section HTML
    var sectionsHtml = PLAN_SECTIONS.map(function(s) {
        var voiceHtml = s.voice
            ? '<div class="legacy-ai-row" style="margin-bottom:6px;">' +
              '<button class="btn btn-secondary btn-small" id="planVoiceBtn_' + s.id + '">🎙️ Speak</button>' +
              '<span class="legacy-ai-status" id="planVoiceStatus_' + s.id + '"></span>' +
              '</div>'
            : '';
        return '<div class="plan-section">' +
            '<label class="plan-section-label" for="planField_' + s.id + '">' + escapeHtml(s.label) + '</label>' +
            '<p class="plan-section-prompt">' + escapeHtml(s.prompt) + '</p>' +
            voiceHtml +
            '<textarea id="planField_' + s.id + '" class="form-control plan-textarea" rows="' + s.rows + '" ' +
                'placeholder="Write here…" ' +
                'onblur="_planSaveField(\'' + s.id + '\')">' +
            '</textarea>' +
            '<div class="plan-save-status" id="planSaveStatus_' + s.id + '"></div>' +
        '</div>';
    }).join('');

    page.innerHTML =
        '<div class="page-header">' +
            '<h2>📋 Financial Plan</h2>' +
        '</div>' +
        '<div class="invest-person-row">' +
            '<label class="invest-person-label">Person:</label>' +
            '<select class="invest-person-select" id="planPersonSelect" onchange="_planOnPersonChange(this.value)">' +
                personOptions +
            '</select>' +
        '</div>' +
        '<p class="plan-intro">Write this in your own words, as if speaking directly to your loved one. Fill in as much or as little as you want — each section saves automatically when you click away.</p>' +
        '<div class="plan-sections">' + sectionsHtml + '</div>';

    // Load saved values
    await _planLoadValues();

    // Wire voice-to-text buttons
    PLAN_SECTIONS.forEach(function(s) {
        if (!s.voice) return;
        var btnId = 'planVoiceBtn_' + s.id;
        var fieldId = 'planField_' + s.id;
        if (typeof initVoiceToText === 'function') {
            initVoiceToText(fieldId, btnId);
        } else {
            var btn = document.getElementById(btnId);
            if (btn) btn.style.display = 'none';
        }
    });
}

async function _planLoadValues() {
    try {
        var doc = await userCol('legacyFinancial').doc(_planPersonFilter).get();
        var data = doc.exists ? doc.data() : {};
        PLAN_SECTIONS.forEach(function(s) {
            var el = document.getElementById('planField_' + s.id);
            if (el) el.value = data[s.id] || '';
        });
    } catch (e) {
        console.error('Financial Plan load error:', e);
    }
}

async function _planSaveField(fieldId) {
    var el = document.getElementById('planField_' + fieldId);
    var statusEl = document.getElementById('planSaveStatus_' + fieldId);
    if (!el) return;

    var value = el.value;
    if (statusEl) statusEl.textContent = 'Saving…';

    try {
        var update = {};
        update[fieldId] = value;
        await userCol('legacyFinancial').doc(_planPersonFilter).set(update, { merge: true });
        if (statusEl) {
            statusEl.textContent = 'Saved';
            setTimeout(function() { if (statusEl) statusEl.textContent = ''; }, 2000);
        }
    } catch (e) {
        console.error('Financial Plan save error:', e);
        if (statusEl) statusEl.textContent = 'Save failed';
    }
}

async function _planOnPersonChange(personId) {
    _planPersonFilter = personId;
    _legacyFinPersonFilter = personId;
    await _planLoadValues();
}

function _legacyFinStub(pageId, title, icon) {
    var page = document.getElementById(pageId);
    if (!page) return;

    var crumb = document.getElementById('breadcrumbBar');
    if (crumb) {
        crumb.innerHTML =
            '<a href="#life">Life</a><span class="separator">&rsaquo;</span>' +
            '<a href="#legacy">My Legacy</a><span class="separator">&rsaquo;</span>' +
            '<a href="#legacy/accounts">Financial</a><span class="separator">&rsaquo;</span>' +
            '<span>' + escapeHtml(title) + '</span>';
    }

    page.innerHTML =
        '<div class="page-header">' +
            '<h2>' + icon + ' ' + escapeHtml(title) + '</h2>' +
        '</div>' +
        '<div class="legacy-stub">' +
            '<p class="legacy-stub-icon">🔧</p>' +
            '<p class="legacy-stub-text">This section is coming soon.</p>' +
        '</div>';
}

/** Gated — requires passphrase. */
function loadLegacySocialPage() {
    _legacyRequireUnlock(function() {
        _legacyLoadStub('page-legacy-social', 'Social Media', 'social');
    });
}

// ============================================================
// Passphrase Gate
// ============================================================

/**
 * If the section is already unlocked, run callback immediately.
 * Otherwise show the passphrase modal, then run callback on success.
 */
function _legacyRequireUnlock(callback) {
    if (legacyIsUnlocked()) {
        callback();
        return;
    }
    _legacyPassphraseCallback = callback;
    _legacyOpenPassphraseModal();
}

async function _legacyOpenPassphraseModal() {
    var isSetUp = await legacyCryptoIsSetUp();
    var title    = document.getElementById('legacyPassphraseTitle');
    var desc     = document.getElementById('legacyPassphraseDesc');
    var confirm  = document.getElementById('legacyPassphraseConfirmGroup');
    var warning  = document.getElementById('legacyPassphraseWarning');
    var input    = document.getElementById('legacyPassphraseInput');
    var errEl    = document.getElementById('legacyPassphraseError');
    var btnLabel = document.getElementById('legacyPassphraseBtnLabel');

    if (input)  input.value = '';
    if (errEl)  { errEl.textContent = ''; errEl.classList.add('hidden'); }
    var confirmInput = document.getElementById('legacyPassphraseConfirm');
    if (confirmInput) confirmInput.value = '';

    if (isSetUp) {
        if (title)   title.textContent = 'Unlock Financial Info';
        if (desc)    desc.textContent  = 'Enter your Legacy Passphrase to view encrypted financial information.';
        if (confirm) confirm.classList.add('hidden');
        if (warning) warning.classList.add('hidden');
        if (btnLabel) btnLabel.textContent = 'Unlock';
    } else {
        if (title)   title.textContent = 'Create Legacy Passphrase';
        if (desc)    desc.textContent  = 'This passphrase encrypts your financial passwords and account numbers. It is never stored — write it down and keep it with your app login instructions.';
        if (confirm) confirm.classList.remove('hidden');
        if (warning) warning.classList.remove('hidden');
        if (btnLabel) btnLabel.textContent = 'Create & Unlock';
    }

    openModal('modal-legacy-passphrase');
    if (input) setTimeout(function() { input.focus(); }, 100);
}

async function legacySubmitPassphrase() {
    var input    = document.getElementById('legacyPassphraseInput');
    var confirm  = document.getElementById('legacyPassphraseConfirm');
    var errEl    = document.getElementById('legacyPassphraseError');
    var isSetUp  = await legacyCryptoIsSetUp();

    var passphrase = input ? input.value.trim() : '';
    if (!passphrase) {
        _legacyPassphraseError('Please enter a passphrase.');
        return;
    }

    if (!isSetUp) {
        // First-time: validate confirmation
        var confirmVal = confirm ? confirm.value.trim() : '';
        if (passphrase !== confirmVal) {
            _legacyPassphraseError('Passphrases do not match.');
            return;
        }
        if (passphrase.length < 6) {
            _legacyPassphraseError('Passphrase must be at least 6 characters.');
            return;
        }
    }

    var result = await legacyCryptoDeriveKey(passphrase);
    if (result === 'wrong') {
        _legacyPassphraseError('Incorrect passphrase. Please try again.');
        return;
    }
    if (result === 'error') {
        _legacyPassphraseError('Something went wrong. Please try again.');
        return;
    }

    closeModal('modal-legacy-passphrase');
    if (_legacyPassphraseCallback) {
        var cb = _legacyPassphraseCallback;
        _legacyPassphraseCallback = null;
        cb();
    }
}

function legacyCancelPassphrase() {
    _legacyPassphraseCallback = null;
    closeModal('modal-legacy-passphrase');
    // Navigate back to legacy landing if user cancels
    window.location.hash = '#legacy';
}

function _legacyPassphraseError(msg) {
    var errEl = document.getElementById('legacyPassphraseError');
    if (errEl) {
        errEl.textContent = msg;
        errEl.classList.remove('hidden');
    }
}

// Allow Enter key to submit the passphrase modal
document.addEventListener('keydown', function(e) {
    var modal = document.getElementById('modal-legacy-passphrase');
    if (modal && modal.classList.contains('open') && e.key === 'Enter') {
        e.preventDefault();
        legacySubmitPassphrase();
    }
});

// ============================================================
// Internal Helpers
// ============================================================

function _legacyLoadStub(pageId, title, sectionKey) {
    var page = document.getElementById(pageId);
    if (!page) return;

    // Find icon for this section
    var meta = LEGACY_SECTIONS.find(function(s) { return s.key === sectionKey; });
    var icon = meta ? meta.icon : '📋';

    page.innerHTML =
        '<div class="page-header">' +
            '<h2>' + icon + ' ' + title + '</h2>' +
        '</div>' +
        '<div class="legacy-stub">' +
            '<p class="legacy-stub-icon">🔧</p>' +
            '<p class="legacy-stub-text">This section is coming soon.</p>' +
            '<p class="legacy-stub-hint">Content for <strong>' + title + '</strong> will be built here.</p>' +
        '</div>';

    // Set breadcrumb
    var crumb = document.getElementById('breadcrumbBar');
    if (crumb) {
        crumb.innerHTML =
            '<a href="#life">Life</a>' +
            '<span class="separator">&rsaquo;</span>' +
            '<a href="#legacy">My Legacy</a>' +
            '<span class="separator">&rsaquo;</span>' +
            '<span>' + title + '</span>';
    }
}
