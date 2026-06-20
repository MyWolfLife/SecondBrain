# Bishop PWA Implementation Plan

> **What is a PWA?**
> A Progressive Web App is your existing HTML/CSS/JS app with two additions: a manifest file (so the browser knows it's installable) and a service worker (so it caches files and works offline). No framework, no rewrite, no app store. The app stays exactly where it is — on GitHub Pages.

---

## What Changes and Why

| Change | File | Why |
|--------|------|-----|
| `manifest.json` | New file | Tells the browser the app name, icons, and how to display it when installed |
| App icons | New files (`/icons/`) | Required for install — phone home screen + desktop shortcut |
| Service worker | `sw.js` (new) | Caches static assets so app loads offline; handles cache updates on deploy |
| SW registration | `js/app.js` | Registers the service worker on first load |
| Offline persistence | `js/firebase-config.js` | One line enables Firestore to queue reads/writes while offline and sync on reconnect |
| Offline banner | `index.html` / `css/styles.css` | Visual indicator when user is offline |
| Install prompt | `index.html` / `js/app.js` | Custom "Install App" button so users don't have to find the browser's install option |
| `index.html` manifest link | `index.html` | Links the manifest so browsers detect it |

---

## Phases

---

### Phase 1 — Foundation (Installable App)
**Goal:** The app can be installed on a phone or desktop from the browser. No offline yet, but it opens in its own window with no browser chrome.

**Effort:** ~3–4 hours

#### Code changes:
1. Create `/icons/` folder with app icons in these sizes:
   - `icon-192.png` (required)
   - `icon-512.png` (required)
   - `icon-maskable-512.png` (for Android adaptive icons)
   - Recommend: start with one square logo image and resize

2. Create `manifest.json` in the root:
   ```json
   {
     "name": "Bishop Life Tracker",
     "short_name": "Bishop",
     "description": "Track your yard, home, vehicles, thoughts, and life.",
     "start_url": "/SecondBrain/",
     "scope": "/SecondBrain/",
     "display": "standalone",
     "orientation": "any",
     "background_color": "#ffffff",
     "theme_color": "#16a34a",
     "icons": [
       { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
       { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
       { "src": "icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
     ]
   }
   ```

3. Add to `<head>` in `index.html`:
   ```html
   <link rel="manifest" href="manifest.json">
   <meta name="theme-color" content="#16a34a">
   <meta name="apple-mobile-web-app-capable" content="yes">
   <meta name="apple-mobile-web-app-status-bar-style" content="default">
   <meta name="apple-mobile-web-app-title" content="Bishop">
   <link rel="apple-touch-icon" href="icons/icon-192.png">
   ```

4. Register a minimal service worker in `js/app.js`:
   ```javascript
   if ('serviceWorker' in navigator) {
     navigator.serviceWorker.register('/SecondBrain/sw.js');
   }
   ```

5. Create `sw.js` (minimal — just enough to satisfy PWA install requirements):
   ```javascript
   self.addEventListener('install', function(e) { self.skipWaiting(); });
   self.addEventListener('activate', function(e) { self.clients.claim(); });
   self.addEventListener('fetch', function(e) { /* pass-through for now */ });
   ```

#### What the developer does:
- [ ] Design or find a square app icon (at least 512×512 px, simple, recognizable)
- [ ] Resize to required sizes and save to `/icons/`
- [ ] Create `manifest.json`
- [ ] Edit `index.html` (add manifest link + meta tags)
- [ ] Create `sw.js`
- [ ] Edit `js/app.js` (add service worker registration)
- [ ] Deploy to GitHub Pages (standard `git push`)
- [ ] Test install on phone (see user instructions below)

#### What the user does to install (Android — Chrome):
1. Open the app in Chrome on your phone
2. A banner may appear at the bottom: **"Add Bishop to Home Screen"** — tap it
3. If no banner: tap the 3-dot menu → **"Add to Home Screen"** → **"Install"**
4. Bishop icon appears on your home screen
5. Tap it — opens full screen, no browser bar, looks like a real app

#### What the user does to install (iPhone — Safari):
> Note: iPhone requires Safari specifically — Chrome on iOS cannot install PWAs
1. Open the app in **Safari** on your iPhone
2. Tap the **Share button** (box with arrow pointing up)
3. Scroll down and tap **"Add to Home Screen"**
4. Tap **"Add"** in the top right
5. Bishop icon appears on your home screen

#### What the user does to install (Windows — Chrome or Edge):
1. Open the app in Chrome or Edge
2. Look for the **install icon** in the address bar (looks like a computer with a down arrow)
3. Click it → click **"Install"**
4. Bishop opens in its own window and appears in your Start Menu

#### What the user does to install (Mac — Chrome):
1. Open the app in Chrome
2. Click the install icon in the address bar
3. Click **"Install"**
4. Bishop opens in its own window and appears in your Dock / Applications

---

### Phase 2 — Offline Capability
**Goal:** The app loads even with no internet. Firestore queues writes while offline and syncs when reconnected. A banner tells the user when they're offline.

**Effort:** ~4–6 hours

#### Code changes:

1. **Enable Firestore offline persistence** in `js/firebase-config.js`:
   ```javascript
   firebase.firestore().enablePersistence({ synchronizeTabs: true })
     .catch(function(err) {
       if (err.code === 'unimplemented') {
         console.warn('Offline persistence not supported in this browser.');
       }
     });
   ```
   That's it. Firestore handles the rest — reads come from cache, writes queue locally and sync automatically.

2. **Expand the service worker** (`sw.js`) to cache all static assets:
   ```javascript
   var CACHE_NAME = 'bishop-v1';
   var STATIC_ASSETS = [
     '/SecondBrain/',
     '/SecondBrain/index.html',
     '/SecondBrain/css/styles.css',
     '/SecondBrain/js/app.js',
     // ... all JS files
   ];

   self.addEventListener('install', function(e) {
     e.waitUntil(caches.open(CACHE_NAME).then(function(cache) {
       return cache.addAll(STATIC_ASSETS);
     }));
     self.skipWaiting();
   });

   self.addEventListener('activate', function(e) {
     e.waitUntil(caches.keys().then(function(keys) {
       return Promise.all(keys.filter(function(k) { return k !== CACHE_NAME; }).map(function(k) { return caches.delete(k); }));
     }));
     self.clients.claim();
   });

   self.addEventListener('fetch', function(e) {
     e.respondWith(caches.match(e.request).then(function(cached) {
       return cached || fetch(e.request);
     }));
   });
   ```

3. **Add offline/online banner** to `index.html` and `css/styles.css`

4. **Handle cache busting on deploy**: Increment `CACHE_NAME` version in `sw.js` with each deploy (e.g., `bishop-v2`, `bishop-v3`) — this triggers the service worker to re-cache all updated files.

#### What the developer does:
- [ ] Add `enablePersistence()` to `firebase-config.js`
- [ ] Expand `sw.js` with full asset list and cache logic
- [ ] Add offline banner HTML/CSS
- [ ] Test: turn on airplane mode, reload app, verify it loads
- [ ] Test: go offline, make a change, go back online, verify it synced
- [ ] Remember to bump `CACHE_NAME` version on every deploy going forward

#### What the user does:
- Nothing extra — offline just works once deployed. If you see the offline banner, your changes are being saved locally and will sync when you reconnect.

---

### Phase 3 — Install Experience Polish
**Goal:** Users don't have to hunt for the browser's install option. A friendly prompt appears in the app itself.

**Effort:** ~2–3 hours

#### Code changes:

1. Catch the install prompt event in `js/app.js`:
   ```javascript
   var _pwaInstallPrompt = null;
   window.addEventListener('beforeinstallprompt', function(e) {
     e.preventDefault();
     _pwaInstallPrompt = e;
     document.getElementById('pwaInstallBanner').style.display = 'flex';
   });
   ```

2. Add a dismissable install banner to `index.html` (appears at top of home screen)

3. Handle post-install event:
   ```javascript
   window.addEventListener('appinstalled', function() {
     document.getElementById('pwaInstallBanner').style.display = 'none';
     _pwaInstallPrompt = null;
   });
   ```

4. Add iOS-specific install instructions (iOS doesn't fire `beforeinstallprompt` — need to detect Safari on iOS and show a manual tip instead)

#### What the developer does:
- [ ] Add install banner HTML/CSS/JS
- [ ] Test on Android (banner should appear automatically)
- [ ] Test on iOS (manual Share → Add to Home Screen tip should appear)
- [ ] Test on desktop Chrome/Edge (banner appears)
- [ ] Test dismissal (banner goes away, doesn't reappear that session)

---

### Phase 4 — Multi-User Firebase Setup
**Goal:** Friends can use Bishop with their own Firebase project and their own storage. No shared quota. No photo abuse risk.

**Effort:** ~1–2 days (code) + documentation writing

> This is the most complex phase. Consider skipping it if you're the only user for now.

#### The problem:
Right now the Firebase project is hardcoded in `firebase-config.js`. Everyone would share your Firestore quota and your photo storage.

#### The solution:
A first-run setup screen where the user pastes their Firebase config. The app stores it in `localStorage` and uses it instead of the hardcoded config.

#### Code changes:

1. `firebase-config.js` checks `localStorage` for a user-provided config before falling back to the default (your personal config for your own use)

2. New `#setup` route and page — a one-time wizard shown on first launch:
   - Step 1: Explains what Firebase is and links to the sign-up page
   - Step 2: Shows exactly where to find the config in the Firebase console (with screenshots in the docs)
   - Step 3: Paste the config JSON → validate → save to `localStorage`
   - Step 4: Done — redirects to login screen

3. Settings page gets a "Firebase Config" section — lets users re-enter or clear their config

#### What the developer does:
- [ ] Build the setup wizard page
- [ ] Modify `firebase-config.js` to check `localStorage` first
- [ ] Write setup documentation (see below)
- [ ] Test with a second Firebase project to confirm isolation
- [ ] Test photo storage limits per-project

#### What a new user does (Step-by-step setup guide):

**Step 1: Create a Google account** (if they don't have one)
- Go to accounts.google.com → Create account

**Step 2: Set up Firebase**
1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Click **"Create a project"**
3. Name it anything (e.g., "My Bishop App")
4. Disable Google Analytics (not needed) → **"Create project"**

**Step 3: Enable Firestore**
1. In the left sidebar, click **"Build"** → **"Firestore Database"**
2. Click **"Create database"**
3. Choose **"Start in production mode"** → **Next**
4. Pick your region (choose the closest to you) → **"Enable"**

**Step 4: Enable Authentication**
1. In the left sidebar, click **"Build"** → **"Authentication"**
2. Click **"Get started"**
3. Click **"Email/Password"** → toggle it **On** → **Save**

**Step 5: Get your config**
1. Click the gear icon (⚙️) → **"Project settings"**
2. Scroll down to **"Your apps"** → click the **</>** (web) icon
3. Name the app anything → click **"Register app"**
4. Copy the `firebaseConfig` object shown on screen

**Step 6: Paste into Bishop**
1. Open Bishop in your browser
2. You'll see the setup screen — paste your config
3. Click **"Save & Continue"**
4. Create your login email and password
5. You're in — your data is 100% yours, on your own Firebase account

**Storage limits (Firebase free tier):**
- 1 GB Firestore storage (plenty for normal use)
- 50,000 reads/day, 20,000 writes/day
- If you hit limits: Firebase Blaze plan is pay-as-you-go, typically < $1/month for personal use

---

### Phase 5 — Notifications (Optional, Future)
**Goal:** Bishop can send reminders for calendar events and scheduled tasks.

**Effort:** ~1 day

This uses the Web Push API + Firebase Cloud Messaging (FCM). The user grants notification permission, and the app can send reminders even when the browser is closed.

> **Note:** This requires a server-side component or Firebase Functions to trigger notifications. It takes Bishop out of "pure static site" territory. Evaluate when calendar reminders become a real need.

---

## Summary Timeline

| Phase | What You Get | Effort |
|-------|-------------|--------|
| Phase 1 | Installable app icon, standalone window, no browser chrome | 3–4 hrs |
| Phase 2 | True offline support, Firestore sync, offline banner | 4–6 hrs |
| Phase 3 | In-app install prompt, iOS tip, polish | 2–3 hrs |
| Phase 4 | Multi-user, each person's own Firebase | 1–2 days + docs |
| Phase 5 | Push notifications for calendar | 1 day (future) |

---

## Notes for the Developer

- **GitHub Pages is fine** — it serves over HTTPS which is required for PWAs and service workers. No hosting change needed.
- **`sw.js` must live at the root** — it must be at `/SecondBrain/sw.js`, not in `/js/`. Scope is determined by its location.
- **Bump the cache version on every deploy** — after Phase 2, remember to update `CACHE_NAME` in `sw.js` each time you push a change. Otherwise users get stale files.
- **iOS is the tricky one** — Apple's PWA support is improving but still behind Android/Chrome. The install flow (Share → Add to Home Screen) is manual and not as smooth. Nothing you can fix — it's Apple's limitation.
- **Avalonia is not the answer** — it would require a full rewrite in C# and abandons the cross-device web model that makes Bishop accessible on any device without installation.
