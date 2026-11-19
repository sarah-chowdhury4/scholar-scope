import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
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

  it('shows the result from the transcript instead of a tick box, without repeating the label', async () => {
    await TestBed.configureTestingModule({ imports: [Host], providers: [{ provide: ApiService, useValue: {} }, provideRouter([])] }).compileComponents();
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.req.set({
      ...essay,
      kind: 'eligibility',
      label: 'Minimum GPA 3.20',
      verification: 'unverified',
      current: { value: { minGpa: 3.2 }, citation: null },
      assessment: {
        status: 'met',
        message: 'You meet this: your high school transcript shows a GPA of 3.62.',
        quote: 'Cumulative GPA: 3.62 / 4.00',
        page: 1,
        documentTitle: 'High school transcript',
      },
    });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('input[type=checkbox]')).toBeNull();
    expect(el.textContent).toContain('Met. You meet this');
    expect(el.textContent).toContain('From your high school transcript: “Cumulative GPA: 3.62 / 4.00” (page 1)');
    expect(el.textContent).not.toContain('Minimum GPA 3.2 ');
    expect(el.textContent).toContain('Is this rule right?');
  });
});
