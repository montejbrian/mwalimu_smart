"""
MwalimuSmart Institutional OS
agents/animator.py — Animator Node (P5 — full implementation)

Uses Gemini 1.5 Pro to generate Manim CE scene code from lesson key concepts.
Enqueues render job to MongoDB. Background worker handles actual MP4 render.
"""

from __future__ import annotations

import ast
import logging
import time
from typing import Any

import google.generativeai as genai

from graph.state import AgentState, AnimationArtifact
from config.settings import settings
from utils.lesson_store import enqueue_animation_job

log = logging.getLogger(__name__)

# ── Prompts ───────────────────────────────────────────────────────────────────

MANIM_SYSTEM_PROMPT = """\
You are an expert Manim Community Edition v0.18 developer for African schools.

STRICT RULES:
1. Output ONLY valid Python — no markdown, no explanation.
2. Class MUST inherit from VoiceoverScene (from manim_voiceover import VoiceoverScene).
3. Always import ElevenLabsService exactly as:
   from manim_voiceover.services.elevenlabs import ElevenLabsService
4. Setup: self.set_speech_service(ElevenLabsService(model="eleven_multilingual_v2")) inside construct().
5. Voice: Use a "Teacher-like" tone.
6. Synchronization: Wrap every animation sequence in `with self.voiceover(text="...") as tracker:`.
7. HIGH-CONTRAST for classroom projectors: Background=BLACK, text=WHITE or YELLOW, highlights="#00FF88".
8. Title font >= 36pt, body >= 28pt. Readable from 8 metres.
9. Class name: {TopicPascalCase}Scene
"""

MANIM_USER_TEMPLATE = """\
Create a Voiceover-synced Manim scene for {grade_display} {strand_display}.
Topic: "{topic}"
Key concepts: {key_concepts}
Lesson title: "{lesson_title}"

STRICT SCRIPTING:
- Support {language} (use correct Swahili if language is sw).
- The "teacher" voice should explain each concept clearly.
- One `with self.voiceover(text="...")` block per concept.
- Generate the complete Python class using manim_voiceover now:
"""


# ── Helpers ───────────────────────────────────────────────────────────────────

def _validate_manim_code(source: str) -> tuple[bool, str]:
    clean = source.strip()
    if clean.startswith("```"):
        lines = clean.splitlines()
        end   = next((i for i, l in enumerate(lines[1:], 1) if l.strip() == "```"), len(lines))
        clean = "\n".join(lines[1:end])
    try:
        tree = ast.parse(clean)
    except SyntaxError as exc:
        return False, f"SyntaxError: {exc}"
    scene_classes = [
        n for n in ast.walk(tree)
        if isinstance(n, ast.ClassDef) and any(
            (isinstance(b, ast.Name) and b.id in ("Scene", "VoiceoverScene")) or
            (isinstance(b, ast.Attribute) and b.attr in ("Scene", "VoiceoverScene"))
            for b in n.bases
        )
    ]
    if not scene_classes:
        return False, "No Scene or VoiceoverScene subclass found"
    has_construct = any(
        isinstance(n, ast.FunctionDef) and n.name == "construct"
        for n in ast.walk(scene_classes[0])
    )
    if not has_construct:
        return False, "Missing construct(self)"
    return True, clean


def _extract_class_name(source: str) -> str:
    try:
        tree = ast.parse(source)
        for node in ast.walk(tree):
            if isinstance(node, ast.ClassDef):
                for base in node.bases:
                    if (isinstance(base, ast.Name) and base.id in ("Scene", "VoiceoverScene")) or \
                       (isinstance(base, ast.Attribute) and base.attr in ("Scene", "VoiceoverScene")):
                        return node.name
    except Exception:
        pass
    return "LessonScene"


# ── Node ──────────────────────────────────────────────────────────────────────

def animator_node(state: AgentState) -> dict[str, Any]:
    t0     = time.perf_counter()
    req    = state["request"]
    script = state.get("lesson_script")

    if not script:
        return {
            "workflow_status": "error",
            "errors":          ["animator_node: lesson_script is None"],
            "node_durations":  [{"node": "animator", "seconds": 0.0}],
        }

    key_concepts   = script.get("key_concepts", [])
    lesson_title   = script.get("title", req["topic"])
    grade_display  = req["grade_level"].replace("_", " ").title()
    strand_display = req["strand"].replace("_", " ").title()

    log.info("[Animator] Generating Manim for %r | concepts=%s", lesson_title, key_concepts)

    try:
        genai.configure(api_key=settings.GEMINI_API_KEY)
        model    = genai.GenerativeModel(
            model_name="gemini-2.5-flash",
            system_instruction=MANIM_SYSTEM_PROMPT,
        )
        response = model.generate_content(MANIM_USER_TEMPLATE.format(
            grade_display=grade_display,
            strand_display=strand_display,
            topic=req["topic"],
            key_concepts=", ".join(key_concepts),
            lesson_title=lesson_title,
            language=req.get("language", "en")
        ))
        raw_source = response.text

        is_valid, result = _validate_manim_code(raw_source)
        if not is_valid:
            raise ValueError(f"Invalid Manim code: {result}")

        class_name = _extract_class_name(result)

        job_id = enqueue_animation_job(
            lesson_id=req["lesson_id"],
            manim_source=result,
            class_name=class_name,
        )

        elapsed = time.perf_counter() - t0
        log.info("[Animator] Queued job %s | class=%s | %.2fs", job_id, class_name, elapsed)

        return {
            "animation": AnimationArtifact(
                manim_class_name=class_name,
                manim_source_code=result,
                render_status="queued",
                mp4_path=None,
                mongodb_file_id=None,
                render_duration_seconds=None,
            ),
            "workflow_status": "complete",
            "node_durations":  [{"node": "animator", "seconds": round(elapsed, 3)}],
            "errors":          [],
        }

    except Exception as exc:
        elapsed = time.perf_counter() - t0
        log.error("[Animator] Failed: %s", exc, exc_info=True)
        return {
            "animation": AnimationArtifact(
                manim_class_name="FailedScene", manim_source_code="",
                render_status="failed", mp4_path=None,
                mongodb_file_id=None, render_duration_seconds=None,
            ),
            "workflow_status": "complete",
            "errors":          [f"animator_node: {exc}"],
            "node_durations":  [{"node": "animator", "seconds": round(elapsed, 3)}],
        }
