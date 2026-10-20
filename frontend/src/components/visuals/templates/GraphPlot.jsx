import React from "react";
import { TrendingUp } from "lucide-react";

/**
 * GraphPlot SVG Template
 * Visualizes linear equations, coordinate planes, and data points.
 *
 * @param {Object} props
 * @param {string} [props.title="Plot: y = 2x + 1"]
 * @param {string} [props.x_label="x"]
 * @param {string} [props.y_label="y"]
 * @param {Array<{x: number, y: number, label?: string}>} [props.points]
 * @param {string} [props.line_expr="y = 2x + 1"]
 */
export default function GraphPlot({
  title = "Plot: y = 2x + 1",
  x_label = "x",
  y_label = "y",
  points = [
    { x: 0, y: 1, label: "(0, 1)" },
    { x: 1, y: 3, label: "(1, 3)" },
    { x: 2, y: 5, label: "(2, 5)" },
  ],
  line_expr = "y = 2x + 1",
}) {
  const svgWidth = 480;
  const svgHeight = 260;
  const originX = 60;
  const originY = 210;
  const maxX = 4;
  const maxY = 6;
  const scaleX = (svgWidth - originX - 40) / maxX;
  const scaleY = (originY - 30) / maxY;

  const toSvgX = (x) => originX + x * scaleX;
  const toSvgY = (y) => originY - y * scaleY;

  return (
    <div
      data-testid="visual-graph-plot"
      className="my-3 p-4 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 shadow-md max-w-xl mx-auto"
    >
      <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-emerald-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            {title || "Coordinate Graph"}
          </span>
        </div>
        {line_expr && (
          <div className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-emerald-300 border border-slate-700">
            {line_expr}
          </div>
        )}
      </div>

      <div className="w-full flex justify-center py-2">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full max-w-lg h-auto select-none overflow-visible"
          aria-label={title}
        >
          {/* Grid lines */}
          {Array.from({ length: maxX + 1 }).map((_, i) => (
            <line
              key={`grid-x-${i}`}
              x1={toSvgX(i)}
              y1={originY}
              x2={toSvgX(i)}
              y2={originY - maxY * scaleY}
              stroke="#1e293b"
              strokeWidth="1"
            />
          ))}
          {Array.from({ length: maxY + 1 }).map((_, i) => (
            <line
              key={`grid-y-${i}`}
              x1={originX}
              y1={toSvgY(i)}
              x2={originX + maxX * scaleX}
              y2={toSvgY(i)}
              stroke="#1e293b"
              strokeWidth="1"
            />
          ))}

          {/* X Axis */}
          <line
            x1={originX - 10}
            y1={originY}
            x2={originX + maxX * scaleX + 25}
            y2={originY}
            stroke="#64748b"
            strokeWidth="2"
          />
          <text
            x={originX + maxX * scaleX + 32}
            y={originY + 4}
            fill="#94a3b8"
            className="font-mono text-xs font-semibold"
          >
            {x_label}
          </text>

          {/* Y Axis */}
          <line
            x1={originX}
            y1={originY + 10}
            x2={originX}
            y2={originY - maxY * scaleY - 15}
            stroke="#64748b"
            strokeWidth="2"
          />
          <text
            x={originX}
            y={originY - maxY * scaleY - 20}
            fill="#94a3b8"
            textAnchor="middle"
            className="font-mono text-xs font-semibold"
          >
            {y_label}
          </text>

          {/* Ticks */}
          {Array.from({ length: maxX + 1 }).map((_, i) => (
            <g key={`tick-x-${i}`}>
              <line
                x1={toSvgX(i)}
                y1={originY - 3}
                x2={toSvgX(i)}
                y2={originY + 3}
                stroke="#64748b"
                strokeWidth="1.5"
              />
              <text
                x={toSvgX(i)}
                y={originY + 16}
                textAnchor="middle"
                fill="#94a3b8"
                className="font-mono text-[10px]"
              >
                {i}
              </text>
            </g>
          ))}
          {Array.from({ length: maxY + 1 }).map((_, i) => (
            <g key={`tick-y-${i}`}>
              <line
                x1={originX - 3}
                y1={toSvgY(i)}
                x2={originX + 3}
                y2={toSvgY(i)}
                stroke="#64748b"
                strokeWidth="1.5"
              />
              {i > 0 && (
                <text
                  x={originX - 8}
                  y={toSvgY(i) + 4}
                  textAnchor="end"
                  fill="#94a3b8"
                  className="font-mono text-[10px]"
                >
                  {i}
                </text>
              )}
            </g>
          ))}

          {/* Trend Line (if points exist) */}
          {points.length >= 2 && (
            <line
              x1={toSvgX(points[0].x)}
              y1={toSvgY(points[0].y)}
              x2={toSvgX(points[points.length - 1].x)}
              y2={toSvgY(points[points.length - 1].y)}
              stroke="#10b981"
              strokeWidth="2.5"
              strokeDasharray="4 2"
            />
          )}

          {/* Points */}
          {points.map((pt, idx) => {
            const px = toSvgX(pt.x);
            const py = toSvgY(pt.y);
            return (
              <g key={`pt-${idx}`}>
                <circle cx={px} cy={py} r="5" fill="#38bdf8" stroke="#0f172a" strokeWidth="2" />
                <rect
                  x={px + 8}
                  y={py - 14}
                  width="36"
                  height="16"
                  rx="3"
                  fill="#1e293b"
                  stroke="#38bdf8"
                  strokeWidth="1"
                />
                <text
                  x={px + 26}
                  y={py - 3}
                  textAnchor="middle"
                  fill="#38bdf8"
                  className="font-mono font-bold text-[9px]"
                >
                  {pt.label || `(${pt.x}, ${pt.y})`}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
