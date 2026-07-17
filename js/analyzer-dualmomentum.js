'use strict';

// ---------------------------------------------------------------------------
// Dual Momentum strategy (#analyzer/dualmomentum)
// ---------------------------------------------------------------------------
// Plan document: TradingStrategiesPlan.md (sections 5.1, 6.1, 7.1).
// The GEM rules, frozen: once a month compare the trailing 12-month TOTAL
// return (dividends included) of SPY, VEU, and BIL. If SPY <= BIL → hold
// cash (BIL). Otherwise hold whichever of SPY / VEU is higher.
//
// The official signal is computed at each month close. Any visit during the
// following month computes and logs that month-end signal exactly once
// (doc id = the signal month, so logging is idempotent). The log is this
// strategy's Scoreboard: every signal is graded later against what happened.
//
// Data note: the shared Analyzer price cache stores split-adjusted closes
// WITHOUT dividends — useless for total return (BIL's entire return is
// dividends). So this module fetches its own dividend-adjusted ("adjclose")
// series from Yahoo for just the three tickers, reduced to month-end values
// and day-cached in localStorage.
// ---------------------------------------------------------------------------

var DM_TICKERS   = ['SPY', 'VEU', 'BIL'];
var DM_CACHE_KEY = 'dmPriceCache_v1';
var DM_LABELS    = { SPY: 'US stocks (SPY)', VEU: 'International stocks (VEU)', BIL: 'Cash / T-bills (BIL)' };
var DM_VERDICT_LABELS = { SPY: '📈 HOLD US STOCKS (SPY)', VEU: '🌍 HOLD INTERNATIONAL (VEU)', CASH: '🛡️ HOLD CASH (BIL)' };

// ---------------------------------------------------------------------------
// Data: dividend-adjusted month-end series
// ---------------------------------------------------------------------------

// Parses a Yahoo v8/chart response into a month-end series of dividend-
// adjusted closes: [{month:'YYYY-MM', date:'YYYY-MM-DD', value}]. The last
// entry is the CURRENT (possibly incomplete) month — its value is simply the
// latest trading day fetched.
function _dmParseToMonthEnds(data) {
    var result = data && data.chart && data.chart.result && data.chart.result[0];
    if (!result || !result.timestamp || !result.indicators) throw new Error('unexpected chart response shape');
    var ts  = result.timestamp;
    var adj = result.indicators.adjclose && result.indicators.adjclose[0] &&
              result.indicators.adjclose[0].adjclose;
    var q   = result.indicators.quote && result.indicators.quote[0];
    if (!adj) {
        console.warn('[dualmomentum] no adjclose in response — falling back to raw close (returns will miss dividends)');
        adj = q && q.close;
    }
    if (!adj) throw new Error('no usable price series in response');

    var series = [];
    for (var i = 0; i < ts.length; i++) {
        var v = adj[i];
        if (v == null) continue;
        var date  = new Date(ts[i] * 1000).toISOString().slice(0, 10);
        var month = date.slice(0, 7);
        if (series.length && series[series.length - 1].month === month) {
            series[series.length - 1].date  = date;   // later day in the same month wins
            series[series.length - 1].value = v;
        } else {
            series.push({ month: month, date: date, value: v });
        }
    }
    if (series.length === 0) throw new Error('no usable candles in response');
    return series;
}

// The signal needs the month-end 12 months before last month's close —
// 13 months of history. Any source returning less (some proxies ignore the
// range parameter and serve a stub) is rejected so the next source is tried.
var DM_MIN_MONTHS = 14;   // 13 required + 1 slack

