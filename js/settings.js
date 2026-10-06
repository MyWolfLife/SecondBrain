// ============================================================
// Settings.js — App settings page
// Loads and saves settings from Firestore collection 'settings',
// document 'main'. Fields: appName, address, parcelId.
// ============================================================

/** Toggle an accordion card open/closed. */
function toggleAccordion(btn) {
    btn.closest('.accordion-card').classList.toggle('open');
}

/**
 * Loads the Settings Hub page — no async work needed, just a static card grid.
 * Called by app.js when routing to #settings.
 */
function loadSettingsHub() {
    // Nothing to load — the hub is purely static HTML cards.
}

// ============================================================
// CONTACT LISTS SETTINGS  (#settings-contact-lists)
// Manage service trades and personal contact types.
// Both are stored in Firestore lookups collection.
// ============================================================

var _DEFAULT_TRADES_FOR_SETTINGS         = ['Plumber','Electrician','HVAC','Pest Control','Handyman'];
var _DEFAULT_PERSONAL_TYPES_FOR_SETTINGS = ['Friend','Family','Neighbor','Coworker','Acquaintance'];
var _DEFAULT_BUSINESS_TYPES_FOR_SETTINGS = ['Electronics Store','Garden Store','Restaurant','Hardware Store','Grocery Store'];

// Map docKey → { containerId, defaults } for the generic lookup helpers
var _LOOKUP_LIST_CONFIG = {
    serviceTrades:       { containerId: 'settingsTradesList',        defaults: _DEFAULT_TRADES_FOR_SETTINGS },
    personalContactTypes:{ containerId: 'settingsPersonalTypesList', defaults: _DEFAULT_PERSONAL_TYPES_FOR_SETTINGS },
    businessTypes:       { containerId: 'settingsBusinessTypesList', defaults: _DEFAULT_BUSINESS_TYPES_FOR_SETTINGS }
};

/**
 * Load the Contact Types settings page.
 * Fetches trades, personal types, and business types from Firestore and renders editable lists.
 */
async function loadContactListsPage() {
    await Promise.all([
        _renderLookupList('serviceTrades',        'settingsTradesList',        _DEFAULT_TRADES_FOR_SETTINGS),
        _renderLookupList('personalContactTypes',  'settingsPersonalTypesList', _DEFAULT_PERSONAL_TYPES_FOR_SETTINGS),
        _renderLookupList('businessTypes',         'settingsBusinessTypesList', _DEFAULT_BUSINESS_TYPES_FOR_SETTINGS)
    ]);
}

/**
 * Render an editable list of lookup values into a container element.
 * @param {string} docKey      - Firestore lookups document key (e.g. 'serviceTrades')
 * @param {string} containerId - ID of the container div to render into
 * @param {Array}  defaults    - Default values to use if no Firestore doc exists
 */
async function _renderLookupList(docKey, containerId, defaults) {
    var container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '<p style="color:#888;font-size:0.9rem;">Loading...</p>';

    var values = defaults.slice();
    try {
        var snap = await userCol('lookups').doc(docKey).get();
        if (snap.exists) {
            var vals = snap.data().values || [];
            if (vals.length > 0) {
                // If stored list has none of the built-in defaults, it's an old-style
                // custom-only list — merge defaults in and heal the doc.
                var hasDefault = defaults.some(function(d) { return vals.indexOf(d) !== -1; });
                if (!hasDefault) {
                    values = defaults.slice();
                    vals.forEach(function(v) { if (values.indexOf(v) === -1) values.push(v); });
                    userCol('lookups').doc(docKey).set({ values: values }).catch(function(){});
                } else {
                    values = vals;
                }
            }
        }
    } catch (err) { console.error('_renderLookupList error:', err); }

    if (!values.length) {
        container.innerHTML = '<p style="color:#888;font-size:0.9rem;">No items yet.</p>';
        return;
    }

    var html = '<div class="lookup-list">';
    values.forEach(function(v, i) {
        var escaped = escapeHtml(v);
        html += '<div class="lookup-list-item" data-index="' + i + '" data-doc="' + docKey + '">' +
                  '<span class="lookup-item-label" id="lookup-label-' + docKey + '-' + i + '">' + escaped + '</span>' +
                  '<input class="lookup-item-input hidden" id="lookup-input-' + docKey + '-' + i + '" value="' + escaped + '" style="flex:1;">' +
                  '<div class="lookup-item-actions">' +
                    '<button class="btn btn-secondary btn-small" onclick="_lookupStartRename(\'' + docKey + '\',' + i + ')">Rename</button>' +
                    '<button class="btn btn-danger btn-small"    onclick="_lookupDelete(\'' + docKey + '\',' + i + ')">Delete</button>' +
                  '</div>' +
                '</div>';
    });
    html += '</div>';
    container.innerHTML = html;
}

/** Show the rename input for a list item. */
function _lookupStartRename(docKey, index) {
    var label = document.getElementById('lookup-label-' + docKey + '-' + index);
    var input = document.getElementById('lookup-input-' + docKey + '-' + index);
    var item  = document.querySelector('.lookup-list-item[data-index="' + index + '"][data-doc="' + docKey + '"]');
    if (!label || !input || !item) return;

    label.classList.add('hidden');
    input.classList.remove('hidden');
    input.focus();
    input.select();

    // Replace action buttons with Save/Cancel
    var actionsDiv = item.querySelector('.lookup-item-actions');
    actionsDiv.innerHTML =
        '<button class="btn btn-primary btn-small" onclick="_lookupSaveRename(\'' + docKey + '\',' + index + ')">Save</button>' +
        '<button class="btn btn-secondary btn-small" onclick="_lookupCancelRename(\'' + docKey + '\',' + index + ')">Cancel</button>';

    input.addEventListener('keydown', function handler(e) {
        if (e.key === 'Enter')  { _lookupSaveRename(docKey, index); input.removeEventListener('keydown', handler); }
        if (e.key === 'Escape') { _lookupCancelRename(docKey, index); input.removeEventListener('keydown', handler); }
    });
}

/** Save a renamed item back to Firestore and re-render. */
async function _lookupSaveRename(docKey, index) {
    var input = document.getElementById('lookup-input-' + docKey + '-' + index);
    if (!input) return;
    var newVal = input.value.trim();
    if (!newVal) { alert('Value cannot be empty.'); return; }

    var cfg = _LOOKUP_LIST_CONFIG[docKey] || { containerId: '', defaults: [] };
    var defaults    = cfg.defaults;
    var containerId = cfg.containerId;

    // Load current list, replace at index, save back
    var values = defaults.slice();
    try {
        var snap = await userCol('lookups').doc(docKey).get();
        if (snap.exists) { var vals = snap.data().values || []; if (vals.length > 0) values = vals; }
    } catch (err) {}
    values[index] = newVal;
    try {
        await userCol('lookups').doc(docKey).set({ values: values }, { merge: false });
    } catch (err) { alert('Error saving. Please try again.'); return; }
    _renderLookupList(docKey, containerId, defaults);
}

/** Cancel a rename and restore the label. */
function _lookupCancelRename(docKey, index) {
    var label = document.getElementById('lookup-label-' + docKey + '-' + index);
    var input = document.getElementById('lookup-input-' + docKey + '-' + index);
    var item  = document.querySelector('.lookup-list-item[data-index="' + index + '"][data-doc="' + docKey + '"]');
    if (!label || !input || !item) return;

    label.classList.remove('hidden');
    input.classList.add('hidden');

    var actionsDiv = item.querySelector('.lookup-item-actions');
    actionsDiv.innerHTML =
        '<button class="btn btn-secondary btn-small" onclick="_lookupStartRename(\'' + docKey + '\',' + index + ')">Rename</button>' +
        '<button class="btn btn-danger btn-small"    onclick="_lookupDelete(\'' + docKey + '\',' + index + ')">Delete</button>';
}

/** Delete an item from the list and save back to Firestore. */
async function _lookupDelete(docKey, index) {
    if (!confirm('Delete this item?')) return;

    var cfg = _LOOKUP_LIST_CONFIG[docKey] || { containerId: '', defaults: [] };
    var defaults    = cfg.defaults;
    var containerId = cfg.containerId;

    var values = defaults.slice();
    try {
        var snap = await userCol('lookups').doc(docKey).get();
        if (snap.exists) { var vals = snap.data().values || []; if (vals.length > 0) values = vals; }
    } catch (err) {}
    values.splice(index, 1);
    try {
        await userCol('lookups').doc(docKey).set({ values: values }, { merge: false });
    } catch (err) { alert('Error deleting. Please try again.'); return; }
    _renderLookupList(docKey, containerId, defaults);
}

/** Add a new trade from the settings page input. */
async function settingsAddTrade() {
    var input = document.getElementById('settingsTradeNewInput');
    var val = input.value.trim();
    if (!val) return;
    try {
        await userCol('lookups').doc('serviceTrades').set(
            { values: firebase.firestore.FieldValue.arrayUnion(val) },
            { merge: true }
        );
    } catch (err) { alert('Error adding trade.'); return; }
    input.value = '';
    _renderLookupList('serviceTrades', 'settingsTradesList', _DEFAULT_TRADES_FOR_SETTINGS);
}

/** Add a new personal contact type from the settings page input. */
async function settingsAddPersonalType() {
    var input = document.getElementById('settingsPersonalTypeNewInput');
    var val = input.value.trim();
    if (!val) return;
    try {
        await userCol('lookups').doc('personalContactTypes').set(
            { values: firebase.firestore.FieldValue.arrayUnion(val) },
            { merge: true }
        );
    } catch (err) { alert('Error adding type.'); return; }
    input.value = '';
    _renderLookupList('personalContactTypes', 'settingsPersonalTypesList', _DEFAULT_PERSONAL_TYPES_FOR_SETTINGS);
}

/** Add a new business type from the settings page input. */
async function settingsAddBusinessType() {
    var input = document.getElementById('settingsBusinessTypeNewInput');
    var val = input.value.trim();
    if (!val) return;
    try {
        await userCol('lookups').doc('businessTypes').set(
            { values: firebase.firestore.FieldValue.arrayUnion(val) },
            { merge: true }
        );
    } catch (err) { alert('Error adding business type.'); return; }
    input.value = '';
    _renderLookupList('businessTypes', 'settingsBusinessTypesList', _DEFAULT_BUSINESS_TYPES_FOR_SETTINGS);
}

/**
 * Load general settings from Firestore and populate the form fields.
 * Called by app.js when routing to #settings-general.
 */
async function loadSettingsGeneralPage() {
    var appNameEl   = document.getElementById('settingsAppName');
    var addressEl   = document.getElementById('settingsAddress');
    var parcelIdEl  = document.getElementById('settingsParcelId');
    var cityStateEl = document.getElementById('settingsCityState');
    var savedMsg    = document.getElementById('settingsSavedMsg');
    backupLoadLastMsg();  // show last backup timestamp

    // Clear form while loading
    appNameEl.value   = '';
    addressEl.value   = '';
    parcelIdEl.value  = '';
    cityStateEl.value = '';
    savedMsg.classList.add('hidden');

    try {
        var doc = await userCol('settings').doc('main').get();
        if (doc.exists) {
            var data          = doc.data();
            appNameEl.value   = data.appName   || '';
            addressEl.value   = data.address   || '';
            parcelIdEl.value  = data.parcelId  || '';
            cityStateEl.value = data.cityState || '';
        }
    } catch (err) {
        console.error('Error loading settings:', err);
    }

    loadLlmSettings();
    loadFinnhubSettings();
    loadFmpSettings();
    loadYahooWorkerSettings();
    loadFoursquareSettings();
    loadGraphhopperSettings();
    loadGcalSettings();
}

