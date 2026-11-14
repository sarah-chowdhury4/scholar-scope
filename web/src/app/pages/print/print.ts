import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService, type Requirement, type Scholarship } from '../../core/api.service';

type Row = Scholarship & { requirements: Requirement[] };

/** A plain checklist of every tracked scholarship, laid out for printing or "Save as PDF". */
@Component({
  selector: 'app-print',
  imports: [DatePipe, RouterLink],
  template: `
    <div class="no-print actions">
      <a routerLink="/">← My scholarships</a>
      <button type="button" (click)="print()" [disabled]="loading()">Print or save as PDF</button>
    </div>
    <h1>Scholarship checklist</h1>
    <p class="muted">Printed {{ today | date: 'longDate' }}. “From source” items quote the official guidelines; check “Unverified” items yourself.</p>
    @if (loading()) {
      <p>Loading…</p>
    }
    @for (s of rows(); track s.id) {
      <section class="print-block">
        <h2>{{ s.name }}</h2>
        <p class="muted">
          {{ s.provider }} ·
          @if (s.deadline) {
            Due {{ s.deadline.utc | date: 'medium' }} ({{ label(s.deadline.verification) }})
          } @else {
            No deadline yet
          }
        </p>
        @if (s.requirements.length === 0) {
          <p class="muted">No requirements yet.</p>
        }
        <ul class="print-list">
          @for (r of s.requirements; track r.id) {
            <li>
              <span class="box" aria-hidden="true">{{ r.readiness === 'ready' ? '☑' : '☐' }}</span>
              <strong>{{ r.label }}</strong> — {{ label(r.verification) }}
              @if (r.current.citation; as c) {
                <div class="muted small">“{{ c.quote }}”{{ c.page ? ' (page ' + c.page + ')' : '' }}</div>
              }
            </li>
          }
        </ul>
      </section>
    }
  `,
})
export class PrintPage implements OnInit {
  private readonly api = inject(ApiService);
  protected readonly rows = signal<Row[]>([]);
  protected readonly loading = signal(true);
  protected readonly today = new Date();

  async ngOnInit() {
    try {
      const { items } = await this.api.scholarships();
      this.rows.set(await Promise.all(items.map((item) => this.api.scholarship(item.id))));
    } finally {
      this.loading.set(false);
    }
  }

  label(v: string) {
    return v === 'verified' ? 'From source' : v === 'needs_review' ? 'Needs review' : 'Unverified';
  }

  print() {
    window.print();
  }
}
