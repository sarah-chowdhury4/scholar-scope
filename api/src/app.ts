import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ZodError } from 'zod';
import { log, errorMessage } from '@scholarscope/shared';
import { requireAdmin, requireAuth } from './auth';
import { HttpError } from './http';
import { meRouter } from './routes/me';
import { passwordResetRouter } from './routes/passwordReset';
import { scholarshipsRouter } from './routes/scholarships';
import { uploadsRouter } from './routes/uploads';
import { jobsRouter, sourcesRouter, alertsRouter } from './routes/misc';
import { catalogRouter } from './routes/catalog';
import { documentsRouter } from './routes/documents';
import { requirementsRouter } from './routes/requirements';
import { changesRouter } from './routes/changes';
import { draftsRouter } from './routes/drafts';
import { exportsRouter } from './routes/exports';
import { adminRouter } from './routes/admin';

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
  // Password reset is used from the sign-in page, before a token exists.
  app.use('/api/auth', passwordResetRouter);

  const api = express.Router();
  // Before sign-in checks: a generous cap per address, against floods of unauthenticated requests.
  api.use(rateLimit({ windowMs: 60_000, limit: 1200, standardHeaders: 'draft-8', legacyHeaders: false }));
  api.use(requireAuth);
  // Per signed-in student, so classmates on one network don't share an allowance. Switching pages quickly
  // makes 3-4 reads per page, so this leaves plenty of room while still stopping a runaway client.
  api.use(
    rateLimit({
      windowMs: 60_000,
      limit: 600,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      keyGenerator: (req) => `uid:${req.uid}`,
      message: { error: 'Too many requests. Wait a few seconds and try again.' },
    }),
  );
  api.use('/me', meRouter);
  api.use('/scholarships/:id/requirements', requirementsRouter);
  api.use('/scholarships/:id/changes', changesRouter);
  api.use('/scholarships', scholarshipsRouter);
  api.use('/uploads', uploadsRouter);
  api.use('/jobs', jobsRouter);
  api.use('/sources', sourcesRouter);
  api.use('/alerts', alertsRouter);
  api.use('/catalog', catalogRouter);
  api.use('/documents', documentsRouter);
  api.use('/drafts', draftsRouter);
  api.use('/exports', exportsRouter);
  api.use('/admin', requireAdmin, adminRouter);
  app.use('/api', api);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  // In a production image the Angular build is copied to ./public and served from here.
  const publicDir = resolve(process.env.PUBLIC_DIR || 'public');
  if (existsSync(publicDir)) {
    app.use(express.static(publicDir, { index: false, maxAge: '1h' }));
    app.get('/{*path}', (_req, res) => res.sendFile(resolve(publicDir, 'index.html')));
  }

  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err instanceof ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
    }
    log.error('request_failed', { method: req.method, path: req.path, error: errorMessage(err) });
    res.status(500).json({ error: 'Something went wrong' });
  });

  return app;
}
