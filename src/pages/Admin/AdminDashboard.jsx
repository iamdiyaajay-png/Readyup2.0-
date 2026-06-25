import { useState, useEffect } from 'react';
import { db } from '../../firebase';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
  getDoc,
  getDocs,
  writeBatch,
  arrayUnion,
  arrayRemove
} from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../../router/routes';

import {
  Users,
  Check,
  X,
  ShieldAlert,
  Settings,
  UserCheck,
  ExternalLink,
  ShieldCheck,
  Trash2,
  Plus,
  Send,
  UserPlus,
  History,
  GraduationCap,
  Briefcase,
  LogOut
} from 'lucide-react';
import { decryptData } from '../../services/encryption';
import { purgeAllDemoData } from '../../services/purgeService';

export default function AdminDashboard() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  // ── Demo Data Purge ────────────────────────────────────────
  const [purging, setPurging] = useState(false);
  const [purgeResult, setPurgeResult] = useState(null);
  const [confirmPurge, setConfirmPurge] = useState(false);

  // ── Score Reset ───────────────────────────────────────────
  const [resetting, setResetting] = useState(false);
  const [resetResult, setResetResult] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const handlePurge = async () => {
    setPurging(true);
    setPurgeResult(null);
    try {
      const result = await purgeAllDemoData();
      setPurgeResult(result);
    } catch (err) {
      console.error('Purge failed:', err);
      setPurgeResult({ error: err.message });
    } finally {
      setPurging(false);
      setConfirmPurge(false);
    }
  };

  // Resets readinessScore + certPoints to 0 for ALL users
  const handleResetScores = async () => {
    setResetting(true);
    setResetResult(null);
    try {
      const snap = await getDocs(collection(db, 'users'));
      const batch = writeBatch(db);
      snap.forEach((docSnap) => {
        batch.update(doc(db, 'users', docSnap.id), {
          readinessScore: 0,
          certPoints: 0,
          readinessBreakdown: {},
        });
      });
      await batch.commit();
      setResetResult({ count: snap.size });
    } catch (err) {
      console.error('Score reset failed:', err);
      setResetResult({ error: err.message });
    } finally {
      setResetting(false);
      setConfirmReset(false);
    }
  };

  const [activeTab, setActiveTab] = useState('approvals'); // 'approvals' | 'assignments' | 'history' | 'settings'

  // Firestore collections states
  const [pendingUsers, setPendingUsers] = useState([]);
  const [students, setStudents] = useState([]);
  const [mentors, setMentors] = useState([]);
  const [adminEmails, setAdminEmails] = useState([]);
  const [historyUsers, setHistoryUsers] = useState([]); // approved + rejected

  // Form states
  const [infoRequestText, setInfoRequestText] = useState({});
  const [showInfoForm, setShowInfoForm] = useState({});
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [assignmentSuccess, setAssignmentSuccess] = useState('');

  // 1. Fetch pending approvals (role !== 'pending', status in pending/info_requested)
  useEffect(() => {
    const q = query(
      collection(db, 'users'),
      where('status', 'in', ['pending', 'info_requested'])
    );

    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const users = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          // Decrypt sensitive form fields for admin review
          const decrypted = data.encryptedDetails ? decryptData(data.encryptedDetails) : {};
          const decryptedProfile = data.encryptedProfile ? decryptData(data.encryptedProfile) : {};
          users.push({ id: docSnap.id, ...data, ...(decryptedProfile || {}), ...(decrypted || {}) });
        });
        setPendingUsers(users);
      },
      (err) => {
        console.error('Admin pending approvals listener failed:', err);
      }
    );

    return () => unsubscribe();
  }, []);

  // 2. Fetch approved students & mentors
  useEffect(() => {
    const qStudents = query(
      collection(db, 'users'),
      where('role', '==', 'student'),
      where('status', '==', 'approved')
    );
    const qMentors = query(
      collection(db, 'users'),
      where('role', '==', 'mentor'),
      where('status', '==', 'approved')
    );

    const unsubStudents = onSnapshot(qStudents, 
      (snapshot) => {
        const list = [];
        snapshot.forEach((doc) => list.push(doc.data()));
        setStudents(list);
      },
      (err) => {
        console.error('Admin students list listener failed:', err);
        setStudents([]);
      }
    );

    const unsubMentors = onSnapshot(qMentors, 
      (snapshot) => {
        const list = [];
        snapshot.forEach((doc) => list.push(doc.data()));
        setMentors(list);
      },
      (err) => {
        console.error('Admin mentors list listener failed:', err);
        setMentors([]);
      }
    );

    return () => {
      unsubStudents();
      unsubMentors();
    };
  }, []);

  // 3. Fetch system settings
  useEffect(() => {
    const settingsRef = doc(db, 'system', 'settings');
    const unsubscribe = onSnapshot(settingsRef, 
      (docSnap) => {
        if (docSnap.exists()) {
          setAdminEmails(docSnap.data().adminEmails || []);
        }
      },
      (err) => {
        console.error('Admin settings listener failed:', err);
        setAdminEmails(['admin@readyup.com']);
      }
    );
    return () => unsubscribe();
  }, []);

  // 4. Fetch approval history (approved + rejected, with decrypted details)
  //    Also builds a name-lookup map so mentor cards can show assigned student names.
  useEffect(() => {
    const q = query(
      collection(db, 'users'),
      where('status', 'in', ['approved', 'rejected'])
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      // Build uid → name map from all users in this snapshot
      const nameMap = {};
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        if (d.uid && d.name) nameMap[d.uid] = d.name;
      });

      const list = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.role === 'student' || data.role === 'mentor') {
          const decrypted = data.encryptedDetails ? decryptData(data.encryptedDetails) : {};
          const entry = { ...data, ...(decrypted || {}) };

          // For mentors: resolve assigned student names from the uid array
          if (data.role === 'mentor' && Array.isArray(data.assignedStudents)) {
            entry.assignedStudentNames = data.assignedStudents
              .map((uid) => nameMap[uid] || uid)
              .filter(Boolean);
          } else if (data.role === 'mentor') {
            entry.assignedStudentNames = [];
          }

          list.push(entry);
        }
      });
      // Sort newest first
      list.sort((a, b) => new Date(b.lastActivity || 0) - new Date(a.lastActivity || 0));
      setHistoryUsers(list);
    }, (err) => {
      console.error('History listener failed:', err);
    });
    return () => unsubscribe();
  }, []);

  const handleSignOut = async () => {
    await logout();
    navigate(ROUTES.LANDING);
  };


  // Action handlers
  const handleApprove = async (userId) => {
    try {
      // Find the user to get their intendedRole
      const userSnap = await getDoc(doc(db, 'users', userId));
      if (!userSnap.exists()) return;
      const userData = userSnap.data();
      // Grant the role the user requested during onboarding
      const grantedRole = userData.intendedRole || 'student';
      await updateDoc(doc(db, 'users', userId), {
        role: grantedRole,
        status: 'approved',
        lastActivity: new Date().toISOString()
      });
    } catch (err) {
      console.error('Failed to approve user:', err);
    }
  };

  const handleReject = async (userId) => {
    try {
      await updateDoc(doc(db, 'users', userId), {
        status: 'rejected',
        lastActivity: new Date().toISOString()
      });
    } catch (err) {
      console.error('Failed to reject user:', err);
    }
  };

  const handleRequestInfo = async (userId) => {
    const note = infoRequestText[userId];
    if (!note || !note.trim()) return;

    try {
      await updateDoc(doc(db, 'users', userId), {
        status: 'info_requested',
        adminNote: note.trim(),
        lastActivity: new Date().toISOString()
      });
      setInfoRequestText((prev) => ({ ...prev, [userId]: '' }));
      setShowInfoForm((prev) => ({ ...prev, [userId]: false }));
    } catch (err) {
      console.error('Failed to request details:', err);
    }
  };

  const handleAssignMentor = async (studentId, mentorId) => {
    if (!studentId) return;
    setAssignmentSuccess('');

    try {
      const studentDocRef = doc(db, 'users', studentId);
      const studentSnap = await getDoc(studentDocRef);

      if (!studentSnap.exists()) return;
      const studentData = studentSnap.data();
      const prevMentorId = studentData.mentorId;

      // 1. Remove student from previous mentor's assignedStudents list
      if (prevMentorId) {
        const prevMentorRef = doc(db, 'users', prevMentorId);
        await updateDoc(prevMentorRef, {
          assignedStudents: arrayRemove(studentId)
        });
      }

      // 2. If assigning to a mentor (not unassigning)
      if (mentorId) {
        const mentorRef = doc(db, 'users', mentorId);
        // Add to new mentor list
        await updateDoc(mentorRef, {
          assignedStudents: arrayUnion(studentId)
        });

        // Update student doc
        await updateDoc(studentDocRef, {
          mentorId: mentorId,
          mentorAssigned: true,
          lastActivity: new Date().toISOString()
        });
        setAssignmentSuccess(`Successfully assigned student to mentor.`);
      } else {
        // Unassigning
        await updateDoc(studentDocRef, {
          mentorId: null,
          mentorAssigned: false,
          lastActivity: new Date().toISOString()
        });
        setAssignmentSuccess('Successfully unassigned mentor.');
      }

      setTimeout(() => setAssignmentSuccess(''), 3000);
    } catch (err) {
      console.error('Mentor assignment failed:', err);
    }
  };

  const handleAddAdmin = async (e) => {
    e.preventDefault();
    if (!newAdminEmail.trim()) return;

    try {
      const settingsRef = doc(db, 'system', 'settings');
      await updateDoc(settingsRef, {
        adminEmails: arrayUnion(newAdminEmail.trim().toLowerCase())
      });
      setNewAdminEmail('');
    } catch (err) {
      console.error('Failed to add admin:', err);
    }
  };

  const handleRemoveAdmin = async (emailToRemove) => {
    if (adminEmails.length <= 1) {
      alert('Must maintain at least one administrator email address.');
      return;
    }
    try {
      const settingsRef = doc(db, 'system', 'settings');
      await updateDoc(settingsRef, {
        adminEmails: arrayRemove(emailToRemove)
      });
    } catch (err) {
      console.error('Failed to remove admin:', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admin Administration Panel</h1>
          <p className="text-sm text-brand-text-secondary mt-1">
            Review onboarding requests, match students with industry guides, and adjust global configuration.
          </p>
        </div>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-red-900/30 text-xs font-bold text-red-400 hover:bg-red-950/20 hover:text-red-300 transition-all cursor-pointer shrink-0"
        >
          <LogOut size={14} />
          Sign Out
        </button>
      </div>

      {/* Tabs Menu */}
      <div className="flex gap-2 border-b border-brand-border/60 pb-px">
        <button
          onClick={() => setActiveTab('approvals')}
          className={`px-5 py-3 text-xs font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'approvals'
              ? 'border-brand-accent text-brand-accent'
              : 'border-transparent text-brand-text-secondary hover:text-brand-text-primary'
          }`}
        >
          <ShieldAlert size={15} />
          <span>Pending Approvals ({pendingUsers.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('assignments')}
          className={`px-5 py-3 text-xs font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'assignments'
              ? 'border-brand-accent text-brand-accent'
              : 'border-transparent text-brand-text-secondary hover:text-brand-text-primary'
          }`}
        >
          <UserCheck size={15} />
          <span>Mentor Assignments</span>
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`px-5 py-3 text-xs font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'history'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-brand-text-secondary hover:text-brand-text-primary'
          }`}
        >
          <History size={15} />
          <span>Approval History ({historyUsers.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`px-5 py-3 text-xs font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'settings'
              ? 'border-brand-accent text-brand-accent'
              : 'border-transparent text-brand-text-secondary hover:text-brand-text-primary'
          }`}
        >
          <Settings size={15} />
          <span>Configuration Settings</span>
        </button>
      </div>

      {/* Tab Contents */}
      <div className="space-y-6">
        {/* TAB 1: PENDING APPROVALS */}
        {activeTab === 'approvals' && (
          <div className="space-y-4">
            {pendingUsers.length === 0 ? (
              <div className="glass-card p-12 text-center rounded-3xl">
                <ShieldCheck className="mx-auto text-brand-text-muted mb-4" size={40} />
                <h3 className="font-bold text-brand-text-primary text-base">All caught up!</h3>
                <p className="text-xs text-brand-text-secondary mt-1">There are no registration requests waiting review.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {pendingUsers.map((applicant) => (
                  <div
                    key={applicant.uid}
                    className="glass-card p-6 rounded-3xl border border-brand-border/60 flex flex-col justify-between"
                  >
                    <div>
                      {/* Badge / Role */}
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h3 className="font-bold text-brand-text-primary text-base leading-tight">
                            {applicant.name}
                          </h3>
                          <span className="text-[10px] text-brand-text-muted">{applicant.email}</span>
                        </div>
                        <span
                          className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                            (applicant.intendedRole || applicant.role) === 'student'
                              ? 'bg-brand-accent-light text-brand-accent border border-brand-accent/25'
                              : 'bg-indigo-950/20 text-indigo-400 border border-indigo-900/30'
                          }`}
                        >
                          {applicant.intendedRole || applicant.role}
                        </span>
                      </div>

                      {/* Dynamic Details */}
                      <div className="bg-brand-bg/50 p-4 rounded-2xl border border-brand-border/40 text-xs space-y-2 mb-4">
                        {(applicant.intendedRole || applicant.role) === 'student' ? (
                          <>
                            <div><span className="text-brand-text-muted">College:</span> <span className="font-semibold text-brand-text-secondary">{applicant.college}</span></div>
                            <div><span className="text-brand-text-muted">Branch / Year:</span> <span className="font-semibold text-brand-text-secondary">{applicant.branch} ({applicant.year})</span></div>
                            <div>
                              <span className="text-brand-text-muted">Skills:</span>{' '}
                              <span className="font-semibold text-brand-text-secondary">
                                {applicant.skills?.join(', ') || 'None'}
                              </span>
                            </div>
                            <div className="flex gap-4 pt-1.5 border-t border-brand-border/40 mt-1.5">
                              {applicant.linkedIn && (
                                <a href={applicant.linkedIn} target="_blank" rel="noreferrer" className="text-brand-accent flex items-center gap-0.5 hover:underline">
                                  LinkedIn <ExternalLink size={10} />
                                </a>
                              )}
                              {applicant.gitHub && (
                                <a href={applicant.gitHub} target="_blank" rel="noreferrer" className="text-brand-text-secondary flex items-center gap-0.5 hover:underline">
                                  GitHub <ExternalLink size={10} />
                                </a>
                              )}
                              {applicant.resumeUrl && (
                                <a href={applicant.resumeUrl} target="_blank" rel="noreferrer" className="text-brand-accent flex items-center gap-0.5 hover:underline">
                                  Resume <ExternalLink size={10} />
                                </a>
                              )}
                            </div>
                          </>
                        ) : (
                          <>
                            <div><span className="text-brand-text-muted">Organization:</span> <span className="font-semibold text-brand-text-secondary">{applicant.organization}</span></div>
                            <div><span className="text-brand-text-muted">Designation:</span> <span className="font-semibold text-brand-text-secondary">{applicant.designation}</span></div>
                            <div><span className="text-brand-text-muted">Experience:</span> <span className="font-semibold text-brand-text-secondary">{applicant.experience} Years</span></div>
                            <div>
                              <span className="text-brand-text-muted">Expertise:</span>{' '}
                              <span className="font-semibold text-brand-text-secondary">
                                {applicant.expertiseAreas?.join(', ') || 'None'}
                              </span>
                            </div>
                            <div className="flex gap-4 pt-1.5 border-t border-brand-border/40 mt-1.5">
                              {applicant.linkedIn && (
                                <a href={applicant.linkedIn} target="_blank" rel="noreferrer" className="text-brand-accent flex items-center gap-0.5 hover:underline">
                                  LinkedIn <ExternalLink size={10} />
                                </a>
                              )}
                            </div>
                          </>
                        )}
                      </div>

                      {/* Request status */}
                      {applicant.status === 'info_requested' && (
                        <div className="mb-4 p-3 rounded-xl bg-yellow-950/20 border border-yellow-900/30 text-[10px] text-yellow-500">
                          <span className="font-bold block mb-0.5">Info Requested:</span>
                          <span className="italic">"{applicant.adminNote}"</span>
                        </div>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="space-y-3">
                      {showInfoForm[applicant.uid] ? (
                        <div className="space-y-2 border-t border-brand-border/60 pt-3">
                          <input
                            type="text"
                            value={infoRequestText[applicant.uid] || ''}
                            onChange={(e) =>
                              setInfoRequestText((prev) => ({ ...prev, [applicant.uid]: e.target.value }))
                            }
                            placeholder="Enter request reason/message..."
                            className="w-full px-3 py-2 bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-text-primary focus:outline-none"
                            required
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleRequestInfo(applicant.uid)}
                              className="flex-1 py-1.5 rounded-lg bg-yellow-500 hover:bg-yellow-600 text-brand-bg text-[10px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer"
                            >
                              <Send size={11} />
                              <span>Submit Request</span>
                            </button>
                            <button
                              onClick={() => setShowInfoForm((prev) => ({ ...prev, [applicant.uid]: false }))}
                              className="px-3 py-1.5 rounded-lg border border-brand-border hover:bg-brand-card text-[10px] font-bold text-brand-text-secondary cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-2 border-t border-brand-border/60 pt-3">
                          <button
                            onClick={() => handleApprove(applicant.uid)}
                            className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl bg-brand-accent text-brand-bg text-xs font-bold hover:bg-brand-accent-hover transition-colors cursor-pointer"
                          >
                            <Check size={14} />
                            <span>Approve</span>
                          </button>
                          <button
                            onClick={() => setShowInfoForm((prev) => ({ ...prev, [applicant.uid]: true }))}
                            className="px-3 py-2 rounded-xl border border-brand-border text-brand-text-secondary hover:text-yellow-500 text-xs font-semibold hover:border-yellow-900/30 transition-colors cursor-pointer"
                          >
                            Ask Info
                          </button>
                          <button
                            onClick={() => handleReject(applicant.uid)}
                            className="p-2 rounded-xl border border-brand-border text-red-400 hover:bg-red-950/20 hover:border-red-900/30 transition-colors cursor-pointer"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: MENTOR ASSIGNMENT */}
        {activeTab === 'assignments' && (
          <div className="space-y-6">
            {assignmentSuccess && (
              <div className="p-3 bg-brand-accent-light border border-brand-accent/20 text-brand-accent text-xs font-semibold rounded-xl animate-fade-in">
                {assignmentSuccess}
              </div>
            )}

            <div className="glass-card rounded-3xl border border-brand-border/60 overflow-hidden">
              <div className="p-6 border-b border-brand-border/60 bg-brand-card/30 flex justify-between items-center">
                <h3 className="font-bold text-sm text-brand-text-primary flex items-center gap-2">
                  <Users size={16} className="text-brand-accent" />
                  <span>Assign Mentors to Students ({students.length} Students)</span>
                </h3>
              </div>

              {students.length === 0 ? (
                <div className="p-12 text-center text-brand-text-muted text-xs">
                  No approved students found in the database.
                </div>
              ) : (
                <div className="divide-y divide-brand-border/40">
                  {students.map((student) => {
                    const currentMentor = mentors.find((m) => m.uid === student.mentorId);
                    return (
                      <div
                        key={student.uid}
                        className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 hover:bg-brand-card-hover/20 transition-colors text-xs"
                      >
                        <div className="flex items-center gap-3">
                          <img
                            src={student.photoURL || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=80&q=80'}
                            alt={student.name}
                            className="w-10 h-10 rounded-full object-cover border border-brand-border shrink-0"
                          />
                          <div>
                            <h4 className="font-bold text-brand-text-primary">{student.name}</h4>
                            <p className="text-[10px] text-brand-text-muted">
                              {student.branch} • {student.college}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="text-right hidden md:block">
                            <span className="text-[10px] text-brand-text-muted block">Assigned Mentor</span>
                            <span className={`font-semibold ${currentMentor ? 'text-brand-accent' : 'text-brand-text-secondary'}`}>
                              {currentMentor ? currentMentor.name : 'Unassigned'}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <select
                              value={student.mentorId || ''}
                              onChange={(e) => handleAssignMentor(student.uid, e.target.value)}
                              className="px-3 py-2 bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-text-primary focus:outline-none cursor-pointer"
                            >
                              <option value="">Unassigned</option>
                              {mentors.map((m) => (
                                <option key={m.uid} value={m.uid}>
                                  {m.name} ({m.organization})
                                </option>
                              ))}
                            </select>
                            <UserPlus size={14} className="text-brand-text-muted shrink-0" />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: CONFIGURATION SETTINGS */}
        {activeTab === 'settings' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Admin emails management */}
            <div className="glass-card p-6 rounded-3xl border border-brand-border/60 lg:col-span-2 space-y-6">
              <div>
                <h3 className="font-bold text-base text-brand-text-primary">Administrator Config Settings</h3>
                <p className="text-xs text-brand-text-secondary mt-1">
                  Manage email addresses authorized for administrator access.
                </p>
              </div>

              {/* Add form */}
              <form onSubmit={handleAddAdmin} className="flex gap-3">
                <input
                  type="email"
                  value={newAdminEmail}
                  onChange={(e) => setNewAdminEmail(e.target.value)}
                  placeholder="admin.name@gmail.com"
                  className="flex-1 px-4 py-2.5 bg-brand-bg/50 border border-brand-border rounded-xl text-xs focus:outline-none focus:border-brand-accent text-brand-text-primary"
                  required
                />
                <button
                  type="submit"
                  className="px-4 py-2.5 rounded-xl bg-brand-accent text-brand-bg hover:bg-brand-accent-hover font-bold text-xs transition-colors flex items-center gap-1.5 cursor-pointer shadow-md shadow-brand-accent/15 shrink-0"
                >
                  <Plus size={14} />
                  <span>Add Admin</span>
                </button>
              </form>

              {/* Admin Emails List */}
              <div className="space-y-2 max-h-80 overflow-y-auto pr-2">
                <h4 className="text-[10px] font-bold text-brand-text-muted uppercase tracking-wider">Authorized Admins</h4>
                {adminEmails.map((email) => (
                  <div
                    key={email}
                    className="p-3 bg-brand-bg/40 border border-brand-border rounded-2xl flex items-center justify-between text-xs transition-colors hover:border-brand-border/90"
                  >
                    <span className="font-medium text-brand-text-secondary">{email}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveAdmin(email)}
                      className="p-1.5 text-brand-text-muted hover:text-red-400 rounded-lg hover:bg-red-950/20 transition-all cursor-pointer"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Config Help details */}
            <div className="glass-card p-6 rounded-3xl border border-brand-border/60 space-y-4">
              <h3 className="font-bold text-sm text-brand-text-primary">System Notes</h3>
              <p className="text-xs text-brand-text-secondary leading-relaxed">
                By comparing email accounts on sign-in against this Firestore collection settings list, you can dynamically configure authorization without writing code or building complex server-side authentication.
              </p>
              <div className="p-3 bg-indigo-950/20 border border-indigo-900/30 rounded-xl text-[10px] text-indigo-400">
                <span className="font-bold block">Document Path:</span>
                <code className="block mt-1 font-mono">system / settings</code>
              </div>
            </div>
          </div>
        )}
        {/* TAB 3: APPROVAL HISTORY */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            {historyUsers.length === 0 ? (
              <div className="glass-card p-12 text-center rounded-3xl">
                <History className="mx-auto text-brand-text-muted mb-4" size={40} />
                <h3 className="font-bold text-brand-text-primary text-base">No history yet</h3>
                <p className="text-xs text-brand-text-secondary mt-1">Approved and rejected users will appear here.</p>
              </div>
            ) : (
              <div className="space-y-8">

                {/* ── STUDENTS SECTION ─────────────────── */}
                {(() => {
                  const studentHistory = historyUsers.filter(u => u.role === 'student');
                  return (
                    <div className="space-y-3">
                      {/* Section header */}
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-brand-accent-light border border-brand-accent/20 flex items-center justify-center text-brand-accent shrink-0">
                          <GraduationCap size={16} />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-brand-text-primary">Students</h3>
                          <p className="text-[10px] text-brand-text-muted">{studentHistory.length} {studentHistory.length === 1 ? 'record' : 'records'}</p>
                        </div>
                        <div className="flex-1 h-px bg-brand-border/60" />
                        <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-brand-accent-light text-brand-accent border border-brand-accent/20">
                          {studentHistory.filter(u => u.status === 'approved').length} Approved &middot; {studentHistory.filter(u => u.status === 'rejected').length} Rejected
                        </span>
                      </div>

                      {studentHistory.length === 0 ? (
                        <div className="glass-card p-6 text-center rounded-2xl border border-brand-border/40">
                          <p className="text-xs text-brand-text-muted">No student history yet</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {studentHistory.map((u) => {
                            const isApproved = u.status === 'approved';
                            return (
                              <div
                                key={u.uid}
                                className="glass-card p-4 rounded-2xl border border-brand-border/60 flex items-center gap-4"
                              >
                                <div className="w-9 h-9 rounded-xl bg-brand-accent-light border border-brand-accent/20 flex items-center justify-center text-brand-accent shrink-0">
                                  <GraduationCap size={16} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-bold text-sm text-brand-text-primary truncate">{u.name}</span>
                                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border ${
                                      isApproved
                                        ? 'bg-emerald-950/20 text-emerald-400 border-emerald-900/30'
                                        : 'bg-red-950/20 text-red-400 border-red-900/30'
                                    }`}>
                                      {isApproved ? '✓ Approved' : '✗ Rejected'}
                                    </span>
                                  </div>
                                  <p className="text-[10px] text-brand-text-muted">{u.email}</p>
                                  <p className="text-xs text-brand-text-secondary mt-0.5">
                                    <span className="font-semibold">{u.branch || '—'}</span>
                                    {u.year && <span className="text-brand-text-muted"> · {u.year}</span>}
                                    {u.college && <span className="text-brand-text-muted"> at {u.college}</span>}
                                  </p>
                                  {u.skills && (
                                    <p className="text-[10px] text-brand-text-muted mt-0.5 truncate">
                                      Skills: {Array.isArray(u.skills) ? u.skills.join(', ') : u.skills}
                                    </p>
                                  )}
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="text-[10px] text-brand-text-muted">
                                    {u.lastActivity
                                      ? new Date(u.lastActivity).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                                      : '—'}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* ── MENTORS SECTION ─────────────────── */}
                {(() => {
                  const mentorHistory = historyUsers.filter(u => u.role === 'mentor');
                  return (
                    <div className="space-y-3">
                      {/* Section header */}
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-indigo-950/40 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
                          <Briefcase size={16} />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-brand-text-primary">Mentors</h3>
                          <p className="text-[10px] text-brand-text-muted">{mentorHistory.length} {mentorHistory.length === 1 ? 'record' : 'records'}</p>
                        </div>
                        <div className="flex-1 h-px bg-brand-border/60" />
                        <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-indigo-950/30 text-indigo-400 border border-indigo-900/30">
                          {mentorHistory.filter(u => u.status === 'approved').length} Approved &middot; {mentorHistory.filter(u => u.status === 'rejected').length} Rejected
                        </span>
                      </div>

                      {mentorHistory.length === 0 ? (
                        <div className="glass-card p-6 text-center rounded-2xl border border-brand-border/40">
                          <p className="text-xs text-brand-text-muted">No mentor history yet</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {mentorHistory.map((u) => {
                            const isApproved = u.status === 'approved';
                            return (
                              <div
                                key={u.uid}
                                className="glass-card p-4 rounded-2xl border border-indigo-900/20 flex items-center gap-4"
                              >
                                <div className="w-9 h-9 rounded-xl bg-indigo-950/40 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
                                  <Briefcase size={16} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-bold text-sm text-brand-text-primary truncate">{u.name}</span>
                                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border ${
                                      isApproved
                                        ? 'bg-emerald-950/20 text-emerald-400 border-emerald-900/30'
                                        : 'bg-red-950/20 text-red-400 border-red-900/30'
                                    }`}>
                                      {isApproved ? '✓ Approved' : '✗ Rejected'}
                                    </span>
                                  </div>
                                  <p className="text-[10px] text-brand-text-muted">{u.email}</p>
                                  <p className="text-xs text-brand-text-secondary mt-0.5">
                                    <span className="font-semibold">{u.designation || '—'}</span>
                                    {u.organization && <span className="text-brand-text-muted"> at {u.organization}</span>}
                                    {u.experience > 0 && <span className="text-brand-text-muted"> · {u.experience}yr exp</span>}
                                  </p>
                                  {/* Assigned students */}
                                  <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                                      (u.assignedStudentNames?.length || 0) > 0
                                        ? 'bg-brand-accent-light text-brand-accent border-brand-accent/25'
                                        : 'bg-brand-bg text-brand-text-muted border-brand-border/60'
                                    }`}>
                                      {(u.assignedStudentNames?.length || 0)} student{(u.assignedStudentNames?.length || 0) !== 1 ? 's' : ''} assigned
                                    </span>
                                    {u.assignedStudentNames?.length > 0 && (
                                      <span className="text-[10px] text-brand-text-muted truncate">
                                        {u.assignedStudentNames.join(' · ')}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="text-[10px] text-brand-text-muted">
                                    {u.lastActivity
                                      ? new Date(u.lastActivity).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                                      : '—'}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}

              </div>
            )}
          </div>
        )}

        {/* ── Purge Demo Data Panel ───────────────────────────────── */}
        <div className="mt-8 p-6 rounded-3xl border border-red-900/30 bg-red-950/10 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-red-400 flex items-center gap-2">
                <Trash2 size={16} /> Purge Demo &amp; Placeholder Data
              </h3>
              <p className="text-xs text-brand-text-muted mt-1 max-w-xl">
                Removes all course suggestions with placeholder URLs (example.com, #, demo.com), demo projects, and any users flagged as demo accounts from Firestore. This action is irreversible.
              </p>
            </div>
            {!confirmPurge ? (
              <button
                onClick={() => setConfirmPurge(true)}
                className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl border border-red-900/30 text-red-400 hover:bg-red-950/20 text-xs font-bold transition-colors cursor-pointer"
              >
                <Trash2 size={14} /> Purge Demo Data
              </button>
            ) : (
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs font-bold text-red-400">Are you sure?</span>
                <button
                  onClick={handlePurge}
                  disabled={purging}
                  className="px-3 py-2 rounded-xl bg-red-600 text-white text-xs font-bold hover:bg-red-700 transition-colors cursor-pointer disabled:opacity-40"
                >
                  {purging ? 'Purging…' : 'Yes, Purge'}
                </button>
                <button
                  onClick={() => setConfirmPurge(false)}
                  className="px-3 py-2 rounded-xl border border-brand-border text-xs font-semibold text-brand-text-secondary hover:text-brand-text-primary cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
          {purgeResult && !purgeResult.error && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-brand-accent/10 border border-brand-accent/20 text-xs text-brand-accent font-semibold">
              ✅ Purge complete — {purgeResult.courses} courses, {purgeResult.projects} projects, {purgeResult.users} users removed.
            </div>
          )}
          {purgeResult?.error && (
            <div className="p-3 rounded-xl bg-red-950/20 border border-red-900/30 text-xs text-red-400">
              ❌ Error: {purgeResult.error}
            </div>
          )}
        </div>

        {/* ── Reset All Scores Panel ──────────────────────────────── */}
        <div className="mt-4 p-6 rounded-3xl border border-orange-900/30 bg-orange-950/10 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-orange-400 flex items-center gap-2">
                <Settings size={16} /> Reset All Readiness Scores
              </h3>
              <p className="text-xs text-brand-text-muted mt-1 max-w-xl">
                Sets <code className="text-orange-400/80">readinessScore</code>, <code className="text-orange-400/80">certPoints</code>, and breakdown to <strong>0</strong> for every student, mentor, and admin in Firestore. Leaderboard points will update immediately.
              </p>
            </div>
            {!confirmReset ? (
              <button
                onClick={() => setConfirmReset(true)}
                className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl border border-orange-900/30 text-orange-400 hover:bg-orange-950/20 text-xs font-bold transition-colors cursor-pointer"
              >
                <Settings size={14} /> Reset to 0
              </button>
            ) : (
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs font-bold text-orange-400">Reset ALL scores to 0?</span>
                <button
                  onClick={handleResetScores}
                  disabled={resetting}
                  className="px-3 py-2 rounded-xl bg-orange-600 text-white text-xs font-bold hover:bg-orange-700 transition-colors cursor-pointer disabled:opacity-40"
                >
                  {resetting ? 'Resetting…' : 'Yes, Reset'}
                </button>
                <button
                  onClick={() => setConfirmReset(false)}
                  className="px-3 py-2 rounded-xl border border-brand-border text-xs font-semibold text-brand-text-secondary hover:text-brand-text-primary cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
          {resetResult && !resetResult.error && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-brand-accent/10 border border-brand-accent/20 text-xs text-brand-accent font-semibold">
              ✅ Reset complete — {resetResult.count} user(s) set to 0 pts.
            </div>
          )}
          {resetResult?.error && (
            <div className="p-3 rounded-xl bg-red-950/20 border border-red-900/30 text-xs text-red-400">
              ❌ Error: {resetResult.error}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
