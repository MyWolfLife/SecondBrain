# Sharing the House — build plan

*All five chunks built (H1–H5), 2026-10-26. Same recipe as the Yard (`SharedYardPlan.md`, built and working): groups, View only / Can edit, owner keeps everything, editors can add/change/delete inside, only the owner changes sharing or stops it. No new security rules are needed (the deployed rules already allow any subcollection under a share).*

## 1. What gets shared

**The whole House section is one share** (kind `house`), one per owner:

| Moves in (whole collection) | Moves in (only the house's rows) |
|---|---|
| `floors`, `rooms`, `things`, `subThings`, `subThingItems`, `floorPlans`, `breakerPanels` | `activities`, `photos`, `problems`, `facts`, `projects` whose `targetType` is `floor`, `room`, `thing`, `subthing`, `item`, or a floor-plan item (`door`, `window`, `ceiling`, `recessedLight`, `wallplate`, `fixture`, `plumbingEndpoint`, `plumbing`, `breaker`, `panel`), plus facts/photos on a house problem |

**Stays private:** calendar events (even house ones), tags, contacts, Garage, Vehicles, Structures, Neighborhoods (Collections can already be shared on their own). Calendar events and checklist runs that point at a room keep working for the owner (IDs do not change).

## 2. Decisions

| # | Decision |
|---|---|
| H1 | **One active house at a time**, exactly like the Yard: `window.houseShareId` / `houseRole`, `houseCol(name)`, `hTargetCol(name, targetType)`, a "House: My house / Steve's house" picker shown only when more than one house can be opened. |
| H2 | **Rows split by target** (house targets go to the house, everything else stays private). Photos/facts on a problem follow the problem. |
| H3 | **Writes in a share are auto-stamped**; "Added by …" labels follow the existing "Show who added/modified" setting. |
| H4 | **View only** hides add/edit/delete buttons on every house page and the floor-plan editor (opens in view mode, Edit hidden). |
| H5 | **"Goes to (if I die)" (the beneficiary) is private to the owner:** people the house is shared with never see it, and **Who Gets What** is owner-only. Dollar values (worth, price paid) stay visible. *(Recommended; the user decides, question 1.)* |
| H6 | **Floor plans:** editors may edit; the plan is saved as one document, so if two people edit the same floor at once the last save wins (same as editing from two devices today). |
| H7 | **Moving things between House and Garage/Structures** (Move Thing, "Promote to standalone") is blocked when one side is shared and the other is private, with a plain message. |
| H8 | **Share button last, move engine reused** (backup file first, copy in size-aware batches, check counts, delete originals, roll back on failure; Stop sharing is the reverse). |
| H9 | **Collections' "Location" picker** (an item stored in a room) and **Who Gets What** read the house through the helpers, so an owner who shared still sees their locations. A person a collection is shared with sees the location as plain text. |

## 3. Who reads house data today (all must move to the helpers)

`house.js` (about 100 places), `floorplan.js`, `floorplanitem.js`, `moveThings.js`, `beneficiaries.js`, `checklists.js`, `collections.js` (location picker), `search.js`, `calendar.js` (labels, complete-event), `askai.js` (walks up the hierarchy), `secondbrain.js`, `problems.js` / `projects.js` (roll-ups through `PROBLEM_CHILD_MAP`), `facts.js`, `activities.js`, `photos.js`, `settings.js` (backup/restore).

## 4. Build chunks

| # | Chunk | Result |
|---|---|---|
| **H1 ✅** | **Plumbing (invisible):** helpers, active-house resolve, picker, extra target types in the photo helpers, view-only guard generalized to the house pages. | Nothing changes for anyone |
| **H2 ✅** | **House pages** switched: house.js, floor plan editor and item pages, breaker panels, Move Thing rules; roles, stamps, who-labels, badge, "Goes to" hidden for non-owners. Tested with a share seeded by script. | The house works in a share as owner, editor, viewer |
| **H3 ✅** | **Everything else that reads the house:** Who Gets What, checklists, Collections location picker, search, calendar labels/complete-event, Ask AI, SecondBrain. | Nothing misses house data |
| **H4 ✅** | **Share and Stop sharing** on the House home; "Shared with me" shows it; two-account test. | The wife can use the house |
| **H5 ✅** | **Backup/restore** include a shared house; spec, AppHelp, phone-width check. | Docs and backup complete |

Every chunk: test in the preview with the two test accounts, update spec and AppHelp where behavior changed, bump `sw.js` and the `?v=` tags, commit, notify, push.

## 5. Risks

- **Bigger than the Yard:** about 150 places read house data, the floor plan editor is large, and roll-ups (problems, tasks) walk Floor → Room → Thing → Sub-Thing → Item. Share button comes last for that reason.
- **Floor-plan concurrency** (H6) and **cross-section moves** (H7) are the two behaviours that differ from the Yard.
- **Size:** floor plans are one big document each; photos are Base64. Batches are size-aware and a backup file downloads first.

## 6. Not in this plan

Sharing a single floor or room; sharing calendar events; Garage / Vehicles / Structures / Neighborhoods (each its own later share).
