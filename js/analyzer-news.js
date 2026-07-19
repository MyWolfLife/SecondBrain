'use strict';

// ---------------------------------------------------------------------------
// News Sentiment strategy (#analyzer/newssentiment)
// ---------------------------------------------------------------------------
// Plan document: TradingStrategiesPlan.md (sections 5.5, 6.5, 7.5).
//
// THE MOST IMPORTANT RULE: v1 is a MEASUREMENT INSTRUMENT, not a trading
// strategy. LLM news-sentiment backtests are structurally untrustworthy
// (look-ahead bias: the model already "knows" how old stories resolved), so
// the only evidence that counts is live, timestamped signals graded against
// what happened next. The edge meter decides if this ever graduates.
//
// Frozen rules: sweep holdings + watchlist tickers (not the whole universe),
// 2 days of Finnhub news per ticker, max ~15 LLM verdicts per sweep. Only
// high-materiality, not-already-priced verdicts become logged SIGNALs; the
// filter's main job is saying "ignore". Grading: forward 3-trading-day
// return vs SPY, direction-adjusted, computed on render from the price cache.
// ---------------------------------------------------------------------------

var NEWS_LOOKBACK_DAYS = 2;     // news window per ticker
var NEWS_MAX_LLM       = 15;    // LLM-call cap per sweep (cost control)
var NEWS_GRADE_TDAYS   = 3;     // forward grading horizon (trading days)
var NEWS_MIN_GRADED    = 20;    // edge meter needs this many graded signals

// ---------------------------------------------------------------------------
// Sweep
// ---------------------------------------------------------------------------

// The sweep list: holdings + watchlist (deduped, sorted).
async function _newsSweepList() {
    await _anaLoadUniverseCfg();
    var holds = await _anaLoadHoldingTickers();
    var set = {};
    holds.forEach(function(t) { set[t] = true; });
    (_anaUniverseCfg.watchlist || []).forEach(function(t) { set[t] = true; });
    return Object.keys(set).sort();
}

// Recent price context for the already-priced check: % move over the last
// `days` trading days, from the shared cache. null when not cached.
function _newsRecentMove(rec, days) {
    if (!rec || rec.close.length < days + 1) return null;
    var last = rec.close.length - 1;
    return rec.close[last] / rec.close[last - days] - 1;
}

