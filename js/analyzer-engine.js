'use strict';

// ---------------------------------------------------------------------------
// Stock Analyzer — detector engine (Stage 4)
// ---------------------------------------------------------------------------
// PURE FUNCTIONS ONLY. No fetch, no DOM, no Firestore, no IndexedDB.
// Every function takes a price record (from analyzer-data.js) as an argument:
//   { ticker, dates[], open[], high[], low[], close[], volume[] }
// with aligned ascending arrays.
//
// "One engine, two clocks": the live scanner calls these with asOfIndex =
// last index; the Backtest Lab calls them for every historical Friday.
// asOfIndex is always INCLUSIVE — data at asOfIndex is known, nothing after.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Date ↔ index
// ---------------------------------------------------------------------------

// Last index whose date is <= dateStr (YYYY-MM-DD), or -1 if none.
function anaEngIndexForDate(rec, dateStr) {
    var lo = 0, hi = rec.dates.length - 1, ans = -1;
    while (lo <= hi) {
        var mid = (lo + hi) >> 1;
        if (rec.dates[mid] <= dateStr) { ans = mid; lo = mid + 1; }
        else hi = mid - 1;
    }
    return ans;
}

// ---------------------------------------------------------------------------
// Indicators
// ---------------------------------------------------------------------------

// Simple moving average of values[endIdx-period+1 .. endIdx]. null if not enough data.
function anaEngSma(values, period, endIdx) {
    if (endIdx + 1 < period) return null;
    var sum = 0;
    for (var i = endIdx - period + 1; i <= endIdx; i++) sum += values[i];
    return sum / period;
}

// Exponential moving average value at endIdx (seeded with SMA of the first `period`).
function anaEngEma(values, period, endIdx) {
    if (endIdx + 1 < period) return null;
    var k = 2 / (period + 1);
    var ema = 0;
    for (var i = 0; i < period; i++) ema += values[i];
    ema /= period;
    for (var j = period; j <= endIdx; j++) ema = values[j] * k + ema * (1 - k);
    return ema;
}

// Wilder's RSI over `period` (default 14) ending at endIdx. null if not enough data.
function anaEngRsi(closes, period, endIdx) {
    period = period || 14;
    if (endIdx < period) return null;
    var avgGain = 0, avgLoss = 0;
    for (var i = 1; i <= period; i++) {
        var d = closes[i] - closes[i - 1];
        if (d > 0) avgGain += d; else avgLoss -= d;
    }
    avgGain /= period; avgLoss /= period;
    for (var j = period + 1; j <= endIdx; j++) {
        var diff = closes[j] - closes[j - 1];
        avgGain = (avgGain * (period - 1) + (diff > 0 ?  diff : 0)) / period;
        avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
    }
    if (avgLoss === 0) return 100;
    return 100 - 100 / (1 + avgGain / avgLoss);
}

// Annualized realized volatility of daily log returns over the last `days` ending at endIdx.
function anaEngRealizedVol(closes, days, endIdx) {
    if (endIdx < days) return null;
    var rets = [];
    for (var i = endIdx - days + 1; i <= endIdx; i++) {
        if (closes[i - 1] > 0) rets.push(Math.log(closes[i] / closes[i - 1]));
    }
    if (rets.length < 2) return null;
    var mean = rets.reduce(function(a, b) { return a + b; }, 0) / rets.length;
    var variance = rets.reduce(function(a, b) { return a + (b - mean) * (b - mean); }, 0) / (rets.length - 1);
    return Math.sqrt(variance) * Math.sqrt(252);
}

// Ratio of recent average volume to longer-run average volume (e.g. 5d vs 60d).
function anaEngVolumeRatio(volume, shortDays, longDays, endIdx) {
    var s = anaEngSma(volume, shortDays, endIdx);
    var l = anaEngSma(volume, longDays, endIdx);
    if (s == null || l == null || l === 0) return null;
    return s / l;
}

// ---------------------------------------------------------------------------
// Base rates
// ---------------------------------------------------------------------------
// "Target hit" matches the Backtest Lab rule: the day's HIGH reaching
// entryClose × (1 + gainPct/100) counts — a resting limit order would fill.

