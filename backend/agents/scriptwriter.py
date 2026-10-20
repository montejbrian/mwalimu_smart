"""
MwalimuSmart Institutional OS
agents/scriptwriter.py — Pedagogical Scriptwriter Node (P3 — full implementation)

Responsibilities
----------------
1. Format retrieved KICD chunks into structured prompt context.
2. Select EN or SW prompt template based on lesson language.
3. Inject remedial context block when retake_count > 0.
4. Call Claude Sonnet to produce a CBC-compliant lesson script as JSON.
5. Validate the JSON structure before writing to state.
6. Persist script version to lesson_jobs.
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any

import google.generativeai as genai
import psycopg2

from graph.state import AgentState, DiagnosticQuestion, LessonScript
from config.settings import settings
from prompts.templates import (
    SCRIPTWRITER_SYSTEM,
    SCRIPTWRITER_USER_EN,
    SCRIPTWRITER_USER_SW,
    REMEDIAL_BLOCK_EN,
    REMEDIAL_BLOCK_SW,
)

log = logging.getLogger(__name__)

MAX_KICD_CHUNKS_IN_PROMPT = 6   # Token budget guard


# ── Context builder ───────────────────────────────────────────────────────────

def _format_kicd_context(state: AgentState) -> str:
    chunks = state.get("retrieved_chunks", [])[:MAX_KICD_CHUNKS_IN_PROMPT]
    if not chunks:
        return "(No KICD source material retrieved — use general CBC knowledge.)"
    return "\n\n".join(
        f"[{c['source_title']}, p.{c['page_number']} | similarity={c['similarity_score']:.2f}]\n{c['content']}"
        for c in chunks
    )


def _format_remedial_block(state: AgentState, language: str) -> str:
    retake_count = state.get("retake_count", 0)
    if retake_count == 0:
        return ""

    diagnostic = state.get("diagnostic_result")
    if not diagnostic:
        return ""

    template = REMEDIAL_BLOCK_SW if language == "sw" else REMEDIAL_BLOCK_EN
    return template.substitute(
        score_pct=f"{diagnostic['percentage']:.0f}",
        weak_competencies=", ".join(diagnostic.get("weak_competencies", [])) or "general understanding",
        grade_display=state["request"]["grade_level"].replace("_", " ").title(),
    )


def _build_user_prompt(state: AgentState) -> str:
    req          = state["request"]
    language     = req.get("language", "en")
    template     = SCRIPTWRITER_USER_SW if language == "sw" else SCRIPTWRITER_USER_EN
    kicd_context = _format_kicd_context(state)
    remedial     = _format_remedial_block(state, language)

    return template.substitute(
        grade_display=req["grade_level"].replace("_", " ").title(),
        strand_display=req["strand"].replace("_", " ").title(),
        topic=req["topic"],
        kicd_context=kicd_context,
        remedial_block=remedial,
    )


# ── JSON parser + validator ───────────────────────────────────────────────────

REQUIRED_KEYS = {
    "title", "learning_objectives", "introduction", "body_sections",
    "key_concepts", "diagnostic_questions", "remedial_explanation",
    "estimated_duration_minutes",
}

def _parse_and_validate(raw: str) -> LessonScript:
    """
    Parse LLM JSON output. Raises ValueError on structural violations
    so the node can return a clean error state.
    """
    # Strip accidental markdown fences
    clean = raw.strip()
    if clean.startswith("```"):
        lines = clean.splitlines()
        clean = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

    data = json.loads(clean)

    missing = REQUIRED_KEYS - data.keys()
    if missing:
        raise ValueError(f"Scriptwriter JSON missing keys: {missing}")

    questions_raw = data["diagnostic_questions"]
    if len(questions_raw) != 5:
        raise ValueError(f"Expected 5 diagnostic questions, got {len(questions_raw)}")

    questions: list[DiagnosticQuestion] = []
    for q in questions_raw:
        questions.append(DiagnosticQuestion(
            question_id=q["question_id"],
            question_text=q["question_text"],
            options=q["options"],
            correct_answer=q["correct_answer"].strip().upper(),
            competency_tag=q.get("competency_tag", "general"),
        ))

    return LessonScript(
        title=data["title"],
        learning_objectives=data["learning_objectives"],
        introduction=data["introduction"],
        body_sections=data["body_sections"],
        key_concepts=data["key_concepts"],
        diagnostic_questions=questions,
        remedial_explanation=data["remedial_explanation"],
        estimated_duration_minutes=int(data["estimated_duration_minutes"]),
    )


# ── DB persistence ────────────────────────────────────────────────────────────

def _persist_script_version(lesson_id: str, version: int, title: str) -> None:
    try:
        conn = psycopg2.connect(settings.POSTGRES_DSN)
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE lesson_jobs
                SET workflow_status = 'diagnosing',
                    script_version  = %s
                WHERE lesson_id = %s
                """,
                (version, lesson_id),
            )
        conn.commit()
        conn.close()
    except Exception as exc:
        log.warning("Could not persist script version: %s", exc)


# ── Node entrypoint ───────────────────────────────────────────────────────────

def scriptwriter_node(state: AgentState) -> dict[str, Any]:
    """
    LangGraph node — Pedagogical Scriptwriter.

    Reads:   request, retrieved_chunks, diagnostic_result (on retake), retake_count
    Writes:  lesson_script, script_version, workflow_status, node_durations, errors
    """
    t0      = time.perf_counter()
    req     = state["request"]
    version = state.get("script_version", 0) + 1
    is_remedial = state.get("retake_count", 0) > 0

    log.info(
        "[Scriptwriter] topic=%r version=%d remedial=%s",
        req["topic"], version, is_remedial,
    )

    try:
        genai.configure(api_key=settings.GEMINI_API_KEY)
        model = genai.GenerativeModel(
            model_name="gemini-2.5-flash",
            system_instruction=SCRIPTWRITER_SYSTEM,
        )
        
        user_prompt = _build_user_prompt(state)
        response = model.generate_content(user_prompt)
        
        raw_json = response.text
        script   = _parse_and_validate(raw_json)
        elapsed  = time.perf_counter() - t0

        log.info(
            "[Scriptwriter] Done — %r | %d objectives | %d questions | %dmin | %.2fs",
            script["title"],
            len(script["learning_objectives"]),
            len(script["diagnostic_questions"]),
            script["estimated_duration_minutes"],
            elapsed,
        )

        _persist_script_version(req["lesson_id"], version, script["title"])

        return {
            "lesson_script":   script,
            "script_version":  version,
            "workflow_status": "diagnosing",
            "node_durations":  [{"node": "scriptwriter", "seconds": round(elapsed, 3)}],
            "errors":          [],
        }

    except (json.JSONDecodeError, ValueError) as exc:
        elapsed = time.perf_counter() - t0
        log.error("[Scriptwriter] Parse/validation error: %s", exc)
        return {
            "workflow_status": "error",
            "errors":          [f"scriptwriter_node parse error: {exc}"],
            "node_durations":  [{"node": "scriptwriter", "seconds": round(elapsed, 3)}],
        }
    except Exception as exc:
        elapsed = time.perf_counter() - t0
        log.error("[Scriptwriter] Failed: %s", exc, exc_info=True)
        return {
            "workflow_status": "error",
            "errors":          [f"scriptwriter_node: {exc}"],
            "node_durations":  [{"node": "scriptwriter", "seconds": round(elapsed, 3)}],
        }
