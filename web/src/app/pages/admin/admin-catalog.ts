import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PageLoading } from '../../core/page-loading';
import { ToastService } from '../../core/toast.service';
import { apiMessage } from '../../core/api.service';
import { AdminApi, type AdminCatalogInput, type AdminCatalogItem } from '../../core/admin-api.service';
import { AdminPage } from './admin';

type Draft = { id: string | null; name: string; organization: string; deadline: string; minGpa: string; promptOrMaterials: string; sourceUrl: string; verified: boolean };

const EMPTY: Draft = { id: null, name: '', organization: '', deadline: '', minGpa: '', promptOrMaterials: '', sourceUrl: '', verified: false };

/** Add, edit, remove and restore the scholarships students see on Discover. */
@Component({
  selector: 'app-admin-catalog',
  imports: [FormsModule, DatePipe, PageLoading],
  styles: `
    .toolbar { display: flex; flex-wrap: wrap; gap: 12px; align-items: end; margin-bottom: 16px; }
    .toolbar .search { flex: 1 1 260px; }
    .toolbar label { margin-top: 0; }
    .list { list-style: none; padding: 0; margin: 0; }
    .item { display: grid; grid-template-columns: 1fr auto; gap: 8px 16px; align-items: start; padding: 14px 0; border-top: 1px solid var(--line); }
    .item:first-child { border-top: 0; }
    .item h2 { font-size: 16px; margin: 0; }
    .item p { margin: 4px 0 0; font-size: 14px; }
    .item.removed h2, .item.removed p { opacity: 0.6; }
    .id { font-family: ui-monospace, monospace; font-size: 12px; color: var(--ink-soft); margin-right: 6px; }
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 16px; }
    .form-grid .wide { grid-column: 1 / -1; }
    @media (max-width: 640px) {
      .item { grid-template-columns: 1fr; }
      .form-grid { grid-template-columns: 1fr; }
    }
  `,
  template: `
    @if (draft(); as d) {
      <section class="card" aria-labelledby="form-title">
        <h2 id="form-title">{{ d.id ? 'Edit ' + d.id : 'Add a scholarship' }}</h2>
        <p class="hint">Students who already added this scholarship keep their own copy. Once you save, restarting the site no longer replaces this entry from the dataset file.</p>
        <form (ngSubmit)="save()" class="form-grid">
          <div class="wide">
            <label for="c-name">Scholarship name</label>
            <input id="c-name" name="name" required [(ngModel)]="d.name" />
          </div>
          <div>
            <label for="c-org">Provider</label>
            <input id="c-org" name="organization" required [(ngModel)]="d.organization" />
          </div>
          <div>
            <label for="c-url">Official page</label>
            <input id="c-url" name="sourceUrl" type="url" placeholder="https://" [(ngModel)]="d.sourceUrl" />
          </div>
          <div>
            <label for="c-deadline">Application deadline</label>
            <input id="c-deadline" name="deadline" type="date" [(ngModel)]="d.deadline" />
          </div>
          <div>
            <label for="c-gpa">Minimum GPA (optional)</label>
            <input id="c-gpa" name="minGpa" type="number" min="0" max="5" step="0.01" [(ngModel)]="d.minGpa" />
          </div>
          <div class="wide">
            <label for="c-materials">What the application asks for</label>
            <textarea id="c-materials" name="promptOrMaterials" rows="4" [(ngModel)]="d.promptOrMaterials"
                      placeholder="Essay prompt, recommendation letters, transcript…"></textarea>
            <p class="hint">Filters on Discover (essay, transcript, video…) are worked out from this text.</p>
          </div>
          <div class="wide">
            <label class="check">
              <input type="checkbox" name="verified" [(ngModel)]="d.verified" />
              <span>Verified: checked against the official page by the ScholarScope team. Students see the Verified badge, and its items count as sourced.</span>
            </label>
          </div>
          @if (formError()) {
            <p class="error wide" role="alert">{{ formError() }}</p>
          }
          <div class="actions wide">
            <button type="submit" [disabled]="saving()">{{ saving() ? 'Saving…' : d.id ? 'Save changes' : 'Add to Discover' }}</button>
            <button type="button" class="secondary" (click)="draft.set(null)">Cancel</button>
          </div>
        </form>
      </section>
    }

    <div class="toolbar">
      <div class="search">
        <label for="c-q">Search</label>
        <input id="c-q" type="search" placeholder="Name, provider or ID" [ngModel]="q()" (ngModelChange)="q.set($event)" />
      </div>
      <label class="check"><input type="checkbox" [ngModel]="showRemoved()" (ngModelChange)="showRemoved.set($event)" /> <span>Show removed</span></label>
      <button type="button" (click)="startAdd()">Add a scholarship</button>
    </div>

    @if (loading()) {
      <app-page-loading [cards]="2" />
    } @else if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    } @else {
      <p class="hint" role="status">{{ shown().length }} {{ shown().length === 1 ? 'scholarship' : 'scholarships' }}</p>
      <section class="card">
        <ul class="list">
          @for (s of shown(); track s.catalogId) {
            <li class="item" [class.removed]="s.removedAt">
              <div>
                <h2>
                  <span class="id">{{ s.catalogId }}</span>{{ s.name }}
                  @if (s.teamVerified) { <span class="badge verified">Verified</span> } @else { <span class="badge unverified">Unverified</span> }
                  @if (s.removedAt) { <span class="badge changed">Removed</span> }
                </h2>
                <p class="muted">
                  {{ s.organization }} ·
                  {{ s.deadline ? 'Due ' + (s.deadline | date: 'mediumDate') : 'No deadline' }}
                  @if (s.minGpa !== null) { · Min GPA {{ s.minGpa.toFixed(2) }} }
                </p>
                <p class="small muted">
                  {{ s.managedBy === 'admin' ? 'Managed here' : 'From the dataset file' }}
                  @if (s.updatedAt) { · updated {{ s.updatedAt | date: 'mediumDate' }} }
                </p>
              </div>
              <div class="actions">
                <button type="button" class="secondary" (click)="startEdit(s)">Edit</button>
                @if (s.removedAt) {
                  <button type="button" class="secondary" [disabled]="busy() === s.catalogId" (click)="setRemoved(s, false)">Restore</button>
                } @else {
                  <button type="button" class="danger" [disabled]="busy() === s.catalogId" (click)="setRemoved(s, true)">Remove</button>
                }
              </div>
            </li>
          } @empty {
            <li class="item"><p>No scholarships match.</p></li>
          }
        </ul>
      </section>
    }
  `,
})
export class AdminCatalog implements OnInit {
  private readonly api = inject(AdminApi);
  private readonly toasts = inject(ToastService);
  private readonly shell = inject(AdminPage, { optional: true });

