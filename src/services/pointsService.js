/**
 * pointsService.js
 * ─────────────────────────────────────────────────────────────────
 * Certificate 1–5 scoring system, 13-category skill matrix,
 * and weighted Placement Readiness Score formula.
 * ─────────────────────────────────────────────────────────────────
 */

// ── 13 Skill Categories ───────────────────────────────────────────
export const SKILL_CATEGORIES = {
  programming:        { key: 'programming',        label: 'Programming',         icon: '💻', weight: 0 },
  webDevelopment:     { key: 'webDevelopment',      label: 'Web Development',     icon: '🌐', weight: 0 },
  mobileDevelopment:  { key: 'mobileDevelopment',   label: 'Mobile Development',  icon: '📱', weight: 0 },
  ai_ml:              { key: 'ai_ml',               label: 'AI / ML',             icon: '🤖', weight: 0 },
  datascience:        { key: 'datascience',          label: 'Data Science',        icon: '📊', weight: 0 },
  cybersecurity:      { key: 'cybersecurity',        label: 'Cybersecurity',       icon: '🔒', weight: 0 },
  cloudComputing:     { key: 'cloudComputing',       label: 'Cloud Computing',     icon: '☁️', weight: 0 },
  devops:             { key: 'devops',               label: 'DevOps',              icon: '⚙️', weight: 0 },
  uiux:               { key: 'uiux',                 label: 'UI / UX',             icon: '🎨', weight: 0 },
  communication:      { key: 'communication',        label: 'Communication',       icon: '🗣️', weight: 0 },
  leadership:         { key: 'leadership',            label: 'Leadership',          icon: '👑', weight: 0 },
  projectManagement:  { key: 'projectManagement',    label: 'Project Management',  icon: '📋', weight: 0 },
  entrepreneurship:   { key: 'entrepreneurship',     label: 'Entrepreneurship',    icon: '🚀', weight: 0 },
};

export const SKILL_CATEGORY_KEYS = Object.keys(SKILL_CATEGORIES);

/** Empty skill matrix for new users */
export function emptySkillMatrix() {
  return Object.fromEntries(SKILL_CATEGORY_KEYS.map((k) => [k, 0]));
}

// ── Certificate Score Rules (1–5) ─────────────────────────────────

/**
 * Keywords that identify each score level (matched against cert title/type).
 * Gemini does the primary categorization; this is the fallback heuristic.
 */
const SCORE_KEYWORDS = {
  5: ['google', 'microsoft', 'aws', 'amazon', 'cisco', 'azure', 'oracle',
      'national level', 'international', 'national winner', 'global winner',
      'industry certification', 'professional certification', 'meta', 'nvidia'],
  4: ['advanced', 'expert', 'professional', 'hackathon finalist', 'hackathon winner',
      'domain specific', 'specialization', 'associate certification', 'comptia',
      'redhat', 'pmi', 'isc2', 'ec-council', 'certified developer'],
  3: ['intermediate', 'skill development', 'technical workshop', 'assessment',
      'project-based', 'applied learning', 'full course', 'coursera',
      'edx', 'udemy', 'nptel', 'linkedin learning', 'pluralsight'],
  2: ['workshop', 'webinar', 'basic training', 'fundamentals', 'introduction',
      'beginner', 'foundation', 'awareness', 'bootcamp'],
  1: ['seminar', 'attendance', 'participation', 'session', 'event', 'talk',
      'guest lecture', 'orientation', 'induction'],
};

/**
 * Determine certificate score (1–5) from issuer + title.
 * Gemini should be the primary scorer; this is the fallback.
 * @param {string} issuer
 * @param {string} title
 * @returns {{ score: number, label: string, pointsGain: number }}
 */
export function getCertificateScore(issuer = '', title = '') {
  const haystack = `${issuer} ${title}`.toLowerCase();
  for (const level of [5, 4, 3, 2, 1]) {
    if (SCORE_KEYWORDS[level].some((kw) => haystack.includes(kw))) {
      return scoreInfo(level);
    }
  }
  return scoreInfo(2); // default to workshop-level if unknown
}

/** @deprecated Use getCertificateScore instead */
export function getCertificatePoints(issuerName) {
  const { score } = getCertificateScore(issuerName, '');
  return { points: score, tier: score >= 4 ? 'mnc' : score >= 3 ? 'official' : 'general', label: scoreInfo(score).label };
}

function scoreInfo(score) {
  const labels = {
    1: 'Participation / Attendance',
    2: 'Workshop / Webinar',
    3: 'Intermediate Course',
    4: 'Advanced Certification',
    5: 'Industry / International',
  };
  // Points gain applied to the skill category (capped at 100)
  const gains = { 1: 5, 2: 10, 3: 15, 4: 20, 5: 25 };
  return { score, label: labels[score] || 'Certificate', pointsGain: gains[score] || 10 };
}

// ── Skill Matrix Update ───────────────────────────────────────────

/**
 * Apply a cert score to the skill matrix for a given category.
 * Caps at 100.
 * @param {object} matrix  Current skillMatrix from Firestore
 * @param {string} category  SKILL_CATEGORY_KEYS key
 * @param {number} certScore  1–5
 * @returns {object} Updated matrix (new object)
 */
export function applyScoreToMatrix(matrix = {}, category, certScore) {
  const current = matrix[category] || 0;
  const gain = scoreInfo(certScore).pointsGain;
  const updated = Math.min(100, current + gain);
  return { ...matrix, [category]: updated };
}

