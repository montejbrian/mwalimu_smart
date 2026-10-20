/**
 * MwalimuSmart — frontend/src/lib/video.js
 * Pure helpers for video playback, captions, and progress throttling (P2.4).
 * Pure JS so it can be unit-tested directly in node:test / vitest.
 */

export const VIEWED_THROTTLE_MS = 15000;

/**
 * Format duration in seconds to "M:SS" string.
 * Returns null if duration is invalid or non-positive.
 */
export function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

/**
 * Pure throttle decision function.
 * Allows at most 1 update per minIntervalMs, provided the playback position has moved.
 */
export function shouldPostViewed(
  lastPostedAt,
  currentPos,
  lastPostedPos,
  minIntervalMs = VIEWED_THROTTLE_MS,
  now = Date.now()
) {
  if (!Number.isFinite(currentPos) || currentPos < 0) return false;
  const timeSinceLast = now - (lastPostedAt || 0);
  const positionChanged = Math.abs(currentPos - (lastPostedPos ?? -1)) >= 1;
  return timeSinceLast >= minIntervalMs && positionChanged;
}

/**
 * Default tab selection helper.
 * If video is absent, defaults to "read" tab.
 */
export function resolveDefaultLessonTab(assets) {
  return assets?.video_url ? "watch" : "read";
}
