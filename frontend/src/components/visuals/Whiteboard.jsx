/**
 * MwalimuSmart Web
 * frontend/src/components/visuals/Whiteboard.jsx — Progressive Whiteboard Component (Phase 4.2)
 *
 * Responsibilities:
 *   - Animate a step-by-step sequence of draw operations in real-time or replay mode
 *   - Render mathematical equations, highlights, arrows, notes, and diagrams
 *   - Provide interactive playback controls (Play, Pause, Step Next/Prev, Reset)
 */

import React, { useState, useEffect } from "react";
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  RotateCcw,
  Sparkles,
  ArrowRight,
  Layers,
  CheckCircle,
} from "lucide-react";
import clsx from "clsx";

export default function Whiteboard({
  ops = [],
  title = "Progressive Whiteboard",
  isStreaming = false,
  autoPlay = true,
}) {
  const operations = Array.isArray(ops) ? ops : [];
  const totalSteps = operations.length;

  const [currentStep, setCurrentStep] = useState(
    isStreaming ? totalSteps : totalSteps > 0 ? 1 : 0
  );
  const [isPlaying, setIsPlaying] = useState(!isStreaming && autoPlay);

  // If streaming new operations, keep up with latest step
  useEffect(() => {
    if (isStreaming && totalSteps > 0) {
      setCurrentStep(totalSteps);
    }
  }, [totalSteps, isStreaming]);

  // Auto-advance timer when isPlaying
  useEffect(() => {
    if (!isPlaying || isStreaming || totalSteps <= 1) return;

    const timer = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev >= totalSteps) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 2200);

    return () => clearInterval(timer);
  }, [isPlaying, isStreaming, totalSteps]);

  // Slice operations visible up to currentStep
  const visibleOps = operations.slice(0, currentStep);

  const handleNext = () => {
    setIsPlaying(false);
    setCurrentStep((prev) => Math.min(prev + 1, totalSteps));
  };

  const handlePrev = () => {
    setIsPlaying(false);
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const handleReset = () => {
    setIsPlaying(false);
    setCurrentStep(totalSteps > 0 ? 1 : 0);
  };

  const togglePlay = () => {
    if (currentStep >= totalSteps) {
      setCurrentStep(1);
      setIsPlaying(true);
    } else {
      setIsPlaying((p) => !p);
    }
  };

  return (
    <div
      data-testid="whiteboard-canvas"
      className="my-3 rounded-2xl border border-emerald-500/30 bg-[#0c1410] text-emerald-100 p-4 sm:p-5 shadow-2xl relative overflow-hidden font-body"
    >
      {/* Blackboard Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-emerald-900/40 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-semibold text-emerald-300 font-display flex items-center gap-1.5">
            <Layers size={14} />
            <span>{title}</span>
          </span>
        </div>

        {totalSteps > 0 && (
          <div className="flex items-center gap-2 font-mono text-[11px] text-emerald-400/80">
            <span data-testid="whiteboard-step-indicator">
              Step {currentStep} of {totalSteps}
            </span>
            {isStreaming && (
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] animate-pulse">
                Live
              </span>
            )}
          </div>
        )}
      </div>

      {/* Chalkboard Drawing Stage */}
      <div className="min-h-[160px] space-y-3.5 py-1">
        {totalSteps === 0 ? (
          <div className="py-8 text-center text-emerald-600/60 text-xs italic">
            Waiting for whiteboard operations...
          </div>
        ) : (
          visibleOps.map((op, idx) => {
            const isLatest = idx === visibleOps.length - 1;

            if (op.op === "clear") {
              return (
                <div
                  key={idx}
                  className="py-1 text-[11px] text-emerald-500/50 italic border-t border-dashed border-emerald-900/50"
                >
                  --- Board Cleared ---
                </div>
              );
            }

            if (op.op === "equation") {
              return (
                <div
                  key={idx}
                  data-testid="whiteboard-equation"
                  className={clsx(
                    "p-3 rounded-xl bg-emerald-950/40 border transition-all duration-300 font-mono text-sm sm:text-base text-center shadow-inner",
                    isLatest
                      ? "border-emerald-400 text-emerald-100 scale-[1.01]"
                      : "border-emerald-800/40 text-emerald-300/90"
                  )}
                >
                  <span className="tracking-wide">{op.latex || op.text}</span>
                </div>
              );
            }

            if (op.op === "highlight") {
              return (
                <div
                  key={idx}
                  data-testid="whiteboard-highlight"
                  className="flex items-center gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-400/40 text-amber-200 text-xs animate-in fade-in"
                >
                  <Sparkles size={14} className="text-amber-400 shrink-0" />
                  <span>
                    Focus on: <strong className="font-mono text-amber-300">{op.target}</strong>
                  </span>
                </div>
              );
            }

            if (op.op === "arrow") {
              return (
                <div
                  key={idx}
                  data-testid="whiteboard-arrow"
                  className="flex items-center gap-2 text-xs text-emerald-300 pl-4 py-1"
                >
                  <div className="p-1 rounded-full bg-emerald-900/60 text-emerald-400">
                    <ArrowRight size={13} />
                  </div>
                  <div className="space-x-1.5">
                    {op.label && (
                      <span className="font-semibold text-emerald-200 bg-emerald-900/40 px-2 py-0.5 rounded text-[11px]">
                        {op.label}
                      </span>
                    )}
                    {op.from && op.to && (
                      <span className="text-emerald-400/80 font-mono text-[11px]">
                        ({op.from} → {op.to})
                      </span>
                    )}
                  </div>
                </div>
              );
            }

            if (op.op === "diagram") {
              return (
                <div
                  key={idx}
                  data-testid="whiteboard-diagram"
                  className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-800/40 flex items-center justify-center gap-3 text-xs text-emerald-200"
                >
                  {op.shape === "scale" && (
                    <svg viewBox="0 0 160 50" className="w-32 h-10 stroke-emerald-400 fill-none">
                      <path d="M 80 10 L 80 40 M 60 40 L 100 40" strokeWidth="2" />
                      <line x1="20" y1="15" x2="140" y2="15" strokeWidth="2.5" />
                      <path d="M 20 15 L 10 32 L 30 32 Z" strokeWidth="1.5" />
                      <path d="M 140 15 L 130 32 L 150 32 Z" strokeWidth="1.5" />
                    </svg>
                  )}
                  {op.shape === "box" && (
                    <div className="flex gap-1">
                      <div className="w-8 h-8 rounded bg-emerald-500/20 border border-emerald-400/60 flex items-center justify-center text-[10px] font-mono">
                        1/2
                      </div>
                      <div className="w-8 h-8 rounded bg-emerald-500/20 border border-emerald-400/60 flex items-center justify-center text-[10px] font-mono">
                        1/2
                      </div>
                    </div>
                  )}
                  <span className="font-medium text-emerald-300">{op.label || op.shape}</span>
                </div>
              );
            }

            // Default "write"
            return (
              <div
                key={idx}
                data-testid="whiteboard-write"
                className={clsx(
                  "text-xs leading-relaxed transition-all",
                  isLatest ? "text-emerald-100 font-medium" : "text-emerald-300/80"
                )}
              >
                {op.text}
              </div>
            );
          })
        )}
      </div>

      {/* Interactive Controls Bar */}
      {totalSteps > 1 && !isStreaming && (
        <div className="pt-3 mt-3 border-t border-emerald-900/40 flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              data-testid="whiteboard-play-btn"
              onClick={togglePlay}
              className="p-1.5 rounded-lg bg-emerald-900/60 hover:bg-emerald-800 text-emerald-200 transition-colors"
              title={isPlaying ? "Pause animation" : "Play step-by-step"}
            >
              {isPlaying ? <Pause size={13} /> : <Play size={13} />}
            </button>
            <button
              type="button"
              data-testid="whiteboard-prev-btn"
              onClick={handlePrev}
              disabled={currentStep <= 1}
              className="p-1.5 rounded-lg bg-emerald-900/60 hover:bg-emerald-800 text-emerald-200 disabled:opacity-30 transition-colors"
              title="Previous step"
            >
              <SkipBack size={13} />
            </button>
            <button
              type="button"
              data-testid="whiteboard-next-btn"
              onClick={handleNext}
              disabled={currentStep >= totalSteps}
              className="p-1.5 rounded-lg bg-emerald-900/60 hover:bg-emerald-800 text-emerald-200 disabled:opacity-30 transition-colors"
              title="Next step"
            >
              <SkipForward size={13} />
            </button>
            <button
              type="button"
              data-testid="whiteboard-reset-btn"
              onClick={handleReset}
              className="p-1.5 rounded-lg bg-emerald-900/60 hover:bg-emerald-800 text-emerald-200 transition-colors"
              title="Reset to step 1"
            >
              <RotateCcw size={13} />
            </button>
          </div>

          <div className="flex-1 max-w-xs mx-2">
            <div className="w-full bg-emerald-950 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-emerald-400 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${(currentStep / totalSteps) * 100}%` }}
              />
            </div>
          </div>

          <span className="text-[11px] font-mono text-emerald-400/70">
            {currentStep === totalSteps ? (
              <span className="flex items-center gap-1 text-emerald-300">
                <CheckCircle size={12} />
                <span>Done</span>
              </span>
            ) : (
              `${Math.round((currentStep / totalSteps) * 100)}%`
            )}
          </span>
        </div>
      )}
    </div>
  );
}