// Fetches 2y of daily history for one ticker and reduces to month-ends.
// Same worker → proxy chain as analyzer-data.js, but keeps adjclose.
async function _dmFetchMonthEnds(ticker) {
    var target = 'https://query1.finance.yahoo.com/v8/finance/chart/' +
                 encodeURIComponent(ticker) + '?interval=1d&range=2y';

    var workerUrl = (typeof _investGetYahooWorkerUrl === 'function')
        ? await _investGetYahooWorkerUrl() : '';
    if (workerUrl) {
        try {
            var base = workerUrl.replace(/\/$/, '');
            var resp = await _anaFetchWithTimeout(base + '?ticker=' + encodeURIComponent(ticker) +
                                   '&range=2y&interval=1d', 12000);
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            var series = _dmParseToMonthEnds(await resp.json());
            if (series.length >= DM_MIN_MONTHS) return series;
            console.log('[dualmomentum] worker returned only ' + series.length + ' months for ' + ticker + ' — falling back to proxies');
        } catch (e) {
            console.log('[dualmomentum] worker fetch failed for ' + ticker + ': ' + e.message);
        }
    }

    var proxies = [
        'https://api.allorigins.win/raw?url=' + encodeURIComponent(target),
        'https://corsproxy.io/?' + encodeURIComponent(target),
        'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(target)
    ];
    var lastErr = null;
    for (var i = 0; i < proxies.length; i++) {
        try {
            var resp2 = await _anaFetchWithTimeout(proxies[i], 10000);
            if (!resp2.ok) throw new Error('HTTP ' + resp2.status);
            var series2 = _dmParseToMonthEnds(await resp2.json());
            if (series2.length >= DM_MIN_MONTHS) return series2;
            throw new Error('only ' + series2.length + ' months of history returned (need ' + DM_MIN_MONTHS + ')');
        } catch (e) {
            lastErr = e;
            console.log('[dualmomentum] proxy ' + i + ' failed for ' + ticker + ': ' + e.message);
        }
    }
    throw lastErr || new Error('all fetch paths failed for ' + ticker);
}

// All three series, day-cached in localStorage (tiny: ~25 month-ends each).
async function _dmGetSeries(forceRefresh) {
    var today = new Date().toISOString().slice(0, 10);
    if (!forceRefresh) {
        try {
            var cached = JSON.parse(localStorage.getItem(DM_CACHE_KEY) || 'null');
            if (cached && cached.fetched === today && cached.series &&
                DM_TICKERS.every(function(t) {
                    return Array.isArray(cached.series[t]) && cached.series[t].length >= DM_MIN_MONTHS;
                })) {
                return cached.series;
            }
        } catch (e) { /* corrupt cache — refetch */ }
    }
    var results = await Promise.all(DM_TICKERS.map(function(t) { return _dmFetchMonthEnds(t); }));
    var series = {};
    DM_TICKERS.forEach(function(t, i) { series[t] = results[i]; });
    try { localStorage.setItem(DM_CACHE_KEY, JSON.stringify({ fetched: today, series: series })); } catch (e) {}
    return series;
}

// ---------------------------------------------------------------------------
// Signal computation
// ---------------------------------------------------------------------------

// 'YYYY-MM' minus n months.
function _dmMonthMinus(month, n) {
    var y = parseInt(month.slice(0, 4), 10), m = parseInt(month.slice(5, 7), 10) - 1 - n;
    var d = new Date(Date.UTC(y, m, 1));
    return d.toISOString().slice(0, 7);
}

function _dmEntryFor(series, month) {
    for (var i = series.length - 1; i >= 0; i--) {
        if (series[i].month === month) return series[i];
    }
    return null;
}

// Trailing 12-month total return ending at `month`'s close, or null.
function _dmTwelveMonthReturn(series, month) {
    var now  = _dmEntryFor(series, month);
    var then = _dmEntryFor(series, _dmMonthMinus(month, 12));
    if (!now || !then || !(then.value > 0)) return null;
    return now.value / then.value - 1;
}

// The GEM verdict from three returns: 'SPY' | 'VEU' | 'CASH'.
function _dmVerdict(retSpy, retVeu, retBil) {
    if (retSpy == null || retBil == null) return null;
    if (retSpy <= retBil) return 'CASH';
    return (retVeu != null && retVeu > retSpy) ? 'VEU' : 'SPY';
}

