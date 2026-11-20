import { PageLoading } from '../../core/page-loading';
import { Component, ElementRef, OnInit, computed, inject, input, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  ApiService,
  apiMessage,
  type RemovedRequirement,
  type Requirement,
  type Scholarship,
  type ScholarshipDocuments,
  type SourceSummary,
} from '../../core/api.service';
import { DocumentCheckView } from '../documents/document-check';
import { DeadlineText } from '../../core/deadline-text';
import { DaysLeft } from '../../core/days-left';
import { RequirementCard } from './requirement-card';
import { ChangeReview } from './change-review';
import { EssayDraft } from './essay-draft';
import { WORK_STEPS, WorkingIndicator } from '../../core/working';
import { celebrate, confetti } from '../../core/confetti';

@Component({
  selector: 'app-scholarship',
  imports: [RouterLink, DocumentCheckView, RequirementCard, ChangeReview, EssayDraft, DeadlineText, DaysLeft, WorkingIndicator, PageLoading],
  template: `
    <p><a routerLink="/">← All scholarships</a></p>
    @if (data(); as s) {
      <header class="sch-head">
        <div>
          <h1>{{ s.name }}</h1>
          <p class="muted">{{ s.provider }}</p>
          @if (s.deadline) {
            <p>
              <span class="badge" [class]="s.deadline.verification">{{ label(s.deadline.verification, s.deadline.verifiedBy) }}</span>
              Due <app-deadline [deadline]="s.deadline" />
            </p>
            <p><app-days-left [deadline]="s.deadline" /></p>
          }
        </div>
        <div class="actions sch-actions">
          @if (s.url) {
            <a class="button" [href]="s.url" target="_blank" rel="noopener noreferrer">Open scholarship page</a>
          }
          <button type="button" class="secondary" (click)="openGuidelines()" aria-haspopup="dialog">
            Add guidelines{{ sources().length ? ' (' + sources().length + ' saved)' : '' }}
          </button>
        </div>
      </header>
      @if (busy() && phase()) {
        <app-working [steps]="steps()" />
      } @else if (status()) {
        <p class="notice" role="status">{{ status() }}</p>
      }

      <dialog #guidelines class="sheet" aria-labelledby="glTitle" (close)="guidelinesOpen.set(false)" (click)="closeOnBackdrop($event)">
        <div class="sheet-head">
          <h2 id="glTitle">Add guidelines</h2>
          <button type="button" class="link" (click)="guidelines.close()" aria-label="Close">✕</button>
        </div>
        <p class="hint">Requirements are read from what you add here and quoted back to you. Files are virus-scanned before anything reads them.</p>
        <p class="hint">
          When you save a page, we also read the pages it links to on the same site that look like its rules, such as
          eligibility, FAQ or the guidelines PDF. If that still gives only a few requirements, we search the web once for
          the official pages. Every requirement shows the page it was quoted from.
        </p>
        <label for="file">Upload a file</label>
        <p class="hint">PDF, Word, image or text file, up to 25 MB.</p>
        <input id="file" type="file" accept=".pdf,.docx,.txt,.png,.jpg,.jpeg" (change)="upload($event)" [disabled]="busy()" />
        <form class="url-form" (submit)="addUrl($event)">
          <label for="page-url">Or save the scholarship's web page</label>
          <p class="hint">We keep a copy and re-check it every day for changes. Sites that ask robots to stay away are skipped.</p>
          <div class="actions">
            <input id="page-url" name="url" type="url" placeholder="https://…" [value]="s.url ?? ''" required [disabled]="busy()" />
            <button type="submit" [disabled]="busy()">Save page</button>
          </div>
        </form>
        @if (s.search; as search) {
          <p class="muted small" role="status">{{ searchNote(search) }}</p>
        }
        @if (sources().length) {
          <h3>Saved so far</h3>
          @for (src of sources(); track src.id) {
            <div class="email-row">
              <div>
                <strong>{{ sourceKind(src) + ': ' }}</strong><span class="src-title">{{ src.title }}</span>
                @if (src.url && src.origin && src.origin !== 'student') {
                  <a class="small" [href]="src.url" target="_blank" rel="noopener noreferrer">Visit</a>
                }
                <p class="muted small">{{ sourceNote(src) }}</p>
              </div>
              @if (src.currentVersionId) {
                <button type="button" class="secondary" (click)="openSource(src.id, src.currentVersionId)">Open saved copy</button>
              }
            </div>
          }
        }
      </dialog>

      <section class="card">
        <h2>Your documents for this application</h2>
        <p class="hint">
          Files from <a routerLink="/documents">Documents</a> show up here when this scholarship asks for that kind of paper.
          A transcript requirement shows every transcript you have saved, such as high school and undergraduate.
        </p>
        @for (group of s.documents.needed; track group.type) {
          <p><strong>{{ group.label }}</strong></p>
          @if (group.documents.length === 0) {
            <p class="muted">None uploaded yet. <a routerLink="/documents">Add one in Documents</a>.</p>
          }
          @for (doc of group.documents; track doc.id) {
            <div class="email-row">
              <div>
                <strong>{{ doc.title }}</strong>
                <span class="badge" [class]="doc.scanStatus === 'clean' ? 'verified' : doc.scanStatus === 'pending' ? 'needs_review' : 'unverified'">
                  {{ scanLabel(doc.scanStatus) }}
                </span>
                <p class="muted">{{ doc.fileName }}</p>
              </div>
              @if (doc.ready) {
                <button type="button" class="secondary" (click)="openDocument(doc.id)">Open</button>
              }
            </div>
            <app-document-check [check]="doc.check" [extra]="doc.scholarshipFindings" />
          }
        }
        @for (doc of s.documents.extras; track doc.id) {
          <div class="email-row">
            <div>
              <strong>{{ doc.title }}</strong>
              <span class="badge" [class]="doc.scanStatus === 'clean' ? 'verified' : doc.scanStatus === 'pending' ? 'needs_review' : 'unverified'">
                {{ scanLabel(doc.scanStatus) }}
              </span>
              <p class="muted">{{ doc.fileName }}</p>
            </div>
            @if (doc.ready) {
              <button type="button" class="secondary" (click)="openDocument(doc.id)">Open</button>
            }
          </div>
          <app-document-check [check]="doc.check" [extra]="doc.scholarshipFindings" />
        }
        @if (s.documents.needed.length === 0 && s.documents.extras.length === 0) {
          <p>This scholarship does not name a transcript, certificate, passport, or birth certificate. You can still keep those files in <a routerLink="/documents">Documents</a> and choose the scholarships that should show them.</p>
        }
      </section>

      <app-change-review
        [scholarshipId]="s.id"
        [refreshKey]="requirements()"
        (changed)="load()"
        (openSource)="openSource($event.sourceId, $event.sourceVersionId)"
      />

      <h2>Requirements</h2>
      @if (requirements().length === 0) {
        <p class="card">No requirements yet. Use <strong>Add guidelines</strong> to read them from the official page or a file.</p>
      }
      <ul class="cards">
        @for (r of requirements(); track r.id) {
          <li appRequirementCard [requirement]="r" [scholarshipId]="s.id" (changed)="load()" (openSource)="openSource($event.sourceId, $event.sourceVersionId)">
            @if (draftable(r)) {
              <app-essay-draft [requirement]="r" [scholarshipId]="s.id" (changed)="load()" />
            }
          </li>
        }
      </ul>
      <p>
        <button type="button" class="link" (click)="toggleRemoved()">{{ removed() ? 'Hide removed items' : 'Show items you removed' }}</button>
      </p>
      @if (removed(); as items) {
        @if (items.length === 0) {
          <p class="muted">You have not removed anything.</p>
        }
        @for (item of items; track item.id) {
          <div class="email-row">
            <span>{{ item.label }}</span>
            <button type="button" class="secondary" (click)="restore(item.id)">Put back</button>
          </div>
        }
      }

      <!-- Always in view at the bottom of the screen: how ready this application is. -->
      <div class="ready-dock" #dock [class.done]="s.readinessPct >= 100" [class.bump]="bump()">
        <div class="ready-dock-row">
          <strong>{{ s.counts.ready }} of {{ s.counts.total }} requirements ready</strong>
          <span class="ready-dock-pct" aria-hidden="true">{{ s.readinessPct }}%</span>
        </div>
        <div
          class="progress-track"
          role="progressbar"
          aria-label="Application readiness"
          [attr.aria-valuenow]="s.readinessPct"
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <div class="progress-bar" #bar [style.width.%]="s.readinessPct"></div>
        </div>
        @if (cheer()) {
          <p class="ready-dock-cheer" role="status">{{ cheer() }}</p>
        }
      </div>
    } @else {
      <app-page-loading [cards]="3" />
    }
  `,
  styles: `
    .sch-head { display: flex; flex-wrap: wrap; gap: 12px 24px; align-items: flex-start; justify-content: space-between; margin-bottom: 8px; }
    .sch-head h1 { margin-bottom: 4px; }
    .sch-head p { margin: 2px 0; }
    .sch-actions { flex-wrap: wrap; }
    .sheet { border: none; border-radius: var(--radius); padding: 24px 28px; width: min(640px, calc(100vw - 32px)); max-height: calc(100vh - 48px); background: var(--surface); color: var(--ink); }
    .sheet::backdrop { background: rgba(29, 58, 43, 0.35); }
    .sheet-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
    .sheet-head h2 { margin: 0; }
    .src-title { overflow-wrap: anywhere; }
    @media (max-width: 520px) { .sheet { padding: 18px; } }
  `,
})
export class ScholarshipPage implements OnInit {
  /** Route parameter (component input binding). */
  readonly id = input.required<string>();
  private readonly api = inject(ApiService);
  protected readonly data = signal<(Scholarship & { requirements: Requirement[]; documents: ScholarshipDocuments }) | null>(null);
  protected readonly requirements = signal<Requirement[]>([]);
  protected readonly busy = signal(false);
  protected readonly status = signal('');
  protected readonly removed = signal<RemovedRequirement[] | null>(null);
  protected readonly sources = signal<SourceSummary[]>([]);
  protected readonly guidelinesOpen = signal(false);
  private readonly guidelines = viewChild<ElementRef<HTMLDialogElement>>('guidelines');
  private readonly bar = viewChild<ElementRef<HTMLElement>>('bar');

