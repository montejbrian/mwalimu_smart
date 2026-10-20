"""
MwalimuSmart Web
backend/scripts/seed_grade10_geography_rag.py

Seeds KICD RAG chunks for Grade 10 Geography from Grade-10-Geography-KICD-Curriculum-Designs.pdf
without calling external embedding APIs (saving credits).
"""

import sys
import hashlib
from pathlib import Path
import psycopg2
import psycopg2.extras

_BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

from config.settings import settings

CHUNKS_DATA = [
    {
        "substrand_name": "Introduction to Geography",
        "strand": "Practical Geography",
        "page_number": 1,
        "content": (
            "STRAND 1.0: PRACTICAL GEOGRAPHY\n"
            "Sub-strand 1.1: Introduction to Geography (08 lessons)\n\n"
            "Specific Learning Outcomes:\n"
            "By the end of the sub strand, the learner should be able to:\n"
            "a) analyse the branches of Geography for in-depth understanding of the subject,\n"
            "b) examine the importance of studying Geography for sustainable development,\n"
            "c) explore the relationship between Geography and other disciplines for identification of career pathways,\n"
            "d) select possible careers from branches of Geography in society,\n"
            "e) appreciate the significance of Geography in day-to-day life.\n\n"
            "Suggested Learning Experiences:\n"
            "- Brainstorm on the meaning and branches of Geography (Physical, Human, Practical)\n"
            "- Research on importance of studying Geography for sustainable resource management in Kenya\n"
            "- Discuss relationship with disciplines: Meteorology, Agriculture, Civil Engineering, Geology\n"
            "- Explore careers: Urban Planning, Cartography, GIS Analysis, Surveying, Climatology\n"
            "Suggested Key Inquiry Question: How does the study of Geography impact on people's lives?"
        )
    },
    {
        "substrand_name": "Rocks",
        "strand": "Natural Systems and Processes",
        "page_number": 11,
        "content": (
            "STRAND 2.0: NATURAL SYSTEMS AND PROCESSES\n"
            "Sub-strand 2.1: Rocks (18 lessons)\n\n"
            "Specific Learning Outcomes:\n"
            "By the end of the sub-strand, the learner should be able to:\n"
            "a) examine the classification of rocks according to mode of formation and age,\n"
            "b) describe the distribution of rocks in Kenya,\n"
            "c) analyse the significance of rocks in Kenya,\n"
            "d) sample rock types in local environment,\n"
            "e) appreciate the significance of rocks in Kenya.\n\n"
            "Suggested Learning Experiences:\n"
            "- Classify rocks into Igneous, Sedimentary, and Metamorphic based on formation mode\n"
            "- Study volcanic rocks in the Kenyan Rift Valley (phonolites, trachytes, basalts)\n"
            "- Study coastal coral limestone and sedimentary sandstones\n"
            "- Examine economic value: construction materials, cement manufacture, fertile volcanic soils\n"
            "Suggested Key Inquiry Question: Why are there different types of rocks?"
        )
    }
]

def make_pseudo_embedding(text: str, dim: int = 1536) -> list[float]:
    """Deterministically generate a 768-dim normalized embedding from text hash."""
    h = hashlib.sha256(text.encode("utf-8")).digest()
    vals = [(b / 255.0) - 0.5 for b in h]
    # Tile up to dim
    vec = []
    while len(vec) < dim:
        vec.extend(vals)
    vec = vec[:dim]
    norm = sum(x * x for x in vec) ** 0.5
    return [round(x / norm, 6) for x in vec]

def seed_rag_chunks():
    conn = psycopg2.connect(settings.POSTGRES_DSN)
    conn.autocommit = False
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            for cdata in CHUNKS_DATA:
                cur.execute(
                    """
                    SELECT ss.id
                    FROM substrands ss
                    JOIN strands st ON st.id = ss.strand_id
                    JOIN grade_subjects gs ON gs.id = st.grade_subject_id
                    JOIN grades g ON g.id = gs.grade_id
                    JOIN subjects s ON s.id = gs.subject_id
                    WHERE ss.name = %s AND g.name = 'Grade 10' AND s.code = 'geography'
                    LIMIT 1;
                    """,
                    (cdata["substrand_name"],)
                )
                ss_row = cur.fetchone()
                substrand_id = ss_row["id"] if ss_row else None

                chunk_id = f"kicd-g10-geog-{cdata['substrand_name'].lower().replace(' ', '-')}"
                vec = make_pseudo_embedding(cdata["content"])

                cur.execute(
                    """
                    INSERT INTO kicd_chunks (
                        chunk_id, content, source_title, page_number,
                        strand, grade_level, embedding, substrand_id, subject_code
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s::vector, %s, %s)
                    ON CONFLICT (chunk_id)
                    DO UPDATE SET content = EXCLUDED.content,
                                  page_number = EXCLUDED.page_number,
                                  embedding = EXCLUDED.embedding,
                                  substrand_id = EXCLUDED.substrand_id;
                    """,
                    (
                        chunk_id,
                        cdata["content"],
                        "Grade-10-Geography-KICD-Curriculum-Designs.pdf",
                        cdata["page_number"],
                        cdata["strand"],
                        "Grade 10",
                        vec,
                        substrand_id,
                        "geography",
                    )
                )
                print(f"Seeded KICD chunk {chunk_id} (substrand: {cdata['substrand_name']})")

        conn.commit()
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()

if __name__ == "__main__":
    seed_rag_chunks()
