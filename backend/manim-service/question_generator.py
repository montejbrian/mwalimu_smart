"""
question_generator.py
Extended QuestionGenerator with Bloom's Taxonomy cognitive level support.
Supports per-level prompt engineering, difficulty weighting, and distribution control.
"""

import json
import logging
import time
import re
import os
import google.generativeai as genai
from enum import Enum
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field

# ---------------------------------------------------------------------------
# BloomLevel Enum
# ---------------------------------------------------------------------------

class BloomLevel(Enum):
    """
    Bloom's Taxonomy cognitive levels in ascending order of cognitive demand.
    Each level represents a distinct type of thinking skill.
    """
    REMEMBER   = "Remember"
    UNDERSTAND = "Understand"
    APPLY      = "Apply"
    ANALYZE    = "Analyze"
    EVALUATE   = "Evaluate"
    CREATE     = "Create"

    @property
    def difficulty_weight(self) -> float:
        """
        Difficulty weight (1.0 = easiest, 3.0 = hardest).
        Used for adaptive weighting in assessments.
        """
        return {
            BloomLevel.REMEMBER:   1.0,
            BloomLevel.UNDERSTAND: 1.5,
            BloomLevel.APPLY:      2.0,
            BloomLevel.ANALYZE:    2.5,
            BloomLevel.EVALUATE:   3.0,
            BloomLevel.CREATE:     3.5,
        }[self]

    @property
    def action_verbs(self) -> List[str]:
        """Common Bloom's action verbs for use in prompt construction."""
        return {
            BloomLevel.REMEMBER:   ["define", "list", "recall", "identify", "name", "state"],
            BloomLevel.UNDERSTAND: ["explain", "describe", "summarize", "classify", "interpret"],
            BloomLevel.APPLY:      ["calculate", "solve", "use", "demonstrate", "predict"],
            BloomLevel.ANALYZE:    ["compare", "contrast", "distinguish", "examine", "differentiate"],
            BloomLevel.EVALUATE:   ["justify", "critique", "assess", "defend", "judge", "evaluate"],
            BloomLevel.CREATE:     ["design", "construct", "propose", "formulate", "hypothesize"],
        }[self]

    @property
    def example_question(self) -> str:
        """A single archetypal example question at this Bloom's level."""
        return {
            BloomLevel.REMEMBER:   "What is the primary reactant consumed during photosynthesis?",
            BloomLevel.UNDERSTAND: "Which statement BEST explains why leaves appear green?",
            BloomLevel.APPLY:      "A plant is kept in total darkness for 48 hours. What would you expect to happen to its starch reserves?",
            BloomLevel.ANALYZE:    "Compare the roles of ATP and NADPH in the Calvin cycle. How do they differ in their function?",
            BloomLevel.EVALUATE:   "A student claims that increasing CO₂ concentration always increases the rate of photosynthesis indefinitely. Is this claim valid? Justify your answer.",
            BloomLevel.CREATE:     "Design an experiment to investigate the effect of light wavelength on the rate of photosynthesis. Include controls and measurable variables.",
        }[self]


# ---------------------------------------------------------------------------
# Question dataclass
# ---------------------------------------------------------------------------

@dataclass
class Question:
    """
    Structured representation of a generated multiple-choice question.
    """
    id: str
    bloom_level: str
    difficulty_weight: float
    concept: str
    question: str
    options: Dict[str, str]
    correct_answer: str
    explanation: str
    distractor_explanations: Dict[str, str] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "bloom_level": self.bloom_level,
            "difficulty_weight": self.difficulty_weight,
            "concept": self.concept,
            "question": self.question,
            "options": self.options,
            "correct_answer": self.correct_answer,
            "explanation": self.explanation,
            "distractor_explanations": self.distractor_explanations,
        }


# ---------------------------------------------------------------------------
# Prompt templates per Bloom's Level
# ---------------------------------------------------------------------------

