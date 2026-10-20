"""
MwalimuSmart — backend/authoring/assessment_gen.py
Formative MCQ + explanation generator for the batch authoring pipeline.
Replaces the legacy student-blocking diagnostic gate with 3–5 bilingual (EN/SW)
formative assessment questions stored in Postgres `assessment_questions`.
"""

from __future__ import annotations

import logging
from typing import Any

log = logging.getLogger(__name__)

LETTER_TO_INDEX = {"A": 0, "B": 1, "C": 2, "D": 3}


def _normalize_options_list(options_raw: Any) -> list[str]:
    if isinstance(options_raw, list) and len(options_raw) >= 4:
        return [str(x) for x in options_raw[:4]]
    if isinstance(options_raw, dict):
        return [
            str(options_raw.get("A", "Option A")),
            str(options_raw.get("B", "Option B")),
            str(options_raw.get("C", "Option C")),
            str(options_raw.get("D", "Option D")),
        ]
    return ["Option A", "Option B", "Option C", "Option D"]


def generate_assessment_questions(
    script_en: dict[str, Any],
    script_sw: dict[str, Any] | None = None,
    topic: str = "CBC Topic",
) -> list[dict[str, Any]]:
    """
    Produce 3–5 bilingual (EN + SW) MCQ questions with explanations
    conforming to the `assessment_questions` Postgres schema.
    """
    sw_data = script_sw or {}
    diag_en = script_en.get("diagnostic_questions") or []
    diag_sw = sw_data.get("diagnostic_questions") or []

    questions: list[dict[str, Any]] = []

    for idx, q_en in enumerate(diag_en[:5]):
        q_sw = diag_sw[idx] if idx < len(diag_sw) else {}
        opts_en = _normalize_options_list(q_en.get("options"))
        opts_sw = _normalize_options_list(q_sw.get("options") or opts_en)

        raw_correct = q_en.get("correct_index")
        if isinstance(raw_correct, int) and 0 <= raw_correct <= 3:
            correct_idx = raw_correct
        else:
            letter = str(q_en.get("correct_answer", "A")).strip().upper()
            correct_idx = LETTER_TO_INDEX.get(letter, 0)

        question_en = str(
            q_en.get("question_en")
            or q_en.get("question_text")
            or q_en.get("question")
            or f"Which statement best describes {topic}?"
        )
        question_sw = str(
            q_sw.get("question_sw")
            or q_sw.get("question_text")
            or q_sw.get("question")
            or f"Ni maelezo yapi yanafafanua vyema {topic}?"
        )

        explanation_en = str(
            q_en.get("explanation_en")
            or q_en.get("explanation")
            or f"Option {chr(65 + correct_idx)} aligns with the KICD curriculum objective for {topic}."
        )
        explanation_sw = str(
            q_sw.get("explanation_sw")
            or q_sw.get("explanation")
            or f"Chaguo {chr(65 + correct_idx)} linalingana na lengo la mtaala wa KICD kuhusu {topic}."
        )

        questions.append(
            {
                "question_en": question_en,
                "question_sw": question_sw,
                "options_en": opts_en,
                "options_sw": opts_sw,
                "correct_index": correct_idx,
                "explanation_en": explanation_en,
                "explanation_sw": explanation_sw,
                "competency_tag": str(q_en.get("competency_tag") or "critical_thinking"),
                "sort_order": idx + 1,
            }
        )

    # Ensure at least 3 formative questions exist even if scriptwriter omitted diagnostic_questions
    concepts = script_en.get("key_concepts") or [topic, "Core Principle", "Application"]
    while len(questions) < 3:
        idx = len(questions)
        concept = str(concepts[idx % len(concepts)])
        questions.append(
            {
                "question_en": f"Which of the following accurately explains '{concept}' in {topic}?",
                "question_sw": f"Ni ipi kati ya zifuatazo inaeleza kwa usahihi '{concept}' katika {topic}?",
                "options_en": [
                    f"It is a key CBC concept used to understand {topic}",
                    "It is unrelated to the sub-strand",
                    "It only applies outside Science and Mathematics",
                    "None of the above",
                ],
                "options_sw": [
                    f"Ni dhana muhimu ya CBC inayotumika kuelewa {topic}",
                    "Haihusiani na mada hii ndogo",
                    "Inatumika nje ya Sayansi na Hisabati pekee",
                    "Hakuna jibu sahihi",
                ],
                "correct_index": 0,
                "explanation_en": f"'{concept}' is one of the core concepts covered in {topic}.",
                "explanation_sw": f"'{concept}' ni mojawapo ya dhana kuu katika {topic}.",
                "competency_tag": "critical_thinking",
                "sort_order": idx + 1,
            }
        )

    return questions[:5]
