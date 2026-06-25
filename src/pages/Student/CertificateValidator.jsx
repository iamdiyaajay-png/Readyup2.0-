import { useState, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebase';
import { collection, addDoc, doc, updateDoc } from 'firebase/firestore';
import { validateCertificateFromText, evaluateCertificateWithGemini } from '../../services/gemini';
import { logCertificateValidated } from '../../services/activityLog';
import { storeCertificateBinary } from '../../services/binaryStorageService';
import { CERT_SCORE_CONFIG, SKILL_CATEGORIES } from '../../services/pointsService';
import { buildChatId, sendMessage } from '../../services/chatService';
import {
  Award, Upload, CheckCircle2, XCircle, AlertCircle,
  Scan, User, BookOpen, Building, Calendar, Shield, Loader2,
  AlertTriangle, Star, Target, Zap
} from 'lucide-react';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/bmp', 'image/gif', 'application/pdf'];

/**
 * Render first page of a PDF to a PNG dataURL using pdfjs-dist.
 * Returns { dataUrl: string, blob: Blob } so it can feed into Tesseract.
 */
async function renderPDFToImage(file) {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(1);

  // Render at 2× scale for better OCR accuracy
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement('canvas');
  canvas.width  = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;

  return canvas.toDataURL('image/png');
}

/**
 * OCR Pipeline: Tesseract.js → extracts raw text from certificate image
 */
async function runOCR(file, onProgress) {
  // Dynamically import Tesseract.js to avoid bloating the initial bundle
  const Tesseract = (await import('tesseract.js')).default;

  const result = await Tesseract.recognize(file, 'eng', {
    logger: (m) => {
      if (m.status === 'recognizing text' && onProgress) {
        onProgress(Math.round(m.progress * 100));
      }
    },
  });

  return result.data.text;
}

export default function CertificateValidator() {
  const { user } = useAuth();
  const fileInputRef = useRef(null);

  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [ocrText, setOcrText] = useState('');
  const [ocrProgress, setOcrProgress] = useState(0);

  // Phases: idle → ocr → gemini → evaluate → done
  const [phase, setPhase] = useState('idle');
  const [result, setResult] = useState(null);
  const [evaluation, setEvaluation] = useState(null); // Gemini 1-5 score result
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleFileSelect = async (selected) => {
    if (!selected) return;
    if (!ACCEPTED_TYPES.includes(selected.type)) {
      setError('Only image files or PDFs are accepted (JPG, PNG, WebP, PDF). Max 10 MB.');
      return;
    }
    if (selected.size > 10 * 1024 * 1024) {
      setError('File size must be under 10 MB.');
      return;
    }
    setError('');
    setResult(null);
    setOcrText('');
    setOcrProgress(0);
    setPhase('idle');

    if (selected.type === 'application/pdf') {
      // Render PDF page 1 to an image for OCR + mentor preview
      try {
        setPhase('ocr'); // show spinner while rendering
        const dataUrl = await renderPDFToImage(selected);
        // Convert dataURL → Blob so Tesseract can process it
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        const imageFile = new File([blob], selected.name.replace('.pdf', '.png'), { type: 'image/png' });
        setFile(imageFile);
        setPreview(dataUrl);
        setPhase('idle');
      } catch (err) {
        setError(`PDF rendering failed: ${err.message}. Try converting to PNG first.`);
        setPhase('idle');
      }
    } else {
      setFile(selected);
      setPreview(URL.createObjectURL(selected));
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFileSelect(e.dataTransfer.files?.[0]);
  };

  const handleValidate = async () => {
    if (!file || !user) return;
    setError('');
    setResult(null);
    setEvaluation(null);
    setSubmitted(false);
    setOcrProgress(0);

    // ── Step 1: OCR ───────────────────────────────────────────────
    setPhase('ocr');
    let extracted = '';
    try {
      extracted = await runOCR(file, setOcrProgress);
      setOcrText(extracted);
    } catch (err) {
      setError('OCR failed. Please use a clear, high-resolution image of your certificate.');
      setPhase('idle'); return;
    }
    if (!extracted?.trim() || extracted.trim().length < 20) {
      setError('Could not read text from this image. Please use a sharper scan.');
      setPhase('idle'); return;
    }

    // ── Step 2: Gemini OCR Parse (9 fields) ───────────────────────
    setPhase('gemini');
    let validated;
    try {
      validated = await validateCertificateFromText(extracted, user.name || '');
      setResult(validated);
    } catch (err) {
      setError(err.message || 'Gemini failed to parse the certificate. Try again.');
      setPhase('idle'); return;
    }

    // ── Step 3: Gemini Full Evaluation (score, fraud, category) ───
    setPhase('evaluate');
    let evalResult;
    try {
      evalResult = await evaluateCertificateWithGemini(extracted, validated, {
        name: user.name,
        branch: user.branch,
        year: user.year,
        approvedSkills: user.approvedSkills || [],
      });
      setEvaluation(evalResult);
    } catch (err) {
      console.warn('Evaluation failed (non-fatal):', err.message);
      evalResult = { score: 2, skillCategory: validated.category || 'Programming',
        authenticityConfidence: 70, fraudFlags: [], isSuspicious: false };
      setEvaluation(evalResult);
    }

    setPhase('done');

    await logCertificateValidated(
      user.uid,
      validated.isValid ? 'Valid' : 'Invalid',
      validated.courseTitle || 'Unknown Course'
    );

    // ── Step 4: Write certPending doc (no image — stored as binary chunks) ─
    if (user.mentorId) {
      try {
        // 4a. Create certPending without image (get the doc ID first)
        const docRef = await addDoc(collection(db, 'certPending'), {
          studentId:    user.uid,
          studentName:  user.name || 'Student',
          mentorId:     user.mentorId,
          hasChunkedImage: false,   // will be updated after binary storage
          imageDataUrl: null,
          ocrText:      extracted,
          ocrFields: {
            studentName:     validated.studentName    || null,
            courseTitle:     validated.courseTitle    || null,
            issuer:          validated.issuer         || null,
            completionDate:  validated.completionDate || null,
            certificateId:   validated.certificateId  || null,
            duration:        validated.duration       || null,
            skillsMentioned: validated.skillsMentioned || [],
            achievementLevel:validated.achievementLevel|| null,
            category:        validated.category       || evalResult.skillCategory || null,
          },
          geminiScore:              evalResult.score || 2,
          geminiSkillCategory:      evalResult.skillCategory || null,
          geminiAuthConfidence:     evalResult.authenticityConfidence || 70,
          geminiFraudFlags:         evalResult.fraudFlags || [],
          geminiPlacementRelevance: evalResult.placementRelevance || 50,
          isSuspicious:             evalResult.isSuspicious || false,
          title:     validated.courseTitle || 'Certificate',
          issuer:    validated.issuer || '',
          status:    evalResult.isSuspicious ? 'review_required' : 'pending',
          createdAt: new Date().toISOString(),
        });

        const certDocId = docRef.id;

        // 4b. Store the image as binary chunks using certDocId as prefix
        try {
          setPhase('storing');
          const { chunkCount } = await storeCertificateBinary(file, certDocId);
          // 4c. Update certPending to mark image as stored
          await updateDoc(doc(db, 'certPending', certDocId), {
            hasChunkedImage: true,
            imageChunkCount: chunkCount,
          });
        } catch (binErr) {
          console.warn('Binary storage failed — cert saved without image:', binErr.message);
        }

        setSubmitted(true);

        // ── Auto-message mentor in RTDB chat ──────────────────────
        try {
          const chatId = buildChatId(user.uid, user.mentorId);
          await sendMessage(chatId, {
            senderId: user.uid,
            receiverId: user.mentorId,
            senderRole: 'student',
            message: `📄 New certificate submitted for review: "${validated.courseTitle || 'Certificate'}" — AI Score: ${evalResult.score}/5`,
            type: 'certificate',
            certMeta: {
              certId: certDocId,
              certName: validated.courseTitle || 'Certificate',
              issuer: validated.issuer || '',
              score: evalResult.score || 2,
              studentId: user.uid,
              isSuspicious: evalResult.isSuspicious || false,
            },
          });
        } catch (chatErr) {
          console.warn('Chat auto-message failed (non-fatal):', chatErr.message);
        }
      } catch (e) {
        console.warn('certPending write failed:', e.message);
      }
    }
  };

  const handleReset = () => {
    setFile(null);
    setPreview(null);
    setOcrText('');
    setResult(null);
    setError('');
    setPhase('idle');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const isProcessing = ['ocr', 'gemini', 'evaluate'].includes(phase);

  const phaseLabel =
    phase === 'ocr'      ? `Scanning with OCR… ${ocrProgress}%` :
    phase === 'gemini'   ? 'Parsing fields with Gemini…' :
    phase === 'evaluate' ? 'AI scoring & fraud check…' : null;

  const scoreConfig = evaluation ? CERT_SCORE_CONFIG[evaluation.score] : null;

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="relative overflow-hidden p-8 rounded-3xl bg-gradient-to-r from-yellow-950/20 to-brand-card/50 border border-brand-border/60">
        <div className="absolute top-0 right-0 w-80 h-full bg-yellow-500/5 blur-3xl rounded-full pointer-events-none" />
        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 bg-yellow-950/40 px-3 py-1 rounded-full border border-yellow-500/20">
            <Scan size={14} className="text-yellow-400" />
            <span className="text-xs font-bold text-yellow-400 uppercase tracking-wider">OCR + AI Verification</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Certificate Validator</h1>
          <p className="text-sm text-brand-text-secondary max-w-xl">
            Upload your certificate image. Tesseract OCR extracts the text, then Google Gemini AI validates and verifies it against your profile.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* Upload Panel */}
        <div className="lg:col-span-3 space-y-4">
          <div className="glass-card p-6 rounded-3xl">
            <h3 className="text-sm font-bold text-brand-text-primary mb-4 flex items-center gap-2">
              <Upload size={16} className="text-brand-accent" />
              Upload Certificate Image
            </h3>

            {/* Drop Zone */}
            {!file ? (
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-200 ${
                  dragOver
                    ? 'border-brand-accent bg-brand-accent/5'
                    : 'border-brand-border hover:border-brand-accent/50 hover:bg-brand-card/60'
                }`}
              >
                <div className="w-14 h-14 rounded-2xl bg-yellow-950/30 border border-yellow-500/20 flex items-center justify-center text-yellow-400 mx-auto mb-4">
                  <Award size={26} />
                </div>
                <p className="text-sm font-bold text-brand-text-primary">
                  {dragOver ? 'Drop it here!' : 'Drag & drop your certificate'}
                </p>
                <p className="text-xs text-brand-text-secondary mt-1">
                  or <span className="text-brand-accent font-semibold">browse files</span>
                </p>
                <p className="text-[10px] text-brand-text-muted mt-3 uppercase tracking-wider">
                  JPG · PNG · WebP · PDF · Max 10 MB
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Image Preview */}
                <div className="relative rounded-2xl overflow-hidden border border-brand-border max-h-72 bg-brand-bg/50">
                  <img src={preview} alt="Certificate Preview" className="w-full h-full object-contain" />
                  {isProcessing && (
                    <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-3">
                      <Loader2 size={28} className="text-brand-accent animate-spin" />
                      <p className="text-xs font-semibold text-white">{phaseLabel}</p>
                      {phase === 'ocr' && (
                        <div className="w-48 h-1.5 bg-white/20 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-brand-accent rounded-full transition-all duration-300"
                            style={{ width: `${ocrProgress}%` }}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={handleValidate}
                    disabled={isProcessing}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-brand-accent text-brand-bg font-bold text-sm hover:bg-brand-accent-hover transition-all shadow-lg shadow-brand-accent/15 disabled:opacity-60 cursor-pointer"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        <span>{phaseLabel}</span>
                      </>
                    ) : (
                      <>
                        <Scan size={16} />
                        <span>{phase === 'done' ? 'Re-Validate' : 'Validate Certificate'}</span>
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleReset}
                    disabled={isProcessing}
                    className="px-4 py-3 rounded-2xl border border-brand-border text-xs font-semibold text-brand-text-secondary hover:text-brand-text-primary hover:border-brand-accent/30 transition-colors cursor-pointer disabled:opacity-40"
                  >
                    Change
                  </button>
                </div>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/bmp,image/gif,application/pdf,.pdf"
              className="hidden"
              onChange={(e) => handleFileSelect(e.target.files?.[0])}
            />
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-950/20 border border-red-900/30 text-red-400 text-xs">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* OCR Raw Text Preview */}
          {ocrText && (
            <div className="glass-card p-4 rounded-2xl">
              <p className="text-[10px] font-bold text-brand-text-muted uppercase tracking-wider mb-2 flex items-center gap-1">
                <Scan size={11} />
                OCR Extracted Text
              </p>
              <pre className="text-[10px] text-brand-text-secondary font-mono leading-relaxed whitespace-pre-wrap max-h-32 overflow-y-auto">
                {ocrText}
              </pre>
            </div>
          )}
        </div>

        {/* Results Panel */}
        <div className="lg:col-span-2 space-y-4">
          {result ? (
            <>
              {/* Verdict Card */}
              <div className={`glass-card p-6 rounded-3xl border-2 text-center ${
                result.isValid
                  ? 'border-brand-accent bg-brand-accent/5'
                  : 'border-red-500/40 bg-red-950/10'
              }`}>
                <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
                  result.isValid ? 'bg-brand-accent-light text-brand-accent' : 'bg-red-950/30 text-red-400'
                }`}>
                  {result.isValid ? <CheckCircle2 size={32} /> : <XCircle size={32} />}
                </div>
                <h3 className={`text-xl font-extrabold ${result.isValid ? 'text-brand-accent' : 'text-red-400'}`}>
                  {result.isValid ? '✅ Valid Certificate' : '❌ Invalid Certificate'}
                </h3>
                <p className="text-xs text-brand-text-secondary mt-2 leading-relaxed">
                  {result.isValid
                    ? 'Verified via OCR + Gemini AI. Submitted for mentor approval.'
                    : 'Could not verify. Check name match or completion status.'}
                </p>
                {submitted && (
                  <div className="mt-3 px-3 py-1.5 rounded-full bg-brand-accent-light border border-brand-accent/20 text-[10px] font-bold text-brand-accent inline-flex items-center gap-1">
                    <CheckCircle2 size={10} /> Sent to your mentor for review
                  </div>
                )}
              </div>

              {/* Gemini Evaluation Card */}
              {evaluation && (
                <div className="glass-card p-5 rounded-3xl space-y-3">
                  <h4 className="text-sm font-bold text-brand-text-primary flex items-center gap-2">
                    <Zap size={15} className="text-brand-accent" /> AI Evaluation
                  </h4>

                  {/* Score Stars */}
                  {scoreConfig && (
                    <div className={`flex items-center justify-between p-3 rounded-2xl border ${scoreConfig.bg} ${scoreConfig.color} border-current/20`}>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider opacity-70">Certificate Score</p>
                        <p className="text-sm font-extrabold">{scoreConfig.label}</p>
                      </div>
                      <div className="flex gap-0.5">
                        {[1,2,3,4,5].map((s) => (
                          <Star key={s} size={14} className={s <= evaluation.score ? scoreConfig.color : 'text-brand-border'} fill={s <= evaluation.score ? 'currentColor' : 'none'} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Skill Category + Authenticity */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 rounded-xl bg-brand-bg/40 border border-brand-border">
                      <p className="text-[9px] text-brand-text-muted uppercase tracking-wider">Skill Category</p>
                      <p className="font-bold text-brand-text-primary mt-0.5">{evaluation.skillCategory || '—'}</p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-brand-bg/40 border border-brand-border">
                      <p className="text-[9px] text-brand-text-muted uppercase tracking-wider">Difficulty</p>
                      <p className="font-bold text-brand-text-primary mt-0.5">{evaluation.difficultyLevel || '—'}</p>
                    </div>
                  </div>

                  {/* Authenticity Confidence */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-brand-text-muted font-bold flex items-center gap-1">
                        <Shield size={10} /> Authenticity Confidence
                      </span>
                      <span className={`text-[10px] font-bold ${evaluation.authenticityConfidence >= 70 ? 'text-brand-accent' : evaluation.authenticityConfidence >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {evaluation.authenticityConfidence}%
                      </span>
                    </div>
                    <div className="h-1.5 bg-brand-border rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-700 ${evaluation.authenticityConfidence >= 70 ? 'bg-brand-accent' : evaluation.authenticityConfidence >= 50 ? 'bg-yellow-400' : 'bg-red-400'}`}
                        style={{ width: `${evaluation.authenticityConfidence}%` }} />
                    </div>
                  </div>

                  {/* Fraud Flags */}
                  {evaluation.fraudFlags?.length > 0 && (
                    <div className="p-3 rounded-2xl bg-red-950/20 border border-red-900/30 space-y-1.5">
                      <p className="text-[10px] font-bold text-red-400 flex items-center gap-1">
                        <AlertTriangle size={11} /> Fraud Detection Flags
                      </p>
                      {evaluation.fraudFlags.map((flag) => (
                        <p key={flag} className="text-[10px] text-red-300 flex items-center gap-1.5">
                          <span className="w-1 h-1 rounded-full bg-red-400 shrink-0" /> {flag}
                        </p>
                      ))}
                      <p className="text-[9px] text-red-400/70 mt-1">Your mentor will review these flags before approval.</p>
                    </div>
                  )}

                  {/* Placement Relevance */}
                  <div className="flex items-center justify-between text-[10px] pt-1 border-t border-brand-border/40">
                    <span className="text-brand-text-muted flex items-center gap-1"><Target size={10} /> Placement Relevance</span>
                    <span className="font-bold text-brand-accent">{evaluation.placementRelevance || 0}%</span>
                  </div>
                </div>
              )}

              {/* Extracted Details */}
              <div className="glass-card p-6 rounded-3xl space-y-3">
                <h4 className="text-sm font-bold text-brand-text-primary">Extracted Details</h4>

                {[
                  { icon: User,     label: 'Name on Certificate', value: result.studentName },
                  { icon: BookOpen, label: 'Course Title',         value: result.courseTitle },
                  { icon: Building, label: 'Issuer / Platform',    value: result.issuer },
                  { icon: Calendar, label: 'Completion Date',       value: result.completionDate },
                  { icon: Shield,   label: 'Certificate ID',        value: result.certificateId },
                  { icon: Zap,      label: 'Duration',              value: result.duration },
                  { icon: Target,   label: 'Category',              value: result.category || evaluation?.skillCategory },
                  { icon: Star,     label: 'Achievement Level',     value: result.achievementLevel },
                ].map(({ icon: Icon, label, value }) => (
                  <div key={label} className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-lg bg-brand-bg border border-brand-border flex items-center justify-center shrink-0">
                      <Icon size={13} className="text-brand-text-muted" />
                    </div>
                    <div>
                      <p className="text-[10px] text-brand-text-muted uppercase tracking-wider">{label}</p>
                      <p className="text-xs font-semibold text-brand-text-primary mt-0.5">
                        {value || <span className="text-brand-text-muted italic">Not detected</span>}
                      </p>
                    </div>
                  </div>
                ))}

                {/* Skills Mentioned */}
                {result.skillsMentioned?.length > 0 && (
                  <div className="pt-2 border-t border-brand-border/40">
                    <p className="text-[10px] text-brand-text-muted uppercase tracking-wider mb-1.5">Skills Mentioned</p>
                    <div className="flex flex-wrap gap-1">
                      {result.skillsMentioned.map((sk) => (
                        <span key={sk} className="px-2 py-0.5 rounded-full bg-brand-card border border-brand-border text-[10px] text-brand-text-secondary">{sk}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Name Match + Completion */}
                <div className="pt-2 border-t border-brand-border/40 space-y-1.5">
                  <div className={`flex items-center gap-2 text-xs font-semibold ${result.nameMatch ? 'text-brand-accent' : 'text-red-400'}`}>
                    {result.nameMatch ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                    <span>{result.nameMatch ? `Name matches profile (${user?.name})` : `Name mismatch — cert: "${result.studentName}", profile: "${user?.name}"`}</span>
                  </div>
                  <div className={`flex items-center gap-2 text-xs font-semibold ${result.isCompleted ? 'text-brand-accent' : 'text-red-400'}`}>
                    {result.isCompleted ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                    <span>{result.isCompleted ? 'Course marked as completed' : 'Course not marked as completed'}</span>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="glass-card p-6 rounded-3xl flex flex-col items-center justify-center text-center min-h-[280px]">
              <div className="w-14 h-14 rounded-2xl bg-yellow-950/30 border border-yellow-500/20 flex items-center justify-center text-yellow-500 mb-4">
                <Award size={24} />
              </div>
              <p className="text-sm font-bold text-brand-text-primary">Awaiting Certificate</p>
              <p className="text-xs text-brand-text-secondary mt-2 max-w-xs leading-relaxed">
                Upload your certificate and click "Validate Certificate" to run OCR + AI verification.
              </p>
            </div>
          )}

          {/* Pipeline Explainer */}
          <div className="glass-card p-5 rounded-3xl">
            <p className="text-[10px] font-bold text-brand-text-muted uppercase tracking-wider mb-3">Validation Pipeline</p>
            <div className="space-y-2.5">
              {[
                { step: '1', label: 'Upload Image',       detail: 'JPG / PNG / WebP / PDF',            done: !!file },
                { step: '2', label: 'Tesseract OCR',      detail: 'Extract raw text from image',       done: !!ocrText },
                { step: '3', label: 'Gemini Parse',       detail: 'Extract 9 structured fields',       done: !!result },
                { step: '4', label: 'AI Scoring',         detail: 'Score 1–5, category, fraud check',  done: !!evaluation },
                { step: '5', label: 'Mentor Submission',  detail: 'Awaiting mentor review',            done: submitted },
              ].map(({ step, label, detail, done }) => (
                <div key={step} className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 border ${
                    done ? 'bg-brand-accent border-brand-accent text-brand-bg' : 'border-brand-border text-brand-text-muted'
                  }`}>
                    {done ? '✓' : step}
                  </div>
                  <div>
                    <p className={`text-[11px] font-bold ${done ? 'text-brand-accent' : 'text-brand-text-secondary'}`}>{label}</p>
                    <p className="text-[10px] text-brand-text-muted">{detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
