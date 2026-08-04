/**
 * DebateTrainer.jsx
 * DEBTRAINER-AI — AI-powered debate training with 4-tier model fallback chain.
 * Accessible at: /student/debate-trainer
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  sendDebateArgument,
  resetModelChain,
  saveDebateSession,
  loadSavedSession,
  clearSavedSession,
} from '../../services/aiDebateService';
import {
  Swords, Send, Clock, Trophy, RotateCcw, Save,
  X, Zap, Shield, Target, Brain, ChevronDown,
  AlertCircle, WifiOff, CheckCircle2, Flame,
} from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────
const TURN_TIMES = { beginner: 90, intermediate: 60, advanced: 45 };

const DIFFICULTIES = [
  {
    id: 'beginner',
    label: 'Beginner',
    desc: 'Simple language, encouraging feedback',
    Icon: Shield,
    ring: 'ring-emerald-500/40',
    activeBg: 'bg-emerald-950/50 border-emerald-600/50',
    idleBg: 'bg-emerald-950/20 border-emerald-900/30',
    color: 'text-emerald-400',
  },
  {
    id: 'intermediate',
    label: 'Intermediate',
    desc: 'Balanced arguments, moderate complexity',
    Icon: Target,
    ring: 'ring-amber-500/40',
    activeBg: 'bg-amber-950/50 border-amber-600/50',
    idleBg: 'bg-amber-950/20 border-amber-900/30',
    color: 'text-amber-400',
  },
  {
    id: 'advanced',
    label: 'Advanced',
    desc: 'Formal structure, fallacy detection',
    Icon: Brain,
    ring: 'ring-red-500/40',
    activeBg: 'bg-red-950/50 border-red-600/50',
    idleBg: 'bg-red-950/20 border-red-900/30',
    color: 'text-red-400',
  },
];

const PRESET_TOPICS = [
  'AI will create more jobs than it destroys in the next decade',
  'Social media does more harm than good to society',
  'Remote work is more productive than in-office work',
  'Space exploration should be prioritized over solving Earth\'s problems',
  'Universal Basic Income should be implemented globally',
  'Nuclear energy is essential for combating climate change',
  'Data privacy is more important than national security',
  'Competitive exams are a fair measure of student ability',
  'Entrepreneurship is better than employment for personal growth',
  'Automation in manufacturing is ultimately beneficial for workers',
];

const makeSession = () => ({
  topic: '',
  userStance: 'for',
  aiStance: 'against',
  difficulty: 'intermediate',
  mode: 'freestyle',
  history: [],
  judgeNotes: [],
  turn: 0,
  score: { user: 0, ai: 0 },
});

// ─── Component ────────────────────────────────────────────────────────────────
export default function DebateTrainer() {
  // phase: 'setup' | 'debating' | 'finished' | 'allFailed'
  const [phase, setPhase] = useState('setup');
  const [session, setSession] = useState(makeSession());
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [timerSec, setTimerSec] = useState(60);
  const [timerRunning, setTimerRunning] = useState(false);
  const [topicOpen, setTopicOpen] = useState(false);
  const [savedBanner, setSavedBanner] = useState(null); // saved session meta

  const messagesEndRef = useRef(null);
  const timerRef       = useRef(null);
  const inputRef       = useRef(null);
  const sessionRef     = useRef(session); // always current for async closures
  sessionRef.current   = session;

  // ── Load any saved session on mount ───────────────────────────────────────
  useEffect(() => {
    const s = loadSavedSession();
    if (s) setSavedBanner(s);
  }, []);

  // ── Auto-scroll chat ───────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // ── Timer ─────────────────────────────────────────────────────────────────
  const clearTimer = useCallback(() => {
    clearInterval(timerRef.current);
    setTimerRunning(false);
  }, []);

  const startTimer = useCallback((difficulty) => {
    clearInterval(timerRef.current);
    const max = TURN_TIMES[difficulty] ?? 60;
    setTimerSec(max);
    setTimerRunning(true);
    timerRef.current = setInterval(() => {
      setTimerSec((prev) => {
        if (prev <= 1) { clearInterval(timerRef.current); setTimerRunning(false); return 0; }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // Pause timer while AI is working or reconnecting
  useEffect(() => {
    if (isLoading || reconnecting) {
      clearInterval(timerRef.current);
    } else if (phase === 'debating' && timerRunning) {
      timerRef.current = setInterval(() => {
        setTimerSec((prev) => {
          if (prev <= 1) { clearInterval(timerRef.current); setTimerRunning(false); return 0; }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [isLoading, reconnecting, phase, timerRunning]);

  useEffect(() => () => clearInterval(timerRef.current), []);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleStartDebate = useCallback(() => {
    if (!session.topic.trim()) return;
    resetModelChain();
    clearSavedSession();
    setSavedBanner(null);
    const opening = {
      id: 'sys-0',
      role: 'system',
      content: `Debate started!\nTopic: "${session.topic}"\nYou are arguing ${session.userStance === 'for' ? 'FOR ✅' : 'AGAINST ❌'} · AI is arguing ${session.aiStance === 'for' ? 'FOR ✅' : 'AGAINST ❌'}\nDifficulty: ${session.difficulty} · Mode: ${session.mode}`,
      ts: Date.now(),
    };
    setMessages([opening]);
    setPhase('debating');
    startTimer(session.difficulty);
    setTimeout(() => inputRef.current?.focus(), 400);
  }, [session, startTimer]);

  const handleRestoreSession = useCallback(() => {
    if (!savedBanner) return;
    const { savedAt: _sa, ...restored } = savedBanner;
    setSession(restored);
    sessionRef.current = restored;
    const msgs = restored.history.map((h, idx) => ({
      id: `restored-${idx}`,
      role: h.role,
      content: h.content,
      judgeNote: restored.judgeNotes[idx] ?? '',
      ts: h.ts ?? Date.now(),
    }));
    setMessages([
      { id: 'sys-restore', role: 'system', content: `Session restored: "${restored.topic}"`, ts: Date.now() },
      ...msgs,
    ]);
    setSavedBanner(null);
    clearSavedSession();
    resetModelChain();
    setPhase('debating');
    startTimer(restored.difficulty);
    setTimeout(() => inputRef.current?.focus(), 400);
  }, [savedBanner, startTimer]);

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || isLoading || phase !== 'debating') return;

    setInputText('');
    clearTimer();
    setIsLoading(true);
    setReconnecting(false);

    // Optimistic user message
    const userMsg = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text,
      ts: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);

    // Build updated session with user's argument
    const updatedSession = {
      ...sessionRef.current,
      history: [
        ...sessionRef.current.history,
        { role: 'user', content: text, ts: Date.now() },
      ],
      turn: sessionRef.current.turn + 1,
    };

    try {
      const result = await sendDebateArgument(text, updatedSession, {
        onReconnecting: () => setReconnecting(true),
      });

      setReconnecting(false);

      // All models failed > 30 s → save and show allFailed screen
      if (result.sessionExpired) {
        saveDebateSession({ ...updatedSession, savedAt: Date.now() });
        setSession(updatedSession);
        setPhase('allFailed');
        return;
      }

      // Parse score from judge note (e.g. "Score: AI 3 – Opponent 2")
      let newScore = { ...sessionRef.current.score };
      const sm = result.judgeNote?.match(/score[:\s]+(?:ai\s+)?(\d+)\s*[–\-—]\s*(?:opponent\s+)?(\d+)/i);
      if (sm) {
        newScore = {
          ai:   Math.min(10, parseInt(sm[1], 10) || newScore.ai),
          user: Math.min(10, parseInt(sm[2], 10) || newScore.user),
        };
      }

      const finalSession = {
        ...updatedSession,
        history: [
          ...updatedSession.history,
          { role: 'ai', content: result.rebuttal, ts: Date.now() },
        ],
        judgeNotes: [...updatedSession.judgeNotes, result.judgeNote],
        score: newScore,
      };
      setSession(finalSession);
      sessionRef.current = finalSession;

      const aiMsg = {
        id: `ai-${Date.now()}`,
        role: 'ai',
        content: result.rebuttal,
        judgeNote: result.judgeNote,
        isFallback: result.isFallback,
        ts: Date.now(),
      };
      setMessages((prev) => [...prev, aiMsg]);

      // Structured mode: auto-finish after 6 turns (opening + 2 rebuttals + closing each)
      if (updatedSession.mode === 'structured' && updatedSession.turn >= 6) {
        clearTimer();
        setPhase('finished');
      } else {
        startTimer(finalSession.difficulty);
      }
    } catch {
      setReconnecting(false);
      setMessages((prev) => [
        ...prev,
        { id: `err-${Date.now()}`, role: 'error', content: 'Something went wrong. Please try again.', ts: Date.now() },
      ]);
      startTimer(sessionRef.current.difficulty);
    } finally {
      setIsLoading(false);
    }
  }, [inputText, isLoading, phase, clearTimer, startTimer]);

  const handleEndDebate = useCallback(() => {
    clearTimer();
    setPhase('finished');
  }, [clearTimer]);

  const handleSaveExit = useCallback(() => {
    clearTimer();
    saveDebateSession({ ...sessionRef.current, savedAt: Date.now() });
    setSavedBanner({ ...sessionRef.current, savedAt: Date.now() });
    setPhase('setup');
    setSession(makeSession());
    setMessages([]);
  }, [clearTimer]);

  const handleNewDebate = useCallback(() => {
    clearTimer();
    clearSavedSession();
    resetModelChain();
    setPhase('setup');
    setSession(makeSession());
    setMessages([]);
    setInputText('');
    setReconnecting(false);
    setSavedBanner(null);
  }, [clearTimer]);

  const handleRetryAfterFail = useCallback(() => {
    resetModelChain();
    const loaded = loadSavedSession();
    if (loaded) {
      const { savedAt: _sa, ...s } = loaded;
      setSession(s);
      setPhase('debating');
      startTimer(s.difficulty);
      setTimeout(() => inputRef.current?.focus(), 400);
    } else {
      setPhase('setup');
    }
  }, [startTimer]);

  // ── Timer derived values ────────────────────────────────────────────────
  const maxTime   = TURN_TIMES[session.difficulty] ?? 60;
  const timerPct  = timerSec / maxTime;
  const timerClr  = timerPct > 0.5 ? 'text-emerald-400' : timerPct > 0.25 ? 'text-amber-400' : 'text-red-400 animate-pulse';
  const fmtTimer  = `${String(Math.floor(timerSec / 60)).padStart(2, '0')}:${String(timerSec % 60).padStart(2, '0')}`;

  // ──────────────────────────────────────────────────────────────────────────
  // RENDER: SETUP
  // ──────────────────────────────────────────────────────────────────────────
  if (phase === 'setup') {
    return (
      <div className="min-h-screen bg-brand-bg p-6 pb-12">
        <div className="max-w-2xl mx-auto">
          {/* Hero */}
          <div className="text-center mb-10 pt-4">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-accent to-emerald-500 shadow-xl shadow-brand-accent/20 mb-5">
              <Swords size={30} className="text-brand-bg" />
            </div>
            <h1 className="text-4xl font-bold text-brand-text-primary tracking-tight">
              DEBT<span className="text-brand-accent">RAINER</span>
              <span className="text-brand-text-muted font-light"> AI</span>
            </h1>
            <p className="text-brand-text-secondary text-sm mt-2 max-w-xs mx-auto leading-relaxed">
              Sharpen your debate skills against an AI that never goes offline — backed by a 4-tier model fallback chain.
            </p>
          </div>

          {/* Saved session banner */}
          {savedBanner && (
            <div className="mb-6 p-4 rounded-2xl bg-amber-950/25 border border-amber-800/40 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-amber-400 text-xs font-bold uppercase tracking-wider">Saved session found</p>
                <p className="text-brand-text-secondary text-sm mt-0.5 truncate">"{savedBanner.topic}"</p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={handleRestoreSession}
                  className="px-3 py-1.5 bg-amber-900/50 border border-amber-700/50 text-amber-300 text-xs font-bold rounded-lg hover:bg-amber-900/70 transition-colors"
                >
                  Resume
                </button>
                <button
                  onClick={() => { clearSavedSession(); setSavedBanner(null); }}
                  className="p-1.5 rounded-lg text-brand-text-muted hover:text-brand-text-secondary hover:bg-brand-card transition-colors"
                  aria-label="Dismiss saved session"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          )}

          <div className="space-y-4">
            {/* Topic */}
            <div className="bg-brand-card border border-brand-border/50 rounded-2xl p-5">
              <label className="block text-xs font-bold text-brand-text-muted uppercase tracking-widest mb-3">
                Debate Topic
              </label>
              <div className="relative">
                <input
                  id="debate-topic-input"
                  type="text"
                  value={session.topic}
                  onChange={(e) => setSession((s) => ({ ...s, topic: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter' && session.topic.trim()) handleStartDebate(); }}
                  placeholder="Type a topic or pick a preset below…"
                  className="w-full bg-brand-bg border border-brand-border/60 rounded-xl px-4 py-3 text-sm text-brand-text-primary placeholder-brand-text-muted focus:outline-none focus:border-brand-accent/60 transition-colors pr-10"
                />
                <button
                  onClick={() => setTopicOpen((p) => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-text-muted hover:text-brand-accent transition-colors"
                  aria-label="Toggle preset topics"
                >
                  <ChevronDown size={16} className={`transition-transform ${topicOpen ? 'rotate-180' : ''}`} />
                </button>
              </div>
              {topicOpen && (
                <div className="mt-2 rounded-xl border border-brand-border/60 bg-brand-bg shadow-2xl overflow-hidden">
                  {PRESET_TOPICS.map((t, i) => (
                    <button
                      key={i}
                      onClick={() => { setSession((s) => ({ ...s, topic: t })); setTopicOpen(false); }}
                      className="w-full text-left px-4 py-2.5 text-xs text-brand-text-secondary hover:bg-brand-card hover:text-brand-text-primary transition-colors border-b border-brand-border/20 last:border-0"
                    >
                      {t}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Stance */}
            <div className="bg-brand-card border border-brand-border/50 rounded-2xl p-5">
              <label className="block text-xs font-bold text-brand-text-muted uppercase tracking-widest mb-3">
                Your Stance
              </label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { id: 'for',     emoji: '✅', label: 'FOR (Pro)',    desc: 'Argue in favour of the topic' },
                  { id: 'against', emoji: '❌', label: 'AGAINST (Con)', desc: 'Argue against the topic' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    id={`stance-${opt.id}`}
                    onClick={() => setSession((s) => ({
                      ...s,
                      userStance: opt.id,
                      aiStance: opt.id === 'for' ? 'against' : 'for',
                    }))}
                    className={`p-4 rounded-xl border text-left transition-all ${
                      session.userStance === opt.id
                        ? 'bg-brand-accent/15 border-brand-accent/60 ring-1 ring-brand-accent/30'
                        : 'bg-brand-bg border-brand-border/40 hover:border-brand-accent/30'
                    }`}
                  >
                    <p className={`text-sm font-bold ${session.userStance === opt.id ? 'text-brand-accent' : 'text-brand-text-primary'}`}>
                      {opt.emoji} {opt.label}
                    </p>
                    <p className="text-[11px] text-brand-text-muted mt-0.5">{opt.desc}</p>
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-brand-text-muted mt-2">
                AI will argue <span className="font-semibold text-brand-text-secondary">{session.aiStance === 'for' ? 'FOR ✅' : 'AGAINST ❌'}</span>
              </p>
            </div>

            {/* Difficulty */}
            <div className="bg-brand-card border border-brand-border/50 rounded-2xl p-5">
              <label className="block text-xs font-bold text-brand-text-muted uppercase tracking-widest mb-3">
                Difficulty
              </label>
              <div className="grid grid-cols-3 gap-3">
                {DIFFICULTIES.map(({ id, label, desc, Icon, activeBg, idleBg, color }) => {
                  const isActive = session.difficulty === id;
                  return (
                    <button
                      key={id}
                      id={`difficulty-${id}`}
                      onClick={() => setSession((s) => ({ ...s, difficulty: id }))}
                      className={`p-4 rounded-xl border text-left transition-all ${isActive ? `${activeBg} ring-1 ring-inset ${color.replace('text-', 'ring-')}/30` : `${idleBg} hover:opacity-80`}`}
                    >
                      <Icon size={18} className={`${color} mb-2`} />
                      <p className={`text-sm font-bold ${isActive ? color : 'text-brand-text-primary'}`}>{label}</p>
                      <p className="text-[10px] text-brand-text-muted mt-0.5 leading-tight">{desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Mode */}
            <div className="bg-brand-card border border-brand-border/50 rounded-2xl p-5">
              <label className="block text-xs font-bold text-brand-text-muted uppercase tracking-widest mb-3">
                Debate Mode
              </label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { id: 'freestyle',  label: 'Freestyle',  desc: 'Open-ended — argue as many rounds as you like' },
                  { id: 'structured', label: 'Structured', desc: '6-turn formal format: Opening → Rebuttals → Closing' },
                ].map((m) => (
                  <button
                    key={m.id}
                    id={`mode-${m.id}`}
                    onClick={() => setSession((s) => ({ ...s, mode: m.id }))}
                    className={`p-4 rounded-xl border text-left transition-all ${
                      session.mode === m.id
                        ? 'bg-brand-accent/15 border-brand-accent/60 ring-1 ring-brand-accent/30'
                        : 'bg-brand-bg border-brand-border/40 hover:border-brand-accent/30'
                    }`}
                  >
                    <p className={`text-sm font-bold ${session.mode === m.id ? 'text-brand-accent' : 'text-brand-text-primary'}`}>{m.label}</p>
                    <p className="text-[11px] text-brand-text-muted mt-0.5 leading-tight">{m.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Start */}
            <button
              id="start-debate-btn"
              onClick={handleStartDebate}
              disabled={!session.topic.trim()}
              className="w-full py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all bg-gradient-to-r from-brand-accent to-emerald-500 text-brand-bg shadow-lg shadow-brand-accent/25 hover:shadow-brand-accent/40 hover:scale-[1.01] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
            >
              <Swords size={18} />
              Start Debate
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // RENDER: ALL-FAILED / SESSION SAVED
  // ──────────────────────────────────────────────────────────────────────────
  if (phase === 'allFailed') {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-brand-card border border-brand-border/50 rounded-2xl p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-red-950/30 border border-red-900/40 flex items-center justify-center mx-auto mb-5">
            <WifiOff size={28} className="text-red-400" />
          </div>
          <h2 className="text-xl font-bold text-brand-text-primary mb-2">All Models Unavailable</h2>
          <p className="text-brand-text-secondary text-sm leading-relaxed mb-6">
            Every Gemini model is temporarily unreachable. Your debate progress has been saved and can be resumed within 24 hours.
          </p>
          <div className="space-y-3">
            <button
              onClick={handleRetryAfterFail}
              className="w-full py-3 bg-gradient-to-r from-brand-accent to-emerald-500 text-brand-bg font-bold text-sm rounded-xl hover:opacity-90 transition-opacity flex items-center justify-center gap-2 shadow-lg shadow-brand-accent/20"
            >
              <RotateCcw size={15} />
              Try Again
            </button>
            <button
              onClick={handleNewDebate}
              className="w-full py-3 border border-brand-border/50 text-brand-text-secondary text-sm rounded-xl hover:text-brand-text-primary hover:border-brand-border transition-colors"
            >
              Back to Setup
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // RENDER: FINISHED
  // ──────────────────────────────────────────────────────────────────────────
  if (phase === 'finished') {
    const winner =
      session.score.user > session.score.ai ? 'You won! 🎉'
      : session.score.ai > session.score.user ? 'AI won this round.'
      : 'It\'s a draw!';

    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-brand-card border border-brand-border/50 rounded-2xl p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-accent to-emerald-600 flex items-center justify-center mx-auto mb-5 shadow-xl shadow-brand-accent/20">
            <Trophy size={28} className="text-brand-bg" />
          </div>
          <h2 className="text-2xl font-bold text-brand-text-primary mb-1">Debate Complete!</h2>
          <p className="text-brand-text-secondary text-sm mb-2 italic">"{session.topic}"</p>
          <p className="text-brand-text-muted text-xs mb-6">{session.turn} turns · {session.difficulty} · {session.mode}</p>

          {/* Scoreboard */}
          <div className="flex items-center justify-center gap-8 mb-6">
            <div className="text-center">
              <div className="text-4xl font-black text-brand-accent mb-1">{session.score.user}</div>
              <p className="text-[10px] text-brand-text-muted uppercase tracking-wider font-bold">You</p>
            </div>
            <div className="text-brand-text-muted font-bold text-lg">vs</div>
            <div className="text-center">
              <div className="text-4xl font-black text-red-400 mb-1">{session.score.ai}</div>
              <p className="text-[10px] text-brand-text-muted uppercase tracking-wider font-bold">AI</p>
            </div>
          </div>

          <div className="mb-6 py-3 px-4 rounded-xl bg-brand-accent/10 border border-brand-accent/20">
            <p className="text-brand-accent font-bold text-sm">{winner}</p>
          </div>

          {session.judgeNotes.length > 0 && (
            <div className="p-3 bg-brand-bg rounded-xl border border-brand-border/40 mb-6 text-left">
              <p className="text-[10px] font-bold text-brand-text-muted uppercase tracking-widest mb-1.5">
                Final Judge Note
              </p>
              <p className="text-xs text-brand-text-secondary leading-relaxed">
                {session.judgeNotes.at(-1)}
              </p>
            </div>
          )}

          <div className="space-y-3">
            <button
              onClick={() => { setPhase('debating'); startTimer(session.difficulty); setTimeout(() => inputRef.current?.focus(), 300); }}
              className="w-full py-3 border border-brand-accent/40 text-brand-accent text-sm font-bold rounded-xl hover:bg-brand-accent/10 transition-colors"
            >
              Continue Debating
            </button>
            <button
              onClick={handleNewDebate}
              className="w-full py-3 bg-gradient-to-r from-brand-accent to-emerald-500 text-brand-bg font-bold text-sm rounded-xl hover:opacity-90 transition-opacity flex items-center justify-center gap-2 shadow-lg shadow-brand-accent/20"
            >
              <RotateCcw size={15} />
              New Debate
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // RENDER: DEBATING
  // ──────────────────────────────────────────────────────────────────────────
  const diffMeta = DIFFICULTIES.find((d) => d.id === session.difficulty);

  return (
    <div className="h-screen flex flex-col bg-brand-bg overflow-hidden">

      {/* ── Reconnecting banner (only after >5 s) ────────────────────────── */}
      {reconnecting && (
        <div className="flex-shrink-0 bg-amber-950/90 border-b border-amber-800/50 px-4 py-2 flex items-center justify-center gap-2 text-amber-300 text-xs font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
          The AI is reconnecting. Your debate will resume automatically.
        </div>
      )}

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header className="flex-shrink-0 bg-brand-card border-b border-brand-border/60 px-5 py-3">
        <div className="flex items-center gap-4">
          {/* Topic + meta */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Swords size={14} className="text-brand-accent flex-shrink-0" />
              <p className="text-sm font-bold text-brand-text-primary truncate">{session.topic}</p>
            </div>
            <p className="text-[11px] text-brand-text-muted mt-0.5">
              You:{' '}
              <span className={session.userStance === 'for' ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>
                {session.userStance === 'for' ? 'FOR' : 'AGAINST'}
              </span>
              {' · '}Turn {session.turn + 1}{' · '}
              <span className={diffMeta?.color}>{diffMeta?.label}</span>
            </p>
          </div>

          {/* Score */}
          <div className="flex items-center gap-2.5 bg-brand-bg rounded-xl px-3 py-2 border border-brand-border/50 flex-shrink-0">
            <div className="text-center">
              <p className="text-base font-black text-brand-accent leading-none">{session.score.user}</p>
              <p className="text-[9px] text-brand-text-muted font-bold uppercase leading-none mt-0.5">YOU</p>
            </div>
            <span className="text-brand-text-muted text-xs">–</span>
            <div className="text-center">
              <p className="text-base font-black text-red-400 leading-none">{session.score.ai}</p>
              <p className="text-[9px] text-brand-text-muted font-bold uppercase leading-none mt-0.5">AI</p>
            </div>
          </div>

          {/* Timer */}
          <div className={`flex items-center gap-1.5 bg-brand-bg rounded-xl px-3 py-2 border border-brand-border/50 flex-shrink-0 ${timerClr}`}>
            <Clock size={13} />
            <span className="text-sm font-black tabular-nums">{fmtTimer}</span>
          </div>

          {/* Save */}
          <button
            id="save-debate-btn"
            onClick={handleSaveExit}
            className="p-2 rounded-lg text-brand-text-muted hover:text-amber-400 hover:bg-amber-950/20 transition-colors"
            title="Save & Exit"
          >
            <Save size={15} />
          </button>

          {/* End */}
          <button
            id="end-debate-btn"
            onClick={handleEndDebate}
            className="px-3 py-1.5 rounded-lg border border-red-900/40 text-red-400 text-xs font-bold hover:bg-red-950/20 transition-colors"
          >
            End Debate
          </button>
        </div>
      </header>

      {/* ── Messages ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {messages.map((msg) => {
          // System / info messages
          if (msg.role === 'system') {
            return (
              <div key={msg.id} className="flex justify-center">
                <div className="bg-brand-card/60 border border-brand-border/30 rounded-xl px-5 py-2.5 text-center max-w-md">
                  <p className="text-[11px] text-brand-text-muted whitespace-pre-line leading-relaxed">{msg.content}</p>
                </div>
              </div>
            );
          }

          // Error messages
          if (msg.role === 'error') {
            return (
              <div key={msg.id} className="flex justify-center">
                <div className="flex items-center gap-2 bg-red-950/20 border border-red-900/30 rounded-xl px-4 py-2.5">
                  <AlertCircle size={13} className="text-red-400 flex-shrink-0" />
                  <p className="text-xs text-red-300">{msg.content}</p>
                </div>
              </div>
            );
          }

          const isUser = msg.role === 'user';
          return (
            <div key={msg.id} className="space-y-2">
              {/* Bubble */}
              <div className={`flex items-end gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
                {/* AI avatar */}
                {!isUser && (
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-red-600 to-orange-700 flex items-center justify-center flex-shrink-0 mb-0.5 shadow">
                    <Flame size={12} className="text-white" />
                  </div>
                )}
                <div
                  className={`max-w-[72%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                    isUser
                      ? 'bg-brand-accent text-brand-bg rounded-tr-sm'
                      : 'bg-brand-card border border-brand-border/60 text-brand-text-primary rounded-tl-sm'
                  }`}
                >
                  {msg.content}
                  {msg.isFallback && !isUser && (
                    <p className="text-[9px] opacity-50 mt-1.5 font-medium">↪ fallback model</p>
                  )}
                </div>
                {/* User avatar */}
                {isUser && (
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-accent to-emerald-600 flex items-center justify-center flex-shrink-0 mb-0.5 shadow">
                    <CheckCircle2 size={12} className="text-brand-bg" />
                  </div>
                )}
              </div>

              {/* Judge note */}
              {msg.judgeNote && (
                <div className="flex justify-center">
                  <div className="bg-brand-bg border border-brand-border/40 rounded-xl px-4 py-2.5 max-w-[80%] shadow-sm">
                    <p className="text-[9px] font-bold text-brand-text-muted uppercase tracking-widest mb-1 flex items-center gap-1">
                      <Zap size={8} className="text-amber-400" />
                      Judge
                    </p>
                    <p className="text-[11px] text-brand-text-secondary leading-relaxed">{msg.judgeNote}</p>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* AI typing indicator */}
        {isLoading && (
          <div className="flex items-end gap-2 justify-start">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-red-600 to-orange-700 flex items-center justify-center flex-shrink-0 mb-0.5">
              <Flame size={12} className="text-white" />
            </div>
            <div className="bg-brand-card border border-brand-border/60 rounded-2xl rounded-tl-sm px-4 py-3">
              <div className="flex gap-1.5 items-center h-4">
                {[0, 150, 300].map((delay) => (
                  <span
                    key={delay}
                    className="w-1.5 h-1.5 rounded-full bg-brand-text-muted animate-bounce"
                    style={{ animationDelay: `${delay}ms` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Input area ───────────────────────────────────────────────────── */}
      <footer className="flex-shrink-0 bg-brand-card border-t border-brand-border/60 px-5 py-4">
        <form
          onSubmit={(e) => { e.preventDefault(); handleSend(); }}
          className="flex gap-3 items-end"
        >
          <textarea
            ref={inputRef}
            id="debate-argument-input"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
            }}
            disabled={isLoading}
            placeholder={
              isLoading
                ? 'AI is preparing its rebuttal…'
                : 'Type your argument… (Enter to send · Shift+Enter for new line)'
            }
            rows={2}
            className="flex-1 bg-brand-bg border border-brand-border/60 rounded-xl px-4 py-3 text-sm text-brand-text-primary placeholder-brand-text-muted focus:outline-none focus:border-brand-accent/60 transition-colors resize-none disabled:opacity-50"
          />
          <button
            id="send-argument-btn"
            type="submit"
            disabled={!inputText.trim() || isLoading}
            className="w-11 h-11 rounded-xl bg-brand-accent text-brand-bg flex items-center justify-center flex-shrink-0 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-brand-accent/20 hover:shadow-brand-accent/30"
            aria-label="Send argument"
          >
            <Send size={16} />
          </button>
        </form>
        <p className="text-[10px] text-brand-text-muted mt-2 text-center">
          DEBTRAINER-AI · Automatic 4-tier model failover ensures uninterrupted debate sessions
        </p>
      </footer>
    </div>
  );
}
