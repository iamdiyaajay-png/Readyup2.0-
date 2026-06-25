/**
 * gemini.js
 * ──────────────────────────────────────────────────────────────
 * Gemini AI service using the official @google/genai SDK v2.
 * Model: gemini-2.5-flash (supports text + vision/multimodal)
 * ──────────────────────────────────────────────────────────────
 */
import { GoogleGenAI } from '@google/genai';

const MODEL = 'gemini-2.5-flash';

/** Get a configured GoogleGenAI client, or null if no API key. */
function getClient() {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
}

// ─── Fallback helpers (used when API key is not configured) ───

function generateFallbackSkills(skill) {
  const normalized = skill.toLowerCase().trim();
  return [
    {
      title: `Official ${skill} Documentation`,
      description: `The authoritative reference manual and developer guidelines for mastering ${skill} core concepts.`,
      url: normalized.includes('react') ? 'https://react.dev'
           : normalized.includes('docker') ? 'https://docs.docker.com'
           : normalized.includes('firebase') ? 'https://firebase.google.com/docs'
           : 'https://developer.mozilla.org',
      type: 'Documentation',
    },
    {
      title: `Learn ${skill} on freeCodeCamp`,
      description: `Step-by-step interactive course and video tutorials explaining ${skill} from basic setup to deployment.`,
      url: 'https://www.freecodecamp.org',
      type: 'Course Video',
    },
    {
      title: `${skill} Roadmap on roadmap.sh`,
      description: `A visual path mapping out recommended learning pathways, prerequisites, and developer milestones for ${skill}.`,
      url: `https://roadmap.sh/${normalized.includes('front') ? 'frontend' : normalized.includes('back') ? 'backend' : 'computer-science'}`,
      type: 'Roadmap',
    },
  ];
}

function generateFallbackResumeReview(resumeText) {
  const text = resumeText.toLowerCase();
  const keywords = ['react', 'node', 'firebase', 'docker', 'ci/cd', 'typescript', 'tailwind', 'unit testing', 'sql', 'system design'];
  const missing = [];
  const feedbacks = [];

  keywords.forEach((kw) => {
    if (!text.includes(kw)) missing.push(kw.charAt(0).toUpperCase() + kw.slice(1));
  });

  let score = 55;
  if (resumeText.length > 500) score += 10;
  if (resumeText.length > 1500) score += 10;
  score += (keywords.length - missing.length) * 3;
  if (score > 98) score = 98;

  if (resumeText.length < 300) {
    feedbacks.push({ id: 1, type: 'warning', text: 'Resume is too brief. Expand with detailed project and experience sections.' });
  } else {
    feedbacks.push({ id: 1, type: 'success', text: 'Good resume length detected.' });
  }

  if (missing.length > 3) {
    feedbacks.push({ id: 2, type: 'warning', text: `Missing placement keywords: ${missing.slice(0, 3).join(', ')}.` });
  } else {
    feedbacks.push({ id: 2, type: 'success', text: 'High keyword density detected.' });
  }

  if (!text.includes('achieved') && !text.includes('increased') && !text.includes('%')) {
    feedbacks.push({ id: 3, type: 'warning', text: 'Add quantitative metrics (e.g. % improvements) using the Google XYZ formula.' });
  } else {
    feedbacks.push({ id: 3, type: 'success', text: 'Good use of measurable metrics.' });
  }

  return {
    score,
    level: score >= 80 ? 'High Match' : score >= 65 ? 'Medium Match' : 'Low Match',
    keyFeedback: feedbacks,
    missingKeywords: missing.slice(0, 5),
  };
}

// ─── Helper: parse JSON from Gemini response text ────────────

function cleanJSONResponse(raw) {
  let text = (raw || '').trim();
  // Strip markdown fences if present
  const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (match) text = match[1].trim();
  return JSON.parse(text);
}

// ─── Public API ───────────────────────────────────────────────

/**
 * Fetch curated free skill resources from Gemini.
 */
export async function getSkillResourcesFromGemini(skill) {
  const client = getClient();
  if (!client) {
    console.warn('VITE_GEMINI_API_KEY not set — using fallback skills.');
    return { resources: generateFallbackSkills(skill) };
  }

  const prompt = `You are a helpful coding assistant. For the tech skill '${skill}', provide exactly 3 of the best completely free learning paths, roadmaps, documentation sites, or free courses.
Return ONLY a valid JSON object with this exact schema (no markdown fences, no extra text):
{
  "resources": [
    {
      "title": "Title of the Resource",
      "description": "A concise description (1-2 sentences).",
      "url": "A valid real URL",
      "type": "Documentation"
    }
  ]
}
Allowed type values: "Documentation", "Course Video", "Roadmap"`;

  try {
    const response = await client.models.generateContent({
      model: MODEL,
      contents: prompt,
    });

    const resultText = response.text;
    if (!resultText) throw new Error('Empty response from Gemini');
    return cleanJSONResponse(resultText);
  } catch (err) {
    console.error('Gemini Skill Assistant failed, using fallback:', err.message);
    return { resources: generateFallbackSkills(skill) };
  }
}

