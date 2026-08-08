import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Mail, RefreshCcw, LogOut } from 'lucide-react';
import { sendEmailVerification } from 'firebase/auth';
import { auth } from '../../firebase';

export default function VerifyEmail() {
  const { logout, user } = useAuth();
  const [resending, setResending] = useState(false);
  const [resendStatus, setResendStatus] = useState(''); // '' | 'success' | 'error'

  const handleResend = async () => {
    setResending(true);
    setResendStatus('');
    try {
      if (auth.currentUser) {
        await sendEmailVerification(auth.currentUser);
        setResendStatus('success');
      }
    } catch (err) {
      console.error('Error resending email:', err);
      setResendStatus('error');
    } finally {
      setResending(false);
    }
  };

  const handleRefresh = async () => {
    // Reload the current user to get the latest emailVerified status
    // onAuthStateChanged should pick up the change, or we just force reload the page
    if (auth.currentUser) {
      await auth.currentUser.reload();
      window.location.reload();
    }
  };

  return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-brand-accent/5 blur-[140px] pointer-events-none" />

      <div className="w-full max-w-md relative z-10 space-y-4 text-center">
        <div className="glass-card p-10 rounded-3xl border border-brand-border">
          <div className="mx-auto w-16 h-16 rounded-full bg-brand-accent-light border border-brand-accent/20 flex items-center justify-center text-brand-accent mb-6">
            <Mail size={32} />
          </div>
          <h1 className="text-2xl font-bold text-brand-text-primary">Check Your Email</h1>
          <p className="text-sm text-brand-text-secondary mt-3 leading-relaxed">
            We've sent a verification link to <br />
            <span className="font-semibold text-brand-text-primary">{user?.email}</span>
          </p>
          <p className="text-xs text-brand-text-muted mt-2">
            Please click the link to verify your account and continue the onboarding process.
          </p>

          {resendStatus === 'success' && (
            <div className="mt-5 p-3 rounded-xl bg-green-950/20 border border-green-900/30 text-green-400 text-xs font-medium">
              Verification email sent!
            </div>
          )}
          {resendStatus === 'error' && (
            <div className="mt-5 p-3 rounded-xl bg-red-950/20 border border-red-900/30 text-red-400 text-xs font-medium">
              Failed to resend email. Please try again later.
            </div>
          )}

          <div className="mt-8 space-y-3">
            <button
              onClick={handleRefresh}
              className="w-full px-5 py-3 bg-brand-accent text-brand-bg hover:bg-brand-accent-hover font-bold rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
            >
              <RefreshCcw size={16} />
              I have verified my email
            </button>
            <button
              onClick={handleResend}
              disabled={resending}
              className="w-full px-5 py-3 bg-brand-card hover:bg-brand-card/80 border border-brand-border text-brand-text-primary font-bold rounded-xl text-sm transition-colors disabled:opacity-50"
            >
              {resending ? 'Sending...' : 'Resend Verification Email'}
            </button>
          </div>
        </div>

        <button
          onClick={logout}
          className="inline-flex items-center gap-2 text-xs font-semibold text-brand-text-secondary hover:text-brand-text-primary transition-colors"
        >
          <LogOut size={14} />
          Sign out and try a different account
        </button>
      </div>
    </div>
  );
}
