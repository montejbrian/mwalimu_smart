import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { CheckCircle2, XCircle, ArrowRight, RotateCcw, Trophy, Zap } from "lucide-react";
import { lessonApi } from "../lib/api.js";
import { useStore } from "../lib/store.js";
import toast from "react-hot-toast";
import clsx from "clsx";

const CHOICES = ["A", "B", "C", "D"];

function ProgressRing({ pct, size = 96 }) {
  const r   = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const dash  = (pct / 100) * circ;
  const color = pct >= 80 ? "#22c55e" : pct >= 60 ? "#f59e0b" : "#ef4444";
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={8} />
      <motion.circle
        cx={size/2} cy={size/2} r={r} fill="none"
        stroke={color} strokeWidth={8}
        strokeLinecap="round"
        strokeDasharray={circ}
        initial={{ strokeDashoffset: circ }}
        animate={{ strokeDashoffset: circ - dash }}
        transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
      />
    </svg>
  );
}

export default function DiagnosticPage() {
  const { lessonId } = useParams();
  const navigate     = useNavigate();
  const setDiagnosticAnswer = useStore((s) => s.setDiagnosticAnswer);

  const [questions, setQuestions] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [current,   setCurrent]   = useState(0);
  const [answers,   setAnswers]   = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [result,    setResult]    = useState(null);
  const [submitting,setSubmitting]= useState(false);

  // Reveal animation per option
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    lessonApi.get(lessonId).then((res) => {
      const qs = res.data?.lesson_script?.diagnostic_questions || [];
      setQuestions(qs);
      setLoading(false);
    }).catch(() => { toast.error("Failed to load questions"); setLoading(false); });
  }, [lessonId]);

  useEffect(() => {
    setRevealed(false);
    const t = setTimeout(() => setRevealed(true), 50);
    return () => clearTimeout(t);
  }, [current]);

  function selectAnswer(choice) {
    const q = questions[current];
    setAnswers((a) => ({ ...a, [q.question_id]: choice }));
    setDiagnosticAnswer(q.question_id, choice);
  }

  function canAdvance() { return !!answers[questions[current]?.question_id]; }

  function next() {
    if (current < questions.length - 1) setCurrent((c) => c + 1);
    else handleSubmit();
  }

  async function handleSubmit() {
    setSubmitting(true);
    const user = useStore.getState().user;
    const creatorId = user?.student_id || user?.teacher_id || "guest";
    try {
      const res = await lessonApi.answer(lessonId, {
        student_id: creatorId,
        answers,
      });
      setResult(res.data);
      setSubmitted(true);
    } catch (err) {
      toast.error(err.response?.data?.error || "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}>
        <Zap size={24} className="text-brand-500" />
      </motion.div>
    </div>
  );

  if (!questions.length) return (
    <div className="text-center py-20">
      <p className="text-ink-500 font-body">No diagnostic questions available yet.</p>
      <button onClick={() => navigate(-1)} className="btn-ghost mt-4">← Go back</button>
    </div>
  );

  /* ── Results screen ── */
  if (submitted && result) {
    const pass = result.outcome === "pass";
    return (
      <div className="max-w-lg mx-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="card text-center space-y-6 py-10"
        >
          <div className="relative inline-flex">
            <ProgressRing pct={result.percentage || 0} size={110} />
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="font-display text-2xl font-semibold text-ink-100">
                {result.percentage?.toFixed(0)}%
              </p>
            </div>
          </div>

          <div>
            <p className="font-display text-2xl font-semibold text-ink-100 mb-1">
              {pass ? "Well done! 🎉" : "Keep going! 💪"}
            </p>
            <p className="text-sm text-ink-400 font-body max-w-xs mx-auto">{result.message}</p>
          </div>

          <div className="flex items-center justify-center gap-3">
            <span className={clsx("badge text-sm px-3 py-1", pass ? "badge-green" : "badge-gold")}>
              {result.score}/5 correct
            </span>
            <span className="badge-muted text-sm px-3 py-1">
              Threshold: 80%
            </span>
          </div>

          {result.weak_competencies?.length > 0 && (
            <div className="text-left px-4">
              <p className="text-xs text-ink-500 font-body uppercase tracking-wide mb-2">Areas to review</p>
              <div className="flex flex-wrap gap-2">
                {result.weak_competencies.map((c) => (
                  <span key={c} className="badge bg-gold-500/10 text-gold-400 border-gold-500/20">{c.replace(/_/g," ")}</span>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3 justify-center pt-2">
            {!pass && (
              <button onClick={() => { setSubmitted(false); setAnswers({}); setCurrent(0); }} className="btn-ghost">
                <RotateCcw size={15} /> Retry Lesson
              </button>
            )}
            <button onClick={() => navigate(`/lesson/${lessonId}`)} className="btn-primary">
              {pass ? <><Trophy size={15} /> View Lesson</> : <><ArrowRight size={15} /> Back to Lesson</>}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  const q = questions[current];
  const answered = answers[q?.question_id];
  const progress = ((current) / questions.length) * 100;

  /* ── Question screen ── */
  return (
    <div className="max-w-xl mx-auto space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between mb-2">
          <h1 className="font-display text-2xl font-semibold text-ink-100">Diagnostic</h1>
          <span className="font-mono text-sm text-ink-500">{current + 1} / {questions.length}</span>
        </div>
        {/* Progress bar */}
        <div className="h-1.5 bg-ink-800 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-brand-600 to-brand-400 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>
        <p className="text-xs text-ink-600 font-body mt-1">
          CBC competency: <span className="text-ink-400">{q?.competency_tag?.replace(/_/g," ")}</span>
        </p>
      </motion.div>

      {/* Question card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={current}
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -30 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="card space-y-5"
        >
          <p className="font-body text-lg font-medium text-ink-100 leading-relaxed">
            {q?.question_text}
          </p>

          <div className="space-y-2.5">
            {q?.options?.map((opt, i) => {
              const letter = CHOICES[i];
              const isSelected = answered === letter;
              return (
                <motion.button
                  key={letter}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: revealed ? 1 : 0, x: revealed ? 0 : 20 }}
                  transition={{ delay: i * 0.06, duration: 0.3 }}
                  whileHover={{ x: 4 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => selectAnswer(letter)}
                  className={clsx(
                    "w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border text-left transition-all duration-200",
                    isSelected
                      ? "border-brand-500/60 bg-brand-500/12 text-ink-100"
                      : "border-[var(--border)] glass text-ink-300 hover:border-ink-600 hover:text-ink-100"
                  )}
                >
                  <span className={clsx(
                    "w-7 h-7 rounded-lg border flex items-center justify-center flex-shrink-0 text-xs font-mono font-semibold transition-all",
                    isSelected
                      ? "border-brand-500 bg-brand-500 text-white"
                      : "border-ink-700 text-ink-500"
                  )}>
                    {letter}
                  </span>
                  <span className="text-sm font-body">{opt}</span>
                  {isSelected && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="ml-auto"
                    >
                      <CheckCircle2 size={16} className="text-brand-400" />
                    </motion.div>
                  )}
                </motion.button>
              );
            })}
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setCurrent((c) => Math.max(0, c - 1))}
          disabled={current === 0}
          className="btn-ghost disabled:opacity-30"
        >
          ← Back
        </button>
        <motion.button
          whileHover={{ scale: canAdvance() ? 1.02 : 1 }}
          whileTap={{ scale: 0.98 }}
          onClick={next}
          disabled={!canAdvance() || submitting}
          className="btn-primary disabled:opacity-40"
        >
          {submitting ? (
            <><motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full" /> Scoring…</>
          ) : current === questions.length - 1 ? (
            <>Submit <CheckCircle2 size={15} /></>
          ) : (
            <>Next <ArrowRight size={15} /></>
          )}
        </motion.button>
      </div>
    </div>
  );
}
