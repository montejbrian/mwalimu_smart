/**
 * Tests for Tier 1 Visual Templates (Phase 3.2)
 * Verifies template component contracts and SVG markup attributes.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("P3.2 — Visual Templates Source Contracts", () => {
  const templates = [
    { file: "EquationBalance.jsx", testId: "visual-equation-balance", keyTerms: ["svg", "Scale", "beamAngle", "steps"] },
    { file: "NumberLine.jsx", testId: "visual-number-line", keyTerms: ["svg", "line", "ticks", "highlights"] },
    { file: "FractionBar.jsx", testId: "visual-fraction-bar", keyTerms: ["svg", "rect", "numerator", "denominator"] },
    { file: "Flowchart.jsx", testId: "visual-flowchart", keyTerms: ["svg", "nodes", "edges", "flow-arrow"] },
    { file: "GraphPlot.jsx", testId: "visual-graph-plot", keyTerms: ["svg", "line", "originX", "originY"] },
  ];

  for (const t of templates) {
    it(`template ${t.file} exists, exports default component, and defines valid SVG structures`, () => {
      const fullPath = path.join(__dirname, t.file);
      assert.ok(fs.existsSync(fullPath), `File ${t.file} must exist`);

      const content = fs.readFileSync(fullPath, "utf8");
      assert.ok(content.includes("export default function"), `${t.file} must export default function`);
      assert.ok(content.includes(t.testId), `${t.file} must have data-testid="${t.testId}"`);

      for (const term of t.keyTerms) {
        assert.ok(content.includes(term), `${t.file} must contain term ${term}`);
      }
    });
  }

  it("VisualRenderer maps all 5 template IDs to their respective components", () => {
    const rendererPath = path.resolve(__dirname, "../VisualRenderer.jsx");
    assert.ok(fs.existsSync(rendererPath), "VisualRenderer.jsx must exist");

    const content = fs.readFileSync(rendererPath, "utf8");
    assert.ok(content.includes("equation_balance: EquationBalance"));
    assert.ok(content.includes("number_line: NumberLine"));
    assert.ok(content.includes("fraction_bar: FractionBar"));
    assert.ok(content.includes("flowchart: Flowchart"));
    assert.ok(content.includes("graph_plot: GraphPlot"));
    assert.ok(content.includes("visual-container"));
  });
});
