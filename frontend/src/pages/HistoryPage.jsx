import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  Search, Filter, ArrowRight, BookOpen,
  CheckCircle2, Clock, AlertCircle, RotateCcw,
  ChevronDown, ChevronUp, TrendingUp,
} from "lucide-react";
import { lessonApi } from "../lib/api.js";
import { useStore } from "../lib/store.js";
import clsx from "clsx";

const STATUS_CONFIG = {
  complete:    { label: "Complete",  color: "badge-green",  Icon: CheckCircle2 },
  diagnosing:  { label: "Diagnosing",color: "badge-gold",   Icon: Clock },
  scripting:   { label: "Scripting", color: "badge-gold",   Icon: Clock },
  animating:   { label: "Animating", color: "badge-gold",   Icon: Clock },
  error:       { label: "Error",     color: "badge text-red-400 bg-red-500/10 border-red-500/20", Icon: AlertCircle },
  initialised: { label: "Queued",    color: "badge-muted",  Icon: Clock },
};

const STRANDS = [
  "All Strands", "mathematics","english","kiswahili","science_technology",
  "social_studies","business_studies","agriculture",
];

function StatusChip({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.initialised;
  return <span className={cfg.color}><cfg.Icon size={10} />{cfg.label}</span>;
}

function ScoreBar({ score }) {
  if (score == null) return <span className="text-ink-700 text-xs">—</span>;
  const pct   = parseFloat(score);
  const color = pct >= 80 ? "bg-brand-500" : pct >= 60 ? "bg-gold-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-ink-800 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className={clsx("h-full rounded-full", color)}
        />
      </div>
      <span className="font-mono text-xs text-ink-400">{pct.toFixed(0)}%</span>
    </div>
  );
}

function SortHeader({ label, field, sort, setSort }) {
  const active = sort.field === field;
  return (
    <button
      onClick={() => setSort({ field, dir: active && sort.dir === "asc" ? "desc" : "asc" })}
      className="flex items-center gap-1 text-xs font-semibold text-ink-500 uppercase tracking-wide hover:text-ink-300 transition-colors font-body"
    >
      {label}
      {active ? (sort.dir === "asc" ? <ChevronUp size={11} /> : <ChevronDown size={11} />) : <ChevronDown size={11} className="opacity-30" />}
    </button>
  );
}

