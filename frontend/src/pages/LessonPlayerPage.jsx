import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Play,
  BookOpen,
  FileText,
  Download,
  Compass,
  ChevronRight,
  Film,
  HelpCircle,
  AlertCircle,
} from "lucide-react";
import clsx from "clsx";
import toast from "react-hot-toast";
import { useStore, useLessonStore } from "../lib/store.js";
import { lessonsApi } from "../lib/api.js";
import WatchTab from "../components/lesson/WatchTab.jsx";
import ReadTab, { normalizeScript } from "../components/lesson/ReadTab.jsx";
import NotesTab from "../components/lesson/NotesTab.jsx";
import AssessmentBlock from "../components/lesson/AssessmentBlock.jsx";
import FollowUpPanel from "../components/lesson/FollowUpPanel.jsx";

export function resolveDefaultLessonTab(assets) {
  return assets?.video_url ? "watch" : "read";
}

export function formatBreadcrumbItems(breadcrumb = []) {
  if (!Array.isArray(breadcrumb) || breadcrumb.length === 0) return [];
  const items = [];
  for (const node of breadcrumb) {
    if (node.level) items.push(node.level);
    if (node.grade) items.push(node.grade);
    if (node.subject) items.push(node.subject);
    if (node.strand) items.push(node.strand);
    if (node.substrand) items.push(node.substrand);
  }
  return items;
}

