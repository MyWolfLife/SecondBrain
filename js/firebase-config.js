// ============================================================
// Firebase Configuration
// Initializes Firebase and exposes the Firestore database
// ============================================================

// Default (developer) config — used when no user-provided config is stored
const firebaseConfig = {
    apiKey: "AIzaSyAcgyLNK1yzbZEm9hf6FJi-T1U5O1Kwi7k",
    authDomain: "bishop-62d43.firebaseapp.com",
    projectId: "bishop-62d43",
    storageBucket: "bishop-62d43.firebasestorage.app",
    messagingSenderId: "1067248723493",
    appId: "1:1067248723493:web:b8c0bc4bae883407ce81cc"
};

// Check localStorage for a user-provided Firebase config (set via the setup wizard).
// If found, use it instead of the hardcoded default above.
var _userFirebaseConfig = null;
try {
    var _raw = localStorage.getItem('bishopFirebaseConfig');
    if (_raw) _userFirebaseConfig = JSON.parse(_raw);
} catch(e) { console.warn('Could not parse stored Firebase config — using default.'); }

var activeFirebaseConfig = _userFirebaseConfig || firebaseConfig;

// True when the user has set up their own Firebase project
var usingCustomFirebase = !!_userFirebaseConfig;

// Initialize Firebase
firebase.initializeApp(activeFirebaseConfig);

// Get a reference to Firestore — this is what we'll use everywhere to read/write data
const db = firebase.firestore();

// Unlimited local cache size — must be set before any other Firestore call.
// Without this, Firestore can quietly evict old cached data once the cache
// fills up. Offline Trip Mode (js/offline-sync.js) depends on nothing ever
// being evicted, since a trip can last weeks with zero connectivity.
db.settings({ cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED, merge: true });

// Enable offline persistence — Firestore caches data locally so reads work without
// a connection, and writes queue up and sync automatically when reconnected.
firebase.firestore().enablePersistence({ synchronizeTabs: true })
    .catch(function(err) {
        if (err.code === 'unimplemented') {
            console.warn('Offline persistence not supported in this browser.');
        }
    });

// If the device was left in Offline Trip Mode, re-apply that now — disableNetwork()
// is a per-session setting and does not persist across app reloads on its own.
if (localStorage.getItem('bishopOfflineMode') === 'true') {
    firebase.firestore().disableNetwork().catch(function(err) {
        console.warn('Could not re-apply Offline Trip Mode:', err);
    });
}

// Get a reference to Firebase Auth — used by auth.js for login/logout
const auth = firebase.auth();

// Get a reference to Firebase Storage — used by private.js for encrypted document/photo storage
const storage = firebase.storage();

// ============================================================
// userCol() — Per-user Firestore collection helper
//
// Instead of db.collection('things')  →  shared by everyone
// Use    userCol('things')            →  /users/{uid}/things
//
// Reads whoever is currently signed in via Firebase Auth,
// so it works automatically for any user — no hardcoding.
//
// Used by all JS modules after the multi-user refactor (MU-5+).
// ============================================================
function userCol(collectionName) {
    var user = firebase.auth().currentUser;
    if (!user) {
        console.error('userCol() called with no signed-in user');
        // Return a dead-end reference that won't throw but also won't
        // read or write real data — prevents silent cross-user leaks
        return db.collection('__nouser__').doc('__nouser__').collection(collectionName);
    }
    return db.collection('users').doc(user.uid).collection(collectionName);
}

console.log("Firebase initialized successfully. Project:", firebaseConfig.projectId);
