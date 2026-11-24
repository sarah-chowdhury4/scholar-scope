import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
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
  imports: [FormsModule, RouterLink, DatePipe],
  styles: `
    .team-badge { margin: 0 0 6px; }
    .search-row { display: grid; grid-template-columns: 1fr 220px auto auto; gap: 12px; align-items: end; }
    .search-row label { margin-top: 0; }
    .filters-toggle { min-width: 120px; }
    .archived-toggle[aria-pressed='true'] { background: var(--green); color: #fff; }
    .filters-toggle .count { display: inline-grid; place-items: center; min-width: 22px; height: 22px; padding: 0 6px; border-radius: 99px; background: var(--green); color: #fff; font-size: 12px; }
    .active-filters { margin-top: 14px; }
    .filter-panel { margin-top: 18px; padding-top: 4px; border-top: 1px solid var(--line); }
    .filter-panel .filter-grid label { margin-top: 14px; }
    .tag-grid { display: grid; gap: 0 12px; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); }
    .tag-row label { margin: 12px 0 6px; }
    @media (max-width: 700px) {
      .search-row { grid-template-columns: 1fr auto; }
      .search-row .search { grid-column: 1 / -1; }
      .search-row .sort { grid-column: 1 / -1; }
    }
    @media (max-width: 420px) {
      .search-row { grid-template-columns: 1fr 1fr; }
    }
  `,
  template: `
    <div class="page-head">
      <div>
        <h1>Discover scholarships</h1>
        <p class="hint">Add any of these to <a routerLink="/">My scholarships</a>. Scholarships marked <span class="badge verified">Verified</span> were collected and checked by the ScholarScope team against their official pages.</p>
      </div>
      <a class="button secondary" routerLink="/scholarships/new">Not listed? Add your own</a>
    </div>

    <section class="card filters" aria-label="Search and filters">
      <div class="search-row">
        <div class="search">
          <label for="q">Search</label>
          <input id="q" type="search" placeholder="Name, provider or requirement (e.g. leadership, STEM, video)"
                 [ngModel]="q()" (ngModelChange)="onSearch($event)" />
        </div>
        <div class="sort">
          <label for="sort">Sort by</label>
          <select id="sort" [ngModel]="sort()" (ngModelChange)="sort.set($event); reload()">
            <option value="deadline">Nearest deadline</option>
            <option value="name">Name</option>
            <option value="gpa">Lowest GPA requirement</option>
          </select>
        </div>
        <button type="button" class="secondary filters-toggle" aria-controls="filter-panel" [attr.aria-expanded]="showFilters()" (click)="showFilters.set(!showFilters())">
          Filters
          @if (activeFilters().length) {
            <span class="count" aria-hidden="true">{{ activeFilters().length }}</span>
            <span class="sr-only">({{ activeFilters().length }} on)</span>
          }
          <span aria-hidden="true">{{ showFilters() ? '▴' : '▾' }}</span>
        </button>
        <button type="button" class="secondary archived-toggle" [attr.aria-pressed]="archived()" (click)="toggleArchived()"
                title="Scholarships whose deadline has passed">
          Archived
        </button>
      </div>

      @if (activeFilters().length) {
        <div class="chips active-filters" aria-label="Filters in use">
          @for (f of activeFilters(); track f.key) {
            <button type="button" class="chip picked" [attr.aria-label]="'Remove filter: ' + f.label" (click)="removeFilter(f.key)">
              {{ f.label }} <b aria-hidden="true">×</b>
            </button>
          }
          <button type="button" class="link" (click)="clear()">Clear all</button>
        </div>
      }

      <div id="filter-panel" class="filter-panel" [hidden]="!showFilters()">
        <div class="filter-grid">
          <div>
            <label for="deadline">Deadline</label>
            <select id="deadline" [ngModel]="deadline()" (ngModelChange)="deadline.set($event); reload()" [disabled]="archived()">
              <option value="upcoming">Any upcoming</option>
              <option value="30">Next 30 days</option>
              <option value="90">Next 90 days</option>
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
        </div>

        <h3>What the application asks for</h3>
        <div class="tag-grid">
          @for (t of tags; track t) {
            <div class="tag-row">
              <label [attr.for]="'tag-' + t">{{ labels[t] }}</label>
              <select [id]="'tag-' + t" [ngModel]="tagState(t)" (ngModelChange)="setTag(t, $event)">
                <option value="any">Either way</option>
                <option value="requires">Must ask for it</option>
                <option value="excludes">Must not ask for it</option>
              </select>
            </div>
          }
        </div>
      </div>
    </section>

    <p class="hint" role="status" aria-live="polite">
      @if (loading()) {
        Searching…
      } @else if (archived()) {
        {{ items().length }} archived {{ items().length === 1 ? 'scholarship' : 'scholarships' }}, deadline passed ·
        <button type="button" class="link" (click)="toggleArchived()">Back to open scholarships</button>
      } @else {
        {{ items().length }} {{ items().length === 1 ? 'scholarship' : 'scholarships' }}
      }
    </p>
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }
    @if (!loading() && total() === 0) {
      <p class="card">The catalog is empty. Load the team dataset with <code>docker compose exec api npm run seed:catalog</code>.</p>
    } @else if (!loading() && items().length === 0) {
      <p class="card">{{ archived() && !q() && !activeFilters().length ? 'No archived scholarships. None of the deadlines have passed yet.' : 'No scholarships match. Try fewer words or clear a filter.' }}</p>
    }

    <ul class="cards">
      @for (s of items(); track s.catalogId) {
        <li class="card">
          <h2>{{ s.name }}</h2>
          @if (s.teamVerified) {
            <span class="badge verified team-badge" title="Collected and checked by the ScholarScope team against the official page">Verified</span>
          }
          <p class="muted">{{ s.organization }}</p>
          <p>
            @if (s.deadline) {
              Due <strong>{{ s.deadline | date: 'mediumDate' }}</strong>
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
            <p class="small">
              <a [href]="s.sourceUrl" target="_blank" rel="noopener noreferrer">{{ s.teamVerified ? 'Official page' : 'Provider website' }}</a>
              @if (!s.teamVerified) {
                <span class="muted">(listed source, not yet verified)</span>
              }
            </p>
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
  protected readonly deadline = signal<'upcoming' | '30' | '90'>('upcoming');
  /** Archived: show only scholarships whose deadline has passed, instead of the open ones. */
  protected readonly archived = signal(false);
  protected readonly gpa = signal<number | null>(null);
  protected readonly organization = signal('');
  protected readonly sort = signal<NonNullable<CatalogQuery['sort']>>('deadline');
  protected readonly requires = signal<CatalogTag[]>([]);
  protected readonly excludes = signal<CatalogTag[]>([]);
  /** The filter panel stays closed until the student asks for it. Filters in use show as chips either way. */
  protected readonly showFilters = signal(false);

  protected readonly activeFilters = computed(() => {
    const out: { key: string; label: string }[] = [];
    const deadline = this.deadline();
    if (!this.archived() && deadline === '30') out.push({ key: 'deadline', label: 'Due in 30 days' });
    if (!this.archived() && deadline === '90') out.push({ key: 'deadline', label: 'Due in 90 days' });
    const gpa = this.gpa();
    if (gpa !== null && `${gpa}` !== '') out.push({ key: 'gpa', label: `My GPA ${gpa}` });
    if (this.organization()) out.push({ key: 'org', label: this.organization() });
    for (const t of this.requires()) out.push({ key: 'tag:' + t, label: `Asks for ${this.labels[t].toLowerCase()}` });
    for (const t of this.excludes()) out.push({ key: 'tag:' + t, label: `No ${this.labels[t].toLowerCase()}` });
    return out;
  });

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

  toggleArchived() {
    this.archived.set(!this.archived());
    void this.reload();
  }

  tagState(t: CatalogTag) {
    return this.requires().includes(t) ? 'requires' : this.excludes().includes(t) ? 'excludes' : 'any';
  }

  setTag(t: CatalogTag, state: 'any' | 'requires' | 'excludes') {
    this.requires.update((list) => (state === 'requires' ? [...new Set([...list, t])] : list.filter((x) => x !== t)));
    this.excludes.update((list) => (state === 'excludes' ? [...new Set([...list, t])] : list.filter((x) => x !== t)));
    void this.reload();
  }

  removeFilter(key: string) {
    if (key === 'deadline') this.deadline.set('upcoming');
    else if (key === 'gpa') this.gpa.set(null);
    else if (key === 'org') this.organization.set('');
    else if (key.startsWith('tag:')) {
      const t = key.slice(4) as CatalogTag;
      this.requires.update((list) => list.filter((x) => x !== t));
      this.excludes.update((list) => list.filter((x) => x !== t));
    }
    void this.reload();
  }

  clear() {
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
        deadline: this.archived() ? 'past' : this.deadline(),
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