  /** What a running upload or page save is doing, for the working indicator. */
  protected readonly phase = signal<keyof typeof WORK_STEPS | null>(null);
  protected readonly steps = computed(() => WORK_STEPS[this.phase() ?? 'upload']);

  /** Readiness last shown, to celebrate when a student's action raises it (not on first load). */
  private lastPct: number | null = null;
  protected readonly bump = signal(false);
  protected readonly cheer = signal('');
  private cheerTimer: ReturnType<typeof setTimeout> | undefined;

  /** A native modal dialog: keeps focus inside, closes on Escape, and returns focus to the button. */
  openGuidelines() {
    this.guidelines()?.nativeElement.showModal();
    this.guidelinesOpen.set(true);
  }

  closeOnBackdrop(event: MouseEvent) {
    if (event.target === this.guidelines()?.nativeElement) this.guidelines()?.nativeElement.close();
  }

  /** Close the dialog once work starts so the progress message on the page is visible. */
  private closeGuidelines() {
    this.guidelines()?.nativeElement.close();
  }

  async ngOnInit() {
    await this.load();
  }

  label(v: string, verifiedBy?: string | null) {
    if (v === 'verified' && verifiedBy) return 'Verified'; // checked by the ScholarScope team
    return v === 'verified' ? 'From source' : v === 'needs_review' ? 'Needs review' : 'Unverified';
  }

