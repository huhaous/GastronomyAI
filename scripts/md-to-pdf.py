#!/usr/bin/env python3
"""Render docs/STATUS-AND-ROADMAP.md as a print-ready PDF."""

from __future__ import annotations

import re
import sys
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    HRFlowable,
    ListFlowable,
    ListItem,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs" / "STATUS-AND-ROADMAP.md"
OUTPUT = ROOT / "docs" / "STATUS-AND-ROADMAP.pdf"

INK = colors.HexColor("#1a1814")
MUTED = colors.HexColor("#5c564c")
GOLD = colors.HexColor("#9a7b3c")
RULE = colors.HexColor("#d4cbb8")
ROW = colors.HexColor("#f7f3ea")
HEAD_BG = colors.HexColor("#221f1a")
CODE_BG = colors.HexColor("#efe8d8")
PAPER = colors.HexColor("#fbf7ef")

pdfmetrics.registerFont(TTFont("Body", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("Body-Bold", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"))
pdfmetrics.registerFont(TTFont("Mono", "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"))
pdfmetrics.registerFont(TTFont("Serif", "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"))
pdfmetrics.registerFont(TTFont("Serif-Bold", "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"))


def styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "Title",
            parent=base["Title"],
            fontName="Serif",
            fontSize=22,
            leading=28,
            textColor=INK,
            spaceAfter=4,
            alignment=TA_LEFT,
        ),
        "meta": ParagraphStyle(
            "Meta",
            fontName="Body",
            fontSize=9,
            leading=12,
            textColor=MUTED,
            spaceAfter=12,
        ),
        "h2": ParagraphStyle(
            "H2",
            fontName="Serif-Bold",
            fontSize=14,
            leading=18,
            textColor=INK,
            spaceBefore=16,
            spaceAfter=8,
        ),
        "h3": ParagraphStyle(
            "H3",
            fontName="Body-Bold",
            fontSize=11,
            leading=15,
            textColor=GOLD,
            spaceBefore=12,
            spaceAfter=6,
        ),
        "body": ParagraphStyle(
            "Body",
            fontName="Body",
            fontSize=9.5,
            leading=13.5,
            textColor=INK,
            spaceAfter=8,
        ),
        "cell": ParagraphStyle(
            "Cell",
            fontName="Body",
            fontSize=8,
            leading=11,
            textColor=INK,
        ),
        "cell_head": ParagraphStyle(
            "CellHead",
            fontName="Body-Bold",
            fontSize=8,
            leading=11,
            textColor=colors.HexColor("#fbf7ef"),
        ),
        "li": ParagraphStyle(
            "Li",
            fontName="Body",
            fontSize=9.5,
            leading=13.5,
            textColor=INK,
        ),
        "footer": ParagraphStyle(
            "Footer",
            fontName="Body",
            fontSize=8,
            textColor=MUTED,
        ),
    }


def inline(text: str) -> str:
    text = (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )
    text = re.sub(r"`([^`]+)`", r'<font name="Mono" size="8" color="#3d3426">\1</font>', text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"<i>\1</i>", text)
    return text


def is_table_row(line: str) -> bool:
    return line.startswith("|") and line.endswith("|")


def is_table_sep(line: str) -> bool:
    stripped = line.replace("|", "").replace("-", "").replace(":", "").replace(" ", "")
    return is_table_row(line) and stripped == "" and "-" in line


def parse_row(line: str) -> list[str]:
    return [cell.strip() for cell in line.strip().strip("|").split("|")]


def footer(canvas, doc) -> None:
    canvas.saveState()
    canvas.setFillColor(PAPER)
    canvas.rect(0, 0, A4[0], A4[1], fill=1, stroke=0)
    canvas.setStrokeColor(RULE)
    canvas.setLineWidth(0.4)
    canvas.line(18 * mm, 14 * mm, A4[0] - 18 * mm, 14 * mm)
    canvas.setFillColor(MUTED)
    canvas.setFont("Body", 8)
    canvas.drawString(18 * mm, 9 * mm, "GastronomyAI — status and roadmap")
    canvas.drawRightString(A4[0] - 18 * mm, 9 * mm, f"{doc.page}")
    canvas.restoreState()


def first_page(canvas, doc) -> None:
    footer(canvas, doc)
    canvas.saveState()
    canvas.setFillColor(GOLD)
    canvas.rect(0, A4[1] - 6 * mm, A4[0], 6 * mm, fill=1, stroke=0)
    canvas.restoreState()


def build_table(rows: list[list[str]], s: dict[str, ParagraphStyle]) -> Table:
    header, *body = rows
    data = [[Paragraph(inline(c), s["cell_head"]) for c in header]]
    data += [[Paragraph(inline(c), s["cell"]) for c in row] for row in body]
    col_w = [42 * mm, 128 * mm]
    table = Table(data, colWidths=col_w, repeatRows=1)
    style_cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), HEAD_BG),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("GRID", (0, 0), (-1, -1), 0.3, RULE),
        ("FONTNAME", (0, 0), (-1, 0), "Body-Bold"),
    ]
    for i in range(1, len(data)):
        if i % 2 == 0:
            style_cmds.append(("BACKGROUND", (0, i), (-1, i), ROW))
    table.setStyle(TableStyle(style_cmds))
    return table


