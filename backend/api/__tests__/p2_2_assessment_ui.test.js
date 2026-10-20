import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
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
} from "../../../frontend/src/lib/assessment.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_SRC = path.resolve(__dirname, "../../../frontend/src");

describe("P2.2 — Assessment UI & Helpers (frontend/src/lib/assessment.js)", () => {
  it("masteryBadgeFromScore maps score thresholds strictly to formative badges", () => {
    expect(masteryBadgeFromScore(null)).toBe("new");
    expect(masteryBadgeFromScore(undefined)).toBe("new");
    expect(masteryBadgeFromScore(0.8)).toBe("mastered");
    expect(masteryBadgeFromScore(1.0)).toBe("mastered");
    expect(masteryBadgeFromScore(0.79)).toBe("in_progress");
    expect(masteryBadgeFromScore(0.5)).toBe("in_progress");
    expect(masteryBadgeFromScore(0.49)).toBe("review_recommended");
    expect(masteryBadgeFromScore(0)).toBe("review_recommended");
  });

  it("progressLabel formats 1-based index in EN and SW", () => {
    expect(progressLabel(1, 5, "en")).toBe("2 of 5");
    expect(progressLabel(1, 5, "sw")).toBe("2 kati ya 5");
    expect(progressLabel(0, 3, "en")).toBe("1 of 3");
  });

  it("progressPercent calculates percent correctly", () => {
    expect(progressPercent(0, 5)).toBe(20);
    expect(progressPercent(1, 5)).toBe(40);
    expect(progressPercent(4, 5)).toBe(100);
    expect(progressPercent(0, 0)).toBe(0);
  });

  it("allAnswered verifies all questions have chosen option index", () => {
    const questions = [{ id: "q1" }, { id: "q2" }];
    expect(allAnswered(questions, {})).toBe(false);
    expect(allAnswered(questions, { q1: 0 })).toBe(false);
    expect(allAnswered(questions, { q1: 0, q2: 2 })).toBe(true);
  });

  it("buildAnswersPayload builds correct server payload without client score or mastery", () => {
    const questions = [{ id: "q1" }, { id: "q2" }];
    const selected = { q1: 1, q2: 3 };
    const payload = buildAnswersPayload(questions, selected, "sw");
    expect(payload).toEqual({
      answers: [
        { question_id: "q1", chosen_index: 1 },
        { question_id: "q2", chosen_index: 3 },
      ],
      lang: "sw",
    });
    expect(payload.score).toBeUndefined();
    expect(payload.mastery).toBeUndefined();
  });

  it("formatPercent and formatDelta format numeric values cleanly", () => {
    expect(formatPercent(0.85)).toBe("85%");
    expect(formatPercent(null)).toBe("—");
    expect(formatDelta(0.2)).toBe("+20");
    expect(formatDelta(-0.07)).toBe("−7");
    expect(formatDelta(0)).toBe("±0");
    expect(formatDelta(null)).toBe("");
  });

  it("correctCount sums correct items", () => {
    expect(correctCount([{ correct: true }, { correct: false }, { correct: true }])).toBe(2);
    expect(correctCount([])).toBe(0);
  });

  it("recommendationCopy provides formative non-punitive messaging in EN and SW", () => {
    const revEn = recommendationCopy("review", "en");
    expect(revEn.title).toBe("Review recommended");
    expect(revEn.body).not.toMatch(/failed|fail|pass mark/i);
    expect(revEn.cta).toBe("Review this lesson");

    const revSw = recommendationCopy("review", "sw");
    expect(revSw.title).toBe("Inapendekezwa kurudia");

    const nextEn = recommendationCopy("next", "en");
    expect(nextEn.title).toBe("Ready for the next topic");
    expect(nextEn.cta).toBe("Go to next lesson");
  });

  it("recommendationHref generates appropriate navigation targets", () => {
    expect(recommendationHref({ type: "review", lesson_id: "lesson-1" }, "current")).toBe("/lesson/lesson-1");
    expect(recommendationHref({ type: "review" }, "current-lesson")).toBe("/lesson/current-lesson");
    expect(recommendationHref({ type: "next", lesson_id: "lesson-2" }, "current")).toBe("/lesson/lesson-2");
    expect(recommendationHref({ type: "next", lesson_id: null }, "current")).toBe("/browse");
    expect(recommendationHref({ type: "done" }, "current")).toBe("/browse");
  });

  it("AssessmentBlock and AssessmentPage contain formative elements and no punitive language", () => {
    const blockSrc = fs.readFileSync(
      path.join(FRONTEND_SRC, "components/lesson/AssessmentBlock.jsx"),
      "utf8"
    );
    const pageSrc = fs.readFileSync(
      path.join(FRONTEND_SRC, "pages/AssessmentPage.jsx"),
      "utf8"
    );

    // No punitive copy
    expect(blockSrc).not.toMatch(/\bfailed\b|\bpass mark\b|\bpass threshold\b/i);
    expect(pageSrc).not.toMatch(/\bfailed\b|\bpass mark\b|\bpass threshold\b/i);

    // One at a time / progress elements
    expect(blockSrc).toContain('data-testid="assessment-progress-label"');
    expect(blockSrc).toContain('data-testid="assessment-step-dots"');
    expect(blockSrc).toContain('data-testid="assessment-prev-btn"');
    expect(blockSrc).toContain('data-testid="assessment-next-btn"');

    // Results screen elements
    expect(blockSrc).toContain('data-testid="assessment-results"');
    expect(blockSrc).toContain('data-testid="assessment-score"');
    expect(blockSrc).toContain('data-testid="mastery-delta"');
    expect(blockSrc).toContain('data-testid="recommendation-cta"');
    expect(blockSrc).toContain('data-testid="retake-assessment-btn"');
  });
});
