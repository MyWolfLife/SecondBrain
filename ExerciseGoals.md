# Exercise Goals Feature Plan

## Status: Design Discussion — Feature Complete, Ready for Development Planning

---

## Context

Goals is the second of three cards on the Exercise hub (alongside Activities and Daily Metrics). It currently shows "Coming soon." This document captures all design decisions for the Goals feature before coding begins.

The feature is modeled after the user's existing Google Spreadsheet yearly goals tracker.

---

## High-Level Purpose

This screen is **dual purpose**:
1. **Monthly goal planning** — set targets for exercise, weight loss, calories, steps, etc. per month for the year
2. **Color threshold definitions** — define the ranges that color-code the Daily Metrics screen. Thresholds are per-month because goals change throughout the year. Keeping thresholds alongside goal targets lets you coordinate them visually in one place.

---

## Routing & Navigation

- `#exercise-goals` — always auto-defaults to current year's goals screen
- `#exercise-goals/:year` — the year goals grid (e.g., `#exercise-goals/2026`)
- `#exercise-goals/:year/:month` — mobile single-month edit screen (e.g., `#exercise-goals/2026/3` for March)
- Entering `#exercise-goals` with no years created shows an **empty state** with an "Add Year" button — user must click to create their first year

---

## Year Management

- Year dropdown at top of screen — always defaults to current year on every visit
- Dropdown lists all created years + **"Add New Year"** at the bottom
- "Add New Year" opens a popup defaulting to next year — user can confirm or override
- After creating, navigates into that year's goals grid
- **Years cannot be deleted** once created

---

## Screen Layout

### Desktop
- Full inline grid — every data-entry cell is a live `<input>`, full year visible and editable at once
- **Save on blur** — each cell saves to Firestore when the user tabs/clicks away (auto-save, no Save button)
- Calculated cells are display-only (not inputs) and update reactively when their dependencies change
- **Month column and header row are frozen** — horizontal and vertical scrolling keeps them on screen at all times
- Grid scrolls horizontally to accommodate all columns

### Mobile
- Read-only summary rows — each row shows: **Goal Weight, Avg Miles/Day, individual session count per tracked exercise** (e.g., "Weights: 12, Bike: 12, Row: 4") and an **Edit Month** button. If too many tracked exercises to display cleanly, collapse to a total (e.g., "28 sessions")
- "Edit Month" navigates to `#exercise-goals/:year/:month` — a standard vertical form with all fields for that month
- **January has no "Copy Previous" button** — hidden for Jan only; all other months show it

---

## Column Display Order (Left to Right)

1. **Month** *(frozen)*
2. **Weight Inputs** — Goal Weight, Weight Loss (calc), Daily Cal Loss Needed (calc)
3. **Exercise Goals** — Avg Miles/Day, then tracked exercise session counts (user-ordered)
4. **Estimated Burns & Weight Projection** — Daily Burn Miles (calc), Daily Burn Extra (calc), Total ExBurn (calc), Est Weight Loss (calc), Est Weight End of Month (calc)
5. **Food Thresholds** — foodYellow1, foodYellow2, foodBad
6. **Remaining Thresholds** — Battery, Steps, Actual Burn, Exercise, Calorie Loss, Miles (in that order)

---

## Year-Level Constants (Entered Once, Displayed Above Grid)

| Field | Description |
|---|---|
| Starting Weight | Baseline weight at start of year — drives Jan's weight loss calculation and defaults all month goal weights on creation |
| Base Daily Burn | Baseline calories burned per day without exercise (e.g., 2200) |
| Calories Per Mile | Calories burned per mile of running/walking (e.g., 110) |
| Avg Cal/Session | Per tracked exercise — entered when adding a tracked exercise to goals; displayed above that exercise's column |

---

## Monthly Goal Weight — Blank/Default Behavior

- When a year is created, all 12 months start as **blank (null)** — no values set yet
- When Starting Weight is entered, it cascades to all 12 blank months
- When a month's goal weight is entered or changed, it cascades forward **only to months that are still blank (null)** — it stops at any month that already has an explicit value
- Once a month has been explicitly set by the user, it **retains that value** until the user manually changes it — it is never overridden by a cascade
- At calculation time, if a month is null, it uses the most recent non-null value above it (or Starting Weight if all above are null)
- This means a user starting mid-year (e.g., April) can leave Jan–Mar blank — calculations use Starting Weight as the fallback

