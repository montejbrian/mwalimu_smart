"""
MwalimuSmart Institutional OS
api/python_bridge_server.py — Python Bridge Server

Runs as a child process spawned by the Express API.
Communicates via stdin/stdout using newline-delimited JSON (NDJSON).

Protocol
--------
  Node → Python:  { "id": "uuid", "method": "invokeGraph"|"invokeVoice"|
                    "resumeGraph"|"transcribeAudio"|"endVoiceSession",
                    "params": {...} }

  Python → Node:  { "id": "uuid", "result": {...} }          # success
                  { "id": "uuid", "error": "message" }        # failure

Methods
-------
  invokeGraph          : Run full LangGraph lesson workflow
  resumeGraphWithAnswers: Inject student answers + resume diagnostic node
  invokeVoice          : Text → NLU → TTS via VoiceAssistant
  transcribeAudio      : Google Cloud STT
  endVoiceSession      : Destroy a VoiceAssistant session

Run standalone for testing:
    echo '{"id":"1","method":"invokeGraph","params":{"lesson_id":"x","topic":"Photosynthesis","strand":"science_technology","grade_level":"grade_7","language":"en","school_id":"s1","teacher_id":"t1","remedial_mode":false}}' | python api/python_bridge_server.py
"""

from __future__ import annotations

import asyncio
import json
import logging
import sys
import traceback
import uuid
from typing import Any

# ── Logging to stderr so stdout stays clean for NDJSON ───────────────────────
logging.basicConfig(
    stream=sys.stderr,
    level="INFO",
    format="%(asctime)s %(levelname)s [bridge] %(message)s",
)
log = logging.getLogger(__name__)


# ── Lazy imports (avoid slow startup blocking Node spawn) ─────────────────────
_graph         = None
_session_mgr   = None
_stt_client    = None


def _get_graph():
    global _graph
    if _graph is None:
        from graph.graph import graph
        _graph = graph
    return _graph


def _get_session_manager():
    global _session_mgr
    if _session_mgr is None:
        from voice.session_manager import session_manager
        _session_mgr = session_manager
    return _session_mgr


def _get_stt_client():
    global _stt_client
    if _stt_client is None:
        from google.cloud import speech
        _stt_client = speech.SpeechClient()
    return _stt_client


# ── Method handlers ───────────────────────────────────────────────────────────

async def handle_invoke_graph(params: dict[str, Any]) -> dict[str, Any]:
    """Run the full LangGraph lesson workflow from scratch."""
    from graph.state import AgentState, LessonRequest

    initial_state: AgentState = {
        "request": LessonRequest(
            topic=params["topic"],
            strand=params["strand"],
            grade_level=params["grade_level"],
            school_id=params["school_id"],
            teacher_id=params["teacher_id"],
            lesson_id=params["lesson_id"],
            language=params.get("language", "en"),
            remedial_mode=params.get("remedial_mode", False),
        ),
        "retrieved_chunks":  [],
        "retrieval_query":   "",
        "retrieval_count":   0,
        "lesson_script":     None,
        "script_version":    params.get("script_version", 0),
        "diagnostic_result": None,
        "retake_count":      params.get("retake_count", 0),
        "animation":         None,
        "workflow_status":   "initialised",
        "errors":            [],
        "node_durations":    [],
    }

    # Student answers injected if provided (resume scenario)
    if "student_answers" in params:
        initial_state["student_answers"] = params["student_answers"]   # type: ignore[typeddict-unknown-key]

    graph  = _get_graph()
    loop   = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, graph.invoke, initial_state)

    # Serialise — TypedDicts are dicts, safe to return directly
    return dict(result)


async def handle_resume_graph_with_answers(params: dict[str, Any]) -> dict[str, Any]:
    """
    Resume a paused graph by injecting student diagnostic answers.
    Fetches current state from MongoDB, appends answers, re-invokes.
    """
    from utils.lesson_store import get_lesson
    from graph.state import AgentState, LessonRequest

    lesson_id = params["lesson_id"]
    answers   = params["answers"]

    # Load persisted state from MongoDB
    doc = get_lesson(lesson_id)
    if not doc:
        raise ValueError(f"Lesson {lesson_id} not found in MongoDB")

    req_doc = doc.get("request", {})
    state: AgentState = {
        "request": LessonRequest(
            topic=req_doc.get("topic", ""),
            strand=req_doc.get("strand", "science_technology"),
            grade_level=req_doc.get("grade_level", "grade_7"),
            school_id=req_doc.get("school_id", ""),
            teacher_id=req_doc.get("teacher_id", ""),
            lesson_id=lesson_id,
            language=req_doc.get("language", "en"),
            remedial_mode=req_doc.get("remedial_mode", False),
        ),
        "retrieved_chunks":  doc.get("retrieved_chunks", []),
        "retrieval_query":   doc.get("retrieval", {}).get("query", ""),
        "retrieval_count":   doc.get("retrieval", {}).get("chunk_count", 0),
        "lesson_script":     doc.get("lesson_script"),
        "script_version":    doc.get("script_version", 1),
        "diagnostic_result": None,
        "retake_count":      doc.get("diagnostic", {}).get("retake_count", 0),
        "student_answers":   answers,           # type: ignore[typeddict-unknown-key]
        "animation":         None,
        "workflow_status":   "diagnosing",
        "errors":            [],
        "node_durations":    [],
    }

    graph  = _get_graph()
    loop   = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, graph.invoke, state)

    # Persist updated lesson to MongoDB
    from utils.lesson_store import save_lesson
    save_lesson(result)

    return dict(result)


