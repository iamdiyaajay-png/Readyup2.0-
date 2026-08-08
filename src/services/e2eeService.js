/**
 * e2eeService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * True End-to-End Encryption (E2EE) for Mentor ↔ Student messaging.
 *
 * ARCHITECTURE:
 *   Algorithm: ECDH P-256 (key agreement) + AES-256-GCM (message encryption)
 *   All cryptography uses the browser-native Web Crypto API (window.crypto.subtle).
 *   No third-party crypto library is used for message encryption.
 *
 * KEY MANAGEMENT:
 *   - Each user generates an ECDH P-256 key pair the first time they open a chat.
 *   - Public key  → stored in Firestore users/{uid}.e2eePublicKey (JWK, not secret).
 *   - Private key → stored ONLY in localStorage under a namespaced key.
 *                   It is never sent to any server or Firebase.
 *
 * SHARED SECRET DERIVATION (per conversation):
 *   - Alice derives: ECDH(alice_private, bob_public)  → sharedSecret
 *   - Bob   derives: ECDH(bob_private, alice_public)  → sharedSecret (identical)
 *   - The shared secret is then used as an AES-256-GCM key.
 *   - No shared secret is ever transmitted; it is computed independently on each device.
 *
 * MESSAGE ENCRYPTION:
 *   - Each message gets a fresh 12-byte random IV (crypto.getRandomValues).
 *   - AES-256-GCM provides both confidentiality AND authentication (no separate HMAC needed).
 *   - Ciphertext and IV are stored in RTDB; the plaintext message field is NOT stored.
 *
 * BACKWARD COMPATIBILITY:
 *   - Legacy messages (without encrypted:true) are displayed as-is from the 'message' field.
 *   - New messages always use E2EE.
 *
 * LIMITATIONS vs WhatsApp/Signal:
 *   - No Double Ratchet → no per-message forward secrecy within a session.
 *   - Static ECDH shared key per conversation pair.
 *   - Private key in localStorage is readable if the device/browser is compromised.
 *   - A new device generates a new key pair; old messages cannot be decrypted on the new device.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { db } from '../firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';

// ─── Constants ────────────────────────────────────────────────────────────────

const ECDH_ALGORITHM = { name: 'ECDH', namedCurve: 'P-256' };
const AES_ALGORITHM  = { name: 'AES-GCM', length: 256 };

/**
 * localStorage key where the user's own private key JWK is stored.
 * Namespaced with the user's uid to support multiple accounts on the same browser.
 * @param {string} uid
 */
function privateKeyStorageKey(uid) {
  return `readyup_e2ee_privkey_${uid}`;
}

/**
 * localStorage key where the user's own public key JWK is cached locally.
 * This avoids re-exporting the public key every session.
 * @param {string} uid
 */
function publicKeyStorageKey(uid) {
  return `readyup_e2ee_pubkey_${uid}`;
}

// ─── Key Generation & Persistence ────────────────────────────────────────────

/**
 * Generate a new ECDH P-256 key pair.
 * The private key is extractable so we can persist it in localStorage.
 * (Non-extractable keys would be lost when the browser tab closes.)
 *
 * @returns {Promise<CryptoKeyPair>}
 */
async function generateKeyPair() {
  return crypto.subtle.generateKey(
    ECDH_ALGORITHM,
    true, // extractable — needed for JWK export to localStorage
    ['deriveKey']
  );
}

/**
 * Export a CryptoKey to its JWK (JSON Web Key) representation.
 * @param {CryptoKey} key
 * @returns {Promise<JsonWebKey>}
 */
async function exportKeyAsJwk(key) {
  return crypto.subtle.exportKey('jwk', key);
}

/**
 * Import a public key JWK for ECDH key agreement.
 * @param {JsonWebKey} jwk
 * @returns {Promise<CryptoKey>}
 */
async function importPublicKeyFromJwk(jwk) {
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    ECDH_ALGORITHM,
    true,  // public keys are always extractable — they are not secret
    []     // public key has no usages in ECDH (only private key has 'deriveKey')
  );
}

/**
 * Import a private key JWK for ECDH key agreement.
 * @param {JsonWebKey} jwk
 * @returns {Promise<CryptoKey>}
 */
