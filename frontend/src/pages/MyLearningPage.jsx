/**
 * MwalimuSmart Web
 * frontend/src/pages/MyLearningPage.jsx — Student learning dashboard (P2.3)
 *
 * Requirements:
 *   - Heatmap: strands x mastery color
 *   - Recent activity list
 *   - Recommendation card ("What's next")
 *   - Non-blocking formative UX (no locked lessons, no "failed" badges)
 */

import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import {
  Sparkles,
  BookOpen,
  Award,
  TrendingUp,
  Clock,
  ArrowRight,
  RotateCcw,
  Compass,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Layers,
} from "lucide-react";
import { progressApi } from "../lib/api.js";
import { useStore } from "../lib/store.js";
import { formatPercent } from "../lib/assessment.js";
import clsx from "clsx";

const BADGE_CONFIG = {
  mastered: {
    label: { en: "Mastered", sw: "Umestadi" },
    badgeClass: "badge-green",
    bgClass: "bg-emerald-500/20 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30",
    dotClass: "bg-emerald-400",
  },
  in_progress: {
    label: { en: "In Progress", sw: "Inaendelea" },
    badgeClass: "badge-gold",
    bgClass: "bg-amber-500/20 border-amber-500/40 text-amber-300 hover:bg-amber-500/30",
    dotClass: "bg-amber-400",
  },
  review_recommended: {
    label: { en: "Review Recommended", sw: "Inapendekezwa Kurudia" },
    badgeClass: "badge text-indigo-300 bg-indigo-500/15 border-indigo-500/30",
    bgClass: "bg-indigo-500/20 border-indigo-500/40 text-indigo-300 hover:bg-indigo-500/30",
    dotClass: "bg-indigo-400",
  },
  new: {
    label: { en: "Not Started", sw: "Bado Kuanza" },
    badgeClass: "badge-muted",
    bgClass: "bg-ink-800/60 border-ink-700/50 text-ink-400 hover:bg-ink-700/50 hover:text-ink-200",
    dotClass: "bg-ink-500",
  },
};

