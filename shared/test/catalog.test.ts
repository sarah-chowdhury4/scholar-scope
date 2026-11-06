import { describe, expect, it } from 'vitest';
import { catalogEntryFromRow, filterCatalog, parseCsv, requirementsFromCatalog, tagsFor, type CatalogEntry } from '../src/catalog';

const csv = `scholarship_id,organization,scholarship_name,current_deadline,min_gpa,essay_prompt,verified_source_url,version_flag
SCH-001,Dell Foundation,Dell Scholars Program,2026-12-01,2.4,"Describe a personal hurdle; Official transcript",https://dellscholars.org,v1.0 - Active
SCH-002,RSM US Foundation,First Generation Scholarship,2027-02-28,3.3,Submit a 60-second video about your community.,https://rsmus.com,v1.0 - Active
SCH-011,Coca-Cola Scholars Foundation,Coca-Cola Scholars Program,2026-09-30,3.0,"Leadership activity list; High school transcript; Community service log",https://coca-colascholarsfoundation.org,v1.0 - Active
SCH-015,Thurgood Marshall College Fund,TMCF Access Scholarship,2027-04-30,3.0,"FAFSA Student Aid Report; 500-word career ambition essay; Recommendation letter",https://tmcf.org,v1.0 - Active
BAD,Nobody,No id,2027-01-01,3.0,,,
`;

const entries = parseCsv(csv)
  .map(catalogEntryFromRow)
  .filter((e): e is CatalogEntry => !('error' in e));
const today = '2026-11-06';
const ids = (list: CatalogEntry[]) => list.map((e) => e.catalogId);

describe('catalog import', () => {
  it('parses rows, splits the version flag and skips invalid ids', () => {
    expect(ids(entries)).toEqual(['SCH-001', 'SCH-002', 'SCH-011', 'SCH-015']);
    expect(entries[0]).toMatchObject({ minGpa: 2.4, datasetVersion: 'v1.0', datasetStatus: 'Active', deadline: '2026-12-01' });
  });
  it('derives what each application asks for', () => {
    expect(entries[0]!.tags).toEqual(expect.arrayContaining(['essay', 'transcript']));
    expect(entries[1]!.tags).toContain('video');
    expect(entries[3]!.tags).toEqual(expect.arrayContaining(['essay', 'recommendation', 'financial']));
    expect(tagsFor('Curriculum Vitae (CV)')).toContain('resume');
  });
  it('turns the requirements text into a checklist', () => {
    const kinds = requirementsFromCatalog(entries[3]!).map((r) => r.kind);
    expect(kinds).toEqual(['deadline', 'eligibility', 'financial_doc', 'essay', 'recommendation']);
  });
});

describe('filterCatalog', () => {
  it('hides past deadlines by default and sorts by nearest deadline', () => {
    expect(ids(filterCatalog(entries, {}, today))).toEqual(['SCH-001', 'SCH-002', 'SCH-015']);
  });
  it('can include past deadlines', () => {
    expect(ids(filterCatalog(entries, { deadline: 'all' }, today))).toContain('SCH-011');
  });
  it('limits to a deadline window', () => {
    expect(ids(filterCatalog(entries, { deadline: '30' }, today))).toEqual(['SCH-001']);
  });
  it('searches name, organization and requirements, all words must match', () => {
    expect(ids(filterCatalog(entries, { q: 'tmcf essay' }, today))).toEqual(['SCH-015']);
    expect(ids(filterCatalog(entries, { q: 'DELL' }, today))).toEqual(['SCH-001']);
    expect(filterCatalog(entries, { q: 'nursing' }, today)).toEqual([]);
  });
  it('filters by the student GPA', () => {
    expect(ids(filterCatalog(entries, { gpa: 3.0 }, today))).toEqual(['SCH-001', 'SCH-015']);
  });
  it('filters by what is required or excluded', () => {
    expect(ids(filterCatalog(entries, { requires: ['recommendation'] }, today))).toEqual(['SCH-015']);
    expect(ids(filterCatalog(entries, { excludes: ['video'] }, today))).toEqual(['SCH-001', 'SCH-015']);
  });
  it('filters by organization and sorts by name', () => {
    expect(ids(filterCatalog(entries, { organization: 'RSM US Foundation' }, today))).toEqual(['SCH-002']);
    expect(ids(filterCatalog(entries, { sort: 'name' }, today))).toEqual(['SCH-001', 'SCH-002', 'SCH-015']);
  });
});
