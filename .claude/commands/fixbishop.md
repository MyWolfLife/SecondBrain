---
description: Fix a Bishop dev note by ID. Reads the note from Firestore, understands the issue using the spec/help/code, implements the fix, and marks the note resolved.
argument-hint: <firestore-doc-id>
allowed-tools: [Read, Edit, Write, Glob, Grep, Bash]
---

# /fixbishop — Bishop Dev Note Fix

The user has invoked `/fixbishop $ARGUMENTS`.

## Step 1 — Read the dev note

Start the preview server (`bishop-dev`) and log in with test credentials from memory (`reference_test_account.md`). Then read the dev note from Firestore:

```js
(async () => {
    var doc = await db.collection('sharedDevNotes').doc('$ARGUMENTS').get();
    if (!doc.exists) return 'NOT FOUND';
    var data = doc.data();
    // Also fetch any attached photos from the shared subcollection
    var photoSnap = await db.collection('sharedDevNotes').doc('$ARGUMENTS').collection('photos').orderBy('createdAt', 'asc').get();
    var photos = [];
    photoSnap.forEach(function(p) { photos.push({ id: p.id, imageData: p.data().imageData }); });
    return JSON.stringify({ note: data, photoCount: photos.length, photos: photos });
})()
```

If the result is `'NOT FOUND'`, tell the user: "Dev note `$ARGUMENTS` not found in sharedDevNotes."

If `photoCount > 0`, display each photo using `preview_screenshot` or note to the user that there are N attached photos. To display a photo inline, evaluate:
```js
(function() {
    var img = document.createElement('img');
    img.src = '<imageData>';
    img.style.cssText = 'max-width:600px;max-height:400px;border:1px solid #ccc';
    document.body.appendChild(img);
    return 'photo injected';
})()
```

## Step 2 — Understand the issue

Read the `text` field of the dev note. Then gather context in this order:

1. **`MyLife-Functional-Spec.md`** — find the section that covers the affected feature. This is the source of truth for what the app is supposed to do.
2. **`AppHelp.md`** — find the `## screen:X` section for the affected screen. This is the source of truth for what the UI shows.
3. **`AllPlans.md`** — identify if any plan doc covers this feature area. If one does, scan that plan doc for design rationale or constraints not yet fully in the spec (especially for in-progress features).
4. **Source code** — read the relevant JS file(s) to understand what the code actually does.

## Step 3 — Decide: act or ask

**Act** when the intended behavior is clear from any of: the dev note itself, the spec, the help file, or the code. Examples:
- "The button is the wrong color" → find it and fix it
- "The text box should be moved" and the spec/help says where → move it there
- "This field is missing" and the spec says it should exist → add it

**Ask** only when the intended behavior is genuinely unresolvable from all available context. Example:
- "The text box should be moved" but nothing says where it should go → ask the user

When in doubt, use the spec and help file as the authoritative answer.

## Step 4 — Implement the fix

Make the necessary code changes. This is a real code change — treat it like any other commit.

## Step 5 — Pre-commit checklist (do ALL of these before committing)

1. **Functional Spec** — Did any user-visible behavior change? If yes → update `MyLife-Functional-Spec.md` in the same commit. Tell the user which section(s) changed.
2. **Help Content** — Does this affect a screen with a `## screen:X` section in `AppHelp.md`? If yes → update that section. Tell the user: either "Updated AppHelp — changed X" or "Evaluated AppHelp — no update needed because Y."
3. **Cache busting** — Bump `?v=N` on all changed JS/CSS `<script>`/`<link>` tags in `index.html`. Bump `CACHE_NAME` in `sw.js`.

## Step 6 — Test (when feasible)

For UI or functional changes: verify in the preview server using test credentials. Navigate to the affected screen. If no real data exists, use `preview_eval` to inject mock state. Take a screenshot as proof. Skip this step for changes that can't be exercised in the browser (e.g., pure logic, data migrations).

## Step 7 — Commit

Commit with a clear message describing the fix. Reference the dev note ID in the message.

## Step 8 — Mark the dev note resolved

Update the Firestore document via `preview_eval`:

```js
(async () => {
    await db.collection('sharedDevNotes').doc('$ARGUMENTS').update({
        fixed: true,
        fixedDate: '<today YYYY-MM-DD>',
        fixedNote: '<plain-English description of what was done>'
    });
    return 'marked resolved';
})()
```

## Step 9 — Notify and push

Send the push notification **first**, then immediately push:

```
curl -d "Ready to push — please confirm the Windows prompt" ntfy.sh/WolfLifeBishop && git push
```

Never push without sending this notification first.
