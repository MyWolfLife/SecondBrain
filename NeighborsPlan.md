# NeighborsPlan.md — Neighbors Map Feature

## Status: Planning (feature-complete — ready to write build phases)

---

## What the User Wants

### Entry Point
- On the **Contacts screen**, a "Neighbors" button appears under the "Contacts" heading at top-left
- This opens a Neighborhoods list — named collections of maps

### Neighborhoods
- A **neighborhood** is a named container (e.g., "Townside", "Lake House Area")
- Multiple neighborhoods supported — user creates and names each one
- Each neighborhood has its own interactive map with its own pins

### The Map (per neighborhood)
- User uploads a **static image** of their neighborhood (screenshot from Google Maps, satellite view, etc.)
- Image is displayed in a zoomable/pannable viewer — user can zoom in and pan around
- User drops pins on houses; pins are draggable to reposition
- Pins are stored as **X/Y fractions** of the image (0.0–1.0) — resolution-independent, stay locked to the correct house at any zoom level
- Each pin displays a house icon (circle + house shape), color driven by recency of interactions:
  - **Green** — interaction within the last 60 days
  - **Amber** — last interaction 61 days to 1 year ago
  - **Gray** — no interactions ever, or last interaction more than 1 year ago
- Pin label (house nickname) visible beneath the icon
- Clicking a pin opens that house's detail page
- **No internet required** for the map background — image is stored in Firestore (Base64), loads from cache

### House Detail Page
- House header: nickname, optional address, Edit / Delete
- **Residents section** — people linked to this house
  - Each resident shown as a card: name, role, profile photo, last interaction date
  - Inline summary: last 2 Facts + last 2 Interactions per resident (collapsed, expandable)
  - "See full profile" links to their Contact page
  - Add new person → saved to Contacts with category "Neighbor", linked to this house
  - Link existing contact → pick from Contacts list, attach to this house
- **House Notes** — observations about the house itself, not tied to any person
  - Examples: "Love their landscaping", "Landscaper is Green Thumb Co", "Basketball hoop in driveway"
  - Chronological log, each note has date + text; add / edit / delete
- **Journal entries** — pull journal entries @mentioning any resident (read-only rollup)
- **Previous Families** button — appears only if at least one archived family group exists on this house

### Person Intel (lives on Contact, rolls up to house)

| Type | Example | Where stored |
|------|---------|-------------|
| Standing facts | "Wayne likes golf", "Works at Delta" | Facts on person record |
| Time-stamped events | "Will went to Lake Lanier last week" | Interactions log on person record |

Both systems already exist in the app. The house detail page surfaces them inline per resident.

### Logging Flow
Two equivalent paths — both write to the same Contact record:
1. **Via map**: Neighbors → [Neighborhood] → map → pin → house page → resident card → Interaction / Fact
2. **Via contacts**: Contacts → find person → add Interaction or Fact directly

---

## Archive / Hard-Delete Flow

When the user taps **Delete** on a house pin, a modal asks:

> **Remove this house?**
> - **Hard Delete** — removes the pin and all house data permanently. People remain in Contacts untouched.
> - **Archive (Family Moved Away)** — preserves the current family group tied to this address. The pin stays on the map. A new family can be added. Archived families are viewable via "Previous Families."
>   - Optional text field: **"Note about the move"** (e.g., "Moved to Florida", "Sold in May 2026") — stored on the archived family record

### Archive behavior
- The current set of resident links is snapshotted and stored as an archived family group
- Residents are unlinked from the active house (the house becomes "empty" with no current residents)
- The pin remains on the map — the house didn't go anywhere
- A **"Previous Families"** button appears on the house detail page

### Previous Families
- Lists all archived groups for this house
- Each entry shown as: **[address] — Archived [date]** (no custom name required)
- If only **one** archived group exists, clicking "Previous Families" opens it directly (no picker)
- If **multiple** groups exist, shows a list → user taps one to view it
- Archived family view is **read-only**: shows who was there, their roles, and a note that they no longer live here
- People in the archived group are still full Contact records — their own pages, interactions, and facts are unchanged

### Hard delete behavior
- Pin removed from the map
- `neighborHouses` doc deleted
- `neighborHouseResidents` links deleted (people themselves are untouched in `people` collection)
- `neighborHouseNotes` for this house deleted
- Archived family groups for this house also deleted
- Confirmed with a warning before proceeding

---

## Resident Roles

Predefined list with ability to add custom values on the fly (same pattern as People categories):

