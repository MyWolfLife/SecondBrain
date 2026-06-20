# Exercise Feature Plan

## Status: Discussion Phase complete — Ready to code

---

# Section 1: Activities

## What We're Building

A new **Exercise** section accessible from the Life page. It will house three areas — Activities, Goals, and Summary — but only Activities will be built in this phase. Goals and Summary will show a "Coming soon" placeholder.

---

## Life Page Entry Point

- New card on the Life page: **"Exercise"**
- Takes you to an Exercise hub page
- Hub shows three cards: **Activities**, **Goals**, **Summary**
- Goals and Summary cards display "Coming soon" for now
- Hub is a pure card launcher — no stats (Summary card will own that later)

---

## Activities List Screen

- Accessible from the Activities card on the Exercise hub
- Header button: **+ Activity**
- "Manage Types" link near the filter area
- Time filter dropdown (defaults to **Last 30 days**):
  - Last 7 days
  - Last 30 days *(default)*
  - Last 90 days
  - This Month
  - This Year
  - All Time
  - Custom *(reveals Start Date / End Date inputs + Load button)*
- **Go to Date** control: overrides the dropdown filter entirely; shows only activities for that date. Changing the dropdown clears the date selection.
- Activities ordered by date/time **descending** (newest first)
- Clicking a row goes **straight into edit mode**
- After save or delete → return to the Activities list

### Desktop Grid Columns
`Date | Day | Type 🐾 | Duration | Miles | Pace | Calories | Comment`

- 🐾 paw icon appears inline on the Type column when "With Dogs" was logged (e.g., "Running 🐾")
- Miles, Pace, and 🐾 absent/blank for non-applicable types
- Pace shown as MM:SS/mi (e.g., `8:15/mi`), auto-calculated — blank if miles or duration is missing
- Comment column truncates gracefully

### Phone Layout — Two-Line Card (max 3 items per line)
```
Thu 5/8/26    Running 🐾    25:30
3.1 mi @ 8:14/mi    310 cal    Morning 5k
```
- Line 1: Date (short format) | Type (with 🐾 if applicable) | Duration (MM:SS, or `—` if blank)
- Line 2: Miles @ Pace (combined slot) | Calories | Comment
- For non-mileage types, line 2 shows fewer items (e.g., just Calories and Comment)
- No horizontal scroll

---

## New / Edit Activity Screen

**New screen** (not modal) — dynamic conditional fields are cleaner on a dedicated screen; edit mode reuses the same screen.

### Fields

| Field | Required? | Notes |
|---|---|---|
| Type | Yes | Searchable dropdown. Case-insensitive match — no duplicates created. If no match, shows "Add '[name]'" at bottom. |
| Duration | No | Decimal minutes (e.g., `45`, `25.5`). Displayed as MM:SS. Blank = not tracked. |
| Miles | No | Shown only if type has `tracksMiles = true`. |
| With Dogs | No | Toggle. Shown only if type has `withDogs = true`. |
| Calories Burned | No | Manual number entry. |
| Comment | No | Free text. |
| Date/Time | Yes (defaults to now) | User can override. |

- **Delete** button on edit screen only (not on the list)
- After save/delete: return to Activities list

---

## Activity Types

Each activity type carries two behavior flags:
- **`tracksMiles`** — controls whether the Miles field and Pace appear
- **`withDogs`** — controls whether the "With Dogs" toggle appears

### Built-in Defaults (13 types)

| Type | tracksMiles | withDogs |
|---|---|---|
| Running | ✅ | ✅ |
| Trail Running | ✅ | ✅ |
| Walking | ✅ | ✅ |
| Hiking | ✅ | ✅ |
| Treadmill | ✅ | ❌ |
| Golf | ❌ | ❌ |
| Mowing | ❌ | ❌ |
| Yard Work | ❌ | ❌ |
| Weights | ❌ | ❌ |
| Elliptical | ❌ | ❌ |
| Row Machine | ❌ | ❌ |
| Bike | ❌ | ❌ |
| Stationary Bike | ❌ | ❌ |

### Add on the Fly
When user types a name with no case-insensitive match and selects "Add '[name]'":
1. Ask: **"Track miles for this activity?"** (Yes / No)
2. Ask independently: **"Show 'With Dogs' toggle?"** (Yes / No)
3. Type is saved immediately; future activities using it get the correct conditional fields

### Manage Activity Types Screen
- Link on the Activities list screen (near filter area)
- Shows all non-archived types (built-ins + custom)
- Built-in types: displayed but cannot be renamed or deleted
- Custom types: can be **renamed** (updates type doc; all activities reflect new name via typeId) or **soft-deleted** (archived=true; disappears from dropdown but history still displays correctly)

---

## Duration

- **Stored as:** decimal minutes (nullable — blank if not tracked)
- **Entered as:** single decimal number input — user types `25.5` for 25 min 30 sec
- User handles seconds-to-fraction math (mainly for 5k/10k timing)
- **Displayed as MM:SS:** `25.5 → 25:30`, `90 → 1:30:00`, `45 → 45:00`, blank → `—` on phone card, empty on desktop grid

---

## Decisions Reference

