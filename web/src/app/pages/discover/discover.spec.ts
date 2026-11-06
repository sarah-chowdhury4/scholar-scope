import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Discover } from './discover';
import { ApiService, type CatalogQuery } from '../../core/api.service';

const item = (id: string, extra: object = {}) => ({
  catalogId: id, organization: 'Org ' + id, name: 'Scholarship ' + id, deadline: '2027-01-15', minGpa: 3,
  promptOrMaterials: 'Essay; Transcript', sourceUrl: 'https://example.org', tags: ['essay', 'transcript'],
  deadlinePassed: false, addedScholarshipId: null, ...extra,
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
});
