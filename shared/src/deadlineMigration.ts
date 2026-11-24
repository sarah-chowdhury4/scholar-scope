import { dateInZone, deadlineFromParts, type DeadlineParts } from './deadlines';

/** A deadline saved before deadlines kept their own time zone (no `date` field). */
export type LegacyDeadline = {
  utc: Date;
  sourceTimezone?: string | null;
  sourceText?: string | null;
  allDay?: boolean;
  date?: string | null;
};

/**
 * Convert one stored deadline to the current shape, or return null when it is already current.
 *  - Date-only deadlines were saved at 23:59 UTC with a zone nobody stated (the student's own zone, or "UTC"
 *    for catalog entries), so the scholarship's zone becomes "not known" and the date is kept as written.
 *  - Deadlines with a time and a real zone keep the zone; the date and time as written are filled in.
 *  - "UTC" was the old fallback when guidelines stated no zone, so it is treated as not known too.
 */
export function upgradeLegacyDeadline(old: LegacyDeadline): DeadlineParts | null {
  if (old.date) return null;
  const written = (old.sourceText ?? '').trim();
  const zone = old.sourceTimezone && old.sourceTimezone !== 'UTC' ? old.sourceTimezone : null;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(written);
  if (old.allDay !== false || dateOnly) {
    const date = dateOnly ? written : dateInZone(old.utc, zone ?? 'UTC');
    // A date-only value was never tied to a stated zone.
    return deadlineFromParts(date, null, dateOnly ? null : zone);
  }
  if (!zone) {
    return { utc: old.utc, allDay: false, sourceTimezone: null, date: dateInZone(old.utc, 'UTC'), time: old.utc.toISOString().slice(11, 16) };
  }
  const clock = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hour12: false }).format(old.utc);
  return { utc: old.utc, allDay: false, sourceTimezone: zone, date: dateInZone(old.utc, zone), time: clock };
}
