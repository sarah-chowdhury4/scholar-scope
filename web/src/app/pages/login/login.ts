import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { ApiService } from '../../core/api.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <section class="card narrow">
      <h1>{{ mode() === 'signin' ? 'Sign in' : 'Create your account' }}</h1>
      @if (route.snapshot.queryParamMap.get('reason') === 'idle') {
        <p class="notice" role="status">You were signed out after 30 minutes without activity.</p>
      }
      @if (route.snapshot.queryParamMap.get('reason') === 'password') {
        <p class="notice" role="status">Password changed. Sign in with the new password.</p>
      }
      @if (route.snapshot.queryParamMap.get('reason') === 'email') {
        <p class="notice" role="status">Email changed. Sign in with the new address.</p>
      }
      <form [formGroup]="form" (ngSubmit)="submit()">
        <label for="email">Email</label>
        <input id="email" type="email" formControlName="email" autocomplete="email" required />

        <label for="password">Password</label>
        <input
          id="password"
          type="password"
          formControlName="password"
          [attr.autocomplete]="mode() === 'signin' ? 'current-password' : 'new-password'"
          required
        />
        @if (mode() === 'signup') {
          <p class="hint">At least 12 characters.</p>
          <label class="check">
            <input type="checkbox" formControlName="consent" />
            <span>
              I agree to the privacy notice: my documents are stored to track my applications, and
              scholarship text is sent to AI services to find requirements. I can download or delete my data at any time.
            </span>
          </label>
        }
        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }
        <button type="submit" [disabled]="busy()">{{ mode() === 'signin' ? 'Sign in' : 'Create account' }}</button>
      </form>
      @if (mode() === 'signin') {
        <a routerLink="/forgot-password">Forgot password?</a>
      }
      <button class="link" type="button" (click)="toggle()">
        {{ mode() === 'signin' ? 'New here? Create an account' : 'Already have an account? Sign in' }}
      </button>
    </section>
  `,
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  protected readonly route = inject(ActivatedRoute);

  protected readonly mode = signal<'signin' | 'signup'>('signin');
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
    consent: [false],
  });

  toggle() {
    this.mode.update((m) => (m === 'signin' ? 'signup' : 'signin'));
    this.error.set('');
  }

  async submit() {
    const { email, password, consent } = this.form.getRawValue();
    if (this.form.invalid) return this.error.set('Enter your email and password.');
    if (this.mode() === 'signup') {
      if (password.length < 12) return this.error.set('Use a password with at least 12 characters.');
      if (!consent) return this.error.set('Please agree to the privacy notice to continue.');
    }
    this.busy.set(true);
    this.error.set('');
    try {
      if (this.mode() === 'signup') {
        await this.auth.signUp(email, password);
        await this.api.me();
        await this.api.consent(environment.privacyNoticeVersion);
      } else {
        await this.auth.signIn(email, password);
      }
      await this.router.navigate(['/']);
    } catch {
      this.error.set(this.mode() === 'signin' ? 'Email or password is incorrect.' : 'Could not create the account. Try another email.');
    } finally {
      this.busy.set(false);
    }
  }
}
