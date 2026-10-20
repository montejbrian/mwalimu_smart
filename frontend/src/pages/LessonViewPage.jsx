import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  BookOpen, Zap, CheckCircle2, Film, AlertCircle,
  ChevronRight, Clock, RefreshCw, Play, FileText, Download, Trophy,
} from "lucide-react";
import { lessonApi } from "../lib/api.js";
import clsx from "clsx";

const PIPELINE_STAGES = [
  { key: "initialised", label: "Queued",      icon: Clock },
  { key: "researching", label: "Researching", icon: BookOpen },
  { key: "scripting",   label: "Scripting",   icon: Zap },
  { key: "diagnosing",  label: "Diagnostic",  icon: CheckCircle2 },
  { key: "animating",   label: "Animating",   icon: Film },
  { key: "complete",    label: "Complete",    icon: CheckCircle2 },
];

const STAGE_ORDER = PIPELINE_STAGES.map((s) => s.key);

function PipelineBar({ status }) {
  const current = STAGE_ORDER.indexOf(status);
  const isError = status === "error";

  return (
    <div className="flex items-center gap-1">
      {PIPELINE_STAGES.map((stage, i) => {
        const done    = i < current;
        const active  = i === current;
        const Icon    = stage.icon;
        return (
          <React.Fragment key={stage.key}>
            <motion.div
              animate={{
                backgroundColor: isError && active ? "#ef4444" : done ? "#166534" : active ? "#22c55e" : "rgba(255,255,255,0.05)",
                scale: active ? 1.1 : 1,
              }}
              className={clsx(
                "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
                active && !isError && "shadow-glow-green"
              )}
            >
              {active && !isError && !done ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                >
                  <RefreshCw size={13} className="text-white" />
                </motion.div>
              ) : (
                <Icon size={13} className={done || active ? "text-white" : "text-ink-700"} />
              )}
            </motion.div>
            {i < PIPELINE_STAGES.length - 1 && (
              <motion.div
                animate={{ backgroundColor: done ? "#166534" : "rgba(255,255,255,0.06)" }}
                className="flex-1 h-0.5 transition-all duration-700"
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function ScriptSection({ script }) {
  const [open, setOpen] = useState(0);
  if (!script) return null;
  return (
    <div className="space-y-4">
      {/* Objectives */}
      <div className="card">
        <h3 className="font-body text-xs font-semibold text-ink-500 uppercase tracking-widest mb-3">
          Learning Objectives
        </h3>
        <ul className="space-y-2">
          {script.learning_objectives?.map((obj, i) => (
            <motion.li
              key={i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06 }}
              className="flex items-start gap-2.5 text-sm text-ink-300 font-body"
            >
              <ChevronRight size={14} className="text-brand-400 mt-0.5 flex-shrink-0" />
              {obj}
            </motion.li>
          ))}
        </ul>
      </div>

      {/* Body sections accordion */}
      <div className="card !p-0 overflow-hidden">
        <h3 className="font-body text-xs font-semibold text-ink-500 uppercase tracking-widest px-5 py-4 border-b border-[var(--border)]">
          Lesson Content
        </h3>
        {script.body_sections?.map((section, i) => (
          <div key={i} className="border-b border-[var(--border)] last:border-0">
            <button
              onClick={() => setOpen(open === i ? -1 : i)}
              className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-white/3 transition-colors"
            >
              <span className="font-body font-medium text-sm text-ink-200">{section.heading}</span>
              <motion.div animate={{ rotate: open === i ? 90 : 0 }} transition={{ duration: 0.2 }}>
                <ChevronRight size={15} className="text-ink-600" />
              </motion.div>
            </button>
            <AnimatePresence>
              {open === i && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden"
                >
                  <p className="px-5 pb-5 text-sm text-ink-400 font-body leading-relaxed">
                    {section.content}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>

      {/* Key concepts */}
      <div className="card">
        <h3 className="font-body text-xs font-semibold text-ink-500 uppercase tracking-widest mb-3">Key Concepts</h3>
        <div className="flex flex-wrap gap-2">
          {script.key_concepts?.map((c) => (
            <span key={c} className="badge-green">{c}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function LessonViewPage() {
  const { lessonId } = useParams();
  const navigate     = useNavigate();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);

  const poll = useCallback(async () => {
    try {
      const res = await lessonApi.get(lessonId);
      setData(res.data);
      setLoading(false);
      return res.data.status;
    } catch {
      setLoading(false);
      return "error";
    }
  }, [lessonId]);

  useEffect(() => {
    let timer;
    async function loop() {
      const status = await poll();
      const active = ["initialised","researching","scripting","animating"].includes(status);
      if (active) timer = setTimeout(loop, 3000);
    }
    loop();
    return () => clearTimeout(timer);
  }, [poll]);

  const status = data?.workflow_status || "initialised";
  const script = data?.lesson_script;
  const diag   = data?.diagnostic_outcome ? {
    outcome:      data.diagnostic_outcome,
    percentage:   parseFloat(data.diagnostic_score || 0),
    retake_count: data.retake_count || 0,
  } : null;
  const anim   = data?.animation;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <p className="text-xs text-ink-600 font-mono mb-1">{lessonId}</p>
        <h1 className="font-display text-2xl font-semibold text-ink-100">
          {data?.topic || <span className="shimmer-bg inline-block w-48 h-7 rounded" />}
        </h1>
        {data && (
          <p className="text-sm text-ink-500 font-body mt-0.5">
            {data.strand?.replace(/_/g," ")} · {data.grade_level?.replace("_"," ")} · {data.language === "sw" ? "Kiswahili" : "English"}
          </p>
        )}
      </motion.div>

      {/* Pipeline status */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-body text-xs font-semibold text-ink-500 uppercase tracking-widest">Pipeline Status</h2>
          {["initialised","researching","scripting","animating"].includes(status) && (
            <span className="badge-gold">
              <RefreshCw size={10} className="animate-spin" /> Processing
            </span>
          )}
          {status === "complete" && <span className="badge-green"><CheckCircle2 size={10} /> Complete</span>}
          {status === "error"    && <span className="badge text-red-400 bg-red-500/10 border-red-500/20"><AlertCircle size={10} /> Error</span>}
        </div>
        <PipelineBar status={status} />
        {diag && (
          <div className="mt-4 pt-4 border-t border-[var(--border)] flex items-center gap-4 text-xs font-body text-ink-500">
            <span>Score: <strong className={clsx("font-mono", diag.percentage >= 80 ? "text-brand-400" : "text-gold-400")}>{diag.percentage?.toFixed(0)}%</strong></span>
            <span>Outcome: <strong className={diag.outcome === "pass" ? "text-brand-400" : "text-gold-400"}>{diag.outcome?.toUpperCase()}</strong></span>
            <span>Retakes: <strong className="text-ink-300">{diag.retake_count}</strong></span>
          </div>
        )}
      </motion.div>

      {/* CTA: Go to diagnostic */}
      {status === "diagnosing" && !diag?.outcome && (
        <motion.button
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => navigate(`/lesson/${lessonId}/diagnostic`)}
          className="w-full card glass-active flex items-center justify-between group hover:shadow-glow-green"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-500/20 flex items-center justify-center">
              <Zap size={18} className="text-brand-400" />
            </div>
            <div className="text-left">
              <p className="font-body font-semibold text-ink-100 text-sm">Start Diagnostic Assessment</p>
              <p className="text-xs text-ink-500">5 questions · 80% CBC pass threshold</p>
            </div>
          </div>
          <ArrowRight size={16} className="text-ink-500 group-hover:text-brand-400 group-hover:translate-x-1 transition-all" />
        </motion.button>
      )}

      {/* Animation card */}
      {anim && anim.render_status !== "failed" && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-body text-xs font-semibold text-ink-500 uppercase tracking-widest">Manim Animation</h2>
            <span className={clsx("badge", anim.render_status === "done" ? "badge-green" : "badge-gold")}>
              {anim.render_status === "done" ? <><CheckCircle2 size={10} /> Ready</> : <><RefreshCw size={10} className="animate-spin" /> Rendering</>}
            </span>
          </div>
          {data?.mp4_path ? (
            <div className="aspect-video rounded-xl overflow-hidden bg-black border border-[var(--border)]">
              <video
                src={`/renders/${data.mp4_path?.split("/").pop()}`}
                controls
                className="w-full h-full object-contain"
              />
            </div>
          ) : (
            <div className="aspect-video rounded-xl bg-ink-900/50 border border-[var(--border)] flex items-center justify-center">
              <div className="text-center space-y-2">
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 3, repeat: Infinity, ease: "linear" }}>
                  <Film size={28} className="text-ink-700 mx-auto" />
                </motion.div>
                <p className="text-xs text-ink-600 font-body">Rendering on server…</p>
                <p className="text-[10px] text-ink-700 font-mono">{anim.manim_class_name}</p>
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* Lesson content tabs */}
      <AnimatePresence>
        {script && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            {/* Tab bar */}
            {(() => {
              const [tab, setTab] = React.useState("script");
              return (
                <>
                  <div className="flex gap-1 bg-ink-900/50 border border-[var(--border)] rounded-xl p-1 mb-4">
                    {[
                      { id: "script",     label: "Lesson Script",  icon: BookOpen },
                      { id: "transcript", label: "Full Transcript", icon: FileText },
                      ...(diag ? [{ id: "results", label: "Assessment Results", icon: Trophy }] : []),
                    ].map(({ id, label, icon: Icon }) => (
                      <button
                        key={id}
                        onClick={() => setTab(id)}
                        className={clsx(
                          "flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-lg transition-all",
                          tab === id
                            ? "bg-ink-800 text-ink-100 shadow-sm"
                            : "text-ink-500 hover:text-ink-300"
                        )}
                      >
                        <Icon size={12} />{label}
                      </button>
                    ))}
                  </div>

                  {/* Script tab */}
                  {tab === "script" && <ScriptSection script={script} />}

                  {/* Transcript tab */}
                  {tab === "transcript" && (
                    <div className="card space-y-5">
                      <div className="flex items-center justify-between">
                        <h3 className="font-body text-xs font-semibold text-ink-500 uppercase tracking-widest">Full Lesson Transcript</h3>
                        <button
                          onClick={() => {
                            const text = [
                              script.title,
                              "",
                              script.introduction,
                              "",
                              ...(script.body_sections?.flatMap(s => [s.heading, s.content, ""]) || []),
                              "Key Concepts: " + (script.key_concepts?.join(", ") || ""),
                            ].join("\n");
                            const blob = new Blob([text], { type: "text/plain" });
                            const a = document.createElement("a");
                            a.href = URL.createObjectURL(blob);
                            a.download = `${script.title || "lesson"}_transcript.txt`;
                            a.click();
                          }}
                          className="flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300 font-body transition-colors"
                        >
                          <Download size={12} /> Download
                        </button>
                      </div>
                      {script.introduction && (
                        <div>
                          <p className="text-xs font-semibold text-ink-500 mb-1 uppercase tracking-wide">Introduction</p>
                          <p className="text-sm text-ink-300 font-body leading-relaxed">{script.introduction}</p>
                        </div>
                      )}
                      {script.body_sections?.map((s, i) => (
                        <div key={i}>
                          <p className="text-xs font-semibold text-brand-400 mb-1">{s.heading}</p>
                          <p className="text-sm text-ink-300 font-body leading-relaxed">{s.content}</p>
                        </div>
                      ))}
                      {script.remedial_explanation && (
                        <div className="pt-3 border-t border-[var(--border)]">
                          <p className="text-xs font-semibold text-gold-400 mb-1">📌 Remedial Explanation</p>
                          <p className="text-sm text-ink-400 font-body leading-relaxed">{script.remedial_explanation}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Assessment Results tab */}
                  {tab === "results" && diag && (
                    <div className="card space-y-4">
                      <h3 className="font-body text-xs font-semibold text-ink-500 uppercase tracking-widest">Diagnostic Assessment Results</h3>
                      <div className="flex items-center gap-6">
                        <div className="text-center">
                          <p className={clsx("font-display text-4xl font-bold", diag.percentage >= 80 ? "text-brand-400" : "text-gold-400")}>
                            {diag.percentage?.toFixed(0)}%
                          </p>
                          <p className="text-xs text-ink-500 font-body mt-1">Score</p>
                        </div>
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2">
                            <span className={clsx("badge text-sm px-3 py-1", diag.outcome === "pass" ? "badge-green" : "badge-gold")}>
                              {diag.outcome?.toUpperCase()}
                            </span>
                            <span className="text-xs text-ink-500 font-body">CBC Pass Threshold: 80%</span>
                          </div>
                          {diag.retake_count > 0 && (
                            <p className="text-xs text-ink-600 font-body">Retakes: {diag.retake_count}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Errors */}
      {data?.errors?.length > 0 && (
        <div className="card border-red-500/20 bg-red-500/5">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle size={14} className="text-red-400" />
            <h3 className="text-xs font-semibold text-red-400 font-body">Pipeline Errors</h3>
          </div>
          {data.errors.map((e, i) => (
            <p key={i} className="text-xs text-red-400/70 font-mono">{e}</p>
          ))}
        </div>
      )}
    </div>
  );
}
