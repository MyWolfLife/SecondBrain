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

// Market-wide screener (Phase 3, Stage 3.4) — defines an EXPANDED liquid
// universe of real companies. Filters on size/volume/exchange only (it can't
// express price setups — our own detectors do that locally). ETFs/funds are
// excluded. Returns [{symbol(dot-canonical), companyName, sector, marketCap}]
// sorted by market cap desc and HARD-CAPPED at 2,000 (IndexedDB/bandwidth guard).
async function anaFmpScreener(minCap, minVol) {
    var data = await _anaFmpGet('company-screener?marketCapMoreThan=' + Math.round(minCap) +
        '&volumeMoreThan=' + Math.round(minVol) + '&exchange=NYSE,NASDAQ,AMEX&isActivelyTrading=true&limit=5000');
    if (!Array.isArray(data)) return [];
    var rows = data.filter(function(r) { return r.symbol && !r.isEtf && !r.isFund; }).map(function(r) {
        return { symbol: (r.symbol || '').replace(/-/g, '.'), companyName: r.companyName || '', sector: r.sector || '', marketCap: r.marketCap || 0 };
    });
    rows.sort(function(a, b) { return b.marketCap - a.marketCap; });
    return rows.slice(0, 2000);
}

// ---------------------------------------------------------------------------
// Analyst evidence (Phase 3, Stage 3.2)
// ---------------------------------------------------------------------------

// Annual consensus estimates → {epsCurrY, epsNextY, numAnalysts, fyLabel, raw}.
// FMP returns fiscal YEARS (date = fiscal-year END), newest first. Selection
// rule: epsCurrY = the fiscal year whose end date is the NEXT one >= today
// (the current forward FY); epsNextY = the following year. `fyLabel` = that
// current FY's end date, so the divergence engine can catch fiscal rollovers.
async function anaFmpEstimates(ticker) {
    var sym  = ticker.replace(/\./g, '-');
    var data = await _anaFmpGet('analyst-estimates?symbol=' + encodeURIComponent(sym) + '&period=annual&limit=6');
    if (!Array.isArray(data) || !data.length) return null;
    var rows = data.slice().sort(function(a, b) { return a.date < b.date ? -1 : 1; });  // ascending
    var today = _anaTodayStr();
    var curIdx = -1;
    for (var i = 0; i < rows.length; i++) { if (rows[i].date >= today) { curIdx = i; break; } }
    if (curIdx < 0) return null;   // no forward estimate available
    var cur = rows[curIdx], nxt = rows[curIdx + 1] || null;
    return {
        epsCurrY:    (cur.epsAvg != null) ? cur.epsAvg : null,
        epsNextY:    (nxt && nxt.epsAvg != null) ? nxt.epsAvg : null,
        numAnalysts: (cur.numAnalystsEps != null) ? cur.numAnalystsEps : null,
        fyLabel:     cur.date,
        raw:         rows
    };
}

// Price-target consensus → {targetConsensus, targetMedian, targetHigh, targetLow} or null.
async function anaFmpPriceTarget(ticker) {
    var sym  = ticker.replace(/\./g, '-');
    var data = await _anaFmpGet('price-target-consensus?symbol=' + encodeURIComponent(sym));
    var t = Array.isArray(data) ? data[0] : data;
    if (!t) return null;
    return {
        targetConsensus: (t.targetConsensus != null) ? t.targetConsensus : null,
        targetMedian:    (t.targetMedian    != null) ? t.targetMedian    : null,
        targetHigh:      (t.targetHigh      != null) ? t.targetHigh      : null,
        targetLow:       (t.targetLow       != null) ? t.targetLow       : null
    };
}

// Analyst grade actions since a date → {upgrades, downgrades, maintains,
// latest:[{date,company,action,to}] (5 newest)}. FMP returns newest-first and
// ignores `limit`, so we filter/slice client-side (Stage 3.0 finding).
async function anaFmpGrades(ticker, sinceDate) {
    var sym  = ticker.replace(/\./g, '-');
    var data = await _anaFmpGet('grades?symbol=' + encodeURIComponent(sym));
    if (!Array.isArray(data)) return { upgrades: 0, downgrades: 0, maintains: 0, latest: [] };
    var out = { upgrades: 0, downgrades: 0, maintains: 0, latest: [] };
    data.forEach(function(g) {
        if (sinceDate && (!g.date || g.date < sinceDate)) return;
        if      (g.action === 'upgrade')   out.upgrades++;
        else if (g.action === 'downgrade') out.downgrades++;
        else                               out.maintains++;
    });
    out.latest = data.slice(0, 5).map(function(g) {
        return { date: g.date, company: g.gradingCompany, action: g.action, to: g.newGrade };
    });
    return out;
}

