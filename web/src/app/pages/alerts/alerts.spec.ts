import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AlertsPage } from './alerts';
import { ApiService, type AlertItem } from '../../core/api.service';

const items: AlertItem[] = [
  { id: 'a1', type: 'change', title: 'Dell Scholars: a requirement changed', body: 'Essay length changed.', scholarshipId: 's1', changeId: 'c1', read: false, createdAt: '2026-11-14T00:00:00Z' },
  { id: 'a2', type: 'deadline_7', title: 'Dell Scholars is due in 7 days', body: 'Due soon.', scholarshipId: 's1', changeId: null, read: true, createdAt: '2026-11-13T00:00:00Z' },
];

describe('AlertsPage', () => {
  async function render(api: Partial<ApiService>) {
    await TestBed.configureTestingModule({
      imports: [AlertsPage],
      providers: [provideRouter([]), { provide: ApiService, useValue: api }],
    }).compileComponents();
    const fixture = TestBed.createComponent(AlertsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('lists change and deadline alerts with unread ones marked', async () => {
    const fixture = await render({ alerts: async () => ({ items, unread: 1 }) });
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Requirement changed');
    expect(el.textContent).toContain('Due in 7 days');
    expect(el.querySelectorAll('li.unread').length).toBe(1);
    expect(el.textContent).toContain('Mark all as read');
  });

  it('shows an empty state', async () => {
    const fixture = await render({ alerts: async () => ({ items: [], unread: 0 }) });
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No alerts yet');
  });
});
