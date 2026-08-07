import { useState, useEffect } from 'react';
import { db } from '../../firebase';
import {
  collection, query, where, onSnapshot, doc, updateDoc, increment
} from 'firebase/firestore';
import {
  X, User, BookOpen, Code2, Award, ExternalLink,
  CheckCircle2, XCircle, Clock, Trash2, GraduationCap
} from 'lucide-react';
import { Github, Linkedin } from '../common/Icons';
import { getCertificatePoints, getReadinessBadge, TIER_COLORS } from '../../services/pointsService';
import { logCourseRevoked } from '../../services/activityLog';

/**
 * StudentDetailModal
 * Opens when a mentor clicks a student name in "My Students".
 * Shows full profile: bio, skills, courses, certs, readiness ring.
 * Also has Revoke Course buttons.
 */
export default function StudentDetailModal({ student, mentorUid, onClose }) {
  const [courses, setCourses] = useState([]);
  const [revoking, setRevoking] = useState(null);

  useEffect(() => {
    if (!student?.id) return;
    const q = query(
      collection(db, 'courseSuggestions'),
      where('studentId', '==', student.id)
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      list.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
      setCourses(list);
    });
    return () => unsub();
  }, [student?.id]);

  const handleRevoke = async (course) => {
    setRevoking(course.id);
    try {
      // Determine points to deduct
      const { points } = getCertificatePoints(course.issuer || '');

      await updateDoc(doc(db, 'courseSuggestions', course.id), {
        status: 'revoked',
        revokedBy: mentorUid,
        revokedAt: new Date().toISOString(),
      });

      // Deduct points
      await updateDoc(doc(db, 'users', student.id), {
        readinessScore: increment(-points),
        certPoints: increment(-points),
        lastActivity: new Date().toISOString(),
      });

      await logCourseRevoked(mentorUid, student.name, course.title, course.id);
    } catch (err) {
      console.error('Revoke failed:', err);
    } finally {
      setRevoking(null);
    }
  };

  const readiness = student?.readiness || 0;
  const badge = getReadinessBadge(readiness);
  const skills = Array.isArray(student?.skills) ? student.skills : [];

  const completedCourses = courses.filter((c) => c.status === 'completed' || c.status === 'approved');
  const activeCourses    = courses.filter((c) => c.status === 'in-progress' || c.status === 'pending');
  const revokedCourses   = courses.filter((c) => c.status === 'revoked');

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="glass-card rounded-3xl w-full max-w-3xl max-h-[90vh] overflow-hidden border border-brand-border flex flex-col">

        {/* Header */}
        <div className="px-6 py-4 bg-brand-card border-b border-brand-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <img
              src={student?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(student?.name || 'S')}&background=10b981&color=fff`}
              alt={student?.name}
              className="w-10 h-10 rounded-full object-cover border border-brand-border"
            />
            <div>
              <h2 className="text-sm font-bold text-brand-text-primary">{student?.name}</h2>
              <p className="text-[10px] text-brand-text-muted">{student?.email}</p>
            </div>
          </div>
          <button onClick={onClose}
            className="p-2 rounded-xl hover:bg-brand-card-hover text-brand-text-muted hover:text-brand-text-primary transition-colors cursor-pointer">
            <X size={18} />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="overflow-y-auto flex-1 p-6 space-y-6">

          {/* Top stats row */}
          <div className="grid grid-cols-3 gap-4">
            {/* Readiness ring */}
            <div className="glass-card p-4 rounded-2xl text-center col-span-1">
              <div className="relative w-20 h-20 mx-auto">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 80 80">
                  <circle cx="40" cy="40" r="32" stroke="#1f2937" strokeWidth="7" fill="transparent" />
                  <circle cx="40" cy="40" r="32" stroke="#10b981" strokeWidth="7" fill="transparent"
                    strokeDasharray="201"
                    strokeDashoffset={201 - (201 * readiness) / 100}
                    strokeLinecap="round" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-lg font-extrabold text-brand-text-primary">{readiness}%</span>
                </div>
              </div>
              <p className={`text-[10px] font-bold mt-2 ${badge.color}`}>{badge.label}</p>
            </div>

            {/* Quick info */}
            <div className="col-span-2 space-y-2">
              {[
                { icon: GraduationCap, label: 'College', value: student?.college },
                { icon: BookOpen, label: 'Branch', value: `${student?.branch || '—'} · ${student?.year || '—'}` },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-start gap-2 text-xs">
                  <Icon size={13} className="text-brand-text-muted shrink-0 mt-0.5" />
                  <div>
                    <span className="text-brand-text-muted">{label}: </span>
                    <span className="font-semibold text-brand-text-primary">{value || '—'}</span>
                  </div>
                </div>
              ))}

              {/* Social links */}
              <div className="flex items-center gap-3 pt-1">
                {student?.linkedIn && (
                  <a href={student.linkedIn} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1 text-[10px] text-indigo-400 hover:underline font-semibold">
                    <Linkedin size={11} /> LinkedIn
                    <ExternalLink size={9} />
                  </a>
                )}
                {student?.gitHub && (
                  <a href={student.gitHub} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1 text-[10px] text-brand-text-secondary hover:underline font-semibold">
                    <Github size={11} /> GitHub
                    <ExternalLink size={9} />
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Bio */}
          {student?.bio && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold text-brand-text-muted uppercase tracking-wider">About</p>
              <p className="text-xs text-brand-text-secondary leading-relaxed">{student.bio}</p>
            </div>
          )}

          {/* Skills */}
          {skills.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-brand-text-muted uppercase tracking-wider flex items-center gap-1">
                <Code2 size={11} /> Skills
              </p>
              <div className="flex flex-wrap gap-1.5">
                {skills.map((skill) => (
                  <span key={skill}
                    className="px-2.5 py-1 rounded-full bg-brand-card border border-brand-border text-[10px] font-semibold text-brand-text-secondary">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Active Courses */}
          {activeCourses.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-brand-text-muted uppercase tracking-wider flex items-center gap-1">
                <Clock size={11} /> Active Courses ({activeCourses.length})
              </p>
              <div className="space-y-2">
                {activeCourses.map((c) => (
                  <div key={c.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-brand-bg/40 border border-brand-border/60 text-xs">
                    <div>
                      <p className="font-semibold text-brand-text-primary">{c.title}</p>
                      <p className="text-[10px] text-brand-text-muted capitalize">{c.status}</p>
                    </div>
                    {c.url && (
                      <a href={c.url} target="_blank" rel="noreferrer"
                        className="text-brand-text-muted hover:text-brand-accent">
                        <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Completed Courses with Revoke */}
          {completedCourses.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-brand-text-muted uppercase tracking-wider flex items-center gap-1">
                <Award size={11} className="text-brand-accent" /> Completed Certificates ({completedCourses.length})
              </p>
              <div className="space-y-2">
                {completedCourses.map((c) => {
                  const tierInfo = getCertificatePoints(c.issuer || '');
                  const tierColors = TIER_COLORS[tierInfo.tier];
                  return (
                    <div key={c.id}
                      className="flex items-center justify-between p-3 rounded-xl bg-brand-bg/40 border border-brand-border/60">
                      <div className="flex items-center gap-3">
                        <CheckCircle2 size={16} className="text-brand-accent shrink-0" />
                        <div>
                          <p className="text-xs font-semibold text-brand-text-primary">{c.title}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${tierColors.text} ${tierColors.bg} ${tierColors.border}`}>
                              {tierInfo.label}
                            </span>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleRevoke(c)}
                        disabled={revoking === c.id}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-900/30 text-red-400 hover:bg-red-950/20 text-[10px] font-bold transition-colors cursor-pointer disabled:opacity-40"
                      >
                        {revoking === c.id
                          ? <div className="w-3 h-3 rounded-full border border-red-400/30 border-t-red-400 animate-spin" />
                          : <Trash2 size={11} />
                        }
                        Revoke
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Revoked courses */}
          {revokedCourses.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-brand-text-muted uppercase tracking-wider flex items-center gap-1">
                <XCircle size={11} className="text-red-400" /> Revoked ({revokedCourses.length})
              </p>
              {revokedCourses.map((c) => (
                <div key={c.id}
                  className="flex items-center gap-3 p-3 rounded-xl bg-red-950/10 border border-red-900/20 text-xs opacity-60">
                  <XCircle size={14} className="text-red-400 shrink-0" />
                  <p className="text-brand-text-secondary line-through">{c.title}</p>
                </div>
              ))}
            </div>
          )}

          {courses.length === 0 && (
            <div className="text-center py-8 text-xs text-brand-text-muted">
              No courses assigned yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
