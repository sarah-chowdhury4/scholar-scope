import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DocumentsPage } from './documents';
import { ApiService, type StudentDocument } from '../../core/api.service';

const transcripts: StudentDocument[] = [
  {
    id: 'doc-hs',
    type: 'transcript',
    title: 'High school transcript',
    fileName: 'school.pdf',
    scanStatus: 'clean',
    ready: true,
    usedIn: [],
  },
  {
    id: 'doc-ug',
    type: 'transcript',
    title: 'Undergraduate transcript',
    fileName: 'university.pdf',
    scanStatus: 'clean',
    ready: true,
    usedIn: [],
  },
];

describe('Documents', () => {
  async function render(items: StudentDocument[]) {
    await TestBed.configureTestingModule({
      imports: [DocumentsPage],
      providers: [
        provideRouter([]),
        {
          provide: ApiService,
          useValue: {
            documents: async () => ({ items }),
            scholarships: async () => ({ items: [{ id: 's1', name: 'Dell Scholars' }] }),
          },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(DocumentsPage);
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('offers more than one transcript and country-specific school certificates', async () => {
    const el = await render([]);
    expect(el.textContent).toContain('High school transcript');
    expect(el.textContent).toContain('Undergraduate transcript');
    expect(el.textContent).toContain('IGCSE');
    expect(el.textContent).toContain('A-level');
    expect(el.textContent).toContain('Degree certificate');
    expect(el.textContent).toContain('Passport');
    expect(el.textContent).toContain('Birth certificate');
    expect(el.textContent).toContain('Not uploaded yet.');
  });

  it('lists each saved transcript by name', async () => {
    const el = await render(transcripts);
    expect(el.textContent).toContain('High school transcript');
    expect(el.textContent).toContain('school.pdf');
    expect(el.textContent).toContain('Undergraduate transcript');
    expect(el.textContent).toContain('university.pdf');
  });
});