// ---------------------------------------------------------------------------
// Weekly estimate snapshots (Stage 3.2) — collection `analyzerEstimates`
// ---------------------------------------------------------------------------
// FMP serves only CURRENT consensus, so divergence (estimates-vs-price over
// time) needs history we accumulate ourselves. ONE Firestore doc per week
// (id = that week's Monday date) holding the whole universe's current EPS
// consensus: { weekId, date, createdAt, count, data: { TICKER: {epsCurrY,
// epsNextY, numAnalysts, fyLabel} } }.

// Monday-of-week date string — the per-week doc id (any day in the week maps
// to the same id, so a re-run overwrites rather than duplicates).
function _anaEstWeekId(dateStr) {
    var d   = dateStr ? new Date(dateStr + 'T00:00:00Z') : new Date();
    var day = d.getUTCDay();                       // 0=Sun … 6=Sat
    var diff = (day === 0) ? -6 : (1 - day);       // shift back to Monday
    var mon = new Date(d);
    mon.setUTCDate(d.getUTCDate() + diff);
    return mon.toISOString().slice(0, 10);
}

async function anaEstCurrentWeekHasSnapshot() {
    try { return (await userCol('analyzerEstimates').doc(_anaEstWeekId()).get()).exists; }
    catch (e) { return false; }
}
async function anaEstCountSnapshots() {
    try { return (await userCol('analyzerEstimates').get()).size; }
    catch (e) { return 0; }
}
async function anaEstGetLatestSnapshot() {
    try {
        var snap = await userCol('analyzerEstimates').orderBy('date', 'desc').limit(1).get();
        var out = null; snap.forEach(function(d) { out = d.data(); });
        return out;
    } catch (e) { return null; }
}
async function anaEstGetSnapshotOnOrBefore(dateStr) {
    try {
        var snap = await userCol('analyzerEstimates').where('date', '<=', dateStr).orderBy('date', 'desc').limit(1).get();
        var out = null; snap.forEach(function(d) { out = d.data(); });
        return out;
    } catch (e) { return null; }
}

// Snapshot the whole universe's current EPS consensus into this week's doc.
// Pool of 5, throttled; overwrites the same-week doc on re-run. Throws if a
// free/limited key means nothing came back (so we never write an empty doc).
async function anaFmpSnapshotEstimates(tickers, onProgress) {
    var key = await anaFmpGetKey();
    if (!key) throw new Error('No FMP API key');
    var weekId = _anaEstWeekId();
    var data = {}, count = 0, failures = 0;
    var total = tickers.length, next = 0, done = 0;
    var paceMs = 250, paceChain = Promise.resolve();
    function pace() { var p = paceChain.then(function() { return new Promise(function(r) { setTimeout(r, paceMs); }); }); paceChain = p; return p; }

    async function worker() {
        while (next < total) {
            var t = tickers[next++];
            await pace();
            try {
                var e = await anaFmpEstimates(t);
                if (e && e.epsCurrY != null) {
                    data[t] = { epsCurrY: e.epsCurrY, epsNextY: e.epsNextY, numAnalysts: e.numAnalysts, fyLabel: e.fyLabel };
                    count++;
                }
            } catch (err) {
                failures++;
                if (/plan does not include|429|rate/i.test(err.message)) paceMs = 800;  // free-tier storm guard
            }
            done++;
            if (onProgress) onProgress(done, total, t);
        }
    }
    var ws = []; for (var w = 0; w < 5; w++) ws.push(worker());
    await Promise.all(ws);

    if (count === 0) throw new Error('No estimates fetched — check the FMP plan/key');
    await userCol('analyzerEstimates').doc(weekId).set({
        weekId: weekId, date: _anaTodayStr(), createdAt: new Date().toISOString(),
        count: count, data: data
    });
    return { weekId: weekId, count: count, failures: failures };
}
