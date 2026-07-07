# Maintenance Schedule Plan

## Status: DISCUSSION — core decisions made, Tags section still informal, not ready to code yet

---

## Problem Statement

The user has recurring "things to do" to physical things (plants, zones, house items, vehicles,
appliances) that need to be tracked on a frequency, surfaced on a calendar, and — critically —
tracked as **open items** that persist (with a status) until dealt with, rather than silently
becoming "just another day" once the due date passes.

### Example scenarios (from user)
1. Prune hedges every March — **fixed month(s)** schedule
2. Change hot tub water every 3 months — **reset-from-last-done** schedule
3. Change truck oil once a year — reset-from-last-done (or fixed month), TBD
4. Fertilize yard in May, July, Oct — **fixed months**, with a "too soon, skip the next one" rule
5. Change AC air filter every 6 months — reset-from-last-done

### Key behaviors requested
- See due maintenance items on a calendar
- A persistent **open items list** — things that are due/overdue don't disappear, they sit there
  with a status until resolved
- Statuses beyond just done/not-done: something like Completed / Skipped / In-Progress / (an
  "unnecessary" status for the fixed-months case below)
- **Reset-style frequency** (e.g. "every 3 months"): if done late, the *next* due date is
  `completion date + interval` — not locked to the original calendar slot. Nothing is scheduled
  next until the current one is actually completed.
- **Fixed-months frequency** (e.g. May/Jul/Oct): if you do it late enough that it bumps into the
  next scheduled month, that next occurrence should auto-flip to some "not needed" status instead
  of also showing as due.
- Each schedule is tied to a "thing" (zone, plant, room, vehicle, appliance, etc.) and to a defined
  **action** (what to do, what chemical/product if any) — reusing the existing Saved Actions concept.
- Completing an occurrence should log it as an **Activity** against that thing, same as today.

---

## What Already Exists (reuse, don't rebuild)

Investigated `calendar.js`, `activities.js`, and the functional spec. The app already has almost
all of the plumbing this feature needs:

- **`calendarEvents` collection** — `title`, `description`, `date`, `recurring{type, intervalDays}`,
  `targetType`/`targetId`, `zoneIds[]`, `savedActionId`, `completedDates[]`, `cancelledDates[]`,
  `completed`.
- **Entity linkage already works for every entity type.** Every detail page (zone, plant, vehicle,
  room, thing, etc.) already has a "Calendar Events" accordion filtered to that entity via
  `targetType`/`targetId` (`loadEventsForTarget()`). Nothing new needed here.
- **Saved Actions already model "the action."** `savedActions` = name, description, chemicalIds[],
  notes. This is exactly the "prune hedges" / "spray for weeds, chemical X" concept the user
  described. Reuse as-is — a maintenance schedule just references a `savedActionId`.
- **Recurring events already exist**, but only three types: `weekly` (+7 days), `monthly` (same
  day next month), `every_x_days` (fixed interval). All three compute future occurrences from a
  **fixed origin date**, ignoring whether/when you actually completed past ones. This does **not**
  match the "reset from last-done date" behavior the user wants — see Gap 1 below.
- **Complete → Activity already wired.** `completeOccurrence()` in `calendar.js` already creates an
  Activity on the linked entity when an occurrence is marked complete. Nothing new needed here.
- **Overdue section already exists** (`loadOverdueEvents()`) — past-due uncompleted occurrences
  surface at the top of the calendar page and on entity detail pages. This is close to the "open
  items" list the user wants, but it's not filterable to "maintenance schedules only," and it only
  has two states (done / not done) — no Skipped/In-Progress/Unnecessary.
- **Per-occurrence delete (`cancelledDates[]`) already exists**, but its meaning today is "remove
  this one occurrence from history," closer to a delete than a tracked status. Doesn't map cleanly
  onto "Skipped" or "Unnecessary" (which the user wants to remain visible/reportable, not vanish).

**Conclusion: extend `calendarEvents`, don't build a parallel system.** The entity-linking, action
system, activity logging, and calendar display all already work. What's missing is (1) two new
frequency types and (2) a richer status model per occurrence.

