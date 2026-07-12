'use strict';

// ---------------------------------------------------------------------------
// Stock Analyzer — data layer (Stage 3)
// ---------------------------------------------------------------------------
// Raw daily OHLCV price history per ticker, cached in IndexedDB.
// - Source: Yahoo v8/chart via the same CORS-proxy chain used by investments.js
//   (or the Cloudflare Worker if one is configured in Settings).
// - Firestore is NOT used for raw candles (too large) — only IndexedDB.
//   Consequence: the cache is per-device; a new device re-fetches.
// - The detector engine (Stage 4) and Backtest Lab (Stage 5) read ONLY from
//   this module, never from the network directly.
// ---------------------------------------------------------------------------

var ANA_DB_NAME      = 'bishopAnalyzer';
var ANA_DB_VERSION   = 1;
var ANA_STORE_PRICES = 'prices';

// Always cached alongside the universe: market regime + benchmark tickers
var ANA_MARKET_TICKERS = ['SPY', '^VIX'];

// ---------------------------------------------------------------------------
// IndexedDB plumbing
// ---------------------------------------------------------------------------

var _anaDb = null;

function _anaOpenDb() {
    if (_anaDb) return Promise.resolve(_anaDb);
    return new Promise(function(resolve, reject) {
        var req = indexedDB.open(ANA_DB_NAME, ANA_DB_VERSION);
        req.onupgradeneeded = function(e) {
            var db = e.target.result;
            if (!db.objectStoreNames.contains(ANA_STORE_PRICES)) {
                db.createObjectStore(ANA_STORE_PRICES, { keyPath: 'ticker' });
            }
        };
        req.onsuccess = function(e) { _anaDb = e.target.result; resolve(_anaDb); };
        req.onerror   = function(e) { reject(e.target.error || new Error('IndexedDB open failed')); };
    });
}

function _anaDbGet(ticker) {
    return _anaOpenDb().then(function(db) {
        return new Promise(function(resolve, reject) {
            var tx  = db.transaction(ANA_STORE_PRICES, 'readonly');
            var req = tx.objectStore(ANA_STORE_PRICES).get(ticker);
            req.onsuccess = function() { resolve(req.result || null); };
            req.onerror   = function() { reject(req.error); };
        });
    });
}

function _anaDbPut(record) {
    return _anaOpenDb().then(function(db) {
        return new Promise(function(resolve, reject) {
            var tx  = db.transaction(ANA_STORE_PRICES, 'readwrite');
            var req = tx.objectStore(ANA_STORE_PRICES).put(record);
            req.onsuccess = function() { resolve(); };
            req.onerror   = function() { reject(req.error); };
        });
    });
}

// Lightweight metadata for every cached ticker (no candle arrays) — for stats.
function _anaDbGetAllMeta() {
    return _anaOpenDb().then(function(db) {
        return new Promise(function(resolve, reject) {
            var out = [];
            var tx  = db.transaction(ANA_STORE_PRICES, 'readonly');
            var req = tx.objectStore(ANA_STORE_PRICES).openCursor();
            req.onsuccess = function(e) {
                var cursor = e.target.result;
                if (cursor) {
                    var r = cursor.value;
                    out.push({
                        ticker:    r.ticker,
                        updatedAt: r.updatedAt,
                        firstDate: r.dates.length ? r.dates[0] : null,
                        lastDate:  r.dates.length ? r.dates[r.dates.length - 1] : null,
                        candles:   r.dates.length
                    });
                    cursor.continue();
                } else {
                    resolve(out);
                }
            };
            req.onerror = function() { reject(req.error); };
        });
    });
}

function _anaDbDelete(ticker) {
    return _anaOpenDb().then(function(db) {
        return new Promise(function(resolve, reject) {
            var tx  = db.transaction(ANA_STORE_PRICES, 'readwrite');
            var req = tx.objectStore(ANA_STORE_PRICES).delete(ticker);
            req.onsuccess = function() { resolve(); };
            req.onerror   = function() { reject(req.error); };
        });
    });
}

