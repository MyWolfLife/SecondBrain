# Shared Checklists and Contacts — Plan

Sharing under Life → **Checklists** and Life → **Contacts** (with Neighborhood), using the same Shared Spaces engine as Collections, Yard, House, Credentials, Financial and Budgets (groups Wife / Family / Guest, View only or Can edit; owner keeps everything; only the owner shares, stops sharing or deletes).

Status: PLAN ONLY, nothing built yet.

## Decisions (settled with the user)

1. **Checklists are shared one at a time** — the one list (run) the owner picks, like budgets. Example: Grocery with the wife, Chores with the son.
2. **Only the list shared, not its template.** The recipient does not get the reusable template and cannot start a new run. The owner starts the next list. (Idea for later: a "Clear all ticks" button so a recipient can reuse the same list — add to FutureEnhancements.md when built.)
3. **A recipient may tick, add and remove items** on a list shared as Can edit. View only = read only.
4. **Live updates** (like Google Keep): a shared list updates on the other person's screen as ticks happen (Firestore `onSnapshot` on the run document).
5. **Contacts: share one contact, or all contacts.** One contact = that contact plus its interactions, important dates and notes. All contacts = every contact plus the whole **Neighborhood** (neighborhoods, houses, residents, house notes, archived families).
6. **Neighborhood is shared only together with "all contacts"** — never on its own, and never with a single shared contact.
7. **New contacts join an "all contacts" share automatically**, so the recipient keeps seeing new people.
8. **Dropdown labels travel with the share.** A contact points at lookup lists (service trades, medical specialties, etc.) that live in the owner's private data. Only the values the shared contacts actually use are copied into the share, so the recipient sees real labels, not blanks.

## Checklists

Data today: `checklistTemplates` and `checklistRuns` (`users/{uid}/…`). A run holds `items` as one array of `{label, done, note}` addressed by position, and is read, changed and rewritten whole.

Two problems for sharing, both solved in K2:
- Two people ticking at once could overwrite each other (whole-array rewrite).
- Position-based edits break if someone adds or removes an item at the same moment.

Solution: shared runs get a stable `id` on each item, and every change (tick, add, remove, edit note) runs in a Firestore **transaction** on the run document that changes only that item. Live view = `onSnapshot` on the run.

Where it lives: `shares/{shareId}/checklistRuns/{runId}` (same id), share kind `checklist`. No rules change expected (the share rules are generic by collection name) — confirm at K1.

### Chunks
- **K1 — Share / stop sharing one list.** Share button on a run, move engine (backup JSON download, create share, copy with same id, verify, delete original, roll back on failure; stop sharing is the reverse), "Shared with me" section for recipients, role label and owner-only controls. Items get ids when shared.
- **K2 — Safe edits and live view.** Transactions per item, `onSnapshot` on shared runs (listener closed when leaving the page), view-only guard, owner-only Share / Delete.
- **K3 — Backup and restore.** Shared lists included in the Data backup (`sharedChecklists`), restored as private, skipped if still shared.

## Contacts

Data today: `people` (contacts), `peopleInteractions`, `peopleImportantDates`, `lookups` (dropdown lists), plus the Neighborhood collections `neighborhoods`, `neighborHouses`, `neighborHouseResidents`, `neighborHouseNotes`, `neighborArchivedFamilies`. Many other sections (journal, health, timeline, life projects, calendar) point at contacts by id; those stay private and are not shared by this plan.

Two share kinds:
- `contact` — one contact + its interactions + important dates (+ its photo/notes fields, which live on the contact).
- `allContacts` — every contact + interactions + important dates + the whole Neighborhood set + the needed lookup values. Only one all-contacts share per audience (same group + role), same as credentials audience shares.

### Chunks
- **P1 — Share one contact.** Move engine for a contact and its interactions/dates, lookup values copied into the share, recipient sees it under "Shared with me" in Contacts, editors may change it, owner-only share/stop/delete.
- **P2 — All contacts and Neighborhood.** Move engine for the whole set including Neighborhood; recipient gets Contacts and Neighborhood screens reading from the share; parent/child contact links (`parentPersonId`) kept inside the share.
- **P3 — Auto-join and backup.** New contacts (and new houses/residents) written into the all-contacts share automatically; backup/restore of shared contacts (`sharedContacts`).

## Open questions (to settle before building)

- Do any contact fields hold sensitive data (e.g. care team or health details) that should not go to the family? If so, hide those fields in shares.
- A contact that is also a resident in a neighborhood house: confirmed hidden from a single-contact share; for all-contacts it is included.
- Anything in other sections that opens a contact (journal, health) — for a recipient, the link shows only contacts in what is shared with them.

## Rules reminders for the build

Update `MyLife-Functional-Spec.md` and `AppHelp.md` with each chunk; bump `CACHE_NAME` in `sw.js` and the `?v=` of each changed script in `index.html`; add backup of shared data to `js/settings.js`; park ideas in `FutureEnhancements.md`; send the ntfy notice before every `git push`.