// Computes the official signal for a given completed month.
function _dmComputeSignal(series, month) {
    var retSpy = _dmTwelveMonthReturn(series.SPY, month);
    var retVeu = _dmTwelveMonthReturn(series.VEU, month);
    var retBil = _dmTwelveMonthReturn(series.BIL, month);
    var verdict = _dmVerdict(retSpy, retVeu, retBil);
    if (verdict === null) return null;
    var entry = _dmEntryFor(series.SPY, month);
    return { month: month, signalDate: entry ? entry.date : null,
             retSpy: retSpy, retVeu: retVeu, retBil: retBil, verdict: verdict };
}

// The most recent COMPLETED month (previous calendar month).
function _dmLatestSignalMonth() {
    return _dmMonthMinus(new Date().toISOString().slice(0, 7), 1);
}

// ---------------------------------------------------------------------------
// Firestore log (this strategy's Scoreboard)
// ---------------------------------------------------------------------------

async function _dmLoadLog() {
    var snap = await userCol('dmSignals').get();
    var rows = [];
    snap.forEach(function(doc) { rows.push(doc.data()); });
    rows.sort(function(a, b) { return a.month < b.month ? -1 : 1; });
    return rows;
}

// Logs the signal for `sig.month` if not already logged. Returns the log
// including the new row. Doc id = month → idempotent across visits/devices.
async function _dmEnsureLogged(sig, log) {
    var exists = log.some(function(r) { return r.month === sig.month; });
    if (exists) return log;
    var prev = log.length ? log[log.length - 1] : null;
    var row = {
        month: sig.month, signalDate: sig.signalDate,
        retSpy: sig.retSpy, retVeu: sig.retVeu, retBil: sig.retBil,
        verdict: sig.verdict,
        prevVerdict: prev ? prev.verdict : null,
        changed: !!(prev && prev.verdict !== sig.verdict),
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    await userCol('dmSignals').doc(sig.month).set(row);
    return log.concat([row]);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function loadAnalyzerDualMomentumPage() {
    _analyzerBreadcrumb([{ label: 'Stock Analyzer', href: '#analyzer' }, { label: 'Dual Momentum' }]);
    var page = document.getElementById('page-analyzer-dualmomentum');
    if (!page) return;
    page.innerHTML =
        '<div class="page-header"><h2>🌍 Dual Momentum</h2></div>' +
        '<p class="muted-text" style="max-width:560px">Once a month, hold whichever is stronger — ' +
        'US stocks or international — and step aside to cash when neither beats T-bills. ' +
        'The signal updates at each month close. You decide whether to follow it.</p>' +
        '<div id="dmContent"><p class="muted-text">Loading prices…</p></div>';
    _dmRender();
}

function _dmPct(v) {
    if (v == null) return '—';
    return (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%';
}

// One labeled return bar. Widths are scaled to the largest |return| on show.
function _dmBar(label, ret, maxAbs, isWinner) {
    var pct   = ret == null ? 0 : Math.round(Math.abs(ret) / maxAbs * 100);
    var cls   = ret != null && ret < 0 ? ' dm-bar-neg' : '';
    return '<div class="dm-bar-row' + (isWinner ? ' dm-bar-winner' : '') + '">' +
        '<div class="dm-bar-label">' + label + (isWinner ? ' ✓' : '') + '</div>' +
        '<div class="dm-bar-track"><div class="dm-bar-fill' + cls + '" style="width:' + Math.max(pct, 2) + '%"></div></div>' +
        '<div class="dm-bar-val">' + _dmPct(ret) + '</div>' +
    '</div>';
}

async function _dmRender(forceRefresh) {
    var el = document.getElementById('dmContent');
    if (!el) return;

    var series, sig, log;
    try {
        series = await _dmGetSeries(forceRefresh);
        sig = _dmComputeSignal(series, _dmLatestSignalMonth());
        if (!sig) throw new Error('not enough price history to compute a 12-month return (need ~13 months)');
    } catch (e) {
        el.innerHTML = '<p class="muted-text">✗ Could not compute the signal: ' + escapeHtml(e.message) + '</p>' +
            '<button class="btn-primary" onclick="_dmRender(true)">↻ Retry</button>';
        return;
    }

    try {
        log = await _dmEnsureLogged(sig, await _dmLoadLog());
    } catch (e) {
        console.warn('[dualmomentum] could not read/write the signal log: ' + e.message);
        log = [{ month: sig.month, signalDate: sig.signalDate, retSpy: sig.retSpy,
                 retVeu: sig.retVeu, retBil: sig.retBil, verdict: sig.verdict,
                 prevVerdict: null, changed: false, unsaved: true }];
    }

    var latest  = log[log.length - 1];
    var maxAbs  = Math.max(Math.abs(sig.retSpy || 0), Math.abs(sig.retVeu || 0), Math.abs(sig.retBil || 0), 0.0001);
    var holding = sig.verdict === 'CASH' ? 'BIL' : sig.verdict;

    var html = '';

    // Signal-change banner — the only moment the user ever acts.
    if (latest.changed) {
        html += '<div class="dm-change-banner">🔔 <strong>Signal changed:</strong> ' +
            (DM_VERDICT_LABELS[latest.prevVerdict] || latest.prevVerdict) + ' → ' +
            DM_VERDICT_LABELS[latest.verdict] +
            '. The strategy says switch. The decision is yours.</div>';
    }

    // Verdict card
    html += '<div class="dm-verdict-card">' +
        '<div class="dm-verdict">' + DM_VERDICT_LABELS[sig.verdict] + '</div>' +
        '<div class="muted-text">Signal as of the ' + escapeHtml(sig.month) + ' month close (' +
            escapeHtml(sig.signalDate || '') + ') · trailing 12-month total returns:</div>' +
        '<div class="dm-bars">' +
            _dmBar(DM_LABELS.SPY, sig.retSpy, maxAbs, holding === 'SPY') +
            _dmBar(DM_LABELS.VEU, sig.retVeu, maxAbs, holding === 'VEU') +
            _dmBar(DM_LABELS.BIL, sig.retBil, maxAbs, holding === 'BIL') +
        '</div>' +
        '<div class="muted-text">Next signal: after the ' +
            escapeHtml(new Date().toISOString().slice(0, 7)) + ' month close — check back on the 1st.' +
            (latest.unsaved ? ' ⚠️ This signal could not be saved to the log.' : '') + '</div>' +
    '</div>';

    // Mid-month preview (informational only — never logged)
    var preview = _dmComputeSignal(series, new Date().toISOString().slice(0, 7));
    if (preview && preview.verdict !== sig.verdict) {
        html += '<p class="muted-text" style="max-width:560px">👀 Preview: at <em>today\'s</em> prices the verdict ' +
            'would be <strong>' + DM_VERDICT_LABELS[preview.verdict] + '</strong>. Previews swing with the market ' +
            'and are NOT the signal — only the month close counts.</p>';
    }

    // Actions
    html += '<div class="ana-add-row">' +
        '<button class="ana-sp-btn" onclick="_dmAddReminder(this)">🗓️ Add monthly reminder</button>' +
        '<button class="ana-sp-btn" onclick="_dmRender(true)">↻ Refresh prices</button>' +
    '</div>';

    // Signal history — graded: what did the signaled asset do over the NEXT month vs SPY?
    html += '<h3 class="ana-section-title">🏁 Signal history</h3>';
    if (log.length === 1) {
        html += '<p class="muted-text" style="max-width:560px">First signal logged. One row is added each month — ' +
            'over time this becomes the live track record that shows whether the strategy earns its keep.</p>';
    }
    html += '<div class="dm-history"><table class="dm-table"><thead><tr>' +
        '<th>Month</th><th>SPY</th><th>VEU</th><th>BIL</th><th>Verdict</th><th>Next month</th>' +
        '</tr></thead><tbody>';
    for (var i = log.length - 1; i >= 0; i--) {
        var r = log[i];
        var next = _dmNextMonthGrade(series, r);
        html += '<tr' + (r.changed ? ' class="dm-row-changed"' : '') + '>' +
            '<td>' + escapeHtml(r.month) + (r.changed ? ' 🔔' : '') + '</td>' +
            '<td>' + _dmPct(r.retSpy) + '</td>' +
            '<td>' + _dmPct(r.retVeu) + '</td>' +
            '<td>' + _dmPct(r.retBil) + '</td>' +
            '<td>' + escapeHtml(r.verdict) + '</td>' +
            '<td>' + next + '</td>' +
        '</tr>';
    }
    html += '</tbody></table></div>';

    // Teach panel — why lagging is not failure (abandonment is the #1 risk)
    html += '<details class="dm-teach"><summary>📖 How this works — and when it looks broken</summary>' +
        '<div class="dm-teach-body">' +
        '<p><strong>The rules:</strong> at each month close, compare the trailing 12-month total return of ' +
        'SPY, VEU, and BIL (T-bills). If SPY beats BIL, hold the stronger of SPY/VEU. If not, hold cash. ' +
        'Trade only when the verdict changes — historically 1–3 times a year.</p>' +
        '<p><strong>Why it works:</strong> markets trend (investors underreact, then herd), and bear markets ' +
        'are processes, not events — a monthly signal is fast enough to sidestep most of a 2008-style decline. ' +
        'The payoff is compounding from a higher base after crashes, not beating the market in up years.</p>' +
        '<p><strong>It is WORKING AS DESIGNED when:</strong> it lags the S&amp;P in strong bull years or gets ' +
        'whipsawed in a fast V-shaped crash (2020 cost ~10 points — that will happen again).</p>' +
        '<p><strong>It is broken only if:</strong> it fails to protect during a long, grinding bear market — ' +
        'the exact thing it exists for. Quitting during a normal lagging stretch is the #1 way this strategy ' +
        'loses money.</p>' +
        '<p><strong>Account note:</strong> switches realize gains — this strategy strongly prefers a ' +
        'retirement account (IRA). Full details: TradingStrategiesPlan.md sections 5.1 and 6.1.</p>' +
        '</div></details>';

    el.innerHTML = html;
}

// Grade one logged signal: the verdict asset's return over the month AFTER the
// signal vs SPY's. '—' until that month completes or if data is out of window.
function _dmNextMonthGrade(series, row) {
    var nextMonth = _dmMonthMinus(row.month, -1);
    if (nextMonth >= new Date().toISOString().slice(0, 7)) return '<span class="muted-text">pending</span>';
    var asset = row.verdict === 'CASH' ? 'BIL' : row.verdict;
    function monthRet(t) {
        var a = _dmEntryFor(series[t], row.month), b = _dmEntryFor(series[t], nextMonth);
        return (a && b && a.value > 0) ? b.value / a.value - 1 : null;
    }
    var ra = monthRet(asset), rs = monthRet('SPY');
    if (ra == null || rs == null) return '<span class="muted-text">—</span>';
    var beat = ra >= rs;
    return escapeHtml(row.verdict) + ' ' + _dmPct(ra) + ' <span class="muted-text">(SPY ' + _dmPct(rs) + ')</span> ' +
        (beat ? '✅' : '❌');
}

// Creates a recurring monthly calendar reminder on the 1st (idempotent-ish:
// warns instead of duplicating if one already exists).
async function _dmAddReminder(btn) {
    if (btn) btn.disabled = true;
    try {
        var existing = await userCol('calendarEvents')
            .where('title', '==', '🌍 Dual Momentum monthly check').get();
        if (!existing.empty) {
            if (btn) btn.textContent = '✓ Reminder already on the calendar';
            return;
        }
        var d = new Date();
        var first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
        await userCol('calendarEvents').add({
            title: '🌍 Dual Momentum monthly check',
            description: 'Open Stock Analyzer → Dual Momentum. The month-close signal is computed and logged automatically — act only if it changed.',
            date: first,
            recurring: { type: 'monthly' },
            completed: false,
            completedDates: [],
            cancelledDates: [],
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        if (btn) btn.textContent = '✓ Monthly reminder added (1st of each month)';
    } catch (e) {
        if (btn) { btn.textContent = '✗ Could not add reminder'; btn.disabled = false; }
        console.warn('[dualmomentum] reminder failed: ' + e.message);
    }
}
