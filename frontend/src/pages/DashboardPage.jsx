import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import {
  BookOpen, TrendingUp, Users, Zap,
  ArrowRight, Clock, CheckCircle2, AlertCircle, RotateCcw,
} from "lucide-react";
import { lessonApi } from "../lib/api.js";
import { useStore } from "../lib/store.js";
import clsx from "clsx";

const FADE_UP = (i = 0) => ({
  initial:    { opacity: 0, y: 20 },
  animate:    { opacity: 1, y: 0 },
  transition: { delay: i * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] },
});

function StatCard({ icon: Icon, label, value, sub, color, index }) {
  return (
    <motion.div {...FADE_UP(index)} className="card group">
      <div className="flex items-start justify-between mb-4">
        <div className={clsx("w-10 h-10 rounded-xl flex items-center justify-center", color)}>
          <Icon size={18} className="text-white" />
        </div>
        <TrendingUp size={14} className="text-ink-600 group-hover:text-brand-500 transition-colors" />
      </div>
      <p className="font-display text-3xl font-semibold text-ink-100">{value}</p>
      <p className="text-sm font-body text-ink-400 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-ink-600 mt-1 font-body">{sub}</p>}
    </motion.div>
  );
}

function StatusBadge({ status }) {
  const map = {
    complete:   { label: "Complete",   cls: "badge-green",     icon: CheckCircle2 },
    diagnosing: { label: "Diagnosing", cls: "badge-gold",      icon: Zap },
    scripting:  { label: "Scripting",  cls: "badge-gold",      icon: Clock },
    animating:  { label: "Animating",  cls: "badge-gold",      icon: Clock },
    error:      { label: "Error",      cls: "badge text-red-400 bg-red-500/10 border-red-500/20", icon: AlertCircle },
    initialised:{ label: "Queued",     cls: "badge-muted",     icon: Clock },
  };
  const { label, cls, icon: Icon } = map[status] || map.initialised;
  return (
    <span className={cls}>
      <Icon size={10} />
      {label}
    </span>
  );
}

export default function DashboardPage() {
  const navigate  = useNavigate();
  const user      = useStore((s) => s.user);
  const [lessons, setLessons]   = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    lessonApi.history(user?.school_id || "school_001", { limit: 8 })
      .then((r) => setLessons(r.data.lessons || []))
      .catch(() => setLessons([]))
      .finally(() => setLoading(false));
  }, []);

  const stats = [
    { icon: BookOpen,  label: "Total Lessons",   value: lessons.length || "—",   color: "bg-brand-600",   sub: "This session" },
    { icon: CheckCircle2,label:"Completed",       value: lessons.filter(l=>l.workflow_status==="complete").length || "—", color:"bg-jade-600", sub:"Pass ≥ 80%" },
    { icon: RotateCcw, label: "Retakes Triggered",value: lessons.filter(l=>l.retake_count>0).length || "—", color:"bg-gold-600", sub:"Students re-routed" },
    { icon: Users,     label: "Avg. Score",       value: lessons.length ? (lessons.reduce((a,l)=>a+(l.diagnostic_score||0),0)/lessons.length).toFixed(0)+"%":"—", color:"bg-blue-700", sub:"Diagnostic average" },
  ];

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Header */}
      <motion.div {...FADE_UP(0)}>
        <h1 className="font-display text-3xl font-semibold text-ink-100">
          Good morning, <span className="text-gradient">{user?.name?.split(" ")[0] || (user?.role === "student" ? "Student" : "Teacher")}</span>
        </h1>
        <p className="text-ink-500 text-sm font-body mt-1">
          {user?.school} · CBC Lesson Dashboard
        </p>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s, i) => <StatCard key={s.label} {...s} index={i + 1} />)}
      </div>

      {/* Quick actions */}
      <motion.div {...FADE_UP(5)}>
        <h2 className="font-body text-xs font-semibold text-ink-500 uppercase tracking-widest mb-3">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <motion.button
            whileHover={{ scale: 1.015, y: -1 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate("/lesson/new")}
            className="card text-left group hover:glass-active"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-500/15 flex items-center justify-center">
                  <BookOpen size={18} className="text-brand-400" />
                </div>
                <div>
                  <p className="font-body font-medium text-ink-200 text-sm">Generate New Lesson</p>
                  <p className="text-xs text-ink-500">CBC-aligned · KICD RAG-powered</p>
                </div>
              </div>
              <ArrowRight size={16} className="text-ink-600 group-hover:text-brand-400 group-hover:translate-x-1 transition-all" />
            </div>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.015, y: -1 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate("/voice")}
            className="card text-left group hover:glass-active"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gold-500/15 flex items-center justify-center">
                  <Zap size={18} className="text-gold-400" />
                </div>
                <div>
                  <p className="font-body font-medium text-ink-200 text-sm">Launch Voice Mode</p>
                  <p className="text-xs text-ink-500">Gemini NLU · Google TTS en-KE / sw-KE</p>
                </div>
              </div>
              <ArrowRight size={16} className="text-ink-600 group-hover:text-gold-400 group-hover:translate-x-1 transition-all" />
            </div>
          </motion.button>
        </div>
      </motion.div>

      {/* Recent lessons table */}
      <motion.div {...FADE_UP(6)}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-body text-xs font-semibold text-ink-500 uppercase tracking-widest">Recent Lessons</h2>
          <button onClick={() => navigate("/history")} className="text-xs text-brand-400 hover:text-brand-300 font-body transition-colors">
            View all →
          </button>
        </div>

        <div className="card !p-0 overflow-hidden">
          {loading ? (
            <div className="space-y-0 divide-y divide-[var(--border)]">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-5 py-4">
                  <div className="shimmer-bg h-4 w-40 rounded" />
                  <div className="shimmer-bg h-4 w-20 rounded ml-auto" />
                </div>
              ))}
            </div>
          ) : lessons.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <BookOpen size={32} className="text-ink-700 mb-3" />
              <p className="text-ink-500 font-body text-sm">No lessons yet.</p>
              <button onClick={() => navigate("/lesson/new")} className="btn-primary mt-4 text-xs">
                Generate first lesson <ArrowRight size={13} />
              </button>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {lessons.map((lesson, i) => (
                <motion.button
                  key={lesson.lesson_id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={() => navigate(`/lesson/${lesson.lesson_id}`)}
                  className="w-full flex items-center gap-4 px-5 py-4 hover:bg-white/3 transition-colors text-left group"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium font-body text-ink-200 truncate group-hover:text-ink-100">
                      {lesson.topic}
                    </p>
                    <p className="text-xs text-ink-500 font-body">
                      {lesson.strand?.replace(/_/g, " ")} · {lesson.grade_level?.replace("_", " ")}
                    </p>
                  </div>
                  <StatusBadge status={lesson.workflow_status} />
                  {lesson.diagnostic_score != null && (
                    <span className="text-xs font-mono text-ink-400">
                      {parseFloat(lesson.diagnostic_score).toFixed(0)}%
                    </span>
                  )}
                  <ArrowRight size={14} className="text-ink-700 group-hover:text-ink-400 transition-colors flex-shrink-0" />
                </motion.button>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
