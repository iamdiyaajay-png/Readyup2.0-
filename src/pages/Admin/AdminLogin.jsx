import { useState } from 'react';
import { auth, db } from '../../firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ShieldCheck, Eye, EyeOff, Lock } from 'lucide-react';

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAdminLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Sign in only — admin account must exist in Firebase Auth already
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const firebaseUser = userCredential.user;

      // Ensure the Firestore user doc exists and has the admin role
      const userRef = doc(db, 'users', firebaseUser.uid);
      const settingsRef = doc(db, 'system', 'settings');

      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        await setDoc(userRef, {
          uid: firebaseUser.uid,
          name: 'Admin',
          email: firebaseUser.email,
          photoURL: '',
          role: 'admin',
          status: 'approved',
          createdAt: new Date().toISOString(),
          lastActivity: new Date().toISOString(),
          profileCompletion: 100,
          readinessScore: 100,
          mentorAssigned: false,
        });
      } else if (userSnap.data().role !== 'admin') {
        const { updateDoc } = await import('firebase/firestore');
        await updateDoc(userRef, { role: 'admin', status: 'approved' });
      }

      // Ensure admin email is in system/settings
      const settingsSnap = await getDoc(settingsRef);
      if (!settingsSnap.exists()) {
        await setDoc(settingsRef, { adminEmails: [firebaseUser.email] });
      } else {
        const existing = settingsSnap.data().adminEmails || [];
        if (!existing.includes(firebaseUser.email)) {
          const { updateDoc, arrayUnion } = await import('firebase/firestore');
          await updateDoc(settingsRef, { adminEmails: arrayUnion(firebaseUser.email) });
        }
      }
      // AuthContext onAuthStateChanged picks up the session automatically

    } catch (err) {
      console.error('Admin login failed:', err);
      // Modern Firebase SDK returns auth/invalid-credential for wrong password
      if (
        err.code === 'auth/wrong-password' ||
        err.code === 'auth/invalid-credential' ||
        err.code === 'auth/invalid-login-credentials'
      ) {
        setError('Incorrect email or password. Please check your credentials and try again.');
      } else if (err.code === 'auth/user-not-found') {
        setError('No admin account found. Please create the account in Firebase Console → Authentication first.');
      } else if (err.code === 'auth/too-many-requests') {
        setError('Too many failed attempts. Please wait a moment and try again.');
      } else if (err.code === 'auth/operation-not-allowed') {
        setError('Email/password sign-in is not enabled in the Firebase Console → Authentication → Sign-in method.');
      } else {
        setError(err.message || 'Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-red-500/5 blur-[140px] pointer-events-none" />

      <div className="w-full max-w-sm relative z-10">
        <div className="glass-card p-10 rounded-3xl border border-red-900/20">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-red-950/30 border border-red-900/30 flex items-center justify-center text-red-400 mx-auto mb-4">
              <ShieldCheck size={28} />
            </div>
            <h1 className="text-xl font-bold text-brand-text-primary">Admin Access</h1>
            <p className="text-xs text-brand-text-secondary mt-1">
              Restricted portal — authorized personnel only
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 rounded-xl bg-red-950/20 border border-red-900/30 text-red-400 text-xs font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleAdminLogin} className="space-y-4" autoComplete="off">
            {/* Email */}
            <div>
              <label className="block text-xs font-semibold text-brand-text-secondary mb-1.5">
                Admin Email
              </label>
              <input
                id="admin-email"
                name="admin_portal_unique_email_no_autofill"
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="new-password"
                className="w-full px-4 py-3 rounded-xl bg-brand-bg border border-brand-border text-brand-text-primary text-sm placeholder:text-brand-text-muted focus:outline-none focus:border-red-500/50 transition-colors"
                placeholder="admin@readyup.com"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-semibold text-brand-text-secondary mb-1.5">
                Password
              </label>
              <div className="relative">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-text-muted">
                  <Lock size={14} />
                </div>
                <input
                  id="admin-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  className="w-full pl-9 pr-10 py-3 rounded-xl bg-brand-bg border border-brand-border text-brand-text-primary text-sm placeholder:text-brand-text-muted focus:outline-none focus:border-red-500/50 transition-colors"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-text-muted hover:text-brand-text-secondary transition-colors cursor-pointer"
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            <button
              id="btn-admin-login"
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3.5 rounded-2xl bg-red-700 hover:bg-red-600 text-white font-bold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white animate-spin" />
              ) : (
                <>
                  <ShieldCheck size={16} />
                  <span>Access Admin Panel</span>
                </>
              )}
            </button>
          </form>

          <p className="text-center text-[10px] text-brand-text-muted mt-6">
            This portal is monitored. Unauthorized access attempts are logged.
          </p>
        </div>
      </div>
    </div>
  );
}
