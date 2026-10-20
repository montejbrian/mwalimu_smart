"""
MwalimuSmart Institutional OS
workers/manim_worker.py — Manim Render Worker

A long-running background process that:
1. Polls the MongoDB animation_jobs collection for queued jobs.
2. Writes the Manim source to a temp file.
3. Spawns a subprocess: `manim render --quality l <file> <ClassName>`
4. On success: stores the MP4 path in MongoDB + updates lesson_jobs in PostgreSQL.
5. On failure: marks job failed, stores error, leaves lesson deliverable intact
   (animation is enrichment — lesson is still delivered without it).

Fedora / MikroTik LAN optimisations
-------------------------------------
- Low quality flag (-ql) for faster renders on server hardware
- Output directory is a local fast-path (/var/mwalimusmart/renders)
- Worker runs as a systemd service (unit file included at bottom as comment)
- Render concurrency controlled by MAX_CONCURRENT_RENDERS
- Graceful SIGTERM handling for clean systemd stops

Run
---
    python -m workers.manim_worker           # foreground
    systemctl start mwalimusmart-manim       # via systemd (see unit below)
"""

from __future__ import annotations

import logging
import os
import signal
import subprocess
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor, Future
from pathlib import Path
from typing import Any, Optional

import psycopg2
from pymongo import MongoClient
from bson import ObjectId

from config.settings import settings

log = logging.getLogger(__name__)
logging.basicConfig(
    level=settings.LOG_LEVEL,
    format="%(asctime)s %(levelname)s [manim_worker] %(message)s",
)

# ── Config ────────────────────────────────────────────────────────────────────

POLL_INTERVAL_SECONDS  = 5
MAX_CONCURRENT_RENDERS = 2       # Keep low — Manim is CPU-heavy
RENDER_TIMEOUT_SECONDS = 300     # 5 min max per render
MANIM_QUALITY_FLAG     = "-ql"   # low quality: 480p15 — fast on server hardware
                                  # use "-qm" for 720p or "-qh" for 1080p

OUTPUT_DIR = Path(settings.MANIM_OUTPUT_DIR)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


# ── DB connections ────────────────────────────────────────────────────────────

def _get_mongo_col():
    client = MongoClient(
        settings.MONGODB_URI,
        tls=True,
        tlsAllowInvalidCertificates=True,
        serverSelectionTimeoutMS=30_000,
    )
    return client["mwalimusmart"]["animation_jobs"]


def _update_pg_lesson(lesson_id: str, mp4_path: str, status: str) -> None:
    try:
        conn = psycopg2.connect(settings.POSTGRES_DSN)
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE lesson_jobs SET mp4_path=%s, workflow_status=%s WHERE lesson_id=%s",
                (mp4_path, status, lesson_id),
            )
        conn.commit()
        conn.close()
    except Exception as exc:
        log.warning("PG update failed for lesson %s: %s", lesson_id, exc)


# ── Render a single job ───────────────────────────────────────────────────────

def render_job(job: dict[str, Any]) -> None:
    """
    Execute one Manim render job end-to-end.
    Called in a thread from the worker pool.
    """
    job_id    = str(job["_id"])
    lesson_id = job["lesson_id"]
    class_name= job["class_name"]
    source    = job["source_code"]

    log.info("Starting render | job=%s lesson=%s class=%s", job_id, lesson_id, class_name)

    col = _get_mongo_col()
    col.update_one({"_id": ObjectId(job_id)}, {"$set": {"status": "rendering",
                                                          "started_at": time.time()}})

    # Write source to temp file
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".py", prefix=f"manim_{lesson_id}_",
        dir="/tmp", delete=False, encoding="utf-8",
    ) as f:
        f.write(source)
        tmp_path = f.name

    mp4_path: Optional[str] = None

    try:
        # Build manim command
        # --media_dir     : output root
        # --format mp4    : explicit MP4
        # MANIM_QUALITY_FLAG: -ql (low/fast) for Fedora server
        cmd = [
            sys.executable, "-m", "manim",
            "render",
            MANIM_QUALITY_FLAG,
            "--media_dir", str(OUTPUT_DIR),
            "--format", "mp4",
            "--output_file", f"{lesson_id}",
            tmp_path,
            class_name,
        ]

        log.info("Running: %s", " ".join(cmd))

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=RENDER_TIMEOUT_SECONDS,
            env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
        )

        if result.returncode != 0:
            raise RuntimeError(
                f"Manim exited {result.returncode}\n"
                f"STDOUT: {result.stdout[-2000:]}\n"
                f"STDERR: {result.stderr[-2000:]}"
            )

        # Locate the output MP4
        # Manim writes to: <media_dir>/videos/<scene_file_stem>/<quality>/<ClassName>.mp4
        mp4_candidates = list(OUTPUT_DIR.rglob(f"{lesson_id}*.mp4"))
        if not mp4_candidates:
            mp4_candidates = list(OUTPUT_DIR.rglob(f"{class_name}.mp4"))
        if not mp4_candidates:
            raise FileNotFoundError("Rendered MP4 not found in output dir")

        mp4_path = str(mp4_candidates[0])
        log.info("Render complete | job=%s mp4=%s", job_id, mp4_path)

        col.update_one({"_id": ObjectId(job_id)}, {"$set": {
            "status": "done",
            "mp4_path": mp4_path,
            "completed_at": time.time(),
        }})
        _update_pg_lesson(lesson_id, mp4_path, "complete")

    except subprocess.TimeoutExpired:
        err = f"Render timed out after {RENDER_TIMEOUT_SECONDS}s"
        log.error("Render timeout | job=%s", job_id)
        col.update_one({"_id": ObjectId(job_id)}, {"$set": {
            "status": "failed", "error": err, "completed_at": time.time(),
        }})

    except Exception as exc:
        log.error("Render failed | job=%s | %s", job_id, exc, exc_info=True)
        col.update_one({"_id": ObjectId(job_id)}, {"$set": {
            "status": "failed", "error": str(exc)[:1000], "completed_at": time.time(),
        }})

    finally:
        # Clean up temp source file
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


