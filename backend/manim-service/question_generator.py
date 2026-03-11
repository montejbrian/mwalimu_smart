"""
question_generator.py
Extended QuestionGenerator with Bloom's Taxonomy cognitive level support.
Supports per-level prompt engineering, difficulty weighting, and distribution control.
"""

import json
import logging
import time
import re
from enum import Enum
from typing import List, Dict, Any, Optional, TYPE_CHECKING
from dataclasses import dataclass, field

if TYPE_CHECKING:
    from openai import OpenAI, APIError, RateLimitError
else:
    try:
        from openai import OpenAI, APIError, RateLimitError
    except ImportError:
        OpenAI = object
        APIError = Exception
        RateLimitError = Exception


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
You are testing RECALL and RECOGNITION (Bloom's Level 1 — Remember).
Questions must ask students to retrieve or identify facts, terms, or definitions directly from memory.
Use action verbs like: {verbs}.

Good example: "{example}"

Rules:
- The correct answer MUST be a fact explicitly stated in or directly derivable from the lesson.
- Distractors must be plausible but clearly incorrect facts or definitions.
- DO NOT ask for reasoning, inference, or application.
""",

    BloomLevel.UNDERSTAND: """
You are testing COMPREHENSION (Bloom's Level 2 — Understand).
Questions must ask students to explain or interpret concepts in their own terms.
Use action verbs like: {verbs}.

Good example: "{example}"

Rules:
- Ask students to classify, explain the meaning of, or summarize lesson concepts.
- Distractors should represent common misconceptions or faulty explanations.
- Avoid purely factual recall questions.
""",

    BloomLevel.APPLY: """
You are testing APPLICATION (Bloom's Level 3 — Apply).
Questions must present a new scenario and ask students to use lesson knowledge to solve it.
Use action verbs like: {verbs}.

Good example: "{example}"

Rules:
- The scenario or problem context must be NEW (not verbatim from the lesson).
- The correct answer requires applying a principle or process from the lesson.
- Distractors must reflect plausible but incorrect applications of the same concept.
""",

    BloomLevel.ANALYZE: """
You are testing ANALYSIS (Bloom's Level 4 — Analyze).
Questions must ask students to break down information, find patterns, or distinguish between components.
Use action verbs like: {verbs}.

Good example: "{example}"

Rules:
- Questions must require COMPARING, CONTRASTING, or EXAMINING parts of a concept.
- Avoid questions that can be answered by recall alone.
- Distractors must be structurally similar to the correct answer but logically distinct.
""",

    BloomLevel.EVALUATE: """
You are testing EVALUATION (Bloom's Level 5 — Evaluate).
Questions must ask students to judge, critique, or defend a claim or solution based on criteria.
Use action verbs like: {verbs}.

Good example: "{example}"

Rules:
- Present a claim, argument, or student response and ask the student to assess its validity.
- The correct answer must require a value judgment supported by lesson content.
- Distractors must represent plausible but flawed judgments that a student might make.
""",

    BloomLevel.CREATE: """
You are testing SYNTHESIS and CREATION (Bloom's Level 6 — Create).
Questions must ask students to propose, design, or formulate something new based on lesson principles.
Use action verbs like: {verbs}.

Good example: "{example}"

Rules:
- Ask students what they WOULD DO or how they WOULD DESIGN something, given lesson principles.
- The question should require combining multiple concepts from the lesson.
- Distractors should represent reasonable but conceptually flawed designs or proposals.
""",
}


# ---------------------------------------------------------------------------
# QuestionGenerator
# ---------------------------------------------------------------------------

class QuestionGenerator:
    """
    Generates educationally sound multiple-choice questions from lesson content,
    categorized by Bloom's Taxonomy levels.

    Supports:
    - Per-level prompt engineering (LEVEL_PROMPT_TEMPLATES)
    - Difficulty weighting (BloomLevel.difficulty_weight)
    - Distribution control (how many questions per cognitive level)
    - Question deduplication and structural validation
    """

    DEFAULT_DISTRIBUTION: Dict[BloomLevel, int] = {
        BloomLevel.REMEMBER:   1,
        BloomLevel.UNDERSTAND: 1,
        BloomLevel.APPLY:      1,
        BloomLevel.ANALYZE:    1,
        BloomLevel.EVALUATE:   1,
    }

    def __init__(self, api_key: str, model: str = "gpt-4o") -> None:
        """
        Initialize the generator with an OpenAI API key.

        Args:
            api_key: OpenAI API key.
            model: OpenAI model to use (default: gpt-4o).
        """
        if not api_key:
            raise ValueError("API key is required for QuestionGenerator.")

        try:
            self.client = OpenAI(api_key=api_key)  # type: ignore
        except Exception:
            raise ImportError(
                "OpenAI library not installed. Run: pip install openai"
            )

        self.model = model
        self.logger = logging.getLogger(__name__)
        if not self.logger.handlers:
            logging.basicConfig(level=logging.INFO)

    # -----------------------------------------------------------------------
    # Public API
    # -----------------------------------------------------------------------

    def generate_questions(
        self,
        lesson_content: str,
        topic: str,
        count: int = 5,
        distribution: Optional[Dict[BloomLevel, int]] = None,
    ) -> List[Question]:
        """
        Generate Bloom's Taxonomy–categorized multiple-choice questions.

        Args:
            lesson_content: The lesson text or transcript to base questions on.
            topic: The main subject/topic of the lesson.
            count: Total number of questions (used if distribution is None).
            distribution: Optional dict mapping BloomLevel → question count.
                          If provided, overrides `count`.
                          Example: {BloomLevel.REMEMBER: 2, BloomLevel.APPLY: 3}

        Returns:
            List of validated Question objects.
        """
        resolved = self._resolve_distribution(count, distribution)
        all_questions: List[Question] = []
        seen_texts: set = set()
        q_index: int = 1

        for level, level_count in resolved.items():
            if level_count <= 0:
                continue

            self.logger.info(
                f"Generating {level_count} question(s) at level: {level.value}"
            )
            questions = self._generate_for_level(
                lesson_content, topic, level, level_count
            )

            for q in questions:
                norm = re.sub(r"\W+", "", q.question.lower())
                if norm in seen_texts:
                    continue
                seen_texts.add(norm)
                q.id = f"q{q_index}"
                all_questions.append(q)
                q_index += 1

        return all_questions

    # -----------------------------------------------------------------------
    # Internal helpers
    # -----------------------------------------------------------------------

    def _resolve_distribution(
        self,
        count: int,
        distribution: Optional[Dict[BloomLevel, int]],
    ) -> Dict[BloomLevel, int]:
        """
        Resolve the final per-level question distribution.
        Falls back to even spread if distribution is None.
        """
        if distribution:
            return distribution

        # Spread `count` questions across levels, lower levels first
        levels = list(BloomLevel)  # type: ignore[arg-type]
        result: Dict[BloomLevel, int] = {lv: 0 for lv in levels}
        for i in range(count):
            result[levels[i % len(levels)]] += 1
        return result

    def _build_level_prompt(
        self,
        lesson_content: str,
        topic: str,
        level: BloomLevel,
        num_questions: int,
    ) -> str:
        """
        Build a level-specific prompt using the template for that Bloom's level.
        """
        template = LEVEL_PROMPT_TEMPLATES[level]
        level_guidance = template.format(
            verbs=", ".join(level.action_verbs),
            example=level.example_question,
        )

        return f"""
You are an academic assessment expert. Generate exactly {num_questions} multiple-choice question(s)
for the topic "{topic}" at Bloom's Taxonomy Level: **{level.value}**.

COGNITIVE LEVEL GUIDANCE:
{level_guidance}

LESSON CONTENT:
---
{lesson_content}
---

OUTPUT FORMAT:
Return ONLY a valid JSON object matching this schema exactly:

{{
  "questions": [
    {{
      "bloom_level": "{level.value}",
      "concept": "Specific sub-concept being tested",
      "question": "The question text?",
      "options": {{
        "A": "First option",
        "B": "Second option",
        "C": "Third option",
        "D": "Fourth option"
      }},
      "correct_answer": "A",
      "explanation": "Why the correct answer is correct, citing lesson concepts.",
      "distractor_explanations": {{
        "B": "Why B is incorrect.",
        "C": "Why C is incorrect.",
        "D": "Why D is incorrect."
      }}
    }}
  ]
}}

IMPORTANT:
- Do NOT use "all of the above" or "none of the above" as options.
- Each option must be distinct and non-trivially different.
- All {num_questions} question(s) must be at the {level.value} cognitive level — no lower.
"""

    def _generate_for_level(
        self,
        lesson_content: str,
        topic: str,
        level: BloomLevel,
        num_questions: int,
    ) -> List[Question]:
        """
        Call the OpenAI API with a level-specific prompt and parse the result.
        Returns a validated list of Question objects.
        """
        prompt = self._build_level_prompt(lesson_content, topic, level, num_questions)
        max_retries = 3
        delay: float = 2.0

        for attempt in range(max_retries):
            try:
                response = self.client.chat.completions.create(
                    model=self.model,
                    messages=[
                        {
                            "role": "system",
                            "content": (
                                "You are a professional educational assessment tool. "
                                "Always respond with valid JSON only."
                            ),
                        },
                        {"role": "user", "content": prompt},
                    ],
                    response_format={"type": "json_object"},
                    temperature=0.7,
                )

                content = response.choices[0].message.content or ""
                data = json.loads(content)
                raw_questions = data.get("questions", [])
                return self._validate_and_build(raw_questions, level)

            except (RateLimitError, APIError) as e:  # type: ignore[misc]
                self.logger.warning(f"API issue (attempt {attempt + 1}): {e}")
                if attempt < max_retries - 1:
                    time.sleep(delay)
                    delay = float(delay * 2.0)
            except json.JSONDecodeError as e:
                self.logger.error(f"JSON parse error on attempt {attempt + 1}: {e}")
            except Exception as e:
                self.logger.error(f"Unexpected error: {e}")
                break

        return []

    def _validate_and_build(
        self,
        raw_questions: List[Dict[str, Any]],
        level: BloomLevel,
    ) -> List[Question]:
        """
        Validate raw question dicts from the LLM and convert to Question objects.
        """
        valid: List[Question] = []
        required_keys = {"question", "options", "correct_answer", "explanation"}

        for idx, q in enumerate(raw_questions):
            try:
                if not required_keys.issubset(q.keys()):
                    self.logger.warning(f"Skipping question {idx}: missing required keys.")
                    continue

                options: Dict[str, str] = q.get("options", {})
                if not isinstance(options, dict) or len(options) != 4:
                    self.logger.warning(f"Skipping question {idx}: must have exactly 4 options.")
                    continue

                correct = q.get("correct_answer", "")
                if correct not in options:
                    self.logger.warning(f"Skipping question {idx}: correct_answer not in options.")
                    continue

                if any(not str(v).strip() for v in options.values()):
                    self.logger.warning(f"Skipping question {idx}: has empty option(s).")
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

    def validate_questions(
        self, questions: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Legacy public validator for raw question dicts.
        Compatible with the original API used by app.py.
        """
        validated: List[Question] = []
        seen: set = set()

        for q in questions:
            try:
                level_value = q.get("bloom_level", "Remember")
                level = next(
                    (lv for lv in BloomLevel if lv.value == level_value),
                    BloomLevel.REMEMBER
                )
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
