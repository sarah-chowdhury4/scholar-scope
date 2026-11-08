import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { DatePipe, LowerCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { ApiService, type CatalogItem, type CatalogQuery, type CatalogTag } from '../../core/api.service';

const TAG_LABELS: Record<CatalogTag, string> = {
  essay: 'Essay',
  recommendation: 'Recommendation letter',
  transcript: 'Transcript',
  video: 'Video',
  financial: 'Financial documents',
  resume: 'Résumé / CV',
};

@Component({
  selector: 'app-discover',
  imports: [FormsModule, RouterLink, DatePipe, LowerCasePipe],
  template: `
    <div class="page-head">
      <div>
        <h1>Discover scholarships</h1>
        <p class="hint">Add any of these to <a routerLink="/">My scholarships</a>. Listed details are not yet verified: upload the official guidelines to confirm them.</p>
      </div>
      <a class="button secondary" routerLink="/scholarships/new">Not listed? Add your own</a>
    </div>

    <section class="card filters" aria-label="Search and filters">
      <div class="search">
        <label for="q">Search</label>
        <input id="q" type="search" placeholder="Name, provider or requirement (e.g. leadership, STEM, video)"
               [ngModel]="q()" (ngModelChange)="onSearch($event)" />
      </div>

      <div class="filter-grid">
        <div>
          <label for="deadline">Deadline</label>
          <select id="deadline" [ngModel]="deadline()" (ngModelChange)="deadline.set($event); reload()">
            <option value="upcoming">Any upcoming</option>
            <option value="30">Next 30 days</option>
            <option value="90">Next 90 days</option>
            <option value="all">Include closed</option>
          </select>
        </div>
        <div>
          <label for="gpa">My GPA</label>
          <input id="gpa" type="number" min="0" max="5" step="0.01" placeholder="e.g. 3.4"
                 [ngModel]="gpa()" (ngModelChange)="gpa.set($event === '' ? null : $event); reload()" />
        </div>
        <div>
          <label for="org">Provider</label>
          <select id="org" [ngModel]="organization()" (ngModelChange)="organization.set($event); reload()">
            <option value="">All providers</option>
            @for (o of organizations(); track o) {
              <option [value]="o">{{ o }}</option>
            }
          </select>
        </div>
        <div>
          <label for="sort">Sort by</label>
          <select id="sort" [ngModel]="sort()" (ngModelChange)="sort.set($event); reload()">
            <option value="deadline">Nearest deadline</option>
            <option value="name">Name</option>
            <option value="gpa">Lowest GPA requirement</option>
          </select>
        </div>
      </div>

      <fieldset>
        <legend>What the application asks for</legend>
        <div class="tag-filters">
          @for (t of tags; track t) {
            <label class="check tag" [class.on]="requires().includes(t)" [class.off]="excludes().includes(t)">
              <select [attr.aria-label]="labels[t]" [ngModel]="tagState(t)" (ngModelChange)="setTag(t, $event)">
                <option value="any">{{ labels[t] }}: any</option>
                <option value="requires">Must ask for {{ labels[t] | lowercase }}</option>
                <option value="excludes">No {{ labels[t] | lowercase }}</option>
              </select>
            </label>
          }
        </div>
      </fieldset>

      @if (hasFilters()) {
        <button type="button" class="link" (click)="clear()">Clear all filters</button>
      }
    </section>

    <p class="hint" role="status" aria-live="polite">
      @if (loading()) { Searching… } @else { {{ items().length }} of {{ total() }} scholarships }
    </p>
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }
    @if (!loading() && total() === 0) {
      <p class="card">The catalog is empty. Load it with <code>docker compose exec api npm run seed:catalog -- seed/dataset.csv</code>.</p>
    } @else if (!loading() && items().length === 0) {
      <p class="card">No scholarships match. Try fewer words or clear a filter.</p>
    }

    <ul class="cards">
      @for (s of items(); track s.catalogId) {
        <li class="card">
          <h2>{{ s.name }}</h2>
          <p class="muted">{{ s.organization }}</p>
          <p>
            @if (s.deadline) {
              Due <strong>{{ s.deadline | date: 'mediumDate' : 'UTC' }}</strong>
              @if (s.deadlinePassed) { <span class="badge unverified">Closed</span> }
            } @else {
              <span class="muted">No deadline listed</span>
            }
            @if (s.minGpa !== null) { · Min GPA {{ s.minGpa.toFixed(2) }} }
          </p>
          <p class="small">{{ s.promptOrMaterials }}</p>
          <p class="tags">
            @for (t of s.tags; track t) { <span class="chip">{{ labels[t] }}</span> }
          </p>
          @if (s.sourceUrl) {
            <p class="small"><a [href]="s.sourceUrl" target="_blank" rel="noopener noreferrer">Provider website</a> <span class="muted">(listed source, not yet verified)</span></p>
          }
          @if (s.addedScholarshipId) {
            <a class="button secondary" [routerLink]="['/scholarships', s.addedScholarshipId]">Added · open</a>
          } @else {
            <button type="button" (click)="add(s)" [disabled]="adding() === s.catalogId || s.deadlinePassed">
              {{ s.deadlinePassed ? 'Deadline passed' : adding() === s.catalogId ? 'Adding…' : 'Add to my scholarships' }}
            </button>
          }
        </li>
      }
    </ul>
  `,
})
export class Discover implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  protected readonly labels = TAG_LABELS;
  protected readonly tags = Object.keys(TAG_LABELS) as CatalogTag[];

  protected readonly items = signal<CatalogItem[]>([]);
  protected readonly total = signal(0);
  protected readonly organizations = signal<string[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly adding = signal<string | null>(null);

  protected readonly q = signal('');
  protected readonly deadline = signal<NonNullable<CatalogQuery['deadline']>>('upcoming');
  protected readonly gpa = signal<number | null>(null);
  protected readonly organization = signal('');
  protected readonly sort = signal<NonNullable<CatalogQuery['sort']>>('deadline');
  protected readonly requires = signal<CatalogTag[]>([]);
  protected readonly excludes = signal<CatalogTag[]>([]);

  private searchTimer: ReturnType<typeof setTimeout> | undefined;
  private requestNo = 0;

  async ngOnInit() {
    await this.reload();
  }

  ngOnDestroy() {
    clearTimeout(this.searchTimer);
  }

  onSearch(value: string) {
    this.q.set(value);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => void this.reload(), 300);
  }

  tagState(t: CatalogTag) {
    return this.requires().includes(t) ? 'requires' : this.excludes().includes(t) ? 'excludes' : 'any';
  }

  setTag(t: CatalogTag, state: 'any' | 'requires' | 'excludes') {
    this.requires.update((list) => (state === 'requires' ? [...new Set([...list, t])] : list.filter((x) => x !== t)));
    this.excludes.update((list) => (state === 'excludes' ? [...new Set([...list, t])] : list.filter((x) => x !== t)));
    void this.reload();
  }

  hasFilters() {
    return !!(this.q() || this.deadline() !== 'upcoming' || this.gpa() !== null || this.organization() || this.requires().length || this.excludes().length);
  }

  clear() {
    this.q.set('');
    this.deadline.set('upcoming');
    this.gpa.set(null);
    this.organization.set('');
    this.requires.set([]);
    this.excludes.set([]);
    void this.reload();
  }

  async reload() {
    const mine = ++this.requestNo;
    this.loading.set(true);
    this.error.set('');
    const gpa = this.gpa();
    try {
      const r = await this.api.catalog({
        q: this.q(),
        deadline: this.deadline(),
        gpa: gpa !== null && Number.isFinite(Number(gpa)) ? Number(gpa) : null,
        requires: this.requires(),
        excludes: this.excludes(),
        organization: this.organization(),
        sort: this.sort(),
      });
      if (mine !== this.requestNo) return; // a newer search already started
      this.items.set(r.items);
      this.total.set(r.total);
      this.organizations.set(r.organizations);
    } catch {
      if (mine === this.requestNo) this.error.set('Could not load scholarships. Check your filters and try again.');
    } finally {
      if (mine === this.requestNo) this.loading.set(false);
    }
  }

  async add(s: CatalogItem) {
    this.adding.set(s.catalogId);
    this.error.set('');
    try {
      const r = await this.api.addFromCatalog(s.catalogId);
      this.items.update((list) => list.map((x) => (x.catalogId === s.catalogId ? { ...x, addedScholarshipId: r.scholarshipId } : x)));
    } catch (err) {
      this.error.set(err instanceof HttpErrorResponse && err.error?.error ? err.error.error : 'Could not add that scholarship.');
    } finally {
      this.adding.set(null);
    }
  }
}
