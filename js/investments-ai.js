// ============================================================
// investments-ai.js — AI Investment Analysis
// Two screens: a setup/compose screen (choose data groups +
// prompt) and a results screen (analysis + growing follow-up
// thread). Only the default prompt + all-groups run is cached
// per group in investmentConfig/aiAnalysis_{groupId}; custom
// runs are session-only.
// ============================================================

// ---------- Module State ----------

var _investAiBackRoute    = 'investments'; // where the Back/Cancel buttons return
var _investAiGroupId      = null;          // group currently being analyzed
var _investAiPendingRun   = null;          // hand-off from setup screen to results screen
var _investAiCurrentRun   = null;          // run currently shown on the results screen
var _investAiLastCachedRun = null;         // cached default run, shown on the setup screen

// ---------- Data Groups ----------

var _INVEST_AI_GROUPS = [
    { key: 'household', label: 'Household Members & Ages' },
    { key: 'accounts',  label: 'Accounts & Holdings' },
    { key: 'ss',        label: 'Social Security' },
    { key: 'budgets',   label: 'Budgets' },
    { key: 'retireCfg', label: 'Retirement Config (return rate, after-tax %, retirement ages)' }
];
var _INVEST_AI_ALL_KEYS = _INVEST_AI_GROUPS.map(function(g) { return g.key; });

// ---------- Default System Prompt ----------

var _INVEST_AI_SYSTEM = [
    'You are a personal financial analysis assistant. The user will provide a JSON snapshot of their household financial picture.',
    'Your job is to analyze that data and produce a clear, honest, plain-English assessment — written like a knowledgeable friend who understands retirement planning, not like a formal financial advisor.',
    '',
    'Be direct. If something looks good, say so. If something looks concerning, say that too.',
    'Do not hedge every sentence with disclaimers. One brief disclaimer at the very end of your response is sufficient.',
    '',
    'Use dollar amounts, percentages, and ages from the data — show your math in plain terms when it adds clarity.',
    'Use the projectedRoR value from the JSON as the expected annual return. Do not substitute the 4% rule or any other default.',
    'Do not make up numbers that are not in the data. If a section below depends on data that was not provided, say so briefly instead of guessing, or skip that section.',
    '',
    'Structure your response exactly as follows:',
    '',
    '**Summary**',
    'Two to four sentences. The big picture — are they in good shape, behind, or somewhere in between? What is the most important thing to know?',
    '',
    '---',
    '',
    '**1. Retirement Readiness**',
    'Using the configured return rate and after-tax percentage from the JSON, project whether the portfolio is on track to support retirement at each person\'s configured retirement age.',
    'Show the math briefly: projected portfolio value at retirement, annual income it generates, and how that compares to each budget scenario.',
    '',
    '**2. Budget Gap Analysis**',
    'For each budget listed, calculate the projected income gap or surplus at retirement.',
    'Income sources: Social Security (at each person\'s configured retirement age) plus portfolio withdrawals using the configured RoR.',
    'Show the gap per budget scenario so they can see which lifestyle is feasible.',
    '',
    '**3. Social Security Strategy**',
    'Look at the SS breakpoints for each person. Does waiting from 62 to 67 or 67 to 70 make a meaningful difference given their ages and portfolio size?',
    'Flag whether early claiming or delayed claiming makes more sense given the data.',
    '',
    '**4. Portfolio Composition**',
    'Comment on the Roth vs. Pre-Tax vs. Brokerage vs. Cash split.',
    'Is the mix appropriate for their age and timeline? Flag any obvious tax diversification gaps (e.g., heavily pre-tax with no Roth, meaning all withdrawals will be taxed).',
    '',
    '**5. Concentration Risk**',
    'Look at the top holdings. Flag any position representing more than ~15-20% of total portfolio value.',
    'Also note if accounts are overly concentrated in one person\'s name.',
    '',
    '**6. Cash Position**',
    'How much is in cash or investment cash (pending deployment)?',
    'Is that appropriate as a buffer, or excessive relative to their spending and portfolio size?',
    '',
    '**7. Key Observations**',
    'Anything else worth flagging that does not fit neatly above. Skip this section if nothing stands out.',
    '',
    '---',
    '',
    '*Brief disclaimer: This is an automated analysis based on the data provided. It is not professional financial advice. Consult a licensed advisor for decisions with significant consequences.*'
].join('\n');

