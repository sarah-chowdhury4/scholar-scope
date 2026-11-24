import { Pipe, type PipeTransform } from '@angular/core';
import { formatMoment } from './deadline-format';

/** `{{ value | zonedDate: tz.zone() }}`: a moment in the student's time zone. Pass `false` to drop the time. */
@Pipe({ name: 'zonedDate' })
export class ZonedDatePipe implements PipeTransform {
  transform(value: string | Date | null | undefined, zone: string, withTime = true): string {
    return formatMoment(value, zone, withTime);
  }
}
