import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { catalogEntryFromRow, parseCsv } from '../src/catalog';

/** The team's dataset (Dataset/ScholarScope Updated Dataset.csv) must import completely. */
describe('team dataset file', () => {
  it('imports all 15 scholarships', () => {
    const rows = parseCsv(readFileSync(new URL('../../Dataset/ScholarScope Updated Dataset.csv', import.meta.url), 'utf8'));
    const entries = rows.map(catalogEntryFromRow);
    const skipped = entries.filter((e) => 'error' in e);
    expect(skipped).toEqual([]);
    expect(entries).toHaveLength(15);
  });
});
