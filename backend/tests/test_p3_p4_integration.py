"""
MwalimuSmart Institutional OS
tests/test_p3_p4_integration.py — P3 + P4 Integration Tests

Tests the full content pipeline:
  Researcher → Scriptwriter → Diagnostic (pass path)
  Researcher → Scriptwriter → Diagnostic → Scriptwriter (retake path)
  Diagnostic max retake enforcement (force-pass after 2 retakes)

Run with:
    pytest tests/test_p3_p4_integration.py -v

Uses mocked RAG + mocked LLM calls so tests run without live DB / API.
"""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch
import pytest

from graph.state import AgentState, LessonRequest, KICDChunk, LessonScript, DiagnosticQuestion


# ── Fixtures ──────────────────────────────────────────────────────────────────

MOCK_CHUNKS: list[KICDChunk] = [
    KICDChunk(
        chunk_id="chunk_001",
        content="Photosynthesis is the process by which green plants use sunlight, water and carbon dioxide to produce glucose and oxygen. The chlorophyll in leaves captures light energy.",
        source_title="KICD Grade 7 Science Textbook",
        page_number=42,
        strand="science_technology",
        grade_level="grade_7",
        similarity_score=0.91,
    ),
    KICDChunk(
        chunk_id="chunk_002",
        content="The light-dependent reactions occur in the thylakoid membranes. Water molecules are split, releasing oxygen as a by-product. ATP and NADPH are produced.",
        source_title="KICD Grade 7 Science Textbook",
        page_number=44,
        strand="science_technology",
        grade_level="grade_7",
        similarity_score=0.85,
    ),
]

MOCK_LESSON_SCRIPT_JSON = json.dumps({
    "title": "Photosynthesis: How Plants Make Food",
    "learning_objectives": [
        "Define photosynthesis and state the raw materials required",
        "Explain the role of chlorophyll in capturing light energy",
        "Write the word equation for photosynthesis",
    ],
    "introduction": "Have you ever wondered how plants make their own food? Today we will discover the amazing process of photosynthesis.",
    "body_sections": [
        {"heading": "What is Photosynthesis?", "content": "Photosynthesis is the process by which..."},
        {"heading": "Raw Materials", "content": "Plants need three raw materials..."},
        {"heading": "The Word Equation", "content": "Carbon dioxide + Water → Glucose + Oxygen"},
    ],
    "key_concepts": ["photosynthesis", "chlorophyll", "glucose", "carbon dioxide", "chloroplast"],
    "diagnostic_questions": [
        {
            "question_id": "q1",
            "question_text": "Which gas do plants absorb during photosynthesis?",
            "options": ["A. Oxygen", "B. Nitrogen", "C. Carbon dioxide", "D. Hydrogen"],
            "correct_answer": "C",
            "competency_tag": "identify_raw_materials",
        },
        {
            "question_id": "q2",
            "question_text": "Where does photosynthesis mainly take place in a plant?",
            "options": ["A. Roots", "B. Stem", "C. Flowers", "D. Leaves"],
            "correct_answer": "D",
            "competency_tag": "identify_photosynthesis_site",
        },
        {
            "question_id": "q3",
            "question_text": "What is the green pigment in leaves called?",
            "options": ["A. Melanin", "B. Chlorophyll", "C. Haemoglobin", "D. Carotene"],
            "correct_answer": "B",
            "competency_tag": "name_pigment",
        },
        {
            "question_id": "q4",
            "question_text": "Which gas is produced as a by-product of photosynthesis?",
            "options": ["A. Carbon dioxide", "B. Nitrogen", "C. Oxygen", "D. Hydrogen"],
            "correct_answer": "C",
            "competency_tag": "identify_by_products",
        },
        {
            "question_id": "q5",
            "question_text": "What energy source do plants use for photosynthesis?",
            "options": ["A. Chemical energy", "B. Wind energy", "C. Heat energy", "D. Light energy"],
            "correct_answer": "D",
            "competency_tag": "identify_energy_source",
        },
    ],
    "remedial_explanation": "Think of photosynthesis like a kitchen in a plant. The leaf is the kitchen...",
    "estimated_duration_minutes": 40,
})


