import { Component, OnInit, inject, input, output, signal } from '@angular/core';
import { ApiService, apiMessage, type Draft, type Requirement } from '../../core/api.service';
import { WORK_STEPS, WorkingIndicator } from '../../core/working';

/** Below this share of the word limit, the draft explains that it is short because the notes are. */
const SHORT_DRAFT_SHARE = 0.6;

/**
 * Essay draft helper for one requirement. The student writes their own notes first; the AI drafts
 * from those notes and their profile only, and every sentence shows which note it used.
 */
@Component({
  selector: 'app-essay-draft',
  imports: [WorkingIndicator],
  template: `
    <details class="draft" [open]="open()" (toggle)="onToggle($event)">
      <summary>Draft this essay with AI</summary>
      @if (draft(); as d) {
        @switch (d.status) {
          @case ('queued') {
            <p role="status">Waiting to start…</p>
          }
          @case ('writing') {
            <app-working [steps]="draftSteps" announce="Writing your draft" />
          }
          @case ('failed') {
            <p class="warning">{{ d.error || 'The draft could not be written.' }}</p>
          }
          @case ('paused') {
            <p class="warning">{{ d.error || 'AI drafting is paused.' }}</p>
          }
        }
        @if (d.status === 'ready' || d.status === 'approved') {
          <p class="small">
            <span class="badge" [class]="d.status === 'approved' ? 'verified' : 'needs_review'">{{ d.status === 'approved' ? 'Approved by you' : 'Draft · not approved' }}</span>
            <span [class.error]="overLimit(d)">{{ d.wordCount }} words{{ d.prompt.wordLimit ? ' of ' + d.prompt.wordLimit : '' }}</span>
            @if (d.unsupportedCount && !d.edited) {
              · <span class="error">{{ d.unsupportedCount }} sentence{{ d.unsupportedCount === 1 ? '' : 's' }} not based on your notes (marked)</span>
            }
          </p>
          @if (editing()) {
            <label [attr.for]="'draft-text-' + requirement().id">Your essay</label>
            <textarea [id]="'draft-text-' + requirement().id" rows="14" [value]="d.text" (input)="editText.set($any($event.target).value)"></textarea>
            <div class="actions">
              <button type="button" [disabled]="busy()" (click)="saveEdit(d)">Save my edits</button>
              <button type="button" class="secondary" (click)="editing.set(false)">Cancel</button>
            </div>
          } @else if (d.edited) {
            <div class="draft-text">{{ d.text }}</div>
          } @else {
            <div class="draft-text">
              @for (p of paragraphs(d); track $index) {
                <p>
                  @for (s of p; track $index) {
                    <span [class.unsupported]="!s.supported" [attr.title]="basis(d, s.basedOn)">{{ s.text }} </span>
                  }
                </p>
              }
            </div>
          }
          @if (tooShort(d)) {
            <p class="notice short-draft">
              This draft is {{ d.wordCount }} of {{ d.prompt.wordLimit }} words because it only uses what your notes say, and
              never makes anything up. To make it longer, press Discard (your notes stay), add more notes, such as what happened,
              a setback, what you learned and what comes next, and write it again.
            </p>
          }
          @if (d.suggestion) {
            <p class="hint">Idea: {{ d.suggestion }}</p>
          }
          @if (!editing()) {
            <div class="actions">
              <button type="button" class="secondary" (click)="startEdit(d)">Edit</button>
              @if (d.status === 'ready') {
                <button type="button" [disabled]="busy() || overLimit(d)" (click)="approve(d)">Approve this draft</button>
              }
              <button type="button" class="secondary" (click)="copy(d)">Copy text</button>
              <button type="button" class="secondary" [disabled]="busy()" (click)="discard(d)">Discard</button>
            </div>
          }
        }
      }

      @if (!draft() || draft()!.status === 'failed' || draft()!.status === 'paused') {
        <p class="hint">
          Write a few lines about your own experiences that answer this prompt: what you did, what happened, what you learned.
          The draft uses only these notes and your profile, and marks any sentence that is not based on them.
          Check the scholarship's rules on AI help, and make the final essay your own.
        </p>
        <label [attr.for]="'notes-' + requirement().id">Your notes</label>
        <textarea [id]="'notes-' + requirement().id" rows="6" maxlength="4000" [value]="notes()" (input)="notes.set($any($event.target).value)"></textarea>
        <label class="check">
          <input type="checkbox" [checked]="includeGpa()" (change)="includeGpa.set($any($event.target).checked)" />
          The draft may mention my GPA from my profile
        </label>
        <button type="button" [disabled]="busy() || notes().trim().length < 40" (click)="create()">Write a draft</button>
      }
      @if (message()) {
        <p [class.error]="bad()" role="status">{{ message() }}</p>
      }
    </details>
  `,
})
export class EssayDraft implements OnInit {
  protected readonly draftSteps = WORK_STEPS.draft;
  private readonly api = inject(ApiService);
  readonly requirement = input.required<Requirement>();
  readonly scholarshipId = input.required<string>();
  readonly changed = output<void>();