---

## Tracked Exercises

- User-defined subset of existing `exerciseTypes` — not every exercise type needs to appear in goals
- Added from a column management control (not per-month)
- **Add flow**: pick from `exerciseTypes` → if type doesn't exist, add inline (creates in `exerciseTypes` too) → enter avg cal/session → column appears
- **Reorderable** — user controls column order (most important first)
- Session count per month = whole number, no decimals
- Cal/session is per-year (stored on goal year), not global

---

## Calculated Fields

All calculated fields update reactively when inputs change. Never stored in Firestore — computed at render time.

| Field | Formula |
|---|---|
| Weight Loss | `Goal Weight this month − Goal Weight previous month` (Jan: vs Starting Weight). Positive = gain, negative = loss |
| Daily Cal Loss Needed | `abs(Weight Loss) × 3500 ÷ Days in Month` |
| Daily Burn Miles | `Avg Miles/Day × Cal/Mile` |
| Daily Burn Extra | `Σ(Sessions × Cal/Session for each tracked exercise) ÷ Days in Month` |
| Total Daily Exercise Burn | `Daily Burn Miles + Daily Burn Extra` |
| Est Weight Loss (col I) | `((BaseBurn + TotalExerciseBurn) − ((foodYellow1 + foodYellow2) / 2)) × DaysInMonth / 3500` → rounded to whole number |
| Est Weight End of Month (col J) | `Previous month's J − Est Weight Loss` (Jan: Starting Weight − Est Weight Loss) → rounded to whole number |

**Days in month:** Jan=31, Feb=28/29 (leap year aware), Mar=31, Apr=30, May=31, Jun=30, Jul=31, Aug=31, Sep=30, Oct=31, Nov=30, Dec=31

**Weight Loss display:** positive = weight lost (e.g., 7), negative = weight gained (e.g., −3)

---

## Calculated Field Colors

| Field | Color Rule |
|---|---|
| Est Weight Loss (col I) | Yellow background if negative (plan predicts weight gain) |
| Est Weight End of Month (col J) | Yellow background if J > Goal Weight (plan falls short of goal) |

---

## Color Threshold System

Thresholds are entered **per month** in the goals grid. They drive **background colors on the Daily Metrics list screen** when viewing that month's records. Text always remains black.

The Daily Metrics screen looks up the current month's thresholds from the goals data for that year. If no goals exist for the year, no colors are shown.

Miles and Exercise thresholds are captured here for future use — their display location on Daily Metrics is **deferred**.

### Color Scale

| Color | CSS |
|---|---|
| Yellow | standard yellow |
| *(no color)* | transparent/white |
| Green | standard green |
| Blue | standard blue |
| Light Yellow 3 | `#fff2cc` (food "bad day" only) |

### Threshold Definitions Per Metric

#### Miles (display location deferred)
- `< milesYellow` → Yellow
- `milesYellow ≤ x < milesGreen` → No color
- `milesGreen ≤ x < milesBlue` → Green
- `>= milesBlue` → Blue

#### Battery (Daily Metrics list screen)
- `<= batteryYellow` → Yellow
- `batteryYellow < x < batteryBlue` → No color
- `>= batteryBlue` → Blue

#### Steps (Daily Metrics list screen)
- `< stepsYellow` → Yellow
- `stepsYellow ≤ x < stepsGreen` → No color
- `stepsGreen ≤ x < stepsBlue` → Green
- `>= stepsBlue` → Blue

#### Actual Burn (Daily Metrics list screen)
- `< burnGreen` → No color
- `burnGreen ≤ x < burnBlue` → Green
- `>= burnBlue` → Blue

#### Exercise Calorie Burn (display location deferred)
- Total from ALL logged exercise events for the day (running + all exercise types, including non-goal types like Golf). Does NOT include base body burn. Sourced from activity logs at display time.
- `< exerciseYellow` → Yellow
- `exerciseYellow ≤ x < exerciseBlue` → No color
- `>= exerciseBlue` → Blue

#### Calorie Loss (Daily Metrics list screen)
- Calorie Loss = Actual Burn − Food Calories (calculated from existing Daily Metrics fields at render time)
- `<= calLossYellow` → Yellow
- `calLossYellow < x < calLossGreen` → No color
- `calLossGreen ≤ x < calLossBlue` → Green
- `>= calLossBlue` → Blue

