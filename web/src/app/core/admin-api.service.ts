import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { CatalogTag } from './api.service';

export type AdminOverview = {
  students: number;
  admins: number;
  catalogListed: number;
  catalogRemoved: number;
  pendingDeletions: number;
  aiEnabled: boolean;
};

export type AdminCatalogItem = {
  catalogId: string;
  name: string;
  organization: string;
  deadline: string | null;
  minGpa: number | null;
  promptOrMaterials: string;
  sourceUrl: string | null;
  tags: CatalogTag[];
  teamVerified: boolean;
  managedBy: 'admin' | 'dataset';
  removedAt: string | null;
  updatedAt: string | null;
};

export type AdminCatalogInput = {
  name: string;
  organization: string;
  deadline: string | null;
  minGpa: number | null;
  promptOrMaterials: string;
  sourceUrl: string | null;
  verified: boolean;
};

export type AdminSettings = {
  aiEnabled: boolean;
  aiPausedReason: string | null;
  maxScholarshipsPerStudent: number;
  dailyDraftLimit: number;
  dailyPageLimit: number;
  alertOffsetsDays: number[];
};

export type AdminStudent = {
  uid: string;
  email: string | null;
  createdAt: string | null;
  lastSignInAt: string | null;
  scholarships: number;
  admin: boolean;
  disabled: boolean;
  deletionRequestedAt: string | null;
};

export type AdminAuditItem = {
  id: string;
  at: string | null;
  action: string;
  resource: string;
  adminEmail: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};

/** Calls to /api/admin. The API refuses every one of them unless the signed-in token has the admin role. */
@Injectable({ providedIn: 'root' })
export class AdminApi {
  private readonly http = inject(HttpClient);

  overview = () => firstValueFrom(this.http.get<AdminOverview>('/api/admin/overview'));

  catalog = () => firstValueFrom(this.http.get<{ items: AdminCatalogItem[] }>('/api/admin/catalog'));
  addCatalog = (body: AdminCatalogInput) => firstValueFrom(this.http.post<{ catalogId: string }>('/api/admin/catalog', body));
  updateCatalog = (id: string, body: AdminCatalogInput) =>
    firstValueFrom(this.http.put<{ catalogId: string }>(`/api/admin/catalog/${encodeURIComponent(id)}`, body));
  setCatalogRemoved = (id: string, removed: boolean) =>
    firstValueFrom(this.http.post(`/api/admin/catalog/${encodeURIComponent(id)}/${removed ? 'remove' : 'restore'}`, {}));

  settings = () => firstValueFrom(this.http.get<AdminSettings>('/api/admin/settings'));
  saveSettings = (body: Partial<AdminSettings>) => firstValueFrom(this.http.patch<AdminSettings>('/api/admin/settings', body));

  students = () => firstValueFrom(this.http.get<{ items: AdminStudent[] }>('/api/admin/students'));
  setAdmin = (uid: string, admin: boolean) => firstValueFrom(this.http.post(`/api/admin/students/${encodeURIComponent(uid)}/admin`, { admin }));
  deleteStudent = (uid: string, confirmEmail: string) =>
    firstValueFrom(this.http.post(`/api/admin/students/${encodeURIComponent(uid)}/delete`, { confirmEmail }));

  audit = (limit = 50) =>
    firstValueFrom(this.http.get<{ items: AdminAuditItem[] }>('/api/admin/audit', { params: new HttpParams().set('limit', limit) }));
}
