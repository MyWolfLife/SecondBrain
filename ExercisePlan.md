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
2. Browser redirects to `https://www.strava.com/oauth/authorize?client_id=...&redirect_uri=https://dolphinstevekasputis.github.io/BishopHome/&scope=activity:read_all`
3. User approves in Strava
4. Strava redirects back to `https://dolphinstevekasputis.github.io/BishopHome/?code=abc123`
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
