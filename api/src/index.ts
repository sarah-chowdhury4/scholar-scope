import { assertSafeEnvironment, ensureAppConfig, log } from '@scholarscope/shared';

assertSafeEnvironment(); // must run before anything talks to Firebase or storage

const { createApp } = await import('./app');
await ensureAppConfig();

const port = Number(process.env.PORT || 3000);
createApp().listen(port, () => log.info('api_started', { port, env: process.env.APP_ENV }));
