"""
Tests for P1.1 — Postgres migrations + curriculum seed.
Uses a real Postgres test database (mwalimusmart_test) per docs/09-CONVENTIONS.md.
"""

from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path
from urllib.parse import urlparse, urlunparse

import psycopg2
import pytest

from config.settings import settings

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
BACKEND_DIR = Path(__file__).resolve().parent.parent
SEED_FILE = BACKEND_DIR / "data" / "curriculum" / "seed_v1.json"


def _get_test_dsn() -> str:
    if os.environ.get("TEST_DATABASE_URL"):
        return os.environ["TEST_DATABASE_URL"]
    base_dsn = settings.POSTGRES_DSN
    parsed = urlparse(base_dsn)
    # Replace database name in path with mwalimusmart_test
    return urlunparse(parsed._replace(path="/mwalimusmart_test"))


@pytest.fixture(scope="module")
def test_dsn() -> str:
    dsn = _get_test_dsn()
    # Reset mwalimusmart_test to a completely empty database
    conn = psycopg2.connect(settings.POSTGRES_DSN)
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT pg_terminate_backend(pid)
                FROM pg_stat_activity
                WHERE datname = 'mwalimusmart_test' AND pid <> pg_backend_pid();
                """
            )
            cur.execute("DROP DATABASE IF EXISTS mwalimusmart_test;")
            cur.execute("CREATE DATABASE mwalimusmart_test;")
    finally:
        conn.close()
    return dsn


class TestMigrationsAndSeed:

    def test_migrate_from_empty_db(self, test_dsn: str):
        """npm run db:migrate applies all 5 migrations from an empty DB."""
        env = {**os.environ, "POSTGRES_DSN": test_dsn}
        res = subprocess.run(
            ["npm", "run", "db:migrate"],
            cwd=str(REPO_ROOT),
            env=env,
            capture_output=True,
            text=True,
            check=False,
        )
        assert res.returncode == 0, f"db:migrate failed:\nSTDOUT: {res.stdout}\nSTDERR: {res.stderr}"

        # Verify expected tables and kicd_chunks.substrand_id exist
        conn = psycopg2.connect(test_dsn)
        try:
            with conn.cursor() as cur:
                expected_tables = [
                    "education_levels",
                    "grades",
                    "subjects",
                    "grade_subjects",
                    "strands",
                    "substrands",
                    "lessons",
                    "lesson_variants",
                    "lesson_assets",
                    "assessment_questions",
                    "student_progress",
                    "student_mastery",
                    "followup_threads",
                    "followup_messages",
                    "kicd_chunks",
                ]
                for table in expected_tables:
                    cur.execute(
                        "SELECT to_regclass(%s);",
                        (f"public.{table}",),
                    )
                    assert cur.fetchone()[0] == table, f"Table {table} missing after migration"

                cur.execute(
                    """
                    SELECT column_name
                    FROM information_schema.columns
                    WHERE table_name = 'kicd_chunks'
                      AND column_name IN ('substrand_id', 'subject_code');
                    """
                )
                cols = {row[0] for row in cur.fetchall()}
                assert "substrand_id" in cols
                assert "subject_code" in cols
        finally:
            conn.close()

    def test_migrate_idempotent(self, test_dsn: str):
        """Re-running npm run db:migrate when already migrated is a no-op."""
        env = {**os.environ, "POSTGRES_DSN": test_dsn}
        res = subprocess.run(
            ["npm", "run", "db:migrate"],
            cwd=str(REPO_ROOT),
            env=env,
            capture_output=True,
            text=True,
            check=False,
        )
        assert res.returncode == 0, f"Second db:migrate failed:\n{res.stderr}"

    def test_seed_curriculum_populates_grade7_math(self, test_dsn: str):
        """seed_curriculum populates Grade 7 Mathematics with >= 5 strands and >= 3 sub-strands each."""
        from scripts.seed_curriculum import seed_curriculum

        summary = seed_curriculum(SEED_FILE, dsn=test_dsn)
        total_created = sum(counts["created"] for counts in summary.values())
        assert total_created > 0

        conn = psycopg2.connect(test_dsn)
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT st.id, st.name, count(ss.id) AS substrand_count
                    FROM strands st
                    JOIN grade_subjects gs ON gs.id = st.grade_subject_id
                    JOIN grades g ON g.id = gs.grade_id
                    JOIN subjects s ON s.id = gs.subject_id
                    LEFT JOIN substrands ss ON ss.strand_id = st.id
                    WHERE g.name = 'Grade 7' AND s.code = 'mathematics'
                    GROUP BY st.id, st.name, st.sort_order
                    ORDER BY st.sort_order;
                    """
                )
                rows = cur.fetchall()
                assert len(rows) >= 5, f"Expected >= 5 strands for Grade 7 Math, got {len(rows)}"
                for _strand_id, strand_name, ss_count in rows:
                    assert ss_count >= 3, (
                        f"Expected >= 3 sub-strands for Grade 7 Math strand {strand_name!r}, got {ss_count}"
                    )
        finally:
            conn.close()

    def test_seed_curriculum_idempotent(self, test_dsn: str):
        """Re-running seed_curriculum on the same file produces 0 new rows."""
        from scripts.seed_curriculum import seed_curriculum

        conn = psycopg2.connect(test_dsn)
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT count(*) FROM substrands;")
                before_count = cur.fetchone()[0]
        finally:
            conn.close()

        summary = seed_curriculum(SEED_FILE, dsn=test_dsn)
        for table, counts in summary.items():
            assert counts["created"] == 0, f"Expected 0 created rows in {table} on re-run, got {counts}"

        conn = psycopg2.connect(test_dsn)
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT count(*) FROM substrands;")
                after_count = cur.fetchone()[0]
        finally:
            conn.close()

        assert before_count == after_count

    def test_seed_curriculum_fails_on_unknown_subject_code(self, test_dsn: str, tmp_path: Path):
        """seed_curriculum fails loudly if a subject_code is not in subjects."""
        from scripts.seed_curriculum import seed_curriculum

        bad_seed = {
            "levels": [{"id": 3, "name": "Junior Secondary", "sort_order": 3}],
            "grades": [{"id": 71, "level_id": 3, "name": "Grade 7", "sort_order": 7}],
            "subjects": [{"code": "mathematics", "name_en": "Mathematics", "name_sw": "Hisabati"}],
            "grade_subjects": [
                {"grade_id": 71, "subject_code": "nonexistent_subject", "curriculum_ref": "BAD"}
            ],
            "strands": [],
        }
        bad_file = tmp_path / "bad_seed.json"
        bad_file.write_text(json.dumps(bad_seed), encoding="utf-8")

        with pytest.raises(ValueError, match="nonexistent_subject"):
            seed_curriculum(bad_file, dsn=test_dsn)
