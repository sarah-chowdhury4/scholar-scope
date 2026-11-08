import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService, apiMessage, type Me, type ProfileOptions } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { CountryPicker } from './country-picker';

@Component({
  selector: 'app-profile',
  imports: [ReactiveFormsModule, RouterLink, CountryPicker],
  template: `
    <h1>Your profile</h1>
    <p class="hint">
      Deadline emails go to your primary address. Citizenship, where you live, and your studies are what later
      recommendations use to tell domestic and international awards apart.
    </p>

    @if (status()) {
      <p [class]="statusBad() ? 'error' : 'success'" role="status">{{ status() }}</p>
    }

    @if (loading()) {
      <p>Loading…</p>
    } @else if (loadError()) {
      <p class="error" role="alert">{{ loadError() }}</p>
      <button type="button" (click)="load()">Try again</button>
    } @else if (profile(); as me) {
      <section class="card">
        <h2>{{ me.displayName || 'Student' }}</h2>
        <p class="muted">{{ me.email }}</p>
        <p class="hint">Profile ready for recommendations: {{ me.readinessPercent }}%</p>
        <div class="bar" aria-hidden="true"><span [style.width.%]="me.readinessPercent"></span></div>
        @if (me.missingForRecommendations.length) {
          <p>Still needed: {{ join(me.missingForRecommendations) }}.</p>
        } @else {
          <p>The facts recommendations need are filled in.</p>
        }
        @if (!me.timezoneChosen) {
          <p class="hint">Deadlines you add still use this device's time zone until you save one below.</p>
        }
        @if (me.deletion?.requestedAt) {
          <p class="warning" role="status">Deletion has been requested. It finishes when the deletion job runs.</p>
        }
      </section>

      <section class="card">
        <h2>Name</h2>
        <form [formGroup]="nameForm" (ngSubmit)="saveName()">
          <label for="displayName">Name</label>
          <input id="displayName" formControlName="displayName" autocomplete="name" maxlength="80" />
          @if (errors()['name']) { <p class="error" role="alert">{{ errors()['name'] }}</p> }
          <button type="submit" [disabled]="busy() !== null">Save name</button>
        </form>
      </section>

      <section class="card">
        <h2>Email addresses</h2>
        <p class="hint">
          You sign in, and deadline alerts are sent, with the primary address. Other addresses stay for contact until
          you confirm them and choose a new primary. You can keep up to {{ options()?.limits?.maxEmails ?? 5 }}.
        </p>
        @for (email of me.emails; track email.address) {
          <div class="email-row">
            <div>
              <strong>{{ email.address }}</strong>
              @if (email.primary) { <span class="badge verified">Primary</span> }
              @if (email.verified) { <span class="badge verified">Confirmed</span> }
            </div>
            <div class="actions">
              @if (!email.primary && email.verified) {
                <button type="button" class="secondary" [disabled]="busy() !== null" (click)="startPrimary(email.address)">
                  Make primary
                </button>
              }
              @if (!email.primary) {
                <button type="button" class="secondary" [disabled]="busy() !== null" (click)="removeEmail(email.address)">
                  Remove
                </button>
              }
            </div>
          </div>
          @if (primaryFor() === email.address) {
            <form (ngSubmit)="makePrimary(email.address)">
              <label [attr.for]="'primaryPwd-' + email.address">Current password</label>
              <input
                [id]="'primaryPwd-' + email.address"
                [type]="show()['primary'] ? 'text' : 'password'"
                autocomplete="current-password"
                [value]="primaryPassword()"
                (input)="primaryPassword.set(text($event))"
                required
              />
              <button type="button" class="link" (click)="toggleShow('primary')">{{ show()['primary'] ? 'Hide' : 'Show' }} password</button>
              @if (errors()['primary']) { <p class="error" role="alert">{{ errors()['primary'] }}</p> }
              <div class="actions">
                <button type="submit" [disabled]="busy() !== null">Confirm primary</button>
                <button type="button" class="secondary" (click)="primaryFor.set(null)">Cancel</button>
              </div>
            </form>
          }
        }
        @if (me.emails.length === 1) {
          <p class="hint">Add another confirmed address before you can remove the primary.</p>
        }

        @if (me.pendingEmail) {
          <form (ngSubmit)="verifyEmail()">
            <p>
              Confirmation pending for <strong>{{ me.pendingEmail.address }}</strong>.
              @if (me.pendingEmail.replaces) {
                This replaces {{ me.pendingEmail.replaces }} after you enter the code. Your sign-in email stays the same until then.
              }
            </p>
            <label for="emailCode">6-digit code</label>
            <input id="emailCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" [value]="emailCode()" (input)="emailCode.set(text($event))" />
            @if (errors()['verify']) { <p class="error" role="alert">{{ errors()['verify'] }}</p> }
            <div class="actions">
              <button type="submit" [disabled]="busy() !== null">Confirm email</button>
              <button type="button" class="secondary" [disabled]="busy() !== null" (click)="resendCode()">Resend code</button>
              <button type="button" class="secondary" [disabled]="busy() !== null" (click)="cancelEmail()">Cancel</button>
            </div>
          </form>
        } @else {
          <form [formGroup]="addForm" (ngSubmit)="addEmail()">
            <label for="addEmail">Add an email</label>
            <input id="addEmail" type="email" formControlName="address" autocomplete="email" />
            @if (errors()['add']) { <p class="error" role="alert">{{ errors()['add'] }}</p> }
            <button type="submit" [disabled]="busy() !== null || me.emails.length >= (options()?.limits?.maxEmails ?? 5)">
              Send confirmation code
            </button>
          </form>

          <form [formGroup]="replaceForm" (ngSubmit)="replaceEmail()">
            <label for="replaceWhich">Replace an email</label>
            <select id="replaceWhich" formControlName="currentAddress">
              @for (email of me.emails; track email.address) {
                <option [value]="email.address">{{ email.address }}{{ email.primary ? ' (primary)' : '' }}</option>
              }
            </select>
            <label for="replaceNew">New email</label>
            <input id="replaceNew" type="email" formControlName="newAddress" autocomplete="email" />
            @if (replacingPrimary()) {
              <label for="replacePwd">Current password</label>
              <input id="replacePwd" type="password" formControlName="currentPassword" autocomplete="current-password" />
              <p class="hint">Required because this changes the address you sign in with.</p>
            }
            @if (errors()['replace']) { <p class="error" role="alert">{{ errors()['replace'] }}</p> }
            <button type="submit" [disabled]="busy() !== null">Send confirmation code</button>
          </form>
        }
      </section>

      <section class="card">
        <h2>Password</h2>
        <p class="hint">At least 12 characters, the same rule as sign-up.</p>
        <form [formGroup]="passwordForm" (ngSubmit)="savePassword()">
          <label for="curPwd">Current password</label>
          <input id="curPwd" type="password" formControlName="current" autocomplete="current-password" />
          <label for="newPwd">New password</label>
          <input id="newPwd" type="password" formControlName="next" autocomplete="new-password" (input)="passwordText.set(text($event))" />
          <div class="meter" aria-hidden="true"><span [style.width.%]="passwordMeter()"></span></div>
          <p class="hint">{{ passwordLabel() }}</p>
          <label for="confPwd">Confirm new password</label>
          <input id="confPwd" type="password" formControlName="confirm" autocomplete="new-password" />
          @if (errors()['password']) { <p class="error" role="alert">{{ errors()['password'] }}</p> }
          <button type="submit" [disabled]="busy() !== null">Change password</button>
        </form>
        <a routerLink="/forgot-password">Forgot your current password?</a>
      </section>

      <section class="card">
        <h2>Countries you want scholarships in</h2>
        <p class="hint">Used later for recommendations. This does not change scholarships you already track. Up to 15.</p>
        <app-country-picker
          inputId="interestSearch"
          [countries]="options()?.countries ?? []"
          [popular]="options()?.popularCountries ?? []"
          [selected]="draftCountries()"
          [max]="options()?.limits?.maxCountriesOfInterest ?? 15"
          (selectedChange)="draftCountries.set($event)"
          (limitHit)="setStatus($event, true)"
        />
        @if (countriesDirty()) { <p class="hint">Not saved yet.</p> }
        @if (errors()['countries']) { <p class="error" role="alert">{{ errors()['countries'] }}</p> }
        <button type="button" [disabled]="busy() !== null" (click)="saveCountries()">Save countries</button>
      </section>

      <section class="card">
        <h2>Citizenship and where you live</h2>
        <p class="hint">
          A scholarship treats you as a domestic applicant in a country where you are a citizen or a permanent resident.
          A student visa or a short stay does not. Add every citizenship you hold.
        </p>
        <label for="citizenshipSearch">Citizenship</label>
        <app-country-picker
          inputId="citizenshipSearch"
          [countries]="options()?.countries ?? []"
          [popular]="options()?.popularCountries ?? []"
          [selected]="draftCitizenships()"
          [max]="options()?.limits?.maxCitizenships ?? 4"
          (selectedChange)="draftCitizenships.set($event)"
          (limitHit)="setStatus($event, true)"
        />

        <label for="locationSearch">Country you live in now</label>
        <app-country-picker
          inputId="locationSearch"
          [multiple]="false"
          [countries]="options()?.countries ?? []"
          [popular]="options()?.popularCountries ?? []"
          [selected]="draftLocation() ? [draftLocation()!] : []"
          (selectedChange)="draftLocation.set($event[0] ?? null)"
        />

        <form [formGroup]="background" (ngSubmit)="saveBackground()">
          <label for="residency">Your status in that country</label>
          <select id="residency" formControlName="residency">
            <option value="">Choose one</option>
            @for (item of options()?.residencyStatuses ?? []; track item.id) {
              <option [value]="item.id">{{ item.label }}</option>
            }
          </select>

          @if (notInSchool()) {
            <p class="hint">You are not currently in school, so a school country is not saved.</p>
          } @else {
            <label class="check">
              <input type="checkbox" formControlName="sameSchool" />
              <span>My current school is in the country where I live</span>
            </label>
            @if (!background.controls.sameSchool.value) {
              <label for="schoolSearch">Country of your current school</label>
              <app-country-picker
                inputId="schoolSearch"
                [multiple]="false"
                [countries]="options()?.countries ?? []"
                [popular]="[]"
                [selected]="draftSchool() ? [draftSchool()!] : []"
                (selectedChange)="draftSchool.set($event[0] ?? null)"
              />
            }
          }

          @if (me.domesticCountries.length) {
            <p>You count as a domestic applicant in {{ join(me.domesticCountries) }}. Everywhere else, you count as an international applicant.</p>
          } @else {
            <p>Add a citizenship, or say you are a citizen or permanent resident where you live. Until then we can't tell domestic and international scholarships apart.</p>
          }
          @if (me.schoolNote) { <p>{{ me.schoolNote }}</p> }
          @for (hint of me.hints; track hint) { <p class="hint">{{ hint }}</p> }
          @if (backgroundDirty()) { <p class="hint">Not saved yet. The paragraph above uses what is already saved.</p> }
          @if (errors()['background']) { <p class="error" role="alert">{{ errors()['background'] }}</p> }
          <button type="submit" [disabled]="busy() !== null">Save citizenship and location</button>
        </form>
      </section>

      <section class="card">
        <h2>Education</h2>
        <p class="hint">
          Highest level is what you have finished. Enrollment is what you are doing now. Scholarships often check both,
          plus GPA and field of study.
        </p>
        <form [formGroup]="education" (ngSubmit)="saveEducation()">
          <label for="highestLevel">Highest level of education</label>
          <select id="highestLevel" formControlName="highestLevel">
            <option value="">Choose one</option>
            @for (item of options()?.educationLevels ?? []; track item.id) {
              <option [value]="item.id">{{ item.label }}</option>
            }
          </select>
          <label for="enrollment">Current enrollment</label>
          <select id="enrollment" formControlName="enrollment">
            <option value="">Choose one</option>
            @for (item of options()?.enrollments ?? []; track item.id) {
              <option [value]="item.id">{{ item.label }}</option>
            }
          </select>
          <label for="fieldOfStudy">Field of study</label>
          <input id="fieldOfStudy" formControlName="fieldOfStudy" maxlength="120" placeholder="Biology, engineering, fine arts" />
          <label for="gpa">GPA</label>
          <input id="gpa" type="number" min="0" step="0.01" formControlName="gpa" />
          <label for="gpaScale">GPA scale</label>
          <select id="gpaScale" formControlName="gpaScale">
            <option value="">Choose one</option>
            @for (item of options()?.gpaScales ?? []; track item.id) {
              <option [value]="item.id">{{ item.label }}</option>
            }
          </select>
          <label for="expectedGraduation">Expected graduation month (optional)</label>
          <input id="expectedGraduation" type="month" formControlName="expectedGraduation" />
          <p class="hint">Some awards are only open to students graduating in a certain year.</p>
          <label for="birthYear">Birth year (optional)</label>
          <input id="birthYear" type="number" inputmode="numeric" [value]="birthYear()" (input)="birthYear.set(text($event))" />
          <p class="hint">Some awards have an age cutoff. A year is enough. We don't ask for your full date of birth.</p>
          <label for="languages">Languages you can study in (optional)</label>
          <input id="languages" maxlength="120" [value]="languages()" (input)="languages.set(text($event))" placeholder="English, French" />
          @if (errors()['education']) { <p class="error" role="alert">{{ errors()['education'] }}</p> }
          <button type="submit" [disabled]="busy() !== null">Save education</button>
        </form>
      </section>

      <section class="card">
        <h2>Deadlines and alerts</h2>
        <p class="hint">
          Deadline dates are converted with this time zone. Email alerts (14, 7, 3 and 1 days before) go to
          <strong>{{ me.email }}</strong>. In-app alerts stay on.
        </p>
        <form [formGroup]="settings" (ngSubmit)="saveSettings()">
          <label for="timezone">Time zone</label>
          <input id="timezone" formControlName="timezone" list="timezones" autocomplete="off" required />
          <datalist id="timezones">
            @for (zone of timeZones; track zone) {
              <option [value]="zone"></option>
            }
          </datalist>
          <label class="check">
            <input type="checkbox" formControlName="emailAlerts" />
            <span>Email me deadline alerts</span>
          </label>
          @if (errors()['settings']) { <p class="error" role="alert">{{ errors()['settings'] }}</p> }
          <button type="submit" [disabled]="busy() !== null">Save deadline settings</button>
        </form>
      </section>

      <section class="card">
        <h2>Delete my data</h2>
        <p>This asks for your scholarships, files and account to be erased. It cannot be undone.</p>
        <form [formGroup]="deleteForm" (ngSubmit)="deleteAccount()">
          <label for="deletePwd">Current password</label>
          <input id="deletePwd" type="password" formControlName="currentPassword" autocomplete="current-password" />
          @if (errors()['delete']) { <p class="error" role="alert">{{ errors()['delete'] }}</p> }
          <button type="submit" class="danger" [disabled]="busy() !== null">Delete my data</button>
        </form>
      </section>
    }
  `,
})
export class ProfilePage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  protected readonly timeZones = Intl.supportedValuesOf('timeZone');
  protected readonly profile = signal<Me | null>(null);
  protected readonly options = signal<ProfileOptions | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly status = signal('');
  protected readonly statusBad = signal(false);
  protected readonly busy = signal<string | null>(null);
  protected readonly errors = signal<Record<string, string>>({});
  protected readonly show = signal<Record<string, boolean>>({});

  protected readonly draftCountries = signal<string[]>([]);
  protected readonly draftCitizenships = signal<string[]>([]);
  protected readonly draftLocation = signal<string | null>(null);
  protected readonly draftSchool = signal<string | null>(null);
  protected readonly primaryFor = signal<string | null>(null);
  protected readonly primaryPassword = signal('');
  protected readonly emailCode = signal('');
  protected readonly birthYear = signal('');
  protected readonly languages = signal('');
  protected readonly passwordText = signal('');

  protected readonly nameForm = this.fb.nonNullable.group({ displayName: ['', Validators.maxLength(80)] });
  protected readonly addForm = this.fb.nonNullable.group({ address: ['', Validators.required] });
  protected readonly replaceForm = this.fb.nonNullable.group({
    currentAddress: [''],
    newAddress: ['', Validators.required],
    currentPassword: [''],
  });
  protected readonly passwordForm = this.fb.nonNullable.group({
    current: ['', Validators.required],
    next: ['', Validators.required],
    confirm: ['', Validators.required],
  });
  protected readonly background = this.fb.nonNullable.group({ residency: [''], sameSchool: [true] });
  protected readonly education = this.fb.nonNullable.group({
    highestLevel: [''],
    enrollment: [''],
    fieldOfStudy: [''],
    gpa: [''],
    gpaScale: [''],
    expectedGraduation: [''],
  });
  protected readonly settings = this.fb.nonNullable.group({
    timezone: [Intl.DateTimeFormat().resolvedOptions().timeZone, Validators.required],
    emailAlerts: [true],
  });
  protected readonly deleteForm = this.fb.nonNullable.group({ currentPassword: ['', Validators.required] });

  async ngOnInit() {
    const [options, me] = await Promise.all([
      this.api.profileOptions().catch(() => null),
      this.api.me().catch((err: unknown) => {
        this.loadError.set(apiMessage(err, "Couldn't load your profile. Refresh and try again."));
        return null;
      }),
    ]);
    this.options.set(options);
    if (me) this.remember(me, 'all');
    if (me && !options) this.setStatus("Couldn't load the country list. Refresh and try again.", true);
    this.loading.set(false);
  }

  async load(keepDrafts = false) {
    this.loading.set(!this.profile());
    this.loadError.set('');
    try {
      const me = await this.api.me();
      if (keepDrafts) this.remember(me);
      else this.remember(me, 'all');
    } catch (err) {
      const message = apiMessage(err, "Couldn't load your profile. Refresh and try again.");
      if (this.profile()) this.setStatus(message, true);
      else this.loadError.set(message);
    } finally {
      this.loading.set(false);
    }
  }

  protected text(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected toggleShow(id: string) {
    this.show.update((current) => ({ ...current, [id]: !current[id] }));
  }

  protected setStatus(message: string, bad = false) {
    this.status.set(message);
    this.statusBad.set(bad);
  }

  protected join(items: string[]): string {
    if (items.length <= 1) return items[0] ?? '';
    return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
  }

  protected replacingPrimary(): boolean {
    const address = this.replaceForm.controls.currentAddress.value;
    return this.profile()?.emails.some((email) => email.address === address && email.primary) ?? false;
  }

  protected countriesDirty(): boolean {
    return !sameSet(this.draftCountries(), this.profile()?.countriesOfInterest ?? []);
  }

  protected backgroundDirty(): boolean {
    const me = this.profile();
    if (!me) return false;
    const school = this.notInSchool()
      ? null
      : this.background.controls.sameSchool.value
        ? this.draftLocation()
        : this.draftSchool();
    return (
      !sameSet(this.draftCitizenships(), me.citizenships) ||
      this.draftLocation() !== me.currentLocation ||
      (this.background.controls.residency.value || null) !== me.residencyStatus ||
      school !== me.schoolCountry
    );
  }

  protected notInSchool(): boolean {
    const enrollment = this.profile()?.education.enrollment;
    return enrollment === 'gap' || enrollment === 'graduated';
  }

  protected passwordMeter(): number {
    return Math.min(100, Math.round((this.passwordText().length / 12) * 100));
  }

  protected passwordLabel(): string {
    const value = this.passwordText();
    if (!value) return 'At least 12 characters.';
    if (value.length < 12) return `${12 - value.length} more characters to go.`;
    return 'Long enough.';
  }

  protected startPrimary(address: string) {
    this.primaryFor.set(address);
    this.primaryPassword.set('');
    this.clearError('primary');
  }

  protected async saveName() {
    await this.run('name', async () => {
      const me = await this.api.updateProfile({ displayName: this.nameForm.controls.displayName.value.trim() || null });
      this.remember(me, 'name');
      this.setStatus('Name saved.');
    });
  }

  protected async addEmail() {
    const address = this.addForm.controls.address.value.trim();
    if (!address) return this.fail('add', 'Enter a valid email address.');
    await this.run('add', async () => {
      const me = await this.api.addEmail(address);
      this.addForm.reset();
      this.remember(me);
      this.setStatus(`Code sent to ${me.pendingEmail?.address ?? address}. It is not saved until you confirm it.`);
    });
  }

  protected async replaceEmail() {
    const currentAddress = this.replaceForm.controls.currentAddress.value;
    const newAddress = this.replaceForm.controls.newAddress.value.trim();
    const currentPassword = this.replaceForm.controls.currentPassword.value;
    if (!newAddress) return this.fail('replace', 'Enter a valid email address.');
    if (this.replacingPrimary() && !currentPassword) return this.fail('replace', 'Enter your current password.');
    await this.run('replace', async () => {
      const me = await this.api.changeEmail({
        currentAddress,
        newAddress,
        currentPassword: this.replacingPrimary() ? currentPassword : undefined,
      });
      this.replaceForm.controls.newAddress.reset();
      this.replaceForm.controls.currentPassword.reset();
      this.remember(me);
      this.setStatus(`Code sent to ${newAddress}. Nothing changes until you confirm it.`);
    });
  }

  protected async verifyEmail() {
    const code = this.emailCode().trim();
    const pending = this.profile()?.pendingEmail;
    const replacesPrimary =
      !!pending?.replaces && (this.profile()?.emails.some((email) => email.address === pending.replaces && email.primary) ?? false);
    if (!/^\d{6}$/.test(code)) return this.fail('verify', 'Enter the 6-digit code from the email.');
    await this.run('verify', async () => {
      const me = await this.api.verifyEmail(code);
      this.emailCode.set('');
      if (replacesPrimary) {
        try {
          await this.auth.refreshToken();
        } catch {
          await this.router.navigate(['/login'], { queryParams: { reason: 'email' } });
          return;
        }
      }
      this.remember(me);
      this.setStatus(replacesPrimary ? 'Sign-in email updated.' : 'Email confirmed.');
    });
  }

  protected async resendCode() {
    await this.run('verify', async () => {
      await this.api.resendEmailCode();
      this.setStatus('A new code is on its way.');
    });
  }

  protected async cancelEmail() {
    await this.run('verify', async () => {
      const me = await this.api.cancelEmailChange();
      this.emailCode.set('');
      this.remember(me);
      this.setStatus('Email change cancelled.');
    });
  }

  protected async removeEmail(address: string) {
    if (!confirm(`Remove ${address} from your profile?`)) return;
    await this.run('remove', async () => {
      const me = await this.api.removeEmail(address);
      this.remember(me);
      this.setStatus('Email removed.');
    });
  }

  protected async makePrimary(address: string) {
    const password = this.primaryPassword();
    if (!password) return this.fail('primary', 'Enter your current password.');
    await this.run('primary', async () => {
      const me = await this.api.makePrimaryEmail(address, password);
      try {
        await this.auth.signIn(address, password);
      } catch {
        await this.router.navigate(['/login'], { queryParams: { reason: 'email' } });
        return;
      }
      this.primaryFor.set(null);
      this.primaryPassword.set('');
      this.remember(me);
      this.setStatus('Primary email updated. Deadline alerts will use it.');
    });
  }

  protected async savePassword() {
    const { current, next, confirm } = this.passwordForm.getRawValue();
    const email = this.profile()?.email;
    if (!current) return this.fail('password', 'Enter your current password.');
    if (next.length < 12) return this.fail('password', 'Use a password with at least 12 characters.');
    if (next !== confirm) return this.fail('password', "Passwords don't match.");
    await this.run('password', async () => {
      const me = await this.api.changePassword(current, next);
      this.passwordForm.reset();
      this.passwordText.set('');
      try {
        if (email) await this.auth.signIn(email, next);
      } catch {
        await this.router.navigate(['/login'], { queryParams: { reason: 'password' } });
        return;
      }
      this.remember(me);
      this.setStatus('Password changed.');
    });
  }

  protected async saveCountries() {
    await this.run('countries', async () => {
      const me = await this.api.updateProfile({ countriesOfInterest: this.draftCountries() });
      this.remember(me, 'countries');
      this.setStatus(me.countriesOfInterest.length ? 'Scholarship countries saved.' : 'Scholarship countries cleared.');
    });
  }

  protected async saveBackground() {
    const location = this.draftLocation();
    const residency = this.background.controls.residency.value || null;
    if (location && !residency) return this.fail('background', 'Say whether you are a citizen, a permanent resident, or a visitor there.');
    if (!location && residency) return this.fail('background', 'Pick the country you live in before setting your status there.');
    let school: string | null = null;
    if (!this.notInSchool()) {
      if (this.background.controls.sameSchool.value) {
        if (!location) return this.fail('background', 'Choose the country you live in, or pick the school country yourself.');
        school = location;
      } else {
        school = this.draftSchool();
      }
    }
    await this.run('background', async () => {
      const me = await this.api.updateProfile({
        citizenships: this.draftCitizenships(),
        currentLocation: location,
        residencyStatus: residency,
        schoolCountry: school,
      });
      this.remember(me, 'background');
      this.setStatus('Citizenship and location saved.');
    });
  }

  protected async saveEducation() {
    const value = this.education.getRawValue();
    const gpaText = value.gpa == null ? '' : String(value.gpa).trim();
    const gpa = gpaText === '' ? null : Number(gpaText);
    if (gpaText !== '' && !Number.isFinite(gpa)) return this.fail('education', 'Enter a GPA or leave it blank.');
    const yearText = this.birthYear().trim();
    const birthYear = yearText === '' ? null : Number(yearText);
    if (yearText !== '' && !Number.isInteger(birthYear)) return this.fail('education', 'Birth year must be a whole number.');
    await this.run('education', async () => {
      const me = await this.api.updateProfile({
        birthYear,
        studyLanguages: this.languages().trim() || null,
        education: {
          highestLevel: value.highestLevel || null,
          enrollment: value.enrollment || null,
          fieldOfStudy: value.fieldOfStudy.trim() || null,
          gpa,
          gpaScale: value.gpaScale || null,
          expectedGraduation: value.expectedGraduation || null,
        },
      });
      this.remember(me, 'education');
      this.setStatus('Education saved.');
    });
  }

  protected async saveSettings() {
    const timezone = this.settings.controls.timezone.value.trim();
    if (!timezone) return this.fail('settings', 'Enter a time zone.');
    await this.run('settings', async () => {
      const me = await this.api.updateProfile({
        timezone,
        notificationPrefs: { email: this.settings.controls.emailAlerts.value },
      });
      this.remember(me, 'settings');
      this.setStatus('Deadline settings saved.');
    });
  }

  protected async deleteAccount() {
    const password = this.deleteForm.controls.currentPassword.value;
    if (!password) return this.fail('delete', 'Enter your current password.');
    if (!confirm('Delete all of your ScholarScope data? This cannot be undone.')) return;
    await this.run('delete', async () => {
      const me = await this.api.deleteAccount(password);
      this.deleteForm.reset();
      this.remember(me);
      this.setStatus('Deletion requested. It finishes when the deletion job runs.', false);
    });
  }

  private async run(key: string, fn: () => Promise<void>) {
    if (this.busy()) return;
    this.busy.set(key);
    this.clearError(key);
    this.status.set('');
    try {
      await fn();
    } catch (err) {
      this.fail(key, apiMessage(err, 'Something went wrong. Please try again.'));
    } finally {
      this.busy.set(null);
    }
  }

  private fail(key: string, message: string) {
    this.errors.update((current) => ({ ...current, [key]: message }));
    this.status.set('');
  }

  private clearError(key: string) {
    this.errors.update((current) => ({ ...current, [key]: '' }));
  }

  /** Updates the saved profile. Pass a section to copy that section back from the server without wiping unsaved edits elsewhere. */
  private remember(me: Me, section?: 'all' | 'name' | 'countries' | 'background' | 'education' | 'settings') {
    this.profile.set(me);
    this.syncEmailSelect(me);
    if (section === 'all' || section === 'name') this.nameForm.controls.displayName.setValue(me.displayName ?? '');
    if (section === 'all' || section === 'countries') this.draftCountries.set([...me.countriesOfInterest]);
    if (section === 'all' || section === 'background') {
      this.draftCitizenships.set([...me.citizenships]);
      this.draftLocation.set(me.currentLocation);
      this.draftSchool.set(me.schoolCountry);
      this.background.controls.residency.setValue(me.residencyStatus ?? '');
      this.background.controls.sameSchool.setValue(!me.schoolCountry || me.schoolCountry === me.currentLocation);
    }
    if (section === 'all' || section === 'education') {
      this.education.patchValue({
        highestLevel: me.education.highestLevel ?? '',
        enrollment: me.education.enrollment ?? '',
        fieldOfStudy: me.education.fieldOfStudy ?? '',
        gpa: me.education.gpa == null ? '' : String(me.education.gpa),
        gpaScale: me.education.gpaScale ?? '',
        expectedGraduation: me.education.expectedGraduation ?? '',
      });
      this.birthYear.set(me.birthYear == null ? '' : String(me.birthYear));
      this.languages.set(me.studyLanguages ?? '');
    }
    if (section === 'all' || section === 'settings') {
      this.settings.controls.timezone.setValue(
        me.timezoneChosen ? me.timezone : Intl.DateTimeFormat().resolvedOptions().timeZone,
      );
      this.settings.controls.emailAlerts.setValue(me.notificationPrefs.email);
    }
  }

  private syncEmailSelect(me: Me) {
    const current = this.replaceForm.controls.currentAddress.value;
    if (!me.emails.some((email) => email.address === current)) {
      this.replaceForm.controls.currentAddress.setValue(me.email ?? me.emails[0]?.address ?? '');
    }
    if (this.primaryFor() && !me.emails.some((email) => email.address === this.primaryFor() && !email.primary)) {
      this.primaryFor.set(null);
    }
  }
}

function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((item) => b.includes(item));
}
