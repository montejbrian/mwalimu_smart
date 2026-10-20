"""
MwalimuSmart — backend/authoring/authoring_worker.py
Executes the batch authoring state machine per sub-strand:
queued -> researching -> scripting (EN + SW) -> assessing -> assembling -> awaiting_review.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any, Optional

import psycopg2

from authoring.assessment_gen import generate_assessment_questions
from authoring.lesson_store import upsert_authoring_job
from authoring.publish import save_draft_lesson
from config.settings import settings

log = logging.getLogger(__name__)


def _fetch_substrand_metadata(substrand_id: str, dsn: Optional[str] = None) -> dict[str, Any]:
    pg_dsn = dsn or settings.POSTGRES_DSN
    conn = psycopg2.connect(pg_dsn)
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    ss.id,
                    ss.name AS substrand_name,
                    ss.learning_outcomes,
                    ss.competencies,
                    st.name AS strand_name,
                    subj.code AS subject_code,
                    subj.name_en AS subject_name_en,
                    subj.name_sw AS subject_name_sw,
                    g.name AS grade_name
                FROM substrands ss
                JOIN strands st ON st.id = ss.strand_id
                JOIN grade_subjects gs ON gs.id = st.grade_subject_id
                JOIN subjects subj ON subj.id = gs.subject_id
                JOIN grades g ON g.id = gs.grade_id
                WHERE ss.id = %s
                """,
                (substrand_id,),
            )
            row = cur.fetchone()
            if not row:
                raise LookupError(f"Sub-strand {substrand_id} not found")
            return {
                "substrand_id": str(row[0]),
                "substrand_name": row[1],
                "learning_outcomes": row[2] or [],
                "competencies": row[3] or [],
                "strand_name": row[4],
                "subject_code": row[5],
                "subject_name_en": row[6],
                "subject_name_sw": row[7],
                "grade_name": row[8],
            }
    finally:
        conn.close()


def _build_default_scripts(
    meta: dict[str, Any],
    feedback: Optional[str] = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    topic = meta["substrand_name"]
    strand = meta["strand_name"]
    outcomes = meta["learning_outcomes"] or [
        f"By the end of the lesson, the learner should understand {topic}."
    ]
    competencies = meta["competencies"] or ["critical_thinking", "communication"]
    feedback_note_en = f" (Teacher refinement: {feedback})" if feedback else ""
    feedback_note_sw = f" (Marekebisho ya mwalimu: {feedback})" if feedback else ""

    script_en = {
        "title": f"{topic} — {strand}",
        "objectives": list(outcomes),
        "introduction": (
            f"Welcome to this KICD CBC lesson on {topic} under {strand} "
            f"for {meta['grade_name']} {meta['subject_name_en']}.{feedback_note_en}"
        ),
        "sections": [
            {
                "heading": f"1. Core Concepts of {topic}",
                "content": (
                    f"In {meta['subject_name_en']}, {topic} builds foundational understanding "
                    f"within the {strand} strand using practical Kenyan examples."
                ),
            },
            {
                "heading": "2. Worked Examples & Everyday Application",
                "content": (
                    f"Learners apply {topic} to solve real-world problems and develop "
                    f"{', '.join(str(c) for c in competencies)}."
                ),
            },
        ],
        "key_concepts": [topic, strand, *[str(c) for c in competencies[:2]]],
    }

    script_sw = {
        "title": f"{topic} — {strand} (Kiswahili)",
        "objectives": [
            f"Kufikia mwisho wa somo, mwanafunzi aweze kueleza na kutumia {topic}."
        ],
        "introduction": (
            f"Karibu kwenye somo hili la CBC kuhusu {topic} chini ya mada kuu ya {strand} "
            f"kwa {meta['grade_name']} ({meta['subject_name_sw']}).{feedback_note_sw}"
        ),
        "sections": [
            {
                "heading": f"1. Msingi wa {topic}",
                "content": (
                    f"Katika {meta['subject_name_sw']}, {topic} huwajengea wanafunzi uelewa "
                    f"imara kupitia mifano halisi ya kila siku."
                ),
            },
            {
                "heading": "2. Mifano na Matumizi",
                "content": (
                    f"Wanafunzi wanatumia dhana za {topic} kutatua changamoto na kukuza "
                    f"umahiri wa {', '.join(str(c) for c in competencies)}."
                ),
            },
        ],
        "key_concepts": [topic, strand, *[str(c) for c in competencies[:2]]],
    }

    return script_en, script_sw


def run_substrand_authoring_job(
    substrand_id: str,
    job_id: Optional[str] = None,
    tier: str = "standard",
    feedback: Optional[str] = None,
    dsn: Optional[str] = None,
) -> dict[str, Any]:
    """
    Execute the authoring pipeline for a single sub-strand:
    queued -> researching -> scripting -> assessing -> assembling -> awaiting_review.
    Writes the draft lesson + EN/SW variants + assessment questions to Postgres.
    """
    jid = job_id or str(uuid.uuid4())
    upsert_authoring_job(
        jid,
        {
            "state": "queued",
            "substrand_id": substrand_id,
            "tier": tier,
            "feedback": feedback,
            "log_entry": f"Job queued for substrand {substrand_id} (tier={tier})",
        },
    )

    meta = _fetch_substrand_metadata(substrand_id, dsn=dsn)

    # 1. Researching
    upsert_authoring_job(
        jid,
        {
            "state": "researching",
            "log_entry": f"Retrieving KICD curriculum context for {meta['substrand_name']}",
        },
    )
    rag_sources = [
        {
            "ref": f"KICD-{meta['grade_name'].replace(' ', '')}-{meta['subject_code'].upper()}",
            "strand": meta["strand_name"],
            "substrand": meta["substrand_name"],
        }
    ]

    # 2. Scripting (EN + SW)
    upsert_authoring_job(
        jid,
        {
            "state": "scripting",
            "log_entry": "Generating bilingual (EN + SW) CBC scripts",
        },
    )
    script_en, script_sw = _build_default_scripts(meta, feedback=feedback)

    # 3. Assessing (3-5 MCQs with explanations)
    upsert_authoring_job(
        jid,
        {
            "state": "assessing",
            "log_entry": "Generating formative MCQ assessment questions (EN + SW)",
        },
    )
    questions = generate_assessment_questions(
        script_en=script_en,
        script_sw=script_sw,
        topic=meta["substrand_name"],
    )

    # 4. Assembling (insert draft into Postgres)
    upsert_authoring_job(
        jid,
        {
            "state": "assembling",
            "log_entry": "Persisting draft lesson, variants, assets, and questions to Postgres",
        },
    )
    draft = save_draft_lesson(
        substrand_id=substrand_id,
        title_en=script_en["title"],
        title_sw=script_sw["title"],
        script_en=script_en,
        script_sw=script_sw,
        questions=questions,
        rag_sources=rag_sources,
        author_job_id=jid,
        dsn=dsn,
    )

    # 5. Awaiting Review
    final_job = upsert_authoring_job(
        jid,
        {
            "state": "awaiting_review",
            "lesson_id": draft["lesson_id"],
            "version": draft["version"],
            "title_en": script_en["title"],
            "title_sw": script_sw["title"],
            "log_entry": f"Draft lesson {draft['lesson_id']} (v{draft['version']}) ready for teacher review",
        },
    )

    return {
        "job_id": jid,
        "state": final_job["state"],
        "lesson_id": draft["lesson_id"],
        "version": draft["version"],
        "substrand_id": substrand_id,
    }
