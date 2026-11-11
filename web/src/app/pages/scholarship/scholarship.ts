import { Component, OnInit, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService, apiMessage, type Requirement, type Scholarship, type ScholarshipDocuments } from '../../core/api.service';

@Component({
  selector: 'app-scholarship',
  imports: [RouterLink, DatePipe],
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
        @if (status()) {
          <p role="status">{{ status() }}</p>
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
        }
        @if (s.documents.needed.length === 0 && s.documents.extras.length === 0) {
          <p>This scholarship does not name a transcript, certificate, passport, or birth certificate. You can still keep those files in <a routerLink="/documents">Documents</a> and choose the scholarships that should show them.</p>
        }
      </section>

      <h2>Requirements</h2>
      @if (requirements().length === 0) {
        <p class="card">No requirements yet. Upload the guidelines to extract them.</p>
      }
      <ul class="cards">
        @for (r of requirements(); track r.id) {
          <li class="card" [class.changed]="r.changeFlag?.active">
            <p>
              <strong>{{ r.label }}</strong>
              <span class="badge" [class]="r.verification">{{ label(r.verification) }}</span>
              @if (r.changeFlag?.active) {
                <span class="badge changed">Changed</span>
              }
            </p>
            @if (r.current.citation; as c) {
              <blockquote>
                “{{ c.quote }}”
                <footer>
                  {{ c.page ? 'Page ' + c.page : 'Whole document' }}{{ c.ocrDerived ? ' · read by OCR' : '' }} ·
                  <button class="link" type="button" (click)="openSource(c.sourceId, c.sourceVersionId)">Open source</button>
                </footer>
              </blockquote>
            } @else {
              <p class="warning">No source found for this item. Don't rely on it until it's confirmed.</p>
            }
          </li>
        }
      </ul>
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
