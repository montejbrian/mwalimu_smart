import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  Send,
  RotateCcw,
  CheckCircle2,
  Circle,
  Lightbulb,
  ArrowRight,
  TrendingUp,
  AlertCircle,
} from "lucide-react";
import clsx from "clsx";
import api from "../../lib/api.js";
import MasteryBadge from "../catalog/MasteryBadge.jsx";
import {
  masteryBadgeFromScore,
  progressLabel,
  progressPercent,
  allAnswered,
  buildAnswersPayload,
  formatPercent,
  formatDelta,
  correctCount,
  recommendationCopy,
  recommendationHref,
} from "../../lib/assessment.js";

// Re-exported for backwards compatibility with earlier imports.
export { masteryBadgeFromScore };

const T = {
  title: { en: "Check your understanding", sw: "Jipime uelewa wako" },
  subtitle: {
    en: "Answer all questions, then see explanations. This records your mastery — it never locks you out of anything.",
    sw: "Jibu maswali yote, kisha uone maelezo. Hii inarekodi umahiri wako — haikuzuii chochote.",
  },
  question: { en: "Question", sw: "Swali" },
  prev: { en: "Previous", sw: "Iliyotangulia" },
  next: { en: "Next", sw: "Inayofuata" },
  submit: { en: "See my results", sw: "Ona matokeo yangu" },
  submitting: { en: "Checking…", sw: "Inakagua…" },
  unanswered: {
    en: (n) => `${n} question${n === 1 ? "" : "s"} still unanswered`,
    sw: (n) => `Maswali ${n} bado hayajajibiwa`,
  },
  error: {
    en: "We couldn't record your answers. Your choices are saved — please try again.",
    sw: "Hatukuweza kurekodi majibu yako. Chaguo zako zimehifadhiwa — tafadhali jaribu tena.",
  },
  resultsTitle: { en: "Your results", sw: "Matokeo yako" },
  correctOf: {
    en: (c, t) => `${c} of ${t} correct`,
    sw: (c, t) => `${c} kati ya ${t} sahihi`,
  },
  masteryLabel: { en: "Sub-strand mastery", sw: "Umahiri wa mada ndogo" },
  masteryFirst: { en: "first attempt", sw: "jaribio la kwanza" },
  masteryPts: { en: "pts", sw: "alama" },
  yourAnswer: { en: "Your answer", sw: "Jibu lako" },
  correctAnswer: { en: "Correct answer", sw: "Jibu sahihi" },
  notAnswered: { en: "Not answered", sw: "Halikujibiwa" },
  explanation: { en: "Why", sw: "Kwa nini" },
  retake: { en: "Practice again", sw: "Jaribu tena" },
  empty: {
    en: "Understanding-check questions will appear here once this lesson is published.",
    sw: "Maswali ya kujipima yataonekana hapa somo likichapishwa.",
  },
};

function t(key, lang) {
  return T[key][lang === "sw" ? "sw" : "en"];
}

function OptionLetter({ idx, tone = "neutral" }) {
  return (
    <span
      className={clsx(
        "w-6 h-6 rounded-lg font-mono text-[11px] flex items-center justify-center flex-shrink-0",
        tone === "correct" && "bg-brand-500 text-white",
        tone === "chosen" && "bg-gold-500/25 text-gold-300",
        tone === "selected" && "bg-brand-500/30 text-brand-300",
        tone === "neutral" && "bg-white/[0.06] text-ink-300"
      )}
    >
      {String.fromCharCode(65 + idx)}
    </span>
  );
}