**Default roles:** Owner, Spouse, Partner, Kid, Pet, Tenant, Unknown

User can type a free-form role when linking a resident — it's saved and available for future residents. Roles stored in a `neighborRoles` collection (or as a subcollection, TBD).

---

## Decisions Made

| # | Decision |
|---|----------|
| 1 | Entry point: "Neighbors" button on Contacts screen, under the heading |
| 2 | Multiple named neighborhoods supported from day one |
| 3 | Person intel always lives on the Contact record — house page aggregates it |
| 4 | Both map path and contacts path work for logging — same underlying data |
| 5 | House-level notes are separate from person intel — they describe the property |
| 6 | Each person gets their own Contact record; family members at different addresses get their own house pin |
| 7 | No sub-person grouping on the map — one house can list multiple residents, but people elsewhere = own pin |
| 8 | Map tech: Leaflet.js with CRS.Simple — user uploads a neighborhood image, pins placed on it as X/Y fractions |
| 9 | Pin icon: house shape inside a colored circle (Option B) |
| 10 | Pin color: driven by interaction recency across all residents of that house |
| 11 | Green = interaction within 60 days; Amber = 61 days–1 year; Gray = >1 year or never |
| 12 | Delete = hard delete or archive; archive keeps the pin, groups current residents as a historical family |
| 13 | Archived family groups identified by address + archive date (no user-assigned names) |
| 14 | Single archived group = direct open; multiple = picker list |
| 15 | Resident roles: predefined list (Owner, Spouse, Partner, Kid, Pet, Tenant, Unknown) + custom add-on-the-fly |
| 16 | `lastInteractionAt` denormalized on house doc — one read per house on map load, no fan-out queries |
| 17 | `lastInteractionAt` updated by current residents only — archived residents do not affect pin color |
| 18 | Empty house (all residents archived, none added yet) always shows gray |
| 19 | Archive modal includes optional "note about the move" field |
| 20 | Adding a pin uses "Add House" button + placement mode tap, not tap-anywhere — avoids mobile pan conflict |
| 21 | No map centering needed — user uploads their own neighborhood image; zoom/pan view is saved and restored on re-open |

---

## Architecture

### Data Model

#### `neighborhoods` collection
| Field | Notes |
|-------|-------|
| name | "Townside", "Lake House Area" |
| imageData | Base64-encoded neighborhood image (compressed, same pattern as photos) |
| defaultZoom | Saved zoom level (restored on re-open) |
| defaultPanX | Saved pan offset X (restored on re-open) |
| defaultPanY | Saved pan offset Y (restored on re-open) |
| createdAt | Firestore timestamp |

#### `neighborHouses` collection
| Field | Notes |
|-------|-------|
| neighborhoodId | FK to neighborhoods |
| nickname | "The Smiths", "Corner house", "Wayne's" |
| address | Optional free-text address |
| pinX | Pin position as fraction of image width (0.0–1.0) |
| pinY | Pin position as fraction of image height (0.0–1.0) |
| lastInteractionAt | Denormalized timestamp — updated any time an interaction is logged for any **current** resident. Drives pin color without extra reads on map load. Null = never. |
| createdAt | Firestore timestamp |

#### `neighborHouseResidents` collection
| Field | Notes |
|-------|-------|
| houseId | FK to neighborHouses |
| personId | FK to people |
| role | "Owner", "Spouse", "Kid", etc. |
| archived | false = current resident; true = part of an archived family group |
| archivedGroupId | FK to neighborArchivedFamilies (null if current) |
| createdAt | Firestore timestamp |

#### `neighborArchivedFamilies` collection
| Field | Notes |
|-------|-------|
| houseId | FK to neighborHouses |
| address | Snapshot of house address/nickname at archive time |
| archivedAt | Firestore timestamp (shown as "Archived [date]") |
| notes | Optional free-text note about the move (e.g., "Moved to Florida") |

#### `neighborHouseNotes` collection
| Field | Notes |
|-------|-------|
| houseId | FK to neighborHouses |
| text | Free-form note text |
| date | Date of note |
| createdAt | Firestore timestamp |

#### `neighborRoles` collection
| Field | Notes |
|-------|-------|
| name | Role label — grows as user types new values |

#### Person intel → existing collections (no new collections)
- `facts` (targetType='person') — interests, employer, hobbies
- `peopleInteractions` — conversation pieces, observed events

---

## Navigation & Routing

