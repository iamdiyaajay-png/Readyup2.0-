import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { GraduationCap, Briefcase, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ROUTES } from '../../router/routes';

function GoogleIcon() {
  return (
    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
    </svg>
  );
}

export default function SignUp() {
  const { loginWithGoogle } = useAuth();
  const [loading, setLoading] = useState(null); // 'student' | 'mentor' | null
  const [error, setError] = useState('');

  const handleSignUp = async (intendedRole) => {
    setError('');
    setLoading(intendedRole);
    sessionStorage.setItem('intendedRole', intendedRole);
    try {
      await loginWithGoogle(intendedRole);
    } catch (err) {
      console.error('Google Sign-Up failed:', err);
      setError('Google Authentication failed. Please try again.');
      sessionStorage.removeItem('intendedRole');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-brand-accent/5 blur-[140px] pointer-events-none" />

      <div className="w-full max-w-md relative z-10 space-y-4">
        {/* Header */}
        <div className="glass-card p-10 rounded-3xl border border-brand-border text-center">
          <div className="inline-flex items-center gap-2 bg-brand-accent-light px-3 py-1 rounded-full border border-brand-accent/20 mb-5">
            <Sparkles size={14} className="text-brand-accent" />
            <span className="text-xs font-semibold text-brand-accent tracking-wider uppercase">Create Account</span>
          </div>
          <h1 className="text-2xl font-bold text-brand-text-primary">Join ReadyUp 2.0</h1>
          <p className="text-sm text-brand-text-secondary mt-2">
            Choose your role to get started. We use Google for secure sign-up — no password needed.
          </p>

          {error && (
            <div className="mt-5 p-4 rounded-xl bg-red-950/20 border border-red-900/30 text-red-400 text-xs font-medium">
              {error}
            </div>
          )}
        </div>

        {/* Role Cards */}
        <div className="grid grid-cols-2 gap-4">
          {/* Student */}
          <button
            type="button"
            id="btn-signup-student"
            onClick={() => handleSignUp('student')}
            disabled={loading !== null}
            className="glass-card p-6 rounded-3xl border border-brand-border hover:border-brand-accent/50 hover:bg-brand-card/90 transition-all duration-300 flex flex-col items-center gap-4 cursor-pointer group disabled:opacity-50 disabled:cursor-not-allowed text-left"
          >
            <div className="w-12 h-12 rounded-2xl bg-brand-accent-light border border-brand-accent/20 flex items-center justify-center text-brand-accent group-hover:scale-110 transition-transform">
              <GraduationCap size={22} />
            </div>
            <div>
              <h3 className="font-bold text-sm text-brand-text-primary">I'm a Student</h3>
              <p className="text-[10px] text-brand-text-secondary mt-1 leading-relaxed">
                Build portfolio, track readiness, connect with mentors
              </p>
            </div>
            {loading === 'student' ? (
              <div className="w-5 h-5 rounded-full border-2 border-brand-accent/30 border-t-brand-accent animate-spin" />
            ) : (
              <div className="flex items-center gap-1.5 text-[11px] text-brand-text-muted">
                <GoogleIcon />
                <span>Sign up with Google</span>
              </div>
            )}
          </button>

          {/* Mentor */}
          <button
            type="button"
            id="btn-signup-mentor"
            onClick={() => handleSignUp('mentor')}
            disabled={loading !== null}
            className="glass-card p-6 rounded-3xl border border-brand-border hover:border-indigo-500/50 hover:bg-brand-card/90 transition-all duration-300 flex flex-col items-center gap-4 cursor-pointer group disabled:opacity-50 disabled:cursor-not-allowed text-left"
          >
            <div className="w-12 h-12 rounded-2xl bg-indigo-950/40 border border-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform">
              <Briefcase size={22} />
            </div>
            <div>
              <h3 className="font-bold text-sm text-brand-text-primary">I'm a Mentor</h3>
              <p className="text-[10px] text-brand-text-secondary mt-1 leading-relaxed">
                Guide students, conduct mock interviews, assign courses
              </p>
            </div>
            {loading === 'mentor' ? (
              <div className="w-5 h-5 rounded-full border-2 border-indigo-500/30 border-t-indigo-400 animate-spin" />
            ) : (
              <div className="flex items-center gap-1.5 text-[11px] text-brand-text-muted">
                <GoogleIcon />
                <span>Sign up with Google</span>
              </div>
            )}
          </button>
        </div>

        {/* Already have account */}
        <div className="glass-card px-6 py-4 rounded-2xl border border-brand-border flex items-center justify-between">
          <p className="text-xs text-brand-text-secondary">Already have an account?</p>
          <Link
            to={ROUTES.LOGIN}
            className="text-xs font-bold text-brand-accent hover:underline"
          >
            Sign In →
          </Link>
        </div>

        <p className="text-center text-[11px] text-brand-text-muted">
          Google OAuth manages credentials securely. ReadyUp 2.0 never stores your password.
        </p>
      </div>
    </div>
  );
}
