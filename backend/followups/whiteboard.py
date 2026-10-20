"""
MwalimuSmart — backend/followups/whiteboard.py
Progressive whiteboard op-stream generator for interactive step-by-step visual explanations (Phase 4.2).

Supported Op Specification:
  { "op": "write",     "text": "2x + 3 = 7", "step": 1 }
  { "op": "highlight", "target": "2x", "color": "#f59e0b", "step": 2 }
  { "op": "arrow",     "from": "both sides", "to": "2x + 3 = 7", "label": "subtract 3", "step": 3 }
  { "op": "equation",  "latex": "x = 2", "step": 4 }
  { "op": "diagram",   "shape": "scale|box|circle|axes", "label": "...", "step": 5 }
  { "op": "clear",     "step": 6 }
"""

from __future__ import annotations

import json
import logging
import os
import re
import sys
from typing import Any, Generator

from config.settings import settings

log = logging.getLogger(__name__)

WHITEBOARD_SYSTEM_PROMPT = """\
You are MwalimuSmart Whiteboard Engine, an interactive chalkboard animator for CBC Kenyan classrooms.
Your job is to break down a concept or equation into a progressive sequence of 4-8 visual whiteboard operations.

Output ONLY valid JSON objects, ONE PER LINE (NDJSON). No markdown backticks, no comments, no explanation:
{"op":"write","text":"Equation: 2x + 3 = 7","step":1}
{"op":"highlight","target":"+ 3","color":"#f59e0b","step":2}
{"op":"arrow","from":"both sides","to":"2x + 3 = 7","label":"subtract 3","step":3}
{"op":"equation","latex":"2x = 4","step":4}
{"op":"highlight","target":"2x","color":"#10b981","step":5}
{"op":"arrow","from":"divide by 2","to":"2x = 4","label":"divide both sides by 2","step":6}
{"op":"equation","latex":"x = 2","step":7}

Allowed "op" types:
- "write": plain text or step note (keys: "text", "step")
- "highlight": accent target term or box (keys: "target", "color", "step")
- "arrow": step arrow from source to target (keys: "from", "to", "label", "step")
- "equation": mathematical formula or latex (keys: "latex", "step")
- "diagram": geometric shape, scale, or container (keys: "shape", "label", "step")
- "clear": wipe stage for next calculation (keys: "step")
"""


def build_whiteboard_prompt(question: str, lesson_title: str, lang: str = "en") -> str:
    """Builds prompt for Gemini to generate progressive whiteboard draw ops."""
    use_sw = lang == "sw"
    if use_sw:
        return (
            f"Mada ya Somo: {lesson_title}\n"
            f"Swali la Mwanafunzi: {question}\n\n"
            "Tengeneza mfululizo wa maagizo ya ubao (whiteboard ops) kwa Kiswahili na fomula wazi zinazoonyesha hatua kwa hatua."
        )
    return (
        f"Lesson Title: {lesson_title}\n"
        f"Student Question: {question}\n\n"
        "Generate a step-by-step progressive whiteboard draw op sequence solving or explaining this clearly."
    )


