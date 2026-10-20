"""
P1.7 — Python Authoring Pipeline Tests (assessment_gen, publish, authoring_worker)
"""

from __future__ import annotations

import psycopg2
import pytest

from authoring.assessment_gen import generate_assessment_questions
from authoring.authoring_worker import run_substrand_authoring_job
from authoring.publish import approve_lesson, publish_lesson
from config.settings import settings


class TestAuthoringPipeline:
    def test_generate_assessment_questions_produces_3_to_5_bilingual_mcqs(self):
        script_en = {
            "title": "Whole Numbers",
            "key_concepts": ["Place Value", "Total Value", "Rounding Off"],
            "diagnostic_questions": [
                {
                    "question_text": "What is the place value of 7 in 472,105?",
                    "options": {
                        "A": "Ten thousands",
                        "B": "Thousands",
                        "C": "Hundred thousands",
                        "D": "Hundreds",
                    },
                    "correct_answer": "A",
                    "competency_tag": "numeracy",
                }
            ],
        }
        questions = generate_assessment_questions(
            script_en=script_en,
            script_sw=None,
            topic="Whole Numbers",
        )
        assert 3 <= len(questions) <= 5
        first = questions[0]
        assert first["question_en"] == "What is the place value of 7 in 472,105?"
        assert first["correct_index"] == 0
        assert len(first["options_en"]) == 4
        assert len(first["options_sw"]) == 4
        assert first["explanation_en"]
        assert first["explanation_sw"]

    def test_authoring_worker_and_publish_versioning_in_postgres(self):
        conn = psycopg2.connect(settings.POSTGRES_DSN)
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT ss.id
                    FROM substrands ss
                    JOIN strands st ON st.id = ss.strand_id
                    JOIN grade_subjects gs ON gs.id = st.grade_subject_id
                    JOIN subjects subj ON subj.id = gs.subject_id
                    WHERE gs.grade_id = 71 AND subj.code = 'mathematics'
                    ORDER BY st.sort_order DESC, ss.sort_order DESC
                    LIMIT 1
                    """
                )
                row = cur.fetchone()
                assert row is not None
                substrand_id = str(row[0])

                # Ensure clean starting state for this substrand
                cur.execute("DELETE FROM lessons WHERE substrand_id = %s", (substrand_id,))
            conn.commit()

            # 1. Run authoring worker for v1
            res_v1 = run_substrand_authoring_job(substrand_id=substrand_id, tier="standard")
            assert res_v1["state"] == "awaiting_review"
            assert res_v1["version"] == 1
            v1_id = res_v1["lesson_id"]

            # 2. Approve and publish v1
            approved = approve_lesson(v1_id)
            assert approved["status"] == "approved"

            published = publish_lesson(v1_id)
            assert published["status"] == "published"

            # 3. Rule #2: cannot approve a published lesson in place
            with pytest.raises(ValueError, match="Cannot mutate a published lesson in place"):
                approve_lesson(v1_id)

            # 4. Regenerating / running worker again creates v2 draft while v1 stays published
            res_v2 = run_substrand_authoring_job(
                substrand_id=substrand_id,
                tier="featured",
                feedback="Include Kenyan currency examples",
            )
            assert res_v2["version"] == 2
            v2_id = res_v2["lesson_id"]
            assert v2_id != v1_id

            # Publish v2 -> archives v1
            publish_lesson(v2_id)

            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id::text, version, status FROM lessons WHERE substrand_id = %s ORDER BY version ASC",
                    (substrand_id,),
                )
                rows = cur.fetchall()
                assert rows == [
                    (v1_id, 1, "archived"),
                    (v2_id, 2, "published"),
                ]

                # Cleanup test rows
                cur.execute("DELETE FROM lessons WHERE substrand_id = %s", (substrand_id,))
            conn.commit()
        finally:
            conn.close()