function _anaDbClear() {
    return _anaOpenDb().then(function(db) {
        return new Promise(function(resolve, reject) {
            var tx  = db.transaction(ANA_STORE_PRICES, 'readwrite');
            var req = tx.objectStore(ANA_STORE_PRICES).clear();
            req.onsuccess = function() { resolve(); };
            req.onerror   = function() { reject(req.error); };
        });
    });
}

// ---------------------------------------------------------------------------
// Yahoo chart fetch (5y daily OHLCV)
// ---------------------------------------------------------------------------

// Parses a Yahoo v8/chart JSON response into aligned arrays.
// Rows with a null close (trading halts, bad data) are skipped.
function _anaParseYahooChart(data) {
    var result = data && data.chart && data.chart.result && data.chart.result[0];
    if (!result || !result.timestamp || !result.indicators || !result.indicators.quote) {
        throw new Error('unexpected chart response shape');
    }
    var ts = result.timestamp;
    var q  = result.indicators.quote[0] || {};
    var rec = { dates: [], open: [], high: [], low: [], close: [], volume: [] };
    for (var i = 0; i < ts.length; i++) {
        var c = q.close ? q.close[i] : null;
        if (c == null) continue;
        rec.dates.push(new Date(ts[i] * 1000).toISOString().slice(0, 10));
        rec.open.push(q.open && q.open[i] != null ? q.open[i] : c);
        rec.high.push(q.high && q.high[i] != null ? q.high[i] : c);
        rec.low.push(q.low && q.low[i] != null ? q.low[i] : c);
        rec.close.push(c);
        rec.volume.push(q.volume && q.volume[i] != null ? q.volume[i] : 0);
    }
    if (rec.dates.length === 0) throw new Error('no usable candles in response');
    return rec;
}

// Index of the proxy that succeeded most recently — tried first on the next fetch.
var _anaPreferredProxy = 0;

// fetch() with a hard timeout — a hung proxy must not stall a 500-ticker job.
async function _anaFetchWithTimeout(url, timeoutMs) {
    var ctrl  = new AbortController();
    var timer = setTimeout(function() { ctrl.abort(); }, timeoutMs);
    try {
        return await fetch(url, { signal: ctrl.signal });
    } catch (e) {
        if (e.name === 'AbortError') throw new Error('timeout after ' + timeoutMs + 'ms');
        throw e;
    } finally {
        clearTimeout(timer);
    }
}

