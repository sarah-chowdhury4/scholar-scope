import { Component, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ZonedDatePipe } from '../../core/zoned-date.pipe';
import { TimeZoneService } from '../../core/time-zone.service';
import { ApiService, apiMessage, type Requirement, type RequirementVersion } from '../../core/api.service';

/** One requirement on a scholarship page: its source quote, the student's review, and the checklist tick. */
@Component({
  selector: 'li[appRequirementCard]',
  imports: [ZonedDatePipe, RouterLink],
  host: { class: 'card', '[class.changed]': 'requirement().changeFlag?.active' },
  template: `
    @let r = requirement();
      <div class="req-head">
        @if (r.assessment; as a) {
          <!-- Judged from the student's documents: no tick box, the result is shown below. -->
          <span class="status-dot" [class]="a.status" role="img" [attr.aria-label]="statusWord(a.status)">{{ statusIcon(a.status) }}</span>
          <strong class="req-label">{{ r.label }}</strong>
        } @else {
          <label class="check">
            <input
              type="checkbox"
              [checked]="r.readiness === 'ready'"
              [disabled]="busy() || r.changeFlag?.active"
              (change)="toggleReady($event)"
              [attr.aria-label]="'Done: ' + r.label"
            />
            <strong>{{ r.label }}</strong>
          </label>
        }
        <span>
          <span class="badge" [class]="r.verification" [attr.title]="verificationHelp(r.verification)">{{ verificationLabel(r.verification) }}</span>
          @if (r.changeFlag?.active) {
            <span class="badge changed">Changed</span>
          }
        </span>
      </div>

      @if (facts().length) {
        <p class="small">{{ facts().join(' · ') }}</p>
      }

      @if (r.assessment; as a) {
        <div class="assessment" [class]="a.status" role="status">
          <p><strong>{{ statusWord(a.status) }}.</strong> {{ a.message }}</p>
          @if (a.quote) {
            <p class="small evidence">
              From your {{ (a.documentTitle ?? 'document').toLowerCase() }}: “{{ a.quote }}”{{ a.page ? ' (page ' + a.page + ')' : '' }}
            </p>
          }
          @if (a.status !== 'met') {
            <a class="small" routerLink="/documents">Go to Documents</a>
          }
        </div>
      }

      @if (r.current.citation; as c) {
        <blockquote>
          “{{ c.quote }}”
          <footer>
            {{ c.page ? 'Page ' + c.page : 'Whole document' }}{{ c.ocrDerived ? ' · read by OCR' : '' }} ·
            <button class="link" type="button" (click)="openSource.emit(c)">Open source</button>
          </footer>
        </blockquote>
      } @else {
        <p class="muted small">
          This rule is not from the official guidelines yet. Upload them or save the scholarship's page to confirm it.
        </p>
      }

      @if (r.review; as review) {
        <p class="muted small">{{ reviewLabel(review.status) }}{{ review.at ? ' · ' + (review.at | zonedDate: tz.zone() : false) : '' }}</p>
      }

      @if (editing()) {
        <form (submit)="saveCorrection($event)" class="edit">
          <label [attr.for]="'label-' + r.id">What is required</label>
          <input [id]="'label-' + r.id" name="label" [value]="r.label" maxlength="300" required />
          @if (r.kind === 'essay' || r.kind === 'word_limit') {
            <label [attr.for]="'words-' + r.id">Word limit</label>
            <input [id]="'words-' + r.id" name="wordLimit" type="number" min="1" [value]="wordLimit() ?? ''" />
          }
          @if (r.kind === 'eligibility') {
            <label [attr.for]="'gpa-' + r.id">Minimum GPA</label>
            <input [id]="'gpa-' + r.id" name="minGpa" type="number" step="0.01" min="0" [value]="minGpa() ?? ''" />
          }
          @if (r.kind === 'deadline') {
            <label [attr.for]="'date-' + r.id">Due date</label>
            <input [id]="'date-' + r.id" name="date" type="date" [value]="deadlineDate()" required />
            <label [attr.for]="'time-' + r.id">Time (optional)</label>
            <input [id]="'time-' + r.id" name="time" type="time" [value]="deadlineTime()" />
            <label [attr.for]="'tz-' + r.id">The scholarship's time zone (blank if not stated)</label>
            <input [id]="'tz-' + r.id" name="timezone" [value]="deadlineZone()" placeholder="America/New_York" />
          }
          <p class="hint">The source quote stays attached. Your correction is saved as a new version; the old one is kept.</p>
          <div class="actions">
            <button type="submit" [disabled]="busy()">Save correction</button>
            <button type="button" class="secondary" (click)="editing.set(false)">Cancel</button>
          </div>
        </form>
      } @else {
        <!-- Checking the rule itself (is the scholarship's requirement right?) is secondary: small links. -->
        <p class="rule-links small">
          @if (r.verification !== 'verified' && r.review?.status !== 'confirmed') {
            <span class="muted">Is this rule right?</span>
            <button type="button" class="link" [disabled]="busy()" (click)="review('confirm')">Looks right</button>
          }
          <button type="button" class="link" [disabled]="busy()" (click)="editing.set(true)">Fix</button>
          <button type="button" class="link" [disabled]="busy()" (click)="reject()">Not a requirement</button>
          <button type="button" class="link" (click)="toggleHistory()">{{ history() ? 'Hide history' : 'History' }}</button>
        </p>
      }

      @if (history(); as versions) {
        <ol class="history small">
          @for (v of versions; track v.id) {
            <li>
              <strong>Version {{ v.versionNo }}</strong> · {{ originLabel(v.origin) }}{{ v.createdAt ? ' · ' + (v.createdAt | zonedDate: tz.zone()) : '' }}
              <div>{{ v.value['text'] ?? '' }}</div>
              @if (v.citation) {
                <div class="muted">“{{ v.citation.quote }}”</div>
              }
            </li>
          }
        </ol>
      }

      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }
      <ng-content />
  `,
})
export class RequirementCard {
  private readonly api = inject(ApiService);
  protected readonly tz = inject(TimeZoneService);
  readonly requirement = input.required<Requirement>();
  readonly scholarshipId = input.required<string>();
  /** Fired after any change so the page reloads counts and the list. */
  readonly changed = output<void>();
  readonly openSource = output<{ sourceId: string; sourceVersionId: string }>();