export default function MyLearningPage() {
  const navigate = useNavigate();
  const user = useStore((s) => s.user);
  const lang = useStore((s) => s.lang) || "en";
  const useSw = lang === "sw";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [masteryData, setMasteryData] = useState({ summary: {}, subjects: [] });
  const [recentData, setRecentData] = useState({ recent: [], recommendation: null });
  const [activeSubject, setActiveSubject] = useState("all");

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    Promise.all([
      progressApi.mastery({ lang }).then((r) => r.data),
      progressApi.recent({ limit: 12, lang }).then((r) => r.data),
    ])
      .then(([mRes, rRes]) => {
        if (!isMounted) return;
        setMasteryData(mRes || { summary: {}, subjects: [] });
        setRecentData(rRes || { recent: [], recommendation: null });
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err.response?.data?.error?.message || err.message || "Failed to load progress");
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [lang]);

  const summary = masteryData.summary || {};
  const subjects = masteryData.subjects || [];
  const recent = recentData.recent || [];
  const recommendation = recentData.recommendation;

  const filteredSubjects = useMemo(() => {
    if (activeSubject === "all") return subjects;
    return subjects.filter((s) => s.code === activeSubject || s.id === activeSubject);
  }, [subjects, activeSubject]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4" data-testid="my-learning-loading">
        <div className="w-10 h-10 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-ink-400 font-mono text-sm">
          {useSw ? "Inapakia maendeleo yako..." : "Loading your learning dashboard..."}
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card max-w-xl mx-auto my-8 border border-red-500/20 bg-red-500/5 text-center space-y-4" data-testid="my-learning-error">
        <AlertCircle className="w-8 h-8 text-red-400 mx-auto" />
        <h3 className="font-display font-semibold text-ink-100">
          {useSw ? "Hitilafu imetokea" : "Could not load progress"}
        </h3>
        <p className="text-ink-400 text-sm">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="btn-ghost inline-flex items-center gap-2 text-sm mx-auto"
        >
          <RotateCcw size={14} />
          {useSw ? "Jaribu tena" : "Retry"}
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8" data-testid="my-learning-page">
      {/* 1. Header Banner */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[var(--border)] pb-6">
        <div>
          <span className="badge-green text-xs font-mono uppercase tracking-wide">
            {useSw ? "Mtaala wa CBC" : "CBC Learning Journey"}
          </span>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink-50 mt-1">
            {useSw ? "Mafunzo Yangu" : "My Learning"}
          </h1>
          <p className="text-ink-400 text-sm mt-0.5">
            {useSw
              ? `Karibu tena, ${user?.full_name || "mwanafunzi"}. Fuatilia maendeleo na uelewa wako.`
              : `Welcome back, ${user?.full_name || "Student"}. Track your CBC topic mastery and continue learning.`}
          </p>
        </div>
        <button
          onClick={() => navigate("/browse")}
          className="btn-ghost self-start sm:self-auto inline-flex items-center gap-2 text-sm"
          data-testid="browse-catalog-link"
        >
          <Compass size={16} />
          {useSw ? "Vinjari Mtaala" : "Browse Catalog"}
        </button>
      </header>

      {/* 2. Formative Summary Stats Cards */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4" data-testid="mastery-summary-cards">
        <div className="card border border-[var(--border)] space-y-1">
          <div className="flex items-center justify-between text-ink-400">
            <span className="text-xs uppercase tracking-wide font-mono">
              {useSw ? "Uelewa wa Jumla" : "Overall Mastery"}
            </span>
            <TrendingUp size={16} className="text-brand-400" />
          </div>
          <div className="font-display text-2xl font-bold text-ink-50" data-testid="stat-average-mastery">
            {formatPercent(summary.average_mastery)}
          </div>
          <p className="text-xs text-ink-500">
            {useSw ? "Wastani wa majaribio ya mwisho 5" : "Rolling average of recent checks"}
          </p>
        </div>

        <div className="card border border-[var(--border)] space-y-1">
          <div className="flex items-center justify-between text-ink-400">
            <span className="text-xs uppercase tracking-wide font-mono">
              {useSw ? "Zilizoimarika" : "Mastered Topics"}
            </span>
            <CheckCircle2 size={16} className="text-emerald-400" />
          </div>
          <div className="font-display text-2xl font-bold text-emerald-400" data-testid="stat-mastered-count">
            {summary.mastered || 0}
            <span className="text-sm font-normal text-ink-400"> / {summary.total_substrands || 0}</span>
          </div>
          <p className="text-xs text-ink-500">
            {useSw ? "Alama ya 80% au zaidi" : "80%+ score on formative checks"}
          </p>
        </div>

        <div className="card border border-[var(--border)] space-y-1">
          <div className="flex items-center justify-between text-ink-400">
            <span className="text-xs uppercase tracking-wide font-mono">
              {useSw ? "Zinazoendelea" : "In Progress"}
            </span>
            <Clock size={16} className="text-amber-400" />
          </div>
          <div className="font-display text-2xl font-bold text-amber-400" data-testid="stat-in-progress-count">
            {summary.in_progress || 0}
          </div>
          <p className="text-xs text-ink-500">
            {useSw ? "Mada zilizofanyiwa kazi" : "50%–79% formative score"}
          </p>
        </div>

        <div className="card border border-[var(--border)] space-y-1">
          <div className="flex items-center justify-between text-ink-400">
            <span className="text-xs uppercase tracking-wide font-mono">
              {useSw ? "Masomo Yaliyotazamwa" : "Explored Lessons"}
            </span>
            <BookOpen size={16} className="text-indigo-400" />
          </div>
          <div className="font-display text-2xl font-bold text-indigo-400" data-testid="stat-explored-count">
            {recent.length}
          </div>
          <p className="text-xs text-ink-500">
            {useSw ? "Shughuli za hivi karibuni" : "Active lesson sessions"}
          </p>
        </div>
      </section>

      {/* 3. Recommendation Card ("What's Next") */}
      {recommendation && (
        <section
          className="card border border-brand-500/30 bg-gradient-to-r from-brand-950/20 via-surface-card to-surface-card space-y-4"
          data-testid="recommendation-card"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-lg bg-brand-500/10 text-brand-400 border border-brand-500/20">
                <Sparkles size={18} />
              </span>
              <div>
                <span className="text-xs font-mono uppercase tracking-wide text-brand-400 font-semibold">
                  {recommendation.type === "review"
                    ? useSw
                      ? "Inapendekezwa Kurudia"
                      : "Review Recommended"
                    : recommendation.type === "resume"
                    ? useSw
                      ? "Endelea Kujifunza"
                      : "Continue Learning"
                    : recommendation.type === "next"
                    ? useSw
                      ? "Mada Inayofuata"
                      : "What's Next"
                    : useSw
                    ? "Anza Safari Yako"
                    : "Get Started"}
                </span>
                <h3 className="font-display text-lg font-bold text-ink-50">
                  {recommendation.title || (useSw ? "Somo Linalofuata" : "Recommended Lesson")}
                </h3>
              </div>
            </div>

            {recommendation.lesson_id && (
              <button
                onClick={() => navigate(`/lesson/${recommendation.lesson_id}`)}
                className="btn-primary inline-flex items-center gap-2 text-sm self-start sm:self-auto shrink-0"
                data-testid="recommendation-action-btn"
              >
                {recommendation.type === "review"
                  ? useSw
                    ? "Rudia Somo"
                    : "Review Lesson"
                  : recommendation.type === "resume"
                  ? useSw
                    ? "Endelea na Somo"
                    : "Resume Lesson"
                  : useSw
                  ? "Anza Somo"
                  : "Start Lesson"}
                <ArrowRight size={16} />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-ink-400">
            {recommendation.subject_name && (
              <span className="px-2 py-0.5 rounded bg-ink-800 text-ink-300 font-medium">
                {recommendation.subject_name}
              </span>
            )}
            {recommendation.strand_name && (
              <span>• {recommendation.strand_name}</span>
            )}
            <p className="w-full text-ink-300 text-sm mt-1">{recommendation.message}</p>
          </div>
        </section>
      )}

      {/* 4. Curriculum Heatmap (Strands x Mastery Color) */}
      <section className="space-y-4" data-testid="mastery-heatmap-section">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-bold text-ink-100 flex items-center gap-2">
              <Layers size={20} className="text-brand-400" />
              {useSw ? "Ramani ya Uelewa wa Mtaala" : "Curriculum Mastery Heatmap"}
            </h2>
            <p className="text-xs text-ink-400 mt-0.5">
              {useSw
                ? "Muonekano wa mada (strands) na mada ndogo zenye rangi ya uelewa. Chagua mada yoyote ili kusoma."
                : "Visual strand x mastery progression. Click any topic block to jump directly to its lesson."}
            </p>
          </div>

          {/* Subject Filter Tabs */}
          {subjects.length > 1 && (
            <div className="flex flex-wrap gap-1.5" data-testid="subject-filter-tabs">
              <button
                onClick={() => setActiveSubject("all")}
                className={clsx(
                  "px-3 py-1 rounded-lg text-xs font-mono transition-colors",
                  activeSubject === "all"
                    ? "bg-brand-500 text-white font-semibold"
                    : "bg-ink-800 text-ink-400 hover:text-ink-200"
                )}
              >
                {useSw ? "Masomo Yote" : "All Subjects"}
              </button>
              {subjects.map((s) => (
                <button
                  key={s.code}
                  onClick={() => setActiveSubject(s.code)}
                  className={clsx(
                    "px-3 py-1 rounded-lg text-xs font-mono transition-colors",
                    activeSubject === s.code
                      ? "bg-brand-500 text-white font-semibold"
                      : "bg-ink-800 text-ink-400 hover:text-ink-200"
                  )}
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Heatmap Legend */}
        <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-ink-400 bg-ink-900/60 p-3 rounded-xl border border-[var(--border)]" data-testid="heatmap-legend">
          <span className="text-ink-300 font-semibold">{useSw ? "Kielelezo:" : "Legend:"}</span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-emerald-500/80" />
            {useSw ? "Imestadiwa (≥80%)" : "Mastered (≥80%)"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-amber-500/80" />
            {useSw ? "Inaendelea (50–79%)" : "In Progress (50–79%)"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-indigo-500/80" />
            {useSw ? "Inapendekezwa Kurudia (<50%)" : "Review Recommended (<50%)"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-ink-700" />
            {useSw ? "Bado Kuanza" : "Not Started"}
          </span>
        </div>

        {/* Heatmap Grid by Subject */}
        <div className="space-y-6" data-testid="mastery-heatmap">
          {filteredSubjects.map((subj) => (
            <div key={subj.id || subj.code} className="card border border-[var(--border)] space-y-4">
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                <div>
                  <h3 className="font-display font-semibold text-ink-100">{subj.name}</h3>
                  <span className="text-xs text-ink-400">{subj.grade_name}</span>
                </div>
                <span className="text-xs font-mono text-ink-400">
                  {subj.strands.length} {useSw ? "mada" : "strands"}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {subj.strands.map((strand) => {
                  const cfg = BADGE_CONFIG[strand.badge] || BADGE_CONFIG.new;
                  return (
                    <div
                      key={strand.id}
                      className="p-3.5 rounded-xl border border-[var(--border)] bg-surface-base space-y-3"
                      data-testid="strand-heatmap-card"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm text-ink-200 truncate">
                          {strand.name}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          {strand.mastery_score !== null && (
                            <span className="text-xs font-mono text-ink-300">
                              {formatPercent(strand.mastery_score)}
                            </span>
                          )}
                          <span className={clsx("text-[10px] uppercase font-mono px-2 py-0.5 rounded", cfg.badgeClass)}>
                            {cfg.label[lang] || cfg.label.en}
                          </span>
                        </div>
                      </div>

                      {/* Sub-strands Heatmap Cells */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {strand.substrands.map((ss) => {
                          const ssCfg = BADGE_CONFIG[ss.badge] || BADGE_CONFIG.new;
                          return (
                            <button
                              key={ss.id}
                              onClick={() => {
                                if (ss.lesson_id) {
                                  navigate(`/lesson/${ss.lesson_id}`);
                                } else {
                                  navigate("/browse");
                                }
                              }}
                              className={clsx(
                                "p-2 rounded-lg border text-left transition-all duration-200 group flex flex-col justify-between min-h-[56px]",
                                ssCfg.bgClass
                              )}
                              title={`${ss.name} — ${ssCfg.label[lang] || ssCfg.label.en} (${formatPercent(ss.mastery_score)})`}
                              data-testid="substrand-cell"
                            >
                              <span className="text-xs font-medium line-clamp-1 group-hover:underline">
                                {ss.name}
                              </span>
                              <div className="flex items-center justify-between mt-1 text-[10px] font-mono opacity-80">
                                <span>{formatPercent(ss.mastery_score)}</span>
                                <span className={clsx("w-1.5 h-1.5 rounded-full", ssCfg.dotClass)} />
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 5. Recent Activity List */}
      <section className="space-y-4" data-testid="recent-activity-section">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-ink-100 flex items-center gap-2">
            <Clock size={20} className="text-brand-400" />
            {useSw ? "Shughuli za Hivi Karibuni" : "Recent Activity"}
          </h2>
          <span className="text-xs font-mono text-ink-400">
            {recent.length} {useSw ? "masomo" : "lessons"}
          </span>
        </div>

        {recent.length === 0 ? (
          <div className="card text-center py-12 border border-[var(--border)] space-y-3" data-testid="recent-empty">
            <BookOpen className="w-10 h-10 text-ink-500 mx-auto" />
            <h3 className="font-display font-semibold text-ink-200">
              {useSw ? "Bado hujaanza somo lolote" : "No lessons started yet"}
            </h3>
            <p className="text-sm text-ink-400 max-w-sm mx-auto">
              {useSw
                ? "Chunguza mtaala wetu uliolinganishwa na CBC na uanze somo lako la kwanza."
                : "Explore our CBC-aligned curriculum catalog to begin your learning journey."}
            </p>
            <button
              onClick={() => navigate("/browse")}
              className="btn-primary inline-flex items-center gap-2 text-sm mx-auto mt-2"
            >
              <Compass size={16} />
              {useSw ? "Anza Kujifunza" : "Start Learning"}
            </button>
          </div>
        ) : (
          <div className="card p-0 border border-[var(--border)] overflow-hidden" data-testid="recent-activity-list">
            <div className="divide-y divide-[var(--border)]">
              {recent.map((item) => {
                const cfg = BADGE_CONFIG[item.badge] || BADGE_CONFIG.new;
                return (
                  <div
                    key={item.lesson_id}
                    className="p-4 hover:bg-white/[0.02] transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    data-testid="recent-activity-item"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs px-2 py-0.5 rounded bg-ink-800 text-ink-300 font-medium">
                          {item.subject_name}
                        </span>
                        <span className="text-xs text-ink-400">• {item.strand_name}</span>
                        {item.status && (
                          <span className="text-[10px] font-mono uppercase tracking-wider text-ink-400 px-1.5 py-0.5 rounded bg-ink-800/60">
                            {item.status}
                          </span>
                        )}
                      </div>
                      <h4 className="font-display font-semibold text-ink-100 text-base">
                        {item.title}
                      </h4>
                      <p className="text-xs text-ink-400">
                        {useSw ? "Mada Ndogo:" : "Sub-strand:"} {item.substrand_name}
                        {item.attempts > 0 && ` • ${item.attempts} ${useSw ? "majaribio" : "attempts"}`}
                      </p>
                    </div>

                    <div className="flex items-center gap-4 self-start sm:self-auto shrink-0">
                      {/* Formative score indicator */}
                      <div className="text-right">
                        <div className="text-xs text-ink-400 font-mono">
                          {item.last_score !== null ? (
                            <span className="font-semibold text-ink-200">
                              {formatPercent(item.last_score)}
                            </span>
                          ) : (
                            <span className="text-ink-500">{useSw ? "Haijatathminiwa" : "Viewed"}</span>
                          )}
                        </div>
                        <span className={clsx("text-[10px] uppercase font-mono px-1.5 py-0.5 rounded", cfg.badgeClass)}>
                          {cfg.label[lang] || cfg.label.en}
                        </span>
                      </div>

                      <button
                        onClick={() => navigate(`/lesson/${item.lesson_id}`)}
                        className="btn-ghost inline-flex items-center gap-1.5 text-xs font-medium"
                        data-testid="resume-lesson-btn"
                      >
                        {item.status === "assessed"
                          ? useSw
                            ? "Rudia"
                            : "Review"
                          : useSw
                          ? "Endelea"
                          : "Resume"}
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
