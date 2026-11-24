import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService, apiMessage } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { MIN_PASSWORD_LENGTH, passwordHint, passwordLevel } from '../../core/password-strength';

@Component({
  selector: 'app-forgot-password',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <section class="card narrow">
      <h1>Reset your password</h1>
      @if (!codeSent()) {
        <p>We'll email a 6-digit code if an account uses that address. The code expires in 15 minutes.</p>
        <form [formGroup]="requestForm" (ngSubmit)="send()">
          <label for="resetEmail">Email</label>
          <input id="resetEmail" type="email" formControlName="email" autocomplete="email" required />
          @if (error()) {
            <p class="error" role="alert">{{ error() }}</p>
          }
          <button type="submit" [disabled]="busy()">Send code</button>
        </form>
      } @else {
        <p>
          If an account uses <strong>{{ requestForm.controls.email.value }}</strong>, the code is in that inbox.
        </p>
        <form [formGroup]="confirmForm" (ngSubmit)="confirm()">
          <label for="resetCode">Code</label>
          <input id="resetCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" formControlName="code" required />
          <label for="resetNew">New password</label>
          <div class="pwd">
            <input id="resetNew" [type]="show() ? 'text' : 'password'" formControlName="password" autocomplete="new-password" (input)="passwordText.set($any($event.target).value)" required />
            <button type="button" class="toggle" (click)="show.set(!show())" [attr.aria-pressed]="show()">{{ show() ? 'Hide' : 'Show' }}</button>
          </div>
          <div class="meter" [attr.data-level]="level()" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
          <p class="hint" aria-live="polite">{{ hint() }}</p>
          <label for="resetConfirm">Confirm new password</label>
          <div class="pwd">
            <input id="resetConfirm" [type]="show() ? 'text' : 'password'" formControlName="confirm" autocomplete="new-password" required />
          </div>
          @if (error()) {
            <p class="error" role="alert">{{ error() }}</p>
          }
          <button type="submit" [disabled]="busy()">Save password</button>
        </form>
        <button type="button" class="link" [disabled]="busy()" (click)="send()">Send a new code</button>
      }
      <p class="small"><a routerLink="/login">Back to sign in</a></p>
    </section>
  `,
})
export class ForgotPassword {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly codeSent = signal(false);
  protected readonly show = signal(false);
  protected readonly passwordText = signal('');

  protected readonly requestForm = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });
  protected readonly confirmForm = inject(FormBuilder).nonNullable.group({
    code: ['', Validators.required],
    password: ['', Validators.required],
    confirm: ['', Validators.required],
  });

  constructor() {
    // Arriving from the profile page's "Forgot password?" dialog: the code was already sent to this address.
    const query = inject(ActivatedRoute).snapshot.queryParamMap;
    const email = query.get('email');
    if (email) this.requestForm.controls.email.setValue(email);
    if (email && query.get('sent') === '1') this.codeSent.set(true);
  }

  protected level() {
    return passwordLevel(this.passwordText());
  }

  protected hint() {
    return passwordHint(this.passwordText());
  }

  async send() {
    if (this.requestForm.invalid) return this.error.set('Enter a valid email address.');
    this.busy.set(true);
    this.error.set('');
    try {
      await this.api.requestPasswordReset(this.requestForm.controls.email.value.trim());
      this.codeSent.set(true);
    } catch (err) {
      this.error.set(apiMessage(err, 'Could not send the email. Try again.'));
    } finally {
      this.busy.set(false);
    }
  }

  async confirm() {
    const email = this.requestForm.controls.email.value.trim();
    const { code, password, confirm } = this.confirmForm.getRawValue();
    if (!/^\d{6}$/.test(code.trim())) return this.error.set('Enter the 6-digit code from the email.');
    if (password.length < MIN_PASSWORD_LENGTH) return this.error.set(`Use a password with at least ${MIN_PASSWORD_LENGTH} characters.`);
    if (password !== confirm) return this.error.set("Passwords don't match.");
    this.busy.set(true);
    this.error.set('');
    try {
      const result = await this.api.confirmPasswordReset(email, code.trim(), password);
      await this.auth.signIn(result.email, password);
      await this.router.navigate(['/']);
    } catch (err) {
      this.error.set(apiMessage(err, 'Could not reset the password. Request a new code.'));
    } finally {
      this.busy.set(false);
    }
  }
}