// Fetches {range} of daily history for one ticker.
// Tries the Cloudflare Worker first (if configured), then the proxy chain.
// minCandles guards against a worker that ignores range params and returns 1d.
async function _anaFetchYahooHistory(ticker, range, minCandles) {
    // Yahoo uses dashes for share classes (BRK-B), while the S&P list uses dots (BRK.B).
    // The cache key stays canonical (dot form); only the URL symbol is translated.
    var yahooSymbol = ticker.replace(/\./g, '-');
    var target = 'https://query1.finance.yahoo.com/v8/finance/chart/' +
                 encodeURIComponent(yahooSymbol) + '?interval=1d&range=' + range;

    var workerUrl = (typeof _investGetYahooWorkerUrl === 'function')
        ? await _investGetYahooWorkerUrl() : '';
    if (workerUrl) {
        try {
            var base = workerUrl.replace(/\/$/, '');
            var resp = await _anaFetchWithTimeout(base + '?ticker=' + encodeURIComponent(yahooSymbol) +
                                   '&range=' + range + '&interval=1d', 12000);
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            var rec = _anaParseYahooChart(await resp.json());
            if (rec.dates.length >= (minCandles || 1)) return rec;
            console.log('[analyzer] worker returned too few candles for ' + ticker + ' (' + rec.dates.length + ') — falling back to proxies');
        } catch (e) {
            console.log('[analyzer] worker history failed for ' + ticker + ': ' + e.message);
        }
    }

    var proxies = [
        'https://api.allorigins.win/raw?url=' + encodeURIComponent(target),
        'https://corsproxy.io/?' + encodeURIComponent(target),
        'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(target)
    ];
    // Sticky proxy: try whichever proxy succeeded last FIRST. In a 500-ticker
    // batch, wasting two 10s timeouts per ticker on a rate-limited proxy
    // turns a ~15 min job into hours.
    var order = [_anaPreferredProxy];
    for (var p = 0; p < proxies.length; p++) {
        if (p !== _anaPreferredProxy) order.push(p);
    }
    var lastErr = null;
    for (var oi = 0; oi < order.length; oi++) {
        var i = order[oi];
        try {
            var resp2 = await _anaFetchWithTimeout(proxies[i], 10000);
            if (!resp2.ok) throw new Error('HTTP ' + resp2.status);
            var parsed = _anaParseYahooChart(await resp2.json());
            _anaPreferredProxy = i;
            return parsed;
        } catch (e) {
            lastErr = e;
            console.log('[analyzer] history proxy ' + i + ' failed for ' + ticker + ': ' + e.message);
        }
    }
    // All proxies failed — one more round after a pause (cold rate-limit recovery)
    await new Promise(function(r) { setTimeout(r, 1500); });
    for (var oi2 = 0; oi2 < order.length; oi2++) {
        var i2 = order[oi2];
        try {
            var resp3 = await _anaFetchWithTimeout(proxies[i2], 10000);
            if (!resp3.ok) throw new Error('HTTP ' + resp3.status);
            var parsed2 = _anaParseYahooChart(await resp3.json());
            _anaPreferredProxy = i2;
            return parsed2;
        } catch (e) {
            lastErr = e;
            console.log('[analyzer] history proxy ' + i2 + ' retry failed for ' + ticker + ': ' + e.message);
        }
    }
    throw new Error(lastErr ? lastErr.message : 'all proxies failed');
}

// ---------------------------------------------------------------------------
// Cache update (full fetch or incremental top-up)
// ---------------------------------------------------------------------------

function _anaTodayStr() { return new Date().toISOString().slice(0, 10); }

function _anaDaysBetween(dateStrA, dateStrB) {
    return Math.round((new Date(dateStrB) - new Date(dateStrA)) / 86400000);
}

// Merges newer candles into an existing record (dedupe by date, keep ascending).
function _anaMergeCandles(existing, fresh) {
    var have = {};
    existing.dates.forEach(function(d) { have[d] = true; });
    for (var i = 0; i < fresh.dates.length; i++) {
        if (have[fresh.dates[i]]) {
            // Replace the existing row for this date (today's candle updates intraday)
            var idx = existing.dates.indexOf(fresh.dates[i]);
            existing.open[idx]   = fresh.open[i];
            existing.high[idx]   = fresh.high[i];
            existing.low[idx]    = fresh.low[i];
            existing.close[idx]  = fresh.close[i];
            existing.volume[idx] = fresh.volume[i];
        } else {
            existing.dates.push(fresh.dates[i]);
            existing.open.push(fresh.open[i]);
            existing.high.push(fresh.high[i]);
            existing.low.push(fresh.low[i]);
            existing.close.push(fresh.close[i]);
            existing.volume.push(fresh.volume[i]);
        }
    }
    return existing;
}

// Converts a Yahoo-style range string to an FMP from/to date pair (with a
// little slack so small ranges still clear the minCandles guard).
function _anaRangeToDates(range) {
    var to = _anaTodayStr();
    var d  = new Date();
    if      (range === '3mo') d.setMonth(d.getMonth() - 4);
    else if (range === '1y')  d.setFullYear(d.getFullYear() - 1);
    else                      d.setFullYear(d.getFullYear() - 5);
    return { from: d.toISOString().slice(0, 10), to: to };
}

