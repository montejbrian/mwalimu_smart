"""
MwalimuSmart — backend/followups/prompt.py
Pedagogical prompt construction for lesson-scoped AI follow-ups (Phase 3).

Rule: Prompt must include lesson objectives + script excerpt per docs/tasks/phase-3-followups.md.
"""

from __future__ import annotations

from typing import Any, Optional


def build_followup_prompt(
    lesson_title: str,
    objectives: list[str],
    script_excerpt: str,
    key_concepts: list[str],
    conversation_history: list[dict[str, str]],
    question: str,
    grade_name: Optional[str] = None,
    subject_name: Optional[str] = None,
    strand_name: Optional[str] = None,
    lang: str = "en",
) -> str:
    """
    Constructs a context-rich prompt anchoring the student's question
    to the specific lesson objectives and script content they just studied.
    """
    use_sw = lang == "sw"
    grade_str = grade_name or "Grade 7"
    subject_str = subject_name or "CBC Curriculum"
    strand_str = strand_name or "Topic"

    obj_text = "\n".join(f"- {o}" for o in (objectives or ["Understand core concepts"]))
    concepts_text = ", ".join(key_concepts or []) if key_concepts else "Core concepts"
    script_text = script_excerpt.strip() if script_excerpt else "Lesson content reviewed by teachers."

    if use_sw:
        system_instructions = f"""Wewe ni MwalimuSmart, mwalimu msaidizi wa AI mwenye upendo, anayefuata mtaala wa CBC nchini Kenya kwa wanafunzi wa {grade_str} katika somo la {subject_str} (Mada: {strand_str}).
Lengo lako ni kumsaidia mwanafunzi kuelewa vizuri dhana alizosoma hivi punde, kwa kutoa mifano halisi ya Kenya (mashambani, mijini, sokoni, darasani).

MUKTADHA WA SOMO:
Somo: {lesson_title}
Malengo ya Somo:
{obj_text}
Dhana Muhimu: {concepts_text}

SEHEMU YA HATI YA SOMO AMBAYO MWANAFUNZI AMESOMA:
\"\"\"
{script_text}
\"\"\"

KANUNI ZA MAJIBU:
1. Jibu kwa Kiswahili fasaha, rahisi kueleweka, na chenye heshima na kutia moyo.
2. Jibu moja kwa moja swali la mwanafunzi ukitumia muktadha wa somo hili.
3. Toa maelezo mafupi (aya 1-3) na mifano ya vitendo inayolingana na Kenya.
4. Kama mwanafunzi anauliza kitu kisicho kwenye somo, jibu kifupi na umrejeshe kwa upole kwenye mada ya somo."""
    else:
        system_instructions = f"""You are MwalimuSmart, an encouraging, patient AI teacher's assistant aligned with Kenya's Competency-Based Curriculum (CBC) for {grade_str} learners in {subject_str} (Strand: {strand_str}).
Your purpose is to help the learner understand and clarify concepts from the lesson they just watched/read, using relatable Kenyan classroom, home, or community examples.

LESSON CONTEXT:
Lesson Title: {lesson_title}
Learning Objectives:
{obj_text}
Key Concepts: {concepts_text}

EXCERPT OF LESSON SCRIPT REVIEWED BY THE LEARNER:
\"\"\"
{script_text}
\"\"\"

GUIDELINES FOR YOUR RESPONSE:
1. Respond in clear, encouraging, age-appropriate English.
2. Directly answer the learner's question anchored in the lesson context above.
3. Keep answers concise (1-3 paragraphs) with concrete Kenyan applications (e.g., local markets, cooking, school science lab, farm).
4. Maintain a warm, supportive formative tone. Never make the student feel bad for asking."""

    history_lines: list[str] = []
    for msg in conversation_history[-6:]:
        role = "Learner" if msg.get("role") == "student" else "Mwalimu"
        content = msg.get("content", "").strip()
        if content:
            history_lines.append(f"{role}: {content}")

    history_text = "\n".join(history_lines) if history_lines else "(No prior messages in this session)"

    prompt = f"""{system_instructions}

CONVERSATION HISTORY:
{history_text}

LEARNER'S QUESTION:
{question}

MWALIMU'S RESPONSE:"""

    return prompt


def build_visual_classifier_prompt(question: str, lesson_title: str) -> str:
    """
    Prompt for classifying whether a follow-up question matches a Tier 1 visual template.
    Returns JSON { "template_id": "...", "params": { ... } } or { "no_match": true }.
    """
    return f"""You are an educational visual router for a Kenyan CBC learning platform.
Given a learner's question about the lesson "{lesson_title}", determine if it can be effectively clarified using one of our 5 Tier-1 interactive visual templates:

AVAILABLE TEMPLATES:
1. "equation_balance" — for algebraic equations, solving for unknowns, balancing scales (e.g. 2x + 4 = 10).
2. "number_line" — for rational numbers, integers, negative values, ordering numbers, distance between numbers.
3. "fraction_bar" — for fractions, equivalent fractions, comparing parts of a whole (e.g. 3/4 vs 6/8).
4. "flowchart" — for sequential scientific steps, separation of mixtures, biological cycles, or decision pathways.
5. "graph_plot" — for coordinate geometry, linear functions (y = mx + c), graphing points (x, y).

QUESTION:
"{question}"

INSTRUCTIONS:
- If the question clearly benefits from one of these templates, output ONLY a JSON object:
  {{
    "template_id": "<template_id>",
    "params": <valid params object corresponding to the template>
  }}
- If the question is best answered purely through conversational text, output ONLY:
  {{
    "no_match": true
  }}

Do not include markdown code fences or explanatory text. Return raw JSON only."""

