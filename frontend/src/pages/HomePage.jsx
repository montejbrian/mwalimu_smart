import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import {
  Compass,
  BookOpen,
  CheckCircle2,
  Languages,
  MessageSquare,
  ArrowRight,
  PenTool,
  Calculator,
  FlaskConical,
  BookText,
} from "lucide-react";
import { useStore, useCatalogStore } from "../lib/store.js";
import LevelCard from "../components/catalog/LevelCard.jsx";
import MasteryBadge from "../components/catalog/MasteryBadge.jsx";

const SUBJECT_ICONS = {
  mathematics: Calculator,
  integrated_science: FlaskConical,
  science_and_technology: FlaskConical,
  english: BookText,
  kiswahili: Languages,
};

export default function HomePage() {
  const navigate = useNavigate();
  const user = useStore((s) => s.user);
  const language = useStore((s) => s.language);
  const lang = language === "sw" ? "sw" : "en";
  const isTeacher = user?.role === "teacher" || user?.role === "admin";

  const levels = useCatalogStore((s) => s.levels);
  const subjectsByGrade = useCatalogStore((s) => s.subjectsByGrade);
  const fetchLevels = useCatalogStore((s) => s.fetchLevels);
  const fetchSubjects = useCatalogStore((s) => s.fetchSubjects);

  const grade7Subjects = subjectsByGrade[71] || [];

  useEffect(() => {
    fetchLevels(lang).catch(() => {});
    fetchSubjects(71, lang).catch(() => {});
  }, [lang]);

  function handleSelectLevel(level) {
    navigate(`/browse?level_id=${level.id}`);
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8" data-testid="home-page">
      {/* Hero Banner */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl glass border border-[var(--border)] p-6 md:p-8 relative overflow-hidden"
      >
        <div className="absolute -right-12 -top-12 w-72 h-72 rounded-full bg-brand-500/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="badge-green">
                <CheckCircle2 size={12} />
                {lang === "sw"
                  ? "Mtaala wa KICD CBC · Uliothibitishwa na Walimu"
                  : "KICD CBC Curriculum · Teacher-Reviewed"}
              </span>
              <span className="badge-gold">
                <Languages size={12} />
                {lang === "sw" ? "Kiingereza & Kiswahili" : "English & Kiswahili"}
              </span>
            </div>

            <h1 className="font-display text-2xl md:text-3xl font-semibold text-ink-100 leading-tight">
              {lang === "sw"
                ? `Karibu, ${user?.name || "Mwanafunzi"}! Chagua mada uanze kujifunza.`
                : `Welcome back, ${user?.name || "Learner"}! Pick a curriculum topic to begin.`}
            </h1>

            <p className="text-sm text-ink-400 font-body leading-relaxed">
              {lang === "sw"
                ? "Masomo yote yametayarishwa na kukaguliwa na walimu mapema. Soma hati, tazama maelezo, fanya tathmini ya umahiri, na uliza maswali ya ziada wakati wowote."
                : "Every lesson is pre-authored and teacher-reviewed so you never wait. Read or watch immediately, check your understanding with formative questions, and ask lesson-aware follow-ups."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 flex-shrink-0">
            <button
              type="button"
              data-testid="cta-browse-curriculum"
              onClick={() => navigate("/browse")}
              className="btn-primary"
            >
              <Compass size={16} />
              <span>
                {lang === "sw" ? "Vinjari Mtaala wa CBC" : "Browse CBC Curriculum"}
              </span>
              <ArrowRight size={15} />
            </button>

            {isTeacher && (
              <button
                type="button"
                data-testid="cta-teacher-authoring"
                onClick={() => navigate("/authoring")}
                className="btn-ghost"
              >
                <PenTool size={16} />
                <span>
                  {lang === "sw" ? "Studio ya Walimu" : "Authoring Studio"}
                </span>
              </button>
            )}
          </div>
        </div>
      </motion.div>

      {/* Featured Grade 7 Subjects */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink-100">
              {lang === "sw"
                ? "Sekondari ya Awali · Gredi ya 7"
                : "Junior Secondary · Grade 7 Library"}
            </h2>
            <p className="text-xs text-ink-400 font-body">
              {lang === "sw"
                ? "Fungua somo moja kwa moja kwenye mada kuu na mada ndogo za KICD"
                : "Jump straight into KICD strands and sub-strands"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate("/browse")}
            className="text-xs text-brand-400 hover:text-brand-300 font-medium inline-flex items-center gap-1"
          >
            <span>{lang === "sw" ? "Ona gredi zote" : "View all grades"}</span>
            <ArrowRight size={13} />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {grade7Subjects.map((subj) => {
            const Icon = SUBJECT_ICONS[subj.code] || BookOpen;
            const title = lang === "sw" ? subj.name_sw : subj.name_en;
            return (
              <button
                key={subj.code}
                type="button"
                data-testid={`featured-subject-${subj.code}`}
                onClick={() => navigate(`/browse/71/${subj.code}`)}
                className="card text-left group flex flex-col justify-between gap-4 border border-[var(--border)] hover:border-brand-500/40"
              >
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-brand-500/15 text-brand-400 flex items-center justify-center group-hover:bg-brand-500 group-hover:text-white transition-colors">
                    <Icon size={20} />
                  </div>
                  <span className="badge-muted text-[11px]">Grade 7</span>
                </div>

                <div>
                  <h3 className="font-display text-base font-semibold text-ink-100 mb-1 group-hover:text-brand-400 transition-colors">
                    {title}
                  </h3>
                  <p className="text-xs text-ink-400 font-body flex items-center gap-1">
                    <span>
                      {lang === "sw" ? "Fungua mada kuu" : "Explore strands"}
                    </span>
                    <ArrowRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* CBC Education Levels */}
      <section className="space-y-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink-100">
            {lang === "sw" ? "Ngazi za Elimu ya CBC" : "CBC Education Levels"}
          </h2>
          <p className="text-xs text-ink-400 font-body">
            {lang === "sw"
              ? "Elimu ya Awali, Msingi, Sekondari ya Awali na Sekondari ya Juu"
              : "Pre-Primary, Primary, Junior Secondary, and Senior Secondary"}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {levels.map((level) => (
            <LevelCard
              key={level.id}
              level={level}
              onSelect={handleSelectLevel}
            />
          ))}
        </div>
      </section>

      {/* Formative Mastery Legend */}
      <section className="rounded-2xl glass border border-[var(--border)] p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h3 className="font-display text-sm font-semibold text-ink-100 flex items-center gap-2">
            <MessageSquare size={15} className="text-brand-400" />
            <span>
              {lang === "sw"
                ? "Tathmini ya Umahiri (Bila Vikwazo)"
                : "Formative Mastery (Never Punitive)"}
            </span>
          </h3>
          <p className="text-xs text-ink-400 font-body">
            {lang === "sw"
              ? "Tathmini haikuzuii kuendelea mbele — inaonyesha maendeleo yako na kupendekeza mada za kurudia."
              : "Assessments never block your progression — they record mastery and guide what to review next."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <MasteryBadge badge="new" lang={lang} />
          <MasteryBadge badge="in_progress" lang={lang} />
          <MasteryBadge badge="mastered" lang={lang} />
          <MasteryBadge badge="review_recommended" lang={lang} />
        </div>
      </section>
    </div>
  );
}
