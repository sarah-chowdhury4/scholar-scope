import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AdminApi, type AdminOverview } from '../../core/admin-api.service';

/** The admin dashboard: a few numbers at the top, then one tab per job. */
@Component({
  selector: 'app-admin',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  styles: `
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin: 0 0 20px; }
    .stat { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 14px 16px; }
    .stat b { display: block; font-size: 26px; line-height: 1.1; color: var(--green); }
    .stat span { font-size: 13px; color: var(--ink-soft); }
    .stat.off b { color: var(--danger); }
    .tabs { display: flex; flex-wrap: wrap; gap: 4px; border-bottom: 1px solid var(--line); margin: 0 0 20px; }
    .tabs a { padding: 10px 14px; text-decoration: none; color: var(--ink-soft); font-weight: 600; border-bottom: 3px solid transparent; margin-bottom: -1px; }
    .tabs a:hover { color: var(--green); }
    .tabs a.active { color: var(--green); border-bottom-color: var(--green); }
  `,
  template: `
    <div class="page-head">
      <div>
        <h1>Admin</h1>
        <p class="hint">Manage the scholarship catalog, app settings and accounts. Every change here is recorded in the audit log.</p>
      </div>
    </div>

    @if (overview(); as o) {
      <div class="stats" aria-label="Overview">
        <div class="stat"><b>{{ o.students }}</b><span>accounts ({{ o.admins }} admin{{ o.admins === 1 ? '' : 's' }})</span></div>
        <div class="stat"><b>{{ o.catalogListed }}</b><span>scholarships in Discover{{ o.catalogRemoved ? ', ' + o.catalogRemoved + ' removed' : '' }}</span></div>
        <div class="stat" [class.off]="o.pendingDeletions > 0"><b>{{ o.pendingDeletions }}</b><span>accounts waiting for deletion</span></div>
        <div class="stat" [class.off]="!o.aiEnabled"><b>{{ o.aiEnabled ? 'On' : 'Paused' }}</b><span>AI features</span></div>
      </div>
    }

    <nav class="tabs" aria-label="Admin sections">
      <a routerLink="catalog" routerLinkActive="active">Catalog</a>
      <a routerLink="settings" routerLinkActive="active">Settings</a>
      <a routerLink="students" routerLinkActive="active">Students</a>
      <a routerLink="audit" routerLinkActive="active">Audit log</a>
    </nav>
    <router-outlet (activate)="refresh()" />
  `,
})
export class AdminPage {
  private readonly api = inject(AdminApi);
  protected readonly overview = signal<AdminOverview | null>(null);

  /** Runs when a tab opens, and again after a tab changes something, so the numbers stay current. */
  async refresh() {
    try {
      this.overview.set(await this.api.overview());
    } catch {
      // The numbers are a convenience; each tab shows its own errors.
    }
  }
}
