import React, { useState } from 'react';
import { X, Send, FileText } from 'lucide-react';
import { db } from '../../firebase';
import { doc, updateDoc } from 'firebase/firestore';

export default function ResumeReviewModal({ review, onClose }) {
  const [editedText, setEditedText] = useState(review.editedText || review.originalText);
  const [suggestions, setSuggestions] = useState(review.mentorSuggestions || '');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await updateDoc(doc(db, 'mentorResumeReviews', review.id), {
        editedText: editedText.trim(),
        mentorSuggestions: suggestions.trim(),
        status: 'reviewed',
        updatedAt: new Date().toISOString()
      });
      onClose();
    } catch (err) {
      console.error('Failed to submit resume review:', err);
      alert('Failed to submit review.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-4xl bg-brand-bg rounded-3xl border border-brand-border shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-brand-border/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-accent/10 border border-brand-accent/20 flex items-center justify-center text-brand-accent">
              <FileText size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-brand-text-primary">Resume Review</h2>
              <p className="text-xs text-brand-text-muted">Reviewing resume for <span className="font-semibold text-brand-text-secondary">{review.studentName}</span></p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl border border-brand-border hover:bg-red-950/20 text-brand-text-muted hover:text-red-400 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Original Text */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-brand-text-secondary uppercase tracking-wider block">
                Original Resume Text
              </label>
              <div className="w-full h-96 p-4 bg-brand-card/50 border border-brand-border rounded-2xl text-xs font-mono text-brand-text-muted overflow-y-auto whitespace-pre-wrap custom-scrollbar">
                {review.originalText}
              </div>
            </div>

            {/* Edited Text */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-brand-accent uppercase tracking-wider block">
                Edit Resume Text
              </label>
              <textarea
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                className="w-full h-96 p-4 bg-brand-bg/50 border border-brand-border rounded-2xl text-xs font-mono text-brand-text-primary focus:outline-none focus:border-brand-accent transition-colors custom-scrollbar"
                placeholder="Make your edits here..."
              />
            </div>
          </div>

          {/* Suggestions */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-brand-text-secondary uppercase tracking-wider block">
              General Suggestions / Feedback
            </label>
            <textarea
              value={suggestions}
              onChange={(e) => setSuggestions(e.target.value)}
              className="w-full h-32 p-4 bg-brand-bg/50 border border-brand-border rounded-2xl text-sm focus:outline-none focus:border-brand-accent transition-colors text-brand-text-primary custom-scrollbar"
              placeholder="Leave feedback on formatting, keyword usage, or impact statements..."
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-brand-border/60 bg-brand-card/30 flex justify-end gap-3 rounded-b-3xl">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-brand-border text-brand-text-secondary font-bold text-xs hover:bg-brand-card transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-accent text-brand-bg font-bold text-xs hover:bg-brand-accent-hover transition-colors disabled:opacity-50 shadow-lg shadow-brand-accent/20"
          >
            {submitting ? (
              <div className="w-4 h-4 rounded-full border-2 border-brand-bg/25 border-t-brand-bg animate-spin" />
            ) : (
              <>
                <Send size={14} />
                <span>Submit Review</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
