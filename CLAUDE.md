# Bishop - Yard & Garden Tracker

## Project Overview
A web application for tracking yard and garden maintenance. Allows the user to catalog plants by location, log care activities, and retrieve historical data about what was done, when, and where.

## Core Requirements
- **Plant inventory**: Record plants and their locations in the yard
- **Activity logging**: Track maintenance activities (watering, fertilizing, pruning, weed control, etc.) tied to specific plants or yard areas
- **History & retrieval**: View past activities per plant, per area, or by date
- **Weed management**: Track weed types, their treatments, and application schedules
- **Calendar view**: A calendar page showing upcoming tasks (seasonal treatments, scheduled care, etc.)
- **Cross-device access**: Must work on desktop, Chromebook, and phone (responsive design)
- **Zero cost**: No paid hosting, APIs, or services. Self-hosted on a home desktop is acceptable.

## Zones
- Yard is organized into **zones** up to 3 levels deep
  - Level 1: Major zone (e.g., "Front Yard", "Back Yard", "Creek", "Woods")
  - Level 2: Sub-zone (e.g., "By Mailbox", "Behind Garage")
  - Level 3: Detail zone (e.g., "Left Flower Bed")
- Plants can be associated with any level (a plant can sit at "Front Yard" or at "Left Flower Bed")
- A plant (and all its history) can be moved to a different zone (e.g., when a new sub-zone is created)

## Plants
- Each plant is an **individual instance**, not a type
  - 3 azalea bushes = 3 separate plant records, each with its own photos, history, and zone
- Plants have: name, zone assignment, photos, activity history, and metadata
- **Plant metadata**: heat/cold tolerance, watering needs, sun/shade preference, and other care info
- Plant records are independent and fully self-contained

## Weeds
- Track different **weed types** found in the yard (e.g., wild onions, crabgrass, dandelions)
- Each weed type records:
  - **Treatment method**: pulling, specific chemical, etc.
  - **Application timing**: as-needed, pre-spring, fall, etc.
  - **Zones affected**: which zones have this weed
- Weed treatments feed into the **calendar view** for seasonal reminders

## Photos
- Photos can be attached to **plants**, **zones**, or **weeds**
- Use case: initial cataloging of plants/areas, weed identification, then occasional photos for major changes
- Volume is low (not hundreds/thousands) — modest storage needs
- Photos should be compressed/resized to a reasonable quality (not raw phone resolution, but not terrible either)
- Storage: Photos stored as Base64 strings in Firestore documents (no Firebase Storage needed — stays on free Spark plan)
- Client-side compression targets ~100-200KB per photo to keep Firestore doc sizes manageable
- Photo viewer: newest-first navigation with Newer/Older buttons, caption editing, delete

## Problems / Concerns
- Both **plants** and **zones** can have a list of problems/concerns
- Examples: weeds, insects, irrigation issues, disease, drainage, etc.
- Each problem is a free-form entry with: description, date logged, status (open/resolved), and notes
- Problems are displayed as a list on the plant or zone detail page
- Add/edit/delete individual problems

## Facts
- Both **plants** and **zones** can have a list of **facts**
- Examples: square footage, bloom season, dormancy period, soil type, when planted, etc.
- Each fact is a simple key-value or free-form text entry
- Facts are displayed as a list on the plant or zone detail page
- Add/edit/delete individual facts

## Quick Task List (formerly "Future Projects")
- **Quick tasks** can be assigned to a **plant**, **zone**, **room**, **vehicle**, etc.
- A task has: title, notes, and an optional checklist/list of items
- Examples: "Level the front yard", "Install drip irrigation", "Replace dead azalea"
- Quick tasks are displayed on the entity detail page
- Add/edit/delete tasks and their list items

## Life Projects
- Rich project management in the Life section — templates: Vacation (active), Build and General (planned)
- Vacation template: day-by-day itinerary, bookings, packing list, to-do list, people, journal notes, cost rollup
- Planning vs. Travel mode toggle
- Data stored in `lifeProjects` collection with subcollections: `days`, `bookings`, `bookingPhotos`, `todoItems`, `packingItems`, `projectNotes`
- Plan document: `ModifyProjects.md`

