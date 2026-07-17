'use strict';

// ---------------------------------------------------------------------------
// Stock Momentum strategy (#analyzer/stockmomentum)
// ---------------------------------------------------------------------------
// Plan document: TradingStrategiesPlan.md (sections 5.2, 6.2, 7.2).
// Frozen rules: rank the effective universe by 12-1 momentum (total return
// from 12 months ago to 1 month ago, skipping the most recent month), hold
// the top 25 equal-weighted, sell only when a holding falls below rank 75.
// Monthly rhythm, same convention as Dual Momentum: the official list is
// logged on the first visit of each new month.
//
// All prices come from the shared Analyzer IndexedDB cache (analyzer-data.js)
// — no new fetching. Rankings are only as fresh as the cache; the page shows
// the cache age and links to Dip & Drift's update button.
// Dividend note (rulebook 6.2): cached closes exclude dividends. Fine for a
// RELATIVE ranking (dividend differences barely reorder stocks) — unlike
// Dual Momentum's absolute vs-BIL comparison, which fetches adjusted prices.
// ---------------------------------------------------------------------------

var SM_TOP_N       = 25;    // portfolio size
var SM_SELL_RANK   = 75;    // rank buffer: sell only when a holding drops below this
var SM_SKIP_DAYS   = 21;    // ~1 month of trading days skipped (the "-1" in 12-1)
var SM_LOOKBACK    = 252;   // ~12 months of trading days
var SM_MIN_CANDLES = 260;   // need a full year of history to rank
var SM_STALE_DAYS  = 7;     // ignore tickers whose cache is > this many days older than SPY's

// ---------------------------------------------------------------------------
// Ranking computation (from the shared price cache)
// ---------------------------------------------------------------------------

// 12-1 momentum for one price record as of its last candle, or null.
function _smMomentum(rec) {
    var last = rec.close.length - 1;
    var iRecent = last - SM_SKIP_DAYS;          // ~1 month ago
    var iOld    = last - SM_LOOKBACK;           // ~12 months ago
    if (iOld < 0) return null;
    var a = rec.close[iOld], b = rec.close[iRecent];
    if (!(a > 0) || !(b > 0)) return null;
    return b / a - 1;
}

// Ranks the whole effective universe. Returns:
//   { rows: [{ticker, name, mom, above200}...] (sorted desc, ALL rankable),
//     asOf, spy: {above200, close, sma200}, skipped, total }
async function _smComputeRankings() {
    await Promise.all([_anaLoadSp500(), _anaLoadUniverseCfg(), _anaLoadHoldingTickers()]);
    var tickers = _anaEffectiveUniverse();

    // SPY is the freshness reference and the regime gauge.
    var spyRec = await anaGetPriceHistory('SPY');
    if (!spyRec || spyRec.close.length < SM_MIN_CANDLES) {
        throw new Error('SPY is not in the price cache — run "Update price data" on the Dip & Drift screen first');
    }
    var asOf = spyRec.dates[spyRec.dates.length - 1];
    var spySma200 = anaEngSma(spyRec.close, 200, spyRec.close.length - 1);
    var spyClose  = spyRec.close[spyRec.close.length - 1];

    var rows = [], skipped = 0;
    for (var i = 0; i < tickers.length; i++) {
        var t = tickers[i];
        var rec = await anaGetPriceHistory(t);
        if (!rec || rec.close.length < SM_MIN_CANDLES ||
            _anaDaysBetween(rec.dates[rec.dates.length - 1], asOf) > SM_STALE_DAYS) {
            skipped++;
            continue;
        }
        var mom = _smMomentum(rec);
        if (mom == null) { skipped++; continue; }
        var sma200 = anaEngSma(rec.close, 200, rec.close.length - 1);
        rows.push({
            ticker: t,
            name: (typeof _asName === 'function') ? (_asName(t) || '') : '',
            mom: mom,
            above200: sma200 != null && rec.close[rec.close.length - 1] > sma200
        });
    }
    rows.sort(function(a, b) { return b.mom - a.mom; });
    return { rows: rows, asOf: asOf,
             spy: { above200: spySma200 != null && spyClose > spySma200, close: spyClose, sma200: spySma200 },
             skipped: skipped, total: tickers.length };
}

