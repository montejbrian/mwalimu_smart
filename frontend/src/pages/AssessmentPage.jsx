import React, { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Compass, ChevronRight } from "lucide-react";
import { useStore, useLessonStore } from "../lib/store.js";
import AssessmentBlock from "../components/lesson/AssessmentBlock.jsx";
import { formatBreadcrumbItems } from "./LessonPlayerPage.jsx";

export default function AssessmentPage() {
  const params = useParams();
  const lessonId = params.lesson_id || params.lessonId;
  const navigate = useNavigate();

  const language = useStore((s) => s.language);
  const lang = language === "sw" ? "sw" : "en";

  const { currentLesson, loading, fetchLesson } = useLessonStore();

  useEffect(() => {
    if (!lessonId) return;
    if (!currentLesson || currentLesson.lesson_id !== lessonId) {
      fetchLesson(lessonId, lang).catch(() => {});
    }
  }, [lessonId, lang]);

  const breadcrumbItems = formatBreadcrumbItems(currentLesson?.breadcrumb);
  const questions = currentLesson?.assessment?.questions || [];

  return (
    <div className="max-w-4xl mx-auto space-y-6" data-testid="assessment-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => navigate(`/lesson/${lessonId}`)}
          className="btn-ghost text-xs px-3.5 py-2"
        >
          <ArrowLeft size={14} />
          <span>
            {lang === "sw" ? "Rudi Kwenye Somo" : "Back to Lesson"}
          </span>
        </button>

        {breadcrumbItems.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-brand-400 font-body">
            <Compass size={13} />
            {breadcrumbItems.map((item, idx) => (
              <React.Fragment key={idx}>
                {idx > 0 && <ChevronRight size={12} className="text-ink-500" />}
                <span>{item}</span>
              </React.Fragment>
            ))}
          </div>
        )}
      </div>

      <div>
        <h1 className="font-display text-2xl font-semibold text-ink-100">
          {currentLesson?.title ||
            (lang === "sw" ? "Tathmini ya Somo" : "Lesson Assessment")}
        </h1>
        <p className="text-xs text-ink-400 font-body mt-1">
          {lang === "sw"
            ? "Tathmini ya umahiri — haizuii maendeleo yako."
            : "Formative mastery check — never blocks progression."}
        </p>
      </div>

      {loading && !currentLesson ? (
        <div className="h-48 rounded-2xl shimmer-bg" />
      ) : (
        <AssessmentBlock
          lessonId={lessonId}
          questions={questions}
          lang={lang}
        />
      )}
    </div>
  );
}
