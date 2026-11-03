/** Core types from the ScholarScope schema (Firestore). */
import type { Timestamp } from 'firebase-admin/firestore';

export type Actor = { type: 'student' | 'system' | 'ai'; id: string };

export type Citation = {
  sourceId: string;
  sourceVersionId: string;
  page: number | null;
  section: string | null;
  charStart: number;
  charEnd: number;
  quote: string;
  quoteHash: string;
  ocrDerived: boolean;
};

export type Verification = 'verified' | 'needs_review' | 'unverified';
export type Readiness = 'missing' | 'in_draft' | 'ready' | 'changed';

export type DeadlineValue = {
  utc: Timestamp;
  sourceTimezone: string;
  sourceText: string;
  allDay: boolean;
};

export const REQUIREMENT_KINDS = [
  'deadline',
  'essay',
  'word_limit',
  'transcript',
  'recommendation',
  'eligibility',
  'form',
  'video',
  'financial_doc',
  'other',
] as const;
export type RequirementKind = (typeof REQUIREMENT_KINDS)[number];

export const SCHOLARSHIP_STATUSES = ['researching', 'in_progress', 'ready', 'submitted', 'archived'] as const;
export type ScholarshipStatus = (typeof SCHOLARSHIP_STATUSES)[number];

export type ScanStatus = 'pending' | 'clean' | 'infected' | 'rejected_type' | 'too_large';

export type QueueName = 'gemini' | 'nim' | 'default';

export type JobType =
  | 'scan'
  | 'extract'
  | 'fetch_url'
  | 'classify'
  | 'embed'
  | 'diff'
  | 'draft'
  | 'alert_email';

/** Message placed on a queue. Everything else is read from Firestore by the handler. */
export type JobMessage = {
  jobId: string;
  type: JobType;
  uid: string;
  /** Firestore path of the thing the job works on, e.g. users/{uid}/sources/{id}/versions/{vid} */
  target: string;
};

export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'paused_ai_off';

export type AppConfig = {
  aiEnabled: boolean;
  aiPausedReason: string | null;
  maxScholarshipsPerStudent: number;
  confidenceThreshold: number;
  dailyDraftLimit: number;
  dailyPageLimit: number;
  maxUploadBytes: number;
  maxUploadPages: number;
  alertOffsetsDays: number[];
};
