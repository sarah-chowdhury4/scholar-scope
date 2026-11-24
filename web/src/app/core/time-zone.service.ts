import { Injectable, signal } from '@angular/core';

export const DEVICE_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

/**
 * The time zone dates are shown in: the one saved on the student's profile, or this device's
 * until they save one. The app shell loads it after sign-in; the profile page updates it on save.
 */
@Injectable({ providedIn: 'root' })
export class TimeZoneService {
  readonly zone = signal(DEVICE_ZONE);
  /** True once the zone comes from the profile rather than the device. */
  readonly fromProfile = signal(false);

  setFromProfile(me: { timezone: string; timezoneChosen: boolean }): void {
    if (me.timezoneChosen && me.timezone) {
      this.zone.set(me.timezone);
      this.fromProfile.set(true);
    } else {
      this.zone.set(DEVICE_ZONE);
      this.fromProfile.set(false);
    }
  }

  reset(): void {
    this.zone.set(DEVICE_ZONE);
    this.fromProfile.set(false);
  }
}
