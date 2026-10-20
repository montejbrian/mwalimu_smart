import React, { useState, useEffect } from "react";
import { FileText, Sparkles, CheckSquare, Square, Download } from "lucide-react";
import { normalizeScript } from "./ReadTab.jsx";

export default function NotesTab({
  lessonId,
  title,
  variant,
  lang = "en",
  onDownloadTranscript,
}) {
  const { objectives, keyConcepts, sections } = normalizeScript(variant?.script);
  const storageKey = `mwalimu_notes_${lessonId || "default"}_${lang}`;

  const [personalNotes, setPersonalNotes] = useState("");
  const [checkedObjectives, setCheckedObjectives] = useState({});

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) setPersonalNotes(saved);
    } catch {
      // ignore storage errors
    }
  }, [storageKey]);

  function handleNotesChange(e) {
    const val = e.target.value;
    setPersonalNotes(val);
    try {
      localStorage.setItem(storageKey, val);
    } catch {
      // ignore storage errors
    }
  }

  function toggleObjective(idx) {
    setCheckedObjectives((prev) => ({ ...prev, [idx]: !prev[idx] }));
  }

  return (
    <div className="space-y-5" data-testid="notes-tab">
      {/* Summary & Key Concepts Card */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-display text-sm font-semibold text-ink-100 flex items-center gap-2">
            <Sparkles size={15} className="text-brand-400" />
            <span>
              {lang === "sw"
                ? "Muhtasari wa Somo na Dhana Muhimu"
                : "Lesson Summary & Key Takeaways"}
            </span>
          </h3>

          {onDownloadTranscript && (
            <button
              type="button"
              onClick={onDownloadTranscript}
              className="btn-ghost text-xs px-3 py-1.5"
            >
              <Download size={13} className="text-brand-400" />
              <span>
                {lang === "sw" ? "Pakua Nakala" : "Download Transcript"}
              </span>
            </button>
          )}
        </div>

        {keyConcepts.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {keyConcepts.map((c, idx) => (
              <span key={idx} className="badge-green text-xs">
                {c}
              </span>
            ))}
          </div>
        )}

        {sections.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            {sections.map((s, idx) => (
              <div
                key={idx}
                className="rounded-xl bg-white/[0.02] border border-[var(--border)] p-3.5 space-y-1"
              >
                <p className="font-display text-xs font-semibold text-brand-400">
                  {idx + 1}. {s.heading}
                </p>
                <p className="text-xs text-ink-300 font-body line-clamp-3 leading-relaxed">
                  {s.content}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Self-Check Objectives */}
      {objectives.length > 0 && (
        <div className="card space-y-3">
          <h4 className="font-display text-xs font-semibold uppercase tracking-wider text-ink-400">
            {lang === "sw"
              ? "Orodha ya Kujikagua (Malengo)"
              : "Self-Check Objectives"}
          </h4>
          <div className="space-y-2">
            {objectives.map((obj, idx) => {
              const checked = Boolean(checkedObjectives[idx]);
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => toggleObjective(idx)}
                  className="w-full flex items-start gap-2.5 text-left text-sm text-ink-200 hover:text-ink-100 font-body py-1"
                >
                  {checked ? (
                    <CheckSquare
                      size={16}
                      className="text-brand-400 mt-0.5 flex-shrink-0"
                    />
                  ) : (
                    <Square
                      size={16}
                      className="text-ink-500 mt-0.5 flex-shrink-0"
                    />
                  )}
                  <span className={checked ? "line-through text-ink-500" : ""}>
                    {obj}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Personal Study Notes */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <label
            htmlFor="student-personal-notes"
            className="font-display text-sm font-semibold text-ink-100 flex items-center gap-2"
          >
            <FileText size={15} className="text-brand-400" />
            <span>
              {lang === "sw"
                ? `Maelezo Yangu (${title || "Somo"})`
                : `My Study Notes (${title || "Lesson"})`}
            </span>
          </label>
          <span className="text-[11px] text-ink-500 font-body">
            {lang === "sw" ? " imehifadhiwa kiotomatiki" : "Auto-saved locally"}
          </span>
        </div>

        <textarea
          id="student-personal-notes"
          data-testid="student-notes-textarea"
          rows={5}
          value={personalNotes}
          onChange={handleNotesChange}
          placeholder={
            lang === "sw"
              ? "Andika vidokezo vyako vya somo hapa..."
              : "Jot down your own formulas, examples, or questions here..."
          }
          className="input resize-y min-h-[110px]"
        />
      </div>
    </div>
  );
}
