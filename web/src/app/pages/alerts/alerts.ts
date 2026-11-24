import { PageLoading } from '../../core/page-loading';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ZonedDatePipe } from '../../core/zoned-date.pipe';
import { TimeZoneService } from '../../core/time-zone.service';
import { Router, RouterLink } from '@angular/router';
import { ApiService, apiMessage, type AlertItem } from '../../core/api.service';
import { AlertsStore } from '../../core/alerts.store';

/** Deadline reminders and requirement changes (FR-7.1, FR-7.2). Emails go out too, unless turned off in Profile. */
@Component({
  selector: 'app-alerts',
  imports: [ZonedDatePipe, RouterLink, PageLoading],
  template: `
    <div class="page-head">
      <div>
        <h1>Alerts</h1>
        <p class="hint">Deadline reminders 14, 7, 3 and 1 days ahead and on the day, and every change to a requirement. Email copies can be turned off in <a routerLink="/profile">Profile</a>.</p>
      </div>
      @if (unread() > 0) {
        <button type="button" class="secondary" [disabled]="busy()" (click)="readAll()">Mark all as read</button>
      }
    </div>

    @if (loading()) {
      <app-page-loading [cards]="2" />
    } @else if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    } @else if (items().length === 0) {
      <section class="card empty">
        <h2>No alerts yet</h2>
        <p>When a deadline gets close or a requirement changes, it shows up here.</p>
      </section>
    } @else {
      <ul class="alert-list">
        @for (a of items(); track a.id) {
          <li class="card" [class.unread]="!a.read" [class.changed]="a.type === 'change' && !a.read">
            <p>
              <span class="badge" [class]="a.type === 'change' ? 'changed' : 'needs_review'">{{ kind(a.type, a.daysLeft) }}</span>
              @if (!a.read) {
                <span class="badge unverified">New</span>
              }
              <span class="muted small">{{ a.createdAt | zonedDate: tz.zone() }}</span>
            </p>
            <h2>{{ a.title }}</h2>
            <p>{{ a.body }}</p>
            <div class="actions">
              @if (a.scholarshipId) {
                <button type="button" (click)="open(a)">{{ a.type === 'change' ? 'See what changed' : 'Open scholarship' }}</button>
              }
              @if (!a.read) {
                <button type="button" class="secondary" [disabled]="busy()" (click)="markRead(a)">Mark as read</button>
              }
            </div>
          </li>
        }
      </ul>
    }
  `,
})
export class AlertsPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly store = inject(AlertsStore);
  private readonly router = inject(Router);
  protected readonly tz = inject(TimeZoneService);
  protected readonly items = signal<AlertItem[]>([]);
  protected readonly unread = signal(0);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  async ngOnInit() {
    await this.load();
  }

  kind(type: string, daysLeft?: number | null) {
    if (type === 'change') return 'Requirement changed';
    if (!type.startsWith('deadline_')) return 'Notice';
    // A reminder sent late (the job was off on its day) says how many days were really left.
    const days = daysLeft ?? Number(type.slice('deadline_'.length));
    if (days === 0) return 'Due today';
    if (days === 1) return 'Due tomorrow';
    return `Due in ${days} days`;
  }

  async load() {
    this.loading.set(true);
    this.error.set('');
    try {
      const { items, unread } = await this.api.alerts();
      this.items.set(items);
      this.unread.set(unread);
      this.store.set(unread);
    } catch (err) {
      this.error.set(apiMessage(err, 'Could not load your alerts.'));
    } finally {
      this.loading.set(false);
    }
  }

  async markRead(alert: AlertItem) {
    this.busy.set(true);
    try {
      await this.api.markAlertRead(alert.id);
      this.items.update((items) => items.map((item) => (item.id === alert.id ? { ...item, read: true } : item)));
      this.unread.update((n) => Math.max(0, n - 1));
      this.store.set(this.unread());
    } catch (err) {
      this.error.set(apiMessage(err, 'Could not update that alert.'));
    } finally {
      this.busy.set(false);
    }
  }

  async readAll() {
    this.busy.set(true);
    try {
      await this.api.markAllAlertsRead();
      this.items.update((items) => items.map((item) => ({ ...item, read: true })));
      this.unread.set(0);
      this.store.set(0);
    } catch (err) {
      this.error.set(apiMessage(err, 'Could not update your alerts.'));
    } finally {
      this.busy.set(false);
    }
  }

  async open(alert: AlertItem) {
    // A change alert is marked read when the student confirms the change, not just by opening it.
    if (!alert.read && alert.type !== 'change') await this.markRead(alert);
    await this.router.navigate(['/scholarships', alert.scholarshipId]);
  }
}
