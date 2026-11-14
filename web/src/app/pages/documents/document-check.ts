import { Component, input } from '@angular/core';
import type { DocumentCheck, DocumentFinding } from '../../core/api.service';

/** Shows the AI check of one saved file: a status line, then each finding with the text it came from. */
@Component({
  selector: 'app-document-check',
  template: `
    @if (check(); as c) {
      <div class="doc-check" [attr.data-severity]="c.severity">
        @switch (c.status) {
          @case ('queued') {
            <p class="muted small" role="status">AI check waiting to start…</p>
          }
          @case ('running') {
            <p class="muted small" role="status">AI check reading the file…</p>
          }
          @case ('paused') {
            <p class="warning small">AI check paused. {{ c.reason }}</p>
          }
          @case ('failed') {
            <p class="warning small">AI check did not finish. {{ c.reason }}</p>
          }
          @case ('done') {
            <p class="small">
              <strong>AI check:</strong>
              <span class="badge" [class]="badge(c.severity)">{{ summary(c) }}</span>
            </p>
          }
        }
        @if (c.status === 'done') {
          <ul class="findings">
            @for (f of all(); track $index) {
              <li [class]="f.severity">
                <span class="sr-only">{{ severityLabel(f.severity) }}:</span>
                {{ f.message }}
                @if (f.quote) {
                  <span class="muted small"> — “{{ f.quote }}”{{ f.page ? ' (page ' + f.page + ')' : '' }}</span>
                }
              </li>
            }
          </ul>
        }
      </div>
    } @else if (extra().length) {
      <ul class="findings">
        @for (f of extra(); track $index) {
          <li [class]="f.severity">{{ f.message }}</li>
        }
      </ul>
    }
  `,
})
export class DocumentCheckView {
  readonly check = input<DocumentCheck | null>(null);
  /** Findings that compare this file with one scholarship (deadline, GPA…). */
  readonly extra = input<DocumentFinding[]>([]);

  all(): DocumentFinding[] {
    const order = { problem: 0, warning: 1, ok: 2 } as const;
    return [...this.extra(), ...(this.check()?.findings ?? [])].sort((a, b) => order[a.severity] - order[b.severity]);
  }

  badge(severity: string | null) {
    return severity === 'problem' ? 'unverified' : severity === 'warning' ? 'needs_review' : 'verified';
  }

  summary(check: DocumentCheck) {
    const problems = this.all().filter((f) => f.severity === 'problem').length;
    const warnings = this.all().filter((f) => f.severity === 'warning').length;
    if (problems) return `${problems} problem${problems === 1 ? '' : 's'}`;
    if (warnings) return `${warnings} thing${warnings === 1 ? '' : 's'} to look at`;
    return check.findings.length ? 'Looks right' : 'Nothing to flag';
  }

  severityLabel(severity: string) {
    return severity === 'problem' ? 'Problem' : severity === 'warning' ? 'Check this' : 'OK';
  }
}
