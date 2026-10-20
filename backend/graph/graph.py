"""
MwalimuSmart Institutional OS
graph/graph.py — LangGraph StateGraph definition

Wires all agent nodes into a compiled graph with:
  - Linear happy path:  Researcher → Scriptwriter → Diagnostic → Animator
  - Retake path:        Diagnostic → Scriptwriter (remedial_mode=True)
  - Hard exit after 2 retakes to prevent infinite loops
"""

from __future__ import annotations

from langgraph.graph import StateGraph, START, END

from graph.state import AgentState
from agents.researcher import researcher_node
from agents.scriptwriter import scriptwriter_node
from agents.diagnostic import diagnostic_node
from agents.animator import animator_node


# ── Conditional edge: what happens after Diagnostic? ─────────────────────────

def route_after_diagnostic(state: AgentState) -> str:
    """
    Routing function called after the Diagnostic node completes.

    Rules
    -----
    - outcome == "pass"           → proceed to Animator
    - outcome == "retake"
        retake_count < 2          → back to Scriptwriter (remedial)
        retake_count >= 2         → force to Animator anyway (avoid infinite loop)
    - outcome == "pending"        → diagnostic hasn't run yet; error state
    """
    result = state.get("diagnostic_result")

    if result is None or result["outcome"] == "pending":
        # Should never happen in production; defensive guard
        return "animator"

    if result["outcome"] == "pass":
        return "animator"

    # outcome == "retake"
    retake_count = state.get("retake_count", 0)
    if retake_count < 2:
        return "scriptwriter"   # Re-enter with remedial_mode=True
    else:
        # Student has retaken twice; surface the content anyway
        return "animator"


# ── Graph builder ─────────────────────────────────────────────────────────────

def build_graph() -> StateGraph:
    """
    Construct and compile the MwalimuSmart lesson generation graph.

    Returns a compiled LangGraph CompiledStateGraph ready to invoke.
    """
    builder = StateGraph(AgentState)

    # ── Register nodes ────────────────────────────────────────────────────────
    builder.add_node("researcher",   researcher_node)
    builder.add_node("scriptwriter", scriptwriter_node)
    builder.add_node("diagnostic",   diagnostic_node)
    builder.add_node("animator",     animator_node)

    # ── Entry point ───────────────────────────────────────────────────────────
    builder.add_edge(START, "researcher")

    # ── Linear happy path ─────────────────────────────────────────────────────
    builder.add_edge("researcher",   "scriptwriter")
    builder.add_edge("scriptwriter", "diagnostic")

    # ── Conditional branch after Diagnostic ──────────────────────────────────
    builder.add_conditional_edges(
        "diagnostic",
        route_after_diagnostic,
        {
            "animator":     "animator",
            "scriptwriter": "scriptwriter",   # Retake path
        },
    )

    # ── Terminal node ─────────────────────────────────────────────────────────
    builder.add_edge("animator", END)

    return builder.compile()


# ── Singleton compiled graph (import this everywhere) ─────────────────────────
graph = build_graph()