---

## Gap 1: Frequency types

Need two new `recurring.type` values, additive to the existing three (no changes to
weekly/monthly/every_x_days):

### `reset_interval` (hot tub, AC filter, oil change)
- Config: `{ type: 'reset_interval', intervalUnit: 'days'|'months', intervalValue: N }`
- Behavior: there is **only ever one active occurrence** — never a list of future dates.
  - If never completed: the single occurrence sits at the original due date, growing more overdue
    over time (matches "until I do it, there is no future timer set").
  - Once completed: next due date = `completion date + interval`. Recalculated fresh every time.
- This is a real behavioral difference from `every_x_days`, which keeps generating occurrences on
  a fixed cadence from the original date regardless of when you actually did the work. Needs its
  own branch in `generateOccurrences()`.
- **No "Skipped" status for this type — DECIDED.** Instead: **Postpone.** You pick a duration
  (quick-pick buttons like 1 week / 2 weeks / 1 month, or a custom date) and the reminder simply
  goes quiet until that date passes — no Activity logged, the real due date doesn't move. Once the
  postpone window elapses, it reverts to showing as due/overdue exactly as before, still waiting
  on an actual Completion to advance the clock. This matches "I'm not doing the hot tub now, but
  postpone it 3 weeks so no reminder" — a pure visibility snooze, not a resolution.
  - New field: `postponedUntil` (ISO date string). While in the future, the occurrence is
    suppressed from both the calendar's Overdue section and the new maintenance list (Gap 3).
    Nothing else about the schedule changes.

### `fixed_months` (hedge pruning, fertilizing)
- Config: `{ type: 'fixed_months', months: [3] }` or `[5, 7, 10]`, plus a day-of-month anchor
  (default 1st, or user-chosen).
- Behavior: one occurrence per configured month, every year, independent of each other — same
  general shape as today's recurring generator, just stepping through a specific month list
  instead of weekly/every-X-days.
- **The "too soon, skip the next one" rule — DECIDED: auto minimum-spacing.** One `minSpacingDays`
  value set per schedule (e.g. 45 days). When an occurrence is completed, check the next scheduled
  month's date; if it falls within `minSpacingDays` of the completion date, auto-flip it to
  **Unnecessary**. No manual per-month crossover-date picking required — one number covers the
  whole schedule.

---

## Gap 2: Occurrence status model

Today an occurrence is binary: in `completedDates[]` or not. `cancelledDates[]` exists but deletes
the occurrence rather than tracking it. The user wants an occurrence to carry a real status:

| Status | Meaning | Set by |
|--------|---------|--------|
| **Due / Overdue** | Not yet acted on (overdue = past due date) | Default; derived, not stored |
| **Completed** | Done — logs an Activity (existing behavior) | User action |
| **In Progress** | Started but not finished (e.g. multi-day pruning job) — carries a start date and a free-text note (e.g. "half the hedges done") | User action |
| **Skipped** *(fixed_months only)* | User deliberately chose not to do it this cycle. **DECIDED**: does NOT suppress the next scheduled occurrence — the next one comes due normally, same as if nothing happened. Not available on `reset_interval` schedules — see **Postpone** under Gap 1 instead | User action |
| **Unnecessary** *(fixed_months only)* | Auto-suppressed because a nearby occurrence already covered it (fixed-months spacing rule) | System, automatically |
| **Postponed** *(reset_interval only)* | Reminder temporarily muted until `postponedUntil`; not a resolution, reverts to due/overdue automatically once that date passes | User action |