async function _newsRunSweep() {
    var btn = document.getElementById('newsSweepBtn');
    var box = document.getElementById('newsProgress');
    if (btn) btn.disabled = true;

    try {
        var list = await _newsSweepList();
        if (!list.length) throw new Error('no holdings or watchlist tickers to sweep — add some on the Universe screen');

        var today = _anaTodayStr();
        var from = new Date(); from.setDate(from.getDate() - NEWS_LOOKBACK_DAYS);
        var fromStr = from.toISOString().slice(0, 10);

        var checked = 0, withNews = 0, llmCalls = 0, ignored = 0, signals = 0, capped = false;

        for (var i = 0; i < list.length; i++) {
            var t = list[i];
            checked++;
            if (box) box.innerHTML = '<p class="muted-text">📰 Sweeping ' + (i + 1) + ' / ' + list.length +
                ' — ' + escapeHtml(t) + '… (' + signals + ' signal' + (signals === 1 ? '' : 's') + ' so far)</p>';

            // Skip if already signaled today (idempotent per ticker per day).
            var id = t + '_' + today;
            var existing = await userCol('newsSignals').doc(id).get();
            if (existing.exists) continue;

            var items;
            try { items = await anaFinnhubNews(t, fromStr, today, 8); }
            catch (eN) { continue; }
            if (!items || !items.length) continue;
            withNews++;

            if (llmCalls >= NEWS_MAX_LLM) { capped = true; continue; }
            llmCalls++;

            var rec = await anaGetPriceHistory(t);
            var move2d = _newsRecentMove(rec, 2);

            var headlines = items.map(function(it) {
                return '- [' + it.date + '] ' + it.headline + (it.summary ? ' — ' + it.summary.slice(0, 150) : '');
            }).join('\n');

            var reply;
            try {
                reply = await _investAiCallLLM([
                    { role: 'system', content:
                        'You score company news for a trading-signal EXPERIMENT (signals are measured, not traded). ' +
                        'Most news is noise — your main job is saying IGNORE. Only flag a SIGNAL when the news is ' +
                        'genuinely material to the earnings/cash-flow trajectory AND the market has probably not fully ' +
                        'priced it yet (a big recent price move means it likely has). Reply with exactly these lines, ' +
                        'then 2-4 sentences of reasoning:\n' +
                        'DIRECTION: BULLISH|BEARISH|NEUTRAL\nCONFIDENCE: 0-100\nMATERIALITY: HIGH|MEDIUM|LOW\n' +
                        'ALREADY_PRICED: YES|PARTLY|NO\nACTION: SIGNAL|IGNORE' },
                    { role: 'user', content:
                        t + ' — news from the last ' + NEWS_LOOKBACK_DAYS + ' days:\n' + headlines + '\n\n' +
                        'Recent price context: the stock has moved ' +
                        (move2d != null ? ((move2d >= 0 ? '+' : '') + (move2d * 100).toFixed(1) + '%') : 'an unknown amount') +
                        ' over the last 2 trading days.' }
                ]);
            } catch (eL) { throw new Error('LLM call failed: ' + eL.message); }

            var dir  = (/DIRECTION:\s*(BULLISH|BEARISH|NEUTRAL)/i.exec(reply) || [])[1];
            var conf = (/CONFIDENCE:\s*(\d{1,3})/i.exec(reply) || [])[1];
            var mat  = (/MATERIALITY:\s*(HIGH|MEDIUM|LOW)/i.exec(reply) || [])[1];
            var pri  = (/ALREADY_PRICED:\s*(YES|PARTLY|NO)/i.exec(reply) || [])[1];
            var act  = (/ACTION:\s*(SIGNAL|IGNORE)/i.exec(reply) || [])[1];

            if (!act || act.toUpperCase() !== 'SIGNAL' || !dir || dir.toUpperCase() === 'NEUTRAL') { ignored++; continue; }

            await userCol('newsSignals').doc(id).set({
                t: t, date: today,
                direction: dir.toUpperCase(),
                confidence: conf ? parseInt(conf, 10) : null,
                materiality: mat ? mat.toUpperCase() : null,
                alreadyPriced: pri ? pri.toUpperCase() : null,
                headlines: items.slice(0, 5).map(function(it) { return it.headline; }),
                reasoning: (reply || '').trim(),
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            signals++;
        }

        if (box) box.innerHTML = '<p class="muted-text">✓ Swept ' + checked + ' tickers · ' + withNews +
            ' had news · ' + llmCalls + ' AI reads · ' + ignored + ' ignored as noise/priced · <strong>' + signals +
            ' new signal' + (signals === 1 ? '' : 's') + '</strong>' +
            (capped ? ' · ⚠️ AI-call cap (' + NEWS_MAX_LLM + ') reached — run again to cover the rest' : '') + '.</p>';
    } catch (e) {
        if (box) box.innerHTML = '<p class="muted-text">✗ Sweep failed: ' + escapeHtml(e.message) + '</p>';
        if (btn) btn.disabled = false;
        return;
    }
    if (btn) btn.disabled = false;
    _newsRenderSignals();
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function loadAnalyzerNewsSentimentPage() {
    _analyzerBreadcrumb([{ label: 'Stock Analyzer', href: '#analyzer' }, { label: 'News Sentiment' }]);
    var page = document.getElementById('page-analyzer-newssentiment');
    if (!page) return;
    page.innerHTML =
        '<div class="page-header"><h2>📰 News Sentiment</h2></div>' +
        '<div class="ana-add-row"><a class="ana-sp-btn" href="#analyzer/newssentiment/about">📖 About Strategy</a></div>' +
        '<div class="dm-change-banner">🧪 <strong>Measurement instrument — not trade advice.</strong> This tool ' +
        'logs AI news reads and grades them against what actually happened. The edge meter below decides whether ' +
        'this approach ever deserves real money. Until it proves out over months of signals, watch — don\'t trade.</div>' +
        '<p class="muted-text" style="max-width:560px">Run the sweep in the morning (ideally before the open): the ' +
        'AI reads the last 2 days of news for your holdings + watchlist, ignores the noise, and logs only material, ' +
        'not-yet-priced calls. Each signal is graded on its next ' + NEWS_GRADE_TDAYS + ' trading days vs SPY.</p>' +
        '<div class="ana-add-row">' +
            '<button class="btn-primary" id="newsSweepBtn" onclick="_newsRunSweep()">📰 Morning sweep</button>' +
        '</div>' +
        '<div id="newsProgress"></div>' +
        '<div id="newsSignals"><p class="muted-text">Loading signals…</p></div>';
    _newsRenderSignals();
}

function _newsPct(v) {
    if (v == null) return '—';
    return (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%';
}

var NEWS_DIR_BADGE = { BULLISH: '🟢 BULLISH', BEARISH: '🔴 BEARISH' };

async function _newsLoadSignals() {
    var snap = await userCol('newsSignals').get();
    var out = [];
    snap.forEach(function(d) { out.push(Object.assign({ id: d.id }, d.data())); });
    out.sort(function(a, b) { return a.date < b.date ? 1 : -1; });   // newest first
    return out;
}

// Grade one signal: forward 3-trading-day return vs SPY, direction-adjusted
// (a bearish call "wins" when the stock UNDERperforms SPY).
// Returns {ret, spy, edge, final} or null while pending/unpriceable.
async function _newsGrade(s) {
    var rec = await anaGetPriceHistory(s.t);
    var spy = await anaGetPriceHistory('SPY');
    if (!rec || !spy) return null;
    var i0 = anaEngIndexForDate(rec, s.date);
    var s0 = anaEngIndexForDate(spy, s.date);
    if (i0 < 0 || s0 < 0) return null;
    var i1 = Math.min(i0 + NEWS_GRADE_TDAYS, rec.close.length - 1);
    var s1 = Math.min(s0 + NEWS_GRADE_TDAYS, spy.close.length - 1);
    if (i1 <= i0 || s1 <= s0) return null;
    var ret = rec.close[i1] / rec.close[i0] - 1;
    var spyRet = spy.close[s1] / spy.close[s0] - 1;
    var rel = ret - spyRet;
    var edge = (s.direction === 'BEARISH') ? -rel : rel;   // direction-adjusted
    return { ret: ret, spy: spyRet, edge: edge, final: (i1 - i0) >= NEWS_GRADE_TDAYS };
}

async function _newsRenderSignals() {
    var el = document.getElementById('newsSignals');
    if (!el) return;

    var signals;
    try {
        signals = await _newsLoadSignals();
    } catch (e) {
        el.innerHTML = '<p class="muted-text">✗ Could not load signals: ' + escapeHtml(e.message) + '</p>';
        return;
    }

    if (!signals.length) {
        el.innerHTML = '<p class="muted-text" style="max-width:560px">No signals yet. Run a morning sweep — most ' +
            'sweeps produce zero signals (that\'s the filter working), and each one that does appear gets measured here.</p>';
        return;
    }

    var html = '';
    var graded = [], cards = '';
    for (var i = 0; i < signals.length; i++) {
        var s = signals[i];
        var g = null;
        try { g = await _newsGrade(s); } catch (eG) {}
        if (g && g.final) graded.push(g);

        var gradeHtml = g
            ? ((g.final ? '' : 'so far: ') + escapeHtml(s.t) + ' ' + _newsPct(g.ret) +
               ' <span class="muted-text">(SPY ' + _newsPct(g.spy) + ')</span> ' + (g.edge >= 0 ? '✅' : '❌'))
            : '<span class="muted-text">pending (' + NEWS_GRADE_TDAYS + ' trading days)</span>';

        cards += '<div class="dm-verdict-card" style="margin-bottom:10px">' +
            '<div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px">' +
                '<strong>' + escapeHtml(s.t) + '</strong>' +
                '<span class="muted-text">' + escapeHtml(s.date) + '</span>' +
            '</div>' +
            '<div style="margin:4px 0">' + (NEWS_DIR_BADGE[s.direction] || s.direction) +
                (s.confidence != null ? ' · confidence ' + s.confidence : '') +
                (s.materiality ? ' · materiality ' + escapeHtml(s.materiality) : '') +
                (s.alreadyPriced ? ' · priced: ' + escapeHtml(s.alreadyPriced) : '') + '</div>' +
            '<div class="muted-text" style="margin:4px 0">' +
                (s.headlines || []).slice(0, 3).map(function(h) { return '• ' + escapeHtml(h); }).join('<br>') + '</div>' +
            '<div style="margin-top:4px">' + gradeHtml + ' · ' +
                '<a href="javascript:void(0)" onclick="_newsToggleReason(\'' + escapeHtml(s.id) + '\')">reasoning</a></div>' +
            '<div class="qv-thesis" id="newsReason-' + escapeHtml(s.id) + '" style="display:none;margin-top:6px">' +
                escapeHtml(s.reasoning || '').replace(/\n/g, '<br>') + '</div>' +
        '</div>';
    }

    // Edge meter — the graduation gate.
    var meter;
    if (graded.length < NEWS_MIN_GRADED) {
        meter = '📏 <strong>Edge meter:</strong> ' + graded.length + ' of ' + NEWS_MIN_GRADED +
            ' graded signals needed before this experiment means anything. Keep sweeping; don\'t trade it.';
    } else {
        var hits = 0, sum = 0;
        graded.forEach(function(g) { if (g.edge >= 0) hits++; sum += g.edge; });
        var hitRate = hits / graded.length, avg = sum / graded.length;
        var verdict = (hitRate > 0.55 && avg > 0.002)
            ? '🟢 Promising — keep measuring before trading a dollar.'
            : '🔴 No edge shown so far — the honest result most experiments get.';
        meter = '📏 <strong>Edge meter</strong> (' + graded.length + ' graded): directional hit rate ' +
            Math.round(hitRate * 100) + '% · avg direction-adjusted ' + NEWS_GRADE_TDAYS + '-day edge vs SPY ' +
            _newsPct(avg) + ' · ' + verdict;
    }
    html += '<div class="dm-verdict-card">' + meter + '</div>';
    html += '<h3 class="ana-section-title">🏁 Signals (' + signals.length + ')</h3>' + cards;

    // Teach panel — section 5.5 recap
    html += '<details class="dm-teach"><summary>📖 How this works — and why the meter gates everything</summary>' +
        '<div class="dm-teach-body">' +
        '<p><strong>The idea:</strong> between news breaking and being fully priced there\'s a window. An LLM that ' +
        '<em>interprets</em> a story (not keyword-matches it) can judge "how good is this really, for this stock" ' +
        'across a whole watchlist in seconds — including second-order reads like "bad news, but less bad than ' +
        'feared" that old sentiment models can\'t see.</p>' +
        '<p><strong>Why it\'s ranked last:</strong> the edge decays fastest (more machines read news every year, ' +
        'and for big liquid names you\'re last in line), it\'s the least proven live (2–3 years of research vs ' +
        'decades for the others), and thin fast edges get eaten by costs. The surviving territory is neglected ' +
        'corners: smaller names, overnight news, genuinely complex stories.</p>' +
        '<p><strong>Why backtests are banned here:</strong> an LLM trained through last year already "knows" how old ' +
        'stories resolved — testing it on the past is contaminated (look-ahead bias) and always glows. Only live, ' +
        'timestamped signals graded forward tell the truth. That\'s the entire reason this screen exists.</p>' +
        '<p><strong>The discipline:</strong> most sweeps should produce ZERO signals — the filter\'s main job is ' +
        'saying ignore. If it ever graduates: IRA only, small uniform positions, limit orders, and the meter keeps ' +
        'running forever. Full write-up: 📖 About Strategy, and TradingStrategiesPlan.md sections 5.5 and 6.5.</p>' +
        '</div></details>';

    el.innerHTML = html;
}

function _newsToggleReason(id) {
    var el = document.getElementById('newsReason-' + id);
    if (el) el.style.display = (el.style.display === 'none') ? '' : 'none';
}

// ---------------------------------------------------------------------------
// About Strategy page (#analyzer/newssentiment/about)
// ---------------------------------------------------------------------------
// TL;DR + pros/cons up top, full lesson below. Deep source:
// TradingStrategiesPlan.md section 5.5.

function loadAnalyzerNewsSentimentAboutPage() {
    _analyzerBreadcrumb([
        { label: 'Stock Analyzer', href: '#analyzer' },
        { label: 'News Sentiment', href: '#analyzer/newssentiment' },
        { label: 'About' }
    ]);
    var page = document.getElementById('page-analyzer-news-about');
    if (!page) return;

    page.innerHTML =
        '<div class="page-header"><h2>📖 News Sentiment — About the Strategy</h2></div>' +

        // ------------------------------------------------ TL;DR
        '<div class="dm-verdict-card">' +
        '<div class="dm-verdict">TL;DR</div>' +
        '<p><strong>The idea:</strong> prices move on news, and between a story breaking and being fully priced ' +
        'there\'s a window. An AI that <em>interprets</em> the story — not keyword-matches it — sweeps your whole ' +
        'watchlist every morning, ignores the noise, and flags the rare material, not-yet-priced item.</p>' +
        '<p><strong>The catch, and it\'s big:</strong> this is the least proven and fastest-decaying edge of the ' +
        'six strategies, and its backtests are structurally untrustworthy. So v1 is a <strong>measurement ' +
        'instrument</strong>: every signal is logged with a timestamp and graded on the next 3 trading days. The ' +
        'edge meter — not enthusiasm — decides if this ever deserves a dollar.</p>' +
        '<div class="dm-about-proscons">' +
        '<div><strong>✅ Pros</strong><ul>' +
        '<li>The purest "use the tools others don\'t" thesis</li>' +
        '<li>AI reads nuance old sentiment models can\'t ("bad news, but less bad than feared")</li>' +
        '<li>Breadth: no human watches 100 tickers\' overnight news</li>' +
        '<li>Costs nothing to measure — the meter proves or kills it safely</li>' +
        '</ul></div>' +
        '<div><strong>❌ Cons</strong><ul>' +
        '<li>Fastest-decaying edge — a footrace against quant machines</li>' +
        '<li>Least proven live (2–3 years of research vs decades)</li>' +
        '<li>Thin, fast edges get eaten by costs and slippage</li>' +
        '<li>Highest turnover, all short-term gains if ever traded</li>' +
        '</ul></div>' +
        '</div>' +
        '</div>' +

        '<h3 class="ana-section-title">Longer strategy description</h3>' +
        '<div class="dm-about-body">' +

        '<h4>Why an edge could exist at all</h4>' +
        '<ol>' +
        '<li><strong>Interpretation beats keywords.</strong> Old sentiment models counted positive/negative words ' +
        'and got fooled by nuance — "beat but lowered guidance," "wins contract but dilutive," "loses lawsuit but ' +
        'the penalty is far below what was feared." An LLM reads <em>context</em>, the way a sharp analyst does, but ' +
        'across a whole watchlist in seconds. Research (2023 onward) found LLM-scored headlines predicted next-day ' +
        'returns — concentrated in small caps and overnight news where human attention is thin.</li>' +
        '<li><strong>Second-order reasoning.</strong> "Bad news, but less bad than feared" is bullish. Keyword ' +
        'models can\'t see that; LLMs can. This is the genuinely new capability.</li>' +
        '<li><strong>Breadth.</strong> No human reads 100 tickers\' news before breakfast. The sweep does.</li>' +
        '</ol>' +

        '<h4>The three honest problems (why it\'s ranked last)</h4>' +
        '<ol>' +
        '<li><strong>The edge decays fastest.</strong> Every year more machines read the news, and the news-to-price ' +
        'window shrinks. For big, liquid, widely-followed names you are last in line — that game is a donation to ' +
        'high-frequency traders. The surviving territory is the neglected corners: smaller names, overnight stories, ' +
        'genuinely complex situations.</li>' +
        '<li><strong>Least proven — and backtests lie here specifically.</strong> The other strategies have decades ' +
        'of out-of-sample evidence; this has 2–3 years. Worse, an LLM trained through last year already "knows" how ' +
        'old stories resolved, so testing it on past news is contaminated (look-ahead bias) and always glows brighter ' +
        'than live results will. That\'s why this tool refuses to backtest and only counts live, timestamped signals.</li>' +
        '<li><strong>Costs eat thin, fast edges.</strong> Expected moves of 1–2% over days are easily half-eaten by ' +
        'spreads and slippage. If the meter ever proves an edge: IRA only, small uniform positions, limit orders, ' +
        'liquid names.</li>' +
        '</ol>' +

        '<h4>How the sweep decides (worked example)</h4>' +
        '<p><strong>Pass:</strong> a $1.5B medical-device name announces FDA clearance. Pre-market it\'s up 4%. The ' +
        'AI reads: the clearance was widely expected (management guided to it last call), the product is a modest ' +
        'revenue add, and the 4% pop roughly matches the value. Verdict: <em>already priced — IGNORE.</em></p>' +
        '<p><strong>Signal:</strong> a $900M industrial announces a surprise multi-year defense contract worth ~15% ' +
        'of annual revenue, in no analyst\'s estimates — and it\'s only up 3% on thin overnight volume because few ' +
        'are paying attention. Verdict: <em>material, under-reacted, bullish — SIGNAL.</em> The whole value of the ' +
        'approach is telling those two apart before the market does — and mostly, correctly saying "pass." ' +
        '<strong>A sweep that produces zero signals is the filter working, not failing.</strong></p>' +

        '<h4>The graduation rule</h4>' +
        '<p>The edge meter needs ' + NEWS_MIN_GRADED + '+ graded signals before it means anything. If, across months, ' +
        'the directional hit rate stays above ~55% with a positive average edge vs SPY after the ' + NEWS_GRADE_TDAYS +
        '-day window, the experiment is promising — keep measuring longer. If not, the honest conclusion is the one ' +
        'most experiments earn: no edge, nothing traded, nothing lost except a few API calls. Either outcome is the ' +
        'system working.</p>' +

        '<p class="muted-text">Deep source: TradingStrategiesPlan.md sections 5.5 (teaching), 6.5 (frozen rulebook), ' +
        '7.5 (how this screen works).</p>' +
        '</div>';
}
