"""
MwalimuSmart — backend/authoring/publish.py
Draft assembly and lifecycle transitions (draft -> in_review -> published / archived)
in PostgreSQL. Enforces Non-Negotiable Rule #2:
Never mutate a published lesson in place. Regeneration creates a new version;
old versions are archived but retained.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

import psycopg2
from psycopg2.extras import Json

from config.settings import settings

log = logging.getLogger(__name__)


def _build_transcript_text(title: str, script: dict[str, Any], lang: str = "en") -> str:
    lines: list[str] = [title, ""]
    intro = script.get("introduction")
    if intro:
        lines.extend([str(intro), ""])
    sections = script.get("sections") or script.get("body_sections") or []
    for sec in sections:
        heading = sec.get("heading") or sec.get("title") or ""
        content = sec.get("content") or sec.get("body") or ""
        if heading:
            lines.append(str(heading))
        if content:
            lines.append(str(content))
        lines.append("")
    concepts = script.get("key_concepts") or []
    if concepts:
        prefix = "Dhana Muhimu: " if lang == "sw" else "Key Concepts: "
        lines.append(prefix + ", ".join(str(c) for c in concepts))
    return "\n".join(lines).strip()


def save_draft_lesson(
    substrand_id: str,
    title_en: str,
    title_sw: str,
    script_en: dict[str, Any],
    script_sw: dict[str, Any],
    questions: list[dict[str, Any]],
    rag_sources: Optional[list[Any]] = None,
    author_job_id: Optional[str] = None,
    transcript_en: Optional[str] = None,
    transcript_sw: Optional[str] = None,
    video_url: Optional[str] = None,
    supersedes: Optional[str] = None,
    dsn: Optional[str] = None,
) -> dict[str, Any]:
    """
    Insert a new draft lesson version + EN/SW variants + assets + assessment_questions.
    Never mutates an existing published lesson in place.
    """
    pg_dsn = dsn or settings.POSTGRES_DSN
    t_en = transcript_en or _build_transcript_text(title_en, script_en, "en")
    t_sw = transcript_sw or _build_transcript_text(title_sw, script_sw, "sw")
    sources = rag_sources or []

    conn = psycopg2.connect(pg_dsn)
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT COALESCE(MAX(version), 0),
                           (SELECT id FROM lessons WHERE substrand_id = %s ORDER BY version DESC LIMIT 1)
                    FROM lessons
                    WHERE substrand_id = %s
                    """,
                    (substrand_id, substrand_id),
                )
                max_ver, latest_id = cur.fetchone()
                next_version = int(max_ver) + 1
                parent_id = supersedes or (str(latest_id) if latest_id else None)

                cur.execute(
                    """
                    INSERT INTO lessons (substrand_id, title, sort_order, status, version, supersedes)
                    VALUES (%s, %s, 0, 'draft', %s, %s)
                    RETURNING id
                    """,
                    (substrand_id, title_en, next_version, parent_id),
                )
                lesson_id = str(cur.fetchone()[0])

                # Insert EN and SW variants + lesson_assets
                for lang_code, script_obj, transcript_txt in (
                    ("en", script_en, t_en),
                    ("sw", script_sw, t_sw),
                ):
                    objectives = script_obj.get("objectives") or script_obj.get("learning_objectives") or []
                    key_concepts = script_obj.get("key_concepts") or []
                    cur.execute(
                        """
                        INSERT INTO lesson_variants (
                            lesson_id, language, script, transcript,
                            objectives, key_concepts, rag_sources
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s)
                        RETURNING id
                        """,
                        (
                            lesson_id,
                            lang_code,
                            Json(script_obj),
                            transcript_txt,
                            Json(objectives),
                            Json(key_concepts),
                            Json(sources),
                        ),
                    )
                    variant_id = str(cur.fetchone()[0])

                    cur.execute(
                        """
                        INSERT INTO lesson_assets (
                            lesson_variant_id, type, storage_url, status, job_id
                        )
                        VALUES (%s, 'video_mp4', %s, %s, %s)
                        """,
                        (
                            variant_id,
                            video_url,
                            "ready" if video_url else "pending",
                            author_job_id,
                        ),
                    )

                # Insert assessment_questions
                for idx, q in enumerate(questions):
                    opts_payload = q.get("options") or {
                        "en": q.get("options_en", []),
                        "sw": q.get("options_sw", q.get("options_en", [])),
                    }
                    cur.execute(
                        """
                        INSERT INTO assessment_questions (
                            lesson_id, sort_order, question_en, question_sw,
                            options, correct_index,
                            explanation_en, explanation_sw, competency_tag
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                        """,
                        (
                            lesson_id,
                            int(q.get("sort_order", idx + 1)),
                            q["question_en"],
                            q["question_sw"],
                            Json(opts_payload),
                            int(q["correct_index"]),
                            q.get("explanation_en", ""),
                            q.get("explanation_sw", ""),
                            q.get("competency_tag", "critical_thinking"),
                        ),
                    )

        return {
            "lesson_id": lesson_id,
            "substrand_id": substrand_id,
            "version": next_version,
            "status": "draft",
        }
    finally:
        conn.close()


def approve_lesson(
    lesson_id: str,
    reviewer_id: Optional[str] = None,
    dsn: Optional[str] = None,
) -> dict[str, Any]:
    """Transition a draft lesson to `in_review` (approved by reviewer) without mutating published lessons."""
    pg_dsn = dsn or settings.POSTGRES_DSN
    conn = psycopg2.connect(pg_dsn)
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT status::text, version, substrand_id FROM lessons WHERE id = %s",
                    (lesson_id,),
                )
                row = cur.fetchone()
                if not row:
                    raise LookupError(f"Lesson {lesson_id} not found")
                current_status, version, substrand_id = row
                if current_status == "published":
                    raise ValueError("Cannot mutate a published lesson in place")

                cur.execute(
                    """
                    UPDATE lessons
                    SET status = 'in_review'
                    WHERE id = %s
                    """,
                    (lesson_id,),
                )
        return {
            "lesson_id": str(lesson_id),
            "substrand_id": str(substrand_id),
            "version": int(version),
            "status": "approved",
        }
    finally:
        conn.close()


def publish_lesson(
    lesson_id: str,
    reviewer_id: Optional[str] = None,
    dsn: Optional[str] = None,
) -> dict[str, Any]:
    """
    Transition a draft/in_review lesson to `published`.
    Archives any previously published versions for the same substrand_id
    so older versions are retained but not mutated in place.
    """
    pg_dsn = dsn or settings.POSTGRES_DSN
    conn = psycopg2.connect(pg_dsn)
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT status::text, version, substrand_id FROM lessons WHERE id = %s",
                    (lesson_id,),
                )
                row = cur.fetchone()
                if not row:
                    raise LookupError(f"Lesson {lesson_id} not found")
                _, version, substrand_id = row

                # Archive older published versions for this substrand
                cur.execute(
                    """
                    UPDATE lessons
                    SET status = 'archived'
                    WHERE substrand_id = %s
                      AND status = 'published'
                      AND id <> %s
                    """,
                    (substrand_id, lesson_id),
                )

                cur.execute(
                    """
                    UPDATE lessons
                    SET status = 'published',
                        published_at = now()
                    WHERE id = %s
                    """,
                    (lesson_id,),
                )
        return {
            "lesson_id": str(lesson_id),
            "substrand_id": str(substrand_id),
            "version": int(version),
            "status": "published",
        }
    finally:
        conn.close()
