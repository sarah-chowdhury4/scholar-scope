import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { from, switchMap, catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/** Adds the ID token to /api calls only (never to presigned storage URLs or other hosts). */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith('/api/')) return next(req);
  const auth = inject(AuthService);
  return from(auth.token()).pipe(
    switchMap((token) => next(token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req)),
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && err.status === 401) {
        void auth.signOut(err.error?.code === 'idle_timeout' ? 'idle' : undefined);
      }
      return throwError(() => err);
    }),
  );
};
