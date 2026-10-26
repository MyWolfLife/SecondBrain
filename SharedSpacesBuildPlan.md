# Shared Spaces — build plan (groups + the Collections test)

*Plan only — no code written yet. 2026-10-26. This **replaces the "Share like Google Drive, per-person guest lists" direction** (S7/S8 in `SharedSpacesPlan.md`) with **groups**, decided in conversation with the user. The old plan's ideas that still hold: data really moves into a shared area (real server-side security), who-did-it stamps, owner-only controls, backup before any move. `SharedSpacesPlan.md` stays as background.*

## 1. What the user wants

- Each person has their own login and their own private data.
- You **share a thing with one or more groups**, and anyone in those groups can use it. Groups are built once and reused.
- Starting groups: **Wife**, **Family**, **Guest**. The user can make more any time.
- One thing can be shared with several groups (Family *and* Guest). Each group gets **View only** or **Can edit**, chosen when sharing.
- **Typical use is temporary:** share the Yard, the son logs all the plants, unshare. The owner keeps everything, including what the son added.
- **Editors can delete** things inside what was shared. Only the **owner** can unshare, change who it is shared with, or delete the whole thing.
- Passwords (later): shared per item with a group (e.g. one with Wife, another with Wife + Son).
- A setting, **"Show who added/modified"**, turns the "added by …" labels on and off. The app always records who did what; the setting only decides whether it is shown. Per person.
- The son's account is created by the user (first user after this ships). The wife comes later.

**First thing to share (the test): a Collection** (the albums). After it works, the user picks the order of the rest (Yard likely next).

## 2. Decisions

| # | Decision |
|---|---|
| G1 | **Groups.** A group = a name + a list of people. Owned by whoever creates it; only the owner edits it. Groups are not nested. |
| G2 | **Sharing = a shared container.** Sharing a collection moves it, with its items and photos, into `shares/{shareId}/…`. Unsharing moves it all back to the owner. Document IDs are kept so every link between documents survives the move. A backup is downloaded first. |
| G3 | **Per-group role on each share:** `shareGroups: { groupId: 'view' | 'edit' }`. |
| G4 | **Flattened member lists on the share** (`viewerUids[]`, `editorUids[]`, `names{}`) are what the security rules read, so a rule needs only one lookup. The owner's app recomputes them whenever a share's groups or a group's members change. |
| G5 | **Owner keeps everything.** Items the editor adds live in the container and come back on unshare. |
| G6 | **Roles:** View = read. Edit = add / change / delete anything inside, except the collection record itself. Owner = everything, plus share settings, unshare, delete the collection. |
| G7 | **People connect with a one-time invite code** (8 characters, single use, 7 days). The invite document *is* the connection record, so no rule ever has to write into another person's private area. |
| G8 | **Stamps (S11, kept):** every write in a share sets `createdBy/createdAt/updatedBy/updatedAt`. Labels follow the per-person setting "Show who added/modified" (default off). |
| G9 | **Private things a shared item points to** (location in a room, beneficiary contact) show as plain text or "Private item" to others. Nothing private is sent to them. |
| G10 | **Rules are a file for the user to deploy** (`firestore.rules`). Nothing is assumed deployed; the app shows a clear message if a share call is refused. |
| G11 | **Offline Trip Mode, backup of shared things, shared-with-me in backup:** later (see §6). `dataCol` goes through `_guardFirestoreRef` from day one so the read-only lock still works. |

## 3. Data model

