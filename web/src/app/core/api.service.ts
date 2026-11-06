import { HttpClient, HttpParams } from '@angular/common/http';
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

export type Requirement = {
  id: string;
  kind: string;
  label: string;
  verification: Verification;
  readiness: string;
  changeFlag: { active: boolean } | null;
  current: { value: Record<string, unknown>; citation: Citation | null };
};

export type Me = { uid: string; email: string | null; consent: { version: string } | null; scholarshipCount: number };

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
  consent = (version: string) => firstValueFrom(this.http.post('/api/me/consent', { version }));

  scholarships = () => firstValueFrom(this.http.get<{ items: Scholarship[] }>('/api/scholarships'));
  scholarship = (id: string) =>
    firstValueFrom(this.http.get<Scholarship & { requirements: Requirement[] }>(`/api/scholarships/${id}`));
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
