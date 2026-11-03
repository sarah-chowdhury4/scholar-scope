import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { ApiService, type Scholarship } from '../../core/api.service';

@Component({
  selector: 'app-dashboard',
  imports: [ReactiveFormsModule, RouterLink, DatePipe],
  template: `
    <h1>Your scholarships</h1>
    <p class="hint">Sorted by nearest deadline. Anything marked <span class="badge unverified">Unverified</span> has no source yet.</p>

    @if (loading()) {
      <p>Loading…</p>
    } @else if (items().length === 0) {
      <p class="card">No scholarships yet. Add your first one below.</p>
    } @else {
      <ul class="cards">
        @for (s of items(); track s.id) {
          <li class="card" [class.changed]="s.counts.changed > 0">
            <h2><a [routerLink]="['/scholarships', s.id]">{{ s.name }}</a></h2>
            <p class="muted">{{ s.provider }}</p>
            @if (s.deadline) {
              <p>
                Due <strong>{{ s.deadline.utc | date: 'mediumDate' }}</strong>
                <span class="badge" [class]="s.deadline.verification">{{ label(s.deadline.verification) }}</span>
              </p>
            } @else {
              <p class="muted">No deadline yet</p>
            }
            <p class="counts">
              @if (s.counts.changed > 0) {
                <span class="badge changed">{{ s.counts.changed }} changed</span>
              }
              <span>{{ s.counts.open }} open</span> · <span>{{ s.readinessPct }}% ready</span>
            </p>
            @if (s.recheck?.status === 'unreachable') {
              <p class="warning" role="status">We couldn't re-check this page. Check the official site.</p>
            }
            <button class="link" type="button" (click)="archive(s)">Archive</button>
          </li>
        }
      </ul>
    }

    <section class="card">
      <h2>Add a scholarship</h2>
      <form [formGroup]="form" (ngSubmit)="add()">
        <label for="name">Name</label>
        <input id="name" formControlName="name" required />
        <label for="provider">Provider</label>
        <input id="provider" formControlName="provider" required />
        <label for="url">Official page (optional)</label>
        <input id="url" type="url" formControlName="url" placeholder="https://" />
        <label for="deadline">Deadline (optional)</label>
        <input id="deadline" type="date" formControlName="deadline" />
        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }
        <button type="submit" [disabled]="form.invalid">Add</button>
      </form>
    </section>
  `,
})
export class Dashboard implements OnInit {
  private readonly api = inject(ApiService);
  protected readonly items = signal<Scholarship[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', Validators.required],
    provider: ['', Validators.required],
    url: [''],
    deadline: [''],
  });

  async ngOnInit() {
    await this.load();
  }

  label(v: string) {
    return v === 'verified' ? 'From source' : v === 'needs_review' ? 'Needs review' : 'Unverified';
  }

  async load() {
    this.loading.set(true);
    try {
      this.items.set((await this.api.scholarships()).items);
    } finally {
      this.loading.set(false);
    }
  }

  async add() {
    const v = this.form.getRawValue();
    this.error.set('');
    try {
      await this.api.createScholarship({
        name: v.name,
        provider: v.provider,
        url: v.url || null,
        deadline: v.deadline ? { date: v.deadline, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } : null,
      });
      this.form.reset();
      await this.load();
    } catch (err) {
      this.error.set(err instanceof HttpErrorResponse && err.error?.error ? err.error.error : 'Could not add the scholarship.');
    }
  }

  async archive(s: Scholarship) {
    if (!confirm(`Archive "${s.name}"? You can still see its history later.`)) return;
    await this.api.archiveScholarship(s.id);
    await this.load();
  }
}
