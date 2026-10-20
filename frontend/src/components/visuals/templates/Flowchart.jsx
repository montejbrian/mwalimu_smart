import React from "react";
import { GitFork } from "lucide-react";

/**
 * Flowchart SVG Template
 * Visualizes scientific experiments, procedures, cycles, or classification trees.
 *
 * @param {Object} props
 * @param {string} [props.title="Process Flowchart"]
 * @param {Array<{id: string, label: string, type?: "start"|"step"|"output"|"decision"}>} [props.nodes]
 * @param {Array<{from: string, to: string, label?: string}>} [props.edges]
 */
export default function Flowchart({
  title = "Process Flowchart",
  nodes = [
    { id: "1", label: "Muddy Water Mixture", type: "start" },
    { id: "2", label: "Pour into Filter Funnel", type: "step" },
    { id: "3", label: "Residue trapped on filter", type: "output" },
    { id: "4", label: "Clean filtrate in beaker", type: "output" },
  ],
  edges = [
    { from: "1", to: "2" },
    { from: "2", to: "3" },
    { from: "2", to: "4" },
  ],
}) {
  const nodeWidth = 150;
  const nodeHeight = 44;
  const svgWidth = 520;

  // Compute simple tiered coordinates:
  // If multiple outputs from node 2, arrange them side-by-side on tier 3
  const nodePositions = {};
  const tiers = {};

  // Group nodes by simple heuristic or sequence
  nodes.forEach((node, idx) => {
    let tier = idx;
    if (idx === 2 || idx === 3) tier = 2; // Split side-by-side for 3rd tier
    if (!tiers[tier]) tiers[tier] = [];
    tiers[tier].push(node);
  });

  Object.entries(tiers).forEach(([tierStr, tierNodes]) => {
    const tier = Number(tierStr);
    const count = tierNodes.length;
    const spacing = svgWidth / (count + 1);
    tierNodes.forEach((node, i) => {
      nodePositions[node.id] = {
        x: spacing * (i + 1) - nodeWidth / 2,
        y: tier * 75 + 20,
        centerX: spacing * (i + 1),
        centerY: tier * 75 + 20 + nodeHeight / 2,
      };
    });
  });

  const totalHeight = Math.max(220, Object.keys(tiers).length * 80 + 30);

  const getNodeColors = (type) => {
    switch (type) {
      case "start":
        return { bg: "#064e3b", border: "#10b981", text: "#6ee7b7" };
      case "output":
        return { bg: "#3b0764", border: "#a855f7", text: "#e9d5ff" };
      case "decision":
        return { bg: "#78350f", border: "#f59e0b", text: "#fde68a" };
      case "step":
      default:
        return { bg: "#0c4a6e", border: "#0284c7", text: "#7dd3fc" };
    }
  };

  return (
    <div
      data-testid="visual-flowchart"
      className="my-3 p-4 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 shadow-md max-w-xl mx-auto"
    >
      <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
        <div className="flex items-center gap-2">
          <GitFork className="w-5 h-5 text-purple-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            {title || "Process Flowchart"}
          </span>
        </div>
        <span className="text-xs font-mono text-slate-400">{nodes.length} steps</span>
      </div>

      <div className="w-full flex justify-center py-2">
        <svg
          viewBox={`0 0 ${svgWidth} ${totalHeight}`}
          className="w-full max-w-lg h-auto select-none overflow-visible"
          aria-label={title}
        >
          <defs>
            <marker
              id="flow-arrow"
              markerWidth="7"
              markerHeight="7"
              refX="6"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0,0 7,3.5 0,7" fill="#94a3b8" />
            </marker>
          </defs>

          {/* Edges */}
          {edges.map((edge, idx) => {
            const fromPos = nodePositions[edge.from];
            const toPos = nodePositions[edge.to];
            if (!fromPos || !toPos) return null;

            return (
              <g key={`edge-${idx}`}>
                <path
                  d={`M ${fromPos.centerX} ${fromPos.y + nodeHeight} C ${fromPos.centerX} ${
                    (fromPos.y + toPos.y) / 2
                  }, ${toPos.centerX} ${(fromPos.y + toPos.y) / 2}, ${toPos.centerX} ${toPos.y - 4}`}
                  fill="none"
                  stroke="#64748b"
                  strokeWidth="2"
                  markerEnd="url(#flow-arrow)"
                />
                {edge.label && (
                  <text
                    x={(fromPos.centerX + toPos.centerX) / 2}
                    y={(fromPos.y + toPos.y) / 2}
                    fill="#94a3b8"
                    textAnchor="middle"
                    className="text-[10px] font-mono"
                  >
                    {edge.label}
                  </text>
                )}
              </g>
            );
          })}

          {/* Nodes */}
          {nodes.map((node) => {
            const pos = nodePositions[node.id];
            if (!pos) return null;
            const colors = getNodeColors(node.type);

            return (
              <g key={`node-${node.id}`}>
                <rect
                  x={pos.x}
                  y={pos.y}
                  width={nodeWidth}
                  height={nodeHeight}
                  rx="8"
                  fill={colors.bg}
                  stroke={colors.border}
                  strokeWidth="2"
                  className="shadow-sm"
                />
                <text
                  x={pos.centerX}
                  y={pos.centerY + 4}
                  textAnchor="middle"
                  fill={colors.text}
                  className="font-medium text-xs pointer-events-none"
                  style={{ fontSize: "11px" }}
                >
                  {node.label.length > 22 ? `${node.label.slice(0, 20)}…` : node.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
