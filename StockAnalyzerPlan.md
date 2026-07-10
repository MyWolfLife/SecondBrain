# Stock Analyzer — Plan

**Status: BUILDING — Stages 1–3 complete (scaffolding, universe manager, price data layer); Stage 4 (detector engine) next.**

## Build Log (session handoff — keep current)
*Update this section as work proceeds so any session can resume mid-stage. Newest first.*

- **2026-07-10 — Stage 3 COMPLETE + FMP Phase A steps 1–2 done.**
  - **Full-universe run validated at scale**: 507 tickers cached (~626k daily candles, 5y each), ~18 min via free proxies. 2 initial failures (BRK.B, BF.B) fixed — Yahoo needs dash form (`BRK-B`); cache key stays dot-canonical, URL translated.
  - **FMP CORS confirmed**: browser reads FMP responses directly (401 test) — no proxies needed for FMP. Settings → "Stock Analyzer (FMP)" card added (key + Show/Save/Test); save persistence verified.
  - Next: **Stage 4 — detector engine** (`js/analyzer-engine.js`, pure functions: indicators, base rates, regime, Detectors A price-parts + D). User will paste FMP key on his own account; Phase A step 3 (endpoint validation) can run any time after.
- **2026-07-09 — Stage 3 task list (all done):**
  1. ✅ `js/analyzer-data.js` built + verified in preview (SPY/^VIX/TGT: 5y × ~1,254 candles each fetched via proxy chain, skip-when-fresh re-run = 2ms, cache survives reload). Wired into index.html (+sw precache, v450). Public API: `anaGetPriceHistory(ticker)`, `_anaUpdatePrices(tickers, {onProgress, shouldCancel})`, `_anaCacheStats()`, `ANA_MARKET_TICKERS`. → *commit checkpoint 1 DONE*
  2. ✅ Hub "📊 Price data" section: stats note, Update button, progress bar (`n/total — TICKER (status)`), Cancel, completion summary w/ failure list. Verified: cancel works, summary survives section re-render.
  3. ✅ Subset verification done (SPY/^VIX/TGT/MMM/AOS cached; skip-fresh re-run 2ms; survives reload). **Fetch timeouts added** (12s worker / 10s per proxy attempt via AbortController) after a hung proxy stalled a run — critical fix for 500-ticker jobs. Full-universe run kicked off in preview to validate at scale (in progress — see result note below when finished).
  4. ✅ Docs: spec Part 8f data-layer subsection, AppHelp hub Quick Help (price data bullets) + build status, sw precache + v450, `?v=` bumps.
  - Testing setup available: test account has mock brokerage "Test Brokerage (analyzer test)" (id y9zbiLqxuBbHA0CexO3Y under investments/self) with NVDA + GRAB holdings; watchlist=[SHOP], excluded=[TGT] in analyzerConfig/universe.
- **2026-07-09 — Stage 2 COMPLETE** (744146a): Universe manager built + verified. `data/sp500.json` (503 constituents), universe page (stats/watchlist/holdings pull-in/S&P search+exclude), `analyzerConfig/universe` Firestore doc, backup list updated, help+spec updated.
- **2026-07-09 — Stage 1 COMPLETE** (33e6be8): 🎯 hub card, `#analyzer` routes ×4, `js/analyzer.js` scaffolding, help `screen:analyzer`, spec Part 8f.

## Overview
A new card under **Life → Financial** called **Stock Analyzer**. A tool to help the user decide which stocks to buy and sell, based on metrics the user determines.

## Research / Discussion Notes
*(Raw notes captured during planning conversations — the plan gets built from this section.)*

- Feature lives as a new card on the Financial hub (`#investments`), alongside Investments, Stock Rollup, Snapshots, Budgets.
- Purpose: buy/sell decision support driven by **user-defined metrics** — the user picks what matters, not a canned scoring system.

### User's goals (in his own words, paraphrased)
- User already has a **diverse long-term portfolio**; a slice of it is designated **"play around money"**.
- **Not day trading.** The goal is **short-term opportunistic trades** — get in and out over weeks-to-months, separate from long-term holdings.
- **Goal 1 — Find short-term buying opportunities.** Identify companies with potential to go up **X% in Y timeframe** (example query: *"What are some companies that have a high chance of going up 10% in the next 60 days?"*). The tool surfaces candidates; the **user makes the final call** on whether he agrees and is willing to take the gamble.
- **Archetype example (Target)**: a couple of years ago Target launched a controversial clothing line and the stock took a big hit. User judged the selloff was *emotional*, not fundamental — the company was solid. Bought $5k, stock recovered within a month, sold. He didn't want to hold Target long-term; it was a safe-feeling short-term bet.
  - The pattern: **fundamentally solid company + sharp news/sentiment-driven dip = mean-reversion candidate.** Distinguishing "emotional dip" from "real deterioration" is the core judgment the tool should help with.
- **Goal 2 — Analyze his own portfolio.** Flag holdings he's **been in too long** where the **next 3–7 months look bad** (candidates to exit) — or look **great** (candidates to keep/add). A forward-looking health check on existing positions.
- Tool's role: **candidate finder + evidence assembler**. User's role: **decider**. The tool never auto-trades or gives definitive advice — it surfaces opportunities with supporting data.