Proposed schema: replace/extend the current two arrays with a single map on the event doc, where
each entry is an object (not just a status string) so In Progress can carry its extra fields:
```
occurrenceStatus: {
  "2026-05-01": { status: "completed" },
  "2026-07-01": { status: "unnecessary" },
  "2026-10-01": { status: "in_progress", startedAt: "2026-10-03", notes: "half the hedges done" }
}
```
Cleaner than juggling parallel arrays (`completedDates`, `skippedDates`, `inProgressDates`...) and
easier to query/report on. Existing simple recurring events (weekly/monthly/every_x_days) can keep
using `completedDates`/`cancelledDates` as-is — no migration required; the new status map only
applies to maintenance-schedule events. `reset_interval` schedules only ever have one live entry
in this map at a time (the current occurrence); `postponedUntil` lives as its own top-level field
since it's a visibility toggle, not a status.

Any status — including system-set ones like Unnecessary — can be manually overridden later (e.g.
change your mind and mark something Completed instead). No special confirmation needed for this;
it's just editing the map entry.

---

## Gap 3: "Open Maintenance Items" list

The existing Overdue section shows all overdue calendar events app-wide, mixed with regular
one-off events. The user wants a dedicated view scoped to maintenance schedules specifically,
where each open item shows its status and lets you change it inline (Complete / Skip / In
Progress) without digging into the entity page.

Proposal: no new flag needed — a maintenance schedule **is** simply a `calendarEvents` doc whose
`recurring.type` is `reset_interval` or `fixed_months`. A new page (e.g. `#maintenance`) filters
for those two types and lists occurrences with one-tap status buttons and a link to the linked
entity. The regular calendar view keeps showing these events too (same badge styling as today,
maybe a distinct icon), so nothing is hidden — this is an additional filtered view, not a
replacement.

**Default filter — DECIDED**: matches the "show resolved/completed" pattern already used on
Problems and Quick Task List. Default view shows only what still needs attention (Due, Overdue, In
Progress); a toggle reveals resolved items (Completed, Skipped, Unnecessary). Postponed items are
a special case — they're not "resolved," they're just not due yet, so they naturally drop out of
the default view on their own (same as any not-yet-due occurrence) without needing the toggle, and
reappear automatically once `postponedUntil` passes.

---

## Proposed Data Model Changes

`calendarEvents` — new/changed fields (all additive, existing events unaffected):

| Field | Type | Purpose |
|-------|------|---------|
| `recurring.type` | string | Add `'reset_interval'` and `'fixed_months'` as valid values. An event is treated as a "maintenance schedule" if `recurring.type` is one of these two — no separate flag needed |
| `recurring.intervalUnit` / `intervalValue` | string / number | For `reset_interval` |
| `recurring.months` / `dayOfMonth` | number[] / number | For `fixed_months` |
| `recurring.minSpacingDays` | number | For `fixed_months` — auto-Unnecessary rule (Gap 1) |
| `occurrenceStatus` | map of objects | Per-occurrence status (`completed`/`in_progress`/`skipped`/`unnecessary`), replacing `completedDates`/`cancelledDates` for maintenance events only. `in_progress` entries also carry `startedAt` + `notes` |
| `lastCompletedDate` | string (ISO) | For `reset_interval` — anchor for computing next due date |
| `postponedUntil` | string (ISO) or null | For `reset_interval` — while in the future, suppresses the occurrence from Overdue/maintenance-list views without changing the real due date |

No new collection. `savedActionId`, `targetType`/`targetId`, `zoneIds[]` all reused unchanged.

---

## Decisions Made

| Question | Decision |
|----------|----------|
| Fixed-months suppression rule | Auto minimum-spacing (`minSpacingDays` per schedule) — no manual per-month crossover dates |
| "In Progress" status | Flag + start date + free-text notes |
| Skipped vs. Unnecessary | Skipped does NOT suppress the next occurrence — it comes due normally |
| Oil change (once a year) | Not a system decision — both `reset_interval` and `fixed_months` will exist; user just picks whichever fits per schedule |
| New page vs. existing Overdue section | New dedicated `#maintenance` list view, so status buttons (Skip/In-Progress) don't clutter the Overdue section for plain one-off events. Revisit if it feels redundant once built |
| Skip for `reset_interval` schedules | No Skip status for this type — replaced by **Postpone** (custom snooze duration, reminder muted until a chosen date, real due date unchanged, no Activity logged) |
| Open items list default filter | Hide resolved (Completed/Skipped/Unnecessary) by default, toggle to reveal — matches Problems/Quick Task List convention |
| Tag deletion | Soft delete only — `active` flag (boolean) on the `tags` doc, set to false on "delete." Default views (picker + `#tags` browser) show active only; a toggle reveals archived tags. Items keep their `tagIds[]` references untouched either way |

