import { describeDeadline, formatMoment } from './deadline-format';

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
