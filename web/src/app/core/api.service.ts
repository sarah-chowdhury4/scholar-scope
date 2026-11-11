import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export type Verification = 'verified' | 'needs_review' | 'unverified';

export type Citation = {
  sourceId: string;
  sourceVersionId: string;
  page: number | null;
  quote: string;
  ocrDerived: boolean;
};

export type Scholarship = {
  id: string;
  name: string;
  provider: string;
  url: string | null;
  status: string;
  deadline: { utc: string; sourceText: string; allDay: boolean; verification: Verification } | null;
  counts: { open: number; changed: number; unverified: number; needsReview: number; ready: number; total: number };
  readinessPct: number;
  recheck?: { status: string; lastVerifiedAt?: { _seconds: number } | null };
};

export type StudentDocument = {
  id: string;
  type: string;
  title: string;
  fileName: string;
  scanStatus: string;
  ready: boolean;
  usedIn: string[];
};

export type ScholarshipDocuments = {
  needed: { type: string; label: string; documents: StudentDocument[] }[];
  extras: StudentDocument[];
};

export type Requirement = {
  id: string;
  kind: string;
  label: string;
  verification: Verification;
  readiness: string;
  changeFlag: { active: boolean } | null;
  current: { value: Record<string, unknown>; citation: Citation | null };
};

export type ProfileEmail = { address: string; verified: boolean; primary: boolean };

export type Education = {
  highestLevel: string | null;
  enrollment: string | null;
  fieldOfStudy: string | null;
  gpa: number | null;
  gpaScale: string | null;
  expectedGraduation: string | null;
};

export type Me = {
  uid: string;
  email: string | null;
  displayName: string | null;
  timezone: string;
  timezoneChosen: boolean;
  consent: { version: string; acceptedAt: string | null } | null;
  scholarshipCount: number;
  notificationPrefs: { email: boolean; inApp: boolean };
  deletion: { requestedAt: string | null; completedAt: string | null } | null;
  emails: ProfileEmail[];
  pendingEmail: { address: string; replaces: string | null } | null;
  countriesOfInterest: string[];
  citizenships: string[];
  currentLocation: string | null;
  residencyStatus: string | null;
  schoolCountry: string | null;
  birthYear: number | null;
  studyLanguages: string | null;
  education: Education;
  domesticCountries: string[];
  schoolNote: string | null;
  hints: string[];
  missingForRecommendations: string[];
  readinessPercent: number;
};

export type ProfileOptions = {
  countries: string[];
  popularCountries: string[];
  educationLevels: { id: string; label: string }[];
  enrollments: { id: string; label: string }[];
  residencyStatuses: { id: string; label: string }[];
  gpaScales: { id: string; label: string }[];
  limits: { maxEmails: number; maxCountriesOfInterest: number; maxCitizenships: number; minPasswordLength: number };
};

export type ProfilePatch = {
  displayName?: string | null;
  timezone?: string;
  notificationPrefs?: { email: boolean };
  countriesOfInterest?: string[];
  citizenships?: string[];
  currentLocation?: string | null;
  residencyStatus?: string | null;
  schoolCountry?: string | null;
  birthYear?: number | null;
  studyLanguages?: string | null;
  education?: {
    highestLevel?: string | null;
    enrollment?: string | null;
    fieldOfStudy?: string | null;
    gpa?: number | null;
    gpaScale?: string | null;
    expectedGraduation?: string | null;
  };
};

export function apiMessage(err: unknown, fallback: string): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) return 'Could not reach ScholarScope. Check your connection and try again.';
    const body = err.error as { error?: unknown } | null;
    if (body && typeof body.error === 'string' && body.error.trim()) return body.error;
  }
  return fallback;
}

export type NewScholarship = {
  name: string;
  provider: string;
  url?: string | null;
  awardAmount?: { amount: number; currency: string } | null;
  deadline?: { date: string; timezone: string } | null;
};

export type CatalogTag = 'essay' | 'recommendation' | 'transcript' | 'video' | 'financial' | 'resume';

export type CatalogItem = {
  catalogId: string;
  organization: string;
  name: string;
  deadline: string | null;
  minGpa: number | null;
  promptOrMaterials: string;
  sourceUrl: string | null;
  tags: CatalogTag[];
  deadlinePassed: boolean;
  addedScholarshipId: string | null;
};

