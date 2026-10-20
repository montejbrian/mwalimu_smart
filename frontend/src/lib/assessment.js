/**
 * MwalimuSmart — frontend/src/lib/assessment.js
 * Pure helpers for the formative assessment flow (P2.2).
 * No React / DOM imports so they can be unit-tested with node:test.
 *
 * Copy rule (AGENTS.md #3, docs/00): never "failed", "pass mark" or a red X.
 * Use "mastered" / "in progress" / "review recommended".
 */

export const MASTERED_THRESHOLD = 0.8;
export const REVIEW_THRESHOLD = 0.5;

export function masteryBadgeFromScore(score) {
  if (score === null || score === undefined || Number.isNaN(Number(score))) return "new";
  const n = Number(score);
  if (n >= MASTERED_THRESHOLD) return "mastered";
  if (n >= REVIEW_THRESHOLD) return "in_progress";
  return "review_recommended";
}

/** "2 of 5" / "2 kati ya 5" (1-based index). */
export function progressLabel(index, total, lang = "en") {
  const current = Math.min(Math.max(index + 1, 1), Math.max(total, 1));
  return lang === "sw" ? `${current} kati ya ${total}` : `${current} of ${total}`;
}

export function progressPercent(index, total) {
  if (!total) return 0;
  return Math.round(((index + 1) / total) * 100);
}

export function allAnswered(questions, selected) {
  return questions.length > 0 && questions.every((q) => Number.isInteger(selected[q.id]));
}

/** Payload for POST /api/progress/:id/assessment. Never includes score/mastery. */
export function buildAnswersPayload(questions, selected, lang = "en") {
  return {
    answers: questions
      .filter((q) => Number.isInteger(selected[q.id]))
      .map((q) => ({ question_id: q.id, chosen_index: selected[q.id] })),
    lang: lang === "sw" ? "sw" : "en",
  };
}

export function formatPercent(score) {
  if (score === null || score === undefined) return "—";
  return `${Math.round(Number(score) * 100)}%`;
}

/** Signed mastery delta in percentage points, e.g. "+20", "−7", "±0". */
export function formatDelta(delta) {
  if (delta === null || delta === undefined || Number.isNaN(Number(delta))) return "";
  const pts = Math.round(Number(delta) * 100);
  if (pts > 0) return `+${pts}`;
  if (pts < 0) return `\u2212${Math.abs(pts)}`;
  return "\u00b10";
}

export function correctCount(perQuestion = []) {
  return perQuestion.filter((q) => q.correct).length;
}

const RECOMMENDATION_COPY = {
  review: {
    en: {
      title: "Review recommended",
      body: "Revisit the lesson script and key concepts, then try the questions again whenever you're ready. You can also move on — nothing is locked.",
      cta: "Review this lesson",
    },
    sw: {
      title: "Inapendekezwa kurudia",
      body: "Rudia hati ya somo na dhana muhimu, kisha jaribu maswali tena ukiwa tayari. Unaweza pia kuendelea — hakuna kilichofungwa.",
      cta: "Rudia somo hili",
    },
  },
  next: {
    en: {
      title: "Ready for the next topic",
      body: "Great understanding of this sub-strand. Continue to the next topic in your curriculum.",
      cta: "Go to next lesson",
    },
    sw: {
      title: "Uko tayari kwa mada inayofuata",
      body: "Umeelewa vizuri mada hii ndogo. Endelea na mada inayofuata katika mtaala wako.",
      cta: "Nenda somo linalofuata",
    },
  },
  done: {
    en: {
      title: "Subject complete",
      body: "You've reached the end of this subject's sub-strands. Explore another subject or revisit any topic.",
      cta: "Browse curriculum",
    },
    sw: {
      title: "Umemaliza somo hili",
      body: "Umefika mwisho wa mada ndogo za somo hili. Chunguza somo jingine au rudia mada yoyote.",
      cta: "Vinjari mtaala",
    },
  },
};

export function recommendationCopy(type, lang = "en") {
  const entry = RECOMMENDATION_COPY[type] || RECOMMENDATION_COPY.done;
  return entry[lang === "sw" ? "sw" : "en"];
}

/**
 * Where the recommendation CTA should navigate.
 * Falls back to /browse when the next sub-strand has no published lesson yet.
 */
export function recommendationHref(recommendation, currentLessonId) {
  if (!recommendation) return "/browse";
  if (recommendation.type === "review") {
    return `/lesson/${recommendation.lesson_id || currentLessonId}`;
  }
  if (recommendation.type === "next" && recommendation.lesson_id) {
    return `/lesson/${recommendation.lesson_id}`;
  }
  return "/browse";
}
