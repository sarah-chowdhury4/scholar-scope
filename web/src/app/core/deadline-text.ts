import { Component, computed, inject, input } from '@angular/core';
import { describeDeadline, type DeadlineInput } from './deadline-format';
import { TimeZoneService } from './time-zone.service';

/** A deadline in the student's time zone, with the scholarship's own time underneath when it differs. */
@Component({
  selector: 'app-deadline',
  template: `
    @let v = view();
    <strong>{{ v.main }}</strong>
    @if (v.original) {
      <span class="deadline-note">{{ v.original }}</span>
    }
    @if (v.unconfirmed) {
      <span class="deadline-note">Time zone not confirmed. Check the official page.</span>
    }
  `,
  styles: `
    :host { display: inline; }
    .deadline-note { display: block; font-size: 13px; color: var(--ink-soft); font-weight: 400; }
  `,
})
export class DeadlineText {
  private readonly tz = inject(TimeZoneService);
  readonly deadline = input.required<DeadlineInput>();
  /** Show the time as well as the date. */
  readonly withTime = input(true);
  protected readonly view = computed(() => describeDeadline(this.deadline(), this.tz.zone(), this.withTime()));
}