export type CatalogQuery = {
  q?: string;
  deadline?: 'upcoming' | '30' | '90' | 'all';
  gpa?: number | null;
  requires?: CatalogTag[];
  excludes?: CatalogTag[];
  organization?: string;
  sort?: 'deadline' | 'name' | 'gpa';
};

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  me = () => firstValueFrom(this.http.get<Me>('/api/me'));
  profileOptions = () => firstValueFrom(this.http.get<ProfileOptions>('/api/me/options'));
  updateProfile = (body: ProfilePatch) => firstValueFrom(this.http.patch<Me>('/api/me', body));
  addEmail = (address: string) => firstValueFrom(this.http.post<Me>('/api/me/emails', { address }));
  changeEmail = (body: { currentAddress: string; newAddress: string; currentPassword?: string }) =>
    firstValueFrom(this.http.post<Me>('/api/me/emails/change', body));
  verifyEmail = (code: string) => firstValueFrom(this.http.post<Me>('/api/me/emails/verify', { code }));
  resendEmailCode = () => firstValueFrom(this.http.post<Me>('/api/me/emails/resend', {}));
  cancelEmailChange = () => firstValueFrom(this.http.post<Me>('/api/me/emails/cancel', {}));
  removeEmail = (address: string) => firstValueFrom(this.http.post<Me>('/api/me/emails/remove', { address }));
  makePrimaryEmail = (address: string, currentPassword: string) =>
    firstValueFrom(this.http.post<Me>('/api/me/emails/primary', { address, currentPassword }));
  changePassword = (currentPassword: string, newPassword: string) =>
    firstValueFrom(this.http.post<Me>('/api/me/password', { currentPassword, newPassword }));
  deleteAccount = (currentPassword: string) =>
    firstValueFrom(this.http.post<Me>('/api/me/delete', { currentPassword }));
  requestPasswordReset = (email: string) => firstValueFrom(this.http.post<{ ok: boolean }>('/api/auth/password-reset', { email }));
  confirmPasswordReset = (email: string, code: string, newPassword: string) =>
    firstValueFrom(this.http.post<{ email: string }>('/api/auth/password-reset/confirm', { email, code, newPassword }));
  consent = (version: string) => firstValueFrom(this.http.post('/api/me/consent', { version }));

  scholarships = () => firstValueFrom(this.http.get<{ items: Scholarship[] }>('/api/scholarships'));
  scholarship = (id: string) =>
    firstValueFrom(
      this.http.get<Scholarship & { requirements: Requirement[]; documents: ScholarshipDocuments }>(`/api/scholarships/${id}`),
    );

  documents = () => firstValueFrom(this.http.get<{ items: StudentDocument[] }>('/api/documents'));
  linkDocument = (id: string, scholarshipIds: string[]) =>
    firstValueFrom(this.http.patch<{ items: StudentDocument[] }>(`/api/documents/${id}`, { scholarshipIds }));
  removeDocument = (id: string) => firstValueFrom(this.http.delete<{ items: StudentDocument[] }>(`/api/documents/${id}`));
  viewDocument = (id: string) => firstValueFrom(this.http.get<{ url: string }>(`/api/documents/${id}/view`));
  createScholarship = (body: NewScholarship) => firstValueFrom(this.http.post<Scholarship>('/api/scholarships', body));
  archiveScholarship = (id: string) => firstValueFrom(this.http.post(`/api/scholarships/${id}/archive`, {}));

  /** Discover page: search and filter the scholarship catalog. */
  catalog(query: CatalogQuery) {
    let params = new HttpParams();
    if (query.q) params = params.set('q', query.q);
    if (query.deadline) params = params.set('deadline', query.deadline);
    if (query.gpa !== undefined && query.gpa !== null) params = params.set('gpa', String(query.gpa));
    if (query.requires?.length) params = params.set('requires', query.requires.join(','));
    if (query.excludes?.length) params = params.set('excludes', query.excludes.join(','));
    if (query.organization) params = params.set('organization', query.organization);
    if (query.sort) params = params.set('sort', query.sort);
    return firstValueFrom(
      this.http.get<{ items: CatalogItem[]; total: number; organizations: string[]; tags: CatalogTag[] }>('/api/catalog', { params }),
    );
  }
  addFromCatalog = (catalogId: string) =>
    firstValueFrom(this.http.post<{ scholarshipId: string; alreadyAdded: boolean }>(`/api/catalog/${catalogId}/add`, {}));

  viewSource = (sourceId: string, versionId: string) =>
    firstValueFrom(this.http.get<{ url: string }>(`/api/sources/${sourceId}/versions/${versionId}/view`));

  job = (id: string) =>
    firstValueFrom(
      this.http.get<{ type: string; status: string; progress: number; error: string | null; nextJobId: string | null }>(`/api/jobs/${id}`),
    );

  /** Upload one application file. A transcript, passport, or birth certificate replaces the file already saved for that kind. */
  async uploadDocument(file: File, documentType: string, title?: string): Promise<string> {
    const contentType = contentTypeFor(file);
    if (!contentType) throw new Error('Use a PDF, Word, text, or image file.');
    const init = await firstValueFrom(
      this.http.post<{ uploadUrl: string; itemId: string; uploadId: string; headers: Record<string, string> }>('/api/uploads', {
        fileName: file.name,
        contentType,
        size: file.size,
        purpose: 'material',
        documentType,
        title,
      }),
    );
    const put = await fetch(init.uploadUrl, { method: 'PUT', headers: init.headers, body: file });
    if (!put.ok) throw new Error(`Upload failed (${put.status})`);
    const done = await firstValueFrom(
      this.http.post<{ jobId: string }>(`/api/uploads/material/${init.itemId}/${init.uploadId}/complete`, {}),
    );
    return done.jobId;
  }

  /** Upload a guideline document: get a presigned URL, PUT the file to storage, then start processing. */
  async uploadSource(scholarshipId: string, file: File): Promise<string> {
    const init = await firstValueFrom(
      this.http.post<{ uploadUrl: string; itemId: string; uploadId: string; headers: Record<string, string> }>('/api/uploads', {
        fileName: file.name,
        contentType: file.type || 'application/octet-stream',
        size: file.size,
        purpose: 'source',
        scholarshipId,
      }),
    );
    const put = await fetch(init.uploadUrl, { method: 'PUT', headers: init.headers, body: file });
    if (!put.ok) throw new Error(`Upload failed (${put.status})`);
    const done = await firstValueFrom(
      this.http.post<{ jobId: string }>(`/api/uploads/source/${init.itemId}/${init.uploadId}/complete`, {}),
    );
    return done.jobId;
  }
}

const UPLOAD_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};

function contentTypeFor(file: File): string | null {
  if (Object.values(UPLOAD_TYPES).includes(file.type)) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return UPLOAD_TYPES[ext] ?? null;
}
