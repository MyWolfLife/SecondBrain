'use strict';

// ---------------------------------------------------------------------------
// Holdings Health — forward-looking exit check on stocks you already own (Goal 2)
// ---------------------------------------------------------------------------
// The mirror image of the buy side: the same ingredients the Analyzer already
// computes (estimate snapshots, quality, analyst grades/targets, trend, regime)
// read for DETERIORATION instead of opportunity. Per held ticker, a battery of
// checks each emits Healthy / Watch / Concern (or "not checked" when data is
// missing), and a flag-count rollup produces one verdict:
//   ✅ Healthy · 👀 Watch · ⚠️ Review exit
// Philosophy (locked, see HoldingsHealthPlan.md): FORWARD-LOOKING ONLY — holding
// duration is sunk-cost and never an input. The question is only "would you buy
// this today?" Evidence, never advice — "Review exit" is a prompt to look.
//
// PIECE A (this file so far): the pure check functions + verdict rollup + the
// async orchestrator. No page yet — that is Piece B.
// ---------------------------------------------------------------------------

// Thresholds (first-pass judgment calls, tunable — documented in the About page).
var HH_ESTIMATE_MIN_DROP   = 3;    // % consensus-EPS decline to register at all
var HH_ESTIMATE_BIG_DROP   = 6;    // % decline that is a concern on its own
var HH_TARGET_THIN_UPSIDE  = 5;    // % consensus-target upside below which = watch
var HH_EARNINGS_BIG_MOVE   = 8;    // ±% typical event move that makes a report a concern
var HH_REVIEW_CONCERN_WT   = 3;    // total concern-weight that forces "Review exit"

// A "not checked" result — data was unavailable, so the check is excluded from
// the verdict entirely (never counted against the stock), same honesty rule as
// the buy-side grade's coverage line.
function _hhNa(key, label, reason) {
    return { key: key, label: label, status: 'na', weight: 0, detail: reason };
}

// ── Check 1 (FLAGSHIP): estimate trajectory ────────────────────────────────
// `det` = anaEngDeteriorationCheck output (null = no meaningful decline).
// `dataOk` = we actually had enough snapshot history to judge (distinguishes a
// genuine "healthy" from "couldn't check"). Weight 2 — this is the sharpest
// exit signal, the mirror of Detector C.
function _hhCheckEstimates(det, dataOk) {
    if (!dataOk) return _hhNa('estimates', 'Estimate trend', 'Not enough weekly estimate history yet');
    if (!det) {
        return { key: 'estimates', label: 'Estimate trend', status: 'healthy', weight: 2,
                 detail: 'Consensus EPS holding up' };
    }
    var drop = Math.abs(det.estChangePct);
    // A big cut, OR any cut the price hasn't caught down to yet, is a concern.
    var concern = drop >= HH_ESTIMATE_BIG_DROP || !det.priceReacted;
    var note = det.priceReacted ? 'price already reacting' : 'price hasn’t caught down yet';
    return { key: 'estimates', label: 'Estimate trend', status: concern ? 'concern' : 'watch', weight: 2,
             detail: 'Consensus EPS cut ' + det.estChangePct.toFixed(1) + '% over ' + det.weeksCovered +
                     ' weekly snapshots (' + note + ')' };
}

// ── Check 2: trend vs 50/200-day averages ──────────────────────────────────
function _hhCheckTrend(close, sma50, sma200) {
    if (close == null || sma50 == null || sma200 == null)
        return _hhNa('trend', 'Trend', 'Not enough price history for the 50/200-day averages');
    var below50 = close < sma50, below200 = close < sma200;
    if (below50 && below200)
        return { key: 'trend', label: 'Trend', status: 'concern', weight: 1,
                 detail: 'Below both the 50-day and 200-day averages (downtrend)' };
    if (below50 || below200)
        return { key: 'trend', label: 'Trend', status: 'watch', weight: 1,
                 detail: 'Below the ' + (below50 ? '50' : '200') + '-day average' };
    return { key: 'trend', label: 'Trend', status: 'healthy', weight: 1,
             detail: 'Above both moving averages' };
}

