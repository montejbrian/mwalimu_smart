"""
MwalimuSmart — backend/tests/test_p3_1_followups.py
Tests for follow-up prompt builder and token streaming generator (P3.1).
"""

from followups.prompt import build_followup_prompt
from followups.stream import stream_followup_tokens


def test_build_followup_prompt_includes_objectives_and_script_excerpt_en():
    prompt = build_followup_prompt(
        lesson_title="Separating Mixtures",
        objectives=["Understand filtration vs sieving", "Apply in everyday life"],
        script_excerpt="Filtration uses a porous filter paper to separate insoluble solids from liquids.",
        key_concepts=["filtration", "residue", "filtrate"],
        conversation_history=[
            {"role": "student", "content": "Hello teacher"},
            {"role": "assistant", "content": "Welcome! What would you like to clarify?"},
        ],
        question="Why don't we use a sieve for muddy water?",
        grade_name="Grade 7",
        subject_name="Integrated Science",
        strand_name="Mixtures",
        lang="en",
    )

    # Acceptance criteria: Prompt includes lesson objectives + script excerpt
    assert "Understand filtration vs sieving" in prompt
    assert "Filtration uses a porous filter paper" in prompt
    assert "filtration, residue, filtrate" in prompt
    assert "Separating Mixtures" in prompt
    assert "Why don't we use a sieve for muddy water?" in prompt
    assert "Grade 7" in prompt
    assert "Integrated Science" in prompt
    assert "MwalimuSmart" in prompt


def test_build_followup_prompt_swahili():
    prompt = build_followup_prompt(
        lesson_title="Kutenganisha Michanganyiko",
        objectives=["Kuelewa uchujaji na upepetaji"],
        script_excerpt="Uchujaji hutenganisha yabisi isiyoyeyuka kutoka kwenye kimiminika.",
        key_concepts=["uchujaji", "mchujo"],
        conversation_history=[],
        question="Mchujo ni nini?",
        grade_name="Gredi ya 7",
        subject_name="Sayansi Unganishi",
        strand_name="Michanganyiko",
        lang="sw",
    )

    assert "Kuelewa uchujaji na upepetaji" in prompt
    assert "Uchujaji hutenganisha yabisi isiyoyeyuka" in prompt
    assert "Wewe ni MwalimuSmart" in prompt
    assert "Mchujo ni nini?" in prompt


def test_stream_followup_tokens_yields_tokens_and_done():
    payload = {
        "lesson_title": "Separating Mixtures",
        "objectives": ["Distinguish filtration"],
        "script_excerpt": "Filtration separates solid and liquid.",
        "key_concepts": ["filtration"],
        "question": "What is the residue?",
        "lang": "en",
    }

    tokens = []
    done_item = None
    for item in stream_followup_tokens(payload):
        if "token" in item:
            tokens.append(item["token"])
        if item.get("done"):
            done_item = item

    assert len(tokens) > 0
    assert done_item is not None
    assert "full_text" in done_item
    assert len(done_item["full_text"]) > 0