| Topic | Decision |
|---|---|
| Entry point | New card on Life page |
| Hub | Activities / Goals / Summary — Goals/Summary "coming soon" |
| Hub stats | Pure launcher — Summary card will own stats later |
| Activities UX | New screen (not modal) for add/edit |
| Row click | Straight to edit mode |
| Delete | Edit screen only |
| After save/delete | Return to Activities list |
| Phone layout | Two-line card, max 3 items per line |
| Phone date format | Short: "Thu 5/8/26" |
| Duration | Optional. Decimal minutes stored. MM:SS displayed. Blank → `—` on phone, empty on desktop. |
| Miles / Calories | Both optional |
| Filter options | Last 7 / 30 (default) / 90 / This Month / This Year / All Time / Custom (Start+End+Load) |
| Go to Date | Overrides dropdown; changing dropdown clears date |
| Desktop grid columns | Date \| Day \| Type 🐾 \| Duration \| Miles \| Pace \| Calories \| Comment |
| Pace | Auto-calculated (Miles ÷ Duration), MM:SS/mi, blank if either input missing |
| "With Dogs" in grid | 🐾 icon inline on Type column |
| Type flags | `tracksMiles` and `withDogs` per type |
| Default types | 13 built-ins with flags pre-set |
| Add on the fly | Searchable dropdown → case-insensitive check → if new: ask tracksMiles, ask withDogs (independently) |
| Duplicate types | Case-insensitive match — existing type used, no duplicate created |
| Manage Types | Rename + soft-delete custom types; built-ins fixed |
| Rename effect | Updates type doc; all activities reflect new name via typeId |
| Delete effect | Soft delete (archived=true); history unaffected (type doc preserved) |
| Calendar integration | None — not in scope |

---

## Data Model

**`exerciseActivities`** (per-user via `userCol()`)
| Field | Type | Notes |
|---|---|---|
| typeId | string | Reference to exerciseTypes doc |
| durationMinutes | number \| null | Decimal minutes; null if not tracked |
| miles | number \| null | null if not tracked or N/A |
| withDogs | boolean \| null | null if N/A for this type |
| calories | number \| null | null if not tracked |
| comment | string | Empty string if none |
| activityDate | string | ISO datetime |
| createdAt | timestamp | |

**`exerciseTypes`** (per-user via `userCol()`)
| Field | Type | Notes |
|---|---|---|
| name | string | Display name |
| tracksMiles | boolean | |
| withDogs | boolean | |
| isDefault | boolean | True for the 13 built-ins |
| archived | boolean | Soft-delete flag |
| createdAt | timestamp | |

- Default types are seeded on first load if the collection is empty
- Activities store `typeId`, not the name string — rename + soft-delete both work cleanly

---

## Implementation

### Overview
Four phases. Each is independently shippable and builds on the previous. Phase 3 is the largest.

---

### Phase 1 — Foundation & Hub
*Goal: Get the skeleton in place with routing and type seeding. Nothing functional yet for end-users beyond navigation.*

- New file: `js/exercise.js`
- Add `<script>` tag to `index.html`
- Add Exercise card to the Life page
- Add `#exercise` hub page section to `index.html` with three cards (Activities, Goals, Summary)
- Goals and Summary cards show "Coming soon" text
- Wire up routes: `#exercise`, `#exercise-activities`, `#exercise-activity/new`, `#exercise-activity/:id`, `#exercise-types`
- On first load of `#exercise-activities` or `#exercise-types`, check if `exerciseTypes` collection is empty — if so, seed all 13 default types
- Add CSS for the hub card layout (reuse existing card patterns)
- Bump cache/versions

**Deliverable:** Life page → Exercise hub navigation works. No data screens yet.

---

### Phase 2 — Activities List
*Goal: The list screen is fully functional for reading data. Can't add yet, but filter, date controls, and display all work.*

- Build `#exercise-activities` page section
- Filter dropdown with all options (Last 7, 30, 90, This Month, This Year, All Time, Custom)
- Custom filter: shows Start / End date inputs + Load button
- Go to Date control with override behavior
- Firestore query against `exerciseActivities` with date range logic
- Desktop grid render (all 8 columns, pace calculated inline)
- Phone two-line card render (3-per-line rule, short date, combined miles@pace slot)
- Empty state message when no results
- "Manage Types" link (routes to `#exercise-types`, which shows placeholder until Phase 4)
- "+ Activity" button routes to `#exercise-activity/new` (placeholder until Phase 3)
- Add CSS for grid and card layouts, responsive breakpoints
- Bump cache/versions

**Deliverable:** Activities list screen is navigable and filterable. Displays data if any exists.

---

### Phase 3 — New / Edit Activity
*Goal: Full CRUD for activities. This is the biggest phase — searchable type dropdown, conditional fields, add-on-fly flow, save, delete.*

- Build `#exercise-activity/new` and `#exercise-activity/:id` page sections (same HTML, different mode)
- Searchable type dropdown:
  - Loads all non-archived types from `exerciseTypes`
  - Filters list as user types (case-insensitive)
  - If no match: shows "Add '[typed name]'" option at bottom
- Add-on-the-fly flow:
  - Small inline prompt or mini modal: "Track miles? (Yes / No)" then "Show 'With Dogs'? (Yes / No)"
  - Saves new type doc to `exerciseTypes`, then continues with that type selected
- Conditional field rendering based on type flags:
  - Miles input: shown if `tracksMiles = true`
  - With Dogs toggle: shown if `withDogs = true`
- All other fields: Duration (decimal input), Calories, Comment, Date/Time picker
- Date/Time defaults to current date and time
- Pace preview on edit form (calculated live as user fills in miles + duration) — optional nice-to-have
- Save: creates or updates `exerciseActivities` doc → back to list
- Delete (edit mode only): confirmation dialog → soft/hard delete → back to list
- Validation: Type and Date required; everything else optional
- Add CSS for form layout, responsive
- Bump cache/versions

**Deliverable:** User can log, view, edit, and delete exercise activities end-to-end.

---

### Phase 4 — Manage Activity Types
*Goal: User can rename and soft-delete custom types. Built-ins are shown but locked.*

