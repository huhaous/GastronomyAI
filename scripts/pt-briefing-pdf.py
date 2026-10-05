"""Render docs/PT-BRIEFING.md to a print-ready A4 PDF."""

from __future__ import annotations

from pathlib import Path

from fpdf import FPDF

ROOT = Path(__file__).resolve().parents[1]
MD = ROOT / "docs" / "PT-BRIEFING.md"
OUT = ROOT / "docs" / "PT-BRIEFING.pdf"
FONT = Path("/usr/share/fonts/truetype/dejavu")

CREAM = (247, 243, 234)
INK = (28, 25, 20)
GOLD = (138, 109, 44)
RULE = (224, 216, 200)
MUTED = (90, 82, 70)


class BriefingPDF(FPDF):
    def header(self) -> None:
        if self.page_no() == 1:
            return
        self.set_font("DejaVu", "I", 8)
        self.set_text_color(*GOLD)
        self.cell(0, 6, "GastronomyAI  ·  briefing for coaches", align="L")
        self.ln(8)

    def footer(self) -> None:
        self.set_y(-14)
        self.set_draw_color(*GOLD)
        self.set_line_width(0.2)
        self.line(18, self.get_y(), 192, self.get_y())
        self.ln(2)
        self.set_font("DejaVu", "", 8)
        self.set_text_color(*MUTED)
        self.cell(0, 6, str(self.page_no()), align="R")


def add_fonts(pdf: BriefingPDF) -> None:
    pdf.add_font("DejaVu", "", str(FONT / "DejaVuSans.ttf"))
    pdf.add_font("DejaVu", "B", str(FONT / "DejaVuSans-Bold.ttf"))
    pdf.add_font("DejaVu", "I", str(FONT / "DejaVuSerif.ttf"))
    pdf.add_font("DejaVu", "BI", str(FONT / "DejaVuSerif-Bold.ttf"))


def write_rich(pdf: BriefingPDF, text: str, size: float = 10.5) -> None:
    """Write a paragraph, rendering **bold** spans."""
    pdf.set_font("DejaVu", "", size)
    pdf.set_text_color(*INK)
    parts = text.split("**")
    for i, part in enumerate(parts):
        pdf.set_font("DejaVu", "B" if i % 2 else "", size)
        pdf.write(5.4, part)
    pdf.ln(7.2)


def heading(pdf: BriefingPDF, text: str) -> None:
    pdf.ln(3)
    pdf.set_font("DejaVu", "BI", 13)
    pdf.set_text_color(*GOLD)
    pdf.multi_cell(0, 7, text)
    pdf.ln(1)


def bullet(pdf: BriefingPDF, text: str, indent: float = 6) -> None:
    x = pdf.l_margin + indent
    pdf.set_x(x)
    pdf.set_font("DejaVu", "", 10.5)
    pdf.set_text_color(*INK)
    pdf.cell(4, 5.4, "–")
    pdf.set_x(x + 5)
    write_flow(pdf, text, 10.5, 5.4)


def numbered(pdf: BriefingPDF, n: int, text: str) -> None:
    x = pdf.l_margin + 2
    pdf.set_x(x)
    pdf.set_font("DejaVu", "B", 10.5)
    pdf.set_text_color(*INK)
    pdf.cell(7, 5.4, f"{n}.")
    pdf.set_x(x + 8)
    write_flow(pdf, text, 10.5, 5.4)


def write_flow(pdf: BriefingPDF, text: str, size: float, h: float) -> None:
    parts = text.split("**")
    # fpdf write() continues on the current line; finish with ln.
    for i, part in enumerate(parts):
        pdf.set_font("DejaVu", "B" if i % 2 else "", size)
        pdf.set_text_color(*INK)
        pdf.write(h, part)
    pdf.ln(h + 1.4)


def table(pdf: BriefingPDF, rows: list[tuple[str, str]]) -> None:
    col1, col2 = 62, 112
    pdf.set_font("DejaVu", "B", 8)
    pdf.set_text_color(*GOLD)
    pdf.cell(col1, 7, "IF THEY ASK FOR…")
    pdf.cell(col2, 7, "WHY IT SLIPS")
    pdf.ln()
    pdf.set_draw_color(*GOLD)
    y = pdf.get_y()
    pdf.line(pdf.l_margin, y, pdf.l_margin + col1 + col2, y)
    pdf.ln(1.5)
    for i, (left, right) in enumerate(rows):
        pdf.set_font("DejaVu", "B", 9.5)
        pdf.set_text_color(*INK)
        x, y = pdf.get_x(), pdf.get_y()
        pdf.multi_cell(col1, 5.2, left)
        h1 = pdf.get_y() - y
        pdf.set_xy(x + col1, y)
        pdf.set_font("DejaVu", "", 9.5)
        pdf.multi_cell(col2, 5.2, right)
        h2 = pdf.get_y() - y
        pdf.set_y(y + max(h1, h2) + 1.2)
        if i < len(rows) - 1:
            pdf.set_draw_color(*RULE)
            pdf.line(pdf.l_margin, pdf.get_y() - 0.6, pdf.l_margin + col1 + col2, pdf.get_y() - 0.6)


