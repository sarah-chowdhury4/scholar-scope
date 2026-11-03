import { describe, expect, it } from 'vitest';
import { daysUntil, dueDeadlineAlert, deadlineDedupeKey, parseSourceDeadline, timeZoneOffsetMinutes } from '../src/deadlines';

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
