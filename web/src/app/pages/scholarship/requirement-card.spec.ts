import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RequirementCard } from './requirement-card';
import { ApiService, type Requirement } from '../../core/api.service';

const essay: Requirement = {
  id: 'r1',
  kind: 'essay',
  label: 'Essay about a challenge',
  verification: 'needs_review',
  readiness: 'missing',
  changeFlag: null,
  current: {
    value: { text: 'Essay about a challenge', wordLimit: { max: 500, unit: 'words' } },
    citation: { sourceId: 's', sourceVersionId: 'v', page: 1, quote: 'In 500 words or fewer, describe a challenge.', ocrDerived: false },
  },
  review: null,
};

@Component({
  imports: [RequirementCard],
  template: `<ul><li appRequirementCard [requirement]="req()" scholarshipId="sch1" (changed)="changes = changes + 1"></li></ul>`,
})
class Host {
  readonly req = signal(essay);
  changes = 0;
}

describe('RequirementCard', () => {
  it('shows the quote and word limit, and confirms through the API', async () => {
    const calls: unknown[] = [];
    await TestBed.configureTestingModule({
      imports: [Host],
      providers: [
        {
          provide: ApiService,
          useValue: {
            reviewRequirement: async (...args: unknown[]) => {
              calls.push(args);
              return { ok: true };
            },
          },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('In 500 words or fewer');
    expect(el.textContent).toContain('Up to 500 words');
    expect(el.textContent).toContain('Needs review');

    const confirmButton = [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Looks right'))!;
    confirmButton.click();
    await fixture.whenStable();
    expect(calls).toEqual([['sch1', 'r1', { action: 'confirm' }]]);
    expect(fixture.componentInstance.changes).toBe(1);
  });

  it('blocks the done tick while a change is waiting for review', async () => {
    await TestBed.configureTestingModule({ imports: [Host], providers: [{ provide: ApiService, useValue: {} }] }).compileComponents();
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.req.set({ ...essay, changeFlag: { active: true } });
    fixture.detectChanges();
    const box = (fixture.nativeElement as HTMLElement).querySelector('input[type=checkbox]') as HTMLInputElement;
    expect(box.disabled).toBe(true);
  });
});
