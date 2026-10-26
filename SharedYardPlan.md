# Sharing the Yard — build plan

*Plan only, no code written yet. 2026-10-26. Builds on `SharedSpacesBuildPlan.md` (groups, invites, shares, the move engine, all done for Collections). Same rules: View only / Can edit per group, owner keeps everything, editors can add/change/delete inside, only the owner changes sharing or stops it.*

## 1. What gets shared

**The whole Yard is one share** (kind `yard`), one per owner. Moving it in puts these in `shares/{id}/…` with the same names and document IDs as today:

| Moves in (whole collection) | Moves in (only the yard's rows) |
|---|---|
| `zones`, `plants`, `weeds`, `chemicals`, `savedActions`, `gpsShapes` (yard map) | `activities`, `photos`, `problems`, `facts`, `projects` whose `targetType` is `zone`, `plant`, `weed` or `chemical` |

Those five "only the yard's rows" collections also hold House/Garage/Vehicle data, so they are split by `targetType`. Photos with `alsoTargetIds` go with their main target.

**Stays private:** calendar events (even yard ones), tags, Google Calendar links, everything outside the yard. A private calendar event that points at a plant keeps working for the owner (IDs do not change). Completing such an event writes its activity into the yard.

## 2. Decisions

| # | Decision |
|---|---|
| Y1 | **One active yard at a time.** `window.yardShareId` (null = my private yard), `yardRole` (owner / edit / view). Yard pages read and write through `yardCol(name)`. |
| Y2 | **Rows split by target.** `yTargetCol(name, targetType)` sends zone/plant/weed/chemical rows to the yard and everything else to the person's private area. Photos already work this way (`_pCol`). |
| Y3 | **Switcher.** Someone with a private yard plus a yard shared with them (the son) gets a "Yard: My yard / Steve's yard" picker at the top of the Yard home; the choice is remembered. Owners who shared have one yard and no picker. |
| Y4 | **No new rules.** The deployed rules already allow any subcollection name under a share, editors can delete inside it, and only the owner can touch the share document. Nothing to redeploy. |
| Y5 | **Share button last.** Because every chunk goes live, the Share button only appears once every reader of yard data goes through the helpers (chunk Y4 below). |
| Y6 | **Stamps and labels** as for Collections: writes in the yard carry who/when; "Show who added/modified" decides if it shows. |
| Y7 | **View only** hides add/edit/delete everywhere in the yard (buttons, photo viewer, quick tasks, problems, facts, activity log). |
| Y8 | **Move engine reuses the Collections one:** backup file first, create the share on its own, copy in size-aware batches (400 ops / ~6 MB), verify counts per collection, delete the originals; roll back on failure. Stop sharing is the reverse. |

## 3. Who reads yard data today (all must move to the helpers)

`zones.js`, `plants.js`, `weeds.js`, `chemicals.js`, `activities.js`, `problems.js`, `facts.js`, `projects.js`, `photos.js`, `gps.js`, `bulkactivity.js`, `activityreport.js`, `calendar.js` (labels, complete-event, saved actions), `search.js`, `tags.js` (reads projects), `askai.js`, `secondbrain.js` (reads and writes), `settings.js` (backup/restore), `beneficiaries.js` if it touches chemicals/plants.

## 4. Build chunks

| # | Chunk | Result |
|---|---|---|
| **Y1 ✅** | **Plumbing (invisible).** `yardCol`, `yTargetCol`, active-yard resolve at startup, switcher on the Yard home (hidden unless there is more than one yard), `_pCol/_pStamp` extended to yard targets. Nothing changes for anyone yet. | Helpers exist; private yard works exactly as before |
| **Y2 ✅** | **Core yard pages** switched to the helpers: zones, plants, weeds, chemicals, saved actions, facts, problems, quick tasks, activities, photos, GPS. Roles (view only), stamps, who-labels, "Shared / Can edit / View only" badge. Tested with a share seeded by script. | The yard works in a share, as owner, editor and viewer |
| **Y3 ✅** | **Everything else that reads the yard:** bulk activity, activity report, calendar (complete-event writes the activity into the yard, labels), search, tags, Ask AI, SecondBrain. | Nothing in the app breaks or misses yard data |
| **Y4 ✅** | **Share and Stop sharing.** Share… on the Yard home (dialog like Collections: groups + View/Edit), move engine, Stop sharing (reverse, backup first), "Shared with me" shows the yard. | The son logs plants in the real yard |
| **Y5** | **Backup/restore** include the shared yard; spec, AppHelp, FutureEnhancements; phone-width check of the new screens. | Docs and backup complete |

Every chunk: test in the preview with the two test accounts, update spec and AppHelp where behavior changed, bump `sw.js` and the `?v=` tags, commit, notify, push.

## 5. Risks

- **Big surface:** ~15 files read yard data. Missing one means the owner's yard looks empty or a write lands in the wrong place. That is why the Share button comes last and Y2/Y3 are tested against a seeded share first.
- **Orphans:** rows whose `targetId` points at something deleted. They move with their `targetType` set; harmless.
- **Size:** many photos (Base64). Batches are size-aware; the move shows progress. A backup file is saved first.
- **Mixed collections:** a fact/photo/problem on a *private* House item stays private; only yard targets move.
- **Calendar events:** the son cannot see the owner's yard calendar events (they stay private). Add to the share later if wanted.

## 6. Not in this plan

Sharing weeds or chemicals on their own (they go with the yard); sharing a single zone; sharing calendar events; Offline Trip Mode for shared yards.