// ---------- Setup / Compose Page ----------

async function loadInvestmentsAiSetupPage() {
    document.getElementById('breadcrumbBar').innerHTML =
        '<a href="#investments">Financial</a>' +
        '<span class="separator">&rsaquo;</span>' +
        '<span>Ask AI</span>';
    document.getElementById('headerTitle').innerHTML =
        '<a href="#main" class="home-link">' + escapeHtml(window.appName || 'My Life') + '</a>';

    var page = document.getElementById('page-investments-ai-setup');
    if (!page) return;
    page.innerHTML = '<p class="muted-text">Loading…</p>';

    await _investLoadGroups();
    await _investLoadConfig();
    await _investLoadAll();

    if (!_investAiGroupId) {
        _investAiGroupId = _investActiveGroupId ||
            localStorage.getItem('investActiveGroupId') ||
            (_investGroups.length > 0 ? _investGroups[0].id : null);
    }

    _investAiLastCachedRun = await _investAiLoadCache(_investAiGroupId);

    _investAiSetupRender();
}

function _investAiSetupRender() {
    var page = document.getElementById('page-investments-ai-setup');
    if (!page) return;

    var group     = _investGroups.find(function(g) { return g.id === _investAiGroupId; });
    var groupName = group ? group.name : 'Unknown Group';

    var groupsHtml = _INVEST_AI_GROUPS.map(function(g) {
        return '<label class="invest-ai-group-check">' +
            '<input type="checkbox" class="invest-ai-group-checkbox" data-group="' + g.key + '" checked disabled> ' +
            escapeHtml(g.label) +
        '</label>';
    }).join('');

    var cachedHtml = '';
    if (_investAiLastCachedRun && _investAiLastCachedRun.messages && _investAiLastCachedRun.messages[2]) {
        var runAt = _investAiLastCachedRun.runAt ? new Date(_investAiLastCachedRun.runAt).toLocaleString() : '';
        cachedHtml =
            '<div class="invest-ai-divider"><span>Last Analysis</span></div>' +
            '<div class="invest-ai-cached-notice">' +
                '<span>' +
                    'Default analysis for <strong>' + escapeHtml(_investAiLastCachedRun.groupName || groupName) + '</strong>' +
                    (runAt ? ' — run ' + escapeHtml(runAt) : '') +
                '</span>' +
                '<div class="invest-ai-cached-actions">' +
                    '<button class="btn btn-secondary btn-small" onclick="_investAiViewLastDefault()">View</button>' +
                    '<button class="btn btn-secondary btn-small" onclick="_investAiRerunDefault()">Re-run Default</button>' +
                '</div>' +
            '</div>';
    }

    page.innerHTML =
        '<div class="page-header">' +
            '<button class="btn btn-secondary btn-small" onclick="location.hash=\'' + escapeHtml(_investAiBackRoute) + '\'">&larr; Back</button>' +
            '<h2>🤖 Ask AI</h2>' +
        '</div>' +
        '<div class="invest-ai-group-name muted-text">' + escapeHtml(groupName) + '</div>' +

        '<div class="invest-ai-setup-section">' +
            '<label class="invest-ai-setup-label">Include data</label>' +
            '<div class="invest-ai-groups-list">' + groupsHtml + '</div>' +

            '<div class="invest-ai-prompt-actions">' +
                '<button type="button" class="btn btn-secondary btn-small" onclick="_investAiClearPrompt()">Clear</button>' +
                '<button type="button" class="btn btn-secondary btn-small" onclick="_investAiLoadDefaultPrompt()">Load Default Prompt</button>' +
            '</div>' +
            '<div class="form-group">' +
                '<label>Prompt</label>' +
                '<textarea id="investAiPromptBox" rows="14">' + escapeHtml(_INVEST_AI_SYSTEM) + '</textarea>' +
            '</div>' +
        '</div>' +

        '<div id="investAiSetupStatus"></div>' +

        '<div class="invest-ai-setup-buttons">' +
            '<button class="btn btn-secondary" onclick="location.hash=\'' + escapeHtml(_investAiBackRoute) + '\'">Cancel</button>' +
            '<button class="btn btn-primary" id="investAiAskBtn" onclick="_investAiSubmit()">✨ Ask AI</button>' +
        '</div>' +
        cachedHtml;
}