// ---------- Finnhub Settings ----------

async function loadFinnhubSettings() {
    try {
        var doc = await userCol('settings').doc('investments').get();
        if (doc.exists && doc.data().finnhubApiKey) {
            document.getElementById('finnhubApiKey').value = doc.data().finnhubApiKey;
        }
    } catch (e) {
        console.error('Error loading Finnhub settings:', e);
    }
}

async function saveFinnhubKey() {
    var key     = (document.getElementById('finnhubApiKey').value || '').trim();
    var saveBtn = document.getElementById('finnhubSaveBtn');
    var savedMsg= document.getElementById('finnhubSavedMsg');

    saveBtn.disabled    = true;
    saveBtn.textContent = 'Saving\u2026';
    savedMsg.classList.add('hidden');

    await userCol('settings').doc('investments').set({ finnhubApiKey: key }, { merge: true });

    // Invalidate the cached key in the investments module so the next Update Prices re-reads it
    if (typeof _investInvalidateFinnhubKey === 'function') _investInvalidateFinnhubKey();

    saveBtn.disabled    = false;
    saveBtn.textContent = 'Save';
    savedMsg.classList.remove('hidden');
    setTimeout(function() { savedMsg.classList.add('hidden'); }, 2000);
}

async function testFinnhubKey() {
    var key      = (document.getElementById('finnhubApiKey').value || '').trim();
    var btn      = document.getElementById('finnhubTestBtn');
    var resultEl = document.getElementById('finnhubTestResult');

    if (!key) { alert('Please enter your Finnhub API key first.'); return; }

    btn.disabled    = true;
    btn.textContent = 'Testing\u2026';
    resultEl.classList.remove('hidden');
    resultEl.textContent = 'Calling Finnhub\u2026';
    resultEl.style.color = '#555';

    try {
        var resp = await fetch('https://finnhub.io/api/v1/quote?symbol=AAPL&token=' + encodeURIComponent(key));
        var data = await resp.json();
        if (resp.status === 401 || data.error) {
            resultEl.textContent = '\u2717 Invalid API key. Check that you copied it correctly from finnhub.io.';
            resultEl.style.color = '#c62828';
        } else if (data.c && data.c > 0) {
            resultEl.textContent = '\u2713 Key works! AAPL current price: $' + data.c.toFixed(2);
            resultEl.style.color = '#2e7d32';
        } else {
            // Market closed — c is 0, use previous close
            resultEl.textContent = '\u2713 Key works! (Market closed — AAPL previous close: $' + (data.pc || 0).toFixed(2) + ')';
            resultEl.style.color = '#2e7d32';
        }
    } catch (e) {
        resultEl.textContent = '\u2717 Error: ' + e.message;
        resultEl.style.color = '#c62828';
    }

    btn.disabled    = false;
    btn.textContent = 'Test';
}

// ---------- FMP (Financial Modeling Prep) Settings ----------

async function loadFmpSettings() {
    try {
        var doc = await userCol('settings').doc('investments').get();
        if (doc.exists && doc.data().fmpApiKey) {
            document.getElementById('fmpApiKey').value = doc.data().fmpApiKey;
        }
    } catch (e) { console.error('loadFmpSettings failed:', e); }
}

async function saveFmpKey() {
    var key     = (document.getElementById('fmpApiKey').value || '').trim();
    var saveBtn = document.getElementById('fmpSaveBtn');
    var savedMsg= document.getElementById('fmpSavedMsg');

    saveBtn.disabled    = true;
    saveBtn.textContent = 'Saving…';
    savedMsg.classList.add('hidden');

    await userCol('settings').doc('investments').set({ fmpApiKey: key }, { merge: true });

    saveBtn.disabled    = false;
    saveBtn.textContent = 'Save';
    savedMsg.classList.remove('hidden');
    setTimeout(function() { savedMsg.classList.add('hidden'); }, 2500);
}

// Tests the FMP key with a cheap profile call — also proves the browser can
// call FMP directly (CORS), which the Stock Analyzer integration depends on.
// Tries the current /stable/ API first, then the legacy /api/v3/ path.
async function testFmpKey() {
    var key      = (document.getElementById('fmpApiKey').value || '').trim();
    var btn      = document.getElementById('fmpTestBtn');
    var resultEl = document.getElementById('fmpTestResult');

    if (!key) { alert('Please enter your FMP API key first.'); return; }

    btn.disabled    = true;
    btn.textContent = 'Testing…';
    resultEl.classList.remove('hidden');
    resultEl.textContent = 'Calling FMP…';
    resultEl.style.color = '#555';

    var urls = [
        { label: 'stable API',    url: 'https://financialmodelingprep.com/stable/profile?symbol=AAPL&apikey=' + encodeURIComponent(key) },
        { label: 'legacy v3 API', url: 'https://financialmodelingprep.com/api/v3/profile/AAPL?apikey=' + encodeURIComponent(key) }
    ];

    var lastMsg = 'no response';
    for (var i = 0; i < urls.length; i++) {
        try {
            var resp = await fetch(urls[i].url);
            var data = await resp.json();
            if (resp.status === 401 || resp.status === 403) {
                lastMsg = 'Invalid API key (HTTP ' + resp.status + ')';
                continue;
            }
            if (data && data['Error Message']) {
                lastMsg = data['Error Message'];
                continue;
            }
            var row = Array.isArray(data) ? data[0] : data;
            if (row && (row.companyName || row.symbol)) {
                resultEl.textContent = '✓ Key works via ' + urls[i].label + '! ' +
                    (row.companyName || row.symbol) +
                    (row.price ? ' — $' + Number(row.price).toFixed(2) : '');
                resultEl.style.color = '#2e7d32';
                btn.disabled = false; btn.textContent = 'Test';
                return;
            }
            lastMsg = 'unexpected response shape';
        } catch (e) {
            lastMsg = e.message;
        }
    }

    resultEl.textContent = '✗ Test failed: ' + lastMsg +
        '. Check the key at financialmodelingprep.com → Dashboard.';
    resultEl.style.color = '#c62828';
    btn.disabled    = false;
    btn.textContent = 'Test';
}

// ---------- Yahoo Worker Settings ----------

async function loadYahooWorkerSettings() {
    try {
        var doc = await userCol('settings').doc('investments').get();
        if (doc.exists && doc.data().yahooWorkerUrl) {
            document.getElementById('yahooWorkerUrl').value = doc.data().yahooWorkerUrl;
        }
    } catch (e) {
        console.error('Error loading Yahoo Worker settings:', e);
    }
}

async function saveYahooWorkerUrl() {
    var url     = (document.getElementById('yahooWorkerUrl').value || '').trim();
    var saveBtn = document.getElementById('yahooWorkerSaveBtn');
    var savedMsg= document.getElementById('yahooWorkerSavedMsg');

    saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
    savedMsg.classList.add('hidden');

    await userCol('settings').doc('investments').set({ yahooWorkerUrl: url }, { merge: true });

    if (typeof _investInvalidateYahooWorkerUrl === 'function') _investInvalidateYahooWorkerUrl();

    saveBtn.disabled = false; saveBtn.textContent = 'Save';
    savedMsg.classList.remove('hidden');
    setTimeout(function() { savedMsg.classList.add('hidden'); }, 2000);
}

async function testYahooWorkerUrl() {
    var url       = (document.getElementById('yahooWorkerUrl').value || '').trim();
    var btn       = document.getElementById('yahooWorkerTestBtn');
    var resultEl  = document.getElementById('yahooWorkerTestResult');

    if (!url) { alert('Please enter your Worker URL first.'); return; }

    btn.disabled = true; btn.textContent = 'Testing…';
    resultEl.classList.remove('hidden');
    resultEl.textContent = 'Calling Worker…';
    resultEl.style.color = '#555';

    try {
        var resp = await fetch(url.replace(/\/$/, '') + '?ticker=AAPL');
        var data = await resp.json();
        var price = data && data.chart && data.chart.result &&
                    data.chart.result[0] && data.chart.result[0].meta &&
                    data.chart.result[0].meta.regularMarketPrice;
        if (price && price > 0) {
            resultEl.textContent = '✓ Worker works! AAPL: $' + price.toFixed(2);
            resultEl.style.color = '#2e7d32';
        } else {
            resultEl.textContent = '✗ Worker returned no price. Check the Worker code.';
            resultEl.style.color = '#c62828';
        }
    } catch (e) {
        resultEl.textContent = '✗ Error: ' + e.message;
        resultEl.style.color = '#c62828';
    }

    btn.disabled = false; btn.textContent = 'Test';
}

/**
 * Load Foursquare Worker URL from Firestore and populate the input field.
 */
async function loadFoursquareSettings() {
    try {
        var doc = await userCol('settings').doc('places').get();
        if (doc.exists && doc.data().workerUrl) {
            document.getElementById('foursquareWorkerUrl').value = doc.data().workerUrl;
        }
    } catch (err) {
        console.error('Error loading Foursquare settings:', err);
    }
}

/**
 * Save Foursquare Cloudflare Worker URL to Firestore.
 */
