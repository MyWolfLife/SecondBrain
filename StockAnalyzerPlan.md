# Stock Analyzer — Plan

**Status: ✅ PHASE 1 COMPLETE (all 9 stages, 2026-07-10). Future: Phase 2 (Finnhub enrichment) and Phase 3 (FMP paid — runbook below).**

## Build Log (session handoff — keep current)
*Update this section as work proceeds so any session can resume mid-stage. Newest first.*

- **2026-07-11 — PHASE 2 DEVELOPMENT PLAN WRITTEN (handoff-grade).** See "PHASE 2 DEVELOPMENT PLAN" section: full Orientation for an implementing model with no prior context (file map, function inventory, Finnhub endpoint specs with response shapes, testing protocol, per-commit conventions) + five explicit stages (2.1 data layer → 2.2 quality/insider → 2.3 Detector B → 2.4 catalyst map → 2.5 news/AI read) with function-level specs, verbatim LLM prompts, verification checklists, and exit criteria. **No Phase 2 code written yet — planning only per user instruction.** First implementation step: ask the user for his Finnhub API key (Stage 2.1 prerequisite).

- **2026-07-10 — Stage 9 COMPLETE. 🏆 PHASE 1 COMPLETE — all 9 stages built and verified.** `js/analyzer-scoreboard.js`:
  - Grading verified exactly against hand-computed candles (synthetic 2026-04-01 scan): FLEX kept → entry $65.86 next-day open, **+109.3% @30d / +146.1% @60d, hit** (FLEX genuinely ran $66→$160+ this spring — why it's now a dip candidate); EA dismissed → −1.2%/+1.0%, miss; SPY +13.9%. Judgment verdict line rendered ("kept outperformed dismissed by 145.1 points"). Today's real scan correctly all-pending ("day 0 of 60"). Synthetic scan deleted after verification.
  - Grades computed on load, never stored — refresh as windows complete; entry/fill rules identical to Backtest Lab. Kept-vs-dismissed segmentation = the judgment score. Closed-trades recap card links to Trades.
  - Test sandbox state for future sessions: 1 open FLEX trade + 1 closed EA trade; 1 real scan (2026-07-10, 20 candidates, FLEX dismissed during Stage 6 testing); price cache in current browser profile has only SPY/^VIX/FLEX/EA (full 507 was in an older profile).
  - **Phase 2 next (future)**: Finnhub — quality gates, insider signal, Detector B, catalyst map (needs user's Finnhub key in test account). **Phase 3 (future)**: FMP Starter — estimate divergence, Detector C, screener, fast batch price updates (runbook in this doc; free-tier key already validated).

- **2026-07-10 — Stage 8 COMPLETE.** `js/analyzer-trades.js` — trade tickets + live tracking built + verified:
  - Full loop verified: FLEX ticket created from the dossier (entry pre-filled $135.80, 40 shares, target $149.38 = ×1.10 exact, thesis carried over) → duplicate FLEX ticket correctly rejected → aged EA position (seeded entry 2026-05-01) showed **+13.6% P&L, "🎯 Target reached" banner, day 47 of 60** → close flow auto-suggested reason "target", stored **ret +13.64% / SPY +4.76%, both matching independent recomputation** → closed summary line ("1 of 1 profitable · thesis right 1 of 1") → all persisted across reload. Console clean, no overflow.
  - Thesis-verdict field (right/wrong/mixed) is the judgment feedback loop; SPY benchmark column keeps wins honest.
  - Test sandbox now holds 1 open FLEX trade + 1 closed EA trade — **useful seed data for Stage 9 testing, leave in place**.
  - Note: styles v767 bump was unnecessary (no new CSS — reused as-/ab- classes); skipped.
  - Next: **Stage 9 — tracking loop / scoreboard** (30/60d auto-grading of past scan snapshots vs SPY; closed-trade history integration; "learning journal with receipts"). Phase 1 completes with it.

- **2026-07-10 — Stage 7 COMPLETE.** Candidate dossier built + verified (route `#analyzer/dossier/{scanId}/{ticker}/{detector}`, code in `js/analyzer-scan.js`):
  - FLEX dossier via deep link: badge (−16.2% in 7d — live recompute, deeper than scan-time), 7 evidence chips, Chart.js chart (price + target/stop dashed guides + peak triangle, 4 datasets), **similar-dips table exactly matches `anaEngDipEvents` (19 rows)**, thesis + custom exits (target 12%) saved to scan doc and **persisted across full reload**; live exit-price recompute correct ($152.10 = $135.80 × 1.12).
  - EA spring dossier: 52w-high line variant, no dip table — as designed. Read-only mode when scan doc missing.
  - Scan card "Open dossier" button enabled (navigates with scanId context). Console clean.
  - **Verification env note**: the preview browser profile was replaced (Browser pane) — IndexedDB cache started empty; re-seeded 4 tickers for testing. The user's own device keeps its cache. Also: viewport resize tool wouldn't apply (stuck at 669px) — mobile check done via overflow containment (table scrolls in wrapper, no body overflow) rather than exact 375px.
  - Next: **Stage 8 — trade ticket + live tracking** (entry/thesis/exits recorded from dossier; open positions tracked against target/stop/time-stop; close-out flow vs thesis).

- **2026-07-10 — Stage 6 COMPLETE.** `js/analyzer-scan.js` — live scan screen built + verified:
  - Real scan on cached data: **501 → 494 → 47 → 20 funnel in 2.1s**, regime banner green (bullish, VIX 15.9). Candidate cards match the mocked format (e.g., "FLEX −13.7% in 6d · Similar dips: 15 of 16 hit +10% ≤60d · median 9d · Base rate 74%").
  - **Every shortlisted dip confirmed by a direct engine sweep** (subset of 44 raw triggers after base-rate filter + top-15 cap). Dismiss persisted across full reload (FLEX), undo row works. No mobile overflow, no console errors.
  - **FMP earnings enrichment finding**: mechanism works (1 calendar call/scan when key present), but **free tier returns only ~72 popular symbols** — most candidates get no chip. Per-symbol earnings endpoint also 402s on free. Full coverage needs FMP Starter or Finnhub (Phase 2). Documented in help.
  - Note: base-rate cutoff 25% barely filters on the 2021-26 lookback (494/501 pass — a volatile 5y makes +10%/60d common). Tune via Backtest Lab later; consider 35–40%.
  - Next: **Stage 7 — candidate dossier** (price chart w/ dip marked, conditional-history table, thesis prompt, exit fields; enables the Open dossier button).

- **2026-07-10 — Stage 5 COMPLETE.** `js/analyzer-backtest.js` — Backtest Lab fully built + verified:
  - Full run Jan-1→Jul-10 2026: 504 tickers × 28 Fridays → **1,040 signals in ~25s** in-browser. Detector A: 940 signals, 44.5% hit, median 7d, avg +0.70%/trade vs SPY +1.24% (robot underperformed the index this period — honest floor). Detector D: 100 signals, 43.3% hit, +1.35% vs SPY +0.96%.
  - **Hand-verified correctness**: APP signal (Jan-2 Friday, −15.7% dip) — entry Mon Jan-5 open $617.70, target hit day 6 — matches independent replay of the exit rules exactly.
  - Threshold comparison ran (dip 12% vs 15%): 15% → 568 signals, 45.3% hit, +0.77% — compare table renders side-by-side.
  - Save/View/Compare/Delete verified against Firestore (`analyzerBacktests`, signals capped 500 w/ truncated flag, in backup list). Mobile: no page overflow; signals table scrolls in its own wrapper. No console errors.
  - Note for later stages: stop-outs can re-trigger the following Friday (churn is visible in the robot results by design — judgment layer + kill list are the intended filters).
  - Next: **Stage 6 — live scan screen** (regime banner, funnel stats, per-detector shortlists per the mocked output format, scan snapshots, dismiss-with-memory).

- **2026-07-10 — Stage 4 COMPLETE.** `js/analyzer-engine.js` — all pure functions, verified against real cached data:
  - Indicators (SMA/EMA/RSI/realized-vol/volume-ratio): SMA hand-checked vs independent computation — exact match.
  - Base rates: unconditional + conditional (event-matched dip episodes). **Two bugs found & fixed during verification**: (1) episode never ended for stocks that permanently reset lower (missing window-expiry exit) — May-2023 TGT dip was invisible; (2) `episodeStart` never set → every day of a deepening dip counted as a new event (113 events instead of 11).
  - Flagship validation: **TGT = 11 distinct dip episodes / 5y** (Omicron, 2022 earnings crash, May-2023 controversy, Oct-2023 bottom, Aug-2024 flash selloff, Nov-2024 earnings, Mar-2025 tariffs) → **5/11 hit +10% ≤60d, median 24 days**. Notably: the May-2023 controversy dip did NOT recover +10% in 60d (kept sliding all summer) — honest data.
  - Full-universe sanity scan: **505 tickers × both detectors in 940ms** in-browser. Output plausible (semi-sector dip cluster; Detector D flagged EA pinned near-zero vol = acquisition arb).
  - Regime evaluator: bullish (SPY > SMA50/200, VIX 15.9).
  - Next: **Stage 5 — Backtest Lab** (setup form → walk-forward runner → scorecard → `analyzerBacktests` + backup list + run comparison).

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

**Stage 4 — Detector engine** ✅ COMPLETE (2026-07-10) (`js/analyzer-engine.js`, pure functions — no fetch/DOM/Firestore)
- Indicators: SMA/EMA, RSI, realized volatility, volume-vs-average
- Base-rate calculator (unconditional + conditional/event-matched), regime evaluator, Detector A dip trigger, Detector D
- ✅ Done when: engine functions produce verifiable numbers against a known ticker's history (spot-checked by hand)

**Stage 5 — Backtest Lab** ✅ COMPLETE (2026-07-10) *(the Phase 1 centerpiece)*
- Setup form → walk-forward runner (per the simulation rules above) → scorecard + signal drill-down → saved runs in `analyzerBacktests` → run comparison
- Add analyzer collections to `js/settings.js` backup logic (backup-collections checklist)
- ✅ Done when: a Jan-1-to-today backtest runs end-to-end and the scorecard matches hand-checked samples

**Stage 6 — Live scan screen** ✅ COMPLETE (2026-07-10)
- Friday scan flow: regime banner, funnel stats, per-detector shortlists (per the mocked output format), scan snapshots to Firestore, dismiss-with-memory
- ✅ Done when: a real scan produces shortlists consistent with what the backtest engine would flag for "today"

**Stage 7 — Candidate dossier (price-only v1)** ✅ COMPLETE (2026-07-10)
- Per-candidate page: price chart with dip marked, conditional-history table, thesis prompt, exit fields (pre-filled defaults)
- ✅ Done when: dossier opens from a scan card with all price-derived evidence populated

**Stage 8 — Trade ticket + live tracking** ✅ COMPLETE (2026-07-10)
- Entry/thesis/exits recorded; open positions tracked against target/stop/time-stop; close-out flow with outcome vs. thesis
- ✅ Done when: a ticket created from a dossier tracks correctly against daily prices

**Stage 9 — Tracking loop / scoreboard** ✅ COMPLETE (2026-07-10)
- 30/60-day auto-grading of past scan snapshots vs SPY; closed-trade history; the "learning journal with receipts"
- ✅ Done when: a past snapshot grades correctly once its window completes
- **Phase 1 complete.** Phase 2 (Finnhub: quality gates, insider signal, Detector B, catalyst map) and Phase 3 (FMP: divergence, Detector C, screener) follow as separate efforts.

### Phase 3 runbook — FMP paid-plan implementation steps (logged 2026-07-10)
FMP integrates *behind* the swappable data layer as preferred provider; free stack stays as automatic fallback (key removed/quota hit → graceful degradation).

**Phase A — free-tier validation (no cost):**
1. ✅ User: create FMP account (free), copy API key. (Done 2026-07-10.)
2. ✅ Claude: "FMP API Key" field added to Settings — **Stock Analyzer (FMP)** accordion card (password input + Show + Save + **Test**). Stored as `fmpApiKey` on `userCol('settings').doc('investments')` (per-user, backed up, never in repo). Test button calls `/stable/profile?symbol=AAPL` (fallback legacy `/api/v3/profile/AAPL`) directly from the browser — validates key AND CORS in one click, reports which API generation answered. (Done 2026-07-10.)
3. ✅ Claude: browser-side validation pass done 2026-07-10 (~20 calls of 250 daily budget). **All calls direct from browser — CORS confirmed across every endpoint tested.** Results:

   | Endpoint (stable API) | Free tier | Notes |
   |---|---|---|
   | `profile?symbol=` | ✅ 200 | symbol, price, marketCap, beta… |
   | `historical-price-eod/full?symbol=&from=&to=` | ✅ 200 | **Full 5y daily OHLCV, 1,260 candles in one call** |
   | `analyst-estimates?symbol=&period=annual` | ✅ 200 | revenue/ebitda/netIncome/**eps avg-high-low** + **numAnalystsEps** — divergence metric data! |
   | `analyst-estimates` `period=quarter` | ❌ 402 | Quarterly granularity is a premium query param |
   | `price-target-consensus?symbol=` | ✅ 200 | targetHigh/Low/Consensus/Median |
   | `earnings-calendar?from=&to=` | ✅ 200 | incl. **epsActual vs epsEstimated** → earnings surprises + Detector B data |
   | `grades?symbol=` | ✅ 200 | 775 upgrade/downgrade records for TGT — revision-activity proxy for Detector C |
   | `ratios?symbol=`, `income-statement?symbol=` | ✅ 200 | Quality-gate fundamentals |
   | `batch-quote?symbols=` | ❌ 402 | Locked — fast daily top-ups need paid |
   | `company-screener` | ❌ 402 | Locked — market-wide discovery needs paid |
   | `insider-trading/search` | ❌ 402 | Locked — Finnhub free tier covers this instead |

   **Free-tier daily cap: 250 calls** → cannot be the primary price source for a 507-ticker universe; perfect for *shortlist enrichment* (finalists only).
4. **Decision gate (user)**: FMP site 403-blocks automated doc fetches, so Starter-vs-Premium placement of the locked endpoints (batch-quote, screener) must be read off the pricing table in the user's logged-in dashboard before paying. **Recommendation: defer the purchase.** The free tier already unlocks the highest-value data (estimates, targets, surprises, grades) for finalist enrichment; Yahoo remains the proven price source (~18 min Fridays). Buy Starter later for speed (batch quotes, 300 calls/min backfill) + screener, after confirming both are in Starter.

**Phase B — subscribe (user, 5 min):** upgrade in FMP dashboard; same key. Monthly first, annual (~30% off) once proven.

**Phase C — integration (Claude, incremental commits):**
5. `fmp` provider in analyzer-data.js: direct fetch + timeout, 5–10 concurrent (Starter ~300 calls/min). Provider order: FMP → Cloudflare Worker → proxy chain. Backfill ~17 min → ~2 min.
6. Daily top-up via batch EOD endpoint: whole universe's latest candle in 1–2 calls (~15 min → seconds).
7. Feature unlocks in build order: quality-gate fundamentals → earnings calendar + insider trades (consolidate from Finnhub) → analyst estimates (divergence + Detector C) → screener (market-wide discovery).
8. Docs per step: spec, AppHelp, plan, cache bumps.

**Ops:** flat-rate plan only (scraped key = burned quota, never a bill); cancellation degrades gracefully to the free stack.

## PHASE 2 DEVELOPMENT PLAN — Finnhub Enrichment (handoff-grade)
*Written 2026-07-11. This plan is written so that ANY implementing model or developer can execute it without prior knowledge of this codebase or conversation. Read this entire section plus "Orientation" before writing any code. Execute stages strictly in order; each stage is independently shippable.*

**Scope assumption (explicit):** Phase 2 = the five stages below ONLY. The holdings health check (Goal 2), strategy-profiles configuration UI, and all Phase 3 / paid-FMP work are OUT of scope — do not build them even if they seem adjacent.

---

### Orientation for the implementing model (read first, skip nothing)

**A. What this feature is.** The Stock Analyzer (🎯 card on the Financial hub, routes under `#analyzer`) finds short-term trade setups. Phase 1 (complete) built: universe manager, IndexedDB price cache, a pure-function detector engine, a walk-forward Backtest Lab, a live scanner, candidate dossiers, trade tickets, and a scoreboard. Phase 2 adds fundamentals/insider/earnings/news data from **Finnhub's free tier** so candidates carry quality evidence, a third detector (post-earnings drift) goes live, and the dossier gains a news feed with an optional LLM "emotional vs structural" read. Core principle everywhere: **the tool assembles evidence; the user decides. The LLM never says buy/sell.**

**B. Files you will touch (all vanilla JS, no framework, no build step):**
| File | Role | Phase 2 changes |
|---|---|---|
| `js/analyzer-data.js` | Price cache (IndexedDB db `bishopAnalyzer`, store `prices`) + Yahoo fetchers | ADD Finnhub fetchers (Stage 2.1) |
| `js/analyzer-engine.js` | PURE functions only — no fetch/DOM/Firestore. Detectors, indicators, base rates | ADD `anaEngDriftTrigger` (Stage 2.3) |
| `js/analyzer-scan.js` | Scan page + candidate dossier | Chips, third shortlist, news, AI read (2.2–2.5) |
| `js/analyzer-backtest.js` | Walk-forward backtest | Detector B support (2.3) |
| `js/analyzer.js` | Hub page, breadcrumb helper `_analyzerBreadcrumb(trail)` | Possibly hub text only |
| `index.html` | All page sections + script tags with `?v=` cache-busters | Bump `?v=` on EVERY changed JS file |
| `sw.js` | Service worker; `CACHE_NAME = 'bishop-vNNN'` | Bump NNN on EVERY commit touching JS/HTML/CSS |
| `css/styles.css` | All styles; analyzer classes are prefixed `ana-`, `ab-`, `as-`, `ad-` | Reuse existing classes; add sparingly |
| `js/settings.js` | Contains the backup collection list (search `'analyzerConfig'`) | Only if a new Firestore collection is added |
| `js/help.js` | `HELP_SECTION_MAP` maps route slugs → AppHelp.md `## screen:X` sections | Only if a new screen is added |
| `MyLife-Functional-Spec.md` Part 8f | Source-of-truth feature spec | UPDATE EVERY STAGE (same commit) |
| `AppHelp.md` `## screen:analyzer*` sections | In-app help (feeds Help page AND LLM Q&A) | UPDATE EVERY STAGE (same commit) |

**C. Key existing functions you will call (do not reimplement):**
- `userCol(name)` (firebase-config.js) — per-user Firestore collection `/users/{uid}/{name}`. ALL Firestore access goes through this.
- `anaGetPriceHistory(ticker)` → Promise of `{ticker, updatedAt, dates[], open[], high[], low[], close[], volume[]}` (aligned ascending arrays, ~5y daily) or null. IndexedDB-backed.
- `anaEngIndexForDate(rec, 'YYYY-MM-DD')` → last index with date ≤ arg, or −1.
- `anaEngDipTrigger`, `anaEngSpringTrigger`, `anaEngBaseRate`, `anaEngConditionalBaseRate`, `anaEngDipEvents`, `anaEngRsi`, `anaEngSma`, `anaEngVolumeRatio`, `anaEngRegime` — see analyzer-engine.js headers for signatures.
- `_investGetFinnhubKey()` (investments.js) → Promise of the Finnhub key string ('' if unset). Reads `userCol('settings').doc('investments').finnhubApiKey` with module-level caching.
- `_anaFetchWithTimeout(url, ms)` (analyzer-data.js) — fetch with AbortController timeout. Use for every network call.
- `escapeHtml(str)` — use on ALL user/API strings interpolated into HTML.
- `_abFmtPct(v)` (analyzer-backtest.js) — '+x.x%' formatter, null-safe.
- Scan internals: `AS_DEFAULTS` (dip 12%/15d, gain 10%/60d, cutoff 0.25, cap 15), `_asComputeScan`, `_asCandidateCard(c)`, `_asRenderScan`, `_asLatestScan` (module var holding the displayed scan incl. `.id`). Dossier internals: `loadAnalyzerDossierPage`, `_adRender`, `_adCtx`.
- LLM call (Stage 2.5): grep `chatCallOpenAICompat` — existing helper used by house.js/garage.js: `chatCallOpenAICompat(llm, apiKey, content, model)`. LLM config doc: grep `llmCfg`/`cfg.provider` in help.js to find the settings doc it reads. **CRITICAL PROJECT RULE: OpenAI calls must use `max_completion_tokens`, NEVER `max_tokens`** (deprecated; newer models reject it). The existing helper already complies — reuse it.

**D. Finnhub free-tier facts (verified for this project):**
- Base `https://finnhub.io/api/v1/`, auth via `&token=KEY` query param. **CORS allows direct browser calls — no proxies** (the app already calls `/quote` directly in investments.js).
- Rate limit: **60 calls/minute**. Exceeding returns HTTP 429. Rule: sequential calls with **1,100ms spacing** between Finnhub requests; on a 429, wait 5,000ms and retry once; on second 429, record the item as failed and continue.
- The key is **per-user** (each account's Settings). The TEST ACCOUNT needs its own copy — see section F.
- Symbols: Finnhub uses dots for share classes (`BRK.B`) — same as our canonical tickers, NO translation needed (unlike Yahoo, which needs `BRK-B`; that translation already exists in `_anaFetchYahooHistory` — do not copy it to Finnhub calls).

**E. Endpoints for Phase 2 (URL · response shape · notes):**
1. **Basic financials**: `GET /stock/metric?symbol={T}&metric=all&token=` → `{metric: {…~100 keys…}, series: {…}}`. Keys of interest (READ DEFENSIVELY — key names vary by listing; during Stage 2.1 verification you MUST `console.log(Object.keys(data.metric))` for one real ticker and adjust): net margin (`netProfitMarginTTM` or `netMarginTTM`), debt/equity (`totalDebt/totalEquityQuarterly` — yes, the key contains a slash: access as `metric['totalDebt/totalEquityQuarterly']`), `currentRatioQuarterly`, `dividendYieldIndicatedAnnual`, `epsTTM` or `epsBasicTTM`, `roeTTM`. Write a helper `_anaPick(obj, keyList)` returning the first non-null among candidate key spellings.
2. **Insider transactions**: `GET /stock/insider-transactions?symbol={T}&from={YYYY-MM-DD}&to={YYYY-MM-DD}&token=` → `{data: [{name, share, change, filingDate, transactionDate, transactionCode, transactionPrice}]}`. A BUY is `change > 0` (also `transactionCode === 'P'` = open-market purchase, the strongest signal). Sum buys since a given date.
3. **Earnings calendar**: `GET /calendar/earnings?from={date}&to={date}&token=` → `{earningsCalendar: [{date, epsActual, epsEstimate, revenueActual, revenueEstimate, symbol, hour, quarter, year}]}`. `hour` ∈ `'bmo'` (before market open) | `'amc'` (after market close) | `'dmh'`/empty. One call covers ALL symbols in the range. Free tier: current-quarter-ish ranges work; deep history may be gated — VERIFY during 2.3 and record the finding here.
4. **Earnings surprises**: `GET /stock/earnings?symbol={T}&token=` → array (newest first) `[{actual, estimate, period, quarter, surprise, surprisePercent, symbol, year}]`. Free tier returns ~last 4 quarters.
5. **Company news**: `GET /company-news?symbol={T}&from={date}&to={date}&token=` → array `[{category, datetime (unix secs), headline, id, image, related, source, summary, url}]`. Free tier covers roughly the trailing year. Can return 100+ items — take the newest ~15.

**F. Testing protocol (MANDATORY — CLAUDE.md "Preview Verification" rule):**
1. Start the dev server: `preview_start` → name `bishop-dev` (python server, port 8080, config in `.claude/launch.json`).
2. Log in with the TEST ACCOUNT (creds in the private memory file `reference_test_account.md`; also `.test-credentials.md` in repo root, gitignored). All data is per-user (`userCol`) — the test account is an isolated sandbox; the owner's data is never touched.
3. **Ask the user for his Finnhub API key at the start of Stage 2.1** (per standing agreement: always ask for keys; never hardcode or commit them). Save it in the browser: `await userCol('settings').doc('investments').set({finnhubApiKey: KEY}, {merge:true})`. For Stage 2.5, similarly ask about LLM config if `userCol`'s LLM settings doc is empty in the test account.
4. Price-cache reality: the cache is **per browser profile**; preview restarts sometimes reset the profile. Check `await _anaCacheStats()`; if empty, re-seed only what the stage needs: `await _anaUpdatePrices(['SPY','^VIX','FLEX','EA', …], {})` (~2s/ticker). A full 507-ticker fetch takes ~18 min — only do it if a stage truly needs breadth.
5. Existing sandbox fixtures you can rely on (as of 2026-07-10): one saved scan (2026-07-10, 20 candidates, FLEX dismissed), one OPEN trade (FLEX), one CLOSED trade (EA, +13.64%, verdict right). Mock brokerage "Test Brokerage (analyzer test)" with NVDA+GRAB holdings under investments/self.
6. Verify each stage with explicit checks (each stage lists them). Always finish with: console errors = none (`preview_console_logs` level error), no horizontal page overflow (tables must scroll inside `.ab-table-wrap`), and a full-reload persistence check.
7. Known tooling quirks: screenshot capture sometimes times out (use DOM/a11y checks instead); `location.hash` navigation is async (sleep ~150ms+ before asserting); viewport resize may not apply (verify overflow via `document.documentElement.scrollWidth <= window.innerWidth`).

**G. Per-commit conventions (NON-OPTIONAL, from CLAUDE.md — repeat for EVERY stage):**
1. Update `MyLife-Functional-Spec.md` Part 8f in the SAME commit (the section that owns the change). Tell the user which spec sections changed.
2. Update `AppHelp.md` (`## screen:analyzer`, `## screen:analyzer-scan`, `## screen:analyzer-dossier`, etc. as affected) in the SAME commit. Tell the user what changed (or that you evaluated and none was needed).
3. Bump `?v=` in index.html for every changed JS/CSS file (increment the existing integer).
4. Bump `sw.js` `CACHE_NAME` (`bishop-vNNN` → NNN+1) in the SAME commit.
5. New Firestore collections → add to the backup list in `js/settings.js` (search `// Stock Analyzer`) AND to spec Part 15 data model. (Phase 2 as planned adds NO new collections — data is stamped onto existing `analyzerScans` candidate objects.)
6. Update THIS DOC's Build Log (top of file) at stage start (task list) and stage end (results, findings, bugs fixed).
7. Commit message style: `feat(analyzer): Stage 2.N — <summary>` + bullet list + `Co-Authored-By` line per repo convention. Then notify BEFORE pushing: `curl -d "Ready to push — please confirm the Windows prompt" ntfy.sh/WolfLifeBishop` then `git push` immediately. Commit+push every completed stage without being asked.

**H. Data-source correction from Phase 1 (why Finnhub, not FMP):** FMP's free tier is popular-symbols-only for per-symbol endpoints (TGT worked; FIX returned 402) and its earnings calendar covers only ~72 symbols. Finnhub free covers ALL US symbols. Keep the existing FMP earnings-chip code path as a silent fallback; Finnhub becomes the primary source in Stage 2.4. FMP becomes primary only in Phase 3 (paid).

---

### Stage 2.1 — Finnhub data layer

**Goal:** All five Finnhub fetchers exist in `js/analyzer-data.js`, rate-limited, timeout-guarded, returning parsed/normalized objects. No UI changes yet.

**Implementation spec — add to `js/analyzer-data.js` (bottom, new section banner `// Finnhub fetchers (Phase 2)`):**
```
var _anaFinnhubLastCall = 0;                       // ms timestamp of last Finnhub request
async function _anaFinnhubGet(path, params)        // ONE choke-point for ALL Finnhub calls
  // 1. key = await _investGetFinnhubKey(); if (!key) throw new Error('No Finnhub API key — add it in Settings');
  // 2. Enforce spacing: wait so that Date.now() - _anaFinnhubLastCall >= 1100 before fetching.
  // 3. url = 'https://finnhub.io/api/v1/' + path + '?' + querystring(params) + '&token=' + encodeURIComponent(key)
  // 4. resp = await _anaFetchWithTimeout(url, 10000); set _anaFinnhubLastCall = Date.now() AFTER the fetch resolves.
  // 5. If resp.status === 429: wait 5000ms, retry once (same URL). Second 429 → throw new Error('Finnhub rate limit').
  // 6. If !resp.ok → throw new Error('Finnhub HTTP ' + resp.status). Return await resp.json().

async function anaFinnhubMetrics(ticker)           // → normalized {profitable:bool|null, netMarginPct, debtToEquity,
  //   currentRatio, dividendYieldPct, roePct, raw:{}} using _anaPick over the key-spelling lists from Orientation E.1.
  //   profitable = netMargin > 0 (null if metric missing). Keep `raw` = data.metric for the dossier detail view.
function _anaPick(obj, keys)                       // first non-null/defined value among candidate key names, else null

async function anaFinnhubInsiders(ticker, fromDate) // → {buys, sells, buyShares, netShares, purchases:[{date,name,shares,price}]}
  //   from insider-transactions data[]: buys = entries change>0; purchases = entries transactionCode==='P' (top 5, newest first)

async function anaFinnhubEarningsCalendar(fromDate, toDate) // → map {SYMBOL: {date, hour, epsEstimate, epsActual,
  //   revenueEstimate, revenueActual}} keeping the EARLIEST date per symbol. Symbols keyed EXACTLY as returned (dots kept).

async function anaFinnhubSurprises(ticker)         // → array as returned (newest first), [] on empty

async function anaFinnhubNews(ticker, fromDate, toDate) // → newest-first [{date:'YYYY-MM-DD', headline, source, summary, url}]
  //   (convert unix `datetime` secs → date string; cap at 15 items; skip items with no headline)
```
Version bumps: `analyzer-data.js?v=+1`, sw CACHE_NAME +1.

**Verification (preview, after asking the user for the Finnhub key and saving it to the test account):**
1. `await anaFinnhubMetrics('FLEX')` → object with ≥3 non-null fields; ALSO run the raw call and `console.log(Object.keys(data.metric).join(','))` — if the key spellings in Orientation E.1 were wrong, FIX `_anaPick`'s lists now and record the true key names in this doc.
2. `await anaFinnhubInsiders('FLEX', '2026-04-01')` → object returns without error (zero buys is a valid result).
3. `await anaFinnhubEarningsCalendar(today, today+60d)` → map with **hundreds** of symbols (this is the all-symbols advantage over FMP; if you get <100, investigate before proceeding).
4. `await anaFinnhubSurprises('FLEX')` → ~4 rows with actual/estimate.
5. `await anaFinnhubNews('FLEX', today−14d, today)` → ≥1 headline (FLEX is active; if 0, try 'NVDA').
6. Fire 3 fetchers back-to-back and confirm ≥1.1s spacing between requests (console-log timestamps in _anaFinnhubGet during dev; remove noisy logs before commit).
7. Rate-limit path: temporarily set spacing to 0 and loop 70 quick `/quote` calls to force a 429, confirm the 5s-retry works, restore spacing. (Skip if reluctant to burn quota — but then verify the 429 branch by code review.)

**Docs:** spec Part 8f "Price data layer" section gains a "Finnhub fetchers" paragraph (endpoints, spacing, key source). AppHelp: no user-visible change — state that explicitly to the user. Build Log updated. Commit `feat(analyzer): Stage 2.1 — Finnhub data layer`, notify, push.

---

### Stage 2.2 — Quality gate + insider signal (Detector A enrichment)

**Goal:** Every DIP candidate on a fresh scan carries survivability chips (profitability, debt, dividend) and a post-dip insider-buying chip; falling-knife profiles get an amber warning chip. Dossier shows the full metric set. NOTHING is auto-excluded — evidence only.

**Implementation spec:**
1. `js/analyzer-scan.js` → `_asComputeScan`: AFTER the shortlist is built (after the top-15 cap — so at most ~30 fetch-pairs), loop the DIP candidates sequentially: `c.quality = await anaFinnhubMetrics(c.ticker)` and `c.insiders = await anaFinnhubInsiders(c.ticker, c.peakDate)` (peakDate = start of the dip; buys since then = "catching their own knife"). Wrap EACH candidate's fetches in try/catch — on error set the field to `{error: msg}` and continue (one bad ticker must not kill the scan). Update the progress note per candidate ('Enriching 3 / 15 — FLEX…'). Persist as part of the scan doc (existing `userCol('analyzerScans').add` already saves candidates — the new fields ride along; they are point-in-time records, exactly what the Scoreboard needs later).
2. `_asCandidateCard(c)` chips, appended after the base-rate chip (reuse classes `as-chip` / `as-chip-warn`):
   - quality: `✅ Profitable` or amber `⚠️ Unprofitable`; `Debt/eq {x.x}` (amber when > 2.0); `Div {y.y}%` only when > 0.
   - insiders: green-ish chip `👤 Insider buys: {n}` only when `purchases.length > 0` (transactionCode P since peak).
   - **Falling-knife flag** (amber, at the FRONT of the chip row): show `⚠️ Falling knife?` when (unprofitable AND debtToEquity > 2) — the plan's kill-list posture is FLAG, never auto-remove.
   - All chips skipped silently when `c.quality`/`c.insiders` missing or `{error}` (old scans without enrichment must still render — backward compatibility is REQUIRED; the 2026-07-10 fixture scan is the test).
3. Dossier (`_adRender` in analyzer-scan.js): new section `<h3>🏥 Quality</h3>` after the chips row, rendering a small two-column list of ALL normalized metric fields + the insider purchases list (date · name · shares · price). Data source: `ctx.candidate.quality/.insiders` when present, else fetch live (dossier already recomputes evidence — mirror that pattern with try/catch + "Quality data unavailable" fallback).
4. NO engine changes, NO new collections.
Version bumps: `analyzer-scan.js?v=+1`, sw +1.

**Verification:** run a real scan (universe can be the 4-ticker seeded cache — funnel small, that's fine; if you want breadth, seed ~20 tickers incl. current dips). Confirm: chips render with live values; a candidate with missing metrics renders WITHOUT chips (not broken); the OLD fixture scan (2026-07-10) still renders; dossier Quality section shows for a fresh candidate; scan doc in Firestore contains `quality`+`insiders` on dip candidates; reload persistence; console clean.

**Docs:** spec Part 8f live-scan + dossier sections updated (chips, falling-knife flag, enrichment fetch behavior). AppHelp `screen:analyzer-scan` (chip meanings incl. falling-knife) + `screen:analyzer-dossier` (Quality section). Build Log. Commit, notify, push.

---

### Stage 2.3 — Detector B: post-earnings drift

**Goal:** Third detector live end-to-end: engine trigger, scan shortlist section, dossier variant, backtest support (labeled approximate).

**Implementation spec:**
1. **Engine** (`js/analyzer-engine.js` — PURE function; earnings data passed IN as an argument, never fetched here):
```
function anaEngDriftTrigger(rec, earnings, opts) → null | {ticker, reportDate, reactionIdx, epsSurprisePct,
                                                           revenueBeat, day1RetPct, daysSinceReaction, close}
  // earnings: {date:'YYYY-MM-DD', hour:'bmo'|'amc'|other, epsActual, epsEstimate, revenueActual, revenueEstimate}
  //           (the symbol's MOST RECENT past report — caller finds it)
  // opts: {asOfIndex?, maxAgeDays=10, minDay1Pct=2, minSurprisePct=2}
  // Rules (all must hold):
  //  a. epsActual > epsEstimate AND surprisePct = (actual−estimate)/|estimate|·100 ≥ minSurprisePct.
  //     revenueBeat = revenueActual > revenueEstimate when both present (informational, NOT required — Finnhub
  //     revenue fields are often null; requiring them would starve the detector).
  //  b. reactionIdx: if hour==='bmo' → the report date's own index (anaEngIndexForDate(rec, date), must match date
  //     exactly); if 'amc' or unknown → the NEXT index after the report date. If the needed index doesn't exist → null.
  //  c. day1RetPct = (close[reactionIdx]/close[reactionIdx−1] − 1)·100 ≥ minDay1Pct AND close[reactionIdx] ≥ open[reactionIdx]
  //     (gapped/moved up AND didn't fade below its open — the "held" test).
  //  d. daysSinceReaction = asOf − reactionIdx; trigger only when 1 ≤ daysSinceReaction ≤ maxAgeDays (the drift entry window).
```
2. **Scan** (`_asComputeScan`): fetch the earnings calendar ONCE for the trailing window (`anaFinnhubEarningsCalendar(today−21d, today)`) → for each universe ticker present in that map with a PAST report date, run `anaEngDriftTrigger`. Feasibility base-rate cutoff applies as with other detectors. Candidates get `detector:'driftB'`, fields from the trigger + the standard baseRate. Ranking: `epsSurprisePct` desc. Cap 15. Add `driftB: '🚀 Post-earnings drift'` to `AS_DET_LABELS` (and the dossier/backtest label maps — grep `AS_DET_LABELS`, `AB_DET_LABELS`). Add a `_asCandidateCard` branch: badge `beat +{surprise}% · day1 +{d1}%`, reason sentence ('Beat estimates by X% on {date}; day-one gain of Y% held. Day {n} of the drift window.'), chips: base rate + revenue-beat when true + earnings-catalyst chip comes from 2.4.
3. **Dossier**: `detector==='driftB'` variant — badge as above; chart marks the reaction day (reuse the peak-triangle dataset pattern with the reactionIdx date); NO similar-dips table; add a small "Report" line (period, actual vs estimate, surprise %). The dossier must fetch `anaFinnhubSurprises`+calendar live when the candidate lacks stamped data (deep-link case).
4. **Backtest** (`js/analyzer-backtest.js`): add a `driftB` checkbox (default OFF) with an inline amber note: 'approximate — earnings history on the free tier is shallow; results cover only reports the API returns'. Runner: before the Friday loop, fetch `anaFinnhubSurprises` for each universe ticker ONCE (rate-limited — this is the slow part: ~505 × 1.1s ≈ 9 min; show progress; strongly recommend testing with a small universe). Convert each surprise row to the `earnings` shape (period → approximate report date: VERIFY what `period` contains (e.g. '2026-03-31' = quarter end, NOT report date) — if report dates are not derivable reliably, RESTRICT the driftB backtest to the calendar endpoint's historical range instead (`anaFinnhubEarningsCalendar(startDate, endDate)` — free-tier depth unknown, VERIFY) and record findings in this doc. If neither source yields historical report dates on the free tier, ship the stage WITHOUT backtest support and note it as a Phase 3 unlock.) Per Friday, run the trigger with asOfIndex as-of that Friday. Everything downstream (entry next open, exits, scorecard) already handles any detector id.
Version bumps: engine, scan, backtest JS `?v=+1` each, sw +1.

**Verification:** (a) unit-style: build a synthetic `earnings` object for a ticker whose real post-earnings pop you can see in cached candles; assert trigger fires with correct day1RetPct, and returns null when you set minDay1Pct above the actual move. (b) live scan: with the calendar fetch active, at least confirm no errors and plausible (possibly zero) driftB candidates — zero is valid outside earnings season; then TEMPORARILY widen maxAgeDays to 30 in AS_DEFAULTS-equivalent opts to force a candidate and confirm card+dossier render; restore. (c) backtest: small universe (~10 tickers incl. known reporters), confirm signals appear and one hand-checks against candles. (d) Scoreboard renders driftB rows without changes (it's detector-agnostic — verify, don't assume). (e) standard: old scans render, reload, console, overflow.

**Docs:** spec Part 8f (engine, scan, dossier, backtest subsections + AS_DET_LABELS mention). AppHelp: scan section (third detector explanation, in plain language: "companies that beat earnings and jumped tend to keep drifting for weeks"), dossier + backtest sections. Build Log incl. the free-tier history findings. Commit, notify, push.

---

### Stage 2.4 — Catalyst map (earnings-in-window for every candidate)

**Goal:** Every candidate (all three detectors) shows an accurate ⚠️ Earnings chip when a report falls inside the 60-day window — Finnhub as primary source (all symbols), FMP fallback retained. Binary-event risk quantified from the stock's own history.

**Implementation spec:**
1. `_asComputeScan`: REPLACE the FMP-first enrichment with: `map = await anaFinnhubEarningsCalendar(today, today+windowDays)`; fallback to the existing `_asFetchEarningsMap` (FMP) ONLY if the Finnhub call throws (no key / rate limit). Stamp `c.earningsDate` (earliest upcoming) for every shortlisted candidate. Keep symbol keys dot-canonical (Finnhub already is; the FMP path already converts dashes→dots — leave it).
2. **Binary-event sizing** (price-cache math, no API): for a candidate with an `earningsDate`, compute the stock's historical earnings-day reaction size: reuse `anaFinnhubSurprises` dates when already fetched for driftB, else approximate from candles alone: the mean of the top-5 largest single-day absolute % moves in the cached 5y (a decent proxy for event risk). Show chip: `⚠️ Earnings {date} (±{x}% history)` amber. Put the helper in analyzer-engine.js as a pure function `anaEngTypicalEventMovePct(rec)` (top-5 largest |close/close−1| daily moves, averaged, rounded).
3. Dossier: same chip logic (already renders `earningsDate` when stamped — extend with the ± figure).
Version bumps: engine + scan JS, sw +1.

**Verification:** run a scan; cross-check 2–3 candidates' chip dates against the raw calendar response; confirm a candidate with earnings OUTSIDE the window shows no chip; ± figure sanity (a mega-cap ~3–6%, a high-beta name ~8–15%); FMP fallback path: temporarily blank the Finnhub key in the test account, re-scan, confirm the FMP path takes over silently (sparse coverage expected), restore key. Standard checks.

**Docs:** spec (catalyst map subsection — replaces the "earnings-complete, events-partial" caveat framing for chips), AppHelp scan+dossier (chip now includes typical move; explain it's the user's binary-event call). Build Log. Commit, notify, push.

---

### Stage 2.5 — News + AI read (emotional vs structural)

**Goal:** The dossier shows recent company news, and an optional "🤖 AI read" button drafts an emotional-vs-structural assessment via the app's existing LLM config. The user's own thesis box stays primary; the AI text is clearly a draft aid.

**Implementation spec:**
1. Dossier (`_adRender`): new section `<h3>📰 Recent news</h3>` between the similar-dips table and the thesis. On dossier load fetch `anaFinnhubNews(ticker, today−14d, today)` (try/catch → 'News unavailable'). Render up to 10 rows: date · source · headline as a link (`<a href="{url}" target="_blank" rel="noopener">` — escapeHtml the text, attribute-escape the URL). NO Firestore persistence (news is ephemeral).
2. **AI read button** under the news list (render only if LLM config exists — check the same config doc help.js checks; grep `_helpLlmConfigured` for the pattern). On click: build the prompt below, call `chatCallOpenAICompat` (reuse exactly the pattern from house.js — provider/model/key from the LLM settings doc; REMEMBER: `max_completion_tokens`, never `max_tokens`), render the response in a bordered box with the fixed disclaimer footer: *"AI draft — not financial advice. The tool assembles evidence; the decision is yours."* Show a spinner/disabled state while pending; errors render inline, never alert().
3. **Prompt (use verbatim, filling placeholders):**
   - system: `You are an analyst's assistant inside a personal stock-research tool. You NEVER give buy/sell/hold recommendations or price predictions. Your only job: assess whether a stock's recent decline looks EMOTIONAL (sentiment-driven, fundamentals intact) or STRUCTURAL (fundamentals actually impaired), based strictly on the provided headlines and metrics. Output format: line 1 = 'Read: EMOTIONAL', 'Read: STRUCTURAL', or 'Read: MIXED/UNCLEAR'; then 2–4 short bullets citing specific provided evidence; then one line starting 'Watch for:' with what would change the read. Under 150 words. If the headlines don't explain the move, say so plainly.`
   - user: `{TICKER} ({company name}) — {detector description, e.g. 'down 16.2% in 7 days from its 2026-06-30 peak'}. Key metrics: {netMargin}% net margin, debt/equity {x}, dividend {y}%, RSI {n}. Recent headlines (newest first): {date — source — headline; one per line, max 10}.`
   - Send candidate evidence ONLY from data already on screen — no fabrication, no extra fetches.
4. For `springD`/`driftB` dossiers adjust the one-line description accordingly (near-high compression / post-earnings context) — the emotional-vs-structural frame still applies to dips primarily; for non-dip detectors change the question wording to `assess whether the setup's premise is supported or contradicted by the headlines` (second system-prompt variant — include both verbatim in code as constants).
Version bumps: scan JS, sw +1.

**Verification:** ask the user whether the test account should get an LLM key (per standing key protocol) — if not provided, verify the button correctly HIDES with no config and ship (the code path was still built; note it in the Build Log as user-verifiable on his device). With a key: news renders for FLEX (real headlines, links open), AI read returns within ~10s in the required format, disclaimer visible, non-dip variant renders for a spring candidate. Standard checks.

**Docs:** spec (dossier news+AI subsection incl. the never-buy/sell rule and both prompts summarized), AppHelp dossier section (what the AI read is and is not; emotional-vs-structural explained in the user's own Target-trade terms), AppHelp `## screen:analyzer` build-status bullet → Phase 2 complete. **SecondBrain rule check: this adds NO new SecondBrain LLM action, so `SB_HELP_ACTIONS` is NOT touched — but state that evaluation explicitly to the user** (it's a required checklist item whenever LLM features are added). Build Log: PHASE 2 COMPLETE entry. Commit, notify, push.

---

### Phase 2 exit criteria (all must be true)
1. A fresh Friday scan shows three detector sections; dip candidates carry quality + insider + falling-knife chips; every candidate with a report inside the window shows `⚠️ Earnings {date} (±x% history)`.
2. The dossier shows Quality, Recent news, and (when LLM configured) a working AI read with the disclaimer; driftB dossier variant renders.
3. Backtest Lab offers driftB (or the doc records exactly why the free tier can't support it historically).
4. Scoreboard renders scans containing all three detectors without modification.
5. Every stage committed+pushed with spec/AppHelp/bumps per section G, Build Log current, no console errors, old scan docs still render (backward compatibility).
6. Zero new Firestore collections; zero secrets in the repo; Finnhub calls all flow through the single rate-limited choke-point.

### Remaining plan sections
*(To be written as each component is formally designed: strategy profiles UI (threshold configuration), holdings check (Goal 2), Phase 3 build details beyond the runbook.)*
