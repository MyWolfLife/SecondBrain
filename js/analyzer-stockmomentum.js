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

    el.innerHTML = html;
}