// Provider chain for one ticker's history: FMP (if a key exists) → Yahoo
// worker/proxy chain. FMP is direct + parallel-friendly; on ANY FMP error or a
// short response we fall through to the existing (verified) Yahoo path, so the
// free experience is never regressed. Indices like ^VIX (no FMP coverage) fail
// the FMP call and fall through automatically.
async function _anaFetchHistory(ticker, range, minCandles) {
    var key = '';
    try { key = (typeof anaFmpGetKey === 'function') ? await anaFmpGetKey() : ''; } catch (e) {}
    if (key) {
        try {
            var rng = _anaRangeToDates(range);
            var rec = await anaFmpHistory(ticker, rng.from, rng.to);
            if (rec.dates.length >= (minCandles || 1)) return rec;
            console.log('[analyzer] FMP returned too few candles for ' + ticker + ' (' + rec.dates.length + ') — falling back to Yahoo');
        } catch (e) {
            console.log('[analyzer] FMP history failed for ' + ticker + ': ' + e.message + ' — falling back to Yahoo');
        }
    }
    return _anaFetchYahooHistory(ticker, range, minCandles);
}

// Updates the cache for one ticker. Returns 'skipped' | 'topup' | 'full'.
async function _anaUpdateTicker(ticker) {
    var today  = _anaTodayStr();
    var cached = await _anaDbGet(ticker);

    // Fresh enough: already updated today
    if (cached && cached.updatedAt && cached.updatedAt.slice(0, 10) === today) {
        return 'skipped';
    }

    var mode, range, minCandles;
    if (cached && cached.dates.length > 0) {
        var gap = _anaDaysBetween(cached.dates[cached.dates.length - 1], today);
        if      (gap <= 80)  { range = '3mo'; minCandles = 10; }
        else if (gap <= 350) { range = '1y';  minCandles = 100; }
        else                 { range = '5y';  minCandles = 500; }
        mode = 'topup';
    } else {
        range = '5y'; minCandles = 500; mode = 'full';
        cached = { ticker: ticker, dates: [], open: [], high: [], low: [], close: [], volume: [] };
    }

    var fresh = await _anaFetchHistory(ticker, range, minCandles);
    _anaMergeCandles(cached, fresh);
    cached.updatedAt = new Date().toISOString();
    await _anaDbPut(cached);
    return mode;
}

// Batch update with progress + cancel support.
// opts: { onProgress(done, total, ticker, status), shouldCancel() }
// Returns { updated, skipped, failed: [{ticker, error}], cancelled }
// With an FMP key, runs a throttled parallel pool (~2–4 min full universe);
// without one, the original sequential proxy path is used UNCHANGED.
async function _anaUpdatePrices(tickers, opts) {
    opts = opts || {};
    var result = { updated: 0, skipped: 0, failed: [], cancelled: false };

    var fmpKey = '';
    try { fmpKey = (typeof anaFmpGetKey === 'function') ? await anaFmpGetKey() : ''; } catch (e) {}
    if (fmpKey) return _anaUpdatePricesParallel(tickers, opts, result);

    // --- Free path (unchanged): sequential with 800ms spacing between fetches ---
    var needDelay = false;
    for (var i = 0; i < tickers.length; i++) {
        if (opts.shouldCancel && opts.shouldCancel()) { result.cancelled = true; break; }
        var t = tickers[i];
        try {
            // Only delay between tickers that actually hit the network
            if (needDelay) await new Promise(function(r) { setTimeout(r, 800); });
            var status = await _anaUpdateTicker(t);
            if (status === 'skipped') { result.skipped++; needDelay = false; }
            else                      { result.updated++; needDelay = true; }
            if (opts.onProgress) opts.onProgress(i + 1, tickers.length, t, status);
        } catch (e) {
            result.failed.push({ ticker: t, error: e.message });
            needDelay = true;
            if (opts.onProgress) opts.onProgress(i + 1, tickers.length, t, 'failed');
        }
    }
    return result;
}

