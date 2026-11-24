import { FieldValue, type DocumentReference } from 'firebase-admin/firestore';

export type RequirementCounts = { open: number; changed: number; unverified: number; needsReview: number; ready: number; total: number };

/**
 * Whether a requirement is something the student does (a checklist item). The application deadline is stored as a
 * requirement so it keeps its source quote, corrections and change history, but it is a date, not a task: it is
 * shown with the scholarship's due date and never counts toward readiness.
 */
export function isChecklistItem(r: { kind?: unknown }): boolean {
  return r.kind !== 'deadline';
}

/** Dashboard counts from the active (not removed) checklist items of one scholarship (FR-1.4). */
export function countRequirements(
  requirements: { kind?: unknown; readiness?: unknown; verification?: unknown; changeFlag?: { active?: unknown } | null }[],
): { counts: RequirementCounts; readinessPct: number } {
  const items = requirements.filter(isChecklistItem);
  const counts: RequirementCounts = { open: 0, changed: 0, unverified: 0, needsReview: 0, ready: 0, total: items.length };
  for (const r of items) {
    if (r.readiness === 'ready') counts.ready++;
    else counts.open++;
    if (r.readiness === 'changed' || r.changeFlag?.active === true) counts.changed++;
    if (r.verification === 'unverified') counts.unverified++;
    if (r.verification === 'needs_review') counts.needsReview++;
  }
  return { counts, readinessPct: counts.total ? Math.round((counts.ready / counts.total) * 100) : 0 };
}

/** Whether stored counts already match freshly computed ones (key order does not matter). */
export function sameCounts(stored: unknown, counts: RequirementCounts): boolean {
  const s = (stored ?? {}) as Record<string, unknown>;
  return (Object.keys(counts) as (keyof RequirementCounts)[]).every((k) => s[k] === counts[k]);
}

/** Recompute the dashboard counts on the scholarship head. */
export async function recomputeCounts(scholarshipRef: DocumentReference): Promise<void> {
  const reqs = await scholarshipRef.collection('requirements').where('removedAt', '==', null).get();
  const { counts, readinessPct } = countRequirements(reqs.docs.map((doc) => doc.data()));
  await scholarshipRef.update({ counts, readinessPct, updatedAt: FieldValue.serverTimestamp() });
}

export const REVIEW_ACTIONS = ['confirm', 'correct', 'reject', 'restore'] as const;
export type ReviewAction = (typeof REVIEW_ACTIONS)[number];

/**
 * What a student review does to the requirement's verification badge.
 * "No source, no claim": confirming or correcting an item keeps it unverified when it has no citation;
 * the student's word is recorded, but it is not shown as "From source".
 */
export function verificationAfterReview(action: ReviewAction, hasCitation: boolean, current: string): string {
  if (action === 'confirm' || action === 'correct') return hasCitation ? 'verified' : 'unverified';
  return current;
}
