// ========================================
// CHAT APP - MAIN JAVASCRIPT
// ========================================

// Global Variables
let currentUserId = null;
let currentChatUserId = null;
let unsubscribeMessages = null;
let mediaRecorder = null;
let audioChunks = [];
let recordingStartTime = null;
let recordingInterval = null;

// DOM Elements
const loginScreen = document.getElementById('login-screen');
const chatScreen = document.getElementById('chat-screen');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const displayNameInput = document.getElementById('display-name');
const loginBtn = document.getElementById('login-btn');
const signupBtn = document.getElementById('signup-btn');
const logoutBtn = document.getElementById('logout-btn');
const usersList = document.getElementById('users-list');
const messagesContainer = document.getElementById('messages-container');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const emojiBtn = document.getElementById('emoji-btn');
const voiceBtn = document.getElementById('voice-btn');
const emojiPickerContainer = document.getElementById('emoji-picker-container');
const emojiPicker = document.getElementById('emoji-picker');
const chatUserHeader = document.getElementById('chat-user-header');
const messageInputArea = document.getElementById('message-input-area');
const voiceRecordingUI = document.getElementById('voice-recording-ui');
const normalInput = document.getElementById('normal-input');
const recordingTime = document.getElementById('recording-time');
const cancelRecordingBtn = document.getElementById('cancel-recording');
const sendVoiceBtn = document.getElementById('send-voice');

// ========================================
// AUTHENTICATION
// ========================================

// Check auth state
auth.onAuthStateChanged((user) => {
    if (user) {
        currentUserId = user.uid;
        showChatScreen();
        loadUsers();
        updateCurrentUserUI(user);
    } else {
        currentUserId = null;
        showLoginScreen();
    }
});

// Login
loginBtn.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    if (!email || !password) {
        alert('Please enter email and password');
        return;
    }

    try {
        await auth.signInWithEmailAndPassword(email, password);
    } catch (error) {
        alert('Login failed: ' + error.message);
    }
});

// Sign Up
signupBtn.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();
    const displayName = displayNameInput.value.trim();

    if (!email || !password || !displayName) {
        alert('Please fill all fields');
        return;
    }

    if (password.length < 6) {
        alert('Password should be at least 6 characters');
        return;
    }

    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);

        // Update profile
        await userCredential.user.updateProfile({
            displayName: displayName
        });

        // Create user document
        await db.collection('users').doc(userCredential.user.uid).set({
            uid: userCredential.user.uid,
            email: email,
            displayName: displayName,
            photoURL: 'https://via.placeholder.com/40',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        alert('Account created successfully!');
    } catch (error) {
        alert('Signup failed: ' + error.message);
    }
});

// Logout
logoutBtn.addEventListener('click', async () => {
    if (confirm('Are you sure you want to logout?')) {
        await auth.signOut();
    }
});

// ========================================
// UI MANAGEMENT
// ========================================

function showLoginScreen() {
    loginScreen.classList.add('active');
    chatScreen.classList.remove('active');
}

function showChatScreen() {
    loginScreen.classList.remove('active');
    chatScreen.classList.add('active');
}

function updateCurrentUserUI(user) {
    document.getElementById('current-user-name').textContent = user.displayName || 'User';
    document.getElementById('current-user-avatar').src = user.photoURL || 'https://via.placeholder.com/40';
}

// ========================================
// LOAD USERS LIST
// ========================================

function loadUsers() {
    db.collection('users')
        .where('uid', '!=', currentUserId)
        .onSnapshot((snapshot) => {
            usersList.innerHTML = '';

            if (snapshot.empty) {
                usersList.innerHTML = '<div class="empty-state"><p>No users found</p></div>';
                return;
            }

            snapshot.forEach((doc) => {
                const userData = doc.data();
                createUserItem(userData);
            });
        });
}

function createUserItem(userData) {
    const userItem = document.createElement('div');
    userItem.className = 'user-item';
    userItem.dataset.userId = userData.uid;

    userItem.innerHTML = `
        <img class="avatar" src="${userData.photoURL || 'https://via.placeholder.com/40'}" alt="${userData.displayName}">
        <div class="user-item-info">
            <div class="user-item-name">${userData.displayName}</div>
            <div class="user-item-last-msg">Tap to chat</div>
        </div>
        <span class="user-item-status" id="status-${userData.uid}"></span>
    `;

    userItem.addEventListener('click', () => {
        selectUser(userData);
    });

    usersList.appendChild(userItem);

    // Listen to user's online status
    listenToUserStatus(userData.uid, (isOnline) => {
        const statusDot = document.getElementById(`status-${userData.uid}`);
        if (statusDot) {
            statusDot.className = isOnline ? 'user-item-status online' : 'user-item-status';
        }
    });
}