/**
 * Review a resume text using Gemini and return an ATS score + feedback.
 */
export async function reviewResumeWithGemini(resumeText) {
  const client = getClient();
  if (!client) {
    console.warn('VITE_GEMINI_API_KEY not set — using fallback resume review.');
    return generateFallbackResumeReview(resumeText);
  }

  const prompt = `You are an expert HR Manager and ATS Optimizer. Analyze this raw resume text:
'${resumeText}'

Calculate an explicit ATS optimization score from 0 to 100.
Provide a level description: 'Low Match', 'Medium Match', or 'High Match'.
Provide exactly 3 key action-item feedback points. Each point should have an incrementing id, a type ('success' or 'warning'), and a detailed recommendation.
Identify 5 technical keywords completely missing from the text.

Return ONLY a valid JSON object (no markdown fences):
{
  "score": 75,
  "level": "Medium Match",
  "keyFeedback": [
    { "id": 1, "type": "warning", "text": "Feedback..." }
  ],
  "missingKeywords": ["Keyword1", "Keyword2"]
}`;

  try {
    const response = await client.models.generateContent({
      model: MODEL,
      contents: prompt,
    });

    const resultText = response.text;
    if (!resultText) throw new Error('Empty response from Gemini');
    return cleanJSONResponse(resultText);
  } catch (err) {
    console.error('Gemini Resume Review failed, using fallback:', err.message);
    return generateFallbackResumeReview(resumeText);
  }
}

/**
 * Validate a certificate using OCR-extracted text via Gemini text API.
 * Extracts 9 structured fields including CertID, Duration, Skills, Category.
 * @param {string} ocrText      Raw text extracted from the certificate image
 * @param {string} studentName  Student's profile name to fuzzy-match
 */
export async function validateCertificateFromText(ocrText, studentName) {
  const client = getClient();

  if (!client || !ocrText?.trim()) {
    const lower = ocrText?.toLowerCase() || '';
    const nameMatch = studentName
      ? lower.includes(studentName.toLowerCase().split(' ')[0])
      : false;
    return {
      studentName: studentName || 'Unknown',
      courseTitle: null, issuer: null, completionDate: null,
      certificateId: null, duration: null,
      skillsMentioned: [], achievementLevel: null, category: null,
      isCompleted: lower.includes('complet') || lower.includes('certif'),
      nameMatch,
      isValid: nameMatch && (lower.includes('complet') || lower.includes('certif')),
      ocrFallback: true,
    };
  }

  const prompt = `You are a certificate verification expert. The following raw text was extracted via OCR from a certificate image:

"""
${ocrText}
"""

Parse this text and extract all structured certificate information. Return ONLY a valid JSON object (no markdown fences, no extra text):
{
  "studentName": "Full name of the recipient as it appears on the certificate",
  "courseTitle": "Exact name of the course or program",
  "issuer": "Issuing organization, platform, or institution name",
  "completionDate": "Completion date in YYYY-MM-DD format if present, otherwise null",
  "certificateId": "Certificate ID or credential number if present, otherwise null",
  "duration": "Duration of the course (e.g. '40 hours', '3 months') if present, otherwise null",
  "skillsMentioned": ["list", "of", "skills", "mentioned", "on", "cert"],
  "achievementLevel": "e.g. 'Gold', 'Distinction', 'Pass', 'First Place', or null if not mentioned",
  "category": "One of: Programming, Web Development, Mobile Development, AI/ML, Data Science, Cybersecurity, Cloud Computing, DevOps, UI/UX, Communication, Leadership, Project Management, Entrepreneurship, or 'Other'",
  "isCompleted": true
}

Set isCompleted to true only if the certificate clearly indicates the course was completed, passed, or awarded.
If a field cannot be determined from the text, use null. skillsMentioned defaults to [].`;

  try {
    const response = await client.models.generateContent({ model: MODEL, contents: prompt });
    const resultText = response.text;
    if (!resultText) throw new Error('Empty response from Gemini text API');

    const parsed = cleanJSONResponse(resultText);

    const normalize = (s) => (s || '').toLowerCase().replace(/[^a-z\s]/g, '').trim();
    const certName = normalize(parsed.studentName);
    const profileName = normalize(studentName);
    const nameMatch = certName.length > 0 && (
      certName === profileName ||
      certName.includes(profileName.split(' ')[0]) ||
      profileName.includes(certName.split(' ')[0])
    );
    const isValid = parsed.isCompleted === true && nameMatch;
    return { ...parsed, nameMatch, isValid };
  } catch (err) {
    console.error('Gemini text validation failed:', err);
    const msg = err?.message || '';
    if (msg.includes('400') || msg.includes('401') || msg.includes('403')) {
      throw new Error(`❌ API Key Error: Invalid Gemini API key. Get one at aistudio.google.com.`);
    }
    if (msg.includes('429')) throw new Error('⚠️ Quota exceeded — wait a minute and retry.');
    throw new Error(`Gemini parse error: ${msg}`);
  }
}