### Design principles (agreed in discussion)
- **Tool assembles information; user decides.** The LLM never picks stocks to buy/sell. The tool adds evidence, the decision is 100% the user's.
- **User will tweak the tool over time** — metrics, thresholds, and screens should be adjustable, not hard-coded.
- **APIs for facts, LLM for judgment** (optional assist only): fetch real data ourselves, optionally hand it to the LLM for a qualitative read (e.g., "does this news read as emotional or structural?"), which the user can freely overrule.
- **No full-market screening.** Scanning 5,000 tickers client-side on free APIs is not feasible. Use a curated universe (e.g., S&P 500 constituents + user watchlist + current holdings) and watch it for setup triggers.
- **Honest framing:** the tool can't compute "probability of +10% in 60 days." It finds *setups* where that outcome is statistically favored and stacks evidence. It's an evidence assembler, not an oracle.

### Education: how to hunt for "+10% in 2 months" (conversation 2026-07-09)
This section captures the frameworks discussed — likely the backbone of the tool's design.

**The setups (nameable patterns that favor a +10%/60d outcome):**

1. **Overreaction mean-reversion** — *the user's archetype (Target trade)*. Quality company drops sharply on news that doesn't impair future earnings; market overshoots on emotion; price mean-reverts over weeks.
   - The one question that decides the trade: **did the news change future cash flows, or just feelings?**
   - *Emotional* (tradeable): boycotts/PR controversies, one bad quarter with guidance intact, sector-wide selloff dragging good names down, macro panic.
   - *Structural* (avoid): fraud/accounting issues, slashed guidance, lost major customer, dividend cut from weakness, secular decline.
   - Detection is automatable (sharp drop + news catalyst); the emotional-vs-structural call is the user's judgment (LLM may draft a read).
2. **Post-earnings-announcement drift** — stocks that beat earnings *and raise guidance* tend to drift upward for several weeks afterward (market underreacts to genuinely good news). One of the most durable documented anomalies; fits the 2-month window well. Corollary: buying *before* earnings is a coin flip, not a setup.
3. **Catalyst-window plays** — for a 10% move in 60 days, usually something must *happen* in the window. A known catalyst (earnings date, product launch, investor day) inside the window is a materially different bet than hoping for drift. Tool should always surface: *what's on this company's calendar in the next 60 days?*
4. **Momentum continuation** — strong uptrends tend to continue (documented effect), but it's the opposite philosophy from mean reversion (buying strength vs. buying panic), more crowded, reverses violently. Secondary lens for this tool, not the primary.

**The three make-or-break filters (apply to every candidate regardless of setup):**

