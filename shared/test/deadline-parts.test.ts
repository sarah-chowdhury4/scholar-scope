import { describe, expect, it } from 'vitest';
import { dateInZone, deadlineFromParts, deadlineFromSource } from '../src/deadlines';

describe('deadlineFromParts', () => {
  it('puts an end-of-day deadline at 23:59:59 in the scholarship\'s own zone', () => {
    const d = deadlineFromParts('2027-03-01', null, 'America/New_York')!;
    expect(d.utc.toISOString()).toBe('2027-03-02T04:59:59.000Z');
    expect(d).toMatchObject({ allDay: true, sourceTimezone: 'America/New_York', date: '2027-03-01', time: null });
  });

  it('keeps a stated time in that zone', () => {
    const d = deadlineFromParts('2027-03-01', '17:00', 'Europe/London')!;
    expect(d.utc.toISOString()).toBe('2027-03-01T17:00:00.000Z');
    expect(d.allDay).toBe(false);
  });

  it('with no known zone, uses the earliest moment the date can end, so reminders are never late', () => {
    const d = deadlineFromParts('2027-03-01', null, null)!;
    expect(d.sourceTimezone).toBeNull();
    expect(d.utc.toISOString()).toBe('2027-03-01T09:59:59.000Z');
    expect(d.date).toBe('2027-03-01');
  });

  it('treats an unknown zone name as not known, and rejects impossible dates', () => {
    expect(deadlineFromParts('2027-03-01', null, 'Mars/Olympus')?.sourceTimezone).toBeNull();
    expect(deadlineFromParts('2027-02-30', null, 'UTC')).toBeNull();
  });
});

describe('deadlineFromSource', () => {
  it('reads date-only, wall-clock and offset forms', () => {
    expect(deadlineFromSource('2026-12-01', 'America/New_York')?.utc.toISOString()).toBe('2026-12-02T04:59:59.000Z');
    expect(deadlineFromSource('2026-12-01T17:00', 'America/New_York')?.utc.toISOString()).toBe('2026-12-01T22:00:00.000Z');
    const offset = deadlineFromSource('2026-12-01T17:00:00-05:00', null)!;
    expect(offset).toMatchObject({ date: '2026-12-01', time: '17:00', allDay: false });
    expect(offset.utc.toISOString()).toBe('2026-12-01T22:00:00.000Z');
  });

  it('keeps the zone unknown when the source does not state one', () => {
    expect(deadlineFromSource('2026-12-01', null)?.sourceTimezone).toBeNull();
  });
});

describe('dateInZone', () => {
  it('gives the calendar date in a zone', () => {
    expect(dateInZone(new Date('2027-03-02T04:59:59Z'), 'America/New_York')).toBe('2027-03-01');
    expect(dateInZone(new Date('2027-03-02T04:59:59Z'), 'Asia/Dhaka')).toBe('2027-03-02');
  });
});

describe('deadlineSentence', () => {
  it("gives the student's time and the scholarship's time when they differ", async () => {
    const { deadlineSentence } = await import('../src/deadlines');
    const s = deadlineSentence({ utc: new Date('2027-03-02T04:59:59Z'), sourceTimezone: 'America/New_York' }, 'Asia/Dhaka');
    expect(s).toContain('March 2, 2027');
    expect(s).toContain('(your time); that is');
    expect(s).toContain('March 1, 2027');
    expect(s).toContain('in New York');
  });

  it('gives the date as written when the zone is unknown', async () => {
    const { deadlineSentence } = await import('../src/deadlines');
    expect(deadlineSentence({ utc: new Date('2027-03-01T09:59:59Z'), sourceTimezone: null, date: '2027-03-01' }, 'Asia/Dhaka')).toBe(
      "Monday, March 1, 2027 (the scholarship's time zone is not confirmed)",
    );
  });
});
