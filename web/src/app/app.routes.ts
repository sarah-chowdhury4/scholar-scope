import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth.guard';

export const routes: Routes = [
  {
    path: 'welcome',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/landing/landing').then((m) => m.LandingPage),
    title: 'ScholarScope · Track scholarship requirements with a source for every claim',
  },
  { path: 'login', loadComponent: () => import('./pages/login/login').then((m) => m.Login), title: 'Sign in · ScholarScope' },
  {
    path: 'forgot-password',
    loadComponent: () => import('./pages/forgot-password/forgot-password').then((m) => m.ForgotPassword),
    title: 'Reset password · ScholarScope',
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/dashboard/dashboard').then((m) => m.Dashboard),
    title: 'Dashboard · ScholarScope',
  },
  {
    path: 'profile',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/profile/profile').then((m) => m.ProfilePage),
    title: 'Profile · ScholarScope',
  },
  {
    path: 'documents',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/documents/documents').then((m) => m.DocumentsPage),
    title: 'Documents · ScholarScope',
  },
  {
    path: 'print',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/print/print').then((m) => m.PrintPage),
    title: 'Checklist · ScholarScope',
  },
  {
    path: 'alerts',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/alerts/alerts').then((m) => m.AlertsPage),
    title: 'Alerts · ScholarScope',
  },
  {
    path: 'discover',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/discover/discover').then((m) => m.Discover),
    title: 'Discover scholarships · ScholarScope',
  },
  {
    path: 'scholarships/new',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/add-scholarship/add-scholarship').then((m) => m.AddScholarship),
    title: 'Add a scholarship · ScholarScope',
  },
  {
    path: 'scholarships/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/scholarship/scholarship').then((m) => m.ScholarshipPage),
    title: 'Scholarship · ScholarScope',
  },
  { path: '**', redirectTo: '' },
];
