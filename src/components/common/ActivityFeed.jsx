import { useState, useEffect } from 'react';
import { db } from '../../firebase';
import {
  collection, query, where, orderBy, limit, onSnapshot, or
} from 'firebase/firestore';
import {
  BookOpen, CheckCircle2, Plus, User, Award, Shield,
  FileText, Clock, Zap
} from 'lucide-react';

const ACTION_CONFIG = {
  COURSE_STARTED:       { icon: BookOpen,     color: 'text-blue-400',    bg: 'bg-blue-950/30',    label: 'Course Started' },
  COURSE_COMPLETED:     { icon: CheckCircle2, color: 'text-brand-accent', bg: 'bg-brand-accent-light', label: 'Course Completed' },
  QUIZ_PASSED:          { icon: Award,        color: 'text-yellow-400',  bg: 'bg-yellow-950/30',  label: 'Quiz Passed' },
  QUIZ_APPROVED:        { icon: Shield,       color: 'text-indigo-400',  bg: 'bg-indigo-950/30',  label: 'Quiz Approved' },
  PROJECT_ADDED:        { icon: Plus,         color: 'text-purple-400',  bg: 'bg-purple-950/30',  label: 'Project Added' },
  PROFILE_UPDATED:      { icon: User,         color: 'text-brand-text-secondary', bg: 'bg-brand-card', label: 'Profile Updated' },
  COURSE_PUSHED:        { icon: Zap,          color: 'text-orange-400',  bg: 'bg-orange-950/30',  label: 'Course Pushed' },
  STUDENT_ACCEPTED:     { icon: User,         color: 'text-brand-accent', bg: 'bg-brand-accent-light', label: 'Student Accepted' },
  CERTIFICATE_VALIDATED:{ icon: Award,        color: 'text-yellow-400',  bg: 'bg-yellow-950/30',  label: 'Certificate Validated' },
  RESUME_REVIEWED:      { icon: FileText,     color: 'text-indigo-400',  bg: 'bg-indigo-950/30',  label: 'Resume Reviewed' },
};

function formatTimestamp(ts) {
  if (!ts) return 'Just now';
  const date = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/**
 * ActivityFeed — reusable feed component.
 *
 * Props:
 *   uid        — current user UID (always required)
 *   role       — 'student' | 'mentor'
 *   studentIds — (mentor only) array of assigned student UIDs to show their activity too
 *   maxItems   — max number of items to show (default 10)
 */
export default function ActivityFeed({ uid, role, studentIds = [], maxItems = 10 }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) { setLoading(false); return; }

    // Build the UIDs to watch
    const uidsToWatch = role === 'mentor'
      ? [uid, ...studentIds]
      : [uid];

    // Firestore "in" has a limit of 30 — chunk if needed
    const chunk = uidsToWatch.slice(0, 30);

    const q = query(
      collection(db, 'activityLog'),
      where('uid', 'in', chunk),
      orderBy('timestamp', 'desc'),
      limit(maxItems)
    );

    const unsub = onSnapshot(q,
      (snap) => {
        const list = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
        setEntries(list);
        setLoading(false);
      },
      (err) => {
        console.warn('[ActivityFeed] snapshot error:', err.message);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [uid, role, JSON.stringify(studentIds), maxItems]); // eslint-disable-line

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-start gap-3 animate-pulse">
            <div className="w-8 h-8 rounded-xl skeleton shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-2/3 rounded skeleton" />
              <div className="h-2.5 w-1/3 rounded skeleton" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <div className="w-12 h-12 rounded-2xl bg-brand-card border border-brand-border flex items-center justify-center text-brand-text-muted mb-3">
          <Clock size={22} />
        </div>
        <p className="text-xs font-semibold text-brand-text-secondary">No activity yet</p>
        <p className="text-[10px] text-brand-text-muted mt-1">
          {role === 'mentor'
            ? 'Your actions and your students\' progress will appear here.'
            : 'Start a course, add a project, or review your resume to see activity.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) => {
        const cfg = ACTION_CONFIG[entry.action] || {
          icon: Clock, color: 'text-brand-text-muted', bg: 'bg-brand-card', label: entry.action
        };
        const Icon = cfg.icon;
        const isOwnAction = entry.uid === uid;

        return (
          <div key={entry.id} className="flex items-start gap-3 group">
            {/* Icon */}
            <div className={`w-8 h-8 rounded-xl ${cfg.bg} border border-brand-border/40 flex items-center justify-center shrink-0 mt-0.5`}>
              <Icon size={14} className={cfg.color} />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              {role === 'mentor' && !isOwnAction && (
                <span className="text-[9px] font-bold text-brand-accent uppercase tracking-wider">
                  Student · </span>
              )}
              {role === 'mentor' && isOwnAction && (
                <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-wider">
                  You · </span>
              )}
              <p className="text-xs text-brand-text-primary leading-snug">{entry.detail}</p>
              <p className="text-[10px] text-brand-text-muted mt-0.5">{formatTimestamp(entry.timestamp)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