/**
 * Full Gemini AI evaluation of a certificate AFTER OCR extraction.
 * Returns: score (1–5), skill category, authenticity confidence, fraud flags,
 * placement relevance, and suggested learning path.
 *
 * @param {string} ocrText         Raw OCR text from the certificate
 * @param {object} ocrFields       Structured fields extracted by validateCertificateFromText
 * @param {object} studentProfile  { name, branch, year, skills[] }
 * @returns {Promise<object>}
 */
export async function evaluateCertificateWithGemini(ocrText, ocrFields, studentProfile) {
  const client = getClient();

  // ── Fallback when no API key ──────────────────────────────────
  if (!client) {
    const issuer = (ocrFields?.issuer || '').toLowerCase();
    let score = 2;
    if (['google','microsoft','aws','cisco','azure','oracle','meta'].some(k => issuer.includes(k))) score = 5;
    else if (['coursera','edx','nptel','udemy'].some(k => issuer.includes(k))) score = 3;
    return {
      score,
      skillCategory: ocrFields?.category || 'Programming',
      difficultyLevel: score >= 4 ? 'Advanced' : score >= 3 ? 'Intermediate' : 'Beginner',
      industryRelevance: score * 20,
      placementRelevance: score * 18,
      authenticityConfidence: 75,
      fraudFlags: [],
      isSuspicious: false,
      suggestedLearningPath: [`Next: Study for a higher-level ${ocrFields?.category || ''} certification`],
      evaluationNote: 'Offline evaluation (no Gemini API key)',
    };
  }

  const prompt = `You are an expert placement counselor and certificate authentication specialist.

CERTIFICATE DETAILS:
- Title: ${ocrFields?.courseTitle || 'Unknown'}
- Issuer: ${ocrFields?.issuer || 'Unknown'}
- Student Name on Cert: ${ocrFields?.studentName || 'Unknown'}
- Date: ${ocrFields?.completionDate || 'Unknown'}
- Certificate ID: ${ocrFields?.certificateId || 'Not found'}
- Duration: ${ocrFields?.duration || 'Not specified'}
- Skills Mentioned: ${(ocrFields?.skillsMentioned || []).join(', ') || 'None'}
- Achievement Level: ${ocrFields?.achievementLevel || 'Not mentioned'}
- Category: ${ocrFields?.category || 'Unknown'}

STUDENT PROFILE:
- Name: ${studentProfile?.name || 'Unknown'}
- Branch: ${studentProfile?.branch || 'Unknown'}
- Year: ${studentProfile?.year || 'Unknown'}
- Current Skills: ${(studentProfile?.approvedSkills || studentProfile?.skills || []).join(', ') || 'None listed'}

OCR RAW TEXT (first 500 chars):
${(ocrText || '').slice(0, 500)}

Evaluate this certificate and return ONLY a valid JSON object (no markdown):
{
  "score": 3,
  "skillCategory": "AI/ML",
  "difficultyLevel": "Intermediate",
  "industryRelevance": 75,
  "placementRelevance": 80,
  "authenticityConfidence": 90,
  "fraudFlags": [],
  "isSuspicious": false,
  "suggestedLearningPath": ["Suggested next step 1", "Suggested next step 2"],
  "evaluationNote": "Brief evaluation note"
}

SCORING RULES:
- Score 1: Seminar, Attendance, Participation Only (no learning assessment)
- Score 2: Workshop, Webinar, Basic Training (short, no assessment)
- Score 3: Intermediate Course, Skill Development, Technical Workshop with Assessment (Coursera, NPTEL, Udemy)
- Score 4: Advanced Certification, Hackathon Finalist/Winner, Domain Specific Training (CompTIA, PMI)
- Score 5: Industry Recognized (Google, Microsoft, AWS, Cisco, Azure, Oracle), National/International Winner

FRAUD FLAGS (include any that apply):
- "Missing Certificate ID" — if certificateId is null or very generic
- "Name Mismatch" — if student name on cert doesn't match profile name
- "Invalid Date" — if date is in the future or format is suspicious
- "Fake Organizer" — if issuer appears unofficial/fabricated
- "Suspicious Duration" — e.g. "10 day AI certification" that should take months
- "Possible Duplicate" — if cert seems generic/reused template
- "Low Authenticity" — if overall certificate seems fabricated

skillCategory must be exactly one of: Programming, Web Development, Mobile Development, AI/ML, Data Science, Cybersecurity, Cloud Computing, DevOps, UI/UX, Communication, Leadership, Project Management, Entrepreneurship`;

  try {
    const response = await client.models.generateContent({ model: MODEL, contents: prompt });
    const resultText = response.text;
    if (!resultText) throw new Error('Empty evaluation response');
    const result = cleanJSONResponse(resultText);
    // Ensure score is in valid range
    result.score = Math.max(1, Math.min(5, Math.round(result.score || 2)));
    result.authenticityConfidence = Math.max(0, Math.min(100, result.authenticityConfidence || 70));
    result.fraudFlags = Array.isArray(result.fraudFlags) ? result.fraudFlags : [];
    result.isSuspicious = result.fraudFlags.length > 0 || result.authenticityConfidence < 50;
    return result;
  } catch (err) {
    console.error('Gemini evaluation failed:', err);
    return {
      score: 2, skillCategory: ocrFields?.category || 'Programming',
      difficultyLevel: 'Unknown', industryRelevance: 50, placementRelevance: 50,
      authenticityConfidence: 60, fraudFlags: [], isSuspicious: false,
      suggestedLearningPath: [], evaluationNote: `Evaluation unavailable: ${err.message}`,
    };
  }
}


