# Stock Analyzer — Plan

**Status: Discussion / planning phase — no code yet.**

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
Emerging from all the above, the tool looks like six pieces:
1. **Universe manager** — curated ticker list (~100–200 to start; S&P 500 subset + watchlist + current holdings), user add/remove.
2. **Strategy profiles** — per-setup filter thresholds + scorecard weights (Mean Reversion, Momentum, Earnings Drift), all user-editable, tweakable over time.
3. **Scanner** — user-triggered staged scan of the universe (price screen → fundamentals → news), producing a ranked shortlist per profile; results snapshotted to Firestore.
4. **Candidate workspace** — per-candidate evidence page: dip/setup data, base rate (+10%/60d historical frequency), catalyst calendar, quality/survivability checks, market regime, manual enrichment fields, optional LLM read, thesis prompt ("what has to happen for this to rise 10%?").
5. **Trade ticket** — entry + thesis + three exits (target / stop / time stop) + optional probability estimate; live tracking against exits.
6. **Scoreboard / learning loop** — auto-checks past scan snapshots at 30/60 days vs. benchmark; scores closed trades vs. thesis; evidence for manual weight adjustments.

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

### Existing infrastructure that may be relevant
- **Price fetching pipeline** already exists in Investments: Finnhub (primary) + Yahoo v8/chart via CORS proxies (allorigins → corsproxy → codetabs), 800ms per-ticker delay, retry logic. See `MyLife-Functional-Spec.md` (Investments section) for the full decision log of what failed (CORS, v7 batch endpoint, LLM price lookups — stale, removed).
- **Stock Rollup** (`#investments/stocks`) already aggregates holdings by ticker across all accounts/persons — shares, weighted avg cost, gain, % of net worth, concentration badges.
- **Ask-LLM investments** pattern exists (`AskLLMInvestmentsPlan.md`) — assembles a financial snapshot and sends it to an LLM for analysis.
- Constraint: **zero cost** — free API tiers only, no paid data services.

## Open Questions
*(To resolve during discussion.)*

- Which stocks are in scope — current holdings, a separate watchlist, or both?
- What metrics does the user want to track, and where does each come from (API vs. manual entry)?
- What does the tool output — a dashboard, computed buy/sell signals, alerts?
- How do "metrics I determine" get defined — fixed fields, or user-configurable metric definitions?

## Plan
*(To be written once discussion settles.)*
