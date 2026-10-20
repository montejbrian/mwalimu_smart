import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronDown,
  ChevronRight,
  BookOpen,
  PlayCircle,
  Layers,
  Target,
  PenTool,
} from "lucide-react";
import clsx from "clsx";
import MasteryBadge from "./MasteryBadge.jsx";
import { useCatalogStore, useStore } from "../../lib/store.js";

export default function StrandList({ strands = [], loading = false }) {
  const navigate = useNavigate();
  const language = useStore((s) => s.language);
  const user = useStore((s) => s.user);
  const lang = language === "sw" ? "sw" : "en";
  const isTeacher = user?.role === "teacher" || user?.role === "admin";

  const substrandsByStrand = useCatalogStore((s) => s.substrandsByStrand);
  const fetchSubstrands = useCatalogStore((s) => s.fetchSubstrands);

  const [expandedStrands, setExpandedStrands] = useState({});
  const [loadingStrandId, setLoadingStrandId] = useState(null);

  useEffect(() => {
    if (strands.length > 0 && Object.keys(expandedStrands).length === 0) {
      const firstId = strands[0].id;
      setExpandedStrands({ [firstId]: true });
      if (!substrandsByStrand[firstId]) {
        fetchSubstrands(firstId, lang).catch(() => {});
      }
    }
  }, [strands, lang]);

  async function toggleStrand(strandId) {
    const nextState = !expandedStrands[strandId];
    setExpandedStrands((prev) => ({ ...prev, [strandId]: nextState }));
    if (nextState && !substrandsByStrand[strandId]) {
      setLoadingStrandId(strandId);
      try {
        await fetchSubstrands(strandId, lang);
      } finally {
        setLoadingStrandId(null);
      }
    }
  }

  if (loading) {
    return (
      <div className="space-y-3" data-testid="strand-list-loading">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 rounded-2xl shimmer-bg border border-[var(--border)]" />
        ))}
      </div>
    );
  }

  if (!strands.length) {
    return (
      <div className="card text-center py-10" data-testid="strand-list-empty">
        <Layers size={28} className="mx-auto text-ink-500 mb-2" />
        <p className="text-sm text-ink-300 font-medium">
          {lang === "sw"
            ? "Hakuna mada kuu zilizopatikana kwa somo hili bado."
            : "No strands found for this subject yet."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="strand-list">
      {strands.map((strand, index) => {
        const isOpen = Boolean(expandedStrands[strand.id]);
        const substrands = substrandsByStrand[strand.id] || [];
        const summary = strand.mastery_summary || {
          mastered: 0,
          in_progress: 0,
          review_recommended: 0,
          new: strand.substrand_count || 0,
        };

        return (
          <div
            key={strand.id}
            data-testid={`strand-item-${strand.id}`}
            className="rounded-2xl glass border border-[var(--border)] overflow-hidden transition-all"
          >
            {/* Strand Header */}
            <button
              type="button"
              onClick={() => toggleStrand(strand.id)}
              className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-white/[0.03] transition-colors"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-brand-500/15 border border-brand-500/30 text-brand-400 font-display text-xs font-semibold flex items-center justify-center flex-shrink-0">
                  {strand.sort_order ?? index + 1}
                </div>
                <div className="min-w-0">
                  <h3 className="font-display text-base font-semibold text-ink-100 truncate">
                    {strand.name}
                  </h3>
                  <p className="text-xs text-ink-400 font-body">
                    {strand.substrand_count || substrands.length}{" "}
                    {lang === "sw" ? "mada ndogo" : "sub-strands"}
                    {summary.mastered > 0 &&
                      ` · ${summary.mastered} ${lang === "sw" ? "imemudu" : "mastered"}`}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 flex-shrink-0">
                {summary.review_recommended > 0 ? (
                  <MasteryBadge badge="review_recommended" lang={lang} />
                ) : summary.mastered === strand.substrand_count && strand.substrand_count > 0 ? (
                  <MasteryBadge badge="mastered" lang={lang} />
                ) : summary.in_progress > 0 || summary.mastered > 0 ? (
                  <MasteryBadge badge="in_progress" lang={lang} />
                ) : (
                  <MasteryBadge badge="new" lang={lang} />
                )}
                {isOpen ? (
                  <ChevronDown size={18} className="text-ink-400" />
                ) : (
                  <ChevronRight size={18} className="text-ink-400" />
                )}
              </div>
            </button>

            {/* Sub-strands */}
            {isOpen && (
              <div className="border-t border-[var(--border)] divide-y divide-[var(--border)] bg-ink-950/30">
                {loadingStrandId === strand.id && substrands.length === 0 ? (
                  <div className="p-5 text-xs text-ink-400 font-body">
                    {lang === "sw" ? "Inapakia mada ndogo..." : "Loading sub-strands..."}
                  </div>
                ) : substrands.length === 0 ? (
                  <div className="p-5 text-xs text-ink-500 font-body">
                    {lang === "sw" ? "Hakuna mada ndogo." : "No sub-strands available."}
                  </div>
                ) : (
                  substrands.map((sub, subIdx) => {
                    const primaryLessonId =
                      sub.first_lesson_id || sub.lessons?.[0]?.lesson_id || null;
                    return (
                      <div
                        key={sub.id}
                        data-testid={`substrand-item-${sub.id}`}
                        className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-white/[0.02] transition-colors"
                      >
                        <div className="space-y-1.5 max-w-2xl">
                          <div className="flex flex-wrap items-center gap-2.5">
                            <span className="text-xs font-mono text-ink-500">
                              {strand.sort_order ?? index + 1}.{sub.sort_order ?? subIdx + 1}
                            </span>
                            <h4 className="font-display text-sm font-semibold text-ink-100">
                              {sub.name}
                            </h4>
                            <MasteryBadge badge={sub.mastery_badge} lang={lang} />
                          </div>

                          {Array.isArray(sub.learning_outcomes) &&
                            sub.learning_outcomes.length > 0 && (
                              <p className="text-xs text-ink-400 font-body flex items-start gap-1.5 leading-relaxed">
                                <Target size={13} className="text-brand-400 flex-shrink-0 mt-0.5" />
                                <span>{sub.learning_outcomes[0]}</span>
                              </p>
                            )}

                          {Array.isArray(sub.competencies) && sub.competencies.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {sub.competencies.map((comp) => (
                                <span
                                  key={comp}
                                  className="px-2 py-0.5 rounded-md bg-white/[0.04] text-[11px] text-ink-400 font-body"
                                >
                                  {comp}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2.5 flex-shrink-0">
                          {primaryLessonId ? (
                            <button
                              type="button"
                              data-testid={`open-lesson-${primaryLessonId}`}
                              onClick={() => navigate(`/lesson/${primaryLessonId}`)}
                              className="btn-primary text-xs px-4 py-2"
                            >
                              <PlayCircle size={15} />
                              <span>
                                {lang === "sw" ? "Fungua Somo" : "Open Lesson"}
                              </span>
                            </button>
                          ) : (
                            <span className="badge-muted text-xs py-1 px-3">
                              <BookOpen size={12} />
                              <span>
                                {lang === "sw"
                                  ? "Inakaguliwa na Mwalimu"
                                  : "Teacher review in progress"}
                              </span>
                            </span>
                          )}

                          {isTeacher && (
                            <button
                              type="button"
                              onClick={() => navigate(`/authoring?substrand_id=${sub.id}`)}
                              className="btn-ghost text-xs px-3 py-2"
                              title="Author or review lesson for this sub-strand"
                            >
                              <PenTool size={13} />
                              <span>{lang === "sw" ? "Tunga" : "Author"}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
