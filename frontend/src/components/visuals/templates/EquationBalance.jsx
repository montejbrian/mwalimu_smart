import React, { useState } from "react";
import { Scale, CheckCircle2 } from "lucide-react";

/**
 * EquationBalance SVG Template
 * Visualizes algebraic balance scales where Left Pan == Right Pan.
 *
 * @param {Object} props
 * @param {string} [props.equation="2x + 3 = 11"]
 * @param {string} [props.left="2x + 3"]
 * @param {string} [props.right="11"]
 * @param {boolean} [props.balanced=true]
 * @param {Array<string>} [props.steps]
 */
export default function EquationBalance({
  equation = "2x + 3 = 11",
  left = "2x + 3",
  right = "11",
  balanced = true,
  steps = [],
}) {
  const [currentStep, setCurrentStep] = useState(0);

  // Angle: 0 if balanced, tilted if unbalanced
  const beamAngle = balanced ? 0 : -8;

  return (
    <div
      data-testid="visual-equation-balance"
      className="my-3 p-4 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 shadow-md max-w-xl mx-auto"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
        <div className="flex items-center gap-2">
          <Scale className="w-5 h-5 text-emerald-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Equation Balance
          </span>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-950/80 text-emerald-300 border border-emerald-800/60">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>{balanced ? "Balanced (=)" : "Unbalanced"}</span>
        </div>
      </div>

      {/* Main Equation Pill */}
      <div className="text-center my-2">
        <span className="inline-block px-4 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-lg font-mono font-bold text-emerald-300 shadow-inner">
          {equation || `${left} = ${right}`}
        </span>
      </div>

      {/* SVG Canvas */}
      <div className="w-full flex justify-center py-2">
        <svg
          viewBox="0 0 500 230"
          className="w-full max-w-lg h-auto select-none overflow-visible"
          aria-label={`Balance scale for equation ${equation}`}
        >
          {/* Base Stand & Fulcrum */}
          <rect x="245" y="110" width="10" height="90" rx="3" fill="#475569" />
          <path d="M 210 200 L 290 200 L 280 215 L 220 215 Z" fill="#334155" />
          {/* Fulcrum Pivot Triangle */}
          <polygon points="250,95 235,120 265,120" fill="#64748b" />
          <circle cx="250" cy="98" r="4" fill="#10b981" />

          {/* Beam Group (Rotatable) */}
          <g transform={`rotate(${beamAngle} 250 98)`}>
            {/* Horizontal Crossbar */}
            <rect x="70" y="94" width="360" height="8" rx="4" fill="#94a3b8" />
            <circle cx="250" cy="98" r="6" fill="#38bdf8" />

            {/* Left Pan Assembly */}
            <line x1="120" y1="98" x2="90" y2="150" stroke="#64748b" strokeWidth="2" />
            <line x1="120" y1="98" x2="150" y2="150" stroke="#64748b" strokeWidth="2" />
            <path
              d="M 70 150 Q 120 170 170 150 Z"
              fill="#1e293b"
              stroke="#0284c7"
              strokeWidth="2"
            />
            {/* Left Content */}
            <text
              x="120"
              y="142"
              textAnchor="middle"
              className="fill-sky-300 font-mono font-bold text-sm"
              style={{ fontSize: "15px" }}
            >
              {left}
            </text>

            {/* Right Pan Assembly */}
            <line x1="380" y1="98" x2="350" y2="150" stroke="#64748b" strokeWidth="2" />
            <line x1="380" y1="98" x2="410" y2="150" stroke="#64748b" strokeWidth="2" />
            <path
              d="M 330 150 Q 380 170 430 150 Z"
              fill="#1e293b"
              stroke="#10b981"
              strokeWidth="2"
            />
            {/* Right Content */}
            <text
              x="380"
              y="142"
              textAnchor="middle"
              className="fill-emerald-300 font-mono font-bold text-sm"
              style={{ fontSize: "15px" }}
            >
              {right}
            </text>
          </g>
        </svg>
      </div>

      {/* Solving Steps (if available) */}
      {steps && steps.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-800 text-xs text-slate-300">
          <div className="font-semibold text-slate-400 mb-1.5 flex items-center justify-between">
            <span>Solution Steps:</span>
            <span className="text-[11px] font-mono text-emerald-400">
              Step {currentStep + 1} of {steps.length}
            </span>
          </div>
          <div className="p-2.5 bg-slate-950/60 rounded-lg border border-slate-800/80 font-mono text-emerald-200">
            {steps[currentStep]}
          </div>
          {steps.length > 1 && (
            <div className="flex gap-2 mt-2 justify-end">
              <button
                type="button"
                disabled={currentStep === 0}
                onClick={() => setCurrentStep((prev) => Math.max(0, prev - 1))}
                className="px-2.5 py-1 rounded bg-slate-800 text-slate-200 disabled:opacity-40 text-xs hover:bg-slate-700"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={currentStep >= steps.length - 1}
                onClick={() => setCurrentStep((prev) => Math.min(steps.length - 1, prev + 1))}
                className="px-2.5 py-1 rounded bg-emerald-700 text-white disabled:opacity-40 text-xs hover:bg-emerald-600"
              >
                Next Step
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
