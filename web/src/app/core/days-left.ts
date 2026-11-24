import { Component, computed, inject, input } from '@angular/core';
import { daysLeft, type DeadlineInput } from './deadline-format';
import { TimeZoneService } from './time-zone.service';

/** "12 days left" for a deadline, counted in the student's time zone and coloured as it gets close. */
@Component({
  selector: 'app-days-left',
  template: `
    @let v = view();
    <span class="days-left" [class]="v.level">
      @if (!v.passed && v.days > 1) {
        <strong>{{ v.days }}</strong> {{ v.days === 1 ? 'day' : 'days' }} left
      } @else {
        {{ v.text }}
      }
    </span>
  `,
})
export class DaysLeft {
  private readonly tz = inject(TimeZoneService);
  readonly deadline = input.required<DeadlineInput>();
  protected readonly view = computed(() => daysLeft(this.deadline(), this.tz.zone()));
}