// ---------------------------------------------------------------------------
// Signal log (Firestore smSignals — this strategy's scoreboard)
// ---------------------------------------------------------------------------
// One doc per month, logged on the first visit of the month (same convention
// as Dual Momentum). Grading needs no extra fetching: each logged month is
// graded from log-date to the NEXT log's date using the shared price cache.

async function _smLoadLog() {
    var snap = await userCol('smSignals').get();
    var rows = [];
    snap.forEach(function(doc) { rows.push(doc.data()); });
    rows.sort(function(a, b) { return a.month < b.month ? -1 : 1; });
    return rows;
}

// Logs this month's top-25 if not already logged. entered/exited implement
// the rank-buffer sell rule: a previous holding only "exits" when its
// CURRENT rank falls below SM_SELL_RANK (or it can no longer be ranked).
async function _smEnsureLogged(r, log) {
    var month = new Date().toISOString().slice(0, 7);
    var exists = log.some(function(x) { return x.month === month; });
    if (exists) return log;

    var top = r.rows.slice(0, SM_TOP_N).map(function(row, i) {
        return { t: row.ticker, mom: row.mom, rank: i + 1 };
    });
    var rankNow = {};
    r.rows.forEach(function(row, i) { rankNow[row.ticker] = i + 1; });

    var prev = log.length ? log[log.length - 1] : null;
    var entered = [], exited = [];
    if (prev) {
        var prevSet = {};
        prev.tickers.forEach(function(p) { prevSet[p.t] = true; });
        top.forEach(function(c) { if (!prevSet[c.t]) entered.push(c.t); });
        prev.tickers.forEach(function(p) {
            var rk = rankNow[p.t];
            if (rk == null || rk > SM_SELL_RANK) exited.push(p.t);
        });
    }

    var row = {
        month: month, asOf: r.asOf, tickers: top,
        entered: entered, exited: exited,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    await userCol('smSignals').doc(month).set(row);
    return log.concat([row]);
}

// Equal-weight return of a logged list from its asOf date to endDate, vs SPY.
// Returns {list, spy, n} or null when the cache can't price the window.
async function _smGradeWindow(row, endDate) {
    var sum = 0, n = 0;
    for (var i = 0; i < row.tickers.length; i++) {
        var rec = await anaGetPriceHistory(row.tickers[i].t);
        if (!rec) continue;
        var i0 = anaEngIndexForDate(rec, row.asOf);
        var i1 = anaEngIndexForDate(rec, endDate);
        if (i0 < 0 || i1 <= i0 || !(rec.close[i0] > 0)) continue;
        sum += rec.close[i1] / rec.close[i0] - 1;
        n++;
    }
    if (n === 0) return null;
    var spyRec = await anaGetPriceHistory('SPY');
    var s0 = anaEngIndexForDate(spyRec, row.asOf);
    var s1 = anaEngIndexForDate(spyRec, endDate);
    if (s0 < 0 || s1 <= s0) return null;
    return { list: sum / n, spy: spyRec.close[s1] / spyRec.close[s0] - 1, n: n };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function loadAnalyzerStockMomentumPage() {
    _analyzerBreadcrumb([{ label: 'Stock Analyzer', href: '#analyzer' }, { label: 'Stock Momentum' }]);
    var page = document.getElementById('page-analyzer-stockmomentum');
    if (!page) return;
    page.innerHTML =
        '<div class="page-header"><h2>🚀 Stock Momentum</h2></div>' +
        '<p class="muted-text" style="max-width:560px">The top ' + SM_TOP_N + ' stocks in your watched ' +
        'universe by 12-1 momentum — the trailing year\'s return, skipping the most recent month. ' +
        'Re-ranked monthly; a holding is sold only when it falls below rank ' + SM_SELL_RANK + '. ' +
        'The list is mechanical; whether to follow it is your call.</p>' +
        '<div id="smContent"><p class="muted-text">Ranking the universe from the price cache…</p></div>';
    _smRender();
}

function _smPct(v) {
    if (v == null) return '—';
    return (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%';
}

async function _smRender() {
    var el = document.getElementById('smContent');
    if (!el) return;

    var r;
    try {
        r = await _smComputeRankings();
    } catch (e) {
        el.innerHTML = '<p class="muted-text">✗ Could not rank: ' + escapeHtml(e.message) + '</p>' +
            '<p class="muted-text"><a href="#analyzer/dipdrift">Open Dip &amp; Drift</a> to update the price cache, then come back.</p>';
        return;
    }

    var html = '';

    // Regime banner — informational, never blocks the list (rulebook 6.2)
    if (!r.spy.above200) {
        html += '<div class="dm-change-banner">⚠️ <strong>SPY is below its 200-day average</strong> — this is ' +
            'momentum\'s historical crash window (sharp reversals hurt the strategy most right after deep ' +
            'declines). The canonical play is smaller or no new positions until the trend recovers. Your call.</div>';
    }

    // Cache freshness note
    var ageDays = _anaDaysBetween(r.asOf, _anaTodayStr());
    html += '<p class="muted-text" style="max-width:560px">Ranked ' + r.rows.length + ' of ' + r.total +
        ' watched tickers (' + r.skipped + ' skipped — short or stale history) · prices as of <strong>' +
        escapeHtml(r.asOf) + '</strong>' +
        (ageDays > SM_STALE_DAYS ? ' ⚠️ cache is ' + ageDays + ' days old — <a href="#analyzer/dipdrift">update price data</a>' : '') +
        ' · SPY ' + (r.spy.above200 ? 'above' : 'below') + ' its 200-day average</p>';

    // Top-25 table
    html += '<div class="dm-history"><table class="dm-table"><thead><tr>' +
        '<th>#</th><th>Ticker</th><th>Name</th><th>12-1 return</th><th>Own 200d</th>' +
        '</tr></thead><tbody>';
    for (var i = 0; i < Math.min(SM_TOP_N, r.rows.length); i++) {
        var row = r.rows[i];
        html += '<tr>' +
            '<td>' + (i + 1) + '</td>' +
            '<td><strong>' + escapeHtml(row.ticker) + '</strong></td>' +
            '<td>' + escapeHtml(row.name || '') + '</td>' +
            '<td>' + _smPct(row.mom) + '</td>' +
            '<td>' + (row.above200 ? '↑ above' : '↓ below') + '</td>' +
        '</tr>';
    }
    html += '</tbody></table></div>';

    // Signal log: ensure this month is logged, show the diff + graded history.
    var log = null, logErr = null;
    try {
        log = await _smEnsureLogged(r, await _smLoadLog());
    } catch (e) {
        logErr = e.message;
        console.warn('[stockmomentum] signal log unavailable: ' + e.message);
    }

    if (log) {
        var latest = log[log.length - 1];

        // The actionable part: what changed vs last month's logged list.
        html += '<h3 class="ana-section-title">🔄 This month\'s changes</h3>';
        if (log.length === 1) {
            html += '<p class="muted-text" style="max-width:560px">First month logged — diffs (“these entered, ' +
                'these fell out”) appear from next month on.</p>';
        } else if (!latest.entered.length && !latest.exited.length) {
            html += '<p class="muted-text" style="max-width:560px">No changes — every holding is still ranked ' +
                'inside the top ' + SM_SELL_RANK + '. Nothing to do this month.</p>';
        } else {
            if (latest.entered.length) {
                html += '<p style="max-width:560px">➕ <strong>Entered the top ' + SM_TOP_N + ':</strong> ' +
                    escapeHtml(latest.entered.join(', ')) + '</p>';
            }
            if (latest.exited.length) {
                html += '<p style="max-width:560px">➖ <strong>Fell below rank ' + SM_SELL_RANK + ' (sell rule):</strong> ' +
                    escapeHtml(latest.exited.join(', ')) + '</p>';
            }
        }

        // Graded history: each logged month measured to the NEXT log's date.
        html += '<h3 class="ana-section-title">🏁 Signal history</h3>';
        if (log.length === 1) {
            html += '<p class="muted-text" style="max-width:560px">One row is added each month. Each past month is ' +
                'graded — the logged list\'s equal-weight return vs SPY over the following month — building the ' +
                'live track record that shows whether the strategy earns its keep.</p>';
        }
        html += '<div class="dm-history"><table class="dm-table"><thead><tr>' +
            '<th>Month</th><th>Top pick</th><th>±</th><th>List vs SPY (next month)</th>' +
            '</tr></thead><tbody>';
        for (var li = log.length - 1; li >= 0 && li >= log.length - 12; li--) {
            var lrow = log[li];
            var nextRow = (li + 1 < log.length) ? log[li + 1] : null;
            var gradeHtml = '<span class="muted-text">pending</span>';
            if (nextRow) {
                var g = await _smGradeWindow(lrow, nextRow.asOf);
                gradeHtml = g
                    ? _smPct(g.list) + ' <span class="muted-text">(SPY ' + _smPct(g.spy) + ')</span> ' + (g.list >= g.spy ? '✅' : '❌')
                    : '<span class="muted-text">—</span>';
            }
            html += '<tr>' +
                '<td>' + escapeHtml(lrow.month) + '</td>' +
                '<td>' + escapeHtml(lrow.tickers.length ? lrow.tickers[0].t : '—') + '</td>' +
                '<td>+' + (lrow.entered ? lrow.entered.length : 0) + '/−' + (lrow.exited ? lrow.exited.length : 0) + '</td>' +
                '<td>' + gradeHtml + '</td>' +
            '</tr>';
        }
        html += '</tbody></table></div>';
    } else {
        html += '<p class="muted-text">⚠️ Signal log unavailable (' + escapeHtml(logErr || 'unknown') + ') — the ranking above still works.</p>';
    }

    // Teach panel — section 5.2 recap
    html += '<details class="dm-teach"><summary>📖 How this works — and when it looks broken</summary>' +
        '<div class="dm-teach-body">' +
        '<p><strong>The rules:</strong> rank the watched universe by 12-1 momentum (12-month return, skipping ' +
        'the most recent month). Hold the top ' + SM_TOP_N + ' equal-weighted. Each month, buy what entered; ' +
        'sell only what fell below rank ' + SM_SELL_RANK + ' (the buffer roughly halves turnover). The rank ' +
        'makes every call — overriding it ("I don\'t like this one") reintroduces the exact biases the ' +
        'system exists to remove.</p>' +
        '<p><strong>Why it works:</strong> news seeps instead of splashing, investors sell winners too early ' +
        'and hold losers too long, and people refuse to buy what already ran ("I missed it"). All three ' +
        'stretch trends out — and the discomfort of buying stocks that feel expensive IS the edge. Momentum is ' +
        'the most documented anomaly in finance: ~200 years of data, still working 30+ years after publication.</p>' +
        '<p><strong>It is WORKING AS DESIGNED when:</strong> it lags in sharp V-rebounds off bear-market bottoms ' +
        'and on rotation days (Nov 9 2020: stay-at-home winners −15–20% in a day). It always gives back a chunk ' +
        'when a big trend ends — the system exits after the turn, never at the top.</p>' +
        '<p><strong>It is broken only if:</strong> the graded history above persistently loses to SPY across a ' +
        'full cycle. Judging it on a bad quarter is how people quit right before it pays.</p>' +
        '<p><strong>Notes:</strong> ⚠️ regime banner = momentum\'s crash window (smaller/no new positions is the ' +
        'canonical play). Turnover is mostly short-term gains — strongly prefers an IRA. Full write-up: ' +
        'TradingStrategiesPlan.md sections 5.2 and 6.2.</p>' +
        '</div></details>';

    el.innerHTML = html;
}
