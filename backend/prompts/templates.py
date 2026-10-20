"""
MwalimuSmart Institutional OS
prompts/templates.py — Centralised LLM Prompt Templates

All prompts live here. Agent nodes import from this module.
This makes prompts easy to:
  - Version and A/B test without touching agent logic
  - Translate to Kiswahili without refactoring node code
  - Audit for CBC compliance independently

Template naming convention:
    {AGENT}_{LANGUAGE}_{VERSION}
    e.g. SCRIPTWRITER_EN_V1, SCRIPTWRITER_SW_V1
"""

from __future__ import annotations

from string import Template


# ══════════════════════════════════════════════════════════════════════════════
# RESEARCHER prompts
# ══════════════════════════════════════════════════════════════════════════════

RESEARCHER_QUERY_TEMPLATE = Template(
    "CBC ${strand} lesson for ${grade_level} on the topic: ${topic}. "
    "Include key concepts, definitions, worked examples, learning outcomes, "
    "and assessment criteria as specified by KICD."
)


# ══════════════════════════════════════════════════════════════════════════════
# SCRIPTWRITER prompts
# ══════════════════════════════════════════════════════════════════════════════

SCRIPTWRITER_SYSTEM = """\
You are a senior CBC (Competency Based Curriculum) curriculum designer
certified by KICD (Kenya Institute of Curriculum Development).

Your lesson scripts:
- Follow the CBC pedagogical approach: inquiry-based, learner-centred
- Respect the cognitive level of the specified grade
- Use concrete, relatable examples from the Kenyan context
- Embed formative assessment throughout, not just at the end
- Produce exactly the JSON schema specified — no markdown, no preamble

You ALWAYS respond with a single valid JSON object only.
"""

SCRIPTWRITER_USER_EN = Template("""\
Create a CBC lesson script for a ${grade_display} ${strand_display} class.
Topic: "${topic}"
Language: English

KICD-approved reference material (primary source — cite implicitly):
${kicd_context}
${remedial_block}

Return EXACTLY this JSON (all fields required, no extra keys):
{
  "title": "string",
  "learning_objectives": ["string"],
  "introduction": "string",
  "body_sections": [
    {"heading": "string", "content": "string"}
  ],
  "key_concepts": ["string"],
  "diagnostic_questions": [
    {
      "question_id": "q1",
      "question_text": "string",
      "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
      "correct_answer": "A|B|C|D",
      "competency_tag": "string"
    }
  ],
  "remedial_explanation": "string",
  "estimated_duration_minutes": integer
}

Rules:
- learning_objectives: exactly 3–5 CBC strand outcomes
- body_sections: exactly 3–5 sections
- key_concepts: 4–8 terms (the Animator will visualise these)
- diagnostic_questions: exactly 5 questions (q1–q5)
- Each question tests a DISTINCT CBC competency
- estimated_duration_minutes: realistic for one classroom period (30–80)
""")

SCRIPTWRITER_USER_SW = Template("""\
Tengeneza skripti ya somo la CBC kwa darasa la ${grade_display} ${strand_display}.
Mada: "${topic}"
Lugha: Kiswahili

Nyenzo za KICD zilizoidhinishwa (chanzo kikuu):
${kicd_context}
${remedial_block}

Rudisha JSON hii HASA (sehemu zote zinahitajika):
{
  "title": "string",
  "learning_objectives": ["string"],
  "introduction": "string",
  "body_sections": [
    {"heading": "string", "content": "string"}
  ],
  "key_concepts": ["string"],
  "diagnostic_questions": [
    {
      "question_id": "q1",
      "question_text": "string",
      "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
      "correct_answer": "A|B|C|D",
      "competency_tag": "string"
    }
  ],
  "remedial_explanation": "string",
  "estimated_duration_minutes": integer
}
""")

REMEDIAL_BLOCK_EN = Template("""\

REMEDIAL MODE ACTIVE
--------------------
The student scored ${score_pct}% on the diagnostic (pass threshold: 80%).
Weak competencies: ${weak_competencies}

Instructions:
- Simplify vocabulary for ${grade_display}
- Add 2–3 more concrete Kenyan examples per concept
- Break complex ideas into smaller numbered steps
- Address the weak competencies explicitly in body_sections
- Keep the same JSON structure
""")

REMEDIAL_BLOCK_SW = Template("""\

HALI YA MARUDIO IMEWASHWA
-------------------------
Mwanafunzi alipata ${score_pct}% kwenye tathmini (kiwango cha kufaulu: 80%).
Uwezo dhaifu: ${weak_competencies}

Maelekezo:
- Rahisisha msamiati kwa darasa la ${grade_display}
- Ongeza mifano 2–3 zaidi ya Kenya kwa kila dhana
- Gawanya mawazo magumu katika hatua ndogo zilizohesabiwa
""")


# ══════════════════════════════════════════════════════════════════════════════
# DIAGNOSTIC prompts (used when LLM grades free-text answers)
# ══════════════════════════════════════════════════════════════════════════════

DIAGNOSTIC_GRADER_SYSTEM = """\
You are a CBC assessment specialist. Grade the student's answer strictly
against the correct answer and CBC competency descriptors.
Respond ONLY with JSON: {"is_correct": true|false, "feedback": "string"}
"""

DIAGNOSTIC_GRADER_USER = Template("""\
Question: ${question_text}
Correct answer: ${correct_answer}
Student answered: ${student_answer}
CBC competency being tested: ${competency_tag}
Grade level: ${grade_level}

Is the student's answer correct? Provide brief, encouraging feedback.
""")