// Unconditional base rate: of all entry days in the lookback, what fraction saw
// a +gainPct% move within the next windowDays trading days?
// Returns {windows, hits, rate} or null if insufficient data.
function anaEngBaseRate(rec, opts) {
    var gain     = opts.gainPct / 100;
    var w        = opts.windowDays;
    var asOf     = (opts.asOfIndex != null) ? opts.asOfIndex : rec.dates.length - 1;
    var start    = Math.max(0, asOf - (opts.lookbackDays || 1250) + 1);
    var lastEntry = asOf - w;                 // entry must have a complete window
    if (lastEntry < start) return null;

    var windows = 0, hits = 0;
    for (var i = start; i <= lastEntry; i++) {
        var target = rec.close[i] * (1 + gain);
        windows++;
        for (var j = i + 1; j <= i + w; j++) {
            if (rec.high[j] >= target) { hits++; break; }
        }
    }
    if (windows === 0) return null;
    return { windows: windows, hits: hits, rate: hits / windows };
}

// Finds historical dip EVENTS: first day a drop of >= dropPct% from the highest
// close of the trailing dropDays appears. Subsequent trigger days belong to the
// same episode until price recovers above (peak × (1 - dropPct/2)) or windowDays pass.
// Returns an array of event objects (chronological), each with the forward outcome:
//   { index, date, entryClose, peakClose, dropPct,
//     hit (bool|null), daysToHit, maxGainPct, minRetPct, finalRetPct, pending }
function anaEngDipEvents(rec, opts) {
    var dropFrac = opts.dropPct / 100;
    var dropDays = opts.dropDays;
    var gain     = opts.gainPct / 100;
    var w        = opts.windowDays;
    var asOf     = (opts.asOfIndex != null) ? opts.asOfIndex : rec.dates.length - 1;

    var events = [];
    var inEpisode = false;
    var episodePeak = null;
    var episodeStart = -1;

    for (var i = dropDays; i <= asOf; i++) {
        // Highest close over the trailing dropDays (excluding today)
        var peak = -Infinity;
        for (var p = i - dropDays; p < i; p++) {
            if (rec.close[p] > peak) peak = rec.close[p];
        }
        var dropped = rec.close[i] <= peak * (1 - dropFrac);

        if (inEpisode) {
            // Episode ends when price recovers halfway back to the episode peak,
            // OR when the observation window has passed — without the window exit,
            // a stock that permanently resets lower would never trigger again.
            if (rec.close[i] >= episodePeak * (1 - dropFrac / 2) ||
                (i - episodeStart) >= w) {
                inEpisode = false;
            } else {
                continue;
            }
        }
        if (!dropped) continue;

        // New event
        inEpisode    = true;
        episodePeak  = peak;
        episodeStart = i;
        var ev = {
            index:      i,
            date:       rec.dates[i],
            entryClose: rec.close[i],
            peakClose:  peak,
            dropPct:    (peak - rec.close[i]) / peak * 100,
            hit:        null, daysToHit: null,
            maxGainPct: null, minRetPct: null, finalRetPct: null,
            pending:    false
        };
        var end = Math.min(i + w, asOf);
        ev.pending = (i + w > asOf);
        var target = ev.entryClose * (1 + gain);
        var maxHigh = -Infinity, minLow = Infinity;
        for (var j = i + 1; j <= end; j++) {
            if (rec.high[j] > maxHigh) maxHigh = rec.high[j];
            if (rec.low[j]  < minLow)  minLow  = rec.low[j];
            if (ev.hit === null && rec.high[j] >= target) {
                ev.hit = true;
                ev.daysToHit = j - i;
            }
        }
        if (ev.hit === null) ev.hit = ev.pending ? null : false;
        if (maxHigh > -Infinity) ev.maxGainPct = (maxHigh / ev.entryClose - 1) * 100;
        if (minLow  <  Infinity) ev.minRetPct  = (minLow  / ev.entryClose - 1) * 100;
        if (end > i)             ev.finalRetPct = (rec.close[end] / ev.entryClose - 1) * 100;
        events.push(ev);
    }
    return events;
}

