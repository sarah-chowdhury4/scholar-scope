import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Dashboard } from './dashboard';
import { ApiService } from '../../core/api.service';

async function render(items: unknown[]) {
  await TestBed.configureTestingModule({
    imports: [Dashboard],
    providers: [provideRouter([]), { provide: ApiService, useValue: { scholarships: async () => ({ items }) } }],
  }).compileComponents();
  const fixture = TestBed.createComponent(Dashboard);
  fixture.detectChanges();
  await new Promise((r) => setTimeout(r));
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('Dashboard', () => {
  it('shows an empty dashboard with Discover and Add buttons for a new student', async () => {
    const el = await render([]);
    expect(el.textContent).toContain('Your dashboard is empty');
    const links = [...el.querySelectorAll('a.button')].map((a) => a.getAttribute('href'));
    expect(links).toEqual(['/discover', '/scholarships/new']);
  });

  it('lists scholarships and keeps both buttons in the page header', async () => {
    const el = await render([
      { id: 's1', name: 'Dell Scholars', provider: 'Dell', url: null, status: 'researching', deadline: null,
        counts: { open: 2, changed: 0, unverified: 2, needsReview: 0, ready: 0, total: 2 }, readinessPct: 0 },
    ]);
    expect(el.textContent).toContain('Dell Scholars');
    expect(el.textContent).not.toContain('Your dashboard is empty');
    expect(el.querySelector('.page-head a[href="/discover"]')).toBeTruthy();
    expect(el.querySelector('.page-head a[href="/scholarships/new"]')).toBeTruthy();
  });
});