| Route | Screen |
|-------|--------|
| `#neighbors` | Neighborhoods list |
| `#neighborhood/{id}` | Map view for one neighborhood |
| `#neighborhouse/{id}` | House detail page |
| `#neighborarchive/{archivedGroupId}` | Read-only archived family view |
| `#contact/{id}` | Existing Contact page (unchanged) |

---

## Map Technology

**Leaflet.js with `CRS.Simple`** — Leaflet's built-in mode for custom images (floor plans, game maps, etc.). Drops all geo-projection math and works in pixel coordinates against the uploaded image.

- The neighborhood image is rendered as a Leaflet `imageOverlay` filling the map bounds
- Custom markers use Leaflet's `divIcon` API: a circle + house SVG element
- Pins stored as X/Y fractions (0.0–1.0); on render these are multiplied by image pixel dimensions to get Leaflet layer coordinates
- Drag-to-reposition uses Leaflet's built-in draggable marker API; new fractions saved on `dragend`
- Zoom/pan handled natively by Leaflet; pins stay locked to their image-relative position at all zoom levels
- No OSM tile server, no internet required for the map background

**Pin color** is read from `lastInteractionAt` on each house doc — one Firestore read per house, no fan-out:
- `#16a34a` green — within 60 days
- `#d97706` amber — 61–365 days ago
- `#6b7280` gray — null or more than 1 year ago

`lastInteractionAt` is updated when an interaction is saved for any **current** resident only. Archived residents do not affect it. Empty house (all archived, none added) = always gray.

---

## Feature Breakdown — Build Phases

---

### Phase 1 — Neighborhoods List + Map Shell

**Goal**: User can create neighborhoods, upload a map image, drop/drag/delete pins, and navigate to a house.

#### Entry Point
- Add "Neighbors" button to Contacts screen under the heading
- Routes to `#neighbors`

#### Neighborhoods List (`#neighbors`)
- List of neighborhood cards: name + house count
- **Add Neighborhood** button → modal: name field + image upload (compress to ~400KB, Base64 stored on `neighborhoods` doc)
- **Edit** per card → modal pre-filled: rename, replace image (replacing image does not move pins — fractions are image-size-independent)
- **Delete** per card → confirmation warning: "This will permanently delete all houses and data in this neighborhood"
- Empty state: "No neighborhoods yet — tap Add to create one"

#### New JS file: `js/neighbors.js`
New `<section id="neighbors-page">` and `<section id="neighborhood-map-page">` in `index.html`. New routes `#neighbors` and `#neighborhood/{id}` in `app.js`.

#### Map Page (`#neighborhood/{id}`)
- Load Leaflet CSS + JS from CDN (add to `index.html`)
- Render neighborhood image as a `CRS.Simple` `imageOverlay` filling map bounds
- On load: restore saved `defaultZoom` / `defaultPanX` / `defaultPanY` from Firestore; if none saved, fit image to container
- On `moveend` / `zoomend`: debounce 800ms → save zoom + pan to `neighborhoods` doc
- Load all `neighborHouses` for this neighborhood; render each as a Leaflet `divIcon` marker (circle + house SVG)
- Pin color from `lastInteractionAt` (green / amber / gray thresholds)
- Pin label (nickname) rendered below icon

#### Adding a Pin
- **"Add House" toolbar button** → map enters placement mode (cursor changes, brief instruction shown: "Tap the map to place a house")
- User taps → pin dropped at that position → "Add House" modal opens: nickname (required), address (optional)
- On save: compute `pinX = clickPoint.x / imageWidth`, `pinY = clickPoint.y / imageHeight` → write to `neighborHouses`
- On cancel: pin removed, placement mode exits

#### Managing Pins
- **Drag pin** → on `dragend`: recompute `pinX`/`pinY` → save to Firestore
- **Click pin** → navigate to `#neighborhouse/{id}`
- Pin tooltip on hover/long-press: shows nickname

---

### Phase 2 — House Detail Page

**Goal**: User can manage residents, log house notes, and see per-resident intel inline.

#### House Detail Page (`#neighborhouse/{id}`)

**Header**
- Nickname + optional address
- Edit button → modal: change nickname, address
- Delete button → see Phase 3 for delete/archive flow (stub in Phase 2 as simple hard-delete with confirm, replaced in Phase 3)

