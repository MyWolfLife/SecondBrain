# Future Enhancements

Items that are out of scope for current work but should be revisited later.

---

## Shared Spaces: what is left after Collections (2026-10-26)

*Groups, invites, sharing, Stop sharing and the Collections pilot are built (`SharedSpacesBuildPlan.md`, chunks S1–S7). This is what is left. The user picks the order.*

- **More things to share**, one at a time, the same way as Collections, the Yard and the House (all built): Garage, Vehicles, Structures, Neighborhoods, Life Projects, Insurance, Calendar, Notes (per note), Health for others, API keys. Each needs its own screens switched to `dataCol()` and its own move code (the engine in `sharing.js` is written for collections).
- **Passphrase reset**: decided NOT to build a recovery key (2026-10-27): anyone who can keep a recovery code can keep their passphrase, and an emailed code cannot unlock data the server has no key for. A forgotten passphrase still cannot be recovered. Optional small idea if it ever matters: for shared Financial people only, a "start over" button that makes a new key pair (`skRegenerateKeyPair()`) so the owner's "Update access" can re-send a fresh locked copy.
- **Shared Financial: not covered** (`SharedFinancialPlan.md` is built): sharing the combined summary / snapshots / all-time highs of a group of several people (for example Me + spouse; a person's own group is shared with the person, the Household shares only the joint accounts); the Stock Rollup and the Import / Ask AI screens for people shared with me (they read my own people); sharing a single joint account instead of all of them; the failure rollbacks of Share and Stop sharing for a person, the Household and a budget were never triggered; a recipient with no passphrase yet has to open Financial once (the owner then taps Update access).
- **Workouts library** (`SharedSpacesPlan.md` §8b): needs the decision about per-person progression stored inside workouts (a personal overlay vs shared).
- **Offline Trip Mode** should download things shared with me (the write lock already covers shares); shared edits made offline sync later.
- **Backup**: a checkbox "Also include things shared with me"; today only what I own is backed up.
- **Restore of a shared collection or yard** comes back private; could re-create the share if the groups still exist.
- **Not exercised**: the failure rollback of Share and Stop sharing (it exists but was never triggered), a real photo-file upload into a shared item, phone-width layout of the Sharing page and dialogs.
- Only people on the same Firebase project can share; a person with their own project cannot.

## Life Projects: Itinerary Travel-Time Research and Map Feature

- Revisit automatic travel-duration research for Import / Edit Day. The current feature researches locations only; travel durations come from user instructions or derivable stated times.
- Define the user's itinerary map feature after the day import/edit feature is complete. Requirements have not yet been discussed.

---

## Firebase SDK: Migrate Offline Persistence to `FirestoreSettings.cache`

**Console warning seen:** `enableMultiTabIndexedDbPersistence() will be deprecated in the future, you can use FirestoreSettings.cache instead.`

**What it is:** The app currently enables Firestore offline persistence using the old `enableMultiTabIndexedDbPersistence()` call in `js/firebase-config.js`. Firebase SDK v10+ deprecates this in favor of a new `FirestoreSettings` API that uses a `cache` property instead.

**Current behavior:** Works fine — the warning is cosmetic. Offline caching is still active and functional. This is not causing any bugs or performance issues.

**What needs to change when addressed:**
- In `js/firebase-config.js`, replace the `db.enableMultiTabIndexedDbPersistence()` call with the new `FirestoreSettings.cache` initialization pattern using `initializeFirestore()` with `{ localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }`
- This requires Firebase SDK v10+ (already in use via CDN) but may require verifying the exact CDN module imports support this API
- Test offline behavior after the change to ensure caching still works across tabs

**When to fix:** When upgrading the Firebase SDK to a newer major version, or if Firebase removes the old API and the warning becomes a runtime error. Not urgent — the current approach still works.

---

## Memories: Filter / Sort Toggle

On the Memories list page, add the ability to:
- Filter the list by tag (e.g., show only "Family" or "Travel" memories)
- Filter by person mentioned (show only memories that include a specific contact or name)
- Temporarily sort by date (using `sortDate`) instead of manual drag order, to browse chronologically

The list is currently manual drag-order only. This enhancement would add a toggle or filter bar without removing the drag capability.

---

## Service Professional Tracking

Once "People → Contacts" is done and Service Professional is a contact
category, consider adding a dedicated tracking layer for service calls:

- Log service calls per professional (date, what was done, cost)
- Track license numbers, insurance, warranty info
- Record rate / typical cost
- Set reminders for recurring services (HVAC tuneup, pest control, etc.)
- Link service calls to house rooms, zones, or structures where work was done

Related to: Contacts (Service Professional category), House/Structures sections.

---

## Health: Ordered Items Tracking (Labs, Referrals, Imaging, etc.)

On the visit detail or Step 2 page, allow logging things the doctor ordered or recommended:

- Categories: Lab / Blood Work, X-Ray / Imaging, Referral, Follow-Up Visit, Other
- Each item has: type, description/name, ordered date (defaults to visit date), status (Pending / Scheduled / Completed / Cancelled), and optional notes
- Ordered items linked to the visit they originated from
- Blood work already has `orderedAtVisitId` — this would extend the same concept to all order types
- View ordered items on the visit detail page alongside meds

Related to: Health Visits, Blood Work.

---

## Health: Visit Action Items / To-Dos

When a doctor gives you something to do (e.g., "schedule a dermatologist appointment", "pick up a prescription"), capture it as an action item tied to that visit.

- Each action item has: title/description, source visit (linked), due date (optional), status (Open / Done / Dismissed)
- "Open" Health Main Page (`#health`) shows a **Health To-Dos** section listing all open action items across all visits/sources, newest first
- Tapping an item shows context (which visit it came from) and lets you mark it Done or Dismissed
- Action items could eventually expand beyond visits — e.g., items from a concern, a medication review, etc.
- Consider a Speak button for quick capture right from the visit screen

Related to: Health Visits, Health main page.

---

## Floor Plan: Plumbing Pipe Routing Lines

Draw actual pipe routes on the floor plan (supply and drain lines) connecting fixtures to each other and to the main supply/stack. Each line segment would have a type (cold supply, hot supply, drain/vent) and color-coded rendering (blue, red, gray). This is intentionally deferred because:
- Most plumbing is implied by the fixture placement
- The UX for routing lines is a significant separate project (similar to the wiring line UX for electrical)
- Current approach: show plumbing endpoints (spigots, stub-outs) as colored symbols only, no routing

Related to: Floor Plan — Plumbing mode.

---

## Floor Plan: Sprinkler System Layout

Draw irrigation pipe routes on the floor plan (or an outdoor/yard floor plan) connecting
sprinkler heads to zone valves and the main supply line. Each zone would have a color and
label. This is intentionally deferred because:
- Sprinkler heads are already trackable as plumbing endpoint items (subtype: sprinkler)
- Full pipe routing is a significant UX project
- A valve controller / zone scheduling feature would likely be needed alongside it

Related to: Floor Plan — Plumbing mode, Outside floor.

---

## Floor Plan: Orphaned Electrical Items Report

A utility view (or filter) that surfaces:
- Switches (wall plate slots) that have no targets linked (neither in-room nor external)
- Light fixtures (recessed lights, ceiling fixtures) that are not targeted by any switch

This helps identify wiring that was never documented, or items added to the floor plan
but never connected. Could be a simple list view accessible from the electrical toolbar
or the floor/house page.

Related to: Floor Plan — Electrical mode, Wall Plates, External Targets.

---

## Projects: Reusable Packing List Templates

Create reusable packing list templates that can be copied (not linked) into new projects. User builds a packing list once, saves it as a template, and when creating a new travel project can pick from their saved templates to pre-populate the packing list.

- Templates are standalone — copying into a project creates independent items
- User can have multiple templates (e.g., "Cruise Packing", "Road Trip Packing", "International")
- Editing a template does not affect previously copied lists
- Could also apply to To-Do lists (e.g., "Pre-Cruise Checklist" template)

Related to: Life Projects, Vacation template.

---

## Projects: Duplicate/Copy a Day

Allow copying an entire day (with all its items) to quickly create a similar day. Useful for cruises where port days have similar structures. Copy creates an independent duplicate — editing one doesn't affect the other.

Related to: Life Projects, Itinerary days.

---

## Projects: SecondBrain Integration

Integrate the Projects system with SecondBrain for voice/AI-powered queries like "What's my plan for Day 3?", "What excursions have I confirmed?", "How much have I spent on this trip?". Exact integration TBD after the Projects system is built and in use.

Related to: Life Projects, SecondBrain.

---

## Create Lists

General-purpose list creation feature. Details TBD.

---

## Goals

Create and manage daily, weekly, monthly, and yearly goals. Details TBD.

---

## Budgets: Calendar Integration

Budget line items have an "Est. Due Day" field. In a future phase, allow those items to optionally generate calendar reminders on their due day each month — so bills show up on the calendar automatically from the budget rather than needing to be entered twice.

Related to: Budgets feature, Calendar Events.

---

## Fitness: Workout Links → Built Workout

On a Workout Link (Fitness → Workout Links), add an optional "Built as workout" picker that points to one of the user's Workouts (e.g. "I turned this reel into my Band Circuit workout"). Tapping it opens that workout. Parked while Workout Links v1 is built.

Related to: Workout Links, Workouts builder.

---

## Links: Move Between Web Links and Workout Links

A "Move to…" button on a link's edit page to move it from Workout Links (Fitness) to Web Links (Life) or the other way, for links saved in the wrong place. Workout Links' done history would need a decision (keep, drop, or block the move).

Related to: Web Links, Workout Links.

---

## Timeline: Graphical View

Once there are plenty of events, a visual timeline: bars for spans (school, jobs, homes), dots for moments, parallel lanes by category, dashed edges for uncertain dates. Play with layouts once real data exists. v1 is a vertical list grouped by decade and year.

Related to: Timeline.

---

## Timeline: Photos, Trips, and Ages

- Photos on a Timeline event (reuse the photo module).
- Pull existing Trips (and races/workouts) onto the timeline automatically instead of retyping them.
- Show "age 12" beside each event (needs a birthdate setting).
- Link a Timeline event to a Memory, and optionally link Where to a saved Place.

Related to: Timeline, Memories, Places.

---

## Fitness: open items after the YAYOG build (2026-10-26)

*Exercises, Workouts, formats, levels, the book import and Programs (P1–P7) are all built. This is what is left.*

**Known gaps (small, fix when they bite):**
- Leaving the guided / self-paced player mid-workout discards the run — no resume. *(Most likely to frustrate; do first.)*
- Editing set numbers on the Finished screen does not re-run progression or personal records.
- Finishing a scheduled workout's calendar event does not create a workout record.
- Deleting a workout from History does not undo its program day (use ◀ Back on the run card).
- Voice, speech, sound and screen wake-lock are untested on real devices; the Programs pages are not checked at phone width.
- The "workout in progress" card shows on the Fitness hub and Workouts list, not on the app's home screen.

**Parked ideas:**
- **F6, the smaller workout formats** (`FormatsPlan.md`): Easy Gleason, circuit work/rest, timed workout, 52 Pick-Up, active recovery.
- **Shared Spaces**: Collections sharing is built; the rest is listed under "Shared Spaces: what is left after Collections" above.
- **SecondBrain action for workouts** (needs the help-screen entry per CLAUDE.md).
- Programs: a "swap this slot" helper for the book's slots; calendar auto-scheduling of the next days; rest-week timer; per-category levels (strong pulls / weak pushes).

Related to: Fitness, Workouts, Programs.