New **top-level** collections (not user data, so not in the normal backup lists; the owner's shares are added to backup in chunk S7):

```
invites/{code}     fromUid, fromName, expiresAt, usedBy, usedByName, usedAt
groups/{groupId}   ownerUid, name, memberUids[], memberNames{uid: name}, createdAt
shares/{shareId}   ownerUid, kind ('collection'), title,
                   shareGroups{groupId: 'view'|'edit'},
                   viewerUids[], editorUids[], names{uid: name}, createdAt
shares/{shareId}/collections/{id}       the collection record (same fields as today)
shares/{shareId}/collectionItems/{id}   items
shares/{shareId}/photos/{id}            photos (targetType 'collectionitem' / 'collection')
shares/{shareId}/facts/{id}             facts, if collection items have any
```

Personal, unchanged: `users/{uid}/…`. One new personal setting: `showWhoEdited` (boolean), and the person's "name in Sharing".

**People list** = invites where `fromUid == me` or `usedBy == me` and `usedBy` is set. Disconnect = delete that invite doc, and the owner's app removes the person from their groups and recomputes shares.

## 4. Build chunks

| # | Chunk | Result |
|---|---|---|
| **S1** | **Rules draft.** `firestore.rules` in the repo (draft at the top of this chunk), `FirestoreRules.md` with the exact deploy steps, and a short "how to test" with two accounts. *The user reviews and deploys; no app code yet.* | Rules reviewed, deployed by the user |
| **S2 ✅** | **People.** Settings → Sharing: your name, **Invite someone** (code), **Enter invite code**, people list, disconnect. | Two accounts are connected |
| **S3 ✅** | **Groups.** Settings → Sharing → Groups: create / rename / delete, add or remove people. | "Family" exists with the son in it |
| **S4 ✅** | **Plumbing.** `shareCol(shareId, name)` through the Offline-lock guard; stamp helper; setting "Show who added/modified"; `window.currentShareId` hook for photos/facts; a **Shared with me** list on the Collections page. | Code can read and write a share (tested by hand with a seeded share) |
| **S5 ✅** | **Share a collection.** Share button on the collection page → pick groups + View/Edit; the move (backup → copy in batches of 400 → verify counts → delete original, with progress); `collections.js` / `photos.js` / `facts.js` read and write the right place; shared collections show in the Collections list with a left-side badge (owner / Edit / View). | The son sees and edits the albums |
| **S6 ✅** | **Finish the loop.** *(Already done in S5: change groups/roles, View-only hides the page buttons, owner-only delete of the whole collection, removing someone from a group cuts access at once.)* Still to do: **Stop sharing** (move everything back to the owner, backup first), hide the photo viewer's caption/delete/thumbnail buttons for View-only, show the "Added by / Changed by" labels on the collection and item pages. | Full test with the son's account |
| **S7 ✅** | **Other readers of collections.** Beneficiaries, search, SecondBrain, Ask-AI and the backup/restore logic find shared collections correctly; spec and AppHelp finished. | Nothing else in the app breaks or leaks |

Every chunk: test in the preview server, then update the spec and AppHelp, bump `sw.js` and the `?v=` tags, commit, notify, push.

## 5. How to test with two people

The preview has **one test account**. The user should create a **second test account** (a sign-up in the app, or in the Firebase console) so I can drive both, one in the preview and one in a second browser profile. The user's real data is never used. *(Open question 2.)*

Rules are tested once deployed with the two accounts: each must be refused when it tries to read the other's private area, a share it is not in, or write to a View-only share.

## 6. Not in this plan (later)

- Sharing the Yard, House, Garage, Contacts, passwords, notes, Workouts library and the rest. Picked after Collections works.
- Workouts: the open question about personal progress inside shared workouts (`SharedSpacesPlan.md` §8b.1) is parked until Workouts is shared.
- Backup "include shared with me", Offline Trip Mode for shares (the guard is in place, but downloading shared data for a trip is later).
- Per-person "which house" switcher.

## 7. Open questions

1. ~~**Current rules.**~~ Done 2026-10-26: pasted and carried into `firestore.rules` unchanged.
5. ~~**Legacy flat collections.**~~ Checked 2026-10-26 by the user (console snippet): all 20 old collections are empty, and the code only uses `sharedDevNotes` outside `userCol()`. The legacy rule lines are dropped from `firestore.rules`, so those paths become locked when it is deployed. Nothing to delete.
2. ~~**Second test account.**~~ Done 2026-10-26: `testgator@gmail.com` created by the user; login saved in memory and the gitignored `.test-credentials.md`.
3. ~~**Who can make groups.**~~ Decided 2026-10-26: **everyone** can make groups and share their own things. Groups belong to their creator.
4. ~~**Rules for a custom-Firebase user.**~~ Sharing only works between accounts in the **same Firebase project** (`bishop-62d43`); a person on their own Firebase project can't share with this one. Accepted 2026-10-26: `firestore.rules` is for `bishop-62d43` only.