**Residents Section**
- List of current residents from `neighborHouseResidents` (where `archived = false`)
- Each resident card:
  - Profile photo thumbnail (placeholder avatar if none)
  - Name + role badge
  - Last interaction date ("Last contact: May 12" or "No interactions yet")
  - Inline intel panel (collapsed by default, tap to expand):
    - Last 2 Facts from this person's facts (label + value)
    - Last 2 Interactions from `peopleInteractions` (date + text snippet)
  - **"See full profile"** button → `#contact/{personId}`
  - **Remove from house** (×) button → unlinks resident (deletes `neighborHouseResidents` record only; person stays in Contacts)

**Add Resident**
- **"Add Existing Contact"** button → search/filter picker from `people` collection → select → choose role → write to `neighborHouseResidents`
- **"Add New Person"** button → mini create modal: name, role, optional phone/email → saves to `people` (category = "Neighbor") → writes to `neighborHouseResidents`

**House Notes Section**
- Chronological list of notes from `neighborHouseNotes` (newest first)
- Each note: date + text, Edit (inline or modal) + Delete with confirm
- **"Add Note"** button → modal: date (defaults to today) + text field

#### `lastInteractionAt` Update Hook
When an interaction is saved anywhere in the app for a person (`peopleInteractions` write), check if that person is a current resident (`archived = false`) of any house. If so, update `lastInteractionAt` on that house to the new interaction's date. This hook lives in the interaction-save path in `contacts.js` / `people.js`.

---

### Phase 3 — Archive & Previous Families

**Goal**: Families can be archived when they move away; history is preserved and viewable.

#### Delete / Archive Modal
Replaces the simple hard-delete stub from Phase 2. When user taps **Delete** on a house:

> **Remove this house?**
> ○ **Archive — Family Moved Away**
>   They moved, but you want to keep the history.
>   The pin stays on the map; add a new family when ready.
>   [Optional text field: "Note about the move, e.g. Moved to Florida"]
> ○ **Hard Delete**
>   Removes this pin and all its data permanently.
>   People remain in your Contacts.
> [Cancel] [Confirm]

#### Archive Flow
1. Create a `neighborArchivedFamilies` doc: `{ houseId, address (snapshot), archivedAt, notes }`
2. Set `archived = true` and `archivedGroupId` on all current `neighborHouseResidents`
3. Clear `lastInteractionAt` on the house doc (house is now empty → pin goes gray)
4. House stays on map; residents section now shows "No current residents"

#### Hard Delete Flow
1. Confirm modal: "This will permanently delete the pin, all house notes, and all family history. Your contacts will not be deleted."
2. Delete: `neighborHouses` doc, all `neighborHouseResidents` for this house, all `neighborHouseNotes`, all `neighborArchivedFamilies`
3. Remove marker from Leaflet map; navigate back to `#neighborhood/{id}`

#### Previous Families Button
- Shown on house detail page only when at least one `neighborArchivedFamilies` doc exists for this house
- **One archived group** → clicking opens the archived family view directly
- **Multiple archived groups** → show a picker list, each entry: "[nickname/address] — Archived [date]", newest first

#### Archived Family View (`#neighborarchive/{archivedGroupId}`)
- Read-only banner: "This family no longer lives here (archived [date])"
- "Note about the move" if one was recorded
- List of residents who were in this group: name, role, profile photo
- Each resident card links to their full Contact page (still a live record)
- No edit controls — purely historical

---

### Phase 4 — Journal Rollup *(deferred — depends on Journal @mention system)*

**Goal**: House detail page shows all journal entries that mention any current resident.

- Journal entries section on house detail (read-only)
- Query `journalEntries` where any linked person's ID is in the entry's `mentionedPersonIds[]`
- Display newest-first; tap to open full journal entry
- Not buildable until the Journal + @mention system is implemented

---

## Testing

End-to-end test cases for the Neighbors feature. Each test includes preconditions, steps, and expected result.

---

### T1 — Create a Neighborhood

**Precondition**: No neighborhoods exist (fresh state)

1. Navigate to Contacts → tap **🏘 Neighbors**
2. Tap **+ Add**
3. Verify the Add Neighborhood modal opens
4. Enter name: "Townside"
5. Tap Save without uploading an image
6. **Expected**: Save button is disabled; cannot save without image
7. Tap Upload, select a neighborhood map image
8. Verify image preview appears in the modal
9. Tap Save
10. **Expected**: Modal closes; "Townside" appears in the neighborhoods list with "0 houses"

---

### T2 — Edit a Neighborhood

**Precondition**: "Townside" neighborhood exists

