/**
 * MwalimuSmart Web
 * frontend/src/components/lesson/WatchTab.jsx — Video player with captions and progress resume (P2.4)
 *
 * Requirements:
 *   - Video resumes at progress.last_position_s on reopen
 *   - Captions track loads from captions_url when present
 *   - Throttle viewed posts to 1 every 15s
 *   - Unplayed video shows ReadTab default (handled in LessonPlayerPage)
 */

import React, { useRef, useState, useEffect, useCallback } from "react";
import { Film, BookOpen, Clock, RotateCcw } from "lucide-react";
import { progressApi, lessonsApi } from "../../lib/api.js";
import {
  VIEWED_THROTTLE_MS,
  formatDuration,
  shouldPostViewed,
} from "../../lib/video.js";

export { VIEWED_THROTTLE_MS, formatDuration, shouldPostViewed };

export default function WatchTab({
  lessonId,
  assets,
  title,
  lang = "en",
  initialPositionS = 0,
  onSwitchToRead,
  onVideoPlay,
}) {
  const videoUrl = assets?.video_url || null;
  const captionsUrl = assets?.captions_url || null;
  const durationLabel = formatDuration(assets?.duration_s);

  const videoRef = useRef(null);
  const hasResumedRef = useRef(false);
  const lastPostedAtRef = useRef(0);
  const lastPostedPosRef = useRef(-1);

  const [resumeNotice, setResumeNotice] = useState(false);

  // Resume playback at initialPositionS on video metadata load
  const handleLoadedMetadata = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;

    if (!hasResumedRef.current && initialPositionS > 0) {
      const maxSeek = el.duration && el.duration > 0 ? el.duration - 1 : initialPositionS;
      const targetPos = Math.min(initialPositionS, maxSeek);
      if (targetPos > 0) {
        el.currentTime = targetPos;
        hasResumedRef.current = true;
        setResumeNotice(true);
      }
    }
  }, [initialPositionS]);

  // Send progress update to server
  const postProgress = useCallback(
    (positionS) => {
      if (!lessonId || !Number.isFinite(positionS)) return;
      const cleanPos = Math.floor(positionS);
      lastPostedAtRef.current = Date.now();
      lastPostedPosRef.current = cleanPos;
      progressApi.viewed(lessonId, cleanPos).catch(() => {
        // Formative: silent failure, never disrupt playback
      });
    },
    [lessonId]
  );

  // Throttle updates while playing (every 15s)
  const handleTimeUpdate = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    const currentPos = Math.floor(el.currentTime);

    if (shouldPostViewed(lastPostedAtRef.current, currentPos, lastPostedPosRef.current)) {
      postProgress(currentPos);
    }
  }, [postProgress]);

  // Flush progress when user pauses
  const handlePause = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    const currentPos = Math.floor(el.currentTime);
    if (currentPos !== lastPostedPosRef.current && currentPos > 0) {
      postProgress(currentPos);
    }
  }, [postProgress]);

  // Flush progress when component unmounts
  useEffect(() => {
    return () => {
      const el = videoRef.current;
      if (el && !el.paused) {
        const currentPos = Math.floor(el.currentTime);
        if (currentPos > 0 && currentPos !== lastPostedPosRef.current) {
          postProgress(currentPos);
        }
      }
    };
  }, [postProgress]);

  // Poll /api/lessons/:id/assets every 15s while videoUrl is missing
  useEffect(() => {
    if (!lessonId || videoUrl) return undefined;
    const interval = setInterval(() => {
      lessonsApi.assets(lessonId, lang).catch(() => {});
    }, 15000);
    return () => clearInterval(interval);
  }, [lessonId, videoUrl, lang]);

  if (!videoUrl) {
    return (
      <div
        data-testid="watch-tab-preparing"
        className="card border border-[var(--border)] text-center py-12 space-y-4"
      >
        <div className="w-12 h-12 rounded-2xl bg-gold-500/15 border border-gold-500/30 text-gold-400 flex items-center justify-center mx-auto">
          <Film size={22} />
        </div>
        <div className="space-y-1 max-w-md mx-auto">
          <h3 className="font-display text-base font-semibold text-ink-100">
            {lang === "sw"
              ? "Video inaandaliwa — anza kusoma"
              : "Video is being prepared — start reading"}
          </h3>
          <p className="text-xs text-ink-400 font-body leading-relaxed">
            {lang === "sw"
              ? "Unaweza kusoma hati kamili ya somo na maelezo sasa hivi bila kusubiri."
              : "You don't need to wait — read the full teacher-reviewed lesson script and notes right now."}
          </p>
        </div>
        {onSwitchToRead && (
          <button
            type="button"
            data-testid="switch-to-read-btn"
            onClick={onSwitchToRead}
            className="btn-primary text-xs mx-auto"
          >
            <BookOpen size={14} />
            <span>{lang === "sw" ? "Soma Somo Sasa" : "Read Lesson Script"}</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="card space-y-3" data-testid="watch-tab-player">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold text-ink-100 truncate">
          {title}
        </h3>
        {durationLabel && (
          <span className="badge-muted text-xs inline-flex items-center gap-1">
            <Clock size={11} />
            {durationLabel}
          </span>
        )}
      </div>

      {/* Subtle resume banner */}
      {resumeNotice && initialPositionS > 0 && (
        <div
          data-testid="video-resume-banner"
          className="flex items-center justify-between text-xs px-3 py-1.5 rounded-lg bg-brand-500/10 border border-brand-500/20 text-brand-300"
        >
          <span className="flex items-center gap-1.5">
            <RotateCcw size={12} />
            {lang === "sw"
              ? `Inaendelea kutoka ${formatDuration(initialPositionS)}`
              : `Resumed from ${formatDuration(initialPositionS)}`}
          </span>
          <button
            type="button"
            data-testid="restart-video-btn"
            onClick={() => {
              if (videoRef.current) {
                videoRef.current.currentTime = 0;
                setResumeNotice(false);
              }
            }}
            className="underline hover:text-white transition-colors"
          >
            {lang === "sw" ? "Anza upya" : "Start from beginning"}
          </button>
        </div>
      )}

      <div className="aspect-video rounded-xl overflow-hidden bg-black border border-[var(--border)]">
        <video
          ref={videoRef}
          data-testid="lesson-video-element"
          src={videoUrl}
          controls
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onPause={handlePause}
          onPlay={() => {
            onVideoPlay?.();
          }}
          className="w-full h-full object-contain"
        >
          {captionsUrl && (
            <track
              data-testid="video-captions-track"
              kind="captions"
              src={captionsUrl}
              srcLang={lang}
              label={lang === "sw" ? "Kiswahili" : "English"}
              default
            />
          )}
        </video>
      </div>
    </div>
  );
}
