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
| `InvestmentPlan.md` | Life → Financial | Investment tracker — retirement account tracking mirroring user's spreadsheet |
| `AskLLMInvestmentsPlan.md` | Life → Financial | AI analysis button on investments pages — assembles financial snapshot, sends to LLM |
| `BudgetPlan.md` | Life → Financial | Budgets feature — new card under Financial tab, monthly/category budget tracking |
| `StockAnalyzerPlan.md` | Life → Financial | Stock Analyzer — short-term trade candidate finder. Phases 1–3 COMPLETE (scan, backtest, dossiers, trades, scoreboard; Finnhub quality/insider/drift/news enrichment; FMP divergence, Detector C revision momentum, Discover screener, consolidation). Remaining: strategy-profile UI + holdings check (Goal 2) |
| `TradingStrategiesPlan.md` | Life → Financial | Trading strategies investigation — top index-beating strategies (dual momentum, stock momentum, quality-value, PEAD, news sentiment), teaching + implementation docs + one app feature per surviving strategy. User kept all 5; Phase 5 deep teaching in progress (Dual Momentum taught) |
| `StockAnalysisRankingPlan.md` | Life → Financial | Composite score + letter grade per scan candidate, so the user can rank/sort instead of reading every chip on every card. **Phases 1–5 COMPLETE** (all four detector scorers, grade pill + per-metric breakdown on scan cards + dossier, grade-sorted sections). Remaining: Phase 6 calibration diagnostic, gated on ≥30 graded Scoreboard candidates |
| `DeathPlan.md` | Life → My Legacy | Legacy/estate planning section — what happens when user dies, final wishes, contacts |
| `LifeCalendar.md` | Life → Calendar | Life-section calendar for personal events (separate from Yard calendar) |

---

## Planned / Not Yet Started

| File | Area | What it covers |
|------|------|---------------|
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
| `PwaPlan.md` | App-wide | PWA implementation — offline support, installability, service worker strategy |

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
