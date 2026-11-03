import type { JobMessage, QueueName } from '../../types';

/**
 * Job queues behind one interface.
 *   QUEUE_BACKEND=sqs        -> LocalStack SQS locally (the worker polls)
 *   QUEUE_BACKEND=cloudtasks -> Cloud Tasks on Google Cloud (pushes HTTP POSTs to the worker)
 * Queues: gemini (accuracy-critical AI), nim (light AI), default (scan, OCR, fetch, email).
 */
export interface Queue {
  enqueue(queue: QueueName, message: JobMessage): Promise<void>;
}

let instance: Promise<Queue> | undefined;

export function queue(): Promise<Queue> {
  instance ??= (async () => {
    switch (process.env.QUEUE_BACKEND) {
      case 'sqs':
        return (await import('./sqs')).createSqsQueue();
      case 'cloudtasks':
        return (await import('./cloudTasks')).createCloudTasksQueue();
      default:
        throw new Error('QUEUE_BACKEND must be "sqs" or "cloudtasks"');
    }
  })();
  return instance;
}

export const QUEUE_FOR_JOB: Record<JobMessage['type'], QueueName> = {
  scan: 'default',
  fetch_url: 'default',
  alert_email: 'default',
  extract: 'gemini',
  diff: 'gemini',
  draft: 'gemini',
  classify: 'nim',
  embed: 'nim',
};
