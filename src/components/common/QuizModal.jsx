import { useState } from 'react';
import { CheckCircle2, XCircle, Clock, Award, ChevronRight, X } from 'lucide-react';

/**
 * QuizModal — MCQ quiz overlay component.
 *
 * Props:
 *   course         — The course suggestion object (must have `quiz: [{question, options:[A,B,C,D], correct:'B'}, ...]`)
 *   onClose        — Called when user dismisses without completing
 *   onPassed       — Called with (score) when user passes (>= 70%)
 *   onFailed       — Called with (score) when user fails
 */
export default function QuizModal({ course, onClose, onPassed, onFailed }) {
  const questions = course?.quiz || [];
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState(null);
  const [answers, setAnswers] = useState([]); // array of { questionIdx, chosen, correct }
  const [phase, setPhase] = useState('quiz'); // 'quiz' | 'result'
  const [score, setScore] = useState(0);

  if (!questions.length) {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="glass-card p-8 rounded-3xl max-w-sm w-full text-center border border-brand-border">
          <XCircle size={40} className="text-red-400 mx-auto mb-4" />
          <h3 className="font-bold text-brand-text-primary">No Quiz Available</h3>
          <p className="text-xs text-brand-text-secondary mt-2">The mentor hasn't set up quiz questions for this course yet.</p>
          <button onClick={onClose} className="mt-6 px-6 py-2.5 rounded-xl bg-brand-card border border-brand-border text-xs font-bold text-brand-text-primary hover:bg-brand-card-hover transition-colors cursor-pointer">
            Close
          </button>
        </div>
      </div>
    );
  }

  const q = questions[current];
  const totalQ = questions.length;
  const PASS_THRESHOLD = 70;

  const handleSelectOption = (option) => {
    if (selected !== null) return; // already answered
    setSelected(option);
  };

  const handleNext = () => {
    const isCorrect = selected === q.correct;
    const newAnswers = [...answers, { questionIdx: current, chosen: selected, correct: q.correct, isCorrect }];
    setAnswers(newAnswers);

    if (current + 1 < totalQ) {
      setCurrent((prev) => prev + 1);
      setSelected(null);
    } else {
      // Calculate final score
      const correctCount = newAnswers.filter((a) => a.isCorrect).length;
      const finalScore = Math.round((correctCount / totalQ) * 100);
      setScore(finalScore);
      setPhase('result');

      // Notify parent
      if (finalScore >= PASS_THRESHOLD) {
        onPassed(finalScore);
      } else {
        onFailed(finalScore);
      }
    }
  };

  const getOptionStyle = (option) => {
    if (selected === null) {
      return 'border-brand-border hover:border-brand-accent/50 hover:bg-brand-card/80 cursor-pointer';
    }
    if (option === q.correct) return 'border-brand-accent bg-brand-accent/10 text-brand-accent';
    if (option === selected && option !== q.correct) return 'border-red-500/50 bg-red-950/20 text-red-400';
    return 'border-brand-border opacity-50';
  };

  const passed = score >= PASS_THRESHOLD;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="glass-card rounded-3xl max-w-lg w-full border border-brand-border overflow-hidden shadow-2xl">

        {phase === 'quiz' ? (
          <>
            {/* Header */}
            <div className="px-6 py-4 bg-brand-card border-b border-brand-border flex items-center justify-between">
              <div>
                <p className="text-[10px] text-brand-text-muted uppercase tracking-wider">Quiz</p>
                <h3 className="text-sm font-bold text-brand-text-primary mt-0.5 truncate max-w-xs">{course.title}</h3>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-brand-text-secondary">
                  {current + 1} / {totalQ}
                </span>
                <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-brand-card-hover text-brand-text-muted hover:text-brand-text-primary transition-colors cursor-pointer">
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Progress bar */}
            <div className="h-1 bg-brand-border">
              <div
                className="h-full bg-brand-accent transition-all duration-500"
                style={{ width: `${((current) / totalQ) * 100}%` }}
              />
            </div>

            {/* Question */}
            <div className="p-6 space-y-5">
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-lg bg-brand-accent-light border border-brand-accent/20 flex items-center justify-center text-brand-accent text-xs font-bold shrink-0 mt-0.5">
                  {current + 1}
                </div>
                <p className="text-sm font-semibold text-brand-text-primary leading-relaxed">{q.question}</p>
              </div>

              {/* Options */}
              <div className="space-y-3">
                {(q.options || []).map((option, idx) => {
                  const letter = ['A', 'B', 'C', 'D'][idx];
                  return (
                    <button
                      key={idx}
                      onClick={() => handleSelectOption(letter)}
                      className={`w-full text-left p-4 rounded-2xl border transition-all duration-200 flex items-center gap-3 ${getOptionStyle(letter)}`}
                    >
                      <span className={`w-6 h-6 rounded-lg border flex items-center justify-center text-[11px] font-bold shrink-0 ${
                        selected === letter && letter === q.correct ? 'bg-brand-accent border-brand-accent text-brand-bg' :
                        selected === letter && letter !== q.correct ? 'bg-red-950/30 border-red-500/50 text-red-400' :
                        selected !== null && letter === q.correct ? 'bg-brand-accent border-brand-accent text-brand-bg' :
                        'border-brand-border text-brand-text-muted'
                      }`}>
                        {letter}
                      </span>
                      <span className="text-xs">{option}</span>
                      {selected !== null && letter === q.correct && (
                        <CheckCircle2 size={14} className="ml-auto text-brand-accent shrink-0" />
                      )}
                      {selected === letter && letter !== q.correct && (
                        <XCircle size={14} className="ml-auto text-red-400 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Next / Submit */}
              {selected !== null && (
                <button
                  onClick={handleNext}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-brand-accent text-brand-bg font-bold text-sm hover:bg-brand-accent-hover transition-all shadow-lg shadow-brand-accent/15 cursor-pointer"
                >
                  <span>{current + 1 < totalQ ? 'Next Question' : 'Submit Quiz'}</span>
                  <ChevronRight size={16} />
                </button>
              )}
            </div>
          </>
        ) : (
          /* Results Screen */
          <div className="p-8 text-center space-y-6">
            <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto border-4 ${
              passed ? 'bg-brand-accent-light border-brand-accent text-brand-accent' : 'bg-red-950/30 border-red-500/40 text-red-400'
            }`}>
              {passed ? <Award size={36} /> : <Clock size={36} />}
            </div>

            <div>
              <h3 className={`text-2xl font-extrabold ${passed ? 'text-brand-accent' : 'text-red-400'}`}>
                {passed ? '🎉 Quiz Passed!' : '📚 Not Quite Yet'}
              </h3>
              <p className="text-sm text-brand-text-secondary mt-2">
                {passed
                  ? 'Great job! Your result has been submitted for mentor approval.'
                  : `You scored ${score}%. You need at least ${PASS_THRESHOLD}% to pass. Review the material and try again.`}
              </p>
            </div>

            <div className="flex items-center justify-center gap-6">
              <div className="text-center">
                <p className="text-4xl font-extrabold text-brand-text-primary">{score}%</p>
                <p className="text-[10px] text-brand-text-muted uppercase tracking-wider mt-1">Your Score</p>
              </div>
              <div className="text-center">
                <p className="text-4xl font-extrabold text-brand-text-primary">
                  {answers.filter((a) => a.isCorrect).length}/{totalQ}
                </p>
                <p className="text-[10px] text-brand-text-muted uppercase tracking-wider mt-1">Correct</p>
              </div>
            </div>

            {/* Answer Review */}
            <div className="text-left space-y-2 max-h-48 overflow-y-auto">
              {answers.map((ans, i) => (
                <div key={i} className={`flex items-center gap-2 text-xs p-2 rounded-xl ${ans.isCorrect ? 'bg-brand-accent/5 text-brand-accent' : 'bg-red-950/10 text-red-400'}`}>
                  {ans.isCorrect ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                  <span className="truncate">{questions[ans.questionIdx]?.question}</span>
                  {!ans.isCorrect && <span className="ml-auto shrink-0">Correct: {ans.correct}</span>}
                </div>
              ))}
            </div>

            <button
              onClick={onClose}
              className="w-full py-3 rounded-2xl bg-brand-card border border-brand-border text-xs font-bold text-brand-text-primary hover:bg-brand-card-hover transition-colors cursor-pointer"
            >
              {passed ? 'Close — Awaiting Mentor Approval' : 'Close — Try Again Later'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
