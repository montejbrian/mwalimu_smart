"""
MwalimuSmart Institutional OS
voice/assistant.py — Voice Assistant Core

Architecture
------------
                    ┌─────────────────────────────┐
  Microphone/Text → │   VoiceAssistant             │
                    │                             │
                    │  1. STT  (Google Speech)    │
                    │  2. NLU  (Gemini 1.5 Flash) │
                    │  3. Action dispatch         │
                    │  4. TTS  (Google Cloud TTS) │
                    └─────────────────────────────┘

Supported intents
-----------------
  LESSON_REQUEST    → "Teach me photosynthesis for Grade 7"
  QUESTION_ANSWER   → "What is chlorophyll?"
  DIAGNOSTIC_SUBMIT → "My answer to question 1 is C"
  LESSON_STATUS     → "What lesson are we on?"
  REPEAT_LAST       → "Please repeat that"
  HELP              → "What can you do?"

Languages supported: English (en-KE), Kiswahili (sw-KE)

Usage
-----
    from voice.assistant import VoiceAssistant
    va = VoiceAssistant(lesson_id="...", school_id="...", language="en")
    response_audio = await va.handle_text("Explain photosynthesis")
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import re
from dataclasses import dataclass, field
from typing import Any, Literal, Optional

import google.generativeai as genai
from google.cloud import texttospeech

from config.settings import settings

log = logging.getLogger(__name__)

Language    = Literal["en", "sw"]
IntentType  = Literal[
    "LESSON_REQUEST", "QUESTION_ANSWER", "DIAGNOSTIC_SUBMIT",
    "LESSON_STATUS", "REPEAT_LAST", "HELP", "UNKNOWN",
]


# ── TTS voice config per language ─────────────────────────────────────────────

TTS_VOICE_CONFIG: dict[str, dict[str, str]] = {
    "en": {
        "language_code": "en-KE",
        "name":          "en-KE-Standard-A",   # Kenyan English female
        "ssml_gender":   "FEMALE",
    },
    "sw": {
        "language_code": "sw-KE",
        "name":          "sw-KE-Standard-A",   # Kiswahili female
        "ssml_gender":   "FEMALE",
    },
}

# Speaking rate tuned for classroom listening (slightly slower than default)
TTS_SPEAKING_RATE = 0.92
TTS_PITCH         = 0.0


# ── Intent + entity extraction ────────────────────────────────────────────────

NLU_SYSTEM_PROMPT = """\
You are the voice interface for MwalimuSmart, a Kenyan school learning assistant.
Extract the user's intent and entities from their message.

Respond ONLY with JSON — no markdown, no preamble:
{
  "intent": "LESSON_REQUEST|QUESTION_ANSWER|DIAGNOSTIC_SUBMIT|LESSON_STATUS|REPEAT_LAST|HELP|UNKNOWN",
  "topic": "string or null",
  "grade_level": "grade_N or null",
  "strand": "CBC strand or null",
  "question_id": "q1-q5 or null",
  "answer_choice": "A|B|C|D or null",
  "language": "en|sw",
  "confidence": 0.0-1.0
}

Examples:
User: "Teach me about photosynthesis for Grade 7"
→ {"intent":"LESSON_REQUEST","topic":"Photosynthesis","grade_level":"grade_7","strand":"science_technology","question_id":null,"answer_choice":null,"language":"en","confidence":0.95}

User: "Jibu langu ni B" (My answer is B in Kiswahili)
→ {"intent":"DIAGNOSTIC_SUBMIT","topic":null,"grade_level":null,"strand":null,"question_id":null,"answer_choice":"B","language":"sw","confidence":0.90}
"""


@dataclass
class Intent:
    intent:        IntentType
    topic:         Optional[str]    = None
    grade_level:   Optional[str]    = None
    strand:        Optional[str]    = None
    question_id:   Optional[str]    = None
    answer_choice: Optional[str]    = None
    language:      Language         = "en"
    confidence:    float            = 0.0
    raw_text:      str              = ""


# ── Conversation memory ───────────────────────────────────────────────────────

@dataclass
class ConversationTurn:
    role:    Literal["user", "assistant"]
    text:    str
    intent:  Optional[IntentType] = None


@dataclass
class VoiceSession:
    """Per-student voice session state."""
    lesson_id:       str
    school_id:       str
    language:        Language
    current_topic:   Optional[str]          = None
    current_grade:   Optional[str]          = None
    last_response:   Optional[str]          = None
    diagnostic_answers: dict[str, str]      = field(default_factory=dict)
    history:         list[ConversationTurn] = field(default_factory=list)


# ── Main assistant class ──────────────────────────────────────────────────────

class VoiceAssistant:
    """
    Orchestrates NLU (Gemini) → action dispatch → TTS (Google Cloud).
    One instance per student session.
    """

    def __init__(
        self,
        lesson_id: str,
        school_id: str,
        language:  Language = "en",
    ):
        self.session = VoiceSession(
            lesson_id=lesson_id,
            school_id=school_id,
            language=language,
        )

        # Gemini for NLU
        genai.configure(api_key=settings.GEMINI_API_KEY)
        self._nlu_model = genai.GenerativeModel(
            model_name="gemini-2.5-flash",
            system_instruction=NLU_SYSTEM_PROMPT,
        )

        # Gemini for Q&A responses
        self._qa_model = genai.GenerativeModel(
            model_name="gemini-2.5-flash",
            system_instruction=self._build_qa_system_prompt(),
        )

        # Google Cloud TTS (optional — falls back to text-only if GCP key not configured)
        try:
            self._tts_client = texttospeech.TextToSpeechClient()
        except Exception as exc:
            log.warning(
                "[VoiceAssistant] Google Cloud TTS unavailable (%s). "
                "Voice responses will be text-only.", exc
            )
            self._tts_client = None

        log.info(
            "[VoiceAssistant] Session started | lesson=%s lang=%s tts=%s",
            lesson_id, language, "enabled" if self._tts_client else "disabled",
        )

    def _build_qa_system_prompt(self) -> str:
        return f"""\
