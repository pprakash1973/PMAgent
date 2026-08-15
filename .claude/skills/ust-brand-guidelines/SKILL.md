---
name: ust-brand-guidelines
description: Applies UST Global's official brand colors and typography to PowerPoint presentations and Word documents. Use this skill — triggered by /brand — whenever creating or editing any UST deliverable: pitch decks, proposals, PMO reports, CXO presentations, Word documents, or any output that should follow UST brand standards. Also trigger when the user mentions "UST brand", "UST colors", "UST template", "brand guidelines", "on-brand", or asks for UST-styled output. This skill is mandatory for all UST client-facing and internal deliverables.
---

# UST Brand Guidelines

Slash command: `/brand`

Use this skill for **all** UST Global deliverables — presentations, Word docs, Excel workbooks, and any visual artifact representing UST.

---

## Color Palette

### Primary Colors

| Name | R | G | B | Hex | Usage |
|------|---|---|---|-----|-------|
| **Dark Teal** | 0 | 110 | 116 | `#006E74` | Primary brand color — titles, headers, key shapes, hyperlinks |
| **Light Teal** | 0 | 151 | 172 | `#0097AC` | Secondary brand color — accents, highlights, icons |
| **Soft Black** | 35 | 31 | 32 | `#231F20` | Body text, dark backgrounds |
| **White** | 255 | 255 | 255 | `#FFFFFF` | Backgrounds, text on dark |

### Secondary Colors

| Name | R | G | B | Hex | Usage |
|------|---|---|---|-----|-------|
| **Purple** | 136 | 30 | 135 | `#881E87` | Accent — use sparingly |
| **Green** | 1 | 178 | 124 | `#01B27C` | Positive indicators, success states |
| **Petrol** | 0 | 60 | 81 | `#003C51` | Dark accent, depth |
| **Dark Gray** | 122 | 116 | 128 | `#7A7480` | Secondary text, de-emphasized content |
| **Orange** | 252 | 106 | 89 | `#FC6A59` | Alerts, call-outs, RAG Red equivalent |
| **Dark Sand** | 219 | 211 | 189 | `#DBD3BD` | Subtle backgrounds, dividers |

### Color Washes (Backgrounds)

| Name | R | G | B | Hex | Usage |
|------|---|---|---|-----|-------|
| **Light Gray Wash** | 242 | 247 | 248 | `#F2F7F8` | Slide/page backgrounds, table alternates |
| **Mid Gray Wash** | 215 | 224 | 227 | `#D7E0E3` | Section backgrounds |
| **Dark Gray Wash** | 194 | 188 | 190 | `#C2BCBE` | Subtle dividers, borders |
| **Sand** | 236 | 236 | 225 | `#ECECEL` | Warm background alternative |

---

## Typography

UST uses **Aptos** exclusively. Fall back to **Calibri** if Aptos is unavailable.

| Variant | Weight | Usage |
|---------|--------|-------|
| **Aptos Light** | Light (300) | Body text, paragraph copy |
| **Aptos Light Bold** | Semi-bold | Emphasis within body copy, sub-labels |
| **Aptos Bold** | Bold (700) | Slide titles, section headers, key callouts |

### Typography Rules

- **Body text**: 18pt or 16pt. Never smaller than 8pt. Always Soft Black (`#231F20`) or White.
- **Hyperlinks**: Dark Teal (`#006E74`), underlined.
- **Titles & subtitles**: Sentence case — only capitalize words that require it. No trailing periods.
- **Bullets**: No period at end unless multiple complete sentences. Always period at footnotes.
- **Footnotes**: Aptos Light 8pt.

---

## Application by Document Type

### PowerPoint Presentations

**Slide structure:**
- **Title slides**: Dark Teal (`#006E74`) or Soft Black background; White title text in Aptos Bold.
- **Content slides**: White or Light Gray Wash (`#F2F7F8`) background; Dark Teal titles; Soft Black body.
- **Section dividers**: Dark Teal or Petrol background with White text — creates a "sandwich" with title/content.
- **Footer**: "Confidential and Proprietary. © [Year] UST Global Inc" in Soft Black, Aptos Light 8pt.
- **UST logo**: Bottom-left on all slides.

**Charts and graphics:**
- Use the six secondary colors (Purple, Green, Petrol, Dark Gray, Orange, Dark Sand) for chart series — in that order.
- Color washes for chart backgrounds or table alternating rows.
- Avoid gradients; use solid fills.