// Conditional base rate built from dip events (excludes pending events).
// Returns {events, hits, rate, medianDaysToHit} or null if no completed events.
function anaEngConditionalBaseRate(rec, opts) {
    var evs = anaEngDipEvents(rec, opts).filter(function(e) { return !e.pending; });
    if (evs.length === 0) return null;
    var hits = evs.filter(function(e) { return e.hit === true; });
    var days = hits.map(function(e) { return e.daysToHit; }).sort(function(a, b) { return a - b; });
    var median = days.length ? days[Math.floor(days.length / 2)] : null;
    return { events: evs.length, hits: hits.length, rate: hits.length / evs.length, medianDaysToHit: median };
}

// ---------------------------------------------------------------------------
// Detectors
// ---------------------------------------------------------------------------

// Detector A (price part) — is the stock CURRENTLY in a fresh dip?
// Triggered when close[asOf] is >= dropPct% below the highest close of the
// trailing dropDays. Returns null when not triggered.
function anaEngDipTrigger(rec, opts) {
    var dropFrac = opts.dropPct / 100;
    var dropDays = opts.dropDays;
    var asOf     = (opts.asOfIndex != null) ? opts.asOfIndex : rec.dates.length - 1;
    if (asOf < dropDays) return null;

    var peak = -Infinity, peakIdx = -1;
    for (var p = asOf - dropDays; p < asOf; p++) {
        if (rec.close[p] > peak) { peak = rec.close[p]; peakIdx = p; }
    }
    var drop = (peak - rec.close[asOf]) / peak;
    if (drop < dropFrac) return null;

    return {
        ticker:     rec.ticker,
        date:       rec.dates[asOf],
        close:      rec.close[asOf],
        peakClose:  peak,
        peakDate:   rec.dates[peakIdx],
        dropPct:    drop * 100,
        daysSincePeak: asOf - peakIdx,
        rsi14:      anaEngRsi(rec.close, 14, asOf)
    };
}

// Detector D — compressed spring: realized volatility in the bottom decile of
// the stock's own history AND price near its 52-week high. Returns null when
// not triggered.
function anaEngSpringTrigger(rec, opts) {
    opts = opts || {};
    var volDays   = opts.volDays || 60;
    var nearPct   = (opts.nearHighPct != null ? opts.nearHighPct : 5) / 100;
    var decile    = opts.decile || 0.10;
    var asOf      = (opts.asOfIndex != null) ? opts.asOfIndex : rec.dates.length - 1;
    if (asOf < 260) return null;   // need ~1y of history minimum

    var volNow = anaEngRealizedVol(rec.close, volDays, asOf);
    if (volNow == null) return null;

    // Distribution of trailing realized vol, sampled weekly over the history
    var samples = [];
    for (var i = volDays; i < asOf; i += 5) {
        var v = anaEngRealizedVol(rec.close, volDays, i);
        if (v != null) samples.push(v);
    }
    if (samples.length < 30) return null;
    samples.sort(function(a, b) { return a - b; });
    var cutoff = samples[Math.floor(samples.length * decile)];
    if (volNow > cutoff) return null;

    // Near 52-week high?
    var hi52 = -Infinity;
    for (var j = Math.max(0, asOf - 251); j <= asOf; j++) {
        if (rec.high[j] > hi52) hi52 = rec.high[j];
    }
    if (rec.close[asOf] < hi52 * (1 - nearPct)) return null;

    return {
        ticker:      rec.ticker,
        date:        rec.dates[asOf],
        close:       rec.close[asOf],
        vol:         volNow,
        volCutoff:   cutoff,
        high52:      hi52,
        pctFromHigh: (1 - rec.close[asOf] / hi52) * 100
    };
}

