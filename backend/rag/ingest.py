"""
MwalimuSmart Institutional OS
rag/ingest.py — KICD Content Ingestion Pipeline

Pipeline stages
---------------
1. LOAD      — read source documents (PDF / TXT) from the KICD content directory
2. CHUNK     — split into semantically coherent passages (512 tokens, 64 overlap)
3. ENRICH    — tag each chunk with CBC strand, grade_level, source metadata
4. EMBED     — generate 1536-dim vectors via OpenAI text-embedding-3-small
5. UPSERT    — write to the kicd_chunks table in PostgreSQL (pgvector)

Run once to seed the vector store, then re-run whenever new KICD materials
are added. The pipeline is idempotent — duplicate chunk_ids are skipped via
ON CONFLICT DO NOTHING.

Usage
-----
    python -m rag.ingest --source_dir /var/mwalimusmart/kicd_docs
    python -m rag.ingest --source_dir /var/mwalimusmart/kicd_docs --dry_run
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterator

import psycopg2
import psycopg2.extras
import google.generativeai as genai

from config.settings import settings

logging.basicConfig(level=settings.LOG_LEVEL, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)


# ── Config ────────────────────────────────────────────────────────────────────

CHUNK_SIZE_TOKENS   = 512    # Approximate; we split on characters (4 chars ≈ 1 token)
CHUNK_OVERLAP_CHARS = 256    # Overlap to preserve cross-boundary context
CHARS_PER_TOKEN     = 4
CHUNK_SIZE_CHARS    = CHUNK_SIZE_TOKENS * CHARS_PER_TOKEN   # 2048 chars
EMBED_BATCH_SIZE    = 100    # Gemini embeddings API batch limit
EMBED_MODEL         = "models/text-embedding-004"
VECTOR_DIM          = 768


# ── Data model ────────────────────────────────────────────────────────────────

@dataclass
class RawDocument:
    """A single KICD source file loaded from disk."""
    path: Path
    text: str
    strand: str
    grade_level: str
    source_title: str


@dataclass
class Chunk:
    """A single text chunk ready for embedding and upsert."""
    chunk_id: str
    content: str
    source_title: str
    page_number: int | None
    strand: str
    grade_level: str
    embedding: list[float] = field(default_factory=list)


# ── Stage 1: LOAD ─────────────────────────────────────────────────────────────

def _infer_metadata_from_path(path: Path) -> dict[str, str]:
    """
    Infer CBC strand and grade_level from the file path convention:
        /kicd_docs/{strand}/{grade_level}/{filename}.txt
        e.g. /kicd_docs/science_technology/grade_7/science_grade7_chapter3.txt

    Falls back to 'unknown' if the path doesn't match the convention.
    """
    parts = path.parts

    # Walk up from filename looking for grade_N and then strand
    grade_level = "unknown"
    strand = "unknown"

    for part in reversed(parts[:-1]):   # skip filename itself
        if part.startswith("grade_") and grade_level == "unknown":
            grade_level = part
        elif grade_level != "unknown" and strand == "unknown":
            strand = part
            break

    return {
        "strand":      strand,
        "grade_level": grade_level,
        "source_title": path.stem.replace("_", " ").title(),
    }


def load_documents(source_dir: Path) -> list[RawDocument]:
    """
    Recursively load all .txt and .md files from source_dir.
    PDFs should be pre-converted to .txt using a tool like pdfminer or pymupdf
    before ingestion (keeps this pipeline dependency-light).
    """
    docs: list[RawDocument] = []
    supported = {".txt", ".md"}

    for path in sorted(source_dir.rglob("*")):
        if path.suffix.lower() not in supported:
            continue

        try:
            text = path.read_text(encoding="utf-8").strip()
        except UnicodeDecodeError:
            text = path.read_text(encoding="latin-1").strip()

        if not text:
            log.warning("Skipping empty file: %s", path)
            continue

        meta = _infer_metadata_from_path(path)
        docs.append(RawDocument(
            path=path,
            text=text,
            strand=meta["strand"],
            grade_level=meta["grade_level"],
            source_title=meta["source_title"],
        ))
        log.info("Loaded: %s  [%s / %s]", path.name, meta["strand"], meta["grade_level"])

    log.info("Total documents loaded: %d", len(docs))
    return docs


# ── Stage 2: CHUNK ────────────────────────────────────────────────────────────

def _split_into_chunks(text: str) -> Iterator[tuple[str, int | None]]:
    """
    Sliding window chunker.

    Yields (chunk_text, approximate_page_number).
    Page numbers are estimated by assuming 3000 chars per page — useful
    for approximate source attribution without a PDF parser.
    """
    CHARS_PER_PAGE = 3000
    step = CHUNK_SIZE_CHARS - CHUNK_OVERLAP_CHARS
    start = 0

    while start < len(text):
        end = start + CHUNK_SIZE_CHARS
        chunk = text[start:end].strip()

        if chunk:
            page = (start // CHARS_PER_PAGE) + 1
            yield chunk, page

        start += step


def chunk_documents(docs: list[RawDocument]) -> list[Chunk]:
    """Chunk all loaded documents into Chunk objects."""
    chunks: list[Chunk] = []

    for doc in docs:
        for chunk_text, page_num in _split_into_chunks(doc.text):
            # Deterministic chunk_id from content hash — ensures idempotency
            content_hash = hashlib.sha256(
                f"{doc.source_title}::{chunk_text}".encode()
            ).hexdigest()[:32]

            chunks.append(Chunk(
                chunk_id=content_hash,
                content=chunk_text,
                source_title=doc.source_title,
                page_number=page_num,
                strand=doc.strand,
                grade_level=doc.grade_level,
            ))

    log.info("Total chunks created: %d", len(chunks))
    return chunks


# ── Stage 3: EMBED ────────────────────────────────────────────────────────────

def embed_chunks(chunks: list[Chunk]) -> list[Chunk]:
    """
    Batch-embed all chunks using Gemini models/text-embedding-004.

    Processes in batches of EMBED_BATCH_SIZE to stay within API limits.
    Adds a small sleep between batches to avoid rate-limit 429s.
    """
    log.info("Embedding %d chunks in batches of %d...", len(chunks), EMBED_BATCH_SIZE)
    genai.configure(api_key=settings.GEMINI_API_KEY)

    for i in range(0, len(chunks), EMBED_BATCH_SIZE):
        batch = chunks[i : i + EMBED_BATCH_SIZE]
        texts = [c.content for c in batch]

        try:
            response = genai.embed_content(
                model=EMBED_MODEL,
                content=texts,
                task_type="retrieval_document"
            )
            
            for j, emb in enumerate(response['embedding']):
                batch[j].embedding = emb

            log.info(
                "Embedded batch %d/%d (%d chunks)",
                (i // EMBED_BATCH_SIZE) + 1,
                -(-len(chunks) // EMBED_BATCH_SIZE),
                len(batch),
            )
            time.sleep(0.5)   # Polite pause — avoid rate-limit

        except Exception as exc:
            log.error("Embedding batch %d failed: %s", i, exc)
            raise

    return chunks


# ── Stage 4: DB SETUP ─────────────────────────────────────────────────────────

SCHEMA_SQL = """
-- Enable pgvector extension (run once per DB)
CREATE EXTENSION IF NOT EXISTS vector;

