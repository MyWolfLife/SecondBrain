# AllPlans.md — Plan Document Index

This file is a map of all planning documents in the Bishop project. Use it to quickly identify which plan doc (if any) is relevant to a given area of work before diving in.

**Source of truth for behavior and data model**: `MyLife-Functional-Spec.md` and `AppHelp.md`
**Source of truth for project conventions and required behaviors**: `CLAUDE.md`
Plan docs below contain design rationale, phased implementation notes, and architectural decisions that may not be fully reflected in the spec yet (especially for in-progress or not-yet-built features).

---

## Core Reference (always read first)

| File | What it covers |
|------|---------------|
| `MyLife-Functional-Spec.md` | Full functional spec for the entire app — source of truth for all built features |
| `AppHelp.md` | In-app help content for every screen — source of truth for what the UI does |
| `CLAUDE.md` | Developer instructions, required behaviors, coding conventions |
| `FutureEnhancements.md` | Parking lot for deferred ideas not yet built — add items here when punting a feature |

---

## Active / In-Progress Plans

| File | Area | What it covers |
|------|------|---------------|
| `HealthEnhancements.md` | Life → My Health | Active plan for health section: concern/condition linking, medication flow, care team, contacts |
| `NeighborsPlan.md` | Life → Contacts → Neighbors | Neighbors feature: neighborhoods, map image + pins, house detail, residents, interactions, archive |
| `ModifyProjects.md` | Life Projects | Rethinking the Life Projects feature — redesign in discussion/planning phase |
| `Checkin-Plan.md` | Check-In & Places | Phase 1 complete; Phase 2 (Foursquare check-in integration) next |
| `FloorPlanEnhancements.md` | House → Floor Plan | Enhancements to the floor plan editor (drag, resize, labels, rooms) |
| `ElectricalSpecs.md` | House → Floor Plan | Electrical overlay specs for the floor plan — circuit breakers, outlet symbols |
| `ExercisePlan.md` | Life → Exercise | Exercise tracking feature — discussion complete, ready to code |
| `WorkoutsPlan.md` | Life → Exercise → Workouts | Workouts: exercise library (with motion-frame pictures), workout builder, and a YAYOG-style guided countdown player (plus self-paced and throughout-the-day modes), voice commands, muscle targets, progression. Planning complete — ready to code Phase 1 |
| `YAYOGAnalysis.md` | Life → Exercise → Workouts | Analysis of the book *You Are Your Own Gym* (exercise structure, training formats, 10-week programs) and the exercise/workout data-model and player changes needed before importing it. Analysis only, with open questions |
| `ExerciseLevelsPlan.md` | Life → Exercise → Workouts | Detailed build plan (chunks L1–L8) for exercise levels: a ladder of levels per exercise, "my level" vs pinned level on workout steps, level-based progression, records per level. Planned, not started |
| `ExerciseAdditionsPlan.md` | Life → Exercise → Workouts | Build plan (chunks E1–E5) for the rest of the YAYOG exercise/step additions: rep ranges and to-failure sets, tempo/pauses, swap-start-side and weaker-side-first, picture captions, category/source/precaution. In progress |
| `FormatsPlan.md` | Life → Exercise → Workouts | Build plan (chunks F1–F6) for the book's workout formats: Interval Sets, Tabata/Timed Sets, Supersets, Stappers, Ladders and the rest, and the two clock abilities they need. In progress (F1 first) |
| `ImportPlan.md` | Life → Exercise → Workouts | Plan for importing the YAYOG book's exercises: a local-only data file, an in-app Import screen with review, muscle/equipment mapping, variations as levels. In progress |
| `ProgramsPlan.md` | Life → Exercise → Programs | Plan for the Programs feature and the book's four 10-week programs: program templates pointing at workouts, a next-up run, session links, import of the 128 day workouts, next cycle. Plan only, open questions at the end |
| `SharedSpacesHandoff.md` | Whole app (data) | The paste-in prompt for starting the Shared Spaces build in a new session (what to read, what to settle first, how the user works) |
| `SharedSpacesPlan.md` | Whole app (data) | Original design for sharing data between accounts (per-person Share buttons, S1–S14). Background only — the group-based direction in `SharedSpacesBuildPlan.md` replaces S7/S8 |
| `SharedHousePlan.md` | House (sharing) | Plan for sharing the whole House section (floors, rooms, things, sub-things, items, floor plans, breaker panels and their photos/facts/problems/tasks/activities) with groups; chunks H1–H5, decisions H1–H9, risks. Plan only, no code |
| `SharedYardPlan.md` | Yard (sharing) | Plan for sharing the whole Yard (zones, plants, weeds, chemicals, and their photos/facts/problems/tasks/activities) with groups; chunks Y1–Y5, decisions Y1–Y8, risks. Plan only, no code |
| `SharedSpacesBuildPlan.md` | Whole app (data) | Current plan: sharing through groups (Wife / Family / Guest), View or Edit per group, Collections as the first thing shared; chunks S1–S7, decisions G1–G11, open questions. Plan only, no code |
| `FirestoreRules.md` | Whole app (data) | What the new `firestore.rules` do in plain words, step-by-step deploy in the Firebase console, rollback copy of the old rules, what each chunk must prove, things the rules force the app to do |
| `InvestmentPlan.md` | Life → Financial | Investment tracker — retirement account tracking mirroring user's spreadsheet |
| `AskLLMInvestmentsPlan.md` | Life → Financial | AI analysis button on investments pages — assembles financial snapshot, sends to LLM |
| `BudgetPlan.md` | Life → Financial | Budgets feature — new card under Financial tab, monthly/category budget tracking |
| `StockAnalyzerPlan.md` | Life → Financial | Stock Analyzer — short-term trade candidate finder. Phases 1–3 COMPLETE (scan, backtest, dossiers, trades, scoreboard; Finnhub quality/insider/drift/news enrichment; FMP divergence, Detector C revision momentum, Discover screener, consolidation). Remaining: strategy-profile UI + holdings check (Goal 2 — now specced in `HoldingsHealthPlan.md`) |
| `TradingStrategiesPlan.md` | Life → Financial | Trading strategies investigation — top index-beating strategies (dual momentum, stock momentum, quality-value, PEAD, news sentiment), teaching + implementation docs + one app feature per surviving strategy. **ALL 7 PHASES COMPLETE** — 5 strategies taught, rulebooks frozen, and all 5 tools built on the Stock Analyzer hub (Dual Momentum, Stock Momentum, Quality-Value, Earnings Drift, News Sentiment), each with an About Strategy education page and a graded signal log |
| `StockAnalysisRankingPlan.md` | Life → Financial | Composite score + letter grade per scan candidate, so the user can rank/sort instead of reading every chip on every card. **Phases 1–5 COMPLETE** (all four detector scorers, grade pill + per-metric breakdown on scan cards + dossier, grade-sorted sections). Remaining: Phase 6 calibration diagnostic, gated on ≥30 graded Scoreboard candidates |
| `HoldingsHealthPlan.md` | Life → Financial | **Goal 2 — ✅ COMPLETE (2026-07-19).** Forward-looking health check on stocks you already own. Per-holding verdict (✅ Healthy / 👀 Watch / ⚠️ Review exit) from flag-count of 5 exit checks (estimate deterioration [flagship, mirror of Detector C], trend vs 50/200d, analyst momentum, quality/falling-knife, earnings risk) + regime context. Its own tool on the Analyzer hub (💼 Portfolio) at `#analyzer/holdingshealth` with an About page. Tappable check/verdict chips explain themselves. Duration is deliberately never an input |
| `DeathPlan.md` | Life → My Legacy | Legacy/estate planning section — what happens when user dies, final wishes, contacts |
| `LifeCalendar.md` | Life → Calendar | Life-section calendar for personal events (separate from Yard calendar) |
| `ChecklistBoardEnhancements.md` | Checklists | Active runs → manual 3-column board (2-D `boardCol`/`boardOrder` position, desktop-editable / phone read-only), drag reorder, star-bump-to-top, collapsible cards, edit tags on a run, unique-tag AND filter (sidebar/accordion). **ALL 5 PHASES COMPLETE** |
| `NativePhoneAppPlan.md` | App-wide | Native Android/iPhone sister app idea. **RESOLVED — not being built.** Root need (reliable offline access on multi-day, zero-signal trips) is instead solved inside the existing PWA — see `PwaPlan.md` Phase 2.5. Kept as a record of the reasoning. |
| `PwaPlan.md` | App-wide | PWA implementation — installable icon, offline support, service worker, custom Firebase config. **Phases 1, 2 & 4 COMPLETE.** Phase 2.5 (Go Offline/Go Online) COMPLETE — core mechanism plus a full-coverage read-only lock (visual hiding on most screens + a Proxy-based write guard on `userCol()`/`db.batch()` that blocks every write app-wide as a backstop). Residual gap: Firebase Storage writes (Private vault only) aren't covered. Phase 3 (install-prompt polish) and Phase 5 (push notifications) not started. Also hosts the Bucket List **share target** (`share_target` in the manifest + a POST handler in `sw.js`). |

