import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./pages/login/login').then((m) => m.Login), title: 'Sign in · ScholarScope' },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/dashboard/dashboard').then((m) => m.Dashboard),
    title: 'Dashboard · ScholarScope',
  },
  {
    path: 'scholarships/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/scholarship/scholarship').then((m) => m.ScholarshipPage),
    title: 'Scholarship · ScholarScope',
  },
  { path: '**', redirectTo: '' },
];
