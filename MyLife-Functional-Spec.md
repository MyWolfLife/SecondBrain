# MyLife (Bishop) — Functional Specification

> **Purpose**: This document is the source of truth for the MyLife/Bishop application. It is written for developers, AI coding assistants, and power users. Each major section describes what a feature does and how it works. Shared features (photos, facts, activities, etc.) are described in depth in [Part 11: Shared Features](#part-11-shared-features) — individual sections above reference them and only expand on nuances.

---

## Table of Contents

1. [Architecture & Infrastructure](#part-1-architecture--infrastructure)
2. [Yard](#part-2-yard)
3. [House](#part-3-house)
4. [Garage](#part-4-garage)
5. [Structures](#part-5-structures)
6. [Vehicles](#part-6-vehicles)
7. [Collections](#part-7-collections)
8. [Life](#part-8-life)
9. [Places & Check-In](#part-9-places--check-in)
10. [AI / LLM Features](#part-10-ai--llm-features)
11. [Shared Features](#part-11-shared-features)
12. [Navigation & Routing](#part-12-navigation--routing)
13. [Testing](#part-13-testing)
14. [Deployment](#part-14-deployment)
15. [Firestore Data Model](#part-15-firestore-data-model)

---

## Part 1: Architecture & Infrastructure

### Firebase Project
- **Project ID**: `bishop-62d43`
- **Plan**: Spark (free tier) — no Firebase Storage, no Blaze upgrade required
- **Auth**: Firebase Auth, email/password only
- **Database**: Firestore in native mode
- **No server**: Static site + Firestore — zero backend cost

### Per-User Data Scoping
All Firestore reads and writes go through the `userCol(collectionName)` helper defined in `firebase-config.js`. It scopes all data under `/users/{uid}/{collection}`, so every user has a completely separate data namespace. **All JS modules use `userCol()` exclusively — no flat root-level collections exist.**

```js
// firebase-config.js
function userCol(collectionName) {
    return db.collection('users').doc(currentUid).collection(collectionName);
}
```

### Authentication (`auth.js`)
- Firebase Auth email/password
- On load: checks `auth.onAuthStateChanged` — if logged in, shows app; if not, shows login screen
- Login screen is a full-page overlay rendered before any app content
- `#changepassword` route allows password update
- No multi-user sharing or role-based access currently
- **Create Account**: login screen shows a "Create Account" section when the user has saved their own Firebase config (`usingCustomFirebase === true`). Calls `createUserWithEmailAndPassword`. After success, a one-time modal appears with instructions to disable new sign-ups in Firebase Console (Build → Authentication → Settings → User actions → uncheck "Enable create (sign-up)").

### Routing (`app.js`)
- **Hash-based SPA routing**: All navigation uses `window.location.hash` (e.g., `#zone/abc123`, `#plant/xyz`)
- `hashchange` event triggers the router, which reads the hash and calls the appropriate load function
- 40+ unique routes across yard, house, life, and shared pages
- **No page reloads** — all navigation is client-side

### Modal System (`zones.js`)
- `openModal(id)` — shows a `<dialog>` or overlay div, calls `history.pushState({modal: id}, '')`
- `closeModal(id)` — hides the modal, calls `history.back()` asynchronously
- **Critical pattern**: Navigation after `closeModal()` must be wrapped in `setTimeout(..., 50)` to let `history.back()` resolve before a new hash is set, or the navigation will be lost
- `dataset.mode` and `dataset.editId` on modals distinguish add vs. edit

### Global State
Key entities being viewed are stored on `window` for cross-module access:
- `window.currentZone`, `window.currentPlant`, `window.currentWeed`, `window.currentChemical`
- `window.currentThing`, `window.currentSubThing`, `window.currentItem`
- `window.currentRoom`, `window.currentFloor`
- `window.currentVehicle`, `window.currentCollection`, `window.currentCollectionItem`
- `window.currentPerson`, `window.currentNotebook`
- `window.currentPlace`

### Stale Event Listener Pattern
Many modals and buttons are re-wired every time a page loads. To avoid accumulating duplicate listeners, the pattern is:
```js
var newBtn = btn.cloneNode(true);
btn.parentNode.replaceChild(newBtn, btn);
newBtn.addEventListener('click', handler);
```

### Cache Busting
All `<script>` and `<link>` tags in `index.html` have a `?v=N` version query string. When any JS or CSS file is changed, **all tags must be bumped** to the same new version number. The CSS `<link>` tag is easy to forget — it must also be bumped.

- Current pattern: `<script src="js/app.js?v=316"></script>`
- CSS: `<link rel="stylesheet" href="css/styles.css?v=316">`

### Service Worker Update Behavior
When a new service worker activates (after a deploy), the app defers the page reload to avoid interrupting in-progress edits:

- **If no form field is being edited** (no user has typed into any `<input>` or `<textarea>` since the last navigation): the page reloads immediately when the new SW activates.
- **If the user is mid-edit** (dirty state): the reload is deferred. `window._bishopUpdatePending` is set to `true`. The page reloads automatically the next time the user navigates to a new hash route — i.e., when they finish what they're doing and move to another screen.
- `window._bishopDirty` resets to `false` on every `hashchange` event.
- This prevents data loss (e.g., a journal entry being wiped by a background update) while still ensuring users get the new version within one navigation.

### LLM Configuration (`settings.js`)
- Stored in `userCol('settings').doc('llm')` — behind auth, not in localStorage
- Fields: `provider` (openai / xai), `apiKey`, `model` (optional override)
- Default models: `gpt-4o-mini` (OpenAI), `grok-3` (xAI)
- Both use the OpenAI-compatible API format (`/v1/chat/completions`)

---

## Part 2: Yard

**Plan document**: `plan.md`

The Yard section tracks outdoor spaces, plants, weeds, chemicals, and maintenance activities. It is the original core of the app.

### Zones (`zones.js`)
Zones are the organizational backbone of the yard. They form a hierarchy up to 3 levels deep.

**Firestore**: `zones` — `name`, `parentId`, `level` (1/2/3), `createdAt`

**Routes**: `#home` (root zone list), `#zone/{id}` (zone detail)

**Hierarchy**:
- Level 1: Major zones (e.g., "Front Yard", "Back Yard", "Creek")
- Level 2: Sub-zones (e.g., "By Mailbox", "Behind Garage")
- Level 3: Detail zones (e.g., "Left Flower Bed")

**Features on each zone**:
- Child zones (add/edit/delete — deleting a zone with children is blocked)
- Plants in zone (list with "View All Plants" option — see Plants)
- [Shared] Facts, Problems, Quick Task List, Activities, Photos, Calendar Events
- Life Projects — rich project management (itineraries, bookings, packing, to-dos)

**Zone detail page layout**: All sections are collapsible accordions (`.detail-acc`). Sub-zones and Calendar Events are expanded by default; all others start collapsed. Each accordion header shows an item count badge that populates after the section loads and updates whenever a task is added, edited, deleted, or completed. Sections: Sub-zones, Plants, Problems/Concerns, Facts, Quick Task List, Calendar Events, GPS Shape, Activity History, Photos.

**Zone Quick Task List display**: The Quick Task List accordion has two options — "Include sub-zones" (checkbox) and "Show completed" (checkbox). When "Include sub-zones" is checked, the list performs a recursive roll-up across all descendant zones. This zone's own tasks appear first; if there are also rollup tasks from sub-zones, a "From Sub-zones" divider separates the two groups. Rollup task cards display a "from: SubZoneName" label to identify their source.

**Edit/Delete modal**: The zone detail page has an Edit button that opens a modal pre-filled with the zone name. The Delete button is inside this edit modal (not on the detail page directly) — it appears only in edit mode, not when adding a new zone.

**Zone reassignment**: Plants and sub-zones can be moved to a different parent zone via a modal picker that shows the full hierarchy with indentation.

### Plants (`plants.js`)
Each plant is an individual physical instance — 3 azalea bushes = 3 records. Plants are tied to a single zone.

**Firestore**: `plants` — `name`, `zoneId`, `metadata{}`, `profilePhotoData?`, `createdAt`

**Metadata fields**: `heatTolerance`, `coldTolerance`, `sunShade`, `wateringNeeds`, `bloomMonth`, `dormantMonth` (all optional, set via dropdowns/pickers)

**Routes**: `#plant/{id}` (detail page)

**View All Plants**: From any zone, "View All Plants" shows a flat list of every plant in that zone and all sub-zones beneath it. Clicking a plant navigates to its detail page.

**Zone reassignment**: Modal picker with full zone hierarchy to move a plant.

**Plant detail page layout**: All sections are collapsible accordions (`.detail-acc`). Plant Care Info is expanded by default; all others start collapsed. Count badges populate after each section loads. Sections: Plant Care Info (no count — it's a form), Problems/Concerns, Facts, Quick Task List, Calendar Events, Activity History, Photos.

**[Shared]**: Facts, Problems, Quick Task List, Activities, Photos, Calendar Events — all available on plant detail.

### Weeds (`weeds.js`)
Weeds are tracked by type (not by zone instance). Each weed type stores its treatment and zone assignments.

**Firestore**: `weeds` — `name`, `treatmentMethod`, `applicationTiming`, `notes`, `zoneIds[]`, `profilePhotoData?`, `createdAt`

**Routes**: `#weeds` (list), `#weed/{id}` (detail)

**Zone assignment**: Checkbox modal showing all zones with indentation. A weed type can be assigned to multiple zones.

**LLM Identification** (if LLM configured):
- User takes/uploads a photo of the weed
- Before calling the LLM, all existing weeds (ID + name) are fetched and appended to the prompt
- LLM returns `existingWeedId` in the JSON if the photo matches an existing weed in the collection
- **Duplicate detection**: if `existingWeedId` is returned, a confirm dialog asks "Would you like to go to that weed?" — Yes navigates to `#weed/{id}`; No returns to `#weeds`. No new record is created.
- If no duplicate: result shown in a review modal (all fields editable)
- On save: creates weed record + a Fact (reference URL) + saves photo(s)
- If LLM cannot identify: shows "Could Not Identify" modal — user can still save manually
- Duplicate check applies to both the normal flow and the "show response" review modal path

**[Shared]**: Facts, Problems, Quick Task List, Activities, Photos, Calendar Events

### Chemicals / Products (`chemicals.js`)
A shared inventory of all chemicals, fertilizers, herbicides, and products used in the yard.

**Firestore**: `chemicals` — `name`, `notes`, `createdAt`

**Routes**: `#chemicals` (list), `#chemical/{id}` (detail)

**Used by**: Activities and Saved Actions link to chemicals via `chemicalIds[]` array. Multiple chemicals can be linked to a single activity.

**[Shared]**: Facts (URL values clickable as links), Photos

### Activities & Saved Actions (`activities.js`)
See [Shared: Activities](#activities) for the full description. Nuances in the Yard context:
- Activities can target zones, plants, or weeds (`targetType` = `zone`/`plant`/`weed`)
- Multi-chemical selection: checklist of all chemicals, any number can be linked
- Saved Actions: reusable templates to pre-fill activity description + chemical selection

### Yard "More" Section (`#home`)
The yard main page has a **More** section below the zone list containing three panel cards:
- **Open Problems** — shows count of open problems across zones, plants, and weeds; clicking navigates to `#yard-problems`
- **All Quick Tasks** — shows count of all quick tasks across zones, plants, and weeds; clicking navigates to `#yard-projects`
- **Checklists** — shows count of active (incomplete) checklist runs whose `targetType` is `yard` or `zone`; clicking navigates to `#checklists/yard`

### Yard Problems Page (`projects.js`)
**Route**: `#yard-problems`

Lists all open problems (`status === 'open'`) across zones, plants, and weeds. Each card shows the problem description and a location label (for plants: "Zone › Plant Name"; for zones/weeds: the entity name). Clicking navigates to the owning entity's detail page.

**Breadcrumb**: Yard › Open Problems
**"Yard" breadcrumb link**: navigates to `#zones` (the yard zones list page), not `#home`/`#main`

### Yard Quick Tasks Page (`projects.js`)
**Route**: `#yard-projects`

Lists all quick tasks whose `targetType` is `zone`, `plant`, or `weed`. Each card is expandable and shows its title, target entity, and checklist.

**Breadcrumb**: Yard › All Quick Tasks
**"Yard" breadcrumb link**: navigates to `#zones` (the yard zones list page), not `#home`/`#main`

### Activity Reports (`activityreport.js`)
- **Route**: `#activityreport`
- Filter activities by date range, grouped by type and target entity
- Summary view of what was done and when across the entire yard

### Bulk Activity (`bulkactivity.js`)
- **Route**: `#bulkactivity`
- Log the same activity to multiple zones or plants in one action
- Avoids repetitive data entry for tasks done across many locations (e.g., "Watered everything")

---

## Part 3: House

**Plan document**: `HousePlan.md`

The House section tracks the interior of the home using a 4-level hierarchy: Floor → Room → Thing → Sub-Thing → Item.

**House page (`#house`)** shows: summary stats bar (upcoming calendar events only), **Open Problems** single panel card (shows count; clicking navigates to `#house-problems`), **All Quick Tasks** panel card, Floors section (clickable cards), a **More** section with a dynamic **Checklists** card (count of active runs for house/floor/room; navigates to `#checklists/house`) followed by static icon cards for Garage (`#garage`), Vehicles (`#vehicles`), and Collections (`#collections`), an Upcoming calendar rollup, and a Breaker Panels section. Garage, Vehicles, and Collections are no longer on the main landing page — they live under House → More. Room count removed from stats bar (visible per-floor already). The **events stat chip** (e.g. "1 upcoming calendar event") is a clickable link to `#house-calendar-events`.

**House Quick Tasks page (`#house-projects`)**: Lists all quick tasks from floors, rooms, and things. Each card shows the task title and location path. Clicking navigates to the owning entity. Breadcrumb: House › All Quick Tasks.

**House Problems page (`#house-problems`)**: Lists all open problems from floors, rooms, and things. Each card shows the problem description and a location path (Floor › Room › Thing). Clicking a card navigates to the owning entity. Breadcrumb: House › Open Problems.

**House Calendar Events page (`#house-calendar-events`)**: Lists all calendar events tied to house entities (floor, room, thing, subthing, item). Shows the next 3 months of occurrences plus any overdue uncompleted one-time events, sorted chronologically. Each event renders as a full calendar event card (Edit, Complete, Delete buttons). Reached by clicking the events stat chip on the house home page.

### Floors (`house.js`)
The top level of the house hierarchy.

**Firestore**: `floors` — `name`, `floorNumber`, `createdAt`

**Routes**: `#house` (floor list), `#floor/{id}` (floor detail)

**[Shared]**: Facts, Problems (roll-up from rooms/things/sub-things), Quick Task List (roll-up), Activities, Photos, Calendar Events

**Floor detail page layout**: All sections are collapsible accordions (`.detail-acc`). Rooms and Calendar Events are expanded by default; all others start collapsed. Each accordion header shows an item count badge (e.g. "Photos (3)") that populates after the section loads. `toggleDetailAcc(id)` in `app.js` handles expand/collapse. `_setDetailAccCount(countId, containerId)` in `house.js` updates the badge. This accordion pattern (`detail-acc`) is reusable across other entity detail pages.

### Rooms (`house.js`)
Each room belongs to one floor.

**Firestore**: `rooms` — `name`, `floorId`, `sortOrder`, `createdAt`

**Routes**: `#room/{id}` (room detail)

**Floor plan linkage**: Each room can be drawn as a polygon on the floor plan. The shape links back to the room record — clicking the shape navigates to the room detail page. Dimensions (e.g., "12 × 14 ft · 168 sq ft") are calculated from the polygon.

**Stairs**: A special room type marked as connecting two floors. Appears with a hatch pattern on the floor plan.

**Detail page layout**: All sections are collapsible accordions (`.detail-acc`), all collapsed by default. Item count badge shown in each header. Sections: Things, Problems/Concerns, Facts, Quick Task List, Calendar Events, Activity History, Photos, Floor Plan.

**[Shared]**: Facts, Problems (roll-up from things/sub-things), Quick Task List (roll-up), Activities, Photos, Calendar Events

### Things (`house.js`)
Items of significance in a room — furniture, appliances, fixtures.

**Firestore**: `things` — `name`, `category`, `roomId`, `description`, `worth`, `notes`, `beneficiaryContactId?`, `profilePhotoData?`, `createdAt`

**Routes**: `#thing/{id}` (detail)

**Categories**: Furniture, Appliance, Ceiling Fan, Ceiling Light, Electronics, Other. Category badges are color-coded and shown on the list card.

**Thumbnails**: `profilePhotoData` stored on the document; shown as a small image on the list card. Auto-set from the first photo added (LLM or manual). Can be overridden via "Use as Profile" button in the photo gallery.

**Detail page layout**: All sections are collapsible accordions (`.detail-acc`), all collapsed by default. Item count badge shown in each header. Sections: Sub-Things, Problems/Concerns, Facts, Quick Task List, Calendar Events, Activity History, Photos.

**[Shared]**: Facts, Problems, Quick Task List, Activities, Photos, Calendar Events

### Sub-Things (`house.js`)
Sub-items within a Thing — drawers in a dresser, shelves in a bookcase, compartments in a cabinet.

**Firestore**: `subThings` — `name`, `thingId`, `description`, `worth`, `notes`, `tags[]`, `beneficiaryContactId?`, `profilePhotoData?`, `createdAt`

**Routes**: `#subthing/{id}` (detail)

**Tags**: Optional free-form tags for grouping/filtering (e.g., "seasonal", "office supplies").

**Thumbnails**: Same pattern as Things — auto-set on first photo, overridable.

**Detail page layout**: All sections are collapsible accordions (`.detail-acc`), all collapsed by default. Item count badge shown in each header. Sections: Items, Problems/Concerns, Facts, Quick Task List, Calendar Events, Activity History, Photos.

**[Shared]**: Facts, Problems, Quick Task List, Activities, Photos, Calendar Events

### Items (`house.js`, `SubThingItems.md`)
The deepest level — individual items inside a Sub-Thing.

**Firestore**: `subThingItems` — `name`, `subThingId`, `description`, `worth`, `notes`, `tags[]`, `beneficiaryContactId?`, `profilePhotoData?`, `createdAt`

**Routes**: `#item/{id}` (detail)

**Thumbnails**: Same pattern as Things — auto-set on first photo, overridable.

**Detail page layout**: All sections are collapsible accordions (`.detail-acc`), all collapsed by default. Item count badge shown in each header. Sections: Problems/Concerns, Facts, Quick Task List, Calendar Events, Activity History, Photos.

**[Shared]**: Facts, Problems, Quick Task List, Activities, Photos, Calendar Events

### Who Gets What (`beneficiaries.js`)
Tracks beneficiary assignments across Things, Sub-Things, Items, Garage Things/Sub-Things, Structure Things/Sub-Things, Collections, and Collection Items.

**Field**: `beneficiaryContactId?` — optional reference to a `people` doc (Contacts). Stored directly on each entity document.

**Inheritance**: If an entity has no `beneficiaryContactId`, it inherits from its nearest ancestor that does. For example, a SubThing with no beneficiary set will display the Thing's beneficiary. A CollectionItem inherits from its Collection. Inheritance is computed in-memory during render — no extra Firestore reads.

**Display on detail pages**: A yellow "Goes to" row appears below the entity header. Shows the contact name as a link to their detail page. If inherited, shows "(inherited from [Parent Name])". If no beneficiary is set anywhere in the chain, the row is hidden.

**Editing**: The "Goes to (if I die)" contact picker appears in each entity's add/edit modal. Uses `buildContactPicker` from `contacts.js`. Supports search by name. Clear the field to remove the direct assignment (inheritance from parent still applies).

**Summary page** (`#beneficiaries`): Accessible from the House "More" section as "Who Gets What". The person dropdown is pre-populated with only people who have at least one direct assignment — no guessing needed. Select a specific person or "All People" to see everyone grouped by person. Results are single-line rows showing item name · path · direct/inherited badge. A "Show inherited" checkbox (default off) toggles display of inherited items. A "Print / PDF" button calls `window.print()` — the browser's print dialog allows saving as PDF. Single-person printouts include an "Items for: [Name]" heading. All-People printouts insert a page break between each person so each prints on their own page.

### LLM Photo Identification (House)
Things, Sub-Things, and Items can all be added via `+Photo` button:
- Opens photo staging modal
- Photo sent to LLM with a "identify this household item" prompt
- LLM returns name, description, estimated value
- Item saved immediately with photo and thumbnail auto-set
- If LLM cannot identify name: shows alert (item not saved)

### Floor Plan (`floorplan.js`)
An interactive SVG drawing tool for each floor. Accessed via `#floorplan/{floorId}`.

#### View / Edit Mode

The floor plan editor opens in **View mode** by default whenever an existing plan is loaded:
- **View mode**: all items are clickable and selectable regardless of the active layer mode (Layout / Electrical / Plumbing); dragging is disabled in all modes; the toolbar (Row 2) is hidden; the Dimensions button is hidden; the props bar shows "View Room" / "View Marker" buttons (modal opens with all inputs disabled and Save hidden); Delete button in props bar is hidden; keyboard Delete/Backspace and Ctrl+S are no-ops. Windows turn amber when selected (matching doors and other items).
- **Wall-plate slot focus**: clicking on a multi-slot wall plate highlights the specific slot that was clicked (amber tint) and shows "Slot 2/3 · Dimmer · Controls: Living Room Ceiling" in the props bar. Clicking a different slot on the same plate updates the focus. Clicking the same slot twice clears slot focus (keeps plate selected). Works in both view and edit modes. Single-slot plates show no slot breakdown.
- **Edit mode**: full editing — dragging, adding items, saving, deleting — exactly as before.
- The header shows an **Edit** button in view mode; clicking it switches to edit mode and shows the **Save** button.
- If **no plan exists yet**, the page opens directly in edit mode (nothing to protect) and the floor detail page shows **"Add Floor Plan"** instead of "View Floor Plan".
- On the floor detail page the button reads **"View Floor Plan"** when a plan exists, **"Add Floor Plan"** when it does not.

**Firestore**: `userCol('floorPlans').doc(floorId)` — same document ID as the parent floor. Fields: `widthFt`, `heightFt`, `rooms[]`, `doors[]`, `windows[]`, `plumbing[]`, `ceilingFixtures[]`, `recessedLights[]`, `wallPlates[]`, `fixtures[]`, `plumbingEndpoints[]`, `updatedAt`

---

#### Data Model — ID Relationships (critical)

Every fp room shape has **two** ID fields:
- `shape.id` — internal shape ID generated by `fpGenId()` (e.g. `"fp_r_abc123"`)
- `shape.roomId` — Firestore `rooms` document ID (the linked room record)

All other items (doors, windows, fixtures, etc.) store:
- `item.roomId = fpRoomShape.id` (the **shape** ID, NOT the Firestore room ID)
- `item.id` — unique ID for the item itself (used as `targetId` in cross-entity queries)

**Translation pattern** (used throughout `house.js` and `floorplanitem.js`):
- Room page → item: find shape where `shape.roomId === firestoreRoomId` → use `shape.id` → filter items by `item.roomId === shape.id`
- Item page → room: find shape where `shape.id === item.roomId` → use `shape.roomId` as Firestore room ID

**Item types and their `fpPlan` arrays**:

| `itemType` (URL/targetType) | `fpPlan` array | Notes |
|---|---|---|
| `door` | `doors[]` | has `subtype`, `width`, `inseamWidth`, `segmentIndex`, `position`, `swingInward`, `swingLeft`, `name` |
| `window` | `windows[]` | has `width`, `inseamWidth`, `segmentIndex`, `position`, `name` |
| `ceiling` | `ceilingFixtures[]` | has `subtype`, `x`, `y`, `name` |
| `recessedLight` | `recessedLights[]` | has `x`, `y`, `label`, `notes`, `name` |
| `wallplate` | `wallPlates[]` | has `slots[]`, `segmentIndex`, `position`, `targetIds[]`, `notes`, `name` |
| `fixture` | `fixtures[]` | has `fixtureType` (`toilet`/`sink`/`tub`), `orientation` (0–3), `x`, `y`, `name` |
| `plumbingEndpoint` | `plumbingEndpoints[]` | has `endpointType` (`spigot`/`stubout`), `subtype` (cold/hot/both), `x`, `y`, `name` |
| `plumbing` | `plumbing[]` | legacy generic plumbing markers |

`planId` in routes = `floorId` (the floors Firestore doc ID = floorPlans doc ID).

---

#### Canvas Features

- SVG-based canvas with optional grid overlay
- Snap-to-grid in 0.25 ft (3-inch) increments; grid displays 4 tiers: 5ft dark, 1ft medium, 0.5ft light, 0.25ft very faint
- **Coords bar**: always visible above canvas — shows live position + segment info during draw/drag/edit; blank when idle
- SVG cursor label also shows position + segment length near the cursor
- Rectilinear room polygons (all 90° angles; L/T/U shapes supported)
- **Room link modal**: fresh Firestore query on open; unplaced rooms listed first; "Create new room" option; new-name field only shown when "Create new" is selected
- **Dimensions auto-save**: confirming the Dimensions modal immediately saves to Firestore
- Stairs shown with hatch pattern and label; connects-to floor shown in label

---

#### Item Placement and Auto-naming

Every item type has a default name assigned on placement. If the same default name already exists in the room, a suffix is appended ("Door", "Door 2", etc.):

| Type | Default name |
|---|---|
| Door (single) | "Door" |
| Door (french) | "French Door" |
| Door (sliding) | "Sliding Door" |
| Door (pocket) | "Pocket Door" |
| Window | "Window" |
| Toilet | "Toilet" |
| Sink | "Sink" |
| Tub/Shower | "Tub", "Shower", or "Tub/Shower" |
| Ceiling fixture | "Ceiling Fixture" |
| Recessed light | "Recessed Light" |
| Wall plate | "Plate" |
| Spigot | "Spigot" |
| Stub-out | "Stub-out" |

Items without a `name` field (placed before naming was added) fall back to the type label in all display contexts — never shown as blank.

---

#### Door Subtypes

Door `subtype` controls rendering:
- **`single`** (default): swing arc + hinge dot + jamb ticks; swing direction (inward/outward left/right) controls arc side
- **`french`**: center divider post; two short perpendicular panel indicators (≈10 inch) projecting inward or outward; dashed connecting line between tips; hinge dots at each end; "FR" label. **No arc** (arc was removed because arc radius < chord caused SVG to render a large incorrect arc)
- **`sliding`**: two overlapping offset panel rects side-by-side; no arc; "SL" label
- **`pocket`**: dashed rect inset into wall (pocket cavity); solid panel line; "PK" label

Door edit modal shows swing controls that vary by subtype:
- `single` / `pocket`: single swing-direction select (inward-left / inward-right / outward-left / outward-right)
- `french`: separate inward/outward select only (no left/right)
- `sliding`: swing group hidden (no swing for sliding doors)

---

#### Ceiling Fixture Subtypes

`subtype` controls symbol:
- `fan`: 4-blade fan wheel
- `fan-light`: fan wheel + small filled circle at center
- `drop-light`: circle with center dot (pendant)
- `chandelier`: circle + 4 arms with dots at tips
- `flush-mount`: concentric filled rings
- `solar`: 6-ray sun symbol + filled center circle — for solar lights on outdoor/yard floor plans
- `generic`: 8-ray starburst + bulb (default fallback)

Backward compat: `category === 'ceiling-fan'` maps to subtype `fan`.

---

#### Layout Fixtures (Toilet / Sink / Tub/Shower)

Placed via 🛁 **Fixtures flyout** in Layout mode Row 2. Click inside a room to drop immediately (no modal).

- `fixtureType`: `toilet` | `sink` | `tub`
- `orientation`: 0 = north, 1 = east, 2 = south, 3 = west (rotated 90° clockwise per step)
- Rotate button (⟳) in Row 3 cycles orientation 0→1→2→3→0 with silent-save
- Draggable in Layout/Select mode; Edit Marker opens modal with name/orientation/notes/delete
- Toilet: rounded rect (tank, against wall) + oval (bowl, into room)
- Sink: rectangle with circle (drain) inside
- Tub/Shower: tub = rect + inner oval; shower = rect with diagonal cross-hatch; combo = tub render + shower-head dot

---

#### Plumbing Endpoints

Placed in Plumbing mode. Click inside a room to drop (no modal for spigot; modal for stub-out).

- **Spigot** (`endpointType: 'spigot'`): blue circle with nozzle stub and "SP" label
- **Stub-out** (`endpointType: 'stubout'`): circle with letter — "C" (cold, blue), "H" (hot, red), "C/H" (both, purple)
- **Sprinkler head** (`endpointType: 'sprinkler'`): blue circle with spray arc above and "SPR" label — for outdoor/yard floor plans
- Draggable in Plumbing/Select mode; Edit Marker opens modal with name/subtype/notes/delete

---

#### Wall Plates

🔌 Plate tool in Electrical mode. Placed on room walls.

- 1–4 slots per plate; each slot: `type` (switch/outlet) + `subtype` (single-pole/3-way/dimmer/smart for switches; standard/GFCI/220V/USB for outlets)
- Plate width scales with slot count (14px per slot + padding); per-slot symbols and vertical dividers rendered
- Selected: orange stroke + light yellow fill
- Edit Marker modal: slot rows with add/remove (max 4), type/subtype pickers, controls field, breaker link, position-from-wall, notes, save/cancel/delete
- `targetIds[]`: list of ceiling fixture and recessed light IDs this plate controls (same-room wiring)

**External switch slots** — per slot, a switch can be marked "External" to document it controls items outside the current room:
- Checkbox "External (controls items outside this room)" on each switch slot
- When checked, an **External Targets** sub-section appears with target chips and an **Add External Target** button
- **Add External Target** opens a picker: Floor → Room → Item (any floor plan item in any room on any floor, including the Outside floor)
- Target name defaults to the item's display name; editable before saving
- Saved targets shown as removable chips (name + room/floor location)
- Slot symbol renders with `*` appended when external (e.g. S→S\*, 3S→3S\*, D→D\*)
- `slot.external: true` + `slot.externalTargets: [{id, name, floorId, floorName, roomId, roomName, planId, fpItemId}]` stored in Firestore inside the wall plate array

---

#### Recessed Lights

◎ Recessed tool in Electrical mode. Click inside room to drop immediately (no modal).

- Outer circle r=9px white fill, inner circle r=5px light grey
- Drag to reposition; Edit Marker for label/notes; supports Facts/Problems/Activities via `targetType: 'recessedLight'`

---

#### 3-Row Toolbar

**Row 1 — Mode bar** (dark navy): `Layout` | `Electrical` | `Plumbing` — exactly one active; Layout is default. Switching modes: clears selection, resets to Select tool, exits drawing/target-edit.

**Row 2 — Tool bar** (shows by active mode):
- Layout: Select, Room, Type (📐), Door, Window, Fixtures flyout (Toilet/Sink/Tub)
- Electrical: Select, Plate, Ceiling, Recessed, Dim toggle (checkbox)
- Plumbing: Select, Spigot, Stub-out, Dim toggle (checkbox)

**Row 3 — Properties bar** (amber tint): appears when any item is selected in Select mode.
- Shows item type label
- In **edit mode** for non-room items: **Edit Marker**, **Remove**, **Details →** (navigates to `#floorplanitem/{planId}/{itemType}/{itemId}`)
- In **view mode** for non-room items: **View Marker** (opens modal read-only), **Details →** only — Remove is hidden
- **Rotate** (⟳) button: fixtures only; edit mode only; cycles orientation
- **Edit Targets** button: wall plates in Electrical mode only; edit mode only; enters target-selection mode
- For rooms in edit mode: **Edit Room** button (no Remove, no Details); in view mode: **View Room**

Layout items (rooms, doors, windows, fixtures) can only be interacted with in Layout mode. Electrical items only in Electrical mode. Plumbing items only in Plumbing mode.

---

#### Electrical Overlay

- **Dim toggle**: when checked (default), structural SVG group renders at 25% opacity
- **Wiring lines**: when a wall plate is selected, dashed colored lines draw from plate to each target fixture (blue/red/purple/cyan per slot)
- **Edit Targets**: Row 3 "Edit Targets" → target-selection mode; linked fixtures shown with amber ring + warm fill + center dot; available fixtures shown with dashed teal ring; click to toggle; Done/Escape exits and saves silently
- **3-way auto-detection**: two or more plates sharing the same target → both plates show a purple "3-way" badge (Electrical mode only)

---

#### Drag and Drop Behavior

- **Room drag**: moves entire polygon + all floating items in the room (ceiling fixtures, recessed lights, fixtures, plumbing, plumbingEndpoints). Wall-attached items (doors, windows, wall plates) move automatically since they use `segmentIndex + position` relative to the wall
- **Door / window drag**: slides along the item's current wall segment. **0.3 ft minimum movement threshold** before drag starts — prevents a tap-to-select from nudging the item (same guard as room drag's 0.15 ft threshold)
- **Ceiling fixture, recessed light, fixture, plumbing endpoint drag**: free-form reposition anywhere inside the room
- **Tap (no drag)**: selects the item without moving it; `fpSelectMarker` is called only if no drag occurred
- **Auto-select on add**: after placing any new item, tool auto-switches to Select and the new item is pre-selected
- **Silent-save on drag**: all drags call `fpSilentSave()` on mouseup — position persists without pressing Save

---

#### Drawing Modes

**Free Draw**: click corners; Enter key places a corner without an exact click; close-shape hit radius 20px.

**Type Numbers** (📐 Type): click canvas to set anchor → type command string (e.g. `14, R, 21, R, 14`) → live SVG preview → Save Room. Direction tokens: R/L/U/D. Status badge shows if shape closes cleanly.

---

#### Zoom

- Slider (25%–800%); mouse wheel; two-finger pinch (all centered on focal point)
- Double-click zoom label → reset to 100%
- Resets to fit-to-window on every plan load

---

#### Corner Editing

**Drag**: drag a corner handle dot; coords bar shows live cyan/orange wall lengths for the two adjacent segments.

**Double-click**: inline edit mode — two number inputs (cyan/orange) for the adjacent wall lengths; Enter/Escape exits.

### Floor Plan Item Detail (`floorplanitem.js`)
A detail page for any individual floor plan object (door, window, fixture, recessed light, etc.).

**Route**: `#floorplanitem/{planId}/{itemType}/{itemId}`
- `planId` = Firestore `floorPlans` doc ID (same as the floor's Firestore ID)
- `itemType` = one of: `door`, `window`, `ceiling`, `recessedLight`, `wallplate`, `fixture`, `plumbingEndpoint`, `plumbing`
- `itemId` = the item's `id` field within the plan array

**Features**:
- Page header shows item display name (falls back to type label if no name set) with a **Rename** button
- Inline name-edit row (hidden until Rename clicked): text input + Save/Cancel; saves by updating the relevant array in the `floorPlans` doc
- Meta line: type badge (human-readable, e.g. "Ceiling Fan", "Pocket Door", "Tub/Shower") + room link + "Floor Plan" link
- Breadcrumb: House › Floor Name › Room Name › Item Name
- **Cross-entity sections**: Problems/Concerns, Facts, Quick Task List, Activity History, Photos — all wired via `targetType = itemType`, `targetId = itemId` using the existing cross-entity helpers
- Entry point from floor plan canvas: **"Details →"** button in the Row 3 Properties bar appears for all non-room selected items

**"Items in this Room" section on Room detail page**:
- Appears at the bottom of the room detail page (`page-room`)
- Loads `floorPlans` doc for the room's floor; collects all items across all arrays where `item.roomId === room.id`
- Grouped by: **Layout** (doors, windows, fixtures), **Electrical** (ceilingFixtures, recessedLights, wallPlates), **Plumbing** (plumbingEndpoints, plumbing)
- Each row shows: type icon + type label + item display name + "Details →" link to `#floorplanitem/{planId}/{itemType}/{itemId}`
- Empty state shown if no floor plan exists or room has no items

**Floor Plan Item Rollup — Open Concerns and Active Projects (Phase 4)**:
- Rendered by `loadFpItemRollup()` (room/floor scope) and `loadFpItemRollupForHouse()` (house scope) in `house.js`
- **Room detail page** (`page-room`): "Open Concerns — Items in this Room" + "Active Quick Tasks — Items in this Room"
- **Floor detail page** (`page-floor`): "Open Concerns — Items on this Floor" + "Active Quick Tasks — Items on this Floor" — appears below the floor plan thumbnail
- **House detail page** (`page-house`): "Open Concerns — Whole House" + "Active Quick Tasks — Whole House" — appears after the Projects panel
- Each section is **collapsed by default**; click header to expand. Section only renders if count > 0.
- Header shows a blue count badge; arrow rotates 90° when expanded.
- Expanded view: rows with type icon + item display name + concern/project title + "Details →" link to `#floorplanitem/{planId}/{itemType}/{itemId}`
- Data: queries `problems` where `targetType in FP_ITEM_TYPES` and `status == 'open'`; queries `projects` where `targetType in FP_ITEM_TYPES` then filters `status !== 'complete'` in-memory
- Room scope uses `shape.roomId === room.id` to find the fp shape, then filters items by `item.roomId === shape.id`
- House scope loads all floor plan docs in parallel via `Promise.all`

**Electrical Controls — Reverse Lookup (room detail page only)**:
- Section appears on `page-room` below the rollup, rendered by `loadRoomElectricalControls(roomId)` in `house.js`
- Scans all `floorPlans` docs; for each wall plate slot where `slot.external === true`, checks if any `slot.externalTargets[].roomId` matches the current room
- If matches found, renders an "⚡ Electrical Controls" section listing each target (name, location) and the controlling wall plate (floor plan link)
- Useful on "Outside" floor rooms (e.g. "Firepit Area") — shows which indoor switch controls the flood light or solar light placed there
- No dedicated Firestore collection; scan is O(floors × plates) which is acceptably small for a home

### Breaker Panel (`house.js`)
Tracks the electrical breaker panel as a grid of slots.

**Firestore**: `breakers` — per-slot records with `slotNumber`, `label`, `amperage`, `type`, `status`, `notes`

**UI**: Visual grid matching the physical panel layout; color-coded by status; add/edit each slot's label and details.

---

## Part 4: Garage

**Plan document**: `Garage.md`

The Garage section mirrors the House section structure but is separate. It pre-seeds two default garage rooms ("Garage" and "Attic") on first visit.

**Firestore collections**: `garageRooms`, `garageThings`, `garageSubThings`

**Routes**: `#garage` (room list), `#garageroom/{id}`, `#garagething/{id}`, `#garagesubthing/{id}`

**Features**: Same as House — Things, Sub-Things, and their cross-entity sections (Facts, Problems, Quick Task List, Activities, Photos, Calendar Events). LLM photo identification also available.

**Detail page layouts**: All three detail pages (garage room, garage thing, garage subthing) use collapsible `.detail-acc` accordions, all collapsed by default with item count badges. Garage room sections: Photos, Things, Activity History, Calendar Events, Problems/Concerns, Facts, Quick Task List. Thing and sub-thing pages follow the same pattern.

---

## Part 5: Structures

**Plan document**: `YardStructures.md`

Outdoor structures separate from the main house — sheds, decks, pergolas, gazebos, pools, etc.

**Firestore collections**: `structures`, `structureThings`, `structureSubThings`

**Routes**: `#structures` (list), `#structure/{id}`, `#structurething/{id}`, `#structuresubthing/{id}`

**Features**: Full feature set — Facts, Problems (roll-up), Quick Task List (roll-up), Activities, Photos, Calendar Events. Same hierarchy as House but without floor plans or breaker panels.

**Detail page layouts**: All three detail pages (structure, structure-thing, structure-subthing) use collapsible `.detail-acc` accordions, all collapsed by default with item count badges. Structure page sections: Photos, Things (hidden unless `isStorage=true`), Activity History, Calendar Events, Problems/Concerns, Facts, Quick Task List. Thing and Sub-thing pages follow the same pattern.

---

## Part 6: Vehicles

**Plan document**: `Vehicles.md`

Tracks vehicles with maintenance history, mileage, and documentation.

**Firestore**: `vehicles` — `year`, `make`, `model`, `trim`, `color`, `vin`, `licensePlate`, `purchaseDate`, `purchasePrice`, `notes`, `archived`, `archivedAt`, `archivedReason`, `profilePhotoData?`, `createdAt`

**Routes**: `#vehicles` (list), `#vehicle/{id}` (detail)

**Archival**: Vehicles can be marked as sold/gone with an optional reason. Archived vehicles move to a collapsed "Archived" section on the list — they are not deleted, so their full history is preserved.

**Mileage Log**:
- **Firestore**: `mileageLogs` — `vehicleId`, `date`, `mileage`, `notes`, `createdAt`
- Add odometer reading entries; displayed newest-first with delete buttons
- Can be logged via SecondBrain ("Add 35K miles to the truck")

**Detail page layout**: All sections are collapsible accordions (`.detail-acc`). Vehicle Info is expanded by default; all others start collapsed. Count badges populate after each section loads (Vehicle Info has no count — it's a form). Sections: Vehicle Info, Mileage Log, Photos, Activity History, Calendar Events, Problems/Concerns, Facts, Quick Task List.

**[Shared]**: Facts, Problems, Quick Task List, Activities, Photos, Calendar Events

---

## Part 7: Collections

**Plan document**: `Collections.md`

Tracks physical collectible inventories. Each collection is a named list with a type; each item within it has type-specific fields.

**Firestore**:
- `collections` — `name`, `type`, `label1/2/3` (generic custom labels), `beneficiaryContactId?`, `createdAt`
- `collectionItems` — `collectionId`, `name`, `typeData{}`, `acquiredDate`, `pricePaid`, `estimatedValue`, `notes`, `locationRef{}`, `profilePhotoData?`, `beneficiaryContactId?`, `createdAt`

**Routes**: `#collections` (list), `#collection/{id}` (collection detail), `#collectionitem/{id}` (item detail)

### Collection Types

| Type | Type-Specific Fields | Sort Order | Filter Field |
|------|---------------------|------------|--------------|
| Comics | series, issueNumber, variant, publisher, year | Series A-Z → issue # | series |
| Records/Albums | format, artist, album, label, year | Format → artist → album | artist |
| Hats | style, color, brand, year | Name A-Z | name |
| Hat Pins | description | Name A-Z | name |
| Beanie Babies | style, year, hasTags | Name A-Z | name |
| Ceramic Stadiums | team, year | Name A-Z | name |
| Books & Magazines | type (Book/Magazine), author, publisher, year, isbn, issueDate | Name A-Z | title + author |
| Generic | label1/2/3 values (custom labels per collection) | Name A-Z | name |

### Collection List Page
- Shows all collections as cards with item count + total estimated worth
- Add Collection button

### Collection Detail Page
- Item count + total estimated worth in header
- Client-side filter bar (search field pre-labeled by type, e.g., "Filter by series…")
- Item rows with: 48×48 thumbnail (if set), name, key field (author/artist/etc.), estimated value
- Add item (manual) and `+Photo` (LLM identification) buttons

### Collection Item Detail Page
- Full type-specific fields in an info card
- Acquired date, price paid, estimated value
- Location reference (free-text, e.g., "Shelf 3, Box B")
- Photos (gallery, with thumbnail support)

### Thumbnails
- `profilePhotoData` stored on each `collectionItems` document
- Auto-set from the first photo added (LLM or manual `+Photo`)
- Multiple photos: "⭐ Use as Thumbnail" button in the photo gallery
- Shown as 48×48 image in the item list row

### LLM Identification for Collections
- User taps `+Photo` → opens photo staging modal
- Photo sent to LLM with type-specific prompt (returns JSON matching the type's schema)
- Result shown in a review modal (`collectionShowResultModal`)
- On confirm: item saved to Firestore, thumbnail auto-set, photo stored
- "Add Another" button: resets modal for next item without leaving the page
- **Race condition handling**: `loadCollectionPage()` is deferred 100ms after `collectionShowResultModal()` updates the DOM, so the re-render doesn't race with the modal update

---

## Part 8: Life

**Plan document**: `PersonalPlan.md`

The Life section covers personal tracking — journal, people, health, notes, and major life events.

### Journal (`journal.js`)
Daily entry logging with optional tracking metrics.

**Firestore**:
- `journalEntries` — `date`, `entryTime` (HH:MM), `entryText`, `mentionedPersonIds[]`, `placeIds[]`, `photos[]` (each: `{imageData, caption}`), `isCheckin` (bool), `sourceEventId?`, `sourceVisitId?`, `createdAt`, `updatedAt`
- `journalTrackingItems` — `date`, `category`, `value`, `createdAt`
- `journalCategories` — `name`, `createdAt`
- `lifeEventLogs` — `logDate`, `logTime`, `body`, `eventId`, `mentionedPersonIds[]`, `createdAt` (mini logs from Life Calendar)

**Routes**: `#journal` (list), `#journal-entry` (add/edit), `#journal-tracking` (tracking entries), `#journal-categories` (manage categories)

**@Mentions**: Typing `@` in the entry text triggers an autocomplete dropdown filtered to contacts marked "Include in quick mentions". Typing `@@` opens the full contact list. Quick-mention contacts are flagged via a checkbox on the contact add/edit modal (`quickMention` field in Firestore). This behavior applies in journal entries, memories, and life calendar mini-logs.

**Date range filter**: Sticky per-user preference (7/30/60/90 days or custom) saved to `userCol('settings').doc('journal')`.

**Tracking items**: Numeric values logged per category per day (e.g., weight, mood, blood pressure). A trend view shows all values for a selected category over time.

**Life Event Logs integration**: Mini log entries from Life Calendar events appear inline in the journal feed. Toggle "Show Event Notes" to show/hide them.

**Filter panel**: A panel on the right side of the journal page (stacks above the feed on mobile) containing three controls:
- **Category dropdown** — lists all tracking categories with the most recent logged date in parentheses (e.g. "Hair Cut (04/17/2026)"). Default is "No Filter". When a category is selected, the feed shows only tracking items for that category in the current date range. Empty state shows "No '[Category]' entries in this date range." Selection is persisted in `localStorage`.
- **Check-Ins Only** checkbox — hides all non-check-in journal entries from the feed. CSS-only via `journal-feed--checkins-only` class.
- **🌐 All Activity** toggle — see below.

**All Activity toggle** (`🌐 All Activity` checkbox in the filter panel): Replaces the normal journal feed with a unified timeline of everything logged across the entire app. Fires 21 parallel Firestore reads (9 entity-name map reads + 12 collection range queries) filtered to the same date range as the journal, capped at today (past-only). Collections covered: `journalEntries`, `journalTrackingItems`, `lifeEventLogs`, `activities`, `calendarEvents`, `healthVisits`, `healthAppointments`, `concernUpdates`, `healthConditionLogs`, `bloodWorkRecords`, `vitals`, `peopleInteractions`. Each result is normalized into `{ sortDate, sortTime, type, icon, typeLabel, typeBg, typeColor, title, subtitle, route }`, merged, and sorted date-desc → time-desc → createdAt-desc. Pagination: first 50 items render; a "Show 50 more (N remaining)" button appends the next page while preserving scroll position. Each card shows a colored type badge, title (clamped to 2 lines), optional subtitle (entity name), and a `›` arrow when tappable. Journal entries open their edit modal; all other types navigate to the relevant detail or list page. Toggle state persists in `localStorage`. The "Show Event Notes" toggle is dimmed while All Activity is active.

**Journal entry form — date field**: The date/time row shows the day of week (e.g., "Friday") inline between the date picker and time picker as a quick reference. Updates live as the date changes.

**Photos on journal entries**: The entry form has a Photos section with a **📷 Camera** button (opens camera on mobile), a **🖼️ Gallery** button (file picker, camera capture attribute removed so gallery opens), and **paste** support (pasting an image into the textarea captures it). Photos are compressed client-side via `compressImage()` (same as photos.js). Thumbnails appear in an 80×80px strip below the buttons; each has a ✕ remove button. Photos are stored as `photos: [{imageData, caption}]` on the `journalEntries` Firestore document. In the journal feed, photos render as 90×90px clickable thumbnails; tapping opens a full-screen lightbox overlay (click or Escape to close). Caption field is saved but not yet displayed.

**Place linking**: Journal entries can be linked to one or more places (`placeIds[]`). When an entry was created via the Check-In flow (`isCheckin: true`), a check-in badge (📍 checked-in) is shown in the journal feed. The entry form shows a "Place" search field to attach a place; if none exists it auto-creates one via `placesSaveNew()`.

**Check-in flow**: The "📍 Check In" button (on the QuickLog screen and SecondBrain) opens the check-in picker modal. User selects a venue (GPS-based nearby list or name search) → navigates to a new journal entry pre-filled with that venue (`isCheckin: true`, place locked in). The **journal entry form also has a "📍 Check In" button** in the Places section header — it opens the same picker modal but applies the selected venue to the *current* entry instead of creating a new one (`_checkinPickerCallback` pattern). A "Change Location" button appears after check-in to re-open the picker. "Enter Manually" in the picker works in both flows.

**Tab key**: In the journal entry textarea, if the @mention dropdown is open, Tab selects the first name in the list (same as clicking it) and keeps focus in the textarea. If the dropdown is not open, Tab inserts 4 spaces (handled by `_initTabIndentTextareas` in `app.js`).

**📋 Copy button**: A small "📋 Copy" button appears below the entry textarea (above the @mentions chips row). Tapping it copies the full entry text to the clipboard and briefly shows "Copied!" on the button as confirmation.

**Clipboard safety copy**: When the user taps Save on a journal entry, the entry text is silently copied to the clipboard before the Firestore write is attempted. This is a silent background operation (no toast/confirmation shown) — it ensures the text is recoverable if the save fails due to a network error or Firestore issue.

**Voice-to-text** (`initVoiceToText` in `journal.js`): 🎤 Speak button uses the Web Speech API (`continuous: true`). Spoken punctuation words are converted by `applySpokenPunctuation()`. Editing commands are handled by `_applyVoiceEditCommand()` and execute on the textarea directly — they are never appended as text. Commands must be spoken as their own phrase (pause before and after): — **"new line"** → inserts `\n` — **"new paragraph"** → inserts `\n\n` — **"delete last word"** → removes the last word — **"delete last sentence"** → removes everything after the last `.` `!` or `?` (clears all if no sentence boundary found) — **"clear all"** → empties the textarea. Full punctuation command list: period, comma, question mark, exclamation point, colon, semicolon, dash, hyphen, ellipsis, dot dot dot, open/close paren.

### Contacts (`contacts.js`)

Renamed from "People". Tracks personal contacts and medical/service professionals and facilities.

**Firestore** (collection name unchanged: `people`):
- `people` — `name`, `nickname`, `category` (see below), `specialty?`, `personalType?`, `businessType?`, `ownerContactId?` (Pet only — FK to another `people` doc), `ownerName?` (Pet only — denormalized name for display), `phone`, `email`, `address`, `website?`, `facebookUrl`, `howKnown`, `notes`, `quickMention` (bool), `isMe` (bool — exclusive; only one contact may have `true` at a time; a "Me" contact is auto-created via `ensureMeContact()` on first Contacts page load; the Me contact cannot be deleted or renamed; its name field is read-only in the edit modal and the delete button is hidden; saving a different contact with `isMe=true` clears the flag on all others via batch write; shown as a green "✓ This is me" badge on the detail page; used by Investments and Health as the default subject), `profilePhotoData?`, `parentPersonId?`, `createdAt`
- `peopleImportantDates` — `personId`, `label`, `month`, `day`, `year?`, `recurrence`, `createdAt`. The `label` input is a datalist combobox with built-in suggestions (Birthday, Wedding Anniversary, Graduation, Work Anniversary); any free-form text is also accepted.
- `peopleInteractions` — `personId`, `date`, `text`, `sourceType`, `createdAt`
- `lookups/serviceTrades` — `{ values: [...] }` full list of trades (defaults: Plumber, Electrician, HVAC, Pest Control, Handyman)
- `lookups/personalContactTypes` — `{ values: [...] }` full list of relationship types (defaults: Friend, Family, Neighbor, Coworker, Acquaintance)
- `lookups/businessTypes` — `{ values: [...] }` full list of business categories (defaults: Electronics Store, Garden Store, Restaurant, Hardware Store, Grocery Store)

**Contact type categories** (stored in `category` field):
- **Personal** — shows `personalType` dropdown (Friend, Family, Neighbor, Coworker, Acquaintance + user-defined); types stored in `lookups/personalContactTypes`; on-the-fly add in modal
- **Medical Professional** — shows `specialty` text input with datalist (~35 built-in options); custom specialties saved to `lookups/specialties`
- **Medical Facility** — clinic, hospital, lab, pharmacy
- **Service Professional** — shows `trade` dropdown (Plumber, Electrician, HVAC, Pest Control, Handyman + user-defined); trades stored in `lookups/serviceTrades`; on-the-fly add in modal
- **Business** — shows `businessType` dropdown (Electronics Store, Garden Store, Restaurant, Hardware Store, Grocery Store + user-defined); types stored in `lookups/businessTypes`; on-the-fly add in modal
- **Pet** — shows `ownerContactId` ContactPicker (links to any other contact as the owner); `ownerName` is denormalized for display; owner shown as a tappable link on the pet's contact detail page
- **Other**

**Contact Types settings page** (`#settings-contact-lists`): Accessible from Settings hub (tile renamed from "Contact Lists" to "Contact Types"). Three cards — "Service Trades", "Personal Contact Types", and "Business Types". Each shows a list of all items with Rename and Delete buttons per item. An "Add" input at the bottom adds new items. Changes are saved immediately to Firestore.

**Routes**: `#contacts` (list), `#contact/{id}` (detail). Legacy `#people` / `#person/{id}` redirect to the new routes.

**Hierarchy**: Sub-contacts (`parentPersonId`) allow grouping (e.g., family members under a parent record). The sub-contacts section heading dynamically adapts: **"Family Members"** for Personal/other categories, **"Staff"** for Medical Facility contacts. The empty-state text also adapts accordingly.

**Contact detail sections**:
- Contact info: specialty (Medical Professional only), phone (tel: link), email (mailto: link), address (Google Maps link), website (external link), Facebook, how known, notes
- Important dates: birthdays, anniversaries — shown on contact detail and referenced in calendar
- Photos: full gallery, profile photo support
- Interactions: log of meetings/conversations
- Shared life events: Life Calendar events tagged with this contact
- Facts

**ContactPicker component** (`buildContactPicker(containerId, options)`): Reusable searchable dropdown that filters contacts by category. Used by Care Team (Phase 2), Appointments (Phase 3), and other health features. Supports inline contact creation via `allowCreate: true`. When `filterCategory` is set, queries all contacts with that category (including sub-contacts like staff under a Medical Facility) — a staff member with `category: 'Medical Professional'` will appear in the provider picker even if they have a `parentPersonId`. Supports `facilityPickerId` option: when the provider field is focused with an empty query and a facility is already selected, the dropdown immediately shows all staff sub-contacts of that facility (filtered by category) under a "Staff at [Facility]" header — single tap to select.

**List view**: Category badge with color coding (green = Personal, blue = Medical Professional, purple = Medical Facility, orange = Service Professional, grey = Other). Specialty shown as subline for Medical Professionals; address shown for Medical Facilities.

### Health (`health.js`)

**Plan document**: `HealthEnhancements.md`

A comprehensive medical tracking hub. Health data can be tracked for any contact (family members, pets, etc.) via the **Track Health For** contact strip at the top of the hub.

**Track Health For strip** (CH4+CH5):
- Appears at the top of My Health hub, above the tile grid
- Shows contact cards for all tracked contacts; "Me" is always first and cannot be removed
- **Active contact** card has a blue border/tint + ✓ badge; tapping any card switches the active context
- `window.healthActiveContactId` — in-memory session state, **always resets to Me on every entry** to the health hub; preserved while navigating child pages within the session
- **+ Add Person** card opens a ContactPicker modal to add any contact to the tracked list
- **Remove button** on non-Me cards — confirms before removing (does not delete records)
- **Emergency Info and Care Team tiles are hidden** (not just grayed) when a non-Me contact is active
- Tracked contacts stored in `userCol('healthTrackedContacts').doc('default')` — field `contactIds: string[]`

**Sub-page scoping (CH6+CH7)**:
- All health sub-pages (allergies, supplements, vaccinations, eye, health visits, medications, conditions, concerns, blood work, vitals, insurance, appointments) filter Firestore reads by `contactId == window.healthActiveContactId`
- Each sub-page header shows " — PersonName" suffix when a non-Me contact is active (e.g., "Allergies — Max")
- Writes on all sub-pages stamp `contactId: window.healthActiveContactId || null`
- Records created via step-2 post-visit flow (concernUpdates, healthConditionLogs, new concerns, new conditions) inherit `contactId` from the parent visit/concern rather than from `window.healthActiveContactId`
- Page-refresh safety: if `window.healthActiveContactId` is null when a sub-page loads, `_healthEnsureActiveContact()` falls back to Me automatically

**My Health main page tile order** (2-column grid):
Row 1: Conditions, Concerns | Row 2: Appointments, Health Visits | Row 3: Medications, Supplements | Row 4: Blood Work, Vitals | Row 5: Insurance, Emergency Info (hidden for non-Me) | Row 6: Vaccinations, Allergies | Row 7: Eye / Glasses | Row 8: My Care Team (full-width, hidden for non-Me)

**My Care Team** (`#health-care-team`):
- Dedicated page listing the user's medical care team
- Data: `userCol('healthCareTeam').doc('default')` — single document with `members[]` array
- Each member: `{ role (free text), providerContactId?, facilityContactId? }`
- Member cards show role, provider (tappable link → `#contact/{id}`), facility (tappable link)
- "+ Add Member" button → modal with Role input + ContactPicker for provider (Medical Professional) + ContactPicker for facility (Medical Facility)
- Both provider and facility are optional per member
- Edit / Remove per member (Remove confirms before deleting)

**contactId on health records**: Every health record (except `emergencyInfo` and `healthCareTeam` which are Me-only) carries a `contactId` field linking the record to a contact (from the `people` collection). New records are stamped `contactId: null` at write time; a one-time migration (`runHealthContactMigration()`, triggered on health page load, guarded by `settings/appState.healthConverted`) back-fills existing null records with the Me contact's ID.

**Firestore collections** (all under `userCol`):

| Collection | Key Fields |
|------------|------------|
| `healthVisits` | contactId, date, type, facilityContactId, providerContactId, providerText, concernIds[], conditionIds[], reason, whatWasDone, outcome, cost, notes, linkedJournalEntryId? |
| `medications` | contactId, name, dosage, purpose, prescribedBy, startDate, endDate, status (active/completed), type (Ongoing/Short-term/As-needed), concernIds[], conditionIds[] |
| `concerns` | contactId, title, bodyArea, startDate, status (open/resolved/promoted), resolvedDate, summary, promotedToConditionId, promotedDate |
| `concernUpdates` | contactId, concernId, date, note, painScale?, type (manual/system/visit-note), visitId? |
| `conditions` | contactId, name, category, diagnosedDate, diagnosedBy, status (active/managed/resolved), managementNotes |
| `healthConditionLogs` | contactId, conditionId, date, note, painScale, type (manual/system/visit-note), visitId?, createdAt |
| `bloodWorkRecords` | contactId, date, lab, orderedBy, notes, markers[] (name/value/unit/referenceRange/flagged) |
| `vitals` | contactId, date, time, type (BP/HR/O2/Glucose/Temp/Other), value1, value2, unit, notes |
| `supplements` | contactId, name, dosage, brand, reason, frequency, startDate, endDate, status (active/stopped) |
| `vaccinations` | contactId, name, date, dateApproximate, provider, lotNumber, nextDueDate |
| `eyePrescriptions` | contactId, date, type (Distance/Reading), rightEye{}, leftEye{}, pd, provider |
| `insurancePolicies` | contactId, type, carrier, planName, memberId, groupNumber, policyNumber, startDate, endDate, premiumAmount, deductible, outOfPocketMax, beneficiaries, customerServicePhone, website, notes, status (active/inactive) |
| `allergies` | contactId, allergen, type, reaction, severity, dateDiscovered, notes |
| `emergencyInfo` | emergencyContacts[], allergies[], medicalAdvances, dnr, notes — **Me-only, no contactId** |
| `healthCareTeam` | members[] — **Me-only, no contactId** |
| `healthAppointments` | contactId, date, time, type, facilityContactId, providerContactId, concernIds[], conditionIds[], notes, status (scheduled/completed/cancelled/converted), linkedVisitId |
| `healthTrackedContacts` | Single doc `default` — `contactIds: string[]` (Me is always first; cannot be removed) |

**Appointments** (`#health-appointments`): List page shows Overdue / Upcoming / Past sections. Each card shows: type badge, date/time (tappable — opens edit modal, same as Edit button), Facility (tappable link to `#contact/{id}` if contactId set), Provider (tappable link or plain text), concern/condition chips, notes. Actions: Edit (hidden on converted), ✓ Mark Done (scheduled/overdue only), View Visit link (if linkedVisitId set). **Delete and Cancel Appointment are in the edit modal** (not the card). Edit modal bottom row: left side has Delete (always shown when editing) + Cancel Appt (shown only for active appointments — not cancelled/completed/converted); right side has Close + Save. "Cancel Appt" saves current notes field + sets `status: 'cancelled'` in one step, then closes modal. Add/Edit modal: date, time, type dropdown (Dr. Visit / Specialist / Follow-up / Physical or Annual / Urgent Care / Emergency / Dental / Eye Exam / Lab or Test / Procedure), status, Facility ContactPicker (Medical Facility, allowCreate), Provider ContactPicker (Medical Professional, allowCreate, optional), scrollable concern/condition checkbox list (open concerns + active/managed conditions), notes. Mark Done → opens `apptConvertModal` to create a Health Visit; on save sets `status: 'converted'` and `linkedVisitId`. Converted appointments show no Edit button and a "View Visit" link.

**Health Visits** (`#health-visits`, `#health-visit/{id}`): List page shows visits in reverse-chronological order grouped by year. Each card shows: date, provider (resolved via contactMap: `providerContactId` → contact name, then `providerText`, then legacy `provider`), type badge. Visit detail page header shows "[Type] — [formatted date]" (falls back to "Visit — [date]" if no type). Detail rows: Facility (tappable link to `#contact/{id}` if `facilityContactId` set, or plain text from `facilityText`, hidden if neither set), Provider (tappable link or plain text, falls back to `providerText` then legacy `provider` field), Provider Type, Reason for Visit, What Was Done, Outcome/Next Steps, Cost, Notes. **"Visit Notes"** section (hidden when none): loads `concernUpdates` + `healthConditionLogs` where `visitId == visit.id`, renders each as "⚠️/📋 Name — note text" — view-only. "This visit covered" section: tappable concern chips (→ `#health-concern/{id}`) and condition chips (→ `#health-condition/{id}`) from `concernIds[]` / `conditionIds[]`; section hidden if both arrays empty. **"Notes & Meds ›"** button in the "This visit covered" header navigates to `#health-visit-step2/{id}` — accessible any time (not only immediately after Mark Done). **Edit visit modal**: provider pre-fills from `providerText` (falling back to legacy `provider`); concern/condition field is a multi-select checkbox list (open concerns + active/managed conditions) replacing the old single-select dropdown; saves to `providerText`, `concernIds[]`, `conditionIds[]`. Provider Type dropdown removed from the modal — when `providerContactId` is set, the detail page auto-pulls `specialty` from the contact record instead.

**Create Journal / View Journal button** (visit detail page header): Links a journal entry to the visit via one-to-one relationship. `linkedJournalEntryId` on the visit doc; `sourceVisitId` on the journal entry. Button shows "Create Journal" when no entry is linked, "View Journal" when one is. **Create Journal flow**: Gathers visit data asynchronously (facility, provider, reason, what was done, outcome, cost, notes, covered concern/condition names, visit-level notes from `concernUpdates`/`healthConditionLogs`, medications from `prescribedAtVisitId`, blood work from `orderedAtVisitId`). If an LLM is configured (`userCol('settings').doc('llm')`), shows a `confirm("Have AI create entry?")` prompt. **AI path**: fetches full history for all addressed concerns (all `concernUpdates`) and conditions (all `healthConditionLogs`), blood work markers, builds a system+user prompt asking for a personal journal entry (not a clinical note), calls the LLM (supporting OpenAI, Anthropic, Grok, OpenRouter), and populates the journal textarea with the response. **Manual path**: assembles labeled lines (Facility, Provider, Reason, etc.) plus a blood work summary line, pre-fills the textarea. In both paths, the journal entry date is set to the visit's date; time is set to the visit's time if present, otherwise defaults to the current time and a back-link `sourceVisitId` is saved on the journal entry; `linkedJournalEntryId` is saved on the visit doc after creation. Cancelling from a visit-sourced journal entry returns to the visit page. Journal entry shows a "View Visit ›" button when `sourceVisitId` is set.

**Concern Detail** (`#health-concern/{id}`): Collapsible-section layout. Summary card at top shows: title, status badge (Open/Resolved/Promoted), body area, since date, summary text, resolved date (if resolved), Edit + Mark Resolved/Reopen buttons. Collapsed section headers show a muted count badge, e.g. "Medications (2)", so the user knows records exist without expanding. Six collapsible sections — **Journal Updates** (starts expanded; all others start collapsed): — chronological log entries (date, pain scale, note) sorted date DESC, then `createdAt` DESC within the same date; entries from a visit show a clickable **"Visit ›"** chip next to the date — clicking navigates to `#health-visit-step2/{visitId}` where notes can be reviewed/updated; each entry has **Edit** and **Delete** buttons; Edit opens `concernUpdateModal` pre-filled (date, note, pain scale; `concernId`/`contactId` are not changed on update); Add Entry button opens `concernUpdateModal` in add mode; **Linked Medications** — medications whose `concernIds[]` includes this concern's id; shows name + dosage, Unlink button; "Link Medications" button opens `medPickerModal`; **Appointments & Visits** — appointments from `appointments` where `concernIds array-contains` + visits from `healthVisits` where `concernIds array-contains` (plus legacy `concernId == id`); each row shows date (tappable link) + type/provider meta; **Photos** — photo gallery; **Facts** — key-value facts. Med Picker overlay (`medPickerModal`): lists all non-discontinued medications as checkboxes, pre-checked if already linked; "Add New Medication" opens med modal and returns to picker on save (via `window._medPickerCallback`); Save applies `arrayUnion`/`arrayRemove` diffs in a Firestore batch. **"↑ Promote to Condition" button** at bottom opens `promoteModal`; hidden once promoted. **Archived state** (when `status === 'promoted'`): purple "Promoted to Condition" banner with date + "View Condition →" link appears; all edit controls hidden via CSS class `concern-archived`; page is read-only.

**Promote to Condition** (`promoteModal`): Pre-filled with concern title → Condition Name, body area → Category. On "Promote": queries all conditions for a case-insensitive name match. No match → creates new condition (`active`, diagnosed date from concern start date) then runs migration. Match found → shows conflict section: "Create New" (creates second condition) or "Merge into existing" (appends to existing condition). Migration (`_doPromotionWork`): copies `concernUpdates` journal → `healthConditionLogs` (prefixed "Imported from concern: [title] — "); adds `conditionIds arrayUnion` to all linked meds/appointments/visits; re-points photos from `targetType: 'concern'` to `targetType: 'condition'`; sets concern `status: 'promoted'`, `promotedToConditionId`, `promotedDate`; adds first condition log: "Promoted/Merged from concern: [title] on [date]." All in a single Firestore batch. After: navigates to the condition detail page.

**Condition Detail** (`#health-condition/{id}`): Collapsible-section layout (mirrors concern detail). Summary card at top shows: name, status badge (Active/Managed/Resolved), category, diagnosed date, management notes, cycle-status button (Active → Managed → Resolved → Active), Edit + Delete buttons. Collapsed section headers show a muted count badge (e.g. "Medications (1)") loaded alongside the section data. Six collapsible sections — **Journal** (starts expanded): log entries from `healthConditionLogs` (date, pain scale, note, type) sorted date DESC, then `createdAt` DESC within the same date; entries from a visit show a clickable **"Visit ›"** chip — navigates to `#health-visit-step2/{visitId}`; each entry has **Edit** and **Delete** buttons; Edit opens `conditionUpdateModal` pre-filled (date, note, pain scale; `conditionId`/`contactId`/`type` are not changed on update); Add Note button opens `conditionUpdateModal` in add mode; **Medications** (collapsed): medications whose `conditionIds[]` includes this id; Unlink button, "+ Add Med" → `openMedPicker('condition', id)`; **Appointments & Visits** (collapsed): queries `appointments` + `healthVisits` where `conditionIds array-contains id`; **Photos** (collapsed): targetType `condition`; **Facts** (collapsed): targetType `condition`; **Projects** (collapsed): targetType `condition`. Condition cards on the list page are tappable (click navigates to detail; button clicks do not bubble).

**Mark Done 2-Step Flow**: When an appointment is marked Done, the convert modal (Step 1) opens pre-filled from the appointment: date (today), time, visit type (from `appointment.type`), facility display (tappable link if `facilityContactId` set, or plain text from `facilityText`), "Who did you see?" text input (pre-filled from `providerText` or contact name). Legacy Provider/ProviderType fields replaced. Single concern dropdown removed — concern/condition linking carried forward from appointment. After saving the visit record (which copies `concernIds[]`, `conditionIds[]`, `type`, `facilityContactId`, `providerContactId` from the appointment), navigates to Step 2 (`#health-visit-step2/{visitId}`). Step 2 page: accordion list of all linked concerns/conditions (tagged ⚠️ Concern / 📋 Condition); each item has a **🎤 Speak** button next to the Notes label (voice-to-text via Web Speech API); if a note was previously saved for this concern/condition from this same visit, it is pre-loaded into the textarea for editing; saving updates the existing note rather than creating a duplicate. Medications sub-section: existing linked meds with ✕ unlink; **"+ New Med"** opens the Add Medication modal (visit pre-selected) — after save the med is auto-linked and the list refreshes; **"+ Link Existing"** opens the med picker overlay. Each type has two buttons: **"+ New Concern/Condition"** (inline stacked form — inputs are full-width for easy mobile typing; creates a new record + links it) and **"+ Add Existing Concern/Condition"** (inline select — loads open concerns / active conditions not already on the visit; selecting one links it via `arrayUnion` and adds it to the accordion). "Done → Visit" saves any non-empty notes as `concernUpdates` (type: 'visit-note', visitId) or `healthConditionLogs` (same) then navigates to `#health-visit/{id}`. Skipping notes is valid.

**Routes**: `#health`, `#health-visits`, `#health-visit/{id}`, `#health-visit-step2/{id}`, `#health-medications`, `#health-conditions`, `#health-condition/{id}`, `#health-concerns`, `#health-concern/{id}`, `#health-bloodwork`, `#health-bloodwork-detail/{id}`, `#health-vitals`, `#health-supplements`, `#health-vaccinations`, `#health-eye`, `#health-insurance`, `#health-insurance-detail/{id}`, `#health-emergency`, `#health-appointments`, `#health-allergies`

**Blood Work LLM Import**: User pastes lab report text → LLM extracts structured markers (name, value, unit, reference range, flagged status) → editable preview before save.

**Medication Photos**: Each medication card has a "Photos" button that opens a dedicated photo modal with Camera / Gallery / Paste upload options. Photos stored in `photos` collection with `targetType: 'medication'`.

**Scan Rx Label (LLM Vision)**: The Add/Edit Medication modal has a "📷 Scan Rx Label" button. User selects a photo of their prescription receipt; the app compresses it and sends it to the configured LLM (gpt-4o / grok-2-vision) with a structured extraction prompt. LLM returns JSON: name, dosage, prescribedBy, startDate, type (Ongoing/Short-term/As-needed), notes (Rx#, NDC, qty, refills, insurance savings). Fields are auto-populated for review before saving. The scanned image is automatically saved as a photo on the medication after save.

**Vitals trend**: Select a vital type, see all readings over time in a table.

### Notes / Notebooks (`notes.js`)

**Plan document**: `Notes.md`

A notebook-organized note-taking system.

**Firestore**:
- `notebooks` — `name`, `color` (gradient CSS string), `noteCount`, `createdAt`, `updatedAt`
- `notes` — `notebookId`, `body`, `createdAt`, `updatedAt`

**Routes**: `#notes` (notebook list), `#notebook/{id}` (note list), `#note/{id}` (view/edit)

**Color swatches**: 8 preset gradient colors for notebooks. Rendered as colored cards.

**Default notebook (built-in)**: Auto-created "Default" gray notebook on first visit; cannot be deleted.

**Default notebook (user-configured)**: Any notebook can be designated as the user's default via a toggle on the notebook detail page header (star icon + "Default" label). Only one notebook can be the default at a time; toggling another notebook sets the new one and clears the old. Stored in `userCol('settings').doc('main').defaultNotebookId`. The SecondBrain `ADD_NOTE` action uses this setting as a fallback when no notebook name is specified, before falling back to the built-in "Default" notebook.

**Move to Notebook**: While editing an existing note, a "Move to Notebook" row appears below the text area showing a dropdown of all other notebooks. Selecting one and saving moves the note (updates `notebookId`, adjusts `noteCount` on both notebooks) and navigates to the destination notebook. The row is hidden for new notes.

**Search**: Global search across all note body text.

**Export notebook**: On the notebook detail page, an **Export** button downloads the entire notebook as a JSON file. The file contains the notebook metadata and all notes with their full body text and attached photos (photos stored as their Base64 `imageData` strings). File is named `{NotebookName}-{YYYY-MM-DD}.json` (spaces and special characters in the name are replaced with underscores). The JSON structure is: `{ notebook: { id, name, color, exportedAt }, notes: [{ id, body, createdAt, updatedAt, photos: [{ id, imageData, caption, createdAt }] }] }`. Photos are sorted oldest-first per note. The export button shows "Exporting…" while running and restores on completion or error.

**New note save**: After saving a new note, the app navigates back to the notebook list (not to the note's edit page).

**Tab key**: In the note body textarea, pressing Tab inserts 4 spaces instead of moving focus to the next field.

### Life Main Page (`#life`)

Landing page showing a **3-column grid** of tile shortcuts: Journal, Contacts, Health, Notes, Calendar, Projects, Checklists, **My Legacy**, and **Private** (hidden until vault is activated). The Checklists tile navigates to `#checklists/life`. The My Legacy tile navigates to `#legacy`. The Private tile (`#private`) is hidden until the user activates the Private vault in General Settings. Below the tiles, a **"Coming Up"** section (hidden when empty) shows events within the next 30 days, sorted by date. Two sources are merged:
- **Annual contact dates** (`peopleImportantDates` where `recurrence == annual`) — shows label, person name (tappable link to `#contact/{id}`), and "turns N" age badge if a birth year is set
- **Upcoming life calendar events** (`lifeEvents` where `startDate` in next 30 days, excluding attended/missed/didntgo) — shows event title as a tappable link to `#life-event/{id}`. For **today's events**, also shows a clickable 📍 address (opens Google Maps) and 📞 phone number. Address/phone come from the linked location contact (`locationContactId` → `people` doc) if set, or from the plain-text `location` field (as address only).

Each item shows a relative time label: "Today!", "Tomorrow", or "In N days".

### My Legacy (`legacy.js`, `legacy-crypto.js`)

**Plan document**: `DeathPlan.md`

End-of-life information hub — private information for the user's loved ones if the user passes away. Accessible from the Life landing page via the My Legacy tile (🕊️).

**Route**: `#legacy` — landing page with a 3-column tile grid of 12 sub-sections.

**Sub-sections**:

| Route | Section | Status |
|-------|---------|--------|
| `#legacy/burial` | Burial & Remains — disposition type, wishes, reference links, pre-arrangement | ✅ Built |
| `#legacy/obituary` | My Obituary — planning notes, AI-assisted draft, writer instructions | ✅ Built |
| `#legacy/letters` | Letters to People — list + per-letter detail | ✅ Built |
| `#legacy/service` | Funeral / Memorial Service Wishes — type, location, officiant, music, wishes | ✅ Built |
| `#legacy/social` | Social Media & Digital Memorial Preferences 🔒 | Stub |
| `#legacy/accounts` | Financial hub → Accounts, Loans, Bills, Insurance, Financial Plan 🔒 | ✅ Built |
| `#legacy/documents` | Documents — online (URL) + physical, drag-to-reorder, accordion expand | ✅ Built |
| `#legacy/household` | Practical Household Instructions | Stub |
| `#legacy/pets` | Pets — accordion cards, inline editing | ✅ Built |
| `#legacy/notify` | People to Notify — list contacts + free-form entries, runtime lookup | ✅ Built |
| `#legacy/message` | Final Message — instructions + free-form message body | ✅ Built |

**Documents section** (`#legacy/documents`): Single unified list of document entries (online and physical). User drags ⠿ handle to reorder — most important docs at top. Clicking a row expands it (accordion) to show details; collapsed by default. Edit/Delete buttons inside expanded view.
- **Modal fields**: Kind (Physical/Online dropdown), Document Type (Will, Trust, Power of Attorney, Advance Directive/Living Will, Insurance Policy, Real Estate Deed, Vehicle Title, Financial Account, Medical Records, Other), Title (required), Why it matters (textarea). Online docs: URL field. Physical docs: Where is it (multi-line textarea — handles both "filing cabinet" and "Attorney name/address/phone").
- **Card display**: drag handle · type badge · title · Online/Physical badge · chevron. Expanded: Why it matters, URL (clickable) or Where is it, Edit/Delete.
- **Ordering**: `sortOrder` integer; batch-updated via Firestore after each drag. New docs append to end.
- **Firestore**: `legacyDocuments` — `isOnline`, `docType`, `title`, `whyMatters`, `url`, `whereIsIt`, `sortOrder`, `createdAt`.

**Final Message section** (`#legacy/message`): Two fields, both auto-saving to `legacyMeta/message` on blur. Instructions (rows=3) — when/how the message should be shared (read at service, emailed out, etc.). Message body (rows=20) — free-form text, written to whoever reads it. No AI, no print, no contacts.

**Pets section** (`#legacy/pets`): Accordion card list stored in `legacyPets` collection. Each card shows the pet's name as a collapsed preview; tap to expand and reveal inline-editable name input and instructions textarea. "+ Add Pet" creates a new Firestore doc and prepends an auto-expanded card. Auto-saves on blur. Delete button on each card with confirmation dialog. Empty state shown when no pets exist. Firestore fields: `name`, `instructions`, `createdAt`.

**Service Wishes section** (`#legacy/service`): Single form auto-saving to `legacyMeta/service`. Field order: Type of Service (dropdown: Traditional Funeral / Memorial Service / Celebration of Life / Graveside Only / No Service / Other), Location Preference (multi-line textarea, rows=3), Who Should Officiate (multi-line textarea, rows=3), My Wishes (large textarea, rows=16, with 🎙️ Speak voice-to-text button), Music (textarea, rows=5 — listed last). All fields save on blur/change.

**Letters section** (`#legacy/letters`, `#legacy/letter/:id`):
- **List page**: cards sorted newest-first, showing title and recipient name + date created. "+ Add Letter" button in the header creates a new blank `legacyLetters` document and immediately navigates to the detail page.
- **Detail page**: contact picker (searches the `people` collection), plus a "Not in contacts? Type the name" free-text fallback below it. If a contact is selected, the typed-name field is cleared and the contact name is used as `recipientName`. Title field (internal use only — not printed). Instructions textarea (delivery notes — not printed). Letter body textarea with 🎙️ Speak (voice-to-text via `initVoiceToText`) and 🖨️ Print buttons.
- **Print**: prints only recipient name, date created, and letter body — no title, no instructions, no app chrome. Uses `@media print` CSS that hides everything except `.legacy-print-area`.
- **Auto-save**: all fields save on blur.
- **Firestore**: `legacyLetters` collection — fields: `contactId` (nullable), `recipientName`, `title`, `instructions`, `body`, `createdAt`, `updatedAt`.

**People to Notify section** (`#legacy/notify`): List of people your family should contact after you die. Two add flows:
- **From Contacts**: shows an inline contact picker (searches the `people` collection). On selection, creates a `legacyNotify` doc with only `contactId` + `createdAt`. Contact name, phone, email, and "how I know them" (`howKnown`) are fetched at runtime from `people` — never duplicated in `legacyNotify`.
- **Add Manually**: opens a modal with fields: Name (required), Phone, Email, Address, How do I know them. Creates a `legacyNotify` doc with `contactId: null`.
- **List display**: each row shows name · phone · email on line 1, "how do I know them" on line 2 (identical layout for both types). Email addresses are rendered as clickable `mailto:` links. Free-form rows are clickable to re-open the edit modal (modal has a Delete button). Contact-linked rows show only a Delete button.
- **Notify All**: A **✉ Notify All** button appears in the header when at least one entry has an email address. Clicking it opens a compose modal with Subject and Body fields. Clicking **Open in Email** builds a `mailto:` URL with all email addresses in the To field and the subject/body pre-filled, then opens it via `window.location.href`.
- **Duplicate prevention**: adding a contact who is already in the list shows an alert instead of creating a duplicate.
- **Firestore**: `legacyNotify` collection — `contactId` (nullable), `name`, `phone`, `email`, `address`, `howDoIKnowThem`, `createdAt`. Contact-linked docs store only `contactId` and `createdAt`; all other fields are empty strings or absent.

**Financial Accounts section** (`#legacy/accounts` and sub-tabs 🔒): Full-featured hub gated by the Legacy Passphrase. Organized into 5 tabs via a card hub page:

| Route | Tab | Status |
|-------|-----|--------|
| `#legacy/accounts` | Hub — 5 card tiles | ✅ Built |
| `#legacy/accounts/accounts` | Accounts — reads from `investments/{personId}/accounts` | ✅ Built |
| `#legacy/accounts/loans` | Loans — mortgages, car loans, credit cards, other debt | ✅ Built |
| `#legacy/accounts/bills` | Bills — recurring expenses, auto-pay items | ✅ Built |
| `#legacy/accounts/insurance` | Insurance — life/health/other policies | ✅ Built |
| `#legacy/accounts/plan` | Financial Plan — 6 prompted narrative sections, auto-save per field | ✅ Built |

All Financial Accounts sub-tabs share:
- **Person switcher** — filters data to a specific enrolled person (IDs from `settings/investments.enrolledPersonIds`); person filter persists across tab navigations (`_legacyFinPersonFilter`)
- **Passphrase gate** — `_legacyRequireUnlock(callback)` prompts for passphrase once per session; encrypted fields use AES-GCM via `legacy-crypto.js`
- **Accordion list** — collapsed card shows key at-a-glance fields; expanded shows more; Edit/Archive buttons inside expanded card
- **Drag-to-reorder** — SortableJS handle (⠿); `sortOrder` batch-written on `onEnd`
- **Soft delete** — `archived: true`; Show Archived checkbox reveals archived items

**Loans tab** (`#legacy/accounts/loans`, `#legacy/accounts/loans/add`, `#legacy/accounts/loans/edit/:id`):
- **Collapsed card**: loan type badge (amber) · lender · balance · auto-pay badge (green Auto / yellow Manual)
- **Expanded card**: loan type, lender, balance, monthly payment, interest rate, payoff date, months left (calculated), est. remaining (months × payment, calculated), loan start date, account number, whose name, how paid, what to do upon my death, notes
- **Edit-only fields** (not shown in expanded card): URL, username (encrypted), password (encrypted)
- **Loan types** (combo — free-text or pick): Auto, Mortgage, Student, Personal, Credit Card, Medical, Business, Furniture, Other
- **How Paid**: Automatic (linked with badge) / Manual
- **Firestore**: `legacyFinancial/{personId}/loans` — fields: `loanType`, `lender`, `balance`, `monthlyPayment`, `interestRate`, `payoffDate`, `startDate`, `accountNumber`, `whoseName`, `howPaid`, `whatToDo`, `notes`, `url`, `usernameEnc`, `passwordEnc`, `sortOrder`, `archived`, `createdAt`

**Bills tab** (`#legacy/accounts/bills`, `#legacy/accounts/bills/add`, `#legacy/accounts/bills/edit/:id`):
- **Collapsed card**: category badge (teal) · payee · amount · frequency · due date
- **Expanded card**: category, payee, estimated amount, frequency, due date (free-form text: "15th", "March each year"), whose name, payment method, what credit card (if CC), notes
- **Edit-only fields**: URL, username (encrypted), password (encrypted), account number, address
- **Categories** (combo — free-text or pick): Mortgage/Rent, Utilities, Insurance, Subscriptions, Phone, Internet, Car Payment, Medical, Other
- **Frequencies**: Monthly, Quarterly, Annually, Weekly, Bi-weekly, Bi-monthly, As Needed
- **Firestore**: `legacyFinancial/{personId}/bills` — fields: `category`, `payee`, `estimatedAmount`, `frequency`, `dueDate`, `whoseName`, `paymentMethod`, `creditCard`, `notes`, `url`, `accountNumber`, `address`, `usernameEnc`, `passwordEnc`, `sortOrder`, `archived`, `createdAt`

**Insurance tab** (`#legacy/accounts/insurance`, `#legacy/accounts/insurance/add`, `#legacy/accounts/insurance/edit/:id`):
- **Collapsed card**: policy type badge (purple) · company name · coverage amount
- **Expanded card**: policy type, company name, policy number, coverage amount, beneficiary, agent name, agent phone, claims phone, where paper policy is, premium amount, premium frequency, what to do upon my death
- **Edit-only fields**: URL, username (encrypted), password (encrypted)
- **Policy types** (combo — free-text or pick): Term Life, Whole Life, Universal Life, Group / Employer, Other
- **Firestore**: `legacyFinancial/{personId}/insurance` — fields: `policyType`, `company`, `policyNumber`, `coverageAmount`, `beneficiary`, `agentName`, `agentPhone`, `claimsPhone`, `paperPolicyLocation`, `premium`, `premiumFrequency`, `whatToDo`, `url`, `usernameEnc`, `passwordEnc`, `sortOrder`, `archived`, `createdAt`

**Financial Plan tab** (`#legacy/accounts/plan`):
- Six predefined prompted sections, each a labeled textarea with a guiding prompt beneath the label and an auto-save-on-blur behavior
- 🎙️ Speak (voice-to-text) button on 4 of the 6 sections (Big Picture, First Things, Wishes, Anything Else)
- Saved status indicator per field ("Saving…" → "Saved" fades after 2s)
- Person-scoped: same person switcher as other tabs; switching person reloads all field values
- Not encrypted — narrative text, not credentials; still behind the passphrase gate

| Section | Field key | Voice |
|---------|-----------|-------|
| The Big Picture | `planBigPicture` | ✅ |
| First Things — What to Do | `planFirstThings` | ✅ |
| Key People to Call | `planKeyPeople` | — |
| Investments & Retirement | `planInvestments` | — |
| My Wishes for the Money | `planWishes` | ✅ |
| Anything Else | `planOther` | ✅ |

Stored as fields on `legacyFinancial/{personId}` (merged via `set({…}, {merge:true})`).

**Hub rename:** "Financial Accounts" → "Financial" — tile label on the My Legacy hub and hub page title updated to reflect the full scope of the section (not just accounts).

**Passphrase encryption** (🔒 sections): Financial and Social Media require a **Legacy Passphrase** before displaying content. This passphrase encrypts sensitive fields (passwords, account numbers, SSNs, PINs) using AES-GCM 256-bit via the browser Web Crypto API. Key derivation uses PBKDF2 with a random salt stored in `legacyMeta/crypto`. The passphrase is **never stored** — only the salt is in Firestore. Once entered, the session stays unlocked until the browser tab is closed. Implemented in `legacy-crypto.js`.

**Firestore collections**:
- `legacyMeta` — docs keyed by section (e.g. `obituary`, `burial`); `crypto` doc holds `pbkdf2Salt` and `verifyToken` ✅ active
- `legacyLetters` — `contactId`, `recipientName`, `title`, `instructions`, `body`, `createdAt`, `updatedAt` ✅ active
- `legacyDocuments` — `isOnline`, `docType`, `title`, `whyMatters`, `url`, `whereIsIt`, `sortOrder`, `createdAt` ✅ active
- `legacyNotify` — `contactId` (nullable), `name`, `phone`, `email`, `address`, `howDoIKnowThem`, `createdAt` ✅ active
- `legacyPets` — `name`, `instructions`, `createdAt` ✅ active
- `legacyFinancial/{personId}/loans` — loan records (see Loans tab above) ✅ active
- `legacyFinancial/{personId}/bills` — bill records (see Bills tab above) ✅ active
- `legacyFinancial/{personId}/insurance` — insurance policy records (see Insurance tab above) ✅ active
- `legacyFinancial/{personId}` (top-level doc) — Financial Plan fields: `planBigPicture`, `planFirstThings`, `planKeyPeople`, `planInvestments`, `planWishes`, `planOther` ✅ active

### Life Calendar (`lifecalendar.js`)

**Plan document**: `LifeCalendar.md`

Tracks major life events — trips, milestones, goals, relationships.

**Firestore**:
- `lifeEvents` — `title`, `description`, `startDate`, `endDate?`, `startTime?` (HH:MM), `endTime?` (HH:MM), `location?` (manual text), `locationContactId?` (people doc ID — mutually exclusive with `location`), `categoryId?`, `status` (upcoming/in-progress/completed/past), `peopleIds[]`, `notes?`, `miniLogEnabled`, `createdAt`
- `lifeCategories` — `name`, `color`, `createdAt`
- `lifeEventLogs` — `logDate`, `logTime`, `body`, `eventId`, `mentionedPersonIds[]`, `createdAt`

**Health Appointments in Calendar**: `healthAppointments` are loaded alongside `lifeEvents` and displayed in both list and grid views.
- Appointments are normalized to a common shape (`_kind: 'appt'`) with `startDate`, `startTime`, and a title built from `type` + provider name
- Shown in red (`linear-gradient(135deg,#ef4444,#f87171)`) with an **Appt** pill badge
- **List view**: filtered by status (scheduled = Upcoming, completed = Attended; missed filter excludes appointments); hidden when a category filter is active; subject to the "show past" date cutoff (see below)
- **Grid view**: all non-cancelled appointments always appear regardless of status filter (past appointments visible when browsing past months)
- Clicking an appointment card or grid bar navigates to `#health-appointments`

**Show Past 30 Days toggle** (list view only):
- Visible in list view; hidden in grid view
- Off by default; not sticky (resets on every page load and when switching back to list view from grid)
- When OFF: list view shows only events/appointments with `startDate >= today` (for "Upcoming" and "Upcoming + Attended" status filters)
- When ON: date cutoff extends to 30 days in the past; **attended and "didn't go" events within that window are also shown** — the status filter is relaxed for past events so nothing disappears after being marked
- Does not apply to "Attended", "Missed", or "All" status filters — those are already past-looking and keep their own filter
- **Grid view**: all life events are shown regardless of status filter (same as health appointments). Events on any date — past, today, or future — are always visible on the grid when an upcoming-style filter is active. This means an event marked "attended" (even if its scheduled date is today or in the future, e.g. user went early) remains visible on the grid.

**Routes**: `#life-calendar` (list), `#life-event/{id}` (detail/edit), `#life-event/new` (create)

**Event Form**:
- Title, start date, end date (with validation — end date cannot be before start date), optional start time, optional end time
- Category (color-coded), status dropdown, **location** (see below), people tags, description
- **Location field**: two radio buttons — **Contacts** and **Manual**
  - **Contacts** (default for new events): shows a dropdown of top-level contacts with a **"Show Personal"** checkbox (unchecked by default); Personal-category contacts are hidden unless checked; selecting a contact stores `locationContactId`; `location` is cleared
  - **Manual**: shows a free-text input ("City, venue, etc."); stores `location`; `locationContactId` is cleared; "Show Personal" checkbox is hidden
  - On edit: presence of `locationContactId` sets the radio to Contacts and pre-selects the contact; if the saved contact is a Personal contact, "Show Personal" is auto-checked so it appears in the list
  - Event cards show the **contact name** as the location badge when `locationContactId` is set
  - **Today's events**: if a life event has `locationContactId` and its `startDate` equals today, the card shows the contact's address (📍 link to Google Maps) and phone (📞 tel: link) — same as health appointments with `facilityContactId`
- Mini log textarea (journal-style notes attached to the event)
- Top-level Save button (next to title) and bottom Save button
- Saving a **new** event navigates to `#life-calendar` (not the event detail page)
- Saving an **edited** event navigates to `#life-calendar`

**Status**: Events auto-transition between upcoming/in-progress/completed/past based on dates.

**People linking**: Events can tag multiple people from the `people` collection. Linked events appear on each person's detail page.

**Mini logs**: Inline journal-style entries attached to a life event. Appear in the main journal feed (togglable).

---

## Part 8e: Exercise

**Plan document**: `ExercisePlan.md`

Exercise tracking lives in the Life section. Activities and Daily Metrics are built; Goals and Summary show "Coming Soon" placeholders.

### Exercise Hub (`#exercise`)
Four cards: **Activities** (active), **Daily Metrics** (active), **Goals** (coming soon), **Summary** (coming soon).
Breadcrumb: Life › Exercise. No back button — use breadcrumb to navigate up.

### Daily Metrics (`#exercise-metrics`, `#exercise-metric/:date`, `#exercise-metric-defs`)
Daily health and habit journal — one record per date. Tracks 6 hardcoded standard metrics (Weight, Sleep Score, Body Battery, Daily Steps, Total Actual Burn, Food Calories) plus unlimited user-defined custom metrics (boolean, number, or text). Full detail in `ExercisePlan.md` Section 3.

#### Daily Metrics List (`#exercise-metrics`)
- **Filter bar**: 6 dynamic range pills (Last Week, This Week, This Month, Last Month, This Year, Last Year) + a 3×4 month shortcut grid (Jan–Dec). Month buttons show an abbreviated year tag (e.g. "Aug '25") when they refer to the prior year; current-year months show no tag. Default filter on page load: This Month.
- **Records label**: "N records" shown below the filter bar.
- **Desktop (≥700px)**: scrollable `<table>` with a tinted **summary row** above the column headers. Weight column shows the **net change** (newest − oldest weight in range) in green if negative (lost weight) or red if gained; all other standard fields show averages. "X / N" counts for boolean custom metrics. A computed **+/- Diff** column appears after Food Cal. showing `burn − food` per row — yellow background/black text when negative (ate more than burned), normal otherwise. The summary row shows the **total diff** for the period plus its pound-equivalent (÷ 3500), e.g. `4,500 (1.3)`. Each data row is clickable — navigates to `#exercise-metric/<date>`. Note icons (📝) appear inline with a hover tooltip.
- **Mobile (<700px)**: one card per record — date header, row 1 = Wt/Sleep/Bat, row 2 = Steps/Burn/Diff/Food (Diff cell has yellow background when negative), then custom metrics. Note icons trigger a floating overlay with the note text and a close button; tapping outside also dismisses it.
- **"Manage Metrics"** link navigates to `#exercise-metric-defs`. **"+ Entry"** navigates to `#exercise-metric/new`.
- Clicking any row/card routes to `#exercise-metric/<date>` (entry form).

#### Daily Metric Entry Form (`#exercise-metric/new`, `#exercise-metric/<date>`)
Create or edit a single day's metric record. One record per date (date is the Firestore doc ID).

- **Date field**: Displayed inline (label + picker on one line). The day of the week (e.g. "Monday") appears beside the picker and updates as the date changes. Defaults to today (new) or the date being edited. Changing the date checks for an existing record: if one exists it reloads the form pre-filled with that record's data; if no record exists the in-progress form values are preserved (only the date changes).
- **Sections**: **Body** (Weight decimal, Sleep Score, Body Battery) | **Activity** (Daily Steps, Total Actual Burn with helper text, Food Calories) | **Habits & Custom** (all non-archived custom metric defs in sort order).
- **Custom field types**: boolean → checkbox; number → text input with optional unit label; text → text input.
- **📝 note toggle** on every field: clicking the button opens/closes a 2-row textarea for that field. If a note already exists the button is highlighted yellow and the textarea opens pre-filled.
- **Buttons**: Save (primary) | Cancel → `#exercise-metrics` | Delete (danger — edit mode only, soft deletes and navigates back).
- **Save**: writes full document via `.set()` (safe overwrite since date = doc ID). Null for blank standard fields; boolean/number/null for custom values; only non-empty note strings stored.

#### Manage Metrics (`#exercise-metric-defs`)
Accessible via a "Manage Metrics" link on the Daily Metrics list screen. Manages user-defined custom metric definitions only — standard metrics are always present and not editable here.

- **Add form**: Name (required), Type (YES/NO | Number | Text), and for Number type: Allow Decimals checkbox + optional Unit Label (e.g. "oz", "cal"). Saved to `exerciseMetricDefs` collection with `sortOrder` assigned as max existing + 1.
- **Metric row**: Shows name, type badge (colored: blue=YES/NO, green=Number, purple=Text), unit label in parentheses if set, and ↑/↓ sort buttons + Edit + Delete actions.
- **Edit**: Inline form replaces the row — name editable, type shown as read-only badge (type cannot change after creation to preserve historical data). Save writes to Firestore; Cancel restores the row.
- **Sort (↑/↓)**: Swaps `sortOrder` values between adjacent items via Firestore batch write. Re-renders list after swap.
- **Delete**: Confirms before deleting. Sets `archived: true` in Firestore (soft delete). Row removed from list.
- **Seeding**: On first visit, 5 default metrics are written if collection is empty: Stand 1 Hour (boolean), Drinking (boolean), Eat Before 7 (boolean), Device Off by 10pm (boolean), Alcohol Calories (number, unit: cal).
- **Firestore collection**: `exerciseMetricDefs` — fields: `name`, `type` (boolean/number/text), `allowDecimal` (bool), `unitLabel` (string), `sortOrder` (int), `archived` (bool), `createdAt`.

### Activities List (`#exercise-activities`, `exercise.js`)
Displays logged exercise activities in a filterable, sortable list.

**Filter bar:**
- **Range dropdown** (preserved across visits): Last 7 days / Last 30 days (default) / Last 90 days / This Month / This Year / All Time / Custom
- **Custom range**: Start Date + End Date inputs + Load button — both dates required
- **Go to Date**: date picker + button — overrides the dropdown and shows only that day's activities. A ✕ Clear date button resets to the dropdown filter.
- **Manage Types** link: navigates to `#exercise-types`
- **+ Activity** button: navigates to `#exercise-activity/new`

**Display:**
- Ordered newest → oldest by `activityDate`
- Desktop: 8-column table — Date | Day | Type | Duration | Miles | Pace | Cal | Comment
- Mobile (< 640 px): two-line cards, max 3 items per line
  - Line 1: `Thu 5/8/26` | `Running 🐾` | `25:30`
  - Line 2: `3.1 mi @ 8:14/mi` | `310 cal` | comment text
- 🐾 paw icon shown inline on Type when "With Dogs" was logged
- Miles, Pace, and 🐾 blank for non-mileage types
- Pace blank if either miles or duration is missing
- Duration displayed as MM:SS (`25.5 → 25:30`, `90 → 1:30:00`); blank if not recorded
- Empty state: "No activities found for this period."
- Clicking any row navigates to `#exercise-activity/{id}` to edit

**Firestore**: loads up to 500 most-recent `exerciseActivities` docs, filtered client-side.

### New / Edit Activity (`#exercise-activity/:id`)
Route param is `new` for create, or a Firestore doc ID for edit. Breadcrumb: Life › Exercise › Activities › New/Edit Activity. Navigate back via breadcrumb or Cancel button.

**From Picture** (new mode only, shown when LLM is configured in Settings):
- A "📷 From Picture" button appears at the top of the form under a "— or fill from a photo —" divider
- User selects a screenshot from their fitness app (e.g. Samsung Health, Strava)
- The image is compressed and sent to the configured LLM with a prompt asking it to extract: activity type, duration, miles, and calories
- The LLM returns a JSON object; the form fields are pre-filled directly with no confirmation step
- Fields extracted: activity type, date (YYYY-MM-DD), time (HH:MM 24-hr), duration, miles, calories
- Date defaults to today and time defaults to now if the LLM cannot read them from the image
- The user reviews and edits as needed, then saves normally
- If the LLM cannot identify a field, it is left blank (except date/time which fall back to now); the LLM's note appears in a status line below the button

**Form fields:**
- **Activity Type** (required) — searchable dropdown; type to filter, click to select, or type a new name and click "➕ Add '[name]' as new type" to create on the fly
- **Date** (required, defaults today), **day-of-week label** (updates on date change), and **Time** (optional native time picker) — all on one row, matching the journal entry layout. Duration field uses `inputmode="text"` so the full keyboard (including colon) is available on mobile.
- **Duration** — accepts `MM:SS` (e.g. `45:26`), `H:MM:SS` (e.g. `1:15:00`), or decimal minutes (e.g. `45.5`); a friendly label (e.g. "45 min 26 sec" or "1 hr 15 min") appears to the right of the field as you type; stored as decimal minutes in Firestore
- **Miles / Walked Miles** — shown only when `tracksMiles: true`. For Trail Running, Mixed Run, and Treadmill the label reads "Walked Miles"; for all other types it reads "Miles"
- **Run Miles** — shown only for Trail Running, Mixed Run, and Treadmill; a separate field for the running portion of a split workout
- **Total Miles** — read-only calculated field (Walked Miles + Run Miles); shown only for the 3 split-miles types; used for pace calculation
- **Pace** — auto-calculated (min/mile) shown as a read-only preview; uses total miles for split-miles types, plain miles otherwise
- **Calories** — always shown
- **With Dogs** checkbox — shown only when the selected type has `withDogs: true`
- **Notes** — multi-line textarea

**Add-on-fly flow** (inline, no modal):
1. User types a name not in the list and picks "➕ Add … as new type"
2. Panel asks: "Track Miles for this type?" → Yes / No
3. Panel asks: "With Dogs option for this type?" → Yes / No
4. Type is saved to `exerciseTypes` and selected; inline panel disappears

**Save**: writes to `exerciseActivities`, navigates back to `#exercise-activities`.
**Delete** (edit mode only): confirm dialog → delete → navigate back.

**Firestore collections**: `exerciseActivities` (fields: `typeId`, `activityDate`, `durationMinutes`, `miles`, `runMiles`, `calories`, `withDogs`, `comment`), `exerciseTypes` (fields: `name`, `tracksMiles`, `withDogs`, `isDefault`, `archived`).

### Manage Activity Types (`#exercise-types`)
Lists all non-archived types, sorted built-ins first (alphabetical) then custom (alphabetical). Breadcrumb: Life › Exercise › Activities › Manage Types.

- **Built-in types** (13 defaults): shown with name + flag icons + "built-in" badge. No edit/delete buttons.
- **Custom types**: shown with name + flag icons + **Rename** and **Delete** buttons.
  - **Rename**: replaces name with an inline text input + Save / Cancel. Save updates the Firestore doc; existing activities automatically reflect the new name (they store `typeId`, not name).
  - **Delete**: confirm dialog → sets `archived: true` → type disappears from dropdown. Past activity history is unaffected.

Flag icons: 📏 = tracks miles, 🐾 = with-dogs option.

Seeded on first visit to any exercise page (13 built-in defaults). Each type has:
- `name`, `tracksMiles` (bool), `withDogs` (bool), `isDefault` (bool), `archived` (bool)

Types with `tracksMiles = true`: Running, Trail Running, Walking, Hiking, Treadmill
Types with `withDogs = true`: Running, Trail Running, Walking, Hiking

### Data Model
**`exerciseActivities`** (per-user): `typeId`, `durationMinutes` (decimal, nullable), `miles` (nullable — "Walked Miles" for split-miles types), `runMiles` (nullable — "Run Miles", only for Trail Running / Mixed Run / Treadmill), `withDogs` (nullable bool), `calories` (nullable), `comment`, `activityDate` (ISO datetime), `createdAt`

**`exerciseTypes`** (per-user): `name`, `tracksMiles`, `withDogs`, `isDefault`, `archived`, `createdAt`

---

## Part 8b: Credentials

**Plan document**: `PWPlan.md`

**JS file**: `js/credentials.js`

Stores passwords, usernames, API keys, and other sensitive data. No encryption — Firebase Auth login is sufficient security.

### Life Page Tile
Simple tile labeled **Credentials** (🔑) always visible on the Life page.

### Data Model
| Collection | Key Fields |
|---|---|
| `credentials` | `personId` (null = "Me"), `categoryId` (null = Uncategorized), `name`, `url`, `username`, `credentialType`, `credentialValue`, `previousCredential`, `email`, `notes`, `secretQA`, `order`, `updatedAt`, `createdAt` |
| `credentialCategories` | `name`, `order`, `createdAt` |
| `settings/credentials` | `{ enrolledPersonIds: [contactId, …] }` |

**Credential types**: Password, API Key, Client Secret, Social Security Number, Code.

### Page: Credentials List (`#credentials`)
- **Person filter** (dropdown at top): Me (default) + enrolled contacts; filters all categories/counts
- **Search box**: searches `name` and `url` fields client-side; hides non-matching categories; updates count badge to "N of M" while active
- **Category accordions** (outer): shown in user-defined order; count badge reflects current person filter; empty categories always shown; each header has a **[+]** button to add a credential pre-filled with that category
- **Credential accordions** (inner): show credential name in header; drag-to-reorder within category; collapsed by default
- **Expanded credential** shows: URL (clickable link), email, username + 📋 Copy, credential type + value (masked ••••••) + 👁 Reveal + 📋 Copy, last updated, previous credential (masked) + 👁, secret Q&A, notes, **[Edit]** and **[Delete]** buttons
- **Copy behavior**: button shows "Copied!" for 2 s; clipboard auto-cleared after 60 s
- **Uncategorized** is a virtual category (credentials with `categoryId: null`) — always last, cannot be deleted
- **[Manage ▾]** dropdown: Manage Categories → `#credentials/categories`; Manage People → modal

### Page: Add Credential (`#credentials/add`)
Full-page form with all fields. No fields required. Person defaults to current page filter. Category can be picked from existing or a new one typed in line (creates on save). When navigated from a category's [+] button, that category is pre-filled.

### Page: Edit Credential (`#credentials/edit/{id}`)
Same form as Add, pre-filled. Credential value shown **unmasked** in the form. On save: if credential value changed → old value auto-moves to Previous Credential and `updatedAt` is set to today.

### Page: Category Management (`#credentials/categories`)
- Drag-to-reorder list of all real categories; order saved to Firestore as `order` field
- Inline rename (Rename → input → Save/Cancel)
- Delete: moves all credentials in that category to Uncategorized (with confirmation), then deletes
- Add new category via text input at bottom
- Uncategorized row shown pinned at the bottom; cannot be deleted or reordered

### Manage People Modal
- Lists enrolled contacts with **Remove** button (removes from enrolled list and deletes their credentials)
- ContactPicker to add new contacts from the `people` collection
- "Me" (personId: null) is always available and cannot be removed

### Routes
| Hash | Page |
|---|---|
| `#credentials` | Credentials list |
| `#credentials/add` | Add new credential |
| `#credentials/edit/{id}` | Edit existing credential |
| `#credentials/categories` | Category management |

### Backup
`credentials` and `credentialCategories` included in `BACKUP_DATA_COLLECTIONS`.

---

## Part 8c: Investments

**Plan document**: `InvestmentPlan.md`

**JS file**: `js/investments.js`

Person-scoped financial account tracker. The **canonical storage** for financial accounts — the Legacy Financial Accounts tab reads from these same records rather than duplicating them. The Investments section is structured as a hub with sub-pages.

### Life Page Tile
Tile labeled **Financial** (📈), always visible on the Life landing page → navigates to `#investments` hub.

### Hub (`#investments`)
Live dashboard above a static nav-card grid.

**Dashboard card** (loads async after page renders):
- **Group selector**: dropdown shown only when >1 group exists; switching re-renders the dashboard for the selected group.
- **Heroes row**: Net Worth and Invested side-by-side in large type (computed live from holdings `lastPrice` × shares + cash balances, same as the Summary page).
Three collapsible accordions appear below the heroes row. Each has a toggle button (▾/▸ chevron) and persists its open/closed state to `localStorage` (default open). Shared builder: `_investBuildAccordion()`.

- **Performance accordion** (`investHubPerfOpen`, toggle: `_investToggleHubPerf()`): four stat cards (Day / Week / Month / YTD), all same `invest-hub-stat-cell` format on one row. Each shows label, $ gain/loss, and % change vs. the most recent snapshot of that type. Shows "—" when no snapshot exists.
- **Retire Estimate accordion** (`investHubRetireOpen`, toggle: `_investToggleHubRetire()`): the full "If I Retire Today" widget (same as Summary page) including all six stat cards, ? help popups, gear settings panel, and SS/budget data. Retire widget data (SS, budgets, me-age) is loaded in parallel with period baselines in `_investRenderHubBody()`.
- **All-Time Highs accordion** (`investHubAthOpen`, toggle: `_investToggleHubAth()`): four ATH cards (Daily / Weekly / Monthly / Yearly) plus the "vs Daily ATH" companion card. Built by shared `_investBuildAthHtml(groupId, currentNetWorth)` (also used on Summary page).

**📡 Update All Prices bar**: Shown between the group switcher and the dashboard body. Button calls `_investUpdateHubAllPrices()`, which routes through `_investUpdateAllPrices()` using the hub's active group, then re-renders the dashboard. A formatted last-updated timestamp (e.g. "5/5 10:15am") appears beside the button and is populated on page load from `_investConfig.lastUpdateAllTimestamp`.

**Nav cards** (always visible below the dashboard):
- **Accounts** → `#investments/accounts`
- **Summary** → `#investments/summary`
- **Stock Rollup** → `#investments/stocks`
- **Snapshots** → `#investments/snapshots`
- **Budgets** → `#budget`
- **SS Benefits** → `#investments/ss-benefits`
- **Retirement Planner** (coming soon)
- **Retirement Projection** (coming soon)

Module state: `_investHubGroupId` persists the selected group across re-renders.

### Person Switcher (Accounts page)
- Dropdown at top: **Me** (personId = `'self'`) + enrolled contacts
- **Manage ▾** → **Manage People** → modal to add/remove contacts from the `people` collection
- Enrolled IDs stored in `settings/investments.enrolledPersonIds[]`
- Changing person reloads the account list

### Accounts (`#investments/accounts`)
Each account is a doc in `investments/{personId}/accounts/`.

**Account list grouping**:
- When viewing "Me": **My Accounts** group (non-joint) + **Joint Accounts** group (ownerType=joint)
- When viewing a contact: **[Name]'s Accounts** group (their namespace) + **Joint Accounts** group (self-namespace docs where ownerType=joint AND primaryContactId=contactId, loaded client-side)

**Collapsed card**: drag handle (⠿, personal accounts only) · tax category badge · Nickname — Institution · ····last4 · [Joint] badge (if joint and shown in contact view) · expand chevron

**Expanded card** shows: Type, Owner (Personal or "Joint with [Name]"), Cash Balance (if set), URL (clickable), Login Notes, Beneficiary, Sensitive box (Account Number, Username, Password), and **[Edit]** / **[Archive]** (or **[Restore]** if archived).

**Tax category badge** (derived from account type):
- Roth (green): Roth IRA, Roth 401k, HSA
- Pre-Tax (orange): Traditional IRA, Traditional 401k, Self-directed 401k, 403b, 529
- Brokerage (purple): Brokerage Individual, Brokerage Joint
- Cash (blue): Checking, Savings, Money Market, CD
- Other (gray): all other types

**Joint accounts**: stored under 'self' namespace with `ownerType='joint'` + `primaryContactId`. Appear in both "Me" view (Joint Accounts group) and the co-owner's contact view (loaded via second client-side query of self namespace).

**Archive vs. delete**: accounts are never hard-deleted. `archived: true` hides from default list; **Show Archived** toggle reveals them. Legacy Financial shows only active accounts.

**Drag-to-reorder**: SortableJS on personal (non-joint, self-namespace) accounts only; saves `sortOrder` via batch write.

### Encryption
Sensitive fields (`accountNumberEnc`, `usernameEnc`, `passwordEnc`) use AES-GCM via `legacy-crypto.js` — same passphrase and session key shared with Legacy section.

### Add / Edit Form Fields
Account Type (required), Nickname (required), Owner radio (Personal / Joint), Joint With contact select (shown when Joint), Institution, Last 4 Digits, Cash Balance ($), URL, Login Notes (textarea), Beneficiary, Account Number (sensitive), Username (sensitive), Password (sensitive).

**Account Holder field**: First field on the form. `<select id="investFormPersonNs">` populated with "Me" (`value="self"`) + each enrolled contact. Disabled (single option) when no contacts are enrolled. On add: defaults to `_investFormOriginalNs` (set from `_investPersonFilter` at page load). On edit: defaults to the account's current namespace. Preserved in `_investFormDraft.personNs` across passphrase unlock re-renders.

**Owner change / migration**: If the selected namespace differs from `_investFormOriginalNs` on save: creates a new account doc in the target namespace, batch-copies all holdings (preserving doc IDs), batch-deletes old holdings, deletes the old account doc, then sets `_investPersonFilter` to the new namespace so the Accounts list returns to the correct person.

**Cash Balance field**: `type="text"` with `inputmode="decimal"`. On blur formats to `$X,XXX.XX`; on focus strips to raw number for editing. Save functions strip `$`/`,` before parsing.

### Account Detail (`#investments/account/:ns/:id`)
`:ns` = person namespace (`'self'` or a contact ID); `:id` = account doc ID.

**Header**: Nickname, Edit Account button, institution, tax category badge, account type label, joint co-owner (if applicable).

**Total Value card**: Total = Σ(shares × lastPrice) + cashBalance + pendingActivity. Also shows Holdings subtotal and Cash Balance subtotal (for non-cash accounts).

**Cash Balance editor**: `type="text"` inline field + Save button. Displays formatted as `$X,XXX.XX`; click to edit raw number. For bank accounts labeled "Account Balance"; for investment accounts labeled "Uninvested Cash Balance". Writes directly to the account doc.

**Holdings section** (investment accounts only): Compact scrollable table — one row per holding. Columns: Symbol/Name · Qty · Price · Cost/sh · Gain $ · Gain % · Value · % Acct · ✏🗑 icon buttons. Totals footer row shows aggregate value and total gain (when all holdings have a cost basis). Holdings stored in `holdings` subcollection with fields: `ticker`, `companyName`, `shares`, `costBasis` (per share, optional), `lastPrice`, `lastPriceDate`, `createdAt`.

**Gain $ / Gain %**: (lastPrice − costBasis) × shares / (costBasis × shares). Shows "—" if costBasis or lastPrice is missing.

**% Acct**: holding value / (holdingsTotal + cashBalance + pendingActivity) × 100.

**Pending Activity row**: Always present in the holdings table for investment accounts. Ticker label `PEND`, name `Pending Activity`. Stored as `pendingActivity` (number, can be negative) on the account doc. Editable inline via ✏ button — `_investEditPendingInline` / `_investCommitPendingInline` / `_investCancelPendingInline`. Deletes the field (rather than storing 0) when set to zero. Rolls up into the `invCash` bucket in `_investComputeGroupTotals`. `_investFmtPending(val)` formats negative values as `-$X,XXX.XX`.

**Add/Edit Holding modal**: Ticker (auto-uppercased), Company/Fund Name (auto-fetched from Finnhub `/stock/profile2` on ticker blur if name is empty), Shares, Cost Basis/Share ($). Company name auto-fetch only triggers if the field is blank — never overwrites existing values.

**Holdings modal fields**: Ticker (auto-uppercased), Company/Fund Name, Shares (decimal).

**Update Prices button**: Fetches live prices for all holdings in this account using the two-phase approach (Finnhub → Yahoo Finance proxy fallback, see "Price Fetching Architecture"). Deduplicated — one fetch per unique ticker even if it appears multiple times. Button shows spinner + "Updating…" while in flight; on completion shows "✓ Updated just now" or lists failed tickers. If key is missing, shows a message directing the user to Settings. Prices stored as `lastPrice` (number) + `lastPriceDate` (ISO string) on each holding doc.

**Bank/cash accounts**: No holdings section shown; only the cash balance editor.

### Groups (`#investments/groups`)
Stored in `userCol('investmentGroups')`. Fields: `name`, `personIds[]` (always includes `'self'`), `snapshotFrequencies[]` (`daily`/`weekly`/`monthly`/`yearly`), `isDefault` (true for the auto-created Me group), `createdAt`.

**Auto-create**: On every visit to the hub (`loadInvestmentsPage()`), `_investEnsureMeGroup()` checks whether any group doc exists; if not, creates the Me group with all four frequencies.

**Manage Groups page**: Lists all groups as cards (name, people, frequency badges). **+ Add Group** navigates to `#investments/group/new`; **Edit** navigates to `#investments/group/edit/:id`. Both open the standalone Add/Edit Group page (`page-investments-group-edit`, loaded by `loadInvestmentsGroupEditPage`). Me is an optional checkbox (not always-included); non-default groups have a **Delete** button. Default group cannot be deleted.

**Add/Edit Group page** (`#investments/group/new`, `#investments/group/edit/:id`): Standalone form with Group Name field, People checkboxes (Me + enrolled contacts), and Snapshot Frequencies checkboxes (Daily/Weekly/Monthly/Yearly). **Save** writes to Firestore then navigates to `#investments/groups`. **Cancel** navigates to `#investments/groups`.

**Group switcher** (`_investRenderGroupSwitcher(containerId, selectedGroupId)`): Renders a labeled `<select>` into the given container element. Hidden (empty) when only one group exists. The `<select>` fires `_investOnGroupSwitch(groupId)`, which delegates to `_investGroupSwitchHandler` — a module-level variable set by each page that embeds the switcher.

**Group persistence across pages** (`_investActiveGroupId`): Shared module-level var. When a group is selected on any page (Hub, Summary, Snapshots), both the page-specific group var and `_investActiveGroupId` are updated. Child pages (Summary, Snapshots) initialize their group from `_investActiveGroupId` if their own page-level var is null, so the group selected on the Hub carries over automatically.

**Joint account rule**: Joint accounts only contribute to a group's totals when ALL parties of the joint account are members of that group.

### Finnhub API Key + Yahoo Worker URL
Stored in `userCol('settings').doc('investments')`: `finnhubApiKey` and `yahooWorkerUrl`.
Both configured in Settings → General Settings → Investments accordion.
`_investInvalidateYahooWorkerUrl()` called by settings.js after saving, same pattern as Finnhub key.

The **Yahoo Worker** is a Cloudflare Worker the user deploys once. It accepts `?ticker=SYMBOL`, fetches `https://query1.finance.yahoo.com/v8/finance/chart/SYMBOL` server-side (no CORS), and returns the JSON with `Access-Control-Allow-Origin: *`. Help modal (`yahooWorkerHelpModal`) includes full setup instructions and the complete Worker code to paste.

### Finnhub API Key (legacy heading — see above)
Stored in `userCol('settings').doc('investments').finnhubApiKey`. Configured in Settings → General Settings → Investments (Finnhub) accordion. Help modal walks through free account signup at finnhub.io, copying the key from the dashboard, and testing it with a live AAPL quote. The module caches the key in `_investFinnhubApiKey`; saving a new key in Settings calls `_investInvalidateFinnhubKey()` to force a re-read.

### Price Fetching Architecture

**Two-phase price fetch** — used by both "Update Prices" (account detail) and "Update All Prices" (summary page):

**Phase 1 — Finnhub** (`_investFetchPriceFinnhub(ticker, apiKey)`):
- Calls `https://finnhub.io/api/v1/quote?symbol=TICKER&token=KEY`
- Returns `data.c` (current price) or `data.pc` (previous close) if `c` is 0
- Returns `null` (not throws) for non-403 HTTP errors or when the API returns no data
- Throws only on HTTP 401 (invalid API key) — caller aborts immediately
- **Limitation**: Finnhub free tier returns HTTP 403 for mutual funds (FXAIX, VTTHX, etc.) — treated as `null`, not an error

**Phase 2 — Yahoo Finance** (`_investFetchYahooBatch(tickers)`):
- Called for any ticker where Finnhub returned `null`
- Fetches per-ticker using `https://query1.finance.yahoo.com/v8/finance/chart/TICKER?interval=1d&range=1d`
- **CORS problem**: Yahoo Finance blocks direct browser requests from GitHub Pages domains.
- **If `yahooWorkerUrl` is configured** (Cloudflare Worker): fetches directly via `workerUrl?ticker=TICKER` — no delays, no proxy chain needed. The Worker runs server-side, so CORS is not an issue.
- **If not configured** (fallback): routes through a chain of free public CORS proxies with retry logic:
  1. `https://api.allorigins.win/raw?url=...` — most reliable; retried once after 1200ms (handles cold rate-limit on first ticker)
  2. `https://corsproxy.io/?...` — secondary
  3. `https://api.codetabs.com/v1/proxy?quest=...` — tertiary
  - 800ms delay between per-ticker calls in the proxy path
- Price extracted from `data.chart.result[0].meta.regularMarketPrice`

**Why Yahoo v8/chart instead of v7/quote?**
The v7/quote endpoint accepts multiple symbols in one call but returns empty results for mutual funds. The v8/chart endpoint is per-ticker but returns data for both stocks and mutual funds. The per-ticker approach with delay is the only reliable path.

**Why not use the AI/LLM API as a fallback?**
ChatGPT on the web can look up real-time stock prices because it has browsing tools. The raw `/v1/chat/completions` API used by this app is the language model only — it has a training data cutoff (months to years old) and no internet access. Prices returned by the LLM API would be stale and unreliable. This approach was implemented, confirmed stale, and removed. Finnhub + Yahoo is the correct solution.

**Deduplication in Update All Prices**:
`_investUpdateAllPrices()` collects all unique tickers across every account in the group before fetching — if FXAIX appears in 4 accounts, it fetches once and writes to all 4 holdings. This reduces API calls and avoids proxy rate limits.

**What was tried and failed (decision log)**:
- Yahoo Finance direct (no proxy): blocked by CORS for all GitHub Pages domains
- Yahoo v7/quote batch endpoint: returns empty for mutual funds even when proxy works
- Double-encoding bug: `encodeURIComponent(yahooTarget)` where `yahooTarget` already contained a comma resulted in `%252C` — Yahoo returned empty. Fixed by keeping tickers as plain `ticker` (no encoding in the target URL, encoding only in the proxy wrapper URL).
- LLM API fallback: implemented and removed — training data cutoff makes prices useless for financial tracking
- Rapid successive proxy calls (no delay): allorigins.win rate-limits; FXAIX would succeed, VTTHX immediately after would fail. Fixed with 800ms delay.
- **Cold rate-limit on first ticker**: Even with the 800ms inter-ticker delay, the very first ticker in a batch (e.g., FXAIX) was consistently failing all three proxies while the second ticker (VTTHX, 800ms later) succeeded via proxy 0. Diagnosed from console: proxy 0 and proxy 1 returned CORS errors (the proxy itself returned a non-CORS error response, which the browser blocks), and proxy 2 (codetabs.com) returned `"Edge: Too ..."` — a Cloudflare rate-limit page, not JSON. Root cause: the first cold call hits a short-window rate limit on allorigins.win; by 800ms later the window has cleared. Fix: proxy 0 now gets one automatic retry after a 1200ms pause before falling through to proxy 1. This gives allorigins.win time to clear its burst window on the first ticker without requiring the user to retry manually.

### Stock Rollup (`#investments/stocks`)
Cross-account ticker concentration analysis. Loads ALL accounts for ALL enrolled persons (no group filter).

**Data loading**: `_investLoadAllAccountsForStocks()` — reads enrolled person IDs from `settings/investments`, loads accounts for every namespace ('self' + each enrolled ID), then loads holdings for each account. Uses `_investPeople` module state (pre-populated by `_investLoadAll()`).

**Aggregation**: `_investAggregateByTicker(accounts)` — iterates all investment-account holdings, groups by ticker symbol, sums shares and value. Holdings with no ticker, or with zero/missing quantity, are skipped (zero-qty holdings would corrupt the weighted-average cost calculation). Also sums `_totals.holdings` across all non-cash accounts to produce `totalInvested` and `overallNetWorth` (includes cash accounts). Bank/cash accounts are excluded from ticker aggregation. Returns `{ tickers[], totalInvested, overallNetWorth }`.

Per-ticker aggregated fields:
- `totalShares` — sum of shares across all holdings of this ticker
- `lastPrice` — most recent non-null `lastPrice` across holdings
- `totalValue` — totalShares × lastPrice
- `totalCostBasisAmount` — sum of `shares × costBasis` per holding (for weighted average)
- `hasCostBasis` — false if any holding is missing a costBasis
- `weightedAvgCost` — `totalCostBasisAmount / totalShares` (computed after aggregation, only when `hasCostBasis`)
- `accounts[]` — per-account breakdown: `{ ns, id, name, ownerLabel, shares, costBasis, lastPrice, value, accountTotal }`

**Grid layout** (`_investStocksRowHtml`): 9-column CSS grid (`.ist-row`) with columns: chevron · Symbol · Qty · Price · Cost · Gain $ · Gain % · Value · % NW. Main ticker rows (`.ist-main-row`) show aggregated totals. Gain columns are green (`.ist-gain`) or red (`.ist-loss`). Dashes when cost basis or price is missing.

**% NW**: Each ticker's total value as a percentage of `overallNetWorth` (all accounts, including cash). This is "% of your overall net worth", not just % of invested assets.

**Concentration badges**: `invest-conc-ok` (<10%, gray), `invest-conc-warn` (10–14.9%, orange), `invest-conc-high` (≥15%, red). Applied to the % NW cell.

**Expand/collapse**: Clicking a row toggles `_investStocksExpandIds[ticker]` and shows/hides per-account sub-rows (`.ist-sub-row`). Each sub-row shows: account name (clickable link) · shares · price · cost · gain $ · gain % · value · % of that account.

**Clickable account names**: Sub-row account names are `<a>` links that call `_investStocksNavToAccount(ns, id)`, which sets `_investAccountReturnTo = 'stocks'` then navigates to `#investments/account/:ns/:id`. The account detail breadcrumb detects `'stocks'` return and shows "← Stock Rollup" pointing to `#investments/stocks`.

**Sort**: `_investStocksSort` module var — `'value'` (totalValue desc, default) or `'ticker'` (A–Z). Sort buttons re-render the page.

**DOM ID safety**: Tickers like `BRK.B` have periods replaced with underscores for element IDs (`stocksDetail-BRK_B`); the toggle function maps back using `ticker.replace(/\./g, '_')`.

**CSS classes**: `.ist-table-wrap`, `.ist-row` (9-col grid), `.ist-header-row`, `.ist-cell`, `.ist-cell-sym`, `.ist-cell-num`, `.ist-cell-chev`, `.ist-main-row`, `.ist-sub-row`, `.ist-detail`, `.ist-sub-label`, `.ist-val`, `.ist-gain`, `.ist-loss`, `.ist-dim`, `.ist-pct-acct`, `.ist-acct-link`.

**📡 Update All Prices button**: In the page header (top right). Calls `_investUpdateStocksAllPrices()` — loads all accounts for ALL enrolled people via `_investLoadAllAccountsForStocks()` (not group-filtered), runs the two-phase Finnhub → Yahoo fetch, batch-writes results, saves `lastUpdateAllTimestamp`, re-renders the page, shows `_investShowPriceResultModal`, then updates the last-updated note (`investStocksUpdateNote`) beside the button.

**Hub card**: Added as 4th card on `#investments` hub.

**Routes**: `#investments/stocks` → `page-investments-stocks` → `loadInvestmentsStocksPage()`.

### Historical Snapshots (`#investments/snapshots`)
Point-in-time portfolio recordings used to compute period performance on the Summary page.

**Capture flow**: Tap **+ Capture** → modal opens with type selector (filtered to the current group's configured `snapshotFrequencies`) + optional notes field → tap **Capture** → app calls `_investLoadGroupAccounts()` and `_investComputeGroupTotals()` for current values → saves to `investmentSnapshots` collection → checks and updates ATH → closes modal → re-renders page. If prices haven't been updated today, a stale-price confirm dialog appears first; the OK/Capture button is disabled (shows "Updating…") while the price update runs, then re-enabled when complete.

**Snapshot doc fields**: `groupId`, `type` (daily/weekly/monthly/yearly), `date` (YYYY-MM-DD), `netWorth`, `invested`, `perAccount` (map: accountId → total value), `perCategory` (roth/preTax/brokerage/cash/invCash), `notes` (nullable), `createdAt`.

**Snapshot list**: Grouped by type (Yearly → Monthly → Weekly → Daily), most recent first within each group. Default view is filtered to a recent window per type:
- **Yearly / Monthly**: current calendar year only
- **Weekly**: last 3 snapshots
- **Daily**: all since the most-recent Sunday (start of current week)

Each row shows date (daily rows also show day-of-week, e.g. "2026-05-05 · Tuesday"), notes (if any), Net Worth, and Invested. Tap to expand → shows category breakdown + per-account breakdown + Delete button.

**More button**: When a section has snapshots outside the default window, a "More ›" link appears next to the section heading. Opens the `investSnapMoreModal` showing full history for that type:
- Default: last 10 snapshots
- "Show last N" number input to change count
- "Since date" date input to show all snapshots on or after a date (takes precedence over count when set)
- Rows are read-only expand/collapse (Delete still works; closes modal and re-renders page)

**Prices last updated**: `investmentConfig/main.lastUpdateAllDate` (YYYY-MM-DD) and `lastUpdateAllTimestamp` (ISO string) are written every time `_investUpdateAllPrices()` or `_investUpdateStocksAllPrices()` completes successfully. Displayed formatted as "M/D h:mmam/pm" (e.g. "5/5 10:15am") via `_investFmtUpdateTime()`. Shown on: Summary page status note, Snapshots page, Stock Rollup button area, and main hub update bar.

**Stale-price warning on capture**: When the user opens the Capture Snapshot modal, if `lastUpdateAllDate` is before today (or null), a confirm dialog asks whether to update prices first. Confirming runs `_investUpdateAllPrices()` before computing the snapshot values. Cancelling proceeds with current (potentially stale) prices.

**All-Time Highs**: One ATH per snapshot type per group, stored in `investmentConfig/main` as `allTimeHighDaily_<groupId>`, `allTimeHighWeekly_<groupId>`, etc. — each `{value, date}`. Updated automatically on each capture via `_investCheckAndUpdateATH(type, netWorth, date, groupId)` using a targeted `set({merge:true})`. Group-scoped so capturing a snapshot for one group never affects another group's ATH display. Shown as orange cards at the top of the page.

**Delete**: Confirm dialog → removes doc from Firestore → closes More modal if open → re-renders page. Note: deleting a snapshot used as a period baseline causes the corresponding period row on Summary to revert to "—".

**Import button**: `↑ Import` button in the page header navigates to `#investments/import`.

**Firestore query**: All snapshots loaded with `.orderBy('date','desc')` (single-field index, no composite needed); groupId filtering done client-side.

### Import Snapshots (`#investments/import`)
Bulk-imports historical snapshots from a spreadsheet screenshot using AI vision.

**Flow**:
1. User selects group (if >1 group), snapshot type (weekly/monthly/yearly), and uploads a screenshot of their spreadsheet.
2. "Parse with AI" sends the screenshot + account list (id/name/type) to the configured LLM (OpenAI `gpt-4o` or Grok vision) with a structured prompt.
3. AI returns JSON: `{ columns: [{header, mapping, uncertain}], rows: [{date, values[]}] }`. Each column has a `mapping` (`netWorth`, `category:roth`, `account:{id}`, `ignore`) and an `uncertain` flag.
4. Review grid: rows = snapshot dates, columns = spreadsheet columns. Column headers show the original text and a dropdown pre-selected by AI. Uncertain columns highlighted yellow. Dates already having a snapshot for the same type tagged "overwrite".
5. User adjusts any mismatched dropdowns → clicks **Import N Snapshots**.
6. Existing snapshots for overwritten dates deleted via batch; new docs written to `investmentSnapshots`.

**Snapshot document**: Same structure as a captured snapshot — `groupId`, `type`, `date`, `netWorth`, `invested: 0`, `perCategory` (roth/preTax/brokerage/cash/invCash), `perAccount` (holdings/cash/pending = 0, total = spreadsheet value), `notes: null`, `createdAt`.

**Vision model**: If configured model is `gpt-4o-mini` (OpenAI) or non-vision Grok, import upgrades automatically to `gpt-4o` / `grok-2-vision-1212`.

**Route**: `#investments/import` → `page-investments-import` → `loadInvestmentsImportPage()` in `investments-import.js`.

**investmentSnapshots collection**: Added to `BACKUP_DATA_COLLECTIONS` in settings.js.

**Group switcher**: Same pattern as Summary page — `_investGroupSwitchHandler` set to re-render on change.

### Portfolio Summary (`#investments/summary`)
Dashboard page showing totals for the selected group.

**Hero row**: Net Worth card + Invested card (two columns).

**Layout**: The Retire Estimate and All-Time Highs sections are wrapped in sticky collapsible accordions (same `invest-hub-perf-accordion` style as hub). Toggle functions: `_investToggleSumRetire()` / `_investToggleSumAth()`. State keys: `investSumRetireOpen` / `investSumAthOpen` (both default open).

**If I retired today widget**: Green card with estimated Annual and Monthly retirement income. Full spec:

- **Title**: "If I retire today at age XX (after est. taxes)" — XX = self person's configured retirement age. Falls back to "If I retire today (after est. taxes)" if no age set.
- **Annual / Monthly stats**: Include both investment income and SS income. Formula: `Annual = (NetWorth × RoR × afterTaxPct) + (totalSSMonthly × afterTaxPct × 12)`. Monthly = Annual ÷ 12. Each value has a `title` tooltip showing the formula with actual percentages substituted (e.g. "Investments × 6% × 82% + (SS × 82%)").
- **Budget comparison stat**: Appears to the right of Monthly when a budget is selected in gear. If selected budget is the default budget → shows `totalIncome` labeled "Current Income". Otherwise → shows `totalExpenses` labeled with the budget name. Includes non-monthly reserve in expenses (consistent with the budget screen).
- **% To Goal stat**: Formula: `monthly / budgetValue × 100`. Label: "% To Goal". Green when ≥ 100%, amber otherwise.
- **NW Shortfall stat**: Shows how much more net worth is needed for investments (after SS) to cover 100% of the budget, in today's dollars. Formula: `investMonthlyNeeded = budgetVal − (totalSSMonthly × afterTaxPct)`; `nwNeeded = (investMonthlyNeeded × 12) / (RoR × afterTaxPct)`; `shortfall = max(0, nwNeeded − netWorth)`. Displays dollar amount in red, or "At Goal" in green when shortfall ≤ 0. Tooltip shows target NW and the formula. Only shown when a budget is selected. Card gets a red border tint when in deficit.
- **% of Target stat**: `netWorth / nwNeeded × 100` (capped at 999%). Shows what % of the required net worth is currently accumulated. Green when ≥ 100%, amber otherwise. Tooltip matches NW Shortfall. Only shown when a budget is selected.
- **Stat card layout**: All six stats render as individual flex cards (white bg, green border, `border-radius: 8px`, `flex-wrap: wrap`) matching the ATH card style. Cards stack into a 2-column grid on mobile.
- **? help popups**: Each stat label has a `?` button. Clicking it opens a full-screen overlay popup (`_investRetireHelpData[key]`) with: plain-English explanation, generic formula, and the formula with real numbers substituted in. Help data is built into `_investRetireHelpData` (module-level var) each time `_investBuildRetireWidget` runs. Close via backdrop click or ✕ button.
- **Birthday prompt**: If no "me" contact exists → inline birthday entry form (month/day/year + Save). Saving auto-creates a contact named "Me" with `isMe=true` and adds a Birthday important date; then re-renders. If "me" contact exists but has no Birthday important date (label match: "birthday", "bday", "birthdate" case-insensitive) → link to that contact's detail page.
- **Gear panel (⚙)**: Toggled via gear button. Contains:
  - Per-person retirement age rows (one per person in the active group): label = person's name (or their isMe contact name for 'self'); dropdown 62/63/64/65/67/70/Other; "Other" reveals a number input.
  - Return Rate field (decimal, e.g. 0.06)
  - After-Tax % field (decimal, e.g. 0.82)
  - Budget dropdown (all non-archived budgets; "— No budget —" to clear)
  - **Recalculate** button saves all settings and re-renders
- **Config stored** in `userCol('investmentConfig').doc('main')`: `projectedRoR`, `afterTaxPct`, `retirementAges` (object keyed by personId), `selectedBudgetId`. Auto-created on first load with defaults.

**All-Time Highs**: Orange cards (reuses `.invest-snap-ath-*` styles) showing the highest Net Worth ever recorded for each snapshot type (Daily/Weekly/Monthly/Yearly), sourced from `investmentConfig` ATH fields. Only rendered when at least one ATH is recorded. Immediately after the Daily ATH card, a **"vs Daily ATH"** companion card shows the percentage difference between the most recent daily snapshot's net worth and the daily ATH value. Green card = at or above ATH; red card = below ATH. Formula: `(lastDailySnapshot.netWorth − dailyATH.value) / dailyATH.value × 100`.

**Period Performance**: Four rows — Day, Week, Month, YTD — each wired to the most recent snapshot of the corresponding type (daily/weekly/monthly/yearly) for the current group. Loaded via `_investLoadPeriodBaselines(groupId)` which queries `investmentSnapshots` ordered by `date desc`, limit 200, and takes the first of each type client-side (no composite index required). Each row shows: baseline date, Gain/Loss $ (green `+` / red `−`), and Gain/Loss %. Shows "No [type] snapshot yet" when no snapshot of that type exists.

**Category Breakdown table** (rows: Roth, Pre-Tax, Brokerage, Cash, Uninvested Cash, Net Worth total): value + % of Net Worth.
- Roth/Pre-Tax/Brokerage buckets = **full account total** (holdings + cashBalance + pendingActivity) for accounts of that type
- **Brokerage row** additionally shows a dimmed `taxable $X` note to the left of the total — `taxable = brokerage total − Σ(costBasis × shares)` across all brokerage holdings. Only shown when at least one brokerage holding has a cost basis recorded. Not shown in snapshot detail views (cost basis not stored in snapshots).
- Cash bucket = total balance of bank accounts (checking/savings/money market/CD)
- Uninvested Cash = informational display only — sum of `cashBalance + pendingActivity` across all non-bank investment accounts; already baked into the category rows above, **not** added to Net Worth
- `t.netWorth = t.roth + t.preTax + t.brokerage + t.cash` (no `+ t.invCash`)
- `t.invested = t.netWorth - t.invCash` (how much is in actual positions vs. sitting idle)

**Accounts section**: Per-person groups listing each account's name, tax category badge, and total value. Joint accounts appear in a separate "Joint Accounts" section.

**📡 Update All Prices**: Collects all **unique** tickers across every account in the group (deduplicated — FXAIX in 4 accounts = 1 fetch), then runs the two-phase price fetch (Finnhub → Yahoo/Worker fallback). Batch-writes updated `lastPrice` + `lastPriceDate` to all matching holdings, re-renders, then shows `_investShowPriceResultModal`. If failures occur and no Worker URL is configured, the modal includes a tip linking to Settings. Requires Finnhub API key.

**Group switcher**: Shown at top when >1 group exists; switching re-renders the page for the new group. Sets `_investGroupSwitchHandler` to re-render on change.

**investmentConfig collection**: `userCol('investmentConfig')`, single doc `'main'`, fields: `projectedRoR` (number), `afterTaxPct` (number), `retirementAges` (object — personId → age), `selectedBudgetId` (string|null). Auto-created on first summary page load if absent. Included in backup.

### Routes
| Hash | Page |
|---|---|
| `#investments` | Investments hub |
| `#investments/accounts` | Account list (person switcher + grouped cards) |
| `#investments/accounts/add` | Add account form |
| `#investments/accounts/edit/:id` | Edit account form |
| `#investments/account/:ns/:id` | Account detail (holdings + cash balance) |
| `#investments/groups` | Manage groups |
| `#investments/summary` | Portfolio summary dashboard |
| `#investments/snapshots` | Historical snapshots — capture, browse, delete |
| `#investments/stocks` | Stock rollup — all tickers aggregated, concentration analysis |
| `#investments/ss-benefits` | SS Benefits list — snapshots per person |
| `#investments/ss-benefits/new` | Create new SS Benefits snapshot |
| `#investments/ss-benefits/edit/:id` | Edit existing SS Benefits snapshot |
| `#investments/ai-analysis` | AI Investment Analysis — LLM-generated plain-English portfolio analysis |
| `#investments/import` | Import Snapshots — AI vision parses screenshot, review grid, bulk write |

---

### AI Analysis (`#investments/ai-analysis`)

Sends a structured JSON snapshot of the selected group's financial picture to the configured LLM and displays a plain-English analysis. Accessed via **🤖 Ask AI** buttons on the hub and summary pages.

**Entry points**:
- Hub page: "Ask AI" button near the Retire Estimate accordion (sets back route to `#investments`)
- Summary page: "Ask AI" button near the Retire Estimate accordion (sets back route to `#investments/summary`)

**Page layout**:
- Back button (returns to hub or summary depending on entry point)
- Group name shown as subtitle
- Optional specific-question textarea + **Ask AI** button (runs full analysis)
- Status / loading area
- Result area (rendered markdown from LLM)
- Cached result displayed below on load if one exists, with a "Re-run" button

**Call 1 — Full Analysis**:
- Assembles JSON payload via `_investAiBuildPayload(groupId)` (see Payload below)
- Sends system prompt + JSON + optional user question to LLM
- Renders markdown response; caches result per group in `userCol('investmentConfig').doc('aiAnalysis_{groupId}')`
- Follow-up textarea + "Ask follow-up" button appear below the result

**Call 2 — Follow-Up Question**:
- Sends same JSON + prior analysis text + follow-up question to LLM
- LLM responds only to the follow-up; does not repeat the full analysis
- Follow-up response shown in a visually distinct block (blue tint)
- Not cached — transient for the current page visit

**Caching**: Per group. Each group stores its last analysis in `investmentConfig/aiAnalysis_{groupId}` with fields: `responseText`, `question`, `groupId`, `groupName`, `asOfDate`, `runAt` (ISO string). Cached result loads automatically on page entry; "Re-run" overwrites it.

**Payload** (`_investAiBuildPayload`): Assembled from live Firestore reads each run:
- `group.members[]`: label, currentAge (from birthday in `peopleImportantDates`), retirementAge, yearsToRetirement
- `socialSecurity[]`: all breakpoints per person from the most recent `ssBenefits` snapshot
- `portfolioSummary`: totalValue, byCategory (roth/preTax/brokerage/cash/investmentCash), top 15 holdings by value
- `accounts[]`: per-account name, type, owner, cashBalance, holdings (ticker, shares, lastPrice, value)
- `budgets[]`: all non-archived budgets with monthlyTotal, annualTotal, isDefault, category totals
- `investmentConfig`: projectedRoR, afterTaxPct

**LLM**: Uses the same provider config as SecondBrain (`userCol('settings').doc('llm')`). Supports OpenAI (`gpt-4o`) and Grok (`grok-3`). System prompt instructs "knowledgeable friend" tone with 7 sections: Summary, Retirement Readiness, Budget Gap Analysis, SS Strategy, Portfolio Composition, Concentration Risk, Cash Position, Key Observations. Uses configured `projectedRoR` — not the 4% rule.

**Module**: `js/investments-ai.js`. Module state: `_investAiBackRoute`, `_investAiGroupId`, `_investAiAnalysis`.

---

### SS Benefits (`#investments/ss-benefits`)

Tracks projected Social Security monthly benefit amounts by claiming age for any enrolled person.

**Purpose**: Each year (after visiting SSA.gov), the user records a dated snapshot of benefit projections. The most recent snapshot per person feeds the Retirement Planner; older snapshots are kept for historical comparison.

**List page** (`page-investments-ss-benefits`, loaded by `loadInvestmentsSsBenefitsPage()`):
- Person dropdown (same enrolled people as Accounts, loaded from `settings/investments.enrolledPersonIds`).
- Snapshot cards sorted newest-first. Most recent card has a purple "Most Recent" badge and a thicker purple border; older cards are labeled "Historical — not used in planning."
- Each card shows: as-of date, age range summary, full age/amount table, **Update Current** (most recent) or **Edit** (historical) button, **Delete** button.
- **Delete**: if deleting the most recent snapshot, warns user that the previous one will become the active planning snapshot.

**Form page** (`page-investments-ss-form`, loaded by `loadInvestmentsSsFormPage(snapshotId)`):
- **Create New** (snapshotId = null): pre-fills ages AND amounts from the most recent existing snapshot; as-of date defaults to today. Person picker shown.
- **Edit** (snapshotId provided): pre-fills from the snapshot being edited; person picker hidden (locked to that snapshot's person).
- Entry rows: age label + dollar input + ✕ delete button; sorted by age ascending.
- **+ Add Age**: dropdown of ages 62–70 not already in the form; tap button to append a new row.
- **Save**: validates date and at least one entry exist; reads all input values from DOM; upserts to `ssBenefits` collection.

**Firestore collection**: `userCol('ssBenefits')` — docs with fields: `personId`, `asOfDate` (ISO date string), `entries[]` (`{age, monthly}`), `createdAt`, `updatedAt`. Queried by `personId` ordered by `asOfDate desc`. Added to `BACKUP_DATA_COLLECTIONS` in settings.js.

**Module state**: `_ssBenefitsPersonFilter`, `_ssBenefitsPeople[]`, `_ssBenefitsSnapshots[]`, `_ssBenefitsFormEntries[]`, `_ssBenefitsFormEditId`, `_ssBenefitsFormIsNew`.

---

## Part 8a: Private Vault

**Plan document**: `PrivatePlan.md`

**JS file**: `js/private.js`

An encrypted personal vault for data the user never wants anyone else to access — not even someone with the app login or direct Firestore/Storage access. All encryption is client-side (AES-256-GCM + PBKDF2 via Web Crypto API). The passphrase is never stored.

### Setup (`#settings-general` → Private Storage accordion)

The Private Storage accordion in General Settings handles one-time setup:

- **Step 1 — Firebase Storage**: User must enable Firebase Storage in the Firebase console (project `bishop-62d43`) and set the security rules that restrict each user to their own path. A "View Setup Instructions" button opens a help modal with the exact steps and rules text.
- **Step 2 — Activate**: User clicks "Activate Private Data", enters a passphrase twice. App:
  1. Derives an AES-256-GCM key via PBKDF2 (100,000 iterations, SHA-256)
  2. Tests Firebase Storage connectivity (upload/download/delete a tiny encrypted blob)
  3. Encrypts the sentinel string `"PRIVATE_VAULT_OK"` and saves `{pbkdf2Salt, encryptedSentinel}` to `userCol('privateVault').doc('auth')`
  4. Shows green **Active** badge; Private tile becomes visible on Life screen

**Passphrase rules**: More than 3 characters. No recovery if forgotten — all private data is permanently inaccessible.

### Private Tile (`#life` → `#private`)

The Private tile is hidden on the Life landing page until activation is complete. Visibility is checked at app load via `privateCheckActivated()` in `initApp()`, which reads `privateVault/auth` from Firestore.

### Vault Home & Passphrase Gate (`#private`)

`#private` is a single page with two states, toggled by lock status:

**Gate state (locked):** Centered card with a lock icon, passphrase input, and Unlock button. Wrong passphrase shows inline error and clears the input. Correct passphrase: derives the CryptoKey, verifies against stored sentinel, stores key in memory, switches to Home state.

**Home state (unlocked):** Three tiles — Bookmarks (`#private/bookmarks`), Documents (`#private/documents`), Photos (`#private/photos`). Navigating to any sub-page when locked redirects to `#private` gate automatically.

### Session & Auto-Lock

- Entering `#private` always shows the gate if vault is locked; if already unlocked within the session, home is shown directly
- **Auto-lock**: 60 minutes of inactivity (any click or keypress anywhere in the app resets the timer). On expiry: CryptoKey cleared from memory; if on any `#private/*` page, gate is shown immediately
- Page reload always requires re-entry
- If a Storage upload is in progress when the timer fires, lock is deferred until the upload completes

### Encryption Details

- **Algorithm**: AES-256-GCM
- **Key derivation**: PBKDF2 (passphrase + random 16-byte salt, 100,000 iterations, SHA-256)
- **Salt**: Stored plaintext in Firestore (not secret — prevents rainbow table attacks)
- **IV**: 12 random bytes generated fresh per encryption; prepended to ciphertext before Base64 encoding: `Base64(IV + ciphertext)`
- **In-memory**: Stores the derived `CryptoKey` object, never the raw passphrase

### Private Bookmarks (`#private/bookmarks`)

Encrypted URL bookmark tree, invisible to browsers and cloud sync. All node data (name, URL, notes) is encrypted as a single JSON blob per node before storage.

- **Tree structure**: Single root node "Bookmarks" (not encrypted). Up to 5 levels deep below root.
- **Node types**: Folder (📁) or Bookmark (🔖). Clicking a bookmark opens the URL in a new tab.
- **Toolbar**: "+ Folder" and "+ Bookmark" buttons at the top add to the root level. Each folder in the tree has inline "+ Bookmark" and "+ Folder" buttons that appear on hover.
- **Edit / Delete**: Edit and Delete buttons appear on hover for every node. Deleting a folder recursively removes all its contents after confirmation.
- **Collapse/Expand**: Folders can be collapsed with the ▼/▶ toggle. Collapse state persists within the session.
- **Drag-and-drop**: Drag any node by the ☰ handle. Drop above a node to insert before it, below to insert after, or onto a folder to move inside. Drops that would exceed depth 5 are blocked with an alert.
- **Firestore collection**: `userCol('privateBookmarks')` — one doc per node: `{type, parentId, order, depth, encryptedData, createdAt}`. Root node has `{type:'root', name:'Bookmarks'}` (not encrypted).

### Private Documents (`#private/documents`)

Encrypted .docx files stored in Firebase Storage. Files are encrypted client-side before upload; Firestore holds only encrypted metadata.

- **List**: Title (decrypted on load) and last-updated date + file size per row. Sorted newest-first.
- **Add Document**: Enter a title, pick a .docx file. Progress status shows "Encrypting…" → "Uploading… N%" → "Done!". On success, Firestore metadata is saved and the list reloads.
- **Open**: Downloads the encrypted blob via XHR, decrypts in-browser, triggers a browser download with the original filename. Word opens it automatically via the OS file association.
- **Re-upload**: Replaces the Storage blob with a newly encrypted version of a different file. Updates `updatedAt` and `fileSizeBytes` in Firestore; title is preserved.
- **Delete**: Confirms, then deletes the Storage blob AND the Firestore record.
- **Upload guard**: `window.privateUploadInProgress` is set true during upload; auto-lock is deferred until it clears.

**Firestore** `userCol('privateDocuments')`: `{encryptedTitle, encryptedOriginalFileName, storageRef, fileSizeBytes, createdAt, updatedAt}`
**Storage** path: `users/{uid}/privateDocuments/{docId}` — raw encrypted bytes (IV prepended).

### Private Photos (Phase 5)

**Page:** `#private/photos` → album list; `#private/photos/album/{albumKey}` → gallery

Albums list page shows a grid of album cards (icon, name, count). An "Uncategorized" virtual album collects photos with no album assignment. Each album card links to its gallery.

Gallery page:
- **3-column thumbnail grid** — thumbnails decrypted progressively as the page loads; tapping any thumbnail opens the photo viewer modal.
- **Add Photos** button: opens a file picker (multi-select). Each selected image is: client-side compressed (max 1400px, JPEG quality 0.82) → AES-256-GCM encrypted → uploaded to Firebase Storage → metadata saved to Firestore `privatePhotos`.
- **Album actions**: Rename album (pencil), Delete album (deletes all photos in album from Storage + Firestore).

Photo viewer modal:
- Full-size decrypted image displayed via temporary Blob URL (cached to avoid re-download on nav).
- **Older / Newer** navigation buttons (newest-first order).
- **Caption** input — edits encrypted in Firestore on Save.
- **Move to Album** — opens modal with list of all albums; moving updates `albumId` in Firestore metadata only (blob stays in Storage).
- **Delete** — removes blob from Storage and Firestore metadata.

Image compression uses `<canvas>` before encryption; canvas is drawn then `toBlob()` at JPEG quality 0.82. `window.privateUploadInProgress` flag prevents auto-lock during uploads.

### Firestore Collections

| Collection | Key Fields |
|---|---|
| `privateVault` | `{pbkdf2Salt, encryptedSentinel}` — single doc `auth` |
| `privateBookmarks` | `{parentId, type, encryptedData, order, depth}` — Phase 3 |
| `privateDocuments` | `{encryptedTitle, encryptedOriginalFileName, storageRef, createdAt, updatedAt, fileSizeBytes}` — Phase 4 |
| `privatePhotoAlbums` | `{encryptedName, order, createdAt}` — Phase 5 |
| `privatePhotos` | `{albumId, encryptedCaption, encryptedOriginalFileName, storageRef, createdAt}` — Phase 5 |

### Firebase Storage Paths

All files encrypted before upload. Storage never sees plaintext.

- `/users/{uid}/privateDocuments/{docId}` — encrypted .docx blobs
- `/users/{uid}/privatePhotos/{photoId}` — encrypted image blobs

### Private Backup (Phase 6)

**Location:** Backup & Restore page (`#backup`) — "Backup Private Data" card, visible only when vault is activated.

**Flow:**
1. User clicks **Backup Private Data** → passphrase modal appears.
2. User enters vault passphrase → key derived via PBKDF2 → sentinel verified.
3. Wrong passphrase: inline error, no download.
4. Progress indicator updates through stages: bookmarks → documents → photos.
5. zip.js (`@zip.js/zip.js@2`) builds an AES-256 encrypted zip (password = vault passphrase).
6. Downloaded as `private-backup-YYYY-MM-DD.zip` — openable with 7-Zip or WinZip.

**Zip contents:**
| Path | Description |
|---|---|
| `bookmarks.html` | Netscape Bookmark File Format — importable into browsers |
| `bookmarks.json` | Full flat JSON of all bookmark nodes |
| `documents/{filename}.docx` | Decrypted originals, filename from stored original name |
| `photos/{albumName}/{photoName}.jpg` | Decrypted photos, organized by album; name = caption → original filename → date-based fallback |
| `metadata.json` | Export date, counts (bookmarks/documents/photos) |

**Firestore backup:** `BACKUP_DATA_COLLECTIONS` in `settings.js` includes all five private collections (`privateVault`, `privateBookmarks`, `privateDocuments`, `privatePhotoAlbums`, `privatePhotos`) — exported as ciphertext in the main JSON backup for Firestore disaster recovery.

**Key functions:** `privateOpenBackupModal()`, `privateExportBackup()`, `privateSanitizeFilename()`, `_backupDecryptBuffer(combined, key)`, `_backupBmHtml(nodeId, nodeMap, childMap, indent)` — all in `js/private.js`.

---

## Part 8d: Budgets

**Plan document**: `BudgetPlan.md`

**JS file**: `js/budgets.js`

Monthly budget planner supporting multiple named budget scenarios. Accessible from the Financial hub (`#investments`) via the **Budgets** nav card → `#budget`.

### Life Page Tile
Same **Financial** tile (📈) as Investments → Financial hub → **Budgets** card.

### Hub card
Card labeled **Budgets** (💰) in `_investHubNavCards()` → links to `#budget`.

### Budget Landing Page (`#budget`)
Loads directly to the **default budget** (no list screen). If no budgets exist, shows an empty state with a "Create Budget" prompt.

**Dropdown selector** at top: lists all non-archived budgets (default first, marked ★). Includes a "+ Add New Budget" option. Switching with unsaved changes prompts: *"You have unsaved changes. Discard them and continue?"*

**Budget name row**: displays current budget name, a "Default Budget" badge if applicable, and a rename (✏️) button.

### Budget Structure
Each budget has three data layers stored as Firestore subcollections:

**Categories** — expense groupings (e.g., Household, Vehicles). Pre-populated quick-picks: Household, Vehicles, Loans, Other, Personal. User can add custom names. Each category shows a subtotal. Categories can be deleted (with items — confirmation required).

**Line items** — within each category: Name, Amount (whole dollars), Est. Due Day (display only). Always-visible input rows. Drag handle (⠿) to reorder within a category. 💬 note icon on each row: gray = no note, blue = note exists; tap to toggle an inline note field below the row.

**Income section** — always at the bottom of the page. Free-form lines: Name + Amount. Drag-to-reorder. Shows a running Total Income.

**Summary section** — below income. Shows only categories with subtotal > $0, Total Expenses, Total Income, and Leftover (green if positive, red if negative).

### Save / Discard Model
All edits are held in memory until **Save** is clicked — nothing writes to Firestore until then. **Discard Changes** reverts to last saved state (confirmation required if dirty). Navigating away or switching budgets with unsaved changes shows a warning dialog.

### Budget Actions
- **Use as Default** — visible on non-default budgets; promotes to default (stored in `userCol('settings').doc('app').defaultBudgetId`)
- **Archive** — soft confirm; moves budget off dropdown. Blocked if it is the current default.
- **Delete** — hard confirm "cannot be undone"; deletes doc + all subcollections. Allowed on any budget including last one (clears `defaultBudgetId`).

### Create / Copy Budget
"+ Add New Budget" in dropdown → name dialog (non-blank required) → optional "Copy From" (numbered list of existing budgets) → new budget created in Firestore, navigated to immediately. First budget created is automatically set as default.

### Archive Page (`#budget/archive`)
Lists all archived budgets. Each row: name, **Restore** (unarchive) and **Delete** buttons.

### Firestore Data Model
| Collection / Subcollection | Key fields |
|---|---|
| `budgets` | `name`, `isArchived`, `createdAt`, `updatedAt` |
| `budgets/{id}/categories` | `name`, `sortOrder` |
| `budgets/{id}/lineItems` | `categoryId`, `name`, `amount`, `estDueDay`, `note`, `sortOrder` |
| `budgets/{id}/incomeItems` | `name`, `amount`, `sortOrder` |
| `settings/app` | `defaultBudgetId` |

Subcollections included in Firestore backup via `BUDGET_SUBCOLLECTIONS` in `settings.js`.

### Phase 2: Non-Monthly Expenses

**Sub-screen**: `#budget/nonmonthly/:budgetId` → `loadBudgetNonMonthlyPage(budgetId)`

A per-budget list of non-monthly expenses (annual, quarterly, etc.). Each item has a name, flat annual amount, optional notes, and an **active** checkbox. Only active items count toward the monthly reserve. Auto-saves every change directly to Firestore — no Save button.

**Monthly Reserve** = `sum(active item amounts) ÷ 12`, rounded to whole dollar.

**Non-Monthly Reserve auto-category** on the main budget page:
- Always present, read-only, cannot be deleted (visually distinct — purple header)
- Shows computed `/mo` reserve and a "Manage" button navigating to the sub-screen
- Navigating while main budget has unsaved changes triggers the unsaved-changes warning
- Reserve counted in Total Expenses and shown as a row in the Summary section (hidden if $0)

**Sub-screen layout**: reserve summary bar (total/mo, active count, annual ÷ 12) → column headers → item rows → "+ Add Item" button.

**Subcollection**: `budgets/{id}/nonMonthlyItems` — fields: `name`, `amount`, `notes`, `isActive`, `sortOrder`, `createdAt`. Included in `BUDGET_SUBCOLLECTIONS` backup. Copied when using Copy Budget.

---

## Part 9: Places & Check-In

**JS file**: `js/places.js`

Tracks real-world places the user visits. Places tie together journal check-ins, activities, and a searchable location history. Uses the **Foursquare Places API** (new API: `places-api.foursquare.com`) for nearby discovery and text search via a **Cloudflare Worker proxy** (required to bypass CORS restrictions — configured in Settings → General Settings → Places). A Foursquare Service API Key is required, stored in `userCol('settings').doc('places').workerUrl`. Nominatim (OpenStreetMap) is retained only for reverse geocoding (lat/lng → address).

### Places List (`#places`)
- Shows all saved places as cards (name, address/city, category)
- Soft-delete: `status: 0` hides a place from the list without removing Firestore data
- "+ New Place" button opens the add-place modal

### Place Detail Page (`#place/{id}`)
- Sets `window.currentPlace` on load
- **Summary line**: "X journal entries · Y activities" (loaded in parallel via `Promise.all`)
- **Interactive map**: Leaflet.js map centered on `lat`/`lng`, showing a marker. Initialized in a 50ms `setTimeout` after the container becomes visible; `map.invalidateSize()` called to handle deferred layout. Previous map instance destroyed with `_placeDetailMap.remove()` on re-visit.
- **Photos**: Full gallery via `photos.js` — `targetType: 'place'`, `targetId: place.id`. Camera and gallery upload buttons wired in `photos.js` `DOMContentLoaded`.
- **Facts**: Key/value pairs via `facts.js` — `targetType: 'place'`. "Add Fact" button wired in `facts.js` `DOMContentLoaded`.
- **Journal Entries**: Lists all journal entries with `placeIds` array containing this place's ID. Uses `array-contains` Firestore query (no composite index needed). Sorted newest-first. Check-in entries show a 📍 badge. Clicking an entry navigates to it via `openEditJournalEntry(id)`.
- **Activities**: Full activity list via `activities.js` — `targetType: 'place'`. "Log Activity" button wired in `activities.js`.

### Add / Edit Place
- Modal with fields: Name, Address, City, State, Zip, Category, Notes
- **GPS capture**: "Use My Location" button calls `navigator.geolocation.getCurrentPosition`, then reverse-geocodes via Nominatim to auto-fill address
- **Search**: Text search field queries saved places (Firestore) first, then Foursquare `places/search`; results shown in dropdown; selecting auto-fills all fields including `lat`/`lng`/`fsqId`

### Check-In Flow
1. User taps "📍 Check In" (QuickLog or SecondBrain)
2. **Check-in picker modal** opens. GPS fires immediately to find nearby places. A **Help** button (top-right) explains all behavior in plain language.
3. On GPS success: nearby venues shown via `placesNearby()`. On failure: "Could not load" message + inline **Retry** button (re-fires GPS without closing the modal, using `maximumAge: 0` for a fresh reading).
4. **Name search**: User can type in the search box; results come from Foursquare biased to the user's current GPS position. Each result shows name, address, category, and **distance from current location** (e.g. "0.3 mi") to disambiguate same-named locations.
5. **Select a venue**: Tapping a result closes the picker and opens the journal entry form pre-filled with that venue. The check-in is **not saved yet** — the user must tap Save on the journal form.
6. **Enter Manually**: Opens the journal entry form with a blank location. No place record is created — only a plain journal note. Manual entries have no GPS, address, or Foursquare ID and won't appear in the Places list or on a map.
7. On Save: creates a `journalEntries` doc with `placeIds: [placeId]`, `isCheckin: true`. If the venue wasn't already in Firestore, `placesSaveNew()` creates the place record first (dedup by `fsqId`).
8. **Finding check-ins**: Journal → "Check-Ins Only" filter checkbox. Check-in entries show a 📍 badge.

### Foursquare Integration
- **API**: `places-api.foursquare.com` (new API — not the retired `api.foursquare.com/v3`)
- **Proxy required**: Browser cannot call Foursquare directly (CORS OPTIONS returns 400). A Cloudflare Worker proxy handles auth and adds CORS headers. Worker URL stored in `userCol('settings').doc('places').workerUrl`.
- **Auth**: Worker adds `Authorization: Bearer <key>` and `X-Places-Api-Version: 2025-06-17` headers — no auth headers sent from browser.
- **Nearby search** (`placesNearby`): `GET /places/search?ll=lat,lng&limit=20&fields=fsq_place_id,name,categories,location,geocodes`
- **Text search** (`placesSearchByName`): `GET /places/search?query=...&ll=lat,lng&limit=8&fields=fsq_place_id,name,categories,location,geocodes` — `ll` bias toward user's GPS position
- **Response shape**: `fsq_place_id` (not `fsq_id`); coordinates in `geocodes.main.latitude/longitude`
- Worker URL cached in memory for 5 minutes (`_placesWorkerUrlCache`)
- **Distance label**: `placesDistanceLabel(lat1,lng1,lat2,lng2)` — Haversine formula, returns e.g. "0.3 mi" or "nearby"
- **Nominatim** (reverse geocode only): `https://nominatim.openstreetmap.org/reverse` — converts lat/lng to address; rate-limited to 1 req/sec

### LLM Enrichment (`placesEnrichWithLLM()`)
- Non-blocking background enrichment after a new place is saved
- Sends place name + address to LLM and asks for category, opening hours hint, and notes
- If LLM responds, updates the Firestore doc with enriched fields
- Silent failure — no UI feedback if LLM is not configured or enrichment fails

### Deduplication
- Before creating a new place, `placesSaveNew()` checks `fsqId` (Foursquare-sourced) or `osmId` (legacy) for a match
- If a match is found, returns the existing place's ID without creating a duplicate
- Manually-entered places (no `fsqId` or `osmId`) are never auto-deduped

### Firestore
- **Collection**: `places`
- **Key fields**: `name`, `address`, `lat`, `lng`, `fsqId?`, `osmId?` (legacy), `category?`, `status` (1=active, 0=soft-deleted), `createdAt`
- **Soft delete**: `status: 0` (never hard-deleted)
- **No `orderBy`** in queries — avoids composite index requirement; results sorted client-side

### Routes
- `#places` — places list
- `#place/{id}` — place detail

### SecondBrain Integration
- `CHECK_IN` action: short-circuit (same pattern as `FIND_THING` — no Firestore write from SecondBrain itself)
- If `payload.placeName` provided: calls `placesSearchByName()` → passes first match to `openCheckInForm(venue, false)`
- If `payload.useGps: true` or no name: calls `openCheckIn()` (GPS-based nearby venues)
- The place is not committed to Firestore until the user taps Save on the check-in form

### Life Projects (`life-projects.js`)

**Plan document**: `ModifyProjects.md`

Rich project management for the Life section — supports day-by-day itineraries, bookings, packing lists, to-dos, journal notes, people lists, and cost rollup. Template-based (Vacation is the first template; Build and General are planned).

**Firestore**:
- `lifeProjects` — `title`, `description`, `template` (vacation/build/general, locked after creation), `status` (planning/active/on-hold/done), `mode` (planning/travel), `archived`, `startDate`, `endDate`, `targetType` ('life'), `targetId` (null), `people[]` ({name, contactId, notes}), `bookingTypes[]`, `links[]` ({id, label, url}), `createdAt`, `updatedAt`
- Subcollections per project: `todoItems` ({text, done, notes, sortOrder}), `planningGroups` ({name, sortOrder, items[]}), `days`, `bookings`, `bookingPhotos`, `packingItems`, `projectNotes`

**Routes**: `#life-projects` (list), `#life-project/{id}` (detail)

**Project list page**: Cards showing template icon, title, date range, description, and status badge (color-coded, left-aligned below title). Archive/unarchive toggle, edit metadata, delete with cascade (all subcollections deleted). "Show archived" checkbox filters archived projects. Breadcrumb: Life › Projects.

**New project flow**: Template picker (Vacation enabled, others grayed/disabled), title, description, start/end dates. Vacation template auto-populates starter to-do items on creation.

**Import from JSON**: "📥 Import" button on the project list page. Reads a `.json` file containing project data (project doc, bookings, days with itinerary items, todoItems, packingItems, projectNotes, locations, distances, planningGroups). Import flow: (1) select JSON file, (2) people-linking step — modal walks through each person in the file, showing a contact search picker (same chip-based pattern) with "Don't Link" skip option, (3) creates project doc + all subcollections in Firestore via batch writes. Locations are deduplicated by name against existing global `locations` collection — existing records are reused, new ones are created. All locations are linked to the project via `projectLocations` subcollection. Distances are written to the global `distances` collection skipping pairs that already exist. Item `locationId` fields (JSON IDs) are mapped to real `projectLocations` doc IDs during import. Booking confirmation numbers are auto-matched to itinerary items' `bookingRef` fields. After import, navigates to the new project detail page. JSON files stored in `imports/` directory.

**JSON format** — top-level arrays: `locations[]` (id, name, address, phone, website, contact, notes), `distances[]` (fromLocationId, toLocationId, miles, time, mode, notes — IDs reference the JSON `id` field on locations), `days[]`, `planningGroups[]`, `bookings[]`, `todoItems[]`, `packingItems[]`, `projectNotes[]`. Items in `days[].items[]` and `planningGroups[].items[]` accept an optional `locationId` using the JSON location id.

**Project detail page**: Breadcrumb: Life › Projects › {title}. Scrollable accordion layout with lazy-loading sections:
- **Trip Info**: Dates, description (read-only display, edit from list page), cost rollup showing total from bookings + day item costs
- **Itinerary**: Day-by-day planning. Auto-generate days from project date range (with optional pre/post travel days). Each day has label, date, location, and embedded items array. **Day cards are individually collapsible** — clicking the day header (▾/▸ chevron + title area) toggles the items body. Collapsed days show an item count badge. Collapse state is in-memory (resets on page reload). SortableJS drag handles still work normally on expanded days. Items edited via shared modal form (all fields inline — no prompt chains): title, status (confirmed/maybe/idea/nope), time, duration, **leave by** (departure time), **"Part of official timeline"** checkbox, cost + costNote, confirmation, contact, notes, **facts** (dynamic label+value rows — URL values render as clickable links in the detail panel), location dropdown (links item to a project location), booking link dropdown, show-on-calendar checkbox, move-to dropdown (any other day or planning group). Cancel/Save buttons right-aligned. Drag-and-drop reorder for both days and items within a day (SortableJS). Expandable detail panel per item.
  - **Official Timeline**: Items marked "Part of official timeline" (`onTimeline: true`) display a left time column (blue left border) showing ⏰ start time / ⏱ duration / 🚀 leave-by time (stacked; only fields that are set). Non-timeline items show no left column. Between consecutive timeline items, a **travel row** is auto-inserted showing depart time (previous item's leave-by), travel mode icon + time + miles (from global distances collection), and route label (From → To). If no distance record exists for the pair, shows ⚠️ travel time needed as a placeholder.
  - **Journal icon on day cards**: When the itinerary loads, journal entries for the project's date range are fetched in a single query. Any day that has at least one journal entry shows a 📓 icon button in the day card header (to the right of ✏️, before ✕). Tooltip: "Journal Entries". Clicking opens the Life > Journal page in a new browser tab with the custom date range pre-set to that day's date (both start and end). The user can then adjust the range in the journal to see adjacent days.
- **Planning Board** (planning mode only): Research and brainstorming area organized by freeform groups (e.g., "Jackson area", "Old Faithful area", "Day trips"). Each group has items with the same fields as itinerary items (title, status, cost, duration, notes, facts[], contact, locationId). Items can be moved to a specific itinerary day or to a different planning group via the shared item modal. Itinerary items can likewise be moved back to a planning group. Leftover items after the trip represent things decided against. Subcollection: `planningGroups` ({name, sortOrder, items[]}). Hidden in travel mode. Drag-and-drop reorder for groups and items. **Group cards are individually collapsible** — clicking the group header toggles the items body; collapse state is in-memory.
- **Journal** (planning mode only): Journal-style entries with title, text, and auto-set createdAt. Displayed newest first. Add/edit/delete. Accordion summary shows note count. Hidden in travel mode.
- **To-Do** (planning mode only): Checklist with done toggle, notes, drag-and-drop reorder (SortableJS). Summary shows done/total count. Vacation template pre-populates 10 starter items. Hidden in travel mode.
- **Photos**: Project-level photo gallery — screenshots, inspiration images, maps, etc. not tied to a specific booking. Add via 🖼️ Gallery (file picker, supports multi-select), 📷 Camera (capture), or 📋 Paste (clipboard). After selecting, a caption modal appears (optional caption, Enter to confirm, Cancel skips the photo). Photos stored in `projectPhotos` subcollection (Base64 + caption + createdAt). Displayed as a 4-per-row thumbnail grid (square crop, object-fit cover). Clicking a thumbnail opens a **lightbox** overlay (dark backdrop) showing the full image, caption, ✏️ Edit Caption button, 🗑️ Delete button, and ✕ Close. Clicking the backdrop or pressing Escape also closes the lightbox. Caption editing uses a `prompt()` for simplicity. Visible in both planning and travel modes. Accordion summary shows photo count.
- **Links**: Project-level reference links not tied to any day or item — e.g., YouTube videos, maps, research pages saved during planning. Each link has a label and URL. Rows show: 🔗 clickable label (opens in new tab), ⧉ copy-to-clipboard button, ✏️ edit, ✕ delete. Stored as `links: [{id, label, url}]` array on the project document. Visible in both planning and travel modes.
- **Bookings**: Full CRUD with modal form. Fields: name, type (dropdown from project's bookingTypes list with "Add new..." option), start/end dates, multi-day toggle, start/end times, confirmation #, cost + costNote, payment status (paid/deposit/balance-owed), contact, address, link, notes. Booking screenshots stored in `bookingPhotos` subcollection — upload, view gallery, delete. Booking badges on day items scroll to the booking card. Drag-and-drop reorder.
- **Packing**: Items grouped by category (Clothes, Toiletries, Electronics, Documents, Gear/Other) with category headers and per-category packed counts. Vacation template offers "Populate Default List" button to pre-fill ~47 starter items. Check/uncheck packed status. Accordion summary shows "packed/total".
- **Locations** (planning mode only, icon 📌): List of real-world places linked to this project. Each row shows name and address. Row buttons: Edit (opens modal), Unlink (removes from project, keeps global record), Delete (removes global record — confirm first). **Add Location modal**: search field filters existing global locations by name — selecting one links it to the project; "New location" section below (always visible) has fields: Name, Address, Phone, Website, Contact, Notes, plus an "Add to Planning Board" checkbox that auto-creates a planning item with this location linked. Locations stored in user-scoped global collection `userCol('locations')`; project membership tracked in `projectLocations` subcollection (locationId + cached name/address/phone). Hidden in travel mode.
- **Distances** (planning mode only, icon 🛣️): Reference list of travel distances between project locations. Shown as **From → To | Time | Miles | Mode** with ✏️ Edit and ✕ Delete per row. No standalone Add button — distances are created from the 🛣️ button on a planning or itinerary item (item must have a location set; From is pre-filled from that location). **Add/Edit Distance modal**: From (read-only label), To dropdown (project locations excluding From), Time (text, e.g. "51 min"), Miles (number), Mode (Drive/Walk/Bike/Fly), Notes, Ask AI button. Requires at least Time or Miles. Distances stored in user-scoped global collection `userCol('distances')` with `fromLocationId`/`toLocationId` referencing global location doc IDs. Accordion shows a helper message when fewer than 2 locations are linked to the project. Hidden in travel mode.
- **People**: Chip-based contact picker (same pattern as Life Calendar events). Type partial name, dropdown filters contacts, Enter selects first match. Selected people shown as blue chips with ✕ remove button and clickable name linking to contact detail. Edit button allows adding notes. Stored as array on project doc ({name, contactId, notes}).

**Item row buttons** (planning board and itinerary, planning mode only): Clicking the **item title** expands/collapses the detail panel (no separate expand icon). On desktop the collapsed row shows: status badge, title, booking badge, location badge (📍 name), ✏️ edit button, and 📍/🛣️ location button. On **mobile (≤640px)** the collapsed row shows only the title — status badge, location badge, booking badge, ✏️ edit, and 📍/🛣️ are hidden and instead appear at the top of the **expanded detail panel** (badges on one line, buttons on the next line), keeping the collapsed row clean. Delete lives inside the edit modal only. CSS utility classes `.lp-desktop-only` / `.lp-mobile-only` control visibility. Expanded detail panel shows location as its own row (name · clickable address → Google Maps · clickable phone → tel:).

**Planning/Travel mode toggle**: Button in project header switches mode (stored on project doc). Travel mode hides maybe/idea/nope items, hides cost fields, hides To-Do, Locations, and Notes sections, auto-expands Itinerary and Bookings, and makes confirmed items more prominent.

**Search**: Text input at the top of the detail page filters visible content across all accordion sections — day cards, booking cards, to-do items, packing items, and notes. Hides non-matching elements in real time.

**Delete cascade**: Removes all subcollection docs (days, bookings, bookingPhotos, todoItems, packingItems, projectNotes, planningGroups, projectLocations) before deleting the project doc.

---

## Part 10: Thoughts

**JS files**: `js/thoughts.js`, `js/top10lists.js`, `js/memories.js`, `js/views.js`
**Routes**: `#thoughts`, `#top10lists`, `#top10list-create`, `#top10list-edit/:id`, `#memories`, `#memory-create`, `#memory-edit/:id`, `#views`, `#view/:id`, `#view-history/:viewId/:historyId`, `#views-categories`
**Nav context**: `THOUGHTS_PAGES` (amber tile on main landing; thoughts-specific nav bar with Top 10 Lists / Memories / My Views links)
**Firestore**: `top10lists`, `top10categories`, `memories`, `memoryLinks`, `memoryTags`, `views`, `viewCategories` collections; sort pref + seed flag in `userCol('settings').doc('thoughts')`

### Main Landing Tile (`#main`)
- Thoughts card appears as the 4th tile on the main landing page (2×2 grid with Yard / House / Life)
- Amber gradient (`landing-tile--thoughts`); navigates to `#thoughts`

### Thoughts Landing Page (`#thoughts`)
- Shows a grid of feature cards: Top 10 Lists, Memories, and My Views
- **Top 10 Lists (x)** tile: displays the live count of created lists; navigates to `#top10lists`
- **Memories (x)** tile: displays the live count of memories; amber gradient; navigates to `#memories`
- **My Thoughts (x)** tile: displays the live count of all thoughts; teal gradient (`landing-tile--views`); navigates to `#views`
- thoughtsNav bar shows on all Thoughts pages: Top 10 Lists / Memories / My Thoughts links
- Breadcrumb: _(none — top-level page)_

### Top 10 Lists Page (`#top10lists`)
- **Sort control**: dropdown (Newest First / Oldest First / A–Z / **By Category**) + Sort button
  - Selection is saved to `userCol('settings').doc('thoughts')` → `top10SortPref` and persists across devices
- **Accordion list** of all Top 10 Lists:
  - **Flat sort** (Newest / Oldest / A–Z): single-level accordion, one item per row
  - **By Category**: two-level nested accordion — outer groups are categories (None first, then alpha) with list count shown; inner items are lists
  - **Collapsed**: list name + category badge (gray "None" or indigo named category) + **✎ edit icon** (always visible)
  - **Expanded**: same header plus **≡ notes toggle icon** (only visible when expanded, only rendered if any item has notes); body shows description (if any) + read-only preview of ranks 1–10
    - **✎ edit icon** navigates to `#top10list-edit/:id`
    - **≡ notes toggle**: clicking shows/hides item notes inline below each rank row (only items with notes show anything); icon highlights when active
  - Returning from create/edit: the saved list is auto-expanded (in By Category mode, the outer group also auto-expands)
- **"Manage Categories"** link at bottom — toggles inline Manage Categories panel:
  - Lists all categories with Edit / Delete buttons per row
  - Edit: unlocks the name input, swaps buttons to Save / Cancel
  - Delete: confirms, removes category from Firestore, moves affected lists to None, re-renders
  - Add field + Add button at bottom to create a new category
- On first load, three default categories (Books, Movies, Music) are seeded into `top10categories`;
  a `categoriesSeeded` flag is written to `userCol('settings').doc('thoughts')` to prevent re-seeding
- Breadcrumb: Thoughts › Top 10 Lists

### Create / Edit Page (`#top10list-create` / `#top10list-edit/:id`)
Both routes share the `page-top10list-edit` HTML section.

**Fields**:
- Name (required)
- Description (optional textarea)
- **Category** (select): None + seeded/user categories + "+ Add New Category…"
  - Choosing "+ Add New Category…" shows an inline input; Add saves to Firestore, inserts into select and selects it; Cancel restores prior selection

**The List — 20 ranked slots**:
- Always 20 slots visible; empty slots are allowed; no adding beyond 20
- **Drag-and-drop reorder** via SortableJS (touch-friendly); drag handle `⠿` on each row
- Ranks re-number automatically after every drag
- **"Runners Up" separator** (non-draggable) always sits between rank 10 and rank 11; repositions after drag
- **Note icon (✎)** per row:
  - Gray = no notes; **green** = notes text exists
  - Click → inline area expands below the row with: multi-line notes textarea + **URL input** (one link per item, optional)
  - **Save** button commits both note text and URL, collapses; **Cancel** restores previous values; **Escape** key also cancels
- **Delete List** button (edit mode only) — confirm dialog before deleting
- Save → writes to Firestore (including `categoryId`), returns to `#top10lists` with the saved list auto-expanded
- Cancel → returns to `#top10lists` without saving
- Breadcrumb: Thoughts › Top 10 Lists › New List (or Edit List)

### Firestore: `top10lists`
| Field | Type | Notes |
|-------|------|-------|
| title | string | Required |
| description | string | Optional |
| categoryId | string\|null | FK → `top10categories`; null = "None" |
| items | array | 20 `{title, notes, url}` objects in rank order |
| createdAt | timestamp | |
| updatedAt | timestamp | |

### Firestore: `top10categories`
| Field | Type | Notes |
|-------|------|-------|
| name | string | Category name |
| createdAt | timestamp | |

---

## Part 10a: Memories

**JS file**: `js/memories.js`
**Routes**: `#memories`, `#memory-create`, `#memory-edit/:id`
**Firestore**: `memories`, `memoryLinks`, `memoryTags`
**Plan document**: `MemoriesPlan.md`

### Memories List Page (`#memories`)
- Header: "Memories" + "+ New Memory" button + "In Progress only" filter toggle
- Breadcrumb: Thoughts › Memories
- Each row: drag handle (left) · **In Progress** badge (if `inProgress: true`) · title · date text (subdued)
- Rows are **draggable** via SortableJS; drag updates `sortOrder` float on the moved doc only — zero other writes
- "In Progress only" toggle hides rows where `inProgress !== true`
- Clicking a row navigates to `#memory-edit/:id`

### New Memory Flow (`#memory-create`)
- Shows a single title input; no Firestore write until title is filled and blurred (or Enter pressed)
- On blur with non-empty title: creates Firestore doc, does `history.replaceState` to `#memory-edit/:id`, transitions to edit page without a visible navigation event
- Cancel navigates back to `#memories` with nothing saved

### Memory Edit Page (`#memory-edit/:id`)
- Always editable — no separate view/read mode
- Breadcrumb: Thoughts › Memories › [title]
- Fields (top to bottom): Title · In Progress checkbox · When (free-text date) · Location · Tags · Body textarea · People chips · URLs · Linked Memories
- **Tags**: pill checkboxes (alphabetical); tap to toggle; "Add tag..." inline input creates new tag on Enter (stored in `memoryTags`, applied immediately); tags saved immediately on change (not debounced)
- **@-mentions**: type `@Name` in the body textarea; autocomplete dropdown shows only contacts flagged "Include in quick mentions"; type `@@Name` to search the full contact list; Tab or Enter picks first result; tapping an item selects it; selected contacts shown as teal chips (clickable links to `#contact/:id`) below the People section header; chips populated from `userCol('people')`; stored as `mentionedPersonIds[]`
- **Free-form names (++ trigger)**: type `++Name` or `++"Full Name"` in the body; on space/punctuation the `++` prefix is stripped from the textarea and an amber chip is added below; × button removes the chip; names deduplicated case-insensitively; stored as `mentionedNames[]`; People section hidden until at least one chip exists; full scan runs on blur to catch anything not followed by a space
- **Linked Memories**: "Linked Memories" section always visible on edit page; each link shows the other memory's title + dateText as a clickable link (navigates to that memory's edit page) with an × unlink button; "Link a Memory" button opens a picker modal with a live search input filtering all memories (excluding current and already-linked); clicking a row in the picker creates a `memoryLinks` doc and closes the modal; links are bidirectional — one doc serves both sides; unlinking deletes the `memoryLinks` doc only (memory docs are untouched)
- **Help button** (`?`, top-right): opens modal explaining the When field date syntax, `@mention`, and `++Name` shortcuts
- **Speak button** above body textarea: toggles Web Speech API continuous recognition; button turns red ("🔴 Listening...") while active; transcribed text is appended to the body with smart capitalization and spacing; hidden if browser doesn't support speech recognition; reuses `initVoiceToText()` from journal.js
- **URLs**: "Links" section always visible on edit page; each entry shows 🔗 label (or raw URL if no label) as a clickable link + pencil edit button + × delete; pencil or "+ Add URL" opens an inline form (label + URL inputs, Save/Cancel); URLs saved immediately on add/edit/delete (not debounced); stored as `urls[]` array of `{label, url}`
- **Auto-save**: debounced 1.5 s after last keystroke; saves title, body, dateText, location, inProgress, mentionedPersonIds, mentionedNames (URLs save immediately on change)
- **Cancel**: if new memory → confirm "Discard this memory?" → delete doc → `#memories`; if existing → confirm "Discard your changes?" → restore original → `#memories`
- **Delete**: confirm → delete memory doc + all `memoryLinks` referencing it → `#memories`

### Sort Order
- `sortOrder` is a float stored per document (initial gap: 10000 per item)
- Drag assigns midpoint float between neighbors — never updates any other document
- New memories (no dateText yet) inserted at bottom (`lastSortOrder + 10000`)
- When `dateText` is filled/changed and the field is blurred, `sortDate` is parsed and `sortOrder` is recalculated to slot the memory in the correct chronological position among existing memories
- Date parser handles: exact dates, month+year, year-only, season+year, decade prefixes (early/mid/late), named holidays (Christmas, Thanksgiving), two-digit years with apostrophe
- Rebalance runs automatically if a gap collapses below 0.0001

### Data Model

#### `memories`
| Field | Type | Notes |
|---|---|---|
| `title` | string | Required; shown in list |
| `body` | string | Free-form narrative (can be very long) |
| `dateText` | string | Exactly as typed by user |
| `sortDate` | string\|null | ISO date derived from dateText on blur — used for sort placement |
| `sortOrder` | float | Manual drag order |
| `location` | string | Free-form text |
| `tags` | string[] | Tag names (lowercase); assigned from global `memoryTags` collection |
| `mentionedPersonIds` | string[] | Contact IDs from @-mentions (M5) |
| `mentionedNames` | string[] | Free-form names from ++Name (M6) |
| `urls` | object[] | `{label, url}` pairs (M7) |
| `inProgress` | boolean | Default `true`; uncheck when done |
| `createdAt` | timestamp | |
| `updatedAt` | timestamp | |

#### `memoryLinks`
| Field | Type | Notes |
|---|---|---|
| `memoryIds` | string[2] | Always `[smallerId, largerId]` — sorted for uniqueness |
| `createdAt` | timestamp | |
- Doc ID: `${minId}_${maxId}` — idempotent, prevents duplicates
- Query with `array-contains` to find all links for a memory
- Bidirectional by nature: one record serves both sides

#### `memoryTags`
| Field | Type | Notes |
|---|---|---|
| `name` | string | Tag name |
| `createdAt` | timestamp | |

---

## Part 10c: My Thoughts

**JS file**: `js/views.js`
**Routes**: `#views`, `#view/:id`, `#view/new`, `#view-history/:viewId/:historyId`, `#views-categories`
**Firestore**: `views` collection; `views/{id}/history` subcollection; `viewCategories` collection (with `thoughtType` field + `subcategories` subcollection per major category)

A personal thought journal — record, edit, and historically track opinions, reflections, advice, and reviews. Each thought has a **type**: View, Reflection, Advice, or Review.

### Thought Types
| Type | Purpose |
|---|---|
| **View** | Personal opinions and stances on topics |
| **Reflection** | Personal essays on experiences, books, people that shaped you |
| **Advice** | Guidance you would pass on to others |
| **Review** | Reviews of books, movies, experiences, etc. |

### Category System
- Two-level hierarchy: **Major Category** → **Subcategory**
- Categories are **scoped by type** — each `viewCategories` doc has a `thoughtType` field; the category dropdowns only show categories matching the current thought's type
- 5 seeded major categories (type: `view`): Politics & Society, Personal Beliefs, Life & Family, Practical, Other
- Every major category always has a **General** subcategory (isDefault:true, order:0, protected from deletion)
- Seeding runs once on first `#views` load; subsequent visits skip if categories already exist
- Category management page at `#views-categories`

### Thoughts List Page (`#views`)
- Header: "My Thoughts" + "+ New Thought" button
- **Type tabs**: View / Reflection / Advice / Review — clicking a tab filters the accordion to show only thoughts of that type (and their type-specific categories); defaults to View
- Search bar: live filter by title and short version within the current type tab; matching accordions auto-expand; "No thoughts match '…'" message; clearing collapses all back to default
- **Two-level accordion**: major categories (filtered to current type) are outer; subcategories are inner
  - Each shows count in parens; empty categories/subcategories are hidden
- **Thought cards**: title, date (currentDate), short version preview, type badge, history badge (if `historyCount > 0`)
- Footer: "Manage Categories" link → `#views-categories`
- Breadcrumb: Thoughts › My Thoughts

### New Thought Page (`#view/new`)
- Form order: **Type** (required) first — drives which categories load; then **Major Category** (required) and **Subcategory** (defaults to General); then **Title** (required)
- Category dropdowns are disabled until a type is selected; switching type reloads categories for the new type
- "Create Thought" button enabled only when type + title + major category are all filled
- **"✨ Ask AI For a Topic" button**: shown below title only when LLM is configured; prompts are tailored to the selected type
  - AI Topics modal: 10 suggested titles for chosen category/subcategory
  - **"🔄 Get 10 Different Ones"**: re-prompts excluding all prior suggestions
  - Selecting a suggestion populates the title field and closes the modal
- "Create Thought" → writes doc to `views` collection with `thoughtType` field → navigates to `#view/{id}`
- Breadcrumb: Thoughts › My Thoughts › New Thought

### Thought Detail Page (`#view/:id`)
- All fields editable in-place; each has its own Save button
- **Title**: inline input + Save button; saving also updates breadcrumb label
- **Type**: shown as a read-only colored badge (not editable after creation)
- **Category row**: Major Category + Subcategory dropdowns (filtered to the thought's type); changing either auto-saves
- **Archive/Update button** (label varies by type): enabled when `currentDate` is NOT today
  - View: "I've Changed My View" / Reflection: "Update My Reflection" / Advice: "Update My Advice" / Review: "Update My Review"
- **Delete** button: confirms then batch-deletes `history` subcollection + thought doc → navigates to `#views`
- **Short Version**: textarea (500-char cap, live counter) + Save button
- **Long Version**: large textarea + Save button; auto-saves on blur if changed; shows "Current since [date]"
- **Links section**: list of `{label, url}` pairs in `urls[]`; Add/Edit/Delete; saves immediately
- **Previous Versions section**: list of archived dates, newest first; each row has date link → history page + delete button
- Breadcrumb: Thoughts › My Thoughts › [title]

### Archive Previous Version Modal
- Opens pre-filled with current short and long version (both editable)
- Modal title reflects the thought type (e.g., "I've Changed My View" for View type)
- Optional "What prompted this change?" textarea
- On Save: archives to `views/{id}/history` with `archivedAt`; updates `currentDate`; increments `historyCount`; reloads page

### Historical Version Page (`#view-history/:viewId/:historyId`)
- Read-only — no edit controls
- Shows: current (global) title, "Archived [date]" label, "Previous Version — Read Only" badge
- Sections: "What prompted this change?" (if present), Short Version, Long Version
- Back button → `#view/{id}`; Delete button (confirm) → removes doc, decrements `historyCount`, redirects to `#view/{id}`
- Breadcrumb: Thoughts › My Thoughts › [title] › [archived date]

### Firestore Data Model
| Field | Type | Notes |
|---|---|---|
| `title` | string | global — never versioned |
| `thoughtType` | string | `view` / `reflection` / `advice` / `review` |
| `shortVersion` | string | 500-char cap |
| `longVersion` | string | auto-saves on blur |
| `urls` | array of {label, url} | links, not versioned |
| `categoryId` | string | major category doc ID |
| `subcategoryId` | string | subcategory doc ID |
| `historyCount` | number | incremented on archive |
| `currentDate` | timestamp | set on create; updated on archive |
| `createdAt` / `updatedAt` | timestamp | standard |

History subcollection (`views/{id}/history`): `shortVersion`, `longVersion`, `archivedAt` (timestamp), `prompt` (optional string).

`viewCategories` docs: `name`, `order`, `thoughtType` (scopes category to a thought type), `createdAt`.

### Backup
- `views` collection (with `history` subcollection per doc) included in `BACKUP_DATA_COLLECTIONS` in `settings.js`
- `viewCategories` collection (with `subcategories` subcollection per doc) included in `BACKUP_DATA_COLLECTIONS`

### Category Maintenance Page (`#views-categories`)
- Breadcrumb: Thoughts › My Thoughts › Manage Categories
- **Type selector tabs** at top (View / Reflection / Advice / Review) — switching type reloads to show only categories for that type
- Lists major categories (filtered to selected type) with their subcategories; General always first in each major
- **Major category rows**: drag handle (⋮), name, Rename + Delete buttons; all draggable to reorder
- **Subcategory rows**: drag handle (⋮), name, Rename + Delete buttons (no drag / no delete on General)
- **General row**: "default" badge, Rename only, always stays first
- **+ Add Subcategory** button under each major: `prompt()` for name → creates doc
- **+ Add Major Category** button at bottom: `prompt()` for name → creates major cat doc stamped with current type + auto-creates General subcategory
- **Rename**: inline — clicking Rename replaces name span with input; Enter/blur saves, Escape cancels
- **Delete subcategory**: checks if any thoughts assigned; if yes: warns "X thoughts will be moved to General. Continue?" and batch-moves them; then deletes sub doc
- **Delete major category**: blocked (alert) if any thoughts have `categoryId == catId`; otherwise batch-deletes all subcollection docs + major doc
- **Drag-and-drop reorder**: HTML5 drag; majors reorder among majors; subs reorder within their major only; `order` fields updated in Firestore on drop

---

## Part 10b: AI / LLM Features

**Plan documents**: `Chat.md`, `SecondBrain.md`

### Settings (`settings.js`)
LLM is configured per-user in `userCol('settings').doc('llm')`:
- `provider`: `openai` or `xai`
- `apiKey`: user's personal API key (stored behind auth, not in localStorage)
- `model`: optional override (defaults: `gpt-4o-mini` for OpenAI, `grok-3` for xAI)

Foursquare Places API key stored in `userCol('settings').doc('places')`:
- `foursquareApiKey`: API key entered by user in Settings → General → Places (Foursquare) card
- Saved/loaded with the same pattern as the LLM key; a Test button verifies the key with a live NYC coffee search

#### Google Calendar Integration

Syncs Yard Calendar (`calendarEvents`) and Life Calendar (`lifeEvents`) events to Google Calendar for native phone reminders. Configured in **Settings → General → Google Calendar**.

**Dual-mode architecture:**
- **Mode 1 (no Client ID):** An "Add to Google Calendar" deep link button appears on every Yard and Life Calendar event card. Clicking opens Google Calendar pre-filled with the event. User saves manually; GCal handles reminders.
- **Mode 2 (Client ID configured + connected):** Full auto-sync — events are created, updated, and deleted in GCal automatically whenever changed in Bishop. A dedicated named calendar ("Bishop" by default, user-configurable) is created in Google Calendar.

**Settings fields** (`userCol('settings').doc('googleCalendar')`):
- `clientId`: Google OAuth 2.0 Client ID
- `calendarName`: Name of the dedicated GCal calendar (default: "Bishop")
- `defaultReminderMinutes`: Lead time for reminders (default: 1440 = 1 day)
- `accessToken`: Short-lived OAuth access token
- `tokenExpiry`: Unix timestamp when access token expires
- `gcalCalendarId`: Google Calendar ID of the Bishop calendar
- `connected`: Boolean — whether OAuth has been approved

**OAuth flow:** Uses Google Identity Services (GIS) library. Silent re-auth (no popup) attempted on token expiry; full consent screen only shown on first connect or after access revocation. Soft disconnect — clears token locally, GCal events and stored event IDs preserved for seamless reconnect.

**Sync behavior (Mode 2):**
- **Yard Calendar** (implemented): all-day GCal events by default. One-time events use `gcalEventId`; recurring events use `gcalEventIds` map (`{ "YYYY-MM-DD": "gcalEventId" }`) — each occurrence synced as a separate GCal event. Sync window: 12 months (10 years for yearly events). Hooks: create, edit, delete, complete, cancel occurrence, reschedule. Completed occurrences get "✓ " title prefix. Cancelled occurrences are deleted from GCal. If event has `startTime` field (ADD_REMINDER with explicit time), creates a timed GCal event instead of all-day (30-min duration). If event has `reminders` array field, that overrides `defaultReminderMinutes` for that event.
- **Life Calendar** (implemented): timed GCal events if `startTime` set; all-day if not. Multi-day if `endDate` set. Uses `gcalEventId` (no recurring events). Hooks: create, edit (including status changes), delete. Status prefix: `attended` → "✓ Title", `didntgo` → "✗ Title", `upcoming` → plain title. Description + "Category: X" if category set. Location resolved from `locationContactId` (contact name) or `location` text field.

**Recovery / Sync All (implemented):** `gcalSyncAll()` queries all upcoming one-time yard events (`date >= today`), all recurring yard events, and all upcoming life events (`startDate >= today`), then calls `gcalSyncYardEvent` / `gcalSyncLifeEvent` on each. Shows a progress toast and a final "Synced N events" summary toast. Disables the Sync All button during the run. On calendar-level 404 during the loop, calls `gcalHandleCalendarNotFound()` (which recreates the calendar and re-runs Sync All). **Recreate Calendar** button wipes all `gcalEventId`/`gcalEventIds` fields, creates a new GCal calendar, and calls Sync All. **First-Connect Prompt:** after OAuth success, counts upcoming events without a `gcalEventId`; if > 0, shows a confirm dialog warning about potential duplicates; Yes → Sync All, No → user can trigger manually later.

**Firestore additions:** `gcalEventId` (string|null) and `gcalEventIds` (map|null) on `calendarEvents` docs; `gcalEventId` (string|null) on `lifeEvents` docs.

#### Backup & Restore
Two separate backup files — **data** (all Firestore collections) and **photos** (Base64 image data from the `photos` collection).

**Data backup** covers all top-level `userCol()` collections defined in `BACKUP_DATA_COLLECTIONS` (67 collections spanning Yard, House, Garage, Vehicles, People, Health, Life, Thoughts, and Misc). Additionally, `lifeProjects` subcollections (`bookingPhotos`, `bookings`, `days`, `packingItems`, `planningGroups`, `projectLocations`, `projectNotes`, `projectPhotos`, `todoItems`) are embedded inside each project's backup entry under a `subcollections` map, so vacation itineraries, bookings, and packing lists are fully preserved.

**Restore** reads the backup JSON, deletes then rewrites each collection. For `lifeProjects`, subcollections under each project doc are deleted first (to avoid orphans), then rewritten from the `subcollections` map in the backup entry.

**Photos backup** is a separate file (can be large) — downloads just the `photos` collection.

### Chat (`chat.js`)
Simple conversational AI interface.

**Route**: `#chat`

- Free-form text input with optional image attachment
- Responses rendered as markdown (via Marked.js)
- Ephemeral — no conversation history stored in Firestore
- Use cases: plant identification, general yard/home questions, advice

### SecondBrain (`secondbrain.js`, `sbissues.js`)

**Plan document**: `SecondBrain.md`

Natural language command interface for logging anything hands-free.

**Route**: `#secondbrain` (accessed via nav)

**Input**: Text field or voice input. Optional photo attachment.

**Flow**:
1. User types or speaks a command (e.g., "I sprayed herbicide on the front yard today")
2. App sends command + full entity context (all zones, plants, vehicles, etc. by name+ID) to LLM
3. LLM returns a JSON `{action, payload}` describing what to do
4. App shows a **confirmation screen** with editable fields
5. User reviews and confirms (or edits) → app writes to Firestore
6. App navigates to the relevant entity detail page

**Confirmation screen**: Shows all detected fields. Unknown entities (e.g., a chemical not in the list) are flagged for user confirmation. Chemicals shown as checkboxes.

**Supported actions**:

| Action | What it does |
|--------|-------------|
| `LOG_ACTIVITY` | Logs an activity to a zone, plant, weed, vehicle, house entity |
| `ADD_JOURNAL_ENTRY` | Creates a journal entry |
| `ADD_CALENDAR_EVENT` | Creates a calendar event (recurring/one-time chore; not for "remind me") |
| `ADD_REMINDER` | Sets a time-based reminder. Routes to `calendarEvents` (yard/house) or `lifeEvents` (no entity / person). Stores `startTime` (HH:MM) and `reminders` array ([{method,minutes}]) on the doc. Date-only → dual GCal reminders (1440 min + 5 min at 9am); timed → 5 min only. Triggers GCal sync immediately via `gcalSyncYardEvent` or `gcalSyncLifeEvent`. |
| `ADD_PROBLEM` | Logs a problem/concern to an entity |
| `ADD_IMPORTANT_DATE` | Adds a birthday/anniversary to a person |
| `LOG_MILEAGE` | Adds a mileage log entry to a vehicle |
| `ADD_FACT` | Adds a fact (key/value) to an entity |
| `ADD_PROJECT` | Creates a project on an entity |
| `ADD_TASK` | Creates a quick task on a zone, plant, vehicle, room, or item (same Firestore write as `ADD_PROJECT`; triggered by "add a task / to-do" phrasing) |
| `LOG_INTERACTION` | Logs a people interaction |
| `ADD_WEED` | Creates a new weed record |
| `ADD_TRACKING_ENTRY` | Logs a journal tracking value |
| `LOG_EXERCISE` | Logs a personal exercise activity to `exerciseActivities`. LLM matches type name from `exerciseTypeNames` context list (case-insensitive), falls back to "Other" (auto-created if missing). Duration parsed from natural language: 4-digit MMSS (e.g. "5303" → 53:03), ambiguous short numbers inferred from activity/distance context (e.g. "107" for a 5-mile run → 1:07:00 = 67 min). Confirm screen: type dropdown (editable), date, duration (MM:SS display, editable), miles, calories, comment. Navigates to `#exercise-activities` on confirm. |
| `ADD_THING` | Creates a house thing |
| `ATTACH_PHOTOS` | Attaches photos to an entity |
| `ADD_NOTE` | Adds a note to a notebook. Routes to user's configured default notebook unless they explicitly name one in the command. Does NOT infer notebook from note content. |
| `ADD_DEV_NOTE` | Sends developer feedback to the shared `sharedDevNotes` collection. Only triggers on explicit developer-feedback phrases ("note to dev", etc). Confirm screen includes a "Save to" notebook redirect dropdown — selecting a notebook saves to the user's notes instead (with photo support). |
| `CHECK_IN` | Opens the check-in form for a named or GPS-based place (short-circuit — no Firestore write; navigates to the check-in form) |
| `UNKNOWN_ACTION` | LLM could not determine intent — no action taken |

**Context**: Includes zones, plants, people, vehicles, weeds, chemicals, house/garage/structures hierarchy, notebooks, lifeCategories, trackingCategories, and `exerciseTypeNames` (non-archived type names for `LOG_EXERCISE` matching). Context cached 5 minutes.

**Help screen**: Built-in help listing all actions with icons, labels, descriptions, and example utterances. Maintained in `SB_HELP_ACTIONS` array — **must be kept in sync when new actions are added**.

### Weed Identification (LLM)
See [Yard: Weeds](#weeds-weedsjs) above.

### Blood Work Import (LLM)
See [Life: Health](#health-healthjs) above.

### House/Collection LLM Photo ID
See [House: LLM Photo Identification](#llm-photo-identification-house) and [Collections: LLM Identification](#llm-identification-for-collections) above.

---

## Part 11: Shared Features

These features are used across multiple sections. The implementation lives primarily in dedicated JS files.

### Photos (`photos.js`)

**Firestore**: `photos` — `targetType`, `targetId`, `imageData` (Base64 JPEG), `caption`, `takenAt`, `createdAt`

**Key fields**:
- `targetType`: identifies the entity type (e.g., `plant`, `zone`, `thing`, `subthing`, `item`, `collectionitem`, `person`, `vehicle`, `weed`, `chemical`, `place`, etc.)
- `targetId`: Firestore document ID of the entity

**Storage**: Base64 JPEG compressed client-side using the Canvas API. Target size ~100–200KB per photo.

**Gallery UI**:
- Shows newest photo by default
- Newer / Older navigation buttons with counter (e.g., "2 of 5")
- Caption shown below photo (edit caption or add caption button)
- Action buttons per photo: **⭐ Use as Profile/Thumbnail** (supported types only), **🔍 View**, **Edit/Add Caption**, **Delete Photo**

**Photo upload paths**:
- Camera input (`<input type="file" accept="image/*" capture>`)
- Gallery picker (`<input type="file" accept="image/*">`)
- Clipboard paste
- LLM identification flow (photos staged and compressed before sending)

**Crop tool**: Cropper.js instance shown before save — user can adjust framing. Optional, can skip. Also accessible from the View lightbox (see below).

**View Lightbox** (`openPhotoLightbox()` in `photos.js`):
- Tapping **🔍 View** opens a full-screen dark overlay (z-index 9999)
- **Pinch-to-zoom**: 2-finger pinch gesture scales the image from 1× up to 5×
- **Pan**: 1-finger drag pans the image when zoomed in (no-op at 1×)
- **Long-press download**: Hold finger on the image for ~650ms to trigger a download of the photo as `photo.jpg`
- **✂ Crop button**: shown at the bottom — closes lightbox and opens the Cropper.js flow
- **✕ close button**: top-right corner dismisses the overlay
- Implemented as a dynamically-created DOM element appended to `document.body` (no static modal in `index.html`)

**Profile / Thumbnail photos**:
- Supported entity types: `plant`, `weed`, `person`, `vehicle`, `thing`, `subthing`, `item`, `collectionitem`
- Stored as `profilePhotoData` directly on the entity document (compressed further to ~300px max dimension)
- **Auto-set**: When the first photo is added to a supported entity (via LLM flow or manual add), `profilePhotoData` is auto-set from that first photo
- **Manual override**: "⭐ Use as Profile" (or "⭐ Use as Thumbnail" for collection items) button in the gallery sets any photo as the thumbnail
- **Live update**: Setting a thumbnail updates the in-memory `window.current*` state object so the UI reflects the change without a full page reload

**Key maps in `photos.js`**:
```js
// Which entity types support profile/thumbnail photos
var PROFILE_PHOTO_TYPES = ['plant', 'weed', 'person', 'vehicle', 'thing', 'subthing', 'item', 'collectionitem'];

// Maps targetType → Firestore collection for writing profilePhotoData
var PROFILE_COLLECTION_MAP = {
    plant:          'plants',
    weed:           'weeds',
    person:         'people',
    vehicle:        'vehicles',
    thing:          'things',
    subthing:       'subThings',
    item:           'subThingItems',
    collectionitem: 'collectionItems',
};

// Maps targetType → [containerId, emptyStateId] for the gallery container
var PHOTO_CONTAINERS = { /* ... all entity types ... */ };
```

### Facts (`facts.js`)

**Firestore**: `facts` — `targetType`, `targetId`, `label`, `value`, `createdAt`

**UI**: Displayed as a table of label/value pairs. Add and edit via a modal. Delete with confirmation.

**URL values**: If `value` starts with `http`, it renders as a clickable `<a href="..." target="_blank">` link.

**Used by**: Zones, plants, weeds, chemicals, vehicles, people, all house/garage/structure entities, health entities

### Activities (`activities.js`)

**Firestore**:
- `activities` — `targetType`, `targetId`, `description`, `notes`, `date`, `chemicalIds[]`, `savedActionId?`, `placeId?`, `createdAt`
- `savedActions` — `name`, `description`, `chemicalIds[]`, `notes`, `createdAt`

**Log activity modal**:
- Date picker (defaults to today)
- Description text (pre-filled if saved action selected)
- Notes textarea
- Chemical multi-select: checkbox list of all chemicals, supports selecting multiple
- "Use Saved Action" dropdown: pre-fills description and chemical selection
- **Place (optional)**: Search field to attach a place to the activity. Typing opens a dropdown of matching places (saved places first, then Foursquare text search). Selecting shows a chip with a clear button. If the place doesn't exist in Firestore yet, it is auto-created via `placesSaveNew()` when the activity is saved. Saved place name shown as a tappable link in the activity list row.

**Activity list**: Compact rows with date + description + Edit button. Edit modal shows full details (read-only) plus Save as Action and Delete.

**Saved Actions**: Reusable templates. Created from an existing activity ("Save as Action" button) or from the Saved Actions management page (`#actions`). Used across any entity type.

**Used by**: All entity types (yard zones/plants/weeds, house things, vehicles, people, etc.)

### Problems / Concerns (`problems.js`)

**Firestore**: `problems` — `targetType`, `targetId`, `description`, `notes`, `status` (open/resolved), `dateLogged`, `resolvedAt`, `createdAt`

**UI**: List of problems per entity. Each shows description, date logged, and status badge. Click to expand for notes and full detail.

**Status toggle**: Mark as resolved → sets `resolvedAt` timestamp and status to "resolved". Can be re-opened.

**Show resolved**: Checkbox to toggle visibility of past-resolved problems.

**Roll-up**: Parent entities (floors, rooms, things) aggregate all descendant problems (e.g., a floor's problem list includes all problems from rooms and things in that floor). Source label shown (e.g., "from: Kitchen").

**Facts on problems**: Each problem can have its own facts (key/value pairs).

**Add/Edit modal**: Save and Cancel buttons appear both at the top (inline with the title) and at the bottom, so the user can save without scrolling regardless of keyboard position.

**Fields**: "Title" (short name, text input) and "Description" (free-form details, textarea). Stored as `description` and `notes` in Firestore respectively.

**Voice-to-text**: The Description textarea has a 🎤 Speak button for hands-free dictation in the field.

**Photos on problems**: Each problem can have photos attached (Camera, Gallery, or Paste). `targetType: 'problem'`, `targetId: problem.id`. In add mode, the problem is auto-saved first to get an ID before photos can be attached.

**Used by**: All entity types

### Quick Task List (`projects.js`)

Formerly named "Future Projects" — renamed to "Quick Task List" to distinguish from the new Life Projects system.

**Firestore**: `projects` — `targetType`, `targetId`, `title`, `notes`, `status` (active/completed), `items[]` (array of `{text, done, completedAt, notes}`), `completedAt`, `createdAt`

**UI**: Collapsible cards — collapsed shows title + item count badge; expanded shows full checklist.

**Checklist items**: Click item to toggle done. Completion timestamp recorded per item. Notes can be added to individual items.

**Project completion**: Mark entire project as complete → sets `completedAt`.

**Show completed**: Checkbox to toggle visibility of completed projects.

**Roll-up**: Same pattern as Problems — parent entities aggregate all descendant projects.

**Add/Edit modal**: Save and Cancel buttons appear both at the top (inline with the title) and at the bottom, so the user can save without scrolling regardless of keyboard position.

**Voice-to-text**: The Notes textarea has a 🎤 Speak button for hands-free dictation.

**Used by**: All entity types

### Calendar Events (`calendar.js`)

**Firestore**: `calendarEvents` — `title`, `description`, `date` (ISO string), `recurring` (null or `{type, intervalDays}`), `targetType?`, `targetId?`, `zoneIds[]`, `savedActionId?`, `trackingCategory?` (string, journal category name), `completed`, `completedDates[]`, `cancelledDates[]`, `createdAt`

**Recurring types**: `weekly` (+7 days), `monthly` (same day next month, clamped to month-end), `every_x_days` (user-specified interval)

**Display range**: Configurable 1/3/6/12 months. Default is 3 months. Events shown chronologically, grouped by month with headers.

**Complete event flow**:
1. Click "Complete" on an event occurrence
2. Optional notes modal
3. Creates an Activity record on the linked entity (if `targetType`/`targetId` set)
4. Marks the occurrence as completed (`completed = true` for one-time, adds date to `completedDates[]` for recurring)
5. If the event has `trackingCategory` set: creates a `journalTrackingItems` doc (`date` = occurrence date, `category` = trackingCategory, `value` = event description or title). Duplicate guard: skips creation if a tracking item already exists for that date + category. One-way: un-attending does NOT delete the tracking item.

**Update Tracking on Attended**: Checkbox in the Add/Edit Event modal. When checked, a dropdown of all journal tracking categories appears. On attend, a tracking item is automatically created for the occurrence date using the selected category and the event's description as the value. Use case: events like "Hair Cut" or "Dental Cleaning" that should auto-log to the journal tracking history.

**Overdue section**: Past-due uncompleted events shown at the top with orange "OVERDUE" badge. This applies both to the main calendar page (`loadOverdueEvents()`) and to every entity detail page calendar section (`loadEventsForTarget()`). On entity pages, overdue cards appear above the upcoming list so missed events (e.g. a recurring maintenance reminder) are never silently dropped — they stay visible until completed.

**Delete recurring**: Shows warning that ALL occurrences will be removed.

**Copy event**: Creates a new one-time event pre-filled with the source event's title and description (date cleared).

**Multi-zone**: Events can be linked to multiple zones via `zoneIds[]`.

**Entity-linked events**: Events on zone/plant/vehicle/house entity detail pages show only events for that entity. When opening the Add Event modal from any non-yard entity page (plant, thing, subthing, item, floor, room, structure, structurething, structuresubthing, vehicle, garageroom, garagething, garagesubthing), the zone picker is hidden and no zone selection is required — the linked entity IS the location context. Zone selection is only required for standalone calendar events or events opened from a yard zone/weed page. The modal header shows "Adding event for: [entity name]" when opened from an entity page. Edit modal likewise hides the zone picker for existing entity-linked events and shows "Linked to: [entity name]".

**Used by**: All sections (yard, house, garage, vehicles, life, structures)

### GPS / Location (`gps.js`, `BishopGps.md`)
- Zones can be assigned GPS coordinates
- `#yardmap`: shows all zones with coordinates on an interactive map
- `#gpsmap/{id}`: shows a single zone's location
- Map library: Leaflet.js (free, open-source)

### Search (`search.js`)
- **Route**: `#search`
- Global full-text search across zones, plants, weeds, chemicals, vehicles, people, notes, and more
- Result cards show entity type, name, key details
- Clicking a result navigates to the entity detail page

### Checklists (`checklists.js`)
- **Route**: `#checklists` — shared page; retains the nav context active when the link was clicked
- Accessible from Yard, House, and Life nav bars
- **Context-aware**: shows only templates and runs relevant to the current location
- **Context detection**: `app.js` sets `window.clLastEntityType` ('zone', 'floor', 'room', 'vehicle', or null) on every page route, and `clCaptureContext()` reads it + entity globals to determine the active context before navigating to checklists
- **Roll-up rule**: a child entity's checklists appear on the parent page (e.g., zone checklists appear on the Yard page), but a parent's checklists do NOT appear on child pages
- **Contexts and roll-up behaviour**:
  - Yard: shows all yard-general + all zone templates/runs
  - Zone: shows that zone + all its descendant zones
  - House: shows all house-general + all floors + all rooms
  - Floor: shows that floor + all rooms on that floor
  - Room: shows that room only
  - Vehicle: shows that vehicle only
  - Life: shows all life-tagged templates/runs (no sub-targets)
- **Templates** (`checklistTemplates`): `{ name, tags[], targetType, targetId, targetName, items:[{label, indent}], createdAt }`
  - `tags[]`: string array of user-defined tags (e.g., ["Danielle", "Finance"]) — entered comma-separated in the modal; displayed as chips on cards; copied to runs when starting
  - `items[].indent`: 0 = normal, 1 = indented sub-item (level 1 ~28px), 2 = double-indented sub-item (level 2 ~56px)
- **Runs** (`checklistRuns`): same fields copied from template; `items:[{label, done, doneAt, note, indent}]`; `archived: boolean` (false by default)
- **Template modal**: Location dropdown shows the full hierarchy for the current context (e.g., Yard → zones → subzones), defaulting to the entity the user was on when they clicked Checklists; full hierarchy shown so user can pick any level. Delete button is inside the edit modal.
  - **Item editor**: each item row has a drag handle `⠿` (SortableJS drag-and-drop reordering), an indent toggle button, the text input, and a ✕ remove button
  - **Indent levels**: 3-way cycle — 0 (normal) → 1 (28px) → 2 (56px) → back to 0. Button shows `→` at levels 0–1, `←` at level 2.
  - **Indent shortcut**: Tab key increments indent (cap at 2); Shift+Tab decrements indent (floor at 0)
  - **Enter key**: adds a new blank row inheriting the current row's indent level
- **Location badge**: shown on template/run cards in roll-up views (e.g., "📍 Front Yard")
- **Context subtitle**: shown on the page header ("Showing: Front Yard (Zone)")
- **Breadcrumb bar**: set on page load based on context — yard/zone context shows `Yard › Checklists` (linking to `#zones`); house/floor/room context shows `House › Checklists` (linking to `#house`); life context shows `Life › Checklists` (linking to `#life`); other contexts clear the bar
- **Search** (global `#search`): Templates searched by name/tags/items → context page. Active runs same (archived excluded) → `#checklist-focus/{runId}/…` scrolls to and briefly highlights that card. Notes body searched → parent notebook (`#notebook/{id}`); hint shows notebook name.
- **Filter bar**: text input above Active runs. Filters by name, tags, or item labels. 250ms debounce. Applies to completed/archived when those sections are open.
- **Active run cards (Google Keep-style inline cards)**:
  - **Multi-column layout**: CSS grid (`auto-fill, minmax(280px, 1fr)`) — cards fill available width on desktop; on phone defaults to 1 column, toggle button (⊞/⊟) switches to 2-column view; preference saved in `localStorage.clColumnLayout` ('1' = 1-col, '2' = 2-col; default '1').
  - Items displayed directly on card — no accordion. Title, optional location badge, started date at top.
  - **Completed items**: collapse into a "▶ X completed" toggle row (click to expand/collapse inline). No progress bar.
  - **Footer**: tags chips on the left; action icon buttons on the right (✓ Mark Complete, ✏️ Edit, 📦 Archive, 🗑️ Abandon).
  - **Hover-reveal actions**: action buttons have `opacity: 0`, revealed on card hover. Always visible on touch devices (`@media (hover: none)`) and in edit mode.
  - **Edit mode** (`cl-run-card--editing`): shows add-item row, drag handles, and remove buttons. Actions always visible in edit mode. Clicking a non-URL item label converts it to an inline text input for editing; blur or Enter saves, Escape cancels.
  - Drag-and-drop reorder of undone items in edit mode (SortableJS on `.cl-undone-list`)
  - Adding items in edit mode prompts "Add to template too?" for template-derived runs
- **URL items**: labels starting with `http://` or `https://` render as clickable links (new tab) in run cards and completed accordions
- **Sub-item indentation**: `indent: 1` → 28px padding; `indent: 2` → 56px padding — applies in run cards, completed, and archived cards. In run card edit mode, each item also shows a `→`/`←` indent button (same 3-way cycle as the template editor) that saves immediately to Firestore.
- **Per-item notes**: 📝 button → inline textarea. Saves on blur/Enter. Escape discards. Clicking the note text itself (when it exists) also opens the editor. Fixed blur/click race: `mousedown` on the 📝 button prevents blur from firing before click, so clicking 📝 to close correctly saves without re-opening.
- **Item completion date**: `doneAt` recorded on check; shown as `(Apr 17)` inline. Cleared on uncheck.
- **Item sort order**: undone first (drag-reordered); done at bottom by completion time.
- **Blank lists**: "+ New Blank List" creates a run with no template, no tags.
- **Completed run accordion**: read-only ✓/✗ list. Archive + Delete in header. URL items clickable.
- **Archived section**: "Show archived" toggle reveals all archived runs. Unarchive + Delete buttons. Filter applies.

---

## Part 12: Navigation & Routing

The app has three navigation contexts, each with its own nav bar:

| Context | Nav Items |
|---------|-----------|
| **Yard** | Zones, Calendar, History, Checklists, Structures, Search, Chat |
| **House** | House (floors), Rooms, Calendar, Checklists, Yard, Things, Collections, Search, Chat |
| **Life** | Journal, Contacts, Notes, Checklists, Chat |

**Shared pages** (retain last active context): Settings, Change Password, GPS Map, Checklists

**Mobile nav**: Hamburger menu that toggles a full-screen overlay. Desktop nav: horizontal bar.

**Breadcrumb bar**: Sticky header below the nav bar showing the current hierarchy (e.g., "House › 1st Floor › Kitchen"). Built dynamically on each page load into `document.getElementById('breadcrumbBar')`.

**Context switching**: Tapping "My House" logo navigates to `#home` and sets yard context. Separate nav items switch between House and Life contexts.

**Help button (`?`)**: Every desktop nav bar and mobile nav overlay includes a `?` link that calls `openHelpForCurrentScreen(event)`. It reads the current URL hash and navigates to `#help/{screenName}`, e.g., `#help/zone` or `#help/calendar`. Clicking `?` while already on a help page is a no-op.

---

## Part 12a: In-App Help System

**Route:** `#help/{screenName}` — handled by `app.js` router, calls `loadHelpPage(screenName)` from `js/help.js`.

**Source of truth:** `AppHelp.md` — fetched once, cached in `_helpCache`. Sections keyed as `## screen:key` or `## concept:key`. A single file feeds both the static help display and the LLM Q&A context. **Must be kept in sync with every code change — see Maintenance Rule below.**

**Help content is authored for all major sections:**
- Yard & Garden (zones, zone, plant, weeds, weed, chemicals, chemical, actions, calendar, activityreport, yard-problems, yard-projects, gpsmap, yardmap)
- Shared Concepts (activities, photos, facts, problems, quicktasks)
- House (house, floor, room, thing, subthing, floorplan, floorplanitem, house-problems, house-projects)
- Health (health, health-appointments, health-visits, health-concerns, health-concern, health-conditions, health-condition, health-medications, health-supplements, health-bloodwork, health-vitals, health-insurance, health-emergency, health-allergies, health-vaccinations, health-eye, health-care-team)
- Life (life, journal, contacts, notes, lifecalendar)
- Vehicles & Storage (vehicles, garage, structures, collections)
- Thoughts (thoughts, top10lists, memories, views)
- App Setup (settings)

**Page header:**
- Title: "Help: {Screen Label}" (or "Topics: {Section}" on section topics pages)
- **☰ Topics** button — calls `helpOpenTopics()`, which maps the current screen (`_helpCurrentScreen`) to its major section and navigates to `#help/topics-{section}` (e.g., `#help/topics-life`). Falls back to `#help/main` for unrecognized screens.
- **? Ask AI** button — toggles the AI Q&A panel. If LLM is not configured, redirects to `#help/settings` instead.

**`#help/main` (section launcher):** Shows clickable icon cards for each major section (Yard & Garden, House, Health, Life, Vehicles & Storage, Thoughts). Clicking a card navigates to that section's topics page. Getting Started content from `## screen:main` in AppHelp.md appears below the cards.

**Section topics pages (`#help/topics-{section}`):** Shows only that section's topic links. At the bottom, styled section cards link to all other major sections ("Didn't find it here? Browse other sections:").

**Per-screen content layout (sub-sections in AppHelp.md):**
- `### Quick Help` — always shown immediately (scannable bullet summary)
- `### Details` — hidden behind "Show more ▾" toggle; expands in-place
- `### See Also` — rendered as a styled link box at the bottom; links navigate within the help system

**Ask AI panel:** Stateful conversation — each LLM call includes all prior answered Q&A pairs as user/assistant message turns, so follow-up questions ("where exactly is that?") work correctly. Error responses are excluded from history. Enter sends; Shift+Enter inserts a newline.

**Q&A thread:** Appends newest-first below the input. The 3 most recent pairs are always visible; older ones collapse into "Show N earlier questions ▾".

**Config:** LLM provider, model, and API key read from `userCol('settings').doc('llm')`. Supports `openai` (`gpt-4o`) and `grok` (`grok-3`). Always uses `max_completion_tokens`.

**SecondBrain integration (`ASK_HELP`):** When SecondBrain classifies a question as `ASK_HELP`, it stores the question in `window._helpPendingQuestion` and navigates to `#help/main`. `loadHelpPage()` detects the pending question, opens the Ask AI panel, and auto-fires it — full follow-up conversation supported.

**Concept aliases:** `HELP_SECTION_MAP` maps URL-safe keys (e.g., `concept-activities`) to AppHelp.md section keys (e.g., `concept:activities`).

**Maintenance Rule:** Before every commit that touches JS, HTML, or CSS, evaluate whether the change affects a screen with help content. If it does, update the relevant `## screen:X` section in `AppHelp.md` in the same commit. This is not optional — stale help content produces wrong AI answers.

---

## Part 13: Testing

### Test Account
The app requires Firebase Auth login. A shared test account is used for local preview server testing:

- **Email**: `skasputi@pattersoncompanies.com`
- **Password**: `steve2a2`
- **Server**: `http://localhost:8080` (Python HTTP server, port 8080)

Credentials are stored locally in `.test-credentials.md` (gitignored — never committed to the repo).

### Dev Server
The dev server is a Python HTTP server configured in `.claude/launch.json`:
- **Name**: `bishop-dev`
- **Port**: 8080
- Launch via Claude Code preview tools (`preview_start` with name `bishop-dev`)

### Test Plans
Feature-specific test plans live in their own markdown files:
- `LifeCalendar.md` — includes a detailed test matrix (T-1 through T-16, all passing)

### General Test Approach
1. Start the dev server (`preview_start` → `bishop-dev`)
2. Log in with test account credentials
3. Navigate to the feature being tested
4. Verify: create, edit, delete, field validation, and any feature-specific flows
5. Verify mobile layout at 375px viewport width
6. Check browser console for JS errors (`preview_console_logs` with `level: error`)

### Known Test Gotchas
- `alert()` calls (e.g., on the event form dirty-check) will freeze `preview_eval` for 30 seconds — navigate to a fresh page before running evals that might trigger alerts
- After `closeModal()`, navigation must use `setTimeout(..., 50)` — test that back-button behavior is correct after modal interactions
- Duplicate event listeners accumulate on buttons if `cloneNode` is not used — test that clicking modal buttons multiple times doesn't fire handlers multiple times
- Cache busting: if a fix isn't appearing, verify the `?v=N` was bumped on all script and CSS tags
- **Empty test account**: The test account may have no data. For UI-only verifications (e.g., checking a button label or that a modal opens), inject mock state via `preview_eval` rather than concluding the feature is untestable

### Keeping This Spec Current
- The functional spec must be updated in the **same commit** as any feature change
- Do not defer spec updates — a stale spec gives the wrong context at the start of the next session
- Update the section that owns the changed feature; add new sections for new entity types or major new capabilities
- **Always tell the user** when the spec was updated — state which section(s) changed and what was added/modified. This allows the user to notice if a spec update was skipped when it should have happened.

---

## Part 14: Deployment

- **Hosting**: GitHub Pages — live at `https://dolphinstevekasputis.github.io/BishopHome`
- **GitHub username**: `DolphinSteveKasputis`
- **Branch**: `main` (deployed automatically from main branch)
- **Push protocol**: Always send the ntfy.sh notification before `git push` — Windows requires a credential confirmation prompt:
  ```
  curl -d "Ready to push — please confirm the Windows prompt" ntfy.sh/WolfLifeBishop
  ```
- **Notifications**: Task completion notifications sent to `ntfy.sh/WolfLifeBishop`

---

## Part 15: Firestore Data Model

All collections live under `/users/{uid}/`. Every module uses `userCol('collectionName')` to scope reads/writes.

### Yard

| Collection | Key Fields |
|------------|------------|
| `zones` | name, parentId, level (1/2/3), createdAt |
| `plants` | name, zoneId, metadata{}, profilePhotoData?, createdAt |
| `weeds` | name, treatmentMethod, applicationTiming, notes, zoneIds[], profilePhotoData?, createdAt |
| `chemicals` | name, notes, createdAt |
| `activities` | targetType, targetId, description, notes, date, chemicalIds[], savedActionId?, placeId? |
| `savedActions` | name, description, chemicalIds[], notes |

### House

| Collection | Key Fields |
|------------|------------|
| `floors` | name, floorNumber, createdAt |
| `rooms` | name, floorId, sortOrder, createdAt |
| `things` | name, category, roomId, description, worth, notes, profilePhotoData?, createdAt |
| `subThings` | name, thingId, description, worth, tags[], profilePhotoData?, createdAt |
| `subThingItems` | name, subThingId, description, worth, tags[], profilePhotoData?, createdAt |
| `floorPlans` | floorId, widthFt, heightFt, rooms[], doors[], windows[], updatedAt |
| `breakers` | slotNumber, label, amperage, type, status, notes |

### Garage

| Collection | Key Fields |
|------------|------------|
| `garageRooms` | name, order, createdAt |
| `garageThings` | name, roomId, category, description, worth, notes, beneficiaryContactId?, createdAt |
| `garageSubThings` | name, thingId, tags[], beneficiaryContactId?, createdAt |

### Structures

| Collection | Key Fields |
|------------|------------|
| `structures` | name, type, notes, createdAt |
| `structureThings` | name, structureId, category, description, worth, notes, beneficiaryContactId?, createdAt |
| `structureSubThings` | name, thingId, tags[], beneficiaryContactId?, createdAt |

### Vehicles

| Collection | Key Fields |
|------------|------------|
| `vehicles` | year, make, model, trim, color, vin, licensePlate, purchaseDate, purchasePrice, notes, archived, archivedAt, archivedReason, profilePhotoData?, createdAt |
| `mileageLogs` | vehicleId, date, mileage, notes, createdAt |

### Collections

| Collection | Key Fields |
|------------|------------|
| `collections` | name, type, label1, label2, label3, beneficiaryContactId?, createdAt |
| `collectionItems` | collectionId, name, typeData{}, acquiredDate, pricePaid, estimatedValue, notes, locationRef{}, profilePhotoData?, beneficiaryContactId?, createdAt |

### Life

| Collection | Key Fields |
|------------|------------|
| `people` | name, nickname, category (Personal/Medical Professional/Medical Facility/Service Professional/Other), specialty?, phone, email, address, facebookUrl, howKnown, notes, profilePhotoData?, parentPersonId?, createdAt |
| `peopleImportantDates` | personId, label, month, day, year?, notes, createdAt |
| `peopleInteractions` | personId, date, notes, createdAt |
| `peopleCategories` | name, createdAt |
| `journalEntries` | date, entryTime, entryText, mentionedPersonIds[], placeIds[], photos[]{imageData,caption}, isCheckin, sourceEventId?, sourceVisitId?, createdAt, updatedAt |
| `journalTrackingItems` | date, category, value, createdAt |
| `journalCategories` | name, createdAt |
| `lifeEvents` | title, description, startDate, endDate?, startTime?, endTime?, location? (manual text), locationContactId? (people doc ID), categoryId?, status, peopleIds[], notes?, miniLogEnabled, createdAt |
| `lifeCategories` | name, color, createdAt |
| `lifeEventLogs` | logDate, logTime, body, eventId, mentionedPersonIds[], createdAt |
| `notebooks` | name, color, noteCount, createdAt, updatedAt |
| `notes` | notebookId, body, createdAt, updatedAt |

### Health

| Collection | Key Fields |
|------------|------------|
| `healthVisits` | date, type, provider (legacy), providerType (legacy), facilityContactId, providerContactId, concernIds[], conditionIds[], reason, whatWasDone, outcome, cost, notes, linkedJournalEntryId? |
| `medications` | name, dosage, purpose, prescribedBy, prescribedAtVisitId?, startDate, endDate, status, type, concernIds[], conditionIds[] |
| `concerns` | title, bodyArea, startDate, status (open/resolved/promoted), resolvedDate, summary, promotedToConditionId?, promotedDate? |
| `healthConcernLogs` | concernId, date, note, painScale?, type (manual/system/visit-note), visitId? |
| `conditions` | name, category, diagnosedDate, diagnosedBy, status (active/managed/resolved), managementNotes |
| `healthConditionLogs` | conditionId, date, note, painScale?, type (manual/system/visit-note), visitId?, createdAt |
| `healthCareTeam` | single doc (`default`): members[{role, providerContactId?, facilityContactId?}] |
| `bloodWork` | date, lab, orderedBy, notes, markers[] |
| `vitals` | date, time, type, value1, value2?, unit, notes |
| `supplements` | name, dosage, brand, reason, frequency, startDate, endDate, status |
| `vaccinations` | name, date, dateApproximate, provider, lotNumber, nextDueDate |
| `eyePrescriptions` | date, type, rightEye{}, leftEye{}, pd, provider |
| `insurance` | provider, policyNumber, groupNumber, memberId, copay, deductible, photoDocuments[] |
| `emergencyInfo` | emergencyContacts[], allergies[], medicalAdvances, dnr, notes |
| `healthAppointments` | date, time, type, facilityContactId, providerContactId, concernIds[], conditionIds[], notes, status (scheduled/completed/cancelled/converted), linkedVisitId |

### Shared

| Collection | Key Fields |
|------------|------------|
| `photos` | targetType, targetId, imageData (Base64), caption, takenAt, createdAt |
| `facts` | targetType, targetId, label, value, createdAt |
| `problems` | targetType, targetId, description, notes, status, dateLogged, resolvedAt |
| `projects` | targetType, targetId, title, notes, status, items[], completedAt |
| `calendarEvents` | title, description, date, recurring{type,intervalDays}?, targetType?, targetId?, zoneIds[], savedActionId?, trackingCategory?, completed, completedDates[], cancelledDates[] |

### Life Projects

| Collection | Key Fields |
|------------|------------|
| `lifeProjects` | title, description, template, status, mode, archived, startDate, endDate, targetType, targetId, people[], bookingTypes[], links[], createdAt, updatedAt |
| `lifeProjects/{id}/todoItems` | text, done, notes, sortOrder |
| `lifeProjects/{id}/days` | date, label, location, sortOrder, items[] |
| `lifeProjects/{id}/bookings` | name, type, startDate, multiDay, endDate, startTime, endTime, confirmation, cost, costNote, paymentStatus, contact, address, link, notes, sortOrder |
| `lifeProjects/{id}/bookingPhotos` | bookingId, imageData, caption, createdAt |
| `lifeProjects/{id}/projectPhotos` | imageData, caption, createdAt |
| `lifeProjects/{id}/packingItems` | text, done, notes, category, sortOrder |
| `lifeProjects/{id}/projectNotes` | title, text, createdAt, sortOrder |

### Investments

| Collection / Path | Key Fields |
|-------------------|------------|
| `investments/{personId}/accounts` | nickname, accountType, institution, last4, url, loginNotes, beneficiary, accountNumberEnc, usernameEnc, passwordEnc, archived, sortOrder, createdAt |
| `settings/investments` | enrolledPersonIds[] |

`personId` = `'self'` for the logged-in user, or a `people` doc ID for tracked contacts.

Encrypted fields (`accountNumberEnc`, `usernameEnc`, `passwordEnc`) are AES-GCM ciphertext stored as base64 strings via `legacy-crypto.js`. The same passphrase and session key are shared with the Legacy section.

Legacy overlay fields (`currentValue`, `whatToDo`, `legacyNotes`) will be added to the same account docs by the Legacy Financial Accounts feature (not yet built).

### Places

| Collection | Key Fields |
|------------|------------|
| `places` | name, address, lat, lng, fsqId?, osmId? (legacy), category?, status (1=active/0=deleted), createdAt |

### Settings

| Path | Fields |
|------|--------|
| `settings/llm` | provider, apiKey, model? |
| `settings/journal` | defaultDateRange |
| `settings/investments` | enrolledPersonIds[] |

### Dev Notes (Shared)

**Routes**: `#devnotes` (list), `#devnote/new` (create), `#devnote/{id}` (detail/edit)  
**File**: `devnotes.js`  
**Firestore**:
- `db.collection('sharedDevNotes')` — **not** per-user; all users share this collection. Fields: `text`, `author`, `createdAt`
- `db.collection('sharedDevNotePhotos')` — photos attached to dev notes. Fields: `noteId`, `imageData` (Base64), `createdAt`

Shared scratchpad accessible from Settings → Dev Notes. All logged-in users can read, add, edit, and delete notes.

#### List page (`#devnotes`)
- **Filter bar**: "Open" (default) / "Fixed" toggle buttons + search box
  - Open: shows only notes where `fixed` is false or absent
  - Fixed: shows only resolved notes; cards display a green "✓ Fixed · date" badge and resolution preview
  - Search filters within the active tab across note text and resolution text
- Cards show: fixed badge (if resolved), doc ID, date + author, text preview, resolution preview (fixed notes)
  - Fixed badge shows formatted fixed date: "✓ Fixed · May 5, 2026"
  - Author line on fixed cards shows "Reported: &lt;date&gt; · &lt;author&gt;" to distinguish reported-date from fixed-date
- **Open** — navigates to `#devnote/{id}` full-page view
- **Delete** — confirms, then deletes note and all its photos

#### Detail/Edit page (`#devnote/{id}` and `#devnote/new`)
- Large textarea (full-page, resizable) for note text
- **Doc ID badge** at the top — click to copy to clipboard
- **Fixed / Resolved section**: checkbox "Mark as Fixed / Resolved"; when checked reveals:
  - **Reported** — read-only display of the note's `createdAt` date (e.g. "May 5, 2026")
  - **Fixed Date** — date picker, defaults to today when first checked
  - **Resolution** — textarea to describe what was done to fix the issue
  - All three editable fields saved to `sharedDevNotes` as `fixed`, `fixedDate`, `fixedNote`
- **Photos section**: "Add from Gallery" (file picker) and "Paste" (clipboard) buttons; photos stored in `userCol('photos')` with `targetType:'devnote'`; thumbnail grid with click-to-enlarge lightbox; delete individual photos from lightbox. Pasting a photo before entering any text is allowed — the note is auto-saved as a draft (empty text) first.
- **Save** button (also Ctrl+Enter); on new note, saves first then shows doc ID badge and action row
- **Copy to Notebook…** — picks a personal notebook and copies text + photos into `userCol('notes')` / `userCol('photos')`
- **Delete Note** — confirms, deletes note and all its photos, returns to list
- Edit preserves the original author; does not overwrite with editor's identity

#### SecondBrain integration
- `ADD_DEV_NOTE` action writes to `sharedDevNotes` **unless** the user selects a personal notebook in the confirm screen's "Save to" dropdown, in which case it saves to `userCol('notes')` (with photo support) and navigates to that notebook
