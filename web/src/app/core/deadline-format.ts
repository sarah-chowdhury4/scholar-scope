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

export type DaysLeft = {
  /** Whole calendar days from today to the deadline day, in the student's zone. Negative once it has passed. */
  days: number;
  passed: boolean;
  /** "12 days left", "Due tomorrow", "Due today", "Closed 3 days ago". */
  text: string;
  /** "soon" within a week, "urgent" within two days or past. */
  level: 'ok' | 'soon' | 'urgent' | 'passed';
};

/** The calendar date ("2026-12-01") of a moment in a time zone. */
function dayIn(moment: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(moment);
}

function dayNumber(isoDate: string): number {
  return Math.round(Date.parse(`${isoDate}T00:00:00Z`) / 86_400_000);
}

/**
 * How many days a student has left, counted in calendar days in their own time zone.
 * With a known zone the real cut-off decides both the day and whether it has passed. With no known zone
 * the date as written is used, and it counts as passed only once that date is over for the student.
 */
export function daysLeft(d: DeadlineInput, userZone: string, now: Date = new Date()): DaysLeft {
  const today = dayNumber(dayIn(now, userZone));
  let due: number;
  let passed: boolean;
  if (d.sourceTimezone) {
    const moment = new Date(d.utc);
    due = dayNumber(dayIn(moment, userZone));
    passed = moment.getTime() <= now.getTime();
  } else {
    due = dayNumber(d.date ?? d.utc.slice(0, 10));
    passed = due < today;
  }
  const days = due - today;
  const plural = (n: number) => `${n} day${n === 1 ? '' : 's'}`;
  if (passed) {
    const ago = Math.max(0, -days);
    return { days, passed, text: ago === 0 ? 'Closed today' : `Closed ${plural(ago)} ago`, level: 'passed' };
  }
  const text = days <= 0 ? 'Due today' : days === 1 ? 'Due tomorrow' : `${plural(days)} left`;
  const level = days <= 2 ? 'urgent' : days <= 7 ? 'soon' : 'ok';
  return { days: Math.max(0, days), passed, text, level };
}
