import { Component, OnInit, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
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
import { RequirementCard } from './requirement-card';
import { ChangeReview } from './change-review';

@Component({
  selector: 'app-scholarship',
  imports: [RouterLink, DatePipe, DocumentCheckView, RequirementCard, ChangeReview],
  template: `
    <p><a routerLink="/">← All scholarships</a></p>
    @if (data(); as s) {
      <h1>{{ s.name }}</h1>
      <p class="muted">{{ s.provider }}</p>
      @if (s.deadline) {
        <p>
          Due <strong>{{ s.deadline.utc | date: 'medium' }}</strong>
          <span class="badge" [class]="s.deadline.verification">{{ label(s.deadline.verification) }}</span>
        </p>
      }

      <section class="card">
        <h2>Add the official guidelines</h2>
        <p class="hint">PDF, Word, image or text file, up to 25 MB. Files are virus-scanned before anything reads them.</p>
        <label for="file">Choose a file</label>
        <input id="file" type="file" accept=".pdf,.docx,.txt,.png,.jpg,.jpeg" (change)="upload($event)" [disabled]="busy()" />
        <form class="url-form" (submit)="addUrl($event)">
          <label for="page-url">Or paste the scholarship's web page</label>
          <p class="hint">We save a copy, read the requirements from it, and re-check the page every day for changes. Sites that ask robots to stay away are skipped.</p>
          <div class="actions">
            <input id="page-url" name="url" type="url" placeholder="https://…" [value]="s.url ?? ''" required [disabled]="busy()" />
            <button type="submit" [disabled]="busy()">Save page</button>
          </div>
        </form>
        @if (status()) {
          <p role="status">{{ status() }}</p>
        }
        @if (sources().length) {
          <h3>Sources</h3>
          @for (src of sources(); track src.id) {
            <div class="email-row">
              <div>
                <strong>{{ src.kind === 'url' ? 'Web page' : 'File' }}:</strong> {{ src.title }}
                <p class="muted small">{{ sourceNote(src) }}</p>
              </div>
              @if (src.currentVersionId) {
                <button type="button" class="secondary" (click)="openSource(src.id, src.currentVersionId)">Open saved copy</button>
              }
            </div>
          }
        }
      </section>

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
        <p class="card">No requirements yet. Upload the guidelines to extract them.</p>
      }
      <ul class="cards">
        @for (r of requirements(); track r.id) {
          <li appRequirementCard [requirement]="r" [scholarshipId]="s.id" (changed)="load()" (openSource)="openSource($event.sourceId, $event.sourceVersionId)"></li>
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
    } @else {
      <p>Loading…</p>
    }
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

  async ngOnInit() {
    await this.load();
  }

  label(v: string) {
    return v === 'verified' ? 'From source' : v === 'needs_review' ? 'Needs review' : 'Unverified';
  }

  async load() {
    const s = await this.api.scholarship(this.id());
    this.data.set(s);
    this.requirements.set(s.requirements);
    try {
      this.sources.set((await this.api.sources(this.id())).items);
    } catch {
      this.sources.set([]);
    }
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
    this.status.set('Fetching the page…');
    try {
      const { jobId } = await this.api.addSourceUrl(this.id(), url);
      const next = await this.waitFor(jobId);
      if (next) {
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
      await this.load();
    }
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
    this.status.set('Uploading…');
    try {
      const jobId = await this.api.uploadSource(this.id(), file);
      this.status.set('Checking the file for viruses…');
      const next = await this.waitFor(jobId);
      if (next) {
        this.status.set('Reading the requirements… this can take up to a minute.');
        await this.waitFor(next);
      }
      await this.load();
      this.status.set('Done. Review the requirements below.');
    } catch (err) {
      this.status.set(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      this.busy.set(false);
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
