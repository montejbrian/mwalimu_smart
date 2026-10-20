import React from "react";
import { ArrowLeftRight } from "lucide-react";

/**
 * NumberLine SVG Template
 * Visualizes integers, rational numbers, points, and distance intervals on a horizontal line.
 *
 * @param {Object} props
 * @param {number} [props.min=-5]
 * @param {number} [props.max=5]
 * @param {number} [props.step=1]
 * @param {Array<{value: number, label?: string, color?: string}>} [props.points]
 * @param {Array<{from: number, to: number, label?: string, color?: string}>} [props.highlights]
 */
export default function NumberLine({
  min = -5,
  max = 5,
  step = 1,
  points = [
    { value: -2, label: "-2", color: "#f59e0b" },
    { value: 3, label: "3", color: "#10b981" },
  ],
  highlights = [],
}) {
  const safeMin = Number(min) || -5;
  const safeMax = Math.max(Number(max) || 5, safeMin + 1);
  const safeStep = Math.max(Number(step) || 1, 0.5);

  const range = safeMax - safeMin;
  const svgWidth = 560;
  const paddingX = 40;
  const usableWidth = svgWidth - paddingX * 2;
  const axisY = 90;

  // Coordinate mapping helper
  const toX = (val) => {
    const clamped = Math.max(safeMin, Math.min(safeMax, val));
    return paddingX + ((clamped - safeMin) / range) * usableWidth;
  };

  // Generate tick marks
  const ticks = [];
  for (let val = safeMin; val <= safeMax; val += safeStep) {
    ticks.push(val);
  }

  return (
    <div
      data-testid="visual-number-line"
      className="my-3 p-4 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 shadow-md max-w-xl mx-auto"
    >
      <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
        <div className="flex items-center gap-2">
          <ArrowLeftRight className="w-5 h-5 text-sky-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Number Line
          </span>
        </div>
        <div className="text-xs text-slate-400">
          Range: <span className="text-slate-200 font-mono">[{safeMin}, {safeMax}]</span>
        </div>
      </div>

      <div className="w-full flex justify-center py-2">
        <svg
          viewBox="0 0 560 150"
          className="w-full max-w-lg h-auto select-none overflow-visible"
          aria-label={`Number line from ${safeMin} to ${safeMax}`}
        >
          <defs>
            <marker
              id="arrow-left"
              markerWidth="6"
              markerHeight="6"
              refX="1"
              refY="3"
              orient="auto"
            >
              <polygon points="6,0 0,3 6,6" fill="#64748b" />
            </marker>
            <marker
              id="arrow-right"
              markerWidth="6"
              markerHeight="6"
              refX="5"
              refY="3"
              orient="auto"
            >
              <polygon points="0,0 6,3 0,6" fill="#64748b" />
            </marker>
          </defs>

          {/* Highlights / Interval Bands */}
          {highlights.map((hl, idx) => {
            const x1 = toX(hl.from);
            const x2 = toX(hl.to);
            const midX = (x1 + x2) / 2;
            const arcY = axisY - 35;
            const color = hl.color || "#38bdf8";
            return (
              <g key={`hl-${idx}`}>
                <path
                  d={`M ${x1} ${axisY - 8} Q ${midX} ${arcY} ${x2} ${axisY - 8}`}
                  fill="none"
                  stroke={color}
                  strokeWidth="2.5"
                  strokeDasharray="4 2"
                />
                {hl.label && (
                  <text
                    x={midX}
                    y={arcY - 4}
                    textAnchor="middle"
                    fill={color}
                    className="text-xs font-semibold"
                    style={{ fontSize: "11px" }}
                  >
                    {hl.label}
                  </text>
                )}
              </g>
            );
          })}

          {/* Horizontal Axis */}
          <line
            x1={paddingX - 15}
            y1={axisY}
            x2={svgWidth - paddingX + 15}
            y2={axisY}
            stroke="#64748b"
            strokeWidth="3"
            markerStart="url(#arrow-left)"
            markerEnd="url(#arrow-right)"
          />

          {/* Ticks and Labels */}
          {ticks.map((val) => {
            const x = toX(val);
            const isZero = val === 0;
            return (
              <g key={`tick-${val}`}>
                <line
                  x1={x}
                  y1={axisY - 6}
                  x2={x}
                  y2={axisY + 6}
                  stroke={isZero ? "#38bdf8" : "#94a3b8"}
                  strokeWidth={isZero ? "2.5" : "1.5"}
                />
                <text
                  x={x}
                  y={axisY + 22}
                  textAnchor="middle"
                  fill={isZero ? "#38bdf8" : "#cbd5e1"}
                  className="font-mono text-xs font-medium"
                  style={{ fontSize: "11px" }}
                >
                  {val}
                </text>
              </g>
            );
          })}

          {/* Points */}
          {points.map((pt, idx) => {
            const x = toX(pt.value);
            const color = pt.color || "#10b981";
            return (
              <g key={`pt-${idx}`}>
                <line
                  x1={x}
                  y1={axisY - 20}
                  x2={x}
                  y2={axisY}
                  stroke={color}
                  strokeWidth="2"
                  strokeDasharray="2 2"
                />
                <circle cx={x} cy={axisY} r="6" fill={color} stroke="#0f172a" strokeWidth="2" />
                <rect
                  x={x - 14}
                  y={axisY - 38}
                  width="28"
                  height="16"
                  rx="4"
                  fill={color}
                  className="shadow-sm"
                />
                <text
                  x={x}
                  y={axisY - 26}
                  textAnchor="middle"
                  fill="#0f172a"
                  className="font-mono font-bold"
                  style={{ fontSize: "10px" }}
                >
                  {pt.label || pt.value}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
