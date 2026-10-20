"""
MwalimuSmart — backend/tests/test_p4_1_voice.py
Unit tests for P4.1: Voice Assistant embedded in lesson
"""

import pytest
from voice.assistant import VoiceAssistant, TTS_VOICE_CONFIG
from voice.session_manager import VoiceSessionManager
from api.python_bridge_server import handle_invoke_voice, handle_transcribe_audio


def test_tts_voice_config_supports_bilingual_kenyan_locales():
    """STT/TTS must support en-KE and sw-KE."""
    assert "en" in TTS_VOICE_CONFIG
    assert "sw" in TTS_VOICE_CONFIG
    assert TTS_VOICE_CONFIG["en"]["language_code"] == "en-KE"
    assert TTS_VOICE_CONFIG["sw"]["language_code"] == "sw-KE"


@pytest.mark.asyncio
async def test_voice_assistant_scopes_to_lesson_context():
    """Voice assistant must anchor system prompt and responses to lesson objectives and context."""
    lesson_ctx = {
        "lesson_id": "test-uuid-1",
        "lesson_title": "Separation of Mixtures: Filtration",
        "objectives": ["Identify filter paper components", "Differentiate residue from filtrate"],
        "script_excerpt": "The residue remains on the filter paper while the liquid filtrate passes through.",
        "key_concepts": ["Filtration", "Residue", "Filtrate"],
        "grade_name": "Grade 7",
        "subject_name": "Integrated Science",
        "strand_name": "Matter",
        "language": "en",
    }

    va = VoiceAssistant(
        lesson_id="test-uuid-1",
        school_id="sch-1",
        language="en",
        lesson_context=lesson_ctx,
    )

    sys_prompt = va._build_qa_system_prompt()
    assert "Separation of Mixtures: Filtration" in sys_prompt
    assert "Identify filter paper components" in sys_prompt
    assert "Grade 7" in sys_prompt

    # Test handling question text
    res = await va.handle_text("What is the difference between residue and filtrate?")
    assert res["intent"] in ("QUESTION_ANSWER", "UNKNOWN", "LESSON_STATUS")
    assert isinstance(res["response_text"], str)
    assert len(res["response_text"]) > 0
    assert "lesson_id" in res


@pytest.mark.asyncio
async def test_voice_assistant_swahili_grounding():
    """Voice assistant in Kiswahili uses sw-KE context and generates Swahili responses."""
    lesson_ctx = {
        "lesson_id": "test-uuid-2",
        "lesson_title": "Kutenganisha Mchanganyiko kwa Kuchuja",
        "objectives": ["Kuelewa tofauti ya chembechembe"],
        "script_excerpt": "Chujio huzuia yabisi na kuruhusu kimiminika kupita.",
        "key_concepts": ["Kuchuja"],
        "grade_name": "Gredi ya 7",
        "subject_name": "Sayansi Shirikishi",
        "strand_name": "Mada",
        "language": "sw",
    }

    va = VoiceAssistant(
        lesson_id="test-uuid-2",
        school_id="sch-1",
        language="sw",
        lesson_context=lesson_ctx,
    )

    sys_prompt = va._build_qa_system_prompt()
    assert "Kutenganisha Mchanganyiko" in sys_prompt
    assert "Wewe ni MwalimuSmart" in sys_prompt

    res = await va.handle_text("Chujio linafanyaje kazi?")
    assert isinstance(res["response_text"], str)
    assert len(res["response_text"]) > 0


@pytest.mark.asyncio
async def test_session_manager_preserves_lesson_context():
    """Session manager get_or_create must retain lesson context across turns."""
    mgr = VoiceSessionManager()
    lesson_ctx = {
        "lesson_title": "Photosynthesis in Plants",
        "grade_name": "Grade 7",
    }

    a1 = await mgr.get_or_create(
        school_id="s1",
        student_id="stu1",
        lesson_id="l1",
        language="en",
        lesson_context=lesson_ctx,
    )
    assert a1.session.current_topic == "Photosynthesis in Plants"

    # Reuse session
    a2 = await mgr.get_or_create(
        school_id="s1",
        student_id="stu1",
        lesson_id="l1",
        language="en",
    )
    assert a2 is a1
    assert a2.session.current_topic == "Photosynthesis in Plants"


@pytest.mark.asyncio
async def test_python_bridge_server_handle_invoke_voice_and_stt():
    """Bridge server handles invokeVoice and transcribeAudio cleanly with fallbacks."""
    res_voice = await handle_invoke_voice({
        "school_id": "s1",
        "student_id": "stu1",
        "lesson_id": "l1",
        "text": "How do plants make food?",
        "language": "en",
        "lesson_context": {"lesson_title": "Photosynthesis"},
    })
    assert "response_text" in res_voice
    assert "audio_b64" in res_voice

    res_stt = await handle_transcribe_audio({
        "audio_b64": "UklGRgAAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=",
        "language": "en-KE",
    })
    assert "transcript" in res_stt
    assert "confidence" in res_stt
