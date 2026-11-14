import { FieldValue } from 'firebase-admin/firestore';
import { db, updateJob, log, errorMessage, type JobMessage, type JobType } from '@scholarscope/shared';
import { handleScan } from './scan';
import { handleExtract } from './extract';
import { handleFetchUrl } from './fetchUrl';
import { handleCheckDocument } from './checkDocument';
import { handleDiff } from './diff';

type Handler = (job: JobMessage) => Promise<void>;

/**
 * Job handlers. Locally the SQS consumer calls these; on Google Cloud the same functions sit
 * behind POST /tasks/:type endpoints that Cloud Tasks calls. Every AI job uses Gemini.
 */
const HANDLERS: Partial<Record<JobType, Handler>> = {
  scan: handleScan,
  extract: handleExtract,
  fetch_url: handleFetchUrl,
  check_document: handleCheckDocument,
  diff: handleDiff,
};

const MAX_ATTEMPTS = 3;

export async function runJob(job: JobMessage, attempt: number): Promise<void> {
  const handler = HANDLERS[job.type];
  if (!handler) {
    log.warn('job_type_not_implemented', { type: job.type, jobId: job.jobId });
    await updateJob(job.uid, job.jobId, { status: 'failed', error: 'not_implemented' });
    return; // don't retry something that can't run
  }
  try {
    await updateJob(job.uid, job.jobId, { attempts: attempt });
    await handler(job);
  } catch (err) {
    const final = attempt >= MAX_ATTEMPTS;
    await updateJob(job.uid, job.jobId, { status: final ? 'failed' : 'queued', error: errorMessage(err) });
    if (job.type === 'extract' || job.type === 'check_document') {
      log.error(`${job.type}_failed`, { jobId: job.jobId, attempt, error: errorMessage(err) });
    }
    if (final) await markGivenUp(job, errorMessage(err));
    throw err; // let the queue retry (SQS redelivery / Cloud Tasks retry)
  }
}

/** A job that ran out of attempts must not leave its record looking "in progress" forever. */
async function markGivenUp(job: JobMessage, error: string): Promise<void> {
  try {
    if (job.type === 'check_document') {
      const versionRef = db().doc(job.target);
      const check = { status: 'failed', reason: 'The check could not finish. Try again later.', jobId: job.jobId, versionId: versionRef.id, updatedAt: FieldValue.serverTimestamp() };
      await versionRef.set({ check }, { merge: true });
      const materialRef = versionRef.parent.parent!;
      if ((await materialRef.get()).get('currentVersionId') === versionRef.id) await materialRef.set({ check }, { merge: true });
    }
  } catch (err) {
    log.error('mark_given_up_failed', { jobId: job.jobId, error: errorMessage(err), cause: error });
  }
}
