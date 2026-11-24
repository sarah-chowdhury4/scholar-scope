import { describe, expect, it } from 'vitest';
import { daysUntil, dueDeadlineAlert, dueDeadlineReminder, deadlineAlertTitle, deadlineDedupeKey, parseSourceDeadline, timeZoneOffsetMinutes, deadlineFromSource, isApplicationDeadline, pickApplicationDeadline } from '../src/deadlines';

describe('daysUntil / dueDeadlineAlert', () => {
  const offsets = [14, 7, 3, 1];
  it('counts calendar days in the student time zone', () => {
    const deadline = new Date('2026-12-01T23:59:59Z');
    expect(daysUntil(deadline, new Date('2026-11-24T12:00:00Z'), 'UTC')).toBe(7);
  });
  it('returns the matching offset only on alert days', () => {
    const deadline = new Date('2026-12-01T23:59:59Z');
    expect(dueDeadlineAlert(deadline, new Date('2026-11-17T08:00:00Z'), 'UTC', offsets)).toBe(14);
    expect(dueDeadlineAlert(deadline, new Date('2026-11-18T08:00:00Z'), 'UTC', offsets)).toBeNull();
    expect(dueDeadlineAlert(deadline, new Date('2026-11-30T08:00:00Z'), 'UTC', offsets)).toBe(1);
  });
  it('uses the student time zone for the day boundary', () => {
    const deadline = new Date('2026-12-01T05:00:00Z'); // Dec 1 in Dhaka (UTC+6)
    const now = new Date('2026-11-30T19:00:00Z'); // already Dec 1 01:00 in Dhaka
    expect(daysUntil(deadline, now, 'Asia/Dhaka')).toBe(0);
    expect(daysUntil(deadline, now, 'UTC')).toBe(1);
  });
  it('reminds on the deadline day itself (offset 0)', () => {
    const deadline = new Date('2026-12-01T23:59:00Z');
    const withDayOf = [14, 7, 3, 1, 0];
    expect(dueDeadlineAlert(deadline, new Date('2026-12-01T13:00:00Z'), 'UTC', withDayOf)).toBe(0);
    expect(dueDeadlineAlert(deadline, new Date('2026-12-01T13:00:00Z'), 'UTC', offsets)).toBeNull();
    expect(dueDeadlineAlert(deadline, new Date('2026-11-29T13:00:00Z'), 'UTC', withDayOf)).toBeNull(); // 2 days: no reminder
  });
  it('words the reminder subject for today, tomorrow and later', () => {
    expect(deadlineAlertTitle('Dell Scholars', 0)).toBe('Dell Scholars is due today');
    expect(deadlineAlertTitle('Dell Scholars', 1)).toBe('Dell Scholars is due tomorrow');
    expect(deadlineAlertTitle('Dell Scholars', 14)).toBe('Dell Scholars is due in 14 days');
  });
  it('catches up on a reminder day the job missed, saying the real days left', () => {
    const deadline = new Date('2026-12-01T23:59:00Z');
    const at = (day: string) => dueDeadlineReminder(deadline, new Date(`${day}T13:00:00Z`), 'UTC', [14, 7, 3, 1, 0]);
    expect(at('2026-11-24')).toEqual({ offset: 7, daysLeft: 7 }); // on time
    expect(at('2026-11-25')).toEqual({ offset: 7, daysLeft: 6 }); // the 7-day run was missed: sent a day late
    expect(at('2026-11-27')).toEqual({ offset: 7, daysLeft: 4 }); // three days late is the limit
    expect(at('2026-11-29')).toEqual({ offset: 3, daysLeft: 2 });
    expect(at('2026-12-01')).toEqual({ offset: 0, daysLeft: 0 });
  });
  it('does not send old reminders for a scholarship added late, or for passed deadlines', () => {
    const deadline = new Date('2026-12-01T23:59:00Z');
    const at = (day: string) => dueDeadlineReminder(deadline, new Date(`${day}T13:00:00Z`), 'UTC', [14, 7, 3, 1, 0]);
    expect(at('2026-11-21')).toBeNull(); // 10 days left: the 14-day reminder is 4 days stale
    expect(at('2026-11-10')).toBeNull(); // 21 days left: nothing due yet
    expect(at('2026-12-02')).toBeNull(); // passed
  });
  it('builds a stable dedupe key', () => {
    expect(deadlineDedupeKey('sch1', 7, new Date('2026-12-01T23:59:59Z'))).toBe('deadline_7:sch1:2026-12-01');
  });
});

describe('parseSourceDeadline', () => {
  it('date only = end of day in the source time zone', () => {
    const r = parseSourceDeadline('2026-12-01', 'America/New_York');
    expect(r?.allDay).toBe(true);
    expect(r?.utc.toISOString()).toBe('2026-12-02T04:59:59.000Z');
  });
  it('wall-clock time in the source time zone', () => {
    expect(parseSourceDeadline('2026-12-01T17:00', 'America/New_York')?.utc.toISOString()).toBe('2026-12-01T22:00:00.000Z');
    expect(parseSourceDeadline('2026-07-01T17:00', 'America/New_York')?.utc.toISOString()).toBe('2026-07-01T21:00:00.000Z');
  });
  it('explicit offsets win', () => {
    expect(parseSourceDeadline('2026-12-01T17:00:00+06:00')?.utc.toISOString()).toBe('2026-12-01T11:00:00.000Z');
  });
  it('rejects junk and unknown zones', () => {
    expect(parseSourceDeadline('next Friday')).toBeNull();
    expect(parseSourceDeadline('2026-12-01', 'Mars/Olympus')).toBeNull();
  });
  it('reads zone offsets', () => {
    expect(timeZoneOffsetMinutes(new Date('2026-01-15T12:00:00Z'), 'Asia/Dhaka')).toBe(360);
  });
});

describe('application deadline choice', () => {
  const at = (label: string, iso: string) => ({ label, deadline: deadlineFromSource(iso, 'America/New_York')! });

  it('tells the application deadline apart from other dates on the page', () => {
    expect(isApplicationDeadline('Application Deadline')).toBe(true);
    expect(isApplicationDeadline('Applications close')).toBe(true);
    expect(isApplicationDeadline('Essay due')).toBe(true);
    expect(isApplicationDeadline('Finalist College Choice & Award Letter Due')).toBe(false);
    expect(isApplicationDeadline('Interview day')).toBe(false);
    expect(isApplicationDeadline('Results announced')).toBe(false);
    expect(isApplicationDeadline('Application opens')).toBe(false);
  });

  it('picks the next application deadline still ahead, or the last one once all have passed', () => {
    const items = [at('Finalist award letter due', '2027-05-06'), at('Round 2 application deadline', '2027-02-01'), at('Round 1 application deadline', '2026-10-01')];
    expect(pickApplicationDeadline(items, new Date('2026-11-20T00:00:00Z'))?.label).toBe('Round 2 application deadline');
    expect(pickApplicationDeadline(items, new Date('2027-03-01T00:00:00Z'))?.label).toBe('Round 2 application deadline');
    expect(pickApplicationDeadline([at('Finalist award letter due', '2027-05-06')])).toBeNull();
  });
});
