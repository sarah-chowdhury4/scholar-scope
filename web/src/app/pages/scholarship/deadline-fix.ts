import { Component, inject, input, output, signal } from '@angular/core';
import { ApiService, apiMessage, type Requirement } from '../../core/api.service';

/**
 * Where the application deadline came from, and a way to correct it, shown under the due date at the top of a
 * scholarship. The deadline is a date, not a task, so it is not on the checklist and has no tick box.
 */
@Component({
  selector: 'app-deadline-fix',
  template: `
    @let r = requirement();
    @if (editing()) {
      <form (submit)="save($event)" class="edit">
        <label for="dl-date">Due date</label>
        <input id="dl-date" name="date" type="date" [value]="date()" required />
        <label for="dl-time">Time (optional)</label>
        <input id="dl-time" name="time" type="time" [value]="stored()?.time ?? ''" />
        <label for="dl-tz">The scholarship's time zone (blank if not stated)</label>
        <input id="dl-tz" name="timezone" [value]="stored()?.sourceTimezone ?? ''" placeholder="America/New_York" />
        <p class="hint">Your correction is saved as a new version; the old date is kept in the history.</p>
        <div class="actions">
          <button type="submit" [disabled]="busy()">Save date</button>
          <button type="button" class="secondary" (click)="editing.set(false)">Cancel</button>
        </div>
      </form>
    } @else {
      <p class="rule-links small">
        @if (r.current.citation; as c) {
          @if (c.kind === 'catalog') {
            @if (c.sourceUrl) {
              <a [href]="c.sourceUrl" target="_blank" rel="noopener noreferrer">Official page</a>
            }
          } @else {
            <button type="button" class="link" (click)="openSource.emit(c)" [attr.title]="'“' + c.quote + '”'">Where this date is from</button>
          }
        }
        <button type="button" class="link" (click)="editing.set(true)">Wrong date? Fix it</button>
      </p>
    }
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }
  `,
})
export class DeadlineFix {
  private readonly api = inject(ApiService);
  readonly requirement = input.required<Requirement>();
  readonly scholarshipId = input.required<string>();
  readonly changed = output<void>();
  readonly openSource = output<{ sourceId: string; sourceVersionId: string }>();

  protected readonly editing = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected stored() {
    return this.requirement().current.value['deadline'] as
      | { utc?: string; date?: string | null; time?: string | null; sourceTimezone?: string | null }
      | undefined;
  }

  /** The date as written, in the scholarship's own zone (not converted to the student's). */
  protected date(): string {
    const d = this.stored();
    if (d?.date) return d.date;
    if (!d?.utc) return '';
    const moment = new Date(d.utc);
    if (Number.isNaN(moment.getTime())) return '';
    return new Intl.DateTimeFormat('en-CA', { timeZone: d.sourceTimezone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(moment);
  }

  async save(event: Event) {
    event.preventDefault();
    const form = new FormData(event.target as HTMLFormElement);
    const r = this.requirement();
    this.busy.set(true);
    this.error.set('');
    try {
      await this.api.reviewRequirement(this.scholarshipId(), r.id, {
        action: 'correct',
        label: r.label,
        deadline: {
          date: String(form.get('date') ?? ''),
          time: String(form.get('time') ?? '') || null,
          timezone: String(form.get('timezone') ?? '').trim() || null,
        },
      });
      this.editing.set(false);
      this.changed.emit();
    } catch (err) {
      this.error.set(apiMessage(err, 'Could not save the date.'));
    } finally {
      this.busy.set(false);
    }
  }
}
