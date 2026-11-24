import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PageLoading } from '../../core/page-loading';
import { ToastService } from '../../core/toast.service';
import { apiMessage } from '../../core/api.service';
import { AdminApi, type AdminSettings } from '../../core/admin-api.service';
import { AdminPage } from './admin';

/** App-wide limits and the AI switch. Changes reach the worker within about 30 seconds. */
@Component({
  selector: 'app-admin-settings',
  imports: [FormsModule, PageLoading],
  styles: `
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0 20px; }
  `,
  template: `
    @if (loading()) {
      <app-page-loading [cards]="1" />
    } @else if (form(); as f) {
      <form class="card" (ngSubmit)="save()">
        <h2>AI features</h2>
        <label class="check">
          <input type="checkbox" name="aiEnabled" [(ngModel)]="f.aiEnabled" />
          <span>AI is on: reading guidelines, document checks, change summaries and essay drafts.</span>
        </label>
        @if (!f.aiEnabled) {
          <label for="s-reason">Message students see while AI is paused</label>
          <input id="s-reason" name="aiPausedReason" maxlength="200" [(ngModel)]="f.aiPausedReason"
                 placeholder="For example: AI checks are paused for maintenance until Monday." />
        }

        <h2 style="margin-top: 28px">Limits</h2>
        <div class="grid">
          <div>
            <label for="s-max">Scholarships per student</label>
            <input id="s-max" name="max" type="number" min="1" max="100" required [(ngModel)]="f.maxScholarshipsPerStudent" />
          </div>
          <div>
            <label for="s-drafts">Essay drafts per student per day</label>
            <input id="s-drafts" name="drafts" type="number" min="0" max="200" required [(ngModel)]="f.dailyDraftLimit" />
          </div>
          <div>
            <label for="s-pages">Pages read per student per day</label>
            <input id="s-pages" name="pages" type="number" min="0" max="1000" required [(ngModel)]="f.dailyPageLimit" />
          </div>
        </div>

        <h2 style="margin-top: 28px">Deadline reminders</h2>
        <label for="s-offsets">Days before a deadline to remind students (comma-separated)</label>
        <input id="s-offsets" name="offsets" [(ngModel)]="offsets" placeholder="14, 7, 3, 1, 0" />
        <p class="hint">Up to six, between 0 and 60 days. 0 sends a reminder on the deadline day itself.</p>

        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }
        <div class="card-actions actions">
          <button type="submit" [disabled]="saving()">{{ saving() ? 'Saving…' : 'Save settings' }}</button>
        </div>
      </form>
    } @else if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }
  `,
})
export class AdminSettingsPage implements OnInit {
  private readonly api = inject(AdminApi);
  private readonly toasts = inject(ToastService);
  private readonly shell = inject(AdminPage, { optional: true });

  protected readonly form = signal<AdminSettings | null>(null);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected offsets = '';

  async ngOnInit() {
    try {
      this.fill(await this.api.settings());
    } catch (err) {
      this.error.set(apiMessage(err, 'Could not load the settings.'));
    } finally {
      this.loading.set(false);
    }
  }

  private fill(s: AdminSettings) {
    this.form.set({ ...s, aiPausedReason: s.aiPausedReason ?? '' });
    this.offsets = s.alertOffsetsDays.join(', ');
  }

  async save() {
    const f = this.form();
    if (!f) return;
    const days = this.offsets
      .split(/[,\s]+/)
      .filter(Boolean)
      .map(Number);
    if (days.some((d) => !Number.isInteger(d))) {
      this.error.set('Reminder days must be whole numbers, like 14, 7, 3, 1, 0.');
      return;
    }
    this.saving.set(true);
    this.error.set('');
    try {
      const saved = await this.api.saveSettings({
        aiEnabled: f.aiEnabled,
        aiPausedReason: f.aiEnabled ? null : (f.aiPausedReason ?? '').trim() || null,
        maxScholarshipsPerStudent: Number(f.maxScholarshipsPerStudent),
        dailyDraftLimit: Number(f.dailyDraftLimit),
        dailyPageLimit: Number(f.dailyPageLimit),
        alertOffsetsDays: days,
      });
      this.fill(saved);
      this.toasts.show('Settings saved. The worker picks them up within 30 seconds.');
      void this.shell?.refresh();
    } catch (err) {
      this.error.set(apiMessage(err, 'Could not save the settings.'));
    } finally {
      this.saving.set(false);
    }
  }
}
