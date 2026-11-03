import type { Queue } from './index';

/**
 * Cloud Tasks implementation — TODO when deploying to Google Cloud.
 * Use @google-cloud/tasks: client.createTask({ parent: queuePath(project, region, `${name}-queue`),
 *   task: { httpRequest: { httpMethod: 'POST', url: `${WORKER_URL}/tasks/${message.type}`,
 *     headers: { 'Content-Type': 'application/json' }, body: Buffer.from(JSON.stringify(message)).toString('base64'),
 *     oidcToken: { serviceAccountEmail: TASKS_INVOKER_SA, audience: WORKER_URL } } } })
 * The worker then exposes POST /tasks/:type that calls the same handlers as the SQS consumer.
 */
export function createCloudTasksQueue(): Queue {
  throw new Error('Cloud Tasks queue is not implemented yet. Use QUEUE_BACKEND=sqs locally.');
}