def build() -> None:
    pdf = BriefingPDF(format="A4", unit="mm")
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.set_margins(18, 16, 18)
    add_fonts(pdf)
    pdf.add_page()
    pdf.set_fill_color(*CREAM)
    # Full-page cream is not trivially a body fill; cells will sit on white.
    # Accept white paper with gold rules — prints cleanly.

    pdf.set_font("DejaVu", "BI", 22)
    pdf.set_text_color(*INK)
    pdf.multi_cell(0, 10, "GastronomyAI — briefing for coaches")
    pdf.set_draw_color(*GOLD)
    pdf.set_line_width(0.45)
    pdf.line(18, pdf.get_y() + 1, 192, pdf.get_y() + 1)
    pdf.ln(8)

    pdf.set_font("DejaVu", "I", 10)
    pdf.set_text_color(*MUTED)
    pdf.multi_cell(
        0,
        5.4,
        "10 September 2026.  For the first supervised trial with a personal trainer.",
    )
    pdf.ln(2)

    write_rich(pdf, "Live tool: https://gastronomy-ai.vercel.app")
    write_rich(pdf, "The site is password-locked. Hao will give you the password separately.")
    write_rich(
        pdf,
        "This is **supervised research**, not a finished consumer app and not medical or dietetic advice. Nutrition numbers are estimates from reference data, not a lab measurement of the food you cook.",
    )

    heading(pdf, "What it is")
    write_rich(
        pdf,
        "Clients do not fail diets because they cannot find a chicken-and-broccoli recipe. They fail because the food they actually want is taken away.",
    )
    write_rich(
        pdf,
        "GastronomyAI **elevates a named craving** — carbonara, a cheeseburger, tikka masala — into a plate that still tastes like that dish, at a calorie and protein target you set. The trick is culinary, not moral: keep the bun, the melt, the sauce; spend the calories on flavour rather than a hidden pool of oil.",
    )
    write_rich(
        pdf,
        "You (the coach) run it. You name the client, you judge the card, you keep or discard it, you send it on if it is good enough to cook.",
    )

    heading(pdf, "What you can do today")
    steps = [
        "Open the URL, enter the password, land in **Elevate**.",
        "Name the client (**For**).",
        "Type the craving as a dish, not a category: “fettuccine Alfredo”, not “high-protein comfort food”.",
        "Set calories, minimum protein, time, and tools. Defaults are a supermarket **weeknight**: ~480 kcal, 40 g protein, 15 minutes, stovetop.",
        "Pick a strategy: **Balanced Deficit** (everyday cut), **Post-Workout High-Protein** (glycogen + repair, fat kept in check), or **Rest Day Low-Carb** (lower carb load, still a real plate).",
        "Choose **Weeknight** (one pan, short method) or **Batch** (cook once, 3–4 portions). The shop is always a normal supermarket — not a health-food run.",
        "Wait for the **plating card**. A run can take up to a minute.",
        "If the card is honest, **Keep** it. Print it or use the device share sheet to send it.",
        "Open a kept plate later from the list on the left.",
    ]
    for i, step in enumerate(steps, 1):
        numbered(pdf, i, step)
    write_rich(
        pdf,
        "Deep Cut / PSMF is **not** on this coach URL. That mode stays in the research lab.",
    )

    heading(pdf, "What is on the plating card")
    for item in [
        "Dish name, tagline, strategy",
        "Calories, protein, carbs, fat — and whether every line was **priced** against the food database (verified / partly verified / estimated)",
        "Whether portions were scaled to hit your calorie and protein numbers",
        "A warning if fat or carbs sit outside the strategy you picked",
        "Satiety, thermic effect, and glycemic note",
        "Why the elevation still feels like the craving (fat-mimicry / technique)",
        "Ingredients with weights, then a short method",
        "Plating notes you can send with the card",
        "The nutrition disclaimer, which travels with print and share",
    ]:
        bullet(pdf, item)
    write_rich(
        pdf,
        "The method is meant to be cookable after work. If the shop or the steps would make a tired client skip it, the card says so.",
    )

    heading(pdf, "How to use it this week")
    write_rich(
        pdf,
        "Same settings every time unless you have a reason to change them: **Elevate**, supermarket weeknight, everyday strategy, **~480 kcal / 40 g protein / 15 min**. Name a real dish.",
    )
    write_rich(pdf, "These hold together. Start here.")

    pdf.set_font("DejaVu", "B", 10.5)
    pdf.set_text_color(*INK)
    pdf.cell(0, 6, "Pasta — boil, keep a splash of water, toss off the heat")
    pdf.ln(7)
    for item in [
        "Fettuccine Alfredo",
        "Carbonara",
        "Mac and cheese",
        "Cacio e pepe",
        "Chicken pesto pasta",
    ]:
        bullet(pdf, item, 8)

    pdf.set_font("DejaVu", "B", 10.5)
    pdf.cell(0, 6, "Bun — toast, sear, stack")
    pdf.ln(7)
    for item in ["Cheeseburger", "Chicken sandwich", "Turkey burger"]:
        bullet(pdf, item, 8)

    pdf.set_font("DejaVu", "B", 10.5)
    pdf.cell(0, 6, "Simple protein — usually the most honest cards")
    pdf.ln(7)
    for item in [
        "Lemon-garlic chicken and broccoli",
        "Salmon with asparagus",
        "Shrimp with garlic and green beans",
    ]:
        bullet(pdf, item, 8)

    pdf.set_font("DejaVu", "B", 10.5)
    pdf.cell(0, 6, "Yogurt-sauced bowls (skip naan)")
    pdf.ln(7)
    for item in [
        "Chicken tikka masala",
        "Chicken or shrimp rice bowl (pouch or leftover rice is fine)",
    ]:
        bullet(pdf, item, 8)

    write_rich(
        pdf,
        "You can type anything. There is no blocked list. That is not the same as “everything comes back as the food you asked for.”",
    )

    heading(pdf, "What will miss (still useful to try)")
    write_rich(
        pdf,
        "The model will still write a card. Macros may look fine. The plate often will not be the craving. Keep a miss if you want Hao to see the failure; do not send it to a client as dinner.",
    )
    table(
        pdf,
        [
            ("Pizza", "No dough cook"),
            ("Tacos, burritos, wraps", "No tortilla"),
            ("Lasagna", "Treated like spaghetti"),
            ("Fried rice / a wok stir-fry", "Leftover rice can reheat; there is no wok cook yet"),
            ("Risotto, ramen, pho, sushi", "Wrong starch or no nori"),
            ("Pancakes, desserts, loaded fries", "No pastry / fry cook"),
        ],
    )
    write_rich(
        pdf,
        "A miss looks like a starch swap (burger becomes pasta, pizza becomes cauliflower) or a method that is a paragraph of verbs.",
    )

    heading(pdf, "What this is not")
    for item in [
        "Not a meal plan, grocery list, or calorie tracker",
        "Not a client login. Clients do not have accounts.",
        "Not stored in the cloud. **Kept plates live in this browser.** Clearing site data, a private window, or another phone is a new empty kitchen. Cap is 60 plates.",
        "Not a shareable link. Print or native share only.",
        "Hao cannot see what you generated unless you send it",
        "Not medical, dietetic, or clinical advice. If the client is pregnant or breastfeeding, under 18, managing a condition such as diabetes or kidney disease, or has a history of disordered eating, they need a doctor or registered dietitian before changing how they eat.",
    ]:
        bullet(pdf, item)

    heading(pdf, "How we work together")
    write_rich(
        pdf,
        "You are the filter. Elevate → read the card → cook it or throw it away → tell Hao what felt like permission and what felt like a workaround.",
    )
    write_rich(pdf, "Useful notes, in one line each:")
    for item in [
        "Client (first name is enough)",
        "Craving they actually said",
        "Settings (kcal / protein / strategy)",
        "Would you send this, cook it yourself, or bin it — and why",
    ]:
        bullet(pdf, item)
    write_rich(
        pdf,
        "The point of week one is not coverage of every cuisine. It is whether a tired client would eat the pasta, the burger, or the lemon chicken without feeling punished.",
    )

    pdf.output(str(OUT))
    print(OUT)


if __name__ == "__main__":
    build()
