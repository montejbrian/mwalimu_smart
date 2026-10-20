"""
MwalimuSmart — backend/tests/test_p3_2_visuals.py
Tests for P3.2 Tier 1 visual templates, registry, validation, and fast routing heuristics.
"""

import time
import pytest
from followups.templates import TEMPLATES, get_template, validate_template_params
from followups.visual_router import route_by_heuristics, route_visual
from followups.prompt import build_visual_classifier_prompt


def test_templates_registry_contains_five_cbc_templates():
    expected_ids = {"equation_balance", "number_line", "fraction_bar", "flowchart", "graph_plot"}
    assert expected_ids.issubset(set(TEMPLATES.keys()))

    for tid in expected_ids:
        tmpl = get_template(tid)
        assert tmpl is not None
        assert "name" in tmpl
        assert "default_params" in tmpl
        assert len(tmpl["keywords"]) > 0


def test_validate_template_params_merges_defaults():
    # Equation Balance
    params = validate_template_params("equation_balance", {"equation": "3x = 12"})
    assert params["equation"] == "3x = 12"
    assert params["balanced"] is True
    assert "steps" in params

    # Number Line
    nl_params = validate_template_params("number_line", {"min": -10, "max": 10})
    assert nl_params["min"] == -10
    assert nl_params["max"] == 10
    assert nl_params["step"] == 1

    # Invalid template ID
    with pytest.raises(ValueError):
        validate_template_params("unknown_template_xyz", {})


def test_route_heuristics_all_five_templates():
    # 1. Equation Balance
    eq_res = route_by_heuristics("how to solve 2x + 5 = 15 balance", "Linear Equations")
    assert eq_res is not None
    assert eq_res["match"] is True
    assert eq_res["tier"] == 1
    assert eq_res["template_id"] == "equation_balance"
    assert "left" in eq_res["params"]
    assert "right" in eq_res["params"]

    # 2. Number Line
    nl_res = route_by_heuristics("show integers -3 and 4 on a number line", "Integers")
    assert nl_res is not None
    assert nl_res["match"] is True
    assert nl_res["template_id"] == "number_line"
    assert any(p["value"] == -3 for p in nl_res["params"]["points"])

    # 3. Fraction Bar
    frac_res = route_by_heuristics("compare fractions 2/5 and 4/10", "Fractions")
    assert frac_res is not None
    assert frac_res["match"] is True
    assert frac_res["template_id"] == "fraction_bar"
    assert len(frac_res["params"]["bars"]) >= 2

    # 4. Flowchart
    flow_res = route_by_heuristics("what are the stages and steps flowchart for filtration", "Separation of Mixtures")
    assert flow_res is not None
    assert flow_res["match"] is True
    assert flow_res["template_id"] == "flowchart"
    assert "nodes" in flow_res["params"]

    # 5. Graph Plot
    plot_res = route_by_heuristics("plot the linear coordinates on a graph y = 2x + 1", "Linear Graphs")
    assert plot_res is not None
    assert plot_res["match"] is True
    assert plot_res["template_id"] == "graph_plot"
    assert "points" in plot_res["params"]


def test_route_heuristics_no_match():
    res = route_by_heuristics("what is the capital city of Kenya?", "Social Studies")
    assert res is None

    full_res = route_visual("what is the capital city of Kenya?", "Social Studies")
    assert full_res["match"] is False
    assert full_res["no_match"] is True


def test_route_heuristics_latency_sub_50ms():
    t0 = time.perf_counter()
    res = route_by_heuristics("show me 3/4 fraction bar", "Fractions")
    elapsed_ms = (time.perf_counter() - t0) * 1000
    assert elapsed_ms < 50
    assert res is not None
    assert res["template_id"] == "fraction_bar"


def test_build_visual_classifier_prompt():
    prompt = build_visual_classifier_prompt("explain how to balance 2x + 4 = 10", "Algebra")
    assert "equation_balance" in prompt
    assert "number_line" in prompt
    assert "fraction_bar" in prompt
    assert "no_match" in prompt
