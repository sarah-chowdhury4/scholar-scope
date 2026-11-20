import { Component, DestroyRef, inject, input, signal } from '@angular/core';

/**
 * Placeholder while a page loads its data. Shows nothing for the first 200 ms (most loads are faster, so
 * nothing flashes), then grey blocks shaped like the page, so the layout doesn't collapse and jump.
 */
@Component({
  selector: 'app-page-loading',
  template: `
    <div class="skeleton" role="status" [attr.aria-label]="label()">
      @if (visible()) {
        <div class="sk-line sk-title"></div>
        <div class="sk-line sk-short"></div>
        <div class="sk-grid">
          @for (card of cardList(); track $index) {
            <div class="sk-card">
              <div class="sk-line"></div>
              <div class="sk-line sk-short"></div>
              <div class="sk-line sk-shorter"></div>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class PageLoading {
  readonly label = input('Loading');
  /** How many card placeholders to draw. */
  readonly cards = input(3);
  protected readonly visible = signal(false);
  protected cardList() {
    return Array.from({ length: this.cards() });
  }

  constructor() {
    const timer = setTimeout(() => this.visible.set(true), 200);
    inject(DestroyRef).onDestroy(() => clearTimeout(timer));
  }
}