// FMP parallel path: a pool of 5 workers pulls from the ticker list, with a
// GLOBAL ~250ms spacing between request starts (≈240/min — under Starter's
// 300/min). On a 429 the spacing doubles for the rest of the run (rate cut in
// half, the equivalent of the plan's "halve the pool"). FMP allows direct
// concurrent calls, so 5-in-flight is safe.
async function _anaUpdatePricesParallel(tickers, opts, result) {
    var total    = tickers.length;
    var next     = 0, done = 0;
    var poolSize = 5;
    var paceMs   = 250;
    var paceChain = Promise.resolve();

    // Serializes request STARTS to paceMs apart; fetches still run concurrently.
    function pace() {
        var p = paceChain.then(function() { return new Promise(function(r) { setTimeout(r, paceMs); }); });
        paceChain = p;
        return p;
    }

    async function worker() {
        while (next < total) {
            if (opts.shouldCancel && opts.shouldCancel()) { result.cancelled = true; return; }
            var t = tickers[next++];
            await pace();
            if (opts.shouldCancel && opts.shouldCancel()) { result.cancelled = true; return; }
            try {
                var status = await _anaUpdateTicker(t);
                if (status === 'skipped') result.skipped++;
                else                      result.updated++;
                if (opts.onProgress) opts.onProgress(++done, total, t, status);
            } catch (e) {
                result.failed.push({ ticker: t, error: e.message });
                if (/429|rate limit/i.test(e.message)) paceMs = 500;   // back off for the rest of the run
                if (opts.onProgress) opts.onProgress(++done, total, t, 'failed');
            }
        }
    }

    var workers = [];
    for (var w = 0; w < poolSize; w++) workers.push(worker());
    await Promise.all(workers);
    return result;
}

// ---------------------------------------------------------------------------
// Stats + accessors for other modules
// ---------------------------------------------------------------------------

// Returns the cached record for a ticker (or null). Engine + backtest entry point.
function anaGetPriceHistory(ticker) {
    return _anaDbGet(ticker);
}

async function _anaCacheStats() {
    var meta = await _anaDbGetAllMeta();
    var today = _anaTodayStr();
    var fresh = meta.filter(function(m) { return m.updatedAt && m.updatedAt.slice(0, 10) === today; });
    var newest = null;
    meta.forEach(function(m) { if (!newest || (m.updatedAt && m.updatedAt > newest)) newest = m.updatedAt; });
    return {
        count:      meta.length,
        freshToday: fresh.length,
        newestUpdate: newest,
        totalCandles: meta.reduce(function(s, m) { return s + m.candles; }, 0)
    };
}

// ---------------------------------------------------------------------------
// Finnhub fetchers (Phase 2)
// ---------------------------------------------------------------------------
// Fundamentals / insider / earnings / news enrichment from Finnhub's free tier.
// - Base: https://finnhub.io/api/v1/  with &token=KEY (key from Settings,
//   read via _investGetFinnhubKey() in investments.js — per-user, never hardcoded).
// - CORS allows direct browser calls; NO proxy chain needed (unlike Yahoo).
// - Free-tier limit is 60 calls/minute, so EVERY Finnhub request in the app
//   flows through the single choke-point _anaFinnhubGet, which enforces
//   1,100ms spacing and one 5-second retry on HTTP 429.
// - Symbols: Finnhub uses dots for share classes (BRK.B) — same as our
//   canonical tickers. Do NOT apply the Yahoo dot→dash translation here.
// ---------------------------------------------------------------------------

var _anaFinnhubLastCall = 0;   // ms timestamp of the last Finnhub request

