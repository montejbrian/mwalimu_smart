import React from "react";
import { Baby, BookOpen, Compass, Award, ChevronRight } from "lucide-react";
import clsx from "clsx";
import { useStore } from "../../lib/store.js";

export const LEVEL_META = {
  "Pre-Primary": {
    name_sw: "Elimu ya Awali",
    gradesLabel: { en: "PP1 – PP2", sw: "PP1 – PP2" },
    description: {
      en: "Foundational play-based literacy, numeracy, and curiosity.",
      sw: "Msingi wa kusoma, kuhesabu na udadisi kwa michezo.",
    },
    Icon: Baby,
  },
  Primary: {
    name_sw: "Shule ya Msingi",
    gradesLabel: { en: "Grades 1 – 6", sw: "Gredi 1 – 6" },
    description: {
      en: "Lower and upper primary CBC core subjects and skills.",
      sw: "Masomo ya msingi ya CBC kwa Gredi ya 1 hadi 6.",
    },
    Icon: BookOpen,
  },
  "Junior Secondary": {
    name_sw: "Sekondari ya Awali",
    gradesLabel: { en: "Grades 7 – 9", sw: "Gredi 7 – 9" },
    description: {
      en: "Mathematics, Integrated Science, English & Kiswahili.",
      sw: "Hisabati, Sayansi Jumuishi, Kiingereza na Kiswahili.",
    },
    Icon: Compass,
  },
  "Senior Secondary": {
    name_sw: "Sekondari ya Juu",
    gradesLabel: { en: "Grades 10 – 12", sw: "Gredi 10 – 12" },
    description: {
      en: "STEM, Social Sciences, and Arts & Sports pathways.",
      sw: "Mikondo ya STEM, Sayansi ya Jamii na Sanaa.",
    },
    Icon: Award,
  },
};

export default function LevelCard({ level, selected = false, onSelect, gradeCount }) {
  const language = useStore((s) => s.language);
  const lang = language === "sw" ? "sw" : "en";
  const meta = LEVEL_META[level?.name] || {
    name_sw: level?.name || "",
    gradesLabel: { en: "CBC Level", sw: "Ngazi ya CBC" },
    description: { en: "CBC curriculum level", sw: "Ngazi ya mtaala wa CBC" },
    Icon: BookOpen,
  };
  const { Icon } = meta;
  const displayName = lang === "sw" ? meta.name_sw : level?.name;

  return (
    <button
      type="button"
      onClick={() => onSelect?.(level)}
      data-testid={`level-card-${level?.id}`}
      className={clsx(
        "text-left rounded-2xl p-5 transition-all duration-200 border w-full group",
        selected
          ? "glass-active border-brand-500/50 shadow-glow-green"
          : "glass border-[var(--border)] hover:border-brand-500/30 hover:bg-white/[0.04]"
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div
          className={clsx(
            "w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
            selected
              ? "bg-brand-500 text-white shadow-glow-green"
              : "bg-brand-500/15 text-brand-400 group-hover:bg-brand-500/25"
          )}
        >
          <Icon size={20} />
        </div>
        <span className="badge-muted text-[11px]">
          {gradeCount != null
            ? `${gradeCount} ${lang === "sw" ? "Gredi" : "Grades"}`
            : meta.gradesLabel[lang]}
        </span>
      </div>

      <h3 className="font-display text-base font-semibold text-ink-100 mb-1 flex items-center justify-between">
        <span>{displayName}</span>
        <ChevronRight
          size={16}
          className={clsx(
            "transition-transform duration-200",
            selected ? "text-brand-400 translate-x-0.5" : "text-ink-500 group-hover:translate-x-0.5"
          )}
        />
      </h3>
      <p className="text-xs text-ink-400 font-body leading-relaxed">{meta.description[lang]}</p>
    </button>
  );
}