  async load() {
    const s = await this.api.scholarship(this.id());
    this.data.set(s);
    this.requirements.set(s.requirements);
    this.celebrateProgress(s.readinessPct, s.name);
    try {
      this.sources.set((await this.api.sources(this.id())).items);
    } catch {
      this.sources.set([]);
    }
  }

  /** Confetti from the end of the bar when readiness goes up; a big celebration at 100%. */
  private celebrateProgress(pct: number, name: string) {
    const before = this.lastPct;
    this.lastPct = pct;
    if (before !== null && pct < before) {
      // Unticked: the "Nice!" (or "ready") note no longer fits, so it goes at once.
      clearTimeout(this.cheerTimer);
      this.cheer.set('');
      return;
    }
    if (before === null || pct === before) return;
    this.bump.set(false);
    setTimeout(() => this.bump.set(true));
    clearTimeout(this.cheerTimer);
    if (pct >= 100) {
      celebrate();
      this.cheer.set(`Everything for ${name} is ready. Well done!`);
      return; // stays up while the application is complete
    }
    // Wait for the bar to grow, then burst from its new end.
    setTimeout(() => {
      const rect = this.bar()?.nativeElement.getBoundingClientRect();
      const x = rect ? (rect.left + rect.width) / window.innerWidth : 0.5;
      const y = rect ? rect.top / window.innerHeight : 0.92;
      confetti({ count: 45, origin: { x, y }, spread: 60, speed: 11 });
    }, 450);
    this.cheer.set(pct - before >= 1 ? `Nice! ${pct}% ready.` : '');
    this.cheerTimer = setTimeout(() => this.cheer.set(''), 3500);
  }

  sourceKind(src: SourceSummary): string {
    if (src.kind !== 'url') return 'File';
    if (src.origin === 'linked') return 'Linked page';
    if (src.origin === 'search') return 'Found by search';
    return 'Web page';
  }

  searchNote(search: NonNullable<Scholarship['search']>): string {
    if (search.status === 'queued') return 'Few requirements so far: searching the web for the official pages…';
    if (search.status === 'paused') return 'The web search is paused (daily AI limit). Add the guidelines yourself in the meantime.';
    if (search.status === 'failed') return 'The web search could not finish. Add the guidelines yourself.';
    const n = search.pagesFound ?? 0;
    if (!n) return 'We searched the web for more official pages but found none we could trust. Add the guidelines file if you have it.';
    return `We searched the web and added ${n} official page${n === 1 ? '' : 's'}.`;
  }