// Unlocks the data-group checkboxes so the user can opt specific groups out
// while writing a custom prompt.
function _investAiClearPrompt() {
    var box = document.getElementById('investAiPromptBox');
    if (box) box.value = '';
    document.querySelectorAll('.invest-ai-group-checkbox').forEach(function(cb) {
        cb.disabled = false;
    });
}

// Restores the canonical prompt and re-locks all groups as included — the
// default prompt's fixed sections assume every data group is present.
function _investAiLoadDefaultPrompt() {
    var box = document.getElementById('investAiPromptBox');
    if (box) box.value = _INVEST_AI_SYSTEM;
    document.querySelectorAll('.invest-ai-group-checkbox').forEach(function(cb) {
        cb.checked  = true;
        cb.disabled = true;
    });
}

function _investAiViewLastDefault() {
    _investAiPendingRun = _investAiLastCachedRun;
    location.hash = 'investments/ai-analysis';
}

async function _investAiSubmit() {
    var btn      = document.getElementById('investAiAskBtn');
    var statusEl = document.getElementById('investAiSetupStatus');
    var box      = document.getElementById('investAiPromptBox');
    var promptText = (box ? box.value : '').trim();

    if (!promptText) {
        if (statusEl) statusEl.innerHTML =
            '<p class="error-text">Enter a prompt, or click "Load Default Prompt".</p>';
        return;
    }

    var checkboxes = Array.prototype.slice.call(document.querySelectorAll('.invest-ai-group-checkbox'));
    var includedGroups = checkboxes.filter(function(cb) { return cb.checked; })
        .map(function(cb) { return cb.dataset.group; });
    var isDefault = (promptText === _INVEST_AI_SYSTEM.trim()) &&
        (includedGroups.length === _INVEST_AI_GROUPS.length);

    if (btn) { btn.disabled = true; btn.textContent = '⏳ Analyzing…'; }
    if (statusEl) statusEl.innerHTML =
        '<div class="invest-ai-loading">⏳ Analyzing your portfolio — this may take 15–30 seconds…</div>';

    try {
        var run = await _investAiRunNewAnalysis(promptText, includedGroups, isDefault);
        _investAiPendingRun = run;
        location.hash = 'investments/ai-analysis';
    } catch (err) {
        if (statusEl) statusEl.innerHTML =
            '<p class="error-text">Error: ' + escapeHtml(err.message) + '</p>';
        if (btn) { btn.disabled = false; btn.textContent = '✨ Ask AI'; }
    }
}

// Builds the payload, calls the LLM, and returns a run object. Saves to the
// per-group cache only when isDefault is true.
async function _investAiRunNewAnalysis(promptText, includedGroups, isDefault) {
    var payload = await _investAiBuildPayload(_investAiGroupId, includedGroups);
    var userMsg = 'Here is my financial data:\n```json\n' + JSON.stringify(payload, null, 2) + '\n```';

    var messages = [
        { role: 'system', content: promptText },
        { role: 'user',   content: userMsg }
    ];
    var responseText = await _investAiCallLLM(messages);
    messages.push({ role: 'assistant', content: responseText });

    var groupName = ((_investGroups.find(function(g) { return g.id === _investAiGroupId; })) || {}).name || '';
    var excludedLabels = _INVEST_AI_GROUPS
        .filter(function(g) { return includedGroups.indexOf(g.key) < 0; })
        .map(function(g) { return g.label; });

    var run = {
        messages      : messages,
        excludedLabels: excludedLabels,
        isDefault     : isDefault,
        groupId       : _investAiGroupId,
        groupName     : groupName,
        asOfDate      : payload.asOfDate,
        runAt         : new Date().toISOString()
    };

    if (isDefault) {
        await _investAiSaveCache(_investAiGroupId, run);
        _investAiLastCachedRun = run;
    }

    return run;
}

