import { useAuth } from '../../context/AuthContext';
import { Award, Bell, Shield, LogOut, Home } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../../router/routes';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate(ROUTES.LANDING);
  };

  return (
    <header className="h-16 border-b border-brand-border/60 bg-brand-card/30 backdrop-blur-md px-8 flex items-center justify-between sticky top-0 z-40">
      <div>
        <h2 className="text-base font-semibold text-brand-text-primary">
          Welcome back, {user?.displayName || user?.name || 'User'}!
        </h2>
        <p className="text-xs text-brand-text-secondary mt-0.5">
          {user?.role === 'admin'
            ? 'Manage user approvals, assign mentors, and customize settings.'
            : user?.role === 'mentor'
            ? 'Monitor and guide your students to success.'
            : 'Track your placement readiness and update your profile.'}
        </p>
      </div>

      <div className="flex items-center gap-4">
        {user?.isFallback && (
          <div className="hidden md:flex items-center gap-1.5 bg-amber-950/40 px-3 py-1.5 rounded-full border border-amber-500/30 text-amber-400">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            <span className="text-[10px] uppercase font-bold tracking-wider">Local Sandbox Mode</span>
          </div>
        )}

        {/* Role badge */}
        {user?.role === 'student' ? (
          <div className="hidden sm:flex items-center gap-2 bg-brand-accent-light px-3 py-1.5 rounded-full border border-brand-accent/20">
            <Award size={16} className="text-brand-accent animate-pulse" />
            <span className="text-xs font-semibold text-brand-accent">
              Readiness: {user?.readinessScore || 0}%
            </span>
          </div>
        ) : user?.role === 'admin' ? (
          <div className="hidden sm:flex items-center gap-2 bg-amber-950/30 px-3 py-1.5 rounded-full border border-amber-500/20">
            <Shield size={16} className="text-amber-400" />
            <span className="text-xs font-semibold text-amber-400">Admin Mode</span>
          </div>
        ) : (
          <div className="hidden sm:flex items-center gap-2 bg-indigo-950/30 px-3 py-1.5 rounded-full border border-indigo-500/20">
            <Shield size={16} className="text-indigo-400" />
            <span className="text-xs font-semibold text-indigo-400">Mentor Mode</span>
          </div>
        )}

        {/* Notifications */}
        <button className="p-2 text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-card rounded-xl transition-all border border-transparent hover:border-brand-border">
          <Bell size={18} />
        </button>

        {/* User avatar */}
        <div className="flex items-center gap-2">
          <img
            src={user?.photoURL || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80'}
            alt="profile"
            className="w-8 h-8 rounded-full object-cover ring-2 ring-brand-border"
          />
        </div>

        {/* Home */}
        <button
          onClick={() => navigate(ROUTES.LANDING)}
          title="Home"
          className="p-2 text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-card rounded-xl transition-all border border-transparent hover:border-brand-border cursor-pointer"
        >
          <Home size={18} />
        </button>

        {/* Sign Out */}
        <button
          onClick={handleLogout}
          title="Sign Out"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-red-900/30 text-xs font-semibold text-red-400 hover:bg-red-950/20 hover:text-red-300 transition-all cursor-pointer"
        >
          <LogOut size={14} />
          <span className="hidden sm:block">Sign Out</span>
        </button>
      </div>
    </header>
  );
}
