import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ClipboardCheck,
  CheckCircle2,
  Send,
  RotateCcw,
  XCircle,
  ArrowLeft,
  Languages,
  ExternalLink,
  BookOpen,
  HelpCircle,
} from "lucide-react";
import clsx from "clsx";
import toast from "react-hot-toast";
import { useStore, useAuthoringStore } from "../../lib/store.js";
import { lessonsApi, authoringApi } from "../../lib/api.js";
import { normalizeScript } from "../../components/lesson/ReadTab.jsx";

export default function ReviewQueue() {
  const { lesson_id: routeLessonId } = useParams();
  const navigate = useNavigate();

  const language = useStore((s) => s.language);
  const lang = language === "sw" ? "sw" : "en";

  const { jobs, fetchJobs } = useAuthoringStore();

  const [selectedLessonId, setSelectedLessonId] = useState(
    routeLessonId || ""
  );
  const [previewLang, setPreviewLang] = useState("en");
  const [lessonDetail, setLessonDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [actionBusy, setActionBusy] = useState(false);

  useEffect(() => {
    fetchJobs().then((list) => {
      if (!routeLessonId && list && list.length > 0 && list[0].lesson_id) {
        setSelectedLessonId(list[0].lesson_id);
      }
    });
  }, []);

  useEffect(() => {
    if (routeLessonId) {
      setSelectedLessonId(routeLessonId);
    }
  }, [routeLessonId]);

  useEffect(() => {
    if (!selectedLessonId) return;
    setLoadingDetail(true);
    lessonsApi
      .get(selectedLessonId, previewLang)
      .then((res) => {
        setLessonDetail(res.data);
      })
      .catch(() => {
        setLessonDetail(null);
      })
      .finally(() => {
        setLoadingDetail(false);
      });
  }, [selectedLessonId, previewLang]);

  const activeJob = jobs.find((j) => j.lesson_id === selectedLessonId);
  const isPublished =
    activeJob?.state === "published" ||
    activeJob?.lesson_status === "published" ||
    lessonDetail?.status === "published";

  async function handleApprove() {
    if (!selectedLessonId || actionBusy) return;
    setActionBusy(true);
    try {
      await authoringApi.approve(selectedLessonId);
      toast.success("Draft approved");
      await fetchJobs();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || "Approve failed");
    } finally {
      setActionBusy(false);
    }
  }

  async function handlePublish() {
    if (!selectedLessonId || actionBusy) return;
    setActionBusy(true);
    try {
      await authoringApi.publish(selectedLessonId);
      toast.success("Lesson published to students!");
      await fetchJobs();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || "Publish failed");
    } finally {
      setActionBusy(false);
    }
  }

  async function handleReject() {
    if (!selectedLessonId || actionBusy) return;
    if (!feedback.trim()) {
      toast.error("Please provide feedback before rejecting");
      return;
    }
    setActionBusy(true);
    try {
      await authoringApi.reject(selectedLessonId, feedback.trim());
      toast.success("Draft marked for revision");
      setFeedback("");
      await fetchJobs();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || "Reject failed");
    } finally {
      setActionBusy(false);
    }
  }

  async function handleRegenerate() {
    if (!selectedLessonId || actionBusy) return;
    setActionBusy(true);
    try {
      const res = await authoringApi.regenerate(
        selectedLessonId,
        feedback.trim() || "Teacher requested a fresh revision"
      );
      const nextId = res.data?.lesson_id;
      const nextVer = res.data?.version;
      toast.success(`Created new draft v${nextVer}!`);
      setFeedback("");
      await fetchJobs();
      if (nextId) {
        setSelectedLessonId(nextId);
        navigate(`/authoring/review/${nextId}`);
      }
    } catch (err) {
      toast.error(err.response?.data?.error?.message || "Regenerate failed");
    } finally {
      setActionBusy(false);
    }
  }

  const { objectives, sections, keyConcepts, introduction } = normalizeScript(
    lessonDetail?.variant?.script
  );
  const questions = lessonDetail?.assessment?.questions || [];

  return (
    <div className="max-w-6xl mx-auto space-y-6" data-testid="review-queue-page">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => navigate("/authoring")}
            className="inline-flex items-center gap-1.5 text-xs text-brand-400 hover:underline font-body"
          >
            <ArrowLeft size={13} />
            <span>
              {lang === "sw"
                ? "Rudi Kwenye Studio ya Utunzi"
                : "Back to Authoring Dashboard"}
            </span>
          </button>
          <h1 className="font-display text-2xl font-semibold text-ink-100 flex items-center gap-2">
            <ClipboardCheck size={22} className="text-brand-400" />
            <span>
              {lang === "sw"
                ? "Foleni ya Ukaguzi wa Walimu"
                : "Teacher Review Queue"}
            </span>
          </h1>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left column: Queue list */}
        <aside className="lg:col-span-4 space-y-2.5" data-testid="review-queue-list">
          {jobs.length === 0 ? (
            <div className="card text-xs text-ink-400 font-body">
              {lang === "sw"
                ? "Hakuna rasimu kwenye foleni."
                : "No lessons in the review queue yet."}
            </div>
          ) : (
            jobs.map((job) => {
              const active = job.lesson_id === selectedLessonId;
              return (
                <button
                  key={job.job_id}
                  type="button"
                  data-testid={`queue-item-${job.lesson_id}`}
                  onClick={() => {
                    setSelectedLessonId(job.lesson_id);
                    navigate(`/authoring/review/${job.lesson_id}`);
                  }}
                  className={clsx(
                    "w-full text-left rounded-2xl p-4 border transition-all space-y-1",
                    active
                      ? "glass-active border-brand-500/50"
                      : "glass border-[var(--border)] hover:border-brand-500/30"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] text-brand-400">
                      v{job.version || 1}
                    </span>
                    <span
                      className={clsx(
                        "badge text-[10px]",
                        job.state === "published" ? "badge-green" : "badge-gold"
                      )}
                    >
                      {job.state}
                    </span>
                  </div>
                  <p className="font-display text-xs font-semibold text-ink-100 truncate">
                    {job.title_en || job.substrand_name}
                  </p>
                  <p className="text-[11px] text-ink-400 font-body truncate">
                    {[job.grade_name, job.subject_name, job.strand_name]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </button>
              );
            })
          )}
        </aside>

        {/* Right column: Lesson Preview & Review Actions */}
        <div className="lg:col-span-8 space-y-5">
          {!selectedLessonId ? (
            <div className="card text-center py-12 text-xs text-ink-400 font-body">
              {lang === "sw"
                ? "Chagua rasimu upande wa kushoto ili kuikagua."
                : "Select a draft lesson on the left to inspect and publish."}
            </div>
          ) : loadingDetail ? (
            <div className="h-64 rounded-2xl shimmer-bg" />
          ) : !lessonDetail ? (
            <div className="card text-xs text-ink-400 font-body">
              {lang === "sw"
                ? "Imeshindwa kupakia maelezo ya somo."
                : "Could not load lesson details."}
            </div>
          ) : (
            <>
              {/* Action & Variant Bar */}
              <div className="card space-y-4 border border-[var(--border)]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="badge-green text-xs font-mono">
                        v{activeJob?.version || 1}
                      </span>
                      <h2
                        data-testid="review-lesson-title"
                        className="font-display text-lg font-semibold text-ink-100"
                      >
                        {lessonDetail.title}
                      </h2>
                    </div>
                    <p className="text-xs text-ink-400 font-body mt-0.5">
                      {isPublished
                        ? "Published — students can view this lesson. Regenerating creates a new draft version."
                        : "Draft — only teachers can view until published."}
                    </p>
                  </div>

                  {/* Variant Preview Toggle (EN / SW) */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      data-testid="preview-lang-en"
                      onClick={() => setPreviewLang("en")}
                      className={clsx(
                        "px-3 py-1.5 rounded-xl text-xs font-medium border",
                        previewLang === "en"
                          ? "bg-brand-500 text-white border-brand-400"
                          : "glass border-[var(--border)] text-ink-400"
                      )}
                    >
                      <Languages size={12} className="inline mr-1" />
                      EN Variant
                    </button>
                    <button
                      type="button"
                      data-testid="preview-lang-sw"
                      onClick={() => setPreviewLang("sw")}
                      className={clsx(
                        "px-3 py-1.5 rounded-xl text-xs font-medium border",
                        previewLang === "sw"
                          ? "bg-brand-500 text-white border-brand-400"
                          : "glass border-[var(--border)] text-ink-400"
                      )}
                    >
                      <Languages size={12} className="inline mr-1" />
                      SW Variant
                    </button>
                  </div>
                </div>

                {/* Feedback input + Approve / Publish / Reject / Regenerate buttons */}
                <div className="space-y-3 pt-2 border-t border-[var(--border)]">
                  <input
                    type="text"
                    data-testid="reviewer-feedback-input"
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder="Optional reviewer notes or regeneration instructions..."
                    className="input py-2 text-xs"
                  />

                  <div className="flex flex-wrap items-center gap-2.5">
                    {!isPublished && (
                      <>
                        <button
                          type="button"
                          data-testid="approve-lesson-btn"
                          disabled={actionBusy}
                          onClick={handleApprove}
                          className="btn-ghost text-xs px-3.5 py-2"
                        >
                          <CheckCircle2 size={14} className="text-brand-400" />
                          <span>Approve Draft</span>
                        </button>

                        <button
                          type="button"
                          data-testid="publish-lesson-btn"
                          disabled={actionBusy}
                          onClick={handlePublish}
                          className="btn-primary text-xs px-4 py-2"
                        >
                          <Send size={14} />
                          <span>Publish to Students</span>
                        </button>

                        <button
                          type="button"
                          data-testid="reject-lesson-btn"
                          disabled={actionBusy}
                          onClick={handleReject}
                          className="btn-ghost text-xs px-3.5 py-2 text-red-300 hover:text-red-200"
                        >
                          <XCircle size={14} />
                          <span>Reject</span>
                        </button>
                      </>
                    )}

                    <button
                      type="button"
                      data-testid="regenerate-lesson-btn"
                      disabled={actionBusy}
                      onClick={handleRegenerate}
                      className="btn-ghost text-xs px-3.5 py-2"
                    >
                      <RotateCcw size={14} />
                      <span>Regenerate New Version</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => navigate(`/lesson/${selectedLessonId}`)}
                      className="btn-ghost text-xs px-3.5 py-2 ml-auto"
                    >
                      <ExternalLink size={13} />
                      <span>Open in Player</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Script Preview */}
              <div className="card space-y-4">
                <h3 className="font-display text-sm font-semibold text-ink-100 flex items-center gap-2">
                  <BookOpen size={15} className="text-brand-400" />
                  <span>
                    Script Preview ({previewLang.toUpperCase()})
                  </span>
                </h3>

                {objectives.length > 0 && (
                  <ul className="space-y-1.5 text-xs text-ink-300 font-body list-disc pl-5">
                    {objectives.map((o, i) => (
                      <li key={i}>{o}</li>
                    ))}
                  </ul>
                )}

                {introduction && (
                  <p className="text-xs text-ink-200 font-body leading-relaxed">
                    {introduction}
                  </p>
                )}

                <div className="space-y-3">
                  {sections.map((sec, idx) => (
                    <div
                      key={idx}
                      className="rounded-xl bg-white/[0.02] border border-[var(--border)] p-3.5 space-y-1"
                    >
                      <h4 className="font-display text-xs font-semibold text-brand-400">
                        {sec.heading}
                      </h4>
                      <p className="text-xs text-ink-300 font-body leading-relaxed">
                        {sec.content}
                      </p>
                    </div>
                  ))}
                </div>

                {keyConcepts.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {keyConcepts.map((c, idx) => (
                      <span key={idx} className="badge-green text-[11px]">
                        {c}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Assessment Questions Preview */}
              <div className="card space-y-3">
                <h3 className="font-display text-sm font-semibold text-ink-100 flex items-center gap-2">
                  <HelpCircle size={15} className="text-brand-400" />
                  <span>
                    Formative Assessment Questions ({questions.length})
                  </span>
                </h3>
                <div className="space-y-2.5">
                  {questions.map((q, idx) => (
                    <div
                      key={q.id || idx}
                      className="rounded-xl bg-white/[0.02] border border-[var(--border)] p-3.5 space-y-2"
                    >
                      <p className="text-xs font-medium text-ink-100 font-body">
                        Q{idx + 1}. {q.question}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {(q.options || []).map((opt, oIdx) => (
                          <span
                            key={oIdx}
                            className="text-[11px] text-ink-300 font-body px-2.5 py-1 rounded-lg bg-white/[0.03]"
                          >
                            {String.fromCharCode(65 + oIdx)}. {opt}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