1. **Feasibility — is +10%/60d even normal for this stock?** Computable from price history: *"of all rolling 60-day windows over the past N years, what % contained a +10% gain at some point?"* A low-volatility mega-cap might be ~15% of windows; a volatile mid-cap ~60%. This per-stock **historical base rate** is the most honest "probability" the tool can display. Computable from the Yahoo v8 chart data we already fetch. Key differentiating feature — retail tools don't show this.
2. **Survivability — can the company take the punch?** A dip on a strong-balance-sheet, profitable, dividend-intact company is a mean-reversion candidate; the same dip on a leveraged unprofitable company is a falling knife. Check: debt level, profitability, dividend status. (Target was "safe" because it wasn't going anywhere.)
3. **Context — which way is the tide going?** In a rising market decent stocks hit +10% easily; in a falling market almost nothing does. Simple regime indicator: S&P 500 above/below its 50-day moving average, plus sector relative performance.

**Exit discipline (as important as entry):**
- Define three numbers *before* buying: **target** (e.g., +10% → sell), **stop** (e.g., −7% → thesis wrong, exit), **time stop** (60 days without the move → thesis expired, exit even at breakeven).
- The user's Target trade implicitly did this — took the move and left rather than getting greedy.
- Tool opportunity: record thesis + 3 exits at entry, track the live trade against them, and build a scored history of the user's own calls over time (feedback loop → better judgment).

**The resulting funnel (maps directly to tool stages):**
> detect dip/setup trigger → attach the news catalyst → user judges emotional vs. structural (optional LLM draft read from fetched data) → verify quality/survivability → check feasibility base rate → check market context → define exits → track the trade

**Data feasibility mapping (all free tier, existing pipeline):**
- Price history (drops, RSI, moving averages, volatility, 60-day-window base rates) → Yahoo v8/chart via existing CORS-proxy pipeline
- Company news (catalyst identification) → Finnhub free tier company-news endpoint
- Basic fundamentals (P/E, debt, profitability, dividend) → Finnhub free tier basic financials
- Earnings calendar (catalyst windows) → Finnhub earnings calendar
- Market/sector context → index price history via same Yahoo pipeline (e.g., SPY, sector ETFs)
- Qualitative read on news → existing LLM integration (OpenAI/xAI), fed with fetched data only

### ChatGPT response review (2026-07-09)
User shared a ChatGPT conversation on the same question. Critical review produced these takeaways:

**Adopted from ChatGPT:**
- **"Expectations vs. reality" framing** — short-term prices move on *expectation changes*, not business quality. The Target trade = expectations overshot downward while reality held. Core vocabulary for the tool.
- **The thesis question:** *"What has to happen for this stock to rise 10%?"* — when the user flags a candidate, the tool prompts him to write the answer. That written thesis is what the time stop is later judged against.
- **Weighted scorecard mechanism** — factor table with user-adjustable weights; exactly the "metrics I determine, tweakable over time" requirement. (Ignore ChatGPT's specific weights — they were arbitrary and summed to 125.)
- **Probability-distribution thinking** — optional manual field on a trade ticket: user's own estimate (e.g., 30% +20% / 40% +10% / 20% flat / 10% −15%) to compare candidates on expected outcome, not just upside.
- **Weekly scoring cadence** — batch-scan a curated universe weekly (or on demand), cache results in Firestore. Fits free-API rate limits. Storing each week's scores makes **score change over time** its own signal (improving score ≈ estimate-revision proxy).
- **Sector momentum / "money moves in groups"** — sector relative strength as a context factor.

**Key critique → design decision: scorecards must be SETUP-SPECIFIC.**
ChatGPT's framework is a momentum framework ("weak stocks stay weak, don't catch falling knives", price momentum as a scored factor) — it would have *rejected the user's Target trade* (down big = zero momentum score = looks like a falling knife). Mean reversion and momentum are opposite philosophies; a single universal scorecard mixing their factors systematically screens out one or the other.
- **Decision: strategy profiles.** Separate scorecards per setup — e.g., **Mean Reversion** (scores high for sharp drop + intact fundamentals), **Momentum/Breakout**, **Earnings Drift** — each with its own factors and weights, all user-editable. A candidate's score is always "as a {setup} play", never a context-free number.
- The falling-knife test is correctly about **company** weakness (survivability filter), not **price** weakness.

**Earnings-in-window is a user choice, not a rule.** ChatGPT: earnings are often the catalyst that delivers the 10%. Also true: pre-earnings buys are coin flips (±20% overnight). Resolution: tool flags when a candidate has earnings inside the user's window; user decides whether he wants that exposure. No baked-in bias either way.

**Data reality check on ChatGPT's factors:**
- *Institutional ownership* — 13F data is quarterly + 45-day delayed → mostly expired for a 60-day trade, and thin on free APIs. **Free proxy: unusual volume** (volume spike vs. the stock's own trailing average), computable from Yahoo data we already fetch.
- *Analyst estimates / revisions* — academically the strongest factor in his list, but often paywalled. Finnhub free tier has earnings surprises + recommendation trends; detailed estimate revisions may not be free. **Verify availability during build.**

**Gaps in ChatGPT's response (already covered by our plan):** no exit discipline (targets/stops/time stops), no per-stock feasibility base rate, no market regime check, no feedback loop / trade-history scoring.

### ChatGPT final response review — the phased screener (2026-07-09)
ChatGPT proposed a phased pipeline: universe (300–500 tickers) → fundamental/technical filters → catalysts → valuation → news/AI summary → weighted probability score → ranked shortlist → build a screener that tracks its own results. Review:

**Adopted — the tracking loop (best idea of the whole exchange):**
- Every scan (e.g., weekly Friday), save the top-N ranked stocks as a snapshot. Then automatically check performance 30/60 days later against stored snapshots, compared to S&P 500 benchmark.
- Turns the tool into a **learning system**: over months, accumulates the user's own evidence for which factors actually preceded +10%/60d moves in his universe and market.
- **Caveat (agreed):** cohorts of ~20 are tiny samples; one bull quarter will "prove" momentum, one panic will "disprove" it. The tool **presents evidence, user adjusts weights manually — never auto-tunes.** Framing: a learning journal with receipts, not a rigorous backtest.
- Nearly free to build: we already planned weekly scan snapshots in Firestore; add later price-checks against them.

**Critique — same momentum blind spot, third time:**
- His Phase 2 filters (above 50/200-day MA, higher highs, relative strength, revenue growth >15%, EPS growth >20%, ROE >15%) form a **momentum-growth screener** that excludes the Target trade twice (below its MAs by definition; mature retailer fails growth thresholds).
- **Confirmed design decision:** the funnel *structure* is universal; the **filter values and scorecard weights are properties of the strategy profile**. His filter list ≈ a fine starting *Momentum profile*. The *Mean Reversion profile* inverts technicals (sharp drop, oversold RSI, below MA) and swaps growth thresholds for quality ones (consistent profits, manageable debt, dividend intact).

**Data feasibility verdict on his wish list:**
- Realistically free: price history (Yahoo, built), company news + earnings calendar (Finnhub free), basic fundamentals (Finnhub free), **insider transactions (Finnhub free endpoint — verify during build)**, possibly SEC EDGAR XBRL company-facts API (free JSON fundamentals, via our CORS proxies — investigate).
- Not free / skip: analyst estimate revisions & price targets (paywalled via API), 13F/fund flows (quarterly + 45-day lag anyway), earnings call transcripts (premium), Reddit sentiment (noise).

**Adopted — two design moves that make zero-cost work:**
1. **Staged fetching — align data cost with the funnel.** Stage 1: screen the whole universe on price data only (1 cheap call/ticker → drop %, trend, volatility, base rate). Stage 2: fundamentals only for the ~40 that trigger a setup. Stage 3: news for the ~15 survivors. Stage 4: LLM read for the ~5 finalists. Rate limits stop mattering because expensive data is fetched only where deserved. Start universe at ~100–200 tickers (500 × 800ms ≈ 7 min even for stage 1); scans run as a deliberate user-kicked-off job.
2. **Manual enrichment at the shortlist.** Paywalled factors (analyst revisions, price targets) are free to *read* on any brokerage/Yahoo page — just not via API. Shortlisted finalists get optional manual-entry fields (e.g., "analysts raising: yes/no") that feed the score. Automate the wide end of the funnel; hand-enrich the narrow end.

**Architecture note:** ChatGPT pitched a C#/SQL research platform — wrong for this app, but the concept maps cleanly: browser fetches & scores; Firestore stores universe, strategy profiles, scan snapshots, trade tickets. No server needed.

**Still missing from all ChatGPT responses (covered by our plan):** exit discipline, per-stock feasibility base rate, market regime check, and the user's Goal 2 (portfolio health check on existing holdings).

### Converged tool shape (draft — for discussion, not final)
Emerging from all the above, the tool looks like seven pieces:
1. **Universe manager** — curated ticker list (~100–200 to start; S&P 500 subset + watchlist + current holdings), user add/remove.
2. **Strategy profiles** — per-setup filter thresholds + scorecard weights (Mean Reversion, Momentum, Earnings Drift), all user-editable, tweakable over time.
3. **Scanner** — user-triggered staged scan of the universe (price screen → fundamentals → news), producing a ranked shortlist per profile; results snapshotted to Firestore.
4. **Candidate workspace** — per-candidate evidence page: dip/setup data, base rate (+10%/60d historical frequency), catalyst calendar, quality/survivability checks, market regime, manual enrichment fields, optional LLM read, thesis prompt ("what has to happen for this to rise 10%?").
5. **Trade ticket** — entry + thesis + three exits (target / stop / time stop) + optional probability estimate; live tracking against exits.
6. **Scoreboard / learning loop** — auto-checks past scan snapshots at 30/60 days vs. benchmark; scores closed trades vs. thesis; evidence for manual weight adjustments.
7. **Backtest Lab** — walk-forward historical simulation of the detectors (see formal design in the Plan section below).

### Paid API options (2026-07-09)
User is **not opposed to a paid API if the price is right** — softens the original zero-cost constraint for this feature.

**What paying buys, in impact order:**
1. **Screener endpoint** (FMP) — send criteria, get matching stocks back. Outsources Stage 1 entirely; converts "curated universe" into true market-wide discovery. Biggest architectural upgrade available.
2. **Analyst estimates / revisions / price targets** — strongest paywalled factor; moves from manual shortlist entry to fetched data.
3. **Reliability** — retires the CORS-proxy fallback chain; batch quotes; benefits the whole Investments section.
4. **Rate-limit headroom** — universe can grow to full S&P 500+.

**Price bands (verify current pricing before committing — checked 2026-07):**
- ~$10/mo — **Tiingo**: clean EOD + fundamentals, no screener/thin analyst data. Reliability only.
- ~$15–25/mo — **FMP Starter** (~$15–22/mo w/ annual discount) — *best fit*: fundamentals, ratios, earnings calendar, insider trades, screener endpoint, some analyst data, one provider. Also EODHD Basic €19.99 (global coverage — less relevant for us). **Verify which analyst endpoints are Starter vs Premium.**
- ~$50–100/mo — FMP Premium (~$99), Finnhub premium: full estimate revisions, transcripts. Later, if tool proves out.
- $199/mo — Polygon Advanced: real-time streaming; day-trader infrastructure, wrong fit.

**Design considerations:**
- **API key exposure**: public GitHub Pages repo → key must live in Firestore, runtime-loaded (same pattern as existing Finnhub/OpenAI keys). Insist on **flat-rate plans, never usage-billed** — worst case of a scraped key is burned quota, not a surprise bill.
- **CORS**: provider must allow direct browser calls (Finnhub does; FMP reportedly does — confirm in free trial).

**Agreed path:** build the data layer as a swappable-provider module; start on the free stack; **trial FMP free tier (250 calls/day) early** to validate CORS + screener + analyst endpoints; upgrade to FMP Starter when the free stack pinches (likely at discovery or estimates).

**Speed note (learned during Stage 3 at-scale testing, 2026-07-10):** FMP also fixes update *speed*, not just data gaps. Free-proxy reality: ~2s/ticker → ~17 min full backfill AND ~15 min *every* daily top-up (per-ticker fetches). FMP: direct CORS calls (~300ms), ~300 calls/min (parallelizable → backfill ~2 min), and **batch/bulk EOD endpoints → the daily top-up becomes 1–2 calls, seconds instead of minutes**. When the Phase 3 trial happens, move price fetching to FMP too. Free interim: the Cloudflare Worker (already supported by `_anaFetchYahooHistory`) removes the proxies on the user's real account — verify the worker passes through `range` params for history.

### Technicals architecture + API roles (2026-07-09)
**Decision: compute all technical indicators locally from raw OHLCV price history — never use per-indicator API endpoints.**
- One price-history call per ticker yields *every* indicator: MACD (EMA12−EMA26 + EMA9 signal), RSI, SMAs/EMAs, volume-vs-trailing-average spikes, relative strength vs. S&P, volatility, and custom metrics no API offers (e.g., the +10%/60d rolling-window base rate).
- Benefits: ~1 API call/ticker instead of 1 per indicator (rate limits), user-tweakable indicator parameters (e.g., MACD 8/17/9) with no API dependency, and provider-independence — the math is identical under any data source.
- Principle: **the API's job is raw facts (prices, fundamentals, news, calendars, screener results); the tool's job is the math.**

**API lineup (leading plan, not locked in):**
- **Yahoo v8/chart (free, built)** — raw price history / OHLCV
- **Finnhub (free, built)** — company news, earnings calendar, insider transactions
- **FMP (paid candidate)** — screener (market-wide discovery) + analyst estimates; trial on free tier first; may run as a permanent hybrid with the free sources
- Everything sits behind the swappable data-layer module; the rest of the tool never knows which provider answered.

### Claude's own methodology — mechanism detectors (2026-07-09)
User asked: given the full S&P 500 and an unrestricted API, how would *Claude* find high-quality candidates? Answer differs structurally from ChatGPT's scoring model:

**Core stance: mechanism-first, not score-first.** A +10%/60d move happens because a specific repricing mechanism is active, not because a stock is "good." Run independent detectors in parallel, each hunting one mechanism, each emitting its own small shortlist *with the reason attached*. Never merge into one grand score — a unified number erases the *why*, and the user's judgment operates on the why.

**The pipeline:**
- **Step 0 — Regime gate**: SPY vs 50/200-day MA, VIX, breadth (% of index above own 50-day). Sets which mechanisms are viable + aggressiveness. Note: fearful markets are *good* for the panic-dip detector (more/deeper dips on quality).
- **Step 1 — Feasibility filter** (price data only): per-stock base rate = % of rolling 60d windows (5 yrs) containing a +10% gain; cut below ~25–30%. Removes utilities/staples before any fundamental is fetched.
- **Step 2 — Detectors (parallel):**
  - **A. Panic dip on quality** (Target archetype): down ≥12–15% from 20-day high within ~3 weeks + quality gate (profitable, debt serviceable, dividend intact). **Key metric: price-move vs. estimate-move divergence** — price −15% while consensus forward EPS −2% ⇒ the 13-pt spread IS the emotional component, quantified. Turns the user's gut call into a number. Confirmation: post-dip insider buying.
  - **B. Post-earnings drift with reaction filter**: EPS + revenue beat + guidance raise **+ day-1 gap up that holds** (beat-but-fell = true expectations were higher ⇒ skip). Enter days 2–5, ride 30–60d.
  - **C. Estimate-revision momentum**: forward estimates revised up over 4–8 wks by multiple analysts while price lags ("fundamentals moving faster than price"). Mirror image of A; strongest documented short-horizon factor; requires paid API.
  - **D. Compressed spring (secondary, build last)**: 60d realized vol in bottom decile of own history, near highs, dated catalyst ahead.
- **Step 3 — Catalyst map**: dated events inside the window per candidate (earnings, investor day, product events, Fed meetings for rate-sensitives). Mechanism + dated catalyst = strong hand; mechanism alone = drift bet.
- **Step 4 — Kill list** (weighted heavily — one −25% surprise erases three +10% winners): hard kills = accounting red flags, auditor change, abrupt CFO exit. Judgment flags = earnings-in-window for stocks with ±10% single-day earnings history (binary event), elevated short interest (two-sided: squeeze fuel vs informed sellers — flag, never score).
- **Step 5 — Rank within mechanism, never across**: output = separate shortlists per detector ("top dip-recoveries", "top drift candidates", "top revision plays"), each with its reason. Bonus: concurrent positions from *different* detectors = uncorrelated theses.
- **Step 6 — Dossier per finalist** with **conditional base rates**: find every prior time *this stock* fell 12%+ in 3 weeks; measure forward 60d outcomes. E.g., "TGT dipped like this 9× in 15 yrs; 7 recovered +10% within 60d; median 34 days." Computed from price history alone; sharper than the unconditional base rate; no retail tool shows it. Plus auto-drafted thesis, volatility-sized exit suggestions.

**Signature features vs. ChatGPT's approach:** mechanism detectors over universal scorecard; estimate-vs-price divergence; day-1 reaction filter on PEAD; conditional (event-matched) base rates; kill-list tail-risk emphasis; per-mechanism shortlists preserving the why. Agreed with ChatGPT on: universe, catalysts, quality gates, weekly cadence, tracking loop.

### Feasibility verdict — mechanism strategy in this app (2026-07-09)
**Yes: ~80% buildable on the current free stack; the rest is the already-planned FMP gap.**

**Pure price math (free, Yahoo pipeline, buildable today):** regime gate (SPY + ^VIX via Yahoo chart), Step-1 base-rate filter, Detector A dip trigger, Detector B day-1 reaction check, Detector D, unconditional + conditional base rates. Yahoo serves 5y daily history in one call/ticker; 500 × ~1,250 closes is trivial compute for the browser. Cache computed *stats* in Firestore (not raw history); refresh quarterly. Firestore free limits not threatened.

**Finnhub free adds:** Detector A quality gate (basic financials), insider-buying confirmation, earnings dates (catalyst map), earnings surprises (Detector B beats).

**Needs FMP (or manual field until then):** price-vs-estimate divergence (Detector A's sharpest metric), Detector C entirely, clean guidance-raise detection for B (interim proxy: LLM reads earnings news). All degrade gracefully to manual yes/no fields on finalists.

**Three honest constraints:**
1. **Scans run in an open browser tab** (no server/background jobs). Friday scan = tap "Run Scan," progress bar, ~5–7 min at 500 tickers × 800ms proxy delay. Shrinks to seconds if FMP screener takes Stage 1. Zero-cost escape hatch if needed later: **scheduled GitHub Action** (free on public repos) running a Node script weekly — server-side fetch (no CORS proxies) → writes results to Firestore. File as Phase-later option.
2. **Catalyst map is earnings-complete, events-partial.** Earnings dates via API; investor days/product events/regulatory rulings have no structured free feed → hand-entered on finalists or surfaced by LLM news read. Earnings dominate 60-day catalysts anyway.
3. **Kill-list items are finalist flags, not universe screens.** Short interest fetchable (Yahoo quoteSummary / FMP); auditor changes & CFO exits are news-shaped → LLM checks during dossier step. Funnel working as intended: expensive checks at the narrow end.

**Build order:**
- **Phase 1 (free, price math only):** universe manager, base-rate engine, regime gate, Detector A (price parts) + D, dossier w/ conditional base rates, trade ticket w/ exits, scan snapshots + tracking loop.
- **Phase 2 (Finnhub):** quality gates, insider signal, Detector B, catalyst map.
- **Phase 3 (FMP trial → Starter):** estimate divergence, Detector C, screener-powered market-wide discovery.
No server, framework, or payment required before Phase 3 — vanilla JS + Firestore + existing battle-tested pipelines.

### Scan results screen — output format (mocked 2026-07-09)
Agreed shape of the main output screen (mockup shown in discussion; all data illustrative):
1. **Header**: scan date, universe, duration, "Run scan" button.
2. **Regime banner**: one-line market read (SPY vs 50d/200d, VIX, breadth) — colors aggressiveness before any candidate is read.
3. **Funnel stats row**: scanned → passed base-rate filter → triggered a detector → shortlisted (e.g., 503 → 341 → 19 → 6). At-a-glance selectivity proof.
4. **Per-detector shortlists** (separate sections, never merged): each candidate card shows —
   - Ticker + company + trigger badge (e.g., "−18% in 12 days")
   - One-line *reason* (what happened + quality/divergence summary)
   - Evidence chips: conditional base rate ("7 of 9 similar dips → +10% ≤60d · median 34d"), estimate divergence, insider activity, catalyst presence
   - Kill-list flags in amber (e.g., "Earnings in 22 days (±9% history)") — user's binary-event call
   - Actions: **Open dossier** (drill into evidence page: chart with dip marked, conditional-history table, news + optional LLM read, thesis box, 3 exit fields) · **Dismiss** (recorded for tracking loop)
5. **Locked section** for detectors awaiting Phase 3 data (e.g., estimate-revision momentum: "unlocks with FMP trial") — honest UI, no pretending.
6. **Your holdings check** (Goal 2, same screen): one line per flagged position (held duration, trend, estimate drift) + verdict chip (Review exit / Healthy).

### Walk-forward backtest mode (2026-07-09) — user request, confirmed feasible
User asked: "Start Jan 1st, run the tool every Friday, compare picks against real data over the next 2 months, walk forward week by week, and show a success/failure card at the end." **Verdict: very doable — nearly free given our architecture.**

**Why it's cheap:** detectors already run on cached 5-year raw price history (one fetch/ticker). Simulating "scan as of historical Friday X" = truncate each price series at X and run the same detector math; grading = read the rest of the series (hit +10% ≤60d? stop first? days to target?). **Zero additional API calls** — one fetch powers live scanning AND multi-year backtests. 500 tickers × ~78 Fridays = local JS math, seconds-to-a-minute in browser. Shares scorecard UI with the live Friday tracking loop (backtest = tracking loop pointed at the past).

**Scorecard output:** per-detector: signals fired, hit rate (+10% ≤60d), median days to target, stop-outs, expiries, mechanical-rules P&L vs SPY benchmark. Drill-down list of every historical signal (studying the misses = the learning).

**Validation scope (be honest in UI):**
- Fully testable price-only: dip trigger, Detector D, base rates, regime gate, day-1 reaction filter, exit rules as a system.
- Approximate: quality gate (needs dated historical fundamentals — FMP has them; v1 backtest is price-only and labeled as such). Detector B partial (historical surprises free; historical guidance language unavailable).
- Not testable by design: the user's judgment layer. Backtest = "buy every trigger" robot = the floor. Live tracking loop measures whether judgment beats the floor.

**Biases displayed on the scorecard, not buried:**
- Survivorship: today's S&P 500 membership is the winners' list → flatters results; keep backtests to 1–3 years.
- Overfitting: use backtest to sanity-check threshold choices (12% vs 15% dip), never to optimize to the decimal — tuning until history looks perfect memorizes the past.

**Phasing:** price-only backtest slots into **Phase 1** (needs nothing beyond Phase 1 data). Fundamentals-aware backtest upgrades in Phase 3 with FMP historical statements.

### Existing infrastructure that may be relevant
- **Price fetching pipeline** already exists in Investments: Finnhub (primary) + Yahoo v8/chart via CORS proxies (allorigins → corsproxy → codetabs), 800ms per-ticker delay, retry logic. See `MyLife-Functional-Spec.md` (Investments section) for the full decision log of what failed (CORS, v7 batch endpoint, LLM price lookups — stale, removed).
- **Stock Rollup** (`#investments/stocks`) already aggregates holdings by ticker across all accounts/persons — shares, weighted avg cost, gain, % of net worth, concentration badges.
- **Ask-LLM investments** pattern exists (`AskLLMInvestmentsPlan.md`) — assembles a financial snapshot and sends it to an LLM for analysis.
- Constraint: **zero cost** — free API tiers only, no paid data services.

## Open Questions
*(Remaining after discussion — earlier questions about scope, output, and metric definition were resolved; see Design principles, Converged tool shape, and the mechanism-detector methodology above.)*

- FMP tier verification: which analyst endpoints are on Starter vs. Premium (blocks Phase 3 scoping only).

### Resolved (2026-07-09, user decisions at greenlight)
- **Universe seed: full S&P 500** — static constituent list shipped in the repo (refresh occasionally), plus current holdings and a user-managed watchlist. First cache fetch ~7 min one time, then incremental.
- **Hub card: 🎯 "Stock Analyzer"** on the Financial hub (`#investments`).
- **Default thresholds**: start with discussed values (12–15% dip / ~3 weeks / 25–30% base-rate cutoff; exits +10% / −7% / 60d) — tuned via Backtest Lab, not asked up front.

## Plan

### Formally designed: Backtest Lab (walk-forward simulation)
*Designed 2026-07-09. The first formally-specced component because it validates everything else. Status: designed, not built.*

#### Purpose
Answer "do the detectors have an edge?" with historical evidence before real money follows them. Simulate running the tool every Friday from a chosen start date, grade every signal against what actually happened over the following 60 days, and present a success/failure scorecard.

#### Shared foundation (built first — used by both Backtest Lab and the live scanner)
1. **Data layer** (`js/analyzer-data.js`): swappable-provider module. Phase 1 providers: Yahoo v8/chart (5y daily OHLCV per ticker, existing CORS-proxy pipeline) + SPY/^VIX for regime/benchmark.
2. **Price cache — IndexedDB, not Firestore.** Raw OHLCV for the universe is ~25MB (500 tickers × ~1,250 days) — fine in IndexedDB, hostile in Firestore (doc reads/writes, 1MB limits). Firestore stores only small computed artifacts. Consequence: cache is per-device; a new device re-fetches (~5–7 min once, then incremental daily top-ups).
3. **Detector engine** (`js/analyzer-engine.js`): pure functions — `(priceSeries, config, asOfIndex) → trigger|null` — no fetching, no DOM, no Firestore. **One engine, two clocks**: the live scanner calls it with `asOfIndex = today`; the backtest calls it for every historical Friday. Identical math by construction, so backtest results genuinely describe the live tool.

#### Build-order note (decision)
Within Phase 1, **Backtest Lab is built BEFORE the live scan screen**. Rationale: the backtest is a forcing function — it proves the engine's detector math against history and shakes out bugs before the Friday scan is trusted. Day one of using the tool = point it at January and see how it would have done.

#### Simulation rules (concrete, to avoid look-ahead bias)
- **Signal generation**: each simulated Friday, run detectors on data up to and including that Friday's close only.
- **Entry price**: next trading day's **open** (never the signal-day close — you couldn't have bought it).
- **Exit evaluation** per subsequent day, conservative ordering: (1) stop hit (day's low ≤ stop) → exit at stop; (2) target hit (day's high ≥ target) → exit at target; (3) both in one day → count as **stop** (pessimistic); (4) day 60 reached → exit at close (time stop).
- **Dedup**: a ticker re-triggering the same detector while its simulated position is open is ignored.
- **Outcome buckets**: Target hit · Stop hit · Time expiry (net +/−) · Pending (window extends past today — shown, not graded).
- **Benchmark**: same-dated hypothetical SPY entries with the same holding periods.

#### Backtest run flow (UI)
- Route: `#analyzer/backtest` (under the Stock Analyzer card).
- **Setup form**: start date (default Jan 1 of current year) · end date (default today) · cadence (weekly Friday; fixed for v1) · detectors to include with their threshold configs (pulled from strategy profiles, editable per-run) · exit rules (target % / stop % / time-stop days; default +10% / −7% / 60d) · universe (default: full universe).
- **Run**: kicked-off job with progress bar — phase 1 fetch missing/stale histories into IndexedDB, phase 2 simulate Fridays, phase 3 grade signals. Re-runs with warm cache skip phase 1 (seconds).
- **Results**: scorecard page (below). Run is saved; past runs listable and comparable.

#### Scorecard (results screen)
1. **Params header**: period, cadence, exits, detector configs, universe size — every run is fully described so two runs are comparable.
2. **Bias banner (permanent, not dismissible)**: "Backtests use today's index membership (survivorship bias) and grade a no-judgment robot (your floor, not your ceiling). Sanity-check thresholds; don't optimize to the decimal."
3. **Per-detector result cards**: signals fired · target-hit rate ("26 of 41 → 63%") · stop-outs · expiries · pending · median days-to-target · average win / average loss · expectancy per trade · mechanical P&L vs SPY benchmark.
4. **Signal drill-down table** (per detector): Friday date, ticker, trigger stats (dip %, base rate at the time), entry, outcome, exit date, days held, max drawdown during hold. The misses are the curriculum — this table is where the learning happens.
5. **Compare runs**: side-by-side of two saved runs (e.g., 12% vs 15% dip threshold) — same layout, deltas highlighted.

#### Firestore
- New collection **`analyzerBacktests`**: `{ createdAt, params: {startDate, endDate, cadence, detectors[{id, config}], exits{targetPct, stopPct, timeStopDays}, universeSize}, results: {perDetector[{detectorId, signals, targetHits, stopOuts, expiries, pending, medianDays, avgWin, avgLoss, expectancy, pnlPct, spyPnlPct}]}, signals[] }` — `signals[]` is the drill-down list (~dozens of small records per run; well under the 1MB doc limit; cap at 500 signals per doc as a guard).
- **Backup**: add `analyzerBacktests` (and all future analyzer collections) to `js/settings.js` backup logic per the backup-collections checklist.
- Guardrail: no auto-tuning of thresholds from results — comparison UI only; the user changes configs by hand.

#### Validation scope shipped in v1 (labeled in UI)
- **Tested**: dip trigger (Detector A price parts), Detector D, base-rate filter, regime gate, day-1 reaction filter, exit rules as a system.
- **Not in v1**: quality gates (needs dated historical fundamentals — Phase 3 / FMP upgrade), Detector B guidance component, Detector C, judgment layer (by design — the live tracking loop measures that).

#### Phasing
- **Phase 1**: shared foundation + Backtest Lab v1 (price-only) + live scan screen (in that order).
- **Phase 3 upgrade**: fundamentals-aware backtest (FMP dated historical statements gate the quality filter as-of each simulated Friday); Detector C joins both the live scan and the backtest.

### Implementation plan — Phase 1 stages
*Each stage is independently shippable: user-testable in the preview server, committed + pushed with spec/AppHelp/cache-bump per project conventions. Adjust later stages based on what earlier stages teach us.*

**Stage 1 — Scaffolding & navigation** ✅ COMPLETE (2026-07-09)
- 🎯 "Stock Analyzer" card on the Financial hub (`#investments`)
- New routes: `#analyzer` (hub page), `#analyzer/universe`, `#analyzer/backtest`, `#analyzer/scan` (placeholders where needed)
- New file: `js/analyzer.js` (page routing/rendering); page sections in `index.html`; styles
- ✅ Done when: navigation to all analyzer pages works on desktop + 375px mobile

**Stage 2 — Universe manager** ✅ COMPLETE (2026-07-09)
- Static S&P 500 constituent list shipped in repo (`data/sp500.json`: ticker, name, sector) with a "list as of" date
- Firestore doc for user modifications: watchlist additions, exclusions
- Universe page UI: counts by source (S&P / holdings / watchlist), add/remove watchlist tickers, pull-in of current holdings tickers from Investments (reuse Stock Rollup aggregation)
- ✅ Done when: universe list renders with accurate counts and watchlist add/remove persists

**Stage 3 — Data layer + price cache** ✅ COMPLETE (2026-07-10)
- `js/analyzer-data.js`: 5y daily OHLCV per ticker via existing Yahoo/proxy pipeline; SPY + ^VIX included
- IndexedDB cache (db `bishopAnalyzer`, store `prices`): full fetch, incremental top-up, staleness tracking, resumable progress
- Hub UI: "Update price data" job with progress bar and per-ticker failure report
- ✅ Done when: a full-universe fetch completes, survives reload, and a re-run only tops up

**Stage 4 — Detector engine** (`js/analyzer-engine.js`, pure functions — no fetch/DOM/Firestore)
- Indicators: SMA/EMA, RSI, realized volatility, volume-vs-average
- Base-rate calculator (unconditional + conditional/event-matched), regime evaluator, Detector A dip trigger, Detector D
- ✅ Done when: engine functions produce verifiable numbers against a known ticker's history (spot-checked by hand)

**Stage 5 — Backtest Lab** *(the Phase 1 centerpiece)*
- Setup form → walk-forward runner (per the simulation rules above) → scorecard + signal drill-down → saved runs in `analyzerBacktests` → run comparison
- Add analyzer collections to `js/settings.js` backup logic (backup-collections checklist)
- ✅ Done when: a Jan-1-to-today backtest runs end-to-end and the scorecard matches hand-checked samples

**Stage 6 — Live scan screen**
- Friday scan flow: regime banner, funnel stats, per-detector shortlists (per the mocked output format), scan snapshots to Firestore, dismiss-with-memory
- ✅ Done when: a real scan produces shortlists consistent with what the backtest engine would flag for "today"

**Stage 7 — Candidate dossier (price-only v1)**
- Per-candidate page: price chart with dip marked, conditional-history table, thesis prompt, exit fields (pre-filled defaults)
- ✅ Done when: dossier opens from a scan card with all price-derived evidence populated

**Stage 8 — Trade ticket + live tracking**
- Entry/thesis/exits recorded; open positions tracked against target/stop/time-stop; close-out flow with outcome vs. thesis
- ✅ Done when: a ticket created from a dossier tracks correctly against daily prices

**Stage 9 — Tracking loop / scoreboard**
- 30/60-day auto-grading of past scan snapshots vs SPY; closed-trade history; the "learning journal with receipts"
- ✅ Done when: a past snapshot grades correctly once its window completes
- **Phase 1 complete.** Phase 2 (Finnhub: quality gates, insider signal, Detector B, catalyst map) and Phase 3 (FMP: divergence, Detector C, screener) follow as separate efforts.

### Phase 3 runbook — FMP paid-plan implementation steps (logged 2026-07-10)
FMP integrates *behind* the swappable data layer as preferred provider; free stack stays as automatic fallback (key removed/quota hit → graceful degradation).

**Phase A — free-tier validation (no cost):**
1. ✅ User: create FMP account (free), copy API key. (Done 2026-07-10.)
2. ✅ Claude: "FMP API Key" field added to Settings — **Stock Analyzer (FMP)** accordion card (password input + Show + Save + **Test**). Stored as `fmpApiKey` on `userCol('settings').doc('investments')` (per-user, backed up, never in repo). Test button calls `/stable/profile?symbol=AAPL` (fallback legacy `/api/v3/profile/AAPL`) directly from the browser — validates key AND CORS in one click, reports which API generation answered. (Done 2026-07-10.)
3. Claude: browser-side validation pass (proves CORS) per endpoint; record results here: 5y daily history · batch/bulk EOD quote · stock screener · analyst estimates · earnings calendar · insider trades.
4. **Decision gate (user)**: exact Starter-vs-Premium endpoint map presented; user picks tier or walks away. (Analyst estimates tier placement is the open question that decides value.)

**Phase B — subscribe (user, 5 min):** upgrade in FMP dashboard; same key. Monthly first, annual (~30% off) once proven.

**Phase C — integration (Claude, incremental commits):**
5. `fmp` provider in analyzer-data.js: direct fetch + timeout, 5–10 concurrent (Starter ~300 calls/min). Provider order: FMP → Cloudflare Worker → proxy chain. Backfill ~17 min → ~2 min.
6. Daily top-up via batch EOD endpoint: whole universe's latest candle in 1–2 calls (~15 min → seconds).
7. Feature unlocks in build order: quality-gate fundamentals → earnings calendar + insider trades (consolidate from Finnhub) → analyst estimates (divergence + Detector C) → screener (market-wide discovery).
8. Docs per step: spec, AppHelp, plan, cache bumps.

**Ops:** flat-rate plan only (scraped key = burned quota, never a bill); cancellation degrades gracefully to the free stack.

### Remaining plan sections
*(To be written as each component is formally designed: strategy profiles UI, holdings check (Goal 2), Phase 2/3 details.)*
