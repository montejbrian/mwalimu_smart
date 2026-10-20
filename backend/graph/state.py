"""
MwalimuSmart Institutional OS
graph/state.py — Shared AgentState TypedDict

This is the single source of truth for ALL data flowing through the
LangGraph graph. Every node reads from and writes to this object.
No agent holds private state — everything lives here.
"""

from __future__ import annotations

from typing import Annotated, Any, Literal, Optional
from typing_extensions import TypedDict
import operator


# ── Enums / Literals ──────────────────────────────────────────────────────────

CBCStrand = Literal[
    "mathematics",
    "english",
    "kiswahili",
    "science_technology",
    "social_studies",
    "creative_arts",
    "physical_health",
    "religious_education",
    "business_studies",
    "agriculture",
]

GradeLevel = Literal[
    "grade_1", "grade_2", "grade_3",        # Lower primary
    "grade_4", "grade_5", "grade_6",        # Upper primary
    "grade_7", "grade_8", "grade_9",        # Junior secondary
    "grade_10", "grade_11", "grade_12",     # Senior secondary
]

DiagnosticOutcome = Literal["pass", "retake", "pending"]

WorkflowStatus = Literal[
    "initialised",
    "researching",
    "scripting",
    "diagnosing",
    "animating",
    "complete",
    "error",
]


# ── Sub-TypedDicts ─────────────────────────────────────────────────────────────

class LessonRequest(TypedDict):
    """Inbound parameters from the Express API."""
    topic: str                          # e.g. "Photosynthesis"
    strand: CBCStrand
    grade_level: GradeLevel
    school_id: str                      # PostgreSQL institution FK
    teacher_id: str
    lesson_id: str                      # UUID generated at API layer
    language: Literal["en", "sw"]       # English or Kiswahili
    remedial_mode: bool                 # True when retake path re-enters graph


class KICDChunk(TypedDict):
    """A single RAG result chunk from the pgvector store."""
    chunk_id: str
    content: str                        # Raw text from KICD material
    source_title: str                   # e.g. "KICD Grade 7 Science Textbook"
    page_number: Optional[int]
    strand: CBCStrand
    grade_level: GradeLevel
    similarity_score: float             # cosine similarity [0.0 – 1.0]


class DiagnosticQuestion(TypedDict):
    """One question in the 5-question diagnostic set."""
    question_id: str                    # q1 – q5
    question_text: str
    options: list[str]                  # 4 MCQ options (A–D)
    correct_answer: str                 # "A" | "B" | "C" | "D"
    competency_tag: str                 # CBC competency this tests


class DiagnosticResult(TypedDict):
    """Scored result after the student completes the diagnostic."""
    answers_given: dict[str, str]       # {question_id: answer_given}
    score: int                          # 0–5
    percentage: float                   # 0.0–100.0
    outcome: DiagnosticOutcome          # "pass" | "retake" | "pending"
    weak_competencies: list[str]        # competency_tags the student missed


class LessonScript(TypedDict):
    """Full CBC-compliant lesson script produced by the Scriptwriter."""
    title: str
    learning_objectives: list[str]      # CBC strand learning outcomes
    introduction: str                   # Hook / prior knowledge activation
    body_sections: list[dict[str, str]] # [{"heading": ..., "content": ...}]
    key_concepts: list[str]             # Terms the Animator will visualise
    diagnostic_questions: list[DiagnosticQuestion]
    remedial_explanation: str           # Simplified re-explanation for retake path
    estimated_duration_minutes: int


class AnimationArtifact(TypedDict):
    """Output from the Animator node."""
    manim_class_name: str               # e.g. "PhotosynthesisScene"
    manim_source_code: str              # Full Python source to pass to subprocess
    render_status: Literal["queued", "rendering", "done", "failed"]
    mp4_path: Optional[str]            # Absolute path on Fedora server
    mongodb_file_id: Optional[str]     # GridFS ID after upload
    render_duration_seconds: Optional[float]


# ── Master AgentState ──────────────────────────────────────────────────────────

class AgentState(TypedDict):
    """
    Single shared state object for the MwalimuSmart LangGraph graph.

    Annotated[list, operator.add] on list fields means LangGraph will
    APPEND new items rather than overwrite — safe for parallel node writes.
    All other fields are last-write-wins.
    """

    # ── Input ─────────────────────────────────────────────────────────────────
    request: LessonRequest

    # ── Researcher outputs ────────────────────────────────────────────────────
    retrieved_chunks: Annotated[list[KICDChunk], operator.add]
    retrieval_query: str                # The query string sent to pgvector
    retrieval_count: int                # How many chunks were returned

    # ── Scriptwriter outputs ──────────────────────────────────────────────────
    lesson_script: Optional[LessonScript]
    script_version: int                 # Increments on each remedial re-draft

    # ── Diagnostic outputs ────────────────────────────────────────────────────
    diagnostic_result: Optional[DiagnosticResult]
    retake_count: int                   # How many retakes so far (max 2)

    # ── Animator outputs ──────────────────────────────────────────────────────
    animation: Optional[AnimationArtifact]

    # ── Orchestration metadata ────────────────────────────────────────────────
    workflow_status: WorkflowStatus
    errors: Annotated[list[str], operator.add]   # Accumulate, never overwrite
    node_durations: Annotated[list[dict[str, Any]], operator.add]  # Perf log