// Always runs the canonical default prompt against every data group,
// overwriting the persisted cache. Callable from either the setup screen or
// the results screen — updates in place if already on the results screen.
async function _investAiRerunDefault() {
    var resultsPage = document.getElementById('page-investments-ai');
    var onResultsPage = resultsPage && !resultsPage.classList.contains('hidden');
    var busyEl = onResultsPage ? resultsPage : document.getElementById('page-investments-ai-setup');
    var prevHtml = busyEl ? busyEl.innerHTML : '';
    if (busyEl) busyEl.innerHTML = '<p class="muted-text">⏳ Running default analysis…</p>';

    try {
        var run = await _investAiRunNewAnalysis(_INVEST_AI_SYSTEM, _INVEST_AI_ALL_KEYS, true);
        _investAiCurrentRun = run;

        if (onResultsPage) {
            _investAiRenderResults();
        } else {
            _investAiPendingRun = run;
            location.hash = 'investments/ai-analysis';
        }
    } catch (err) {
        if (busyEl) busyEl.innerHTML = prevHtml;
        alert('Error running default analysis: ' + err.message);
    }
}

// ---------- Results Page ----------

async function loadInvestmentsAiPage() {
    document.getElementById('breadcrumbBar').innerHTML =
        '<a href="#investments">Financial</a>' +
        '<span class="separator">&rsaquo;</span>' +
        '<span>AI Analysis</span>';
    document.getElementById('headerTitle').innerHTML =
        '<a href="#main" class="home-link">' + escapeHtml(window.appName || 'My Life') + '</a>';

    var page = document.getElementById('page-investments-ai');
    if (!page) return;
    page.innerHTML = '<p class="muted-text">Loading…</p>';

    await _investLoadGroups();
    await _investLoadConfig();
    await _investLoadAll();

    if (!_investAiGroupId) {
        _investAiGroupId = _investActiveGroupId ||
            localStorage.getItem('investActiveGroupId') ||
            (_investGroups.length > 0 ? _investGroups[0].id : null);
    }

    if (_investAiPendingRun) {
        _investAiCurrentRun = _investAiPendingRun;
        _investAiPendingRun = null;
    } else if (!_investAiCurrentRun) {
        _investAiCurrentRun = await _investAiLoadCache(_investAiGroupId);
    }

    _investAiRenderResults();
}

function _investAiRenderResults() {
    var page = document.getElementById('page-investments-ai');
    if (!page) return;

    var run = _investAiCurrentRun;
    if (!run || !run.messages || !run.messages[2]) {
        page.innerHTML =
            '<div class="page-header">' +
                '<button class="btn btn-secondary btn-small" onclick="location.hash=\'' + escapeHtml(_investAiBackRoute) + '\'">&larr; Back</button>' +
                '<h2>🤖 AI Analysis</h2>' +
            '</div>' +
            '<p class="muted-text">No analysis yet. <a href="#investments/ai-setup">Ask a question</a> to get started.</p>';
        return;
    }

    var runAtStr = run.runAt ? new Date(run.runAt).toLocaleString() : '';
    var excludedHtml = (run.excludedLabels && run.excludedLabels.length)
        ? '<div class="invest-ai-excluded-badge">Excluded from this analysis: ' + escapeHtml(run.excludedLabels.join(', ')) + '</div>'
        : '';

    // messages[0] = system prompt, [1] = data message, [2] = initial analysis.
    // From index 3 on, alternating user/assistant follow-up turns.
    var initialAnalysis = run.messages[2].content || '';
    var threadHtml = '';
    for (var i = 3; i < run.messages.length; i += 2) {
        var q = run.messages[i]     ? run.messages[i].content     : '';
        var a = run.messages[i + 1] ? run.messages[i + 1].content : '';
        threadHtml +=
            '<div class="invest-ai-followup-response">' +
                '<div class="invest-ai-followup-q"><strong>Q:</strong> ' + escapeHtml(q) + '</div>' +
                (a
                    ? '<div class="invest-ai-followup-a">' + marked.parse(a) + '</div>'
                    : '<div class="invest-ai-loading">⏳ Thinking…</div>') +
            '</div>';
    }

    page.innerHTML =
        '<div class="page-header">' +
            '<button class="btn btn-secondary btn-small" onclick="location.hash=\'' + escapeHtml(_investAiBackRoute) + '\'">&larr; Back</button>' +
            '<h2>🤖 AI Analysis</h2>' +
        '</div>' +
        '<div class="invest-ai-group-name muted-text">' +
            escapeHtml(run.groupName || 'Unknown Group') +
            (runAtStr ? ' — run ' + escapeHtml(runAtStr) : '') +
        '</div>' +
        excludedHtml +
        '<div class="invest-ai-result-actions">' +
            '<a class="btn btn-secondary btn-small" href="#investments/ai-setup">New Question</a>' +
            '<button class="btn btn-secondary btn-small" onclick="_investAiRerunDefault()">Re-run Default</button>' +
        '</div>' +
        '<div class="invest-ai-response">' + marked.parse(initialAnalysis) + '</div>' +
        '<div id="investAiThread">' + threadHtml + '</div>' +
        '<div class="invest-ai-followup-section">' +
            '<div class="form-group">' +
                '<label>Ask a follow-up question</label>' +
                '<textarea id="investAiFollowup" rows="3" ' +
                    'placeholder="e.g. Should I convert some pre-tax to Roth now?"></textarea>' +
            '</div>' +
            '<button class="btn btn-secondary btn-small" id="investAiFollowupBtn" ' +
                'onclick="_investAiRunFollowUp()">Ask follow-up</button>' +
        '</div>' +
        '<div id="investAiFollowupStatus"></div>';
}

