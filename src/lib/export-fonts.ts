import type ExcelJS from "exceljs";

/**
 * Brand typography for generated artifacts.
 *
 * Aptos Display for headings, Aptos for body — matching the on-screen stack in
 * globals.css so a PM sees the same type whether they read an artifact in the
 * app, export it to Word/Excel/PowerPoint, or print it.
 *
 * Fallbacks matter: Aptos ships with Microsoft 365 and Windows 11, so older
 * Office installs need the classic pair (Calibri Light / Calibri) rather than
 * silently dropping to Times New Roman.
 */
export const FONT_HEADING = "Aptos Display";
export const FONT_BODY = "Aptos";

/** Office falls back per-name, so the fallback is what Office used before Aptos. */
export const FONT_HEADING_FALLBACK = "Calibri Light";
export const FONT_BODY_FALLBACK = "Calibri";

/** CSS stacks for on-screen and print rendering. */
export const CSS_HEADING_STACK = `'Aptos Display', 'Calibri Light', 'Aptos', 'Calibri', system-ui, sans-serif`;
export const CSS_BODY_STACK = `'Aptos', 'Calibri', system-ui, -apple-system, sans-serif`;

/**
 * Stamps the brand fonts onto every cell of an ExcelJS workbook.
 *
 * Call immediately before writing the buffer. Each exporter styles cells with
 * its own local helpers and none of them set `name`, so rather than touching
 * every `cell.font` assignment we normalise once at the end — existing bold,
 * colour and size are preserved.
 *
 * Bold cells (headers, totals, section rows) get the display face; everything
 * else gets body.
 */
export function applyWorkbookFonts(wb: ExcelJS.Workbook): void {
  wb.eachSheet((ws) => {
    ws.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        const existing = cell.font ?? {};
        cell.font = { ...existing, name: existing.bold ? FONT_HEADING : FONT_BODY };
      });
    });
  });
}
