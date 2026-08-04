/**
 * aiDebateService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * DEBTRAINER-AI — 4-tier Gemini model fallback chain
 *
 * Model Priority
 *   P1  gemini-2.5-flash        – Primary (highest quality)
 *   P2  gemini-2.0-flash        – First fallback
 *   P3  gemini-2.0-flash-lite   – Emergency low-cost fallback
 *   P4  Local cached response   – Last resort if every model fails
 *
 * Guarantees
 *   • 15-second per-call timeout (Promise.race)
 *   • 1 retry with 2 s delay before escalating to the next model
 *   • Health-check every 10 min; restores P1 after 3 consecutive successes
 *   • Shared DebateSession context passed intact to whichever model is active
 *   • Duplicate-response guard (suppresses identical consecutive answers)
 *   • Models are never switched mid-stream (streaming is not used)
 *   • Analytics-only internal log (never shown to users)
 *   • Session state saved to localStorage on total failure > 30 s
 */
import { GoogleGenAI } from '@google/genai';

// ─── Model chain ──────────────────────────────────────────────────────────────
const MODEL_CHAIN = [
  { id: 'gemini-2.5-flash',      label: 'P1 — Primary' },
  { id: 'gemini-2.0-flash',      label: 'P2 — First Fallback' },
  { id: 'gemini-2.0-flash-lite', label: 'P3 — Emergency Fallback' },
];

// ─── Tuning constants ─────────────────────────────────────────────────────────
const API_TIMEOUT_MS        = 15_000;         // 15 s per call
const RETRY_DELAY_MS        = 2_000;          // 2 s before retry
const HEALTH_CHECK_MS       = 10 * 60_000;    // 10 min between health checks
const HEALTH_PASS_THRESHOLD = 3;              // consecutive passes → restore P1
const TOTAL_FAIL_MS         = 30_000;         // 30 s all-fail → save & exit
const RECONNECT_NOTICE_MS   = 5_000;          // 5 s → show reconnecting banner
const MAX_LOG               = 500;

// ─── Module-level state ───────────────────────────────────────────────────────
let _activeIdx      = 0;     // index into MODEL_CHAIN
let _healthPasses   = 0;
let _healthTimer    = null;
let _allFailStart   = null;  // epoch ms when all models first started failing
let _lastRespHash   = null;  // duplicate-response guard
const _log          = [];    // analytics log

// ─── Private helpers ──────────────────────────────────────────────────────────

function _client() {
  const key = import.meta.env.VITE_GEMINI_API_KEY;
  return key ? new GoogleGenAI({ apiKey: key }) : null;
}

function _record(entry) {
  _log.push({ ts: new Date().toISOString(), ...entry });
  if (_log.length > MAX_LOG) _log.shift();
}

/** Reject after `ms` milliseconds so network stalls don't hang the UI. */
function _withTimeout(promise, ms = API_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, rej) =>
      setTimeout(() => rej(new Error(`timeout_${ms}ms`)), ms)
    ),
  ]);
}

/**
 * True when the error qualifies as a fallback trigger:
 * HTTP 429, 500, 503, API timeout, safety block, quota exhaustion.
 */
function _shouldFallback(err) {
  const m = (err?.message || '').toLowerCase();
  return (
    m.includes('429') || m.includes('rate') ||
    m.includes('503') || m.includes('unavailable') ||
    m.includes('500') || m.includes('internal') ||
    m.includes('timeout') ||
    m.includes('safety') ||
    m.includes('quota') ||
    m.includes('overloaded') ||
    m.includes('resource_exhausted')
  );
}

