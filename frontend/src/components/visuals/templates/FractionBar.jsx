import React from "react";
import { PieChart } from "lucide-react";

/**
 * FractionBar SVG Template
 * Visualizes parts-of-a-whole and compares equivalent fractions.
 *
 * @param {Object} props
 * @param {string} [props.title="Fraction Comparison"]
 * @param {Array<{numerator: number, denominator: number, label?: string, color?: string}>} [props.bars]
 * @param {string} [props.comparison="="]
 */
export default function FractionBar({
  title = "Fraction Comparison",
  bars = [
    { numerator: 3, denominator: 4, label: "3/4", color: "#10b981" },
    { numerator: 6, denominator: 8, label: "6/8", color: "#38bdf8" },
  ],
  comparison = "=",
}) {
  const barWidth = 440;
  const barHeight = 36;
  const startX = 60;

  return (
    <div
      data-testid="visual-fraction-bar"
      className="my-3 p-4 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 shadow-md max-w-xl mx-auto"
    >
      <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
        <div className="flex items-center gap-2">
          <PieChart className="w-5 h-5 text-amber-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            {title || "Fraction Comparison"}
          </span>
        </div>
        {comparison && (
          <div className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-amber-300 border border-slate-700">
            Relation: {comparison}
          </div>
        )}
      </div>

      <div className="w-full flex justify-center py-2">
        <svg
          viewBox={`0 0 540 ${Math.max(140, bars.length * 65 + 30)}`}
          className="w-full max-w-lg h-auto select-none overflow-visible"
          aria-label={title}
        >
          {bars.map((b, idx) => {
            const num = Math.max(0, Number(b.numerator) || 0);
            const den = Math.max(1, Number(b.denominator) || 1);
            const color = b.color || (idx === 0 ? "#10b981" : "#38bdf8");
            const y = idx * 65 + 20;
            const segmentWidth = barWidth / den;

            return (
              <g key={`bar-${idx}`}>
                {/* Fraction label badge on left */}
                <text
                  x={startX - 15}
                  y={y + barHeight / 2 + 5}
                  textAnchor="end"
                  fill="#f1f5f9"
                  className="font-mono font-bold text-sm"
                  style={{ fontSize: "14px" }}
                >
                  {b.label || `${num}/${den}`}
                </text>

                {/* Outer container bar */}
                <rect
                  x={startX}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  rx="6"
                  fill="#1e293b"
                  stroke="#475569"
                  strokeWidth="2"
                />

                {/* Segments */}
                {Array.from({ length: den }).map((_, segIdx) => {
                  const segX = startX + segIdx * segmentWidth;
                  const isFilled = segIdx < num;
                  return (
                    <g key={`seg-${segIdx}`}>
                      <rect
                        x={segX + 1}
                        y={y + 1}
                        width={segmentWidth - 2}
                        height={barHeight - 2}
                        rx="4"
                        fill={isFilled ? color : "transparent"}
                        opacity={isFilled ? 0.9 : 0.2}
                      />
                      {segIdx > 0 && (
                        <line
                          x1={segX}
                          y1={y}
                          x2={segX}
                          y2={y + barHeight}
                          stroke="#334155"
                          strokeWidth="1.5"
                          strokeDasharray="2 2"
                        />
                      )}
                    </g>
                  );
                })}

                {/* Subtitle / Percentage */}
                <text
                  x={startX + barWidth}
                  y={y + barHeight + 14}
                  textAnchor="end"
                  fill="#94a3b8"
                  className="font-mono text-xs"
                  style={{ fontSize: "10px" }}
                >
                  {Math.round((num / den) * 100)}% ({num} of {den} parts)
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