## Activities & Actions
- An **activity** is a logged event: what was done, when, free-form notes, and optionally a chemical/product used
- A **saved action** is a reusable template created from a previous activity (e.g., "Sprayed for weeds in front yard" with chemical and notes pre-filled)
- When logging a new activity, the user can pick from saved actions to avoid retyping
- A **chemicals/products list** is maintained — user picks from the list or adds new ones
- Activities are tied to a plant, a zone, or a weed type

## Calendar Events
- Standalone calendar page accessible from the nav bar
- Events can be **one-time** (specific date) or **recurring** (weekly, monthly, every X days)
- Recurring events generate multiple occurrences within the display range
- Display range is configurable: 1, 3 (default), 6, or 12 months
- Events display chronologically, grouped by month with headers
- Each event card shows: date, title, description, recurring badge, Edit/Copy/Delete buttons
- **Copy**: creates a new one-time event pre-filled with the source event's title and description, date cleared
- **Edit**: pre-fills all fields including recurring settings
- **Delete**: for recurring events, warns that ALL occurrences will be removed
- Firestore collection: `calendarEvents` — fields: `title`, `description`, `date` (ISO string), `recurring` (null or `{type, intervalDays}`), `createdAt`

## Navigation
- **Home screen** shows a list of zones
- User drills down: Zone → Sub-zone → Detail zone → Plants
- Can log activities at any level during drill-down
- **"View All Plants" option** on any zone — shows all plants in that zone AND all sub-zones beneath it, in a flat list. Clicking a plant navigates to its full detail page.

## Authentication
- **No auth for now** — single shared access, everyone sees the same data
- Auth (Firebase Auth) may be added later as a future enhancement

## Technical Constraints
- Web-based (HTML/CSS/JS)
- Data persisted in Firebase Firestore (free tier)
- Responsive/mobile-friendly UI
- Hosted on a free static hosting service (GitHub Pages or Cloudflare Pages)

## Developer Background
- Primary experience: C# / VB.NET
- Understands web fundamentals but does not build websites professionally
- Code should be clear, well-structured, and approachable

## Project Directory
- Root: `C:\personal\Bishop`

## Decisions Log
- **Architecture**: Option B — Static site + free cloud database (Firebase Firestore)
- **Rationale**: Zero cost, syncs across all devices, no server to maintain, generous free tier
- **Future consideration**: Can evolve into a PWA for offline/native-app feel later
- **No auth initially**: Shared access, no login. Auth can be layered in later
- **Online only**: User will have wifi/cell signal; no offline mode needed
- **Saved actions**: Reusable activity templates to reduce repetitive data entry
- **Calendar content**: User will decide when/what plant care items go on the calendar
- **Zone depth**: Max 3 levels — keeps data model simple while covering real-world needs
- **Plants as instances**: Each physical plant is its own record (not grouped by species)
- **Photo storage**: Base64 in Firestore (no Firebase Storage, no Blaze plan, zero cost)
- **Weed tracking**: Separate from plants — weeds are tracked by type with treatment info and schedules

