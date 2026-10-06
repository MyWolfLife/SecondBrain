// ============================================================
// AI usage log
// Every call to an AI provider (OpenAI, xAI, OpenRouter) is recorded in the
// per-user `llmUsage` collection: model, token counts, feature and an estimated
// cost. Prices come from the model list on Settings -> AI Chat -> Manage models.
//
// Rather than edit every place that calls an AI, this file wraps window.fetch once
// and watches for AI endpoints. Logging is best-effort: it can never break a call.
// ============================================================

var LLM_USAGE_URL = /^https:\/\/(api\.openai\.com\/v1\/(chat\/completions|responses)|api\.x\.ai\/v1\/(chat\/completions|responses)|openrouter\.ai\/api\/v1\/chat\/completions)/;

var _llmUsageModels = null;   // cached model list (for prices); null = not loaded yet

/** Forget the cached model list so the next call re-reads the latest prices. */
function llmUsageResetConfig() { _llmUsageModels = null; }

/** Load the model list (with prices) from settings/llm, once. */
async function _llmUsageLoadModels() {
    if (_llmUsageModels) return _llmUsageModels;
    try {
        var doc = await userCol('settings').doc('llm').get();
        _llmUsageModels = (doc.exists && Array.isArray(doc.data().models)) ? doc.data().models : [];
        // Entries saved before prices existed: use the published price when we know it.
        _llmUsageModels.forEach(function(m) {
            var kp = typeof LLM_KNOWN_PRICES !== 'undefined' && LLM_KNOWN_PRICES[m.id];
            if (kp && m.inputPrice == null && m.outputPrice == null) { m.inputPrice = kp[0]; m.cachedPrice = kp[1]; m.outputPrice = kp[2]; }
        });
    } catch (e) {
        _llmUsageModels = [];
    }
    return _llmUsageModels;
}

/**
 * Find the saved price for a model. Matches the exact ID first, then the longest
 * saved ID the model name starts with (so "gpt-4o-2024-08-06" finds "gpt-4o").
 */
function _llmUsageFindPrice(models, provider, modelId) {
    var best = null;
    models.forEach(function(m) {
        if (m.provider !== provider || m.inputPrice == null || m.outputPrice == null) return;
        if (m.id === modelId) { best = m; return; }
        if (best && best.id === modelId) return;
        if (modelId.indexOf(m.id) === 0 && (!best || m.id.length > best.id.length)) best = m;
    });
    return best;
}

/** Dollars for one call. Cached input tokens bill at the cached price when one is saved. */
function llmUsageCost(price, inputTokens, cachedTokens, outputTokens) {
    if (!price) return null;
    var cached = Math.min(cachedTokens || 0, inputTokens);
    var cachedRate = price.cachedPrice == null ? price.inputPrice : price.cachedPrice;
    return ((inputTokens - cached) * price.inputPrice + cached * cachedRate + outputTokens * price.outputPrice) / 1e6;
}

