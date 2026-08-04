/**
 * chatService.js
 * ─────────────────────────────────────────────────────────────────
 * All Firebase Realtime Database chat operations.
 * Firestore stays the source of truth for user profiles & certs.
 * Only messages, typing, unread counts and chat metadata live here.
 *
 * RTDB Structure:
 *   messages/{chatId}/{msgId}
 *   chats/{chatId}/lastMessage | lastMessageTime | participants
 *   typing/{chatId}/{userId}/isTyping | timestamp
 *   unread/{userId}/{chatId}/count
 *
 * E2EE NOTE:
 *   New text messages are end-to-end encrypted BEFORE being stored here.
 *   When encryptedPayload is provided, the 'message' field is NOT stored.
 *   Instead, 'ciphertext', 'iv', and 'encrypted: true' are stored.
 *   The plaintext is only reconstructed on the recipient's device.
 *   Legacy messages (encrypted: false/undefined) use the 'message' field.
 * ─────────────────────────────────────────────────────────────────
 */
import { rtdb } from '../firebase';
import {
  ref,
  push,
  set,
  get,
  update,
  onValue,
  query,
  orderByChild,
  increment,
} from 'firebase/database';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';

// ─── Chat ID helper ────────────────────────────────────────────────────────────
/**
 * Canonical chatId = studentId + '_' + mentorId
 * Always ensures one chat room per student–mentor pair.
 */
export function buildChatId(studentId, mentorId) {
  return `${studentId}_${mentorId}`;
}

// ─── Send Message ─────────────────────────────────────────────────────────────
/**
 * Push a new message to RTDB and update chat metadata + unread counter.
 *
 * @param {string} chatId
 * @param {object} opts
 * @param {string} opts.senderId
 * @param {string} opts.receiverId
 * @param {string} opts.senderRole     'student' | 'mentor' | 'admin'
 * @param {string} [opts.message]      Plaintext content (only used for legacy/system/non-text)
 * @param {string} [opts.type]         'text' | 'image' | 'file' | 'certificate'
 * @param {string} [opts.attachmentUrl]
 * @param {string} [opts.fileName]
 * @param {number} [opts.fileSize]
 * @param {object} [opts.certMeta]     Extra cert fields: { certId, certName, score }
 * @param {object} [opts.encryptedPayload]  E2EE payload: { ciphertext, iv }
 *        When provided, ciphertext/iv are stored instead of plaintext message.
 *        The 'message' field is omitted from the RTDB document.
 *        Callers must encrypt BEFORE calling sendMessage — this service never
 *        sees or logs the plaintext when encryptedPayload is supplied.
 */
export async function sendMessage(chatId, {
  senderId,
  receiverId,
  senderRole,
  message = '',
  type = 'text',
  attachmentUrl = null,
  fileName = null,
  fileSize = null,
  certMeta = null,
  encryptedPayload = null, // { ciphertext: string, iv: string } — E2EE fields
}) {
  if (!chatId || !senderId || !receiverId) return null;

  const messagesRef = ref(rtdb, `messages/${chatId}`);
  const newMsgRef = push(messagesRef);
  // Use Date.now() (client timestamp) instead of serverTimestamp():
  //  - Available immediately as a plain number — no server round-trip delay.
  //  - orderByChild('timestamp') works without a deployed RTDB index rule.
  //  - No { ".sv": "timestamp" } placeholder phase in the listener.
  const now = Date.now();

  // Build the RTDB payload.
  // If encryptedPayload is supplied (E2EE path): store ciphertext + iv, NOT plaintext.
  // If not (legacy/system/attachment path): store plaintext message as before.
  const isEncrypted = !!(encryptedPayload?.ciphertext && encryptedPayload?.iv);

  const payload = {
    senderId,
    receiverId,
    senderRole,
    type,
    timestamp: now,
    isRead: false,
    // E2EE fields — present only when message is encrypted
    ...(isEncrypted && {
      encrypted: true,
      ciphertext: encryptedPayload.ciphertext,
      iv: encryptedPayload.iv,
    }),
    // Plaintext field — present only when NOT encrypted (legacy / system / attachments)
    ...(!isEncrypted && { message }),
    ...(attachmentUrl && { attachmentUrl }),
    ...(fileName && { fileName }),
    ...(fileSize && { fileSize }),
    // certMeta is metadata (certId, score, issuer) needed for UI approve/reject buttons.
    // It does not contain private message content, so it is stored unencrypted.
    ...(certMeta && { certMeta }),
  };

  // The lastMessage preview shown in chat list.
  // For encrypted messages we show a generic indicator rather than plaintext.
  const lastMessageText =
    type === 'certificate'
      ? `📄 ${certMeta?.certName || 'Certificate submitted'}`
      : type === 'image'
      ? '📷 Image'
      : type === 'file'
      ? `📎 ${fileName || 'File'}`
      : isEncrypted
      ? '🔒 Encrypted message'
      : message;

  await Promise.all([
    set(newMsgRef, payload),
    update(ref(rtdb, `chats/${chatId}`), {
      lastMessage: lastMessageText,
      lastMessageTime: now,
      [`participants/${senderId}`]: true,
      [`participants/${receiverId}`]: true,
    }),
    update(ref(rtdb, `unread/${receiverId}/${chatId}`), {
      count: increment(1),
    }),
  ]);

  return newMsgRef.key;
}