**python-pptx color reference:**
```python
from pptx.util import Pt
from pptx.dml.color import RGBColor

# Primary palette
DARK_TEAL   = RGBColor(0,   110, 116)
LIGHT_TEAL  = RGBColor(0,   151, 172)
SOFT_BLACK  = RGBColor(35,   31,  32)
WHITE       = RGBColor(255, 255, 255)

# Secondary palette
PURPLE      = RGBColor(136,  30, 135)
GREEN       = RGBColor(1,   178, 124)
PETROL      = RGBColor(0,    60,  81)
DARK_GRAY   = RGBColor(122, 116, 128)
ORANGE      = RGBColor(252, 106,  89)
DARK_SAND   = RGBColor(219, 211, 189)

# Washes
LIGHT_GRAY_WASH = RGBColor(242, 247, 248)
MID_GRAY_WASH   = RGBColor(215, 224, 227)
SAND            = RGBColor(236, 236, 225)

# Font helper
FONT_PRIMARY  = "Aptos"
FONT_FALLBACK = "Calibri"
```

**pptxgenjs color reference:**
```javascript
// Primary
const DARK_TEAL  = "006E74";
const LIGHT_TEAL = "0097AC";
const SOFT_BLACK = "231F20";
const WHITE      = "FFFFFF";

// Secondary
const PURPLE     = "881E87";
const GREEN      = "01B27C";
const PETROL     = "003C51";
const DARK_GRAY  = "7A7480";
const ORANGE     = "FC6A59";
const DARK_SAND  = "DBD3BD";

// Washes
const LIGHT_GRAY_WASH = "F2F7F8";
const MID_GRAY_WASH   = "D7E0E3";
const SAND            = "ECECEL";

// Font
const FONT = "Aptos";  // fallback: "Calibri"
```

---

### Word Documents

- **Heading 1**: Aptos Bold, Dark Teal (`#006E74`), 18pt
- **Heading 2**: Aptos Bold, Soft Black (`#231F20`), 14pt
- **Body**: Aptos Light, Soft Black (`#231F20`), 11pt
- **Tables**: Header row — Dark Teal fill with White text; alternating rows — Light Gray Wash (`#F2F7F8`) and White.
- **Hyperlinks**: Dark Teal, underlined.
- **Page footer**: "Confidential and Proprietary. © [Year] UST Global Inc" | Aptos Light 8pt.

**python-docx style reference:**
```python
from docx.shared import Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH

def apply_ust_heading1(run):
    run.font.name = "Aptos"
    run.font.bold = True
    run.font.size = Pt(18)
    run.font.color.rgb = RGBColor(0, 110, 116)  # Dark Teal

def apply_ust_body(run):
    run.font.name = "Aptos"
    run.font.bold = False
    run.font.size = Pt(11)
    run.font.color.rgb = RGBColor(35, 31, 32)  # Soft Black

def apply_ust_table_header(cell):
    cell._tc.get_or_add_tcPr()  # ensure formatting
    # Fill: Dark Teal
    # Text: White, Aptos Bold 11pt
```

---

## RAG Status Color Mapping

Use UST brand colors for RAG indicators:

| Status | Color | Hex |
|--------|-------|-----|
| 🟢 Green (On Track) | Green | `#01B27C` |
| 🟡 Amber (At Risk) | Dark Sand / Orange-tinted | `#DBD3BD` → use Orange at 50% |
| 🔴 Red (Off Track) | Orange | `#FC6A59` |
| ⚪ Not Started | Dark Gray Wash | `#C2BCBE` |

---

## Quick Application Checklist

Before finalising any UST deliverable, confirm:

- [ ] Titles use Dark Teal (`#006E74`) or White on dark backgrounds
- [ ] Body text is Soft Black (`#231F20`) or White — nothing else
- [ ] Font is Aptos (or Calibri fallback) throughout
- [ ] Charts use the six secondary colors in order
- [ ] Hyperlinks are Dark Teal and underlined
- [ ] Footer includes "Confidential and Proprietary. © [Year] UST Global Inc"
- [ ] UST logo present on title slide / document header
- [ ] Sentence case on all titles — no trailing periods

---

## Design Principles

1. **Dominance**: Dark Teal is the hero color — give it the most visual weight (titles, headers, key shapes).
2. **Contrast**: Use Light Gray Wash backgrounds for content slides; dark slides (Dark Teal/Petrol) only for title and section dividers.
3. **Restraint**: Use secondary colors purposefully — max 3 colors per slide/page outside of charts.
4. **Consistency**: Same header treatment, same footer, same logo placement across all slides/pages.
