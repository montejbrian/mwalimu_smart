import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_SRC = path.resolve(__dirname, "../../../frontend/src");

describe("P1.6 — Lesson Player UI (Watch / Read / Notes / Assessment / FollowUp)", () => {
  it("defines LessonPlayerPage, AssessmentPage, WatchTab, ReadTab, NotesTab, AssessmentBlock, and FollowUpPanel", () => {
    const required = [
      "pages/LessonPlayerPage.jsx",
      "pages/AssessmentPage.jsx",
      "components/lesson/WatchTab.jsx",
      "components/lesson/ReadTab.jsx",
      "components/lesson/NotesTab.jsx",
      "components/lesson/AssessmentBlock.jsx",
      "components/lesson/FollowUpPanel.jsx",
    ];
    for (const rel of required) {
      expect(fs.existsSync(path.join(FRONTEND_SRC, rel))).toBe(true);
    }
  });

  it("LessonPlayerPage defaults to ReadTab when video_url is null, polls assets every 15s, and displays breadcrumb + transcript download", () => {
    const playerSrc = fs.readFileSync(
      path.join(FRONTEND_SRC, "pages/LessonPlayerPage.jsx"),
      "utf8"
    );
    expect(playerSrc).toContain('return assets?.video_url ? "watch" : "read"');
    expect(playerSrc).toContain("15000");
    expect(playerSrc).toContain("pollAssets(lessonId)");
    expect(playerSrc).toContain('data-testid="lesson-breadcrumb"');
    expect(playerSrc).toContain('data-testid="download-transcript-btn"');
    expect(playerSrc).toContain('data-testid="video-preparing-banner"');
    expect(playerSrc).not.toContain("PipelineBar");
  });

  it("AssessmentBlock and AssessmentPage are formative with no 80% pass gate or punitive failure copy", () => {
    const assessBlockSrc = fs.readFileSync(
      path.join(FRONTEND_SRC, "components/lesson/AssessmentBlock.jsx"),
      "utf8"
    );
    const assessPageSrc = fs.readFileSync(
      path.join(FRONTEND_SRC, "pages/AssessmentPage.jsx"),
      "utf8"
    );
    expect(assessBlockSrc).not.toMatch(/80% CBC pass|pass threshold/i);
    expect(assessPageSrc).not.toMatch(/80% CBC pass|pass threshold/i);
    expect(assessBlockSrc).toContain('data-testid="assessment-block"');
  });

  it("App mounts /lesson/:lesson_id -> LessonPlayerPage and /lesson/:lesson_id/assess -> AssessmentPage", () => {
    const appSrc = fs.readFileSync(path.join(FRONTEND_SRC, "App.jsx"), "utf8");
    expect(appSrc).toContain('path="lesson/:lesson_id"');
    expect(appSrc).toContain("LessonPlayerPage");
    expect(appSrc).toContain('path="lesson/:lesson_id/assess"');
    expect(appSrc).toContain("AssessmentPage");
  });
});
