import { TestBed } from '@angular/core/testing';
import { ChangeReview } from './change-review';
import { ApiService, type RequirementChange } from '../../core/api.service';

const change: RequirementChange = {
  id: 'c1',
  requirementId: 'r1',
  label: 'Essay length',
  status: 'open',
  detectedAt: '2026-11-14T00:00:00Z',
  acknowledgedAt: null,
  from: null,
  to: null,
  fromQuote: 'Essay of 500 words',
  toQuote: 'Essay of 650 words',
  diff: {
    before: [{ type: 'same', text: 'Essay of ' }, { type: 'removed', text: '500' }, { type: 'same', text: ' words' }],
    after: [{ type: 'same', text: 'Essay of ' }, { type: 'added', text: '650' }, { type: 'same', text: ' words' }],
  },
  aiSummary: { summary: 'The word limit went from 500 to 650 words.', whatToDo: 'You can lengthen your essay.', importance: 'important', model: 'gemini' },
};

describe('ChangeReview', () => {
  it('shows old and new wording and removes the change once acknowledged', async () => {
    const acknowledged: string[] = [];
    await TestBed.configureTestingModule({
      imports: [ChangeReview],
      providers: [
        {
          provide: ApiService,
          useValue: {
            changes: async () => ({ items: [change] }),
            acknowledgeChange: async (_s: string, id: string) => {
              acknowledged.push(id);
              return { ok: true };
            },
          },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(ChangeReview);
    fixture.componentRef.setInput('scholarshipId', 's1');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('del')?.textContent).toBe('500');
    expect(el.querySelector('ins')?.textContent).toBe('650');
    expect(el.textContent).toContain('AI summary · important');

    (el.querySelector('article button:last-of-type') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(acknowledged).toEqual(['c1']);
    expect(el.textContent).not.toContain('What changed');
  });
});
