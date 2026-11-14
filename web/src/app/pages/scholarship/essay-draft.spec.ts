import { TestBed } from '@angular/core/testing';
import { EssayDraft } from './essay-draft';
import { ApiService, type Draft, type Requirement } from '../../core/api.service';

const requirement: Requirement = {
  id: 'r1',
  kind: 'essay',
  label: 'Essay about a challenge',
  verification: 'verified',
  readiness: 'missing',
  changeFlag: null,
  current: { value: {}, citation: null },
};

const draft: Draft = {
  id: 'd1',
  scholarshipId: 's1',
  requirementId: 'r1',
  status: 'ready',
  error: null,
  prompt: { label: 'Essay', quote: 'Describe a challenge.', wordLimit: 12 },
  notes: 'I led the robotics club for two years and tutored younger students.',
  sentences: [
    { text: 'I led my school robotics club for two years.', basedOn: ['N1'], supported: true, paragraph: 0 },
    { text: 'I also won a national prize.', basedOn: [], supported: false, paragraph: 0 },
  ],
  facts: [{ id: 'N1', text: 'I led the robotics club for two years', from: 'notes' }],
  text: 'I led my school robotics club for two years. I also won a national prize.',
  edited: false,
  wordCount: 15,
  unsupportedCount: 1,
  suggestion: null,
  createdAt: '2026-11-14T00:00:00Z',
  approvedAt: null,
};

describe('EssayDraft', () => {
  it('marks sentences not based on the notes and blocks approval over the word limit', async () => {
    await TestBed.configureTestingModule({
      imports: [EssayDraft],
      providers: [{ provide: ApiService, useValue: { drafts: async () => ({ items: [draft] }) } }],
    }).compileComponents();
    const fixture = TestBed.createComponent(EssayDraft);
    fixture.componentRef.setInput('requirement', requirement);
    fixture.componentRef.setInput('scholarshipId', 's1');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.unsupported')?.textContent).toContain('national prize');
    expect(el.textContent).toContain('15 words of 12');
    const approve = [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Approve'))!;
    expect(approve.disabled).toBe(true);
  });
});