  sourceNote(src: SourceSummary): string {
    if (src.kind === 'url') {
      if (src.robotsAllowed === false) return 'This site does not allow automatic checks. Visit it yourself for changes.';
      if (src.lastFetch && !src.lastFetch.ok) return 'We could not reach this page on the last check.';
      if (!src.currentVersionId) return 'Waiting for the first copy…';
    }
    const when = src.capturedAt ? `Saved ${new Date(src.capturedAt).toLocaleString()}` : 'Saved';
    const ex = src.extraction;
    if (!ex) return when;
    if (ex.status === 'done') return `${when} · ${ex.itemsFound ?? 0} requirement${ex.itemsFound === 1 ? '' : 's'} found`;
    if (ex.status === 'paused') return `${when} · reading is paused`;
    if (ex.status === 'failed') return `${when} · could not read the requirements yet. Press Save page to try again.`;
    return `${when} · reading the requirements…`;
  }

  async addUrl(event: Event) {
    event.preventDefault();
    const url = String(new FormData(event.target as HTMLFormElement).get('url') ?? '').trim();
    if (!/^https?:\/\//i.test(url)) {
      this.status.set('Enter the full address, starting with https://');
      return;
    }
    this.busy.set(true);
    this.closeGuidelines();
    this.phase.set('fetchPage');
    this.status.set('Fetching the page…');
    try {
      const { jobId } = await this.api.addSourceUrl(this.id(), url);
      const next = await this.waitFor(jobId);
      if (next) {
        this.phase.set('requirements');
        this.status.set('Reading the requirements… this can take up to a minute.');
        await this.waitFor(next);
        this.status.set('Done. Review the requirements below.');
      } else {
        this.status.set('The page has not changed since the last copy.');
      }
    } catch (err) {
      this.status.set(friendlyFetchError(err instanceof Error ? err.message : apiMessage(err, 'Could not save that page.')));
    } finally {
      this.busy.set(false);
      this.phase.set(null);
      await this.load();
    }
  }

  /** Same rule as the API (shared isDraftable): essays and personal statements. */
  draftable(r: Requirement) {
    return r.kind === 'essay' || /\b(essay|personal statement|statement of purpose|short answer|cover letter|motivation letter)\b/i.test(r.label);
  }

  async toggleRemoved() {
    if (this.removed()) {
      this.removed.set(null);
      return;
    }
    this.removed.set((await this.api.removedRequirements(this.id())).items);
  }

  async restore(requirementId: string) {
    try {
      await this.api.reviewRequirement(this.id(), requirementId, { action: 'restore' });
      this.removed.set((await this.api.removedRequirements(this.id())).items);
      await this.load();
    } catch (err) {
      this.status.set(apiMessage(err, 'Could not put that back.'));
    }
  }

  scanLabel(status: string) {
    if (status === 'clean') return 'Saved';
    if (status === 'pending') return 'Checking the file';
    if (status === 'infected') return 'Blocked';
    if (status === 'too_large') return 'Too large';
    return 'Not accepted';
  }

  async openDocument(id: string) {
    try {
      const { url } = await this.api.viewDocument(id);
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      this.status.set(apiMessage(err, 'Could not open that file.'));
    }
  }

  async openSource(sourceId: string, versionId: string) {
    const { url } = await this.api.viewSource(sourceId, versionId);
    window.open(url, '_blank', 'noopener');
  }

  async upload(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.busy.set(true);
    this.closeGuidelines();
    this.phase.set('upload');
    this.status.set('Uploading…');
    try {
      const jobId = await this.api.uploadSource(this.id(), file);
      this.phase.set('scan');
      this.status.set('Checking the file for viruses…');
      const next = await this.waitFor(jobId);
      if (next) {
        this.phase.set('requirements');
        this.status.set('Reading the requirements… this can take up to a minute.');
        await this.waitFor(next);
      }
      await this.load();
      this.status.set('Done. Review the requirements below.');
    } catch (err) {
      this.status.set(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      this.busy.set(false);
      this.phase.set(null);
    }
  }

  /** Poll a job until it finishes; returns the follow-up job id (scan → extract), if any. */
  private async waitFor(jobId: string): Promise<string | null> {
    for (let i = 0; i < 60; i++) {
      const job = await this.api.job(jobId);
      if (job.status === 'done') return job.nextJobId;
      if (job.status === 'paused_ai_off') throw new Error('Processing is paused right now. Your file is saved; try again later.');
      if (job.status === 'failed') throw new Error(`Processing failed: ${job.error ?? 'unknown error'}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error('Still processing. Check back in a minute.');
  }
}

/** Turn a fetch job error code into something a student can act on. */
export function friendlyFetchError(message: string): string {
  if (message.includes('robots_blocked')) {
    return 'This site asks robots not to read the page, so we did not save it. Download the guidelines and upload the file instead.';
  }
  if (message.includes('unreachable')) return 'We could not reach that page. Check the address, or upload the guidelines as a file.';
  return message;
}