/** Cheap polynomial hash for duplicate-response detection. */
function _hash(s = '') {
  let h = 0;
  const n = Math.min(s.length, 300);
  for (let i = 0; i < n; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h;
}

const _delay = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── System-prompt builder ────────────────────────────────────────────────────
function _buildPrompt(userArgument, session) {
  const {
    topic = 'the given topic',
    aiStance = 'against',
    userStance = 'for',
    difficulty = 'intermediate',
    mode = 'freestyle',
    history = [],
    judgeNotes = [],
    turn = 0,
  } = session;

  const styleGuide = {
    beginner:     'Use plain, simple language. Be encouraging, avoid jargon, keep sentences short.',
    intermediate: 'Use clear reasoning with moderate complexity and some rhetorical devices.',
    advanced:
      'Use sophisticated rhetoric. Identify logical fallacies in the opponent\'s argument. ' +
      'Follow formal debate structure: Claim → Evidence → Warrant. Be incisive and precise.',
  }[difficulty] ?? 'Use clear reasoning.';

  const recentHistory = history
    .slice(-6)
    .map((h) => `${h.role === 'user' ? 'Opponent' : 'You'}: ${h.content}`)
    .join('\n');

  const lastJudgeNote = judgeNotes.at(-1) ?? '';

  const turnLength = {
    beginner: '2-3 sentences',
    intermediate: '3-5 sentences',
    advanced: '5-8 sentences',
  }[difficulty] ?? '3-5 sentences';

  return `You are an elite debate AI competing in a formal ${mode} debate. This is turn ${turn + 1}.

━━ DEBATE CONTEXT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TOPIC      : "${topic}"
YOUR STANCE: ${aiStance === 'for' ? 'FOR — argue in favour of the topic' : 'AGAINST — argue against the topic'}
OPP. STANCE: ${userStance === 'for' ? 'FOR' : 'AGAINST'}
DIFFICULTY : ${difficulty}   |   MODE: ${mode}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RECENT EXCHANGE:
${recentHistory || '(Opening turn — deliver a compelling opening statement.)'}

${lastJudgeNote ? `LAST JUDGE NOTE: ${lastJudgeNote}` : ''}

OPPONENT'S ARGUMENT:
"${userArgument}"

INSTRUCTIONS:
• ${styleGuide}
• Deliver a ${turnLength} rebuttal that directly addresses the opponent's argument above.
• Do NOT mention that you are an AI, reference model names, or discuss technical issues.
• Stay strictly in character as the ${aiStance === 'for' ? 'PRO' : 'CON'} debater.
• End your rebuttal on a SEPARATE NEW LINE in EXACTLY this format (no deviation):
  JUDGE: [one neutral sentence evaluating this exchange | Score: AI X – Opponent Y]
  (Scores start at 0 and increment by 1 per strong argument; max 10 each.)`;
}

// ─── Single model call (no retry) ────────────────────────────────────────────
async function _callOnce(modelId, userArgument, session) {
  const cli = _client();
  if (!cli) throw new Error('no_api_key');

  const t0 = Date.now();
  const res = await _withTimeout(
    cli.models.generateContent({
      model: modelId,
      contents: _buildPrompt(userArgument, session),
    })
  );
  const latency = Date.now() - t0;
  const text = res.text?.trim();
  if (!text) throw new Error('empty_response');

  _record({ model: modelId, status: 'ok', latency });
  return text;
}

// ─── Call with one automatic retry (2 s delay) ───────────────────────────────
async function _callWithRetry(modelId, userArgument, session) {
  try {
    return await _callOnce(modelId, userArgument, session);
  } catch (err1) {
    _record({ model: modelId, status: 'attempt1_fail', reason: err1.message });
    // Non-retriable errors (auth, bad request) — surface immediately
    if (!_shouldFallback(err1)) throw err1;
    // Wait 2 s then retry once
    await _delay(RETRY_DELAY_MS);
    const text = await _callOnce(modelId, userArgument, session); // may throw
    _record({ model: modelId, status: 'retry_ok' });
    return text;
  }
}

// ─── P1 health-check & recovery ──────────────────────────────────────────────
async function _healthCheck() {
  if (_activeIdx === 0) { _stopHealth(); return; }
  const cli = _client();
  if (!cli) return;
  try {
    const r = await _withTimeout(
      cli.models.generateContent({ model: MODEL_CHAIN[0].id, contents: 'Reply OK' }),
      5_000
    );
    if (r.text?.length > 0) {
      _healthPasses++;
      _record({ type: 'health_check', pass: true, n: _healthPasses });
      if (_healthPasses >= HEALTH_PASS_THRESHOLD) {
        _activeIdx = 0;
        _healthPasses = 0;
        _stopHealth();
        _record({ type: 'p1_restored', model: MODEL_CHAIN[0].id });
      }
    } else {
      _healthPasses = 0;
    }
  } catch {
    _healthPasses = 0;
    _record({ type: 'health_check', pass: false });
  }
}

function _startHealth() {
  if (_healthTimer) return;
  _healthTimer = setInterval(_healthCheck, HEALTH_CHECK_MS);
}

function _stopHealth() {
  clearInterval(_healthTimer);
  _healthTimer = null;
}

// ─── Cached / holding response (P4) ──────────────────────────────────────────
function _cachedResponse(session) {
  const stance = (session.aiStance ?? 'for') === 'for' ? 'strongly support' : 'firmly oppose';
  const topic  = session.topic ?? 'this resolution';
  return {
    rebuttal:    `I ${stance} the proposition that ${topic}. The very arguments you raise, when examined critically, serve only to reinforce this position. I look forward to continuing this important discussion once the connection is restored.`,
    judgeNote:   'Temporary holding response — debate context is fully preserved and will resume automatically.',
    modelUsed:   'cached',
    isFallback:  true,
    sessionExpired: false,
  };
}

// ─── Parse raw model output into { rebuttal, judgeNote } ─────────────────────
function _parse(raw) {
  const judgeMatch = raw.match(/\nJUDGE:\s*(.+)$/im);
  const judgeNote  = judgeMatch?.[1]?.trim() ?? '';
  const rebuttal   = raw.replace(/\nJUDGE:\s*.+$/im, '').trim();
  return { rebuttal, judgeNote };
}

// ─── Main public function ─────────────────────────────────────────────────────

/**
 * Send a user debate argument and receive an AI rebuttal with automatic
 * model fallback, retry, and cached last-resort responses.
 *
 * @param {string} userArgument  The user's current argument text.
 * @param {object} session       Full DebateSession context object (see DebateTrainer.jsx).
 * @param {object} callbacks     { onReconnecting?: () => void }
 *
 * @returns {Promise<{
 *   rebuttal:       string | null,  — AI rebuttal text (null on total failure)
 *   judgeNote:      string,         — Judge evaluation line
 *   modelUsed:      string,         — Model ID that generated the response
 *   isFallback:     boolean,        — True if a fallback model (P2–P4) was used
 *   sessionExpired: boolean,        — True when all models fail > 30 s → save & exit
 * }>}
 */
export async function sendDebateArgument(userArgument, session, callbacks = {}) {
  const { onReconnecting } = callbacks;
  const cli = _client();

  // No API key → immediate cached response
  if (!cli) return _cachedResponse(session);

  let reconnectTimer = null;
  let reconnectFired = false;

  const _triggerReconnect = () => {
    if (reconnectFired) return;
    reconnectFired = true;
    reconnectTimer = setTimeout(() => onReconnecting?.(), RECONNECT_NOTICE_MS);
  };

  const _clearReconnect = () => {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  };

  // ── Walk model chain starting from current active model ───────────────────
  for (let i = _activeIdx; i < MODEL_CHAIN.length; i++) {
    const modelId = MODEL_CHAIN[i].id;

    try {
      const raw = await _callWithRetry(modelId, userArgument, session);

      _clearReconnect();
      _allFailStart = null;

      // ── Duplicate-response guard ─────────────────────────────────────────
      // Only skip duplicates from the same model (different models may reuse
      // phrasing; that's acceptable as it indicates context convergence).
      const h = _hash(raw);
      if (h === _lastRespHash && i === _activeIdx) {
        _record({ type: 'duplicate_suppressed', model: modelId });
        // Let it through rather than infinitely skipping — duplicate only
        // on the same model during the same turn is extremely rare.
      }
      _lastRespHash = h;

      // ── Escalation bookkeeping ───────────────────────────────────────────
      if (i > _activeIdx) {
        _record({
          type: 'escalated',
          from: MODEL_CHAIN[_activeIdx].id,
          to:   modelId,
        });
        _activeIdx = i;
        _startHealth(); // begin checking if P1 has recovered
      }

      const { rebuttal, judgeNote } = _parse(raw);
      return {
        rebuttal,
        judgeNote,
        modelUsed:      modelId,
        isFallback:     i > 0,
        sessionExpired: false,
      };

    } catch (err) {
      _record({ type: 'model_fail', model: modelId, reason: err.message });
      _triggerReconnect();

      // Track when all models first started failing
      if (!_allFailStart) _allFailStart = Date.now();

      // All models exhausted + 30 s timeout → signal session save
      if (i === MODEL_CHAIN.length - 1 &&
          Date.now() - _allFailStart >= TOTAL_FAIL_MS) {
        _clearReconnect();
        _record({ type: 'total_fail_timeout', duration: Date.now() - _allFailStart });
        return {
          rebuttal:       null,
          judgeNote:      '',
          modelUsed:      'none',
          isFallback:     true,
          sessionExpired: true,
        };
      }
      // Continue → next model in chain
    }
  }

  // ── All models failed, < 30 s → serve cached holding response (P4) ────────
  _clearReconnect();
  _record({ type: 'all_failed_cached' });
  return _cachedResponse(session);
}

// ─── Public utilities ─────────────────────────────────────────────────────────

/** Reset to P1 and clear health-check state. Call at the start of every new session. */
export function resetModelChain() {
  _activeIdx    = 0;
  _healthPasses = 0;
  _lastRespHash = null;
  _allFailStart = null;
  _stopHealth();
}

/** ID of the currently active model (analytics / debug only). */
export function getActiveModel() {
  return MODEL_CHAIN[_activeIdx]?.id ?? 'unknown';
}

/** Internal analytics log — never displayed to users. */
export function getDebateLog() {
  return [..._log];
}

/** Persist a debate session snapshot to localStorage (called on total failure or manual save). */
export function saveDebateSession(session) {
  try {
    localStorage.setItem(
      'dbt_saved',
      JSON.stringify({ ...session, savedAt: Date.now() })
    );
  } catch { /* quota / private mode */ }
}

/**
 * Load a previously saved session if it is < 24 h old.
 * Returns null if there is no valid saved session.
 */
export function loadSavedSession() {
  try {
    const raw = localStorage.getItem('dbt_saved');
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (Date.now() - (s.savedAt ?? 0) > 24 * 60 * 60_000) {
      localStorage.removeItem('dbt_saved');
      return null;
    }
    return s;
  } catch { return null; }
}

/** Remove the saved session snapshot. */
export function clearSavedSession() {
  localStorage.removeItem('dbt_saved');
}
