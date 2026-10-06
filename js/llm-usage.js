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