def _make_base_state(student_answers: dict | None = None) -> AgentState:
    state: AgentState = {
        "request": LessonRequest(
            topic="Photosynthesis",
            strand="science_technology",
            grade_level="grade_7",
            school_id="school_001",
            teacher_id="teacher_001",
            lesson_id="lesson_test_001",
            language="en",
            remedial_mode=False,
        ),
        "retrieved_chunks": MOCK_CHUNKS,
        "retrieval_query":  "CBC science grade 7 photosynthesis",
        "retrieval_count":  2,
        "lesson_script":    None,
        "script_version":   0,
        "diagnostic_result": None,
        "retake_count":     0,
        "animation":        None,
        "workflow_status":  "scripting",
        "errors":           [],
        "node_durations":   [],
    }
    if student_answers is not None:
        state["student_answers"] = student_answers   # type: ignore[typeddict-unknown-key]
    return state


# ── Researcher tests ──────────────────────────────────────────────────────────

class TestResearcherNode:

    @patch("agents.researcher.search_with_fallback", return_value=MOCK_CHUNKS)
    @patch("agents.researcher._persist_retrieval_metadata")
    def test_researcher_happy_path(self, mock_persist, mock_search):
        from agents.researcher import researcher_node
        state  = _make_base_state()
        result = researcher_node(state)

        assert result["retrieval_count"] == 2
        assert len(result["retrieved_chunks"]) == 2
        assert result["workflow_status"] == "scripting"
        assert result["errors"] == []
        mock_search.assert_called_once()

    @patch("agents.researcher.search_with_fallback", return_value=[])
    @patch("agents.researcher._persist_retrieval_metadata")
    def test_researcher_empty_results(self, mock_persist, mock_search):
        from agents.researcher import researcher_node
        state  = _make_base_state()
        result = researcher_node(state)

        # Should still succeed — Scriptwriter handles empty context gracefully
        assert result["retrieval_count"] == 0
        assert result["workflow_status"] == "scripting"
        assert result["errors"] == []

    @patch("agents.researcher.search_with_fallback", side_effect=Exception("pgvector down"))
    def test_researcher_db_failure(self, mock_search):
        from agents.researcher import researcher_node
        state  = _make_base_state()
        result = researcher_node(state)

        assert result["workflow_status"] == "error"
        assert any("researcher_node" in e for e in result["errors"])


# ── Scriptwriter tests ────────────────────────────────────────────────────────

class TestScriptwriterNode:

    @patch("agents.scriptwriter._persist_script_version")
    @patch("agents.scriptwriter.genai")
    def test_scriptwriter_happy_path(self, mock_genai, mock_persist):
        mock_model    = MagicMock()
        mock_response = MagicMock(text=MOCK_LESSON_SCRIPT_JSON)
        mock_model.generate_content.return_value = mock_response
        mock_genai.GenerativeModel.return_value  = mock_model

        from agents.scriptwriter import scriptwriter_node
        state  = _make_base_state()
        result = scriptwriter_node(state)

        assert result["workflow_status"] == "diagnosing"
        assert result["script_version"] == 1
        assert result["lesson_script"]["title"] == "Photosynthesis: How Plants Make Food"
        assert len(result["lesson_script"]["diagnostic_questions"]) == 5
        assert result["errors"] == []

    @patch("agents.scriptwriter._persist_script_version")
    @patch("agents.scriptwriter.genai")
    def test_scriptwriter_remedial_mode(self, mock_genai, mock_persist):
        mock_model    = MagicMock()
        mock_response = MagicMock(text=MOCK_LESSON_SCRIPT_JSON)
        mock_model.generate_content.return_value = mock_response
        mock_genai.GenerativeModel.return_value  = mock_model

        from agents.scriptwriter import scriptwriter_node
        from graph.state import DiagnosticResult
        state = _make_base_state()
        state["retake_count"]     = 1
        state["diagnostic_result"] = DiagnosticResult(
            answers_given={"q1": "A", "q2": "A", "q3": "A", "q4": "A", "q5": "A"},
            score=1,
            percentage=20.0,
            outcome="retake",
            weak_competencies=["identify_raw_materials", "name_pigment"],
        )

        result = scriptwriter_node(state)
        assert result["script_version"] == 1

        # Verify the prompt included the remedial block
        call_args = mock_model.generate_content.call_args
        user_content = call_args.args[0]
        assert "REMEDIAL MODE" in user_content or "20%" in user_content

    @patch("agents.scriptwriter.genai")
    def test_scriptwriter_invalid_json(self, mock_genai):
        mock_model    = MagicMock()
        mock_response = MagicMock(text="not valid json {{{")
        mock_model.generate_content.return_value = mock_response
        mock_genai.GenerativeModel.return_value  = mock_model

        from agents.scriptwriter import scriptwriter_node
        state  = _make_base_state()
        result = scriptwriter_node(state)

        assert result["workflow_status"] == "error"
        assert any("parse error" in e for e in result["errors"])


