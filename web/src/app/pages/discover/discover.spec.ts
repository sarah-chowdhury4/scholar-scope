import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Discover } from './discover';
import { ApiService, type CatalogQuery } from '../../core/api.service';

const item = (id: string, extra: object = {}) => ({
  catalogId: id, organization: 'Org ' + id, name: 'Scholarship ' + id, deadline: '2027-01-15', minGpa: 3,
  promptOrMaterials: 'Essay; Transcript', sourceUrl: 'https://example.org', tags: ['essay', 'transcript'],
  deadlinePassed: false, addedScholarshipId: null, teamVerified: true, ...extra,
});

describe('Discover', () => {
  let queries: CatalogQuery[];
  let added: string[];

  async function render() {
    queries = [];
    added = [];
    await TestBed.configureTestingModule({
      imports: [Discover],
      providers: [
        provideRouter([]),
        {
          provide: ApiService,
          useValue: {
            catalog: async (q: CatalogQuery) => {
              queries.push(q);
              return { items: [item('SCH-001'), item('SCH-002', { addedScholarshipId: 'catalog-sch-002' }), item('SCH-003', { deadlinePassed: true })], total: 15, organizations: ['Org SCH-001'], tags: [] };
            },
            addFromCatalog: async (id: string) => {
              added.push(id);
              return { scholarshipId: 'catalog-' + id.toLowerCase(), alreadyAdded: false };
            },
          },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(Discover);
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('lists catalog scholarships with search, filters and add buttons', async () => {
    const fixture = await render();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('input#q')).toBeTruthy();
    expect(el.querySelector('select#deadline')).toBeTruthy();
    expect(el.querySelector('input#gpa')).toBeTruthy();
    expect(el.textContent).toContain('3 of 15 scholarships');
    // A YYYY-MM-DD deadline shows as that same day in every time zone (it was a day early east of UTC).
    expect(el.textContent).toContain('Jan 15, 2027');
    expect(el.textContent).toContain('Add to my scholarships');
    expect(el.textContent).toContain('Added · open');
    expect(el.textContent).toContain('Deadline passed');
    expect(queries[0]).toMatchObject({ deadline: 'upcoming', sort: 'deadline' });
  });

  it('adds a scholarship and switches the button to "Added"', async () => {
    const fixture = await render();
    const button = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find((b) => b.textContent?.includes('Add to my scholarships'))!;
    button.click();
    await new Promise((r) => setTimeout(r));
    fixture.detectChanges();
    expect(added).toEqual(['SCH-001']);
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('a[href="/scholarships/catalog-sch-001"]').length).toBe(1);
  });

  it('sends tag filters to the API', async () => {
    const fixture = await render();
    fixture.componentInstance.setTag('video', 'excludes');
    fixture.componentInstance.setTag('essay', 'requires');
    await new Promise((r) => setTimeout(r));
    expect(queries.at(-1)).toMatchObject({ requires: ['essay'], excludes: ['video'] });
  });

  it('keeps the filter panel closed until the student opens it', async () => {
    const fixture = await render();
    const el = fixture.nativeElement as HTMLElement;
    const panel = el.querySelector('#filter-panel') as HTMLElement;
    const toggle = el.querySelector('.filters-toggle') as HTMLButtonElement;
    expect(panel.hidden).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    fixture.detectChanges();
    expect(panel.hidden).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(el.querySelector('label[for="tag-recommendation"]')?.textContent).toBe('Recommendation letter');
  });

  it('shows filters in use as chips that remove them', async () => {
    const fixture = await render();
    fixture.componentInstance.setTag('essay', 'requires');
    fixture.componentInstance.setTag('video', 'excludes');
    await new Promise((r) => setTimeout(r));
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const chips = [...el.querySelectorAll('.active-filters .chip')].map((c) => c.textContent?.replace('×', '').trim());
    expect(chips).toEqual(['Asks for essay', 'No video']);
    expect(el.querySelector('.filters-toggle')?.textContent).toContain('2');
    (el.querySelector('[aria-label="Remove filter: Asks for essay"]') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r));
    expect(queries.at(-1)).toMatchObject({ requires: [], excludes: ['video'] });
  });
});
