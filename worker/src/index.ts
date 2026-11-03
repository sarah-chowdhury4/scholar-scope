import { assertSafeEnvironment, log, errorMessage, envNumber } from '@scholarscope/shared';

assertSafeEnvironment(); // must run before anything talks to Firebase, storage or queues

const { consume, ensureAppConfig } = await import('@scholarscope/shared');
const { runJob } = await import('./handlers/index');
const { runRecheck, runDeadlineAlerts } = await import('./cron');

await ensureAppConfig();

if (process.env.QUEUE_BACKEND !== 'sqs') {
  // On Google Cloud the worker is an HTTP service called by Cloud Tasks / Cloud Scheduler.
  throw new Error('Only QUEUE_BACKEND=sqs is implemented so far (see shared/src/platform/queue/cloudTasks.ts).');
}

const stop = new AbortController();
process.on('SIGTERM', () => stop.abort());
process.on('SIGINT', () => stop.abort());

// Same rate limits as the Cloud Tasks queues in the cloud design
void consume('gemini', 60 * envNumber('GEMINI_RATE_PER_SEC', 1), runJob, stop.signal);
void consume('nim', envNumber('NIM_RATE_PER_MIN', 30), runJob, stop.signal);
void consume('default', 300, runJob, stop.signal);

if (process.env.SCHEDULER === 'cron') {
  const cron = await import('node-cron');
  const safely = (name: string, fn: () => Promise<unknown>) => async () => {
    try {
      await fn();
    } catch (err) {
      log.error(`${name}_failed`, { error: errorMessage(err) });
    }
  };
  cron.schedule(process.env.CRON_RECHECK || '0 2 * * *', safely('recheck', runRecheck), { timezone: 'UTC' });
  cron.schedule(process.env.CRON_DEADLINE_ALERTS || '0 13 * * *', safely('deadline_alerts', () => runDeadlineAlerts()), { timezone: 'UTC' });
  log.info('cron_scheduled', { recheck: process.env.CRON_RECHECK, deadlineAlerts: process.env.CRON_DEADLINE_ALERTS });
}

log.info('worker_started', { env: process.env.APP_ENV });