// ─── Listen to Messages ────────────────────────────────────────────────────────
/**
 * Subscribe to all messages in a chat, ordered by timestamp.
 * Returns an unsubscribe function.
 *
 * @param {string} chatId
 * @param {(messages: Array) => void} callback
 */
export function listenToMessages(chatId, callback) {
  if (!chatId) return () => {};
  const messagesQuery = query(
    ref(rtdb, `messages/${chatId}`),
    orderByChild('timestamp')
  );

  // In Firebase modular SDK, onValue() returns the unsubscribe function.
  // Calling off() on a *different* ref object (base ref ≠ query ref) does NOT
  // remove the listener — so we use the returned unsubscribe directly.
  const unsubscribe = onValue(
    messagesQuery,
    (snap) => {
      const msgs = [];
      snap.forEach((child) => {
        msgs.push({ id: child.key, ...child.val() });
      });
      callback(msgs);
    },
    (error) => {
      console.error(`[chatService] listenToMessages (${chatId}):`, error.message);
      callback([]); // surface empty list so UI doesn't hang
    }
  );

  return unsubscribe;
}

// ─── Mark Messages as Read ────────────────────────────────────────────────────
/**
 * Mark all unread messages received by `userId` in this chat as read,
 * and reset the unread counter.
 *
 * @param {string} chatId
 * @param {string} userId  The user opening the chat (the receiver)
 */
export async function markMessagesRead(chatId, userId) {
  if (!chatId || !userId) return;

  // ── Step 1: Reset the unread badge counter (GUARANTEED) ─────────────────
  // This uses a direct set() on a single path, completely independent of the
  // messages/* rules. A failure here means the user isn't authenticated at all.
  try {
    await set(ref(rtdb, `unread/${userId}/${chatId}/count`), 0);
  } catch (e) {
    // If even this fails the user is unauthenticated — bail out entirely.
    return;
  }

  // ── Step 2: Mark individual messages as read (BEST-EFFORT) ───────────────
  // Separated from the count reset so that any rule evaluation issue on the
  // messages/* paths cannot block the badge from clearing (Step 1 already ran).
  try {
    const snap = await get(ref(rtdb, `messages/${chatId}`));
    if (!snap.exists()) return;

    const updates = {};
    snap.forEach((child) => {
      const msg = child.val();
      if (msg.receiverId === userId && !msg.isRead) {
        updates[`messages/${chatId}/${child.key}/isRead`] = true;
      }
    });

    if (Object.keys(updates).length > 0) {
      await update(ref(rtdb), updates);
    }
  } catch (e) {
    // Non-fatal — the counter was already reset above.
    // This can happen when RTDB rules block the isRead write.
    console.warn('[Chat] markMessagesRead: isRead update skipped:', e.message);
  }
}

// ─── Typing Indicator ─────────────────────────────────────────────────────────
/**
 * Set typing state for a user in a chat.
 *
 * @param {string} chatId
 * @param {string} userId
 * @param {boolean} isTyping
 */
export function setTyping(chatId, userId, isTyping) {
  if (!chatId || !userId) return;
  const typingRef = ref(rtdb, `typing/${chatId}/${userId}`);
  set(typingRef, {
    isTyping,
    timestamp: Date.now(),
  });
}

/**
 * Subscribe to the typing status of a specific user in a chat.
 * Returns an unsubscribe function.
 *
 * @param {string} chatId
 * @param {string} userId  The OTHER user (partner), not self
 * @param {(isTyping: boolean) => void} callback
 */
