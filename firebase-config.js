// ========================================
// FIREBASE CONFIGURATION
// ========================================
// ⚠️ IMPORTANT: Replace these values with your own Firebase project credentials
// Setup guide dekho: SETUP-GUIDE.md file mein complete instructions hain

const firebaseConfig = {
    apiKey: "AIzaSyBkkTKAEFBwMx5GrZP7oRR4N1mxC_rfPS0",
    authDomain: "one-click-96526.firebaseapp.com",
    projectId: "one-click-96526",
    storageBucket: "one-click-96526.firebasestorage.app",
    messagingSenderId: "376645007032",
    appId: "1:376645007032:web:55752237584258dd6a64d",
    measurementId: "G-YQFL04GG07",
    databaseURL: "https://one-click-96526-default-rtdb.firebaseio.com" // For online/offline status
};

// Initialize Firebase
try {
    firebase.initializeApp(firebaseConfig);
    console.log("✅ Firebase initialized successfully!");
} catch (error) {
    console.error("❌ Firebase initialization failed:", error);
    alert("Firebase setup error! Please check your configuration.");
}

// Firebase Services
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();
const realtimeDb = firebase.database(); // For presence (online/offline)

// ========================================
// FIRESTORE SETTINGS
// ========================================
db.settings({
    cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED
});

db.enablePersistence()
    .catch((err) => {
        if (err.code == 'failed-precondition') {
            console.warn('Persistence failed: Multiple tabs open');
        } else if (err.code == 'unimplemented') {
            console.warn('Persistence not available in this browser');
        }
    });

// ========================================
// HELPER FUNCTIONS
// ========================================

/**
 * Get current user ID
 */
function getCurrentUserId() {
    return auth.currentUser ? auth.currentUser.uid : null;
}

/**
 * Get current user data
 */
function getCurrentUserData() {
    const user = auth.currentUser;
    if (!user) return null;

    return {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || 'User',
        photoURL: user.photoURL || 'https://via.placeholder.com/40'
    };
}

/**
 * Generate chat room ID (consistent between two users)
 */
function getChatRoomId(userId1, userId2) {
    // Sort user IDs to ensure same room ID regardless of order
    return [userId1, userId2].sort().join('_');
}

/**
 * Format timestamp
 */
function formatTime(timestamp) {
    if (!timestamp) return '';

    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diffInHours = (now - date) / (1000 * 60 * 60);

    if (diffInHours < 24) {
        // Today - show time only
        return date.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    } else if (diffInHours < 48) {
        // Yesterday
        return 'Yesterday';
    } else if (diffInHours < 168) {
        // This week - show day name
        return date.toLocaleDateString('en-US', { weekday: 'short' });
    } else {
        // Older - show date
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
        });
    }
}

/**
 * Update user online status
 */
function updateUserPresence(userId, isOnline) {
    const userStatusRef = realtimeDb.ref(`/status/${userId}`);

    if (isOnline) {
        // Set user as online
        userStatusRef.set({
            state: 'online',
            lastChanged: firebase.database.ServerValue.TIMESTAMP
        });

        // Set up disconnect handler
        userStatusRef.onDisconnect().set({
            state: 'offline',
            lastChanged: firebase.database.ServerValue.TIMESTAMP
        });
    } else {
        // Set user as offline
        userStatusRef.set({
            state: 'offline',
            lastChanged: firebase.database.ServerValue.TIMESTAMP
        });
    }
}

/**
 * Listen to user online status
 */
function listenToUserStatus(userId, callback) {
    const userStatusRef = realtimeDb.ref(`/status/${userId}`);

    userStatusRef.on('value', (snapshot) => {
        const status = snapshot.val();
        callback(status ? status.state === 'online' : false);
    });

    // Return unsubscribe function
    return () => userStatusRef.off('value');
}

// ========================================
// AUTH STATE OBSERVER
// ========================================
auth.onAuthStateChanged((user) => {
    if (user) {
        console.log("✅ User logged in:", user.email);
        updateUserPresence(user.uid, true);

        // Update Firestore user document
        db.collection('users').doc(user.uid).set({
            uid: user.uid,
            email: user.email,
            displayName: user.displayName || 'User',
            photoURL: user.photoURL || 'https://via.placeholder.com/40',
            lastSeen: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

    } else {
        console.log("❌ User logged out");
    }
});

// ========================================
// WINDOW EVENTS (Online/Offline Detection)
// ========================================
window.addEventListener('online', () => {
    const userId = getCurrentUserId();
    if (userId) {
        updateUserPresence(userId, true);
    }
});

window.addEventListener('offline', () => {
    const userId = getCurrentUserId();
    if (userId) {
        updateUserPresence(userId, false);
    }
});

// Clean up on page unload
window.addEventListener('beforeunload', () => {
    const userId = getCurrentUserId();
    if (userId) {
        updateUserPresence(userId, false);
    }
});

console.log("🔥 Firebase configuration loaded!");