---

## Tags — "Yard Plan" view + flexible multi-item projects

A second idea came up while discussing this: a managed **tag** system that solves two problems
at once — (1) viewing a scattered set of maintenance events as one yearly "Yard Plan" without
digging through every entity, and (2) letting a loose project (e.g. "build a putting green by the
office door") span a mix of dateless tasks and dated tasks without forcing everything onto one
entity.

### Why tags solve the "project" case too
A project like the putting green isn't really one thing — some items have no date (get quotes,
pick paver color) and some do (pour slab June 15, sod by July 1). The dateless items are exactly
what Quick Task List already handles well. The dated items need to be real calendar events so
they show up on the calendar and can be completed → logged as an Activity. Quick Task List can
only attach to one entity, so it can't hold both kinds of item together today. Tags fix this
without inventing a new "Project" entity type: tag the Quick Task card "Putting Green," tag each
relevant calendar event "Putting Green" too (each keeping its own real `targetType`/`targetId` or
none at all), and a tag view page shows the checklist + all tagged events together.

The "Yard Plan" yearly view is the same mechanism — tag every relevant maintenance/calendar event
"Yard Plan," and a `#tag/{id}` page becomes the yearly plan at a glance, reusing the calendar's
existing 1/3/6/12-month range picker.

### Decision: tags are a managed list, not free-text
Countless tags will accumulate over time, so this needs the same rigor as Chemicals (a real
managed list), but with a lower-friction creation flow than Chemicals has today — no separate
trip to a management page required before you can use a new tag.

- **New Firestore collection: `tags`** — `{ name, active (bool, default true), createdAt }`.
- **Storage on items**: `tagIds[]` (array of tag doc IDs) on both `calendarEvents` and `projects`
  — same shape as `chemicalIds[]`. IDs (not raw strings) mean a rename only touches the one `tags`
  doc, not every event/project that references it.
- **Picker UI**: same pattern as the existing chemical picker (checkbox list built from
  `getAllTags()`, active tags only), but with one addition — an inline **"+ Add new tag"** row at
  the top: type a name, it's created in `tags` immediately and checked in the list right away. No
  detour to a separate page. This is the one meaningful UX improvement over the Chemicals flow,
  matching what you asked for: pick from the dropdown, or add a new one that future choosers will
  then include.
- **Tag management page** (`#tags`): rename/archive/cleanup and browse what exists. Rename updates
  the one `tags` doc (all references stay valid via `tagIds[]`). **Delete is a soft
  delete — DECIDED**: sets `active: false` rather than removing the doc. Default view shows active
  tags only, with a toggle to reveal archived ones (same "show archived" convention Checklists
  already uses). Archiving does **not** touch any item's `tagIds[]` — an already-tagged event still
  shows and resolves the tag's name normally; archiving only removes it from the picker for
  *future* selection. Un-archiving is just flipping the flag back.
- **Tag view page** (`#tag/{id}`): shows the tagged Quick Task project cards, plus all tagged
  calendar events/occurrences (one-time, recurring, and maintenance schedules alike — since
  maintenance schedules are just `calendarEvents` docs, tagging them costs nothing extra),
  reusing the calendar's month-range picker.
- **Tag browser** (`#tags` list view): all tags with usage counts, links into each `#tag/{id}`.

This is broader than just the maintenance-schedule feature (it touches Quick Task List too), so
it may end up worth splitting into its own plan doc once the design settles — noting that here so
it isn't lost, but not doing the split yet while this is still in discussion.

---

## Non-Goals / Keeping This Simple

- No changes to plain one-time or weekly/monthly/every_x_days events — fully additive.
- No new Firestore collection for the maintenance-schedule feature itself (Tags does add one —
  see below).
