import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  PenTool,
  Sparkles,
  ClipboardCheck,
  RefreshCw,
  Layers,
  CheckCircle2,
  Clock,
  AlertCircle,
  ArrowRight,
} from "lucide-react";
import clsx from "clsx";
import toast from "react-hot-toast";
import {
  useStore,
  useCatalogStore,
  useAuthoringStore,
} from "../../lib/store.js";

const TIERS = [
  {
    id: "featured",
    label: { en: "Featured (Script + Video)", sw: "Maalum (Hati + Video)" },
    desc: {
      en: "Generates bilingual script, MCQs, and queues Manim video render on publish.",
      sw: "Inatengeneza hati ya EN/SW, maswali, na video ya Manim.",
    },
  },
  {
    id: "standard",
    label: { en: "Standard (Script + MCQs)", sw: "Kawaida (Hati + Maswali)" },
    desc: {
      en: "Fast bilingual script + transcript + formative MCQs for teacher review.",
      sw: "Hati ya lugha mbili, nakala, na maswali ya kujipima.",
    },
  },
  {
    id: "on_demand",
    label: { en: "On-Demand Draft", sw: "Rasimu ya Haraka" },
    desc: {
      en: "Lightweight curriculum draft for lower-traffic sub-strands.",
      sw: "Rasimu nyepesi ya mada ndogo.",
    },
  },
];

