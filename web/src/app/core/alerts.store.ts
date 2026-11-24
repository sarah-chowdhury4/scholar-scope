import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';

/** Unread alert count for the top menu. Refreshed on navigation and every few minutes while signed in. */
@Injectable({ providedIn: 'root' })
export class AlertsStore {
  private readonly api = inject(ApiService);
  readonly unread = signal(0);

  async refresh(): Promise<void> {
    try {
      this.unread.set((await this.api.unreadAlerts()).unread);
    } catch {
      // Keep the last count; the menu must never break because alerts failed to load.
    }
  }

  set(count: number) {
    this.unread.set(count);
  }
}
