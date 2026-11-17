import { Component, DestroyRef, effect, inject } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from './core/auth.service';
import { AlertsStore } from './core/alerts.store';
import { ToastService } from './core/toast.service';

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
    effect(() => {
      if (this.auth.signedIn()) void this.alerts.refresh();
      else this.alerts.set(0);
    });
    inject(DestroyRef).onDestroy(() => {
      sub.unsubscribe();
      clearInterval(timer);
    });
  }
}
