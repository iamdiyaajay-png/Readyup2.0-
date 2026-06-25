import { useState } from 'react';
import { db } from '../../firebase';
import { doc, updateDoc, increment, getDoc, arrayUnion } from 'firebase/firestore';
import {
  X, Check, XCircle, User, BookOpen, Building, Calendar,
  AlertTriangle, Star, Shield, Zap, Target, RefreshCw, Hash, Clock
} from 'lucide-react';
import {
  getCertificateScore, CERT_SCORE_CONFIG, TIER_COLORS,
  applyScoreToMatrix, emptySkillMatrix, SKILL_CATEGORIES
} from '../../services/pointsService';
import { logCertApproved, logCertRejected } from '../../services/activityLog';
import { recalculateReadiness } from '../../services/recalcService';

/**
 * CertReviewModal — Full-featured certificate review for Mentors.
 * Shows: cert image, 9 OCR fields, Gemini score (1–5), fraud flags,
 * authenticity confidence, skill category, and actions (Approve / Reject / Re-upload).
 *
 * Props:
 *   cert      — certPending Firestore doc
 *   mentorUid — Mentor's UID
 *   onClose   — dismiss callback
 */
export default function CertReviewModal({ cert, mentorUid, onClose }) {
  const [loading, setLoading]   = useState(null); // 'approve' | 'reject' | 'reupload' | null
  const [done, setDone]         = useState(false);
  const [doneMsg, setDoneMsg]   = useState('');

  if (!cert) return null;

  const ocrFields  = cert.ocrFields  || {};
  const fraudFlags = cert.geminiFraudFlags || [];
  const certScore  = cert.geminiScore || 2;
  const scoreConf  = CERT_SCORE_CONFIG[certScore] || CERT_SCORE_CONFIG[2];
  const authConf   = cert.geminiAuthConfidence ?? 70;
  const category   = cert.geminiSkillCategory || ocrFields.category || 'Programming';

  // Map category label → skillMatrix key
  const CATEGORY_KEY_MAP = {
    'Programming':        'programming',
    'Web Development':    'webDevelopment',
    'Mobile Development': 'mobileDevelopment',
    'AI/ML':              'ai_ml',
    'Data Science':       'datascience',
    'Cybersecurity':      'cybersecurity',
    'Cloud Computing':    'cloudComputing',
    'DevOps':             'devops',
    'UI/UX':              'uiux',
    'Communication':      'communication',
    'Leadership':         'leadership',
    'Project Management': 'projectManagement',
    'Entrepreneurship':   'entrepreneurship',
  };
  const matrixKey = CATEGORY_KEY_MAP[category] || 'programming';

  // ── Approve ──────────────────────────────────────────────────
  const handleApprove = async () => {
    setLoading('approve');
    try {
      // 1. Mark certPending as approved
      await updateDoc(doc(db, 'certPending', cert.id), {
        status:     'approved',
        approvedBy: mentorUid,
        approvedAt: new Date().toISOString(),
      });

      // 2. Fetch student's current skillMatrix
      const studentSnap = await getDoc(doc(db, 'users', cert.studentId));
      const studentData  = studentSnap.exists() ? studentSnap.data() : {};
      const currentMatrix = studentData.skillMatrix || emptySkillMatrix();

      // 3. Apply score to the relevant skill category
      const updatedMatrix = applyScoreToMatrix(currentMatrix, matrixKey, certScore);

      // 4. Update student: skillMatrix + certPoints + approvedCerts array
      await updateDoc(doc(db, 'users', cert.studentId), {
        skillMatrix:   updatedMatrix,
        certPoints:    increment(certScore),
        approvedCerts: arrayUnion({
          certId:     cert.id,
          title:      ocrFields.courseTitle || cert.title || 'Certificate',
          issuer:     ocrFields.issuer || cert.issuer || '',
          score:      certScore,
          category,
          approvedAt: new Date().toISOString(),
        }),
        lastActivity: new Date().toISOString(),
      });

      // 5. If linked to a courseSuggestion, mark complete
      if (cert.courseId) {
        await updateDoc(doc(db, 'courseSuggestions', cert.courseId), {
          status: 'completed', mentorApproved: true, approvedAt: new Date().toISOString(),
        });
      }

      // 6. Trigger full readiness recalc
      try { await recalculateReadiness(cert.studentId); } catch { /* non-fatal */ }

      await logCertApproved(
        mentorUid,
        cert.studentName,
        ocrFields.courseTitle || cert.title || 'Certificate',
        certScore
      );

      setDoneMsg(`✅ Approved! Score ${certScore}/5 (+${certScore} pts) awarded to ${cert.studentName}. ${category} skill updated.`);
      setDone(true);
    } catch (err) {
      console.error('Cert approve failed:', err);
    } finally {
      setLoading(null);
    }
  };

  // ── Reject ───────────────────────────────────────────────────
  const handleReject = async () => {
    setLoading('reject');
    try {
      await updateDoc(doc(db, 'certPending', cert.id), {
        status:     'rejected',
        rejectedBy: mentorUid,
        rejectedAt: new Date().toISOString(),
      });
      await logCertRejected(
        mentorUid, cert.studentName,
        ocrFields.courseTitle || cert.title || 'Certificate'
      );
      setDoneMsg(`❌ Certificate rejected. ${cert.studentName} has been notified.`);
      setDone(true);
    } catch (err) {
      console.error('Cert reject failed:', err);
    } finally {
      setLoading(null);
    }
  };

  // ── Request Re-upload ────────────────────────────────────────
  const handleReupload = async () => {
    setLoading('reupload');
    try {
      await updateDoc(doc(db, 'certPending', cert.id), {
        status:            'needs_reupload',
        reuploadRequestBy: mentorUid,
        reuploadRequestAt: new Date().toISOString(),
      });
      setDoneMsg(`🔄 Re-upload requested. ${cert.studentName} will be asked to submit a clearer copy.`);
      setDone(true);
    } catch (err) {
      console.error('Re-upload request failed:', err);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="glass-card rounded-3xl w-full max-w-5xl max-h-[92vh] overflow-hidden border border-brand-border flex flex-col">

        {/* Header */}
        <div className="px-6 py-4 bg-brand-card border-b border-brand-border flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-sm font-bold text-brand-text-primary">Certificate Verification Review</h2>
            <p className="text-[10px] text-brand-text-muted mt-0.5">
              Submitted by <span className="text-brand-accent font-bold">{cert.studentName}</span>
              {cert.isSuspicious && (
                <span className="ml-2 px-1.5 py-0.5 rounded-full bg-red-950/30 border border-red-900/30 text-red-400 text-[9px] font-bold">
                  ⚠ REVIEW REQUIRED
                </span>
              )}
            </p>
          </div>
          <button onClick={onClose}
            className="p-2 rounded-xl hover:bg-brand-card-hover text-brand-text-muted hover:text-brand-text-primary transition-colors cursor-pointer">
            <X size={18} />
          </button>
        </div>

        {done ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-4">
            <p className="text-base font-bold text-brand-text-primary max-w-sm leading-relaxed">{doneMsg}</p>
            <button onClick={onClose}
              className="px-6 py-2.5 rounded-xl bg-brand-accent text-brand-bg font-bold text-sm hover:bg-brand-accent-hover transition-all cursor-pointer">
              Close
            </button>
          </div>
        ) : (
          <>
            {/* Body — 3-column layout */}
            <div className="flex-1 grid grid-cols-5 gap-0 overflow-hidden min-h-0">

              {/* Col 1-2: Certificate Image */}
              <div className="col-span-2 border-r border-brand-border overflow-y-auto p-4 flex flex-col gap-3">
                <p className="text-[10px] font-bold text-brand-text-muted uppercase tracking-wider shrink-0">
                  Certificate Image
                </p>
                {cert.imageDataUrl ? (
                  <div className="flex-1 flex items-center justify-center bg-brand-bg/40 rounded-2xl border border-brand-border overflow-hidden">
                    <img
                      src={cert.imageDataUrl}
                      alt="Certificate"
                      className="max-w-full max-h-[55vh] object-contain"
                    />
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center bg-brand-bg/40 rounded-2xl border border-brand-border">
                    <p className="text-xs text-brand-text-muted">No image preview available</p>
                  </div>
                )}

                {/* Fraud Flags */}
                {fraudFlags.length > 0 && (
                  <div className="p-3 rounded-2xl bg-red-950/20 border border-red-900/30 space-y-1.5 shrink-0">
                    <p className="text-[10px] font-bold text-red-400 flex items-center gap-1">
                      <AlertTriangle size={11} /> Fraud Detection Flags
                    </p>
                    {fraudFlags.map((flag) => (
                      <p key={flag} className="text-[10px] text-red-300 flex items-center gap-1.5">
                        <span className="w-1 h-1 rounded-full bg-red-400 shrink-0" /> {flag}
                      </p>
                    ))}
                  </div>
                )}
              </div>

              {/* Col 3-4: OCR Data */}
              <div className="col-span-2 border-r border-brand-border overflow-y-auto p-5 space-y-4">
                <p className="text-[10px] font-bold text-brand-text-muted uppercase tracking-wider">
                  OCR Extracted Fields
                </p>

                <div className="space-y-2">
                  {[
                    { icon: User,     label: 'Name on Certificate', value: ocrFields.studentName },
                    { icon: BookOpen, label: 'Course Title',         value: ocrFields.courseTitle },
                    { icon: Building, label: 'Issuer / Platform',    value: ocrFields.issuer },
                    { icon: Calendar, label: 'Completion Date',       value: ocrFields.completionDate },
                    { icon: Hash,     label: 'Certificate ID',        value: ocrFields.certificateId },
                    { icon: Clock,    label: 'Duration',              value: ocrFields.duration },
                    { icon: Target,   label: 'Category',              value: ocrFields.category },
                    { icon: Star,     label: 'Achievement Level',     value: ocrFields.achievementLevel },
                  ].map(({ icon: Icon, label, value }) => (
                    <div key={label} className="flex items-start gap-2.5 p-2.5 rounded-xl bg-brand-bg/40 border border-brand-border/60">
                      <div className="w-6 h-6 rounded-lg bg-brand-card border border-brand-border flex items-center justify-center shrink-0">
                        <Icon size={11} className="text-brand-text-muted" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[9px] text-brand-text-muted uppercase tracking-wider">{label}</p>
                        <p className="text-[11px] font-semibold text-brand-text-primary mt-0.5 truncate">
                          {value || <span className="text-brand-text-muted italic">Not detected</span>}
                        </p>
                      </div>
                    </div>
                  ))}

                  {/* Skills Mentioned */}
                  {ocrFields.skillsMentioned?.length > 0 && (
                    <div className="p-2.5 rounded-xl bg-brand-bg/40 border border-brand-border/60">
                      <p className="text-[9px] text-brand-text-muted uppercase tracking-wider mb-1.5">Skills Mentioned</p>
                      <div className="flex flex-wrap gap-1">
                        {ocrFields.skillsMentioned.map((sk) => (
                          <span key={sk} className="px-1.5 py-0.5 rounded-full bg-brand-card border border-brand-border text-[9px] text-brand-text-secondary">{sk}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Name mismatch warning */}
                {ocrFields.studentName && cert.studentName &&
                  !ocrFields.studentName.toLowerCase().includes(cert.studentName.toLowerCase().split(' ')[0]) && (
                  <div className="flex items-start gap-2 p-3 rounded-xl bg-yellow-950/20 border border-yellow-500/20 text-yellow-400 text-xs">
                    <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                    <span>
                      Name mismatch: cert says "<strong>{ocrFields.studentName}</strong>" but student is "<strong>{cert.studentName}</strong>". Verify before approving.
                    </span>
                  </div>
                )}

                {/* Raw OCR text */}
                {cert.ocrText && (
                  <div className="space-y-1.5">
                    <p className="text-[9px] font-bold text-brand-text-muted uppercase tracking-wider">Raw OCR Text</p>
                    <pre className="text-[10px] text-brand-text-secondary font-mono leading-relaxed whitespace-pre-wrap bg-brand-bg/40 border border-brand-border/60 rounded-xl p-3 max-h-28 overflow-y-auto">
                      {cert.ocrText}
                    </pre>
                  </div>
                )}
              </div>

              {/* Col 5: AI Evaluation */}
              <div className="col-span-1 overflow-y-auto p-4 space-y-3 bg-brand-bg/20">
                <p className="text-[10px] font-bold text-brand-text-muted uppercase tracking-wider">
                  AI Evaluation
                </p>

                {/* Score */}
                <div className={`p-3 rounded-2xl border ${scoreConf.bg} border-current/20`}>
                  <p className={`text-[9px] font-bold uppercase tracking-wider ${scoreConf.color} opacity-70`}>Cert Score</p>
                  <p className={`text-sm font-extrabold ${scoreConf.color} mt-0.5`}>{scoreConf.label}</p>
                  <div className="flex gap-0.5 mt-1.5">
                    {[1,2,3,4,5].map((s) => (
                      <Star key={s} size={12}
                        className={s <= certScore ? scoreConf.color : 'text-brand-border'}
                        fill={s <= certScore ? 'currentColor' : 'none'} />
                    ))}
                  </div>
                  <p className={`text-[9px] mt-1.5 font-bold ${scoreConf.color}`}>+{certScore} pts → {category}</p>
                </div>

                {/* Authenticity */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] text-brand-text-muted font-bold flex items-center gap-1">
                      <Shield size={9} /> Authenticity
                    </span>
                    <span className={`text-[9px] font-bold ${authConf >= 70 ? 'text-brand-accent' : authConf >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                      {authConf}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-brand-border rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${authConf >= 70 ? 'bg-brand-accent' : authConf >= 50 ? 'bg-yellow-400' : 'bg-red-400'}`}
                      style={{ width: `${authConf}%` }} />
                  </div>
                </div>

                {/* Placement Relevance */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] text-brand-text-muted font-bold flex items-center gap-1">
                      <Target size={9} /> Placement
                    </span>
                    <span className="text-[9px] font-bold text-brand-accent">{cert.geminiPlacementRelevance || 0}%</span>
                  </div>
                  <div className="h-1.5 bg-brand-border rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-brand-accent"
                      style={{ width: `${cert.geminiPlacementRelevance || 0}%` }} />
                  </div>
                </div>

                {/* Skill category update preview */}
                <div className="p-2.5 rounded-xl bg-brand-bg/40 border border-brand-border/60 text-[10px] space-y-1">
                  <p className="font-bold text-brand-text-muted uppercase tracking-wider text-[9px]">On Approve</p>
                  <p className="text-brand-text-secondary">
                    <span className="text-brand-accent font-bold">{category}</span> skill score
                    <span className="text-brand-accent font-bold"> +{certScore * 5}</span>
                  </p>
                  <p className="text-brand-text-secondary">
                    Cert points <span className="text-brand-accent font-bold">+{certScore}</span>
                  </p>
                  <p className="text-brand-text-secondary">Readiness recalculated</p>
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="px-6 py-4 bg-brand-card border-t border-brand-border flex items-center justify-between shrink-0">
              <p className="text-[10px] text-brand-text-muted">
                Review the cert image, OCR data, and AI flags before deciding.
              </p>
              <div className="flex items-center gap-2">
                {/* Request Re-upload */}
                <button
                  onClick={handleReupload}
                  disabled={!!loading}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-brand-border text-[11px] font-bold text-brand-text-secondary hover:text-brand-accent hover:border-brand-accent/30 transition-colors cursor-pointer disabled:opacity-40">
                  {loading === 'reupload'
                    ? <div className="w-3.5 h-3.5 rounded-full border-2 border-brand-text-muted/20 border-t-brand-text-muted animate-spin" />
                    : <RefreshCw size={13} />}
                  Re-upload
                </button>
                {/* Reject */}
                <button
                  onClick={handleReject}
                  disabled={!!loading}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-red-900/30 text-red-400 hover:bg-red-950/20 text-[11px] font-bold transition-colors cursor-pointer disabled:opacity-40">
                  {loading === 'reject'
                    ? <div className="w-3.5 h-3.5 rounded-full border-2 border-red-400/20 border-t-red-400 animate-spin" />
                    : <XCircle size={13} />}
                  Reject
                </button>
                {/* Approve */}
                <button
                  onClick={handleApprove}
                  disabled={!!loading}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-brand-accent text-brand-bg font-bold text-[11px] hover:bg-brand-accent-hover transition-all shadow-lg shadow-brand-accent/15 cursor-pointer disabled:opacity-40">
                  {loading === 'approve'
                    ? <div className="w-3.5 h-3.5 rounded-full border-2 border-brand-bg/20 border-t-brand-bg animate-spin" />
                    : <Check size={13} />}
                  Approve (+{certScore} pts)
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
