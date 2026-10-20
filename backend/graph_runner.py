"""
MwalimuSmart Institutional OS
graph_runner.py — Full E2E test harness (P1-P4)
"""
from __future__ import annotations
import uuid, logging
from graph.graph import graph
from graph.state import AgentState, LessonRequest

logging.basicConfig(level="INFO", format="%(asctime)s %(levelname)s %(message)s")

def _make_state(topic, strand, grade, answers, retake_count=0, remedial=False) -> AgentState:
    return {
        "request": LessonRequest(
            topic=topic, strand=strand, grade_level=grade,
            school_id="school_001", teacher_id="teacher_001",
            lesson_id=str(uuid.uuid4()), language="en", remedial_mode=remedial,
        ),
        "retrieved_chunks": [], "retrieval_query": "", "retrieval_count": 0,
        "lesson_script": None, "script_version": 0,
        "diagnostic_result": None, "retake_count": retake_count,
        "student_answers": answers,
        "animation": None, "workflow_status": "initialised",
        "errors": [], "node_durations": [],
    }

def _print(label, state):
    print(f"\n{'━'*60}\n  {label}\n{'━'*60}")
    print(f"  Status        : {state['workflow_status'].upper()}")
    print(f"  Script version: {state.get('script_version', 0)}")
    diag = state.get("diagnostic_result")
    if diag:
        print(f"  Diagnostic    : {diag['score']}/5 ({diag['percentage']}%) → {diag['outcome'].upper()}")
        if diag["weak_competencies"]:
            print(f"  Weak areas    : {', '.join(diag['weak_competencies'])}")
    script = state.get("lesson_script")
    if script:
        print(f"  Lesson        : {script['title']} ({script['estimated_duration_minutes']}min)")
        print(f"  Key concepts  : {script['key_concepts']}")
    if state.get("errors"):
        print(f"  Errors        : {state['errors']}")
    total = sum(d.get("seconds",0) for d in state.get("node_durations",[]))
    print(f"  Total time    : {total:.2f}s\n{'━'*60}")

if __name__ == "__main__":
    print("\n" + "="*60)
    print("  MwalimuSmart — P1-P4 Integration Runner")
    print("="*60)

    # PASS PATH: 4/5 = 80%
    print("\n🟢 Scenario 1 — Pass path")
    s1 = graph.invoke(_make_state("Photosynthesis","science_technology","grade_7",
        {"q1":"C","q2":"D","q3":"B","q4":"C","q5":"A"}))
    _print("PASS PATH", s1)

    # RETAKE PATH: mostly wrong
    print("\n🟡 Scenario 2 — Retake path")
    s2 = graph.invoke(_make_state("Supply and Demand","business_studies","grade_9",
        {"q1":"A","q2":"A","q3":"A","q4":"A","q5":"A"}))
    _print("RETAKE PATH", s2)

    # FORCE PASS: max retakes already used
    print("\n🔴 Scenario 3 — Force-pass after max retakes")
    s3 = graph.invoke(_make_state("Water Cycle","science_technology","grade_5",
        {"q1":"A","q2":"A","q3":"A","q4":"A","q5":"A"}, retake_count=2, remedial=True))
    _print("MAX RETAKE", s3)
    assert s3["diagnostic_result"]["outcome"] == "pass"
    print("\nAll scenarios completed ✓")
