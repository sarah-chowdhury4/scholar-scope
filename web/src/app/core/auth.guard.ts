import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AuthService } from './auth.service';

/** Public pages: a signed-in student goes to the dashboard instead. */
export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ready;
  return auth.signedIn() ? router.createUrlTree(['/']) : true;
};

/** Admin pages. Only hides them from students; the API refuses admin requests without the role either way. */
export const adminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ready;
  if (!auth.signedIn()) return router.createUrlTree(['/login']);
  return auth.isAdmin() ? true : router.createUrlTree(['/']);
};

export const authGuard: CanActivateFn = async (_route, state) => {
  // inject() only works before the first await, so grab both services up front.
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ready;
  if (auth.signedIn()) return true;
  // Visitors who open the home page see what ScholarScope is; deep links go straight to sign-in.
  return router.createUrlTree([state.url === '/' ? '/welcome' : '/login']);
};