LEVEL_PROMPT_TEMPLATES: Dict[BloomLevel, str] = {
    BloomLevel.REMEMBER: """
# OBJECTIVE
Test RECALL and RECOGNITION (Bloom's Level 1 — Remember).
Questions must ask students to identify facts, terms, or definitions directly.

# GUIDANCE
- Use action verbs: {verbs}.
- Good example: "{example}"
- Rules: Correct answer must be a fact from the lesson. Distractors must be plausible but clearly incorrect.
""",

    BloomLevel.UNDERSTAND: """
# OBJECTIVE
Test COMPREHENSION (Bloom's Level 2 — Understand).
Questions must ask students to explain or interpret concepts in their own words.

# GUIDANCE
- Use action verbs: {verbs}.
- Good example: "{example}"
- Rules: Ask for classification, meaning, or summaries. Distractors should represent common misconceptions.
""",

    BloomLevel.APPLY: """
# OBJECTIVE
Test APPLICATION (Bloom's Level 3 — Apply).
Questions must present a NEW scenario and ask students to use lesson knowledge to solve it.

# GUIDANCE
- Use action verbs: {verbs}.
- Good example: "{example}"
- Rules: Scenario must be new. Correct answer requires applying a process/principle.
""",

    BloomLevel.ANALYZE: """
# OBJECTIVE
Test ANALYSIS (Bloom's Level 4 — Analyze).
Questions must ask students to break down information or find patterns.

# GUIDANCE
- Use action verbs: {verbs}.
- Good example: "{example}"
- Rules: Require COMPARING, CONTRASTING, or EXAMINING components.
""",

    BloomLevel.EVALUATE: """
# OBJECTIVE
Test EVALUATION (Bloom's Level 5 — Evaluate).
Questions must ask students to judge or critique a claim/solution based on criteria.

# GUIDANCE
- Use action verbs: {verbs}.
- Good example: "{example}"
- Rules: Assess validity of an argument; requires value judgment supported by content.
""",

    BloomLevel.CREATE: """
# OBJECTIVE
Test SYNTHESIS and CREATION (Bloom's Level 6 — Create).
Questions must ask students to propose or design something new based on principles.

# GUIDANCE
- Use action verbs: {verbs}.
- Good example: "{example}"
- Rules: Ask what they WOULD DO or how they WOULD DESIGN something new.
""",
}


# ---------------------------------------------------------------------------
# QuestionGenerator
# ---------------------------------------------------------------------------