# ── Diagnostic tests ──────────────────────────────────────────────────────────

def _state_with_script(student_answers: dict | None = None, retake_count: int = 0) -> AgentState:
    state = _make_base_state(student_answers)
    state["retake_count"] = retake_count
    state["lesson_script"] = json.loads(MOCK_LESSON_SCRIPT_JSON)   # type: ignore[assignment]
    return state


class TestDiagnosticNode:

    @patch("agents.diagnostic._persist_diagnostic_result")
    def test_pass_path_perfect_score(self, mock_persist):
        """5/5 correct — should pass immediately."""
        from agents.diagnostic import diagnostic_node
        answers = {"q1": "C", "q2": "D", "q3": "B", "q4": "C", "q5": "D"}
        state   = _state_with_script(answers)
        result  = diagnostic_node(state)

        assert result["diagnostic_result"]["outcome"] == "pass"
        assert result["diagnostic_result"]["score"] == 5
        assert result["diagnostic_result"]["percentage"] == 100.0
        assert result["workflow_status"] == "animating"
        assert result["retake_count"] == 0

    @patch("agents.diagnostic._persist_diagnostic_result")
    def test_pass_path_threshold_exact(self, mock_persist):
        """4/5 = 80% — exactly on threshold, should pass."""
        from agents.diagnostic import diagnostic_node
        answers = {"q1": "C", "q2": "D", "q3": "B", "q4": "C", "q5": "A"}  # q5 wrong
        state   = _state_with_script(answers)
        result  = diagnostic_node(state)

        assert result["diagnostic_result"]["outcome"] == "pass"
        assert result["diagnostic_result"]["score"] == 4
        assert result["diagnostic_result"]["percentage"] == 80.0
        assert result["workflow_status"] == "animating"

    @patch("agents.diagnostic._persist_diagnostic_result")
    def test_retake_path_low_score(self, mock_persist):
        """2/5 = 40% — should trigger retake."""
        from agents.diagnostic import diagnostic_node
        answers = {"q1": "C", "q2": "D", "q3": "A", "q4": "A", "q5": "A"}  # 2 correct
        state   = _state_with_script(answers)
        result  = diagnostic_node(state)

        assert result["diagnostic_result"]["outcome"] == "retake"
        assert result["retake_count"] == 1
        assert result["workflow_status"] == "scripting"
        assert result["request"]["remedial_mode"] is True
        assert len(result["diagnostic_result"]["weak_competencies"]) > 0

    @patch("agents.diagnostic._persist_diagnostic_result")
    def test_force_pass_after_max_retakes(self, mock_persist):
        """After 2 retakes, student is force-passed regardless of score."""
        from agents.diagnostic import diagnostic_node
        answers = {"q1": "A", "q2": "A", "q3": "A", "q4": "A", "q5": "A"}  # all wrong
        state   = _state_with_script(answers, retake_count=2)
        result  = diagnostic_node(state)

        assert result["diagnostic_result"]["outcome"] == "pass"
        assert result["workflow_status"] == "animating"
        # retake_count should NOT increment past max
        assert result["retake_count"] == 2

    @patch("agents.diagnostic._persist_diagnostic_result")
    def test_pending_when_no_answers(self, mock_persist):
        """No answers submitted yet — should return pending."""
        from agents.diagnostic import diagnostic_node
        state  = _state_with_script(student_answers=None)
        result = diagnostic_node(state)

        assert result["diagnostic_result"]["outcome"] == "pending"
        assert result["workflow_status"] == "diagnosing"

    def test_guard_no_script(self):
        """No lesson_script — should return error state."""
        from agents.diagnostic import diagnostic_node
        state  = _make_base_state({"q1": "C"})
        result = diagnostic_node(state)

        assert result["workflow_status"] == "error"
        assert any("lesson_script is None" in e for e in result["errors"])

    @patch("agents.diagnostic._persist_diagnostic_result")
    def test_weak_competencies_identified(self, mock_persist):
        """Verify weak competency tags are correctly extracted."""
        from agents.diagnostic import diagnostic_node
        # Only q1 correct (identify_raw_materials passes)
        answers = {"q1": "C", "q2": "A", "q3": "A", "q4": "A", "q5": "A"}
        state   = _state_with_script(answers)
        result  = diagnostic_node(state)

        weak = result["diagnostic_result"]["weak_competencies"]
        assert "identify_photosynthesis_site" in weak
        assert "name_pigment" in weak
        assert "identify_raw_materials" not in weak   # q1 was correct
