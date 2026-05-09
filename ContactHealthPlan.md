# ContactHealthPlan.md — Health Tracking by Contact

## Overview

Generalize the health section so that all health data is tied to a **contact** rather than always
implicitly being "me." The pattern mirrors how Financials works: the user explicitly adds contacts
they want to track health on, picks one as the active context, and all health screens below scope
their data to that person. A special protected "Me" contact always exists as the default.

---

## 1. The "Me" Contact

### Rules
- On app load (or on first navigation to Contacts), check if a contact with `isMe: true` exists.
- If not, **create it automatically**: `{ name: 'Me', isMe: true, category: 'Personal', createdAt: now }`.
- The "Me" contact **cannot be deleted** — the delete button is hidden on its detail page and the
  delete function guards against it (`if (contact.isMe) return;`).
- It **cannot have its name changed** to anything other than "Me" — the name field is read-only
  on the edit modal when `isMe === true`.
- `isMe` is a boolean field on the Firestore document in the `people` collection.
- All other contact fields (photo, phone, email, etc.) are still editable on the Me contact.

### Implementation Notes
- On Contacts page load, run `ensureMeContact()` — queries `people` where `isMe == true`, limit 1.
  If no result, creates the doc. This is idempotent and safe to call every time.
- The UI does not expose `isMe` to the user — it's an internal flag.

---

## 2. Pet Owner Field on Contacts

### Motivation
Currently there's no way to tell "my dog Max" from "my daughter's dog" — both are just contacts.

### Changes to Contact Edit Modal
- When `type === 'pet'` (or the contact category is 'Pet'), show an **Owner** field.
- Owner is a **ContactPicker** (or a plain text field as a simpler alternative — see Open Questions).
- Stored as `ownerContactId` (FK to another contact) or `ownerName` (free text fallback).
- Displayed on the contact card/detail page as: "Owner: [name]"
- On the contact list, pet contacts can optionally show a small "🐾 [Owner Name]'s pet" label.

### Contact Category Update
Add **Pet** to the category dropdown (alongside Personal, Medical Professional, Medical Facility,
Service Professional, Other). This makes the filter/display logic clean.

---

## 3. Add `contactId` to All Health Records

### Motivation
Every health record currently implicitly belongs to "me." We need to make this explicit so
we can support tracking health for any contact (family, pets, etc.).

### Collections That Need `contactId`

| Collection | Notes |
|---|---|
| `healthVisits` | Each visit belongs to one person |
| `medications` | A med is prescribed to one person |
| `bloodWorkRecords` | Lab results belong to one person |
| `concerns` (healthConcerns) | A concern belongs to one person |
| `concernUpdates` (healthConcernLogs) | Inherits from parent concern, but also stamp directly |
| `conditions` (healthConditions) | A condition belongs to one person |
| `healthConditionLogs` | Inherits from parent condition, also stamp directly |
| `vitals` | Measured for one person |
| `supplements` | Taken by one person |
| `vaccinations` | Received by one person |
| `eyePrescriptions` | Belongs to one person |
| `allergies` | Belongs to one person |
| `insurancePolicies` | Covers one person (or could be shared — see Open Questions) |
| `healthAppointments` | Appointment is for one person |
| `healthCareTeam` | The care team is per-person — this is currently a single doc; needs rethinking |
| `emergencyInfo` | Per-person — currently a single doc; needs rethinking |

### `contactId` Field
- `contactId` — string, FK to the `people` collection.
- When `null` or missing: treated as the "Me" contact (for migration compatibility).
- Newly created records always get `contactId` set explicitly.

### Special Cases
- **`emergencyInfo`** — currently `userCol('healthCareTeam').doc('default')`. Needs to become
  per-person: `userCol('emergencyInfo').doc(contactId)` or a contactId field on the doc.
- **`healthCareTeam`** — same as emergencyInfo. Each person can have their own care team.
  Refactor to `userCol('healthCareTeam').doc(contactId)`.
