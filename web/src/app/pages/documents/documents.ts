import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService, apiMessage, type Scholarship, type StudentDocument } from '../../core/api.service';

type Group = {
  type: string;
  label: string;
  hint: string;
  presets: readonly string[];
  customLabel: string;
  customPlaceholder: string;
  once: boolean;
};

const GROUPS: readonly Group[] = [
  {
    type: 'transcript',
    label: 'Transcripts',
    hint: 'Add each transcript under its own name. A master\'s application often needs a high school transcript and an undergraduate transcript. Uploading the same name again replaces that file.',
    presets: ['High school transcript', 'Undergraduate transcript', 'Postgraduate transcript'],
    customLabel: 'Other transcript',
    customPlaceholder: 'Name this transcript',
    once: false,
  },
  {
    type: 'school_certificate',
    label: 'School certificates',
    hint: 'IGCSE and A-level are common on applications. If your country uses a different school exam, type the name that system uses.',
    presets: ['IGCSE', 'A-level'],
    customLabel: 'Certificate from your school system',
    customPlaceholder: 'For example WAEC, CBSE, HSC, or Baccalauréat',
    once: false,
  },
  {
    type: 'university_certificate',
    label: 'University certificates',
    hint: 'A degree certificate is separate from a transcript. Type another name for a provisional certificate, an enrollment certificate, or a similar paper.',
    presets: ['Degree certificate'],
    customLabel: 'Other university certificate',
    customPlaceholder: 'Name this certificate',
    once: false,
  },
  {
    type: 'passport',
    label: 'Passport',
    hint: 'One file. Uploading again replaces it.',
    presets: [],
    customLabel: '',
    customPlaceholder: '',
    once: true,
  },
  {
    type: 'birth_certificate',
    label: 'Birth certificate',
    hint: 'One file. Uploading again replaces it.',
    presets: [],
    customLabel: '',
    customPlaceholder: '',
    once: true,
  },
  {
    type: 'other',
    label: 'Other documents',
    hint: 'A file that is not a transcript, certificate, passport, or birth certificate.',
    presets: [],
    customLabel: 'Name',
    customPlaceholder: 'Name this document',
    once: false,
  },
];

@Component({
  selector: 'app-documents',
  imports: [RouterLink],
  template: `
    <h1>Documents</h1>
    <p class="hint">
      Keep each application file here. Scholarships that ask for that kind of file show it, and you can also choose
      extra scholarships that should show a file.
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
      @for (group of groups; track group.type) {
        <section class="card">
          <h2>{{ group.label }}</h2>
          <p class="hint">{{ group.hint }}</p>

          @for (doc of ofType(group.type); track doc.id) {
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
                <legend>Also show on</legend>
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
          } @empty {
            @if (group.once) {
              <p class="muted">Not uploaded yet.</p>
            }
          }

          @if (group.presets.length) {
            <div class="chips" role="group" [attr.aria-label]="group.label">
              @for (name of group.presets; track name) {
                <button type="button" class="chip" [class.on]="picked()[group.type] === name" (click)="choose(group.type, name)">
                  {{ name }}
                </button>
              }
            </div>
          }
          @if (!group.once) {
            <label [attr.for]="'name-' + group.type">{{ group.customLabel }}</label>
            <input
              [id]="'name-' + group.type"
              [placeholder]="group.customPlaceholder"
              [value]="custom()[group.type] ?? ''"
              (input)="setCustom(group.type, $event)"
              maxlength="120"
              autocomplete="off"
            />
          }
          <label [attr.for]="'file-' + group.type">{{ group.once && ofType(group.type).length ? 'Replace file' : 'Choose a file' }}</label>
          <input
            [id]="'file-' + group.type"
            type="file"
            accept=".pdf,.docx,.txt,.png,.jpg,.jpeg"
            [disabled]="busy() !== null"
            (change)="upload(group, $event)"
          />
        </section>
      }
    }
  `,
})
export class DocumentsPage implements OnInit {
  private readonly api = inject(ApiService);
  protected readonly groups = GROUPS;
  protected readonly items = signal<StudentDocument[]>([]);
  protected readonly scholarships = signal<Scholarship[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly status = signal('');
  protected readonly statusBad = signal(false);
  protected readonly busy = signal<string | null>(null);
  protected readonly picked = signal<Record<string, string>>({});
  protected readonly custom = signal<Record<string, string>>({});

  async ngOnInit() {
    await this.load();
  }

  ofType(type: string) {
    return this.items().filter((doc) => doc.type === type);
  }

  choose(type: string, name: string) {
    this.picked.update((current) => ({ ...current, [type]: current[type] === name ? '' : name }));
    this.custom.update((current) => ({ ...current, [type]: '' }));
  }

  setCustom(type: string, event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.custom.update((current) => ({ ...current, [type]: value }));
    if (value.trim()) this.picked.update((current) => ({ ...current, [type]: '' }));
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

  async upload(group: Group, event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const title = group.once ? undefined : this.titleFor(group.type);
    if (!group.once && !title) {
      this.note('Name this document before you choose the file.', true);
      return;
    }
    await this.send(group.type, file, title);
    if (!this.statusBad()) {
      this.picked.update((current) => ({ ...current, [group.type]: '' }));
      this.custom.update((current) => ({ ...current, [group.type]: '' }));
    }
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

  private titleFor(type: string) {
    return (this.custom()[type] ?? '').trim() || this.picked()[type] || '';
  }

  private async send(type: string, file: File, title?: string) {
    this.busy.set(type);
    this.note('Uploading…', false);
    try {
      const jobId = await this.api.uploadDocument(file, type, title);
      this.note('Checking the file for viruses…', false);
      await this.waitFor(jobId);
      await this.refresh();
      this.note('File saved. Scholarships that ask for this kind of document will show it.', false);
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