  protected readonly draft = signal<Draft | null>(null);
  protected readonly open = signal(false);
  protected readonly busy = signal(false);
  protected readonly editing = signal(false);
  protected readonly editText = signal('');
  protected readonly notes = signal('');
  protected readonly includeGpa = signal(false);
  protected readonly message = signal('');
  protected readonly bad = signal(false);

  async ngOnInit() {
    try {
      const { items } = await this.api.drafts(this.scholarshipId());
      const mine = items.find((item) => item.requirementId === this.requirement().id) ?? null;
      this.draft.set(mine);
      if (mine) this.notes.set(mine.notes);
    } catch {
      this.draft.set(null);
    }
  }

  onToggle(event: Event) {
    this.open.set((event.target as HTMLDetailsElement).open);
  }

  paragraphs(d: Draft) {
    const out: Draft['sentences'][] = [];
    for (const sentence of d.sentences) (out[sentence.paragraph] ??= []).push(sentence);
    return out.filter(Boolean);
  }

  basis(d: Draft, ids: string[]) {
    if (!ids.length) return 'Not based on your notes or profile. Check it or remove it.';
    return 'Based on: ' + ids.map((id) => d.facts.find((fact) => fact.id === id)?.text ?? id).join(' | ');
  }

  /** Well under the word limit: the notes only support this much, and the draft never pads with made-up content. */
  tooShort(d: Draft) {
    return !d.edited && d.prompt.wordLimit != null && d.wordCount < d.prompt.wordLimit * SHORT_DRAFT_SHARE;
  }

  overLimit(d: Draft) {
    return d.prompt.wordLimit != null && d.wordCount > d.prompt.wordLimit;
  }

  startEdit(d: Draft) {
    this.editText.set(d.text);
    this.editing.set(true);
  }

  async create() {
    await this.run(async () => {
      const { draftId, jobId } = await this.api.createDraft({
        scholarshipId: this.scholarshipId(),
        requirementId: this.requirement().id,
        notes: this.notes().trim(),
        includeGpa: this.includeGpa(),
      });
      this.draft.set(await this.api.draft(draftId));
      await this.waitFor(jobId);
      this.draft.set(await this.api.draft(draftId));
    });
  }

  async saveEdit(d: Draft) {
    await this.run(async () => {
      this.draft.set(await this.api.editDraft(d.id, this.editText()));
      this.editing.set(false);
    }, 'Edits saved. Approve the draft when it is ready.');
  }

  async approve(d: Draft) {
    await this.run(async () => {
      this.draft.set(await this.api.approveDraft(d.id));
      this.changed.emit();
    }, 'Approved. The essay is marked "in draft" on your checklist.');
  }

  async discard(d: Draft) {
    if (!confirm('Discard this draft? Your notes stay here so you can try again.')) return;
    await this.run(async () => {
      await this.api.discardDraft(d.id);
      this.draft.set(null);
    });
  }

  async copy(d: Draft) {
    try {
      await navigator.clipboard.writeText(d.text);
      this.note('Copied.', false);
    } catch {
      this.note('Could not copy. Select the text and copy it yourself.', true);
    }
  }

  private async run(action: () => Promise<void>, done = '') {
    this.busy.set(true);
    this.note('', false);
    try {
      await action();
      if (done) this.note(done, false);
    } catch (err) {
      this.note(err instanceof Error && !('status' in err) ? err.message : apiMessage(err, 'Something went wrong.'), true);
    } finally {
      this.busy.set(false);
    }
  }

  private note(message: string, bad: boolean) {
    this.message.set(message);
    this.bad.set(bad);
  }

  private async waitFor(jobId: string) {
    for (let i = 0; i < 60; i++) {
      const job = await this.api.job(jobId);
      if (job.status === 'done') return;
      if (job.status === 'paused_ai_off') throw new Error('AI drafting is paused right now.');
      if (job.status === 'failed') throw new Error('The draft could not be written. Try again later.');
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error('Still writing. Open this again in a minute.');
  }
}