// ── Check 3: analyst momentum (FMP-gated) ──────────────────────────────────
// `grades` = anaFmpGrades output (or null); `target` = anaFmpPriceTarget (or null).
function _hhCheckAnalysts(grades, target, close) {
    var haveGrades = !!(grades && (grades.upgrades || grades.downgrades || grades.maintains));
    var haveTarget = !!(target && target.targetConsensus != null && close);
    if (!haveGrades && !haveTarget)
        return _hhNa('analysts', 'Analyst view', 'No analyst data (needs an FMP key)');

    var concerns = [], watches = [], goods = [];
    if (haveGrades) {
        var net = (grades.upgrades || 0) - (grades.downgrades || 0);
        if (net < 0) concerns.push(grades.downgrades + ' downgrade' + (grades.downgrades === 1 ? '' : 's') +
                                   ' vs ' + (grades.upgrades || 0) + ' up (60d)');
        else if (net > 0) goods.push('net upgrades (60d)');
    }
    if (haveTarget) {
        var upPct = (target.targetConsensus / close - 1) * 100;
        if (upPct <= 0) concerns.push('price at/above consensus target');
        else if (upPct < HH_TARGET_THIN_UPSIDE) watches.push('little room to target (' + upPct.toFixed(0) + '%)');
        else goods.push('target ' + upPct.toFixed(0) + '% above price');
    }
    if (concerns.length) return { key: 'analysts', label: 'Analyst view', status: 'concern', weight: 1, detail: concerns.join('; ') };
    if (watches.length)  return { key: 'analysts', label: 'Analyst view', status: 'watch',   weight: 1, detail: watches.join('; ') };
    return { key: 'analysts', label: 'Analyst view', status: 'healthy', weight: 1, detail: goods.join('; ') || 'Analysts steady' };
}

// ── Check 4: quality / falling-knife (on something you OWN) ─────────────────
// `q` = anaFinnhubMetrics output (or null).
function _hhCheckQuality(q) {
    if (!q || q.error || (q.profitable == null && q.debtToEquity == null))
        return _hhNa('quality', 'Quality', 'No quality data');
    var unprofitable = q.profitable === false;
    var heavyDebt    = q.debtToEquity != null && q.debtToEquity > 2;
    if (unprofitable && heavyDebt)
        return { key: 'quality', label: 'Quality', status: 'concern', weight: 1,
                 detail: 'Unprofitable AND heavily indebted (debt/eq ' + q.debtToEquity.toFixed(1) + ') — falling-knife profile' };
    if (unprofitable || heavyDebt)
        return { key: 'quality', label: 'Quality', status: 'watch', weight: 1,
                 detail: unprofitable ? 'Unprofitable over the last 12 months' : 'Heavy debt (debt/eq ' + q.debtToEquity.toFixed(1) + ')' };
    return { key: 'quality', label: 'Quality', status: 'healthy', weight: 1, detail: 'Profitable, debt in range' };
}

// ── Check 5: earnings risk in the window ───────────────────────────────────
// `earnDate` = report date string for this ticker (or null = none scheduled).
// `movePct` = anaEngTypicalEventMovePct(rec). `calendarOk` = the calendar fetch
// succeeded (distinguishes "no report" from "couldn't check the calendar").
function _hhCheckEarnings(earnDate, movePct, calendarOk) {
    if (!calendarOk) return _hhNa('earnings', 'Earnings risk', 'Earnings calendar unavailable');
    if (!earnDate)   return { key: 'earnings', label: 'Earnings risk', status: 'healthy', weight: 1,
                              detail: 'No report scheduled in the window' };
    if (movePct != null && movePct >= HH_EARNINGS_BIG_MOVE)
        return { key: 'earnings', label: 'Earnings risk', status: 'concern', weight: 1,
                 detail: 'Reports ' + earnDate + ' — historically swings ±' + movePct + '% on its biggest days' };
    return { key: 'earnings', label: 'Earnings risk', status: 'watch', weight: 1,
             detail: 'Reports ' + earnDate + (movePct != null ? ' (±' + movePct + '% typical)' : '') };
}

