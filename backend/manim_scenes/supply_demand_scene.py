"""
MwalimuSmart Institutional OS
manim_scenes/supply_demand_scene.py — Reference Manim Scene

This is a HAND-CRAFTED reference scene showing the exact visual standard
all Gemini-generated scenes must match:
  - BLACK background
  - HIGH-CONTRAST colours for projectors
  - Large readable fonts
  - Step-by-step animated build

Run directly for preview:
    manim render -ql manim_scenes/supply_demand_scene.py SupplyDemandScene

Business Studies — Grade 9 — Supply and Demand
"""

from manim import *


class SupplyDemandScene(Scene):
    """
    Animates the Supply and Demand curves for a Grade 9 Business Studies class.
    Covers: demand curve, supply curve, equilibrium point, price effects.
    """

    # Colour palette — high contrast for classroom projector
    BG      = BLACK
    TITLE_C = YELLOW
    DEMAND_C= "#FF6B35"    # Orange-red for demand
    SUPPLY_C= "#00FF88"    # Bright green for supply
    EQUIL_C = "#FFD700"    # Gold for equilibrium
    AXIS_C  = WHITE
    LABEL_C = WHITE
    NOTE_C  = "#AAAAAA"

    def construct(self):
        self.camera.background_color = self.BG

        # ── 1. Title ──────────────────────────────────────────────────────────
        self._title_card()

        # ── 2. Axes ───────────────────────────────────────────────────────────
        axes = self._build_axes()
        self.play(Create(axes), run_time=1.5)
        self.wait(1)

        # ── 3. Demand curve ───────────────────────────────────────────────────
        self._animate_demand_curve(axes)

        # ── 4. Supply curve ───────────────────────────────────────────────────
        self._animate_supply_curve(axes)

        # ── 5. Equilibrium ────────────────────────────────────────────────────
        self._animate_equilibrium(axes)

        # ── 6. Price effect demo ──────────────────────────────────────────────
        self._price_effect(axes)

        # ── 7. Summary ────────────────────────────────────────────────────────
        self._summary_card()

    # ── Helper methods ────────────────────────────────────────────────────────

    def _title_card(self):
        title = Text("Supply and Demand", font_size=48, color=self.TITLE_C, weight=BOLD)
        sub   = Text("Business Studies — Grade 9", font_size=30, color=self.LABEL_C)
        sub.next_to(title, DOWN, buff=0.4)
        group = VGroup(title, sub).move_to(ORIGIN)

        self.play(Write(title), run_time=1.5)
        self.play(FadeIn(sub), run_time=0.8)
        self.wait(2)
        self.play(FadeOut(group), run_time=0.8)

    def _build_axes(self) -> Axes:
        axes = Axes(
            x_range=[0, 10, 2],
            y_range=[0, 10, 2],
            x_length=9,
            y_length=6,
            axis_config={
                "color":        self.AXIS_C,
                "stroke_width": 2.5,
                "include_tip":  True,
            },
        ).shift(DOWN * 0.5)

        x_label = Text("Quantity (units)", font_size=26, color=self.LABEL_C)
        y_label = Text("Price (KSh)", font_size=26, color=self.LABEL_C).rotate(PI / 2)
        x_label.next_to(axes.x_axis, DOWN, buff=0.3)
        y_label.next_to(axes.y_axis, LEFT, buff=0.4)

        self.add(x_label, y_label)
        return axes

    def _animate_demand_curve(self, axes: Axes):
        header = Text("DEMAND CURVE", font_size=32, color=self.DEMAND_C, weight=BOLD)
        header.to_corner(UL).shift(RIGHT * 0.3)
        note = Text(
            "As price rises, quantity demanded falls",
            font_size=24, color=self.NOTE_C,
        ).next_to(header, DOWN, buff=0.2).align_to(header, LEFT)

        demand_curve = axes.plot(
            lambda x: 9 - 0.8 * x,
            x_range=[0.5, 9.5],
            color=self.DEMAND_C,
            stroke_width=3,
        )
        d_label = Text("D", font_size=32, color=self.DEMAND_C, weight=BOLD)
        d_label.next_to(axes.c2p(9.5, 9 - 0.8 * 9.5), RIGHT, buff=0.15)

        self.play(Write(header), FadeIn(note), run_time=1)
        self.play(Create(demand_curve), run_time=2)
        self.play(Write(d_label))
        self.wait(2)

    def _animate_supply_curve(self, axes: Axes):
        header = Text("SUPPLY CURVE", font_size=32, color=self.SUPPLY_C, weight=BOLD)
        header.to_corner(UR).shift(LEFT * 0.3)
        note = Text(
            "As price rises, quantity supplied rises",
            font_size=24, color=self.NOTE_C,
        ).next_to(header, DOWN, buff=0.2).align_to(header, RIGHT)

        supply_curve = axes.plot(
            lambda x: 0.8 * x + 0.5,
            x_range=[0.5, 9.5],
            color=self.SUPPLY_C,
            stroke_width=3,
        )
        s_label = Text("S", font_size=32, color=self.SUPPLY_C, weight=BOLD)
        s_label.next_to(axes.c2p(9.5, 0.8 * 9.5 + 0.5), RIGHT, buff=0.15)

        self.play(Write(header), FadeIn(note), run_time=1)
        self.play(Create(supply_curve), run_time=2)
        self.play(Write(s_label))
        self.wait(2)

    def _animate_equilibrium(self, axes: Axes):
        # Equilibrium: 9 - 0.8x = 0.8x + 0.5  →  x = 8.5/1.6 ≈ 5.31, y ≈ 4.75
        eq_x, eq_y = 5.31, 4.75

        dot = Dot(axes.c2p(eq_x, eq_y), radius=0.18, color=self.EQUIL_C)
        eq_label = Text("EQUILIBRIUM", font_size=26, color=self.EQUIL_C, weight=BOLD)
        eq_label.next_to(dot, UR, buff=0.25)

        # Dashed lines to axes
        v_line = DashedLine(
            axes.c2p(eq_x, 0), axes.c2p(eq_x, eq_y),
            color=self.EQUIL_C, stroke_width=1.5,
        )
        h_line = DashedLine(
            axes.c2p(0, eq_y), axes.c2p(eq_x, eq_y),
            color=self.EQUIL_C, stroke_width=1.5,
        )
        p_label = Text(f"P* ≈ {eq_y:.1f}", font_size=22, color=self.EQUIL_C)
        q_label = Text(f"Q* ≈ {eq_x:.1f}", font_size=22, color=self.EQUIL_C)
        p_label.next_to(axes.c2p(0, eq_y), LEFT, buff=0.1)
        q_label.next_to(axes.c2p(eq_x, 0), DOWN, buff=0.1)

        self.play(Create(v_line), Create(h_line), run_time=1.5)
        self.play(GrowFromCenter(dot), Write(eq_label), run_time=1)
        self.play(Write(p_label), Write(q_label), run_time=0.8)
        self.wait(2.5)

    def _price_effect(self, axes: Axes):
        box = SurroundingRectangle(
            Text("What happens if price RISES above equilibrium?",
                 font_size=26, color=YELLOW),
            color=YELLOW, buff=0.2,
        )
        question = Text(
            "What happens if price RISES above equilibrium?",
            font_size=26, color=YELLOW,
        )
        group = VGroup(question, box).move_to(UP * 3.2)
        answer = Text(
            "Surplus → Demand falls, Supply rises → Price pushed back down",
            font_size=22, color=self.NOTE_C,
        ).next_to(group, DOWN, buff=0.3)

        self.play(Write(question), Create(box), run_time=1.5)
        self.play(FadeIn(answer), run_time=1)
        self.wait(3)
        self.play(FadeOut(group), FadeOut(answer), run_time=0.8)

    def _summary_card(self):
        self.play(*[FadeOut(mob) for mob in self.mobjects], run_time=1)

        title = Text("Key Concepts", font_size=40, color=self.TITLE_C, weight=BOLD)
        title.to_edge(UP, buff=0.5)

        concepts = [
            ("Demand curve",  "Slopes downward — inverse price-quantity relationship"),
            ("Supply curve",  "Slopes upward — direct price-quantity relationship"),
            ("Equilibrium",   "Point where quantity supplied = quantity demanded"),
            ("Surplus",       "Price above equilibrium — excess supply"),
            ("Shortage",      "Price below equilibrium — excess demand"),
        ]

        items = VGroup()
        for i, (term, desc) in enumerate(concepts):
            term_t = Text(f"• {term}:", font_size=26, color=self.SUPPLY_C, weight=BOLD)
            desc_t = Text(f" {desc}", font_size=24, color=self.LABEL_C)
            row    = VGroup(term_t, desc_t).arrange(RIGHT, buff=0.15, aligned_edge=UP)
            items.add(row)

        items.arrange(DOWN, buff=0.35, aligned_edge=LEFT)
        items.next_to(title, DOWN, buff=0.5).to_edge(LEFT, buff=0.6)

        self.play(Write(title), run_time=1)
        for item in items:
            self.play(FadeIn(item, shift=RIGHT * 0.3), run_time=0.6)
        self.wait(4)