---

## Planned / Not Yet Started

| File | Area | What it covers |
|------|------|---------------|
| `saveplacesPlan.md` | Life → Bucket List | Wish list of places/events to visit (towns, trails, waterfalls, bars, seasonal sights). Geographic stacking (country → region → city), month/season/date timing, multiple links, and LLM import from a pasted reel screenshot that returns JSON records. **ALL 5 PHASES COMPLETE** (manual list, filters, detail page, OSM location search, timing picker; country → region → city drill-down, clustered map, "Good now"; screenshot import via LLM with review screen and paste-JSON fallback; journal visit log, add to trip, add to calendar, QuickLog add/query; Android share-sheet target) |
| `Health.md` | Life → My Health | Original health feature plan — conditions, medications, care team, appointments |
| `plan.md` | App-wide | Original build plan from Phase 0 onward — now mostly historical |
| `HousePlan.md` | House | Interior section — floors, rooms, Things, SubThings, full feature parity with Yard |
| `BishopGps.md` | Yard | GPS perimeter-walking to create 2D maps of yard zones |
| `Vehicles.md` | Vehicles | Vehicle tracking — maintenance, mileage logs, photos, calendar reminders |
| `Garage.md` | Garage | Garage + Attic as a mini-house with Things/SubThings |
| `YardStructures.md` | Yard | Outdoor structures (sheds, fences, firepits) as yard entities |
| `Collections.md` | Collections | Physical collections tracker (comics, records, hat pins, etc.) |
| `People.md` | Life → People | Personal contacts/relationship tracker with interaction log |
| `Notes.md` | Life → Notes | Notebooks and timestamped note entries with photos |
| `Top10Lists.md` | Thoughts | Top 10 Lists under the Thoughts section |
| `MemoriesPlan.md` | Thoughts | Personal memories — when/where/who/what happened |
| `ViewsPlan.md` | Thoughts | Personal viewpoints tracker — evolving stances with change history |
| `PersonalPlan.md` | Life | Broader Life section planning — journal, goals, mood, general personal tracking |
| `PrivatePlan.md` | Life → Private | Encrypted private vault — passphrase-only access for sensitive personal data |
| `PWPlan.md` | Life → Credentials | Credentials/password manager card on Life screen |
| `LegacyFinancial.md` | Life → My Legacy | Financial accounts sub-feature of Legacy — account list for survivors |
| `SharedHousehold.md` | Auth | Shared household access — family member can see/edit all data except Life/Journal |
| `MultipleUsers.md` | Auth | True per-user data isolation for multi-user support |
| `LocationsDistances.md` | Life Projects | Reusable locations collection for travel planning — distances between places |
| `SubThingItems.md` | House | Fourth level of House hierarchy beneath SubThings |
| `ReminderPlan.md` | Calendar | Push reminders / Google Calendar integration for Bishop calendar events |

---

## Infrastructure / Tooling Plans

| File | Area | What it covers |
|------|------|---------------|
| `Backup.md` | Settings | Backup & restore — export/import Firestore data as JSON |
| `HelpPlan.md` | App-wide | In-app help system design — how AppHelp.md feeds the help screen and LLM Q&A |
| `SecondBrain.md` | SecondBrain | Natural language command interface — voice/text shortcuts to log and navigate |
| `AskGPT.md` | LLM Integration | General LLM Q&A feature planning (broader than SecondBrain) |
| `Chat.md` | LLM Integration | Simple chat button in nav bar — post questions to ChatGPT/Grok |
| `FirebaseSetup.md` | Infrastructure | Firebase project setup, Firestore rules, auth config reference |
| `diagnoseFoursquare.md` | Check-In | Foursquare API diagnosis log — account info, endpoint testing, troubleshooting notes |

---

## How to use this file with `/fixbishop`

When working on a dev note fix:
1. Identify the feature area from the dev note text
2. Check the table above — if a plan doc matches the area, scan it for design rationale or constraints not yet in the spec
3. If no matching plan doc exists, the spec + help file + source code are sufficient
4. Plan docs may be stale for fully-built features — the spec always wins on behavior; plan docs are for intent and rationale