#### Food (Daily Metrics list screen)
- Also drives Est Weight Loss formula: avg of foodYellow1 and foodYellow2 = estimated daily food intake
- `< foodYellow1` → Yellow (eating too little)
- `foodYellow1 ≤ x < foodYellow2` → No color (good range)
- `foodYellow2 ≤ x < foodBad` → Yellow (a little over)
- `>= foodBad` → Light Yellow 3 / `#fff2cc` (bad day — way over)

---

## Copy Previous Month

- Every month row (Feb–Dec) has a **"Copy Previous"** button
- Copies ALL values from the prior month: goal weight, miles, session counts, and all threshold fields
- January row has no Copy Previous button (hidden)

---

## Data Model (Firestore)

**`exerciseGoals`** (per-user via `userCol()`)

One document per year:

| Field | Type | Notes |
|---|---|---|
| year | number | e.g., 2026 |
| startingWeight | number | |
| baseDailyBurn | number | |
| calPerMile | number | |
| trackedExercises | array | `[{ typeId, typeName, calPerSession, sortOrder }]` |
| months | object | Keyed by month number 1–12. Each value is a month object (see below) |
| createdAt | timestamp | |
| updatedAt | timestamp | |

**Month object** (stored inside `months[1]` through `months[12]`):

| Field | Type | Notes |
|---|---|---|
| goalWeight | number or null | |
| avgMilesPerDay | number or null | |
| exerciseSessions | object | `{ typeId: count }` — session count per tracked exercise |
| foodYellow1 | number or null | |
| foodYellow2 | number or null | |
| foodBad | number or null | |
| batteryYellow | number or null | |
| batteryBlue | number or null | |
| stepsYellow | number or null | |
| stepsGreen | number or null | |
| stepsBlue | number or null | |
| burnGreen | number or null | |
| burnBlue | number or null | |
| exerciseYellow | number or null | |
| exerciseBlue | number or null | |
| calLossYellow | number or null | |
| calLossGreen | number or null | |
| calLossBlue | number or null | |
| milesYellow | number or null | |
| milesGreen | number or null | |
| milesBlue | number or null | |

**Storage note:** All 12 months stored in a single Firestore document as a nested `months` object. This avoids 12 separate reads and keeps the full year accessible in one fetch. With ~20 fields per month × 12 months + year-level fields, the document stays well within Firestore's 1MB document limit.

---

## Decisions Log

| Topic | Decision |
|---|---|
| Screen type | Yearly goals — one set per calendar year |
| Year selection | Dropdown at top of goals screen, always defaults to current year on every visit |
| First visit / empty state | Empty state with "Add Year" button — user must click |
| Add New Year | Popup defaulting to next year; user can confirm or override |
| Year deletion | Not allowed |
| Dual purpose | Goals + color thresholds on same screen — keeps coordination visual |
| Threshold scope | Per-month — targets change throughout the year |
| Desktop editing | Inline grid — full year editable at once |
| Save mechanism | Auto-save on blur (cell saves when user tabs/clicks away) |
| Mobile editing | Read-only summary (Goal Weight + Miles + Sessions) + "Edit Month" button → single-month form |
| Column freeze | Month column and header row frozen; grid scrolls horizontally |
| Column order | Weight inputs → Exercise goals → Projected burns/weight → Food thresholds → Remaining thresholds |
| Starting weight | Entered at year level; defaults all 12 months on creation |
| Blank month weight | Null in Firestore — inherits most recent non-null value above it (or Starting Weight) at render time |
| Weight cascade | Setting a value cascades forward only to months that are still null — stops at any month already explicitly set |
| Copy Previous Month | Copies entire row (all values + thresholds) — hidden for January |
| Cal/mile & cal/session scope | Per year |
| Session count | Whole number only |
| Tracked exercise order | User-controlled sort order |
| Calculated fields | Never stored — computed at render time |
| Weight Loss display | Positive = loss, negative = gain |
| Col I color | Yellow if negative |
| Col J color | Yellow if J > Goal Weight |
| Actuals vs goals | Out of scope — pure planning screen. Deferred to Summary screen (future). |
| Miles/Exercise threshold display | Captured in goals now; display location on Daily Metrics deferred |
| Calorie Loss on Daily Metrics | Calculated at render time: Actual Burn − Food Calories |
