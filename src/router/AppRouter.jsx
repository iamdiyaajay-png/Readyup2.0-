import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ROUTES } from './routes';

// Layouts
import DashboardLayout from '../layouts/DashboardLayout';

// Public Pages
import LandingPage from '../pages/LandingPage';
import PublicPortfolio from '../pages/Shared/PublicPortfolio';

// Auth Pages
import Login from '../pages/Auth/Login';
import SignUp from '../pages/Auth/SignUp';
import Onboarding from '../pages/Auth/Onboarding';
import WaitingApproval from '../pages/Auth/WaitingApproval';

// Student Pages
import StudentDashboard from '../pages/Student/StudentDashboard';
import StudentProfile from '../pages/Student/StudentProfile';
import Projects from '../pages/Student/Projects';
import PortfolioGen from '../pages/Student/PortfolioGen';
import GeminiAssistant from '../pages/Student/GeminiAssistant';
import ResumeReviewer from '../pages/Student/ResumeReviewer';
import CertificateValidator from '../pages/Student/CertificateValidator';

// Mentor Pages
import MentorDashboard from '../pages/Mentor/MentorDashboard';
import MentorProfile from '../pages/Mentor/MentorProfile';

// Admin Pages
import AdminLogin from '../pages/Admin/AdminLogin';
import AdminDashboard from '../pages/Admin/AdminDashboard';

// Shared Pages
import Chat from '../pages/Shared/Chat';
import Leaderboard from '../pages/Shared/Leaderboard';
import Scheduler from '../pages/Shared/Scheduler';

// ── Loading Spinner ───────────────────────────────────────────
function LoadingScreen({ label = 'Verifying Session...' }) {
  return (
    <div className="min-h-screen bg-brand-bg flex flex-col items-center justify-center">
      <div className="w-12 h-12 rounded-full border-4 border-brand-accent/25 border-t-brand-accent animate-spin mb-4" />
      <p className="text-brand-text-secondary text-sm">{label}</p>
    </div>
  );
}

// ── Auth Guard: blocks non-authenticated / pending users ──────
function AuthGuard({ children }) {
  const { user, loading } = useAuth();

  if (loading) return <LoadingScreen />;

  if (!user) return <Navigate to={ROUTES.LOGIN} replace />;

  if (user.role === 'pending') return <Navigate to={ROUTES.ONBOARDING} replace />;

  if (user.status === 'pending' || user.status === 'info_requested') {
    return <Navigate to={ROUTES.WAITING_APPROVAL} replace />;
  }

  if (user.status === 'rejected') {
    return (
      <div className="min-h-screen bg-brand-bg flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-950/20 border border-red-900/30 flex items-center justify-center text-red-500 mb-6">
          <span className="text-2xl font-bold">!</span>
        </div>
        <h2 className="text-2xl font-bold text-brand-text-primary">Account Application Rejected</h2>
        <p className="text-brand-text-secondary text-sm mt-2 max-w-sm">
          Unfortunately, your application to join ReadyUp 2.0 has been rejected by the administrator.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="mt-6 px-5 py-2.5 bg-brand-accent text-brand-bg hover:bg-brand-accent-hover font-bold rounded-xl text-xs transition-colors"
        >
          Check Again
        </button>
      </div>
    );
  }

  return children;
}