export default function AuthoringDashboard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedSubstrandId = searchParams.get("substrand_id") || "";

  const language = useStore((s) => s.language);
  const lang = language === "sw" ? "sw" : "en";

  const {
    gradesByLevel,
    subjectsByGrade,
    strandsByKey,
    substrandsByStrand,
    fetchGrades,
    fetchSubjects,
    fetchStrands,
    fetchSubstrands,
  } = useCatalogStore();

  const { jobs, loading, fetchJobs, enqueueJob } = useAuthoringStore();

  const [gradeId, setGradeId] = useState(71);
  const [subjectCode, setSubjectCode] = useState("mathematics");
  const [strandId, setStrandId] = useState("");
  const [substrandId, setSubstrandId] = useState(preselectedSubstrandId);
  const [tier, setTier] = useState("standard");
  const [enqueuing, setEnqueuing] = useState(false);

  useEffect(() => {
    fetchGrades(3).catch(() => {});
    fetchJobs().catch(() => {});
  }, []);

  useEffect(() => {
    if (!gradeId) return;
    fetchSubjects(gradeId, lang).catch(() => {});
  }, [gradeId, lang]);

  useEffect(() => {
    if (!gradeId || !subjectCode) return;
    fetchStrands(gradeId, subjectCode, lang)
      .then((list) => {
        if (list && list.length > 0 && !strandId) {
          setStrandId(list[0].id);
        }
      })
      .catch(() => {});
  }, [gradeId, subjectCode, lang]);

  useEffect(() => {
    if (!strandId) return;
    fetchSubstrands(strandId, lang)
      .then((subs) => {
        if (subs && subs.length > 0 && !substrandId) {
          setSubstrandId(subs[0].id);
        }
      })
      .catch(() => {});
  }, [strandId, lang]);

  const grades = gradesByLevel[3] || [{ id: 71, name: "Grade 7" }];
  const subjects = subjectsByGrade[gradeId] || [];
  const strands = strandsByKey[`${gradeId}:${subjectCode}`] || [];
  const substrands = substrandsByStrand[strandId] || [];

  async function handleEnqueue(e) {
    e.preventDefault();
    const targetSubstrand = substrandId || preselectedSubstrandId;
    if (!targetSubstrand && !strandId) {
      toast.error("Select a sub-strand or strand first");
      return;
    }

    setEnqueuing(true);
    try {
      const scope =
        targetSubstrand && targetSubstrand !== "ALL"
          ? { substrand_id: targetSubstrand }
          : { strand_id: strandId };

      const res = await enqueueJob({ scope, tier });
      const count = res?.job_ids?.length || 1;
      toast.success(
        lang === "sw"
          ? `Kazi ${count} za utunzi zimeongezwa kwenye foleni!`
          : `Enqueued ${count} authoring job(s) for review!`
      );
      await fetchJobs();
    } catch (err) {
      toast.error(
        err.response?.data?.error?.message || "Failed to enqueue authoring job"
      );
    } finally {
      setEnqueuing(false);
    }
  }

  return (
    <div
      className="max-w-6xl mx-auto space-y-8"
      data-testid="authoring-dashboard"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="badge-green mb-2">
            <PenTool size={12} />
            {lang === "sw" ? "Studio ya Utunzi wa Walimu" : "Teacher Authoring Pipeline"}
          </span>
          <h1 className="font-display text-2xl md:text-3xl font-semibold text-ink-100">
            {lang === "sw"
              ? "Tunga na Kagua Masomo ya CBC"
              : "Curriculum Lesson Authoring"}
          </h1>
          <p className="text-xs text-ink-400 font-body mt-1">
            {lang === "sw"
              ? "Tengeneza rasimu za masomo kwa Kiingereza na Kiswahili kabla ya kuzichapisha kwa wanafunzi."
              : "Batch-generate bilingual (EN + SW) draft lessons and review them before publishing to students."}
          </p>
        </div>

        <button
          type="button"
          data-testid="goto-review-queue-btn"
          onClick={() => navigate("/authoring/review")}
          className="btn-primary text-xs"
        >
          <ClipboardCheck size={15} />
          <span>
            {lang === "sw" ? "Foleni ya Ukaguzi" : "Open Review Queue"}
          </span>
        </button>
      </div>

      {/* Scope Picker Form */}
      <form
        onSubmit={handleEnqueue}
        className="card space-y-5 border border-[var(--border)]"
        data-testid="authoring-enqueue-form"
      >
        <div className="flex items-center gap-2">
          <Layers size={16} className="text-brand-400" />
          <h2 className="font-display text-base font-semibold text-ink-100">
            {lang === "sw"
              ? "1. Chagua Wigo wa Mtaala (Sub-Strand)"
              : "1. Select Curriculum Scope"}
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Grade */}
          <div>
            <label className="text-xs text-ink-400 font-body mb-1.5 block">
              {lang === "sw" ? "Gredi" : "Grade"}
            </label>
            <select
              data-testid="authoring-grade-select"
              value={gradeId}
              onChange={(e) => setGradeId(Number(e.target.value))}
              className="input py-2.5"
            >
              {grades.map((g) => (
                <option key={g.id} value={g.id} className="bg-ink-900">
                  {g.name}
                </option>
              ))}
            </select>
          </div>

          {/* Subject */}
          <div>
            <label className="text-xs text-ink-400 font-body mb-1.5 block">
              {lang === "sw" ? "Somo" : "Subject"}
            </label>
            <select
              data-testid="authoring-subject-select"
              value={subjectCode}
              onChange={(e) => {
                setSubjectCode(e.target.value);
                setStrandId("");
                setSubstrandId("");
              }}
              className="input py-2.5"
            >
              {subjects.map((s) => (
                <option key={s.code} value={s.code} className="bg-ink-900">
                  {lang === "sw" ? s.name_sw || s.name : s.name_en || s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Strand */}
          <div>
            <label className="text-xs text-ink-400 font-body mb-1.5 block">
              {lang === "sw" ? "Mada Kuu (Strand)" : "Strand"}
            </label>
            <select
              data-testid="authoring-strand-select"
              value={strandId}
              onChange={(e) => {
                setStrandId(e.target.value);
                setSubstrandId("");
              }}
              className="input py-2.5"
            >
              {strands.map((st) => (
                <option key={st.id} value={st.id} className="bg-ink-900">
                  {st.name}
                </option>
              ))}
            </select>
          </div>

          {/* Sub-Strand */}
          <div>
            <label className="text-xs text-ink-400 font-body mb-1.5 block">
              {lang === "sw" ? "Mada Ndogo (Sub-Strand)" : "Sub-Strand"}
            </label>
            <select
              data-testid="authoring-substrand-select"
              value={substrandId}
              onChange={(e) => setSubstrandId(e.target.value)}
              className="input py-2.5"
            >
              <option value="ALL" className="bg-ink-900">
                {lang === "sw"
                  ? "Mada Ndogo Zote kwenye Mada Kuu Hii"
                  : "All Sub-Strands in Strand (Batch)"}
              </option>
              {substrands.map((sub) => (
                <option key={sub.id} value={sub.id} className="bg-ink-900">
                  {sub.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Tier Selector */}
        <div className="space-y-2">
          <label className="text-xs text-ink-400 font-body block">
            {lang === "sw" ? "2. Chagua Kiwango cha Utunzi" : "2. Authoring Tier"}
          </label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {TIERS.map((t) => {
              const active = tier === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  data-testid={`tier-option-${t.id}`}
                  onClick={() => setTier(t.id)}
                  className={clsx(
                    "p-4 rounded-2xl text-left border transition-all",
                    active
                      ? "glass-active border-brand-500/50 text-ink-100"
                      : "glass border-[var(--border)] text-ink-400 hover:text-ink-200"
                  )}
                >
                  <p className="font-display text-xs font-semibold text-ink-100 mb-1">
                    {t.label[lang]}
                  </p>
                  <p className="text-[11px] text-ink-400 font-body leading-relaxed">
                    {t.desc[lang]}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            data-testid="enqueue-authoring-btn"
            disabled={enqueuing}
            className="btn-primary text-xs"
          >
            <Sparkles size={15} />
            <span>
              {enqueuing
                ? lang === "sw"
                  ? "Inatunga Rasimu..."
                  : "Authoring Draft..."
                : lang === "sw"
                ? "Tunga Rasimu ya Somo"
                : "Enqueue Authoring Job"}
            </span>
          </button>
        </div>
      </form>

      {/* Authoring Jobs Table */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-ink-100">
            {lang === "sw" ? "Kazi za Utunzi wa Masomo" : "Authoring Jobs & Drafts"}
          </h2>
          <button
            type="button"
            onClick={() => fetchJobs()}
            className="btn-ghost text-xs px-3 py-1.5"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            <span>{lang === "sw" ? "Sasisha" : "Refresh"}</span>
          </button>
        </div>

        {jobs.length === 0 ? (
          <div className="card text-center py-10 text-xs text-ink-400 font-body">
            {lang === "sw"
              ? "Hakuna kazi za utunzi bado. Chagua mada ndogo hapo juu kuanza."
              : "No authoring jobs yet. Select a sub-strand above to enqueue a draft."}
          </div>
        ) : (
          <div className="space-y-3" data-testid="authoring-jobs-list">
            {jobs.map((job) => (
              <div
                key={job.job_id}
                data-testid={`authoring-job-${job.job_id}`}
                className="rounded-2xl glass border border-[var(--border)] p-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[11px] text-brand-400">
                      v{job.version || 1}
                    </span>
                    <h3 className="font-display text-sm font-semibold text-ink-100">
                      {job.title_en || job.substrand_name}
                    </h3>
                    <span
                      className={clsx(
                        "badge text-[11px]",
                        job.state === "published"
                          ? "badge-green"
                          : job.state === "rejected"
                          ? "bg-red-500/15 text-red-300 border border-red-500/30"
                          : "badge-gold"
                      )}
                    >
                      {job.state === "published" ? (
                        <CheckCircle2 size={11} />
                      ) : job.state === "rejected" ? (
                        <AlertCircle size={11} />
                      ) : (
                        <Clock size={11} />
                      )}
                      {job.state}
                    </span>
                    <span className="badge-muted text-[10px]">{job.tier}</span>
                  </div>
                  <p className="text-xs text-ink-400 font-body">
                    {[job.grade_name, job.subject_name, job.strand_name, job.substrand_name]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {job.lesson_id && (
                    <button
                      type="button"
                      data-testid={`review-lesson-${job.lesson_id}`}
                      onClick={() =>
                        navigate(`/authoring/review/${job.lesson_id}`)
                      }
                      className="btn-ghost text-xs px-3.5 py-2"
                    >
                      <span>
                        {lang === "sw" ? "Kagua Somo" : "Review Draft"}
                      </span>
                      <ArrowRight size={13} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