  protected readonly busy = signal(false);
  protected readonly editing = signal(false);
  protected readonly error = signal('');
  protected readonly history = signal<RequirementVersion[] | null>(null);

  statusWord(status: string) {
    if (status === 'met') return 'Met';
    if (status === 'not_met') return 'Not met';
    if (status === 'check') return 'Check this';
    return 'Not checked yet';
  }

  statusIcon(status: string) {
    if (status === 'met') return '✓';
    if (status === 'not_met') return '✕';
    if (status === 'check') return '!';
    return '○';
  }

  verificationHelp(v: string) {
    if (v === 'verified') return 'This rule is quoted from the official guidelines.';
    if (v === 'needs_review') return 'Read from the guidelines, but please check the wording.';
    return 'This rule is not from the official guidelines yet.';
  }

  verificationLabel(v: string) {
    return v === 'verified' ? 'From source' : v === 'needs_review' ? 'Needs review' : 'Unverified';
  }

  reviewLabel(status: string) {
    if (status === 'confirmed') return 'You confirmed this';
    if (status === 'corrected') return 'You corrected this';
    if (status === 'restored') return 'You put this back on the list';
    return '';
  }

  originLabel(origin: string) {
    if (origin === 'student_correction') return 'your correction';
    if (origin === 'refetch') return 'from the re-checked page';
    return 'read from the source';
  }

