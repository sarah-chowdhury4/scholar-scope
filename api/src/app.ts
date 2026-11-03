import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ZodError } from 'zod';
import { log, errorMessage } from '@scholarscope/shared';
import { requireAuth } from './auth';
import { meRouter } from './routes/me';
import { scholarshipsRouter } from './routes/scholarships';
import { uploadsRouter } from './routes/uploads';
import { jobsRouter, sourcesRouter, alertsRouter } from './routes/misc';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(express.json({ limit: '100kb' }));

  const allowedOrigin = process.env.CORS_ORIGIN;
  if (allowedOrigin) {
    app.use((req, res, next) => {
      if (req.headers.origin === allowedOrigin) {
        res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
      }
      if (req.method === 'OPTIONS') return res.sendStatus(204);
      next();
    });
  }

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

  const api = express.Router();
  api.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false }));
  api.use(requireAuth);
  api.use('/me', meRouter);
  api.use('/scholarships', scholarshipsRouter);
  api.use('/uploads', uploadsRouter);
  api.use('/jobs', jobsRouter);
  api.use('/sources', sourcesRouter);
  api.use('/alerts', alertsRouter);
  app.use('/api', api);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  // In a production image the Angular build is copied to ./public and served from here.
  const publicDir = resolve(process.env.PUBLIC_DIR || 'public');
  if (existsSync(publicDir)) {
    app.use(express.static(publicDir, { index: false, maxAge: '1h' }));
    app.get('/{*path}', (_req, res) => res.sendFile(resolve(publicDir, 'index.html')));
  }

  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
    }
    log.error('request_failed', { method: req.method, path: req.path, error: errorMessage(err) });
    res.status(500).json({ error: 'Something went wrong' });
  });

  return app;
}
