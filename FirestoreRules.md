# Firestore security rules — review and deploy (chunk S1)

*What this is:* the rules in the Firebase console decide who can read and write what. `firestore.rules` in this repo is the **new version**. It is a draft: **nothing changes until you paste it into the console and press Publish.** Part of the plan in `SharedSpacesBuildPlan.md`.

## What the new rules do, in plain words

| Area | Who can do what |
|---|---|
| `users/{you}/…` (your private data) | Only you. **Unchanged.** |
| `sharedDevNotes` (+ its photos) | Same as today. **Unchanged.** |
| `invites` (invite codes, which also record who is connected) | Anyone signed in can look up a code they were given. You can list only your own. A code can be used once, before it expires, and not by the person who made it. Either person can disconnect. |
| `groups` | Only the person who made a group can see or change it. |
| `shares` (a shared collection and everything in it) | The owner can do everything. People in the "can edit" list can read, add, change and delete the things inside, but not delete the collection record itself. People in the "view" list can only read. Everyone else is refused. |
| The old flat collections (`plants`, `zones`, `photos`, …) | **Removed.** They were all empty (checked 2026-10-26), so they become locked. |

## Deploying (you do this; it takes about 3 minutes)

1. Open **console.firebase.google.com**, project **bishop-62d43**.
2. **Build → Firestore Database → Rules** tab.
3. **Save the old rules first.** They are copied at the bottom of this file, so you can paste them back if anything goes wrong.
4. Open `firestore.rules` from this repo, select everything (Ctrl+A) and copy it.
5. In the console box, select everything, paste, and click **Publish**.
   *If the console shows a red error with a line number, don't publish. Send me the message.*
6. Check the app still works: reload Bishop, sign in, open a few pages (Yard, House, Fitness) and the Dev Notes. Nothing should look different.

**If anything breaks:** paste the old rules from the bottom of this file back in and Publish. It takes effect within a minute.

## Testing the new rules (once the app code exists)

The new parts (invites, groups, shares) have no screens yet, so the real test happens during chunks S2–S6 with the two test accounts (`.test-credentials.md`). What each chunk must prove:

| Chunk | The rules must… |
|---|---|
| S2 (people) | accept an invite from account A; let account B redeem it once; refuse a second redeem; refuse an expired code; refuse listing other people's invites |
| S3 (groups) | let A make and edit a group; refuse B reading it |
| S5 / S6 (shares) | let B (in A's "edit" group) read, add and delete items; refuse B deleting the collection record; refuse B writing when only "view"; refuse C (not in any group) reading anything; cut B off the moment A removes B from the group |

## Things the rules force the app to do (so they don't surprise us later)

- **Create the share document first, in its own write,** before writing anything inside it. A rule that checks the guest list looks at the database *before* a batch lands, so a batch that creates the share and its contents together would be refused.
- **Delete the contents before the share document.** Once the share document is gone, nobody (even the owner) is allowed into its contents.
- **Every share must always carry both lists** (`viewerUids`, `editorUids`, even if empty) and every invite must carry `usedBy: null`. A missing field makes a rule fail, which looks like "permission denied".
- **"Shared with me"** looks up shares where you are in `viewerUids` or `editorUids` (two small queries). If Firestore refuses these in testing, the fix is one extra field on the share (`memberUids`, everyone with any access) so there is one simple query.
- Anything in `users/{uid}` can still only be read by that person. A shared item never points at private data in a way that would expose it (decision G9).

## Not covered by these rules (known limits)

- The rules don't check that the people in a group are really your connections. The app only offers connected people, but someone clever with the browser's developer tools could put any user ID in their own group. All that gives them is the ability to share *their own* data with that person.
- A person in the "can edit" list can fill a share with junk. That is the nature of editing; the owner can unshare and the backup taken before the move is the safety net.

## Old rules (for rolling back) — as published on 2026-10-26

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // User-namespaced data — owner-only access
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null
                         && request.auth.uid == userId;
    }

    // Legacy flat collections — any signed-in user (temporary until MU-8)
    match /activities/{d}     { allow read, write: if request.auth != null; }
    match /breakerPanels/{d}  { allow read, write: if request.auth != null; }
    match /calendarEvents/{d} { allow read, write: if request.auth != null; }
    match /chemicals/{d}      { allow read, write: if request.auth != null; }
    match /facts/{d}          { allow read, write: if request.auth != null; }
    match /floorPlans/{d}     { allow read, write: if request.auth != null; }
    match /floors/{d}         { allow read, write: if request.auth != null; }
    match /gpsShapes/{d}      { allow read, write: if request.auth != null; }
    match /photos/{d}         { allow read, write: if request.auth != null; }
    match /plants/{d}         { allow read, write: if request.auth != null; }
    match /problems/{d}       { allow read, write: if request.auth != null; }
    match /projects/{d}       { allow read, write: if request.auth != null; }
    match /rooms/{d}          { allow read, write: if request.auth != null; }
    match /savedActions/{d}   { allow read, write: if request.auth != null; }
    match /settings/{d}       { allow read, write: if request.auth != null; }
    match /subThings/{d}      { allow read, write: if request.auth != null; }
    match /tags/{d}           { allow read, write: if request.auth != null; }
    match /things/{d}         { allow read, write: if request.auth != null; }
    match /weeds/{d}          { allow read, write: if request.auth != null; }
    match /zones/{d}          { allow read, write: if request.auth != null; }
    match /sharedDevNotes/{d} { allow read, write: if request.auth != null; }
    match /sharedDevNotes/{noteId}/photos/{photoId} {
      allow read: if true;
      allow write: if request.auth != null;
    }

  }
}
```
