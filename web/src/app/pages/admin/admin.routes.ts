import type { Routes } from '@angular/router';

export const ADMIN_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'catalog' },
  {
    path: 'catalog',
    loadComponent: () => import('./admin-catalog').then((m) => m.AdminCatalog),
    title: 'Catalog · Admin · ScholarScope',
  },
  {
    path: 'settings',
    loadComponent: () => import('./admin-settings').then((m) => m.AdminSettingsPage),
    title: 'Settings · Admin · ScholarScope',
  },
  {
    path: 'students',
    loadComponent: () => import('./admin-students').then((m) => m.AdminStudents),
    title: 'Students · Admin · ScholarScope',
  },
  {
    path: 'audit',
    loadComponent: () => import('./admin-audit').then((m) => m.AdminAudit),
    title: 'Audit log · Admin · ScholarScope',
  },
];