// Detector B — post-earnings drift: a company that BEAT estimates and gapped
// up on the reaction day, still inside the early drift window. Earnings data is
// passed IN (this engine never fetches). Returns null when not triggered.
//
//   earnings: { date:'YYYY-MM-DD', hour:'bmo'|'amc'|other,
//               epsActual, epsEstimate, revenueActual, revenueEstimate }
//             — the symbol's MOST RECENT past report (the caller finds it).
//   opts:     { asOfIndex?, maxAgeDays=10, minDay1Pct=2, minSurprisePct=2 }
function anaEngDriftTrigger(rec, earnings, opts) {
    opts = opts || {};
    var asOf        = (opts.asOfIndex != null) ? opts.asOfIndex : rec.dates.length - 1;
    var maxAgeDays  = (opts.maxAgeDays   != null) ? opts.maxAgeDays   : 10;
    var minDay1Pct  = (opts.minDay1Pct   != null) ? opts.minDay1Pct   : 2;
    var minSurprise = (opts.minSurprisePct != null) ? opts.minSurprisePct : 2;
    if (!earnings || !earnings.date) return null;

    // (a) EPS beat by at least minSurprisePct
    var ea = earnings.epsActual, ee = earnings.epsEstimate;
    if (ea == null || ee == null || ee === 0) return null;
    if (ea <= ee) return null;
    var surprisePct = (ea - ee) / Math.abs(ee) * 100;
    if (surprisePct < minSurprise) return null;

    // (b) Reaction day index
    var atOrBefore = anaEngIndexForDate(rec, earnings.date);
    if (atOrBefore < 0) return null;
    var reactionIdx;
    if (earnings.hour === 'bmo') {
        // Reaction is the report day itself — that day must be a trading day
        if (rec.dates[atOrBefore] !== earnings.date) return null;
        reactionIdx = atOrBefore;
    } else {
        // amc / unknown — reaction is the next trading day after the report
        reactionIdx = (rec.dates[atOrBefore] === earnings.date) ? atOrBefore + 1 : atOrBefore + 1;
    }
    if (reactionIdx < 1 || reactionIdx > asOf) return null;

    // (c) The reaction gapped/moved up and held above its open
    var day1RetPct = (rec.close[reactionIdx] / rec.close[reactionIdx - 1] - 1) * 100;
    if (day1RetPct < minDay1Pct) return null;
    if (rec.close[reactionIdx] < rec.open[reactionIdx]) return null;

    // (d) Still inside the drift entry window
    var daysSinceReaction = asOf - reactionIdx;
    if (daysSinceReaction < 1 || daysSinceReaction > maxAgeDays) return null;

    var revenueBeat = null;
    if (earnings.revenueActual != null && earnings.revenueEstimate != null) {
        revenueBeat = earnings.revenueActual > earnings.revenueEstimate;
    }

    return {
        ticker:            rec.ticker,
        reportDate:        earnings.date,
        reactionIdx:       reactionIdx,
        reactionDate:      rec.dates[reactionIdx],
        epsSurprisePct:    surprisePct,
        revenueBeat:       revenueBeat,
        day1RetPct:        day1RetPct,
        daysSinceReaction: daysSinceReaction,
        close:             rec.close[asOf]
    };
}

// Typical single-day event move (Phase 2, Stage 2.4): the mean of the 5 largest
// absolute daily % moves across the cached history — a rough proxy for how hard
// this stock tends to react to a binary event (earnings). Rounded percent, or
// null when there isn't enough history. Pure candle math, no API.
function anaEngTypicalEventMovePct(rec) {
    if (!rec || !rec.close || rec.close.length < 20) return null;
    var moves = [];
    for (var i = 1; i < rec.close.length; i++) {
        if (rec.close[i - 1] > 0) moves.push(Math.abs(rec.close[i] / rec.close[i - 1] - 1) * 100);
    }
    if (moves.length < 5) return null;
    moves.sort(function(a, b) { return b - a; });
    var top = moves.slice(0, 5);
    var avg = top.reduce(function(s, v) { return s + v; }, 0) / top.length;
    return Math.round(avg);
}

// ---------------------------------------------------------------------------
// Phase 3 groundwork — estimate-based mechanisms (PURE; snapshots passed in)
// ---------------------------------------------------------------------------
// These take PARSED weekly estimate snapshots (never raw API), so they are
// immune to whatever shape the FMP endpoints turn out to have. NOT yet wired
// into the scan UI — that happens in Stages 3.2/3.3 once an FMP Starter key
// is live and the estimate-snapshot pipeline exists.
//
// Snapshot entry shape (the contract 3.2's fetcher must produce, per ticker):
//   { epsCurrY, epsNextY, numAnalysts, targetConsensus, fyLabel }
//   fyLabel = the fiscal-year-end date string (e.g. '2026-12-31') identifying
//   which fiscal year epsCurrY refers to; used to catch fiscal rollovers.