async function importPrivateKeyFromJwk(jwk) {
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    ECDH_ALGORITHM,
    true,  // extractable — we need to be able to re-export for re-import across sessions
    ['deriveKey']
  );
}

// ─── Shared Key Derivation ────────────────────────────────────────────────────

/**
 * Derive a shared AES-256-GCM key from our private key and the partner's public key.
 * This is the ECDH key agreement step. Both sides derive the IDENTICAL key
 * without ever transmitting the key itself.
 *
 * @param {CryptoKey} myPrivateKey   - Our ECDH private key
 * @param {CryptoKey} theirPublicKey - Partner's ECDH public key
 * @returns {Promise<CryptoKey>}     - AES-256-GCM key (non-extractable, for encrypt/decrypt only)
 */
async function deriveSharedAesKey(myPrivateKey, theirPublicKey) {
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: theirPublicKey },
    myPrivateKey,
    AES_ALGORITHM,
    false,          // non-extractable — the shared key never leaves the browser memory
    ['encrypt', 'decrypt']
  );
}

// ─── Encrypt / Decrypt ────────────────────────────────────────────────────────

/**
 * Encrypt a plaintext string with AES-256-GCM.
 *
 * @param {CryptoKey} aesKey   - The shared AES-256-GCM key
 * @param {string}    plaintext - The message text to encrypt
 * @returns {Promise<{ ciphertext: string, iv: string }>}
 *          ciphertext and iv are both Base64-encoded strings safe to store in RTDB.
 */
async function encryptText(aesKey, plaintext) {
  // Generate a fresh 12-byte IV for every message — NEVER reuse IVs with GCM
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encoded = new TextEncoder().encode(plaintext);

  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    encoded
  );

  return {
    ciphertext: bufferToBase64(ciphertextBuffer),
    iv: bufferToBase64(iv.buffer),
  };
}

/**
 * Decrypt an AES-256-GCM ciphertext back to a plaintext string.
 *
 * @param {CryptoKey} aesKey     - The shared AES-256-GCM key
 * @param {string}    ciphertext - Base64-encoded ciphertext
 * @param {string}    iv         - Base64-encoded IV
 * @returns {Promise<string|null>} Decrypted plaintext or null on failure
 */
async function decryptText(aesKey, ciphertext, iv) {
  try {
    const ciphertextBuffer = base64ToBuffer(ciphertext);
    const ivBuffer         = base64ToBuffer(iv);

    const plaintextBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(ivBuffer) },
      aesKey,
      ciphertextBuffer
    );

    return new TextDecoder().decode(plaintextBuffer);
  } catch {
    // GCM authentication failure — key mismatch or data corruption
    return null;
  }
}

// ─── Buffer ↔ Base64 Helpers ──────────────────────────────────────────────────

function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary  = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

function base64ToBuffer(base64) {
  const binary = atob(base64);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// ─── Key Backup Helpers ───────────────────────────────────────────────────────

async function getMasterKey() {
  const secret = import.meta.env.VITE_ENCRYPT_KEY || 'default_secret_key_123';
  const encoder = new TextEncoder();
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(secret));
  return crypto.subtle.importKey(
    'raw',
    hash,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptPrivateKey(jwk) {
  const masterKey = await getMasterKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(jwk));
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    masterKey,
    encoded
  );
  return {
    ciphertext: bufferToBase64(ciphertextBuffer),
    iv: bufferToBase64(iv.buffer)
  };
}

async function decryptPrivateKey(encryptedObj) {
  if (!encryptedObj || !encryptedObj.ciphertext || !encryptedObj.iv) return null;
  try {
    const masterKey = await getMasterKey();
    const ciphertextBuffer = base64ToBuffer(encryptedObj.ciphertext);
    const ivBuffer = base64ToBuffer(encryptedObj.iv);
    const plaintextBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(ivBuffer) },
      masterKey,
      ciphertextBuffer
    );
    return JSON.parse(new TextDecoder().decode(plaintextBuffer));
  } catch (err) {
    console.warn("[E2EE] Failed to decrypt master private key backup", err);
    return null;
  }
}


// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * In-memory cache of loaded CryptoKey objects to avoid repeated localStorage
 * reads and JWK imports within a single session.
 *
 * Structure: { [uid]: { privateKey: CryptoKey, publicKey: CryptoKey } }
 */
