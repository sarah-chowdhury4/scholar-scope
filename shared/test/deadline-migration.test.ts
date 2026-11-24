import { describe, expect, it } from 'vitest';
import { upgradeLegacyDeadline } from '../src/deadlineMigration';

describe('upgradeLegacyDeadline', () => {
  it('turns an old 23:59 UTC date-only deadline into the date as written with no known zone', () => {
    const up = upgradeLegacyDeadline({ utc: new Date('2027-03-01T23:59:59Z'), sourceTimezone: 'Asia/Dhaka', sourceText: '2027-03-01', allDay: true })!;
    expect(up).toMatchObject({ date: '2027-03-01', time: null, sourceTimezone: null, allDay: true });
  });

  it('keeps a real zone on a timed deadline and fills in the time as written', () => {
    const up = upgradeLegacyDeadline({ utc: new Date('2026-12-01T22:00:00Z'), sourceTimezone: 'America/New_York', sourceText: 'Applications close at 5 PM ET', allDay: false })!;
    expect(up).toMatchObject({ date: '2026-12-01', time: '17:00', sourceTimezone: 'America/New_York' });
    expect(up.utc.toISOString()).toBe('2026-12-01T22:00:00.000Z');
  });

  it('treats the old "UTC" fallback as not known', () => {
    const up = upgradeLegacyDeadline({ utc: new Date('2026-12-01T17:00:00Z'), sourceTimezone: 'UTC', sourceText: 'Due 5 PM', allDay: false })!;
    expect(up.sourceTimezone).toBeNull();
    expect(up.time).toBe('17:00');
  });

  it('leaves current deadlines alone', () => {
    expect(upgradeLegacyDeadline({ utc: new Date(), date: '2027-01-01' })).toBeNull();
  });
});