You are MwalimuSmart, a warm and encouraging CBC-aligned teaching assistant
for Kenyan schools. You answer questions about lesson topics clearly and simply.

Rules:
- Keep answers under 4 sentences for voice delivery
- Use Kenyan examples (matatus, maize, Lake Victoria, Nairobi, etc.)
- CBC strand alignment is mandatory
- Language: {"English" if self.session.language == "en" else "Kiswahili"}
- Always end with an encouraging phrase
- Never say you are an AI
"""

    # ── NLU ───────────────────────────────────────────────────────────────────

    async def _extract_intent(self, text: str) -> Intent:
        """Call Gemini Flash to extract intent and entities from user text."""
        try:
            loop     = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None,
                lambda: self._nlu_model.generate_content(text),
            )
            raw = response.text.strip()

            # Strip markdown fences if present
            if raw.startswith("```"):
                raw = "\n".join(raw.splitlines()[1:-1])

            data = json.loads(raw)
            return Intent(
                intent=data.get("intent", "UNKNOWN"),
                topic=data.get("topic"),
                grade_level=data.get("grade_level"),
                strand=data.get("strand"),
                question_id=data.get("question_id"),
                answer_choice=data.get("answer_choice"),
                language=data.get("language", self.session.language),
                confidence=float(data.get("confidence", 0.5)),
                raw_text=text,
            )

        except Exception as exc:
            log.warning("[VoiceAssistant] NLU failed: %s", exc)
            return Intent(intent="UNKNOWN", raw_text=text, language=self.session.language)

    # ── Response generation ───────────────────────────────────────────────────

    async def _generate_qa_response(self, question: str) -> str:
        """Generate a concise voice-ready answer using Gemini."""
        context = ""
        if self.session.current_topic:
            context = f"We are currently studying: {self.session.current_topic}. "

        prompt = context + question

        loop     = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: self._qa_model.generate_content(prompt),
        )
        return response.text.strip()

    def _build_intent_response(self, intent: Intent) -> str:
        """
        Map extracted intent to a text response.
        Actual lesson triggering happens via callback to the Express API.
        """
        lang = self.session.language

        responses: dict[IntentType, str] = {
            "LESSON_REQUEST": (
                f"Starting lesson on {intent.topic} for {intent.grade_level or 'your grade'}. "
                f"Please wait while I prepare your CBC-aligned content."
                if lang == "en" else
                f"Naandaa somo kuhusu {intent.topic}. Tafadhali subiri."
            ),
            "LESSON_STATUS": (
                f"We are studying {self.session.current_topic or 'the current lesson'}. "
                f"You have answered {len(self.session.diagnostic_answers)} questions so far."
                if lang == "en" else
                f"Tunasoma {self.session.current_topic or 'somo la sasa'}."
            ),
            "REPEAT_LAST": self.session.last_response or (
                "I haven't said anything yet. How can I help you?"
                if lang == "en" else
                "Sijasema chochote bado. Nawezaje kukusaidia?"
            ),
            "HELP": (
                "I can teach you any CBC lesson, answer questions about topics, "
                "and guide you through diagnostic questions. Just tell me what to teach!"
                if lang == "en" else
                "Ninaweza kukufundisha masomo ya CBC, kujibu maswali, na kukuongoza "
                "kwenye maswali ya tathmini."
            ),
            "UNKNOWN": (
                "I didn't quite understand. Could you please repeat that?"
                if lang == "en" else
                "Sijaelewa vizuri. Unaweza kurudia tena?"
            ),
        }

        return responses.get(intent.intent, responses["UNKNOWN"])

    # ── TTS ───────────────────────────────────────────────────────────────────

    async def _synthesize_speech(self, text: str) -> bytes:
        """
        Convert text to MP3 audio bytes using Google Cloud TTS.
        Returns raw MP3 bytes for streaming to the client.
        Returns empty bytes if TTS client is not configured.
        """
        if self._tts_client is None:
            log.warning("[VoiceAssistant] TTS skipped — Google Cloud credentials not configured.")
            return b""

        voice_cfg = TTS_VOICE_CONFIG[self.session.language]

        synthesis_input = texttospeech.SynthesisInput(text=text)
        voice = texttospeech.VoiceSelectionParams(
            language_code=voice_cfg["language_code"],
            name=voice_cfg["name"],
            ssml_gender=getattr(
                texttospeech.SsmlVoiceGender,
                voice_cfg["ssml_gender"],
            ),
        )
        audio_config = texttospeech.AudioConfig(
            audio_encoding=texttospeech.AudioEncoding.MP3,
            speaking_rate=TTS_SPEAKING_RATE,
            pitch=TTS_PITCH,
            effects_profile_id=["classroom-audio-profile"],   # Optimised for speakers
        )

        loop     = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: self._tts_client.synthesize_speech(
                input=synthesis_input,
                voice=voice,
                audio_config=audio_config,
            ),
        )
        return response.audio_content

    # ── Main handler ──────────────────────────────────────────────────────────

    async def handle_text(self, user_text: str) -> dict[str, Any]:
        """
        Full pipeline: text → intent → response text → TTS audio.

        Returns
        -------
        {
          "intent":        str,
          "response_text": str,
          "audio_b64":     str,    # base64-encoded MP3
          "action":        dict,   # machine-readable action for Express API
        }
        """
        log.info("[VoiceAssistant] Input: %r", user_text)

        # 1. Extract intent
        intent = await self._extract_intent(user_text)
        log.info("[VoiceAssistant] Intent=%s conf=%.2f", intent.intent, intent.confidence)

        # 2. Update session state
        if intent.topic:
            self.session.current_topic = intent.topic
        if intent.grade_level:
            self.session.current_grade = intent.grade_level
        if intent.intent == "DIAGNOSTIC_SUBMIT" and intent.answer_choice:
            qid = intent.question_id or f"q{len(self.session.diagnostic_answers)+1}"
            self.session.diagnostic_answers[qid] = intent.answer_choice

        # 3. Generate response text
        if intent.intent == "QUESTION_ANSWER":
            response_text = await self._generate_qa_response(user_text)
        else:
            response_text = self._build_intent_response(intent)

        self.session.last_response = response_text

        # 4. Append to history
        self.session.history.append(ConversationTurn("user",      user_text, intent.intent))
        self.session.history.append(ConversationTurn("assistant", response_text))

        # 5. Synthesize speech
        audio_bytes = await self._synthesize_speech(response_text)
        audio_b64   = base64.b64encode(audio_bytes).decode("utf-8")

        # 6. Build machine action for Express API to act on
        action: dict[str, Any] = {}
        if intent.intent == "LESSON_REQUEST":
            action = {
                "type":        "TRIGGER_LESSON",
                "topic":       intent.topic,
                "grade_level": intent.grade_level or self.session.current_grade,
                "strand":      intent.strand,
                "language":    intent.language,
            }
        elif intent.intent == "DIAGNOSTIC_SUBMIT":
            action = {
                "type":             "SUBMIT_ANSWER",
                "question_id":      intent.question_id,
                "answer_choice":    intent.answer_choice,
                "all_answers_so_far": self.session.diagnostic_answers,
            }

        log.info("[VoiceAssistant] Response: %r", response_text[:80])

        return {
            "intent":        intent.intent,
            "confidence":    intent.confidence,
            "response_text": response_text,
            "audio_b64":     audio_b64,
            "action":        action,
            "session": {
                "current_topic":       self.session.current_topic,
                "current_grade":       self.session.current_grade,
                "answers_collected":   len(self.session.diagnostic_answers),
                "diagnostic_answers":  self.session.diagnostic_answers,
            },
        }

    async def handle_audio(self, audio_bytes: bytes) -> dict[str, Any]:
        """
        STT pipeline: audio bytes → text → handle_text().
        Uses Google Cloud Speech-to-Text.
        Placeholder — full STT integration in streaming API layer.
        """
        raise NotImplementedError(
            "STT is handled at the Express API layer via Google Cloud Speech streaming. "
            "Pass transcribed text to handle_text() instead."
        )
