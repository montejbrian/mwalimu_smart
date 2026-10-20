"""
MwalimuSmart Institutional OS
agents/diagnostic.py — Diagnostic Assessment Node (P4 — full implementation)

The CBC pedagogical gate. Every student must pass BEFORE receiving the
animated lesson package — ensuring mastery-based progression.

State Machine
-------------

                    ┌─────────────────────────────────┐
     START ──► [diagnostic_node]                      │
                     │                                 │
          ┌──────────┴──────────┐                      │
          ▼                     ▼                      │
       score ≥ 80%           score < 80%               │
          │                     │                      │
          ▼                retake_count < 2            │
       "pass"                   │                      │
          │                     ▼                      │
          ▼              [scriptwriter_node]  ◄────────┘
       [animator]         (remedial_mode=True)
                               │
                         retake_count = 2
                               │
                               ▼
                            "pass" (forced)
                               │
                               ▼
                           [animator]

Scoring
-------
- 5 MCQ questions, 1 point each
- Pass threshold: 80% (4/5 correct)
- Max retakes: 2
- After 2 retakes, student is passed through regardless (teacher intervention
  is flagged instead)

Answer modes
------------
- MCQ  : exact letter match (A/B/C/D) — used in this implementation
- Future: free-text answers graded by LLM (DIAGNOSTIC_GRADER prompt ready)
"""

from __future__ import annotations

import logging
import time
from typing import Any

import psycopg2

from graph.state import AgentState, DiagnosticResult
from config.settings import settings

log = logging.getLogger(__name__)

PASS_THRESHOLD_PCT: float = 80.0
MAX_RETAKES:        int   = 2


# ── Scoring ───────────────────────────────────────────────────────────────────

def _score_mcq(
    questions: list[dict],
    answers:   dict[str, str],
) -> tuple[int, float, list[str]]:
    """
    Score student MCQ answers against correct answers.

    Returns
    -------
    score              : int   — correct answers (0–5)
    percentage         : float — 0.0–100.0
    weak_competencies  : list  — competency_tags of missed questions
    """
    score             = 0
    weak_competencies: list[str] = []

    for q in questions:
        qid     = q["question_id"]
        correct = q["correct_answer"].strip().upper()
        given   = answers.get(qid, "").strip().upper()

        if given == correct:
            score += 1
        else:
            tag = q.get("competency_tag", "general")
            if tag not in weak_competencies:
                weak_competencies.append(tag)

    total      = max(len(questions), 1)
    percentage = round((score / total) * 100.0, 1)

    return score, percentage, weak_competencies


# ── DB persistence ────────────────────────────────────────────────────────────

