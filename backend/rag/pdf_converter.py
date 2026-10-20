"""
MwalimuSmart Institutional OS
rag/pdf_converter.py — KICD PDF → Text Converter

Converts KICD PDF textbooks and syllabi into plain .txt files that the
ingestion pipeline can consume. Preserves page boundaries with markers
so the chunker can estimate page numbers accurately.

The directory structure output mirrors the input, maintaining CBC metadata
that the ingestion pipeline infers from folder names:
    input:  /kicd_pdfs/science_technology/grade_7/science_g7_book.pdf
    output: /kicd_docs/science_technology/grade_7/science_g7_book.txt

Usage
-----
    python -m rag.pdf_converter \
        --input_dir /var/mwalimusmart/kicd_pdfs \
        --output_dir /var/mwalimusmart/kicd_docs

Requirements
------------
    pip install pymupdf  # fitz — best for KICD's scanned+digital PDFs
"""

from __future__ import annotations

import argparse
import logging
from pathlib import Path

import fitz   # PyMuPDF

from config.settings import settings

log = logging.getLogger(__name__)
logging.basicConfig(level=settings.LOG_LEVEL, format="%(asctime)s %(levelname)s %(message)s")

PAGE_SEPARATOR = "\n\n--- PAGE {page} ---\n\n"


def convert_pdf(pdf_path: Path, output_path: Path) -> int:
    """
    Convert a single PDF to a plain text file.

    Returns the number of pages converted.
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)

    doc = fitz.open(str(pdf_path))
    pages_text: list[str] = []

    for page_num, page in enumerate(doc, start=1):
        text = page.get_text("text").strip()
        if text:
            pages_text.append(PAGE_SEPARATOR.format(page=page_num) + text)

    doc.close()

    full_text = "\n".join(pages_text)
    output_path.write_text(full_text, encoding="utf-8")

    log.info("Converted: %s → %s (%d pages)", pdf_path.name, output_path.name, len(pages_text))
    return len(pages_text)


def convert_directory(input_dir: Path, output_dir: Path) -> dict[str, int]:
    """
    Recursively convert all PDFs in input_dir, mirroring the structure
    to output_dir. Returns a summary dict {filename: page_count}.
    """
    summary: dict[str, int] = {}

    for pdf_path in sorted(input_dir.rglob("*.pdf")):
        relative = pdf_path.relative_to(input_dir)
        out_path = output_dir / relative.with_suffix(".txt")

        try:
            pages = convert_pdf(pdf_path, out_path)
            summary[pdf_path.name] = pages
        except Exception as exc:
            log.error("Failed to convert %s: %s", pdf_path, exc)
            summary[pdf_path.name] = -1

    log.info(
        "Conversion complete. %d PDFs processed, %d failed.",
        len(summary),
        sum(1 for v in summary.values() if v < 0),
    )
    return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Convert KICD PDFs to text for RAG ingestion")
    parser.add_argument("--input_dir",  type=Path, default=Path("/var/mwalimusmart/kicd_pdfs"))
    parser.add_argument("--output_dir", type=Path, default=Path("/var/mwalimusmart/kicd_docs"))
    args = parser.parse_args()

    results = convert_directory(args.input_dir, args.output_dir)
    total_pages = sum(v for v in results.values() if v > 0)
    print(f"\nSummary: {len(results)} files converted, {total_pages} total pages.")
