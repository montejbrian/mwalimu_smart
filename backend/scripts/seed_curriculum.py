"""
MwalimuSmart Web
backend/scripts/seed_curriculum.py — Idempotent CBC Curriculum Seeder

Usage:
    python3 -m scripts.seed_curriculum --file data/curriculum/seed_v1.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

import psycopg2
import psycopg2.extras
import structlog

# Ensure backend directory is on sys.path when invoked from repo root
_BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

from config.settings import settings

log = structlog.get_logger(__name__)


def _resolve_seed_path(file_arg: str | Path) -> Path:
    path = Path(file_arg)
    if path.is_file():
        return path
    candidate = _BACKEND_DIR / path
    if candidate.is_file():
        return candidate
    raise FileNotFoundError(f"Seed file not found: {file_arg}")


def _new_counter() -> dict[str, int]:
    return {"created": 0, "updated": 0, "skipped": 0}


def seed_curriculum(file_path: str | Path, dsn: str | None = None) -> dict[str, dict[str, int]]:
    """
    Seed curriculum hierarchy from JSON file into PostgreSQL.

    - Idempotent: re-running on the same file creates 0 new rows.
    - Upserts by:
        education_levels: (id)
        grades:           (id)
        subjects:         (code)
        grade_subjects:   (grade_id, subject_code)
        strands:          (grade_subject_id, sort_order)
        substrands:       (strand_id, sort_order)
    - Raises ValueError if any referenced subject_code does not exist in `subjects`.
    """
    resolved_path = _resolve_seed_path(file_path)
    data: dict[str, Any] = json.loads(resolved_path.read_text(encoding="utf-8"))
    conn_dsn = dsn or settings.POSTGRES_DSN

    summary: dict[str, dict[str, int]] = {
        "education_levels": _new_counter(),
        "grades": _new_counter(),
        "subjects": _new_counter(),
        "grade_subjects": _new_counter(),
        "strands": _new_counter(),
        "substrands": _new_counter(),
    }

    conn = psycopg2.connect(conn_dsn)
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            # 1. Education levels
            for lvl in data.get("levels", []):
                cur.execute(
                    "SELECT id, name, sort_order FROM education_levels WHERE id = %s;",
                    (lvl["id"],),
                )
                existing = cur.fetchone()
                if existing is None:
                    cur.execute(
                        "INSERT INTO education_levels (id, name, sort_order) VALUES (%s, %s, %s);",
                        (lvl["id"], lvl["name"], lvl["sort_order"]),
                    )
                    summary["education_levels"]["created"] += 1
                elif existing["name"] != lvl["name"] or existing["sort_order"] != lvl["sort_order"]:
                    cur.execute(
                        "UPDATE education_levels SET name = %s, sort_order = %s WHERE id = %s;",
                        (lvl["name"], lvl["sort_order"], lvl["id"]),
                    )
                    summary["education_levels"]["updated"] += 1
                else:
                    summary["education_levels"]["skipped"] += 1

            # 2. Grades
            for gr in data.get("grades", []):
                cur.execute(
                    "SELECT id, level_id, name, sort_order FROM grades WHERE id = %s;",
                    (gr["id"],),
                )
                existing = cur.fetchone()
                if existing is None:
                    cur.execute(
                        "INSERT INTO grades (id, level_id, name, sort_order) VALUES (%s, %s, %s, %s);",
                        (gr["id"], gr["level_id"], gr["name"], gr["sort_order"]),
                    )
                    summary["grades"]["created"] += 1
                elif (
                    existing["level_id"] != gr["level_id"]
                    or existing["name"] != gr["name"]
                    or existing["sort_order"] != gr["sort_order"]
                ):
                    cur.execute(
                        "UPDATE grades SET level_id = %s, name = %s, sort_order = %s WHERE id = %s;",
                        (gr["level_id"], gr["name"], gr["sort_order"], gr["id"]),
                    )
                    summary["grades"]["updated"] += 1
                else:
                    summary["grades"]["skipped"] += 1

            # 3. Subjects
            for subj in data.get("subjects", []):
                cur.execute(
                    "SELECT id, code, name_en, name_sw FROM subjects WHERE code = %s;",
                    (subj["code"],),
                )
                existing = cur.fetchone()
                if existing is None:
                    cur.execute(
                        "INSERT INTO subjects (code, name_en, name_sw) VALUES (%s, %s, %s);",
                        (subj["code"], subj["name_en"], subj["name_sw"]),
                    )
                    summary["subjects"]["created"] += 1
                elif existing["name_en"] != subj["name_en"] or existing["name_sw"] != subj["name_sw"]:
                    cur.execute(
                        "UPDATE subjects SET name_en = %s, name_sw = %s WHERE code = %s;",
                        (subj["name_en"], subj["name_sw"], subj["code"]),
                    )
                    summary["subjects"]["updated"] += 1
                else:
                    summary["subjects"]["skipped"] += 1

            # Build subject_code -> id map from DB
            cur.execute("SELECT id, code FROM subjects;")
            subject_map: dict[str, str] = {row["code"]: row["id"] for row in cur.fetchall()}

            # 4. Grade subjects
            for gs in data.get("grade_subjects", []):
                scode = gs["subject_code"]
                if scode not in subject_map:
                    raise ValueError(f"Unknown subject_code {scode!r} not found in subjects table")
                subject_id = subject_map[scode]
                grade_id = gs["grade_id"]
                cref = gs.get("curriculum_ref")

                cur.execute(
                    "SELECT id, curriculum_ref FROM grade_subjects WHERE grade_id = %s AND subject_id = %s;",
                    (grade_id, subject_id),
                )
                existing = cur.fetchone()
                if existing is None:
                    cur.execute(
                        """
                        INSERT INTO grade_subjects (grade_id, subject_id, curriculum_ref)
                        VALUES (%s, %s, %s);
                        """,
                        (grade_id, subject_id, cref),
                    )
                    summary["grade_subjects"]["created"] += 1
                elif existing["curriculum_ref"] != cref:
                    cur.execute(
                        "UPDATE grade_subjects SET curriculum_ref = %s WHERE id = %s;",
                        (cref, existing["id"]),
                    )
                    summary["grade_subjects"]["updated"] += 1
                else:
                    summary["grade_subjects"]["skipped"] += 1

            # Build (grade_id, subject_code) -> grade_subject_id map
            cur.execute(
                """
                SELECT gs.id, gs.grade_id, s.code AS subject_code
                FROM grade_subjects gs
                JOIN subjects s ON s.id = gs.subject_id;
                """
            )
            gs_map: dict[tuple[int, str], str] = {
                (int(row["grade_id"]), row["subject_code"]): row["id"]
                for row in cur.fetchall()
            }

            # 5. Strands & 6. Substrands
            for st in data.get("strands", []):
                scode = st["subject_code"]
                if scode not in subject_map:
                    raise ValueError(f"Unknown subject_code {scode!r} not found in subjects table")
                grade_id = int(st["grade_id"])
                gs_key = (grade_id, scode)
                if gs_key not in gs_map:
                    # Auto-ensure grade_subjects join row if not explicitly listed
                    subject_id = subject_map[scode]
                    cur.execute(
                        """
                        INSERT INTO grade_subjects (grade_id, subject_id)
                        VALUES (%s, %s)
                        RETURNING id;
                        """,
                        (grade_id, subject_id),
                    )
                    gs_map[gs_key] = cur.fetchone()["id"]
                    summary["grade_subjects"]["created"] += 1

                grade_subject_id = gs_map[gs_key]
                sort_order = int(st["sort_order"])
                name = st["name"]
                description = st.get("description")

                cur.execute(
                    """
                    SELECT id, name, description
                    FROM strands
                    WHERE grade_subject_id = %s AND sort_order = %s;
                    """,
                    (grade_subject_id, sort_order),
                )
                existing_strand = cur.fetchone()
                if existing_strand is None:
                    cur.execute(
                        """
                        INSERT INTO strands (grade_subject_id, name, sort_order, description)
                        VALUES (%s, %s, %s, %s)
                        RETURNING id;
                        """,
                        (grade_subject_id, name, sort_order, description),
                    )
                    strand_id = cur.fetchone()["id"]
                    summary["strands"]["created"] += 1
                else:
                    strand_id = existing_strand["id"]
                    if existing_strand["name"] != name or existing_strand["description"] != description:
                        cur.execute(
                            "UPDATE strands SET name = %s, description = %s WHERE id = %s;",
                            (name, description, strand_id),
                        )
                        summary["strands"]["updated"] += 1
                    else:
                        summary["strands"]["skipped"] += 1

                for ss in st.get("substrands", []):
                    ss_order = int(ss["sort_order"])
                    ss_name = ss["name"]
                    outcomes = ss.get("learning_outcomes", [])
                    competencies = ss.get("competencies", [])
                    tier = ss.get("tier", "standard")

                    cur.execute(
                        """
                        SELECT id, name, learning_outcomes, competencies, tier
                        FROM substrands
                        WHERE strand_id = %s AND sort_order = %s;
                        """,
                        (strand_id, ss_order),
                    )
                    existing_ss = cur.fetchone()
                    if existing_ss is None:
                        cur.execute(
                            """
                            INSERT INTO substrands (strand_id, name, sort_order, learning_outcomes, competencies, tier)
                            VALUES (%s, %s, %s, %s::jsonb, %s::jsonb, %s);
                            """,
                            (
                                strand_id,
                                ss_name,
                                ss_order,
                                json.dumps(outcomes),
                                json.dumps(competencies),
                                tier,
                            ),
                        )
                        summary["substrands"]["created"] += 1
                    elif (
                        existing_ss["name"] != ss_name
                        or existing_ss["learning_outcomes"] != outcomes
                        or existing_ss["competencies"] != competencies
                        or existing_ss["tier"] != tier
                    ):
                        cur.execute(
                            """
                            UPDATE substrands
                            SET name = %s,
                                learning_outcomes = %s::jsonb,
                                competencies = %s::jsonb,
                                tier = %s
                            WHERE id = %s;
                            """,
                            (
                                ss_name,
                                json.dumps(outcomes),
                                json.dumps(competencies),
                                tier,
                                existing_ss["id"],
                            ),
                        )
                        summary["substrands"]["updated"] += 1
                    else:
                        summary["substrands"]["skipped"] += 1

        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    for table, counts in summary.items():
        log.info(
            "seed_curriculum_summary",
            table=table,
            created=counts["created"],
            updated=counts["updated"],
            skipped=counts["skipped"],
        )

    return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed CBC curriculum into PostgreSQL")
    parser.add_argument(
        "--file",
        required=True,
        help="Path to curriculum seed JSON file (e.g. data/curriculum/seed_v1.json)",
    )
    args = parser.parse_args()
    seed_curriculum(args.file)
