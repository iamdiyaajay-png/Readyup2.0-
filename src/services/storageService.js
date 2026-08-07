/**
 * storageService.js
 * ─────────────────────────────────────────────────────────────────
 * Firebase Storage helpers for certificate image/PDF uploads.
 * Falls back gracefully if Storage is not configured.
 * ─────────────────────────────────────────────────────────────────
 */
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';

let _storage = null;
function getStorageInstance() {
  if (!_storage) {
    try { _storage = getStorage(); } catch { return null; }
  }
  return _storage;
}

/**
 * Upload a certificate file to Firebase Storage.
 * Path: certificates/{studentId}/{timestamp}_{filename}
 *
 * @param {File}   file       The image/PDF file object
 * @param {string} studentId  The student's UID
 * @returns {Promise<{ downloadURL: string, storagePath: string }>}
 */
export async function uploadCertificate(file, studentId) {
  const storage = getStorageInstance();
  if (!storage) throw new Error('Firebase Storage is not configured.');

  const timestamp = Date.now();
  const safeName  = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `certificates/${studentId}/${timestamp}_${safeName}`;

  const storageRef = ref(storage, storagePath);
  const metadata   = { contentType: file.type, customMetadata: { studentId, uploadedAt: new Date().toISOString() } };

  await uploadBytes(storageRef, file, metadata);
  const downloadURL = await getDownloadURL(storageRef);

  return { downloadURL, storagePath };
}

/**
 * Delete a certificate from Firebase Storage.
 * @param {string} storagePath  The storage path returned by uploadCertificate
 */
export async function deleteCertificate(storagePath) {
  if (!storagePath) return;
  const storage = getStorageInstance();
  if (!storage) return;
  try {
    await deleteObject(ref(storage, storagePath));
  } catch (err) {
    // If file doesn't exist, ignore; log other errors
    if (err.code !== 'storage/object-not-found') {
      console.error('Storage delete failed:', err);
    }
  }
}

/**
 * Check if Firebase Storage is available (for conditional UI).
 */
export function isStorageAvailable() {
  return !!getStorageInstance();
}
