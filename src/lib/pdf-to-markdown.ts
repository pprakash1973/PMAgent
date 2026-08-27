/**
 * Converts a PDF buffer to a Markdown string using pdfjs-dist.
 *
 * Extracts text items with their Y-coordinate and font-size metadata, then:
 *   - groups items at the same Y position into a single line
 *   - classifies lines as h2 / h3 / body based on font-size ratio to the median
 *   - inserts blank lines at paragraph breaks (Y gap > 2× line height)
 *
 * This produces structured Markdown that chunk-text.ts can split at heading
 * boundaries, giving semantically coherent chunks for RAG retrieval.
 *
 * Only used when pdf-parse fails (e.g. "Command token too long" from
 * InDesign/PostScript-exported PDFs).  pdfjs-dist@3.11.174 is the last
 * CommonJS-compatible version, already in serverExternalPackages.
 */

const Y_BAND = 3; // points — items within this range are on the same line

interface RawLine {
  text: string;
  size: number; // font size in points
  y: number;    // PDF Y coordinate (0 = bottom of page)
  page: number;
}

export async function pdfToMarkdown(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfjs = require("pdfjs-dist/legacy/build/pdf.js");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), verbosity: 0 }).promise;

  const rawLines: RawLine[] = [];

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();

    // Group items by rounded Y coordinate so items on the same visual line merge.
    const yMap = new Map<number, Array<{ str: string; x: number; size: number }>>();

    for (const raw of content.items as any[]) {
      const str = (raw.str ?? "").replace(/\s+/g, " ").trim();
      if (!str) continue;

      // height is the font size in PDF points; fall back to the transform scale
      const size = raw.height > 0
        ? raw.height
        : Math.abs(raw.transform?.[3] || raw.transform?.[0] || 12);

      const x = raw.transform[4] as number;
      const y = raw.transform[5] as number;
      const band = Math.round(y / Y_BAND) * Y_BAND;

      if (!yMap.has(band)) yMap.set(band, []);
      yMap.get(band)!.push({ str, x, size });
    }

    // Sort bands descending (PDF Y=0 is bottom, so higher Y = higher on page)
    const bands = Array.from(yMap.keys()).sort((a, b) => b - a);

    for (const band of bands) {
      const items = yMap.get(band)!.sort((a, b) => a.x - b.x);
      const text = items.map(i => i.str).join(" ").replace(/\s+/g, " ").trim();
      const size = Math.max(...items.map(i => i.size));
      if (text) rawLines.push({ text, size, y: band, page: pageNum });
    }
  }

  if (!rawLines.length) return "";

  // Compute median font size across all lines — this is the body text size.
  const sortedSizes = rawLines.map(l => l.size).filter(s => s > 2).sort((a, b) => a - b);
  const median = sortedSizes[Math.floor(sortedSizes.length / 2)] || 12;

  // Classify and emit markdown.
  const parts: string[] = [];
  let prevPage = 0;
  let prevY = -1;
  let prevSize = median;

  for (let i = 0; i < rawLines.length; i++) {
    const { text, size, y, page } = rawLines[i];
    const ratio = size / median;

    // Page transition — add a blank line (avoids joining last line of one
    // page with first line of the next into the same paragraph)
    if (page !== prevPage) {
      if (prevPage > 0) parts.push("");
      prevPage = page;
    } else {
      // Paragraph break within a page: Y gap larger than 2× the previous line height
      const yGap = prevY - y;
      if (prevY >= 0 && yGap > prevSize * 2) parts.push("");
    }

    const isAllCaps = text.length < 120 && /[A-Z]/.test(text) && text === text.toUpperCase();
    const isHeading = ratio > 1.25 || (isAllCaps && size >= median * 0.85);

    if (isHeading) {
      // Wrap heading with blank lines so chunk-text sees a clean section boundary
      if (parts.length && parts[parts.length - 1] !== "") parts.push("");
      const marker = ratio > 1.55 ? "##" : "###";
      parts.push(`${marker} ${text}`);
      parts.push("");
    } else {
      parts.push(text);
    }

    prevY = y;
    prevSize = size;
  }

  // Collapse runs of blank lines to a single blank line
  return parts.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
