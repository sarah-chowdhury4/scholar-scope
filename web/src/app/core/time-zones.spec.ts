import { describe, expect, it } from 'vitest';
import { timeZoneGroups } from './time-zones';

describe('timeZoneGroups', () => {
  const groups = timeZoneGroups([], new Date('2026-07-01T12:00:00Z'));
  const all = groups.flatMap((g) => g.zones);

  it('lists every zone once, grouped by region with UTC under Other', () => {
    expect(groups.map((g) => g.region)).toContain('Asia');
    expect(groups.at(-1)?.region).toBe('Other');
    expect(new Set(all.map((z) => z.value)).size).toBe(all.length);
    expect(all.some((z) => z.value === 'UTC')).toBe(true);
  });

  it('labels a zone with its place and current offset', () => {
    expect(all.find((z) => z.value === 'Asia/Dhaka')?.label).toBe('Dhaka (UTC+6)');
    expect(all.find((z) => z.value === 'America/New_York')?.label).toBe('New York (UTC-4)');
  });

  it('keeps a saved zone selectable even when the browser does not list it', () => {
    const withSaved = timeZoneGroups(['Etc/GMT+5']).flatMap((g) => g.zones);
    expect(withSaved.some((z) => z.value === 'Etc/GMT+5')).toBe(true);
  });
});