- **`concernUpdates` / `healthConditionLogs`** — these are child records. They inherit their
  `contactId` from the parent concern/condition (not queried independently by contactId).
  Still stamp them for completeness, but primary filter is always through the parent.

---

## 4. Migration — Tie Null `contactId` Records to "Me"

### Strategy
A one-time client-side migration runs on first load after this feature ships.

### Migration Flag
- Stored in Firestore: `userCol('settings').doc('appState')` — field `healthConverted: boolean`.
- If `healthConverted === false` (or the field is missing): **run migration**.
- If `healthConverted === true`: **skip migration**.
- After migration completes: set `healthConverted: true`.

### Migration Logic (`runHealthContactMigration()`)
1. Look up (or create) the "Me" contact — get its `meContactId`.
2. For each collection in the list above:
   a. Query all documents where `contactId` is `null` or `contactId` field does not exist.
   b. Batch-update each document: set `contactId = meContactId`.
3. After all batches complete, set `healthConverted: true` in settings.
4. Log to console: "Health migration complete — X records updated."

### Ordering
- Migration runs **after** `ensureMeContact()` completes (awaited).
- Migration runs before the health page renders, but can be non-blocking if batches are large.
- Show a subtle "Migrating health data…" message if it takes more than 500ms.

### Batch Size
- Firestore batch limit is 500 writes. Process in batches of 400.

---

## 5. "Track Health" Contact Selection on Main Health Screen

### Behavior (mirrors Financials pattern)
- At the **top of the My Health main screen**, above the tile grid, show a section:
  ```
  Track Health For:
  [ Me ]  [ + Add Person ]
  ```
- The user can add any contact from their contacts list to this tracked list.
- Tracked contacts are stored in: `userCol('healthTrackedContacts').doc('default')` —
  field `contactIds: string[]`.
- The "Me" contact is **always in this list** — it cannot be removed.
- Contacts are shown as small cards (see Section 6 for card design).
- **"+ Add Person"** — opens a ContactPicker overlay (all contacts, any category) to pick one.
  After picking, `contactId` is added to `contactIds[]`.
- Removing a tracked contact: show a Remove button on the card. Confirm before removing.
  Does **not** delete the contact or their health records — just removes them from the tracked list.

---

## 6. Contact Selection Cards + Active Person Context

### Card Design (collapsed / not selected)
```
┌──────────────────────┐
│ 👤 Me                │
│ (tap to select)      │
└──────────────────────┘
```
Small, compact. Name + icon. If the contact has a photo, show a small avatar circle.

### Card Design (expanded / selected — active context)
```
┌─────────────────────────────────────┐
│  👤  Me                      ✓ Active│
│  Personal                           │
│  You are viewing health data for Me │
└─────────────────────────────────────┘
```
Larger card, distinct color/border (e.g., blue border or teal background tint), checkmark badge,
subtitle text confirming context. Visually clear that this is "who we're looking at."

### Active Person State
- Stored in `window.healthActiveContactId` (in-memory only).
- **Every time the health main screen loads**: reset to the "Me" contact ID. No stickiness.
- When the user taps a contact card: update `window.healthActiveContactId`, re-render cards.
- While navigating child pages (Medications, Visits, etc.): context is remembered because
  `window.healthActiveContactId` stays set for the lifetime of the page session.
- If the user goes back to the health main screen and re-enters, it resets to Me again.

### Passing Context to Health Sub-Pages
- Each health sub-page reads `window.healthActiveContactId` on load.
- Uses it to scope all Firestore queries: `where('contactId', '==', healthActiveContactId)`.
- The sub-page header/breadcrumb should show: **"Medications — Me"** or **"Medications — Max (Dog)"**
  so the user always knows whose data they're looking at.
- All **add/edit modals** on health sub-pages automatically stamp the new record with
  `contactId = window.healthActiveContactId`.

---

## 7. All Health Activity Tied to Active Person