// ── Verdict rollup (flag-count) ────────────────────────────────────────────
// Sum the weight of every "concern" (flagship counts 2, others 1); "watch"
// counts half. "na" checks are excluded from both the tally and the coverage
// count — never held against the stock. The flagship (estimate deterioration)
// being a concern forces "Review exit" on its own; otherwise concern-weight
// >= HH_REVIEW_CONCERN_WT does. Any residual signal → Watch; nothing → Healthy.
function _hhVerdict(checks) {
    var concernWt = 0, watchWt = 0, flagshipConcern = false, checked = 0;
    checks.forEach(function(c) {
        if (c.status === 'na') return;
        checked++;
        if (c.status === 'concern') {
            concernWt += c.weight;
            if (c.key === 'estimates') flagshipConcern = true;
        } else if (c.status === 'watch') {
            watchWt += c.weight * 0.5;
        }
    });
    var verdict;
    if (flagshipConcern || concernWt >= HH_REVIEW_CONCERN_WT) verdict = 'review';
    else if (concernWt + watchWt >= 1)                        verdict = 'watch';
    else                                                      verdict = 'healthy';
    return { verdict: verdict, concernWeight: concernWt, watchWeight: watchWt,
             flagshipConcern: flagshipConcern, checked: checked, total: checks.length };
}

// ── Orchestrator: run every check for one held ticker ──────────────────────
// Pure checks above take already-fetched data; this async wrapper does the
// fetches and delegates. `ctx`: { hasKey, earnDate, calendarOk, series }.
// `series` = this ticker's [{date,eps,analysts}] from _asExtractEstSeries.
// Returns { ticker, checks:[...], verdict:{...} }. Fully exercised in Piece B.
async function _hhRunChecks(ticker, rec, ctx) {
    ctx = ctx || {};
    var series = ctx.series || [];
    var checks = [];
    var asOf   = (rec && rec.dates.length) ? rec.dates.length - 1 : -1;
    var close  = (asOf >= 0) ? rec.close[asOf] : null;

    // 1. Estimate trajectory (flagship). dataOk needs an FMP key AND enough
    // snapshot span; the engine returns null both for "no decline" and "too
    // little data", so judge sufficiency here to tell the two apart.
    var spanOk = series.length >= 3 &&
        ((new Date(series[series.length - 1].date) - new Date(series[0].date)) / 86400000) >= 28;
    var det = (rec && series.length >= 3) ? anaEngDeteriorationCheck(rec, series, {}) : null;
    // Needs a price record too — the deterioration engine can't run without one,
    // so "no candles" must read as not-checked, never a false "healthy".
    checks.push(_hhCheckEstimates(det, !!ctx.hasKey && spanOk && !!rec));

    // 2. Trend
    var sma50  = (asOf >= 0) ? anaEngSma(rec.close, 50,  asOf) : null;
    var sma200 = (asOf >= 0) ? anaEngSma(rec.close, 200, asOf) : null;
    checks.push(_hhCheckTrend(close, sma50, sma200));

    // 3. Analyst momentum (FMP)
    var grades = null, target = null;
    if (ctx.hasKey) {
        var since = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
        try { grades = await anaFmpGrades(ticker, since); } catch (e) {}
        try { target = await anaFmpPriceTarget(ticker);   } catch (e) {}
    }
    checks.push(_hhCheckAnalysts(grades, target, close));

    // 4. Quality (Finnhub)
    var q = null;
    try { q = await anaFinnhubMetrics(ticker); } catch (e) {}
    checks.push(_hhCheckQuality(q));

    // 5. Earnings risk (report date comes pre-fetched in ctx from one calendar call)
    var movePct = rec ? anaEngTypicalEventMovePct(rec) : null;
    checks.push(_hhCheckEarnings(ctx.earnDate || null, movePct, ctx.calendarOk !== false));

    return { ticker: ticker, checks: checks, verdict: _hhVerdict(checks) };
}

// ---------------------------------------------------------------------------
// PIECE B — the page
// ---------------------------------------------------------------------------

var HH_WINDOW_DAYS = 90;   // earnings-risk look-ahead (~next quarter)
var HH_EST_MAX_WEEKS = 12; // weekly estimate snapshots to load for the trend

