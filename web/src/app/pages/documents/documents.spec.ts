import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DocumentsPage } from './documents';
import { ApiService, type StudentDocument } from '../../core/api.service';

const transcript: StudentDocument = {
  id: 'doc-1',
  type: 'transcript',
  title: 'Transcript',
  fileName: 'transcript.pdf',
  scanStatus: 'clean',
  ready: true,
  usedIn: [],
};

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

  it('offers the one-time files and a place for anything else', async () => {
    const el = await render([]);
    expect(el.textContent).toContain('Transcript');
    expect(el.textContent).toContain('Passport');
    expect(el.textContent).toContain('Birth certificate');
    expect(el.textContent).toContain('Not uploaded yet.');
    expect(el.textContent).toContain('Other documents');
  });

  it('shows a transcript that was already uploaded', async () => {
    const el = await render([transcript]);
    expect(el.textContent).toContain('transcript.pdf');
    expect(el.textContent).toContain('Saved');
    expect(el.textContent).toContain('Replace file');
  });
});
