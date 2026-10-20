import React from "react";
import { Sparkles, Clock, CheckCircle2, RotateCcw } from "lucide-react";
import clsx from "clsx";
import { useStore } from "../../lib/store.js";

export const MASTERY_BADGE_CONFIG = {
  new: {
    label: { en: "New", sw: "Mpya" },
    className: "bg-ink-800/80 text-ink-300 border border-ink-700",
    Icon: Sparkles,
  },
  in_progress: {
    label: { en: "In progress", sw: "Inaendelea" },
    className: "bg-sky-500/15 text-sky-300 border border-sky-500/30",
    Icon: Clock,
  },
  mastered: {
    label: { en: "Mastered", sw: "Imemudu" },
    className: "bg-brand-500/15 text-brand-400 border border-brand-500/30",
    Icon: CheckCircle2,
  },
  review_recommended: {
    label: { en: "Review recommended", sw: "Inapendekezwa kurudia" },
    className: "bg-gold-500/15 text-gold-400 border border-gold-500/30",
    Icon: RotateCcw,
  },
};

export function normalizeMasteryBadge(badge) {
  if (!badge) return "new";
  const key = String(badge).trim().toLowerCase().replace(/\s+/g, "_");
  return MASTERY_BADGE_CONFIG[key] ? key : "new";
}

export default function MasteryBadge({ badge = "new", lang, size = "sm" }) {
  const storeLang = useStore((s) => s.language);
  const activeLang = (lang || storeLang || "en") === "sw" ? "sw" : "en";
  const key = normalizeMasteryBadge(badge);
  const config = MASTERY_BADGE_CONFIG[key];
  const { Icon } = config;

  return (
    <span
      data-testid={`mastery-badge-${key}`}
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full font-body font-medium",
        size === "sm" ? "px-2.5 py-0.5 text-xs" : "px-3 py-1 text-xs",
        config.className
      )}
    >
      <Icon size={size === "sm" ? 12 : 14} className="flex-shrink-0" />
      <span>{config.label[activeLang]}</span>
    </span>
  );
}