- Build `#exercise-types` page section
- Load all non-archived types from `exerciseTypes`, sorted: built-ins first (alphabetical), then custom (alphabetical)
- For each type: show name, tracksMiles icon, withDogs icon
- Built-in types: no action buttons
- Custom types: **Rename** (inline edit → save to Firestore) and **Delete** (confirm → set `archived: true`)
- On rename: update `exerciseTypes` doc — activities using this typeId automatically display new name
- On soft-delete: `archived = true` — type disappears from dropdown; history unaffected
- Back navigation → Activities list
- Add CSS as needed
- Bump cache/versions

**Deliverable:** Full type management. The exercise Activities feature is complete.

---

### Phase Recommendation
Build one phase at a time and confirm before moving to the next. Phase 3 in particular is dense — keeping it isolated makes it easier to test and catch issues before building on top of it.

**Prompt me phase by phase** unless you want to go faster and have me run through all four in sequence.

---

---

# Section 2: Strava Integration — Future Consideration

## Overview

Garmin watches sync activities to Strava automatically. Strava has a well-documented public OAuth API that Bishop could use to import activities. This section documents everything researched so a future implementation has a solid starting point.

---

## Why Strava (Not Garmin Direct)

Garmin has a Connect API but it is partner-gated — you must apply and be approved by Garmin. Not practical for a personal app.

Strava has a free, publicly accessible OAuth API. Since Garmin already syncs to Strava, the data is already there. Strava is the right integration point.

---

## How OAuth Would Work on a Static GitHub Pages App

Strava uses standard OAuth 2.0 authorization code flow:

1. User clicks "Connect Strava" in Bishop settings
2. Browser redirects to `https://www.strava.com/oauth/authorize?client_id=...&redirect_uri=https://mywolflife.github.io/SecondBrain/&scope=activity:read_all`
3. User approves in Strava
4. Strava redirects back to `https://mywolflife.github.io/SecondBrain/?code=abc123`
5. Bishop detects `?code=` in `window.location.search` on page load
6. Bishop POSTs to `https://www.strava.com/oauth/token` with the code, `client_id`, and `client_secret` to exchange for tokens (Strava allows CORS on this endpoint)
7. Store `refresh_token` in `userCol('settings').doc('strava')` in Firestore
8. Strip query string from URL (replaceState), navigate to `#exercise-activities`

**Handling the client_secret:** Never hardcode it in source. Store `client_id` and `client_secret` in `userCol('settings').doc('strava')` in Firestore (same pattern as LLM API keys) — behind Firebase Auth login, fetched at runtime for the exchange.

**Token refresh:** Access tokens expire every 6 hours. Before any API call, check `expiresAt`. If expired, POST to Strava token endpoint with `grant_type=refresh_token` to get a new access token silently.

---

## Complete Strava API Field Reference

Fields available from the Strava API. Two endpoints:
- **`GET /athlete/activities`** — lightweight SummaryActivity list, up to 200 per page
- **`GET /activities/{id}`** — full DetailedActivity for one activity (richer data, one call per activity)

### Fields Available from the List Endpoint (SummaryActivity)

| Field | Type | Notes |
|---|---|---|
| `id` | Long | Strava activity ID — store as `stravaId` for deduplication |
| `name` | String | Activity title set in Garmin/Strava |
| `type` | String | e.g. Run, Walk, Ride, Hike, WeightTraining |
| `sport_type` | String | More specific: TrailRun, MountainBikeRide, VirtualRide, etc. |
| `workout_type` | Integer | Classification: easy run, race, long run, workout |
| `start_date_local` | Date | Local-time start — prefer over `start_date` (UTC) |
| `distance` | Float | Meters — divide by 1609.34 for miles |
| `moving_time` | Integer | Seconds of active movement — divide by 60 for minutes |
| `elapsed_time` | Integer | Seconds total including pauses — different from moving_time if you paused |
| `total_elevation_gain` | Float | Meters gained — multiply by 3.28084 for feet |
| `average_speed` | Float | m/s — mostly useful for cycling |
| `max_speed` | Float | m/s peak |
| `average_cadence` | Float | Steps/min (running) or RPM (cycling) |
| `average_watts` | Float | Power output — only if power meter used |
| `max_watts` | Integer | Peak watts |
| `weighted_average_watts` | Integer | Normalized power |
| `kilojoules` | Float | Energy output in kJ (more precise than calories for cycling) |
| `device_watts` | Boolean | Whether watts came from a real device |
| `has_heartrate` | Boolean | True if HR data was recorded |
| `average_heartrate` | Float | BPM average |
| `max_heartrate` | Integer | BPM peak |
| `suffer_score` | Integer | Strava relative effort score |
| `calories` | Float | Estimated calories burned |
| `trainer` | Boolean | True if treadmill or indoor trainer |
| `commute` | Boolean | Marked as commute |
| `manual` | Boolean | Manually entered (not recorded by device) |
| `private` | Boolean | Privacy setting |
| `gear_id` | String | Which shoes or bike |
| `device_name` | String | e.g. "Garmin Forerunner 955" |
| `pr_count` | Integer | Personal records set in this activity |
| `achievement_count` | Integer | Achievements unlocked |
| `kudos_count` | Integer | Kudos received |
| `start_latlng` | Array | [lat, lng] start coordinates |
| `map` | PolylineMap | Encoded polyline of the route — renderable with Leaflet (already in Bishop) |
| `timezone` | String | Activity timezone |

### Additional Fields Only in DetailedActivity (one API call per activity)

| Field | Type | Notes |
|---|---|---|
| `description` | String | Notes written in Garmin/Strava |
| `average_temp` | Float | Average temperature during activity |
| `elev_high` / `elev_low` | Float | Peak and valley elevation in meters |
| `max_cadence` | Float | Peak cadence |
| `laps` | Array | Lap-by-lap breakdown: time, distance, pace, HR per lap |
| `splits_metric` | Array | Per-km splits with pace, HR, elevation |
| `segment_efforts` | Array | Performance on named Strava segments |
| `photos` | PhotosSummary | Photos attached to the activity |
| `gear` | SummaryGear | Full gear details object |
| `external_id` | String | Garmin internal activity ID |
| `upload_id` | Long | Strava upload identifier |

