/**
 * binaryStorageService.js
 * ──────────────────────────────────────────────────────────────
 * Stores certificate images as Base64-encoded binary chunks in
 * Firestore's `certificate_chunks` collection.
 *
 * Firestore document limit: 1 MB.
 * We use 600 KB per chunk (base64) → safe under the limit.
 *
 * Collection structure:
 *   certificate_chunks/{certId}_meta   → { certId, chunkCount, fileType, fileName, createdAt }
 *   certificate_chunks/{certId}_0      → { data: "<base64 string chunk 0>" }
 *   certificate_chunks/{certId}_1      → { data: "<base64 string chunk 1>" }
 *   ...
 * ──────────────────────────────────────────────────────────────
 */
import { db } from '../firebase';
import {
  doc, setDoc, getDoc, getDocs,
  collection, query, where, deleteDoc, writeBatch
} from 'firebase/firestore';

const CHUNK_SIZE = 600_000; // ~600KB of base64 per Firestore document
const CHUNKS_COL = 'certificate_chunks';

// ── Store ─────────────────────────────────────────────────────

/**
 * Convert a File/Blob to a Base64 dataURL string.
 * @param {File|Blob} file
 * @returns {Promise<string>} full data:... base64 string
 */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload  = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read file'));
  });
}

/**
 * Store a certificate file as chunked binary in Firestore.
 *
 * @param {File|Blob} file     The image or PDF-rendered-to-PNG file
 * @param {string}    certId   The certPending document ID (used as prefix)
 * @returns {Promise<{ chunkCount: number, fileType: string, fileName: string }>}
 */
export async function storeCertificateBinary(file, certId) {
  if (!file || !certId) throw new Error('file and certId are required');

  const base64DataUrl = await fileToBase64(file);
  const chunks = [];

  // Split the full dataURL into CHUNK_SIZE pieces
  for (let i = 0; i < base64DataUrl.length; i += CHUNK_SIZE) {
    chunks.push(base64DataUrl.slice(i, i + CHUNK_SIZE));
  }

  const batch = writeBatch(db);

  // Write each chunk
  chunks.forEach((chunk, idx) => {
    const chunkRef = doc(db, CHUNKS_COL, `${certId}_${idx}`);
    batch.set(chunkRef, { certId, index: idx, data: chunk });
  });

  // Write meta document
  const metaRef = doc(db, CHUNKS_COL, `${certId}_meta`);
  batch.set(metaRef, {
    certId,
    chunkCount: chunks.length,
    fileType:   file.type,
    fileName:   file.name,
    totalLength: base64DataUrl.length,
    createdAt:  new Date().toISOString(),
  });

  await batch.commit();

  return { chunkCount: chunks.length, fileType: file.type, fileName: file.name };
}

// ── Retrieve ──────────────────────────────────────────────────

/**
 * Retrieve and reconstruct a certificate image as a dataURL.
 *
 * @param {string} certId  The certPending document ID
 * @returns {Promise<string|null>} Base64 dataURL (data:image/jpeg;base64,...) or null if not found
 */
export async function retrieveCertificateBinary(certId) {
  if (!certId) return null;

  // Get meta
  const metaSnap = await getDoc(doc(db, CHUNKS_COL, `${certId}_meta`));
  if (!metaSnap.exists()) return null;

  const { chunkCount } = metaSnap.data();

  // Fetch all chunks in parallel
  const chunkPromises = Array.from({ length: chunkCount }, (_, i) =>
    getDoc(doc(db, CHUNKS_COL, `${certId}_${i}`))
  );
  const chunkSnaps = await Promise.all(chunkPromises);

  // Reconstruct
  const parts = chunkSnaps.map((snap) => {
    if (!snap.exists()) throw new Error(`Missing chunk ${snap.id}`);
    return snap.data().data;
  });

  return parts.join('');
}

// ── Delete ────────────────────────────────────────────────────

/**
 * Delete all stored chunks for a certificate.
 * @param {string} certId
 */
export async function deleteCertificateBinary(certId) {
  if (!certId) return;

  const metaSnap = await getDoc(doc(db, CHUNKS_COL, `${certId}_meta`));
  if (!metaSnap.exists()) return;

  const { chunkCount } = metaSnap.data();
  const batch = writeBatch(db);

  for (let i = 0; i < chunkCount; i++) {
    batch.delete(doc(db, CHUNKS_COL, `${certId}_${i}`));
  }
  batch.delete(doc(db, CHUNKS_COL, `${certId}_meta`));

  await batch.commit();
}

// ── Check ─────────────────────────────────────────────────────

/**
 * Check whether a cert has stored binary chunks.
 * @param {string} certId
 * @returns {Promise<boolean>}
 */
export async function hasCertificateBinary(certId) {
  if (!certId) return false;
  const snap = await getDoc(doc(db, CHUNKS_COL, `${certId}_meta`));
  return snap.exists();
}