// ── Category → Readiness Factor Mapping ──────────────────────────

/**
 * Map category key to which readiness factor it contributes to.
 * Multiple categories can contribute to the same factor.
 */
export const CATEGORY_TO_FACTOR = {
  programming:       'programming',
  webDevelopment:    'programming',
  mobileDevelopment: 'programming',
  ai_ml:             'programming',
  datascience:       'programming',
  cybersecurity:     'programming',
  cloudComputing:    'programming',
  devops:            'programming',
  uiux:              'programming',
  communication:     'communication',
  leadership:        'leadership',
  projectManagement: 'leadership',
  entrepreneurship:  'leadership',
};

// ── Readiness Formula (Weighted) ──────────────────────────────────

/**
 * Readiness = Programming×30% + Projects×25% + Certs×15%
 *           + Aptitude×10% + Communication×10% + Leadership×10%
 *
 * @param {object} params
 * @param {object} params.skillMatrix   Per-category scores (0–100)
 * @param {number} params.projectCount  Number of projects
 * @param {number} params.certPoints    Sum of approved cert scores (1–5 each)
 * @param {number} params.aptitudeScore 0–100 from quizzes
 * @param {number} params.mentorRating  0–1 mentor rating
 * @returns {{ total: number, breakdown: object }}
 */
export function calculateReadinessScore({
  skillMatrix = {},
  projectCount = 0,
  certPoints = 0,
  aptitudeScore = 0,
  mentorRating = 0,
}) {
  // Programming factor = avg of all programming-related category scores
  const progKeys = ['programming', 'webDevelopment', 'mobileDevelopment', 'ai_ml',
                    'datascience', 'cybersecurity', 'cloudComputing', 'devops', 'uiux'];
  const progScores = progKeys.map((k) => skillMatrix[k] || 0);
  const progAvg = progScores.reduce((a, b) => a + b, 0) / progKeys.length;

  // Projects: up to 100, 5 projects = 100%
  const projectScore = Math.min(100, projectCount * 20);

  // Certs: certPoints sum (each cert = score 1–5), cap at 100
  const certScore = Math.min(100, certPoints * 4);

  // Communication: avg of comm + uiux
  const commScore = Math.min(100, ((skillMatrix.communication || 0) + (skillMatrix.uiux || 0)) / 2);

  // Leadership: avg of leadership + projectManagement + entrepreneurship
  const leaderScore = Math.min(100,
    ((skillMatrix.leadership || 0) + (skillMatrix.projectManagement || 0) + (skillMatrix.entrepreneurship || 0)) / 3
  );

  const breakdown = {
    programming:   Math.round(progAvg),
    projects:      Math.round(projectScore),
    certs:         Math.round(certScore),
    aptitude:      Math.round(aptitudeScore),
    communication: Math.round(commScore),
    leadership:    Math.round(leaderScore),
  };

  const total = Math.round(
    breakdown.programming   * 0.30 +
    breakdown.projects      * 0.25 +
    breakdown.certs         * 0.15 +
    breakdown.aptitude      * 0.10 +
    breakdown.communication * 0.10 +
    breakdown.leadership    * 0.10
  );

  return { total: Math.min(100, total), breakdown };
}

// ── Readiness Levels (5 tiers) ────────────────────────────────────

export function getReadinessBadge(score) {
  if (score >= 90) return { label: 'Industry Ready',         color: 'text-purple-400',  bg: 'bg-purple-950/30',   border: 'border-purple-500/20' };
  if (score >= 75) return { label: 'Placement Ready',        color: 'text-brand-accent', bg: 'bg-brand-accent-light', border: 'border-brand-accent/20' };
  if (score >= 60) return { label: 'Placement Preparation',  color: 'text-blue-400',    bg: 'bg-blue-950/30',     border: 'border-blue-500/20' };
  if (score >= 40) return { label: 'Beginner',               color: 'text-yellow-400',  bg: 'bg-yellow-950/30',   border: 'border-yellow-500/20' };
  return               { label: 'Needs Improvement',         color: 'text-red-400',     bg: 'bg-red-950/20',      border: 'border-red-900/20' };
}

// ── Score Star Display ────────────────────────────────────────────

export const CERT_SCORE_CONFIG = {
  1: { stars: 1, color: 'text-gray-400',    bg: 'bg-gray-900/30',     label: 'Participation' },
  2: { stars: 2, color: 'text-blue-400',    bg: 'bg-blue-950/30',     label: 'Workshop' },
  3: { stars: 3, color: 'text-yellow-400',  bg: 'bg-yellow-950/30',   label: 'Intermediate' },
  4: { stars: 4, color: 'text-orange-400',  bg: 'bg-orange-950/30',   label: 'Advanced' },
  5: { stars: 5, color: 'text-brand-accent', bg: 'bg-brand-accent-light', label: 'Industry' },
};

/** Legacy color tokens used in some older components */
export const TIER_COLORS = {
  mnc:      { text: 'text-brand-accent',         bg: 'bg-brand-accent-light', border: 'border-brand-accent/20' },
  official: { text: 'text-indigo-400',            bg: 'bg-indigo-950/30',      border: 'border-indigo-500/20' },
  general:  { text: 'text-brand-text-secondary',  bg: 'bg-brand-card',         border: 'border-brand-border' },
};
