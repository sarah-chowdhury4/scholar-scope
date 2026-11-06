import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { ApiService } from '../../core/api.service';

/** For scholarships that aren't in the catalog (FR-1.1). Everything typed here starts as "unverified". */
@Component({
  selector: 'app-add-scholarship',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <p><a routerLink="/">← My scholarships</a></p>
    <h1>Add a scholarship that isn't listed</h1>
    <p class="hint">
      Looking for a well-known scholarship? Check <a routerLink="/discover">Discover</a> first.
      Details you type here are marked <span class="badge unverified">Unverified</span> until you upload the official guidelines.
    </p>

    <form class="card" [formGroup]="form" (ngSubmit)="save()">
      <label for="name">Scholarship name</label>
      <input id="name" formControlName="name" required autocomplete="off" />

      <label for="provider">Provider (who offers it)</label>
      <input id="provider" formControlName="provider" required autocomplete="off" />

      <label for="url">Official page (optional)</label>
      <input id="url" type="url" formControlName="url" placeholder="https://" />
      <p class="hint">If you add a page, ScholarScope re-checks it daily for changes.</p>

      <div class="row">
        <div>
          <label for="amount">Award amount (optional)</label>
          <input id="amount" type="number" min="0" step="1" formControlName="amount" />
        </div>
        <div>
          <label for="currency">Currency</label>
          <select id="currency" formControlName="currency">
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
            <option value="BDT">BDT</option>
            <option value="CAD">CAD</option>
            <option value="AUD">AUD</option>
          </select>
        </div>
      </div>

      <label for="deadline">Deadline (optional)</label>
      <input id="deadline" type="date" formControlName="deadline" />

      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }
      <div class="actions">
        <button type="submit" [disabled]="form.invalid || busy()">Add scholarship</button>
        <a class="button secondary" routerLink="/">Cancel</a>
      </div>
    </form>
  `,
})
export class AddScholarship {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', Validators.required],
    provider: ['', Validators.required],
    url: [''],
    amount: [null as number | null],
    currency: ['USD'],
    deadline: [''],
  });

  async save() {
    const v = this.form.getRawValue();
    if (v.url && !/^https?:\/\//i.test(v.url)) return this.error.set('The official page must start with http:// or https://');
    this.busy.set(true);
    this.error.set('');
    try {
      const created = await this.api.createScholarship({
        name: v.name,
        provider: v.provider,
        url: v.url || null,
        awardAmount: v.amount ? { amount: Number(v.amount), currency: v.currency } : null,
        deadline: v.deadline ? { date: v.deadline, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } : null,
      });
      await this.router.navigate(['/scholarships', created.id]);
    } catch (err) {
      this.error.set(err instanceof HttpErrorResponse && err.error?.error ? err.error.error : 'Could not add the scholarship.');
    } finally {
      this.busy.set(false);
    }
  }
}