// The one choke-point for ALL Finnhub calls: key lookup, rate-limit spacing,
// timeout, and 429 retry all live here so callers stay simple.
async function _anaFinnhubGet(path, params) {
    var key = await _investGetFinnhubKey();
    if (!key) throw new Error('No Finnhub API key — add it in Settings');

    // Enforce >=1100ms between requests (free tier: 60 calls/min)
    var wait = 1100 - (Date.now() - _anaFinnhubLastCall);
    if (wait > 0) await new Promise(function(r) { setTimeout(r, wait); });

    var qs = Object.keys(params || {}).map(function(k) {
        return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
    }).join('&');
    var url = 'https://finnhub.io/api/v1/' + path + '?' + (qs ? qs + '&' : '') +
              'token=' + encodeURIComponent(key);

    var resp = await _anaFetchWithTimeout(url, 10000);
    _anaFinnhubLastCall = Date.now();

    // Rate limited: wait 5s and retry once, then give up
    if (resp.status === 429) {
        await new Promise(function(r) { setTimeout(r, 5000); });
        resp = await _anaFetchWithTimeout(url, 10000);
        _anaFinnhubLastCall = Date.now();
        if (resp.status === 429) throw new Error('Finnhub rate limit');
    }
    if (!resp.ok) throw new Error('Finnhub HTTP ' + resp.status);
    return resp.json();
}

// First non-null/undefined value among candidate key spellings, else null.
// Finnhub metric key names vary by listing, so callers pass a preference list.
function _anaPick(obj, keys) {
    for (var i = 0; i < keys.length; i++) {
        var v = obj[keys[i]];
        if (v !== null && v !== undefined) return v;
    }
    return null;
}

// Basic financials → normalized quality metrics for candidate chips + dossier.
// `raw` keeps the full metric map for the dossier's detail view.
async function anaFinnhubMetrics(ticker) {
    var data = await _anaFinnhubGet('stock/metric', { symbol: ticker, metric: 'all' });
    var m = (data && data.metric) || {};
    var netMargin = _anaPick(m, ['netProfitMarginTTM', 'netMarginTTM', 'netProfitMarginAnnual']);
    return {
        profitable:       (netMargin === null) ? null : (netMargin > 0),
        netMarginPct:     netMargin,
        debtToEquity:     _anaPick(m, ['totalDebt/totalEquityQuarterly', 'totalDebt/totalEquityAnnual',
                                       'totalDebtToEquityQuarterly', 'totalDebtToEquityAnnual']),
        currentRatio:     _anaPick(m, ['currentRatioQuarterly', 'currentRatioAnnual']),
        dividendYieldPct: _anaPick(m, ['dividendYieldIndicatedAnnual', 'currentDividendYieldTTM',
                                       'dividendYieldTTM']),
        roePct:           _anaPick(m, ['roeTTM', 'roeRfy', 'roeAnnual']),
        raw:              m
    };
}

// Insider transactions since fromDate → buy/sell tallies + the open-market
// purchases list (transactionCode 'P' — the strongest "insiders buying" signal).
async function anaFinnhubInsiders(ticker, fromDate) {
    var data = await _anaFinnhubGet('stock/insider-transactions', {
        symbol: ticker, from: fromDate, to: _anaTodayStr()
    });
    var rows = (data && data.data) || [];
    var out = { buys: 0, sells: 0, buyShares: 0, netShares: 0, purchases: [] };
    rows.forEach(function(r) {
        var change = r.change || 0;
        if (change > 0) { out.buys++;  out.buyShares += change; }
        if (change < 0) { out.sells++; }
        out.netShares += change;
        if (r.transactionCode === 'P') {
            out.purchases.push({
                date:   r.transactionDate || r.filingDate || '',
                name:   r.name || '',
                shares: change,
                price:  r.transactionPrice || null
            });
        }
    });
    // Newest first, keep the top 5 for display
    out.purchases.sort(function(a, b) { return a.date < b.date ? 1 : -1; });
    out.purchases = out.purchases.slice(0, 5);
    return out;
}

