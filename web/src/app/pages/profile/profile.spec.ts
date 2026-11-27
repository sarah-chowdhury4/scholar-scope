import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ProfilePage } from './profile';
import { ApiService, type Me } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';

const me: Me = {
  uid: 'u1',
  email: 'test@student.test',
  displayName: 'Test Student',
  timezone: 'UTC',
  timezoneChosen: false,
  consent: null,
  scholarshipCount: 0,
  notificationPrefs: { email: true, inApp: true },
  deletion: null,
  emails: [{ address: 'test@student.test', verified: true, primary: true }],
  pendingEmail: { address: 'second@student.test', replaces: null, delivery: 'sent' },
  countriesOfInterest: [],
  citizenships: [],
  currentLocation: null,
  residencyStatus: null,
  schoolCountry: null,
  birthYear: null,
  studyLanguages: null,
  education: { highestLevel: null, enrollment: null, fieldOfStudy: null, gpa: null, gpaScale: null, expectedGraduation: null },
  domesticCountries: [],
  schoolNote: null,
  hints: [],
  missingForRecommendations: [],
  readinessPercent: 0,
};

describe('ProfilePage email confirmation', () => {
  it('submits the 6-digit code to the API instead of reloading the page', async () => {
    const codes: string[] = [];
    await TestBed.configureTestingModule({
      imports: [ProfilePage],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { refreshToken: async () => undefined, signIn: async () => undefined, isAdmin: () => false } },
        {
          provide: ApiService,
          useValue: {
            me: async () => me,
            profileOptions: async () => null,
            verifyEmail: async (code: string) => {
              codes.push(code);
              return { ...me, pendingEmail: null };
            },
          },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(ProfilePage);
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Code sent.');

    const input = el.querySelector('#emailCode') as HTMLInputElement;
    input.value = '123456';
    input.dispatchEvent(new Event('input'));
    const form = input.closest('form')!;
    const submit = new Event('submit', { cancelable: true });
    form.dispatchEvent(submit);
    await fixture.whenStable();

    expect(submit.defaultPrevented).toBe(true); // no full-page reload
    expect(codes).toEqual(['123456']);
  });
});
