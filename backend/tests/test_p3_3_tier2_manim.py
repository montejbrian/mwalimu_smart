"""
MwalimuSmart — backend/tests/test_p3_3_tier2_manim.py
Tests for P3.3 Tier 2 Manim follow-up queue, router path, and render worker.
"""

import time
import os
import pytest
from unittest.mock import patch, MagicMock
from bson import ObjectId
from followups.visual_router import route_visual, check_tier2_heuristic
from workers.manim_worker import render_followup_job


def test_visual_router_classifies_tier2_animation_requests():
    # 1. Animation keyword
    res1 = route_visual("can you show an animation of the water cycle?", "Water Cycle")
    assert res1["match"] is True
    assert res1["tier"] == 2
    assert "concept" in res1
    assert "scene_prompt" in res1

    # 2. Video / simulation keyword
    res2 = route_visual("simulate the motion of planets in the solar system", "Solar System")
    assert res2["match"] is True
    assert res2["tier"] == 2

    # 3. Visual demonstration keyword
    res3 = route_visual("show me visually how blood flows through the heart", "Circulatory System")
    assert res3["match"] is True
    assert res3["tier"] == 2

    # 4. Standard text question must NOT match Tier 2
    res4 = route_visual("what are three advantages of renewable energy?", "Energy Resources")
    assert res4["match"] is False
    assert res4["no_match"] is True


def test_manim_worker_render_followup_job_success():
    fake_job_id = "test-job-uuid-1234"
    fake_mongo_id = ObjectId()

    mock_col = MagicMock()
    mock_job = {
        "_id": fake_mongo_id,
        "job_id": fake_job_id,
        "concept": "Photosynthesis process",
        "question": "Animate photosynthesis",
        "status": "queued",
    }

    # Mock subprocess.run to simulate successful manim render
    mock_subproc = MagicMock()
    mock_subproc.returncode = 0
    mock_subproc.stdout = "Rendered FollowUpVisualScene"
    mock_subproc.stderr = ""

    with patch("workers.manim_worker._get_mongo_col", return_value=mock_col), \
         patch("subprocess.run", return_value=mock_subproc), \
         patch("workers.manim_worker._update_pg_followup_message") as mock_pg_update, \
         patch("workers.manim_worker._notify_server") as mock_notify, \
         patch("pathlib.Path.rglob") as mock_rglob:

        # Mock MP4 candidate found
        mock_mp4_path = MagicMock()
        mock_mp4_path.resolve.return_value = "/tmp/renders/followup_test-job-uuid-1234.mp4"
        mock_rglob.return_value = [mock_mp4_path]

        render_followup_job(mock_job)

        # Verify MongoDB updated to rendering then ready
        assert mock_col.update_one.call_count >= 2
        last_update = mock_col.update_one.call_args_list[-1]
        assert last_update[0][1]["$set"]["status"] == "ready"
        assert f"followup_{fake_job_id}.mp4" in last_update[0][1]["$set"]["asset_url"]

        # Verify Postgres updated
        mock_pg_update.assert_called_once()
        assert mock_pg_update.call_args[0][0] == fake_job_id
        assert mock_pg_update.call_args[0][1] == "ready"

        # Verify server notification
        mock_notify.assert_called_once()
        assert mock_notify.call_args[0][0] == fake_job_id
        assert mock_notify.call_args[0][1] == "ready"


def test_manim_worker_render_followup_job_failure_handles_gracefully():
    fake_job_id = "test-job-fail-5678"
    fake_mongo_id = ObjectId()

    mock_col = MagicMock()
    mock_job = {
        "_id": fake_mongo_id,
        "job_id": fake_job_id,
        "concept": "Faulty concept",
        "question": "Animate faulty syntax",
        "status": "queued",
    }

    # Simulate manim process error
    mock_subproc = MagicMock()
    mock_subproc.returncode = 1
    mock_subproc.stdout = ""
    mock_subproc.stderr = "SyntaxError: invalid Manim mobject syntax"

    with patch("workers.manim_worker._get_mongo_col", return_value=mock_col), \
         patch("subprocess.run", return_value=mock_subproc), \
         patch("workers.manim_worker._update_pg_followup_message") as mock_pg_update, \
         patch("workers.manim_worker._notify_server") as mock_notify:

        render_followup_job(mock_job)

        # Verify Mongo marked as failed
        last_update = mock_col.update_one.call_args_list[-1]
        assert last_update[0][1]["$set"]["status"] == "failed"
        assert "error" in last_update[0][1]["$set"]

        # Verify Postgres updated to failed
        mock_pg_update.assert_called_once()
        assert mock_pg_update.call_args[0][1] == "failed"

        # Verify server notified of failure
        mock_notify.assert_called_once()
        assert mock_notify.call_args[0][1] == "failed"