export default function LessonPlayerPage() {
  const params = useParams();
  const lessonId = params.lesson_id || params.lessonId;
  const navigate = useNavigate();

  const language = useStore((s) => s.language);
  const lang = language === "sw" ? "sw" : "en";

  const {
    currentLesson,
    loading,
    error,
    fetchLesson,
    pollAssets,
  } = useLessonStore();

  const [activeTab, setActiveTab] = useState("read");
  const [downloadingTranscript, setDownloadingTranscript] = useState(false);

  // Fetch lesson when lessonId or language changes
  useEffect(() => {
    if (!lessonId) return;
    fetchLesson(lessonId, lang)
      .then((data) => {
        setActiveTab(resolveDefaultLessonTab(data?.assets));
      })
      .catch(() => {});
  }, [lessonId, lang]);

  // Poll GET /api/lessons/:id/assets every 15s while video_url is null
  useEffect(() => {
    if (!lessonId || !currentLesson) return undefined;
    if (currentLesson.assets?.video_url) return undefined;

    const interval = setInterval(() => {
      pollAssets(lessonId).catch(() => {});
    }, 15000);

    return () => clearInterval(interval);
  }, [lessonId, currentLesson?.assets?.video_url]);

  const handleDownloadTranscript = useCallback(async () => {
    if (!lessonId) return;
    setDownloadingTranscript(true);
    try {
      const res = await lessonsApi.getTranscript(lessonId, lang);
      const text =
        typeof res.data === "string"
          ? res.data
          : JSON.stringify(res.data, null, 2);
      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeTitle = (currentLesson?.title || "lesson")
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/gi, "_")
        .replace(/^_+|_+$/g, "");
      a.download = `${safeTitle || "lesson"}_${lang}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast.error(
        lang === "sw"
          ? "Imeshindwa kupakua nakala ya somo"
          : "Could not download transcript"
      );
    } finally {
      setDownloadingTranscript(false);
    }
  }, [lessonId, lang, currentLesson?.title]);

  if (loading && (!currentLesson || currentLesson.lesson_id !== lessonId)) {
    return (
      <div className="max-w-5xl mx-auto space-y-5" data-testid="lesson-loading">
        <div className="h-6 w-72 rounded-lg shimmer-bg" />
        <div className="h-10 w-96 rounded-xl shimmer-bg" />
        <div className="h-64 rounded-2xl shimmer-bg" />
      </div>
    );
  }

  if (error && !currentLesson) {
    return (
      <div
        className="max-w-3xl mx-auto card border border-red-500/30 bg-red-500/5 space-y-3"
        data-testid="lesson-error"
      >
        <div className="flex items-center gap-2 text-red-400">
          <AlertCircle size={18} />
          <h2 className="font-display text-base font-semibold">
            {lang === "sw" ? "Somo halikupatikana" : "Lesson unavailable"}
          </h2>
        </div>
        <p className="text-xs text-ink-300 font-body">{error}</p>
        <button
          type="button"
          onClick={() => navigate("/browse")}
          className="btn-ghost text-xs"
        >
          {lang === "sw" ? "Rudi Kwenye Mtaala" : "Back to Curriculum"}
        </button>
      </div>
    );
  }

  const lesson = currentLesson;
  if (!lesson) return null;

  const breadcrumbItems = formatBreadcrumbItems(lesson.breadcrumb);
  const hasVideo = Boolean(lesson.assets?.video_url);
  const { keyConcepts } = normalizeScript(lesson.variant?.script);
  const questions = lesson.assessment?.questions || [];

  const TABS = [
    {
      id: "watch",
      label: lang === "sw" ? "Tazama Video" : "Watch",
      Icon: Play,
      badge: !hasVideo ? (lang === "sw" ? "Inaandaliwa" : "Preparing") : null,
    },
    {
      id: "read",
      label: lang === "sw" ? "Soma Somo" : "Read Script",
      Icon: BookOpen,
    },
    {
      id: "notes",
      label: lang === "sw" ? "Vidokezo" : "Notes",
      Icon: FileText,
    },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6" data-testid="lesson-player-page">
      {/* Curriculum Breadcrumb + Header */}
      <header className="space-y-2.5">
        <nav
          aria-label="Curriculum breadcrumb"
          data-testid="lesson-breadcrumb"
          className="flex flex-wrap items-center gap-1.5 text-xs font-body text-brand-400"
        >
          <button
            type="button"
            onClick={() => navigate("/browse")}
            className="inline-flex items-center gap-1 hover:underline"
          >
            <Compass size={13} />
            <span>{lang === "sw" ? "Mtaala" : "Curriculum"}</span>
          </button>
          {breadcrumbItems.map((item, idx) => (
            <React.Fragment key={idx}>
              <ChevronRight size={12} className="text-ink-500" />
              <span
                className={clsx(
                  idx === breadcrumbItems.length - 1
                    ? "text-ink-100 font-medium"
                    : "text-ink-300"
                )}
              >
                {item}
              </span>
            </React.Fragment>
          ))}
        </nav>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1
              data-testid="lesson-title"
              className="font-display text-2xl md:text-3xl font-semibold text-ink-100"
            >
              {lesson.title}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              data-testid="download-transcript-btn"
              disabled={downloadingTranscript}
              onClick={handleDownloadTranscript}
              className="btn-ghost text-xs px-3.5 py-2"
            >
              <Download size={14} className="text-brand-400" />
              <span>
                {lang === "sw" ? "Pakua Nakala (.txt)" : "Download Transcript"}
              </span>
            </button>

            {questions.length > 0 && (
              <button
                type="button"
                data-testid="open-assessment-page-btn"
                onClick={() => navigate(`/lesson/${lessonId}/assess`)}
                className="btn-primary text-xs px-4 py-2"
              >
                <HelpCircle size={14} />
                <span>
                  {lang === "sw"
                    ? `Jipime (${questions.length})`
                    : `Assessment (${questions.length})`}
                </span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Non-blocking banner when video is still rendering */}
      {!hasVideo && (
        <div
          data-testid="video-preparing-banner"
          className="rounded-2xl bg-gold-500/10 border border-gold-500/30 px-4 py-3 flex flex-wrap items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2.5 text-xs text-gold-300 font-body">
            <Film size={15} className="text-gold-400 flex-shrink-0" />
            <span>
              {lang === "sw"
                ? "Video inaandaliwa — unaweza kusoma hati kamili ya somo na kufanya maswali ya kujipima sasa hivi."
                : "Video is being prepared — read the full lesson script and check your understanding below right away."}
            </span>
          </div>
          <span className="text-[11px] text-ink-400 font-mono">
            {lang === "sw" ? "Inasasishwa kila sekunde 15" : "Auto-checking every 15s"}
          </span>
        </div>
      )}

      {/* Watch / Read / Notes Tab Switcher */}
      <div
        data-testid="lesson-tabs"
        className="flex gap-1.5 bg-ink-900/60 border border-[var(--border)] rounded-2xl p-1.5"
      >
        {TABS.map(({ id, label, Icon, badge }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              data-testid={`lesson-tab-${id}`}
              onClick={() => setActiveTab(id)}
              className={clsx(
                "flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-medium font-body transition-all",
                active
                  ? "glass-active text-brand-400 shadow-sm"
                  : "text-ink-400 hover:text-ink-200 hover:bg-white/[0.03]"
              )}
            >
              <Icon size={14} />
              <span>{label}</span>
              {badge && (
                <span className="px-1.5 py-0.2 rounded-full bg-gold-500/20 text-gold-400 text-[10px]">
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Active Tab Content */}
      <div>
        {activeTab === "watch" && (
          <WatchTab
            lessonId={lessonId}
            assets={lesson.assets}
            title={lesson.title}
            lang={lang}
            initialPositionS={lesson.progress?.last_position_s || 0}
            onSwitchToRead={() => setActiveTab("read")}
          />
        )}
        {activeTab === "read" && (
          <ReadTab
            variant={lesson.variant}
            lang={lang}
            onDownloadTranscript={handleDownloadTranscript}
            downloading={downloadingTranscript}
          />
        )}
        {activeTab === "notes" && (
          <NotesTab
            lessonId={lessonId}
            title={lesson.title}
            variant={lesson.variant}
            lang={lang}
            onDownloadTranscript={handleDownloadTranscript}
          />
        )}
      </div>

      {/* Formative Assessment Block */}
      <AssessmentBlock
        lessonId={lessonId}
        questions={questions}
        lang={lang}
      />

      {/* THE HERO: Follow-Up Panel */}
      <FollowUpPanel
        lessonId={lessonId}
        title={lesson.title}
        keyConcepts={keyConcepts}
        lang={lang}
      />
    </div>
  );
}
