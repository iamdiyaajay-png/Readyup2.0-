import { useState, useRef } from 'react';
import { FileText, Sparkles, CheckCircle, AlertTriangle, ListChecks, Upload, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebase';
import { collection, addDoc } from 'firebase/firestore';
import { reviewResumeWithGemini } from '../../services/gemini';
import { logResumeReviewed } from '../../services/activityLog';

// Extract text from PDF using pdfjs-dist (loaded dynamically to avoid build bloat)
async function extractPDFText(file) {
  try {
    const pdfjsLib = await import('pdfjs-dist');

    // Use the locally bundled worker — Vite resolves this at build time,
    // avoiding CDN version-mismatch failures.
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString();

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let fullText = '';
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      // Guard: filter out items with empty strings
      const pageText = textContent.items
        .map((item) => item.str || '')
        .filter(Boolean)
        .join(' ');
      fullText += pageText + '\n';
    }

    return fullText.trim();
  } catch (err) {
    throw new Error(`PDF text extraction failed: ${err.message}`);
  }
}

export default function ResumeReviewer() {
  const { user } = useAuth();
  const fileInputRef = useRef(null);

  const [resumeText, setResumeText] = useState('');
  const [uploadedFile, setUploadedFile] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [pdfError, setPdfError] = useState('');
  const [inputMode, setInputMode] = useState('text'); // 'text' | 'pdf'

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      setPdfError('Only PDF files are accepted for upload.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setPdfError('File must be under 10 MB.');
      return;
    }

    setPdfError('');
    setUploadedFile(file);
    setResumeText('');
    setExtracting(true);

    try {
      const text = await extractPDFText(file);
      if (!text || text.length < 50) {
        setPdfError('Could not extract readable text from this PDF. Please use a text-based PDF or paste your resume text directly.');
        setUploadedFile(null);
      } else {
        setResumeText(text);
      }
    } catch (err) {
      setPdfError(`PDF parsing error: ${err.message}. Try pasting the text directly.`);
      setUploadedFile(null);
    } finally {
      setExtracting(false);
    }
  };

  const clearFile = () => {
    setUploadedFile(null);
    setResumeText('');
    setPdfError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleReview = async (e) => {
    e.preventDefault();
    if (!resumeText.trim()) return;

    setLoading(true);
    setResult(null);

    try {
      const data = await reviewResumeWithGemini(resumeText.trim());
      setResult(data);

      if (user?.uid) {
        await addDoc(collection(db, 'resumeReviews'), {
          studentId: user.uid,
          atsScore: data.score,
          feedback: data.keyFeedback,
          sourceType: uploadedFile ? 'pdf' : 'text',
          createdAt: new Date().toISOString()
        });
        await logResumeReviewed(user.uid, data.score);
      }
    } catch (err) {
      console.error('Resume review scan error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="relative overflow-hidden p-8 rounded-3xl bg-gradient-to-r from-indigo-950/20 to-brand-card/50 border border-brand-border/60">
        <div className="absolute top-0 right-0 w-80 h-full bg-indigo-500/5 blur-3xl rounded-full pointer-events-none" />
        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 bg-indigo-950/40 px-3 py-1 rounded-full border border-indigo-500/20">
            <Sparkles size={14} className="text-indigo-400" />
            <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">AI Resume Review</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">AI Resume Reviewer</h1>
          <p className="text-sm text-brand-text-secondary max-w-xl">
            Upload your PDF resume or paste text. Gemini calculates your ATS score, identifies missing keywords, and suggests improvements.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Editor Form (2 Cols) */}
        <div className="glass-card p-6 rounded-3xl lg:col-span-2 space-y-4">
          {/* Input Mode Toggle */}
          <div className="flex gap-2 p-1 bg-brand-bg/50 rounded-xl border border-brand-border">
            <button
              type="button"
              onClick={() => { setInputMode('pdf'); clearFile(); }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                inputMode === 'pdf' ? 'bg-brand-accent text-brand-bg shadow-md' : 'text-brand-text-secondary hover:text-brand-text-primary'
              }`}
            >
              <Upload size={13} /> Upload PDF
            </button>
            <button
              type="button"
              onClick={() => { setInputMode('text'); clearFile(); }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                inputMode === 'text' ? 'bg-brand-accent text-brand-bg shadow-md' : 'text-brand-text-secondary hover:text-brand-text-primary'
              }`}
            >
              <FileText size={13} /> Paste Text
            </button>
          </div>

          <form onSubmit={handleReview} className="space-y-4">
            {inputMode === 'pdf' ? (
              <div className="space-y-3">
                {/* PDF Drop Zone */}
                {!uploadedFile ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-brand-border hover:border-brand-accent/50 rounded-2xl p-10 text-center cursor-pointer transition-all hover:bg-brand-card/40"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-indigo-950/30 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mx-auto mb-4">
                      <FileText size={24} />
                    </div>
                    <p className="text-sm font-bold text-brand-text-primary">Click to upload your resume PDF</p>
                    <p className="text-[10px] text-brand-text-muted mt-2 uppercase tracking-wider">PDF · Max 10 MB</p>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 p-4 bg-brand-bg/40 rounded-2xl border border-brand-border">
                    <div className="w-10 h-10 rounded-xl bg-indigo-950/30 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
                      <FileText size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-brand-text-primary truncate">{uploadedFile.name}</p>
                      <p className="text-[10px] text-brand-text-muted">{(uploadedFile.size / 1024).toFixed(0)} KB · PDF</p>
                    </div>
                    <button type="button" onClick={clearFile}
                      className="p-1.5 rounded-lg hover:bg-brand-card-hover text-brand-text-muted hover:text-red-400 transition-colors cursor-pointer">
                      <X size={14} />
                    </button>
                  </div>
                )}

                {extracting && (
                  <div className="flex items-center gap-2 text-xs text-brand-text-muted">
                    <div className="w-4 h-4 rounded-full border-2 border-brand-accent/20 border-t-brand-accent animate-spin" />
                    Extracting text from PDF...
                  </div>
                )}

                {pdfError && (
                  <div className="p-3 rounded-xl bg-red-950/20 border border-red-900/30 text-red-400 text-xs">
                    {pdfError}
                  </div>
                )}

                {resumeText && !extracting && (
                  <div className="p-3 rounded-xl bg-brand-accent/5 border border-brand-accent/20 text-xs text-brand-text-secondary">
                    ✅ {resumeText.split(/\s+/).length} words extracted from PDF — ready to scan.
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-brand-text-secondary uppercase block">
                  Paste Resume Text
                </label>
                <textarea
                  value={resumeText}
                  onChange={(e) => setResumeText(e.target.value)}
                  placeholder="Paste the plain text of your resume here (Ctrl+V)..."
                  className="w-full h-80 px-4 py-3 bg-brand-bg/50 border border-brand-border rounded-2xl text-sm focus:outline-none focus:border-brand-accent transition-colors font-mono text-brand-text-primary"
                  required
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading || extracting || !resumeText.trim()}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-brand-accent text-brand-bg font-bold text-sm hover:bg-brand-accent-hover transition-all cursor-pointer shadow-lg shadow-brand-accent/15 disabled:opacity-50"
            >
              {loading ? (
                <div className="w-5 h-5 rounded-full border-2 border-brand-bg/25 border-t-brand-bg animate-spin" />
              ) : (
                <>
                  <Sparkles size={16} />
                  <span>Scan Resume with Gemini</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Report (1 Col) */}
        <div className="glass-card p-6 rounded-3xl border border-brand-border">
          <h3 className="text-sm font-bold text-brand-text-primary mb-4 flex items-center gap-2">
            <FileText size={16} className="text-brand-accent" />
            <span>ATS Scan Report</span>
          </h3>

          {loading && (
            <div className="space-y-6 py-12 flex flex-col items-center justify-center text-center">
              <div className="w-12 h-12 rounded-full border-4 border-brand-accent/20 border-t-brand-accent animate-spin mb-4" />
              <div className="space-y-2">
                <p className="text-sm font-semibold text-brand-text-primary">Scanning resume sections...</p>
                <p className="text-xs text-brand-text-muted">Gemini is checking placement requirements</p>
              </div>
            </div>
          )}

          {!loading && !result && (
            <div className="text-center py-20 text-brand-text-muted text-xs">
              <p>Upload a PDF or paste your resume text to generate an instant ATS report.</p>
            </div>
          )}

          {!loading && result && (
            <div className="space-y-6 animate-fade-in">
              {/* Score ring */}
              <div className="flex items-center gap-4 bg-brand-bg/40 p-4 rounded-2xl border border-brand-border/60">
                <div className="w-16 h-16 rounded-full border-4 border-brand-accent flex items-center justify-center font-extrabold text-lg text-brand-accent bg-brand-accent-light">
                  {result.score}%
                </div>
                <div>
                  <h4 className="text-sm font-bold text-brand-text-primary">{result.level}</h4>
                  <span className="text-[10px] text-brand-text-muted">ATS Compatibility Match</span>
                </div>
              </div>

              {/* Feedbacks */}
              <div className="space-y-3">
                <span className="text-[10px] uppercase font-bold text-brand-text-muted tracking-wider block">Action Items</span>
                <div className="space-y-2.5">
                  {result.keyFeedback.map((f) => (
                    <div key={f.id} className="flex gap-2.5 items-start text-xs leading-relaxed text-brand-text-secondary">
                      {f.type === 'success' ? (
                        <CheckCircle size={14} className="text-brand-accent shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle size={14} className="text-yellow-500 shrink-0 mt-0.5" />
                      )}
                      <span>{f.text}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Keywords */}
              <div className="space-y-3 border-t border-brand-border/40 pt-4">
                <span className="text-[10px] uppercase font-bold text-brand-text-muted tracking-wider flex items-center gap-1">
                  <ListChecks size={12} />
                  <span>Missing Keywords</span>
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {result.missingKeywords.map((kw) => (
                    <span key={kw} className="px-2 py-0.5 rounded bg-brand-bg border border-brand-border/60 text-[10px] text-brand-text-secondary">
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
