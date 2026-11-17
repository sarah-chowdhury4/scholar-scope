/**
 * Calendar (ICS, RFC 5545) and spreadsheet (CSV, RFC 4180) exports (FR-7.3).
 * Pure functions so they are tested without Firestore.
 */

export type CalendarDeadline = {
  /** Stable id so re-importing updates the event instead of duplicating it. */
  uid: string;
  title: string;
  description: string;
  url: string | null;
  due: Date;
  /** All-day events use `date` (YYYY-MM-DD as written); timed events use `due`. */
  allDay: boolean;
  date?: string | null;
};

function icsEscape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Fold lines longer than 75 octets (continuation lines start with a space). */
function fold(line: string): string {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  let size = 0;
  for (const ch of line) {
    const len = Buffer.byteLength(ch, 'utf8');
    const max = parts.length === 0 ? 75 : 74;
    if (size + len > max) {
      parts.push(current);
      current = '';
      size = 0;
    }
    current += ch;
    size += len;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

function utcStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

export function buildIcs(deadlines: CalendarDeadline[], now = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ScholarScope//Scholarship deadlines//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Scholarship deadlines',
  ];
  for (const item of deadlines) {
    lines.push('BEGIN:VEVENT', `UID:${item.uid}@scholarscope`, `DTSTAMP:${utcStamp(now)}`);
    if (item.allDay) {
      const day = item.date ? new Date(`${item.date}T00:00:00Z`) : item.due;
      const next = new Date(day.getTime() + 24 * 60 * 60 * 1000);
      lines.push(`DTSTART;VALUE=DATE:${dateOnly(day)}`, `DTEND;VALUE=DATE:${dateOnly(next)}`);
    } else {
      lines.push(`DTSTART:${utcStamp(item.due)}`, `DTEND:${utcStamp(item.due)}`);
    }
    lines.push(`SUMMARY:${icsEscape(item.title)}`, `DESCRIPTION:${icsEscape(item.description)}`);
    if (item.url) lines.push(`URL:${item.url}`);
    for (const days of [7, 1]) {
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(item.title)}`, `TRIGGER:-P${days}D`, 'END:VALARM');
    }
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

/**
 * One CSV cell. Cells that a spreadsheet would run as a formula (=, +, -, @, tab, CR) get a leading
 * apostrophe, because scholarship text comes from outside documents.
 */
export function csvCell(value: unknown): string {
  let text = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildCsv(rows: unknown[][]): string {
  // BOM so Excel opens UTF-8 correctly.
  return '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
