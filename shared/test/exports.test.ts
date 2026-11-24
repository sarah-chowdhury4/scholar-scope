import { describe, expect, it } from 'vitest';
import { buildCsv, buildIcs, csvCell } from '../src/exports';

describe('buildIcs', () => {
  const now = new Date('2026-11-14T10:00:00Z');

  it('writes an all-day deadline as a date event with reminders', () => {
    const ics = buildIcs(
      [{ uid: 's1', title: 'Dell Scholars, due', description: 'From source', url: 'https://example.org', due: new Date('2026-12-01T23:59:59Z'), allDay: true }],
      now,
    );
    expect(ics).toContain('DTSTART;VALUE=DATE:20261201\r\n');
    expect(ics).toContain('DTEND;VALUE=DATE:20261202\r\n');
    expect(ics).toContain('SUMMARY:Dell Scholars\\, due\r\n');
    expect(ics).toContain('TRIGGER:-P7D');
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });

  it('writes a timed deadline in UTC and folds long lines', () => {
    const ics = buildIcs(
      [{ uid: 's2', title: 'x'.repeat(120), description: '', url: null, due: new Date('2026-12-01T16:59:00Z'), allDay: false }],
      now,
    );
    expect(ics).toContain('DTSTART:20261201T165900Z');
    expect(ics.split('\r\n').every((line) => Buffer.byteLength(line) <= 75)).toBe(true);
  });
});

describe('csv', () => {
  it('quotes commas, quotes and new lines', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell(null)).toBe('');
  });

  it('defuses spreadsheet formulas', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('-2+3')).toBe("'-2+3");
  });

  it('starts with a BOM and uses CRLF', () => {
    expect(buildCsv([['a', 'b'], [1, 2]])).toBe('﻿a,b\r\n1,2\r\n');
  });
});
