"""
MwalimuSmart Institutional OS
rag/retriever.py — pgvector RAG Retriever

Provides a clean retrieval interface used by the Researcher node.
Handles:
  - Query embedding
  - CBC-filtered cosine similarity search
  - Result deduplication and threshold filtering
  - Retry logic for transient DB / API failures
"""

from __future__ import annotations

import logging
from functools import lru_cache
from typing import Optional

import psycopg2
import psycopg2.extras
import google.generativeai as genai
from tenacity import retry, stop_after_attempt, wait_exponential

from graph.state import KICDChunk
from config.settings import settings

log = logging.getLogger(__name__)


# ── Embedding client (singleton) ──────────────────────────────────────────────

@lru_cache(maxsize=1)
def _configure_genai() -> None:
    genai.configure(api_key=settings.GEMINI_API_KEY)


# ── Embed query ───────────────────────────────────────────────────────────────

@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=8))
def embed_query(query: str) -> list[float]:
    """Embed a single query string. Retries on transient API errors."""
    _configure_genai()
    response = genai.embed_content(
        model=settings.EMBEDDING_MODEL,
        content=query,
        task_type="retrieval_query"
    )
    return response['embedding']


# ── pgvector search ───────────────────────────────────────────────────────────

SEARCH_SQL = """
SELECT
    chunk_id::text,
    content,
    source_title,
    page_number,
    strand,
    grade_level,
    1 - (embedding <=> %s::vector) AS similarity_score
FROM kicd_chunks
WHERE strand      = %s
  AND grade_level = %s
  AND 1 - (embedding <=> %s::vector) >= %s
ORDER BY embedding <=> %s::vector
LIMIT %s
"""


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=5))
def search(
    query: str,
    strand: str,
    grade_level: str,
    top_k: int = 8,
    min_similarity: float = 0.30,
) -> list[KICDChunk]:
    """
    Run a CBC-scoped semantic search against the pgvector store.

    Parameters
    ----------
    query           : Natural language query (will be embedded internally)
    strand          : CBC strand filter (e.g. "science_technology")
    grade_level     : Grade filter (e.g. "grade_7")
    top_k           : Maximum number of results to return
    min_similarity  : Cosine similarity threshold — chunks below this are dropped

    Returns
    -------
    List of KICDChunk dicts, sorted by descending similarity.
    """
    embedding = embed_query(query)

    conn = psycopg2.connect(settings.POSTGRES_DSN)
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                SEARCH_SQL,
                (embedding, strand, grade_level, embedding, min_similarity, embedding, top_k),
            )
            rows = cur.fetchall()
    finally:
        conn.close()

    results: list[KICDChunk] = [
        KICDChunk(
            chunk_id=row["chunk_id"],
            content=row["content"],
            source_title=row["source_title"],
            page_number=row["page_number"],
            strand=row["strand"],
            grade_level=row["grade_level"],
            similarity_score=float(row["similarity_score"]),
        )
        for row in rows
    ]

    log.info(
        "RAG search: query=%r strand=%s grade=%s → %d results",
        query[:60], strand, grade_level, len(results),
    )
    return results


# ── Fallback: broaden search if too few results ───────────────────────────────

def search_with_fallback(
    query: str,
    strand: str,
    grade_level: str,
    top_k: int = 8,
    min_results: int = 3,
) -> list[KICDChunk]:
    """
    Primary search filtered by strand + grade.
    If fewer than min_results returned, broaden to strand-only
    (adjacent grade levels may have relevant content).
    """
    results = search(query, strand, grade_level, top_k=top_k)

    if len(results) < min_results:
        log.info(
            "Too few results (%d < %d) for grade %s — broadening to strand-only.",
            len(results), min_results, grade_level,
        )
        # Broaden: drop grade filter
        broad_sql = """
        SELECT
            chunk_id::text, content, source_title, page_number, strand, grade_level,
            1 - (embedding <=> %s::vector) AS similarity_score
        FROM kicd_chunks
        WHERE strand = %s
          AND 1 - (embedding <=> %s::vector) >= 0.25
        ORDER BY embedding <=> %s::vector
        LIMIT %s
        """
        embedding = embed_query(query)
        conn = psycopg2.connect(settings.POSTGRES_DSN)
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(broad_sql, (embedding, strand, embedding, embedding, top_k))
                rows = cur.fetchall()
        finally:
            conn.close()

        # Merge: put exact-grade results first, then broad results (deduplicated)
        seen_ids = {c["chunk_id"] for c in results}
        for row in rows:
            if row["chunk_id"] not in seen_ids:
                results.append(KICDChunk(
                    chunk_id=row["chunk_id"],
                    content=row["content"],
                    source_title=row["source_title"],
                    page_number=row["page_number"],
                    strand=row["strand"],
                    grade_level=row["grade_level"],
                    similarity_score=float(row["similarity_score"]),
                ))
                seen_ids.add(row["chunk_id"])
                if len(results) >= top_k:
                    break

    return results[:top_k]