export default function HistoryPage() {
  const navigate = useNavigate();
  const user     = useStore((s) => s.user);

  const [lessons,  setLessons]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState("");
  const [strand,   setStrand]   = useState("All Strands");
  const [status,   setStatus]   = useState("All");
  const [sort,     setSort]     = useState({ field: "created_at", dir: "desc" });

  useEffect(() => {
    lessonApi.history(user?.school_id || "school_001", { limit: 50 })
      .then((r) => setLessons(r.data.lessons || []))
      .catch(() => setLessons([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let out = [...lessons];
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter((l) => l.topic.toLowerCase().includes(q) || l.grade_level?.includes(q));
    }
    if (strand !== "All Strands") out = out.filter((l) => l.strand === strand);
    if (status !== "All")         out = out.filter((l) => l.workflow_status === status);

    out.sort((a, b) => {
      let va = a[sort.field], vb = b[sort.field];
      if (sort.field === "created_at") { va = new Date(va); vb = new Date(vb); }
      if (sort.field === "diagnostic_score") { va = parseFloat(va||0); vb = parseFloat(vb||0); }
      if (va < vb) return sort.dir === "asc" ? -1 : 1;
      if (va > vb) return sort.dir === "asc" ?  1 : -1;
      return 0;
    });
    return out;
  }, [lessons, search, strand, status, sort]);

  // Stats
  const stats = useMemo(() => {
    const done = lessons.filter((l) => l.workflow_status === "complete");
    const avg  = done.length ? done.reduce((a,l)=>a+parseFloat(l.diagnostic_score||0),0)/done.length : 0;
    return { total: lessons.length, complete: done.length, avg: avg.toFixed(0) };
  }, [lessons]);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="font-display text-3xl font-semibold text-ink-100">Lesson History</h1>
        <p className="text-ink-500 text-sm font-body mt-1">{user?.school}</p>
      </motion.div>

      {/* Summary stats */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="grid grid-cols-3 gap-4"
      >
        {[
          { label: "Total Lessons", value: stats.total, icon: BookOpen,     color: "text-brand-400" },
          { label: "Completed",     value: stats.complete, icon: CheckCircle2, color: "text-jade-400" },
          { label: "Avg Score",     value: `${stats.avg}%`, icon: TrendingUp,  color: "text-gold-400" },
        ].map(({ label, value, icon: Icon, color }, i) => (
          <div key={label} className="card flex items-center gap-4">
            <Icon size={20} className={color} />
            <div>
              <p className="font-display text-2xl font-semibold text-ink-100">{value}</p>
              <p className="text-xs text-ink-500 font-body">{label}</p>
            </div>
          </div>
        ))}
      </motion.div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.14 }}
        className="flex flex-wrap items-center gap-3"
      >
        {/* Search */}
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-600" />
          <input
            className="input pl-9 text-sm"
            placeholder="Search topic or grade…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Strand filter */}
        <select
          value={strand}
          onChange={(e) => setStrand(e.target.value)}
          className="input text-sm w-auto pr-8 cursor-pointer"
          style={{ backgroundImage: "none" }}
        >
          {STRANDS.map((s) => <option key={s} value={s}>{s.replace(/_/g," ")}</option>)}
        </select>

        {/* Status filter */}
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="input text-sm w-auto pr-8 cursor-pointer"
          style={{ backgroundImage: "none" }}
        >
          {["All","complete","diagnosing","scripting","error","initialised"].map((s) => (
            <option key={s} value={s}>{s.replace(/_/g," ")}</option>
          ))}
        </select>

        <div className="flex items-center gap-1.5 text-xs text-ink-600 font-body">
          <Filter size={12} />
          <span>{filtered.length} results</span>
        </div>
      </motion.div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="card !p-0 overflow-hidden"
      >
        {/* Table header */}
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_40px] gap-4 px-5 py-3 border-b border-[var(--border)] bg-ink-900/40">
          <SortHeader label="Topic"       field="topic"            sort={sort} setSort={setSort} />
          <SortHeader label="Strand"      field="strand"           sort={sort} setSort={setSort} />
          <SortHeader label="Grade"       field="grade_level"      sort={sort} setSort={setSort} />
          <SortHeader label="Status"      field="workflow_status"  sort={sort} setSort={setSort} />
          <SortHeader label="Score"       field="diagnostic_score" sort={sort} setSort={setSort} />
          <div />
        </div>

        {/* Rows */}
        {loading ? (
          <div className="divide-y divide-[var(--border)]">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_40px] gap-4 px-5 py-4">
                <div className="shimmer-bg h-4 rounded w-3/4" />
                <div className="shimmer-bg h-4 rounded w-2/3" />
                <div className="shimmer-bg h-4 rounded w-1/2" />
                <div className="shimmer-bg h-4 rounded w-2/3" />
                <div className="shimmer-bg h-4 rounded w-full" />
                <div />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
            <BookOpen size={32} className="text-ink-800" />
            <p className="text-ink-500 font-body text-sm">No lessons match your filters.</p>
          </div>
        ) : (
          <AnimatePresence>
            <div className="divide-y divide-[var(--border)]">
              {filtered.map((lesson, i) => (
                <motion.button
                  key={lesson.lesson_id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.03 }}
                  onClick={() => navigate(`/lesson/${lesson.lesson_id}`)}
                  className="w-full grid grid-cols-[2fr_1fr_1fr_1fr_1fr_40px] gap-4 px-5 py-4 hover:bg-white/3 transition-colors text-left group items-center"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium font-body text-ink-200 truncate group-hover:text-ink-100 transition-colors">
                      {lesson.topic}
                    </p>
                    <p className="text-[11px] text-ink-600 font-mono mt-0.5">{lesson.lesson_id.slice(0, 8)}…</p>
                  </div>
                  <p className="text-xs text-ink-400 font-body truncate capitalize">
                    {lesson.strand?.replace(/_/g, " ")}
                  </p>
                  <p className="text-xs text-ink-400 font-body capitalize">
                    {lesson.grade_level?.replace("_", " ")}
                  </p>
                  <StatusChip status={lesson.workflow_status} />
                  <ScoreBar score={lesson.diagnostic_score} />
                  <ArrowRight
                    size={14}
                    className="text-ink-700 group-hover:text-ink-400 group-hover:translate-x-0.5 transition-all"
                  />
                </motion.button>
              ))}
            </div>
          </AnimatePresence>
        )}
      </motion.div>
    </div>
  );
}