async function saveFoursquareKey() {
    var url      = document.getElementById('foursquareWorkerUrl').value.trim().replace(/\/$/, '');
    var saveBtn  = document.getElementById('foursquareSaveBtn');
    var savedMsg = document.getElementById('foursquareSavedMsg');

    saveBtn.disabled    = true;
    saveBtn.textContent = 'Saving…';
    savedMsg.classList.add('hidden');

    try {
        await userCol('settings').doc('places').set(
            { workerUrl: url, updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
            { merge: true }
        );
        savedMsg.classList.remove('hidden');
        setTimeout(function() { savedMsg.classList.add('hidden'); }, 3000);
    } catch (err) {
        console.error('Error saving Foursquare settings:', err);
        alert('Error saving — please try again.');
    }

    saveBtn.disabled    = false;
    saveBtn.textContent = 'Save';
}

// ---------- GraphHopper (distance routing) Settings ----------

async function loadGraphhopperSettings() {
    try {
        var doc = await userCol('settings').doc('routing').get();
        if (doc.exists && doc.data().graphhopperKey) {
            document.getElementById('graphhopperKey').value = doc.data().graphhopperKey;
        }
    } catch (err) {
        console.error('Error loading GraphHopper settings:', err);
    }
}

/** Save the GraphHopper API key to Firestore (settings/routing). */
async function saveGraphhopperKey() {
    var key      = document.getElementById('graphhopperKey').value.trim();
    var saveBtn  = document.getElementById('graphhopperSaveBtn');
    var savedMsg = document.getElementById('graphhopperSavedMsg');

    saveBtn.disabled    = true;
    saveBtn.textContent = 'Saving…';
    savedMsg.classList.add('hidden');

    try {
        await userCol('settings').doc('routing').set(
            { graphhopperKey: key, updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
            { merge: true }
        );
        savedMsg.classList.remove('hidden');
        setTimeout(function() { savedMsg.classList.add('hidden'); }, 3000);
    } catch (err) {
        console.error('Error saving GraphHopper settings:', err);
        alert('Error saving — please try again.');
    }

    saveBtn.disabled    = false;
    saveBtn.textContent = 'Save';
}

/**
 * Copy the Cloudflare Worker code from the help modal to the clipboard.
 */
function fsqCopyWorkerCode(btn) {
    var code = document.getElementById('fsqWorkerCode').textContent;
    navigator.clipboard.writeText(code).then(function() {
        var orig = btn.textContent;
        btn.textContent = '✓ Copied!';
        setTimeout(function() { btn.textContent = orig; }, 2000);
    }).catch(function() {
        alert('Copy failed — please select the code manually and copy it.');
    });
}

function investCopyWorkerCode(btn) {
    var code = document.getElementById('investYahooWorkerCode').textContent;
    navigator.clipboard.writeText(code).then(function() {
        var orig = btn.textContent;
        btn.textContent = '✓ Copied!';
        setTimeout(function() { btn.textContent = orig; }, 2000);
    }).catch(function() {
        alert('Copy failed — please select the code manually and copy it.');
    });
}

/**
 * Save settings to Firestore using merge so other future fields are preserved.
 */
async function saveSettings() {
    var saveBtn     = document.getElementById('settingsSaveBtn');
    var savedMsg    = document.getElementById('settingsSavedMsg');
    var appNameEl   = document.getElementById('settingsAppName');
    var addressEl   = document.getElementById('settingsAddress');
    var parcelIdEl  = document.getElementById('settingsParcelId');
    var cityStateEl = document.getElementById('settingsCityState');

    saveBtn.disabled    = true;
    saveBtn.textContent = 'Saving...';
    savedMsg.classList.add('hidden');

    try {
        var newAppName = appNameEl.value.trim() || 'My House';

        await userCol('settings').doc('main').set({
            appName:   newAppName,
            address:   addressEl.value.trim(),
            parcelId:  parcelIdEl.value.trim(),
            cityState: cityStateEl.value.trim(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        // Update the live header immediately without requiring a page reload
        window.appName = newAppName;
        updateHeaderTitle();

        saveBtn.disabled    = false;
        saveBtn.textContent = 'Save Settings';
        savedMsg.classList.remove('hidden');

        // Fade the confirmation out after 2 seconds
        setTimeout(function() {
            savedMsg.classList.add('hidden');
        }, 2000);

    } catch (err) {
        console.error('Error saving settings:', err);
        alert('Error saving settings — please try again.');
        saveBtn.disabled    = false;
        saveBtn.textContent = 'Save Settings';
    }
}

// ---------- App Name Init (called once on startup from initApp) ----------

/**
 * Load appName from Firestore on app init and cache it in window.appName.
 * Falls back to 'My House' if the setting has never been saved.
 * Returns a Promise so initApp() can wait for it before routing.
 */
async function initAppName() {
    try {
        var doc = await userCol('settings').doc('main').get();
        // Cache the whole document so other features (e.g. the backup reminder)
        // can read settings/main without paying for another Firestore read.
        window._settingsMain = doc.exists ? doc.data() : {};
        window.appName = window._settingsMain.appName || 'My House';
    } catch (e) {
        window._settingsMain = {};
        window.appName = 'My House';
    }
    updateHeaderTitle();
}

/**
 * Update the header title link to reflect the current window.appName.
 * Only replaces the header content when it is showing the simple home-link
 * (i.e. a top-level page is active). Breadcrumb pages write their own richer
 * header HTML and must not be overwritten.
 */
function updateHeaderTitle() {
    var el = document.getElementById('headerTitle');
    if (!el) return;
    // Check for the plain home-link without any breadcrumb separator
    if (el.querySelector('a.home-link') && !el.querySelector('.header-zone-sep')) {
        el.innerHTML = '<a href="#main" class="home-link">' +
            escapeHtml(window.appName || 'My House') + '</a>';
    }
}

// ============================================================
// Backup & Restore Page
// ============================================================

/**
 * Called by app.js when routing to #backup.
 * Refreshes the "last backup" timestamp shown on the page.
 */
function loadBackupPage() {
    backupLoadLastMsg();
    backupLoadReminderMsg();
    // Show private backup card only when vault is activated
    var card = document.getElementById('private-backup-card');
    if (card) {
        if (window.privateActivated) {
            card.classList.remove('hidden');
        } else {
            // Check Firestore in case activation happened in another tab
            userCol('privateVault').doc('auth').get().then(function(doc) {
                if (doc.exists && doc.data().encryptedSentinel) {
                    window.privateActivated = true;
                    card.classList.remove('hidden');
                }
            }).catch(function() {});
        }
    }
}

// ============================================================
// Storage Usage
// ============================================================

var STORAGE_QUOTA_BYTES = 1 * 1024 * 1024 * 1024;  // 1 GB (Firestore Spark limit)
var STORAGE_OVERHEAD_BYTES = 5 * 1024 * 1024;       // 5 MB fixed overhead estimate

// Logical groupings for the breakdown display
var STORAGE_GROUPS = [
    { label: 'Yard / Garden',      cols: ['activities','calendarEvents','chemicals','facts','plants','problems','projects','savedActions','weeds','zones'] },
    { label: 'House',              cols: ['breakerPanels','floorPlans','floors','gpsShapes','rooms','structures','structureSubThings','structureThings'] },
    { label: 'Garage',             cols: ['garageRooms','garageSubThings','garageThings'] },
    { label: 'Collections / Things', cols: ['collections','collectionItems','subThings','subThingItems','tags','things'] },
    { label: 'Vehicles',           cols: ['mileageLogs','vehicles'] },
    { label: 'Journal / Notes / Places', cols: ['journalCategories','journalEntries','journalTrackingItems','notebooks','notes','places'] },
    { label: 'People / Contacts',  cols: ['people','peopleCategories','peopleImportantDates','peopleInteractions'] },
    { label: 'Health',             cols: ['allergies','appointments','bloodWorkRecords','checklistRuns','checklistTemplates','concernUpdates','concerns','conditions','distances','emergencyInfo','eyePrescriptions','healthAppointments','healthCareTeam','healthConditionLogs','healthVisits','insurancePolicies','medications','supplements','vaccinations','vitals'] },
    { label: 'Life / Calendar',    cols: ['bucketList','lifeCategories','lifeEventLogs','lifeEvents','lifeProjects','locations','lookups'] },
    { label: 'Thoughts',           cols: ['top10categories','top10lists','memories','memoryLinks','memoryTags','views','viewCategories'] },
    { label: 'Misc / Settings',    cols: ['llmUsage','sbIssues','settings'] }
];

/**
 * Estimate Firestore document data size by serializing all documents to JSON
 * and summing their byte lengths. Adds a fixed overhead, then shows % of 1 GB quota.
 * NOTE: This measures document field data only — Firestore also charges for
 * indexes and document metadata which are not visible client-side.
 */
async function checkStorageUsage() {
    var btn       = document.getElementById('storageCheckBtn');
    var resultsEl = document.getElementById('storageResults');
    if (!btn || !resultsEl) return;

    btn.disabled    = true;
    btn.textContent = 'Calculating…';
    resultsEl.innerHTML = '<p style="color:#666;font-size:0.9em;">Fetching all documents… this may take a moment.</p>';

    var enc = new TextEncoder();

    // Count bytes for one collection; returns 0 on error
    async function countCol(colName) {
        try {
            var snap = await userCol(colName).get();
            var bytes = 0;
            snap.forEach(function(doc) {
                bytes += enc.encode(JSON.stringify(doc.data())).length;
            });
            // lifeProjects: also count subcollections
            if (colName === 'lifeProjects') {
                for (var i = 0; i < snap.docs.length; i++) {
                    for (var s = 0; s < LP_SUBCOLLECTIONS.length; s++) {
                        var sub = await userCol('lifeProjects').doc(snap.docs[i].id).collection(LP_SUBCOLLECTIONS[s]).get();
                        sub.forEach(function(d) { bytes += enc.encode(JSON.stringify(d.data())).length; });
                    }
                }
            }
            // viewCategories: subcategories subcollection
            if (colName === 'viewCategories') {
                for (var i = 0; i < snap.docs.length; i++) {
                    var sub = await userCol('viewCategories').doc(snap.docs[i].id).collection('subcategories').get();
                    sub.forEach(function(d) { bytes += enc.encode(JSON.stringify(d.data())).length; });
                }
            }
            // views: history subcollection
            if (colName === 'views') {
                for (var i = 0; i < snap.docs.length; i++) {
                    var sub = await userCol('views').doc(snap.docs[i].id).collection('history').get();
                    sub.forEach(function(d) { bytes += enc.encode(JSON.stringify(d.data())).length; });
                }
            }
            return bytes;
        } catch (err) {
            return 0;
        }
    }

    // Tally every group
    var groupTotals = [];
    var grandTotal  = 0;

    for (var g = 0; g < STORAGE_GROUPS.length; g++) {
        var group = STORAGE_GROUPS[g];
        var groupBytes = 0;
        for (var c = 0; c < group.cols.length; c++) {
            groupBytes += await countCol(group.cols[c]);
        }
        groupTotals.push({ label: group.label, bytes: groupBytes });
        grandTotal += groupBytes;
    }

    var totalWithOverhead = grandTotal + STORAGE_OVERHEAD_BYTES;
    var pct = totalWithOverhead / STORAGE_QUOTA_BYTES * 100;
    var pctDisplay = pct < 0.01 ? '<0.01' : pct.toFixed(2);
    var barWidth = Math.min(pct, 100).toFixed(2);
    var barColor = pct > 80 ? '#c62828' : pct > 60 ? '#e65100' : '#2e7d32';

    // Sort groups by size desc for the breakdown
    groupTotals.sort(function(a, b) { return b.bytes - a.bytes; });

    var html = '<div class="storage-summary">' +
        '<div class="storage-total-label">Estimated usage</div>' +
        '<div class="storage-total-value">' + _storageFmtBytes(totalWithOverhead) + ' <span class="storage-quota-of">of 1 GB</span></div>' +
        '<div class="storage-bar-wrap">' +
            '<div class="storage-bar-fill" style="width:' + barWidth + '%;background:' + barColor + ';"></div>' +
        '</div>' +
        '<div class="storage-pct">' + pctDisplay + '% of free-tier quota used</div>' +
        '<div class="storage-note">Includes 5 MB fixed overhead. Document data only — indexes not counted. Actual Firestore usage may be slightly higher.</div>' +
    '</div>' +
    '<table class="storage-breakdown-table">' +
        '<thead><tr><th>Category</th><th>Size</th></tr></thead><tbody>';

    groupTotals.forEach(function(g) {
        if (g.bytes > 0) {
            html += '<tr><td>' + g.label + '</td><td class="storage-breakdown-size">' + _storageFmtBytes(g.bytes) + '</td></tr>';
        }
    });
    html += '</tbody></table>';

    resultsEl.innerHTML = html;
    btn.disabled    = false;
    btn.textContent = 'Refresh';
}

function _storageFmtBytes(bytes) {
    if (bytes < 1024)             return bytes + ' B';
    if (bytes < 1024 * 1024)      return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

// ============================================================
// Backup
// ============================================================

// Collections included in the DATA backup (everything except photos)
var BACKUP_DATA_COLLECTIONS = [
    // Yard / Garden
    'activities', 'calendarEvents', 'chemicals', 'facts', 'plants',
    'problems', 'projects', 'savedActions', 'weeds', 'zones',

    // House / Structure
    'breakerPanels', 'floorPlans', 'floors', 'gpsShapes',
    'rooms', 'structures', 'structureSubThings', 'structureThings',

    // Garage
    'garageRooms', 'garageSubThings', 'garageThings',

    // Things / Collections
    'collections', 'collectionItems',
    'subThings', 'subThingItems', 'tags', 'things',

    // Vehicles
    'mileageLogs', 'vehicles',

    // Journal / Notes
    'journalCategories', 'journalEntries', 'journalTrackingItems',
    'notebooks', 'notes', 'places',

    // People / Contacts
    'people', 'peopleCategories', 'peopleImportantDates', 'peopleInteractions',

    // Health
    'allergies', 'appointments', 'bloodWorkRecords',
    'checklistRuns', 'checklistTemplates',
    'concernUpdates', 'concerns', 'conditions',
    'distances', 'emergencyInfo', 'eyePrescriptions',
    'healthAppointments', 'healthCareTeam', 'healthConditionLogs', 'healthTrackedContacts', 'healthVisits',
    'insurancePolicies', 'medications', 'supplements', 'vaccinations', 'vitals',

    // Life / Calendar
    'bucketList', 'lifeCategories', 'lifeEventLogs', 'lifeEvents', 'lifeProjects',
    'locations', 'lookups',

    // Thoughts — Top 10 Lists
    'top10categories', 'top10lists',

    // Thoughts — Memories
    'memories', 'memoryLinks', 'memoryTags',

    // Thoughts — My Views
    'views', 'viewCategories',

    // Legacy / End of Life
    'legacyLetters', 'legacyMeta',

    // Misc
    'sbIssues', 'settings', 'llmUsage',

    // Credentials
    'credentials', 'credentialCategories',

    // Budgets (subcollections handled via BUDGET_SUBCOLLECTIONS)
    'budgets',

    // Investments (person-scoped — subcollections handled via PERSON_SCOPED_COLLECTIONS)
    'investments', 'investmentGroups', 'investmentConfig', 'investmentSnapshots', 'ssBenefits',

    // Stock Analyzer
    'analyzerConfig', 'analyzerBacktests', 'analyzerScans', 'analyzerTrades', 'analyzerEstimates', 'dmSignals', 'smSignals', 'qvScreens', 'peadSignals', 'newsSignals',

    // Legacy Financial (person-scoped — subcollections handled via PERSON_SCOPED_COLLECTIONS)
    'legacyFinancial',

    // Exercise
    'exerciseActivities', 'exerciseTypes', 'exerciseDailyMetrics', 'exerciseMetricDefs', 'exerciseGoals',

    // Private Vault (exported as ciphertext — useful for Firestore disaster recovery)
    'privateVault', 'privateBookmarks', 'privateDocuments', 'privatePhotoAlbums', 'privatePhotos'
];

/**
 * Person-scoped collections: top-level docs are person IDs ('self' or contact IDs),
 * and the actual data lives in named subcollections under each person doc.
 * Add new subcollections here as they are built — backup and restore handle them automatically.
 */
var PERSON_SCOPED_COLLECTIONS = {
    'investments':     ['accounts'],
    'legacyFinancial': ['loans', 'bills', 'insurance']   // add 'plan' when that tab is built
};

/**
 * Build a timestamp string for the filename: YYYY-MM-DD_HHmm
 */
function backupTimestamp() {
    var now = new Date();
    var pad = function(n) { return String(n).padStart(2, '0'); };
    return now.getFullYear() + '-' +
           pad(now.getMonth() + 1) + '-' +
           pad(now.getDate()) + '_' +
           pad(now.getHours()) +
           pad(now.getMinutes());
}

// Subcollections nested under each budgets document
var BUDGET_SUBCOLLECTIONS = ['categories', 'lineItems', 'incomeItems', 'nonMonthlyItems'];

// Subcollections nested under each lifeProjects document
var LP_SUBCOLLECTIONS = [
    'bookingPhotos', 'bookings', 'days', 'itemPhotoData',
    'itemPhotos', 'packingItems', 'planningGroups',
    'projectLocations', 'projectNotes', 'projectPhotos',
    'receipts', 'receiptCurrencies', 'todoItems'
];

/**
 * Read all documents from a list of user collections and return as
 * a plain object: { collectionName: [ { id, data }, ... ], ... }
 * For lifeProjects, each entry also includes a `subcollections` map
 * with all nested subcollection docs so nothing is silently omitted.
 */
async function backupReadCollections(collectionNames) {
    var result = {};
    for (var i = 0; i < collectionNames.length; i++) {
        var name = collectionNames[i];
        var snap = await userCol(name).get();
        result[name] = [];
        // Must collect docs synchronously, then async-augment below
        var entries = [];
        snap.forEach(function(doc) {
            var raw  = doc.data();
            var data = backupSerialize(raw);
            entries.push({ id: doc.id, data: data });
        });
        // For budgets, read each budget's subcollections
        if (name === 'budgets') {
            for (var j = 0; j < entries.length; j++) {
                var entry = entries[j];
                entry.subcollections = {};
                for (var s = 0; s < BUDGET_SUBCOLLECTIONS.length; s++) {
                    var subName = BUDGET_SUBCOLLECTIONS[s];
                    var subSnap = await userCol('budgets').doc(entry.id).collection(subName).get();
                    entry.subcollections[subName] = [];
                    subSnap.forEach(function(sdoc) {
                        entry.subcollections[subName].push({
                            id: sdoc.id,
                            data: backupSerialize(sdoc.data())
                        });
                    });
                }
            }
        }
        // For lifeProjects, read each project's subcollections
        if (name === 'lifeProjects') {
            for (var j = 0; j < entries.length; j++) {
                var entry = entries[j];
                entry.subcollections = {};
                for (var s = 0; s < LP_SUBCOLLECTIONS.length; s++) {
                    var subName = LP_SUBCOLLECTIONS[s];
                    var subSnap = await userCol('lifeProjects').doc(entry.id).collection(subName).get();
                    entry.subcollections[subName] = [];
                    subSnap.forEach(function(sdoc) {
                        entry.subcollections[subName].push({
                            id: sdoc.id,
                            data: backupSerialize(sdoc.data())
                        });
                    });
                }
            }
        }
        // For viewCategories, read each category's subcategories subcollection
        if (name === 'viewCategories') {
            for (var j = 0; j < entries.length; j++) {
                var entry = entries[j];
                var subSnap = await userCol('viewCategories').doc(entry.id).collection('subcategories').get();
                entry.subcollections = { subcategories: [] };
                subSnap.forEach(function(sdoc) {
                    entry.subcollections.subcategories.push({
                        id: sdoc.id,
                        data: backupSerialize(sdoc.data())
                    });
                });
            }
        }
        // For views, read each view's history subcollection
        if (name === 'views') {
            for (var j = 0; j < entries.length; j++) {
                var entry = entries[j];
                var subSnap = await userCol('views').doc(entry.id).collection('history').get();
                entry.subcollections = { history: [] };
                subSnap.forEach(function(sdoc) {
                    entry.subcollections.history.push({
                        id: sdoc.id,
                        data: backupSerialize(sdoc.data())
                    });
                });
            }
        }
        // For person-scoped collections (investments, legacyFinancial):
        // each top-level doc is a person container; data lives in named subcollections.
        if (PERSON_SCOPED_COLLECTIONS[name]) {
            var subColNames = PERSON_SCOPED_COLLECTIONS[name];
            for (var j = 0; j < entries.length; j++) {
                var entry = entries[j];
                entry.subcollections = {};
                for (var s = 0; s < subColNames.length; s++) {
                    var subName = subColNames[s];
                    var subSnap = await userCol(name).doc(entry.id).collection(subName).get();
                    entry.subcollections[subName] = [];
                    subSnap.forEach(function(sdoc) {
                        entry.subcollections[subName].push({
                            id: sdoc.id,
                            data: backupSerialize(sdoc.data())
                        });
                    });
                }
            }
        }
        result[name] = entries;
    }
    return result;
}

/**
 * Recursively convert Firestore Timestamps → ISO strings so the
 * object can be safely JSON-serialized.
 */
function backupSerialize(obj) {
    if (obj === null || obj === undefined) return obj;
    if (obj.toDate && typeof obj.toDate === 'function') {
        // Firestore Timestamp
        return obj.toDate().toISOString();
    }
    if (Array.isArray(obj)) {
        return obj.map(backupSerialize);
    }
    if (typeof obj === 'object') {
        var out = {};
        Object.keys(obj).forEach(function(k) {
            out[k] = backupSerialize(obj[k]);
        });
        return out;
    }
    return obj;
}

/**
 * Trigger a browser download of a JSON object as a .json file.
 */
function backupDownload(filename, payload) {
    var json = JSON.stringify(payload, null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Main backup handler — reads collections and triggers downloads.
 */
async function runBackup() {
    var btn        = document.getElementById('backupBtn');
    var statusMsg  = document.getElementById('backupStatusMsg');
    var withPhotos = document.getElementById('backupPhotosToggle').checked;
    var appName    = (window.appName || 'Bishop').replace(/\s+/g, '_');
    var ts         = backupTimestamp();

    btn.disabled    = true;
    btn.textContent = 'Preparing\u2026';
    statusMsg.textContent = '';
    statusMsg.classList.remove('hidden');

    try {
        // ---- Data file ----
        statusMsg.textContent = 'Reading data\u2026';
        var dataCollections = await backupReadCollections(BACKUP_DATA_COLLECTIONS);
        var dataPayload = {
            version    : 1,
            type       : 'data',
            exportedAt : new Date().toISOString(),
            appName    : window.appName || 'Bishop',
            collections: dataCollections
        };
        backupDownload(appName + '_Data_' + ts + '.json', dataPayload);

        // ---- Photos file (optional) ----
        if (withPhotos) {
            statusMsg.textContent = 'Reading photos\u2026';
            var photoCollections = await backupReadCollections(['photos']);
            var photoPayload = {
                version    : 1,
                type       : 'photos',
                exportedAt : new Date().toISOString(),
                appName    : window.appName || 'Bishop',
                collections: photoCollections
            };
            backupDownload(appName + '_Photos_' + ts + '.json', photoPayload);
        }

        // ---- Done ----
        var photoCount = withPhotos
            ? (dataCollections ? 0 : 0)  // photos counted separately
            : 0;
        statusMsg.textContent = withPhotos
            ? '\u2713 Data and photos files downloaded'
            : '\u2713 Data file downloaded';

        // Record last backup time in localStorage (per-device display string)
        var now          = new Date();
        var lastBackupStr = backupFormatDate(now);
        localStorage.setItem('lastBackup', lastBackupStr);
        document.getElementById('backupLastMsg').textContent =
            'Last backup: ' + lastBackupStr;

        // Also record it in Firestore so the reminder works across devices
        await backupRecordCompleted(now);

    } catch (err) {
        console.error('Backup error:', err);
        statusMsg.textContent = 'Error: ' + err.message;
        statusMsg.style.color = '#c62828';
    } finally {
        btn.disabled    = false;
        btn.textContent = '\u2B07 Download Backup';
    }
}

/**
 * Show the last backup timestamp when the Backup page loads.
 * Prefers the localStorage string (written by this browser). If this is a
 * fresh browser / cleared cache, falls back to the Firestore lastBackupAt
 * timestamp so a backup taken on another machine still shows up.
 */
function backupLoadLastMsg() {
    var el = document.getElementById('backupLastMsg');
    if (!el) return;

    var last = localStorage.getItem('lastBackup');
    if (last) {
        el.textContent = 'Last backup: ' + last;
        return;
    }

    var iso = (window._settingsMain || {}).lastBackupAt;
    el.textContent = iso
        ? 'Last backup: ' + backupFormatDate(new Date(iso))
        : 'Last backup: never';
}

/**
 * Show when the home page backup reminder will next appear.
 *
 * Three cases:
 *   - Snoozed          -> the snooze expiry date
 *   - Otherwise        -> lastBackupAt + 7 days (or "now" if that already passed)
 *   - Never backed up  -> showing now
 *
 * Re-reads settings/main so a snooze taken on another device is reflected
 * here, and refreshes the cached copy while it is at it.
 */
async function backupLoadReminderMsg() {
    if (!document.getElementById('backupNextReminderMsg')) return;

    try {
        var doc = await userCol('settings').doc('main').get();
        window._settingsMain = doc.exists ? doc.data() : {};
    } catch (e) {
        // Fall back to whatever is already cached
    }

    backupRenderReminderMsg();
}

/**
 * Draw the "next reminder" line from the cached settings/main copy.
 * Split out from backupLoadReminderMsg() so a backup or snooze can refresh
 * the line immediately without paying for another Firestore read.
 */
function backupRenderReminderMsg() {
    var el = document.getElementById('backupNextReminderMsg');
    if (!el) return;

    var cfg  = window._settingsMain || {};
    var now  = Date.now();
    var text;

    var snoozeMs = cfg.backupSnoozeUntil ? new Date(cfg.backupSnoozeUntil).getTime() : 0;

    if (snoozeMs > now) {
        text = backupFormatDate(new Date(snoozeMs)) + ' (snoozed)';
    } else if (!cfg.lastBackupAt) {
        text = 'showing now (never backed up)';
    } else {
        var dueMs = new Date(cfg.lastBackupAt).getTime() + BACKUP_REMINDER_DAYS * 86400000;
        text = (dueMs <= now)
            ? 'showing now (backup overdue)'
            : backupFormatDate(new Date(dueMs));
    }

    el.textContent = 'Next reminder: ' + text + ' · desktop home page only';
}

// ============================================================
// Backup Reminder (home page banner)
// ============================================================
// Nags on the desktop home page when it has been too long since the last
// backup. Backups download a file, which is awkward on a phone, so this is
// deliberately desktop-only.
//
// State lives in Firestore settings/main so it is consistent across every
// machine on the account:
//   lastBackupAt      ISO string - when a backup was last downloaded
//   backupSnoozeUntil ISO string - suppress the banner until this moment
//   backupSnoozeDays  number     - the snooze length the user last chose
// ============================================================

var BACKUP_REMINDER_DAYS   = 7;    // warn once the last backup is this old
var BACKUP_SNOOZE_DEFAULT  = 3;    // default snooze length in days
var BACKUP_DESKTOP_MIN_PX  = 768;  // below this we treat it as a phone layout

/**
 * Format a Date the same way the Backup page shows it.
 */
function backupFormatDate(d) {
    return d.toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit'
    });
}

/**
 * Record a completed backup: stamp lastBackupAt and clear any active snooze
 * (you just backed up, so the countdown starts over).
 */
async function backupRecordCompleted(when) {
    var iso = (when || new Date()).toISOString();
    try {
        await userCol('settings').doc('main').set({
            lastBackupAt     : iso,
            backupSnoozeUntil: null
        }, { merge: true });
    } catch (e) {
        console.error('Error recording backup timestamp:', e);
    }
    // Keep the cached copy in sync so the banner updates without a reload
    window._settingsMain = window._settingsMain || {};
    window._settingsMain.lastBackupAt      = iso;
    window._settingsMain.backupSnoozeUntil = null;

    backupReminderRender();
    backupRenderReminderMsg();
}

/**
 * Whole-days elapsed between an ISO timestamp and now.
 */
function backupDaysSince(iso) {
    var then = new Date(iso).getTime();
    if (isNaN(then)) return null;
    return Math.floor((Date.now() - then) / 86400000);
}

/**
 * Called from the #main route handler on every home page visit.
 * Decides whether the reminder banner should be showing and draws it.
 */
function backupReminderRender() {
    var el = document.getElementById('backupReminder');
    if (!el) return;
    el.innerHTML = '';

    // Phone layout - skip entirely
    if (window.innerWidth < BACKUP_DESKTOP_MIN_PX) return;

    var cfg = window._settingsMain || {};

    // Snoozed? Stay quiet until the snooze expires.
    if (cfg.backupSnoozeUntil && new Date(cfg.backupSnoozeUntil).getTime() > Date.now()) return;

    // Work out how overdue we are. No backup ever = show immediately.
    var days = cfg.lastBackupAt ? backupDaysSince(cfg.lastBackupAt) : null;
    if (days !== null && days < BACKUP_REMINDER_DAYS) return;

    var msg = (days === null)
        ? 'You have never backed up your data.'
        : (days === 0
            ? 'Your last backup was today.'
            : 'Your last backup was ' + days + ' day' + (days === 1 ? '' : 's') + ' ago.');

    var snoozeDays = cfg.backupSnoozeDays || BACKUP_SNOOZE_DEFAULT;

    el.innerHTML =
        '<div class="backup-reminder">' +
            '<span class="backup-reminder-icon">&#9888;</span>' +
            '<span class="backup-reminder-text">' + escapeHtml(msg) + '</span>' +
            '<a href="#backup" class="btn btn-primary backup-reminder-btn">Back Up Now</a>' +
            '<span class="backup-reminder-snooze">' +
                'Remind me in ' +
                '<input type="number" id="backupSnoozeDays" min="1" max="365" ' +
                       'value="' + snoozeDays + '" class="backup-reminder-days"> days ' +
                '<button type="button" class="btn btn-secondary backup-reminder-btn" ' +
                        'onclick="backupReminderSnooze()">Snooze</button>' +
            '</span>' +
        '</div>';
}

/**
 * Snooze the reminder. The number the user typed becomes their new default,
 * so next time the box is pre-filled with the same value.
 */
async function backupReminderSnooze() {
    var input = document.getElementById('backupSnoozeDays');
    var days  = parseInt(input && input.value, 10);
    if (isNaN(days) || days < 1)   days = BACKUP_SNOOZE_DEFAULT;
    if (days > 365)                days = 365;

    var until = new Date(Date.now() + days * 86400000).toISOString();

    window._settingsMain = window._settingsMain || {};
    window._settingsMain.backupSnoozeUntil = until;
    window._settingsMain.backupSnoozeDays  = days;

    backupReminderRender();      // hides the banner immediately
    backupRenderReminderMsg();   // and updates the Backup page line if it is open

    try {
        await userCol('settings').doc('main').set({
            backupSnoozeUntil: until,
            backupSnoozeDays : days
        }, { merge: true });
    } catch (e) {
        console.error('Error saving backup snooze:', e);
    }
}

// ============================================================
// Restore
// ============================================================

/**
 * Log a line to the restore progress area.
 */
function restoreLog(msg, cls) {
    var log  = document.getElementById('restoreLog');
    var line = document.createElement('div');
    line.textContent = msg;
    if (cls) line.style.color = cls;
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
}

/**
 * Update the progress bar fill (0–100).
 */
function restoreSetProgress(pct) {
    document.getElementById('restoreProgressFill').style.width = pct + '%';
}

/**
 * Delete all documents in a user collection in batches of 400.
 * For lifeProjects, also deletes each project's subcollections first.
 */
async function restoreDeleteCollection(colName) {
    var snap = await userCol(colName).get();
    if (snap.empty) return;
    var docs = snap.docs;
    // Delete subcollections before parent docs to avoid orphans
    if (colName === 'budgets') {
        for (var p = 0; p < docs.length; p++) {
            for (var s = 0; s < BUDGET_SUBCOLLECTIONS.length; s++) {
                var subSnap = await userCol('budgets').doc(docs[p].id).collection(BUDGET_SUBCOLLECTIONS[s]).get();
                if (!subSnap.empty) {
                    var si = 0;
                    while (si < subSnap.docs.length) {
                        var batch = db.batch();
                        subSnap.docs.slice(si, si + 400).forEach(function(sd) { batch.delete(sd.ref); });
                        await batch.commit();
                        si += 400;
                    }
                }
            }
        }
    }
    if (colName === 'lifeProjects') {
        for (var p = 0; p < docs.length; p++) {
            for (var s = 0; s < LP_SUBCOLLECTIONS.length; s++) {
                var subSnap = await userCol('lifeProjects').doc(docs[p].id).collection(LP_SUBCOLLECTIONS[s]).get();
                if (!subSnap.empty) {
                    var si = 0;
                    while (si < subSnap.docs.length) {
                        var batch = db.batch();
                        subSnap.docs.slice(si, si + 400).forEach(function(sd) {
                            batch.delete(sd.ref);
                        });
                        await batch.commit();
                        si += 400;
                    }
                }
            }
        }
    }
    // For person-scoped collections, delete subcollection docs before the person container docs
    if (PERSON_SCOPED_COLLECTIONS[colName]) {
        var subColNames = PERSON_SCOPED_COLLECTIONS[colName];
        for (var p = 0; p < docs.length; p++) {
            for (var s = 0; s < subColNames.length; s++) {
                var subSnap = await userCol(colName).doc(docs[p].id).collection(subColNames[s]).get();
                if (!subSnap.empty) {
                    var si = 0;
                    while (si < subSnap.docs.length) {
                        var batch = db.batch();
                        subSnap.docs.slice(si, si + 400).forEach(function(sd) { batch.delete(sd.ref); });
                        await batch.commit();
                        si += 400;
                    }
                }
            }
        }
    }
    var i = 0;
    while (i < docs.length) {
        var batch = db.batch();
        var chunk = docs.slice(i, i + 400);
        chunk.forEach(function(d) { batch.delete(userCol(colName).doc(d.id)); });
        await batch.commit();
        i += 400;
    }
}

/**
 * Write documents from a backup collection array in batches of 400.
 * Each entry is { id, data }. For lifeProjects, also writes subcollections
 * when the entry contains a `subcollections` map.
 */
async function restoreWriteCollection(colName, docs) {
    var i = 0;
    while (i < docs.length) {
        var batch = db.batch();
        var chunk = docs.slice(i, i + 400);
        chunk.forEach(function(entry) {
            batch.set(userCol(colName).doc(entry.id), entry.data);
        });
        await batch.commit();
        i += 400;
    }
    // Write subcollections for budgets, lifeProjects, and person-scoped collections
    var needsSubcollections = colName === 'budgets' || colName === 'lifeProjects' || !!PERSON_SCOPED_COLLECTIONS[colName];
    if (needsSubcollections) {
        for (var p = 0; p < docs.length; p++) {
            var entry = docs[p];
            if (!entry.subcollections) continue;
            var subNames = Object.keys(entry.subcollections);
            for (var s = 0; s < subNames.length; s++) {
                var subName = subNames[s];
                var subDocs = entry.subcollections[subName];
                var si = 0;
                while (si < subDocs.length) {
                    var batch = db.batch();
                    subDocs.slice(si, si + 400).forEach(function(sdoc) {
                        var ref = userCol(colName).doc(entry.id).collection(subName).doc(sdoc.id);
                        batch.set(ref, sdoc.data);
                    });
                    await batch.commit();
                    si += 400;
                }
            }
        }
    }
}

/**
 * Core restore: given a parsed backup payload, wipe + rewrite each collection.
 */
async function runRestore(payload) {
    var collections = Object.keys(payload.collections);
    var total       = collections.length;
    var progress    = document.getElementById('restoreProgress');
    var log         = document.getElementById('restoreLog');

    // Show progress area
    log.innerHTML = '';
    restoreSetProgress(0);
    progress.classList.remove('hidden');

    restoreLog('Starting restore of ' + total + ' collection(s)\u2026');

    for (var i = 0; i < collections.length; i++) {
        var name = collections[i];
        var docs = payload.collections[name];
        restoreLog('\u2192 ' + name + ': deleting existing\u2026');
        await restoreDeleteCollection(name);
        restoreLog('\u2192 ' + name + ': writing ' + docs.length + ' document(s)\u2026');
        await restoreWriteCollection(name, docs);
        restoreLog('\u2713 ' + name + ' done (' + docs.length + ')', '#2e7d32');
        restoreSetProgress(Math.round(((i + 1) / total) * 100));
    }

    restoreLog('\n\u2705 Restore complete!', '#2e7d32');
    restoreSetProgress(100);
}

/**
 * Handle a file selected for restore.
 * Validates the JSON, shows confirmation, then runs restore.
 * @param {File}   file       - The selected .json file
 * @param {string} expectType - 'data' or 'photos'
 */
function handleRestoreFile(file, expectType) {
    var reader = new FileReader();
    reader.onload = function(e) {
        var payload;
        try {
            payload = JSON.parse(e.target.result);
        } catch (err) {
            alert('Invalid file — could not parse JSON.');
            return;
        }

        // Validate
        if (!payload.version || !payload.type || !payload.collections) {
            alert('This does not look like a Bishop backup file.');
            return;
        }
        if (payload.type !== expectType) {
            alert('Wrong file type. Expected a "' + expectType + '" backup file but got "' + payload.type + '".');
            return;
        }

        // Show confirmation — user must type RESTORE
        var exportedAt = payload.exportedAt
            ? new Date(payload.exportedAt).toLocaleString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric',
                hour: 'numeric', minute: '2-digit'
              })
            : 'unknown date';

        var msg = 'This will REPLACE all current ' + expectType + ' with the backup from ' +
                  exportedAt + '.\n\nThis cannot be undone.\n\nType RESTORE to confirm:';
        var answer = prompt(msg);
        if (answer !== 'RESTORE') {
            alert('Restore cancelled — you must type RESTORE exactly.');
            return;
        }

        // Disable both restore buttons during operation
        document.getElementById('restoreDataBtn').disabled   = true;
        document.getElementById('restorePhotosBtn').disabled = true;

        runRestore(payload)
            .catch(function(err) {
                restoreLog('ERROR: ' + err.message, '#c62828');
                console.error('Restore error:', err);
            })
            .finally(function() {
                document.getElementById('restoreDataBtn').disabled   = false;
                document.getElementById('restorePhotosBtn').disabled = false;
            });
    };
    reader.readAsText(file);
}

// ============================================================
// LLM Settings
// ============================================================

// The user's list of models, kept in the settings/llm document as `models`.
// Each entry: { id: 'gpt-6-luna', label: 'cheap, fast', provider: 'openai' | 'grok' }
var LLM_DEFAULT_MODELS = [
    { id: 'gpt-4o-mini',  label: 'faster, cheaper', provider: 'openai' },
    { id: 'gpt-5.4-mini', label: 'newer',           provider: 'openai' }
];
var _llmModels = LLM_DEFAULT_MODELS.map(function(m) { return Object.assign({}, m); });
var _llmModelEditIndex = -1;   // index in _llmModels being edited, or -1 when adding

/**
 * Show the model picker once a provider is chosen, and refresh its choices.
 * Also updates the Help button state.
 */
function updateLlmModelVisibility() {
    var provider = document.getElementById('llmProvider').value;
    var modelGroup = document.getElementById('llmModelGroup');
    if (provider) {
        modelGroup.classList.remove('hidden');
    } else {
        modelGroup.classList.add('hidden');
    }
    cancelLlmModelEdit();
    renderLlmModelSelect(document.getElementById('llmModel').value);
    renderLlmModelList();
    updateLlmHelpBtn();
}

/** Fill the Model dropdown with the saved models for the current provider. */
function renderLlmModelSelect(selectedId) {
    var provider = document.getElementById('llmProvider').value;
    var select   = document.getElementById('llmModel');
    var models   = _llmModels.filter(function(m) { return m.provider === provider; });
    // Never lose a model that is saved on the account but missing from the list.
    if (provider && selectedId && !models.some(function(m) { return m.id === selectedId; })) {
        var kp = LLM_KNOWN_PRICES[selectedId];   // pre-fill the published price when we know it
        var extra = { id: selectedId, label: 'saved', provider: provider,
            inputPrice: kp ? kp[0] : null, cachedPrice: kp ? kp[1] : null, outputPrice: kp ? kp[2] : null };
        _llmModels.push(extra);
        models.push(extra);
    }
    select.innerHTML = '';
    // Leaving the model blank makes each feature use its own default model.
    var blank = document.createElement('option');
    blank.value = '';
    blank.textContent = '(provider default)';
    select.appendChild(blank);
    models.forEach(function(m) {
        var opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.label ? m.id + ' (' + m.label + ')' : m.id;
        select.appendChild(opt);
    });
    select.value = selectedId || '';
}

/** Show/hide the add-edit-delete panel. */
function toggleLlmModelManager() {
    document.getElementById('llmModelManager').classList.toggle('hidden');
    cancelLlmModelEdit();
    renderLlmModelList();
}

/** "$2.50 in / $10.00 out per 1M" or "no price" for the model list. */
function llmPriceText(m) {
    if (m.inputPrice == null || m.outputPrice == null) return 'no price';
    return '$' + m.inputPrice + ' in / $' + m.outputPrice + ' out per 1M';
}

/** Draw the list of models (with Edit / Delete) for the current provider. */
function renderLlmModelList() {
    var provider = document.getElementById('llmProvider').value;
    var list = document.getElementById('llmModelList');
    list.innerHTML = '';
    var any = false;
    _llmModels.forEach(function(m, index) {
        if (m.provider !== provider) return;
        any = true;
        var li = document.createElement('li');
        var name = document.createElement('span');
        name.className = 'llm-model-name';
        name.textContent = m.id;
        var note = document.createElement('span');
        note.className = 'llm-model-note';
        note.textContent = '  ' + (m.label ? m.label + ' \u00b7 ' : '') + llmPriceText(m);
        name.appendChild(note);
        var edit = document.createElement('button');
        edit.type = 'button'; edit.className = 'btn btn-secondary btn-sm'; edit.textContent = 'Edit';
        edit.onclick = function() { editLlmModel(index); };
        var del = document.createElement('button');
        del.type = 'button'; del.className = 'btn btn-secondary btn-sm'; del.textContent = 'Delete';
        del.onclick = function() { deleteLlmModel(index); };
        li.appendChild(name); li.appendChild(edit); li.appendChild(del);
        list.appendChild(li);
    });
    if (!any) {
        var empty = document.createElement('li');
        empty.textContent = 'No models yet. Add one below, or use Browse available models.';
        list.appendChild(empty);
    }
}

function _llmPriceInput(id) { return document.getElementById(id).value.trim(); }

/** Load one model into the form for editing. */
function editLlmModel(index) {
    var m = _llmModels[index];
    _llmModelEditIndex = index;
    document.getElementById('llmModelIdInput').value          = m.id;
    document.getElementById('llmModelLabelInput').value       = m.label || '';
    document.getElementById('llmModelInPriceInput').value     = m.inputPrice  == null ? '' : m.inputPrice;
    document.getElementById('llmModelCachedPriceInput').value = m.cachedPrice == null ? '' : m.cachedPrice;
    document.getElementById('llmModelOutPriceInput').value    = m.outputPrice == null ? '' : m.outputPrice;
    document.getElementById('llmModelAddBtn').textContent = 'Save changes';
    document.getElementById('llmModelCancelBtn').classList.remove('hidden');
    document.getElementById('llmModelIdInput').focus();
}

/** Clear the form and go back to "add" mode. */
function cancelLlmModelEdit() {
    _llmModelEditIndex = -1;
    ['llmModelIdInput', 'llmModelLabelInput', 'llmModelInPriceInput', 'llmModelCachedPriceInput', 'llmModelOutPriceInput']
        .forEach(function(id) { document.getElementById(id).value = ''; });
    document.getElementById('llmModelAddBtn').textContent = 'Add model';
    document.getElementById('llmModelCancelBtn').classList.add('hidden');
}

/** Parse a price box: blank means "not set"; returns undefined when the text is not a valid price. */
function _llmParsePrice(text) {
    if (text === '') return null;
    var n = Number(text);
    return (isFinite(n) && n >= 0) ? n : undefined;
}

/** Add a new model, or save changes to the one being edited. */
async function saveLlmModelEntry() {
    var provider = document.getElementById('llmProvider').value;
    var id    = document.getElementById('llmModelIdInput').value.trim();
    var label = document.getElementById('llmModelLabelInput').value.trim();
    var inP   = _llmParsePrice(_llmPriceInput('llmModelInPriceInput'));
    var cacheP = _llmParsePrice(_llmPriceInput('llmModelCachedPriceInput'));
    var outP  = _llmParsePrice(_llmPriceInput('llmModelOutPriceInput'));
    if (!provider) { alert('Select a provider first.'); return; }
    if (!id)       { alert('Enter the model ID.'); return; }
    if (/\s/.test(id)) { alert('A model ID cannot contain spaces.'); return; }
    if (inP === undefined || cacheP === undefined || outP === undefined) { alert('Prices must be numbers, zero or more (dollars per 1 million tokens).'); return; }
    if ((inP === null) !== (outP === null)) { alert('Enter both the input and output price, or leave both blank.'); return; }
    var duplicate = _llmModels.some(function(m, i) {
        return m.provider === provider && m.id === id && i !== _llmModelEditIndex;
    });
    if (duplicate) { alert('That model is already in the list.'); return; }

    var selected = document.getElementById('llmModel').value;
    var entry = { id: id, label: label, provider: provider, inputPrice: inP, cachedPrice: cacheP, outputPrice: outP };
    if (_llmModelEditIndex >= 0) {
        var oldId = _llmModels[_llmModelEditIndex].id;
        _llmModels[_llmModelEditIndex] = entry;
        if (selected === oldId) selected = id;   // keep the renamed model selected
    } else {
        _llmModels.push(entry);
    }
    cancelLlmModelEdit();
    renderLlmModelSelect(selected);
    renderLlmModelList();
    await persistLlmModels();
}

/** Remove a model from the list (after confirming). */
async function deleteLlmModel(index) {
    var m = _llmModels[index];
    if (!confirm('Delete model "' + m.id + '" from the list?')) return;
    var selected = document.getElementById('llmModel').value;
    _llmModels.splice(index, 1);
    cancelLlmModelEdit();
    renderLlmModelSelect(selected === m.id ? '' : selected);
    renderLlmModelList();
    await persistLlmModels();
}

/**
 * Save only the model list. The provider, key and chosen model are saved
 * by the Save AI Settings button, so this uses merge to leave them alone.
 */
async function persistLlmModels() {
    try {
        await userCol('settings').doc('llm').set({ models: _llmModels }, { merge: true });
        if (window.llmUsageResetConfig) window.llmUsageResetConfig();   // usage log re-reads prices
    } catch (err) {
        alert('Could not save the model list: ' + err.message);
    }
}

// ---- Browse the models the provider's API says this key can use ----

// Published prices in dollars per 1 million tokens: [input, cached input, output].
// Copied from OpenAI's pricing page on 2026-10-06 and used only to pre-fill the form; always verify.
var LLM_KNOWN_PRICES = {
    'gpt-6-astra': [10, 1, 50], 'gpt-6.1-sol': [2, 0.1, 10], 'gpt-6-sol': [2, 0.2, 10], 'gpt-6-luna': [0.1, 0.01, 0.5],
    'gpt-5.6-sol': [4, 0.4, 20], 'gpt-5.6-terra': [2, 0.2, 12], 'gpt-5.6-luna': [0.2, 0.02, 1.2],
    'gpt-5.5': [5, 0.5, 30], 'gpt-5.5-pro': [30, null, 180], 'gpt-5.4': [2.5, 0.25, 15],
    'gpt-5.4-mini': [0.75, 0.075, 4.5], 'gpt-5.4-nano': [0.2, 0.02, 1.25], 'gpt-5.4-pro': [30, null, 180],
    'gpt-5.2': [1.75, 0.175, 14], 'gpt-5.2-pro': [21, null, 168], 'gpt-5.1': [1.25, 0.125, 10],
    'gpt-5': [1.25, 0.125, 10], 'gpt-5-mini': [0.25, 0.025, 2], 'gpt-5-nano': [0.05, 0.005, 0.4], 'gpt-5-pro': [15, null, 120],
    'gpt-4.1': [2, 0.5, 8], 'gpt-4.1-mini': [0.4, 0.1, 1.6], 'gpt-4.1-nano': [0.1, 0.025, 0.4],
    'gpt-4o': [2.5, 1.25, 10], 'gpt-4o-mini': [0.15, 0.075, 0.6],
    'o1': [15, 7.5, 60], 'o1-pro': [150, null, 600], 'o3': [2, 0.5, 8], 'o3-pro': [20, null, 80],
    'o4-mini': [1.1, 0.275, 4.4], 'o3-mini': [1.1, 0.55, 4.4]
};
var _llmBrowseIds = [];   // model IDs returned by the provider's API

/** Ask the provider which models this key can use, then show them to pick from. */
async function browseLlmModels() {
    var provider = document.getElementById('llmProvider').value;
    var apiKey   = document.getElementById('llmApiKey').value.trim();
    if (!provider) { alert('Select a provider first.'); return; }
    if (!apiKey)   { alert('Enter your API key first.'); return; }
    var status = document.getElementById('llmBrowseStatus');
    var btn    = document.getElementById('llmBrowseBtn');
    btn.disabled = true;
    status.textContent = 'Asking ' + (provider === 'openai' ? 'OpenAI' : 'xAI') + '\u2026';
    try {
        var resp = await fetch(provider === 'openai' ? 'https://api.openai.com/v1/models' : 'https://api.x.ai/v1/models',
                               { headers: { Authorization: 'Bearer ' + apiKey } });
        var data = await resp.json().catch(function() { return {}; });
        if (!resp.ok) throw new Error((data.error && data.error.message) || resp.statusText);
        _llmBrowseIds = (data.data || []).map(function(m) { return m.id; }).sort();
        document.getElementById('llmBrowsePanel').classList.remove('hidden');
        status.textContent = _llmBrowseIds.length + ' models available to this key.';
        renderLlmBrowse();
    } catch (err) {
        status.textContent = 'Could not load models: ' + err.message;
    }
    btn.disabled = false;
}

/** Draw the available-models list, honoring the filter box and checkboxes. */
function renderLlmBrowse() {
    var provider  = document.getElementById('llmProvider').value;
    var text      = document.getElementById('llmBrowseFilter').value.trim().toLowerCase();
    var hideDated = document.getElementById('llmBrowseHideDated').checked;
    var chatOnly  = document.getElementById('llmBrowseChatOnly').checked;
    var have = {};
    _llmModels.forEach(function(m) { if (m.provider === provider) have[m.id] = true; });
    var list = document.getElementById('llmBrowseList');
    list.innerHTML = '';
    var shown = 0;
    _llmBrowseIds.forEach(function(id) {
        if (text && id.toLowerCase().indexOf(text) < 0) return;
        if (hideDated && (/-\d{4}-\d{2}-\d{2}$/.test(id) || /-\d{4}$/.test(id))) return;
        if (chatOnly && provider === 'openai' &&
            (!/^(gpt|o\d|chatgpt)/.test(id) || /audio|realtime|tts|transcribe|image|embedding|moderation|search-preview|codex|live/.test(id))) return;
        shown++;
        var li = document.createElement('li');
        var name = document.createElement('span');
        name.className = 'llm-model-name';
        name.textContent = id;
        var known = LLM_KNOWN_PRICES[id];
        var note = document.createElement('span');
        note.className = 'llm-model-note';
        note.textContent = '  ' + (known ? '$' + known[0] + ' in / $' + known[2] + ' out' : 'price unknown');
        name.appendChild(note);
        var add = document.createElement('button');
        add.type = 'button'; add.className = 'btn btn-secondary btn-sm';
        if (have[id]) { add.textContent = 'Added'; add.disabled = true; }
        else { add.textContent = 'Add'; add.onclick = function() { addBrowsedLlmModel(id); }; }
        li.appendChild(name); li.appendChild(add);
        list.appendChild(li);
    });
    document.getElementById('llmBrowseCount').textContent = shown + ' shown';
}

/** Add a model picked from the browse list, pre-filling the published price when known. */
async function addBrowsedLlmModel(id) {
    var provider = document.getElementById('llmProvider').value;
    if (_llmModels.some(function(m) { return m.provider === provider && m.id === id; })) return;
    var known = LLM_KNOWN_PRICES[id];
    _llmModels.push({ id: id, label: '', provider: provider,
        inputPrice: known ? known[0] : null, cachedPrice: known ? known[1] : null, outputPrice: known ? known[2] : null });
    renderLlmModelSelect(document.getElementById('llmModel').value);
    renderLlmModelList();
    renderLlmBrowse();
    await persistLlmModels();
    if (!known) document.getElementById('llmBrowseStatus').textContent = id + ' added with no price. Use Edit to enter its prices so costs can be estimated.';
}

/**
 * Update the LLM Help button text and enabled state based on the selected provider.
 * If no provider is selected, the button is disabled and says "Select an LLM first".
 */
function updateLlmHelpBtn() {
    var provider = document.getElementById('llmProvider').value;
    var btn = document.getElementById('llmHelpBtn');
    if (!btn) return;
    if (!provider) {
        btn.textContent = 'Select an LLM first';
        btn.disabled = true;
    } else {
        btn.textContent = 'Help';
        btn.disabled = false;
    }
}

/**
 * Open the LLM help modal showing only the relevant provider's instructions.
 */
function openLlmHelp() {
    var provider = document.getElementById('llmProvider').value;
    document.getElementById('llmHelpOpenAI').style.display = (provider === 'openai') ? '' : 'none';
    document.getElementById('llmHelpGrok').style.display   = (provider === 'grok')   ? '' : 'none';
    document.getElementById('llmHelpModalTitle').textContent =
        provider === 'openai' ? 'How to Get a ChatGPT (OpenAI) API Key'
                              : 'How to Get a Grok (xAI) API Key';
    openModal('llmHelpModal');
}

/**
 * Test the LLM API key by sending "What is 2+2?" and showing the response.
 */
async function testLlmKey() {
    var provider = document.getElementById('llmProvider').value;
    var apiKey   = document.getElementById('llmApiKey').value.trim();

    if (!provider) { alert('Please select an LLM provider first.'); return; }
    if (!apiKey)   { alert('Please enter an API key first.'); return; }

    var btn      = document.getElementById('llmTestBtn');
    var resultEl = document.getElementById('llmTestResult');
    btn.disabled    = true;
    btn.textContent = 'Testing\u2026';
    resultEl.classList.add('hidden');
    resultEl.style.color = '';

    var endpoint, model;
    if (provider === 'openai') {
        endpoint = 'https://api.openai.com/v1/chat/completions';
        model    = document.getElementById('llmModel').value || 'gpt-4o-mini';
    } else {
        endpoint = 'https://api.x.ai/v1/chat/completions';
        model    = document.getElementById('llmModel').value || 'grok-3-mini';
    }

    try {
        var resp = await fetch(endpoint, {
            method : 'POST',
            headers: {
                'Content-Type' : 'application/json',
                'Authorization': 'Bearer ' + apiKey
            },
            body: JSON.stringify({
                model                : model,
                messages             : [{ role: 'user', content: 'What is 2+2?' }],
                max_completion_tokens: 20
            })
        });

        if (resp.ok) {
            var data   = await resp.json();
            var answer = (data.choices && data.choices[0] && data.choices[0].message)
                ? data.choices[0].message.content.trim()
                : '(no response text)';
            resultEl.textContent = '\u2713 Key works! Response: \u201c' + answer + '\u201d';
            resultEl.style.color = '#2e7d32';
        } else {
            var errData = await resp.json().catch(function() { return {}; });
            var msg = (errData.error && errData.error.message) || resp.statusText;
            resultEl.textContent = '\u2717 Error ' + resp.status + ': ' + msg;
            resultEl.style.color = '#c62828';
        }
    } catch (err) {
        resultEl.textContent = '\u2717 Network error: ' + err.message;
        resultEl.style.color = '#c62828';
    }

    resultEl.classList.remove('hidden');
    btn.disabled    = false;
    btn.textContent = 'Test';
}

/**
 * Test the Foursquare API key by doing a simple nearby search.
 * Uses a hardcoded location (NYC) so GPS is not required.
 */
async function testFoursquareKey() {
    var workerUrl = document.getElementById('foursquareWorkerUrl').value.trim().replace(/\/$/, '');
    if (!workerUrl) { alert('Please enter your Cloudflare Worker URL first.'); return; }

    var btn      = document.getElementById('foursquareTestBtn');
    var resultEl = document.getElementById('foursquareTestResult');
    btn.disabled    = true;
    btn.textContent = 'Testing\u2026';
    resultEl.classList.add('hidden');
    resultEl.style.color = '';

    try {
        var resp = await fetch(
            workerUrl + '/places/search?query=coffee&ll=40.7128,-74.0060&limit=1'
        );

        if (resp.ok) {
            var data  = await resp.json();
            var count = (data.results && data.results.length) || 0;
            var name  = (count > 0 && data.results[0].name) ? data.results[0].name : '';
            resultEl.textContent = '\u2713 Key works!' + (name ? ' Found: ' + name : '');
            resultEl.style.color = '#2e7d32';
        } else {
            var errText = await resp.text().catch(function() { return ''; });
            var errMsg;
            try {
                var errData = JSON.parse(errText);
                errMsg = errData.message || errData.error || errText;
            } catch (e) {
                errMsg = errText || resp.statusText || '(no details)';
            }
            resultEl.textContent = '\u2717 Error ' + resp.status + ': ' + errMsg;
            resultEl.style.color = '#c62828';
        }
    } catch (err) {
        resultEl.textContent = '\u2717 Network error: ' + err.message;
        resultEl.style.color = '#c62828';
    }

    resultEl.classList.remove('hidden');
    btn.disabled    = false;
    btn.textContent = 'Test';
}

/**
 * Load LLM provider + API key + model from Firestore and populate the form.
 */
async function loadLlmSettings() {
    try {
        var doc = await userCol('settings').doc('llm').get();
        if (doc.exists) {
            var d = doc.data();
            document.getElementById('llmProvider').value = d.provider || '';
            document.getElementById('llmApiKey').value   = d.apiKey   || '';
            if (Array.isArray(d.models) && d.models.length) {
                _llmModels = d.models.filter(function(m) { return m && m.id && m.provider; });
                // Entries saved before prices existed: fill in the published price when we know it.
                _llmModels.forEach(function(m) {
                    var kp = LLM_KNOWN_PRICES[m.id];
                    if (kp && m.inputPrice == null && m.outputPrice == null) {
                        m.inputPrice = kp[0]; m.cachedPrice = kp[1]; m.outputPrice = kp[2];
                    }
                });
            }
            renderLlmModelSelect(d.model || '');   // also adds a saved model missing from the list
            updateLlmModelVisibility(); // re-renders the picker for the provider, calls updateLlmHelpBtn
        }
    } catch (err) {
        console.error('Error loading LLM settings:', err);
    }
    updateLlmHelpBtn(); // ensure button reflects state even if no saved settings
}

/**
 * Save LLM provider + API key to Firestore.
 */
async function saveLlmSettings() {
    var saveBtn   = document.getElementById('llmSaveBtn');
    var savedMsg  = document.getElementById('llmSavedMsg');
    var provider  = document.getElementById('llmProvider').value;
    var apiKey    = document.getElementById('llmApiKey').value.trim();
    var model     = document.getElementById('llmModel').value;   // blank = provider default

    if (!provider) {
        alert('Please select an LLM provider.');
        return;
    }
    if (!apiKey) {
        alert('Please enter your API key.');
        return;
    }

    saveBtn.disabled    = true;
    saveBtn.textContent = 'Saving\u2026';
    savedMsg.classList.add('hidden');

    try {
        await userCol('settings').doc('llm').set({
            provider  : provider,
            apiKey    : apiKey,
            model     : model,
            models    : _llmModels,
            updatedAt : firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        saveBtn.disabled    = false;
        saveBtn.textContent = 'Save AI Settings';
        savedMsg.classList.remove('hidden');
        setTimeout(function() { savedMsg.classList.add('hidden'); }, 2000);

    } catch (err) {
        console.error('Error saving LLM settings:', err);
        alert('Error saving AI settings — please try again.');
        saveBtn.disabled    = false;
        saveBtn.textContent = 'Save AI Settings';
    }
}

// ---------- OpenStreetMap Places ----------

/**
 * Test the OpenStreetMap Overpass API by searching for nearby amenities
 * at a hardcoded location (Charlotte, NC — the user's city).
 * No API key required — just verifies the service is reachable.
 */
async function testOsmApi() {
    var btn      = document.getElementById('osmTestBtn');
    var resultEl = document.getElementById('osmTestResult');
    btn.disabled    = true;
    btn.textContent = 'Testing\u2026';
    resultEl.classList.add('hidden');
    resultEl.style.color = '';

    // Query: find up to 5 named amenities within 500m of a spot in Charlotte, NC
    var query = '[out:json][timeout:10];' +
                'node["name"](around:500,35.2271,-80.8431);' +
                'out 5;';

    try {
        var resp = await fetch('https://overpass-api.de/api/interpreter', {
            method : 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body   : 'data=' + encodeURIComponent(query)
        });

        if (resp.ok) {
            var data  = await resp.json();
            var count = data.elements ? data.elements.length : 0;
            var names = (data.elements || [])
                .filter(function(e) { return e.tags && e.tags.name; })
                .slice(0, 3)
                .map(function(e) { return e.tags.name; })
                .join(', ');
            resultEl.textContent = '\u2713 Connected! Found ' + count + ' nearby places near Charlotte, NC'
                + (names ? ': ' + names : '') + '.';
            resultEl.style.color = '#2e7d32';
        } else {
            resultEl.textContent = '\u2717 Error ' + resp.status + ' from OpenStreetMap — try again in a moment.';
            resultEl.style.color = '#c62828';
        }
    } catch (err) {
        resultEl.textContent = '\u2717 Network error: ' + err.message;
        resultEl.style.color = '#c62828';
    }

    resultEl.classList.remove('hidden');
    btn.disabled    = false;
    btn.textContent = 'Test Connection';
}

// ============================================================
// Google Calendar Settings
// ============================================================

/**
 * Load Google Calendar settings from Firestore, populate form fields,
 * and refresh the connect/disconnect UI.
 */
async function loadGcalSettings() {
    await gcalLoadSettings();
    var s = _gcalSettings || {};

    var clientIdEl  = document.getElementById('gcalClientIdInput');
    var calNameEl   = document.getElementById('gcalCalendarNameInput');
    var reminderEl  = document.getElementById('gcalReminderSelect');

    if (clientIdEl)  clientIdEl.value  = s.clientId      || '';
    if (calNameEl)   calNameEl.value   = s.calendarName  || '';
    if (reminderEl && s.defaultReminderMinutes != null) {
        reminderEl.value = String(s.defaultReminderMinutes);
    }

    gcalRefreshSettingsUI();
}

/**
 * Save Client ID, calendar name, and default reminder to Firestore.
 * Shows/hides the connect section based on whether a Client ID is present.
 */
async function saveGcalBasicSettings() {
    var saveBtn    = document.getElementById('gcalSaveBtn');
    var savedMsg   = document.getElementById('gcalSavedMsg');
    var clientId   = (document.getElementById('gcalClientIdInput').value || '').trim();
    var calName    = (document.getElementById('gcalCalendarNameInput').value || '').trim() || 'Bishop';
    var reminder   = parseInt(document.getElementById('gcalReminderSelect').value, 10) || 1440;

    saveBtn.disabled    = true;
    saveBtn.textContent = 'Saving…';
    savedMsg.classList.add('hidden');

    try {
        await gcalSaveSettings({ clientId: clientId, calendarName: calName, defaultReminderMinutes: reminder });
        savedMsg.classList.remove('hidden');
        setTimeout(function() { savedMsg.classList.add('hidden'); }, 3000);
        gcalRefreshSettingsUI();
    } catch (err) {
        console.error('saveGcalBasicSettings error:', err);
        alert('Error saving — please try again.');
    }

    saveBtn.disabled    = false;
    saveBtn.textContent = 'Save';
}

/**
 * Update the Google Calendar section UI based on current connection state.
 * Shows/hides the connect section, connect button, disconnect button,
 * action buttons, and status badge.
 */
function gcalRefreshSettingsUI() {
    var s = _gcalSettings || {};

    var connectSection = document.getElementById('gcalConnectSection');
    var statusBadge    = document.getElementById('gcalStatusBadge');
    var connectBtn     = document.getElementById('gcalConnectBtn');
    var disconnectBtn  = document.getElementById('gcalDisconnectBtn');
    var actionBtns     = document.getElementById('gcalActionBtns');

    if (!connectSection) return; // not on settings page

    var hasClientId = !!(s.clientId && s.clientId.trim());
    var connected   = gcalIsConnected();

    // Show/hide the whole connect section
    connectSection.classList.toggle('hidden', !hasClientId);

    if (hasClientId) {
        if (connected) {
            statusBadge.innerHTML   = '<span style="color:#2e7d32;">&#10003; Connected to Google Calendar</span>';
            connectBtn.classList.add('hidden');
            disconnectBtn.classList.remove('hidden');
            actionBtns.classList.remove('hidden');
        } else {
            statusBadge.innerHTML   = '<span style="color:#888;">Not connected</span>';
            connectBtn.classList.remove('hidden');
            disconnectBtn.classList.add('hidden');
            actionBtns.classList.add('hidden');
        }
    }
}

// ---------- Button Wire-Up ----------

document.getElementById('settingsSaveBtn').addEventListener('click', saveSettings);
document.getElementById('backupBtn').addEventListener('click', runBackup);
document.getElementById('llmSaveBtn').addEventListener('click', saveLlmSettings);
document.getElementById('llmProvider').addEventListener('change', updateLlmModelVisibility);
document.getElementById('finnhubSaveBtn').addEventListener('click', saveFinnhubKey);
document.getElementById('finnhubTestBtn').addEventListener('click', testFinnhubKey);
document.getElementById('finnhubHelpBtn').addEventListener('click', function() { openModal('finnhubHelpModal'); });
document.getElementById('fmpSaveBtn').addEventListener('click', saveFmpKey);
document.getElementById('fmpTestBtn').addEventListener('click', testFmpKey);
document.getElementById('fmpApiKeyToggle').addEventListener('click', function() {
    var input = document.getElementById('fmpApiKey');
    if (input.type === 'password') { input.type = 'text';     this.textContent = 'Hide'; }
    else                           { input.type = 'password'; this.textContent = 'Show'; }
});
document.getElementById('yahooWorkerSaveBtn').addEventListener('click', saveYahooWorkerUrl);
document.getElementById('yahooWorkerTestBtn').addEventListener('click', testYahooWorkerUrl);
document.getElementById('yahooWorkerHelpBtn').addEventListener('click', function() { openModal('yahooWorkerHelpModal'); });
document.getElementById('finnhubApiKeyToggle').addEventListener('click', function() {
    var input = document.getElementById('finnhubApiKey');
    if (input.type === 'password') { input.type = 'text';     this.textContent = 'Hide'; }
    else                           { input.type = 'password'; this.textContent = 'Show'; }
});
document.getElementById('foursquareSaveBtn').addEventListener('click', saveFoursquareKey);
document.getElementById('foursquareTestBtn').addEventListener('click', testFoursquareKey);
document.getElementById('graphhopperSaveBtn').addEventListener('click', saveGraphhopperKey);
document.getElementById('foursquareHelpBtn').addEventListener('click', function() {
    openModal('fsqHelpModal');
});
document.getElementById('llmHelpBtn').addEventListener('click', openLlmHelp);
document.getElementById('llmTestBtn').addEventListener('click', testLlmKey);

document.getElementById('gcalSaveBtn').addEventListener('click', saveGcalBasicSettings);
document.getElementById('gcalHelpBtn').addEventListener('click', function() {
    openModal('gcalHelpModal');
    try {
        var projectId = firebase.app().options.projectId || '';
        if (projectId) {
            document.querySelectorAll('#gcalHelpModal .gcal-project-id').forEach(function(el) {
                el.textContent = projectId;
            });
        }
    } catch (e) {}
});
document.getElementById('gcalConnectBtn').addEventListener('click', gcalConnect);
document.getElementById('gcalDisconnectBtn').addEventListener('click', function() {
    if (confirm('Disconnect from Google Calendar? Auto-sync will pause but your existing Google Calendar events will remain.')) {
        gcalDisconnect();
    }
});
document.getElementById('gcalSyncAllBtn').addEventListener('click', function() {
    gcalSyncAll();
});
document.getElementById('gcalRecreateCalBtn').addEventListener('click', function() {
    if (confirm('Re-create the Bishop calendar in Google? This will clear all synced event links and re-sync everything.')) {
        gcalRecreateCalendar();
    }
});

// Show/hide toggle for the LLM API key field
document.getElementById('llmApiKeyToggle').addEventListener('click', function() {
    var input = document.getElementById('llmApiKey');
    if (input.type === 'password') {
        input.type        = 'text';
        this.textContent  = 'Hide';
    } else {
        input.type        = 'password';
        this.textContent  = 'Show';
    }
});

// Restore — data
document.getElementById('restoreDataBtn').addEventListener('click', function() {
    document.getElementById('restoreDataFile').value = '';
    document.getElementById('restoreDataFile').click();
});
document.getElementById('restoreDataFile').addEventListener('change', function() {
    if (this.files && this.files[0]) handleRestoreFile(this.files[0], 'data');
});

// Restore — photos
document.getElementById('restorePhotosBtn').addEventListener('click', function() {
    document.getElementById('restorePhotosFile').value = '';
    document.getElementById('restorePhotosFile').click();
});
document.getElementById('restorePhotosFile').addEventListener('change', function() {
    if (this.files && this.files[0]) handleRestoreFile(this.files[0], 'photos');
});
