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
    checks.push(_hhCheckEstimates(det, !!ctx.hasKey && spanOk));

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