-- Main KICD chunks table
CREATE TABLE IF NOT EXISTS kicd_chunks (
    chunk_id     TEXT PRIMARY KEY,
    content      TEXT         NOT NULL,
    source_title TEXT         NOT NULL,
    page_number  INTEGER,
    strand       TEXT         NOT NULL,
    grade_level  TEXT         NOT NULL,
    embedding    VECTOR(768)  NOT NULL,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- HNSW index for fast approximate nearest-neighbour search
-- cosine distance is best for normalised text embeddings
CREATE INDEX IF NOT EXISTS kicd_chunks_embedding_idx
    ON kicd_chunks
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- Metadata filter indexes
CREATE INDEX IF NOT EXISTS kicd_chunks_strand_idx      ON kicd_chunks (strand);
CREATE INDEX IF NOT EXISTS kicd_chunks_grade_idx       ON kicd_chunks (grade_level);
CREATE INDEX IF NOT EXISTS kicd_chunks_strand_grade_idx ON kicd_chunks (strand, grade_level);
"""


def ensure_schema(conn: psycopg2.extensions.connection) -> None:
    """Create the kicd_chunks table and indexes if they don't exist."""
    with conn.cursor() as cur:
        cur.execute(SCHEMA_SQL)
    conn.commit()
    log.info("Database schema verified / created.")


# ── Stage 5: UPSERT ───────────────────────────────────────────────────────────

UPSERT_SQL = """
INSERT INTO kicd_chunks
    (chunk_id, content, source_title, page_number, strand, grade_level, embedding)
VALUES %s
ON CONFLICT (chunk_id) DO NOTHING
"""


def upsert_chunks(
    chunks: list[Chunk],
    conn: psycopg2.extensions.connection,
    dry_run: bool = False,
) -> int:
    """
    Bulk-upsert chunks into kicd_chunks using execute_values for performance.

    Returns the number of rows actually inserted (skips on conflict).
    """
    records = [
        (
            c.chunk_id,
            c.content,
            c.source_title,
            c.page_number,
            c.strand,
            c.grade_level,
            c.embedding,   # psycopg2 + pgvector adapter accepts list[float]
        )
        for c in chunks
        if c.embedding    # Only insert chunks that were successfully embedded
    ]

    if dry_run:
        log.info("[DRY RUN] Would upsert %d chunks — skipping DB write.", len(records))
        return 0

    with conn.cursor() as cur:
        psycopg2.extras.execute_values(
            cur,
            UPSERT_SQL,
            records,
            template="(%s, %s, %s, %s, %s, %s, %s::vector)",
            page_size=500,
        )
        inserted = cur.rowcount

    conn.commit()
    log.info("Upserted %d chunks into kicd_chunks (conflicts skipped).", inserted)
    return inserted


# ── Pipeline orchestrator ─────────────────────────────────────────────────────

def run_pipeline(source_dir: Path, dry_run: bool = False) -> None:
    """Run the full 5-stage KICD ingestion pipeline."""
    t0 = time.perf_counter()
    log.info("=== MwalimuSmart KICD Ingestion Pipeline START ===")
    log.info("Source dir : %s", source_dir)
    log.info("Dry run    : %s", dry_run)

    # Stage 1: Load
    docs = load_documents(source_dir)
    if not docs:
        log.warning("No documents found in %s — aborting.", source_dir)
        return

    # Stage 2: Chunk
    chunks = chunk_documents(docs)

    # Stage 3: Embed
    chunks = embed_chunks(chunks)

    # Stage 4 + 5: Schema + Upsert
    conn = psycopg2.connect(settings.POSTGRES_DSN)
    try:
        ensure_schema(conn)
        inserted = upsert_chunks(chunks, conn, dry_run=dry_run)
    finally:
        conn.close()

    elapsed = time.perf_counter() - t0
    log.info(
        "=== Pipeline COMPLETE — %d docs | %d chunks | %d inserted | %.1fs ===",
        len(docs), len(chunks), inserted, elapsed,
    )


# ── CLI entry point ───────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="MwalimuSmart KICD ingestion pipeline")
    parser.add_argument(
        "--source_dir",
        type=Path,
        default=Path("/var/mwalimusmart/kicd_docs"),
        help="Root directory containing KICD source text files",
    )
    parser.add_argument(
        "--dry_run",
        action="store_true",
        help="Run all stages except the DB write (for validation)",
    )
    args = parser.parse_args()
    run_pipeline(source_dir=args.source_dir, dry_run=args.dry_run)
