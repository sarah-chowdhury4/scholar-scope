import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService, type Scholarship } from '../../core/api.service';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, DatePipe],
  template: `
    <div class="page-head">
      <div>
        <h1>My scholarships</h1>
        @if (!loading() && items().length > 0) {
          <p class="hint">
            {{ items().length }} of {{ limit }} · sorted by nearest deadline · <span class="badge unverified">Unverified</span> means no source yet
          </p>
        }
      </div>
      @if (items().length > 0) {
        <div class="actions">
          <a class="button" routerLink="/discover">Discover scholarships</a>
          <a class="button secondary" routerLink="/scholarships/new">Add your own</a>
        </div>
      }
    </div>
    @if (profileNote()) {
      <p class="notice">
        Your profile still needs {{ profileNote() }}.
        <a routerLink="/profile">Update your profile</a>
        so recommendations and domestic or international rules have the facts they need.
      </p>
    }

    @if (loading()) {
      <p>Loading…</p>
    } @else if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    } @else if (items().length === 0) {
      <section class="card empty">
        <h2>Your dashboard is empty</h2>
        <p>Start by finding scholarships to track. You can follow up to {{ limit }}.</p>
        <div class="actions">
          <a class="button" routerLink="/discover">Discover scholarships</a>
          <a class="button secondary" routerLink="/scholarships/new">Add one that isn't listed</a>
        </div>
      </section>
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
  `,
})
export class Dashboard implements OnInit {
  private readonly api = inject(ApiService);
  protected readonly items = signal<Scholarship[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly profileNote = signal('');
  protected readonly limit = 15;

  async ngOnInit() {
    await this.load();
  }

  label(v: string) {
    return v === 'verified' ? 'From source' : v === 'needs_review' ? 'Needs review' : 'Unverified';
  }

  async load() {
    this.loading.set(true);
    this.error.set('');
    try {
      this.items.set((await this.api.scholarships()).items);
      await this.loadProfileNote();
    } catch {
      this.error.set('Could not load your scholarships. Is the API running?');
    } finally {
      this.loading.set(false);
    }
  }

  private async loadProfileNote() {
    try {
      const me = await this.api.me();
      this.profileNote.set(me.readinessPercent < 100 ? me.missingForRecommendations.join('; ') : '');
    } catch {
      this.profileNote.set('');
    }
  }

  async archive(s: Scholarship) {
    if (!confirm(`Archive "${s.name}"? You can still see its history later.`)) return;
    await this.api.archiveScholarship(s.id);
    await this.load();
  }
}
