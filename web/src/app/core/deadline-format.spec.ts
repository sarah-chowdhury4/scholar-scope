import { daysLeft, describeDeadline, formatMoment } from './deadline-format';

describe('describeDeadline', () => {
  const ny = { utc: '2027-03-02T04:59:59.000Z', sourceTimezone: 'America/New_York', date: '2027-03-01', time: null, allDay: true };

  it('shows the deadline in the student\'s zone and the scholarship\'s own time when they differ', () => {
    const view = describeDeadline(ny, 'Asia/Dhaka');
    expect(view.main).toBe('Mar 2, 2027, 10:59 AM');
    expect(view.original).toBe('Mar 1, 2027, 11:59 PM in New York time');
    expect(view.unconfirmed).toBe(false);
  });

  it('shows one time when the student is in the scholarship\'s zone', () => {
    const view = describeDeadline(ny, 'America/New_York');
    expect(view.main).toBe('Mar 1, 2027, 11:59 PM');
    expect(view.original).toBeNull();
  });

  it('shows a date with no known zone exactly as written, flagged as not confirmed', () => {
    const view = describeDeadline({ utc: '2027-03-01T09:59:59.000Z', sourceTimezone: null, date: '2027-03-01', time: null }, 'America/Los_Angeles');
    expect(view).toEqual({ main: 'Mar 1, 2027', original: null, unconfirmed: true });
  });

  it('can drop the time for compact lists', () => {
    expect(describeDeadline(ny, 'Asia/Dhaka', false).main).toBe('Mar 2, 2027');
  });
});

describe('formatMoment', () => {
  it('formats in the given zone', () => {
    expect(formatMoment('2026-11-17T20:30:00Z', 'Asia/Dhaka')).toBe('Nov 18, 2026, 2:30 AM');
    expect(formatMoment(null, 'UTC')).toBe('');
  });
});

describe('daysLeft', () => {
  const ny = { utc: '2027-03-02T04:59:59.000Z', sourceTimezone: 'America/New_York', date: '2027-03-01', time: null, allDay: true };
  const noZone = { utc: '2026-12-01T09:59:59.000Z', sourceTimezone: null, date: '2026-12-01', time: null };

  it("counts calendar days in the student's zone", () => {
    expect(daysLeft(noZone, 'America/New_York', new Date('2026-11-20T15:00:00Z'))).toMatchObject({ days: 11, passed: false, text: '11 days left', level: 'ok' });
  });

  it("uses the student's calendar, not UTC, for today", () => {
    // 02:00 UTC on Nov 30 is still Nov 29 in Los Angeles.
    expect(daysLeft(noZone, 'America/Los_Angeles', new Date('2026-11-30T02:00:00Z')).text).toBe('2 days left');
    expect(daysLeft(noZone, 'Asia/Dhaka', new Date('2026-11-30T02:00:00Z')).text).toBe('Due tomorrow');
  });

  it('warns as the day gets close and says when it closed', () => {
    expect(daysLeft(noZone, 'UTC', new Date('2026-11-26T10:00:00Z')).level).toBe('soon');
    expect(daysLeft(noZone, 'UTC', new Date('2026-12-01T10:00:00Z'))).toMatchObject({ text: 'Due today', level: 'urgent' });
    expect(daysLeft(noZone, 'UTC', new Date('2026-12-04T10:00:00Z'))).toMatchObject({ text: 'Closed 3 days ago', passed: true });
  });

  it('with a known zone, the real cut-off decides the day and when it has passed', () => {
    // 11:59 PM New York on Mar 1 is the morning of Mar 2 in Dhaka.
    expect(daysLeft(ny, 'Asia/Dhaka', new Date('2027-03-01T12:00:00Z')).text).toBe('Due tomorrow');
    expect(daysLeft(ny, 'Asia/Dhaka', new Date('2027-03-02T06:00:00Z'))).toMatchObject({ passed: true, text: 'Closed today' });
  });
});
