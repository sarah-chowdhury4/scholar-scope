import { FieldValue } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import { userDoc } from './firebase';
import { queue, QUEUE_FOR_JOB } from './platform/queue/index';
import type { JobMessage, JobStatus, JobType } from './types';

/** Create users/{uid}/jobs/{jobId} (for progress in the UI) and put the job on its queue. */
export async function enqueueJob(uid: string, type: JobType, target: string): Promise<string> {
  const jobId = randomUUID();
  const queueName = QUEUE_FOR_JOB[type];
  await userDoc(uid).collection('jobs').doc(jobId).set({
    type,
    queue: queueName,
    status: 'queued' satisfies JobStatus,
    progress: 0,
    attempts: 0,
    error: null,
    target,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  const message: JobMessage = { jobId, type, uid, target };
  await (await queue()).enqueue(queueName, message);
  return jobId;
}

export async function updateJob(
  uid: string,
  jobId: string,
  fields: { status?: JobStatus; progress?: number; error?: string | null; attempts?: number; nextJobId?: string },
): Promise<void> {
  await userDoc(uid)
    .collection('jobs')
    .doc(jobId)
    .set({ ...fields, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}