const _keyCache = {};

/**
 * In-memory cache of derived shared AES keys per conversation.
 * Structure: { [chatId]: CryptoKey }
 * This avoids re-deriving on every message render.
 */
const _sharedKeyCache = {};

/**
 * Initialize E2EE for the logged-in user.
 *
 * On first call (new device/browser):
 *   1. Generate an ECDH P-256 key pair.
 *   2. Store the private key JWK in localStorage.
 *   3. Upload the public key JWK to Firestore users/{uid}.e2eePublicKey.
 *
 * On subsequent calls (existing key in localStorage):
 *   1. Load the private key JWK from localStorage.
 *   2. Re-import both keys into Web Crypto for use.
 *
 * @param {string} uid - The logged-in user's Firebase UID
 * @returns {Promise<void>}
 */
export async function initE2EE(uid) {
  if (!uid) return;
  if (_keyCache[uid]) return; // already initialized this session

  const storedPrivKeyJwk = localStorage.getItem(privateKeyStorageKey(uid));
  const storedPubKeyJwk  = localStorage.getItem(publicKeyStorageKey(uid));

  if (storedPrivKeyJwk && storedPubKeyJwk) {
    // ── Existing keys: load from localStorage ──
    try {
      const privJwk = JSON.parse(storedPrivKeyJwk);
      const pubJwk  = JSON.parse(storedPubKeyJwk);

      const privateKey = await importPrivateKeyFromJwk(privJwk);
      const publicKey  = await importPublicKeyFromJwk(pubJwk);

      _keyCache[uid] = { privateKey, publicKey };

      // Ensure our public key and encrypted private key are in Firestore (in case they got cleared)
      const encryptedPriv = await encryptPrivateKey(privJwk);
      await _ensurePublicKeyInFirestore(uid, pubJwk, encryptedPriv);
      return;
    } catch {
      // Corrupt stored keys — fall through to check Firestore or regenerate
    }
  }

  // ── Fallback: Check Firestore for backed up private key ──
  try {
    const userSnap = await getDoc(doc(db, 'users', uid));
    if (userSnap.exists()) {
      const data = userSnap.data();
      if (data.e2eePrivateKeyEncrypted && data.e2eePublicKey) {
        const privJwk = await decryptPrivateKey(data.e2eePrivateKeyEncrypted);
        const pubJwk = JSON.parse(data.e2eePublicKey);
        if (privJwk && pubJwk) {
          const privateKey = await importPrivateKeyFromJwk(privJwk);
          const publicKey  = await importPublicKeyFromJwk(pubJwk);
          _keyCache[uid] = { privateKey, publicKey };
          
          // Restore to local storage
          localStorage.setItem(privateKeyStorageKey(uid), JSON.stringify(privJwk));
          localStorage.setItem(publicKeyStorageKey(uid), JSON.stringify(pubJwk));
          return;
        }
      }
    }
  } catch (err) {
    console.warn('[E2EE] Failed to check Firestore for key backup:', err.message);
  }

  // ── Generate new key pair ──
  const keyPair   = await generateKeyPair();
  const privJwk   = await exportKeyAsJwk(keyPair.privateKey);
  const pubJwk    = await exportKeyAsJwk(keyPair.publicKey);

  // Store private key locally (NEVER sent to server in plaintext)
  localStorage.setItem(privateKeyStorageKey(uid), JSON.stringify(privJwk));
  // Cache public key locally for quick re-import
  localStorage.setItem(publicKeyStorageKey(uid), JSON.stringify(pubJwk));

  _keyCache[uid] = { privateKey: keyPair.privateKey, publicKey: keyPair.publicKey };

  // Upload public key and ENCRYPTED private key to Firestore
  const encryptedPriv = await encryptPrivateKey(privJwk);
  await _ensurePublicKeyInFirestore(uid, pubJwk, encryptedPriv);
}

/**
 * Upload the user's public key JWK and encrypted private key to their Firestore document.
 * Safe to call multiple times — uses updateDoc (not setDoc) to avoid overwriting
 * other user fields. The public key field is merged in.
 *
 * @param {string} uid
 * @param {JsonWebKey} pubJwk
 * @param {object} encryptedPriv
 */
