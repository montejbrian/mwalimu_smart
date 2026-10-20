import React from "react";
import EquationBalance from "./templates/EquationBalance.jsx";
import NumberLine from "./templates/NumberLine.jsx";
import FractionBar from "./templates/FractionBar.jsx";
import Flowchart from "./templates/Flowchart.jsx";
import GraphPlot from "./templates/GraphPlot.jsx";
import Whiteboard from "./Whiteboard.jsx";

const TEMPLATE_COMPONENTS = {
  equation_balance: EquationBalance,
  number_line: NumberLine,
  fraction_bar: FractionBar,
  flowchart: Flowchart,
  graph_plot: GraphPlot,
  whiteboard: Whiteboard,
};

/**
 * VisualRenderer
 * Dynamically selects and renders a Tier 1 SVG visual template.
 *
 * @param {Object} props
 * @param {Object} [props.visualSpec] - Full visual specification object { tier: 1, template_id, params }
 * @param {string} [props.template_id] - Template identifier
 * @param {Object} [props.params] - Template parameter map
 */
export default function VisualRenderer({ visualSpec, template_id, params }) {
  const spec = visualSpec || {};
  const activeTemplateId = template_id || spec.template_id;
  const activeParams = params || spec.params || {};

  if (!activeTemplateId) {
    return null;
  }

  const Component = TEMPLATE_COMPONENTS[activeTemplateId];

  if (!Component) {
    return (
      <div
        data-testid="visual-unsupported"
        className="my-2 p-3 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-400"
      >
        Visual template <code className="text-amber-400">{activeTemplateId}</code> is not supported.
      </div>
    );
  }

  const mergedParams =
    activeTemplateId === "whiteboard"
      ? {
          ops: spec.ops || activeParams.ops || [],
          title: spec.title || activeParams.title,
          ...activeParams,
        }
      : activeParams;

  return (
    <div data-testid="visual-container" className="my-2">
      <Component {...mergedParams} />
    </div>
  );
}

export {
  EquationBalance,
  NumberLine,
  FractionBar,
  Flowchart,
  GraphPlot,
  TEMPLATE_COMPONENTS,
};
