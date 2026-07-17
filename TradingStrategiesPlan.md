# TradingStrategiesPlan.md — Trading Strategies Investigation & App Features

## Purpose

Investigate trading/investing strategies with **credible statistical evidence of beating the S&P 500 over time**, pick the top candidates, learn them deeply, document exactly how each would be executed, and then design an app feature per strategy (like the Stock Analyzer) to help identify buy/sell signals. **The user always makes the final trade decision — the app only surfaces signals and evidence.**

## Ground Rules & Honest Framing

- **This is education and tooling, not financial advice.** Claude is not a licensed advisor. Everything here is documented academic/practitioner research plus engineering, and the user decides every trade.
- **There is no perfect plan.** If a strategy were both easy and reliably market-beating, it would be arbitraged away. The strategies below survive because each has a *reason it persists* — a behavioral bias that doesn't get corrected, a risk premium that must be earned through pain, or a structural constraint that stops big institutions from harvesting it.
- **The base rate is brutal.** Over 15-year windows, ~90% of professional active funds underperform the S&P 500 after fees. Any strategy we adopt must clear three real-world hurdles the backtests ignore: **trading costs, taxes (in taxable accounts), and behavioral discipline** (abandoning a strategy in a drawdown is the #1 way real people turn a winning strategy into a losing one).
- **The retail advantages we actually have:** no career risk (we can endure years of tracking error vs. the index that would get a fund manager fired), no capacity constraints (we can trade small/mid caps institutions can't), and **LLM-scale reading** (parsing earnings calls, filings, and news at a volume no individual could before — this is genuinely new for retail).

---

## Workflow (the 7 steps)

| Phase | Step | Status |
|-------|------|--------|
| 1 | Survey the strategy landscape — what's out there, what was rejected and why | ✅ COMPLETE (this doc) |
| 2 | Select top 3–5 candidates | ✅ COMPLETE (5 selected) |
| 3 | One-paragraph descriptions, ranked 1–5 | ✅ COMPLETE (below) |
| 4 | User removes 2 (any reason — preference counts) | ✅ DECIDED — user kept all 5 |
| 5 | Deep teaching of all 5 strategies (one section per strategy, built out as we discuss) | 🔄 IN PROGRESS (1 of 5 taught) |
| 6 | Full implementation documentation per strategy (rules, universe, signals, position sizing, exits, costs, failure modes) | Pending |
| 7 | Design an app feature per strategy (Analyzer-style: signal surfacing, evidence, user decides) | Pending |

---

## Phase 1 — The Strategy Landscape

### Families surveyed

**Factor / cross-sectional stock selection** (rank all stocks on a signal, hold the top slice)
- **Momentum (12-1)** — winners over the past 12 months (skipping the most recent month) keep winning for 3–12 months. The strongest and most pervasive anomaly in the academic literature (Jegadeesh & Titman 1993; confirmed across ~200 years of data, nearly every country and asset class). Persists because investors underreact to news and then herd. Weakness: rare violent "momentum crashes" at bear-market turns (2009, 2020).
- **Value** — cheap stocks (low P/E, P/B, EV/EBIT) beat expensive ones long-run (Fama-French). Real but suffered a brutal 2010–2020 drought; works far better *combined with quality* than alone.
- **Quality / Profitability** — highly profitable, stable, low-debt firms outperform (Novy-Marx 2013). Robust, low turnover, tax-friendly.
- **Size** — small beats large. Weak since publication; mostly useful as a *universe choice* (other anomalies are stronger in small/mid caps), not a standalone strategy.
- **Low volatility** — better *risk-adjusted* returns, but usually not higher *raw* returns than the S&P. Fails our "beat the index" goal, so excluded.

**Trend / timing** (when to be in the market, or which market to be in)
- **Time-series momentum / 10-month SMA rule** (Faber 2007) — hold equities when the index is above its 10-month moving average, T-bills/cash when below. Roughly matches buy-and-hold returns with about half the max drawdown.
- **Dual Momentum / GEM** (Antonacci 2014) — combines relative momentum (US vs. international equities, hold the stronger) with absolute momentum (if neither beats T-bills, go to bonds/cash). Backtests several points/yr above the S&P with far smaller drawdowns, ~1 decision per month.

**Event-driven / behavioral** (trade a specific recurring event)
- **Post-Earnings Announcement Drift (PEAD)** — stocks keep drifting in the direction of an earnings surprise for ~60 days after the report (documented since Ball & Brown 1968). Has decayed in large caps but persists in small/mid caps where institutions can't deploy size. The LLM angle: reading the *call transcript and guidance language*, not just the headline EPS beat, is exactly the unstructured-text edge retail never had before.
- **Insider cluster buying** — multiple insiders buying with their own money in the open market predicts outperformance. Real signal, but episodic — better as a *confirming input* than a standalone strategy. (Already partially surfaced in the Stock Analyzer's insider enrichment.)
- **Buybacks, spinoffs, index adds/drops** — documented edges, but too episodic/niche to be a primary strategy.

**LLM-native**
- **News-sentiment event trading** — LLM scores news as good/bad for a stock; recent research (Lopez-Lira & Tang 2023, and follow-ups) shows LLM sentiment predicted short-horizon returns. This is the newest, least-proven, most capacity-constrained family — the edge decays fast and execution speed matters — but it's the purest expression of "use the tools others don't."

### Rejected (and why)

| Strategy | Why rejected |
|----------|-------------|
| Day trading / scalping | Overwhelming evidence retail day traders lose money net of costs (Barber & Odean); competing head-on with HFT |
| Options income (covered calls, CSPs, vol selling) | Transforms return shape, doesn't create alpha; BXM index lags S&P long-run; tail risk ruins years of premium |
| Pairs trading / stat arb | Infrastructure- and capital-intensive; edge fully institutionalized |
| Dividend-growth investing | Mostly a quality/value proxy with tax drag; doesn't beat the index |
| Chart patterns / classical TA | No robust statistical evidence (as distinct from momentum/trend, which *do* have evidence) |
| Global macro / discretionary | No systematic rules to test or build a tool around |
| Crypto momentum | Different asset class, different risk universe — out of scope for this plan |

---

## Phase 2 & 3 — Top 5 Candidates, Ranked

Ranking weighs: strength of statistical evidence, likelihood the edge persists, and realistic implementability for one person with a day job and this app.

### 1. Dual Momentum (index rotation with a trend filter)
Once a month, compare the trailing 12-month return of US equities (e.g., SPY) vs. international equities (e.g., VEU) and hold whichever is stronger — but if neither beats T-bills, move to bonds/cash entirely. That's the whole strategy: one look, one possible trade, per month. It stacks the two most robust findings in finance — relative momentum and trend-following — and its edge over buy-and-hold comes mostly from *sidestepping the catastrophic drawdowns* (2000–02, 2008) while staying invested the rest of the time. Evidence is strong (momentum literature + Antonacci's 70-year backtests), capacity is unlimited, tax/turnover burden is tiny, and the discipline demand is low. The honest caveat: in relentless bull markets it can lag the S&P for stretches (whipsaw years like 2011 or 2015 cost a few points), and the exact backtest numbers are softer than the underlying principle. **Best evidence-to-effort ratio of anything on this list.**

### 2. Cross-Sectional Stock Momentum (12-1 winners portfolio)
Each month, rank a stock universe by their trailing 12-month return excluding the most recent month, buy the top ~20–30 names, and replace any that fall out of the top slice. This is the single most-documented anomaly in finance — a ~3–5%/yr premium that has persisted for two centuries, across every major market, *including the 30+ years since it was published* — because it's driven by human underreaction and herding, which haven't gone away. It demands more than #1: monthly rebalancing of a real portfolio, meaningful turnover (tax drag in a taxable account), and the stomach for momentum's signature failure mode — sharp crashes when a bear market suddenly reverses (2009: momentum portfolios badly lagged the rebound). A trend filter (only run it when the market's above its long-term average) historically blunts the crash risk. **Strongest raw evidence; moderate ongoing effort.**

### 3. Quality-Value Composite (QARP / "Magic Formula" style)
Rank stocks on a *combination* of cheapness (e.g., EV/EBIT earnings yield) and quality (e.g., return on capital, stable margins, low debt), buy the top ~20–30, and hold for a year before re-ranking. This is systematized Buffett: cheap companies that are actually good, removing the value trap problem that plagues pure value. Greenblatt's Magic Formula backtests famously high; the honest academic read is more modest but still index-beating over long horizons, and profitability (Novy-Marx) is one of the most robust factors post-publication. Its persistence mechanism is career risk: the strategy underperforms for *years* at a time (value's 2010s drought), which institutions can't survive but an individual with conviction can. Lowest maintenance on this list — annual-ish turnover, tax-efficient, no fast decisions — but demands the most patience, and 5-year droughts are a feature, not a bug. **Slowest, calmest, most Buffett-shaped.**

### 4. Post-Earnings Announcement Drift + LLM Earnings Analysis
When a company reports earnings that genuinely surprise the market (big EPS/revenue beat, raised guidance, gap-up on volume), the stock tends to keep drifting in that direction for the next 30–60 days — because investors systematically underreact to earnings news. Documented since 1968 and still alive in small/mid caps where institutions can't deploy enough capital to close it. The modern twist is the LLM edge: headline EPS beats are fully priced within minutes, but the *quality* of the beat — guidance language, analyst-call tone, one-time items vs. real acceleration — is buried in transcripts that almost no retail investor reads. An LLM reading every transcript the morning after and scoring "real beat vs. cosmetic beat" is a genuinely new capability. Costs: it's event-driven (trades cluster in earnings season), holding periods of weeks (short-term capital gains), and it needs the app to do real work — surprise screening plus transcript analysis. **The best fit for "use LLMs as the edge"; medium effort, medium evidence post-decay.**

### 5. LLM News-Sentiment Event Trading
An LLM reads the overnight/morning news flow for a stock universe, scores each headline as good/bad/neutral news, and you trade the strongest signals with holding periods of days. Recent research (Lopez-Lira & Tang 2023 and successors) found GPT-scored headlines predicted next-day returns — the purest "the tools exist but aren't widely used" thesis on this list. It's ranked last anyway because the edge is the least proven live, decays fastest (fast-money quant funds are already doing industrial versions), demands the most from execution (speed matters, costs eat thin edges), and generates short-term gains taxed at the highest rate. High ceiling, low floor, most operationally demanding — the most interesting *research project*, the least reliable *strategy*. **Highest novelty, highest uncertainty.**

---

## Phase 4 — User Cut ✅ DECIDED (2026-07-17)

**User kept all 5.** ("For the moment let's keep all 5. I'm intrigued.") The teach/document/build phases below cover all five strategies. A cut can still happen later if any strategy loses its appeal during teaching.

---

## Phase 5 — Deep Teaching (in progress)

One major section per strategy, built out as we discuss. Teaching order = ranking order. Each section covers: the mechanism (why it works and why it isn't arbitraged away), the evidence (key studies + out-of-sample record), the failure modes (when it loses, how badly, for how long), and worked examples with real dates.

| Strategy | Status |
|----------|--------|
| 1. Dual Momentum | ✅ Taught (section below) |
| 2. Cross-Sectional Stock Momentum | Pending |
| 3. Quality-Value Composite | Pending |
| 4. PEAD + LLM Earnings Analysis | Pending |
| 5. LLM News-Sentiment Trading | Pending |

---

### 5.1 Dual Momentum — Deep Dive

#### The mechanism: two findings stacked together

**Finding 1 — Relative momentum:** assets that outperformed their peers over the past ~12 months tend to keep outperforming for the next 3–12 months. This is the same momentum anomaly as Strategy #2, applied to whole markets instead of individual stocks. Cause: investors underreact to new information at first, then herd into what's working — so trends develop slowly and persist.

**Finding 2 — Absolute momentum (trend following):** when an asset's own trailing return is below the T-bill (cash) return, its forward returns are historically poor and its volatility is high. Bear markets are *processes, not events* — 2000–02 took two years to bottom, 2008 took 17 months. A signal you only check monthly is fast enough to step aside from most of the damage, because the damage unfolds over many months.

**Why it isn't arbitraged away:** three reasons. (1) The edge is behavioral (underreaction + herding), and human behavior at market scale doesn't change because a paper got published. (2) Capacity is effectively unlimited — the trades are in the most liquid ETFs on earth — so nothing about others doing it degrades the signal the way a small-cap anomaly degrades. (3) The real price of admission is **tracking error**: the strategy can trail the S&P for years in a strong bull market. A fund manager gets fired for that; an individual just has to tolerate it. Career risk is the moat.

#### The rules (GEM — "Global Equities Momentum", Antonacci's canonical version)

Once a month, on the same day each month (e.g., the last trading day):

1. Compute **trailing 12-month total return** (price change + dividends) for three things:
   - US equities — SPY (or VOO/IVV)
   - International equities ex-US — VEU (or ACWX)
   - T-bills / cash — BIL (or the 12-month T-bill yield)
2. **Absolute momentum gate:** Is the SPY 12-month return greater than the T-bill return?
   - **No → risk-off.** Hold aggregate bonds (BND/AGG). Done.
   - **Yes → risk-on.** Continue to step 3.
3. **Relative momentum pick:** Hold whichever of SPY / VEU has the higher 12-month return.
4. Hold that single position until next month's check. Trade **only when the answer changes** — historically ~1–3 switches per year, with multi-year stretches of no trades at all.

That is the entire strategy. No intraday decisions, no stock picking, no discretion.

#### The evidence

- **Backtest (Antonacci, 1974–2013):** GEM ~17.4% CAGR vs. ~12.3% for the S&P 500, with max drawdown ~-23% vs. -51%. Treat these exact numbers as optimistic (backtests always are) — the *shape* is the durable claim: similar-or-better returns with roughly half the worst-case loss.
- **The underlying components have deeper evidence than the packaged product:** momentum across asset classes is documented in ~200 years of data (Geczy & Samonov), across nearly every country and asset class (Asness, Moskowitz & Pedersen, "Value and Momentum Everywhere," 2013); time-series momentum in Moskowitz, Ooi & Pedersen (2012); the simple 10-month moving-average version in Faber (2007), one of the most-downloaded finance papers ever.
- **Out-of-sample (2014–now), honestly:** GEM *lagged* the S&P during the relentless US-only bull market — the absolute-momentum gate cost money in the 2015–16 and 2018 whipsaws and badly in the 2020 COVID V-recovery, while it *helped* substantially in 2022 (stepped into bonds early in the year, avoided most of a -25% peak-to-trough year). This is exactly the pattern the mechanism predicts: it gives up ground in whipsaws and V-recoveries, and earns its keep in long grinding bears. Whether it beats buy-and-hold over the *next* 30 years depends mostly on whether that period contains extended bear markets (like 1973–74, 2000–02, 2008) or only fast crashes (like 2020).

#### Failure modes — know these before starting, not during

1. **Whipsaw:** market drops fast → monthly signal goes risk-off → market V-recovers → signal re-enters higher than it exited. Each whipsaw costs a few percent. 2020 was the worst case: exited after March, re-entered months later, missed a big chunk of the rebound. A fast crash + fast recovery is this strategy's kryptonite.
2. **Bull-market lag:** in a year like 2013 or 2021 the strategy is ~fully invested and roughly matches the index minus small frictions — fine. But a whipsaw year in a bull run (2015, 2018) means finishing several points behind. Expect "the market made 20% and I made 13%" years and decide *now* that this won't shake you out.
3. **Tax drag (taxable accounts):** switches realize gains, often short/medium-term. **This strategy strongly prefers a retirement account (IRA)** where switches are tax-free events.
4. **Signal-date luck:** results vary a little depending on which day of the month you check. Don't optimize this; pick a day and never change it. (Optimizing it is curve-fitting.)
5. **The real killer — abandonment:** every quantitative strategy's worst enemy. The most likely way this loses money is running it for 3 years, trailing the index, quitting in frustration, and missing the bear market it was built for.

#### Worked history (what it actually did, month by month where it matters)

- **2008 crisis:** SPY's 12-month return dropped below T-bills around **Jan 2008** (S&P ~-8% off its Oct 2007 peak). Signal: bonds. The S&P then fell another ~45% through March 2009. GEM sat in AGG (up slightly) the whole way down. Re-entered equities **mid-2009** after the 12-month return recovered — missed the first ~30% of the rebound (that's the toll), but avoided a -50% drawdown to capture it. Net effect: enormous.
- **2020 COVID (the bad case):** Feb–Mar crash was so fast the end-of-Feb check was still risk-on. End-of-March check: risk-off → bonds, near the bottom. Market V-recovered; signal re-entered months later, well above its exit. Cost: roughly 10+ points vs. buy-and-hold that year. This is the honest worst case and it will happen again.
- **2022 (the good case):** signal went risk-off in **early 2022** after January's decline tipped the 12-month return negative vs. T-bills. Sat out most of a grinding -25% year, re-entered in early 2023. Bonds also fell in 2022 (unusual), muting the win — a cash/BIL fallback did better than AGG that year, which is why the fallback asset choice is a Phase 6 decision.

#### Discussion Q&A (from teaching sessions)

**Q: Why not just stay in the S&P and ride out crashes? Or hold 60/40 forever?** (asked 2026-07-17)

**A — the loss-asymmetry arithmetic:** -50% needs +100% to recover; -20% only needs +25%. Worked example, $100k at the Oct 2007 peak: buy-and-hold fell to ~$43k and the subsequent market *double* only got it back to ~$100k by early 2013. GEM exited Jan 2008 at ~$88k, sat in bonds (~$92k by mid-2009), re-entered ~30% above the bottom, and rode the same rally to ~$152k by the day buy-and-hold broke even. It never beat the market in any single year — the entire win was the higher base it compounded from after the crash. The strategy's value only shows across a full cycle containing a real bear.

**Where buy-and-hold genuinely wins:** long horizon + ongoing contributions (crashes become discounted buying), and iron discipline (if you'd truly hold through -50%). Two honest counters: (a) the behavior gap — most people don't actually hold through -50%, and dual momentum doubles as a pre-commitment device that takes panic out of the loop; (b) sequence-of-returns risk — the 2000 peak took ~13 years to durably recover; tolerable at age 30, dangerous within 10–15 years of spending the money.

**vs. 60/40:** same goal, opposite payment plan. 60/40 pays for crash protection *every year* (~1.5%/yr return drag — the difference between ~$2.0M and ~$1.3M on $100k over 30 years) and its protection assumes bonds rise when stocks fall — an assumption that failed in 2022 (-17%, one of 60/40's worst years, while trend-following sidestepped it). Dual momentum holds ~100% equities in trending markets and pays for protection only in whipsaw years. Bottom line: in a future of only V-shaped crashes, buy-and-hold wins; in a future containing even one grinding 2000/2008-style bear (historically ~one per decade), dual momentum likely comes out ahead; 60/40 lands in between in both worlds.

#### Variations (for Phase 6 discussion — pick one and freeze it)

- **Lookback:** 12-month is canonical; blends (e.g., average of 3/6/12-month) reduce signal-date luck and whipsaw slightly.
- **Trend measure:** 12-month return vs. T-bills (GEM) or price vs. 10-month moving average (Faber) — near-identical results; the 10-month SMA version is easier to eyeball on any chart site.
- **Risk-off asset:** aggregate bonds (better most years) vs. T-bills/cash (better in rising-rate years like 2022) vs. splitting the difference with short-term Treasuries (BSV/VGSH).
- **Skip international:** some drop the SPY/VEU comparison and just run absolute momentum on SPY (in-or-out). Simpler, and international relative momentum has been the weaker leg out-of-sample.

## Phase 6 — Implementation Documentation (pending)

Per strategy, the full playbook:
- Universe (which stocks/ETFs), signal definition (exact formula), schedule (when to check)
- Entry rules, position sizing, exit rules
- Costs, tax treatment, account type recommendation (taxable vs. retirement)
- What "the strategy is broken" would look like vs. a normal drawdown

## Phase 7 — App Feature Design (pending)

One Analyzer-style feature per strategy. Shared principles:
- The app **surfaces signals and evidence**; the user decides every trade
- Reuse existing infrastructure where possible (Finnhub/FMP data, LLM analysis pipeline, Scoreboard-style tracking)
- Each feature should track its own signal history so we can later verify the signals actually worked (the Scoreboard pattern)

Early feature sketches (to be designed properly in Phase 7):
- **Dual Momentum** → monthly "rotation check" card: current rankings of SPY/VEU/T-bills, what the strategy says to hold, alert when the answer changes
- **Stock Momentum** → monthly ranked momentum list over a chosen universe with entry/exit diffs ("these 3 fell out, these 3 entered")
- **Quality-Value** → annual screen with LLM-written one-page theses on the top-ranked names
- **PEAD** → earnings-surprise scanner + LLM transcript read: "real beat or cosmetic beat" scoring the morning after reports
- **News Sentiment** → morning news sweep over a watchlist with LLM good/bad scoring and signal-decay tracking
