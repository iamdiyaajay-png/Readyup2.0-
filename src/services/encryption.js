/**
 * encryption.js
 * ─────────────────────────────────────────────────────────────
 * AES-based client-side encryption service using crypto-js.
 * The key is read from VITE_ENCRYPT_KEY in the .env file.
 *
 * ⚠️  Note: This is client-side encryption. The key is embedded
 * in the compiled JS bundle. It protects data at rest in Firestore
 * from casual inspection, but does NOT provide perfect forward
 * secrecy against a determined attacker with access to the bundle.
 * For fully secure server-side encryption, use a Firebase Cloud
 * Function with the key stored in Google Secret Manager.
 * ─────────────────────────────────────────────────────────────
 */
import CryptoJS from 'crypto-js';

const SECRET_KEY = import.meta.env.VITE_ENCRYPT_KEY || 'ReadyUp-Fallback-Key-2026';

/**
 * Encrypts a JavaScript object to an AES ciphertext string.
 * @param {object} data - The plain object to encrypt.
 * @returns {string} Base64-encoded AES ciphertext.
 */
export function encryptData(data) {
  const plaintext = JSON.stringify(data);
  return CryptoJS.AES.encrypt(plaintext, SECRET_KEY).toString();
}

/**
 * Decrypts an AES ciphertext string back to a JavaScript object.
 * Returns null if decryption fails (wrong key, corrupt data, etc.).
 * @param {string} ciphertext - The AES ciphertext to decrypt.
 * @returns {object|null} Decrypted object or null on error.
 */
export function decryptData(ciphertext) {
  if (!ciphertext) return null;
  try {
    const bytes = CryptoJS.AES.decrypt(ciphertext, SECRET_KEY);
    const plaintext = bytes.toString(CryptoJS.enc.Utf8);
    if (!plaintext) return null;
    return JSON.parse(plaintext);
  } catch {
    console.error('Decryption failed — ciphertext may be corrupt or key mismatch.');
    return null;
  }
}