// Earnings calendar for a date range → map { SYMBOL: {date, hour, epsEstimate,
// epsActual, revenueEstimate, revenueActual} } keeping the EARLIEST date per
// symbol. ONE call covers ALL symbols in the range (Finnhub's big advantage
// over FMP's ~72-symbol free calendar). Symbols keyed exactly as returned.
async function anaFinnhubEarningsCalendar(fromDate, toDate) {
    var data = await _anaFinnhubGet('calendar/earnings', { from: fromDate, to: toDate });
    var rows = (data && data.earningsCalendar) || [];
    var map = {};
    rows.forEach(function(r) {
        if (!r.symbol || !r.date) return;
        if (map[r.symbol] && map[r.symbol].date <= r.date) return; // keep earliest
        map[r.symbol] = {
            date:            r.date,
            hour:            r.hour || '',
            epsEstimate:     (r.epsEstimate     !== undefined) ? r.epsEstimate     : null,
            epsActual:       (r.epsActual       !== undefined) ? r.epsActual       : null,
            revenueEstimate: (r.revenueEstimate !== undefined) ? r.revenueEstimate : null,
            revenueActual:   (r.revenueActual   !== undefined) ? r.revenueActual   : null
        };
    });
    return map;
}

// Past earnings surprises (actual vs estimate) — free tier returns ~4 quarters,
// newest first. Returns [] when the API has nothing for the symbol.
async function anaFinnhubSurprises(ticker) {
    var data = await _anaFinnhubGet('stock/earnings', { symbol: ticker });
    return Array.isArray(data) ? data : [];
}

// Company news for a date range → newest-first, capped at 15 items.
// `datetime` arrives as unix seconds; converted to 'YYYY-MM-DD' for display.
async function anaFinnhubNews(ticker, fromDate, toDate) {
    var data = await _anaFinnhubGet('company-news', {
        symbol: ticker, from: fromDate, to: toDate
    });
    var rows = Array.isArray(data) ? data : [];
    var items = [];
    rows.forEach(function(r) {
        if (!r.headline) return;
        items.push({
            date:     r.datetime ? new Date(r.datetime * 1000).toISOString().slice(0, 10) : '',
            headline: r.headline,
            source:   r.source  || '',
            summary:  r.summary || '',
            url:      r.url     || ''
        });
    });
    items.sort(function(a, b) { return a.date < b.date ? 1 : -1; });
    return items.slice(0, 15);
}

// ---------------------------------------------------------------------------
// Unified earnings + insider providers (Stage 3.5)
// ---------------------------------------------------------------------------
// One documented ordering: Finnhub PRIMARY (Phase 2, all-US coverage), FMP the
// fallback when Finnhub throws (no key / rate limit) AND an FMP key exists. The
// FMP fetchers return the same shapes, so callers stay provider-agnostic.

// Earnings calendar map for a date range. Finnhub first, then FMP.
async function anaEarningsCalendar(fromDate, toDate) {
    try {
        return await anaFinnhubEarningsCalendar(fromDate, toDate);
    } catch (e) {
        if (typeof anaFmpEarningsCalendar === 'function' && (await anaFmpGetKey())) {
            console.log('[analyzer] Finnhub earnings calendar failed (' + e.message + ') — trying FMP');
            return await anaFmpEarningsCalendar(fromDate, toDate);
        }
        throw e;
    }
}

// Insider activity for one ticker since a date. Finnhub first, then FMP.
async function anaInsiders(ticker, fromDate) {
    try {
        return await anaFinnhubInsiders(ticker, fromDate);
    } catch (e) {
        if (typeof anaFmpInsiders === 'function' && (await anaFmpGetKey())) {
            console.log('[analyzer] Finnhub insiders failed for ' + ticker + ' (' + e.message + ') — trying FMP');
            return await anaFmpInsiders(ticker, fromDate);
        }
        throw e;
    }
}