def render(md: str, s: dict[str, ParagraphStyle]) -> list:
    story: list = []
    lines = md.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        if not stripped:
            i += 1
            continue

        if stripped == "---":
            story.append(Spacer(1, 4 * mm))
            story.append(HRFlowable(width="100%", thickness=0.4, color=RULE, spaceAfter=6))
            i += 1
            continue

        if stripped.startswith("# "):
            story.append(Paragraph(inline(stripped[2:]), s["title"]))
            i += 1
            continue

        if stripped.startswith("## "):
            story.append(Paragraph(inline(stripped[3:]), s["h2"]))
            i += 1
            continue

        if stripped.startswith("### "):
            story.append(Paragraph(inline(stripped[4:]), s["h3"]))
            i += 1
            continue

        if is_table_row(stripped):
            rows: list[list[str]] = []
            while i < len(lines) and is_table_row(lines[i].strip()):
                if not is_table_sep(lines[i].strip()):
                    rows.append(parse_row(lines[i].strip()))
                i += 1
            if rows:
                story.append(build_table(rows, s))
                story.append(Spacer(1, 4 * mm))
            continue

        if re.match(r"^[-*] ", stripped):
            items = []
            while i < len(lines) and re.match(r"^[-*] ", lines[i].strip()):
                items.append(
                    ListItem(Paragraph(inline(lines[i].strip()[2:]), s["li"]), leftIndent=8)
                )
                i += 1
            story.append(
                ListFlowable(
                    items,
                    bulletType="bullet",
                    start="•",
                    leftIndent=14,
                    bulletFontName="Body",
                    bulletFontSize=9,
                    spaceAfter=8,
                )
            )
            continue

        if re.match(r"^\d+\. ", stripped):
            items = []
            n = 1
            while i < len(lines) and re.match(r"^\d+\. ", lines[i].strip()):
                text = re.sub(r"^\d+\. ", "", lines[i].strip())
                items.append(ListItem(Paragraph(inline(text), s["li"]), leftIndent=8))
                i += 1
                n += 1
            story.append(
                ListFlowable(
                    items,
                    bulletType="1",
                    leftIndent=16,
                    bulletFontName="Body",
                    bulletFontSize=9,
                    spaceAfter=8,
                )
            )
            continue

        para = [stripped]
        i += 1
        while i < len(lines):
            nxt = lines[i].strip()
            if (
                not nxt
                or nxt == "---"
                or nxt.startswith("#")
                or nxt.startswith("##")
                or nxt.startswith("###")
                or re.match(r"^[-*] ", nxt)
                or re.match(r"^\d+\. ", nxt)
                or is_table_row(nxt)
            ):
                break
            para.append(nxt)
            i += 1
        story.append(Paragraph(inline(" ".join(para)), s["body"]))

    return story


def main() -> int:
    if not SOURCE.exists():
        print(f"missing {SOURCE}", file=sys.stderr)
        return 1

    s = styles()
    md = SOURCE.read_text(encoding="utf-8")
    doc = SimpleDocTemplate(
        str(OUTPUT),
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=20 * mm,
        title="GastronomyAI — status and roadmap",
        author="GastronomyAI",
        subject="Current status and planned roadmap",
    )
    story = render(md, s)
    # Date line under the title is the first body-like paragraph after title.
    if len(story) >= 2 and isinstance(story[1], Paragraph):
        first = md.splitlines()
        date_line = next((ln.strip() for ln in first if ln.startswith("Last updated")), "Last updated.")
        story[1] = Paragraph(inline(date_line), s["meta"])

    doc.build(story, onFirstPage=first_page, onLaterPages=footer)
    print(OUTPUT)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
