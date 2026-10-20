"""
MwalimuSmart — backend/followups/visual_router.py
Fast visual router for Tier 1 templates (<500ms) with keyword heuristics + LLM fallback (Phase 3).
"""

from __future__ import annotations

import json
import logging
import os
import re
import sys
from typing import Any

from followups.templates import TEMPLATES, validate_template_params

log = logging.getLogger(__name__)


def route_by_heuristics(question: str, lesson_title: str) -> dict[str, Any] | None:
    """
    Sub-millisecond keyword and regex heuristic matcher.
    Guarantees <50ms response in dev environments for common visual queries.
    """
    q = question.lower()
    title = lesson_title.lower()

    # 1. Equation Balance heuristics
    if re.search(r"\b(\d*x|\d*y)\s*[\+\-\*\/]\s*\d+\s*=\s*\d+", q) or "solve for" in q or "equation" in q or "balance scale" in q:
        eq_match = re.search(r"([0-9a-zA-Z_\s\+\-\*\/]+\s*=\s*[0-9a-zA-Z_\s\+\-\*\/]+)", question)
        raw_eq = eq_match.group(1).strip() if eq_match else "2x + 3 = 11"
        sides = raw_eq.split("=")
        left = sides[0].strip() if len(sides) > 1 else "2x + 3"
        right = sides[1].strip() if len(sides) > 1 else "11"
        # Clean leading/trailing prompt phrases
        left = re.sub(r"^(?:how to solve|solve|explain|can you solve|find)\s*", "", left, flags=re.IGNORECASE).strip()
        right = re.sub(r"\s*(?:balance|please|step by step|with scale).*$", "", right, flags=re.IGNORECASE).strip()
        equation_str = f"{left} = {right}" if left and right else "2x + 3 = 11"
        return {
            "match": True,
            "tier": 1,
            "template_id": "equation_balance",
            "params": validate_template_params(
                "equation_balance",
                {
                    "equation": equation_str,
                    "left": left or "2x + 3",
                    "right": right or "11",
                    "balanced": True,
                },
            ),
        }

    # 2. Number Line heuristics
    if "number line" in q or "negative numbers" in q or "integers" in q or "less than" in q or "greater than" in q:
        numbers = [int(n) for n in re.findall(r"-?\b\d+\b", q)]
        points = [{"value": n, "label": str(n)} for n in numbers[:3]] if numbers else [{"value": -2, "label": "-2"}, {"value": 3, "label": "3"}]
        min_val = min([p["value"] for p in points] + [-5])
        max_val = max([p["value"] for p in points] + [5])
        return {
            "match": True,
            "tier": 1,
            "template_id": "number_line",
            "params": validate_template_params(
                "number_line",
                {
                    "min": min_val - 1,
                    "max": max_val + 1,
                    "points": points,
                },
            ),
        }

    # 3. Fraction Bar heuristics
    if "fraction" in q or re.search(r"\b\d+/\d+\b", q) or "numerator" in q or "denominator" in q or "half" in q or "quarter" in q:
        fraction_matches = re.findall(r"(\d+)/(\d+)", q)
        bars = []
        if fraction_matches:
            colors = ["#10b981", "#38bdf8", "#f59e0b"]
            for i, (num, den) in enumerate(fraction_matches[:3]):
                bars.append({
                    "numerator": int(num),
                    "denominator": int(den),
                    "label": f"{num}/{den}",
                    "color": colors[i % len(colors)],
                })
        else:
            bars = [
                {"numerator": 3, "denominator": 4, "label": "3/4", "color": "#10b981"},
                {"numerator": 6, "denominator": 8, "label": "6/8", "color": "#38bdf8"},
            ]
        return {
            "match": True,
            "tier": 1,
            "template_id": "fraction_bar",
            "params": validate_template_params(
                "fraction_bar",
                {"bars": bars},
            ),
        }

    # 4. Flowchart / Process heuristics
    if "flowchart" in q or "steps" in q or "stages" in q or "how to separate" in q or "process of" in q or "cycle" in q or "procedure" in q:
        return {
            "match": True,
            "tier": 1,
            "template_id": "flowchart",
            "params": validate_template_params(
                "flowchart",
                {"title": f"Process: {lesson_title}"},
            ),
        }

    # 5. Graph Plot heuristics
    if "graph" in q or "plot" in q or "coordinates" in q or re.search(r"\by\s*=\s*", q) or "slope" in q:
        return {
            "match": True,
            "tier": 1,
            "template_id": "graph_plot",
            "params": validate_template_params(
                "graph_plot",
                {"title": f"Plot: {lesson_title}"},
            ),
        }

    return None


def route_visual(question: str, lesson_title: str) -> dict[str, Any]:
    """
    Decides whether a follow-up question routes to a Tier 1 visual template.
    Returns:
      { "match": True, "tier": 1, "template_id": "...", "params": { ... } }
    or:
      { "match": False, "no_match": True }
    """
    # 1. Fast heuristics (<5ms)
    fast_match = route_by_heuristics(question, lesson_title)
    if fast_match:
        return fast_match

    # 2. LLM classifier fallback if key available and not in test
    is_test = os.environ.get("NODE_ENV") == "test" or os.environ.get("PYTEST_CURRENT_TEST")

    if not is_test:
        try:
            from config.settings import settings
            from followups.prompt import build_visual_classifier_prompt

            api_key = settings.GEMINI_API_KEY
            if api_key:
                import google.generativeai as genai

                genai.configure(api_key=api_key)
                model = genai.GenerativeModel("models/gemini-1.5-flash")
                prompt = build_visual_classifier_prompt(question, lesson_title)
                res = model.generate_content(prompt)
                text = (res.text or "").strip()

                # Clean markdown code blocks if present
                if text.startswith("```"):
                    text = re.sub(r"^```(?:json)?\s*", "", text)
                    text = re.sub(r"\s*```$", "", text)

                data = json.loads(text)
                if not data.get("no_match") and data.get("template_id") in TEMPLATES:
                    template_id = data["template_id"]
                    params = validate_template_params(template_id, data.get("params", {}))
                    return {
                        "match": True,
                        "tier": 1,
                        "template_id": template_id,
                        "params": params,
                    }
        except Exception as exc:
            log.debug("LLM visual router exception: %s", exc)

    return {"match": False, "no_match": True}


def main() -> None:
    try:
        raw = sys.stdin.read()
        if not raw.strip():
            sys.stdout.write(json.dumps({"match": False, "no_match": True}) + "\n")
            return
        payload = json.loads(raw)
        result = route_visual(
            payload.get("question", ""),
            payload.get("lesson_title", "Lesson"),
        )
        sys.stdout.write(json.dumps(result) + "\n")
    except Exception as exc:
        sys.stdout.write(json.dumps({"match": False, "no_match": True, "error": str(exc)}) + "\n")


if __name__ == "__main__":
    main()
