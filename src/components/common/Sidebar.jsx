import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ROUTES } from '../../router/routes';
import { listenToUnreadCounts, getTotalUnread } from '../../services/chatService';
import {
  LayoutDashboard,
  Briefcase,
  UserCheck,
  SearchCode,
  FileText,
  MessageSquare,
  Trophy,
  Calendar,
  LogOut,
  UserCircle,
  Home,
  Award
} from 'lucide-react';

export default function Sidebar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [totalUnread, setTotalUnread] = useState(0);

  // Subscribe to RTDB unread counts for the badge on Messages link
  useEffect(() => {
    if (!user?.uid) return;
    const unsub = listenToUnreadCounts(user.uid, (map) => {
      setTotalUnread(getTotalUnread(map));
    });
    return () => unsub();
  }, [user?.uid]);

  const studentLinks = [
    { name: 'Dashboard', path: ROUTES.STUDENT_DASHBOARD, icon: LayoutDashboard },
    { name: 'My Profile', path: ROUTES.STUDENT_PROFILE, icon: UserCircle },
    { name: 'Projects', path: ROUTES.PROJECTS, icon: Briefcase },
    { name: 'Portfolio Gen', path: ROUTES.PORTFOLIO_GEN, icon: UserCheck },
    { name: 'Gemini Assistant', path: ROUTES.SKILLS_ASSISTANT, icon: SearchCode },
    { name: 'Resume Reviewer', path: ROUTES.RESUME_REVIEWER, icon: FileText },
    { name: 'Certificates', path: ROUTES.CERTIFICATE_VALIDATOR, icon: Award },
  ];

  const mentorLinks = [
    { name: 'Dashboard', path: ROUTES.MENTOR_DASHBOARD, icon: LayoutDashboard },
    { name: 'My Profile', path: ROUTES.MENTOR_PROFILE, icon: UserCircle },
  ];

  const adminLinks = [
    { name: 'Admin Panel', path: ROUTES.ADMIN_DASHBOARD, icon: LayoutDashboard },
  ];

  const sharedLinks = [
    { name: 'Leaderboard', path: ROUTES.LEADERBOARD, icon: Trophy },
    { name: 'Mock Interviews', path: ROUTES.SCHEDULER, icon: Calendar },
    { name: 'Messages', path: ROUTES.CHAT, icon: MessageSquare },
  ];

  const activeLinks = user?.role === 'admin'
    ? adminLinks
    : user?.role === 'mentor'
    ? mentorLinks
    : studentLinks;

  const allLinks = [...activeLinks, ...sharedLinks];
  const isActive = (path) => location.pathname === path;

  const handleLogout = async () => {
    await logout();
    navigate(ROUTES.LANDING);
  };

  return (
    <aside className="w-64 bg-brand-card border-r border-brand-border/60 flex flex-col h-screen sticky top-0">
      {/* Brand Header */}
      <div className="p-6 border-b border-brand-border/60 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-brand-accent flex items-center justify-center text-brand-bg font-bold text-lg">
          R
        </div>
        <div>
          <h1 className="font-bold text-lg leading-none text-brand-text-primary">ReadyUp 2.0</h1>
          <span className="text-xs text-brand-accent font-semibold tracking-wider uppercase">Placement Tracker</span>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
        <div className="px-3 mb-2 text-xs font-semibold text-brand-text-muted uppercase tracking-wider">
          {user?.role === 'admin' ? 'Admin Space' : user?.role === 'mentor' ? 'Mentor Space' : 'Student Space'}
        </div>

        {allLinks.map((link) => {
          const Icon = link.icon;
          const isMessages = link.path === ROUTES.CHAT;
          const showBadge = isMessages && totalUnread > 0;
          return (
            <Link
              key={link.name}
              to={link.path}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                isActive(link.path)
                  ? 'bg-brand-accent text-brand-bg font-semibold shadow-lg shadow-brand-accent/20'
                  : 'text-brand-text-secondary hover:bg-brand-card-hover hover:text-brand-text-primary'
              }`}
            >
              <Icon size={18} />
              <span className="flex-1">{link.name}</span>
              {showBadge && (
                <span className="min-w-[20px] h-5 px-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
                  {totalUnread > 99 ? '99+' : totalUnread}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User Info & Sign-Out */}
      <div className="p-4 border-t border-brand-border/60 space-y-3 bg-brand-bg/40">
        <div className="flex items-center gap-3 px-2">
          <img
            src={user?.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || 'User')}&background=10b981&color=fff`}
            alt={user?.name}
            className="w-10 h-10 rounded-full object-cover border-2 border-brand-accent/20"
          />
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-semibold text-brand-text-primary truncate leading-tight">
              {user?.name || 'User'}
            </h4>
            <span className="text-xs text-brand-accent font-medium capitalize">{user?.role}</span>
          </div>
        </div>

        {/* Home + Sign Out */}
        <div className="flex gap-2">
          <button
            onClick={() => navigate(ROUTES.LANDING)}
            title="Home"
            className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-medium text-brand-text-secondary hover:text-brand-text-primary hover:bg-brand-card-hover transition-colors cursor-pointer border border-brand-border/60"
          >
            <Home size={13} />
            <span>Home</span>
          </button>
          <button
            onClick={handleLogout}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-950/20 transition-colors cursor-pointer border border-red-900/20"
          >
            <LogOut size={13} />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
