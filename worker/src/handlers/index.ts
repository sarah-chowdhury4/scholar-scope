import { updateJob, log, errorMessage, type JobMessage, type JobType } from '@scholarscope/shared';
import { handleScan } from './scan';
import { handleExtract } from './extract';
import { handleFetchUrl } from './fetchUrl';

type Handler = (job: JobMessage) => Promise<void>;

/**
 * Job handlers. Locally the SQS consumer calls these; on Google Cloud the same functions sit
 * behind POST /tasks/:type endpoints that Cloud Tasks calls.
 * TODO (Eshani/Alexis): diff (Gemini side-by-side compare), draft (FR-6), classify + embed (NIM, FR-5).
 */
const HANDLERS: Partial<Record<JobType, Handler>> = {
  scan: handleScan,
  extract: handleExtract,
  fetch_url: handleFetchUrl,
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
    if (job.type === 'extract') log.error('extraction_failed', { jobId: job.jobId, attempt, error: errorMessage(err) });
    throw err; // let the queue retry (SQS redelivery / Cloud Tasks retry)
  }
}
