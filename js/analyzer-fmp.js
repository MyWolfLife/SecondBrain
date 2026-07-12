'use strict';

// ---------------------------------------------------------------------------
// Stock Analyzer — FMP provider (Phase 3)
// ---------------------------------------------------------------------------
// All Financial Modeling Prep (FMP) fetchers live here, kept out of the
// already-large analyzer-data.js. FMP is the PREFERRED price provider when a
// key is present; analyzer-data.js's provider chain falls back to the Yahoo
// worker/proxy path on ANY FMP error, so the free path is never regressed.
//
// - Base: https://financialmodelingprep.com/stable/  with &apikey=KEY
// - CORS: direct browser calls, no proxy (confirmed Stage 3.0).
// - Errors: endpoints outside the plan return HTTP 402 with a PLAIN-TEXT body,
//   so read resp.text() first (resp.json() throws on those).
// - Symbols: FMP uses dashes for share classes (BRK-B); our cache keys stay
//   dot-canonical (BRK.B) — translate only in the URL.
// Tier map + confirmed field names: StockAnalyzerPlan.md Stage 3.0.
// ---------------------------------------------------------------------------

var ANA_FMP_BASE = 'https://financialmodelingprep.com/stable/';

var _anaFmpKey = null;   // module cache: null = unread, '' = known-absent

// Reads the per-user FMP key from Settings (module-cached). '' when unset.
async function anaFmpGetKey() {
    if (_anaFmpKey !== null) return _anaFmpKey;
    try {
        var doc = await userCol('settings').doc('investments').get();
        _anaFmpKey = (doc.exists && doc.data().fmpApiKey) ? doc.data().fmpApiKey : '';
    } catch (e) {
        _anaFmpKey = '';
    }
    return _anaFmpKey;
}

// Force a re-read (e.g., after the user saves/clears a key in Settings).
function anaFmpResetKey() { _anaFmpKey = null; }

// The one choke-point for ALL FMP calls: key, 12s timeout, 402/429 semantics.
// pathAndQuery e.g. 'historical-price-eod/full?symbol=AAPL&from=…&to=…'
async function _anaFmpGet(pathAndQuery) {
    var key = await anaFmpGetKey();
    if (!key) throw new Error('No FMP API key');
    var url = ANA_FMP_BASE + pathAndQuery +
              (pathAndQuery.indexOf('?') > -1 ? '&' : '?') + 'apikey=' + encodeURIComponent(key);

    var resp = await _anaFetchWithTimeout(url, 12000);
    if (resp.status === 429) {                 // rate limited — one backoff retry
        await new Promise(function(r) { setTimeout(r, 3000); });
        resp = await _anaFetchWithTimeout(url, 12000);
    }
    var text = await resp.text();              // text-first: 402 bodies are plain text
    if (resp.status === 402) {
        throw new Error('FMP plan does not include: ' + pathAndQuery.split('?')[0]);
    }
    if (!resp.ok) throw new Error('FMP HTTP ' + resp.status);
    var data;
    try { data = JSON.parse(text); }
    catch (e) { throw new Error('FMP non-JSON response'); }
    if (data && data['Error Message']) throw new Error('FMP: ' + data['Error Message']);
    return data;
}

// Daily OHLCV history for one ticker → { dates, open, high, low, close, volume }
// ASCENDING. FMP returns DESCENDING (newest first), so we build in reverse.
// Same fragment shape as _anaParseYahooChart, so the merge/cache path is identical.
async function anaFmpHistory(ticker, fromDate, toDate) {
    var sym  = ticker.replace(/\./g, '-');     // BRK.B → BRK-B (URL only)
    var data = await _anaFmpGet('historical-price-eod/full?symbol=' + encodeURIComponent(sym) +
                                '&from=' + fromDate + '&to=' + toDate);
    if (!Array.isArray(data) || data.length === 0) throw new Error('FMP history empty for ' + ticker);
    var rec = { dates: [], open: [], high: [], low: [], close: [], volume: [] };
    for (var i = data.length - 1; i >= 0; i--) {   // reverse → ascending
        var row = data[i];
        if (row.close == null || !row.date) continue;
        rec.dates.push(row.date);
        rec.open.push(row.open   != null ? row.open   : row.close);
        rec.high.push(row.high   != null ? row.high   : row.close);
        rec.low.push(row.low     != null ? row.low    : row.close);
        rec.close.push(row.close);
        rec.volume.push(row.volume != null ? row.volume : 0);
    }
    if (rec.dates.length === 0) throw new Error('FMP history no usable candles for ' + ticker);
    return rec;
}