// Verdict chip styling + ordering (worst first).
var HH_VERDICT_META = {
    'review':  { cls: 'hh-verdict-review',  icon: '⚠️', label: 'Review exit', rank: 0 },
    'watch':   { cls: 'hh-verdict-watch',   icon: '👀', label: 'Watch',       rank: 1 },
    'healthy': { cls: 'hh-verdict-healthy', icon: '✅', label: 'Healthy',     rank: 2 },
    'thin':    { cls: 'hh-verdict-thin',    icon: '❔', label: 'Not enough data', rank: 3 }
};

// Per-status chip styling.
var HH_STATUS_META = {
    'concern': { cls: 'as-chip-warn', icon: '⚠️' },
    'watch':   { cls: 'hh-chip-watch', icon: '👀' },
    'healthy': { cls: 'as-chip-good', icon: '✅' },
    'na':      { cls: 'hh-chip-na',   icon: '—' }
};

// Plain-language explanation for each check + the verdict itself — tapping a
// chip opens the shared #adInfoModal (same _adOpenInfoModal the scan chips use).
var HH_CHECK_INFO = {
    'verdict': {
        title: 'How the verdict is decided',
        simple: 'Each holding is run through up to five forward-looking checks. The verdict counts how many are flashing — the estimate-trend check counts double, since a falling earnings outlook is the sharpest exit signal. “⚠️ Review exit” means enough is wrong that it’s worth a serious look; “👀 Watch” means keep an eye on it; “✅ Healthy” means nothing is flagging right now. It’s a prompt to look, never a sell order — the decision is always yours.',
        deep: 'Flag-count: concern-weight = sum of concern weights (estimate trend = 2, others = 1); watch counts ½. Estimate-trend concern OR total concern-weight ≥ 3 → Review exit; any residual signal → Watch; else Healthy. Checks with no data are excluded and shown in the “X/5 checked” coverage note — never counted against the stock. Thresholds are documented, tunable judgment calls, not precise science.'
    },
    'estimates': {
        title: 'Estimate trend (the flagship check)',
        simple: 'Are Wall Street analysts, on average, revising this company’s earnings estimate DOWN over recent weeks? That’s the mirror image of the buy-side signal the Analyzer hunts for — a falling outlook is the clearest sign the business is weakening, and the reason to consider trimming or exiting. It’s weighted heaviest of all the checks.',
        deep: 'Built from the app’s own weekly consensus-EPS snapshots (the same history that powers the divergence chip). Fires when consensus EPS has fallen ≥3% over ≥28 days with ≥3 analysts covering. A cut the price hasn’t caught down to yet is treated as the most urgent case. Needs an FMP key and a few weeks of accumulated snapshots — until then it reads “not checked.”'
    },
    'trend': {
        title: 'Trend (50-day & 200-day averages)',
        simple: 'Where the price sits relative to its own recent and long-term averages. Below both the 50-day and 200-day lines is a confirmed downtrend — the market is voting against the stock. Below just one is worth watching; above both is healthy.',
        deep: 'Simple moving averages of the daily closes in the app’s price cache. Below both → concern; below one → watch; above both → healthy. Purely price-based, so it always has data as long as the ticker is cached with a year of history.'
    },
    'analysts': {
        title: 'Analyst view',
        simple: 'What professional analysts have done lately: more downgrades than upgrades in the last 60 days, or a consensus price target that’s now at or below the current price, both suggest the pros have cooled on it. Steady ratings and real upside to the target are reassuring.',
        deep: 'From FMP: net upgrade/downgrade count over 60 days and the consensus 12-month target vs. current price. Net downgrades or target at/below price → concern; thin upside (<5%) → watch. Needs an FMP key; reads “not checked” without one.'
    },
    'quality': {
        title: 'Quality (falling-knife test)',
        simple: 'A balance-sheet safety check on something you already own: is the company both unprofitable AND carrying heavy debt? That combination is the classic “falling knife” — a business that can keep sliding rather than recover. Either one alone is worth watching.',
        deep: 'From Finnhub: trailing-twelve-month net margin and debt-to-equity. Unprofitable AND debt/equity > 2 → concern; either alone → watch. The same test the buy side uses to flag falling knives, applied to holdings.'
    },
    'earnings': {
        title: 'Earnings risk',
        simple: 'Is an earnings report coming up in the next few months? Earnings days are binary events that can move a stock sharply in either direction — worth knowing about if you’re deciding whether to hold. The bigger this stock’s typical earnings-day swing, the more it matters.',
        deep: 'One earnings-calendar call covers the next ~90 days. A scheduled report paired with a large typical event move (±8%+ of the stock’s five biggest single-day moves) → concern; a smaller-move report → watch; none scheduled → healthy. Direction is never predicted — this only sizes the risk of holding through it.'
    }
};

