import React from "react";
import {
  CheckCircle2,
  BookOpen,
  Download,
  Sparkles,
  Library,
} from "lucide-react";

export function normalizeScript(script = {}) {
  const objectives =
    script?.objectives || script?.learning_objectives || [];
  const sectionsRaw =
    script?.sections || script?.body_sections || [];
  const sections = sectionsRaw.map((sec, idx) => ({
    heading:
      sec?.heading || sec?.title || `Section ${idx + 1}`,
    content:
      sec?.content || sec?.body || sec?.narration || "",
  }));
  const keyConcepts = script?.key_concepts || [];
  const introduction = script?.introduction || "";

  return { objectives, sections, keyConcepts, introduction };
}

export default function ReadTab({
  variant,
  lang = "en",
  onDownloadTranscript,
  downloading = false,
}) {
  const { objectives, sections, keyConcepts, introduction } = normalizeScript(
    variant?.script
  );
  const ragSources = Array.isArray(variant?.rag_sources)
    ? variant.rag_sources
    : [];

  return (
    <div className="space-y-5" data-testid="read-tab">
      {/* Objectives + Download Transcript Bar */}
      <div className="card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-display text-sm font-semibold text-ink-100 flex items-center gap-2">
            <BookOpen size={15} className="text-brand-400" />
            <span>
              {lang === "sw" ? "Malengo ya Kujifunza" : "Learning Objectives"}
            </span>
          </h3>

          {onDownloadTranscript && (
            <button
              type="button"
              data-testid="read-tab-download-transcript"
              disabled={downloading}
              onClick={onDownloadTranscript}
              className="btn-ghost text-xs px-3.5 py-1.5"
            >
              <Download size={13} className="text-brand-400" />
              <span>
                {downloading
                  ? lang === "sw"
                    ? "Inapakua..."
                    : "Downloading..."
                  : lang === "sw"
                  ? "Pakua Nakala (.txt)"
                  : "Download Transcript (.txt)"}
              </span>
            </button>
          )}
        </div>

        {objectives.length > 0 ? (
          <ul className="space-y-2" data-testid="lesson-objectives-list">
            {objectives.map((obj, idx) => (
              <li
                key={idx}
                className="flex items-start gap-2.5 text-sm text-ink-200 font-body leading-relaxed"
              >
                <CheckCircle2
                  size={15}
                  className="text-brand-400 mt-0.5 flex-shrink-0"
                />
                <span>{obj}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-ink-400 font-body">
            {lang === "sw"
              ? "Soma maelezo ya somo hapa chini."
              : "Read through the lesson sections below."}
          </p>
        )}
      </div>

      {/* Introduction */}
      {introduction && (
        <div className="card space-y-2" data-testid="lesson-introduction">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-brand-400 font-body">
            {lang === "sw" ? "Utangulizi" : "Introduction"}
          </h4>
          <p className="text-sm text-ink-200 font-body leading-relaxed whitespace-pre-line">
            {introduction}
          </p>
        </div>
      )}

      {/* Lesson Sections */}
      <div className="space-y-4" data-testid="lesson-sections-list">
        {sections.map((section, idx) => (
          <article
            key={idx}
            data-testid={`lesson-section-${idx}`}
            className="card space-y-2.5 border border-[var(--border)]"
          >
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-lg bg-brand-500/15 text-brand-400 font-mono text-xs font-semibold flex items-center justify-center flex-shrink-0">
                {idx + 1}
              </span>
              <h4 className="font-display text-base font-semibold text-ink-100">
                {section.heading}
              </h4>
            </div>
            <p className="text-sm text-ink-300 font-body leading-relaxed whitespace-pre-line pl-8">
              {section.content}
            </p>
          </article>
        ))}
      </div>

      {/* Key Concepts */}
      {keyConcepts.length > 0 && (
        <div className="card space-y-3" data-testid="lesson-key-concepts">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-400 font-body flex items-center gap-1.5">
            <Sparkles size={13} className="text-brand-400" />
            <span>{lang === "sw" ? "Dhana Muhimu" : "Key Concepts"}</span>
          </h4>
          <div className="flex flex-wrap gap-2">
            {keyConcepts.map((concept, idx) => (
              <span key={idx} className="badge-green text-xs">
                {concept}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* KICD RAG Sources */}
      {ragSources.length > 0 && (
        <div className="rounded-2xl glass border border-[var(--border)] p-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-ink-400 font-body">
            <Library size={14} className="text-brand-400" />
            <span>
              {lang === "sw"
                ? "Vyanzo vya Mtaala wa KICD:"
                : "KICD Curriculum References:"}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ragSources.map((src, i) => (
              <span key={i} className="badge-muted text-[11px]">
                {typeof src === "string"
                  ? src
                  : src?.ref || src?.source || "KICD CBC"}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
