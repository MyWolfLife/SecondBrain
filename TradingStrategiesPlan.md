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
| 4 | User removes 2 (any reason — preference counts) | ⏳ AWAITING USER |
| 5 | Deep teaching of the surviving 3 (one section per strategy, built out as we discuss) | Pending |
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

## Phase 4 — User Cut (awaiting)

User removes 2 of the 5 above. Reasons don't need justification — "I just don't want to do that one" is valid. Record what was cut and why here.

- **Cut:** _(pending)_
- **Cut:** _(pending)_
- **Surviving 3:** _(pending)_

---

## Phase 5 — Deep Teaching (pending)

One major section per surviving strategy, built out as we discuss:
- The mechanism: *why* it works and why it hasn't been arbitraged away
- The evidence: key studies, out-of-sample record, live-money track records
- The failure modes: when it loses, how badly, for how long
- Worked examples with real tickers/dates

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