// ========================================
// SELECT USER & LOAD CHAT
// ========================================

function selectUser(userData) {
    currentChatUserId = userData.uid;

    // Update UI
    document.querySelectorAll('.user-item').forEach(item => {
        item.classList.remove('active');
    });
    document.querySelector(`[data-user-id="${userData.uid}"]`)?.classList.add('active');

    // Show chat header and input
    chatUserHeader.style.display = 'flex';
    messageInputArea.style.display = 'block';

    // Update chat header
    document.getElementById('chat-user-name').textContent = userData.displayName;
    document.getElementById('chat-user-avatar').src = userData.photoURL || 'https://via.placeholder.com/40';

    // Update online status
    listenToUserStatus(userData.uid, (isOnline) => {
        const statusIndicator = document.getElementById('chat-user-status');
        if (isOnline) {
            statusIndicator.innerHTML = '<span class="status-dot"></span><span class="status-text">online</span>';
            statusIndicator.classList.add('online');
        } else {
            statusIndicator.innerHTML = '<span class="status-dot"></span><span class="status-text">offline</span>';
            statusIndicator.classList.remove('online');
        }
    });

    // Load messages
    loadMessages(userData.uid);

    // Mark messages as seen
    markMessagesAsSeen(userData.uid);
}

// ========================================
// MESSAGES - SEND & RECEIVE
// ========================================

function loadMessages(otherUserId) {
    // Unsubscribe from previous chat
    if (unsubscribeMessages) {
        unsubscribeMessages();
    }

    // Clear messages
    messagesContainer.innerHTML = '';

    const chatRoomId = getChatRoomId(currentUserId, otherUserId);

    // Listen to messages
    unsubscribeMessages = db.collection('chats')
        .doc(chatRoomId)
        .collection('messages')
        .orderBy('timestamp', 'asc')
        .onSnapshot((snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added') {
                    displayMessage(change.doc.data(), change.doc.id);
                }

                if (change.type === 'modified') {
                    updateMessageStatus(change.doc.id, change.doc.data());
                }
            });

            // Scroll to bottom
            scrollToBottom();
        });
}

function displayMessage(messageData, messageId) {
    const isOwnMessage = messageData.senderId === currentUserId;

    const messageDiv = document.createElement('div');
    messageDiv.className = isOwnMessage ? 'message sent' : 'message received';
    messageDiv.id = `msg-${messageId}`;

    let messageContent = '';

    if (messageData.type === 'text') {
        messageContent = `<div class="message-text">${escapeHtml(messageData.text)}</div>`;
    } else if (messageData.type === 'voice') {
        messageContent = `
            <div class="voice-message">
                <button class="voice-play-btn" onclick="playVoiceMessage('${messageData.voiceUrl}', this)">▶️</button>
                <div class="voice-waveform"></div>
                <span class="voice-duration">${messageData.duration || '0:00'}</span>
            </div>
        `;
    }

    const statusIcon = isOwnMessage ? getStatusIcon(messageData.status) : '';

    messageDiv.innerHTML = `
        <div class="message-bubble">
            ${messageContent}
            <div class="message-footer">
                <span class="message-time">${formatTime(messageData.timestamp)}</span>
                ${statusIcon}
            </div>
        </div>
    `;

    messagesContainer.appendChild(messageDiv);
}

function getStatusIcon(status) {
    if (status === 'sent') {
        return '<span class="message-status">✓</span>';
    } else if (status === 'delivered') {
        return '<span class="message-status delivered">✓✓</span>';
    } else if (status === 'seen') {
        return '<span class="message-status seen">✓✓</span>';
    }
    return '';
}

function updateMessageStatus(messageId, messageData) {
    const messageElement = document.getElementById(`msg-${messageId}`);
    if (messageElement) {
        const statusElement = messageElement.querySelector('.message-status');
        if (statusElement && messageData.senderId === currentUserId) {
            statusElement.outerHTML = getStatusIcon(messageData.status);
        }
    }
}

// Send Message
sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

