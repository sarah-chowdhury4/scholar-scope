import { Routes } from '@angular/router';
import { adminGuard, authGuard, guestGuard, studentGuard } from './core/auth.guard';

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
    canActivate: [studentGuard],
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
    canActivate: [studentGuard],
    loadComponent: () => import('./pages/documents/documents').then((m) => m.DocumentsPage),
    title: 'Documents · ScholarScope',
  },
  {
    path: 'print',
    canActivate: [studentGuard],
    loadComponent: () => import('./pages/print/print').then((m) => m.PrintPage),
    title: 'Checklist · ScholarScope',
  },
  {
    path: 'alerts',
    canActivate: [studentGuard],
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
    canActivate: [studentGuard],
    loadComponent: () => import('./pages/add-scholarship/add-scholarship').then((m) => m.AddScholarship),
    title: 'Add a scholarship · ScholarScope',
  },
  {
    path: 'scholarships/:id',
    canActivate: [studentGuard],
    loadComponent: () => import('./pages/scholarship/scholarship').then((m) => m.ScholarshipPage),
    title: 'Scholarship · ScholarScope',
  },
  {
    path: 'admin',
    canActivate: [adminGuard],
    loadComponent: () => import('./pages/admin/admin').then((m) => m.AdminPage),
    loadChildren: () => import('./pages/admin/admin.routes').then((m) => m.ADMIN_ROUTES),
  },
  { path: '**', redirectTo: '' },
];