### Fields NOT Available in the Strava API
- Heart rate zones (zone distribution)
- Training load / TSS (Training Stress Score)
- Full GPS point stream (only encoded polyline — no raw lat/lng array unless using Streams API separately)
- Weather data beyond `average_temp`
- Perceived exertion rating
- Individual split details beyond aggregate metrics

---

## Proposed Field Tiers for Bishop Import

### Tier 1 — Capture on initial import (all from list endpoint, no extra API calls)

Store alongside existing `exerciseActivities` fields:

| Field | Maps to |
|---|---|
| `id` | `stravaId` (deduplication key) |
| `average_heartrate` / `max_heartrate` | New fields on activity |
| `total_elevation_gain` | New field, store meters, display as feet |
| `elapsed_time` | New field alongside `durationMinutes` (moving_time) |
| `suffer_score` | New field |
| `workout_type` | New field |
| `trainer` | New boolean field — was this indoors? |
| `average_cadence` | New field |
| `device_name` | New field |
| `name` | Goes into `comment` OR a separate `stravaName` field — see Open Questions |
| `sport_type` | Used for type mapping (more specific than `type`) |

### Tier 2 — Easy to add, decide at build time

- `average_temp`
- `elev_high` / `elev_low`
- `average_speed` / `max_speed`
- `kilojoules`
- `pr_count`
- `gear_id` / `gear.name`

### Tier 3 — Significant UI work, plan separately

- **Map** — decode polyline and render on Leaflet (already loaded in Bishop); needs a map section on the activity detail page
- **Laps / splits** — need their own table/detail view
- **Photos** — requires DetailedActivity call; would integrate with existing Bishop photo system
- **Description** — requires DetailedActivity call; needs throttling for bulk import
- **Segment efforts** — niche, probably not worth it

---

## Type Mapping: Strava sport_type → Bishop exerciseTypes

| Strava `sport_type` | Bishop type |
|---|---|
| Run | Running |
| TrailRun | Trail Running |
| Walk | Walking |
| Hike | Hiking |
| VirtualRun / Treadmill | Treadmill |
| Golf | Golf |
| WeightTraining | Weights |
| Ride / EBikeRide | Bike |
| VirtualRide | Stationary Bike |
| Elliptical | Elliptical |
| Rowing | Row Machine |
| *anything else* | Auto-create new exerciseType with `tracksMiles` inferred from `distance > 0` |

---

## Deduplication Strategy

- Store `stravaId` on every imported `exerciseActivity` doc
- Before writing any activity, query `where('stravaId', '==', activity.id)` — skip if already exists
- Incremental sync can run safely any number of times
- Manually-logged Bishop activities (no `stravaId`) are never touched
- If a user logged something manually AND it synced from Garmin, there will be a duplicate — visually mark Strava-imported rows with a small badge so they are distinguishable

---

## Rate Limits

Strava free tier: **100 requests per 15 minutes, 1,000 per day**

- List endpoint: 200 activities per page → 500 historical activities = 3 requests (trivial)
- Ongoing sync: 1 request per run
- DetailedActivity (Tier 3): 1 call per activity — needs throttling for bulk historical import; not a concern for Tier 1/2

---

## Implementation Phases (When Ready to Build)

### Phase A — Connect + Historical Import (~1 day)
- Settings page: "Connect Strava" button → OAuth flow
- On success: date range picker → preview list of activities to import → confirm → write to Firestore
- Import Tier 1 fields
- Progress indicator for large imports

### Phase B — Ongoing Sync (~2–3 hours on top of Phase A)
- "Sync from Strava" button on Activities list (or in Settings)
- Pulls activities newer than the most recent imported `stravaId`
- Shows "N new activities imported" feedback toast

### Phase C — Rich Data / Tier 3 (1–2 days, separate decision)
- Map display on activity detail page (Leaflet polyline decode)
- Laps / splits table
- Requires DetailedActivity API calls with throttling

---

## Open Questions for When This Gets Built

1. **Activity name vs comment** — should Strava `name` (e.g. "Morning Run") go into `comment` or a separate `stravaName` field? If it goes into `comment`, manually-edited comments would conflict on re-sync.
2. **Elevation units** — store meters (Strava native) or feet (display preference)? Recommended: store meters, convert on display.
3. **moving_time vs elapsed_time** — `durationMinutes` should map to `moving_time` (active time). Store `elapsed_time` separately for reference.
4. **Connect/disconnect location** — should the Strava OAuth flow live in the Exercise section or in Settings?
5. **Unknown sport_type mapping** — auto-create silently or prompt the user to confirm the new type?
6. **Historical import scope** — all-time, or cap at some date to avoid importing years of data on first connect?

---

---



# Section 3: Daily Metrics

## Overview

A daily journal of health and habit data — one record per day. Captures both fixed biometric numbers (sleep score, steps, weight, etc.) and user-defined custom metrics (yes/no habits, extra numbers, free-text observations). The list view shows a scrollable grid with aggregate stats above the column headers, per-metric notes on hover (desktop) or tap overlay (mobile), and a date range filter that always defaults to This Month.

---

## Decisions Made