1. On the neighborhoods list, tap the **✏️** edit button on "Townside"
2. **Expected**: Modal opens pre-filled with current name; image hint says "Upload a new image to replace the current one (optional)"
3. Change name to "Townside Neighborhood"
4. Tap Save
5. **Expected**: Card updates to show new name

---

### T3 — Open the Map View

**Precondition**: "Townside" neighborhood exists

1. Tap the neighborhood card
2. **Expected**: Map page opens; uploaded image fills the container; pan/zoom work; **+ Add House** button and **Edit** button in header

---

### T4 — Add a House Pin (Placement Mode)

**Precondition**: On the Townside map page

1. Tap **+ Add House**
2. **Expected**: Amber banner appears: "Tap the map to place a house pin"; cursor changes to crosshair
3. Tap on a house location in the map image
4. **Expected**: Add House modal opens
5. Leave nickname blank, tap Save
6. **Expected**: Save is disabled (nickname required)
7. Enter nickname "The Smiths", address "123 Townside Dr"
8. Tap Save
9. **Expected**: Pin appears at the tapped location; label "The Smiths" shows below the pin; pin is gray (no interactions yet)

---

### T5 — Drag a Pin to Reposition

**Precondition**: "The Smiths" pin exists on the map

1. Press and drag the "The Smiths" pin to a new location on the map
2. **Expected**: Pin moves smoothly; label stays attached
3. Reload the map page (navigate away and back)
4. **Expected**: Pin appears at the new position (fractions saved to Firestore)

---

### T6 — Edit a House

**Precondition**: On the "The Smiths" house detail page

1. Tap **Edit**
2. **Expected**: Modal opens pre-filled with nickname and address
3. Change address to "125 Townside Dr"
4. Tap Save
5. **Expected**: Address updates on the detail page header

---

### T7 — Add Resident (From Contacts)

**Precondition**: At least one existing contact in the app; on the house detail page for "The Smiths"

1. Tap **+ From Contacts**
2. **Expected**: Resident picker modal opens in search mode
3. Type partial name of an existing contact
4. **Expected**: Matching results appear
5. Tap a result
6. **Expected**: Picker advances to role selection step
7. Select role "Owner"
8. Tap Save
9. **Expected**: Resident card appears in Residents section with name, "Owner" badge, and "No interactions yet"

---

### T8 — Add Resident (New Person)

**Precondition**: On the "The Smiths" house detail page

1. Tap **+ New Person**
2. **Expected**: New Person modal opens
3. Enter name "Jane Smith"
4. Select role "Spouse"
5. Tap Save
6. **Expected**: "Jane Smith" resident card appears; contact "Jane Smith" created in Contacts (category: Personal, type: Neighbor)

---

### T9 — Intel Panel Expand/Collapse

**Precondition**: A resident has at least one fact or interaction logged

1. On a resident card, tap **▼ Intel**
2. **Expected**: Panel expands showing up to 2 facts and up to 2 recent interactions
3. Tap **▲ Intel**
4. **Expected**: Panel collapses

---

### T10 — Remove a Resident

**Precondition**: At least one resident on the house

1. Tap the **×** button on a resident card
2. **Expected**: Resident is removed from the house; contact record is unchanged (verify by going to Contacts)

---

### T11 — Add a House Note

**Precondition**: On the "The Smiths" house detail page

1. Tap **+ Add Note**
2. **Expected**: House Note modal opens with today's date pre-filled
3. Enter text "Their landscaper is Green Thumb Co"
4. Tap Save
5. **Expected**: Note card appears in House Notes section with date and text

---

### T12 — Edit a House Note

**Precondition**: A house note exists

1. Tap **Edit** on the note card
2. Change the text
3. Tap Save
4. **Expected**: Note text updates in place

---

### T13 — Delete a House Note

**Precondition**: A house note exists

1. Tap **Delete** on the note card
2. **Expected**: Confirm dialog appears
3. Confirm
4. **Expected**: Note removed from the list

---

### T14 — Pin Color Updates After Interaction

**Precondition**: "The Smiths" pin is gray; resident is linked to the house