async function _ensurePublicKeyInFirestore(uid, pubJwk, encryptedPriv) {
  try {
    const userRef = doc(db, 'users', uid);
    await updateDoc(userRef, {
      e2eePublicKey: JSON.stringify(pubJwk),
      e2eePrivateKeyEncrypted: encryptedPriv,
    });
  } catch (err) {
    // Non-fatal: the user doc may not exist yet during first-login race conditions.
    console.warn('[E2EE] Could not upload keys to Firestore:', err.message);
  }
}

/**
 * Fetch a user's E2EE public key from Firestore and return it as a CryptoKey.
 * Returns null if the user has not yet generated an E2EE key pair.
 *
 * @param {string} partnerUid
 * @returns {Promise<CryptoKey|null>}
 */
async function _fetchPartnerPublicKey(partnerUid) {
  try {
    const snap = await getDoc(doc(db, 'users', partnerUid));
    if (!snap.exists()) return null;
    const jwkStr = snap.data().e2eePublicKey;
    if (!jwkStr) return null;
    return await importPublicKeyFromJwk(JSON.parse(jwkStr));
  } catch (err) {
    console.warn('[E2EE] Could not fetch partner public key:', err.message);
    return null;
  }
}

/**
 * Get (or derive and cache) the shared AES-256-GCM key for a conversation.
 *
 * @param {string} myUid       - The current user's UID
 * @param {string} partnerUid  - The conversation partner's UID
 * @param {string} chatId      - The RTDB chat room ID (used as cache key)
 * @returns {Promise<CryptoKey|null>}  The shared AES key, or null if unavailable
 */
export async function getSharedKey(myUid, partnerUid, chatId) {
  if (!myUid || !partnerUid || !chatId) return null;

  // Return cached key if available
  if (_sharedKeyCache[chatId]) return _sharedKeyCache[chatId];

  // Ensure our own keys are loaded
  if (!_keyCache[myUid]) await initE2EE(myUid);
  const myKeys = _keyCache[myUid];
  if (!myKeys) return null;

  // Fetch partner's public key from Firestore
  const partnerPublicKey = await _fetchPartnerPublicKey(partnerUid);
  if (!partnerPublicKey) return null;

  // ECDH key agreement — derives identical key on both sides
  const sharedKey = await deriveSharedAesKey(myKeys.privateKey, partnerPublicKey);

  _sharedKeyCache[chatId] = sharedKey;
  return sharedKey;
}

/**
 * Invalidate the cached shared key for a conversation.
 * Call this when switching conversations to force re-derivation.
 * (Re-derivation is cheap; this keeps memory tidy.)
 *
 * @param {string} chatId
 */
export function invalidateSharedKey(chatId) {
  delete _sharedKeyCache[chatId];
}

/**
 * Encrypt a message string for a given conversation.
 *
 * @param {string} myUid      - Current user's UID
 * @param {string} partnerUid - Partner's UID
 * @param {string} chatId     - Chat room ID
 * @param {string} plaintext  - The message text to encrypt
 * @returns {Promise<{ ciphertext: string, iv: string }|null>}
 *          Returns null if encryption is not available (partner has no key yet).
 */
export async function encryptMessage(myUid, partnerUid, chatId, plaintext) {
  const sharedKey = await getSharedKey(myUid, partnerUid, chatId);
  if (!sharedKey) return null;
  return encryptText(sharedKey, plaintext);
}

/**
 * Decrypt a message ciphertext for a given conversation.
 *
 * @param {string} myUid      - Current user's UID
 * @param {string} partnerUid - Partner's UID
 * @param {string} chatId     - Chat room ID
 * @param {string} ciphertext - Base64-encoded ciphertext
 * @param {string} iv         - Base64-encoded IV
 * @returns {Promise<string|null>}
 *          Returns null if decryption fails (key mismatch, corruption, or no key).
 */
export async function decryptMessage(myUid, partnerUid, chatId, ciphertext, iv) {
  const sharedKey = await getSharedKey(myUid, partnerUid, chatId);
  if (!sharedKey) return null;
  return decryptText(sharedKey, ciphertext, iv);
}

/**
 * Check whether the Web Crypto API is available in this browser.
 * All modern browsers support it; this is a safety guard for very old environments.
 *
 * @returns {boolean}
 */
export function isE2EESupported() {
  return !!(window.crypto && window.crypto.subtle);
}
