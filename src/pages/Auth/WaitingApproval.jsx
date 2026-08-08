import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { Clock, ShieldAlert, Edit, LogOut, CheckCircle, Circle } from 'lucide-react';


export default function WaitingApproval() {
  const { user, logout } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleEditProfile = async () => {
    setLoading(true);
    try {
      // Reverting role to 'pending' triggers the router to send the user back to /onboarding
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        role: 'pending',
        lastActivity: new Date().toISOString()
      });
    } catch (err) {
      console.error('Failed to change role to pending for edit:', err);
    } finally {
      setLoading(false);
    }
  };

  const isInfoRequested = user?.status === 'info_requested';

  return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-brand-accent/5 blur-[120px] pointer-events-none"></div>

      <div className="w-full max-w-md glass-card p-10 rounded-3xl relative z-10 border border-brand-border text-center">
        {/* Header Icon */}
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand-accent-light/10 border border-brand-accent/25 text-brand-accent mb-6 animate-pulse">
          <Clock size={28} />
        </div>

        <h2 className="text-2xl font-bold text-brand-text-primary tracking-tight">Application Under Review</h2>
        <p className="text-xs text-brand-text-secondary mt-2">
          Hi, <span className="font-semibold text-brand-text-primary">{user?.name}</span>. Thank you for registering!
        </p>

        {/* Real-time Status Tracker */}
        <div className="my-8 p-5 bg-brand-bg/50 border border-brand-border rounded-2xl text-left space-y-4">
          <h4 className="text-[10px] font-bold text-brand-text-muted uppercase tracking-wider">Verification Steps</h4>
          
          <div className="flex items-center gap-3 text-xs">
            <CheckCircle size={16} className="text-brand-accent shrink-0" />
            <span className="text-brand-text-primary font-medium">Google Authentication</span>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <CheckCircle size={16} className="text-brand-accent shrink-0" />
            <span className="text-brand-text-primary font-medium">Profile Details Submitted ({user?.role === 'student' ? 'Student' : 'Mentor'})</span>
          </div>

          <div className="flex items-center gap-3 text-xs">
            {isInfoRequested ? (
              <ShieldAlert size={16} className="text-yellow-500 shrink-0 animate-bounce" />
            ) : (
              <Circle size={16} className="text-brand-text-muted shrink-0 animate-pulse" />
            )}
            <span className={`font-semibold ${isInfoRequested ? 'text-yellow-500' : 'text-brand-text-secondary'}`}>
              {isInfoRequested ? 'Action Required' : 'Admin Approval'}
            </span>
          </div>
        </div>

        {/* Info Requested Notification */}
        {isInfoRequested && (
          <div className="mb-6 p-4 rounded-xl bg-yellow-950/20 border border-yellow-900/30 text-left">
            <h5 className="text-xs font-bold text-yellow-500 flex items-center gap-1.5 mb-1">
              <ShieldAlert size={14} />
              <span>Feedback from Administration:</span>
            </h5>
            <p className="text-[11px] text-brand-text-secondary leading-relaxed italic">
              "{user?.adminNote || 'Please update your details and resubmit.'}"
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-3">
          {isInfoRequested ? (
            <button
              onClick={handleEditProfile}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-yellow-500 hover:bg-yellow-600 text-brand-bg font-extrabold text-xs transition-all cursor-pointer shadow-md shadow-yellow-500/10 disabled:opacity-50"
            >
              {loading ? (
                <div className="w-4 h-4 rounded-full border-2 border-brand-bg/25 border-t-brand-bg animate-spin"></div>
              ) : (
                <>
                  <Edit size={14} />
                  <span>Update Profile Details</span>
                </>
              )}
            </button>
          ) : (
            <div className="text-[10px] text-brand-text-muted font-medium py-2">
              Waiting in queue. This page will refresh automatically.
            </div>
          )}

          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-brand-border hover:bg-red-950/20 text-brand-text-secondary hover:text-red-400 text-xs font-semibold transition-all cursor-pointer"
          >
            <LogOut size={14} />
            <span>Sign Out & Exit</span>
          </button>
        </div>
      </div>
    </div>
  );
}