export async function validateCertificateWithGemini(base64Data, mimeType, studentName) {
  const client = getClient();

  if (!client) {
    console.warn('VITE_GEMINI_API_KEY not set — returning mock certificate result.');
    return {
      studentName,
      courseTitle: 'React Development Bootcamp',
      issuer: 'Udemy',
      completionDate: '2026-05-15',
      isCompleted: true,
      nameMatch: true,
      isValid: true,
    };
  }

  const prompt = `You are a certificate verification system. Carefully examine this certificate document image.
Extract these details and return ONLY a valid JSON object (no markdown fences, no extra text):
{
  "studentName": "Full name printed on the certificate exactly as written",
  "courseTitle": "Name of the course or program",
  "issuer": "Issuing organization or platform name",
  "completionDate": "Date of completion in YYYY-MM-DD format, or null if not found",
  "isCompleted": true
}
Set isCompleted to true only if the document is a completion or passing certificate.
If a field cannot be determined, use null.`;

  try {
    const response = await client.models.generateContent({
      model: MODEL,
      contents: [
        { text: prompt },
        {
          inlineData: {
            mimeType,
            data: base64Data,
          },
        },
      ],
    });

    const resultText = response.text;
    if (!resultText) throw new Error('Empty vision response from Gemini');

    const parsed = cleanJSONResponse(resultText);

    // Fuzzy name match
    const normalize = (s) => (s || '').toLowerCase().replace(/[^a-z\s]/g, '').trim();
    const certName = normalize(parsed.studentName);
    const profileName = normalize(studentName);

    const nameMatch = certName.length > 0 && (
      certName === profileName ||
      certName.includes(profileName.split(' ')[0]) ||
      profileName.includes(certName.split(' ')[0])
    );

    const isValid = parsed.isCompleted === true && nameMatch;

    return { ...parsed, nameMatch, isValid };
  } catch (err) {
    console.error('Certificate validation failed:', err);

    // Surface meaningful error to UI
    const msg = err?.message || 'Unknown error';
    if (msg.includes('400') || msg.includes('401') || msg.includes('403') || msg.includes('API_KEY')) {
      throw new Error(`❌ API Key Error (${msg.match(/\d{3}/)?.[0] || 'Unknown'}): Invalid or unauthorized Gemini API key. Please verify your key at aistudio.google.com.`);
    }
    if (msg.includes('404') || msg.includes('not found')) {
      throw new Error(`❌ Model not found. The API key may not have access to ${MODEL}. Try regenerating your key from aistudio.google.com.`);
    }
    if (msg.includes('429')) {
      throw new Error('⚠️ Quota exceeded — Gemini rate limit hit. Wait a minute and retry.');
    }
    throw new Error(`Gemini error: ${msg}`);
  }
}