// Price-vs-estimate divergence (Stage 3.2 flagship math). Given two week-doc
// snapshots (snapA on/before the dip peak, snapB latest) and the ticker's
// candles, quantify how far the PRICE moved vs how far analyst EPS moved. A
// big gap = the emotional part of the dip.
//   snapA/snapB shape: { date, data: { TICKER: <entry above> } }
// Returns { priceChangePct, estChangePct, divergencePts, analysts } or null.
function anaEngDivergence(rec, snapA, snapB, ticker, peakDate, asOfIndex) {
    if (!rec || !snapA || !snapB || !snapA.data || !snapB.data) return null;
    var a = snapA.data[ticker], b = snapB.data[ticker];
    if (!a || !b) return null;
    if (a.epsCurrY == null || b.epsCurrY == null || a.epsCurrY === 0) return null;
    // Fiscal rollover guard: if both carry an FY label and they differ, the
    // two EPS numbers aren't comparable — bail rather than report a fake gap.
    if (a.fyLabel && b.fyLabel && a.fyLabel !== b.fyLabel) return null;

    var asOf    = (asOfIndex != null) ? asOfIndex : rec.dates.length - 1;
    var peakIdx = anaEngIndexForDate(rec, peakDate);
    if (peakIdx < 0 || rec.close[peakIdx] === 0) return null;

    var priceChangePct = (rec.close[asOf] / rec.close[peakIdx] - 1) * 100;
    var estChangePct   = (b.epsCurrY - a.epsCurrY) / Math.abs(a.epsCurrY) * 100;
    return {
        priceChangePct: priceChangePct,
        estChangePct:   estChangePct,
        divergencePts:  estChangePct - priceChangePct,   // + = estimates held up better than price fell
        analysts:       (b.numAnalysts != null ? b.numAnalysts : a.numAnalysts) || null
    };
}

// Detector C core (Stage 3.3): estimate-revision momentum — forward EPS being
// revised UP over recent weeks while the price hasn't kept pace. Runs purely
// off our own accumulated snapshot series (no premium endpoint).
//   snapshots: ascending array of { date:'YYYY-MM-DD', eps, analysts? } for
//   this ticker (caller extracts from the week-docs).
//   opts: { asOfIndex?, minEstPct=3, minSpanDays=28, minAnalysts=3 }
// Returns { estChangePct, priceChangePct, gapPts, weeksCovered, close } or null.
function anaEngRevisionTrigger(rec, snapshots, ticker, opts) {
    opts = opts || {};
    var minEstPct     = (opts.minEstPct     != null) ? opts.minEstPct     : 3;
    var minSpanDays   = (opts.minSpanDays   != null) ? opts.minSpanDays   : 28;
    var minAnalysts   = (opts.minAnalysts   != null) ? opts.minAnalysts   : 3;
    if (!rec || !Array.isArray(snapshots) || snapshots.length < 3) return null;

    var first = snapshots[0], last = snapshots[snapshots.length - 1];
    if (first.eps == null || last.eps == null || first.eps === 0) return null;

    // Window must span enough calendar time to be a trend, not noise
    var spanDays = (new Date(last.date) - new Date(first.date)) / 86400000;
    if (spanDays < minSpanDays) return null;

    // Enough analyst coverage (use the latest known count)
    var analysts = (last.analysts != null) ? last.analysts : first.analysts;
    if (analysts == null || analysts < minAnalysts) return null;

    var estChangePct = (last.eps - first.eps) / Math.abs(first.eps) * 100;
    if (estChangePct < minEstPct) return null;   // estimates must be rising meaningfully

    var asOf     = (opts.asOfIndex != null) ? opts.asOfIndex : rec.dates.length - 1;
    var startIdx = anaEngIndexForDate(rec, first.date);
    if (startIdx < 0 || rec.close[startIdx] === 0) return null;
    var priceChangePct = (rec.close[asOf] / rec.close[startIdx] - 1) * 100;

    // Price must be LAGGING the estimate move — the whole point of the setup
    if (priceChangePct >= estChangePct) return null;

    return {
        estChangePct:   estChangePct,
        priceChangePct: priceChangePct,
        gapPts:         estChangePct - priceChangePct,
        weeksCovered:   snapshots.length,
        analysts:       analysts,
        close:          rec.close[asOf]
    };
}

