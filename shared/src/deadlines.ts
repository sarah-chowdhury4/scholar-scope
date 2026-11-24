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
 * Which deadline alert (14/7/3/1 days before, and on the day; FR-7.1) is due today, if any.
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

/** How many days late a missed reminder may still go out (covers a weekend with the worker switched off). */
export const MAX_REMINDER_DELAY_DAYS = 3;

/**
 * The reminder to send now, catching up on a missed day. The latest reminder day that has arrived (the smallest
 * offset that is not below the days left) is due, as long as it arrived at most MAX_REMINDER_DELAY_DAYS ago.
 * So if the job did not run 7 days before, it still sends that reminder the next time it runs, 6 days before,
 * saying "6 days". Older missed reminders are not sent: only the most recent one is useful. Each reminder is
 * stored under its offset, so the regular run and a catch-up can never both send it.
 */
export function dueDeadlineReminder(
  deadline: Date,
  now: Date,
  timeZone: string,
  offsets: number[],
): { offset: number; daysLeft: number } | null {
  const daysLeft = daysUntil(deadline, now, timeZone);
  if (daysLeft < 0) return null;
  const arrived = offsets.filter((o) => o >= daysLeft);
  if (arrived.length === 0) return null;
  const offset = Math.min(...arrived);
  return offset - daysLeft <= MAX_REMINDER_DELAY_DAYS ? { offset, daysLeft } : null;
}

/** Subject of a deadline reminder: "… is due today", "… is due tomorrow" or "… is due in N days". */
export function deadlineAlertTitle(name: string, offsetDays: number): string {
  if (offsetDays === 0) return `${name} is due today`;
  if (offsetDays === 1) return `${name} is due tomorrow`;
  return `${name} is due in ${offsetDays} days`;
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

/**
 * A deadline as stored on a scholarship or a requirement.
 * The deadline belongs to the scholarship's time zone, not the student's:
 *   sourceTimezone  IANA zone the scholarship states ("America/New_York"), or null when nobody knows it
 *   date / time     the deadline as written, in that zone ("2027-03-01", "23:59" or null for end of day)
 *   utc             the exact moment, used for sorting, reminders and calendars
 * With no known zone, `utc` is the EARLIEST moment the date could end anywhere (end of day at UTC+14),
 * so reminders are never late; pages then show the date as written and say the time zone is not confirmed.
 */
export type DeadlineParts = {
  utc: Date;
  allDay: boolean;
  sourceTimezone: string | null;
  date: string;
  time: string | null;
};

const EARLIEST_OFFSET_MS = 14 * 60 * 60 * 1000;

function validZone(timeZone: string | null | undefined): string | null {
  if (!timeZone) return null;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return timeZone;
  } catch {
    return null;
  }
}

/** Date (YYYY-MM-DD), optional time (HH:MM) and optional zone → stored deadline. Null if the date is invalid. */
export function deadlineFromParts(date: string, time: string | null | undefined, timeZone: string | null | undefined): DeadlineParts | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null;
  const clock = time && /^\d{2}:\d{2}$/.test(time) ? time : null;
  const zone = validZone(timeZone);
  if (!zone) {
    const utc = new Date(Date.UTC(y, m - 1, d, 23, 59, 59) - EARLIEST_OFFSET_MS);
    return { utc, allDay: !clock, sourceTimezone: null, date, time: clock };
  }
  const parsed = parseSourceDeadline(clock ? `${date}T${clock}` : date, zone);
  return parsed ? { utc: parsed.utc, allDay: parsed.allDay, sourceTimezone: zone, date, time: clock } : null;
}

/** A deadline read from a source ("2026-12-01", "2026-12-01T17:00", "2026-12-01T17:00:00-05:00") and the zone it states, if any. */
export function deadlineFromSource(iso: string, timeZone: string | null | undefined): DeadlineParts | null {
  const value = iso.trim();
  const date = value.slice(0, 10);
  const zone = validZone(timeZone);
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(value) && value.length > 10) {
    const utc = new Date(value);
    if (Number.isNaN(utc.getTime())) return null;
    // The text names its own offset: keep the wall-clock date and time as written.
    return { utc, allDay: false, sourceTimezone: zone, date, time: value.slice(11, 16) };
  }
  const time = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) ? value.slice(11, 16) : null;
  return deadlineFromParts(date, time, zone);
}

/** The calendar date of a moment in a time zone, as YYYY-MM-DD. */
export function dateInZone(moment: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(moment);
}

/**
 * A deadline in words for emails, in the student's zone, with the scholarship's own time when it differs.
 *   "Tuesday, March 2, 2027 at 10:59 AM (your time); that is Monday, March 1, 2027 at 11:59 PM in New York"
 *   "Monday, March 1, 2027 (the scholarship's time zone is not confirmed)"
 */
export function deadlineSentence(
  d: { utc: Date; sourceTimezone: string | null; date?: string | null; time?: string | null },
  studentZone: string,
): string {
  if (!d.sourceTimezone) {
    const date = d.date ?? d.utc.toISOString().slice(0, 10);
    const written = new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
    return `${written}${d.time ? ` at ${d.time}` : ''} (the scholarship's time zone is not confirmed)`;
  }
  const say = (zone: string) => new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeStyle: 'short', timeZone: zone }).format(d.utc);
  const mine = say(studentZone);
  const theirs = say(d.sourceTimezone);
  if (mine === theirs) return mine;
  const place = (d.sourceTimezone.split('/').pop() ?? d.sourceTimezone).replace(/_/g, ' ');
  return `${mine} (your time); that is ${theirs} in ${place}`;
}

/**
 * Whether an extracted deadline is the application deadline (the one the scholarship's date should show),
 * rather than another date on the page: finalist steps, interviews, award letters, results, info sessions.
 */
export function isApplicationDeadline(label: string): boolean {
  const text = label.toLowerCase();
  if (/finalist|semi-?final|interview|award letter|notif|announce|result|decision|selection|winner|recipient|webinar|info(rmation)? session|opens?\b|open date|start|orientation|disburse|enrol|college choice|acceptance|confirm/.test(text)) {
    return false;
  }
  return /application|apply|submi|due|deadline|closes?|closing/.test(text);
}

/**
 * Pick the scholarship's deadline from the dates read off a page: application deadlines only, the next one
 * still ahead (a page may list rounds), or the last one when all have passed.
 */
export function pickApplicationDeadline<T extends { label: string; deadline: DeadlineParts }>(items: T[], now = new Date()): T | null {
  const candidates = items.filter((i) => isApplicationDeadline(i.label)).sort((a, b) => a.deadline.utc.getTime() - b.deadline.utc.getTime());
  return candidates.find((i) => i.deadline.utc.getTime() >= now.getTime()) ?? candidates[candidates.length - 1] ?? null;
}
