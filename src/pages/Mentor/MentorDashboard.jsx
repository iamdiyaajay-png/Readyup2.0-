import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebase';
import {
  collection, query, where, onSnapshot, addDoc, updateDoc,
  doc, arrayUnion, arrayRemove, increment
} from 'firebase/firestore';
import {
  Users, BookOpen, Calendar, Send, Check, X, Award,
  Clock, ChevronDown, ChevronUp, Plus, Trash2, Activity,
  Bell, Eye, ShieldCheck, RefreshCw, Zap
} from 'lucide-react';
import {
  logCoursePushed, logStudentAccepted, logQuizApproved
} from '../../services/activityLog';
import { getCertificatePoints, TIER_COLORS } from '../../services/pointsService';
import { recalculateReadiness } from '../../services/recalcService';
import { retrieveCertificateBinary } from '../../services/binaryStorageService';
import ActivityFeed from '../../components/common/ActivityFeed';
import StudentDetailModal from '../../components/Mentor/StudentDetailModal';
import CertReviewModal from '../../components/Mentor/CertReviewModal';

export default function MentorDashboard() {
  const { user } = useAuth();

  // ── Real Students Roster ─────────────────────────────────────
  const [students, setStudents] = useState([]);
  const [pendingStudents, setPendingStudents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState('');
  const [projectsMap, setProjectsMap] = useState({});

  // ── Course Suggestion Form ──────────────────────────────────
  const [courseTitle, setCourseTitle] = useState('');
  const [courseUrl, setCourseUrl] = useState('');
  const [suggestionSuccess, setSuggestionSuccess] = useState(false);

  // ── Quiz Question Builder ───────────────────────────────────
  const [showQuizBuilder, setShowQuizBuilder] = useState(false);
  const [quizQuestions, setQuizQuestions] = useState([]);
  const [draftQuestion, setDraftQuestion] = useState({ question: '', options: ['', '', '', ''], correct: 'A' });

  // ── Pending Quiz Approvals ──────────────────────────────────
  const [quizPendingCourses, setQuizPendingCourses] = useState([]);

  // ── Interview Requests (from Firestore) ─────────────────────
  const [pendingInterviews, setPendingInterviews] = useState([]);

  // ── Phase 2: My Students tab + detail modal ──────────────────
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' | 'students'
  const [detailStudent, setDetailStudent] = useState(null);
  const [fullStudents, setFullStudents] = useState([]);

  // ── Phase 2: certPending (OCR submissions awaiting review) ───
  const [certPending, setCertPending] = useState([]);
  const [reviewCert, setReviewCert] = useState(null);
  const [certImageLoading, setCertImageLoading] = useState(false);

  // Load cert + binary image, then open modal
  const handleOpenCertReview = async (cert) => {
    setCertImageLoading(true);
    try {
      const enriched = { ...cert };
      if (cert.hasChunkedImage && !cert.imageDataUrl) {
        try {
          enriched.imageDataUrl = await retrieveCertificateBinary(cert.id);
        } catch (e) {
          console.warn('Could not load cert image:', e.message);
        }
      }
      setReviewCert(enriched);
    } finally {
      setCertImageLoading(false);
    }
  };

  // ── Fix 2: Skill management state ───────────────────────────────
  const [skillInputs, setSkillInputs] = useState({});  // { studentId: 'comma, sep, skills' }
  const [skillSaving, setSkillSaving] = useState({});   // { studentId: bool }
  const [refreshingScore, setRefreshingScore] = useState({});  // { studentId: bool }

  // Sync projects count map
  useEffect(() => {
    const q = collection(db, 'projects');
    const unsub = onSnapshot(q, (snap) => {
      const counts = {};
      snap.forEach((d) => {
        const data = d.data();
        if (data.studentId) counts[data.studentId] = (counts[data.studentId] || 0) + 1;
      });
      setProjectsMap(counts);
    }, (err) => console.error('projects sync error:', err));
    return () => unsub();
  }, []);

  // Sync assigned (approved) students
  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      collection(db, 'users'),
      where('mentorId', '==', user.uid),
      where('status', '==', 'approved')
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = [];
      snap.forEach((d) => {
        const data = d.data();
        list.push({
          id: d.id,
          name: data.name || 'Student',
          email: data.email || '',
          readiness: data.readinessScore || 0,
          avatar: data.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(data.name || 'S')}&background=10b981&color=fff`,
          lastActive: data.lastActivity ? new Date(data.lastActivity).toLocaleDateString() : 'Unknown',
        });
      });
      setStudents(list);
      if (list.length > 0 && !selectedStudent) setSelectedStudent(list[0].id);
    }, (err) => console.error('students sync error:', err));
    return () => unsub();
  }, [user?.uid]); // eslint-disable-line

  // Sync PENDING students assigned to this mentor (awaiting mentor acceptance)
  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      collection(db, 'users'),
      where('mentorId', '==', user.uid),
      where('status', '==', 'pending')
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = [];
      snap.forEach((d) => {
        const data = d.data();
        list.push({ id: d.id, name: data.name || 'Student', email: data.email || '', readiness: data.readinessScore || 0 });
      });
      setPendingStudents(list);
    }, (err) => console.error('pending students sync error:', err));
    return () => unsub();
  }, [user?.uid]);

  // Sync quiz-passed courses waiting for mentor approval
  useEffect(() => {
    if (!user?.uid) return;

    // Get IDs of all assigned students to filter courses
    const studentIds = students.map((s) => s.id);
    if (studentIds.length === 0) { setQuizPendingCourses([]); return; }

    // Chunk if needed (Firestore in-query limit 30)
    const chunk = studentIds.slice(0, 30);
    const q = query(
      collection(db, 'courseSuggestions'),
      where('studentId', 'in', chunk),
      where('status', '==', 'quiz_passed')
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      setQuizPendingCourses(list);
    }, (err) => console.error('quiz pending sync error:', err));
    return () => unsub();
  }, [user?.uid, JSON.stringify(students.map((s) => s.id))]); // eslint-disable-line

  // Sync pending interview requests from Firestore
  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      collection(db, 'mockInterviews'),
      where('mentorId', '==', user.uid),
      where('status', '==', 'pending')
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      setPendingInterviews(list);
    }, (err) => {
      console.warn('No mockInterviews collection yet:', err.message);
      setPendingInterviews([]);
    });
    return () => unsub();
  }, [user?.uid]);

  // Sync certPending documents for this mentor's students
  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      collection(db, 'certPending'),
      where('mentorId', '==', user.uid),
      where('status', '==', 'pending')
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      setCertPending(list);
    }, (err) => {
      console.warn('certPending collection not ready yet:', err.message);
      setCertPending([]);
    });
    return () => unsub();
  }, [user?.uid]);

  // Sync full student profiles (for detail modal — includes bio, skills, social links)
  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      collection(db, 'users'),
      where('mentorId', '==', user.uid),
      where('status', '==', 'approved')
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = [];
      snap.forEach((d) => {
        const data = d.data();
        list.push({
          id: d.id,
          name: data.name || 'Student',
          email: data.email || '',
          readiness: data.readinessScore || 0,
          avatar: data.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(data.name || 'S')}&background=10b981&color=fff`,
          lastActive: data.lastActivity ? new Date(data.lastActivity).toLocaleDateString() : 'Unknown',
          // Full profile fields for detail modal
          bio: data.portfolioBio || '',
          skills: data.skills || [],
          approvedSkills: data.approvedSkills || [],
          college: data.college || '',
          branch: data.branch || '',
          year: data.year || '',
          linkedIn: data.linkedIn || '',
          gitHub: data.gitHub || '',
          certPoints: data.certPoints || 0,
        });
      });
      setFullStudents(list);
    }, (err) => console.error('fullStudents sync error:', err));
    return () => unsub();
  }, [user?.uid]);

  // ── Handlers ────────────────────────────────────────────────

  const handleAcceptStudent = async (studentId, studentName) => {
    try {
      await updateDoc(doc(db, 'users', studentId), {
        status: 'approved',
        mentorAssigned: true,
        lastActivity: new Date().toISOString(),
      });
      await logStudentAccepted(user.uid, studentName, studentId);
    } catch (err) {
      console.error('Failed to accept student:', err);
    }
  };

  const handleDeclineStudent = async (studentId) => {
    try {
      await updateDoc(doc(db, 'users', studentId), { mentorId: null, status: 'pending' });
    } catch (err) {
      console.error('Failed to decline student:', err);
    }
  };

  const addQuizQuestion = () => {
    if (!draftQuestion.question.trim() || draftQuestion.options.some((o) => !o.trim())) return;
    setQuizQuestions((prev) => [...prev, { ...draftQuestion }]);
    setDraftQuestion({ question: '', options: ['', '', '', ''], correct: 'A' });
  };

  const removeQuizQuestion = (idx) => {
    setQuizQuestions((prev) => prev.filter((_, i) => i !== idx));
  };

  const handlePushSuggestion = async (e) => {
    e.preventDefault();
    if (!courseTitle || !courseUrl || !selectedStudent) return;
    const studentName = students.find((s) => s.id === selectedStudent)?.name || 'Student';

    try {
      const payload = {
        studentId: selectedStudent,
        title: courseTitle.trim(),
        url: courseUrl.trim(),
        duration: 'Self-paced',
        priority: 'High',
        status: 'pending',
        createdAt: new Date().toISOString(),
        mentorId: user.uid,
      };
      if (quizQuestions.length > 0) payload.quiz = quizQuestions;

      await addDoc(collection(db, 'courseSuggestions'), payload);
      await logCoursePushed(user.uid, studentName, courseTitle.trim());

      setSuggestionSuccess(true);
      setCourseTitle('');
      setCourseUrl('');
      setQuizQuestions([]);
      setShowQuizBuilder(false);
      setTimeout(() => setSuggestionSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to push suggestion:', err);
    }
  };

  const handleApproveQuiz = async (course) => {
    const studentName = students.find((s) => s.id === course.studentId)?.name || 'Student';
    try {
      await updateDoc(doc(db, 'courseSuggestions', course.id), {
        status: 'completed',
        mentorApproved: true,
        approvedAt: new Date().toISOString(),
      });
      // Recalculate readiness from live data instead of raw increment
      // This prevents score drift (e.g. 40% from accumulated counts)
      await recalculateReadiness(course.studentId);
      await updateDoc(doc(db, 'users', course.studentId), {
        lastActivity: new Date().toISOString(),
      });
      await logQuizApproved(user.uid, studentName, course.title, course.id);
    } catch (err) {
      console.error('Quiz approval failed:', err);
    }
  };

  const handleInterviewAction = async (id, action) => {
    try {
      await updateDoc(doc(db, 'mockInterviews', id), { status: action === 'approve' ? 'approved' : 'declined' });
    } catch (err) {
      console.error('Interview action failed:', err);
      setPendingInterviews((prev) => prev.filter((item) => item.id !== id));
    }
  };

  // ── Fix 2: Skill approval/rejection (writes to user.approvedSkills) ────
  const handleSaveSkills = async (studentId) => {
    const raw = skillInputs[studentId] || '';
    const skills = raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (!skills.length) return;
    setSkillSaving((p) => ({ ...p, [studentId]: true }));
    try {
      await updateDoc(doc(db, 'users', studentId), {
        approvedSkills: skills,
        lastActivity: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Skill save failed:', err);
    } finally {
      setSkillSaving((p) => ({ ...p, [studentId]: false }));
    }
  };

  const handleRevokeSkill = async (studentId, skill) => {
    try {
      await updateDoc(doc(db, 'users', studentId), {
        approvedSkills: arrayRemove(skill),
      });
    } catch (err) {
      console.error('Skill revoke failed:', err);
    }
  };

  // ── Fix 1: Refresh readiness score for a student ────────────────
  const handleRefreshScore = async (studentId) => {
    setRefreshingScore((p) => ({ ...p, [studentId]: true }));
    try {
      await recalculateReadiness(studentId);
    } catch (err) {
      console.error('Refresh score failed:', err);
    } finally {
      setRefreshingScore((p) => ({ ...p, [studentId]: false }));
    }
  };

  // ── Recalculate all assigned students at once ────────────────────
  const [recalcingAll, setRecalcingAll] = useState(false);
  const handleRecalcAll = async () => {
    if (recalcingAll || students.length === 0) return;
    setRecalcingAll(true);
    try {
      await Promise.all(students.map((s) => recalculateReadiness(s.id)));
    } catch (err) {
      console.error('Recalc all failed:', err);
    } finally {
      setRecalcingAll(false);
    }
  };

  const acceptedCount = students.length;
  const avgReadiness = students.length > 0
    ? Math.round(students.reduce((s, st) => s + st.readiness, 0) / students.length)
    : 0;
  const studentIds = students.map((s) => s.id);

  return (
    <>
    <div className="space-y-6">
      {/* Modals */}
      {detailStudent && (
        <StudentDetailModal
          student={detailStudent}
          mentorUid={user?.uid}
          onClose={() => setDetailStudent(null)}
        />
      )}
      {reviewCert && (
        <CertReviewModal
          cert={reviewCert}
          mentorUid={user?.uid}
          onClose={() => setReviewCert(null)}
        />
      )}

      {/* Header + Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Mentor Dashboard</h1>
          <p className="text-sm text-brand-text-secondary mt-1">
            Monitor students, push resources, and approve quizzes.
          </p>
        </div>
        {/* Tab switcher */}
        <div className="flex items-center gap-1 bg-brand-card border border-brand-border rounded-xl p-1">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: Activity },
            { id: 'students',  label: `My Students (${fullStudents.length})`, icon: Users },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === id
                  ? 'bg-brand-accent text-brand-bg shadow-sm'
                  : 'text-brand-text-secondary hover:text-brand-text-primary'
              }`}
            >
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>
      </div>

      {/* ═══════ MY STUDENTS TAB ═══════ */}
      {activeTab === 'students' && (
        <div className="space-y-4">
          {fullStudents.length === 0 ? (
            <div className="glass-card p-12 rounded-3xl text-center">
              <Users size={32} className="text-brand-text-muted mx-auto mb-3" />
              <p className="text-sm font-bold text-brand-text-primary">No students yet</p>
              <p className="text-xs text-brand-text-muted mt-1">Accept student requests to see them here.</p>
            </div>
          ) : (
            <div className="glass-card rounded-3xl border border-brand-border overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-brand-border bg-brand-card">
                    {['Student', 'College / Branch', 'Readiness', 'Cert Pts', 'Last Active', 'Action'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-[10px] font-bold text-brand-text-muted uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-border/40">
                  {fullStudents.map((s) => (
                    <React.Fragment key={s.id}>
                    <tr className="hover:bg-brand-card/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <img src={s.avatar} alt={s.name} className="w-8 h-8 rounded-full object-cover border border-brand-border" />
                          <div>
                            <p className="text-xs font-bold text-brand-text-primary">{s.name}</p>
                            <p className="text-[10px] text-brand-text-muted">{s.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs text-brand-text-secondary">{s.college || '—'}</p>
                        <p className="text-[10px] text-brand-text-muted">{s.branch} {s.year && `· ${s.year}`}</p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-brand-border rounded-full overflow-hidden">
                            <div className="h-full bg-brand-accent rounded-full" style={{ width: `${s.readiness}%` }} />
                          </div>
                          <span className="text-xs font-bold text-brand-accent">{s.readiness}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-bold text-yellow-400">{s.certPoints || 0} pts</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[10px] text-brand-text-muted">{s.lastActive}</span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setDetailStudent(s)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-brand-border text-[10px] font-bold text-brand-text-secondary hover:text-brand-accent hover:border-brand-accent/30 transition-colors cursor-pointer"
                        >
                          <Eye size={11} /> View
                        </button>
                      </td>
                    </tr>
                    {/* Expanded Skill Management Row */}
                    <tr key={`${s.id}-skills`}>
                      <td colSpan={6} className="px-4 pb-4">
                        <div className="p-4 rounded-2xl bg-brand-bg/30 border border-brand-border/40 space-y-3">
                          {/* Approved Skills */}
                          <div>
                            <p className="text-[10px] font-bold text-brand-accent uppercase tracking-wider mb-2">
                              ✓ Mentor-Approved Skills
                            </p>
                            {Array.isArray(s.approvedSkills) && s.approvedSkills.length > 0 ? (
                              <div className="flex flex-wrap gap-1.5">
                                {s.approvedSkills.map((sk) => (
                                  <span key={sk}
                                    className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-accent-light border border-brand-accent/20 text-[10px] font-semibold text-brand-accent">
                                    {sk}
                                    <button
                                      onClick={() => handleRevokeSkill(s.id, sk)}
                                      title="Revoke this skill"
                                      className="hover:text-red-400 transition-colors cursor-pointer ml-0.5">
                                      <X size={10} />
                                    </button>
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <p className="text-[10px] text-brand-text-muted italic">No skills approved yet.</p>
                            )}
                          </div>

                          {/* Add Skills */}
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              placeholder="Add skills (comma-separated, e.g. React, SQL, Python)"
                              value={skillInputs[s.id] || ''}
                              onChange={(e) => setSkillInputs((p) => ({ ...p, [s.id]: e.target.value }))}
                              className="flex-1 px-3 py-1.5 bg-brand-bg border border-brand-border rounded-xl text-[10px] focus:outline-none focus:border-brand-accent text-brand-text-primary"
                            />
                            <button
                              onClick={() => handleSaveSkills(s.id)}
                              disabled={skillSaving[s.id] || !skillInputs[s.id]?.trim()}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-brand-accent text-brand-bg text-[10px] font-bold hover:bg-brand-accent-hover transition-all cursor-pointer disabled:opacity-40"
                            >
                              <Check size={11} /> {skillSaving[s.id] ? 'Saving…' : 'Approve Skills'}
                            </button>
                            <button
                              onClick={() => handleRefreshScore(s.id)}
                              disabled={refreshingScore[s.id]}
                              title="Recalculate readiness score from live data"
                              className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-brand-border text-[10px] font-bold text-brand-text-secondary hover:text-brand-accent hover:border-brand-accent/30 transition-colors cursor-pointer disabled:opacity-40"
                            >
                              <RefreshCw size={11} className={refreshingScore[s.id] ? 'animate-spin' : ''} />
                              {refreshingScore[s.id] ? 'Refreshing…' : 'Refresh Score'}
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══════ DASHBOARD TAB ═══════ */}
      {activeTab === 'dashboard' && <>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: 'Accepted Students', value: acceptedCount,             color: 'text-brand-accent' },
          { label: 'Quiz Pending',      value: quizPendingCourses.length, color: 'text-yellow-400' },
          { label: 'Interviews',        value: pendingInterviews.length,  color: 'text-orange-400' },
          { label: 'Cert Alerts',       value: certPending.length,        color: 'text-red-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="glass-card p-5 rounded-2xl border border-brand-border/60">
            <p className="text-[10px] text-brand-text-muted uppercase tracking-wider">{label}</p>
            <p className={`text-3xl font-extrabold ${color} mt-1`}>{value}</p>
          </div>
        ))}
        {/* Avg Readiness — separate card with Recalc All button */}
        <div className="glass-card p-5 rounded-2xl border border-brand-border/60 flex flex-col justify-between">
          <p className="text-[10px] text-brand-text-muted uppercase tracking-wider">Avg. Readiness</p>
          <p className="text-3xl font-extrabold text-indigo-400 mt-1">{avgReadiness}%</p>
          <button
            onClick={handleRecalcAll}
            disabled={recalcingAll || students.length === 0}
            className="mt-2 flex items-center gap-1 text-[9px] font-bold text-brand-text-muted hover:text-brand-accent transition-colors cursor-pointer disabled:opacity-40"
          >
            <RefreshCw size={9} className={recalcingAll ? 'animate-spin' : ''} />
            {recalcingAll ? 'Recalculating…' : 'Recalc All'}
          </button>
        </div>
      </div>

      {/* Pending Student Acceptance */}
      {pendingStudents.length > 0 && (
        <div className="glass-card p-6 rounded-3xl border border-yellow-500/20 bg-yellow-950/5">
          <h3 className="text-sm font-bold text-yellow-400 mb-4 flex items-center gap-2">
            <Clock size={16} />
            <span>Pending Student Acceptance ({pendingStudents.length})</span>
          </h3>
          <div className="space-y-3">
            {pendingStudents.map((s) => (
              <div key={s.id} className="flex items-center justify-between p-3 rounded-2xl bg-brand-bg/40 border border-brand-border/60">
                <div>
                  <p className="text-xs font-bold text-brand-text-primary">{s.name}</p>
                  <p className="text-[10px] text-brand-text-muted">{s.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleAcceptStudent(s.id, s.name)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-brand-accent text-brand-bg text-[10px] font-bold hover:bg-brand-accent-hover transition-all cursor-pointer"
                  >
                    <Check size={11} /> Accept
                  </button>
                  <button
                    onClick={() => handleDeclineStudent(s.id)}
                    className="p-1.5 rounded-xl border border-brand-border hover:bg-red-950/20 text-brand-text-muted hover:text-red-400 transition-all cursor-pointer"
                  >
                    <X size={11} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Roster & Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Student Roster Table */}
        <div className="glass-card p-6 rounded-3xl lg:col-span-2 flex flex-col">
          <h3 className="text-sm font-bold text-brand-text-primary mb-4 flex items-center gap-2">
            <Users size={16} className="text-brand-accent" />
            <span>Assigned Students ({acceptedCount})</span>
          </h3>
          {students.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-12 text-center">
              <div className="w-12 h-12 rounded-2xl bg-brand-card border border-brand-border flex items-center justify-center text-brand-text-muted mb-3">
                <Users size={22} />
              </div>
              <p className="text-xs font-semibold text-brand-text-secondary">No students assigned yet</p>
              <p className="text-[10px] text-brand-text-muted mt-1">Students will appear here once approved by an admin.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-brand-border text-xs text-brand-text-muted font-semibold uppercase">
                    <th className="py-3 px-2">Student</th>
                    <th className="py-3 px-2">Readiness</th>
                    <th className="py-3 px-2 text-center">Projects</th>
                    <th className="py-3 px-2 text-right">Last Active</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-border/40 text-xs">
                  {students.map((student) => (
                    <tr key={student.id} className="hover:bg-brand-card-hover/40 transition-colors">
                      <td className="py-4 px-2 flex items-center gap-3">
                        <img src={student.avatar} alt={student.name}
                          className="w-9 h-9 rounded-full object-cover border border-brand-border" />
                        <div>
                          <h4 className="font-bold text-brand-text-primary">{student.name}</h4>
                          <span className="text-[10px] text-brand-text-muted">{student.email}</span>
                        </div>
                      </td>
                      <td className="py-4 px-2">
                        <div className="flex items-center gap-2">
                          <div className="w-20 bg-brand-border h-2 rounded-full overflow-hidden">
                            <div className="bg-brand-accent h-full rounded-full" style={{ width: `${student.readiness}%` }} />
                          </div>
                          <span className="font-bold text-brand-text-primary">{student.readiness}%</span>
                        </div>
                      </td>
                      <td className="py-4 px-2 text-center font-bold text-brand-text-primary">
                        {projectsMap[student.id] || 0}
                      </td>
                      <td className="py-4 px-2 text-right text-brand-text-secondary font-medium">
                        {student.lastActive}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Interview Requests */}
        <div className="glass-card p-6 rounded-3xl flex flex-col">
          <h3 className="text-sm font-bold text-brand-text-primary mb-4 flex items-center gap-2">
            <Calendar size={16} className="text-brand-accent" />
            <span>Mock Interview Requests</span>
          </h3>
          {pendingInterviews.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-8 text-center">
              <Calendar size={28} className="text-brand-text-muted mb-3" />
              <p className="text-xs text-brand-text-muted">No pending requests.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingInterviews.map((req) => (
                <div key={req.id} className="p-4 rounded-2xl bg-brand-bg/50 border border-brand-border/60 space-y-3">
                  <div>
                    <h4 className="text-xs font-bold text-brand-text-primary">{req.studentName}</h4>
                    <p className="text-[11px] text-brand-accent font-medium mt-0.5">{req.type}</p>
                  </div>
                  <div className="text-[10px] text-brand-text-muted flex justify-between">
                    <span>{req.date}</span>
                    <span>{req.timeSlot}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleInterviewAction(req.id, 'approve')}
                      className="flex-1 py-1.5 rounded-lg bg-brand-accent hover:bg-brand-accent-hover text-brand-bg font-bold text-[10px] transition-all flex items-center justify-center gap-1 cursor-pointer">
                      <Check size={12} /> Accept
                    </button>
                    <button onClick={() => handleInterviewAction(req.id, 'decline')}
                      className="p-1.5 rounded-lg border border-brand-border hover:bg-red-950/20 text-brand-text-muted hover:text-red-400 transition-all cursor-pointer">
                      <X size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quiz Approvals Panel */}
      {quizPendingCourses.length > 0 && (
        <div className="glass-card p-6 rounded-3xl border border-yellow-500/20">
          <h3 className="text-sm font-bold text-brand-text-primary mb-4 flex items-center gap-2">
            <Award size={16} className="text-yellow-400" />
            <span>Quiz Results Awaiting Approval ({quizPendingCourses.length})</span>
          </h3>
          <div className="space-y-3">
            {quizPendingCourses.map((course) => {
              const studentName = students.find((s) => s.id === course.studentId)?.name || 'Student';
              return (
                <div key={course.id}
                  className="flex items-center justify-between p-4 rounded-2xl bg-brand-bg/40 border border-brand-border/60">
                  <div>
                    <p className="text-xs font-bold text-brand-text-primary">{course.title}</p>
                    <p className="text-[10px] text-brand-text-muted mt-0.5">
                      {studentName} · Score: <span className="text-yellow-400 font-bold">{course.quizScore}%</span>
                    </p>
                  </div>
                  <button
                    onClick={() => handleApproveQuiz(course)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-brand-accent text-brand-bg text-[10px] font-bold hover:bg-brand-accent-hover transition-all cursor-pointer shadow-md shadow-brand-accent/15"
                  >
                    <Check size={11} /> Approve +10pts
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Course Suggestion Engine */}
      <div className="glass-card p-6 rounded-3xl">
        <h3 className="text-sm font-bold text-brand-text-primary mb-4 flex items-center gap-2">
          <BookOpen size={16} className="text-brand-accent" />
          <span>Course Suggestion Engine</span>
        </h3>

        {suggestionSuccess && (
          <div className="mb-4 p-3 rounded-xl bg-brand-accent-light border border-brand-accent/20 text-brand-accent text-xs font-semibold">
            ✅ Course successfully pushed to student!
          </div>
        )}

        <form onSubmit={handlePushSuggestion} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-brand-text-secondary uppercase">Assign Student</label>
              <select value={selectedStudent} onChange={(e) => setSelectedStudent(e.target.value)}
                className="w-full px-3 py-2.5 bg-brand-bg/50 border border-brand-border rounded-xl text-xs text-brand-text-primary focus:outline-none">
                {students.length === 0 ? (
                  <option value="">No students assigned yet</option>
                ) : (
                  students.map((st) => (
                    <option key={st.id} value={st.id}>{st.name} ({st.readiness}% Ready)</option>
                  ))
                )}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-brand-text-secondary uppercase">Course Title</label>
              <input type="text" value={courseTitle} onChange={(e) => setCourseTitle(e.target.value)}
                className="w-full px-3 py-2.5 bg-brand-bg/50 border border-brand-border rounded-xl text-xs text-brand-text-primary focus:outline-none focus:border-brand-accent"
                placeholder="e.g. Dynamic Programming" required />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-brand-text-secondary uppercase">Resource Link</label>
              <input type="url" value={courseUrl} onChange={(e) => setCourseUrl(e.target.value)}
                className="w-full px-3 py-2.5 bg-brand-bg/50 border border-brand-border rounded-xl text-xs text-brand-text-primary focus:outline-none focus:border-brand-accent"
                placeholder="https://..." required />
            </div>
          </div>

          {/* Quiz Builder Toggle */}
          <button type="button" onClick={() => setShowQuizBuilder(!showQuizBuilder)}
            className="flex items-center gap-2 text-[11px] font-semibold text-brand-accent hover:text-brand-accent-hover transition-colors cursor-pointer">
            {showQuizBuilder ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {showQuizBuilder ? 'Hide Quiz Builder' : 'Add Quiz Questions (optional)'}
            {quizQuestions.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-brand-accent text-brand-bg text-[9px] font-bold">
                {quizQuestions.length}
              </span>
            )}
          </button>

          {showQuizBuilder && (
            <div className="space-y-4 p-4 rounded-2xl bg-brand-bg/40 border border-brand-border/60">
              <p className="text-[10px] font-bold text-brand-text-muted uppercase tracking-wider">Quiz Builder — Add MCQ Questions</p>

              {/* Existing questions */}
              {quizQuestions.map((q, idx) => (
                <div key={idx} className="flex items-start gap-2 p-3 rounded-xl bg-brand-card border border-brand-border text-xs">
                  <div className="flex-1">
                    <p className="font-semibold text-brand-text-primary">{idx + 1}. {q.question}</p>
                    <p className="text-brand-text-muted mt-1">Correct: Option {q.correct} — {q.options[['A','B','C','D'].indexOf(q.correct)]}</p>
                  </div>
                  <button type="button" onClick={() => removeQuizQuestion(idx)}
                    className="p-1 rounded text-red-400 hover:bg-red-950/20 transition-colors cursor-pointer shrink-0">
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}

              {/* Draft question form */}
              <div className="space-y-3">
                <input type="text" placeholder="Question text..."
                  value={draftQuestion.question}
                  onChange={(e) => setDraftQuestion((p) => ({ ...p, question: e.target.value }))}
                  className="w-full px-3 py-2 bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-text-primary focus:outline-none focus:border-brand-accent" />

                <div className="grid grid-cols-2 gap-2">
                  {['A', 'B', 'C', 'D'].map((letter, idx) => (
                    <div key={letter} className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-brand-text-muted w-4 shrink-0">{letter}</span>
                      <input type="text" placeholder={`Option ${letter}`}
                        value={draftQuestion.options[idx]}
                        onChange={(e) => {
                          const opts = [...draftQuestion.options];
                          opts[idx] = e.target.value;
                          setDraftQuestion((p) => ({ ...p, options: opts }));
                        }}
                        className="flex-1 px-2 py-1.5 bg-brand-bg border border-brand-border rounded-lg text-[11px] text-brand-text-primary focus:outline-none focus:border-brand-accent" />
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-3">
                  <label className="text-[10px] font-semibold text-brand-text-secondary uppercase shrink-0">Correct Answer:</label>
                  <select value={draftQuestion.correct}
                    onChange={(e) => setDraftQuestion((p) => ({ ...p, correct: e.target.value }))}
                    className="px-3 py-1.5 bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-text-primary focus:outline-none focus:border-brand-accent">
                    {['A', 'B', 'C', 'D'].map((l) => <option key={l}>{l}</option>)}
                  </select>
                  <button type="button" onClick={addQuizQuestion}
                    disabled={!draftQuestion.question.trim() || draftQuestion.options.some((o) => !o.trim())}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-brand-accent text-brand-bg text-[10px] font-bold hover:bg-brand-accent-hover transition-all cursor-pointer disabled:opacity-40">
                    <Plus size={12} /> Add Question
                  </button>
                </div>
              </div>
            </div>
          )}

          <button type="submit" disabled={students.length === 0}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-brand-accent text-brand-bg font-bold text-xs hover:bg-brand-accent-hover transition-all cursor-pointer shadow-md shadow-brand-accent/15 disabled:opacity-40">
            <Send size={12} />
            <span>Push Suggestion{quizQuestions.length > 0 ? ` + ${quizQuestions.length} Quiz Qs` : ''}</span>
          </button>
        </form>
      </div>

      {/* Certificate Alerts Panel */}
      {certPending.length > 0 && (
        <div className="glass-card p-6 rounded-3xl border border-red-900/20">
          <h3 className="text-sm font-bold text-brand-text-primary mb-4 flex items-center gap-2">
            <Bell size={16} className="text-red-400" />
            <span>Certificate Verification Alerts</span>
            <span className="ml-1 px-2 py-0.5 rounded-full bg-red-950/30 text-red-400 text-[10px] font-bold border border-red-900/30">
              {certPending.length} pending
            </span>
          </h3>
          <div className="space-y-3">
            {certPending.map((cert) => {
              const tierInfo = getCertificatePoints(cert.ocrFields?.issuer || cert.issuer || '');
              const tierColor = TIER_COLORS[tierInfo.tier];
              return (
                <div key={cert.id}
                  className="flex items-center justify-between p-4 rounded-2xl bg-brand-bg/40 border border-brand-border/60 hover:border-brand-accent/30 transition-colors">
                  <div className="flex items-center gap-3">
                    {cert.imageDataUrl && (
                      <img src={cert.imageDataUrl} alt="cert" className="w-12 h-12 rounded-xl object-cover border border-brand-border" />
                    )}
                    <div>
                      <p className="text-xs font-bold text-brand-text-primary">
                        {cert.studentName} — <span className="text-brand-text-secondary">{cert.ocrFields?.courseTitle || cert.title || 'Certificate'}</span>
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${tierColor.text} ${tierColor.bg} ${tierColor.border}`}>
                          {tierInfo.label}
                        </span>
                        <span className="text-[10px] text-brand-text-muted">
                          {cert.createdAt ? new Date(cert.createdAt).toLocaleDateString() : 'Just now'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleOpenCertReview(cert)}
                    disabled={certImageLoading}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-accent/10 border border-brand-accent/20 text-brand-accent text-xs font-bold hover:bg-brand-accent hover:text-brand-bg transition-all cursor-pointer disabled:opacity-50"
                  >
                    {certImageLoading ? (
                      <div className="w-3.5 h-3.5 rounded-full border-2 border-brand-accent/20 border-t-brand-accent animate-spin" />
                    ) : (
                      <ShieldCheck size={14} />
                    )}
                    Review
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Activity Timeline */}
      <div className="glass-card p-6 rounded-3xl">
        <h3 className="text-sm font-bold text-brand-text-primary mb-4 flex items-center gap-2">
          <Activity size={16} className="text-brand-accent" />
          <span>Activity Timeline</span>
        </h3>
        <ActivityFeed uid={user?.uid} role="mentor" studentIds={studentIds} maxItems={15} />
      </div>

      </> /* end dashboard tab */}
    </div>

    {/* Certificate Full Review Modal */}
    {reviewCert && (
      <CertReviewModal
        cert={reviewCert}
        mentorUid={user?.uid}
        onClose={() => setReviewCert(null)}
      />
    )}
    </>
  );
}