def generate_mock_whiteboard_ops(
    question: str, lesson_title: str, lang: str = "en"
) -> Generator[dict[str, Any], None, None]:
    """Generates realistic pedagogical whiteboard op sequences for offline dev and tests."""
    q = question.lower()
    use_sw = lang == "sw"

    # 1. Linear Equation / Algebra questions
    if re.search(r"\b(\d*x|\d*y)\b", q) or "solve" in q or "equation" in q:
        eq_match = re.search(r"([0-9a-zA-Z_\s\+\-\*\/]+\s*=\s*[0-9a-zA-Z_\s\+\-\*\/]+)", question)
        raw_eq = eq_match.group(1).strip() if eq_match else "2x + 3 = 7"
        ops = [
            {
                "op": "write",
                "text": f"Somo: {lesson_title}" if use_sw else f"Problem: {lesson_title}",
                "step": 1,
            },
            {
                "op": "equation",
                "latex": raw_eq,
                "step": 2,
            },
            {
                "op": "highlight",
                "target": "+ 3" if "+ 3" in raw_eq else raw_eq.split("=")[0].strip(),
                "color": "#f59e0b",
                "step": 3,
            },
            {
                "op": "arrow",
                "from": "pande zote" if use_sw else "both sides",
                "to": raw_eq,
                "label": "toa 3 pande zote" if use_sw else "subtract 3 from both sides",
                "step": 4,
            },
            {
                "op": "equation",
                "latex": "2x = 4",
                "step": 5,
            },
            {
                "op": "arrow",
                "from": "gawanya kwa 2" if use_sw else "divide by 2",
                "to": "2x = 4",
                "label": "gawanya pande zote kwa 2" if use_sw else "divide both sides by 2",
                "step": 6,
            },
            {
                "op": "equation",
                "latex": "x = 2",
                "step": 7,
            },
            {
                "op": "highlight",
                "target": "x = 2",
                "color": "#10b981",
                "step": 8,
            },
        ]
    # 2. Fractions questions
    elif "fraction" in q or "/" in q or "sehemu" in q:
        ops = [
            {
                "op": "write",
                "text": "Kulinganisha Sehemu za Nambari" if use_sw else "Comparing Equivalent Fractions",
                "step": 1,
            },
            {
                "op": "equation",
                "latex": "\\frac{1}{2} = \\frac{2}{4} = \\frac{4}{8}",
                "step": 2,
            },
            {
                "op": "diagram",
                "shape": "box",
                "label": "Kizuizi cha 1/2" if use_sw else "1/2 unit bar",
                "step": 3,
            },
            {
                "op": "highlight",
                "target": "\\frac{1}{2}",
                "color": "#38bdf8",
                "step": 4,
            },
            {
                "op": "arrow",
                "from": "\\times 2",
                "to": "\\frac{2}{4}",
                "label": "zidisha juu na chini kwa 2" if use_sw else "multiply numerator & denominator by 2",
                "step": 5,
            },
            {
                "op": "equation",
                "latex": "\\frac{1 \\times 2}{2 \\times 2} = \\frac{2}{4}",
                "step": 6,
            },
        ]
    # 3. Science / General CBC Problem Solving
    else:
        ops = [
            {
                "op": "write",
                "text": f"Dhana Kuu: {lesson_title}" if use_sw else f"Core Concept: {lesson_title}",
                "step": 1,
            },
            {
                "op": "diagram",
                "shape": "scale",
                "label": "Usawa wa CBC" if use_sw else "Balanced System",
                "step": 2,
            },
            {
                "op": "highlight",
                "target": lesson_title,
                "color": "#10b981",
                "step": 3,
            },
            {
                "op": "arrow",
                "from": "Sababu" if use_sw else "Cause",
                "to": "Matokeo" if use_sw else "Effect",
                "label": "Uhusiano wa moja kwa moja" if use_sw else "Direct relationship",
                "step": 4,
            },
            {
                "op": "write",
                "text": "Hitimisho: Fuata kanuni hatua kwa hatua." if use_sw else "Summary: Apply step-by-step principles.",
                "step": 5,
            },
        ]

    for op in ops:
        yield op


def stream_whiteboard_ops(payload: dict[str, Any]) -> Generator[dict[str, Any], None, None]:
    """
    Main generator yielding structured whiteboard operations.
    Yields:
      { "op": "write", "text": "...", "step": 1 }
      ...
    """
    question = payload.get("question", "")
    lesson_title = payload.get("lesson_title", "CBC Lesson")
    lang = payload.get("lang", "en")

    # Fast mock / test generator if no Gemini key or offline
    if not settings.GEMINI_API_KEY or settings.GEMINI_API_KEY.startswith("test_") or os.environ.get("MOCK_WHITEBOARD") == "1":
        for op in generate_mock_whiteboard_ops(question, lesson_title, lang):
            yield op
        return

    try:
        import google.generativeai as genai

        genai.configure(api_key=settings.GEMINI_API_KEY)
        model = genai.GenerativeModel(
            model_name="gemini-2.5-flash",
            system_instruction=WHITEBOARD_SYSTEM_PROMPT,
        )
        prompt = build_whiteboard_prompt(question, lesson_title, lang)
        response = model.generate_content(prompt, stream=True)

        buffer = ""
        step_idx = 1
        for chunk in response:
            text = chunk.text
            buffer += text
            while "\n" in buffer:
                line, buffer = buffer.split("\n", 1)
                line = line.strip()
                if not line:
                    continue
                try:
                    op = json.loads(line)
                    if isinstance(op, dict) and "op" in op:
                        if "step" not in op:
                            op["step"] = step_idx
                        step_idx += 1
                        yield op
                except json.JSONDecodeError:
                    continue

        if buffer.strip():
            try:
                op = json.loads(buffer.strip())
                if isinstance(op, dict) and "op" in op:
                    yield op
            except json.JSONDecodeError:
                pass

    except Exception as exc:
        log.warning("[Whiteboard] Gemini stream failed: %s, falling back to mock ops", exc)
        for op in generate_mock_whiteboard_ops(question, lesson_title, lang):
            yield op


def main() -> None:
    """CLI mode: reads JSON payload from stdin and writes NDJSON ops to stdout."""
    raw = sys.stdin.read().strip()
    payload = json.loads(raw) if raw else {}
    for op in stream_whiteboard_ops(payload):
        sys.stdout.write(json.dumps(op) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