### Write Path
- Every time a health record is created (visit, medication, concern, etc.), set:
  `contactId = window.healthActiveContactId`
- This must be enforced in the save functions for every health collection — no exceptions.

### Read Path
- Every health list/detail query must filter by `contactId == window.healthActiveContactId`.
- For child records (concernUpdates, conditionLogs): filter through the parent (parent already
  has contactId), so child queries by `concernId` / `conditionId` remain unchanged.

### Edge Case — Page Refresh
- If the user refreshes while on a health sub-page, `window.healthActiveContactId` resets.
- On sub-page load: if `healthActiveContactId` is null, default to the "Me" contact ID
  (load it from Firestore: `people where isMe == true`).

---

## 8. Data Model Changes

### New / Modified Firestore Docs

| Collection / Doc | Change |
|---|---|
| `people` | Add `isMe: boolean`, `ownerContactId?: string` (for pets) |
| All health collections | Add `contactId: string` field |
| `userCol('settings').doc('appState')` | Add `healthConverted: boolean` |
| `userCol('healthTrackedContacts').doc('default')` | **NEW** — `{ contactIds: string[] }` |
| `userCol('healthCareTeam').doc(contactId)` | Per-person doc (was single `'default'` doc) |
| `userCol('emergencyInfo').doc(contactId)` | Per-person doc (was single `'default'` doc) |

### Backup
- `healthTrackedContacts` must be added to `BACKUP_DATA_COLLECTIONS` in the same commit.

---

## 9. Open Questions

| # | Question | Status |
|---|---|---|
| Q5 | Insurance — should a policy have one contactId (the insured), or support multiple people on one plan? | Start with single contactId; add multi-person later if needed |
| Q7 | Should removing a tracked contact warn that it has health data? | Yes — "This contact has X health records. Removing them from tracking doesn't delete any data. Continue?" |

---

## 10. Implementation Phases

Phases are ordered so each builds on what came before.

| Phase | What | Depends On |
|---|---|---|
| **CH1** | Me contact creation + isMe flag + pet owner field on contacts | — |
| **CH2** | Add `contactId` to all health collections (schema only — no UI change yet) | CH1 (Me contact must exist) |
| **CH3** | Migration — run `runHealthContactMigration()` on first load | CH2 |
| **CH4** | `healthTrackedContacts` collection + "Add Person" UI on health main screen | CH1 |
| **CH5** | Contact selection cards on health main screen + active person context state | CH4 |
| **CH6** | All health sub-pages scope reads/writes to `window.healthActiveContactId` | CH5 |
| **CH7** | Sub-page headers show active person name; add/edit modals stamp contactId | CH6 |

---

## 11. Decisions Log

| # | Decision | Answer |
|---|---|---|
| D1 | Me contact — editable or fully locked? | Name locked to "Me"; all other fields editable |
| D2 | Me contact storage | `people` collection, `isMe: true` — same collection as all contacts |
| D3 | Migration trigger | Client-side on health page load; `healthConverted` flag in `settings/appState` |
| D4 | Active person persistence | `window.healthActiveContactId` — **always resets to Me on every entry to the health main screen**. Remembered while navigating child pages within the health section, but not sticky across re-entries. |
| D5 | "Me" always in tracked list | Yes — cannot be removed |
| D6 | Child records (concernUpdates, conditionLogs) | Stamp with contactId but query through parent; no behavioral change needed |
| D7 | Emergency Info and Care Team | **Me only.** Both tiles are hidden when a non-Me contact is the active context — not disabled, not grayed out, just not shown. Avoids confusion about whose info it is. |
| D8 | Pet owner field | **ContactPicker** — links to another contact record (e.g., "Emma" in your contacts). Stored as `ownerContactId` on the pet contact. |
| D9 | Pet health data model | Same health collections as humans — visits become vet visits, medications cover worming/flea treatment, concerns cover unknown lumps, etc. No separate pet-specific collections needed. |

---

*Created: 2026-05-09*
