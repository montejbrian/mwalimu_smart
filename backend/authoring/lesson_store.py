"""
MwalimuSmart — backend/authoring/lesson_store.py
Mongo helpers for authoring_jobs and manim_scenes (denormalized mirror for admin UI).
Postgres remains the single source of truth for lessons, variants, assets, and assessments.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional

from config.settings import settings

log = logging.getLogger(__name__)

_MEMORY_JOBS: dict[str, dict[str, Any]] = {}
_MEMORY_SCENES: dict[str, dict[str, Any]] = {}


def _get_mongo_col(name: str):
    try:
        from pymongo import MongoClient

        client = MongoClient(settings.MONGODB_URI, serverSelectionTimeoutMS=1000)
        db = client.get_default_database()
        return db[name]
    except Exception as exc:
        log.debug("Mongo unavailable (%s), using in-memory fallback for %s", exc, name)
        return None


def upsert_authoring_job(job_id: str, fields: dict[str, Any]) -> dict[str, Any]:
    """Create or update an authoring job in Mongo `authoring_jobs` (and memory mirror)."""
    now = datetime.now(timezone.utc).isoformat()
    existing = _MEMORY_JOBS.get(job_id, {
        "job_id": job_id,
        "state": "queued",
        "logs": [],
        "created_at": now,
    })
    logs = list(existing.get("logs", []))
    if "log_entry" in fields:
        logs.append({"ts": now, "msg": fields.pop("log_entry")})

    updated = {
        **existing,
        **fields,
        "job_id": job_id,
        "logs": logs,
        "updated_at": now,
    }
    _MEMORY_JOBS[job_id] = updated

    col = _get_mongo_col("authoring_jobs")
    if col is not None:
        try:
            col.replace_one({"job_id": job_id}, updated, upsert=True)
        except Exception as exc:
            log.debug("Could not write to Mongo authoring_jobs: %s", exc)

    return updated


def get_authoring_job(job_id: str) -> Optional[dict[str, Any]]:
    col = _get_mongo_col("authoring_jobs")
    if col is not None:
        try:
            doc = col.find_one({"job_id": job_id}, {"_id": 0})
            if doc:
                return doc
        except Exception:
            pass
    return _MEMORY_JOBS.get(job_id)


def list_authoring_jobs(state: Optional[str] = None) -> list[dict[str, Any]]:
    col = _get_mongo_col("authoring_jobs")
    if col is not None:
        try:
            query = {"state": state} if state else {}
            docs = list(col.find(query, {"_id": 0}).sort("created_at", -1).limit(100))
            if docs:
                return docs
        except Exception:
            pass
    jobs = list(_MEMORY_JOBS.values())
    if state:
        jobs = [j for j in jobs if j.get("state") == state]
    return sorted(jobs, key=lambda x: x.get("created_at", ""), reverse=True)


def save_manim_scene(lesson_id: str, version: int, source_code: str, class_name: str) -> None:
    key = f"{lesson_id}:v{version}"
    doc = {
        "lesson_id": lesson_id,
        "version": version,
        "source_code": source_code,
        "class_name": class_name,
        "render_log": [],
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    _MEMORY_SCENES[key] = doc
    col = _get_mongo_col("manim_scenes")
    if col is not None:
        try:
            col.replace_one(
                {"lesson_id": lesson_id, "version": version},
                doc,
                upsert=True,
            )
        except Exception:
            pass
