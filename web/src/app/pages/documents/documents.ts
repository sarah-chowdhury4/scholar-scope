import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService, apiMessage, type Scholarship, type StudentDocument } from '../../core/api.service';

const SLOTS = [
  { type: 'transcript', label: 'Transcript' },
  { type: 'passport', label: 'Passport' },
  { type: 'birth_certificate', label: 'Birth certificate' },
] as const;

@Component({
  selector: 'app-documents',
  imports: [RouterLink],
  template: `
    <h1>Documents</h1>
    <p class="hint">
      Upload a transcript, passport, or birth certificate once. The same file shows up on each scholarship that asks for it.
      Other files can be attached to the scholarships you choose.
    </p>
    <p class="hint">PDF, Word, image, or text file, up to 25 MB. Files are virus-scanned before anything reads them.</p>
    <p><a routerLink="/">← My scholarships</a></p>

    @if (status()) {
      <p [class]="statusBad() ? 'error' : 'success'" role="status">{{ status() }}</p>
    }

    @if (loading()) {
      <p>Loading…</p>
    } @else if (loadError()) {
      <p class="error" role="alert">{{ loadError() }}</p>
      <button type="button" (click)="load()">Try again</button>
    } @else {
      @for (slot of slots; track slot.type) {
        <section class="card">
          <h2>{{ slot.label }}</h2>
          <p class="hint">One file. Uploading again replaces it.</p>
          @if (saved(slot.type); as doc) {
            <div class="email-row">
              <div>
                <strong>{{ doc.fileName }}</strong>
                <span class="badge" [class]="badge(doc)">{{ scanLabel(doc.scanStatus) }}</span>
              </div>
              @if (doc.ready) {
                <button type="button" class="secondary" [disabled]="busy() !== null" (click)="open(doc)">Open</button>
              }
            </div>
          } @else {
            <p class="muted">Not uploaded yet.</p>
          }
          <label [attr.for]="'file-' + slot.type">{{ saved(slot.type) ? 'Replace file' : 'Choose a file' }}</label>
          <input
            [id]="'file-' + slot.type"
            type="file"
            accept=".pdf,.docx,.txt,.png,.jpg,.jpeg"
            [disabled]="busy() !== null"
            (change)="upload(slot.type, $event)"
          />
        </section>
      }

      <section class="card">
        <h2>Other documents</h2>
        <p class="hint">Anything else an application asks for. Give it a name, then choose which scholarships should show it.</p>
        <label for="otherName">Name</label>
        <input id="otherName" [value]="otherTitle()" (input)="otherTitle.set(text($event))" maxlength="120" autocomplete="off" />
        <label for="otherFile">File</label>
        <input id="otherFile" type="file" accept=".pdf,.docx,.txt,.png,.jpg,.jpeg" [disabled]="busy() !== null" (change)="uploadOther($event)" />

        @for (doc of others(); track doc.id) {
          <div class="email-row">
            <div>
              <strong>{{ doc.title }}</strong>
              <span class="badge" [class]="badge(doc)">{{ scanLabel(doc.scanStatus) }}</span>
              <p class="muted">{{ doc.fileName }}</p>
            </div>
            <div class="actions">
              @if (doc.ready) {
                <button type="button" class="secondary" [disabled]="busy() !== null" (click)="open(doc)">Open</button>
              }
              <button type="button" class="secondary" [disabled]="busy() !== null" (click)="remove(doc)">Remove</button>
            </div>
          </div>
          @if (scholarships().length === 0) {
            <p class="hint">Add a scholarship first, then you can show this file on it.</p>
          } @else {
            <fieldset>
              <legend>Show on</legend>
              @for (scholarship of scholarships(); track scholarship.id) {
                <label class="check">
                  <input
                    type="checkbox"
                    [checked]="doc.usedIn.includes(scholarship.id)"
                    [disabled]="busy() !== null"
                    (change)="toggle(doc, scholarship.id, $event)"
                  />
                  {{ scholarship.name }}
                </label>
              }
            </fieldset>
          }
        }
      </section>
    }
  `,
})
export class DocumentsPage implements OnInit {
  private readonly api = inject(ApiService);
  protected readonly slots = SLOTS;
  protected readonly items = signal<StudentDocument[]>([]);
  protected readonly scholarships = signal<Scholarship[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly status = signal('');
  protected readonly statusBad = signal(false);
  protected readonly busy = signal<string | null>(null);
  protected readonly otherTitle = signal('');

  async ngOnInit() {
    await this.load();
  }

  saved(type: string) {
    return this.items().find((doc) => doc.type === type);
  }

  others() {
    return this.items().filter((doc) => doc.type === 'other');
  }

  text(event: Event) {
    return (event.target as HTMLInputElement).value;
  }

  badge(doc: StudentDocument) {
    if (doc.scanStatus === 'clean') return 'verified';
    if (doc.scanStatus === 'pending') return 'needs_review';
    return 'unverified';
  }

  scanLabel(status: string) {
    if (status === 'clean') return 'Saved';
    if (status === 'pending') return 'Checking the file';
    if (status === 'infected') return 'Blocked';
    if (status === 'too_large') return 'Too large';
    return 'Not accepted';
  }

  async load() {
    this.loading.set(true);
    this.loadError.set('');
    try {
      const [docs, list] = await Promise.all([
        this.api.documents(),
        this.api.scholarships().catch(() => ({ items: [] as Scholarship[] })),
      ]);
      this.items.set(docs.items);
      this.scholarships.set(list.items);
    } catch (err) {
      this.loadError.set(apiMessage(err, 'Could not load your documents.'));
    } finally {
      this.loading.set(false);
    }
  }

  async upload(type: string, event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    await this.send(type, file);
  }

  async uploadOther(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const title = this.otherTitle().trim();
    if (!title) {
      this.note('Name this document so you can tell it apart.', true);
      return;
    }
    await this.send('other', file, title);
    if (!this.statusBad()) this.otherTitle.set('');
  }

  async open(doc: StudentDocument) {
    this.busy.set(doc.id);
    try {
      const { url } = await this.api.viewDocument(doc.id);
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      this.note(apiMessage(err, 'Could not open that file.'), true);
    } finally {
      this.busy.set(null);
    }
  }

  async remove(doc: StudentDocument) {
    if (!confirm(`Remove "${doc.title}"? Scholarships that show it will no longer include this file.`)) return;
    this.busy.set(doc.id);
    try {
      this.items.set((await this.api.removeDocument(doc.id)).items);
      this.note('Document removed.', false);
    } catch (err) {
      this.note(apiMessage(err, 'Could not remove that document.'), true);
    } finally {
      this.busy.set(null);
    }
  }

  async toggle(doc: StudentDocument, scholarshipId: string, event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    const scholarshipIds = checked ? [...doc.usedIn, scholarshipId] : doc.usedIn.filter((id) => id !== scholarshipId);
    this.busy.set(doc.id);
    try {
      this.items.set((await this.api.linkDocument(doc.id, scholarshipIds)).items);
    } catch (err) {
      (event.target as HTMLInputElement).checked = !checked;
      this.note(apiMessage(err, 'Could not update where this document shows up.'), true);
    } finally {
      this.busy.set(null);
    }
  }

  private async send(type: string, file: File, title?: string) {
    this.busy.set(type);
    this.note('Uploading…', false);
    try {
      const jobId = await this.api.uploadDocument(file, type, title);
      this.note('Checking the file for viruses…', false);
      await this.waitFor(jobId);
      await this.refresh();
      this.note(type === 'other' ? 'Document saved.' : 'File saved. Scholarships that ask for it will show this one.', false);
    } catch (err) {
      this.note(err instanceof Error ? err.message : apiMessage(err, 'Upload failed.'), true);
      await this.refresh();
    } finally {
      this.busy.set(null);
    }
  }

  private async refresh() {
    try {
      this.items.set((await this.api.documents()).items);
    } catch {
      // Keep the list already on screen if the reload fails.
    }
  }

  private note(message: string, bad: boolean) {
    this.status.set(message);
    this.statusBad.set(bad);
  }

  private async waitFor(jobId: string): Promise<void> {
    for (let i = 0; i < 60; i++) {
      const job = await this.api.job(jobId);
      if (job.status === 'done') return;
      if (job.status === 'failed') throw new Error(job.error ?? 'That file could not be saved.');
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error('Still checking the file. It will show here when the check finishes.');
  }
}
