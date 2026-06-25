import { Link } from 'react-router-dom';
import { ROUTES } from '../router/routes';
import { MessageSquare, Sparkles, TrendingUp, LayoutDashboard, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function LandingPage() {
  const { user, logout } = useAuth();

  // Resolve where a logged-in user's dashboard is
  const getDashboardRoute = () => {
    if (!user) return ROUTES.LOGIN;
    if (user.role === 'pending') return ROUTES.ONBOARDING;
    if (user.status === 'pending' || user.status === 'info_requested') return ROUTES.WAITING_APPROVAL;
    if (user.role === 'admin') return ROUTES.ADMIN_DASHBOARD;
    if (user.role === 'mentor') return ROUTES.MENTOR_DASHBOARD;
    if (user.role === 'student') return ROUTES.STUDENT_DASHBOARD;
    return ROUTES.LOGIN;
  };

  const handleLogout = async () => {
    await logout();
  };

  return (
    <div className="min-h-screen bg-brand-bg text-brand-text-primary flex flex-col">
      {/* Navigation */}
      <header className="border-b border-brand-border/60 bg-brand-card/30 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-brand-accent flex items-center justify-center text-brand-bg font-bold text-lg">
              R
            </div>
            <span className="font-bold text-lg">ReadyUp 2.0</span>
          </div>

          <div className="flex items-center gap-4">
            {user ? (
              /* Logged-in nav */
              <>
                <div className="flex items-center gap-2">
                  {user.photoURL && (
                    <img
                      src={user.photoURL}
                      alt={user.name}
                      className="w-7 h-7 rounded-full object-cover border border-brand-border"
                    />
                  )}
                  <span className="text-xs font-medium text-brand-text-secondary hidden sm:block">
                    {user.name || user.email}
                  </span>
                </div>
                <Link
                  to={getDashboardRoute()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-accent text-brand-bg font-semibold text-sm hover:bg-brand-accent-hover transition-all shadow-lg shadow-brand-accent/15"
                >
                  <LayoutDashboard size={14} />
                  Go to Dashboard
                </Link>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 text-sm font-medium text-brand-text-secondary hover:text-red-400 transition-colors cursor-pointer"
                >
                  <LogOut size={14} />
                  <span className="hidden sm:block">Sign Out</span>
                </button>
              </>
            ) : (
              /* Guest nav */
              <>
                <Link
                  to={ROUTES.LOGIN}
                  className="text-sm font-medium text-brand-text-secondary hover:text-brand-text-primary transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  to={ROUTES.SIGNUP}
                  className="px-4 py-2 rounded-xl bg-brand-accent text-brand-bg font-semibold text-sm hover:bg-brand-accent-hover transition-all shadow-lg shadow-brand-accent/15"
                >
                  Join Platform
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 max-w-7xl mx-auto px-6 py-20 flex flex-col items-center text-center justify-center relative overflow-hidden">
        {/* Glow Effects */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-brand-accent/10 blur-[120px] pointer-events-none" />

        <div className="flex items-center gap-2 bg-brand-accent-light px-3 py-1 rounded-full border border-brand-accent/20 mb-6">
          <Sparkles size={14} className="text-brand-accent animate-pulse" />
          <span className="text-xs font-semibold text-brand-accent uppercase tracking-wider">
            AI-Powered Career Launchpad
          </span>
        </div>

        <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight max-w-3xl leading-tight">
          Supercharge Your{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-accent to-emerald-400">
            Placement Journey
          </span>
        </h1>

        <p className="text-brand-text-secondary max-w-xl text-lg mt-6 leading-relaxed">
          The ultimate platform connecting ambitious students with dedicated mentors. Leverage Gemini AI
          to build shareable portfolios, review resumes, and receive actionable training plans.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 mt-10">
          {user ? (
            /* Logged-in CTAs */
            <>
              <Link
                to={getDashboardRoute()}
                className="flex items-center gap-2 px-8 py-4 rounded-2xl bg-brand-accent text-brand-bg font-bold text-base hover:bg-brand-accent-hover transition-all shadow-xl shadow-brand-accent/20"
              >
                <LayoutDashboard size={18} />
                Go to My Dashboard
              </Link>
              <button
                onClick={handleLogout}
                className="flex items-center justify-center gap-2 px-8 py-4 rounded-2xl bg-brand-card hover:bg-brand-card-hover border border-brand-border text-brand-text-primary font-bold text-base transition-colors cursor-pointer"
              >
                <LogOut size={18} />
                Sign Out
              </button>
            </>
          ) : (
            /* Guest CTAs */
            <>
              <Link
                to={ROUTES.SIGNUP}
                className="px-8 py-4 rounded-2xl bg-brand-accent text-brand-bg font-bold text-base hover:bg-brand-accent-hover transition-all shadow-xl shadow-brand-accent/20"
              >
                Get Started (Free)
              </Link>
              <Link
                to={ROUTES.LOGIN}
                className="px-8 py-4 rounded-2xl bg-brand-card hover:bg-brand-card-hover border border-brand-border text-brand-text-primary font-bold text-base transition-colors"
              >
                Sign In to Dashboard
              </Link>
            </>
          )}
        </div>

        {/* Feature Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-24 w-full">
          <div className="glass-card p-8 rounded-3xl text-left hover:-translate-y-1 transition-all duration-300">
            <div className="w-12 h-12 rounded-2xl bg-brand-accent-light border border-brand-accent/20 flex items-center justify-center text-brand-accent mb-6">
              <TrendingUp size={24} />
            </div>
            <h3 className="text-lg font-bold text-brand-text-primary">Placement Readiness Score</h3>
            <p className="text-brand-text-secondary text-sm mt-3 leading-relaxed">
              Track project uploads, mock interview scores, and suggestion completions aggregated into a single transparent readiness score.
            </p>
          </div>

          <div className="glass-card p-8 rounded-3xl text-left hover:-translate-y-1 transition-all duration-300">
            <div className="w-12 h-12 rounded-2xl bg-brand-accent-light border border-brand-accent/20 flex items-center justify-center text-brand-accent mb-6">
              <Sparkles size={24} />
            </div>
            <h3 className="text-lg font-bold text-brand-text-primary">Gemini Skill Assistant &amp; ATS</h3>
            <p className="text-brand-text-secondary text-sm mt-3 leading-relaxed">
              Instantly review resume plain text for software engineer keyword gaps and search for free training paths verified by Gemini AI.
            </p>
          </div>

          <div className="glass-card p-8 rounded-3xl text-left hover:-translate-y-1 transition-all duration-300">
            <div className="w-12 h-12 rounded-2xl bg-brand-accent-light border border-brand-accent/20 flex items-center justify-center text-brand-accent mb-6">
              <MessageSquare size={24} />
            </div>
            <h3 className="text-lg font-bold text-brand-text-primary">Real-Time Mentorship</h3>
            <p className="text-brand-text-secondary text-sm mt-3 leading-relaxed">
              Message your assigned mentor directly, request mock interviews, and receive personalized course assignments directly on your feed.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-brand-border/60 py-8 text-center text-xs text-brand-text-muted bg-brand-card/10">
        <p>© 2026 ReadyUp 2.0. Built for Next-Gen Engineering Placements.</p>
      </footer>
    </div>
  );
}