  protected readonly items = signal<AdminCatalogItem[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly q = signal('');
  protected readonly showRemoved = signal(false);
  protected readonly draft = signal<Draft | null>(null);
  protected readonly saving = signal(false);
  protected readonly formError = signal('');
  protected readonly busy = signal<string | null>(null);

  protected readonly shown = computed(() => {
    const words = this.q().toLowerCase().split(/\s+/).filter(Boolean);
    return this.items().filter((s) => {
      if (s.removedAt && !this.showRemoved()) return false;
      const hay = `${s.catalogId} ${s.name} ${s.organization}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  });

  async ngOnInit() {
    await this.load();
  }

  private async load() {
    try {
      this.items.set((await this.api.catalog()).items);
      this.error.set('');
    } catch (err) {
      this.error.set(apiMessage(err, 'Could not load the catalog.'));
    } finally {
      this.loading.set(false);
    }
  }

  startAdd() {
    this.formError.set('');
    this.draft.set({ ...EMPTY });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  startEdit(s: AdminCatalogItem) {
    this.formError.set('');
    this.draft.set({
      id: s.catalogId,
      name: s.name,
      organization: s.organization,
      deadline: s.deadline ?? '',
      minGpa: s.minGpa === null ? '' : String(s.minGpa),
      promptOrMaterials: s.promptOrMaterials,
      sourceUrl: s.sourceUrl ?? '',
      verified: s.teamVerified,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async save() {
    const d = this.draft();
    if (!d) return;
    const gpa = `${d.minGpa}`.trim();
    const body: AdminCatalogInput = {
      name: d.name.trim(),
      organization: d.organization.trim(),
      deadline: d.deadline || null,
      minGpa: gpa === '' ? null : Number(gpa),
      promptOrMaterials: d.promptOrMaterials.trim(),
      sourceUrl: d.sourceUrl.trim() || null,
      verified: d.verified,
    };
    this.saving.set(true);
    this.formError.set('');
    try {
      const { catalogId } = d.id ? await this.api.updateCatalog(d.id, body) : await this.api.addCatalog(body);
      this.toasts.show(d.id ? `${catalogId} saved.` : `${catalogId} added to Discover.`);
      this.draft.set(null);
      await this.load();
      void this.shell?.refresh();
    } catch (err) {
      this.formError.set(apiMessage(err, 'Could not save the scholarship.'));
    } finally {
      this.saving.set(false);
    }
  }

  async setRemoved(s: AdminCatalogItem, removed: boolean) {
    if (removed && !confirm(`Remove ${s.catalogId} "${s.name}" from Discover? Students who already added it keep their copy. You can restore it later.`)) return;
    this.busy.set(s.catalogId);
    try {
      await this.api.setCatalogRemoved(s.catalogId, removed);
      this.toasts.show(removed ? `${s.catalogId} removed from Discover.` : `${s.catalogId} is back on Discover.`);
      await this.load();
      void this.shell?.refresh();
    } catch (err) {
      this.toasts.show(apiMessage(err, 'Could not change the scholarship.'), true);
    } finally {
      this.busy.set(null);
    }
  }
}
