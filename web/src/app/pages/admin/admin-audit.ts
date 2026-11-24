import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { PageLoading } from '../../core/page-loading';
import { apiMessage } from '../../core/api.service';
import { AdminApi, type AdminAuditItem } from '../../core/admin-api.service';

const ACTIONS: Record<string, string> = {
  'admin.catalog.added': 'Added a scholarship',
  'admin.catalog.updated': 'Edited a scholarship',
  'admin.catalog.removed': 'Removed a scholarship from Discover',
  'admin.catalog.restored': 'Restored a scholarship to Discover',
  'admin.settings.updated': 'Changed settings',
  'admin.role.granted': 'Made someone an admin',
  'admin.role.removed': 'Removed an admin',
  'admin.user.deletion_requested': 'Queued an account for deletion',
};

/** Read-only list of what admins changed, newest first. */
@Component({
  selector: 'app-admin-audit',
  imports: [DatePipe, PageLoading],
  styles: `
    .list { list-style: none; padding: 0; margin: 0; }
    .item { padding: 12px 0; border-top: 1px solid var(--line); }
    .item:first-child { border-top: 0; }
    .item p { margin: 2px 0; font-size: 14px; }
    code { font-size: 12px; word-break: break-all; }
    details { margin-top: 6px; font-size: 13px; }
    pre { white-space: pre-wrap; word-break: break-word; background: var(--field); padding: 8px 10px; border-radius: 8px; font-size: 12px; }
  `,
  template: `
    @if (loading()) {
      <app-page-loading [cards]="2" />
    } @else if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    } @else if (items().length === 0) {
      <section class="card empty"><h2>No admin actions yet</h2><p>Changes made on these pages show up here.</p></section>
    } @else {
      <section class="card">
        <ul class="list">
          @for (a of items(); track a.id) {
            <li class="item">
              <p><strong>{{ label(a.action) }}</strong> · {{ a.adminEmail ?? 'unknown admin' }}</p>
              <p class="muted">{{ a.at | date: 'medium' }} · <code>{{ a.resource }}</code></p>
              @if (a.before || a.after) {
                <details>
                  <summary>Details</summary>
                  @if (a.before) { <p>Before</p><pre>{{ json(a.before) }}</pre> }
                  @if (a.after) { <p>After</p><pre>{{ json(a.after) }}</pre> }
                </details>
              }
            </li>
          }
        </ul>
      </section>
      <p class="hint">The last {{ items().length }} admin actions. Entries are kept for a year.</p>
    }
  `,
})
export class AdminAudit implements OnInit {
  private readonly api = inject(AdminApi);
  protected readonly items = signal<AdminAuditItem[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');

  async ngOnInit() {
    try {
      this.items.set((await this.api.audit(100)).items);
    } catch (err) {
      this.error.set(apiMessage(err, 'Could not load the audit log.'));
    } finally {
      this.loading.set(false);
    }
  }

  label(action: string) {
    return ACTIONS[action] ?? action;
  }

  json(v: unknown) {
    return JSON.stringify(v, null, 2);
  }
}
