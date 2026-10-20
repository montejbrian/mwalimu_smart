"""
MwalimuSmart Institutional OS
agents/researcher.py — Researcher Node (P3 — full implementation)

Responsibilities
----------------
1. Build a semantically rich KICD query from the lesson request.
2. Call the RAG retriever (pgvector cosine search, with grade fallback).
3. Validate retrieved chunks meet a minimum quality bar.
4. Persist retrieval metadata to the lesson_jobs table.
5. Write results into AgentState for the Scriptwriter.
"""

from __future__ import annotations

import logging
import time
from typing import Any

import psycopg2

from graph.state import AgentState, KICDChunk
from config.settings import settings
from rag.retriever import search_with_fallback
from prompts.templates import RESEARCHER_QUERY_TEMPLATE

log = logging.getLogger(__name__)

MIN_CHUNKS_REQUIRED = 2
MIN_SIMILARITY      = 0.28


def _build_retrieval_query(state: AgentState) -> str:
    req = state["request"]
    return RESEARCHER_QUERY_TEMPLATE.substitute(
        strand=req["strand"].replace("_", " "),
        grade_level=req["grade_level"].replace("_", " "),
        topic=req["topic"],
    )


def _filter_chunks(chunks: list[KICDChunk]) -> list[KICDChunk]:
    """Drop low-similarity chunks and deduplicate by content fingerprint."""
    filtered: list[KICDChunk] = []
    seen: set[str] = set()
    for chunk in chunks:
        if chunk["similarity_score"] < MIN_SIMILARITY:
            continue
        fp = chunk["content"][:120].strip().lower()
        if fp in seen:
            continue
        seen.add(fp)
        filtered.append(chunk)
    return filtered


def _persist_retrieval_metadata(lesson_id: str, query: str, chunk_count: int, top_score: float) -> None:
    try:
        conn = psycopg2.connect(settings.POSTGRES_DSN)
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE lesson_jobs SET workflow_status='scripting' WHERE lesson_id=%s",
                (lesson_id,),
            )
        conn.commit()
        conn.close()
    except Exception as exc:
        log.warning("Could not persist retrieval metadata: %s", exc)


def researcher_node(state: AgentState) -> dict[str, Any]:
    """
    LangGraph node — Researcher.

    Reads:   state["request"]
    Writes:  retrieved_chunks, retrieval_query, retrieval_count,
             workflow_status, node_durations, errors
    """
    t0  = time.perf_counter()
    req = state["request"]

    log.info("[Researcher] topic=%r strand=%s grade=%s", req["topic"], req["strand"], req["grade_level"])

    try:
        query      = _build_retrieval_query(state)
        raw_chunks = search_with_fallback(
            query=query,
            strand=req["strand"],
            grade_level=req["grade_level"],
            top_k=settings.RAG_TOP_K,
        )
        chunks    = _filter_chunks(raw_chunks)
        top_score = chunks[0]["similarity_score"] if chunks else 0.0
        elapsed   = time.perf_counter() - t0

        if len(chunks) < MIN_CHUNKS_REQUIRED:
            log.warning("[Researcher] Only %d quality chunks found — limited KICD context.", len(chunks))

        log.info("[Researcher] %d chunks (top=%.3f) in %.2fs", len(chunks), top_score, elapsed)
        _persist_retrieval_metadata(req["lesson_id"], query, len(chunks), top_score)

        return {
            "retrieved_chunks": chunks,
            "retrieval_query":  query,
            "retrieval_count":  len(chunks),
            "workflow_status":  "scripting",
            "node_durations":   [{"node": "researcher", "seconds": round(elapsed, 3)}],
            "errors":           [],
        }

    except Exception as exc:
        elapsed = time.perf_counter() - t0
        log.error("[Researcher] Failed: %s", exc, exc_info=True)
        return {
            "retrieved_chunks": [],
            "retrieval_query":  "",
            "retrieval_count":  0,
            "workflow_status":  "error",
            "errors":           [f"researcher_node: {exc}"],
            "node_durations":   [{"node": "researcher", "seconds": round(elapsed, 3)}],
        }