- No changes to how photos/facts/problems/projects attach to entities.
- **Vehicles confirmed built** — `js/vehicles.js` exists (693 lines), `#vehicles`/`#vehicle/:id`
  routes are wired up in `index.html` and `app.js`. The truck oil-change example works end-to-end
  today; `AllPlans.md` listing `Vehicles.md` as "planned" is stale and can be corrected separately.

---

## Implementation Phases

**Status: READY TO CODE.**

### Sequencing rationale
Maintenance Schedule phases (MS-1 → MS-5) come first — it's the original problem and the more
foundational piece. Tags (TAG-1 → TAG-4) comes after, both because it's the smaller/newer idea and
because the Tags payoff (the "Yard Plan" aggregate view) is far more convincing to test against
real maintenance-schedule data than empty/synthetic events. Within Maintenance Schedule, the two
new frequency types are built before any status-model or list-view work, since everything after
that (statuses, the open-items list) needs both types already generating correct occurrences to
act on. `reset_interval` is built before `fixed_months` because it's the simpler of the two (one
active occurrence, no month list, no spacing math) — a cleaner first pass at the new
`generateOccurrences()` branch before the more complex type is added.

Each phase below is additive and independently committable. Per the project's standing rules,
every phase that touches JS/HTML/CSS updates `MyLife-Functional-Spec.md` and (where relevant)
`AppHelp.md` in the *same* commit, bumps `CACHE_NAME` in `sw.js`, and is committed + pushed when
done (with the pre-push ntfy notification) — this isn't called out per phase below since it
applies uniformly to all of them.

---

### MS-1: `reset_interval` frequency type ✅ COMPLETE

**Goal**: The simpler of the two new schedule types works end-to-end — create it, see it on the
calendar, see the correct single due date.

- Add `reset_interval` branch to `generateOccurrences()`/`advanceRecurringDate()` in `calendar.js`:
  only ever one active occurrence, computed from `lastCompletedDate` (or the original date if
  never completed) + `intervalValue`/`intervalUnit`.
- Add `intervalUnit`/`intervalValue` fields to the Add/Edit Event modal, shown when frequency type
  = "Reset Interval." Reuses the existing recurring-options UI area, adding a new option to the
  frequency dropdown alongside weekly/monthly/every_x_days/fixed_months.
- Calendar badge for this type (e.g. "Every 3 months, resets on completion").
- **No status-model changes yet** — Complete still works exactly as it does today for this phase
  (existing `completedDates[]`/`completeOccurrence()` flow); the new `occurrenceStatus` map and
  In-Progress/Postpone actions come in MS-3/MS-4.

**Test plan**: Create a hot-tub "change water" schedule (reset_interval, 3 months) on a zone or a
house entity. Verify it shows as due once on the calendar. Complete it once via the existing
Complete button; verify the *next* occurrence appears at completion date + 3 months, and that only
one occurrence ever shows regardless of calendar range (1/3/6/12 months). Verify a never-completed
schedule just grows more overdue and never spawns a second occurrence.

---

### MS-2: `fixed_months` frequency type ✅ COMPLETE

