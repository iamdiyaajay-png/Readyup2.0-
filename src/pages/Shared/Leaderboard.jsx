import { useState, useEffect } from 'react';
import { Trophy, Star, RefreshCw } from 'lucide-react';
import { db } from '../../firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';

export default function Leaderboard() {
  const { user } = useAuth();
  const [leaders, setLeaders] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchLeaders = async () => {
      setLoading(true);
      const studentList = [];

      try {
        // Fetch projects count map
        const projectsMap = {};
        try {
          const projectsSnap = await getDocs(collection(db, 'projects'));
          projectsSnap.forEach((doc) => {
            const data = doc.data();
            if (data.studentId) {
              projectsMap[data.studentId] = (projectsMap[data.studentId] || 0) + 1;
            }
          });
        } catch (projErr) {
          console.warn('Failed to fetch projects for leaderboard:', projErr);
        }

        // Fetch completed courses count map
        const coursesMap = {};
        try {
          const coursesSnap = await getDocs(
            query(collection(db, 'courseSuggestions'), where('status', '==', 'completed'))
          );
          coursesSnap.forEach((doc) => {
            const data = doc.data();
            if (data.studentId) {
              coursesMap[data.studentId] = (coursesMap[data.studentId] || 0) + 1;
            }
          });
        } catch (courseErr) {
          console.warn('Failed to fetch completed courses for leaderboard:', courseErr);
        }

        // Fetch approved students
        const q = query(
          collection(db, 'users'),
          where('role', '==', 'student'),
          where('status', '==', 'approved')
        );
        const querySnapshot = await getDocs(q);
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          const readiness = data.readinessScore || 0;
          const certPts   = data.certPoints    || 0;
          studentList.push({
            uid: data.uid,
            name: data.name,
            readinessScore: readiness,
            certPoints: certPts,
            // Combined total: readiness score + cert points
            points: readiness + certPts,
            courses: coursesMap[data.uid] || 0,
            projects: projectsMap[data.uid] || 0,
            isReal: true
          });
        });
      } catch (err) {
        console.error('Failed to fetch leaderboard students:', err);
      }

      // Sort by combined total descending — only real submitted data
      studentList.sort((a, b) => b.points - a.points);

      // Map ranks and badges
      const ranked = studentList.map((lead, idx) => {
        let badge = 'Active Scholar';
        if (idx === 0) badge = '🥇 Gold Elite';
        else if (idx === 1) badge = '🥈 Silver Master';
        else if (idx === 2) badge = '🥉 Bronze Pro';
        return { ...lead, rank: idx + 1, badge };
      });

      setLeaders(ranked);
      setLoading(false);
    };

  useEffect(() => {
    fetchLeaders();
  }, [user?.uid]); // re-fetch when user identity changes (e.g. after cert approval updates readinessScore)


  if (loading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center">
        <div className="w-10 h-10 rounded-full border-4 border-yellow-500/20 border-t-yellow-500 animate-spin mb-3"></div>
        <p className="text-brand-text-secondary text-xs">Syncing Rankings...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="relative overflow-hidden p-8 rounded-3xl bg-gradient-to-r from-yellow-950/20 to-brand-card/50 border border-brand-border/60">
        <div className="absolute top-0 right-0 w-80 h-full bg-yellow-500/5 blur-3xl rounded-full pointer-events-none"></div>
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 bg-yellow-950/40 px-3 py-1 rounded-full border border-yellow-500/20">
              <Trophy size={14} className="text-yellow-500" />
              <span className="text-xs font-bold text-yellow-500 uppercase tracking-wider">Honor Roll</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Global Leaderboard</h1>
            <p className="text-sm text-brand-text-secondary max-w-xl">
              Rankings are updated based on readiness score — including approved certificates, projects, and courses.
            </p>
          </div>
          <button
            onClick={fetchLeaders}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-brand-border text-xs font-semibold text-brand-text-secondary hover:text-brand-accent hover:border-brand-accent/30 transition-all cursor-pointer shrink-0"
          >
            <RefreshCw size={13} />
            Refresh
          </button>
        </div>
      </div>

      {/* Podium Cards */}
      {leaders.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {leaders.slice(0, 3).map((lead) => (
            <div
              key={lead.uid}
              className={`glass-card p-6 rounded-3xl text-center border relative overflow-hidden ${
                lead.rank === 1 ? 'border-yellow-500/40 bg-yellow-950/5' : 'border-brand-border'
              }`}
            >
              {lead.rank === 1 && (
                <div className="absolute top-3 right-3 text-yellow-500">
                  <Star size={16} fill="currentColor" />
                </div>
              )}
              <span className="text-xs font-bold text-brand-text-muted uppercase">Rank {lead.rank}</span>
              <h3 className="text-base font-bold text-brand-text-primary mt-2">{lead.name}</h3>
              <span className="inline-block text-[10px] px-2 py-0.5 rounded-full bg-brand-bg border border-brand-border/60 text-brand-accent font-semibold mt-1">
                {lead.badge}
              </span>
              <div className="mt-4 text-3xl font-extrabold text-brand-text-primary">{lead.points} pts</div>
              <div className="mt-1 text-[10px] text-brand-text-muted">
                <span className="text-brand-accent font-semibold">{lead.readinessScore}</span> Readiness
                {' + '}
                <span className="text-yellow-400 font-semibold">🎓 {lead.certPoints}</span> Cert
              </div>
              <div className="flex justify-around text-[10px] text-brand-text-secondary mt-4 border-t border-brand-border/40 pt-3">
                <span>{lead.courses} Courses</span>
                <span>{lead.projects} Projects</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Full Leaderboard Table */}
      {leaders.length > 0 ? (
        <div className="glass-card p-6 rounded-3xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-brand-border text-xs text-brand-text-muted font-semibold uppercase">
                   <th className="py-3 px-4">Rank</th>
                   <th className="py-3 px-4">Name</th>
                   <th className="py-3 px-4">Tier Status</th>
                   <th className="py-3 px-4 text-center">Courses</th>
                   <th className="py-3 px-4 text-center">Projects</th>
                   <th className="py-3 px-4 text-center">Readiness</th>
                   <th className="py-3 px-4 text-center">Cert pts</th>
                   <th className="py-3 px-4 text-right">Total Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border/40 text-xs">
                {leaders.map((lead) => {
                  const isMe = lead.uid === user?.uid || (lead.isReal && lead.name === user?.name);
                  return (
                    <tr
                      key={lead.uid}
                      className={`hover:bg-brand-card-hover/40 transition-colors ${
                        isMe ? 'bg-brand-accent-light/10 border-l-2 border-brand-accent' : ''
                      }`}
                    >
                      <td className="py-4 px-4 font-bold text-brand-text-primary">#{lead.rank}</td>
                      <td className="py-4 px-4 font-bold text-brand-text-primary">
                        {lead.name} {isMe && <span className="text-[10px] text-brand-accent ml-1 font-semibold">(You)</span>}
                      </td>
                      <td className="py-4 px-4">
                        <span className="px-2 py-0.5 rounded bg-brand-bg text-[10px] text-brand-text-secondary border border-brand-border">
                          {lead.badge}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-center font-bold text-brand-text-primary">{lead.courses}</td>
                      <td className="py-4 px-4 text-center font-bold text-brand-text-primary">{lead.projects}</td>
                      <td className="py-4 px-4 text-center font-bold text-brand-text-secondary">{lead.readinessScore}</td>
                      <td className="py-4 px-4 text-center font-bold text-yellow-400">🎓 {lead.certPoints || 0}</td>
                      <td className="py-4 px-4 text-right font-extrabold text-brand-accent">{lead.points}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="text-center py-16 glass-card rounded-3xl border border-brand-border/60">
          <div className="w-12 h-12 rounded-full bg-yellow-500/10 flex items-center justify-center mx-auto text-yellow-500 mb-4 animate-pulse">
            <Trophy size={24} />
          </div>
          <h3 className="text-base font-bold text-brand-text-primary">No Rankings Yet</h3>
          <p className="text-xs text-brand-text-secondary mt-2 max-w-sm mx-auto">
            Approved students will be ranked here. Create a student account and get approved to see your rank.
          </p>
        </div>
      )}
    </div>
  );
}

