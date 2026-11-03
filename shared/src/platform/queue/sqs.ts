import {
  SQSClient,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  GetQueueUrlCommand,
} from '@aws-sdk/client-sqs';
import type { JobMessage, QueueName } from '../../types';
import { log, errorMessage } from '../../log';
import type { Queue } from './index';

// The AWS SDK reads AWS_ENDPOINT_URL (LocalStack), AWS_REGION and credentials from the environment.
// LocalStack returns queue URLs on *.localhost.localstack.cloud (= 127.0.0.1 inside a container).
// Always send requests to the configured endpoint (AWS_ENDPOINT_URL) instead of the URL host.
const sqs = new SQSClient({ useQueueUrlAsEndpoint: false });
const urls = new Map<QueueName, string>();

async function urlOf(name: QueueName): Promise<string> {
  const known = urls.get(name);
  if (known) return known;
  const r = await sqs.send(new GetQueueUrlCommand({ QueueName: `${name}-queue` }));
  if (!r.QueueUrl) throw new Error(`Queue ${name}-queue not found`);
  urls.set(name, r.QueueUrl);
  return r.QueueUrl;
}

export function createSqsQueue(): Queue {
  return {
    async enqueue(name, message) {
      await sqs.send(new SendMessageCommand({ QueueUrl: await urlOf(name), MessageBody: JSON.stringify(message) }));
    },
  };
}

/**
 * Worker side: pull jobs one at a time, at most `perMinute` per minute.
 * SQS has no dispatch-rate setting (Cloud Tasks does), so the rate limit lives here.
 * A failed job is not deleted: SQS re-delivers it after the visibility timeout, and after
 * 3 receives the redrive policy moves it to the queue's dead-letter queue.
 */
export async function consume(
  name: QueueName,
  perMinute: number,
  handle: (message: JobMessage, attempt: number) => Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  const gapMs = 60_000 / perMinute;
  const url = await urlOf(name);
  log.info('queue_consumer_started', { queue: name, perMinute });
  while (!signal?.aborted) {
    let received;
    try {
      received = await sqs.send(
        new ReceiveMessageCommand({
          QueueUrl: url,
          MaxNumberOfMessages: 1,
          WaitTimeSeconds: 20,
          MessageSystemAttributeNames: ['ApproximateReceiveCount'],
        }),
      );
    } catch (err) {
      log.error('queue_receive_failed', { queue: name, error: errorMessage(err) });
      await sleep(5_000);
      continue;
    }
    for (const m of received.Messages ?? []) {
      const started = Date.now();
      const attempt = Number(m.Attributes?.ApproximateReceiveCount ?? '1');
      try {
        const message = JSON.parse(m.Body ?? '{}') as JobMessage;
        await handle(message, attempt);
        await sqs.send(new DeleteMessageCommand({ QueueUrl: url, ReceiptHandle: m.ReceiptHandle }));
      } catch (err) {
        log.error('job_failed', { queue: name, attempt, error: errorMessage(err) });
      }
      await sleep(Math.max(0, gapMs - (Date.now() - started)));
    }
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
