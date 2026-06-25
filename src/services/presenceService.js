/**
 * presenceService.js
 * ─────────────────────────────────────────────────────────────────
 * Manages online/offline presence using Firebase RTDB's onDisconnect API.
 * Call initPresence(uid) once after login; the disconnect handler
 * automatically sets the user offline when the tab/browser closes.
 * ─────────────────────────────────────────────────────────────────
 */
import { rtdb } from '../firebase';
import {
  ref,
  set,
  onValue,
  onDisconnect,
} from 'firebase/database';

/**
 * Initialise presence for the currently-logged-in user.
 * Should be called once, right after the user document is confirmed in Firestore.
 *
 * @param {string} uid  Firebase Auth UID
 * @param {string} [profilePic] Optional avatar URL to store for partner display
 */
export function initPresence(uid, profilePic = '') {
  if (!uid) return;

  const userStatusRef = ref(rtdb, `users/${uid}`);

  const onlineData = {
    online: true,
    lastSeen: Date.now(),
    profilePic: profilePic || '',
  };

  const offlineData = {
    online: false,
    lastSeen: Date.now(),
    profilePic: profilePic || '',
  };

  // Register what to write when connection drops
  onDisconnect(userStatusRef).set(offlineData);

  // Mark user as online right now
  set(userStatusRef, onlineData);
}

/**
 * Subscribe to a user's online presence.
 * Returns an unsubscribe function — call it on component unmount.
 *
 * @param {string} uid
 * @param {(data: { online: boolean, lastSeen: number, profilePic: string }) => void} callback
 * @returns {() => void} unsubscribe
 */
export function watchPresence(uid, callback) {
  if (!uid) return () => {};
  const userStatusRef = ref(rtdb, `users/${uid}`);
  // Use the returned unsubscribe fn — off() on the same ref also works
  // but modular SDK's returned function is the recommended approach.
  const unsubscribe = onValue(
    userStatusRef,
    (snap) => {
      callback(snap.val() || { online: false, lastSeen: null });
    },
    (error) => {
      console.error('[presenceService] watchPresence:', error.message);
      callback({ online: false, lastSeen: null });
    }
  );
  return unsubscribe;
}

/**
 * One-shot read: is this user currently online?
 * Useful for the initial render before the live subscription fires.
 */
export function watchMultiPresence(uids, callback) {
  if (!uids || uids.length === 0) return () => {};

  const presenceMap = {};
  const unsubFns = uids.map((uid) =>
    watchPresence(uid, (data) => {
      presenceMap[uid] = data;
      callback({ ...presenceMap });
    })
  );

  return () => unsubFns.forEach((fn) => fn());
}