async function _investAiRunFollowUp() {
    var followupEl = document.getElementById('investAiFollowup');
    var statusEl   = document.getElementById('investAiFollowupStatus');
    var btn        = document.getElementById('investAiFollowupBtn');
    if (!followupEl || !_investAiCurrentRun) return;

    var question = followupEl.value.trim();
    if (!question) { followupEl.focus(); return; }

    var run = _investAiCurrentRun;
    run.messages.push({ role: 'user', content: question });

    if (btn) { btn.disabled = true; btn.textContent = 'Thinking…'; }
    if (statusEl) statusEl.innerHTML = '<div class="invest-ai-loading">⏳ Thinking…</div>';

    try {
        var responseText = await _investAiCallLLM(run.messages);
        run.messages.push({ role: 'assistant', content: responseText });

        if (run.isDefault) {
            await _investAiSaveCache(run.groupId, run);
            _investAiLastCachedRun = run;
        }

        followupEl.value = '';
        if (statusEl) statusEl.innerHTML = '';
        _investAiRenderResults();
    } catch (err) {
        run.messages.pop(); // drop the unanswered question so a retry is clean
        if (statusEl) statusEl.innerHTML =
            '<p class="error-text">Error: ' + escapeHtml(err.message) + '</p>';
        if (btn) { btn.disabled = false; btn.textContent = 'Ask follow-up'; }
    }
}

// ---------- LLM HTTP Call ----------

async function _investAiCallLLM(messages) {
    var doc = await userCol('settings').doc('llm').get();
    if (!doc.exists) throw new Error('LLM not configured. Go to Settings → AI to add your API key.');

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
            model                : model || ep.model,
            messages             : messages,
            max_completion_tokens: 4000
        })
    });

    if (!res.ok) {
        var errData = await res.json().catch(function() { return {}; });
        throw new Error((errData.error && errData.error.message) || 'LLM error: HTTP ' + res.status);
    }
    var data = await res.json();
    return data.choices[0].message.content;
}

// ---------- Cache Helpers ----------

async function _investAiLoadCache(groupId) {
    try {
        var doc = await userCol('investmentConfig').doc('aiAnalysis_' + groupId).get();
        return doc.exists ? doc.data() : null;
    } catch (e) {
        return null;
    }
}

async function _investAiSaveCache(groupId, data) {
    await userCol('investmentConfig').doc('aiAnalysis_' + groupId).set(data);
}

// ---------- Payload Builder ----------

