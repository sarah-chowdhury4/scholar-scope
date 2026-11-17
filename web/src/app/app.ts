import { Component, DestroyRef, effect, inject } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from './core/auth.service';
import { AlertsStore } from './core/alerts.store';
import { ToastService } from './core/toast.service';
import { TimeZoneService } from './core/time-zone.service';
import { ApiService } from './core/api.service';

const ALERT_POLL_MS = 3 * 60 * 1000;

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly auth = inject(AuthService);
  protected readonly alerts = inject(AlertsStore);
  protected readonly toasts = inject(ToastService);

  constructor() {
    const router = inject(Router);
    const sub = router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe(() => {
      if (this.auth.signedIn()) void this.alerts.refresh();
    });
    const timer = setInterval(() => {
      if (this.auth.signedIn()) void this.alerts.refresh();
    }, ALERT_POLL_MS);
    const tz = inject(TimeZoneService);
    const api = inject(ApiService);
    effect(() => {
      if (this.auth.signedIn()) {
        void this.alerts.refresh();
        // Dates are shown in the zone saved on the profile (or this device's until one is saved).
        api.me().then((me) => tz.setFromProfile(me)).catch(() => tz.reset());
      } else {
        this.alerts.set(0);
        tz.reset();
      }
    });
    inject(DestroyRef).onDestroy(() => {
      sub.unsubscribe();
      clearInterval(timer);
    });
  }
}
