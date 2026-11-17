import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { App } from './app';
import { AuthService } from './core/auth.service';
import { AlertsStore } from './core/alerts.store';
import { ApiService } from './core/api.service';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { signedIn: signal(false), user: signal(null), signOut: () => Promise.resolve() } },
        { provide: AlertsStore, useValue: { unread: signal(0), refresh: async () => undefined, set: () => undefined } },
        { provide: ApiService, useValue: { me: async () => ({ timezone: 'UTC', timezoneChosen: false }) } },
      ],
    }).compileComponents();
  });

  it('shows the product promise', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.tagline')?.textContent).toContain('No source, no claim.');
  });

  it('hides sign out when signed out', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Sign out');
  });

  it('offers sign in when signed out', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('a.nav')?.textContent).toContain('Sign in');
  });
});