| Topic | Decision |
|---|---|
| Records per day | One per day — editing overwrites |
| Standard metrics | Always shown, all optional (blank = not tracked) |
| Custom metric labels | 100% user-defined — no hardcoded labels |
| Custom metric types | boolean (yes/no), number (int or decimal), text |
| Mobile custom metrics | Show all — Y/blank for boolean, value for number/text |
| Notes | Expand-on-demand — note icon beside each metric reveals a text input |
| Default date range | This Month — never sticky, always resets on load |
| Record count display | Single "N records" label in filter area; shared context for all columns |
| Summary row — standard numbers | Average of non-null values |
| Summary row — custom boolean | X/Y (yes count / total records) |
| Summary row — custom number | Sum only (no per-column day count — N records label provides context) |
| Summary row — custom text | Blank |
| Mobile note tap | Small in-page overlay anchored near the icon; tap anywhere outside to dismiss |
| Mobile card cutoff | Show all custom metrics; revisit if it gets unwieldy |
| Seeding | Pre-seed 5 example custom metrics on first visit (user can delete/rename freely) |

---

## Entry Point

- New card on the Exercise hub page: **"Daily Metrics"**
- Routes to `#exercise-metrics` (list screen)
- Hub card shows "Coming soon" until built (same pattern as Goals/Summary)

---

## Standard Metrics (Hardcoded)

Always present on every daily record. Cannot be deleted. All are optional — leave blank to skip.

| Metric | Type | Notes |
|---|---|---|
| Weight | Decimal number | e.g. 214.5 — measured at start of day |
| Sleep Score | Integer | 0-100 |
| Body Battery | Integer | 0-100 |
| Daily Steps | Integer | Total steps |
| Total Actual Burn | Integer | Calorie burn from watch — typically entered next day after watch syncs |
| Food Calories | Integer | Calories consumed |

---

## Custom Metrics (User-Defined)

Created, edited, and deleted on the **Manage Metrics** screen. All labels, types, and options are fully user-controlled. Metadata lives in `exerciseMetricDefs`.

| Type | Entry form | List display | Summary row |
|---|---|---|---|
| boolean | Checkbox (checked = yes) | Y or blank | X / Y (yes count / N records) |
| number | Text input (int or decimal) | Value + unit label | Sum |
| text | Single-line text input | Truncated value | Blank |

Each custom metric definition stores:
- **Name** — user-defined label
- **Type** — boolean / number / text
- **Allow Decimal** — number type only
- **Unit Label** — optional suffix shown in list (e.g. "cal", "oz")
- **Sort Order** — controls column/form sequence
- **Archived** — soft-delete; removes from entry form, preserves history

---

## Date Range Filter

**Not sticky** — always resets to "This Month" on page load.

### Dynamic options (top group)
- Last Week
- This Week
- **This Month** *(default)*
- Last Month
- This Year
- Last Year

### Month shortcuts (bottom group)
Jan through Dec as single-click buttons.

**Year logic:** month number > current month → last year; otherwise → this year.

*Example in May 2026: "Mar" = March 2026; "Aug" = August 2025.*

Months that resolve to last year show a small year tag (e.g., "Aug '25"). Current-year months show the name only (e.g., "Mar"). This is built in from the start — eliminates any guessing.

### Record count label
After the filter is applied, display a small label: **"N records"** (e.g., "14 records"). This sits in the filter/toolbar area and serves as the shared denominator for all columns — boolean X/Y, number sums, and standard averages all draw meaning from the same N.

---

## Summary Row (Above Column Headers)

A single aggregate row between the filter controls and the column headers. Updates on every filter change.

| Column type | What shows |
|---|---|
| Standard number | Average of non-null values (0 counts; blank/null does not) |
| Custom boolean | X / Y (yes count / N records total) |
| Custom number | Sum of non-null values |
| Custom text | Blank |
| Date column | Blank |

**Calculation rules:**
- N records = count of loaded docs, not calendar days
- A stored 0 counts toward averages and sums; a null/blank does not
- If no records have a value for a column, show dash

**Visual:** summary row is bold or has a light background tint to distinguish it from data rows.

**Mobile:** compact strip above the cards showing standard-metric averages only (Weight, Sleep, Steps). Custom metric summaries are desktop-only.

---

## Daily Metrics List Screen (`#exercise-metrics`)

- Header button: **+ Daily Metrics** → `#exercise-metric/new`
- **Manage Metrics** link → `#exercise-metric-defs`
- Records sorted newest-first
- Clicking any row opens that date in edit mode

### Desktop Grid

`Date | Weight | Sleep | Battery | Steps | Burn | Food Cal | [custom metrics…]`

- Note indicator: fields with a note show a small icon; hovering reveals the note in a tooltip
- Columns scroll horizontally when many custom metrics are present

### Mobile Layout

One card per date. Standard metrics on top lines, then all custom metrics below:

```
5/7/26 (Wed)
Wt: 214.5  Sleep: 82  Bat: 74  Steps: 8,234
Burn: 2,450  Food: 1,800
Stand: Y  Drinking: —  Eat<7: Y  Device: Y  Alc: 150
```

- Boolean: label + Y or blank/dash for no
- Number: label + value (+ unit if defined)
- Text: label + truncated value
- Note icon inline when a note exists; **tapping shows a small in-page overlay** with the note text and a close button (tap outside or close button to dismiss)

---

## New / Edit Daily Metric Screen (`#exercise-metric/new` or `#exercise-metric/2026-05-07`)

- Route uses the date as identifier: `#exercise-metric/2026-05-07`
- New mode defaults to today's date (user can change it)
- On date change: silently check Firestore — if a record exists for that date, pre-fill and switch to edit mode automatically
- Date is the only required field; everything else is optional

### Form Sections

**Body**
- Weight (decimal)
- Sleep Score (integer)
- Body Battery (integer)

**Activity**
- Daily Steps (integer)
- Total Actual Burn (integer) — helper text: "From watch — usually entered the following day"
- Food Calories (integer)