1. Navigate to the resident's Contact page
2. Log a new interaction (today's date)
3. Navigate back to the Townside map
4. **Expected**: "The Smiths" pin is now **green** (interaction within 60 days)

---

### T15 — Archive a Family (Family Moved Away)

**Precondition**: "The Smiths" house has at least one current resident

1. On the house detail page, tap **Delete**
2. **Expected**: Delete/Archive modal opens; "Archive — Family Moved Away" is selected by default
3. Enter move note "Moved to Florida"
4. Tap **Confirm**
5. **Expected**: 
   - Residents section shows "No current residents"
   - "Previous Families" section appears with one entry showing today's date and "Moved to Florida"
   - Map pin turns gray
6. Navigate back to the map
7. **Expected**: Pin still visible on the map

---

### T16 — View Archived Family

**Precondition**: T15 completed

1. Tap the archived entry in "Previous Families" section
2. **Expected**: Read-only archived family view opens; amber banner shows archive date; "Moved to Florida" note displayed; resident cards show name, role, and "View Contact" button
3. Tap "View Contact" on a resident
4. **Expected**: Navigates to that contact's full profile page

---

### T17 — Add New Family to Same House After Archive

**Precondition**: T15 completed; house is now empty

1. On the house detail page (now empty), tap **+ New Person**
2. Add "Bob Jones" as Owner
3. **Expected**: New resident appears; "Previous Families" section still shows the archived Smith family below
4. Navigate to map
5. **Expected**: Pin turns green if Bob has a recent interaction, otherwise gray

---

### T18 — Hard Delete a House

**Precondition**: A test house exists on the map (use a secondary house, not "The Smiths")

1. On the house detail page, tap **Delete**
2. Select **Hard Delete** option
3. Tap **Confirm**
4. **Expected**: 
   - Navigates back to map
   - Pin no longer appears on the map
   - Contacts referenced as residents are unaffected (verify)

---

### T19 — Delete a Neighborhood

**Precondition**: A test neighborhood with houses exists

1. On the neighborhoods list, tap **🗑** on the test neighborhood
2. **Expected**: Confirmation dialog warns that all houses will be deleted
3. Confirm
4. **Expected**: Neighborhood removed from the list

---

### T20 — Journal Mentions Section

**Precondition**: A resident has at least one journal entry with an @-mention of that person

1. Navigate to the house detail page
2. **Expected**: "Journal Mentions" section appears below Previous Families
3. Verify entries are sorted newest-first
4. Tap an entry card
5. **Expected**: Navigates to the full journal entry view

---

### T21 — Journal Mentions Hidden When No Residents

**Precondition**: House has no current residents (all archived or never added)

1. Navigate to the house detail page
2. **Expected**: "Journal Mentions" section is not visible

---

### T22 — Breadcrumb Navigation

1. Navigate: Neighborhoods → Townside → The Smiths house
2. Tap "Map" in the breadcrumb
3. **Expected**: Returns to the Townside map
4. Tap "Neighborhoods" in the breadcrumb
5. **Expected**: Returns to the neighborhoods list

---

### T23 — Cancel Placement Mode

**Precondition**: On the map page

1. Tap **+ Add House** to enter placement mode
2. Tap **Cancel** in the amber banner
3. **Expected**: Placement mode exits; no pin dropped; banner hidden

---

*Testing section added: 2026-05-26*

---

## Things We Considered and Discarded

| Idea | Why Discarded |
|------|--------------|
| Google Maps embed | Requires API key, billing risk |
| Leaflet + OpenStreetMap live tiles | Requires internet to render the map background; user's preferred view is off-center from their house location |
| Manual color picker per house | Switched to recency-driven color — green ≤60 days, amber 61d–1yr, gray stale/new — more useful at a glance |
| Sub-person grouping on map (family as a unit under one person) | Wayne's daughter across the street = her own house and own contact — independence is cleaner |
| Quick-add shortcut on house page (pick person + note in one step) | Standard 3-tap path reuses existing patterns without custom UI |
| Naming archived family groups | User doesn't want to name them — address + archive date is enough to identify them |
| Tap-anywhere to drop pin | Mobile pan vs. pin-drop conflict — replaced with "Add House" button + placement mode |
| Geolocation for initial map center | Switched to user-uploaded image — no center point needed at all |

---

## Things We May Do Later

- "Prep card" — before a social event, quick summary: last 3 interactions + top interests for a person
- Push reminder: "You haven't logged anything about Wayne in 3 months"
- Birthday roll-up from neighbor contacts to Life calendar (already in People plan)
- Neighborhood stats: total houses tracked, total people
- Filter map: show only houses with recent activity, or with people in a certain role
- Street view link (would require Google Maps API — not free)
- Shared neighbor data with spouse (multi-user, not in scope)
- Multiple named maps per neighborhood (e.g., a sub-area)

---

*Plan started: 2026-05-26 | Last updated: 2026-05-26*
