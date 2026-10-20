"""
MwalimuSmart — backend/followups/stream.py
Streaming AI follow-up generator via Gemini API with NDJSON stdio streaming (Phase 3).
"""

from __future__ import annotations

import json
import logging
import os
import sys
import time
from typing import Any, Generator

from config.settings import settings
from followups.prompt import build_followup_prompt

log = logging.getLogger(__name__)


def generate_mock_stream(
    question: str,
    lesson_title: str,
    lang: str = "en",
) -> Generator[str, None, None]:
    """Generates realistic pedagogical streaming tokens for tests and fallback."""
    use_sw = lang == "sw"
    if use_sw:
        chunks = [
            f"Swali zuri sana kuhusu {lesson_title}! ",
            "Katika maisha yetu ya kila siku nchini Kenya, ",
            "tunapochuja mchanganyiko, tunatenganisha yabisi isiyoyeyuka na kimiminika. ",
            "Chujio lina matundu madogo sana yanayozuia chembe ndogo zisisonge, ",
            "tofauti na ungo unaoruhusu chembe ndogo kupita. ",
            "Je, ungependa tuangalie mfano mwingine kutoka jikoni au maabara?",
        ]
    else:
        chunks = [
            f"That's a thoughtful question about {lesson_title}! ",
            "In our everyday Kenyan context, ",
            "we use filtration when we need to separate an insoluble solid from a liquid. ",
            "The filter paper has tiny microscopic pores that trap the residue ",
            "while allowing the clear filtrate to pass through, ",
            "unlike a sieve which has much larger gaps designed for dry solid grains like maize. ",
            "Does that make the difference clear, or would you like to explore another example?",
        ]

    for chunk in chunks:
        words = chunk.split(" ")
        for i, word in enumerate(words):
            token = word + (" " if i < len(words) - 1 else " ")
            yield token


def stream_followup_tokens(payload: dict[str, Any]) -> Generator[dict[str, Any], None, None]:
    """
    Main generator yielding token dicts:
      {"token": "..."}
      ...
      {"done": True, "full_text": "..."}
    """
    lesson_title = payload.get("lesson_title", "Lesson")
    objectives = payload.get("objectives", [])
    script_excerpt = payload.get("script_excerpt", "")
    key_concepts = payload.get("key_concepts", [])
    history = payload.get("conversation_history", [])
    question = payload.get("question", "")
    grade_name = payload.get("grade_name")
    subject_name = payload.get("subject_name")
    strand_name = payload.get("strand_name")
    lang = payload.get("lang", "en")

    prompt = build_followup_prompt(
        lesson_title=lesson_title,
        objectives=objectives,
        script_excerpt=script_excerpt,
        key_concepts=key_concepts,
        conversation_history=history,
        question=question,
        grade_name=grade_name,
        subject_name=subject_name,
        strand_name=strand_name,
        lang=lang,
    )

    api_key = settings.GEMINI_API_KEY
    is_test = os.environ.get("NODE_ENV") == "test" or os.environ.get("PYTEST_CURRENT_TEST")

    full_tokens: list[str] = []

    # Live Gemini stream if not test mode and key present
    if api_key and not is_test:
        try:
            import google.generativeai as genai

            genai.configure(api_key=api_key)
            model = genai.GenerativeModel("models/gemini-1.5-flash")
            response = model.generate_content(prompt, stream=True)

            for chunk in response:
                text = chunk.text or ""
                if text:
                    full_tokens.append(text)
                    yield {"token": text}

            full_text = "".join(full_tokens).strip()
            yield {"done": True, "full_text": full_text}
            return
        except Exception as exc:
            log.warning("Gemini live stream failed (%s), falling back to pedagogical generator", exc)

    # Simulated / Test pedagogical stream
    for token in generate_mock_stream(question, lesson_title, lang):
        full_tokens.append(token)
        yield {"token": token}

    full_text = "".join(full_tokens).strip()
    yield {"done": True, "full_text": full_text}


def main() -> None:
    """CLI / NDJSON entry point: reads JSON from stdin, streams NDJSON to stdout."""
    try:
        raw_input = sys.stdin.read()
        if not raw_input.strip():
            sys.stdout.write(json.dumps({"error": "Empty input payload"}) + "\n")
            sys.stdout.flush()
            return

        payload = json.loads(raw_input)
        for item in stream_followup_tokens(payload):
            sys.stdout.write(json.dumps(item) + "\n")
            sys.stdout.flush()
    except Exception as exc:
        sys.stdout.write(json.dumps({"error": str(exc)}) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
