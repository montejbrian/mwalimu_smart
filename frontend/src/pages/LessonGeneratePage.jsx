import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { BookOpen, Sparkles, ChevronDown, ArrowRight, Loader2 } from "lucide-react";
import { lessonApi } from "../lib/api.js";
import { useStore } from "../lib/store.js";
import toast from "react-hot-toast";
import clsx from "clsx";

const CBC_STRANDS = [
  { value: "mathematics",        label: "Mathematics" },
  { value: "english",            label: "English" },
  { value: "kiswahili",          label: "Kiswahili" },
  { value: "science_technology", label: "Science & Technology" },
  { value: "social_studies",     label: "Social Studies" },
  { value: "business_studies",   label: "Business Studies" },
  { value: "agriculture",        label: "Agriculture" },
  { value: "creative_arts",      label: "Creative Arts" },
  { value: "physical_health",    label: "Physical Health" },
];

const GRADES = Array.from({ length: 12 }, (_, i) => ({
  value: `grade_${i + 1}`, label: `Grade ${i + 1}`,
}));

function Select({ label, value, onChange, options, placeholder }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <div className="relative">
      <label className="text-xs font-medium text-ink-400 mb-1.5 block font-body">{label}</label>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={clsx(
          "input w-full flex items-center justify-between text-left",
          !selected && "text-ink-500"
        )}
      >
        <span>{selected?.label || placeholder}</span>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown size={16} className="text-ink-500" />
        </motion.div>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scaleY: 0.95 }}
            animate={{ opacity: 1, y: 0, scaleY: 1 }}
            exit={{ opacity: 0, y: -8, scaleY: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full mt-1 left-0 right-0 z-50 glass border border-[var(--border)] rounded-xl overflow-hidden shadow-card max-h-56 overflow-y-auto"
          >
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={clsx(
                  "w-full text-left px-4 py-2.5 text-sm font-body transition-colors",
                  value === opt.value
                    ? "text-brand-400 bg-brand-500/10"
                    : "text-ink-300 hover:bg-white/5"
                )}
              >
                {opt.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const STEPS = ["Topic", "Grade & Strand", "Language", "Review"];

export default function LessonGeneratePage() {
  const navigate = useNavigate();
  const user     = useStore((s) => s.user);
  const setActiveLesson = useStore((s) => s.setActiveLesson);

  const [step,     setStep]     = useState(0);
  const [loading,  setLoading]  = useState(false);
  const [form, setForm] = useState({
    topic:       "",
    strand:      "",
    grade_level: "",
    language:    "en",
  });

  function update(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  function canAdvance() {
    if (step === 0) return form.topic.trim().length >= 3;
    if (step === 1) return form.strand && form.grade_level;
    if (step === 2) return form.language;
    return true;
  }

  async function handleSubmit() {
    setLoading(true);
    try {
      const res = await lessonApi.generate({
        ...form,
        school_id:  user?.school_id  || "school_001",
        teacher_id: user?.teacher_id || "teacher_001",
      });
      const { lesson_id } = res.data;
      setActiveLesson(lesson_id, "initialised");
      toast.success("Lesson generation started!");
      navigate(`/lesson/${lesson_id}`);
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to start lesson");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="font-display text-3xl font-semibold text-ink-100">
          Generate Lesson
        </h1>
        <p className="text-ink-500 text-sm font-body mt-1">
          KICD RAG-powered · CBC-compliant · Manim animations
        </p>
      </motion.div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <React.Fragment key={s}>
            <motion.div
              animate={{
                backgroundColor: i === step ? "#22c55e" : i < step ? "#166534" : "rgba(255,255,255,0.05)",
              }}
              className={clsx(
                "flex items-center justify-center w-7 h-7 rounded-full text-xs font-medium font-body transition-all",
                i === step ? "text-white shadow-glow-green" : i < step ? "text-brand-400" : "text-ink-600"
              )}
            >
              {i < step ? "✓" : i + 1}
            </motion.div>
            {i < STEPS.length - 1 && (
              <motion.div
                animate={{ backgroundColor: i < step ? "#166534" : "rgba(255,255,255,0.06)" }}
                className="flex-1 h-px transition-all duration-500"
              />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Form card */}
      <motion.div
        key={step}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="card space-y-5"
      >
        <div className="flex items-center gap-2 mb-1">
          <BookOpen size={16} className="text-brand-400" />
          <h2 className="font-body font-semibold text-ink-200 text-sm">{STEPS[step]}</h2>
        </div>

        {step === 0 && (
          <div>
            <label className="text-xs font-medium text-ink-400 mb-1.5 block font-body">
              What topic do you want to teach?
            </label>
            <input
              className="input"
              placeholder="e.g. Photosynthesis, Supply and Demand, Pythagoras' Theorem…"
              value={form.topic}
              onChange={(e) => update("topic", e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && canAdvance() && setStep(1)}
              autoFocus
            />
            <p className="text-xs text-ink-600 mt-2 font-body">
              The Researcher will query KICD-approved materials for this topic.
            </p>
          </div>
        )}

        {step === 1 && (
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="CBC Strand"
              value={form.strand}
              onChange={(v) => update("strand", v)}
              options={CBC_STRANDS}
              placeholder="Select strand…"
            />
            <Select
              label="Grade Level"
              value={form.grade_level}
              onChange={(v) => update("grade_level", v)}
              options={GRADES}
              placeholder="Select grade…"
            />
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <p className="text-xs font-medium text-ink-400 font-body">Lesson language</p>
            <div className="grid grid-cols-2 gap-3">
              {[{ value: "en", label: "English", sub: "English (Kenya)" }, { value: "sw", label: "Kiswahili", sub: "Kiswahili (KE)" }].map((l) => (
                <motion.button
                  key={l.value}
                  type="button"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => update("language", l.value)}
                  className={clsx(
                    "p-4 rounded-xl border text-left transition-all",
                    form.language === l.value
                      ? "border-brand-500/50 bg-brand-500/10 text-brand-400"
                      : "border-[var(--border)] glass text-ink-400 hover:border-ink-600"
                  )}
                >
                  <p className="font-body font-medium text-sm">{l.label}</p>
                  <p className="text-xs opacity-60 mt-0.5">{l.sub}</p>
                </motion.button>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <p className="text-xs font-medium text-ink-500 uppercase tracking-wide font-body mb-4">Lesson summary</p>
            {[
              { label: "Topic",       value: form.topic },
              { label: "Strand",      value: CBC_STRANDS.find(s=>s.value===form.strand)?.label },
              { label: "Grade",       value: GRADES.find(g=>g.value===form.grade_level)?.label },
              { label: "Language",    value: form.language === "en" ? "English" : "Kiswahili" },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between py-2 border-b border-[var(--border)] last:border-0">
                <span className="text-xs text-ink-500 font-body">{label}</span>
                <span className="text-sm font-medium text-ink-200 font-body">{value}</span>
              </div>
            ))}
            <div className="mt-4 p-3 rounded-xl bg-brand-500/8 border border-brand-500/20">
              <p className="text-xs text-brand-400 font-body">
                <Sparkles size={11} className="inline mr-1" />
                The AI pipeline will run: Researcher → Scriptwriter → Diagnostic → Animator
              </p>
            </div>
          </div>
        )}
      </motion.div>

      {/* Navigation buttons */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className="btn-ghost disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Back
        </button>
        {step < 3 ? (
          <motion.button
            whileHover={{ scale: canAdvance() ? 1.02 : 1 }}
            whileTap={{ scale: canAdvance() ? 0.98 : 1 }}
            onClick={() => setStep((s) => s + 1)}
            disabled={!canAdvance()}
            className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Continue <ArrowRight size={15} />
          </motion.button>
        ) : (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleSubmit}
            disabled={loading}
            className="btn-primary"
          >
            {loading ? <><Loader2 size={15} className="animate-spin" /> Generating…</> : <><Sparkles size={15} /> Generate Lesson</>}
          </motion.button>
        )}
      </div>
    </div>
  );
}
