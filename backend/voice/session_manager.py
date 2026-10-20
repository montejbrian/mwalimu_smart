"""
MwalimuSmart Institutional OS
voice/session_manager.py — Voice Session Manager

Manages concurrent VoiceAssistant sessions across all students
connected to a school's local network.

Design
------
- Sessions are keyed by (school_id, student_id)
- Idle sessions expire after SESSION_TTL_SECONDS (default 30 min)
- Cleanup runs in a background thread every CLEANUP_INTERVAL_SECONDS
- Thread-safe via asyncio.Lock per session slot
- Max sessions per school enforced to protect server memory

This runs inside the Express API process via a Python child process
bridge (see api/voice_bridge.py).
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import Optional

from voice.assistant import VoiceAssistant, Language

log = logging.getLogger(__name__)

SESSION_TTL_SECONDS      = 1800   # 30 minutes
CLEANUP_INTERVAL_SECONDS = 300    # Run cleanup every 5 minutes
MAX_SESSIONS_PER_SCHOOL  = 50     # Protects RAM on local Fedora server


@dataclass
class SessionEntry:
    assistant:    VoiceAssistant
    last_active:  float = field(default_factory=time.time)
    created_at:   float = field(default_factory=time.time)


class VoiceSessionManager:
    """
    Singleton session store. Import the `session_manager` instance below.
    """

    def __init__(self):
        self._sessions: dict[str, SessionEntry] = {}
        self._lock = asyncio.Lock()

    def _session_key(self, school_id: str, student_id: str) -> str:
        return f"{school_id}::{student_id}"

    async def get_or_create(
        self,
        school_id:  str,
        student_id: str,
        lesson_id:  str,
        language:   Language = "en",
    ) -> VoiceAssistant:
        """
        Return existing session or create a new one.
        Enforces MAX_SESSIONS_PER_SCHOOL.
        """
        key = self._session_key(school_id, student_id)

        async with self._lock:
            if key in self._sessions:
                entry = self._sessions[key]
                entry.last_active = time.time()
                log.debug("[SessionManager] Reusing session %s", key)
                return entry.assistant

            # Count active sessions for this school
            school_count = sum(
                1 for k in self._sessions if k.startswith(f"{school_id}::")
            )
            if school_count >= MAX_SESSIONS_PER_SCHOOL:
                raise RuntimeError(
                    f"Max sessions ({MAX_SESSIONS_PER_SCHOOL}) reached for school {school_id}"
                )

            assistant = VoiceAssistant(
                lesson_id=lesson_id,
                school_id=school_id,
                language=language,
            )
            self._sessions[key] = SessionEntry(assistant=assistant)
            log.info("[SessionManager] Created session %s (total=%d)", key, len(self._sessions))
            return assistant

    async def end_session(self, school_id: str, student_id: str) -> None:
        key = self._session_key(school_id, student_id)
        async with self._lock:
            if key in self._sessions:
                del self._sessions[key]
                log.info("[SessionManager] Ended session %s", key)

    async def cleanup_expired(self) -> int:
        """Remove sessions idle longer than SESSION_TTL_SECONDS. Returns count removed."""
        now     = time.time()
        expired = [
            k for k, e in self._sessions.items()
            if (now - e.last_active) > SESSION_TTL_SECONDS
        ]
        async with self._lock:
            for key in expired:
                del self._sessions[key]
        if expired:
            log.info("[SessionManager] Cleaned up %d expired sessions", len(expired))
        return len(expired)

    async def run_cleanup_loop(self) -> None:
        """Run as a background task in the event loop."""
        while True:
            await asyncio.sleep(CLEANUP_INTERVAL_SECONDS)
            await self.cleanup_expired()

    @property
    def active_count(self) -> int:
        return len(self._sessions)


# ── Singleton ─────────────────────────────────────────────────────────────────
session_manager = VoiceSessionManager()
