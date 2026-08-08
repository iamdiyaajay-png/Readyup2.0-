import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { GraduationCap, Briefcase, Sparkles, Shield, Mail, Lock } from 'lucide-react';
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

export default function Login() {
  const { loginWithGoogle, loginWithEmail } = useAuth();
  const [loading, setLoading] = useState(null); // 'google' | 'email' | null
  const [error, setError] = useState('');
  
  const [role, setRole] = useState('student');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading('google');
    // Store role so AuthContext can use it if this turns out to be a new sign-up
    sessionStorage.setItem('intendedRole', role);
    try {
      await loginWithGoogle(role);
    } catch (err) {
      console.error('Google Sign-In failed:', err);
      setError('Google Authentication failed. Please try again.');
      sessionStorage.removeItem('intendedRole');
    } finally {
      setLoading(null);
    }
  };

  const handleEmailSignIn = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please fill in all fields.');
      return;
    }
    setError('');
    setLoading('email');
    try {
      await loginWithEmail(email, password, role);
    } catch (err) {
      console.error('Email Sign-In failed:', err);
      setError('Invalid email or password.');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-brand-accent/5 blur-[140px] pointer-events-none" />
      <div className="absolute top-1/4 right-1/4 w-[300px] h-[300px] rounded-full bg-indigo-500/5 blur-[100px] pointer-events-none" />

      <div className="w-full max-w-md relative z-10 space-y-4">
        {/* Header Card */}
        <div className="glass-card p-8 rounded-3xl border border-brand-border text-center">
          <div className="inline-flex items-center gap-2 bg-brand-accent-light px-3 py-1 rounded-full border border-brand-accent/20 mb-5">
            <Sparkles size={14} className="text-brand-accent" />
            <span className="text-xs font-semibold text-brand-accent tracking-wider uppercase">Welcome Back</span>
          </div>

          <h1 className="text-2xl font-bold text-brand-text-primary">Sign In to ReadyUp</h1>

          {error && (
            <div className="mt-5 p-4 rounded-xl bg-red-950/20 border border-red-900/30 text-red-400 text-xs font-medium">
              {error}
            </div>
          )}

          {/* Role Selection */}
          <div className="flex gap-2 mt-6 p-1 bg-brand-bg rounded-xl border border-brand-border">
            <button
              onClick={() => setRole('student')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${
                role === 'student' ? 'bg-brand-accent text-brand-bg shadow-sm' : 'text-brand-text-secondary hover:text-brand-text-primary'
              }`}
            >
              <GraduationCap size={16} /> Student
            </button>
            <button
              onClick={() => setRole('mentor')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${
                role === 'mentor' ? 'bg-indigo-500 text-white shadow-sm' : 'text-brand-text-secondary hover:text-brand-text-primary'
              }`}
            >
              <Briefcase size={16} /> Mentor
            </button>
          </div>

          <form onSubmit={handleEmailSignIn} className="mt-6 space-y-4 text-left">
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-brand-text-secondary uppercase tracking-wider ml-1">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text-muted" size={16} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-brand-bg border border-brand-border rounded-xl text-sm text-brand-text-primary focus:border-brand-accent focus:ring-1 focus:ring-brand-accent outline-none transition-all"
                  placeholder="hello@example.com"
                  required
                />
              </div>
            </div>
            
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-brand-text-secondary uppercase tracking-wider ml-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text-muted" size={16} />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-brand-bg border border-brand-border rounded-xl text-sm text-brand-text-primary focus:border-brand-accent focus:ring-1 focus:ring-brand-accent outline-none transition-all"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading !== null}
              className={`w-full py-3 mt-2 rounded-xl text-sm font-bold text-white transition-colors flex justify-center items-center gap-2 ${
                role === 'student' ? 'bg-brand-accent hover:bg-brand-accent-hover' : 'bg-indigo-500 hover:bg-indigo-600'
              } disabled:opacity-50`}
            >
              {loading === 'email' ? (
                <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              ) : (
                <>Sign In as {role === 'student' ? 'Student' : 'Mentor'}</>
              )}
            </button>
          </form>

          <div className="flex items-center gap-4 my-6">
            <div className="h-px bg-brand-border flex-1" />
            <span className="text-[10px] uppercase font-bold text-brand-text-muted tracking-wider">Or continue with</span>
            <div className="h-px bg-brand-border flex-1" />
          </div>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading !== null}
            className="w-full p-3 rounded-xl border border-brand-border hover:bg-brand-card/90 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
          >
            {loading === 'google' ? (
              <div className="w-5 h-5 rounded-full border-2 border-brand-accent/30 border-t-brand-accent animate-spin" />
            ) : (
              <>
                <GoogleIcon />
                <span className="text-sm font-bold text-brand-text-primary">Google</span>
              </>
            )}
          </button>
        </div>

        {/* Bottom Links */}
        <div className="glass-card px-6 py-4 rounded-2xl border border-brand-border flex items-center justify-between">
          <p className="text-xs text-brand-text-secondary">New to ReadyUp?</p>
          <Link
            to={ROUTES.SIGNUP}
            className="text-xs font-bold text-brand-accent hover:underline"
          >
            Create Account →
          </Link>
        </div>

        {/* Admin link */}
        <div className="flex justify-center">
          <Link
            to={ROUTES.ADMIN_DASHBOARD}
            className="inline-flex items-center gap-1.5 text-[11px] text-brand-text-muted hover:text-brand-text-secondary transition-colors"
          >
            <Shield size={12} />
            <span>Admin Sign In</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