// Forward-looking DETERIORATION check (Holdings Health / Goal 2) — the exit-side
// mirror of anaEngRevisionTrigger. That fires when consensus EPS is RISING (a
// buy setup); this fires when consensus EPS has been revised DOWN over the
// accumulated weekly snapshots — the business outlook is weakening, which is an
// exit signal on something you already own. Pure: takes the same parsed
// [{date, eps, analysts}] series `_asExtractEstSeries` produces. Unlike the buy
// trigger it does NOT gate on the price lagging — for a holder, a falling
// estimate is a concern regardless of what price has done; the price move is
// reported so the caller can flag the urgent "price hasn't caught down yet" case.
//   opts: { minDropPct=3, minSpanDays=28, minAnalysts=3, asOfIndex }
// Returns { estChangePct (negative), priceChangePct, weeksCovered, analysts,
//           priceReacted } or null when EPS is not falling meaningfully / too
//           little data to judge.
function anaEngDeteriorationCheck(rec, snapshots, opts) {
    opts = opts || {};
    var minDropPct  = (opts.minDropPct  != null) ? opts.minDropPct  : 3;
    var minSpanDays = (opts.minSpanDays != null) ? opts.minSpanDays : 28;
    var minAnalysts = (opts.minAnalysts != null) ? opts.minAnalysts : 3;
    if (!rec || !Array.isArray(snapshots) || snapshots.length < 3) return null;

    var first = snapshots[0], last = snapshots[snapshots.length - 1];
    if (first.eps == null || last.eps == null || first.eps === 0) return null;

    // Window must span enough calendar time to be a trend, not noise
    var spanDays = (new Date(last.date) - new Date(first.date)) / 86400000;
    if (spanDays < minSpanDays) return null;

    // Enough analyst coverage (use the latest known count)
    var analysts = (last.analysts != null) ? last.analysts : first.analysts;
    if (analysts == null || analysts < minAnalysts) return null;

    var estChangePct = (last.eps - first.eps) / Math.abs(first.eps) * 100;
    if (estChangePct > -minDropPct) return null;   // not falling meaningfully → no concern

    var asOf     = (opts.asOfIndex != null) ? opts.asOfIndex : rec.dates.length - 1;
    var startIdx = anaEngIndexForDate(rec, first.date);
    var priceChangePct = null;
    if (startIdx >= 0 && rec.close[startIdx] > 0) {
        priceChangePct = (rec.close[asOf] / rec.close[startIdx] - 1) * 100;
    }
    // "Price has reacted" = it already fell at least as far as the estimate cut.
    // When false, the market hasn't caught down to the weaker outlook yet — the
    // most urgent exit case.
    var priceReacted = (priceChangePct != null) && (priceChangePct <= estChangePct);

    return {
        estChangePct:   estChangePct,        // negative
        priceChangePct: priceChangePct,
        weeksCovered:   snapshots.length,
        analysts:       analysts,
        priceReacted:   priceReacted
    };
}

// ---------------------------------------------------------------------------
// Market regime
// ---------------------------------------------------------------------------

// Classifies the market from SPY + ^VIX records at a given as-of date.
// Returns {label, spyClose, sma50, sma200, aboveSma50, aboveSma200, vix}.
function anaEngRegime(spyRec, vixRec, asOfDateStr) {
    var si = asOfDateStr ? anaEngIndexForDate(spyRec, asOfDateStr) : spyRec.dates.length - 1;
    if (si < 0) return null;
    var sma50  = anaEngSma(spyRec.close, 50,  si);
    var sma200 = anaEngSma(spyRec.close, 200, si);
    var close  = spyRec.close[si];

    var vix = null;
    if (vixRec) {
        var vi = asOfDateStr ? anaEngIndexForDate(vixRec, asOfDateStr) : vixRec.dates.length - 1;
        if (vi >= 0) vix = vixRec.close[vi];
    }

    var above50  = sma50  != null && close > sma50;
    var above200 = sma200 != null && close > sma200;
    var label;
    if (above50 && above200)       label = (vix != null && vix >= 25) ? 'bullish-volatile' : 'bullish';
    else if (!above50 && above200) label = 'pullback';
    else if (above50 && !above200) label = 'recovering';
    else                           label = (vix != null && vix >= 30) ? 'panic' : 'bearish';

    return {
        label:       label,
        date:        spyRec.dates[si],
        spyClose:    close,
        sma50:       sma50,
        sma200:      sma200,
        aboveSma50:  above50,
        aboveSma200: above200,
        vix:         vix
    };
}
