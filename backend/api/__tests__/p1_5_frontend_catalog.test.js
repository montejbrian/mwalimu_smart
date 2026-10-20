import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_SRC = path.resolve(__dirname, "../../../frontend/src");

describe("P1.5 — Student Home & Curriculum Browse UI", () => {
  it("defines MasteryBadge, LevelCard, StrandList, HomePage, and BrowsePage", () => {
    const requiredFiles = [
      "components/catalog/MasteryBadge.jsx",
      "components/catalog/LevelCard.jsx",
      "components/catalog/StrandList.jsx",
      "pages/HomePage.jsx",
      "pages/BrowsePage.jsx",
      "lib/store.js",
      "lib/api.js",
    ];
    for (const rel of requiredFiles) {
      const fullPath = path.join(FRONTEND_SRC, rel);
      expect(fs.existsSync(fullPath)).toBe(true);
    }
  });

  it("MasteryBadge supports only non-punitive formative badges (new, in_progress, mastered, review_recommended) in EN and SW", () => {
    const src = fs.readFileSync(
      path.join(FRONTEND_SRC, "components/catalog/MasteryBadge.jsx"),
      "utf8"
    );
    expect(src).toContain("new:");
    expect(src).toContain("in_progress:");
    expect(src).toContain("mastered:");
    expect(src).toContain("review_recommended:");
    expect(src.toLowerCase()).not.toContain('"failed"');
  });

  it("LevelCard scopes strictly to Pre-Primary, Primary, Junior Secondary, Senior Secondary (no University or Tertiary)", () => {
    const levelSrc = fs.readFileSync(
      path.join(FRONTEND_SRC, "components/catalog/LevelCard.jsx"),
      "utf8"
    );
    expect(levelSrc).toContain("Pre-Primary");
    expect(levelSrc).toContain("Primary");
    expect(levelSrc).toContain("Junior Secondary");
    expect(levelSrc).toContain("Senior Secondary");
    expect(levelSrc).not.toMatch(/University|Tertiary/i);
  });

  it("HomePage and BrowsePage never expose a student lesson-generation button or University/Tertiary option", () => {
    const homeSrc = fs.readFileSync(
      path.join(FRONTEND_SRC, "pages/HomePage.jsx"),
      "utf8"
    );
    const browseSrc = fs.readFileSync(
      path.join(FRONTEND_SRC, "pages/BrowsePage.jsx"),
      "utf8"
    );
    expect(homeSrc).not.toMatch(/Generate a lesson|Generate Lesson/i);
    expect(browseSrc).not.toMatch(/Generate a lesson|Generate Lesson/i);
    expect(homeSrc).not.toMatch(/University|Tertiary/i);
    expect(browseSrc).not.toMatch(/University|Tertiary/i);
  });

  it("Layout includes a one-tap EN/SW language toggle and App mounts /, /browse, and /browse/:grade/:subject", () => {
    const layoutSrc = fs.readFileSync(
      path.join(FRONTEND_SRC, "components/layout/Layout.jsx"),
      "utf8"
    );
    const appSrc = fs.readFileSync(
      path.join(FRONTEND_SRC, "App.jsx"),
      "utf8"
    );
    expect(layoutSrc).toContain('data-testid="lang-toggle"');
    expect(appSrc).toContain('path="browse"');
    expect(appSrc).toContain('path="browse/:grade/:subject"');
  });
});