**Habits & Custom** *(all user-defined metrics in sort order)*
- Boolean: checkbox — checked = yes
- Number: text input (integer or decimal per allowDecimal)
- Text: single-line input

### Per-Metric Notes
- Each field (standard and custom) has a small note icon button beside it
- Tapping/clicking toggles a text input open/closed
- If a note already exists, the icon appears highlighted and the input pre-fills
- Notes stored in the `notes` map, keyed by standard field name or metricDefId

### Save / Delete
- **Save**: writes or overwrites the doc for that date → returns to list
- **Delete** (edit mode only): confirmation → deletes doc → returns to list

---

## Manage Metrics Screen (`#exercise-metric-defs`)

- Linked from the Daily Metrics list header
- Lists all non-archived custom metrics in sort order
- Each row: name, type badge, unit label (if set), up/down sort arrows
- **Add** button: name (required), type (required), allow-decimal (numbers only), unit label (optional)
- **Edit**: rename, change unit label, change allow-decimal
- **Delete**: soft-delete (archived = true) — removed from entry form, history preserved

---

## Data Model

**`exerciseDailyMetrics`** (per-user via `userCol()`)

| Field | Type | Notes |
|---|---|---|
| date | string | YYYY-MM-DD — primary lookup key |
| weight | number or null | |
| sleepScore | number or null | |
| bodyBattery | number or null | |
| dailySteps | number or null | |
| totalBurn | number or null | |
| foodCalories | number or null | |
| customValues | object | `{ metricDefId: value }` — value is boolean, number, or string |
| notes | object | `{ fieldKey: "note text" }` — fieldKey is a standard field name or a metricDefId |
| createdAt | timestamp | |
| updatedAt | timestamp | |

**`exerciseMetricDefs`** (per-user via `userCol()`)

| Field | Type | Notes |
|---|---|---|
| name | string | User-defined label |
| type | string | "boolean", "number", or "text" |
| allowDecimal | boolean | Numbers only |
| unitLabel | string | Optional display suffix |
| sortOrder | number | Ascending display order |
| archived | boolean | Soft-delete |
| createdAt | timestamp | |

---

## Seeding

On first visit to `#exercise-metrics`, if `exerciseMetricDefs` is empty, seed these examples. The user can rename or delete all of them freely — they are not built-ins.

| Name | Type |
|---|---|
| Stand 1 Hour | boolean |
| Drinking | boolean |
| Eat Before 7 | boolean |
| Device Off by 10pm | boolean |
| Alcohol Calories | number |

---

## Suggestions / Future Parking Lot
---

## Implementation

### Architecture Notes

**Date as Firestore doc ID**: `exerciseDailyMetrics` docs use the date string (`YYYY-MM-DD`) as the Firestore document ID rather than an auto-generated ID. This means one doc per date by construction (no duplicates possible), and lookups are a direct `.doc(date).get()` — no query needed, no index required.

**File**: All Daily Metrics code lives in the existing `js/exercise.js`. The feature is large but self-contained within that file. Module-level state variables are prefixed `_dm` to distinguish from exercise activities (`_ex`).

**Routing pattern** (follows existing exercise routes):
- `exercise-metrics` and `exercise-metric-defs` → added to `TOP_LEVEL_PAGES` and `LIFE_PAGES`
- `exercise-metric` (entry form) → added to `ALL_PAGES` and `LIFE_PAGES` only (same pattern as `exercise-activity`)

---

### Phase 1 — Foundation: Hub Card, Routes, Page Shells, Backup

**Goal**: Plumb everything in. Navigation works. No data screens yet.

**Files**: `index.html`, `js/app.js`, `js/exercise.js`, `js/settings.js`, `css/styles.css`, `sw.js`

**Steps:**

1. **Hub card** — in `loadExercisePage()` in `exercise.js`, add a fourth card "Daily Metrics" linking to `#exercise-metrics`, alongside Activities/Goals/Summary.

2. **Page shells** — add three new `<div>` sections to `index.html` (after the existing exercise sections):
   ```html
   <div id="page-exercise-metrics"     class="page hidden"></div>
   <div id="page-exercise-metric"      class="page hidden"></div>
   <div id="page-exercise-metric-defs" class="page hidden"></div>
   ```

3. **app.js arrays**:
   - `TOP_LEVEL_PAGES`: add `'exercise-metrics'`, `'exercise-metric-defs'`
   - `ALL_PAGES` non-top-level block: add `'exercise-metric'`
   - `LIFE_PAGES`: add all three (`'exercise-metrics'`, `'exercise-metric'`, `'exercise-metric-defs'`)

4. **app.js routes** — add three route handlers alongside the existing exercise routes:
   ```javascript
   } else if (page === 'exercise-metrics') {
       showPage('exercise-metrics');
       loadExerciseMetricsPage();
   } else if (page === 'exercise-metric' && id) {
       showPage('exercise-metric');
       loadExerciseMetricPage(id);
   } else if (page === 'exercise-metric-defs') {
       showPage('exercise-metric-defs');
       loadExerciseMetricDefsPage();
   ```

5. **exercise.js stubs** — add three stub load functions (each sets the correct breadcrumb and shows a "Loading…" placeholder):
   - `loadExerciseMetricsPage()` — breadcrumb: Life › Exercise › Daily Metrics
   - `loadExerciseMetricPage(dateOrNew)` — breadcrumb: Life › Exercise › Daily Metrics › New Entry (or the date)
   - `loadExerciseMetricDefsPage()` — breadcrumb: Life › Exercise › Daily Metrics › Manage Metrics
   - Also add `seedExerciseMetricDefsIfNeeded()` function body (the logic runs in Phase 2; just declare it here)

6. **settings.js** — add `'exerciseDailyMetrics'` and `'exerciseMetricDefs'` to `BACKUP_DATA_COLLECTIONS`.

