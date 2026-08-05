import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { ContactRecord, EventRecord } from "@/types/event";

const PAGE_WIDTH = 612; // US Letter
const PAGE_HEIGHT = 792;
const MARGIN = 44;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

/** Splits text into lines that fit within maxWidth for the given font/size. */
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

export interface PdfExportMeta {
  clientName?: string;
  filterSummary?: string;
}

/**
 * Renders the given events (with their contacts) into a paginated PDF report.
 * Returns raw PDF bytes, ready to be base64-encoded for the Iris upload or
 * streamed straight back to the browser for a local download.
 */
export async function buildEventScoutPdf(
  events: EventRecord[],
  contactsByEvent: Record<string, ContactRecord[]>,
  meta: PdfExportMeta = {}
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const textColor = rgb(0.05, 0.05, 0.08);
  const mutedColor = rgb(0.4, 0.4, 0.45);
  const accentColor = rgb(0.69, 0.53, 0.24); // Project ICON gold

  let page: PDFPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  function newPage() {
    page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;
  }

  function ensureSpace(height: number) {
    if (y - height < MARGIN) newPage();
  }

  function drawLine(text: string, opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; gapAfter?: number } = {}) {
    const size = opts.size ?? 10;
    const usedFont = opts.bold ? boldFont : font;
    const color = opts.color ?? textColor;
    const lines = wrapText(text, usedFont, size, CONTENT_WIDTH);
    for (const line of lines) {
      ensureSpace(size + 4);
      page.drawText(line, { x: MARGIN, y, size, font: usedFont, color });
      y -= size + 4;
    }
    if (opts.gapAfter) y -= opts.gapAfter;
  }

  // Header
  drawLine("Event Scout Export", { size: 20, bold: true, color: accentColor, gapAfter: 4 });
  const generatedAt = new Date().toISOString().slice(0, 19).replace("T", " ") + " UTC";
  drawLine(`Generated ${generatedAt}`, { size: 9, color: mutedColor });
  if (meta.clientName) drawLine(`Prepared for: ${meta.clientName}`, { size: 9, color: mutedColor });
  if (meta.filterSummary) drawLine(`Filters: ${meta.filterSummary}`, { size: 9, color: mutedColor });
  drawLine(`${events.length} event${events.length === 1 ? "" : "s"}`, { size: 9, color: mutedColor, gapAfter: 12 });

  if (events.length === 0) {
    drawLine("No events matched the current filters.", { size: 11 });
  }

  for (const event of events) {
    ensureSpace(60);
    // separator
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_WIDTH - MARGIN, y },
      thickness: 0.5,
      color: rgb(0.85, 0.85, 0.85),
    });
    y -= 10;

    drawLine(event.event_name, { size: 13, bold: true, gapAfter: 2 });

    const metaLine = [event.sector, event.status, event.visibility_tier ? `Tier ${event.visibility_tier}` : null]
      .filter(Boolean)
      .join("  ·  ");
    if (metaLine) drawLine(metaLine, { size: 9, color: mutedColor, gapAfter: 2 });

    const dateLine = event.date_notes || event.event_start || null;
    const location = [event.city, event.state_country].filter(Boolean).join(", ");
    const whenWhere = [dateLine, location].filter(Boolean).join("  ·  ");
    if (whenWhere) drawLine(whenWhere, { size: 9.5, gapAfter: 2 });

    if (event.best_client_fit) drawLine(`Best fit: ${event.best_client_fit}`, { size: 9.5, gapAfter: 2 });
    if (event.booking_path) drawLine(`Booking: ${event.booking_path}`, { size: 9.5, gapAfter: 2 });
    if (event.source_url) drawLine(`Source: ${event.source_url}`, { size: 9, color: mutedColor, gapAfter: 2 });

    const contacts = contactsByEvent[event.id] ?? [];
    if (contacts.length > 0) {
      drawLine("Contacts:", { size: 9.5, bold: true, gapAfter: 1 });
      for (const c of contacts) {
        const parts = [c.name ?? "Unnamed", c.title, c.email, c.phone].filter(Boolean);
        drawLine(`  • ${parts.join(" — ")}`, { size: 9 });
      }
    }

    y -= 8;
  }

  return pdfDoc.save();
}

export function sanitizeFilenamePart(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
