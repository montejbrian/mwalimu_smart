"""
MwalimuSmart — backend/followups/templates.py
Tier 1 visual templates registry and parameter schemas (Phase 3).

Five CBC-aligned interactive SVG templates:
1. equation_balance — Algebraic balance scale / equations
2. number_line — Rational numbers, integers, inequalities
3. fraction_bar — Part-to-whole, comparisons, equivalent fractions
4. flowchart — Scientific processes, classification, algorithms
5. graph_plot — Linear relations, coordinate grids, basic plots
"""

from __future__ import annotations

from typing import Any, Optional


TEMPLATES: dict[str, dict[str, Any]] = {
    "equation_balance": {
        "id": "equation_balance",
        "name": "Equation Balance",
        "description": "Visualizes algebraic equations as a balanced beam or two-sided scale.",
        "keywords": ["equation", "solve for", "balance", "unknown", "algebra", "variable", "left side", "right side"],
        "default_params": {
            "equation": "2x + 3 = 11",
            "left": "2x + 3",
            "right": "11",
            "balanced": True,
            "steps": ["Subtract 3 from both sides: 2x = 8", "Divide both sides by 2: x = 4"],
        },
    },
    "number_line": {
        "id": "number_line",
        "name": "Number Line",
        "description": "Visualizes integers, decimals, negative numbers, and intervals on a scaled number line.",
        "keywords": ["number line", "integers", "negative numbers", "greater than", "less than", "interval", "between"],
        "default_params": {
            "min": -5,
            "max": 5,
            "step": 1,
            "points": [
                {"value": -2, "label": "-2", "color": "#f59e0b"},
                {"value": 3, "label": "3", "color": "#10b981"},
            ],
            "highlights": [{"from": -2, "to": 3, "label": "Distance: 5"}],
        },
    },
    "fraction_bar": {
        "id": "fraction_bar",
        "name": "Fraction Bar",
        "description": "Visualizes parts of a whole, fraction comparisons, and equivalent fractions using partitioned strips.",
        "keywords": ["fraction", "numerator", "denominator", "half", "quarter", "third", "equivalent fraction", "ratio", "parts of whole"],
        "default_params": {
            "title": "Fraction Comparison",
            "bars": [
                {"numerator": 3, "denominator": 4, "label": "3/4", "color": "#10b981"},
                {"numerator": 6, "denominator": 8, "label": "6/8", "color": "#38bdf8"},
            ],
            "comparison": "=",
        },
    },
    "flowchart": {
        "id": "flowchart",
        "name": "Flowchart",
        "description": "Visualizes sequential steps, scientific cycles, separation processes, or decision pathways.",
        "keywords": ["process", "flowchart", "steps", "stages", "cycle", "separation", "method", "procedure", "how to separate"],
        "default_params": {
            "title": "Separating Sand and Water",
            "nodes": [
                {"id": "1", "label": "Muddy Water Mixture", "type": "start"},
                {"id": "2", "label": "Pour into Filter Funnel", "type": "step"},
                {"id": "3", "label": "Residue trapped on filter", "type": "output"},
                {"id": "4", "label": "Clean filtrate in beaker", "type": "output"},
            ],
            "edges": [
                {"from": "1", "to": "2"},
                {"from": "2", "to": "3"},
                {"from": "2", "to": "4"},
            ],
        },
    },
    "graph_plot": {
        "id": "graph_plot",
        "name": "Graph Plot",
        "description": "Visualizes linear equations, coordinates (x, y), and coordinate axes.",
        "keywords": ["graph", "plot", "coordinates", "x-axis", "y-axis", "linear", "slope", "intercept", "cartesian"],
        "default_params": {
            "title": "Plot: y = 2x + 1",
            "x_label": "x",
            "y_label": "y",
            "points": [
                {"x": 0, "y": 1, "label": "(0, 1)"},
                {"x": 1, "y": 3, "label": "(1, 3)"},
                {"x": 2, "y": 5, "label": "(2, 5)"},
            ],
            "line_expr": "y = 2x + 1",
        },
    },
}


def get_template(template_id: str) -> Optional[dict[str, Any]]:
    return TEMPLATES.get(template_id)


def validate_template_params(template_id: str, params: dict[str, Any]) -> dict[str, Any]:
    """Ensures params contain safe defaults for the given template."""
    tmpl = TEMPLATES.get(template_id)
    if not tmpl:
        raise ValueError(f"Unknown template ID: {template_id}")

    defaults = tmpl["default_params"]
    merged = {**defaults, **params}
    return merged
