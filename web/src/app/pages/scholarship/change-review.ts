import { Component, OnChanges, inject, input, output, signal } from '@angular/core';
import { ZonedDatePipe } from '../../core/zoned-date.pipe';
import { TimeZoneService } from '../../core/time-zone.service';
import { ApiService, apiMessage, type RequirementChange } from '../../core/api.service';

/** Open changes for one scholarship: old and new wording side by side, an AI summary, and "I've seen this". */
@Component({
  selector: 'app-change-review',
  imports: [ZonedDatePipe],
  template: `
    @if (items().length) {
      <section class="card changed" aria-labelledby="changes-title">
        <h2 id="changes-title">What changed ({{ items().length }})</h2>
        <p class="hint">The official guidelines changed. Compare the wording, update your application if needed, then confirm you have seen it.</p>
        @for (c of items(); track c.id) {
          <article class="change">
            <h3>{{ c.label }}</h3>
            <p class="muted small">Found {{ c.detectedAt | zonedDate: tz.zone() }}</p>
            @if (c.aiSummary; as ai) {
              <p class="notice small">
                <strong>AI summary{{ ai.importance === 'important' ? ' · important' : '' }}:</strong> {{ ai.summary }}
                @if (ai.whatToDo) {
                  <br />{{ ai.whatToDo }}
                }
                <br /><span class="muted">Written by AI from the two quotes below. The quotes are what counts.</span>
              </p>
            }
            <div class="side-by-side">
              <div>
                <p class="small"><strong>Before</strong></p>
                <blockquote>
                  @for (seg of c.diff.before; track $index) {
                    @if (seg.type === 'removed') {
                      <del>{{ seg.text }}</del>
                    } @else {
                      <span>{{ seg.text }}</span>
                    }
                  } @empty {
                    <em class="muted">Not in the earlier version.</em>
                  }
                </blockquote>
                @if (c.from; as from) {
                  <button class="link" type="button" (click)="openSource.emit(from)">Open earlier copy</button>
                }
              </div>
              <div>
                <p class="small"><strong>Now</strong></p>
                <blockquote>
                  @for (seg of c.diff.after; track $index) {
                    @if (seg.type === 'added') {
                      <ins>{{ seg.text }}</ins>
                    } @else {
                      <span>{{ seg.text }}</span>
                    }
                  } @empty {
                    <em class="muted">No longer in the guidelines.</em>
                  }
                </blockquote>
                @if (c.to; as to) {
                  <button class="link" type="button" (click)="openSource.emit(to)">Open new copy</button>
                }
              </div>
            </div>
            <button type="button" [disabled]="busy() === c.id" (click)="acknowledge(c)">I've seen this change</button>
          </article>
        }
        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }
      </section>
    }
  `,
})
export class ChangeReview implements OnChanges {
  private readonly api = inject(ApiService);
  protected readonly tz = inject(TimeZoneService);
  readonly scholarshipId = input.required<string>();
  /** Bump to reload (the page passes its requirement list so a reload follows every refresh). */
  readonly refreshKey = input<unknown>(null);
  readonly changed = output<void>();
  readonly openSource = output<{ sourceId: string; sourceVersionId: string }>();

  protected readonly items = signal<RequirementChange[]>([]);
  protected readonly busy = signal<string | null>(null);
  protected readonly error = signal('');

  async ngOnChanges() {
    try {
      this.items.set((await this.api.changes(this.scholarshipId())).items);
    } catch {
      this.items.set([]);
    }
  }

  async acknowledge(change: RequirementChange) {
    this.busy.set(change.id);
    this.error.set('');
    try {
      await this.api.acknowledgeChange(this.scholarshipId(), change.id);
      this.items.update((items) => items.filter((item) => item.id !== change.id));
      this.changed.emit();
    } catch (err) {
      this.error.set(apiMessage(err, 'Could not save that.'));
    } finally {
      this.busy.set(null);
    }
  }
}