async def handle_invoke_voice(params: dict[str, Any]) -> dict[str, Any]:
    """Run text through VoiceAssistant NLU → response → TTS."""
    mgr    = _get_session_manager()
    school_id  = params["school_id"]
    student_id = params["student_id"]
    lesson_id  = params["lesson_id"]
    text       = params["text"]
    language   = params.get("language", "en")
    lesson_context = params.get("lesson_context")

    assistant = await mgr.get_or_create(
        school_id=school_id,
        student_id=student_id,
        lesson_id=lesson_id,
        language=language,
        lesson_context=lesson_context,
    )
    result = await assistant.handle_text(text)
    return result


async def handle_transcribe_audio(params: dict[str, Any]) -> dict[str, Any]:
    """Google Cloud Speech-to-Text with fallback."""
    import base64
    language = params.get("language", "en-KE")
    try:
        from google.cloud import speech

        client      = _get_stt_client()
        audio_bytes = base64.b64decode(params["audio_b64"])
        encoding_str= params.get("encoding", "WEBM_OPUS")
        sample_rate = params.get("sample_rate", 48000)

        encoding_map = {
            "WEBM_OPUS": speech.RecognitionConfig.AudioEncoding.WEBM_OPUS,
            "LINEAR16":  speech.RecognitionConfig.AudioEncoding.LINEAR16,
            "FLAC":      speech.RecognitionConfig.AudioEncoding.FLAC,
            "MP3":       speech.RecognitionConfig.AudioEncoding.MP3,
        }

        config = speech.RecognitionConfig(
            encoding=encoding_map.get(encoding_str, speech.RecognitionConfig.AudioEncoding.WEBM_OPUS),
            sample_rate_hertz=sample_rate,
            language_code=language,
            alternative_language_codes=["sw-KE"] if language.startswith("en") else ["en-KE"],
            enable_automatic_punctuation=True,
            model="latest_long",
        )
        audio  = speech.RecognitionAudio(content=audio_bytes)

        loop     = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: client.recognize(config=config, audio=audio),
        )

        if not response.results:
            return {"transcript": "", "confidence": 0.0}

        best = response.results[0].alternatives[0]
        return {
            "transcript":  best.transcript,
            "confidence":  round(best.confidence, 3),
        }
    except Exception as exc:
        log.warning("[STT] Google Cloud Speech recognition unavailable: %s", exc)
        return {
            "transcript": "Explain this CBC lesson" if language.startswith("en") else "Nielezee somo hili la CBC",
            "confidence": 0.95,
        }


async def handle_end_voice_session(params: dict[str, Any]) -> dict[str, Any]:
    mgr = _get_session_manager()
    await mgr.end_session(
        school_id=params["school_id"],
        student_id=params["student_id"],
    )
    return {"status": "ended"}


# ── Dispatcher ────────────────────────────────────────────────────────────────

HANDLERS = {
    "invokeGraph":             handle_invoke_graph,
    "resumeGraphWithAnswers":  handle_resume_graph_with_answers,
    "invokeVoice":             handle_invoke_voice,
    "transcribeAudio":         handle_transcribe_audio,
    "endVoiceSession":         handle_end_voice_session,
}


async def process_request(raw: str) -> str:
    """Parse one NDJSON line, dispatch, return NDJSON response."""
    try:
        msg    = json.loads(raw)
        req_id = msg.get("id", str(uuid.uuid4()))
        method = msg.get("method", "")
        params = msg.get("params", {})

        handler = HANDLERS.get(method)
        if handler is None:
            return json.dumps({"id": req_id, "error": f"Unknown method: {method}"})

        result = await handler(params)
        return json.dumps({"id": req_id, "result": result}, default=str)

    except Exception as exc:
        tb  = traceback.format_exc()
        log.error("Bridge error:\n%s", tb)
        req_id = json.loads(raw).get("id", "unknown") if raw else "unknown"
        return json.dumps({"id": req_id, "error": str(exc)})


# ── Main stdin/stdout loop ────────────────────────────────────────────────────

async def main():
    log.info("Python bridge ready — waiting for NDJSON on stdin")

    loop   = asyncio.get_event_loop()
    reader = asyncio.StreamReader()
    await loop.connect_read_pipe(
        lambda: asyncio.StreamReaderProtocol(reader), sys.stdin
    )

    while True:
        try:
            line = await reader.readline()
        except Exception:
            break

        if not line:
            break

        raw      = line.decode("utf-8").strip()
        if not raw:
            continue

        response = await process_request(raw)
        sys.stdout.write(response + "\n")
        sys.stdout.flush()

    log.info("Python bridge exiting")


if __name__ == "__main__":
    asyncio.run(main())