async function sendMessage() {
    const text = messageInput.value.trim();

    if (!text || !currentChatUserId) return;

    const chatRoomId = getChatRoomId(currentUserId, currentChatUserId);

    try {
        await db.collection('chats')
            .doc(chatRoomId)
            .collection('messages')
            .add({
                text: text,
                type: 'text',
                senderId: currentUserId,
                receiverId: currentChatUserId,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                status: 'sent'
            });

        messageInput.value = '';

        // Update last message in chat room
        await db.collection('chats').doc(chatRoomId).set({
            participants: [currentUserId, currentChatUserId],
            lastMessage: text,
            lastMessageTime: firebase.firestore.FieldValue.serverTimestamp(),
            lastMessageSenderId: currentUserId
        }, { merge: true });

    } catch (error) {
        console.error('Error sending message:', error);
        alert('Failed to send message');
    }
}

// Mark messages as delivered/seen
async function markMessagesAsSeen(otherUserId) {
    const chatRoomId = getChatRoomId(currentUserId, otherUserId);

    const messagesRef = db.collection('chats')
        .doc(chatRoomId)
        .collection('messages')
        .where('receiverId', '==', currentUserId)
        .where('status', '!=', 'seen');

    const snapshot = await messagesRef.get();

    const batch = db.batch();

    snapshot.forEach((doc) => {
        batch.update(doc.ref, { status: 'seen' });
    });

    if (!snapshot.empty) {
        await batch.commit();
    }
}

// ========================================
// EMOJI PICKER
// ========================================

emojiBtn.addEventListener('click', () => {
    emojiPickerContainer.style.display =
        emojiPickerContainer.style.display === 'none' ? 'block' : 'none';
});

// Close emoji picker when clicking outside
document.addEventListener('click', (e) => {
    if (!emojiBtn.contains(e.target) && !emojiPickerContainer.contains(e.target)) {
        emojiPickerContainer.style.display = 'none';
    }
});

// Handle emoji selection
emojiPicker.addEventListener('emoji-click', (event) => {
    messageInput.value += event.detail.unicode;
    messageInput.focus();
    emojiPickerContainer.style.display = 'none';
});

// ========================================
// VOICE MESSAGES
// ========================================

voiceBtn.addEventListener('click', startVoiceRecording);
cancelRecordingBtn.addEventListener('click', cancelVoiceRecording);
sendVoiceBtn.addEventListener('click', sendVoiceMessage);

async function startVoiceRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };

        mediaRecorder.start();
        recordingStartTime = Date.now();

        // Show recording UI
        normalInput.style.display = 'none';
        voiceRecordingUI.style.display = 'flex';

        // Start timer
        recordingInterval = setInterval(updateRecordingTime, 1000);

    } catch (error) {
        console.error('Error accessing microphone:', error);
        alert('Could not access microphone. Please allow microphone access.');
    }
}

function updateRecordingTime() {
    const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    recordingTime.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function cancelVoiceRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }

    clearInterval(recordingInterval);
    audioChunks = [];

    // Hide recording UI
    voiceRecordingUI.style.display = 'none';
    normalInput.style.display = 'flex';
    recordingTime.textContent = '0:00';
}

async function sendVoiceMessage() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();

        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            const duration = Math.floor((Date.now() - recordingStartTime) / 1000);

            // Upload to Firebase Storage
            try {
                const fileName = `voice_${Date.now()}.webm`;
                const storageRef = storage.ref(`voice-messages/${currentUserId}/${fileName}`);

                await storageRef.put(audioBlob);
                const voiceUrl = await storageRef.getDownloadURL();

                // Send voice message
                const chatRoomId = getChatRoomId(currentUserId, currentChatUserId);

                await db.collection('chats')
                    .doc(chatRoomId)
                    .collection('messages')
                    .add({
                        type: 'voice',
                        voiceUrl: voiceUrl,
                        duration: `${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}`,
                        senderId: currentUserId,
                        receiverId: currentChatUserId,
                        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                        status: 'sent'
                    });

                // Clean up
                cancelVoiceRecording();

            } catch (error) {
                console.error('Error sending voice message:', error);
                alert('Failed to send voice message');
                cancelVoiceRecording();
            }
        };
    }
}

// Play voice message
function playVoiceMessage(url, button) {
    const audio = new Audio(url);

    button.textContent = '⏸️';
    audio.play();

    audio.onended = () => {
        button.textContent = '▶️';
    };

    button.onclick = () => {
        if (audio.paused) {
            audio.play();
            button.textContent = '⏸️';
        } else {
            audio.pause();
            button.textContent = '▶️';
        }
    };
}

// ========================================
// UTILITY FUNCTIONS
// ========================================

function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ========================================
// INITIALIZATION
// ========================================

console.log('✅ Chat app initialized!');
