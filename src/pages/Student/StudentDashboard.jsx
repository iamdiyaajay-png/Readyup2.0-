import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ROUTES } from '../../router/routes';
import { Link } from 'react-router-dom';
import { db } from '../../firebase';
import {
  collection, query, where, onSnapshot, doc, getDoc
} from 'firebase/firestore';
import {
  Award, CheckCircle2, Clock, XCircle,
  MessageSquare, Sparkles, Zap, Activity,
  RefreshCw, ShieldCheck, TrendingUp, TrendingDown
} from 'lucide-react';
import ActivityFeed from '../../components/common/ActivityFeed';
import { recalculateReadiness } from '../../services/recalcService';
import { getReadinessBadge, SKILL_CATEGORIES } from '../../services/pointsService';

export default function StudentDashboard() {
  const { user } = useAuth();
  const readinessScore = user?.readinessScore || 0;
  const badge = getReadinessBadge(readinessScore);
  const breakdown = user?.readinessBreakdown || {};

  // Build skill matrix from user data
  const skillMatrix = user?.skillMatrix || {};
  const skillList = Object.values(SKILL_CATEGORIES).map((cat) => ({
    ...cat,
    score: skillMatrix[cat.key] || 0,
  })).sort((a, b) => b.score - a.score);
  const strengths = skillList.filter(s => s.score >= 50).slice(0, 3);
  const weakAreas = skillList.filter(s => s.score < 50).slice(0, 3);

  const [mentor, setMentor]               = useState(null);
  const [projectCount, setProjectCount]   = useState(0);
  const [rank, setRank]                   = useState('—');
  const [interviewCount, setInterviewCount] = useState(0);
  const [certs, setCerts]                 = useState([]);
  const [refreshing, setRefreshing]       = useState(false);
  const [refreshMsg, setRefreshMsg]       = useState('');

  // Fetch project count
  useEffect(() => {
    if (!user?.uid) { setProjectCount(0); return; }
    const q = query(collection(db, 'projects'), where('studentId', '==', user.uid));
    const unsub = onSnapshot(q, (snap) => setProjectCount(snap.size), () => setProjectCount(0));
    return () => unsub();
  }, [user?.uid]);

  // Fetch interview count
  useEffect(() => {
    if (!user?.uid) { setInterviewCount(0); return; }
    const q = query(
      collection(db, 'mockInterviews'),
      where('studentId', '==', user.uid),
      where('status', '==', 'approved')
    );
    const unsub = onSnapshot(q,
      (snap) => setInterviewCount(snap.size),
      () => setInterviewCount(0)
    );
    return () => unsub();
  }, [user?.uid]);

  // Fetch leaderboard rank
  useEffect(() => {
    if (!user?.uid) { setRank('—'); return; }
    const q = query(collection(db, 'users'), where('role', '==', 'student'), where('status', '==', 'approved'));
    const unsub = onSnapshot(q, (snap) => {
      const list = [];
      snap.forEach((d) => {
        const data = d.data();
        list.push({ uid: d.id, score: data.readinessScore || 0 });
      });
      list.sort((a, b) => b.score - a.score);
      const idx = list.findIndex((s) => s.uid === user.uid);
      setRank(idx !== -1 ? `#${idx + 1}` : 'N/A');
    }, () => setRank('N/A'));
    return () => unsub();
  }, [user?.uid]);

  // Fetch assigned mentor
  useEffect(() => {
    let mounted = true;
    if (!user?.mentorId) { setMentor(null); return; }
    const fetch = async () => {
      try {
        const snap = await getDoc(doc(db, 'users', user.mentorId));
        if (mounted && snap.exists()) setMentor(snap.data());
      } catch (err) { console.error('Mentor fetch error:', err); }
    };
    fetch();
    return () => { mounted = false; };
  }, [user?.mentorId]);

  // Fetch submitted certificates (certPending)
  useEffect(() => {
    if (!user?.uid) { setCerts([]); return; }
    const q = query(collection(db, 'certPending'), where('studentId', '==', user.uid));
    const unsub = onSnapshot(q, (snap) => {
      const list = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      list.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
      setCerts(list);
    }, () => setCerts([]));
    return () => unsub();
  }, [user?.uid]);

  // ── Refresh Score Handler ─────────────────────────────────────
  const handleRefreshScore = useCallback(async () => {
    if (!user?.uid || refreshing) return;
    setRefreshing(true);
    setRefreshMsg('');
    try {
      const newScore = await recalculateReadiness(user.uid);
      setRefreshMsg(`Score updated to ${newScore}%`);
      setTimeout(() => setRefreshMsg(''), 4000);
    } catch (err) {
      console.error('Refresh score failed:', err);
      setRefreshMsg('Refresh failed. Try again.');
    } finally {
      setRefreshing(false);
    }
  }, [user?.uid, refreshing]);

  // Mentor feedback card
  const feedback = mentor
    ? [{ id: '1', mentor: mentor.name, message: `Hello ${user?.name?.split(' ')[0] || 'there'}! I am your assigned mentor from ${mentor.organization || 'your organization'}. Feel free to message me in Chat if you have questions!`, date: 'Pinned' }]
    : [{ id: '1', mentor: 'Placement Officer', message: 'An administrator will assign you an industry mentor shortly. In the meantime, complete your projects profile and check your resume score.', date: 'Welcome' }];

  const certStatusConfig = {
    pending:       { label: 'Pending Review', icon: Clock,         color: 'text-yellow-400 bg-yellow-950/20 border-yellow-500/20' },
    approved:      { label: 'Approved',       icon: CheckCircle2,  color: 'text-brand-accent bg-brand-accent-light border-brand-accent/20' },
    rejected:      { label: 'Rejected',       icon: XCircle,       color: 'text-red-400 bg-red-950/20 border-red-900/20' },
    needs_reupload:{ label: 'Re-upload',      icon: RefreshCw,     color: 'text-orange-400 bg-orange-950/20 border-orange-500/20' },
    review_required:{ label: 'Under Review', icon: ShieldCheck,   color: 'text-purple-400 bg-purple-950/20 border-purple-500/20' },
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="relative overflow-hidden p-8 rounded-3xl bg-gradient-to-r from-brand-card to-brand-card/40 border border-brand-border/60">
        <div className="absolute top-0 right-0 w-80 h-full bg-brand-accent/5 blur-3xl rounded-full pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 bg-brand-accent-light px-3 py-1 rounded-full border border-brand-accent/20">
              <Zap size={14} className="text-brand-accent" />
              <span className="text-xs font-bold text-brand-accent uppercase tracking-wider">Placement Status</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Your Placement Journey</h1>
            <p className="text-sm text-brand-text-secondary max-w-xl">
              Upload certificates for mentor approval, add projects, and track your readiness score.
            </p>
          </div>
          <div className="flex items-center gap-4 bg-brand-bg/50 p-4 rounded-2xl border border-brand-border/80">
            <Link to={ROUTES.RESUME_REVIEWER}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-accent text-brand-bg text-sm font-bold hover:bg-brand-accent-hover transition-all">
              <Sparkles size={16} />
              <span>Review Resume</span>
            </Link>
            <Link to={ROUTES.CHAT}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-card border border-brand-border text-brand-text-primary text-sm font-semibold hover:bg-brand-card-hover transition-colors">
              <MessageSquare size={16} />
              <span>Chat Mentor</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Dashboard Widgets */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Readiness Score Ring */}
        <div className="glass-card p-6 rounded-3xl flex flex-col items-center justify-center text-center">
          <div className="flex items-center justify-between w-full mb-2">
            <h3 className="text-sm font-bold text-brand-text-secondary">Readiness Rating</h3>
            <button
              onClick={handleRefreshScore}
              disabled={refreshing}
              title="Recalculate score from live data"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-brand-border text-[10px] font-bold text-brand-text-muted hover:text-brand-accent hover:border-brand-accent/30 transition-colors cursor-pointer disabled:opacity-40"
            >
              <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} />
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>

          {refreshMsg && (
            <p className="text-[10px] font-semibold text-brand-accent mb-2 animate-pulse">{refreshMsg}</p>
          )}

          <div className="relative w-44 h-44 flex items-center justify-center my-4">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="40" stroke="#1f2937" strokeWidth="8" fill="transparent" />
              <circle cx="50" cy="50" r="40" stroke="#10b981" strokeWidth="8" fill="transparent"
                strokeDasharray="251.2"
                strokeDashoffset={251.2 - (251.2 * readinessScore) / 100}
                strokeLinecap="round"
                className="transition-all duration-1000 ease-out" />
            </svg>
            <div className="absolute flex flex-col items-center">
              <span className="text-4xl font-extrabold tracking-tight">{readinessScore}%</span>
              <span className={`text-[10px] font-bold uppercase tracking-wider mt-1 ${badge.color}`}>{badge.label}</span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 w-full pt-4 border-t border-brand-border text-center text-xs">
            <div>
              <span className="text-brand-text-secondary block">Projects</span>
              <span className="font-bold text-brand-text-primary mt-1 block">{projectCount}</span>
            </div>
            <div>
              <span className="text-brand-text-secondary block">Interviews</span>
              <span className="font-bold text-brand-text-primary mt-1 block">
                {interviewCount > 0 ? interviewCount : '—'}
              </span>
            </div>
            <div>
              <span className="text-brand-text-secondary block">Rank</span>
              <span className="font-bold text-brand-accent mt-1 block">{rank}</span>
            </div>
          </div>
        </div>

        {/* Skill Matrix */}
        <div className="glass-card p-6 rounded-3xl lg:col-span-3">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-brand-text-primary flex items-center gap-2">
              <Zap size={16} className="text-brand-accent" /> Skill Matrix
            </h3>
            <span className="text-[10px] text-brand-text-muted">Updated by mentor cert approvals</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {skillList.map((cat) => (
              <div key={cat.key} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-brand-text-secondary flex items-center gap-1">
                    <span>{cat.icon}</span> {cat.label}
                  </span>
                  <span className={`text-[10px] font-bold ${
                    cat.score >= 75 ? 'text-brand-accent' : cat.score >= 50 ? 'text-yellow-400' :
                    cat.score > 0 ? 'text-orange-400' : 'text-brand-text-muted'
                  }`}>{cat.score}</span>
                </div>
                <div className="h-1.5 bg-brand-border rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      cat.score >= 75 ? 'bg-brand-accent' : cat.score >= 50 ? 'bg-yellow-400' :
                      cat.score > 0 ? 'bg-orange-400' : 'bg-brand-border'
                    }`}
                    style={{ width: `${cat.score}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Strengths + Weak Areas */}
          {(strengths.length > 0 || weakAreas.length > 0) && (
            <div className="grid grid-cols-2 gap-4 mt-5 pt-4 border-t border-brand-border/40">
              {strengths.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-brand-accent flex items-center gap-1 mb-2">
                    <TrendingUp size={11} /> Strength Areas
                  </p>
                  {strengths.map((s) => (
                    <p key={s.key} className="text-[10px] text-brand-text-secondary flex items-center gap-1.5 mb-1">
                      <span>{s.icon}</span> {s.label} <span className="font-bold text-brand-accent">{s.score}</span>
                    </p>
                  ))}
                </div>
              )}
              {weakAreas.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-orange-400 flex items-center gap-1 mb-2">
                    <TrendingDown size={11} /> Needs Work
                  </p>
                  {weakAreas.map((s) => (
                    <p key={s.key} className="text-[10px] text-brand-text-secondary flex items-center gap-1.5 mb-1">
                      <span>{s.icon}</span> {s.label} <span className="font-bold text-orange-400">{s.score}</span>
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Readiness Breakdown */}
        {Object.keys(breakdown).length > 0 && (
          <div className="glass-card p-6 rounded-3xl lg:col-span-3">
            <h3 className="text-sm font-bold text-brand-text-primary mb-4 flex items-center gap-2">
              <Activity size={16} className="text-brand-accent" /> Readiness Breakdown
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {[
                { key: 'programming',   label: 'Programming',   weight: '30%' },
                { key: 'projects',      label: 'Projects',      weight: '25%' },
                { key: 'certs',         label: 'Certifications',weight: '15%' },
                { key: 'aptitude',      label: 'Aptitude',      weight: '10%' },
                { key: 'communication', label: 'Communication',  weight: '10%' },
                { key: 'leadership',    label: 'Leadership',    weight: '10%' },
              ].map(({ key, label, weight }) => (
                <div key={key}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-semibold text-brand-text-secondary">{label}</span>
                    <span className="text-[9px] text-brand-text-muted">{weight}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-brand-border rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand-accent rounded-full transition-all duration-700"
                        style={{ width: `${breakdown[key] || 0}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-bold text-brand-accent w-6 text-right">{breakdown[key] || 0}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* My Certificates */}
        <div className="glass-card p-6 rounded-3xl lg:col-span-2 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ShieldCheck size={18} className="text-brand-accent" />
              <h3 className="text-sm font-bold text-brand-text-primary">My Certificates</h3>
            </div>
            <Link to={ROUTES.CERTIFICATE_VALIDATOR}
              className="text-[10px] font-bold text-brand-accent hover:underline">
              + Upload New
            </Link>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto max-h-56 pr-1">
            {certs.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center py-8 text-center">
                <Award size={28} className="text-brand-text-muted mb-3" />
                <p className="text-xs font-semibold text-brand-text-secondary">No certificates uploaded yet</p>
                <p className="text-[10px] text-brand-text-muted mt-1">
                  Upload a certificate for your mentor to verify and award points.
                </p>
              </div>
            ) : (
              certs.map((cert) => {
                const cfg = certStatusConfig[cert.status] || certStatusConfig.pending;
                const Icon = cfg.icon;
                return (
                  <div key={cert.id}
                    className="p-3 rounded-2xl bg-brand-bg/40 border border-brand-border flex items-center gap-3">
                    {cert.imageDataUrl && (
                      <img src={cert.imageDataUrl} alt="cert"
                        className="w-10 h-10 rounded-lg object-cover border border-brand-border shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-brand-text-primary truncate">
                        {cert.ocrFields?.courseTitle || cert.title || 'Certificate'}
                      </p>
                      <p className="text-[10px] text-brand-text-muted">
                        {cert.ocrFields?.issuer || 'Unknown issuer'}
                      </p>
                    </div>
                    <span className={`flex items-center gap-1 text-[9px] font-bold px-2 py-1 rounded-full border ${cfg.color}`}>
                      <Icon size={10} /> {cfg.label}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Mentor Feedback */}
        <div className="glass-card p-6 rounded-3xl lg:col-span-3">
          <div className="flex items-center gap-2 mb-4">
            <Award size={18} className="text-brand-accent" />
            <h3 className="text-sm font-bold text-brand-text-primary">
              {mentor ? 'Message from Your Mentor' : 'Placement Officer Note'}
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {feedback.map((item) => (
              <div key={item.id} className="p-4 rounded-2xl bg-brand-bg/30 border border-brand-border/60">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-brand-accent">{item.mentor}</span>
                  <span className="text-[10px] text-brand-text-muted">{item.date}</span>
                </div>
                <p className="text-xs text-brand-text-secondary leading-relaxed">"{item.message}"</p>
              </div>
            ))}
          </div>
        </div>

        {/* Activity Feed */}
        <div className="glass-card p-6 rounded-3xl lg:col-span-3">
          <div className="flex items-center gap-2 mb-4">
            <Activity size={18} className="text-brand-accent" />
            <h3 className="text-sm font-bold text-brand-text-primary">My Activity History</h3>
          </div>
          <ActivityFeed uid={user?.uid} role="student" maxItems={10} />
        </div>
      </div>
    </div>
  );
}
