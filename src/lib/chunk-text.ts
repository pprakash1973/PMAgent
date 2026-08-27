/** Shared text-chunking utility used by both the Scope Control upload route
 *  and the project creation route so both produce identical DocumentChunk records.
 */

export interface TextChunk {
  chunkIndex: number;
  pageNumber: number;
  charStart: number;
  charEnd: number;
  sectionTitle: string | null;
  text: string;
  tokenCount: number;
}

export function chunkText(text: string): TextChunk[] {
  const CHARS_PER_PAGE = 3000;
  const TARGET_CHUNK = 500;

  const paragraphs = text.split(/\n{2,}/);
  const chunks: TextChunk[] = [];
  let chunkIndex = 0;
  let globalChar = 0;
  let currentText = "";
  let currentStart = 0;
  let currentSection: string | null = null;

  function flush() {
    const t = currentText.trim();
    if (!t) return;
    const charStart = currentStart;
    const charEnd = charStart + t.length;
    chunks.push({
      chunkIndex: chunkIndex++,
      pageNumber: Math.floor(charStart / CHARS_PER_PAGE) + 1,
      charStart,
      charEnd,
      sectionTitle: currentSection,
      text: t,
      tokenCount: Math.ceil(t.length / 4),
    });
    currentText = "";
  }

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) { globalChar += para.length + 2; continue; }

    if (
      (trimmed === trimmed.toUpperCase() && trimmed.length < 80 && /[A-Z]/.test(trimmed)) ||
      (trimmed.endsWith(":") && trimmed.length < 80)
    ) {
      flush();
      currentSection = trimmed;
      globalChar += para.length + 2;
      continue;
    }

    if (currentText.length + trimmed.length > TARGET_CHUNK) flush();

    if (!currentText) currentStart = globalChar;
    currentText += (currentText ? " " : "") + trimmed;
    globalChar += para.length + 2;
  }
  flush();
  return chunks;
}
