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
| 5 | Deep teaching of all 5 strategies (one section per strategy, built out as we discuss) | ✅ COMPLETE (all 5 taught) |
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
| 2. Cross-Sectional Stock Momentum | ✅ Taught (section below) |
| 3. Quality-Value Composite | ✅ Taught (section below) |
| 4. PEAD + LLM Earnings Analysis | ✅ Taught (section below) |
| 5. LLM News-Sentiment Trading | ✅ Taught (section below) |

**Next up: Phase 6 (full implementation documentation) and Phase 7 (one app feature per strategy).** Before Phase 6, an open cross-cutting decision worth making: these five aren't mutually exclusive. Strategies 1–3 (dual momentum, stock momentum, quality-value) are slow "core" strategies that combine well — momentum and value are historically complementary (each tends to win when the other struggles). Strategies 4–5 (PEAD, news) are fast "satellite" strategies that share earnings/news infrastructure. A realistic end-state is a small core allocation across 1–3 plus opportunistic satellite trades from 4–5 — but that's a Phase 6+ portfolio decision, flagged here so we design the app features to coexist rather than compete.

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

---

### 5.2 Cross-Sectional Stock Momentum — Deep Dive

#### The mechanism: the same anomaly as 5.1, but *between* stocks

Dual momentum asks "is the market trending, and which market?" Cross-sectional momentum asks "**which stocks** have been winning?" — and buys them. The core finding (Jegadeesh & Titman 1993): rank all stocks by their return over the past 12 months *excluding the most recent month*, and the top slice outperforms the bottom slice by roughly 1%/month over the following 3–12 months. The skip-month matters: the most recent month has a *reversal* effect (last month's hottest stocks snap back short-term), so the convention "12-1" — months 12 through 2 ago — cleanly captures the trend without the noise.

**Why prices trend in the first place — three behavioral engines:**
1. **Underreaction / slow information diffusion.** Good news doesn't get fully priced instantly; it seeps through analysts, media, and investors over months. The stock drifts toward its new fair value rather than jumping there.
2. **The disposition effect.** Investors sell winners too early (to lock in gains) and cling to losers (to avoid admitting the loss). Selling into a rise slows the rise; refusing to sell a falling stock slows the fall. Both *extend trends*.
3. **Anchoring.** "It already went up 80%, I missed it" — people anchor on the old price and refuse to buy, delaying the adjustment. This is also why the strategy is psychologically hard: **it requires buying stocks that feel expensive and already-missed.** The discomfort is the edge.

**Why it isn't arbitraged away:** Fama himself (father of efficient markets) called momentum "the premier anomaly" — it's the one his framework can't explain away, and it has survived 30+ years of everyone knowing about it. It persists because harvesting it is genuinely unpleasant: high turnover (costs + taxes), brutal occasional crashes (below), and long stretches of tracking error. Institutions that try to run it at scale in large caps compress it; in mid/small caps their size locks them out — which is where the retail advantage lives.

#### The rules (retail long-only implementation)

1. **Universe:** a liquid list — S&P 500 for simplicity, or S&P 400 mid-caps for a stronger version of the effect. Freeze the choice.
2. **Signal:** total return from 12 months ago to 1 month ago (the 12-1 return). One number per stock.
3. **Monthly, same day each month:** rank the universe by the signal. Buy the top ~20–30 names, equal-weighted.
4. **Rank buffer to control turnover:** don't sell a holding just because it slipped from #18 to #25. Sell only when it falls out of a wider band (e.g., out of the top 20% of the universe), replacing it with the current top-ranked non-holding. This roughly halves turnover with negligible performance cost.
5. **Crash guard (recommended):** only run fully invested when the S&P is above its 200-day / 10-month moving average. When below, either stand aside in cash or halve exposure. This directly targets the momentum-crash failure mode.

Expected activity: replacing ~2–5 names per month. More decisions than dual momentum, but each is mechanical — the rank makes the call, not judgment.

#### The evidence

- **Origin:** Jegadeesh & Titman (1993) — ~12%/yr spread between past winners and past losers, US stocks 1965–1989.
- **Depth:** Geczy & Samonov extended it back to **1801** — two centuries of US data. Asness, Moskowitz & Pedersen ("Value and Momentum Everywhere," 2013) found it in every major equity market (Japan is the famous weak spot), plus bonds, currencies, and commodities.
- **Survival post-publication:** unlike most anomalies (which shrink ~half or die after publication), momentum has remained significant in the 30+ years since 1993 — the strongest post-publication record of any factor.
- **Live long-only proof:** MTUM (iShares momentum ETF, launched 2013) is a real-money, fee-charging, long-only large-cap implementation — it has roughly tracked-to-modestly-beaten the S&P since inception, with clear lag in reversal years (2016, 2023) and strong runs when trends persist (2017, 2020, 2024). Long-only large-cap is the *weakest* form of the strategy; academic top-slice results in mid-caps are stronger.
- **Honest expectation:** net of costs, a disciplined long-only top-slice with a trend filter has historically delivered roughly **+2–4%/yr over the index** across full cycles — not the headline 12% spread, which requires shorting the losers.

#### The signature failure mode: momentum crashes

Momentum's worst moments are **sharp reversals at bear-market bottoms**. In March–May 2009, the academic winners-minus-losers portfolio lost ~70% in three months — the "losers" (banks and cyclicals priced for death) tripled off the bottom while the defensive "winners" sat still. Daniel & Moskowitz ("Momentum Crashes," 2016) documented this pattern across a century: crashes cluster *after* big market declines, *during* the rebound.

Critical nuance for us: **the crash lives mostly on the short side** (the exploding losers), and a long-only implementation doesn't short anything. Long-only momentum in 2009 merely *lagged* the rebound — painful, not catastrophic. The 200-day-MA crash guard exists precisely for this window: after a deep bear, the guard keeps exposure reduced until the trend re-establishes, sidestepping the most dangerous months.

A second, smaller version: **rotation days**. On Nov 9, 2020 (Pfizer vaccine announcement), stay-at-home winners (Zoom, Peloton) fell 15–20% in a day while beaten-down airlines/cruises exploded — the largest one-day momentum reversal ever recorded. Long-only holders of the winners took a real hit. These events are unhedgeable and simply part of the strategy's cost of doing business.

#### What it actually holds (intuition check)

The screen has no opinion, no story, and no taste — it holds whatever has been working: NVDA through most of the 2023–24 AI run (a stock that always "felt expensive and already-missed" — see behavioral engine #3), Super Micro up 10x (and it would have ridden the later collapse partway down until the rank ejected it — momentum always gives back a chunk at trend end; the system exits *after* the turn, never at the top), plus at any given time a mix of unglamorous names — insurers, industrials, utilities in defensive years — that nobody talks about but that keep grinding up. Holding the portfolio means owning things you'd never pick by story, and *not* owning famous names that are down 40% and "due for a comeback" (the screen calls those losers, and the disposition effect says everyone else is still holding them all the way down).

#### Failure modes summary

1. **Reversal lag:** badly trails the index in V-rebounds off bear bottoms (2009-style) and on rotation days. The trend filter blunts the first; nothing fixes the second.
2. **Turnover → taxes and costs:** ~50–100%+ annual turnover, mostly short-term gains. **Strongly prefers an IRA.** Commissions are ~$0 now, but bid-ask spread argues for liquid names and limit orders.
3. **Tracking error + boredom:** months of mechanical rebalancing into stocks with no story, sometimes trailing the index — the abandonment risk from 5.1 applies double here because it's more work.
4. **Tinkering temptation:** overriding the rank ("I don't like this one") reintroduces the exact behavioral biases the system exists to remove. The rank makes the call, or the strategy isn't being run at all.

#### Variations (for Phase 6 — pick and freeze)

- **Lookback:** 12-1 canonical; 6-1 faster/turnovers-more; blends smooth luck.
- **Universe:** S&P 500 (simplest data, weakest effect) vs. S&P 400 mid-caps (stronger effect, still liquid) vs. broader.
- **Quality overlay:** "frog-in-the-pan" research (Da, Gurun & Warachka 2014): *gradual* steady climbs outperform jumpy, news-spike momentum — a filter favoring smooth gainers over one-gap wonders improves results. Also a natural LLM/Analyzer angle: distinguish "up 60% on steady execution" from "up 60% on one meme spike."
- **Weighting:** equal-weight (canonical) vs. signal-weighted.
- **Crash guard:** market 200-day MA gate vs. volatility scaling vs. none.

---

### 5.3 Quality-Value Composite — Deep Dive

#### The mechanism: two half-broken factors that fix each other

**Value alone:** cheap stocks (low price relative to earnings/assets) beat expensive ones long-run — because markets *overextrapolate*. Glamour stocks get priced as if great growth lasts forever; struggling ones get priced as if the trouble is permanent. Reality mean-reverts toward the middle, and the cheap side of the book collects that correction. The flaw: the cheap list is salted with **value traps** — companies that are cheap because they're actually dying (the Blockbusters), whose earnings vanish before the mean-reversion arrives.

**Quality alone:** highly profitable firms with stable margins and modest debt outperform (Novy-Marx 2013 — one of the most robust post-publication factors, strong enough that Fama & French added profitability to their canonical model). The flaw: everyone can see quality, so the best businesses are usually expensive, and overpaying eats the edge.

**Together they patch each other's hole:** quality removes the dying companies from the cheap list; cheapness removes the overpriced ones from the quality list. What remains is *good businesses having a bad year* — hated, boring, or temporarily troubled, but demonstrably profitable. This is systematized Buffett ("wonderful companies at fair prices"), and Buffett's 60-year record is the existence proof that quality-value compounding works at the highest level.

**Canonical implementation — Greenblatt's Magic Formula (2005):** rank all stocks on two numbers, add the ranks, buy the best combined scores:
- **Earnings yield** = EBIT / Enterprise Value (like a P/E ratio, but capital-structure-neutral — debt can't hide in it)
- **Return on capital** = EBIT / (net working capital + net fixed assets) — how much profit the business squeezes from the assets it employs

**Why it persists — time arbitrage:** the payoff horizon is *years*, and almost no professional can wait that long. Value's 2010s drought lasted nearly a decade; any fund manager who held on was fired long before the 2021–22 payback. Greenblatt's own summary: *"it still works because it doesn't always work."* The strategy's droughts are the moat — and an individual with genuine conviction is one of the few market participants structurally able to cross them. The second persistence engine is boredom: the screen's picks are unloved by construction; story stocks are fun to own and these aren't.

#### The rules (retail long-only implementation)

1. **Universe:** US stocks above ~$100M–$1B market cap (choose and freeze). **Exclude financials and utilities** — EV/EBIT and return-on-capital are not meaningful for banks/insurers/regulated utilities; the formula's numbers lie there.
2. **Rank twice:** every stock by earnings yield (1 = cheapest), every stock by return on capital (1 = most profitable). **Combined score = sum of ranks.** Buy the ~20–30 lowest combined scores, equal-weighted.
3. **Hold ~1 year, then re-screen** and rotate out anything no longer ranked. Greenblatt suggests staggering entries (e.g., add ~5–7 positions per quarter) so the whole portfolio never rebalances on one arbitrary day.
4. **Taxable-account tax trick (from Greenblatt directly):** sell losers just *before* the 1-year mark (short-term loss, more valuable against taxes) and winners just *after* it (long-term gains rate). This is the only strategy of our five where taxable implementation is genuinely reasonable — turnover is low and mostly long-term.
5. **No overrides.** The screen will hand you a list where several names feel disgusting to buy. That feeling is the strategy working (same lesson as 5.2, opposite direction: momentum buys what feels already-missed; this buys what feels broken).

#### The evidence

- **Greenblatt's book claim:** ~30%/yr 1988–2004. Treat as marketing-grade; independent replications with realistic assumptions land at **mid-teens vs. ~11% for the market** over that span — still clearly index-beating.
- **The components:** profitability/quality (Novy-Marx 2013; Asness "Quality Minus Junk" 2019) is among the most robust factors out-of-sample. Value has ~100 years of evidence (Graham & Dodd 1934 onward; Fama-French 1992) *including* a near-decade drought in the 2010s, followed by a strong 2021–22 recovery. Piotroski's F-score (2000) — quality screening *within* cheap stocks — is the same marriage from the other direction and also held up.
- **Post-publication honesty:** Magic Formula replications post-2007 show weaker and streakier results than the book era — roughly market-matching through the growth-dominated 2010s, strong in value years. The combination is more robust than either factor alone, but this is the streakiest strategy of our five: it wins across decades, not quarters.
- **The behavioral kicker (worth internalizing):** the best US mutual fund of 2000–2010 returned ~18%/yr while its *average investor lost money* — buying after hot streaks, selling after droughts. Dollar-weighted returns vs. strategy returns is THE risk here, more than anything in the screen.

#### What the portfolio feels like

Unloved-but-profitable, always. In 2022's rate panic the screen loaded up on homebuilders at ~5–6x earnings (priced for housing collapse; then up huge in 2023–24), plus perennial residents like tobacco, defense contractors, used-car retailers, HP-style mature tech. It will essentially never hold an NVDA-type glamour name — by the time a stock is exciting, its earnings yield rank is terrible. Owning this portfolio means being permanently out of step with whatever CNBC is excited about, for years at a time, while the businesses quietly earn their way out of their bad narratives.

#### Failure modes

1. **Multi-year droughts — the defining risk.** Value trailed growth for most of 2010–2020. Committing to this strategy means committing *through* a stretch like that. It cannot be judged on 1–3 year results; that's not patience-as-virtue, it's the actual mechanism.
2. **Value traps that slip through.** Trailing EBIT can't see the future: retailers screened cheap-and-profitable right up until e-commerce ate them. Quality reduces but doesn't eliminate this. (See LLM angle below — this is the strategy's biggest upgrade opportunity.)
3. **Sector concentration.** The screen loves whole hated sectors at once (all homebuilders, all energy). A cap of ~3–4 names per sector is a standard patch — decide in Phase 6.
4. **Data quality.** EV/EBIT and return-on-capital require clean fundamental data (FMP provides this); garbage inputs silently corrupt ranks.

#### The LLM angle — the value-trap filter

The screen's one blind spot is that it can't distinguish "cheap because hated" (homebuilders 2022) from "cheap because dying" (Blockbuster 2008) — both look identical on trailing numbers. That distinction lives in *text*: filings, earnings calls, industry news. An LLM reading the last two calls + recent news for each screened name and writing a one-page thesis — *is this a melting ice cube or a fine business having a bad year?* — is exactly the analyst step Greenblatt says individual investors skip, automated. This is the natural app feature (Phase 7): annual screen + LLM dossier per name, user reads and decides.

#### Variations (for Phase 6 — pick and freeze)

- **Value metric:** EV/EBIT (canonical) vs. FCF yield (harder to fake, cash-based) vs. composite of several.
- **Quality metric:** return on capital (canonical) vs. gross profitability (Novy-Marx, more robust academically) vs. Piotroski F-score (9-point checklist, catches deteriorating fundamentals).
- **Universe floor:** larger caps = weaker effect, easier trading; smaller = stronger effect, needs limit orders.
- **Sector cap:** yes/no and how tight.
- **Rebalance cadence:** annual (canonical, tax-friendly) vs. semi-annual.

---

### 5.4 Post-Earnings Announcement Drift (PEAD) + LLM Earnings Analysis — Deep Dive

#### The mechanism: the market underreacts to earnings news — slowly, predictably

When a company reports earnings that genuinely surprise, the stock jumps — and then **keeps moving in the same direction for the next 30–60 days**. That continuation is PEAD, the *oldest* documented anomaly in finance (Ball & Brown 1968 — it predates the efficient-market hypothesis it embarrasses). The definitive study (Bernard & Thomas 1989) showed the top-surprise decile keeps earning abnormal returns for weeks, with a final kick around the *next* quarter's report.

**Why the drift exists:**
1. **Limited attention.** In peak earnings season, hundreds of companies report per day. Nobody processes them all; smaller names get processed slowly or not at all. (Measurably: surprises announced on Fridays or on crowded days drift *more* — DellaVigna & Pollet. Inattention is literally visible in the data.)
2. **Anchoring.** Investors anchor on their prior view of the company and update in steps rather than all at once.
3. **The analyst-revision conveyor belt — the mechanical heart of the drift.** After a big beat, analysts don't re-rate the stock overnight; they raise estimates and targets *sequentially* over days and weeks. Each upgrade triggers another wave of buying from funds that key off estimates. (This is the same force the Analyzer's Detector C — revision momentum — already tracks. PEAD is catching that conveyor belt at its starting point.)
4. **Earnings surprises autocorrelate.** A company that beats big this quarter is more likely than average to beat next quarter — one surprise is usually the first chapter of a multi-quarter story, and the market prices it as a one-off.

**Where it still lives:** the headline-number version is fully arbitraged in large caps — algorithms trade the EPS beat within seconds. The surviving edge is in (a) **small/mid caps**, where institutions can't deploy meaningful size and attention is thinnest, and (b) **the nuance the headline misses** — which is the LLM's job (below).

#### The rules (retail implementation)

1. **Universe:** small/mid caps (~$300M–$10B), liquid enough to trade with tight spreads.
2. **Screen during earnings season** (daily, morning after reports) for the trifecta:
   - **Real surprise:** EPS beat >10–15% *and* revenue beat (revenue is much harder to massage than EPS) — ideally with **raised guidance**, which research says matters more than the beat itself.
   - **The market's first vote:** stock gaps up meaningfully (e.g., >5%) on heavy volume (e.g., >2× average) **and holds the gap into the close**. The announcement-day reaction predicts drift *better than the raw surprise number* — a big beat the market shrugs at is a no; a gap that fades by the close is a no.
3. **LLM transcript read — the modern edge:** before entering, the LLM reads the earnings call and scores **"organic beat vs. cosmetic beat"**: Was the EPS beat from real operating strength, or from one-time items, tax benefits, or buybacks shrinking the share count? Is guidance language strengthening vs. last quarter's call, or hedged? Did management answer analyst questions directly or evade? Headline numbers are priced in minutes; *this* layer mostly is not.
4. **Entry:** within 1–3 days after the announcement. No need to chase the opening print — the drift is measured in weeks, which is exactly what makes it retail-friendly.
5. **Exit:** time-based at 40–60 days, **before the next earnings report** (holding through the next report captures the biggest drift kick per Bernard & Thomas, but converts a drift trade into a fresh earnings gamble — Phase 6 decision). Thesis-invalidation stop: exit early if price closes below the announcement-day low (the gap failed; the drift premise is dead).
6. **Sizing:** many small positions rather than few large ones — per-event drift is modest (~+3–6% over the window), so this is a batting-average strategy that needs volume of events and cost discipline.

#### The evidence

- **Pedigree:** Ball & Brown (1968); Bernard & Thomas (1989, 1990) — top-vs-bottom surprise decile spread ~4–5% per quarter in the classic era; Fama (1998) conceded PEAD as one of the robust anomalies ("above suspicion").
- **Decay, honestly:** Chordia et al. and successors show the classic headline-SUE effect is heavily attenuated in large, liquid stocks post-2000s — the easy version is gone. It persists where arbitrage is costly (small/mid caps, high-limits-to-arbitrage names) and in richer signal definitions (announcement-day reaction, guidance revisions, call language) that the simple quant screens of the 1990s didn't use.
- **The LLM layer's evidence:** a growing 2023+ literature shows LLM readings of earnings-call language (tone, evasiveness, guidance framing) predict post-call returns beyond the numbers. This part is young — promising, not proven at the 30-year standard of strategies 1–3. Fair characterization: PEAD is an old, decayed-but-real anomaly, and the LLM is a plausible sharpening of it, not a guarantee.

#### What a trade looks like (worked feel)

A $2B industrial reports Q2: EPS +22% vs. estimates, revenue +6% vs. estimates, full-year guidance raised. Stock gaps +11% on 3× volume and closes near the high. The LLM reads the call: beat driven by volume growth and margin expansion (organic), guidance language upgraded from "cautiously optimistic" to specific numbers, management answered gross-margin questions with detail (no evasion). Verdict: organic. Enter day 2 at +12% from pre-announcement. Over the next 6 weeks, five analysts raise targets stepwise; the stock drifts another +7%. Exit at day 45, before the next report. — The failure version of the same trade: EPS beat but revenue *miss*, beat driven by a tax item, gap fades from +8% to +2% by the close. The screen's filters (revenue confirm + gap-hold + LLM read) exist to leave that one alone.

#### Failure modes

1. **Gap-and-fade / false positives:** the initial pop reverses instead of drifting. The gap-hold filter and announcement-low stop cap the damage, but losers are routine — this strategy wins on batting average and asymmetry, not on being right every time.
2. **Lumpy opportunity flow:** trades cluster in the four earnings seasons; capital sits idle between them (arguably a feature — it can coexist with slower strategies).
3. **Regime dependence:** in a bear market even great earnings fade — drift is weaker and stops trigger more. The 200-day-MA regime check from 5.2 applies here too.
4. **Taxes and costs:** all short-term gains (**IRA strongly preferred**), and per-event edges of a few percent mean slippage discipline (limit orders, liquid names) is load-bearing, not optional.
5. **Decay risk:** of our five, this edge is the most actively hunted by quant funds. The bet is specifically that small/mid-cap inattention + transcript nuance stays under institutional capacity limits — plausible, not permanent.

#### App fit (Phase 7 preview)

The closest to already-built of the five: the Stock Analyzer already does drift/news/insider enrichment and Detector C revision momentum. The PEAD feature is essentially a new detector: earnings-calendar-driven scan the morning after reports → surprise + gap-hold filters → LLM transcript scoring (organic vs. cosmetic) → candidate card with entry/exit window and the announcement-day-low invalidation level → Scoreboard tracking of how the signals actually performed.

#### Variations (for Phase 6 — pick and freeze)

- **Surprise definition:** EPS+revenue+guidance trifecta (strict, few signals) vs. any-two (looser, more signals).
- **Universe floor/ceiling:** tighter small/mid band = stronger anomaly, worse spreads.
- **Hold-through-next-earnings:** yes (bigger drift capture, event risk) vs. exit-before (cleaner, canonical for us).
- **Short side:** negative surprises drift down too — shorting is out of scope, but a *negative* PEAD signal is useful as a "don't buy this dip" warning on holdings.
- **LLM scoring rubric:** binary organic/cosmetic vs. graded score feeding position size.

---

### 5.5 LLM News-Sentiment Event Trading — Deep Dive

#### The mechanism: read the news faster/deeper than the crowd, trade the gap before it closes

Prices move on news. Between the moment news breaks and the moment it's fully priced, there's a window — and the bet is that an LLM reading and *interpreting* a story (not just matching keywords) can judge "how good/bad is this, really, for this specific stock" fast enough and well enough to trade the remaining move. Unlike PEAD (one scheduled event type — earnings), this is *any* market-moving news: FDA decisions, contract wins, guidance pre-announcements, management changes, legal outcomes, analyst-day surprises, sector shocks.

**Why an edge could exist at all:**
1. **Interpretation beats keywords.** Old-school sentiment models counted positive/negative words and get fooled by nuance ("beat lowered expectations," "in-line but guided down," "wins contract but dilutive"). An LLM reads context — the same thing a sharp analyst does, but in seconds across a whole watchlist. The measurable claim (Lopez-Lira & Tang 2023): GPT scoring of *headlines* predicted next-day returns, and the effect concentrated in small caps and after-hours news where human attention is thin.
2. **Nuance and second-order reasoning.** "Company loses lawsuit but the penalty is far below the feared amount" reads as bad-news-good-outcome. Keyword models miss this entirely; LLMs handle it — this is the genuine, novel capability.
3. **Breadth.** No human watches 200 tickers' news flow overnight. An LLM can sweep the whole list every morning, which is where the retail-scale advantage is real.

**Why this is ranked LAST — three honest problems:**
1. **The edge decays fastest.** The gap between news and price is closing every year as more machines read news. What was tradeable over a day in 2015 may be priced in minutes now. This is a footrace against professional quants with faster data feeds and colocated servers — the one game on our list where *speed* is a primary axis, and retail loses speed races.
2. **Least proven live.** Strategies 1–3 have decades of out-of-sample evidence; even PEAD has 55 years. This has ~2–3 years of academic results and heavy publication risk (the moment a profitable signal is published, it gets competed away). Backtests here are especially treacherous because of **look-ahead/point-in-time bias** — an LLM trained on data through 2024 "knows" how stories resolved; testing it on 2022 news is contaminated unless the model is strictly walled off from the future. This bias makes news-sentiment backtests look far better than live results.
3. **Costs eat thin, fast edges.** Short holding periods (days) → all short-term gains → high turnover → spread and slippage on every trade. A 1–2% expected move per event is easily half-eaten by frictions if you're not disciplined about liquidity and limit orders.

#### The rules (retail implementation — deliberately conservative)

1. **Universe:** a **watchlist you already understand** (your holdings + a tracked list of ~30–100 liquid small/mid caps), not the whole market. Constrained universe = you can sanity-check the LLM's read and manage costs.
2. **Trigger:** material news hits a watchlist name — screen via a news API (Finnhub/FMP already wired) for company-specific stories, filtering out routine noise (analyst reit., minor PR).
3. **LLM scoring — the core step:** feed the LLM the story (+ recent context on the company) and require a *structured* verdict, not a vibe:
   - Directional call (bullish/bearish/neutral) **with a confidence score**
   - **Materiality:** does this change the earnings/cash-flow trajectory, or is it noise? (Most news is noise — the filter's main job is saying "ignore.")
   - **Already-priced check:** has the stock already moved on this? (If it gapped 8% pre-market, the edge is likely gone — the LLM must reason about what's *left*, not what happened.)
   - **Second-order read:** expectations vs. outcome (the "bad news but less bad than feared" logic).
4. **Entry:** only high-confidence + high-materiality + not-yet-fully-priced. Expect to act on a small fraction of flagged stories — the discipline is in *how much you skip*.
5. **Exit:** short and rule-based — a few days, or a target move, or a same-day stop if the thesis is wrong. This is not a hold-for-drift strategy; it's a fade-the-underreaction pop and get out.
6. **Sizing:** small, uniform, many events. Never let one headline trade be large — you *will* be wrong on individual reads.

#### The evidence

- **Lopez-Lira & Tang (2023), "Can ChatGPT Forecast Stock Price Movements?":** LLM headline sentiment predicted next-day returns; long-short portfolios showed significant alpha, concentrated in small caps and around news the market hadn't fully absorbed. Follow-on work (2023–2025) broadly replicates *some* predictive content in LLM-read news, while emphasizing rapid decay and sensitivity to transaction costs.
- **Older base:** event-study and news-sentiment literature (pre-LLM, e.g., Tetlock 2007 on media pessimism) established that news carries tradeable information short-term. LLMs improve the *reading*, not the underlying phenomenon.
- **The honest summary:** real phenomenon, genuinely improved by LLMs, but the *tradeable-after-costs, out-of-sample, at-retail-speed* version is unproven. This is a **research project with a plausible edge**, not a battle-tested strategy. Treat any backtest with deep suspicion until forward-tested with the Scoreboard on live, timestamped signals.

#### What it looks like in practice

Overnight, a $1.5B medical-device name on your watchlist announces FDA clearance for a new product. Pre-market it's up 4%. The LLM reads: clearance was widely expected (management guided to it last call), the product is a modest revenue add (~3% of sales), and the 4% pop roughly matches the value — verdict: **priced, pass.** Contrast: a $900M industrial announces a surprise multi-year defense contract not in any estimates, worth ~15% of annual revenue; pre-market up only 3% (thin overnight volume, few paying attention); LLM verdict: **material, under-reacted, bullish high-confidence** → small long, exit in 2–3 days as coverage catches up. The strategy's whole value is telling those two apart *before* the market does — and mostly, correctly saying "pass."

#### Failure modes

1. **Racing machines you can't outrun.** For big, liquid, widely-followed news you are last in line; the edge only exists in the neglected corners (small caps, overnight, complex/nuanced stories). Straying into liquid mega-cap news = donating to HFT.
2. **LLM hallucination / overconfidence.** The model can invent materiality or misjudge what's priced. Mitigation: structured outputs, confidence thresholds, and *you* as the final check — never auto-trade.
3. **Overtrading.** The flow of "interesting" news is endless; the failure mode is trading too many marginal signals and bleeding costs. The strategy is 90% filter, 10% trade.
4. **Backtest mirage (repeat, because it's the killer here).** Look-ahead bias makes historical results glow. Only forward-tested, timestamped signal tracking tells the truth.
5. **Tax/cost drag:** highest-turnover, all-short-term of the five. **IRA only**, and even there, costs are the enemy.

#### App fit (Phase 7 preview)

Strong infrastructure fit (news APIs + LLM pipeline already exist), weakest strategy fit. The natural build: a morning **watchlist news sweep** — pull overnight/early news for watchlist names, LLM-score each with the structured rubric, surface only high-confidence/high-materiality/not-yet-priced items as cards, and **log every signal with a timestamp to the Scoreboard** so we measure real forward performance before trusting it with a dollar. Framed honestly, the first version of this feature is a *measurement instrument* — prove the edge exists on live data before treating it as a strategy.

#### Variations (for Phase 6 — pick and freeze)

- **Scope:** holdings-only alert layer (defensive: "react to news on what you own") vs. active screener (offensive: hunt new longs). The defensive version is far safer and a natural first build.
- **News source:** company filings/8-Ks (cleaner, material by definition) vs. general news wire (broader, noisier).
- **Holding period:** intraday (hardest, competing with machines) vs. 1–3 day underreaction fade (more retail-viable).
- **Human gate:** always require user confirmation (recommended) — this is the strategy where "the app decides, the human approves" matters most.

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
