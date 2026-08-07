/**
 * recalcService.js
 * ──────────────────────────────────────────────────────────────
 * Reads live Firestore data for a student and recalculates
 * their Placement Readiness Score using the new weighted formula:
 *   Programming 30% + Projects 25% + Certs 15%
 *   + Aptitude 10% + Communication 10% + Leadership 10%
 *
 * Writes result back to users/{studentId}.
 * ──────────────────────────────────────────────────────────────
 */
import { db } from '../firebase';
import {
  collection, query, where, getDocs, doc, updateDoc, getDoc
} from 'firebase/firestore';
import { calculateReadinessScore, emptySkillMatrix } from './pointsService';

/**
 * Recalculate and persist the readiness score for a student.
 * @param {string} studentId
 * @returns {Promise<{ total: number, breakdown: object }>}
 */
export async function recalculateReadiness(studentId) {
  if (!studentId) throw new Error('studentId is required');

  // 1. Fetch student profile (for skillMatrix, aptitudeScore, etc.)
  const userSnap = await getDoc(doc(db, 'users', studentId));
  const userData  = userSnap.exists() ? userSnap.data() : {};
  const skillMatrix = userData.skillMatrix || emptySkillMatrix();

  // 2. Sum cert scores from mentor-approved certifications
  const certsQ = query(
    collection(db, 'certPending'),
    where('studentId', '==', studentId),
    where('status', '==', 'approved')
  );
  const certsSnap = await getDocs(certsQ);

  let certPoints = 0;
  certsSnap.forEach((d) => {
    const data = d.data();
    // score is 1–5; default 2 for legacy docs that used the old tier system
    certPoints += data.geminiScore || data.score || 2;
  });

  // 3. Project count
  const projSnap = await getDocs(
    query(collection(db, 'projects'), where('studentId', '==', studentId))
  );
  const projectCount = projSnap.size;

  // 4. Aptitude score (average quiz score from approved courses)
  const coursesQ = query(
    collection(db, 'courseSuggestions'),
    where('studentId', '==', studentId),
    where('status', 'in', ['completed', 'approved'])
  );
  const coursesSnap = await getDocs(coursesQ);
  let totalQuiz = 0, quizCount = 0;
  coursesSnap.forEach((d) => {
    const data = d.data();
    if (data.quizScore != null) { totalQuiz += data.quizScore; quizCount++; }
  });
  const aptitudeScore = quizCount > 0
    ? totalQuiz / quizCount
    : userData.aptitudeScore || 0;

  // 5. Mentor rating → communication boost
  const mentorRating = userData.mentorRating || 0;

  // 6. Calculate using new weighted formula
  const { total, breakdown } = calculateReadinessScore({
    skillMatrix,
    projectCount,
    certPoints,
    aptitudeScore,
    mentorRating,
  });

  // 7. Write back to Firestore
  await updateDoc(doc(db, 'users', studentId), {
    readinessScore:   total,
    certPoints,
    skillMatrix,
    lastScoreRefresh: new Date().toISOString(),
    readinessBreakdown: breakdown,
  });

  return { total, breakdown };
}