7. **Bump** `?v=N` on exercise.js, app.js, styles.css, and settings.js in index.html; bump `CACHE_NAME` in sw.js.

**Deliverable**: Exercise hub shows 4 cards. All 3 new routes navigate cleanly. Backup covers the new collections.

---

### Phase 2 — Manage Metrics Screen

**Goal**: Full CRUD for custom metric definitions. Seeds 5 examples on first visit.

**Files**: `js/exercise.js`, `css/styles.css`, bump versions

**Module-level state** (added at top of the _dm block in exercise.js):
```javascript
var _dmDefsAll = [];  // loaded metric defs for the manage screen
```

**Seed function** `seedExerciseMetricDefsIfNeeded()`:
- Query `exerciseMetricDefs` limit 1; if not empty, return
- Batch-write 5 default defs:
  `Stand 1 Hour (boolean)`, `Drinking (boolean)`, `Eat Before 7 (boolean)`, `Device Off by 10pm (boolean)`, `Alcohol Calories (number, allowDecimal: false)`
- Assign `sortOrder` 0–4, `archived: false`

**`loadExerciseMetricDefsPage()`** — full implementation:
1. Set breadcrumb: Life › Exercise › Daily Metrics › Manage Metrics
2. Call `seedExerciseMetricDefsIfNeeded()`
3. Load all non-archived docs from `exerciseMetricDefs` ordered by `sortOrder` asc
4. Store in `_dmDefsAll`; render via `_dmRenderDefsList()`

**`_dmRenderDefsList()`** builds the list HTML. Each row shows:
- Name, type badge (Boolean / Number / Text), unit label if set
- ↑ and ↓ arrow buttons (first item hides ↑; last item hides ↓)
- **Edit** button → shows inline rename/unit-label/allow-decimal inputs + Save/Cancel
- **Delete** button → confirm → `archived = true` → re-render

**Add metric flow**:
- "Add Metric" button at top renders a small inline form: Name (required), Type dropdown (Boolean / Number / Text), Allow Decimal checkbox (visible when type = Number), Unit Label input (optional for Number)
- On save: assign `sortOrder = max(existing sortOrders) + 1`, write to Firestore, append to `_dmDefsAll`, re-render

**Edit flow**:
- Clicking Edit on a row replaces the row HTML with an inline form pre-filled: Name, Unit Label, Allow Decimal — **type cannot be changed after creation** (changing type would break how existing historical values are interpreted)
- Save → update Firestore doc → update local array → re-render

**Sort order (↑/↓)**:
- ↑ swaps `sortOrder` values between the clicked item and its predecessor in the array
- ↓ swaps with its successor
- Batch-write both affected docs → update `_dmDefsAll` → re-render

**CSS**: manage-metrics list, type badges (color-coded: boolean = blue, number = green, text = gray), inline edit form, add form.

**Deliverable**: User can fully manage custom metrics. Seeds on first visit.

---

### Phase 3 — Daily Metrics List

