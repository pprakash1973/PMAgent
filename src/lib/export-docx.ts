import {
  Document, Packer, Paragraph, Table, TableRow, TableCell,
  TextRun, HeadingLevel, AlignmentType, WidthType, BorderStyle,
  ShadingType, convertInchesToTwip,
} from "docx";

const BLUE = "1E3A8A";
const LIGHT_BLUE = "DBEAFE";
const GRAY_BG = "F8FAFC";

function safeStr(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function heading(text: string, level: typeof HeadingLevel[keyof typeof HeadingLevel] = HeadingLevel.HEADING_1) {
  return new Paragraph({
    text,
    heading: level,
    spacing: { before: 240, after: 120 },
    border: level === HeadingLevel.HEADING_1 ? { bottom: { style: BorderStyle.SINGLE, color: BLUE, size: 8 } } : undefined,
  });
}

function para(text: string, bold = false, color?: string) {
  return new Paragraph({
    children: [new TextRun({ text, bold, color, size: 22 })],
    spacing: { after: 80 },
  });
}

function bullet(text: string) {
  return new Paragraph({
    children: [new TextRun({ text, size: 22 })],
    bullet: { level: 0 },
    spacing: { after: 60 },
  });
}

function fieldRow(label: string, value: string) {
  return new Paragraph({
    children: [
      new TextRun({ text: `${label}: `, bold: true, size: 22, color: "374151" }),
      new TextRun({ text: value, size: 22 }),
    ],
    spacing: { after: 80 },
  });
}

function dataTable(headers: string[], rows: string[][]): Table {
  const headerCells = headers.map((h) =>
    new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, color: "FFFFFF", size: 20 })] })],
      shading: { fill: BLUE, type: ShadingType.CLEAR, color: "auto" },
      margins: { top: 60, bottom: 60, left: 80, right: 80 },
    })
  );

  const dataRows = rows.map((row, ri) =>
    new TableRow({
      children: row.map((cell) =>
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: cell, size: 20 })] })],
          shading: { fill: ri % 2 === 0 ? "FFFFFF" : GRAY_BG, type: ShadingType.CLEAR, color: "auto" },
          margins: { top: 60, bottom: 60, left: 80, right: 80 },
        })
      ),
    })
  );

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({ children: headerCells, tableHeader: true }), ...dataRows],
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
  });
}

function spacer() {
  return new Paragraph({ text: "", spacing: { after: 160 } });
}

// ── builders ──────────────────────────────────────────────────────────────────

function buildGenericDoc(title: string, content: any): (Paragraph | Table)[] {
  const children: (Paragraph | Table)[] = [
    heading(title),
    spacer(),
  ];

  function addValue(key: string, value: unknown, depth: number) {
    const label = key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
    if (value == null) return;

    if (Array.isArray(value)) {
      if (value.length === 0) return;
      children.push(heading(label, depth === 0 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3));
      if (typeof value[0] === "object" && value[0] !== null) {
        const keys = Object.keys(value[0] as object).filter((k) => k !== "id");
        children.push(dataTable(
          keys.map((k) => k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())),
          (value as Record<string, unknown>[]).map((row) => keys.map((k) => safeStr(row[k])))
        ));
      } else {
        for (const item of value) children.push(bullet(safeStr(item)));
      }
      children.push(spacer());
    } else if (typeof value === "object") {
      children.push(heading(label, depth === 0 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3));
      for (const [k, v] of Object.entries(value as object)) {
        if (typeof v === "string" || typeof v === "number") {
          children.push(fieldRow(k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()), safeStr(v)));
        } else {
          addValue(k, v, depth + 1);
        }
      }
      children.push(spacer());
    } else {
      children.push(fieldRow(label, safeStr(value)));
    }
  }

  for (const [key, value] of Object.entries(content)) {
    addValue(key, value, 0);
  }

  return children;
}

// ── main dispatcher ───────────────────────────────────────────────────────────

export async function buildDocx(artifactType: string, content: any): Promise<Buffer> {
  const title = artifactType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const children = buildGenericDoc(title, content);

  const doc = new Document({
    styles: {
      default: {
        heading1: { run: { bold: true, color: BLUE, size: 28 }, paragraph: { spacing: { before: 240, after: 120 } } },
        heading2: { run: { bold: true, color: "1E40AF", size: 24 }, paragraph: { spacing: { before: 200, after: 80 } } },
        heading3: { run: { bold: true, color: "374151", size: 22 }, paragraph: { spacing: { before: 160, after: 60 } } },
      },
    },
    sections: [{
      properties: {
        page: {
          margin: {
            top: convertInchesToTwip(1),
            bottom: convertInchesToTwip(1),
            left: convertInchesToTwip(1.2),
            right: convertInchesToTwip(1.2),
          },
        },
      },
      children,
    }],
  });

  return Packer.toBuffer(doc);
}
