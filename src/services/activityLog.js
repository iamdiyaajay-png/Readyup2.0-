/**
 * activityLog.js
 * ─────────────────────────────────────────────────────────────
 * Writes structured activity events to the Firestore `activityLog`
 * collection. Each document captures who did what and when.
 *
 * Schema:
 *   { uid, role, action, detail, entityId?, timestamp }
 * ─────────────────────────────────────────────────────────────
 */
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

/**
 * Log an activity event.
 * @param {string} uid       — The UID of the user performing the action
 * @param {string} role      — 'student' | 'mentor' | 'admin'
 * @param {string} action    — Short event code (e.g. 'COURSE_STARTED')
 * @param {string} detail    — Human-readable description
 * @param {string} [entityId] — Optional related document ID (courseId, projectId, etc.)
 */
export async function logActivity(uid, role, action, detail, entityId = null) {
  if (!uid) return;
  try {
    const entry = {
      uid,
      role,
      action,
      detail,
      timestamp: serverTimestamp(),
    };
    if (entityId) entry.entityId = entityId;
    await addDoc(collection(db, 'activityLog'), entry);
  } catch (err) {
    // Activity logging should never crash the app — silently swallow
    console.warn('[ActivityLog] Failed to write log entry:', err.message);
  }
}

// ── Convenience wrappers ─────────────────────────────────────

export const logCourseStarted = (uid, courseTitle, courseId) =>
  logActivity(uid, 'student', 'COURSE_STARTED', `Started course: "${courseTitle}"`, courseId);

export const logCourseCompleted = (uid, courseTitle, courseId) =>
  logActivity(uid, 'student', 'COURSE_COMPLETED', `Completed course: "${courseTitle}"`, courseId);

export const logQuizPassed = (uid, courseTitle, score, courseId) =>
  logActivity(uid, 'student', 'QUIZ_PASSED', `Passed quiz for "${courseTitle}" with ${score}%`, courseId);

export const logProjectAdded = (uid, projectTitle, projectId) =>
  logActivity(uid, 'student', 'PROJECT_ADDED', `Added project: "${projectTitle}"`, projectId);

export const logProfileUpdated = (uid, role) =>
  logActivity(uid, role, 'PROFILE_UPDATED', `${role === 'mentor' ? 'Mentor' : 'Student'} profile updated`);

export const logCoursePushed = (mentorUid, studentName, courseTitle, courseId) =>
  logActivity(mentorUid, 'mentor', 'COURSE_PUSHED', `Pushed "${courseTitle}" to ${studentName}`, courseId);

export const logStudentAccepted = (mentorUid, studentName, studentId) =>
  logActivity(mentorUid, 'mentor', 'STUDENT_ACCEPTED', `Accepted student: ${studentName}`, studentId);

export const logQuizApproved = (mentorUid, studentName, courseTitle, courseId) =>
  logActivity(mentorUid, 'mentor', 'QUIZ_APPROVED', `Approved quiz for ${studentName} — "${courseTitle}"`, courseId);

export const logCertificateValidated = (uid, result, courseName) =>
  logActivity(uid, 'student', 'CERTIFICATE_VALIDATED', `Certificate for "${courseName}" marked as ${result}`);

export const logResumeReviewed = (uid, score) =>
  logActivity(uid, 'student', 'RESUME_REVIEWED', `Resume reviewed — ATS Score: ${score}`);

export const logCourseRevoked = (mentorUid, studentName, courseTitle, courseId) =>
  logActivity(mentorUid, 'mentor', 'COURSE_REVOKED', `Revoked "${courseTitle}" from ${studentName}`, courseId);

export const logCertApproved = (mentorUid, studentName, courseTitle, points) =>
  logActivity(mentorUid, 'mentor', 'CERT_APPROVED', `Approved cert for ${studentName}: "${courseTitle}" (+${points}pts)`);

export const logCertRejected = (mentorUid, studentName, courseTitle) =>
  logActivity(mentorUid, 'mentor', 'CERT_REJECTED', `Rejected cert for ${studentName}: "${courseTitle}"`);
