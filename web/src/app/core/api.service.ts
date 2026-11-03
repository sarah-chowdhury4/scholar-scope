import { HttpClient } from '@angular/common/http';
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
  deadline?: { date: string; timezone: string } | null;
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