function ResultsView({ result, questions, lang, lessonId, onRetake }) {
  const navigate = useNavigate();
  const perById = useMemo(
    () => new Map((result.per_question || []).map((p) => [p.id, p])),
    [result]
  );
  const total = result.per_question?.length || questions.length;
  const correct = correctCount(result.per_question);
  const mastery = result.mastery || {};
  const badge = mastery.badge || masteryBadgeFromScore(mastery.mastery_score);
  const isFirst = mastery.previous_mastery_score === null || mastery.previous_mastery_score === undefined;
  const delta = formatDelta(mastery.delta);
  const rec = result.recommendation || { type: "done" };
  const copy = recommendationCopy(rec.type, lang);

  return (
    <div className="space-y-5" data-testid="assessment-results">
      {/* Score + mastery summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-2xl bg-white/[0.02] border border-[var(--border)] p-4">
          <p className="text-[11px] uppercase tracking-wider text-ink-500 font-body">
            {t("resultsTitle", lang)}
          </p>
          <p
            className="font-display text-3xl font-semibold text-ink-100 mt-1"
            data-testid="assessment-score"
          >
            {formatPercent(result.score)}
          </p>
          <p className="text-xs text-ink-400 font-body mt-0.5">
            {t("correctOf", lang)(correct, total)}
          </p>
        </div>

        <div className="rounded-2xl bg-white/[0.02] border border-[var(--border)] p-4">
          <p className="text-[11px] uppercase tracking-wider text-ink-500 font-body">
            {t("masteryLabel", lang)}
          </p>
          <div className="flex items-center gap-2.5 mt-1.5">
            <span className="font-display text-2xl font-semibold text-ink-100">
              {formatPercent(mastery.mastery_score)}
            </span>
            <MasteryBadge badge={badge} lang={lang} />
          </div>
          <p
            className="text-xs text-ink-400 font-body mt-1 inline-flex items-center gap-1"
            data-testid="mastery-delta"
          >
            <TrendingUp size={12} className="text-brand-400" />
            {isFirst ? t("masteryFirst", lang) : `${delta} ${t("masteryPts", lang)}`}
          </p>
        </div>
      </div>

      {/* Recommendation card */}
      <div
        data-testid={`recommendation-card-${rec.type}`}
        className={clsx(
          "rounded-2xl p-4 border flex flex-col sm:flex-row sm:items-center justify-between gap-3",
          rec.type === "review"
            ? "bg-gold-500/10 border-gold-500/30"
            : "bg-brand-500/10 border-brand-500/30"
        )}
      >
        <div className="space-y-0.5">
          <p className="font-display text-sm font-semibold text-ink-100">{copy.title}</p>
          <p className="text-xs text-ink-300 font-body leading-relaxed">{copy.body}</p>
        </div>
        <button
          type="button"
          data-testid="recommendation-cta"
          onClick={() => navigate(recommendationHref(rec, lessonId))}
          className="btn-primary text-xs flex-shrink-0"
        >
          <span>{copy.cta}</span>
          <ArrowRight size={13} />
        </button>
      </div>

      {/* Per-question explanations */}
      <ol className="space-y-3" data-testid="assessment-explanations">
        {questions.map((q, qIdx) => {
          const fb = perById.get(q.id);
          const chosen = fb?.chosen ?? null;
          return (
            <li
              key={q.id}
              data-testid={`result-question-${qIdx}`}
              className="rounded-2xl bg-white/[0.02] border border-[var(--border)] p-4 space-y-3"
            >
              <div className="flex items-start gap-2.5">
                {fb?.correct ? (
                  <CheckCircle2 size={16} className="text-brand-400 mt-0.5 flex-shrink-0" />
                ) : (
                  <Circle size={16} className="text-gold-400 mt-0.5 flex-shrink-0" />
                )}
                <p className="font-body text-sm font-medium text-ink-100">
                  <span className="text-ink-500 font-mono mr-1.5">{qIdx + 1}.</span>
                  {q.question}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-6">
                {(q.options || []).map((opt, optIdx) => {
                  const isCorrect = fb && optIdx === fb.correct_index;
                  const isChosenWrong = chosen === optIdx && !isCorrect;
                  return (
                    <div
                      key={optIdx}
                      className={clsx(
                        "px-3 py-2 rounded-xl text-xs font-body border flex items-center gap-2",
                        isCorrect && "bg-brand-500/10 border-brand-500/40 text-ink-100",
                        isChosenWrong && "bg-gold-500/10 border-gold-500/30 text-ink-200",
                        !isCorrect && !isChosenWrong && "border-[var(--border)] text-ink-400"
                      )}
                    >
                      <OptionLetter
                        idx={optIdx}
                        tone={isCorrect ? "correct" : isChosenWrong ? "chosen" : "neutral"}
                      />
                      <span className="flex-1">{opt}</span>
                      {isCorrect && (
                        <span className="text-[10px] text-brand-400 whitespace-nowrap">
                          {t("correctAnswer", lang)}
                        </span>
                      )}
                      {isChosenWrong && (
                        <span className="text-[10px] text-gold-400 whitespace-nowrap">
                          {t("yourAnswer", lang)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {chosen === null && (
                <p className="pl-6 text-[11px] text-ink-500 font-body">{t("notAnswered", lang)}</p>
              )}

              {fb?.explanation && (
                <div className="ml-6 rounded-xl bg-brand-500/[0.06] border border-brand-500/20 px-3.5 py-2.5 flex items-start gap-2">
                  <Lightbulb size={13} className="text-brand-400 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-ink-200 font-body leading-relaxed">
                    <span className="font-semibold text-brand-400 mr-1">{t("explanation", lang)}:</span>
                    {fb.explanation}
                  </p>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <div className="flex justify-end">
        <button
          type="button"
          data-testid="retake-assessment-btn"
          onClick={onRetake}
          className="btn-ghost text-xs"
        >
          <RotateCcw size={13} />
          <span>{t("retake", lang)}</span>
        </button>
      </div>
    </div>
  );
}

export default function AssessmentBlock({ lessonId, questions = [], lang = "en", onSubmitted }) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  if (!questions || questions.length === 0) {
    return (
      <div
        className="card border border-[var(--border)] text-xs text-ink-400 font-body"
        data-testid="assessment-empty"
      >
        {t("empty", lang)}
      </div>
    );
  }

  const total = questions.length;
  const current = questions[Math.min(index, total - 1)];
  const isLast = index >= total - 1;
  const ready = allAnswered(questions, selected);
  const remaining = questions.filter((q) => !Number.isInteger(selected[q.id])).length;

  function choose(optIdx) {
    setSelected((prev) => ({ ...prev, [current.id]: optIdx }));
  }

  async function handleSubmit() {
    if (!ready || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.post(
        `/progress/${lessonId}/assessment`,
        buildAnswersPayload(questions, selected, lang)
      );
      setResult(res.data);
      onSubmitted?.(res.data);
    } catch {
      setError(t("error", lang));
    } finally {
      setSubmitting(false);
    }
  }

  function handleRetake() {
    setSelected({});
    setResult(null);
    setError(null);
    setIndex(0);
  }

  return (
    <section className="card space-y-5 border border-[var(--border)]" data-testid="assessment-block">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-0.5 max-w-xl">
          <h3 className="font-display text-base font-semibold text-ink-100 flex items-center gap-2">
            <HelpCircle size={17} className="text-brand-400" />
            <span>{t("title", lang)}</span>
          </h3>
          <p className="text-xs text-ink-400 font-body">{t("subtitle", lang)}</p>
        </div>
        {!result && (
          <span className="badge-muted text-xs" data-testid="assessment-progress-label">
            {t("question", lang)} {progressLabel(index, total, lang)}
          </span>
        )}
      </div>

      {result ? (
        <ResultsView
          result={result}
          questions={questions}
          lang={lang}
          lessonId={lessonId}
          onRetake={handleRetake}
        />
      ) : (
        <div className="space-y-4">
          {/* Progress bar + step dots */}
          <div className="space-y-2">
            <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className="h-full bg-brand-500 transition-all duration-300"
                style={{ width: `${progressPercent(index, total)}%` }}
              />
            </div>
            <div className="flex gap-1.5" data-testid="assessment-step-dots">
              {questions.map((q, i) => (
                <button
                  key={q.id}
                  type="button"
                  aria-label={`${t("question", lang)} ${i + 1}`}
                  onClick={() => setIndex(i)}
                  className={clsx(
                    "h-2 rounded-full transition-all",
                    i === index ? "w-6 bg-brand-400" : "w-2",
                    i !== index && Number.isInteger(selected[q.id]) && "bg-brand-500/60",
                    i !== index && !Number.isInteger(selected[q.id]) && "bg-white/[0.12]"
                  )}
                />
              ))}
            </div>
          </div>

          {/* Current question (one at a time; no per-answer feedback) */}
          <div
            key={current.id}
            data-testid={`assessment-question-${index}`}
            className="rounded-2xl bg-white/[0.02] border border-[var(--border)] p-4 space-y-3"
          >
            <p className="font-body text-sm font-medium text-ink-100">{current.question}</p>
            <div className="grid grid-cols-1 gap-2" role="radiogroup">
              {(current.options || []).map((opt, optIdx) => {
                const isChosen = selected[current.id] === optIdx;
                return (
                  <button
                    key={optIdx}
                    type="button"
                    role="radio"
                    aria-checked={isChosen}
                    data-testid={`question-${index}-option-${optIdx}`}
                    onClick={() => choose(optIdx)}
                    className={clsx(
                      "text-left px-3.5 py-3 rounded-xl text-sm font-body transition-all border flex items-center gap-3",
                      isChosen
                        ? "glass-active border-brand-500/50 text-ink-100"
                        : "glass border-[var(--border)] text-ink-300 hover:border-brand-500/30 hover:text-ink-100"
                    )}
                  >
                    <OptionLetter idx={optIdx} tone={isChosen ? "selected" : "neutral"} />
                    <span className="flex-1">{opt}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {error && (
            <div
              data-testid="assessment-error"
              className="rounded-xl bg-gold-500/10 border border-gold-500/30 px-3.5 py-2.5 text-xs text-gold-300 font-body flex items-center gap-2"
            >
              <AlertCircle size={14} className="flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Navigation */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              data-testid="assessment-prev-btn"
              disabled={index === 0}
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              className="btn-ghost text-xs disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={14} />
              <span>{t("prev", lang)}</span>
            </button>

            {isLast ? (
              <div className="flex items-center gap-3">
                {!ready && (
                  <span className="text-[11px] text-ink-500 font-body">
                    {t("unanswered", lang)(remaining)}
                  </span>
                )}
                <button
                  type="button"
                  data-testid="submit-assessment-btn"
                  disabled={!ready || submitting}
                  onClick={handleSubmit}
                  className="btn-primary text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Send size={13} />
                  <span>{submitting ? t("submitting", lang) : t("submit", lang)}</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                data-testid="assessment-next-btn"
                onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}
                className="btn-primary text-xs"
              >
                <span>{t("next", lang)}</span>
                <ChevronRight size={14} />
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