  facts(): string[] {
    const value = this.requirement().current.value;
    const out: string[] = [];
    const label = this.requirement().label.toLowerCase();
    const numbers = (label.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
    const words = this.wordLimit();
    if (words && !numbers.includes(words)) out.push(`Up to ${words} words`);
    const gpa = this.minGpa();
    if (gpa != null && !(label.includes('gpa') && numbers.includes(gpa))) out.push(`Minimum GPA ${gpa}`);
    if (typeof value['details'] === 'string' && value['details']) out.push(value['details']);
    return out;
  }

  wordLimit(): number | null {
    const limit = this.requirement().current.value['wordLimit'] as { max?: number } | null | undefined;
    return typeof limit?.max === 'number' ? limit.max : null;
  }

  minGpa(): number | null {
    const gpa = this.requirement().current.value['minGpa'];
    return typeof gpa === 'number' ? gpa : null;
  }

  private storedDeadline() {
    return this.requirement().current.value['deadline'] as
      | { utc?: string; date?: string | null; time?: string | null; sourceTimezone?: string | null }
      | undefined;
  }

  /** The deadline as written, in the scholarship's own zone (not converted to the student's). */
  deadlineDate(): string {
    const d = this.storedDeadline();
    if (d?.date) return d.date;
    if (!d?.utc) return '';
    const moment = new Date(d.utc);
    if (Number.isNaN(moment.getTime())) return '';
    return new Intl.DateTimeFormat('en-CA', { timeZone: d.sourceTimezone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(moment);
  }

  deadlineTime(): string {
    return this.storedDeadline()?.time ?? '';
  }

  deadlineZone(): string {
    return this.storedDeadline()?.sourceTimezone ?? '';
  }

  async toggleReady(event: Event) {
    const box = event.target as HTMLInputElement;
    await this.run(() => this.api.setRequirementReadiness(this.scholarshipId(), this.requirement().id, box.checked ? 'ready' : 'missing'), () => {
      box.checked = !box.checked;
    });
  }

  async review(action: 'confirm') {
    await this.run(() => this.api.reviewRequirement(this.scholarshipId(), this.requirement().id, { action }));
  }

  async reject() {
    if (!confirm(`Remove "${this.requirement().label}" from this checklist? You can put it back later.`)) return;
    await this.run(() => this.api.reviewRequirement(this.scholarshipId(), this.requirement().id, { action: 'reject' }));
  }

  async saveCorrection(event: Event) {
    event.preventDefault();
    const form = new FormData(event.target as HTMLFormElement);
    const r = this.requirement();
    const body: Record<string, unknown> = { action: 'correct', label: String(form.get('label') ?? '').trim() };
    const words = form.get('wordLimit');
    if (words !== null) body['wordLimit'] = String(words).trim() ? Number(words) : null;
    const gpa = form.get('minGpa');
    if (gpa !== null) body['minGpa'] = String(gpa).trim() ? Number(gpa) : null;
    if (r.kind === 'deadline') {
      body['deadline'] = {
        date: String(form.get('date') ?? ''),
        time: String(form.get('time') ?? '') || null,
        timezone: String(form.get('timezone') ?? '').trim() || null,
      };
    }
    const ok = await this.run(() => this.api.reviewRequirement(this.scholarshipId(), r.id, body));
    if (ok) {
      this.editing.set(false);
      this.history.set(null);
    }
  }

  async toggleHistory() {
    if (this.history()) {
      this.history.set(null);
      return;
    }
    try {
      this.history.set((await this.api.requirementVersions(this.scholarshipId(), this.requirement().id)).items);
    } catch (err) {
      this.error.set(apiMessage(err, 'Could not load the history.'));
    }
  }

  private async run(action: () => Promise<unknown>, undo?: () => void): Promise<boolean> {
    this.busy.set(true);
    this.error.set('');
    try {
      await action();
      this.changed.emit();
      return true;
    } catch (err) {
      undo?.();
      this.error.set(apiMessage(err, 'Could not save that.'));
      return false;
    } finally {
      this.busy.set(false);
    }
  }
}
