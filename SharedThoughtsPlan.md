# Shared Thoughts — Plan

Sharing under **Thoughts → Memories** and **Thoughts → My Thoughts**, using the same Shared Spaces engine as the other sections (groups Wife / Family / Guest, View only or Can edit; owner keeps everything; only the owner shares, stops sharing or deletes).

Status: ALL BUILT — T1 (memories), T2 (My Thoughts), T3 (search). Top 10 Lists are not part of this plan. Top 10 Lists are not part of this plan.

## What the user asked for

- Share **one memory** or **all memories**.
- Share **one thought** or **all my thoughts**.

## Proposed decisions (confirm before building)

1. **Four share kinds**: `memory` (one), `allMemories`, `thought` (one), `allThoughts`.
2. **One memory travels with**: its text, date, location, tags, URLs, In Progress flag. Its links to other memories are kept only when both memories are in the same share (so "all memories" keeps every link; a single shared memory shows no links to private ones).
3. **One thought travels with**: its text, links, all **previous versions** (history), and the labels of its category and subcategory (copied into the share so the recipient sees names, not blanks).
4. **All memories** also brings the tag list (so tag pills show). **All my thoughts** brings all categories and subcategories of all four types (View, Reflection, Advice, Review).
5. **New items join an "all" share automatically**, as with all contacts.
6. **@mentions in a memory** (people chips) show only for contacts the recipient can already see (their own, or shared with them). Others are left out rather than shown blank. Free-form `++Name` chips always show.
7. **Recipients with Can edit** can change text, add links, archive a new version, add a memory/thought into an "all" share; View only = read only. Only the owner shares, stops sharing or deletes the share.
8. **Timeline**: shared memories do not appear in a recipient's Timeline (Timeline stays personal). Search finds shared items (as with the other sections).
9. **Backup**: shared memories and thoughts included in the Data backup, restored as private if the share no longer exists.

## Data today

- `memories`, `memoryLinks`, `memoryTags` (`users/{uid}/…`). Memories are opened by id from the list; the edit page auto-saves.
- `views` (thoughts) with `history` subcollection; `viewCategories` with `subcategories` subcollection.
- Other code that reads them: `thoughts.js` (counts on the landing page), `timeline.js` (memories), `search.js`, `settings.js` (backup).

## Approach

Same method as contacts: **move into the share and route every read/write through one helper**, so existing screens keep working. Items live at `shares/{shareId}/memories/{id}` etc. with the same ids. The share rules are generic by collection name, so no rules change is expected (confirm in the first chunk). Move engine: download a backup JSON, create the share, copy with the same ids, verify counts, delete originals, roll back on failure; stop sharing is the reverse.

## Chunks

- **T1 ✅ — Memories (one and all).** (also includes the backup of shared memories) Routing helper for `memories`/`memoryLinks`/`memoryTags`; Share… on the memory page and Share all… on the list; "Shared with me" on the Memories list; roles; auto-join for new memories; counts on the Thoughts landing page include shared items shown separately.
- **T2 ✅ — My Thoughts (one and all).** (also includes the backup of shared thoughts) Routing helper for `views` (+ history) and `viewCategories` (+ subcategories); Share… on a thought and Share all… on the list; "Shared with me" section; roles; category labels travel; auto-join.
- **T3 ✅ — Search for shared items** (backup of both was done in T1 and T2).

## Open questions

- Should "All my thoughts" be one share of all four types, or should you be able to pick a type (e.g. share all **Advice** with a kid)? Proposed: all four types together; use "one thought" for the rest.
- Should a recipient be able to add new memories/thoughts into an "all" share when they have Can edit? Proposed: yes.

## Rules reminders for the build

Update `MyLife-Functional-Spec.md` and `AppHelp.md` with each chunk; bump `CACHE_NAME` in `sw.js` and the `?v=` of each changed script in `index.html`; add backup of shared data to `js/settings.js`; park ideas in `FutureEnhancements.md`; send the ntfy notice before every `git push`.
