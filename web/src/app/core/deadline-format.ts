/**
 * How a deadline is shown to a student.
 * A deadline belongs to the scholarship's time zone. The student sees it in their own zone, plus the
 * scholarship's wording when the two differ, so they know the real cut-off and what the official page says.
 * With no known zone (most catalog entries) the date is shown as written and flagged as not confirmed.
 */
export type DeadlineInput = {
  utc: string;
  sourceTimezone?: string | null;
  date?: string | null;
  time?: string | null;
  allDay?: boolean;
};

export type DeadlineView = {
  /** In the student's zone (or as written when the zone is unknown). */
  main: string;
  /** In the scholarship's zone, only when it differs from the student's. */
  original: string | null;
  /** The scholarship's time zone is not known. */
  unconfirmed: boolean;
};

function fmt(moment: Date, timeZone: string, withTime: boolean, zoneName = false): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
    ...(zoneName ? { timeZoneName: 'short' } : {}),
  }).format(moment);
}

function placeName(timeZone: string): string {
  const last = timeZone.split('/').pop() ?? timeZone;
  return last.replace(/_/g, ' ');
}

export function describeDeadline(d: DeadlineInput, userZone: string, withTime = true): DeadlineView {
  const moment = new Date(d.utc);
  if (!d.sourceTimezone) {
    const date = d.date ?? d.utc.slice(0, 10);
    const asWritten = new Date(`${date}T12:00:00Z`);
    let main = fmt(asWritten, 'UTC', false);
    if (withTime && d.time) {
      const [h, m] = d.time.split(':').map(Number) as [number, number];
      main += `, ${new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, 0, 1, h, m)))}`;
    }
    return { main, original: null, unconfirmed: true };
  }
  const mine = fmt(moment, userZone, withTime);
  const theirs = fmt(moment, d.sourceTimezone, true);
  const sameClock = fmt(moment, userZone, true) === theirs;
  return {
    main: mine,
    original: sameClock ? null : `${theirs} in ${placeName(d.sourceTimezone)} time`,
    unconfirmed: false,
  };
}

/** Any other moment (alerts, history), in the student's zone. */
export function formatMoment(value: string | Date | null | undefined, userZone: string, withTime = true): string {
  if (!value) return '';
  const moment = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(moment.getTime())) return '';
  return fmt(moment, userZone, withTime);
}