## Tech Stack
- **Frontend**: HTML / CSS / JavaScript (vanilla, no framework)
- **Database**: Firebase Firestore (free Spark plan, project: `bishop-62d43`)
- **Firebase SDK**: Compat v10.14.0 loaded via CDN
- **Authentication**: None initially (Firebase Auth reserved for future use)
- **Hosting**: GitHub Pages (live at https://mywolflife.github.io/SecondBrain)
- **GitHub username**: MyWolfLife — use this when pushing to git (no interaction needed, push directly)

## Architecture Notes
- **Routing**: Hash-based client-side routing (`#home`, `#zone/id`, `#plant/id`, `#weeds`, `#weed/id`, `#calendar`, `#chemicals`, `#chemical/id`, `#actions`)
- **Cross-entity pattern**: `targetType`/`targetId` used by activities, photos, problems, facts, and projects to attach to plants, zones, or weeds
- **Global state**: `window.currentZone`, `window.currentPlant`, `window.currentWeed`, `window.currentChemical` for sharing state between modules
- **Modal pattern**: `openModal(id)`/`closeModal(id)` utilities in zones.js, with `dataset.mode` and `dataset.editId` for add/edit modes
- **Dev server**: Python HTTP server on port 8080 via `.claude/launch.json`

## File Structure (Current)
```
Bishop/
├── index.html          (all page sections, modals, script tags)
├── css/
│   └── styles.css      (all styles, responsive, mobile-first)
├── js/
│   ├── firebase-config.js  (Firebase init, project bishop-62d43)
│   ├── app.js              (routing, navigation, mobile nav)
│   ├── zones.js            (zone CRUD, modal utilities, breadcrumbs)
│   ├── plants.js           (plant CRUD, metadata, zone picker, "View All Plants")
│   ├── activities.js       (activity logging, saved actions, multi-chemical checkboxes)
│   ├── chemicals.js        (chemical/product list CRUD, detail page)
│   ├── photos.js           (photo capture, Base64 compress, gallery viewer)
│   ├── problems.js         (problems/concerns per plant/zone)
│   ├── facts.js            (facts per plant/zone/chemical; URL values as clickable links)
│   ├── projects.js         (quick task lists with checklists per plant/zone)
│   ├── life-projects.js    (life projects — vacation itineraries, bookings, to-dos)
│   ├── weeds.js            (weed tracking, zone assignment, photos, activities)
│   └── calendar.js         (calendar events, recurring logic, occurrence generation)
└── .claude/
    └── launch.json     (dev server config)
```

## Data Model (Firestore Collections)

| Collection       | Key Fields                                                                  |
|------------------|-----------------------------------------------------------------------------|
| zones            | name, parentId, level, createdAt                                            |
| plants           | name, zoneId, metadata{}, createdAt                                         |
| activities       | targetType, targetId, description, notes, chemicalIds[], date, savedActionId |
| savedActions     | name, description, chemicalIds[], notes                                      |
| chemicals        | name, notes                                                                  |
| photos           | targetType, targetId, imageData (Base64), caption, createdAt                 |
| problems         | targetType, targetId, description, notes, status, dateLogged, resolvedAt     |
| facts            | targetType, targetId, label, value  (targetType: plant/zone/chemical)        |
| projects         | targetType, targetId, title, notes, status, items[], completedAt             |
| weeds            | name, treatmentMethod, applicationTiming, notes, zoneIds[]                   |
| calendarEvents   | title, description, date, recurring{type,intervalDays}, targetType?, targetId?, zoneIds[], savedActionId?, completed, completedDates[], cancelledDates[] |
| lifeProjects     | title, description, template, status, mode, archived, startDate, endDate, people[], bookingTypes[] |

## Build Progress
- **Phase 0**: Firebase Project Setup ✅ COMPLETE
- **Phase 1**: Project Scaffolding ✅ COMPLETE
- **Phase 2**: Zone Management ✅ COMPLETE
- **Phase 3**: Plant Management ✅ COMPLETE (includes "View All Plants" feature)
- **Phase 4**: Activity Logging ✅ COMPLETE (includes chemicals, saved actions)
- **Phase 4.5**: Problems, Facts, Projects ✅ COMPLETE (added between phases 4 and 5)
- **Phase 5**: Photo Support ✅ COMPLETE (Base64 in Firestore, gallery viewer)
- **Phase 6**: Weed Tracking ✅ COMPLETE (with photos and zone assignment)
- **Phase 7**: Calendar View ✅ COMPLETE (one-time + recurring events, copy/edit/delete)
- **Phase 7.5**: UI Refinements ✅ COMPLETE (10 mods — see plan for details)
- **Phase 7.6**: Feature Enhancements ✅ COMPLETE (clickable URL facts, chemical detail page, multi-chemical checkboxes, calendar events on zone/plant, complete event→activity, overdue section)
- **Phase 7.7**: Ad-hoc Fixes ✅ COMPLETE (home screen calendar buttons, delete in edit modal, confirm-before-close, multi-zone calendar events, show completed on calendar)
- **Phase 8**: Polish & Responsive Design ✅ COMPLETE (verified across all pages at 375px mobile)
- **Phase 9**: Deployment ✅ COMPLETE (live on GitHub Pages at https://mywolflife.github.io/SecondBrain)

## Functional Specification
- **`MyLife-Functional-Spec.md`** is the source of truth for this app's features and architecture.
- Read it at the start of any session to get a complete picture of the app without re-scanning code.
- It covers: all major sections (Yard/House/Garage/Vehicles/Collections/Life), all shared features (Photos/Facts/Activities/Problems/Projects/Calendar), architecture, routing, Firestore data model, testing credentials, and deployment protocol.

## Planning Documents
- **`AllPlans.md`** — index of every plan document in the project. Check this first to find the right plan doc for any feature area.
- **`HealthEnhancements.md`** — active plan for the current health section enhancement work (concern/condition linking, medication flow, care team, contacts rename, etc.). Read this when working on health features.
- **`FutureEnhancements.md`** — parking lot for out-of-scope ideas to revisit later. Add items here instead of building them now.

## FutureEnhancements.md — REQUIRED BEHAVIOR
- Any time the user says to **"punt"**, **"park"**, **"save for later"**, or otherwise defer a feature idea, add it to `FutureEnhancements.md` immediately.
- Any time a feature from `FutureEnhancements.md` is fully implemented, **delete it from the doc**.
- Keep the doc clean — it should only contain things not yet built.

## Functional Specification — REQUIRED BEHAVIOR
**IMPORTANT: Keep `MyLife-Functional-Spec.md` up to date as a living document.**
- Any time a feature is added, changed, or removed, update the spec in the **same commit** as the code change.
- **This applies to ALL changes — no exceptions for "minor tweaks", one-liners, or navigation fixes.** If behavior changed, the spec must reflect it.
- The spec is the first thing read at the start of a new session — if it's stale, context is wrong from the start.
- Update the section that owns the feature (e.g., Photos section for photo changes, the relevant Part for new entity types).
- Do not defer spec updates to a later commit. This is not optional.
- **Always tell the user** when you update the functional spec — state which section(s) were changed and what was updated. This lets the user notice if a spec update was skipped when it should have happened.
- **Before every `git commit` that touches JS, HTML, or CSS: ask yourself "did any user-visible behavior change?" If yes → update the spec first.**

## AppHelp.md — REQUIRED BEHAVIOR
**IMPORTANT: `AppHelp.md` is the single source of truth for in-app help content. Keep it in sync with the app at all times.**
- **Before every `git commit` that touches JS, HTML, or CSS: evaluate whether the change affects any screen that has a `## screen:X` section in `AppHelp.md`. If it does — update that section in the same commit.**
- This is an active evaluation step, not just "update if you notice it changed." Read the diff and ask: "Would a user reading the help for this screen be confused or misled by what's there now?"
- This applies to ALL changes — new buttons, renamed fields, changed flows, removed features, reworded labels.
- `AppHelp.md` feeds BOTH the per-screen Help Page display AND the LLM Q&A — there is only one file, so one update keeps both in sync automatically.
- Shared concept sections (`## concept:X`) must also be updated if the shared behavior changes. These are NOT covered by the screen-name check alone — you must explicitly evaluate them based on which JS file changed. Use this mapping:
  - `activities.js` → check `## concept:activities`
  - `photos.js` → check `## concept:photos`
  - `problems.js` → check `## concept:problems`
  - `facts.js` → check `## concept:facts`
  - `projects.js` → check `## concept:projects`
  - `chemicals.js` → check any concept section that references chemicals/products
- **Always tell the user** when you update AppHelp.md — state which section(s) changed and what was updated. If you evaluated and no update was needed, say that too.
- **If a screen does not yet have a `## screen:X` section and you add significant new functionality to it, author the section in the same commit.**

## Development Notes
- Claude is writing the entire app under user direction
- Keep code clear and well-commented for a developer whose primary background is C#/VB.NET
- Prioritize readability and maintainability over cleverness

## OpenAI API — REQUIRED BEHAVIOR
**IMPORTANT: Never use `max_tokens` with OpenAI API calls. Always use `max_completion_tokens`.**
- `max_tokens` is deprecated and rejected by newer models (gpt-4o, gpt-5.4-mini, etc.)
- This applies everywhere in the codebase: LLM chat calls, test calls, SecondBrain, any future AI integration
- xAI (Grok) uses the same OpenAI-compatible format and also accepts `max_completion_tokens`

## Notifications — REQUIRED BEHAVIOR
**IMPORTANT: This must be followed in every session, every time.**
- When the user includes **"notify me"** anywhere in a request, you MUST run this curl command as the final step after the task is complete:
  ```
  curl -d "Done: <brief summary of what was completed>" ntfy.sh/WolfLifeBishop
  ```
- Replace `<brief summary>` with a one-line description of what was finished.
- Do not skip this. Do not forget it. It is not optional.
- The curl must actually be executed via the Bash tool — just mentioning it is not enough.

## SecondBrain — REQUIRED BEHAVIOR
**IMPORTANT: Any time a new LLM action is added to SecondBrain, the help screen MUST be updated in the same commit.**
- The help screen data lives in `SB_HELP_ACTIONS` array in `js/secondbrain.js`
- Each entry needs: `action`, `icon`, `label`, `desc`, and `examples` (2–4 example utterances)
- The corresponding icon and label must also be added to `SB_ICONS` and `SB_LABELS` at the top of `secondbrain.js`
- Do not add a new action without also adding it to `SB_HELP_ACTIONS`. This is not optional.

## Preview Verification — REQUIRED BEHAVIOR
**IMPORTANT: When verifying changes in the preview server, the app requires Firebase Auth login.**
- Always use test credentials from memory (`reference_test_account.md`) — do not skip login and conclude "can't verify".
- Start the dev server: `preview_start` → `bishop-dev`
- Log in using the test account before navigating to any feature
- If no data exists in the test account for the feature being tested, verify by injecting mock state via `preview_eval` (e.g., populating `photoViewerState` to render the photo viewer)
- Never skip verification for changes that are observable in the browser

## Service Worker Cache — REQUIRED BEHAVIOR
**IMPORTANT: Every time a commit touches JS, HTML, or CSS files, bump `CACHE_NAME` in `sw.js`.**
- Current pattern: `'bishop-v2'` → `'bishop-v3'` → `'bishop-v4'` etc.
- If you forget, users (including the developer) will get stale cached files after a deploy.
- Do this in the same commit as the code change — not a separate commit.
- This applies to every deploy, no exceptions.

## /fixbishop Command — REQUIRED BEHAVIOR
**IMPORTANT: When the user types `/fixbishop {id}` or says "fix {id}", "please fix {id}", "do {id}", or any similar phrasing where `{id}` looks like a Firestore document ID (long alphanumeric string), follow the `/fixbishop` skill defined in `.claude/skills/fixbishop/SKILL.md`.**

Summary of that workflow:
1. Read the dev note from `sharedDevNotes/{id}` via preview server + `preview_eval`
2. Understand the issue using: `MyLife-Functional-Spec.md`, `AppHelp.md`, `AllPlans.md` (to find relevant plan doc), and source code
3. Act if the intent is clear; ask only if genuinely unresolvable from all available context
4. Implement the fix and run the full pre-commit checklist (spec, help, cache bump)
5. Test in the preview server when feasible
6. Mark the dev note resolved (`fixed: true`, `fixedDate`, `fixedNote`)
7. Notify then push: `curl -d "Ready to push..." ntfy.sh/WolfLifeBishop && git push`

Do this for the stated ID only. Never touch other dev notes.

## Git Push — REQUIRED BEHAVIOR
**IMPORTANT: git push requires a Windows credential confirmation prompt. Always notify BEFORE pushing.**
- Before every `git push`, send this curl notification first:
  ```
  curl -d "Ready to push — please confirm the Windows prompt" ntfy.sh/WolfLifeBishop
  ```
- Then immediately run `git push`.
- This gives the user time to come to the terminal and approve the credential dialog.
- Never push without sending this notification first. Never skip it even for quick fixes.
