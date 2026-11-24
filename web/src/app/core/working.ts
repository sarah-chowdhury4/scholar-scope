import { Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';

/** What the app is doing while a job runs, with the messages to rotate through for it. */
export const WORK_STEPS = {
  upload: ['Uploading your file…'],
  scan: ['Checking the file for viruses…', 'Making sure the file is safe to open…'],
  documentCheck: [
    'The AI is reading your document…',
    'Looking for the name, school and dates…',
    'Checking what kind of document this is…',
    'Finding the GPA and grades…',
    'Matching each detail to the text in the file…',
    'Almost there: double-checking every quote…',
  ],
  fetchPage: ['Opening the scholarship page…', 'Saving a copy of the page…', 'Looking for eligibility and FAQ pages…'],
  requirements: [
    'The AI is reading the guidelines…',
    'Finding deadlines and time zones…',
    'Listing essays, letters and documents…',
    'Checking eligibility rules like GPA…',
    'Quoting each requirement from the source…',
    'Almost there: matching quotes to the page…',
  ],
  draft: [
    'Reading your notes…',
    'Planning the essay…',
    'Writing a first draft from your notes…',
    'Linking each sentence to the note it came from…',
    'Almost there: tidying the draft…',
  ],
} as const;

/**
 * Shows that something is happening during a slow job: an animated bar, a message that changes every few
 * seconds, and the time so far. Screen readers hear the label once, not every rotating message.
 */
@Component({
  selector: 'app-working',
  template: `
    <div class="working" [class.compact]="compact()" role="status">
      <span class="sr-only">{{ label() }}</span>
      <div class="working-row" aria-hidden="true">
        <span class="working-dots"><i></i><i></i><i></i></span>
        <!-- A new element per message, so each one fades in. -->
        @for (m of [message()]; track m) {
          <span class="working-text">{{ m }}</span>
        }
        @if (seconds() >= 5) {
          <span class="working-time">{{ seconds() }} s</span>
        }
      </div>
      <div class="working-bar" aria-hidden="true"><span></span></div>
      @if (hint() && seconds() >= 20) {
        <p class="working-hint">{{ hint() }}</p>
      }
    </div>
  `,
})
export class WorkingIndicator {
  /** Messages to rotate through (the first one shows first). */
  readonly steps = input.required<readonly string[]>();
  /** What a screen reader announces once. Defaults to the first message. */
  readonly announce = input<string | null>(null);
  /** Shown after 20 seconds so a long wait doesn't feel stuck. */
  readonly hint = input<string | null>('This can take up to a minute. You can keep using the site; the result appears here when it is ready.');
  readonly compact = input(false);

  protected readonly index = signal(0);
  protected readonly seconds = signal(0);
  protected readonly message = computed(() => {
    const steps = this.steps();
    // Stay on the last message ("Almost there…") once all have been shown.
    return steps[Math.min(this.index(), steps.length - 1)] ?? '';
  });
  protected readonly label = computed(() => this.announce() ?? this.steps()[0] ?? 'Working…');

  constructor() {
    const started = Date.now();
    const tick = setInterval(() => this.seconds.set(Math.floor((Date.now() - started) / 1000)), 1000);
    const rotate = setInterval(() => this.index.update((i) => i + 1), 3500);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(tick);
      clearInterval(rotate);
    });
    // New steps (the job moved on, e.g. from the virus scan to the AI check): start their messages from the top.
    effect(() => {
      this.steps();
      this.index.set(0);
    });
  }
}
