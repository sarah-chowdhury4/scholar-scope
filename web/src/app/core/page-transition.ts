import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { finalize, retry, throwError, timer } from 'rxjs';

/**
 * Smooth page changes. When a page opens, it stays invisible until its first data has arrived (or 400 ms
 * have passed, after which its loading placeholder shows), then fades in once, complete. So a page never
 * fades in empty and then has its content pop in.
 */
@Injectable({ providedIn: 'root' })
export class PageTransition {
  /** True while the newly opened page is waiting for its data. */
  readonly entering = signal(false);
  private pending = 0;
  private settle: ReturnType<typeof setTimeout> | undefined;
  private giveUp: ReturnType<typeof setTimeout> | undefined;

  /** Called when a new page has been placed on screen. */
  start(): void {
    this.entering.set(true);
    // A timer left from the previous page (clicked away quickly) must not reveal this one early.
    clearTimeout(this.settle);
    clearTimeout(this.giveUp);
    this.giveUp = setTimeout(() => this.reveal(), 400);
    this.check();
  }

  requestStarted(): void {
    this.pending++;
    clearTimeout(this.settle);
  }

  requestEnded(): void {
    this.pending = Math.max(0, this.pending - 1);
    this.check();
  }

  private check(): void {
    if (!this.entering() || this.pending > 0) return;
    // Wait a moment: a page often asks for a second thing right after the first one arrives.
    clearTimeout(this.settle);
    this.settle = setTimeout(() => {
      if (this.pending === 0) this.reveal();
    }, 60);
  }

  private reveal(): void {
    clearTimeout(this.settle);
    clearTimeout(this.giveUp);
    this.entering.set(false);
  }
}

/** Counts API reads for PageTransition, and retries a read the API refused for being too busy (429). */
export const pageLoadInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith('/api/') || req.method !== 'GET') return next(req);
  const pages = inject(PageTransition);
  pages.requestStarted();
  return next(req).pipe(
    retry({
      count: 2,
      delay: (err) => {
        if (!(err instanceof HttpErrorResponse) || err.status !== 429) return throwError(() => err);
        const seconds = Number(err.headers.get('Retry-After')) || 2;
        return timer(Math.min(seconds, 5) * 1000);
      },
    }),
    finalize(() => pages.requestEnded()),
  );
};
