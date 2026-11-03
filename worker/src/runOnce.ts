/** Run a scheduled job right now:  npm run cron:recheck  |  npm run cron:deadline-alerts */
import { assertSafeEnvironment } from '@scholarscope/shared';

assertSafeEnvironment();
const { runRecheck, runDeadlineAlerts } = await import('./cron');

const which = process.argv[2];
if (which === 'recheck') console.log(await runRecheck());
else if (which === 'deadline-alerts') console.log(await runDeadlineAlerts());
else {
  console.error('Usage: tsx src/runOnce.ts recheck|deadline-alerts');
  process.exit(1);
}
process.exit(0);
