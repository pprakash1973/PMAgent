/**
 * Robust PDF text extraction.
 *
 * Primary engine: pdfjs-dist/legacy — tolerant of malformed cross-reference
 * tables (it rebuilds the XRef index instead of throwing "bad XRef entry"),
 * and reconstructs table reading order by grouping text items into rows.
 *
 * Fallback engine: pdf-parse (pinned 1.1.1) — a different codebase that
 * occasionally succeeds on files pdfjs rejects, and vice-versa.
 *
 * If both fail the caller gets a human-readable message, never a raw parser
 * internal like "bad XRef entry".
 */

const PDF_UNREADABLE =
  "This PDF could not be read — it may be corrupted, password-protected, or a scanned image with no text layer. " +
  "Try re-saving/exporting it as a fresh PDF, or upload a DOCX or TXT version instead.";

/**
 * pdfjs-dist extraction with row-structure preservation.
 * pdfjs returns text items in content-stream order (often column-scrambled for
 * tables); we regroup items with similar y-positions into rows, sort each row by
 * x, then sort rows top-to-bottom so every table row becomes one contiguous line.
 */
async function extractWithPdfjs(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfjs = require("pdfjs-dist/legacy/build/pdf.js");
  pdfjs.GlobalWorkerOptions.workerSrc = "";
  // stopAtErrors:false lets pdfjs recover a rebuilt XRef instead of aborting.
  const pdfDoc = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    stopAtErrors: false,
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise;

  const allLines: string[] = [];
  for (let p = 1; p <= pdfDoc.numPages; p++) {
    const page = await pdfDoc.getPage(p);
    const content = await page.getTextContent();
    const items: any[] = (content.items as any[]).filter((it) => it.str?.trim());

    const rows: { y: number; cells: { x: number; str: string }[] }[] = [];
    for (const item of items) {
      const y = item.transform[5] as number;
      const x = item.transform[4] as number;
      const row = rows.find((r) => Math.abs(r.y - y) <= 3);
      if (row) row.cells.push({ x, str: item.str });
      else rows.push({ y, cells: [{ x, str: item.str }] });
    }
    rows.sort((a, b) => b.y - a.y); // PDF y=0 is bottom of page
    for (const row of rows) {
      row.cells.sort((a, b) => a.x - b.x);
      allLines.push(row.cells.map((c) => c.str).join(" "));
    }
  }
  return allLines.join("\n");
}

async function extractWithPdfParse(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require("pdf-parse/lib/pdf-parse");
  const result = await pdfParse(buffer);
  return result.text ?? "";
}

/**
 * Extract text from a PDF buffer, trying pdfjs first, then pdf-parse.
 * Throws an Error with a friendly message if both engines fail.
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  let pdfjsErr: unknown = null;
  try {
    const text = await extractWithPdfjs(buffer);
    if (text.trim()) return text;
  } catch (e) {
    pdfjsErr = e;
  }

  // Fallback engine
  try {
    const text = await extractWithPdfParse(buffer);
    if (text.trim()) return text;
  } catch (e) {
    console.warn("PDF extraction failed on both engines:", { pdfjs: (pdfjsErr as any)?.message, pdfParse: (e as any)?.message });
  }

  throw new Error(PDF_UNREADABLE);
}