class QuestionGenerator:
    """
    Generates educationally sound multiple-choice questions from lesson content,
    categorized by Bloom's Taxonomy levels using Google Gemini.
    """

    def __init__(self, api_key: str, model: str = "gemini-1.5-flash") -> None:
        """
        Initialize the generator with a Gemini API key.
        """
        if not api_key:
            raise ValueError("API key is required for QuestionGenerator.")

        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel(model)
        self.logger = logging.getLogger(__name__)
        if not self.logger.handlers:
            logging.basicConfig(level=logging.INFO)

    def generate_questions(
        self,
        lesson_content: str,
        topic: str,
        count: int = 5,
        distribution: Optional[Dict[BloomLevel, int]] = None,
    ) -> List[Question]:
        resolved = self._resolve_distribution(count, distribution)
        all_questions: List[Question] = []
        seen_texts: set = set()
        q_index: int = 1

        for level, level_count in resolved.items():
            if level_count <= 0:
                continue

            self.logger.info(f"Generating {level_count} question(s) at level: {level.value}")
            questions = self._generate_for_level(lesson_content, topic, level, level_count)

            for q in questions:
                norm = re.sub(r"\W+", "", q.question.lower())
                if norm in seen_texts:
                    continue
                seen_texts.add(norm)
                q.id = f"q{q_index}"
                all_questions.append(q)
                q_index += 1

        return all_questions

    def _resolve_distribution(self, count: int, distribution: Optional[Dict[BloomLevel, int]]) -> Dict[BloomLevel, int]:
        if distribution:
            return distribution
        levels = list(BloomLevel)
        result: Dict[BloomLevel, int] = {lv: 0 for lv in levels}
        for i in range(count):
            result[levels[i % len(levels)]] += 1
        return result

    def _build_level_prompt(self, lesson_content: str, topic: str, level: BloomLevel, num_questions: int) -> str:
        level_guidance = LEVEL_PROMPT_TEMPLATES[level].format(
            verbs=", ".join(level.action_verbs),
            example=level.example_question,
        )

        return f"""
# CONTEXT
You are an expert academic assessment tool for MwalimuSmart. You generate educationally sound multiple-choice questions aligned with Bloom's Taxonomy.

# OBJECTIVE
Generate exactly {num_questions} high-quality question(s) for the topic "{topic}" at the **{level.value}** cognitive level.

# STYLE (CLEAR Framework)
1. **CONCISE**: Direct questions and clear, distinct options. No fluff.
2. **LOGICAL**: Questions must strictly adhere to the {level.value} level.
3. **EXPLICIT**: Provide detailed explanations citing specific lesson concepts.

# COGNITIVE LEVEL GUIDANCE
{level_guidance}

# LESSON CONTENT
---
{lesson_content}
---

# RESPONSE FORMAT (Strict JSON)
Return ONLY a valid JSON object matching this schema:
{{
  "questions": [
    {{
      "bloom_level": "{level.value}",
      "concept": "Specific sub-concept from the lesson",
      "question": "The question text?",
      "options": {{
        "A": "Option 1",
        "B": "Option 2",
        "C": "Option 3",
        "D": "Option 4"
      }},
      "correct_answer": "A",
      "explanation": "Detailed explanation using lesson facts.",
      "distractor_explanations": {{
        "B": "Why Choice B is conceptually incorrect.",
        "C": "Why Choice C is conceptually incorrect.",
        "D": "Why Choice D is conceptually incorrect."
      }}
    }}
  ]
}}

# CRITICAL RULES
- No "all of the above" or "none of the above".
- DO NOT list cognitive levels lower than {level.value}.
- Ensure the logical flow: Concept → Application → Contrast (for distractors).
"""

    def _generate_for_level(self, lesson_content: str, topic: str, level: BloomLevel, num_questions: int) -> List[Question]:
        prompt = self._build_level_prompt(lesson_content, topic, level, num_questions)
        max_retries = 3
        
        for attempt in range(max_retries):
            try:
                response = self.model.generate_content(
                    prompt,
                    generation_config=genai.types.GenerationConfig(
                        response_mime_type="application/json",
                    )
                )

                content = response.text
                data = json.loads(content)
                raw_questions = data.get("questions", [])
                return self._validate_and_build(raw_questions, level)

            except Exception as e:
                self.logger.error(f"Error on attempt {attempt + 1}: {e}")
                if attempt < max_retries - 1:
                    time.sleep(2 ** attempt)
                else:
                    break

        return []

    def _validate_and_build(self, raw_questions: List[Dict[str, Any]], level: BloomLevel) -> List[Question]:
        valid: List[Question] = []
        required_keys = {"question", "options", "correct_answer", "explanation"}

        for idx, q in enumerate(raw_questions):
            try:
                if not required_keys.issubset(q.keys()):
                    continue

                options: Dict[str, str] = q.get("options", {})
                if not isinstance(options, dict) or len(options) != 4:
                    continue

                correct = q.get("correct_answer", "")
                if correct not in options:
                    continue

                valid.append(Question(
                    id=f"temp_{idx}",
                    bloom_level=str(level.value),
                    difficulty_weight=level.difficulty_weight,
                    concept=q.get("concept", "General"),
                    question=q["question"],
                    options=options,
                    correct_answer=correct,
                    explanation=q["explanation"],
                    distractor_explanations=q.get("distractor_explanations", {}),
                ))

            except Exception as e:
                self.logger.error(f"Error processing question {idx}: {e}")

        return valid

    def validate_questions(self, questions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        validated: List[Question] = []
        seen: set = set()

        for q in questions:
            try:
                level_value = q.get("bloom_level", "Remember")
                level = next((lv for lv in BloomLevel if lv.value == level_value), BloomLevel.REMEMBER)
                built = self._validate_and_build([q], level)
                for item in built:
                    norm = re.sub(r"\W+", "", item.question.lower())
                    if norm not in seen:
                        seen.add(norm)
                        validated.append(item)
            except Exception as e:
                self.logger.error(f"Validation error: {e}")

        return [q.to_dict() for q in validated]


# ---------------------------------------------------------------------------
# CLI test entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import os
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        pass

    key = os.getenv("OPENAI_API_KEY")
    if not key:
        print("OPENAI_API_KEY not found in environment. Skipping test.")
    else:
        gen = QuestionGenerator(key)

        content = (
            "Photosynthesis is the process by which green plants convert sunlight "
            "into glucose using carbon dioxide and water. The light-dependent reactions "
            "occur in the thylakoid membranes and produce ATP and NADPH, which are then "
            "used in the Calvin cycle (light-independent reactions) in the stroma to fix "
            "CO2 into glucose."
        )

        # Test with explicit distribution
        dist = {
            BloomLevel.REMEMBER:   1,
            BloomLevel.UNDERSTAND: 1,
            BloomLevel.APPLY:      1,
            BloomLevel.ANALYZE:    1,
            BloomLevel.EVALUATE:   1,
        }
        questions = gen.generate_questions(
            lesson_content=content,
            topic="Photosynthesis",
            distribution=dist,
        )
        print(json.dumps([q.to_dict() for q in questions], indent=2))
