import React, { useState } from 'react';
import { X, FileText, CheckCircle, Download, FileType } from 'lucide-react';
import { db } from '../../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { retrieveCertificateBinary } from '../../services/binaryStorageService';

export default function ReviewResumeModal({ review, onClose }) {
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  if (!review) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!feedback.trim()) return;

    setSubmitting(true);
    try {
      const docRef = doc(db, 'resumeReviews', review.id);
      await updateDoc(docRef, {
        mentorStatus: 'reviewed',
        mentorFeedback: feedback.trim(),
        reviewedAt: new Date().toISOString()
      });
      onClose(true); // pass true to indicate success
    } catch (err) {
      console.error('Failed to submit resume feedback:', err);
      alert('Failed to submit feedback.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadPdf = async () => {
    setDownloadingPdf(true);
    try {
      const dataUrl = await retrieveCertificateBinary(review.id, 'resume_chunks');
      if (dataUrl) {
        // Create an invisible link to trigger the download
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `Resume_${review.studentName || 'Student'}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        alert('Could not retrieve PDF data.');
      }
    } catch (err) {
      console.error('Error downloading PDF:', err);
      alert('Error downloading PDF.');
    } finally {
      setDownloadingPdf(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#0b0c10] border border-[#1f2833] rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden relative">
        {/* Header */}
        <div className="p-6 border-b border-[#1f2833] flex items-center justify-between bg-[#0b0c10]/80 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-950/30 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <FileText size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#c5c6c7]">
                Resume Review: {review.studentName || 'Student'}
              </h2>
              <p className="text-xs text-[#c5c6c7]/60">
                AI Score: <span className="font-bold text-indigo-400">{review.atsScore}%</span>
                {review.jobTarget && ` • Target: ${review.jobTarget}`}
              </p>
            </div>
          </div>
          <button
            onClick={() => onClose()}
            className="p-2 rounded-xl hover:bg-[#1f2833] text-[#c5c6c7]/60 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Resume Content */}
          <div className="space-y-4 flex flex-col h-full">
            <h3 className="text-sm font-bold text-[#c5c6c7] flex items-center gap-2">
              <FileType size={16} className="text-indigo-400" />
              Student's Resume
            </h3>

            {review.hasPdf && (
              <div className="p-4 rounded-xl bg-indigo-950/20 border border-indigo-500/20 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-[#c5c6c7]">Original PDF Available</p>
                  <p className="text-[10px] text-[#c5c6c7]/60">Download the exact file submitted by the student.</p>
                </div>
                <button
                  onClick={handleDownloadPdf}
                  disabled={downloadingPdf}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {downloadingPdf ? (
                    <div className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  ) : (
                    <Download size={14} />
                  )}
                  Download PDF
                </button>
              </div>
            )}

            <div className="flex-1 bg-[#0b0c10]/50 border border-[#1f2833] rounded-xl p-4 overflow-y-auto text-xs text-[#c5c6c7]/80 font-mono whitespace-pre-wrap leading-relaxed max-h-[500px]">
              {review.resumeText || 'No text extracted.'}
            </div>
          </div>

          {/* Right: Feedback Form */}
          <div className="space-y-4 flex flex-col h-full">
            <h3 className="text-sm font-bold text-[#c5c6c7] flex items-center gap-2">
              <CheckCircle size={16} className="text-[#66fcf1]" />
              Your Feedback
            </h3>

            <div className="flex-1 flex flex-col gap-4">
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Provide constructive feedback, point out formatting issues, or suggest better ways to highlight their skills..."
                className="w-full flex-1 min-h-[200px] px-4 py-3 bg-[#0b0c10]/50 border border-[#1f2833] rounded-xl text-sm focus:outline-none focus:border-[#66fcf1] transition-colors text-[#c5c6c7] resize-none"
                required
              />

              <button
                onClick={handleSubmit}
                disabled={submitting || !feedback.trim()}
                className="w-full py-3 rounded-xl bg-[#66fcf1] text-[#0b0c10] font-bold text-sm hover:bg-[#45a29e] transition-colors shadow-lg shadow-[#66fcf1]/10 disabled:opacity-50 flex justify-center items-center gap-2"
              >
                {submitting ? (
                  <div className="w-5 h-5 rounded-full border-2 border-[#0b0c10]/30 border-t-[#0b0c10] animate-spin" />
                ) : (
                  'Submit Feedback'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
