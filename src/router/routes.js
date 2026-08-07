export const ROUTES = {
  LANDING: '/',
  LOGIN: '/login',
  SIGNUP: '/signup',
  ONBOARDING: '/onboarding',
  WAITING_APPROVAL: '/waiting-approval',

  // Student specific routes
  STUDENT_DASHBOARD: '/student',
  STUDENT_PROFILE: '/student/profile',
  PROJECTS: '/student/projects',
  PORTFOLIO_GEN: '/student/portfolio-generator',
  SKILLS_ASSISTANT: '/student/skills-assistant',
  RESUME_REVIEWER: '/student/resume-reviewer',
  CERTIFICATE_VALIDATOR: '/student/certificate-validator',

  // Mentor specific routes
  MENTOR_DASHBOARD: '/mentor',
  MENTOR_PROFILE: '/mentor/profile',

  // Admin specific routes
  ADMIN_DASHBOARD: '/admin',

  // Shared routes
  PORTFOLIO: '/portfolio/:studentId',
  CHAT: '/chat',
  LEADERBOARD: '/leaderboard',
  SCHEDULER: '/scheduler',
};