export function listenToTyping(chatId, userId, callback) {
  if (!chatId || !userId) return () => {};
  const typingRef = ref(rtdb, `typing/${chatId}/${userId}`);

  const unsubscribe = onValue(
    typingRef,
    (snap) => {
      const data = snap.val();
      callback(data?.isTyping === true);
    },
    (error) => {
      console.error('[chatService] listenToTyping:', error.message);
      callback(false);
    }
  );

  return unsubscribe;
}

// ─── Unread Counts ────────────────────────────────────────────────────────────
/**
 * Subscribe to all unread counts for a user across all chats.
 * Returns an unsubscribe function.
 *
 * @param {string} userId
 * @param {(unreadMap: Record<string, number>) => void} callback
 */
export function listenToUnreadCounts(userId, callback) {
  if (!userId) return () => {};
  const unreadRef = ref(rtdb, `unread/${userId}`);

  const unsubscribe = onValue(
    unreadRef,
    (snap) => {
      const map = {};
      if (snap.exists()) {
        snap.forEach((child) => {
          map[child.key] = child.val()?.count || 0;
        });
      }
      callback(map);
    },
    (error) => {
      console.error('[chatService] listenToUnreadCounts:', error.message);
      callback({});
    }
  );

  return unsubscribe;
}

/**
 * Get total unread count across all chats for a user.
 */
export function getTotalUnread(unreadMap) {
  return Object.values(unreadMap).reduce((sum, n) => sum + n, 0);
}

// ─── Listen to Chat List ──────────────────────────────────────────────────────
/**
 * Subscribe to all chat rooms the user participates in.
 * Returns an unsubscribe function.
 *
 * @param {(chats: Array) => void} callback
 */
export function listenToUserChats(chatIds, callback) {
  if (!chatIds || chatIds.length === 0) return () => {};

  const chatMap = {};
  const unsubFns = chatIds.map((chatId) => {
    const chatRef = ref(rtdb, `chats/${chatId}`);
    const unsub = onValue(
      chatRef,
      (snap) => {
        chatMap[chatId] = { id: chatId, ...(snap.val() || {}) };
        callback(Object.values(chatMap));
      },
      (error) => {
        console.error(`[chatService] listenToUserChats (${chatId}):`, error.message);
      }
    );
    return unsub;
  });

  return () => unsubFns.forEach((fn) => fn());
}

// ─── File Upload ──────────────────────────────────────────────────────────────
/**
 * Upload a chat attachment (image / file) to Firebase Storage.
 * Returns the download URL.
 *
 * @param {File} file
 * @param {string} chatId
 * @returns {Promise<{ url: string, fileName: string, fileSize: number }>}
 */
export async function uploadChatAttachment(file, chatId) {
  const storage = getStorage();
  const ts = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `chat-attachments/${chatId}/${ts}_${safeName}`;

  const sRef = storageRef(storage, path);
  await uploadBytes(sRef, file, { contentType: file.type });
  const url = await getDownloadURL(sRef);

  return { url, fileName: file.name, fileSize: file.size };
}

// ─── Initiate Chat (Skill Swap pattern) ──────────────────────────────────────
/**
 * Adapted from Skill Swap's swap-request-accepted flow.
 *
 * Creates the RTDB chat room (participants map) and sends a system welcome
 * message in one go. Call this when an admin assigns a mentor to a student —
 * the equivalent of Skill Swap's "Send Swap Request → accepted → open chat".
 *
 * @param {string} studentId  Firebase UID of the student
 * @param {string} mentorId   Firebase UID of the mentor
 * @param {string} [welcomeText]  Optional override for the system message text
 * @returns {Promise<string | null>}  The new message key, or null on failure
 */
export async function initiateChatMessage(
  studentId,
  mentorId,
  welcomeText = '🎉 You\'ve been paired! Say hello and get started.'
) {
  if (!studentId || !mentorId) return null;

  const chatId = buildChatId(studentId, mentorId);
  const now = Date.now();

  const messagesRef = ref(rtdb, `messages/${chatId}`);
  const newMsgRef = push(messagesRef);

  const payload = {
    senderId: 'system',
    receiverId: studentId,   // system message targets the student
    senderRole: 'system',
    message: welcomeText,
    type: 'system',
    timestamp: now,
    isRead: false,
  };

  await Promise.all([
    set(newMsgRef, payload),
    // Bootstrap the participants map — Skill Swap's approach for room access
    update(ref(rtdb, `chats/${chatId}`), {
      lastMessage: welcomeText,
      lastMessageTime: now,
      [`participants/${studentId}`]: true,
      [`participants/${mentorId}`]: true,
    }),
  ]);

  return newMsgRef.key;
}

