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

// Fetches {range} of daily history for one ticker.
// Tries the Cloudflare Worker first (if configured), then the proxy chain.
// minCandles guards against a worker that ignores range params and returns 1d.
async function _anaFetchYahooHistory(ticker, range, minCandles) {
    var target = 'https://query1.finance.yahoo.com/v8/finance/chart/' +
                 encodeURIComponent(ticker) + '?interval=1d&range=' + range;

    var workerUrl = (typeof _investGetYahooWorkerUrl === 'function')
        ? await _investGetYahooWorkerUrl() : '';
    if (workerUrl) {
        try {
            var base = workerUrl.replace(/\/$/, '');
            var resp = await fetch(base + '?ticker=' + encodeURIComponent(ticker) +
                                   '&range=' + range + '&interval=1d');
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
    var lastErr = null;
    for (var i = 0; i < proxies.length; i++) {
        var attempts = (i === 0) ? 2 : 1;  // retry proxy 0 once (cold rate-limit recovery)
        for (var attempt = 0; attempt < attempts; attempt++) {
            if (attempt > 0) await new Promise(function(r) { setTimeout(r, 1200); });
            try {
                var resp2 = await fetch(proxies[i]);
                if (!resp2.ok) throw new Error('HTTP ' + resp2.status);
                return _anaParseYahooChart(await resp2.json());
            } catch (e) {
                lastErr = e;
                console.log('[analyzer] history proxy ' + i + ' attempt ' + attempt + ' failed for ' + ticker + ': ' + e.message);
            }
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

    var fresh = await _anaFetchYahooHistory(ticker, range, minCandles);
    _anaMergeCandles(cached, fresh);
    cached.updatedAt = new Date().toISOString();
    await _anaDbPut(cached);
    return mode;
}

// Batch update with progress + cancel support.
// opts: { onProgress(done, total, ticker, status), shouldCancel() }
// Returns { updated, skipped, failed: [{ticker, error}], cancelled }
async function _anaUpdatePrices(tickers, opts) {
    opts = opts || {};
    var result = { updated: 0, skipped: 0, failed: [], cancelled: false };
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