function _hhOpenCheckInfo(key) {
    var e = HH_CHECK_INFO[key];
    if (e && typeof _adOpenInfoModal === 'function') _adOpenInfoModal(e.title, e.simple, e.deep);
}

// One tappable status chip for a single check.
function _hhCheckChip(check) {
    var m = HH_STATUS_META[check.status] || HH_STATUS_META.na;
    return '<span class="as-chip ' + m.cls + ' as-chip-click" onclick="_hhOpenCheckInfo(\'' + check.key + '\')" title="' +
        escapeHtml(check.detail) + '">' + m.icon + ' ' + escapeHtml(check.label) + '</span>';
}

// One holding card: verdict chip (tappable → verdict explanation) + check chips.
function _hhResultCard(res) {
    var v = res.verdict;
    var key = (v.checked === 0) ? 'thin' : v.verdict;
    var meta = HH_VERDICT_META[key];
    var name = (typeof _asName === 'function') ? (_asName(res.ticker) || '') : '';
    var cov = v.checked + '/' + v.total + ' checked';

    var html = '<div class="hh-card ' + meta.cls.replace('hh-verdict-', 'hh-card-') + '">' +
        '<div class="hh-card-head">' +
            '<span class="hh-ticker">' + escapeHtml(res.ticker) +
                (name ? ' <span class="as-card-name">' + escapeHtml(name) + '</span>' : '') + '</span>' +
            '<span class="hh-verdict ' + meta.cls + ' as-chip-click" onclick="_hhOpenCheckInfo(\'verdict\')" title="' +
                escapeHtml('Tap for how the verdict is decided. ' + cov + '.') + '">' +
                meta.icon + ' ' + meta.label + ' · ' + cov + '</span>' +
        '</div>' +
        '<div class="as-chip-row hh-chip-row">';
    res.checks.forEach(function(c) { html += _hhCheckChip(c); });
    html += '</div></div>';
    return html;
}

function loadAnalyzerHoldingsHealthPage() {
    _analyzerBreadcrumb([{ label: 'Stock Analyzer', href: '#analyzer' }, { label: 'Holdings Health' }]);
    var page = document.getElementById('page-analyzer-holdingshealth');
    if (!page) return;
    page.innerHTML =
        '<div class="page-header"><h2>🩺 Holdings Health</h2></div>' +
        '<p class="muted-text" style="max-width:600px">A forward-looking check on the stocks you already own — ' +
        'the exit-side mirror of the buy hunt. Each holding runs through five checks (earnings-estimate trend, ' +
        'price trend, analyst view, quality, upcoming earnings) and gets one verdict: ✅ Healthy · 👀 Watch · ' +
        '⚠️ Review exit. The only question is whether you\'d still buy it today — how long you\'ve held it doesn\'t ' +
        'matter. Evidence, never advice; the decision is yours.</p>' +
        '<div id="hhContent"><p class="muted-text">Reading your holdings and running the checks…</p></div>';
    _hhRender();
}