// ── Role Guard: only allows specific role, redirects others ───
function RoleGuard({ allowedRole, children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to={ROUTES.LOGIN} replace />;
  if (user.role !== allowedRole) {
    if (user.role === 'mentor') return <Navigate to={ROUTES.MENTOR_DASHBOARD} replace />;
    if (user.role === 'student') return <Navigate to={ROUTES.STUDENT_DASHBOARD} replace />;
    return <Navigate to={ROUTES.LANDING} replace />;
  }
  return children;
}

// ── Redirect helper for authenticated users visiting auth pages ─
function getDashboardRedirect(user) {
  if (!user) return ROUTES.LANDING;
  if (user.role === 'pending') return ROUTES.ONBOARDING;
  if (user.status === 'pending' || user.status === 'info_requested') return ROUTES.WAITING_APPROVAL;
  if (user.role === 'admin') return ROUTES.ADMIN_DASHBOARD;
  if (user.role === 'mentor') return ROUTES.MENTOR_DASHBOARD;
  if (user.role === 'student') return ROUTES.STUDENT_DASHBOARD;
  // Unknown state — send back to landing, not stuck in a loop since landing is auth-aware
  return ROUTES.LANDING;
}

export default function AppRouter() {
  const { user, loading } = useAuth();

  if (loading) return <LoadingScreen />;

  return (
    <HashRouter>
      <Routes>
        {/* ── Public Routes ─────────────────────────────── */}
        <Route path={ROUTES.LANDING} element={<LandingPage />} />
        <Route path={ROUTES.PORTFOLIO} element={<PublicPortfolio />} />

        {/* Sign In — redirects logged-in users to their dashboard */}
        <Route
          path={ROUTES.LOGIN}
          element={user ? <Navigate to={getDashboardRedirect(user)} replace /> : <Login />}
        />

        {/* Sign Up — redirects logged-in users to their dashboard */}
        <Route
          path={ROUTES.SIGNUP}
          element={user ? <Navigate to={getDashboardRedirect(user)} replace /> : <SignUp />}
        />

        {/* ── Onboarding & Waiting (authenticated but pre-dashboard) ── */}
        <Route
          path={ROUTES.ONBOARDING}
          element={
            !user ? (
              <Navigate to={ROUTES.SIGNUP} replace />
            ) : user.role !== 'pending' ? (
              <Navigate to={getDashboardRedirect(user)} replace />
            ) : (
              <Onboarding />
            )
          }
        />
        <Route
          path={ROUTES.WAITING_APPROVAL}
          element={
            !user ? (
              <Navigate to={ROUTES.LOGIN} replace />
            ) : user.status === 'approved' ? (
              <Navigate to={getDashboardRedirect(user)} replace />
            ) : (
              <WaitingApproval />
            )
          }
        />

        {/* ── Admin Route: /admin ────────────────────────
            Shows AdminLogin if not authenticated as admin.
            Shows AdminDashboard only when logged in as admin.
            Admin users are NEVER auto-redirected here from other pages.
        ─────────────────────────────────────────────── */}
        <Route
          path={ROUTES.ADMIN_DASHBOARD}
          element={
            !user ? (
              <AdminLogin />
            ) : user.role === 'admin' ? (
              <AdminDashboard />
            ) : (
              // Non-admin tried to visit /admin — show login
              <AdminLogin />
            )
          }
        />

        {/* ── Protected Dashboard Routes ─────────────── */}
        <Route
          element={
            <AuthGuard>
              <DashboardLayout />
            </AuthGuard>
          }
        >
          {/* Student Routes */}
          <Route
            path={ROUTES.STUDENT_DASHBOARD}
            element={<RoleGuard allowedRole="student"><StudentDashboard /></RoleGuard>}
          />
          <Route
            path={ROUTES.STUDENT_PROFILE}
            element={<RoleGuard allowedRole="student"><StudentProfile /></RoleGuard>}
          />
          <Route
            path={ROUTES.PROJECTS}
            element={<RoleGuard allowedRole="student"><Projects /></RoleGuard>}
          />
          <Route
            path={ROUTES.PORTFOLIO_GEN}
            element={<RoleGuard allowedRole="student"><PortfolioGen /></RoleGuard>}
          />
          <Route
            path={ROUTES.SKILLS_ASSISTANT}
            element={<RoleGuard allowedRole="student"><GeminiAssistant /></RoleGuard>}
          />
          <Route
            path={ROUTES.RESUME_REVIEWER}
            element={<RoleGuard allowedRole="student"><ResumeReviewer /></RoleGuard>}
          />
          <Route
            path={ROUTES.CERTIFICATE_VALIDATOR}
            element={<RoleGuard allowedRole="student"><CertificateValidator /></RoleGuard>}
          />

          {/* Mentor Routes */}
          <Route
            path={ROUTES.MENTOR_DASHBOARD}
            element={<RoleGuard allowedRole="mentor"><MentorDashboard /></RoleGuard>}
          />
          <Route
            path={ROUTES.MENTOR_PROFILE}
            element={<RoleGuard allowedRole="mentor"><MentorProfile /></RoleGuard>}
          />

          {/* Shared Protected Routes */}
          <Route path={ROUTES.CHAT} element={<Chat />} />
          <Route path={ROUTES.LEADERBOARD} element={<Leaderboard />} />
          <Route path={ROUTES.SCHEDULER} element={<Scheduler />} />
        </Route>

        {/* ── Catch-all fallback ─────────────────────── */}
        <Route path="*" element={<Navigate to={getDashboardRedirect(user)} replace />} />
      </Routes>
    </HashRouter>
  );
}
