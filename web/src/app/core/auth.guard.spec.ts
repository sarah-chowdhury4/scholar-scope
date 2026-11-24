import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter, type ActivatedRouteSnapshot, type RouterStateSnapshot } from '@angular/router';
import { signal } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { adminGuard } from './auth.guard';
import { AuthService } from './auth.service';

function run(signedIn: boolean, isAdmin: boolean) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: { ready: Promise.resolve(), signedIn: signal(signedIn), isAdmin: signal(isAdmin) } },
    ],
  });
  return TestBed.runInInjectionContext(() => adminGuard({} as ActivatedRouteSnapshot, { url: '/admin' } as RouterStateSnapshot));
}

const path = (r: unknown) => TestBed.inject(Router).serializeUrl(r as UrlTree);

describe('adminGuard', () => {
  it('opens the admin pages for an admin', async () => {
    expect(await run(true, true)).toBe(true);
  });

  it('sends a student back to their dashboard', async () => {
    expect(path(await run(true, false))).toBe('/');
  });

  it('sends a visitor to sign in', async () => {
    expect(path(await run(false, false))).toBe('/login');
  });
});
