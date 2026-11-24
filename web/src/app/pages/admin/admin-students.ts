import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PageLoading } from '../../core/page-loading';
import { ToastService } from '../../core/toast.service';
import { AuthService } from '../../core/auth.service';
import { apiMessage } from '../../core/api.service';
import { AdminApi, type AdminStudent } from '../../core/admin-api.service';
import { AdminPage } from './admin';

/**
 * Accounts: who signed up, when, and how many scholarships they track. Admins never see a student's documents,
 * profile or scholarships from here.
 */
@Component({
  selector: 'app-admin-students',
  imports: [FormsModule, DatePipe, PageLoading],
  styles: `
    .search { max-width: 420px; margin-bottom: 16px; }
    .search label { margin-top: 0; }
    .list { list-style: none; padding: 0; margin: 0; }
    .item { display: grid; grid-template-columns: 1fr auto; gap: 8px 16px; padding: 14px 0; border-top: 1px solid var(--line); }
    .item:first-child { border-top: 0; }
    .item h2 { font-size: 16px; margin: 0; word-break: break-all; }
    .item p { margin: 4px 0 0; font-size: 14px; }
    .confirm { grid-column: 1 / -1; background: var(--bad-bg); border-radius: var(--radius); padding: 12px 14px; }
    .confirm label { margin-top: 0; }
    @media (max-width: 640px) { .item { grid-template-columns: 1fr; } }
  `,
  template: `
    <div class="search">
      <label for="u-q">Search by email</label>
      <input id="u-q" type="search" [ngModel]="q()" (ngModelChange)="q.set($event)" />
    </div>

    @if (loading()) {
      <app-page-loading [cards]="2" />
    } @else if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    } @else {
      <p class="hint" role="status">{{ shown().length }} {{ shown().length === 1 ? 'account' : 'accounts' }}</p>
      <section class="card">
        <ul class="list">
          @for (u of shown(); track u.uid) {
            <li class="item">
              <div>
                <h2>
                  {{ u.email ?? '(no email)' }}
                  @if (u.admin) { <span class="badge verified">Admin</span> }
                  @if (u.uid === myUid()) { <span class="badge">You</span> }
                  @if (u.deletionRequestedAt) { <span class="badge changed">Deletion pending</span> }
                  @else if (u.disabled) { <span class="badge unverified">Locked</span> }
                </h2>
                <p class="muted">
                  Joined {{ u.createdAt | date: 'mediumDate' }}
                  · last sign-in {{ u.lastSignInAt ? (u.lastSignInAt | date: 'medium') : 'never' }}
                  · {{ u.scholarships }} {{ u.scholarships === 1 ? 'scholarship' : 'scholarships' }}
                </p>
              </div>
              @if (u.uid !== myUid() && !u.deletionRequestedAt) {
                <div class="actions">
                  <button type="button" class="secondary" [disabled]="busy() === u.uid" (click)="toggleAdmin(u)">
                    {{ u.admin ? 'Remove admin' : 'Make admin' }}
                  </button>
                  <button type="button" class="danger" [disabled]="busy() === u.uid" (click)="askDelete(u)">Delete account</button>
                </div>
              }
              @if (deleting() === u.uid) {
                <form class="confirm" (ngSubmit)="confirmDelete(u)">
                  <label [attr.for]="'del-' + u.uid">
                    This locks the account now and erases all of its data and files when the deletion job runs. It cannot be undone.
                    Type <strong>{{ u.email }}</strong> to confirm.
                  </label>
                  <input [id]="'del-' + u.uid" name="confirm" autocomplete="off" [(ngModel)]="confirmText" />
                  <div class="actions">
                    <button type="submit" class="danger" [disabled]="busy() === u.uid || confirmText.trim().toLowerCase() !== (u.email ?? '').toLowerCase()">
                      Delete permanently
                    </button>
                    <button type="button" class="secondary" (click)="deleting.set(null)">Cancel</button>
                  </div>
                </form>
              }
            </li>
          } @empty {
            <li class="item"><p>No accounts match.</p></li>
          }
        </ul>
      </section>
      <p class="hint">Removing someone's admin role signs them out everywhere, so it takes effect at once. A new admin sees the Admin page after they sign in again.</p>
    }
  `,
})
export class AdminStudents implements OnInit {
  private readonly api = inject(AdminApi);
  private readonly toasts = inject(ToastService);
  private readonly auth = inject(AuthService);
  private readonly shell = inject(AdminPage, { optional: true });

  protected readonly items = signal<AdminStudent[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly q = signal('');
  protected readonly busy = signal<string | null>(null);
  protected readonly deleting = signal<string | null>(null);
  protected readonly myUid = computed(() => this.auth.user()?.uid ?? null);
  protected confirmText = '';

  protected readonly shown = computed(() => {
    const q = this.q().trim().toLowerCase();
    return q ? this.items().filter((u) => (u.email ?? '').toLowerCase().includes(q)) : this.items();
  });

  async ngOnInit() {
    await this.load();
  }

  private async load() {
    try {
      this.items.set((await this.api.students()).items);
      this.error.set('');
    } catch (err) {
      this.error.set(apiMessage(err, 'Could not load the accounts.'));
    } finally {
      this.loading.set(false);
    }
  }

  async toggleAdmin(u: AdminStudent) {
    const make = !u.admin;
    const question = make
      ? `Make ${u.email} an admin? They will be able to change the catalog, settings and accounts.`
      : `Remove admin from ${u.email}? They will be signed out everywhere.`;
    if (!confirm(question)) return;
    this.busy.set(u.uid);
    try {
      await this.api.setAdmin(u.uid, make);
      this.toasts.show(make ? `${u.email} is now an admin.` : `${u.email} is no longer an admin.`);
      await this.load();
      void this.shell?.refresh();
    } catch (err) {
      this.toasts.show(apiMessage(err, 'Could not change the role.'), true);
    } finally {
      this.busy.set(null);
    }
  }

  askDelete(u: AdminStudent) {
    this.confirmText = '';
    this.deleting.set(u.uid);
  }

  async confirmDelete(u: AdminStudent) {
    this.busy.set(u.uid);
    try {
      await this.api.deleteStudent(u.uid, this.confirmText);
      this.toasts.show(`${u.email} is locked and queued for deletion.`);
      this.deleting.set(null);
      await this.load();
      void this.shell?.refresh();
    } catch (err) {
      this.toasts.show(apiMessage(err, 'Could not delete the account.'), true);
    } finally {
      this.busy.set(null);
    }
  }
}