def _persist_diagnostic_result(
    lesson_id:   str,
    score:       int,
    percentage:  float,
    outcome:     str,
    retake_count: int,
) -> None:
    """Write diagnostic outcome to lesson_jobs for reporting and audit."""
    try:
        conn = psycopg2.connect(settings.POSTGRES_DSN)
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE lesson_jobs SET
                    diagnostic_score   = %s,
                    diagnostic_outcome = %s,
                    retake_count       = %s,
                    workflow_status    = %s
                WHERE lesson_id = %s
                """,
                (
                    percentage,
                    outcome,
                    retake_count,
                    "animating" if outcome == "pass" else "scripting",
                    lesson_id,
                ),
            )
        conn.commit()
        conn.close()
    except Exception as exc:
        log.warning("Could not persist diagnostic result: %s", exc)


# ── Retake path builder ───────────────────────────────────────────────────────

def _build_retake_summary(
    questions:         list[dict],
    answers:           dict[str, str],
    weak_competencies: list[str],
    percentage:        float,
    retake_count:      int,
) -> str:
    """
    Build a teacher-facing retake summary string for the lesson package.
    This is stored in MongoDB alongside the lesson script so teachers
    can see exactly where each student struggled.
    """
    lines = [
        f"── Diagnostic Retake #{retake_count} Summary ──",
        f"Score: {percentage:.0f}% (Pass threshold: {PASS_THRESHOLD_PCT:.0f}%)",
        f"Weak competencies: {', '.join(weak_competencies) or 'none identified'}",
        "",
        "Question breakdown:",
    ]
    for q in questions:
        qid     = q["question_id"]
        correct = q["correct_answer"].upper()
        given   = answers.get(qid, "—").upper()
        status  = "✓" if given == correct else "✗"
        lines.append(f"  {status} {qid}: student={given} correct={correct}  [{q.get('competency_tag','')}]")

    return "\n".join(lines)


# ── Node entrypoint ───────────────────────────────────────────────────────────

def diagnostic_node(state: AgentState) -> dict[str, Any]:
    """
    LangGraph node — Diagnostic Assessment.

    Flow
    ----
    1. Guard: ensure lesson_script exists.
    2. Check for student_answers in state (injected by API layer).
       If absent → return "pending" (graph pauses; API re-invokes with answers).
    3. Score answers.
    4. Apply pass/retake/force-pass logic.
    5. Update request.remedial_mode flag for Scriptwriter re-entry.
    6. Persist to lesson_jobs.

    Reads:   lesson_script, student_answers (API-injected), retake_count
    Writes:  diagnostic_result, retake_count, request (remedial_mode),
             workflow_status, node_durations, errors
    """
    t0 = time.perf_counter()

    # ── Guard: script must exist ──────────────────────────────────────────────
    script = state.get("lesson_script")
    if script is None:
        elapsed = time.perf_counter() - t0
        return {
            "workflow_status": "error",
            "errors":          ["diagnostic_node: lesson_script is None"],
            "node_durations":  [{"node": "diagnostic", "seconds": round(elapsed, 3)}],
        }

    questions     = script.get("diagnostic_questions", [])
    retake_count  = state.get("retake_count", 0)
    req           = state["request"]

    log.info(
        "[Diagnostic] lesson=%s retake_count=%d questions=%d",
        req["lesson_id"], retake_count, len(questions),
    )

    # ── Await answers ─────────────────────────────────────────────────────────
    # student_answers is NOT in the TypedDict by default — it's injected
    # dynamically by the Express API layer after the frontend collects responses.
    # Pattern: graph pauses after Scriptwriter; API calls graph.update_state()
    # with student_answers, then graph.stream() resumes from diagnostic_node.
    student_answers: dict[str, str] = state.get("student_answers", {})  # type: ignore[typeddict-item]

    if not student_answers:
        # No answers yet — surface questions to the API layer and wait
        elapsed = time.perf_counter() - t0
        log.info("[Diagnostic] Awaiting student answers...")
        return {
            "diagnostic_result": DiagnosticResult(
                answers_given={},
                score=0,
                percentage=0.0,
                outcome="pending",
                weak_competencies=[],
            ),
            "workflow_status": "diagnosing",
            "node_durations":  [{"node": "diagnostic", "seconds": round(elapsed, 3)}],
            "errors":          [],
        }

    # ── Score ─────────────────────────────────────────────────────────────────
    score, percentage, weak_competencies = _score_mcq(questions, student_answers)

    log.info(
        "[Diagnostic] score=%d/5 (%.1f%%) weak=%s",
        score, percentage, weak_competencies,
    )

    # ── Routing decision ──────────────────────────────────────────────────────
    force_pass = retake_count >= MAX_RETAKES

    if percentage >= PASS_THRESHOLD_PCT or force_pass:
        outcome      = "pass"
        next_status  = "animating"
        if force_pass and percentage < PASS_THRESHOLD_PCT:
            log.warning(
                "[Diagnostic] Max retakes (%d) reached for lesson=%s — "
                "forcing pass. Teacher intervention recommended.",
                MAX_RETAKES, req["lesson_id"],
            )
    else:
        outcome      = "retake"
        next_status  = "scripting"
        retake_count += 1
        log.info("[Diagnostic] RETAKE #%d triggered.", retake_count)

    # ── Build retake summary for teacher dashboard ────────────────────────────
    retake_summary = (
        _build_retake_summary(questions, student_answers, weak_competencies, percentage, retake_count)
        if outcome == "retake" else ""
    )
    if retake_summary:
        log.debug("[Diagnostic] Retake summary:\n%s", retake_summary)

    # ── Build result ──────────────────────────────────────────────────────────
    result = DiagnosticResult(
        answers_given=student_answers,
        score=score,
        percentage=percentage,
        outcome=outcome,       # type: ignore[arg-type]
        weak_competencies=weak_competencies,
    )

    # ── Update request with remedial flag ─────────────────────────────────────
    updated_request = {**req, "remedial_mode": outcome == "retake"}

    elapsed = time.perf_counter() - t0
    log.info("[Diagnostic] outcome=%s in %.2fs", outcome.upper(), elapsed)

    # ── Persist ───────────────────────────────────────────────────────────────
    _persist_diagnostic_result(
        lesson_id=req["lesson_id"],
        score=score,
        percentage=percentage,
        outcome=outcome,
        retake_count=retake_count,
    )

    return {
        "diagnostic_result": result,
        "retake_count":      retake_count,
        "request":           updated_request,
        "workflow_status":   next_status,
        "node_durations":    [{"node": "diagnostic", "seconds": round(elapsed, 3)}],
        "errors":            [],
    }
