"""
MwalimuSmart — backend/tests/test_p4_2_whiteboard.py
Unit tests for P4.2: Progressive Whiteboard op stream generator and router
"""

import pytest
from followups.whiteboard import (
    build_whiteboard_prompt,
    generate_mock_whiteboard_ops,
    stream_whiteboard_ops,
)
from followups.visual_router import route_visual, check_whiteboard_heuristic


def test_build_whiteboard_prompt_bilingual():
    """Prompt must include lesson title, student question, and CBC instructions in EN & SW."""
    prompt_en = build_whiteboard_prompt("Solve 2x + 3 = 7", "Linear Equations", lang="en")
    assert "Linear Equations" in prompt_en
    assert "2x + 3 = 7" in prompt_en
    assert "whiteboard" in prompt_en.lower()

    prompt_sw = build_whiteboard_prompt("Tatua 2x + 3 = 7", "Milinganyo", lang="sw")
    assert "Milinganyo" in prompt_sw
    assert "ubao" in prompt_sw.lower()


def test_generate_mock_whiteboard_ops_linear_equations():
    """Mock op generator must yield all required op types: write, highlight, arrow, equation."""
    ops = list(generate_mock_whiteboard_ops("Solve 2x + 3 = 7", "Linear Equations", lang="en"))
    assert len(ops) >= 4

    op_types = {op["op"] for op in ops}
    assert "write" in op_types
    assert "equation" in op_types
    assert "highlight" in op_types
    assert "arrow" in op_types

    # Validate op spec schema
    for op in ops:
        assert "op" in op
        assert "step" in op
        if op["op"] == "write":
            assert "text" in op
        elif op["op"] == "equation":
            assert "latex" in op
        elif op["op"] == "highlight":
            assert "target" in op
        elif op["op"] == "arrow":
            assert "from" in op and "to" in op


def test_stream_whiteboard_ops_yields_valid_ops():
    """Stream generator yields successive progressive steps."""
    payload = {
        "question": "Can you show step by step on board how to solve 3x - 5 = 10?",
        "lesson_title": "Solving Equations",
        "lang": "en",
    }
    ops = list(stream_whiteboard_ops(payload))
    assert len(ops) > 0
    # Steps should be sequentially ordered
    steps = [op["step"] for op in ops if "step" in op]
    assert steps == sorted(steps)


def test_check_whiteboard_heuristic_routes_whiteboard_queries():
    """Questions asking for whiteboard or step-by-step on board route to whiteboard tier."""
    queries = [
        "Show me step by step on the whiteboard",
        "Can you write on board how this works?",
        "Explain step by step on board",
        "Onyesha hatua kwa hatua ubaoni",
    ]
    for q in queries:
        match = check_whiteboard_heuristic(q, "Algebra")
        assert match is not None
        assert match["tier"] == "whiteboard"
        assert match["template_id"] == "whiteboard"
        assert len(match["ops"]) > 0

    # General router also prioritizes whiteboard
    routed = route_visual("Draw step by step on board how 2x + 3 = 7 is solved", "Equations")
    assert routed["tier"] == "whiteboard"
    assert routed["template_id"] == "whiteboard"
