import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebase';
import {
  collection, query, where, doc, getDoc, onSnapshot, updateDoc
} from 'firebase/firestore';
import CertReviewModal from '../../components/Mentor/CertReviewModal';
import { retrieveCertificateBinary } from '../../services/binaryStorageService';
import {
  buildChatId,
  sendMessage,
  listenToMessages,
  markMessagesRead,
  setTyping,
  listenToTyping,
  listenToUnreadCounts,
} from '../../services/chatService';
import { watchPresence } from '../../services/presenceService';
import {
  Send, Smile, MoreVertical,
  MessageSquare, File, Download, CheckCheck, Check,
  Image as ImageIcon, Award
} from 'lucide-react';
import EmojiPicker from 'emoji-picker-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatTimestamp(ts) {
  if (!ts) return 'Just now';
  // RTDB serverTimestamp arrives as a Unix ms number
  const date = typeof ts === 'number' ? new Date(ts) : new Date(ts);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatLastSeen(ts) {
  if (!ts) return '';
  const date = new Date(ts);
  const now = new Date();
  const diffMs = now - date;
  if (diffMs < 60000) return 'last seen just now';
  if (diffMs < 3600000) return `last seen ${Math.floor(diffMs / 60000)}m ago`;
  if (date.toDateString() === now.toDateString())
    return `last seen today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  return `last seen ${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function OnlineDot({ online, size = 'sm' }) {
  const sz = size === 'sm' ? 'w-2 h-2' : 'w-2.5 h-2.5';
  return (
    <span
      className={`${sz} rounded-full border-2 border-[#111b21] shrink-0 ${
        online ? 'bg-emerald-400' : 'bg-zinc-500'
      }`}
    />
  );
}

function TypingBubble() {
  return (
    <div className="flex justify-start">
      <div className="bg-[#202c33] rounded-2xl rounded-tl-none px-4 py-3 flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-1.5 h-1.5 bg-brand-text-secondary rounded-full animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Adapted from Skill Swap's success toast aesthetic.
 * Renders system-initiated messages (type: 'system') as a centred info pill
 * — the same visual language as SkillSwap's "Swap Request Sent" notification.
 */
function SystemMessagePill({ text, timestamp }) {
  return (
    <div className="flex justify-center my-2">
      <div className="flex items-center gap-2 px-4 py-1.5 rounded-full text-[11px] text-white/60 select-none"
           style={{ background: 'rgba(32,44,51,0.85)', border: '1px solid rgba(83,189,235,0.15)' }}>
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
        <span>{text}</span>
        {timestamp && (
          <span className="text-white/30 ml-1">{formatTimestamp(timestamp)}</span>
        )}
      </div>
    </div>
  );
}

function ReadTick({ isRead }) {
  if (isRead) {
    return <CheckCheck size={14} className="text-[#53bdeb] shrink-0" />;
  }
  return <Check size={14} className="text-white/40 shrink-0" />;
}

function CertMessageCard({ msg, isMe, onApprove, onReject, userRole, onViewCert }) {
  const meta = msg.certMeta || {};
  const [opening, setOpening] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-3 pt-3">
        <Award size={16} className="text-amber-400 shrink-0" />
        <span className="text-[12px] font-semibold text-white truncate">
          {meta.certName || 'Certificate'}
        </span>
      </div>
      {msg.attachmentUrl && (
        <img
          src={msg.attachmentUrl}
          alt="Certificate"
          className="w-full max-h-40 object-contain px-3"
        />
      )}
      <p className="px-3 pb-1 text-[11px] text-white/70">
        {msg.message}
        {meta.score !== undefined && (
          <span className="ml-2 text-amber-400 font-bold">Score: {meta.score}/5</span>
        )}
      </p>
      {!isMe && userRole === 'mentor' && (
        <div className="flex gap-2 px-3 pb-3 flex-col">
          {/* View Certificate Button — opens full review modal */}
          <button
            onClick={async () => {
              if (!meta.certId || opening) return;
              setOpening(true);
              await onViewCert?.(meta.certId);
              setOpening(false);
            }}
            disabled={opening}
            className="w-full py-1.5 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 text-[11px] font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            {opening ? (
              <div className="w-3 h-3 rounded-full border-2 border-blue-300/30 border-t-blue-300 animate-spin" />
            ) : (
              <Award size={11} />
            )}
            {opening ? 'Loading...' : '🔍 View Full Certificate'}
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => onApprove?.(meta)}
              className="flex-1 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 text-[11px] font-bold transition-colors cursor-pointer"
            >
              ✓ Approve
            </button>
            <button
              onClick={() => onReject?.(meta)}
              className="flex-1 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 text-[11px] font-bold transition-colors cursor-pointer"
            >
              ✗ Reject
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Chat() {
  const { user } = useAuth();

  const [partner, setPartner] = useState(null);
  const [students, setStudents] = useState([]);
  const [activeStudentId, setActiveStudentId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [showEmoji, setShowEmoji] = useState(false);

  const [partnerPresence, setPartnerPresence] = useState({ online: false, lastSeen: null });
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [unreadMap, setUnreadMap] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [sendError, setSendError] = useState('');

  // ── Cert review modal ─────────────────────────────────────────────────────
  const [reviewCert, setReviewCert] = useState(null);

  const messagesEndRef = useRef(null);

  const emojiPickerRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const myUid = user?.uid || 'me';

  // ── Compute chatId ───────────────────────────────────────────────────────
  const chatId = (() => {
    if (!partner) return null;
    if (user?.role === 'student') {
      return user.mentorId ? buildChatId(user.uid, user.mentorId) : null;
    }
    // mentor / admin — partner is the student
    const mentorUid = user.role === 'mentor' ? user.uid : (partner.mentorId || user.uid);
    return buildChatId(partner.uid, mentorUid);
  })();

  // ── Close emoji picker on outside click ──────────────────────────────────
  useEffect(() => {
    const handle = (e) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target)) {
        setShowEmoji(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  // ── Scroll to bottom on new messages ─────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, partnerTyping]);

  // ── 1. Student: fetch assigned mentor from Firestore ─────────────────────
  useEffect(() => {
    if (user?.role !== 'student') return;
    if (!user.mentorId) { setLoading(false); return; }

    setLoading(true);
    getDoc(doc(db, 'users', user.mentorId))
      .then((snap) => {
        const data = snap.exists() ? snap.data() : {};
        // Decrypt PII if stored encrypted (encryptedProfile)
        const profile = data.encryptedProfile ? (() => { try { return JSON.parse(atob(data.encryptedProfile)); } catch { return {}; } })() : data;
        setPartner({
          uid: user.mentorId,
          name: profile.name || data.name || 'Your Mentor',
          role: 'Mentor',
          avatar: profile.photoURL || data.photoURL || `https://ui-avatars.com/api/?name=Mentor&background=6366f1&color=fff`,
        });
      })
      .catch((err) => {
        console.warn('[Chat] Could not read mentor profile (Firestore rules):', err.message);
        // Firestore may block cross-role reads — fall back to a minimal partner
        // object so the student can still open the RTDB chat room.
        setPartner({
          uid: user.mentorId,
          name: 'Your Mentor',
          role: 'Mentor',
          avatar: `https://ui-avatars.com/api/?name=Mentor&background=6366f1&color=fff`,
        });
      })
      .finally(() => setLoading(false));
  }, [user?.role, user?.mentorId]);

  // ── 2. Mentor: fetch assigned students from Firestore ────────────────────
  useEffect(() => {
    if (user?.role !== 'mentor') return;
    setLoading(true);
    const q = query(
      collection(db, 'users'),
      where('mentorId', '==', user.uid),
      where('status', '==', 'approved')
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = [];
      snap.forEach((d) => {
        const data = d.data();
        list.push({
          uid: d.id,
          name: data.name || 'Student',
          role: 'Student',
          avatar: data.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(data.name || 'S')}&background=10b981&color=fff`,
        });
      });
      setStudents(list);
      if (list.length > 0 && !activeStudentId) {
        setActiveStudentId(list[0].uid);
        setPartner(list[0]);
      }
      setLoading(false);
    }, (err) => { console.error(err); setLoading(false); });
    return () => unsub();
  }, [user?.role, user?.uid]); // eslint-disable-line

  // ── 3. Admin: fetch all approved students ─────────────────────────────────
  useEffect(() => {
    if (user?.role !== 'admin') return;
    setLoading(true);
    const q = query(
      collection(db, 'users'),
      where('role', '==', 'student'),
      where('status', '==', 'approved')
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = [];
      snap.forEach((d) => {
        const data = d.data();
        list.push({
          uid: d.id,
          name: data.name || 'Student',
          role: 'Student',
          avatar: data.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(data.name || 'S')}&background=10b981&color=fff`,
          mentorId: data.mentorId,
        });
      });
      setStudents(list);
      if (list.length > 0 && !activeStudentId) {
        setActiveStudentId(list[0].uid);
        setPartner(list[0]);
      }
      setLoading(false);
    }, (err) => { console.error(err); setLoading(false); });
    return () => unsub();
  }, [user?.role, user?.uid]); // eslint-disable-line

  // ── 4. RTDB: listen to messages ──────────────────────────────────────────
  useEffect(() => {
    if (!chatId) { setMessages([]); return; }
    const unsub = listenToMessages(chatId, (msgs) => {
      setMessages(msgs);
    });
    return () => unsub();
  }, [chatId]);

  // ── 5. RTDB: mark messages read when chat opens ───────────────────────────
  useEffect(() => {
    if (!chatId || !myUid) return;
    markMessagesRead(chatId, myUid);
  }, [chatId, myUid]);

  // ── 6. RTDB: listen to partner typing ────────────────────────────────────
  useEffect(() => {
    if (!chatId || !partner?.uid) return;
    const unsub = listenToTyping(chatId, partner.uid, setPartnerTyping);
    return () => unsub();
  }, [chatId, partner?.uid]);

  // ── 7. RTDB: watch partner presence ──────────────────────────────────────
  useEffect(() => {
    if (!partner?.uid) return;
    const unsub = watchPresence(partner.uid, setPartnerPresence);
    return () => unsub();
  }, [partner?.uid]);

  // ── 8. RTDB: unread counts ────────────────────────────────────────────────
  useEffect(() => {
    if (!myUid) return;
    const unsub = listenToUnreadCounts(myUid, setUnreadMap);
    return () => unsub();
  }, [myUid]);

  // ── Typing detection ──────────────────────────────────────────────────────
  const handleInputChange = (e) => {
    setInputText(e.target.value);
    if (!chatId) return;
    setTyping(chatId, myUid, true);
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      setTyping(chatId, myUid, false);
    }, 2000);
  };

  // ── Send message ──────────────────────────────────────────────────────────
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputText.trim() || !chatId || !partner) return;

    const text = inputText.trim();
    setInputText(''); // optimistic clear
    setSendError('');
    setShowEmoji(false);
    setTyping(chatId, myUid, false);
    clearTimeout(typingTimeoutRef.current);

    const receiverId = user?.role === 'student' ? user.mentorId : partner.uid;

    try {
      await sendMessage(chatId, {
        senderId: myUid,
        receiverId,
        senderRole: user?.role || 'student',
        message: text,
        type: 'text',
      });
    } catch (err) {
      console.error('[Chat] sendMessage failed:', err);
      // Restore text so the user doesn't lose their message
      setInputText(text);
      setSendError(
        err?.code === 'PERMISSION_DENIED'
          ? 'Chat unavailable — Realtime Database not enabled. See console.'
          : 'Failed to send message. Please try again.'
      );
      // Auto-clear error after 5s
      setTimeout(() => setSendError(''), 5000);
    }
  };

  // ── Emoji ─────────────────────────────────────────────────────────────────
  const handleEmojiSelect = (emojiObj) => {
    setInputText((prev) => prev + emojiObj.emoji);
  };




  // ── Select student from sidebar ───────────────────────────────────────────
  const handleSelectPartner = (p) => {
    setActiveStudentId(p.uid);
    setPartner(p);
    setMessages([]);
    setShowEmoji(false);
  };

  // ── Certificate Approve / Reject ──────────────────────────────────────────
  const handleCertApprove = useCallback(async (meta) => {
    if (!meta?.certId) return;
    try {
      await updateDoc(doc(db, 'certPending', meta.certId), {
        status: 'approved',
        reviewedAt: new Date().toISOString(),
        reviewedBy: myUid,
      });
    } catch (err) { console.error('Approve failed:', err); }

    const receiverId = partner?.uid;
    if (chatId && receiverId) {
      await sendMessage(chatId, {
        senderId: myUid,
        receiverId,
        senderRole: user?.role,
        message: `✅ Certificate "${meta.certName || ''}" approved!`,
        type: 'text',
      });
    }
  }, [chatId, myUid, partner, user]);

  const handleCertReject = useCallback(async (meta) => {
    if (!meta?.certId) return;
    try {
      await updateDoc(doc(db, 'certPending', meta.certId), {
        status: 'rejected',
        reviewedAt: new Date().toISOString(),
        reviewedBy: myUid,
      });
    } catch (err) { console.error('Reject failed:', err); }

    const receiverId = partner?.uid;
    if (chatId && receiverId) {
      await sendMessage(chatId, {
        senderId: myUid,
        receiverId,
        senderRole: user?.role,
        message: `❌ Certificate "${meta.certName || ''}" needs revision. Please re-upload with corrections.`,
        type: 'text',
      });
    }
  }, [chatId, myUid, partner, user]);

  // ── Open full CertReviewModal — fetch certPending doc + reconstruct image ─
  const handleViewCert = useCallback(async (certId) => {
    if (!certId) return;
    try {
      // 1. Fetch the certPending Firestore doc
      const certSnap = await getDoc(doc(db, 'certPending', certId));
      if (!certSnap.exists()) { console.warn('certPending not found:', certId); return; }
      const certData = { id: certSnap.id, ...certSnap.data() };

      // 2. Try to reconstruct the certificate image from binary chunks
      if (certData.hasChunkedImage) {
        try {
          const imageDataUrl = await retrieveCertificateBinary(certId);
          certData.imageDataUrl = imageDataUrl;
        } catch (imgErr) {
          console.warn('Could not load cert image:', imgErr.message);
        }
      }

      setReviewCert(certData);
    } catch (err) {
      console.error('Failed to load cert for review:', err);
    }
  }, []);

  // ── Filtered student list ─────────────────────────────────────────────────
  const filteredStudents = students.filter((s) =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // ── Status text ───────────────────────────────────────────────────────────
  const partnerStatusText = partnerTyping
    ? 'typing...'
    : partnerPresence.online
    ? 'online'
    : formatLastSeen(partnerPresence.lastSeen);

  // ─── Guards ───────────────────────────────────────────────────────────────
  if (loading && !partner && students.length === 0) {
    return (
      <div className="glass-card rounded-3xl overflow-hidden border border-brand-border h-[calc(100vh-12rem)] flex items-center justify-center bg-[#0b141a]">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 rounded-full border-4 border-brand-accent/20 border-t-brand-accent animate-spin mx-auto" />
          <p className="text-brand-text-secondary text-xs">Opening Chat Room...</p>
        </div>
      </div>
    );
  }

  if (user?.role === 'student' && !user.mentorId) {
    return (
      <div className="glass-card rounded-3xl overflow-hidden border border-brand-border h-[calc(100vh-12rem)] flex flex-col items-center justify-center bg-[#0b141a] p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-brand-border/40 flex items-center justify-center text-brand-text-secondary mb-6 border border-brand-border">
          <MessageSquare size={28} />
        </div>
        <h3 className="text-lg font-bold text-brand-text-primary">No Mentor Assigned Yet</h3>
        <p className="text-xs text-brand-text-secondary mt-2 max-w-sm leading-relaxed">
          An administrator will assign you an industry mentor shortly. Once assigned, your direct messaging workspace will open automatically.
        </p>
      </div>
    );
  }

  if ((user?.role === 'mentor' || user?.role === 'admin') && students.length === 0) {
    return (
      <div className="glass-card rounded-3xl overflow-hidden border border-brand-border h-[calc(100vh-12rem)] flex flex-col items-center justify-center bg-[#0b141a] p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-brand-border/40 flex items-center justify-center text-brand-text-secondary mb-6 border border-brand-border">
          <MessageSquare size={28} />
        </div>
        <h3 className="text-lg font-bold text-brand-text-primary">No Conversations Found</h3>
        <p className="text-xs text-brand-text-secondary mt-2 max-w-sm leading-relaxed">
          {user.role === 'admin'
            ? 'There are no approved student profiles yet.'
            : 'You have not been assigned any students for guidance yet.'}
        </p>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <>
    <div className="glass-card rounded-3xl overflow-hidden border border-brand-border h-[calc(100vh-12rem)] flex bg-[#0b141a] relative">

      {/* ── Left Sidebar: student roster (mentor/admin only) ── */}
      {(user?.role === 'mentor' || user?.role === 'admin') && (
        <div className="w-80 border-r border-brand-border/60 bg-[#111b21] hidden md:flex flex-col">
          <div className="p-4 bg-[#111b21] flex justify-between items-center border-b border-brand-border/40 h-16">
            <h3 className="font-bold text-sm text-brand-text-primary">
              {user.role === 'admin' ? 'Student Channels' : 'Assigned Students'}
            </h3>
            <button className="p-1.5 text-brand-text-secondary hover:text-brand-text-primary hover:bg-[#202c33] rounded-lg cursor-pointer">
              <MoreVertical size={18} />
            </button>
          </div>

          {/* Search */}
          <div className="p-2.5 border-b border-brand-border/40">
            <input
              type="text"
              placeholder="Search students"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-1.5 bg-[#202c33] border-none rounded-lg text-xs focus:outline-none text-brand-text-primary placeholder:text-brand-text-muted"
            />
          </div>

          {/* Student list */}
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {filteredStudents.map((st) => {
              const stChatId = buildChatId(
                st.uid,
                user.role === 'mentor' ? user.uid : (st.mentorId || user.uid)
              );
              const unread = unreadMap[stChatId] || 0;

              return (
                <div
                  key={st.uid}
                  onClick={() => handleSelectPartner(st)}
                  className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${
                    activeStudentId === st.uid ? 'bg-[#2a3942]' : 'hover:bg-[#202c33]/50'
                  }`}
                >
                  <div className="relative shrink-0">
                    <img
                      src={st.avatar}
                      alt={st.name}
                      className="w-11 h-11 rounded-full object-cover border border-brand-border/20"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline">
                      <h4 className="text-xs font-bold text-brand-text-primary truncate">{st.name}</h4>
                      {unread > 0 && (
                        <span className="ml-2 min-w-[18px] h-[18px] px-1 bg-brand-accent text-brand-bg text-[10px] font-bold rounded-full flex items-center justify-center shrink-0">
                          {unread > 99 ? '99+' : unread}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-brand-text-secondary mt-0.5 truncate">Student Profile</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Right: Chat Pane ── */}
      <div className="flex-1 flex flex-col bg-[#0b141a] relative min-w-0">
        {partner ? (
          <>
            {/* Chat Header */}
            <div className="px-6 py-3 bg-[#202c33] flex items-center justify-between z-10 border-b border-brand-border/40 h-16 shrink-0">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <img
                    src={partner.avatar}
                    alt={partner.name}
                    className="w-10 h-10 rounded-full object-cover border border-brand-border/20"
                  />
                  <span className="absolute -bottom-0.5 -right-0.5">
                    <OnlineDot online={partnerPresence.online} />
                  </span>
                </div>
                <div>
                  <h3 className="text-xs font-bold text-brand-text-primary leading-tight">{partner.name}</h3>
                  <span
                    className={`text-[10px] font-medium flex items-center gap-1 ${
                      partnerTyping
                        ? 'text-brand-accent'
                        : partnerPresence.online
                        ? 'text-emerald-400'
                        : 'text-brand-text-secondary'
                    }`}
                  >
                    {partnerTyping && (
                      <span className="inline-flex gap-0.5">
                        {[0,1,2].map(i => (
                          <span key={i} className="w-1 h-1 bg-brand-accent rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                        ))}
                      </span>
                    )}
                    {partnerStatusText}
                  </span>
                </div>
              </div>

              <button className="hover:text-brand-text-primary text-brand-text-secondary cursor-pointer transition-colors">
                <MoreVertical size={18} />
              </button>
            </div>

            {/* Message Window */}
            <div
              className="flex-1 p-6 overflow-y-auto space-y-3 bg-[#0b141a]"
              style={{
                backgroundImage: `radial-gradient(#111b21 0.75px, #0b141a 0.75px)`,
                backgroundSize: '15px 15px',
              }}
            >
              {messages.length === 0 ? (
                <div className="h-full flex items-center justify-center">
                  <p className="text-xs text-brand-text-muted bg-[#182229] px-4 py-2 rounded-xl">
                    Messages are end-to-end synced in real-time. Start the conversation.
                  </p>
                </div>
              ) : (
                messages.map((msg) => {
                  // ── System message (Skill Swap initiateChatMessage pattern) ──
                  if (msg.type === 'system') {
                    return (
                      <SystemMessagePill
                        key={msg.id}
                        text={msg.message}
                        timestamp={msg.timestamp}
                      />
                    );
                  }

                  const isMe = msg.senderId === myUid;

                  return (
                    <div
                      key={msg.id}
                      className={`flex w-full ${isMe ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[72%] relative text-xs shadow-sm overflow-hidden ${
                          isMe
                            ? 'bg-[#005c4b] text-white rounded-2xl rounded-tr-none'
                            : 'bg-[#202c33] text-white rounded-2xl rounded-tl-none'
                        }`}
                      >
                        {/* Certificate message */}
                        {msg.type === 'certificate' && (
                          <CertMessageCard
                            msg={msg}
                            isMe={isMe}
                            userRole={user?.role}
                            onApprove={handleCertApprove}
                            onReject={handleCertReject}
                            onViewCert={handleViewCert}
                          />
                        )}

                        {/* Image message */}
                        {msg.type === 'image' && (
                          <img
                            src={msg.attachmentUrl}
                            alt={msg.fileName || 'Image'}
                            className="max-w-xs max-h-56 object-contain block cursor-pointer hover:opacity-90 transition-opacity rounded-t-2xl"
                            onClick={() => window.open(msg.attachmentUrl, '_blank')}
                          />
                        )}

                        {/* File message */}
                        {msg.type === 'file' && (
                          <a
                            href={msg.attachmentUrl}
                            download={msg.fileName}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 p-3 hover:bg-white/5 transition-colors"
                          >
                            <div className="w-9 h-9 rounded-lg bg-brand-accent/20 flex items-center justify-center text-brand-accent shrink-0">
                              <File size={18} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-white truncate">{msg.fileName}</p>
                              <p className="text-[10px] text-white/50">
                                {msg.fileSize ? `${(msg.fileSize / 1024).toFixed(0)} KB` : 'File'}
                              </p>
                            </div>
                            <Download size={14} className="text-white/50" />
                          </a>
                        )}

                        {/* Text message */}
                        {(!msg.type || msg.type === 'text') && msg.message && (
                          <p className="px-3 pt-2 pb-5 whitespace-pre-wrap break-words leading-relaxed text-[13px]">
                            {msg.message}
                          </p>
                        )}

                        {/* Timestamp + Read receipt */}
                        {msg.type !== 'certificate' && (
                          <div className="flex items-center gap-1 select-none absolute right-2 bottom-1">
                            <span className="text-[10px] text-white/50">{formatTimestamp(msg.timestamp)}</span>
                            {isMe && <ReadTick isRead={msg.isRead} />}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}

              {/* Typing indicator bubble */}
              {partnerTyping && <TypingBubble />}

              <div ref={messagesEndRef} />
            </div>

            {/* Input Bar */}
            <div className="relative shrink-0">
              {/* Emoji Picker */}
              {showEmoji && (
                <div ref={emojiPickerRef} className="absolute bottom-16 left-3 z-40">
                  <EmojiPicker
                    onEmojiClick={handleEmojiSelect}
                    theme="dark"
                    searchDisabled={false}
                    width={300}
                    height={380}
                    previewConfig={{ showPreview: false }}
                  />
                </div>
              )}

              {/* Send error toast */}
              {sendError && (
                <div className="px-4 py-2 bg-red-950/60 border-t border-red-900/40 text-red-400 text-[11px] font-medium flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0 animate-pulse" />
                  {sendError}
                </div>
              )}

              <form onSubmit={handleSendMessage} className="p-3 bg-[#202c33] flex items-center gap-3">


                <div className="flex items-center gap-2 text-brand-text-secondary">
                  <button
                    type="button"
                    onClick={() => setShowEmoji(!showEmoji)}
                    className={`p-1 hover:text-brand-text-primary cursor-pointer transition-colors ${showEmoji ? 'text-brand-accent' : ''}`}
                    title="Emoji picker"
                  >
                    <Smile size={20} />
                  </button>

                </div>

                <input
                  type="text"
                  value={inputText}
                  onChange={handleInputChange}
                  placeholder="Type a message"
                  className="flex-1 px-4 py-2.5 bg-[#2a3942] border-none rounded-xl text-xs focus:outline-none text-brand-text-primary placeholder:text-brand-text-muted"
                />

                <button
                  type="submit"
                  disabled={!inputText.trim()}
                  className="p-2.5 rounded-full bg-brand-accent hover:bg-brand-accent-hover text-brand-bg font-bold transition-all flex items-center justify-center cursor-pointer shrink-0 disabled:opacity-50"
                >
                  <Send size={15} />
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="h-full flex flex-col items-center justify-center bg-[#0b141a] gap-3">
            <div className="w-16 h-16 rounded-2xl bg-[#202c33] flex items-center justify-center text-brand-text-secondary">
              <MessageSquare size={28} />
            </div>
            <p className="text-xs text-brand-text-muted">Select a student to open their chat</p>
          </div>
        )}
      </div>
    </div>

    {/* Full Certificate Review Modal — opened when mentor clicks "View Full Certificate" */}
    {reviewCert && (
      <CertReviewModal
        cert={reviewCert}
        mentorUid={myUid}
        onClose={() => setReviewCert(null)}
      />
    )}
  </>
  );
}