async function _hhRender() {
    var box = document.getElementById('hhContent');
    if (!box) return;

    // Holdings + names
    try {
        await Promise.all([_anaLoadSp500(), _anaLoadUniverseCfg(), _anaLoadHoldingTickers()]);
    } catch (e) {}
    var holdings = (_anaHoldTickers || []).slice();
    if (!holdings.length) {
        box.innerHTML = '<p class="muted-text">No holdings found. This tool reads the tickers in your investment ' +
            'accounts (the same ones the Universe screen pulls in). Add holdings in the Financial → Investments ' +
            'section and they\'ll appear here.</p>';
        return;
    }

    // FMP key, regime, one earnings-calendar call, estimate snapshots — all shared across holdings.
    var hasKey = false;
    try { hasKey = !!(typeof anaFmpGetKey === 'function' && await anaFmpGetKey()); } catch (e) {}

    var spy = await anaGetPriceHistory('SPY');
    var vix = await anaGetPriceHistory('^VIX');
    var regime = (spy && spy.close && spy.close.length) ? anaEngRegime(spy, vix) : null;

    var earnCal = {}, calendarOk = true;
    try {
        var from = _anaTodayStr();
        var to   = new Date(Date.now() + HH_WINDOW_DAYS * 86400000).toISOString().slice(0, 10);
        earnCal = await anaEarningsCalendar(from, to);
    } catch (e) { calendarOk = false; }

    var snapshotDocs = [];
    try {
        var snapQ = await userCol('analyzerEstimates').orderBy('date', 'desc').limit(HH_EST_MAX_WEEKS).get();
        snapQ.forEach(function(d) { snapshotDocs.push(d.data()); });
        snapshotDocs.reverse();
    } catch (e) {}

    box.innerHTML = '<p class="muted-text">Running checks on ' + holdings.length + ' holding' +
        (holdings.length === 1 ? '' : 's') + '…</p>';

    var results = [];
    for (var i = 0; i < holdings.length; i++) {
        var t = holdings[i];
        var rec = await anaGetPriceHistory(t);
        var series = _asExtractEstSeries(snapshotDocs, t);
        var earnDate = (earnCal[t] && earnCal[t].date) ? earnCal[t].date : null;
        results.push(await _hhRunChecks(t, rec, { hasKey: hasKey, earnDate: earnDate, calendarOk: calendarOk, series: series }));
    }

    // Worst verdict first, then most concern-weight, then ticker.
    results.sort(function(a, b) {
        var ka = (a.verdict.checked === 0) ? 'thin' : a.verdict.verdict;
        var kb = (b.verdict.checked === 0) ? 'thin' : b.verdict.verdict;
        var ra = HH_VERDICT_META[ka].rank, rb = HH_VERDICT_META[kb].rank;
        if (ra !== rb) return ra - rb;
        if (b.verdict.concernWeight !== a.verdict.concernWeight) return b.verdict.concernWeight - a.verdict.concernWeight;
        return a.ticker < b.ticker ? -1 : 1;
    });

    var counts = { review: 0, watch: 0, healthy: 0, thin: 0 };
    results.forEach(function(r) {
        var k = (r.verdict.checked === 0) ? 'thin' : r.verdict.verdict;
        counts[k]++;
    });

    var html = '';
    if (regime) {
        var rs = (typeof AS_REGIME_STYLES !== 'undefined' && AS_REGIME_STYLES[regime.label]) ||
                 { cls: 'as-regime-warn', text: regime.label };
        html += '<div class="as-regime ' + rs.cls + '">🧭 ' + escapeHtml(rs.text) +
            (regime.vix != null ? ' · VIX ' + regime.vix.toFixed(1) : '') + '</div>';
    }
    html += '<p class="muted-text">' + holdings.length + ' holding' + (holdings.length === 1 ? '' : 's') + ' · ' +
        '<strong>' + counts.review + '</strong> review · <strong>' + counts.watch + '</strong> watch · ' +
        '<strong>' + counts.healthy + '</strong> healthy' +
        (counts.thin ? ' · ' + counts.thin + ' not enough data' : '') +
        (hasKey ? '' : ' · <em>add an FMP key for the estimate-trend and analyst checks</em>') + '</p>';
    results.forEach(function(r) { html += _hhResultCard(r); });
    html += '<p class="ab-dim" style="max-width:620px;margin-top:14px">Checks read the shared price cache, your ' +
        'weekly estimate snapshots, and live analyst/quality data. Keep price data updated (Dip &amp; Drift → ' +
        'Update price data) for the freshest read. This is evidence to weigh, not a recommendation to act.</p>';
    box.innerHTML = html;
}
