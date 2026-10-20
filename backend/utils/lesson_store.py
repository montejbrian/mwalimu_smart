"""
MwalimuSmart Institutional OS
utils/lesson_store.py — MongoDB Lesson Content Store

Handles all MongoDB reads and writes for lesson content:
  - Storing full lesson scripts (too large for PostgreSQL rows)
  - Storing MP4 file references via GridFS
  - Retrieving lesson packages for frontend delivery
  - Logging diagnostic attempt history per student

Collections
-----------
  lessons           : Full LessonScript JSON documents
  diagnostic_logs   : Per-attempt diagnostic records for teacher analytics
  animation_jobs    : Manim render job queue (used in P5)
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional

from pymongo import MongoClient
from pymongo.collection import Collection
from pymongo.database import Database

from graph.state import AgentState, LessonScript, DiagnosticResult, AnimationArtifact
from config.settings import settings

log = logging.getLogger(__name__)


# ── Connection (lazy singleton) ───────────────────────────────────────────────

_client: Optional[MongoClient] = None

def _get_db() -> Database:
    global _client
    if _client is None:
        _client = MongoClient(settings.MONGODB_URI)
    return _client.get_default_database()


def _col(name: str) -> Collection:
    return _get_db()[name]


# ── Lesson persistence ────────────────────────────────────────────────────────

def save_lesson(state: AgentState) -> str:
    """
    Persist the complete lesson package to MongoDB.

    Returns the MongoDB document _id as a string.
    """
    req    = state["request"]
    script = state.get("lesson_script")
    diag   = state.get("diagnostic_result")
    anim   = state.get("animation")

    doc = {
        "lesson_id":        req["lesson_id"],
        "school_id":        req["school_id"],
        "teacher_id":       req["teacher_id"],
        "topic":            req["topic"],
        "strand":           req["strand"],
        "grade_level":      req["grade_level"],
        "language":         req["language"],
        "script_version":   state.get("script_version", 1),
        "lesson_script":    dict(script) if script else None,
        "diagnostic": {
            "score":             diag["score"]       if diag else None,
            "percentage":        diag["percentage"]  if diag else None,
            "outcome":           diag["outcome"]     if diag else None,
            "weak_competencies": diag["weak_competencies"] if diag else [],
            "retake_count":      state.get("retake_count", 0),
        },
        "animation": {
            "manim_class":     anim["manim_class_name"]  if anim else None,
            "render_status":   anim["render_status"]     if anim else None,
            "mp4_path":        anim["mp4_path"]          if anim else None,
            "mongodb_file_id": anim["mongodb_file_id"]  if anim else None,
        },
        "retrieval": {
            "query":       state.get("retrieval_query", ""),
            "chunk_count": state.get("retrieval_count", 0),
        },
        "node_durations":  state.get("node_durations", []),
        "errors":          state.get("errors", []),
        "created_at":      datetime.now(timezone.utc),
        "updated_at":      datetime.now(timezone.utc),
    }

    result = _col("lessons").replace_one(
        {"lesson_id": req["lesson_id"]},
        doc,
        upsert=True,
    )

    mongo_id = str(result.upserted_id or req["lesson_id"])
    log.info("[LessonStore] Saved lesson_id=%s", req["lesson_id"])
    return mongo_id


def get_lesson(lesson_id: str) -> Optional[dict[str, Any]]:
    """Retrieve a lesson package by lesson_id."""
    doc = _col("lessons").find_one({"lesson_id": lesson_id}, {"_id": 0})
    return doc


# ── Diagnostic log ────────────────────────────────────────────────────────────

def log_diagnostic_attempt(
    lesson_id:   str,
    student_id:  str,
    result:      DiagnosticResult,
    attempt_num: int,
) -> None:
    """
    Append a diagnostic attempt record.
    Teacher analytics query this collection to identify struggling students.
    """
    _col("diagnostic_logs").insert_one({
        "lesson_id":         lesson_id,
        "student_id":        student_id,
        "attempt_number":    attempt_num,
        "score":             result["score"],
        "percentage":        result["percentage"],
        "outcome":           result["outcome"],
        "weak_competencies": result["weak_competencies"],
        "answers_given":     result["answers_given"],
        "recorded_at":       datetime.now(timezone.utc),
    })


# ── Animation job queue ───────────────────────────────────────────────────────

def enqueue_animation_job(lesson_id: str, manim_source: str, class_name: str) -> str:
    """
    Add a Manim render job to the queue.
    The Manim worker (P5) polls this collection.

    Returns the job document _id.
    """
    result = _col("animation_jobs").insert_one({
        "lesson_id":    lesson_id,
        "class_name":   class_name,
        "source_code":  manim_source,
        "status":       "queued",
        "queued_at":    datetime.now(timezone.utc),
        "started_at":   None,
        "completed_at": None,
        "mp4_path":     None,
        "error":        None,
    })
    return str(result.inserted_id)


def update_animation_job(
    lesson_id:  str,
    status:     str,
    mp4_path:   Optional[str] = None,
    error:      Optional[str] = None,
) -> None:
    """Update the render status of an animation job."""
    update: dict[str, Any] = {"status": status}
    if status == "rendering":
        update["started_at"] = datetime.now(timezone.utc)
    if status in ("done", "failed"):
        update["completed_at"] = datetime.now(timezone.utc)
    if mp4_path:
        update["mp4_path"] = mp4_path
    if error:
        update["error"] = error

    _col("animation_jobs").update_one(
        {"lesson_id": lesson_id},
        {"$set": update},
    )
