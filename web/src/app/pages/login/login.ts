import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { ApiService } from '../../core/api.service';
import { environment } from '../../../environments/environment';
import { MIN_PASSWORD_LENGTH, passwordHint, passwordLevel } from '../../core/password-strength';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <section class="card narrow">
      <h1>{{ mode() === 'signin' ? 'Welcome back' : 'Create your account' }}</h1>
      <p class="muted">
        {{ mode() === 'signin' ? 'Sign in to see your scholarships and deadlines.' : 'Track every requirement, with the sentence it came from.' }}
      </p>
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

        <div class="row-between">
          <label for="password">Password</label>
          @if (mode() === 'signin') {
            <a routerLink="/forgot-password" class="small">Forgot password?</a>
          }
        </div>
        <div class="pwd">
          <input
            id="password"
            [type]="showPassword() ? 'text' : 'password'"
            formControlName="password"
            [attr.autocomplete]="mode() === 'signin' ? 'current-password' : 'new-password'"
            (input)="passwordText.set($any($event.target).value)"
            required
          />
          <button type="button" class="toggle" (click)="showPassword.set(!showPassword())" [attr.aria-pressed]="showPassword()">
            {{ showPassword() ? 'Hide' : 'Show' }}
          </button>
        </div>
        @if (mode() === 'signup') {
          <div class="meter" [attr.data-level]="level()" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
          <p class="hint" aria-live="polite">{{ hint() }}</p>
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
      <p class="switch">
        {{ mode() === 'signin' ? 'New here?' : 'Already have an account?' }}
        <button class="link" type="button" (click)="toggle()">{{ mode() === 'signin' ? 'Create an account' : 'Sign in' }}</button>
      </p>
    </section>
  `,
  styles: `
    .switch { margin: 20px 0 0; padding-top: 16px; border-top: 1px solid var(--line); color: var(--ink-soft); }
    .switch .link { font-size: 15px; }
  `,
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  protected readonly route = inject(ActivatedRoute);

  protected readonly mode = signal<'signin' | 'signup'>(
    inject(ActivatedRoute).snapshot.queryParamMap.get('mode') === 'signup' ? 'signup' : 'signin',
  );
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly showPassword = signal(false);
  protected readonly passwordText = signal('');
  protected readonly level = computed(() => passwordLevel(this.passwordText()));
  protected readonly hint = computed(() => passwordHint(this.passwordText()));

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
      if (password.length < MIN_PASSWORD_LENGTH) return this.error.set(`Use a password with at least ${MIN_PASSWORD_LENGTH} characters.`);
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
