const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole calendar days from `now` to `deadline`, counted in the student's time zone. */
export function daysUntil(deadline: Date, now: Date, timeZone: string): number {
  const dayKey = (d: Date) => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d); // YYYY-MM-DD
    return Date.parse(`${parts}T00:00:00Z`);
  };
  return Math.round((dayKey(deadline) - dayKey(now)) / DAY_MS);
}

/**
 * Which deadline alert (14/7/3/1 days, FR-7.1) is due today, if any.
 * Runs once a day, so exactly one offset can match.
 */
export function dueDeadlineAlert(
  deadline: Date,
  now: Date,
  timeZone: string,
  offsets: number[],
): number | null {
  const days = daysUntil(deadline, now, timeZone);
  return offsets.includes(days) ? days : null;
}

/** Stable key so a retried job never sends the same alert twice. */
export function deadlineDedupeKey(scholarshipId: string, offsetDays: number, deadline: Date): string {
  return `deadline_${offsetDays}:${scholarshipId}:${deadline.toISOString().slice(0, 10)}`;
}

/** Offset of `timeZone` from UTC at `date`, in minutes (e.g. America/New_York in winter → -300). */
export function timeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const name =
    new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
      .formatToParts(date)
      .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name);
  if (!m) return 0;
  const minutes = Number(m[2]) * 60 + Number(m[3] ?? 0);
  return m[1] === '-' ? -minutes : minutes;
}

/**
 * Turn a deadline as stated in a source into a UTC instant (FR-1.5).
 *   "2026-12-01"                      → end of that day in the source time zone, allDay
 *   "2026-12-01T17:00"                → that wall-clock time in the source time zone
 *   "2026-12-01T17:00:00-05:00"/"…Z"  → the instant as written
 * Returns null if the text is not a valid ISO date.
 */
export function parseSourceDeadline(iso: string, timeZone = 'UTC'): { utc: Date; allDay: boolean } | null {
  const value = iso.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const utc = zonedTimeToUtc(`${value}T23:59:59`, timeZone);
    return utc ? { utc, allDay: true } : null;
  }
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(value)) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : { utc: d, allDay: false };
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) {
    const utc = zonedTimeToUtc(value.length === 16 ? `${value}:00` : value, timeZone);
    return utc ? { utc, allDay: false } : null;
  }
  return null;
}

function zonedTimeToUtc(local: string, timeZone: string): Date | null {
  const asUtc = new Date(`${local}Z`);
  if (Number.isNaN(asUtc.getTime())) return null;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
  } catch {
    return null; // unknown time zone name
  }
  // Two passes handle dates near a daylight-saving change.
  let utc = new Date(asUtc.getTime() - timeZoneOffsetMinutes(asUtc, timeZone) * 60_000);
  utc = new Date(asUtc.getTime() - timeZoneOffsetMinutes(utc, timeZone) * 60_000);
  return utc;
}