/** A short feature name taken from the screen the user is on. */
function _llmUsageFeature() {
    var seg = (location.hash || '#').replace(/^#/, '').split('/')[0] || 'home';
    var names = { 'life-project': 'Trips (Life Projects)', 'settings-general': 'Settings', chat: 'Chat', sb: 'SecondBrain' };
    return names[seg] || seg;
}

/** Read the usage numbers out of a chat-completions or Responses reply and save a log entry. */
async function _llmUsageRecord(url, init, response) {
    try {
        if (!response.ok || (response.headers.get('content-type') || '').indexOf('json') < 0) return;
        var data = await response.json();
        var u = data && data.usage;
        if (!u || typeof userCol !== 'function' || !firebase.auth().currentUser) return;

        var input  = u.input_tokens  != null ? u.input_tokens  : (u.prompt_tokens     || 0);
        var output = u.output_tokens != null ? u.output_tokens : (u.completion_tokens || 0);
        var details = u.input_tokens_details || u.prompt_tokens_details || {};
        var cached = details.cached_tokens || 0;

        var requested = '';
        try { requested = (JSON.parse(init && init.body) || {}).model || ''; } catch (e) { /* body not JSON */ }
        var model = requested || data.model || 'unknown';
        var provider = /api\.openai\.com/.test(url) ? 'openai' : /api\.x\.ai/.test(url) ? 'grok' : 'openrouter';

        var models = await _llmUsageLoadModels();
        var price  = _llmUsageFindPrice(models, provider, model);
        var cost   = llmUsageCost(price, input, cached, output);

        await userCol('llmUsage').add({
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            provider: provider, model: model, feature: _llmUsageFeature(),
            inputTokens: input, cachedTokens: cached, outputTokens: output,
            estCost: cost    // null when the model has no saved price yet
        });
    } catch (e) {
        // Logging must never affect the AI call itself.
    }
}

// Wrap fetch once. The original response is returned untouched; a clone is read for the log.
(function() {
    var origFetch = window.fetch.bind(window);
    window.fetch = function(input, init) {
        var url = typeof input === 'string' ? input : (input && input.url) || '';
        var result = origFetch(input, init);
        if (!LLM_USAGE_URL.test(url)) return result;
        return result.then(function(response) {
            try { _llmUsageRecord(url, init, response.clone()); } catch (e) { /* ignore */ }
            return response;
        });
    };
})();

// ============================================================
// Usage report (Settings -> AI Usage & Cost)
// ============================================================

function _llmFmtCost(n) { return n == null ? '—' : '$' + (n > 0 && n < 0.0001 ? n.toFixed(6) : n < 0.01 && n > 0 ? n.toFixed(4) : n.toFixed(2)); }
function _llmFmtNum(n)  { return Number(n || 0).toLocaleString(); }

/** Build a small table from rows (arrays of text) with a header row. */
function _llmUsageTable(headers, rows) {
    var wrap = document.createElement('div');
    wrap.className = 'llm-usage-table-wrap';
    var table = document.createElement('table');
    table.className = 'llm-usage-table';
    var head = table.createTHead().insertRow();
    headers.forEach(function(h) { var th = document.createElement('th'); th.textContent = h; head.appendChild(th); });
    var body = table.createTBody();
    rows.forEach(function(r) {
        var tr = body.insertRow();
        r.forEach(function(cell) { tr.insertCell().textContent = cell; });
    });
    wrap.appendChild(table);
    return wrap;
}

/** Group log entries by a key and total them. */
function _llmUsageGroup(entries, keyFn) {
    var groups = {};
    entries.forEach(function(e) {
        var k = keyFn(e);
        var g = groups[k] || (groups[k] = { key: k, calls: 0, input: 0, output: 0, cost: 0, unpriced: 0 });
        g.calls++; g.input += e.inputTokens; g.output += e.outputTokens;
        if (e.estCost == null) g.unpriced++; else g.cost += e.estCost;
    });
    return Object.keys(groups).map(function(k) { return groups[k]; }).sort(function(a, b) { return b.cost - a.cost || b.calls - a.calls; });
}

/** Load the log for the chosen range and draw totals, per-model, per-feature and recent calls. */
async function renderLlmUsage() {
    var body = document.getElementById('llmUsageBody');
    if (!body) return;
    body.textContent = 'Loading…';
    renderLlmBalance();
    try {
        var days = Number(document.getElementById('llmUsageRange').value);
        var query = userCol('llmUsage').orderBy('createdAt', 'desc');
        if (days > 0) {
            var since = new Date();
            since.setHours(0, 0, 0, 0);
            since.setDate(since.getDate() - (days - 1));
            query = query.where('createdAt', '>=', since);
        }
        var snap = await query.limit(3000).get();
        var entries = snap.docs.map(function(d) {
            var e = d.data();
            return { id: d.id, when: e.createdAt && e.createdAt.toDate ? e.createdAt.toDate() : new Date(),
                provider: e.provider || '', model: e.model || 'unknown', feature: e.feature || '',
                inputTokens: e.inputTokens || 0, cachedTokens: e.cachedTokens || 0, outputTokens: e.outputTokens || 0,
                estCost: e.estCost == null ? null : e.estCost };
        });

        // Calls logged before a model had a price are estimated now with the current price.
        var models = await _llmUsageLoadModels();
        var repriced = 0;
        entries.forEach(function(e) {
            if (e.estCost != null) return;
            var c = llmUsageCost(_llmUsageFindPrice(models, e.provider, e.model), e.inputTokens, e.cachedTokens, e.outputTokens);
            if (c != null) { e.estCost = c; repriced++; }
        });

        body.innerHTML = '';
        if (!entries.length) { body.textContent = 'No AI calls logged in this range yet.'; return; }

        var totalCost = 0, unpriced = 0, tin = 0, tout = 0;
        entries.forEach(function(e) { tin += e.inputTokens; tout += e.outputTokens; if (e.estCost == null) unpriced++; else totalCost += e.estCost; });
        var total = document.createElement('div');
        total.className = 'llm-usage-total';
        total.textContent = entries.length + ' calls · ' + _llmFmtNum(tin) + ' input / ' + _llmFmtNum(tout) +
            ' output tokens · about ' + _llmFmtCost(totalCost);
        body.appendChild(total);
        if (unpriced) {
            var warn = document.createElement('p');
            warn.className = 'accordion-desc';
            warn.textContent = unpriced + ' call(s) use models with no saved price, so they are not in the cost. Add prices under Manage models.';
            body.appendChild(warn);
        }
        if (snap.size >= 3000) {
            var cap = document.createElement('p');
            cap.className = 'accordion-desc';
            cap.textContent = 'Showing the 3,000 most recent calls in this range.';
            body.appendChild(cap);
        }

        function groupRows(g) { return [g.key, _llmFmtNum(g.calls), _llmFmtNum(g.input), _llmFmtNum(g.output), _llmFmtCost(g.unpriced === g.calls ? null : g.cost)]; }
        var h3a = document.createElement('h4'); h3a.textContent = 'By model'; body.appendChild(h3a);
        body.appendChild(_llmUsageTable(['Model', 'Calls', 'Input', 'Output', 'Est. cost'],
            _llmUsageGroup(entries, function(e) { return e.model; }).map(groupRows)));
        var h3b = document.createElement('h4'); h3b.textContent = 'By feature'; body.appendChild(h3b);
        body.appendChild(_llmUsageTable(['Feature', 'Calls', 'Input', 'Output', 'Est. cost'],
            _llmUsageGroup(entries, function(e) { return e.feature || 'unknown'; }).map(groupRows)));
        var h3c = document.createElement('h4'); h3c.textContent = 'Recent calls'; body.appendChild(h3c);
        body.appendChild(_llmUsageTable(['When', 'Model', 'Feature', 'In', 'Out', 'Cost'],
            entries.slice(0, 25).map(function(e) {
                return [e.when.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
                    e.model, e.feature, _llmFmtNum(e.inputTokens), _llmFmtNum(e.outputTokens), _llmFmtCost(e.estCost)];
            })));
    } catch (err) {
        body.textContent = 'Could not load usage: ' + err.message;
    }
}

/** Delete every logged call (after confirming). */
async function clearLlmUsage() {
    if (!confirm('Delete the whole AI usage log? This cannot be undone.')) return;
    try {
        var snap = await userCol('llmUsage').get();
        for (var i = 0; i < snap.docs.length; i += 400) {
            var batch = db.batch();
            snap.docs.slice(i, i + 400).forEach(function(d) { batch.delete(d.ref); });
            await batch.commit();
        }
        renderLlmUsage();
    } catch (err) {
        alert('Could not clear the log: ' + err.message);
    }
}

// ============================================================
// Prepaid credit balance
// You enter what your provider's dashboard says you have left. The app then subtracts the
// estimated cost of every logged call made since that moment and warns on the home page
// when the estimate drops below your threshold (default $1). Entering a new balance (or
// adding funds) starts the count again. The estimate leaves out web-search fees, so it
// drifts a little; re-enter the real balance now and then. Stored in settings/llmBalance:
//   { openai: { amount, asOf (ISO), threshold }, grok: { ... } }
// Each change is also written to the `llmBalanceLog` collection (with the estimate it replaced).
// ============================================================

var LLM_BALANCE_PROVIDERS = [{ id: 'openai', name: 'OpenAI' }, { id: 'grok', name: 'Grok (xAI)' }];
var LLM_BALANCE_DEFAULT_THRESHOLD = 1;
var _llmBalanceCfg = null;     // cached settings/llmBalance data
var _llmBalanceCache = {};     // provider -> { at: ms, status }, kept for 60s

function _llmBalanceReset() { _llmBalanceCfg = null; _llmBalanceCache = {}; }

/** "$0.62" or "-$0.10". */
function _llmFmtMoney(n) { return (n < 0 ? '-' : '') + _llmFmtCost(Math.abs(n)); }

async function _llmBalanceLoadCfg() {
    if (_llmBalanceCfg) return _llmBalanceCfg;
    try {
        var doc = await userCol('settings').doc('llmBalance').get();
        _llmBalanceCfg = doc.exists ? doc.data() : {};
    } catch (e) {
        _llmBalanceCfg = {};
    }
    return _llmBalanceCfg;
}

/**
 * Where a provider's balance stands now: { amount, asOf, threshold, spent, remaining, unpriced },
 * or null when no balance has been entered for it.
 */
async function llmBalanceStatus(provider, fresh) {
    var hit = _llmBalanceCache[provider];
    if (!fresh && hit && Date.now() - hit.at < 60000) return hit.status;
    var cfg = await _llmBalanceLoadCfg();
    var b = cfg[provider];
    if (!b || typeof b.amount !== 'number' || !b.asOf) return null;

    var snap = await userCol('llmUsage').where('createdAt', '>=', new Date(b.asOf)).get();
    var models = await _llmUsageLoadModels();
    var spent = 0, unpriced = 0;
    snap.forEach(function(d) {
        var e = d.data();
        if (e.provider !== provider) return;
        var cost = e.estCost;
        if (cost == null) cost = llmUsageCost(_llmUsageFindPrice(models, e.provider, e.model || ''), e.inputTokens || 0, e.cachedTokens || 0, e.outputTokens || 0);
        if (cost == null) unpriced++; else spent += cost;
    });
    var status = { amount: b.amount, asOf: b.asOf, threshold: b.threshold != null ? b.threshold : LLM_BALANCE_DEFAULT_THRESHOLD,
        spent: spent, remaining: b.amount - spent, unpriced: unpriced };
    _llmBalanceCache[provider] = { at: Date.now(), status: status };
    return status;
}

/**
 * Record a new balance. mode 'set' = the number your provider's dashboard shows now;
 * mode 'add' = funds you just added on top of the estimated remaining balance.
 */
async function llmBalanceUpdate(provider, value, mode) {
    var entered = Number(value);
    if (value === '' || !isFinite(entered) || entered < 0) { alert('Enter a dollar amount (zero or more).'); return; }
    var before = await llmBalanceStatus(provider, true);
    var amount = mode === 'add' ? Math.max(before ? before.remaining : 0, 0) + entered : entered;
    amount = Math.round(amount * 1e6) / 1e6;
    var threshold = before ? before.threshold : LLM_BALANCE_DEFAULT_THRESHOLD;
    var asOf = new Date().toISOString();
    try {
        var update = {}; update[provider] = { amount: amount, asOf: asOf, threshold: threshold };
        await userCol('settings').doc('llmBalance').set(update, { merge: true });
        await userCol('llmBalanceLog').add({
            createdAt: firebase.firestore.FieldValue.serverTimestamp(), provider: provider, mode: mode,
            amount: amount, added: mode === 'add' ? entered : null,
            previousEstimate: before ? before.remaining : null   // what the app thought was left, to see how far it drifts
        });
    } catch (err) {
        alert('Could not save the balance: ' + err.message);
        return;
    }
    _llmBalanceReset();
    await renderLlmBalance();
}

/** Change the "warn me below $" amount for a provider that already has a balance. */
async function llmBalanceSetThreshold(provider, value) {
    var n = Number(value);
    if (value === '' || !isFinite(n) || n < 0) { alert('Enter a dollar amount (zero or more).'); return; }
    var cfg = await _llmBalanceLoadCfg();
    if (!cfg[provider]) { alert('Set a balance first.'); return; }
    var update = {}; update[provider] = Object.assign({}, cfg[provider], { threshold: n });
    try { await userCol('settings').doc('llmBalance').set(update, { merge: true }); }
    catch (err) { alert('Could not save: ' + err.message); return; }
    _llmBalanceReset();
    await renderLlmBalance();
}

/** The balance section at the top of Settings -> AI Usage & Cost. */
async function renderLlmBalance() {
    var box = document.getElementById('llmBalanceBox');
    if (!box) return;
    var frag = document.createDocumentFragment();
    var heading = document.createElement('h4');
    heading.textContent = 'Prepaid credit';
    frag.appendChild(heading);
    var help = document.createElement('p');
    help.className = 'accordion-desc';
    help.textContent = 'Enter the balance your provider shows. The app subtracts each logged call from it and warns on the home screen when the estimate gets low. Use “Add funds” after you top up.';
    frag.appendChild(help);

    for (var i = 0; i < LLM_BALANCE_PROVIDERS.length; i++) {
        var p = LLM_BALANCE_PROVIDERS[i];
        frag.appendChild(_llmBalanceRow(p, await llmBalanceStatus(p.id, true)));
    }

    // Last few changes, newest first.
    try {
        var snap = await userCol('llmBalanceLog').orderBy('createdAt', 'desc').limit(5).get();
        if (!snap.empty) {
            var h = document.createElement('h4'); h.textContent = 'Recent balance changes'; frag.appendChild(h);
            frag.appendChild(_llmUsageTable(['When', 'Provider', 'New balance', 'Estimate it replaced'], snap.docs.map(function(d) {
                var e = d.data();
                return [e.createdAt && e.createdAt.toDate ? e.createdAt.toDate().toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '',
                    e.provider, '$' + Number(e.amount).toFixed(2) + (e.added ? ' (added $' + Number(e.added).toFixed(2) + ')' : ''),
                    e.previousEstimate == null ? '—' : _llmFmtMoney(e.previousEstimate)];
            })));
        }
    } catch (e) { /* history is optional */ }
    box.innerHTML = '';
    box.appendChild(frag);
}

function _llmBalanceRow(p, st) {
    var row = document.createElement('div');
    row.className = 'llm-balance-row';
    var title = document.createElement('div');
    title.className = 'llm-balance-title';
    title.textContent = p.name + ': ' + (st ? 'about ' + _llmFmtMoney(st.remaining) + ' left' : 'no balance entered');
    if (st && st.remaining < st.threshold) title.classList.add('llm-balance-low');
    row.appendChild(title);
    if (st) {
        var detail = document.createElement('div');
        detail.className = 'llm-model-note';
        detail.textContent = 'Started at $' + st.amount.toFixed(2) + ' on ' + new Date(st.asOf).toLocaleDateString() +
            ', spent about ' + _llmFmtCost(st.spent) + (st.unpriced ? ' (' + st.unpriced + ' call(s) with no price are not counted)' : '');
        row.appendChild(detail);
    }
    function field(placeholder, buttonText, handler) {
        var wrap = document.createElement('span');
        wrap.className = 'llm-balance-field';
        var input = document.createElement('input');
        input.type = 'number'; input.min = '0'; input.step = 'any'; input.inputMode = 'decimal'; input.placeholder = placeholder;
        var btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'btn btn-secondary btn-sm'; btn.textContent = buttonText;
        btn.onclick = function() { handler(input.value); };
        wrap.appendChild(input); wrap.appendChild(btn);
        return wrap;
    }
    var controls = document.createElement('div');
    controls.className = 'llm-balance-controls';
    controls.appendChild(field('Balance now $', 'Set balance', function(v) { llmBalanceUpdate(p.id, v, 'set'); }));
    if (st) {
        controls.appendChild(field('Funds added $', 'Add funds', function(v) { llmBalanceUpdate(p.id, v, 'add'); }));
        var t = field('Warn below $', 'Save', function(v) { llmBalanceSetThreshold(p.id, v); });
        t.querySelector('input').value = st.threshold;
        controls.appendChild(t);
    }
    row.appendChild(controls);
    return row;
}

/** Home-screen warning when an estimated balance is under its threshold. Called only from the #main route. */
async function llmBalanceBannerRender() {
    var el = document.getElementById('llmBalanceWarning');
    if (!el) return;
    try {
        var messages = [];
        for (var i = 0; i < LLM_BALANCE_PROVIDERS.length; i++) {
            var p = LLM_BALANCE_PROVIDERS[i];
            var st = await llmBalanceStatus(p.id);
            if (st && st.remaining < st.threshold) {
                messages.push(st.remaining <= 0
                    ? p.name + ' credit is probably used up (estimated ' + _llmFmtMoney(st.remaining) + ').'
                    : p.name + ' credit is low: about ' + _llmFmtMoney(st.remaining) + ' left (estimate).');
            }
        }
        el.innerHTML = '';
        if (!messages.length) return;
        var box = document.createElement('div');
        box.className = 'backup-reminder llm-balance-warning';
        var icon = document.createElement('span'); icon.className = 'backup-reminder-icon'; icon.innerHTML = '&#9888;';
        var text = document.createElement('span'); text.className = 'backup-reminder-text'; text.textContent = messages.join(' ');
        var link = document.createElement('a'); link.href = '#settings-general'; link.className = 'btn btn-primary backup-reminder-btn';
        link.textContent = 'Update balance';
        box.appendChild(icon); box.appendChild(text); box.appendChild(link);
        el.appendChild(box);
    } catch (e) { /* the warning is best-effort */ }
}

// ============================================================
// Prepaid credit balance
// You enter what your provider's dashboard says you have left. The app then subtracts the
// estimated cost of every logged call made since that moment and warns on the home page
// when the estimate drops below your threshold (default $1). Entering a new balance (or
// adding funds) starts the count again. The estimate leaves out web-search fees, so it
// drifts a little; re-enter the real balance now and then. Stored in settings/llmBalance:
//   { openai: { amount, asOf (ISO), threshold }, grok: { ... } }
// Each change is also written to the `llmBalanceLog` collection (with the estimate it replaced).
// ============================================================

var LLM_BALANCE_PROVIDERS = [{ id: 'openai', name: 'OpenAI' }, { id: 'grok', name: 'Grok (xAI)' }];
var LLM_BALANCE_DEFAULT_THRESHOLD = 1;
var _llmBalanceCfg = null;     // cached settings/llmBalance data
var _llmBalanceCache = {};     // provider -> { at: ms, status }, kept for 60s

function _llmBalanceReset() { _llmBalanceCfg = null; _llmBalanceCache = {}; }

/** "$0.62" or "-$0.10". */
function _llmFmtMoney(n) { return (n < 0 ? '-' : '') + _llmFmtCost(Math.abs(n)); }

async function _llmBalanceLoadCfg() {
    if (_llmBalanceCfg) return _llmBalanceCfg;
    try {
        var doc = await userCol('settings').doc('llmBalance').get();
        _llmBalanceCfg = doc.exists ? doc.data() : {};
    } catch (e) {
        _llmBalanceCfg = {};
    }
    return _llmBalanceCfg;
}

/**
 * Where a provider's balance stands now: { amount, asOf, threshold, spent, remaining, unpriced },
 * or null when no balance has been entered for it.
 */
async function llmBalanceStatus(provider, fresh) {
    var hit = _llmBalanceCache[provider];
    if (!fresh && hit && Date.now() - hit.at < 60000) return hit.status;
    var cfg = await _llmBalanceLoadCfg();
    var b = cfg[provider];
    if (!b || typeof b.amount !== 'number' || !b.asOf) return null;

    var snap = await userCol('llmUsage').where('createdAt', '>=', new Date(b.asOf)).get();
    var models = await _llmUsageLoadModels();
    var spent = 0, unpriced = 0;
    snap.forEach(function(d) {
        var e = d.data();
        if (e.provider !== provider) return;
        var cost = e.estCost;
        if (cost == null) cost = llmUsageCost(_llmUsageFindPrice(models, e.provider, e.model || ''), e.inputTokens || 0, e.cachedTokens || 0, e.outputTokens || 0);
        if (cost == null) unpriced++; else spent += cost;
    });
    var status = { amount: b.amount, asOf: b.asOf, threshold: b.threshold != null ? b.threshold : LLM_BALANCE_DEFAULT_THRESHOLD,
        spent: spent, remaining: b.amount - spent, unpriced: unpriced };
    _llmBalanceCache[provider] = { at: Date.now(), status: status };
    return status;
}

/**
 * Record a new balance. mode 'set' = the number your provider's dashboard shows now;
 * mode 'add' = funds you just added on top of the estimated remaining balance.
 */
async function llmBalanceUpdate(provider, value, mode) {
    var entered = Number(value);
    if (value === '' || !isFinite(entered) || entered < 0) { alert('Enter a dollar amount (zero or more).'); return; }
    var before = await llmBalanceStatus(provider, true);
    var amount = mode === 'add' ? Math.max(before ? before.remaining : 0, 0) + entered : entered;
    amount = Math.round(amount * 1e6) / 1e6;
    var threshold = before ? before.threshold : LLM_BALANCE_DEFAULT_THRESHOLD;
    var asOf = new Date().toISOString();
    try {
        var update = {}; update[provider] = { amount: amount, asOf: asOf, threshold: threshold };
        await userCol('settings').doc('llmBalance').set(update, { merge: true });
        await userCol('llmBalanceLog').add({
            createdAt: firebase.firestore.FieldValue.serverTimestamp(), provider: provider, mode: mode,
            amount: amount, added: mode === 'add' ? entered : null,
            previousEstimate: before ? before.remaining : null   // what the app thought was left, to see how far it drifts
        });
    } catch (err) {
        alert('Could not save the balance: ' + err.message);
        return;
    }
    _llmBalanceReset();
    await renderLlmBalance();
}

/** Change the "warn me below $" amount for a provider that already has a balance. */
async function llmBalanceSetThreshold(provider, value) {
    var n = Number(value);
    if (value === '' || !isFinite(n) || n < 0) { alert('Enter a dollar amount (zero or more).'); return; }
    var cfg = await _llmBalanceLoadCfg();
    if (!cfg[provider]) { alert('Set a balance first.'); return; }
    var update = {}; update[provider] = Object.assign({}, cfg[provider], { threshold: n });
    try { await userCol('settings').doc('llmBalance').set(update, { merge: true }); }
    catch (err) { alert('Could not save: ' + err.message); return; }
    _llmBalanceReset();
    await renderLlmBalance();
}

/** The balance section at the top of Settings -> AI Usage & Cost. */
async function renderLlmBalance() {
    var box = document.getElementById('llmBalanceBox');
    if (!box) return;
    var frag = document.createDocumentFragment();
    var heading = document.createElement('h4');
    heading.textContent = 'Prepaid credit';
    frag.appendChild(heading);
    var help = document.createElement('p');
    help.className = 'accordion-desc';
    help.textContent = 'Enter the balance your provider shows. The app subtracts each logged call from it and warns on the home screen when the estimate gets low. Use “Add funds” after you top up.';
    frag.appendChild(help);

    for (var i = 0; i < LLM_BALANCE_PROVIDERS.length; i++) {
        var p = LLM_BALANCE_PROVIDERS[i];
        frag.appendChild(_llmBalanceRow(p, await llmBalanceStatus(p.id, true)));
    }

    // Last few changes, newest first.
    try {
        var snap = await userCol('llmBalanceLog').orderBy('createdAt', 'desc').limit(5).get();
        if (!snap.empty) {
            var h = document.createElement('h4'); h.textContent = 'Recent balance changes'; frag.appendChild(h);
            frag.appendChild(_llmUsageTable(['When', 'Provider', 'New balance', 'Estimate it replaced'], snap.docs.map(function(d) {
                var e = d.data();
                return [e.createdAt && e.createdAt.toDate ? e.createdAt.toDate().toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '',
                    e.provider, '$' + Number(e.amount).toFixed(2) + (e.added ? ' (added $' + Number(e.added).toFixed(2) + ')' : ''),
                    e.previousEstimate == null ? '—' : _llmFmtMoney(e.previousEstimate)];
            })));
        }
    } catch (e) { /* history is optional */ }
    box.innerHTML = '';
    box.appendChild(frag);
}

function _llmBalanceRow(p, st) {
    var row = document.createElement('div');
    row.className = 'llm-balance-row';
    var title = document.createElement('div');
    title.className = 'llm-balance-title';
    title.textContent = p.name + ': ' + (st ? 'about ' + _llmFmtMoney(st.remaining) + ' left' : 'no balance entered');
    if (st && st.remaining < st.threshold) title.classList.add('llm-balance-low');
    row.appendChild(title);
    if (st) {
        var detail = document.createElement('div');
        detail.className = 'llm-model-note';
        detail.textContent = 'Started at $' + st.amount.toFixed(2) + ' on ' + new Date(st.asOf).toLocaleDateString() +
            ', spent about ' + _llmFmtCost(st.spent) + (st.unpriced ? ' (' + st.unpriced + ' call(s) with no price are not counted)' : '');
        row.appendChild(detail);
    }
    function field(placeholder, buttonText, handler) {
        var wrap = document.createElement('span');
        wrap.className = 'llm-balance-field';
        var input = document.createElement('input');
        input.type = 'number'; input.min = '0'; input.step = 'any'; input.inputMode = 'decimal'; input.placeholder = placeholder;
        var btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'btn btn-secondary btn-sm'; btn.textContent = buttonText;
        btn.onclick = function() { handler(input.value); };
        wrap.appendChild(input); wrap.appendChild(btn);
        return wrap;
    }
    var controls = document.createElement('div');
    controls.className = 'llm-balance-controls';
    controls.appendChild(field('Balance now $', 'Set balance', function(v) { llmBalanceUpdate(p.id, v, 'set'); }));
    if (st) {
        controls.appendChild(field('Funds added $', 'Add funds', function(v) { llmBalanceUpdate(p.id, v, 'add'); }));
        var t = field('Warn below $', 'Save', function(v) { llmBalanceSetThreshold(p.id, v); });
        t.querySelector('input').value = st.threshold;
        controls.appendChild(t);
    }
    row.appendChild(controls);
    return row;
}

/** Home-screen warning when an estimated balance is under its threshold. Called only from the #main route. */
async function llmBalanceBannerRender() {
    var el = document.getElementById('llmBalanceWarning');
    if (!el) return;
    try {
        var messages = [];
        for (var i = 0; i < LLM_BALANCE_PROVIDERS.length; i++) {
            var p = LLM_BALANCE_PROVIDERS[i];
            var st = await llmBalanceStatus(p.id);
            if (st && st.remaining < st.threshold) {
                messages.push(st.remaining <= 0
                    ? p.name + ' credit is probably used up (estimated ' + _llmFmtMoney(st.remaining) + ').'
                    : p.name + ' credit is low: about ' + _llmFmtMoney(st.remaining) + ' left (estimate).');
            }
        }
        el.innerHTML = '';
        if (!messages.length) return;
        var box = document.createElement('div');
        box.className = 'backup-reminder llm-balance-warning';
        var icon = document.createElement('span'); icon.className = 'backup-reminder-icon'; icon.innerHTML = '&#9888;';
        var text = document.createElement('span'); text.className = 'backup-reminder-text'; text.textContent = messages.join(' ');
        var link = document.createElement('a'); link.href = '#settings-general'; link.className = 'btn btn-primary backup-reminder-btn';
        link.textContent = 'Update balance';
        box.appendChild(icon); box.appendChild(text); box.appendChild(link);
        el.appendChild(box);
    } catch (e) { /* the warning is best-effort */ }
}
