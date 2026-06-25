/**
 * purgeService.js
 * ──────────────────────────────────────────────────────────
 * Admin utility — batch-deletes demo/placeholder data from
 * Firestore. Safe to run multiple times (idempotent).
 * ──────────────────────────────────────────────────────────
 */
import { db } from '../firebase';
import {
  collection,
  query,
  where,
  getDocs,
  writeBatch,
  doc,
} from 'firebase/firestore';

const PLACEHOLDER_URL_PATTERNS = [
  'example.com',
  'placeholder',
  'localhost',
  'test.com',
  'demo.com',
  '#',
  'https://ready-up.example',
  'https://resume-scan.example',
];

function isPlaceholderUrl(url) {
  if (!url) return false;
  const lower = url.toLowerCase();
  return PLACEHOLDER_URL_PATTERNS.some((p) => lower.includes(p));
}

/**
 * Remove all courseSuggestions with placeholder / demo URLs.
 * Returns the count of deleted documents.
 */
export async function purgeDemoCourseSuggestions() {
  const snap = await getDocs(collection(db, 'courseSuggestions'));
  const batch = writeBatch(db);
  let count = 0;

  snap.forEach((docSnap) => {
    const data = docSnap.data();
    if (isPlaceholderUrl(data.url) || data.studentId?.startsWith('demo_')) {
      batch.delete(doc(db, 'courseSuggestions', docSnap.id));
      count++;
    }
  });

  if (count > 0) await batch.commit();
  return count;
}

/**
 * Remove all projects with placeholder GitHub/live URLs.
 */
export async function purgeDemoProjects() {
  const snap = await getDocs(collection(db, 'projects'));
  const batch = writeBatch(db);
  let count = 0;

  snap.forEach((docSnap) => {
    const data = docSnap.data();
    if (
      isPlaceholderUrl(data.githubUrl) ||
      isPlaceholderUrl(data.liveUrl) ||
      data.studentId?.startsWith('demo_')
    ) {
      batch.delete(doc(db, 'projects', docSnap.id));
      count++;
    }
  });

  if (count > 0) await batch.commit();
  return count;
}

/**
 * Remove all users with uid starting with 'demo_'.
 */
export async function purgeDemoUsers() {
  const q = query(collection(db, 'users'), where('isDemo', '==', true));
  const snap = await getDocs(q);
  const batch = writeBatch(db);
  let count = 0;

  snap.forEach((docSnap) => {
    batch.delete(doc(db, 'users', docSnap.id));
    count++;
  });

  if (count > 0) await batch.commit();
  return count;
}

/**
 * Run all purge operations.
 * @returns {{ courses: number, projects: number, users: number }}
 */
export async function purgeAllDemoData() {
  const [courses, projects, users] = await Promise.all([
    purgeDemoCourseSuggestions(),
    purgeDemoProjects(),
    purgeDemoUsers(),
  ]);
  return { courses, projects, users };
}