**Goal**: The annual-months schedule type works end-to-end, independent of the spacing/suppression
rule (that comes in MS-4, since it's triggered by completion behavior, not by scheduling alone).

- Add `fixed_months` branch to `generateOccurrences()`: one occurrence per configured month/year,
  each independent, using `months[]` + `dayOfMonth`.
- Add month multi-select, day-of-month, and `minSpacingDays` fields to the Add/Edit Event modal
  (the field is captured now; the behavior it drives is wired up in MS-4).
- Calendar badge for this type (e.g. "May, Jul, Oct").

**Test plan**: Create a "fertilize yard" schedule (fixed_months: May/Jul/Oct) tied to a zone. View
the calendar at 12-month range and confirm exactly three occurrences appear at the right dates,
each independently completable via the existing Complete button, with no interaction between them
yet (minSpacingDays not wired up until MS-4).

---

### MS-3: Complete + In-Progress statuses
**Goal**: Introduce the real `occurrenceStatus` map and the first new status beyond Completed.

- Introduce `occurrenceStatus` map on maintenance-type events (replacing `completedDates` /
  `cancelledDates` for these two types only; other recurring types untouched).
- Migrate Complete behavior for `reset_interval`/`fixed_months` occurrences onto the new map
  (`{status: 'completed'}`), still creating an Activity on the linked entity exactly as today.
- Add **In Progress** action: button on the occurrence card opens a small modal (start date,
  defaulting to today; free-text notes). Stores `{status: 'in_progress', startedAt, notes}`.
  In-Progress occurrences show a distinct badge/style on the calendar and stay in the "open" bucket
  (not resolved).
- Status is editable after the fact (e.g. change In Progress → Completed later).

**Test plan**: On both the hot tub and fertilizing schedules from MS-1/MS-2: mark an occurrence In
Progress with a note, confirm it displays correctly and persists on reload; then mark it Completed
and confirm an Activity is logged on the linked entity as before. Confirm editing a status after
the fact works (e.g. re-open In Progress back to due, or straight to Completed).

---

### MS-4: Skip + Postpone + auto-Unnecessary
**Goal**: The two type-specific "close this cycle without doing the work" actions, plus the
automatic suppression rule for fixed-months.

- **Skip** (`fixed_months` only): button sets `{status: 'skipped'}` on that occurrence. No Activity
  logged. Does not affect the next scheduled occurrence — it comes due normally (per earlier
  decision).
- **Postpone** (`reset_interval` only): button opens a small duration picker (1 week / 2 weeks /
  1 month quick-picks, or a custom date). Sets `postponedUntil` on the event. While in the future,
  the occurrence is suppressed from the Overdue section and (once built) the maintenance list —
  the real due date is untouched, and it reverts to showing as due/overdue automatically once
  `postponedUntil` passes.
- **Auto-Unnecessary** (`fixed_months` only): on Complete, check the next scheduled month's date
  against `minSpacingDays`; if within that window, auto-set `{status: 'unnecessary'}` on that next
  occurrence (system-set, not user-initiated). Still manually overridable afterward.

**Test plan**: On the fertilizing (May/Jul/Oct) schedule: complete May on time, confirm Jul is
unaffected. Then simulate completing May late enough to fall within `minSpacingDays` of Jul (e.g.
set `minSpacingDays` to 60 and complete in early June) and confirm Jul auto-flips to Unnecessary.
Separately, Skip the Oct occurrence and confirm no downstream effect. On the hot tub schedule:
Postpone for 2 weeks, confirm it disappears from Overdue immediately and reappears automatically
once the postponed date passes (can fast-forward by editing `postponedUntil` directly via
`preview_eval` for test purposes).

---

### MS-5: "Open Maintenance Items" list (`#maintenance`)
**Goal**: The dedicated cross-entity view tying the whole feature together.

- New route `#maintenance`. Query all `calendarEvents` where `recurring.type` is `reset_interval`
  or `fixed_months`, across all entities.
- List open occurrences (Due, Overdue, In Progress) with inline one-tap status actions (Complete /
  In Progress / Skip or Postpone as applicable) and a link to the linked entity.
- Default view hides resolved occurrences (Completed, Skipped, Unnecessary); toggle reveals them,
  matching the Problems/Quick Task List convention. Postponed items simply aren't due yet, so they
  drop out on their own without needing the toggle.

**Test plan**: With the hot tub, fertilizing, and any other test schedules from prior phases in
place: open `#maintenance`, confirm only open/overdue/in-progress items show by default, confirm
the toggle reveals Completed/Skipped/Unnecessary ones, confirm status actions taken from this page
match what shows on the calendar and entity detail pages (single source of truth, no divergence).

---

### TAG-1: Tags data model + management page (`#tags`)
**Goal**: The managed tag list exists and is fully CRUD-able, independent of anything that will
reference it yet.

- New `tags` collection: `{ name, active (bool, default true), createdAt }`.
- New `#tags` management page: add tag, rename tag, archive/un-archive (soft delete via `active`
  flag), default view shows active only with a toggle for archived — mirrors the Checklists "show
  archived" convention.

**Test plan**: Add a few tags ("Yard Plan," "Fertilizing," "Putting Green"). Rename one, confirm
it updates. Archive one, confirm it disappears from the default list and reappears with the
archived toggle. Un-archive it, confirm it's back to active.

---

### TAG-2: Tag picker on Calendar Events
**Goal**: Any calendar event (including maintenance schedules) can be tagged.

- Add `tagIds[]` to `calendarEvents`.
- Build the tag picker: checkbox list of active tags (mirrors `buildChemicalCheckboxList`) plus an
  inline "+ Add new tag" row that creates the tag immediately and checks it.
- Wire into the Add/Edit Event modal; show selected tags as chips on event cards (same visual
  pattern as chemical tags).

**Test plan**: Tag the hot tub and fertilizing schedules "Yard Plan," tag fertilizing additionally
with "Fertilizing." Confirm chips display correctly on the calendar cards and persist on reload.
Use the inline add-new row to create a brand-new tag from within the picker and confirm it's
immediately usable.

---

### TAG-3: Tag picker on Quick Task List
**Goal**: Quick Task List projects can be tagged, enabling the mixed dated/dateless project case
(e.g. the putting green build).

- Add `tagIds[]` to `projects`.
- Reuse the same tag picker component built in TAG-2, wired into the Quick Task add/edit modal.

**Test plan**: Create a "Build Putting Green" quick task with a checklist of dateless items, tag
it "Putting Green." Confirm the tag chip displays and persists.

---

### TAG-4: Tag view page (`#tag/{id}`) + tag browser
**Goal**: The payoff — a single page showing everything tied to a tag, regardless of what entity
it's attached to. This is the "Yard Plan" yearly view and the putting-green project view, both for
free from the same mechanism.

- `#tags` browser view: list all active tags with usage counts (count of tagged events + tagged
  projects), linking into each.
- `#tag/{id}` view: shows tagged Quick Task project cards, plus all tagged calendar
  events/occurrences (one-time, recurring, and maintenance schedules alike), reusing the calendar's
  existing 1/3/6/12-month range picker for the date-scoped view.

**Test plan**: Visit `#tags`, confirm "Yard Plan" and "Putting Green" show correct usage counts.
Click into "Yard Plan," confirm the hot tub and fertilizing schedules both appear with correct
upcoming/overdue occurrences across a 12-month range. Click into "Putting Green," confirm the
quick task project card appears (this tag currently has no calendar events — confirm the page
handles a tag with only one type of tagged content gracefully, not just projects).

---

## Phase Summary

| Phase | Delivers | Key Files |
|-------|----------|-----------|
| MS-1 | `reset_interval` schedules (hot tub, AC filter, oil change) | `calendar.js`, `index.html` |
| MS-2 | `fixed_months` schedules (hedge pruning, fertilizing) | `calendar.js`, `index.html` |
| MS-3 | `occurrenceStatus` model + Complete/In-Progress | `calendar.js`, `index.html` |
| MS-4 | Skip, Postpone, auto-Unnecessary | `calendar.js`, `index.html` |
| MS-5 | `#maintenance` open items list | `calendar.js` (new fns), `index.html`, `app.js` (routing) |
| TAG-1 | `tags` collection + `#tags` management page | new `js/tags.js`, `index.html`, `app.js` |
| TAG-2 | Tag picker on Calendar Events | `js/tags.js`, `calendar.js`, `index.html` |
| TAG-3 | Tag picker on Quick Task List | `js/tags.js`, `projects.js`, `index.html` |
| TAG-4 | `#tag/{id}` view + `#tags` browser | `js/tags.js`, `index.html`, `app.js` |

Prompt me with the phase name/number ("do MS-1", "start TAG-2", etc.) to begin work on it.