**Goal**: The list screen — filter, "N records" label, summary row, desktop grid, mobile cards, note display. Read-only for now (clicking a row will route to the entry form, which isn't built yet).

**Files**: `js/exercise.js`, `css/styles.css`, bump versions

**Module-level state**:
```javascript
var _dmMetricDefs  = [];   // non-archived defs, sorted — used by list and entry form
var _dmRangeFilter = 'thisMonth';   // never persisted; always reset on page load
var _dmCustomStart = '';
var _dmCustomEnd   = '';
```

**`loadExerciseMetricsPage()`** — full implementation:
1. Set breadcrumb, reset `_dmRangeFilter = 'thisMonth'`
2. Call `seedExerciseMetricDefsIfNeeded()`
3. Load `_dmMetricDefs` from Firestore (non-archived, sort by sortOrder)
4. Build page HTML, wire filter events, call `_dmApplyFilter()`

**Filter UI** (built as a toolbar block):

*Dynamic group* — 6 pill/button options:
`Last Week | This Week | This Month | Last Month | This Year | Last Year`

*Month shortcuts* — a 3×4 grid of buttons (Jan–Dec):
```
Jan  Feb  Mar
Apr  May  Jun
Jul  Aug  Sep
Oct  Nov  Dec
```
- Compute for each: if `monthIndex + 1 > currentMonth` → last year, else → this year
- Last-year buttons show `"Aug '25"` (abbreviated year tag); current-year buttons show `"Aug"` only
- Selected button is highlighted

**`_dmGetDateRange(filter)`** — computes `{ start, end }` as YYYY-MM-DD strings:
- `lastWeek`: Mon–Sun of last calendar week
- `thisWeek`: Mon–today of current calendar week
- `thisMonth`: 1st of current month → today
- `lastMonth`: 1st–last day of previous month
- `thisYear`: Jan 1 – today
- `lastYear`: Jan 1 – Dec 31 of previous year
- Month shortcut (`'month-3-2025'` style key): 1st–last day of that month/year

**`_dmApplyFilter()`**:
1. Show loading state
2. Query `exerciseDailyMetrics` ordered by date desc, limit 500
3. Filter client-side to date range
4. Update **"N records"** label (e.g., "14 records") in toolbar
5. Compute summary row values:
   - Standard fields: for each, collect non-null values → `sum / count` (round appropriately); if no values, show `—`
   - Custom boolean: `count(customValues[id] === true)` → `"X / N"`
   - Custom number: `sum(non-null customValues[id])` → formatted total
   - Custom text: `''`
6. Render desktop `<table>` and mobile cards

**Desktop table structure**:
```
<thead>
  <tr class="dm-summary-row">  ← tinted background, bold
    <td></td>  ← Date column blank
    <td>avg weight</td>
    <td>avg sleep</td>
    ... one td per column
  </tr>
  <tr class="dm-header-row">
    <th>Date</th><th>Weight</th>...
  </tr>
</thead>
<tbody>
  <tr class="dm-data-row"> ... </tr>
</tbody>
```
- Note indicator: if `record.notes[fieldKey]` has text, append a small `<span class="dm-note-icon" title="the note text">📝</span>` — the `title` attribute provides the hover tooltip for free
- Clicking any `<tr>` navigates to `#exercise-metric/` + record.date

**Mobile cards** — one card per record:
- Line 1: formatted date ("5/7/26 Wed")
- Lines 2–3: standard metrics, abbreviated labels, values or `—`
- Line 4+: all custom metrics — boolean: `Y` or `—`; number: value + unit; text: truncated
- Note icon: if note exists, a small `📝` rendered inline; **tap triggers a small absolute-positioned overlay div** that appears near the icon, shows the note text, has a close ✕ button. Tapping outside the overlay (document click listener with stopPropagation on the overlay) also closes it.
- Card click (outside of note icon) navigates to `#exercise-metric/` + record.date

**CSS**: table styles, summary row tint, sticky header option, month shortcuts grid, note icon, note overlay (absolute positioned, z-index, shadow), mobile card layout.

**Deliverable**: List screen fully functional — filter, aggregates, desktop grid, mobile cards, note display.

---

### Phase 4 — New / Edit Daily Metric Entry Form

**Goal**: Full CRUD for daily metric records. The final phase — feature complete after this.

**Files**: `js/exercise.js`, `css/styles.css`, bump versions

**Module-level state**:
```javascript
var _dmEditDate    = null;  // null = new, 'YYYY-MM-DD' = edit
var _dmExistingDoc = null;  // loaded doc data or null
```

**`loadExerciseMetricPage(dateOrNew)`**:
1. Set breadcrumb: Life › Exercise › Daily Metrics › [New Entry | date]
2. Load `_dmMetricDefs` fresh (non-archived, sorted)
3. If `dateOrNew === 'new'`: `_dmEditDate = null`, `_dmExistingDoc = null`
4. Else: `_dmEditDate = dateOrNew`, fetch `userCol('exerciseDailyMetrics').doc(dateOrNew).get()`, store result in `_dmExistingDoc`
5. Call `_dmBuildEntryForm()`

**`_dmBuildEntryForm()`** renders:

*Date field* at the top:
- Defaults to today (new) or `_dmEditDate` (edit)
- On change: fetch `userCol('exerciseDailyMetrics').doc(newDate).get()` — if doc exists, call `_dmBuildEntryForm()` again with that doc's data pre-filled (effectively switches to edit mode for that date); if not, clear the form

*Form sections*:

| Section | Fields |
|---|---|
| Body | Weight (decimal text), Sleep Score (integer), Body Battery (integer) |
| Activity | Daily Steps (integer), Total Actual Burn (integer, helper text: "From watch — usually entered the following day"), Food Calories (integer) |
| Habits & Custom | All `_dmMetricDefs` in sort order |

Custom field rendering per type:
- `boolean` → `<input type="checkbox">` — checked = yes
- `number` → `<input type="text" inputmode="decimal">` + unit label span if defined
- `text` → `<input type="text">`

*Per-metric note toggle* (each standard field and each custom metric):
- A small 📝 button sits to the right of the value input
- Click toggles a `<textarea rows="2">` open (slide-in or simple show/hidden)
- If `_dmExistingDoc.notes[key]` has content: button is highlighted, textarea pre-fills
- Note text is read back from the textarea at save time

*Action buttons*: Save (primary) | Cancel → `#exercise-metrics` | Delete (danger, edit mode only)

**`_dmSaveMetric()`**:
1. Read date field → determine doc ID
2. Collect standard field values (null if blank)
3. Collect `customValues`: iterate `_dmMetricDefs`, read each field's input → coerce to boolean/number/string, null if blank
4. Collect `notes`: iterate all note textareas, include only non-empty strings
5. Build doc: `{ date, weight, sleepScore, bodyBattery, dailySteps, totalBurn, foodCalories, customValues, notes, updatedAt: serverTimestamp() }`
6. New mode adds `createdAt: serverTimestamp()`
7. `userCol('exerciseDailyMetrics').doc(date).set(data)` — full overwrite (date-as-ID means set is always safe)
8. Navigate to `#exercise-metrics`

**`_dmDeleteMetric()`**:
- Confirm dialog
- `userCol('exerciseDailyMetrics').doc(_dmEditDate).delete()`
- Navigate to `#exercise-metrics`

**CSS**: form section headers (same style as exercise form), note toggle textarea animation, checkbox label styling for boolean metrics.

**Deliverable**: Full CRUD for daily records. Daily Metrics feature complete.

---

### Phase Summary

| Phase | What it builds | Deliverable |
|---|---|---|
| 1 | Hub card, routes, page shells, backup | Navigation works end-to-end |
| 2 | Manage Metrics CRUD | User can create/edit/sort/delete custom metric definitions |
| 3 | List screen — filter, summary row, grid, cards, notes | Browse and filter all historical data |
| 4 | Entry form — all metric types, notes, save/delete | Full data entry and edit; feature complete |

Confirm phases one at a time before moving to the next.

- **Streak counter**: boolean + daily-record structure is ideal for "Stand 1 Hour: 7 days in a row". Easy to add later — park in FutureEnhancements.
- **CSV export**: structured daily data + date range = great for spreadsheet export. Park in FutureEnhancements.
- **Mobile summary strip**: if the standard-metric averages strip above mobile cards proves valuable, adding custom metric summaries there is a small addition. Revisit after seeing real usage.