async function _investAiBuildPayload(groupId, includedGroupKeys) {
    includedGroupKeys = includedGroupKeys || _INVEST_AI_ALL_KEYS;
    function has(key) { return includedGroupKeys.indexOf(key) >= 0; }

    var group = _investGroups.find(function(g) { return g.id === groupId; });
    if (!group) throw new Error('Group not found.');

    var today     = new Date();
    var todayStr  = today.toISOString().slice(0, 10);
    var personIds = group.personIds || ['self'];

    // Person display names — used for account owners and SS entries regardless
    // of whether the Household group itself is included.
    var personNames = { self: 'Me' };
    (_investPeople || []).forEach(function(p) { personNames[p.id] = p.name; });

    var payload = { asOfDate: todayStr, group: { name: group.name } };

    // ---------- Household Members & Ages ----------
    if (has('household')) {
        var personAges = {};
        var meAgeInfo  = await _investGetMeAge();
        if (meAgeInfo.age !== undefined) personAges['self'] = meAgeInfo.age;

        for (var pi = 0; pi < personIds.length; pi++) {
            var pid = personIds[pi];
            if (pid === 'self' || personAges[pid] !== undefined) continue;
            try {
                var dSnap = await userCol('peopleImportantDates').where('personId', '==', pid).get();
                dSnap.forEach(function(d) {
                    var lbl = (d.data().label || '').toLowerCase().replace(/\s+/g, '');
                    if ((lbl === 'birthday' || lbl === 'bday' || lbl === 'birthdate') && d.data().year) {
                        var age = today.getFullYear() - parseInt(d.data().year);
                        var m = d.data().month || 0, dy = d.data().day || 0;
                        if (m && dy && (today.getMonth() + 1 < m ||
                            (today.getMonth() + 1 === m && today.getDate() < dy))) age--;
                        personAges[pid] = age;
                    }
                });
            } catch (e) { /* skip — age stays null */ }
        }

        var retireAges = _investConfig.retirementAges || {};
        payload.group.members = personIds.map(function(pid) {
            var currentAge = (personAges[pid] !== undefined) ? personAges[pid] : null;
            var member = { label: personNames[pid] || pid, currentAge: currentAge };
            if (has('retireCfg')) {
                var retireAge = retireAges[pid] ? parseInt(retireAges[pid]) : null;
                member.retirementAge     = retireAge;
                member.yearsToRetirement = (currentAge !== null && retireAge) ? Math.max(0, retireAge - currentAge) : null;
            }
            return member;
        });
    }

    // ---------- Accounts & Holdings ----------
    if (has('accounts')) {
        var accounts      = await _investLoadGroupAccounts(group);
        var cats          = _investComputeGroupTotals(accounts);
        var holdingRollup = {};

        var accountList = accounts.map(function(acct) {
            var holdings = (acct._holdings || []).map(function(h) {
                var value          = (h.shares || 0) * (h.lastPrice || 0);
                var costBasisTotal = (h.costBasis != null && h.shares != null)
                    ? Math.round(h.costBasis * h.shares * 100) / 100
                    : null;
                if (h.ticker) {
                    if (!holdingRollup[h.ticker]) {
                        holdingRollup[h.ticker] = { companyName: h.companyName || '', totalValue: 0 };
                    }
                    holdingRollup[h.ticker].totalValue += value;
                }
                var holding = {
                    ticker          : h.ticker      || '',
                    companyName     : h.companyName || '',
                    shares          : h.shares      || 0,
                    lastPrice       : h.lastPrice   || 0,
                    value           : Math.round(value * 100) / 100
                };
                if (costBasisTotal !== null) {
                    holding.costBasisPerShare  = Math.round(h.costBasis * 100) / 100;
                    holding.totalCostBasis     = costBasisTotal;
                    holding.estimatedGainLoss  = Math.round((value - costBasisTotal) * 100) / 100;
                }
                return holding;
            });
            return {
                name       : acct.nickname || '(untitled)',
                type       : _investTypeLabel(acct.accountType || ''),
                owner      : personNames[acct._ns] || acct._ns,
                cashBalance: acct.cashBalance || 0,
                holdings   : holdings
            };
        });

        var totalValue  = cats.netWorth;
        var topHoldings = Object.keys(holdingRollup).map(function(ticker) {
            return {
                ticker        : ticker,
                companyName   : holdingRollup[ticker].companyName,
                totalValue    : Math.round(holdingRollup[ticker].totalValue * 100) / 100,
                pctOfPortfolio: totalValue > 0
                    ? Math.round(holdingRollup[ticker].totalValue / totalValue * 1000) / 10
                    : 0
            };
        }).sort(function(a, b) { return b.totalValue - a.totalValue; }).slice(0, 15);

        payload.portfolioSummary = {
            totalValue       : Math.round(totalValue * 100) / 100,
            byCategory       : {
                roth          : Math.round(cats.roth      * 100) / 100,
                preTax        : Math.round(cats.preTax    * 100) / 100,
                brokerage     : cats.brokerageCostBasisKnown ? {
                    total               : Math.round(cats.brokerage * 100) / 100,
                    costBasis           : Math.round(cats.brokerageCostBasisTotal * 100) / 100,
                    estimatedTaxableGain: Math.round((cats.brokerage - cats.brokerageCostBasisTotal) * 100) / 100
                } : Math.round(cats.brokerage * 100) / 100,
                cash          : Math.round(cats.cash      * 100) / 100,
                investmentCash: Math.round(cats.invCash   * 100) / 100
            },
            topHoldingsByValue: topHoldings
        };
        payload.accounts = accountList;
    }

    // ---------- Social Security ----------
    if (has('ss')) {
        var allSsSnap  = await userCol('ssBenefits').get();
        var ssByPerson = {};
        allSsSnap.forEach(function(d) {
            var data = d.data();
            if (!ssByPerson[data.personId]) ssByPerson[data.personId] = [];
            ssByPerson[data.personId].push(data);
        });
        Object.keys(ssByPerson).forEach(function(pid) {
            ssByPerson[pid].sort(function(a, b) {
                return (b.asOfDate || '').localeCompare(a.asOfDate || '');
            });
        });

        payload.socialSecurity = personIds
            .filter(function(pid) { return ssByPerson[pid] && ssByPerson[pid].length > 0; })
            .map(function(pid) {
                var entries = (ssByPerson[pid][0].entries || [])
                    .map(function(e) {
                        return { claimAge: parseInt(e.age), monthly: parseFloat(e.monthly) || 0 };
                    })
                    .sort(function(a, b) { return a.claimAge - b.claimAge; });
                return { person: personNames[pid] || pid, benefits: entries };
            });
    }

    // ---------- Budgets ----------
    if (has('budgets')) {
        var budgetSnap      = await userCol('budgets').where('isArchived', '==', false).get();
        var appSettingsDoc  = await userCol('settings').doc('app').get().catch(function() { return { exists: false, data: function() { return {}; } }; });
        var defaultBudgetId = _investConfig.selectedBudgetId ||
            (appSettingsDoc.exists ? (appSettingsDoc.data().defaultBudgetId || null) : null);

        var budgets = [];
        for (var bi = 0; bi < budgetSnap.docs.length; bi++) {
            var bDoc    = budgetSnap.docs[bi];
            var bData   = bDoc.data();
            var bRes    = await Promise.all([
                bDoc.ref.collection('categories').orderBy('sortOrder').get(),
                bDoc.ref.collection('lineItems').get()
            ]);
            var catsSnap  = bRes[0];
            var itemsSnap = bRes[1];

            var catMap = {};
            catsSnap.docs.forEach(function(cd) {
                catMap[cd.id] = { name: cd.data().name || '', monthly: 0 };
            });
            var monthlyTotal = 0;
            itemsSnap.docs.forEach(function(id) {
                var item = id.data();
                var amt  = parseFloat(item.amount) || 0;
                monthlyTotal += amt;
                if (catMap[item.categoryId]) catMap[item.categoryId].monthly += amt;
            });

            budgets.push({
                name        : bData.name || 'Budget',
                monthlyTotal: Math.round(monthlyTotal * 100) / 100,
                annualTotal : Math.round(monthlyTotal * 12 * 100) / 100,
                isDefault   : bDoc.id === defaultBudgetId,
                categories  : Object.values(catMap)
                    .filter(function(c) { return c.monthly > 0; })
                    .map(function(c) {
                        return { name: c.name, monthly: Math.round(c.monthly * 100) / 100 };
                    })
            });
        }
        payload.budgets = budgets;
    }

    // ---------- Retirement Config ----------
    if (has('retireCfg')) {
        payload.investmentConfig = {
            projectedRoR: _investConfig.projectedRoR || 0.06,
            afterTaxPct : _investConfig.afterTaxPct  || 0.82
        };
    }

    return payload;
}