# ── Poll loop ─────────────────────────────────────────────────────────────────

class ManimWorker:
    """
    Long-running worker. Polls MongoDB for queued jobs and dispatches
    them to a thread pool for concurrent rendering.
    """

    def __init__(self):
        self._running  = True
        self._executor = ThreadPoolExecutor(max_workers=MAX_CONCURRENT_RENDERS)
        self._futures:  list[Future] = []

        signal.signal(signal.SIGTERM, self._handle_sigterm)
        signal.signal(signal.SIGINT,  self._handle_sigterm)

    def _handle_sigterm(self, signum, frame):
        log.info("Received signal %s — shutting down gracefully...", signum)
        self._running = False

    def _reap_futures(self):
        """Remove completed futures from tracking list."""
        done    = [f for f in self._futures if f.done()]
        pending = [f for f in self._futures if not f.done()]
        for f in done:
            exc = f.exception()
            if exc:
                log.error("Render thread raised: %s", exc)
        self._futures = pending

    def run(self):
        log.info(
            "Manim worker started | quality=%s max_concurrent=%d poll_interval=%ds",
            MANIM_QUALITY_FLAG, MAX_CONCURRENT_RENDERS, POLL_INTERVAL_SECONDS,
        )
        col = _get_mongo_col()

        while self._running:
            self._reap_futures()
            active = len(self._futures)

            if active < MAX_CONCURRENT_RENDERS:
                slots = MAX_CONCURRENT_RENDERS - active
                jobs  = list(col.find({"status": "queued"}).limit(slots))

                for job in jobs:
                    # Atomically claim the job
                    claim = col.find_one_and_update(
                        {"_id": job["_id"], "status": "queued"},
                        {"$set": {"status": "claimed"}},
                    )
                    if claim is None:
                        continue   # Another worker claimed it first

                    future = self._executor.submit(render_job, job)
                    self._futures.append(future)
                    log.info("Dispatched job %s", str(job["_id"]))

            time.sleep(POLL_INTERVAL_SECONDS)

        # Graceful shutdown
        log.info("Waiting for %d active renders to complete...", len(self._futures))
        self._executor.shutdown(wait=True)
        log.info("Manim worker stopped.")


if __name__ == "__main__":
    ManimWorker().run()


# ══════════════════════════════════════════════════════════════════════════════
# systemd unit file — save to /etc/systemd/system/mwalimusmart-manim.service
# ══════════════════════════════════════════════════════════════════════════════
#
# [Unit]
# Description=MwalimuSmart Manim Render Worker
# After=network.target mongod.service
#
# [Service]
# Type=simple
# User=mwalimusmart
# WorkingDirectory=/opt/mwalimusmart
# EnvironmentFile=/opt/mwalimusmart/.env
# ExecStart=/opt/mwalimusmart/venv/bin/python -m workers.manim_worker
# Restart=always
# RestartSec=10
# StandardOutput=journal
# StandardError=journal
#
# [Install]
# WantedBy=multi-user.target
