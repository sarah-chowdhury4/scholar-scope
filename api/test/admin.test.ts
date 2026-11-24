import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { NextFunction, Request, Response } from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { adminCatalogEntrySchema, adminDeleteSchema, adminSettingsSchema } from '../src/adminSchemas';

// Stand-in for the real token check: the test says who is signed in and whether their token has the admin claim.
let signedIn: { uid: string; admin: boolean } | null = null;
vi.mock('../src/auth', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/auth')>();
  return {
    ...real,
    requireAuth: (req: Request, res: Response, next: NextFunction) => {
      if (!signedIn) return res.status(401).json({ error: 'Sign in required' });
      req.uid = signedIn.uid;
      req.admin = signedIn.admin;
      return next();
    },
  };
});

const ADMIN_ROUTES: [method: string, path: string, body?: unknown][] = [
  ['GET', '/api/admin/overview'],
  ['GET', '/api/admin/catalog'],
  ['POST', '/api/admin/catalog', {}],
  ['PUT', '/api/admin/catalog/SCH-001', {}],
  ['POST', '/api/admin/catalog/SCH-001/remove', {}],
  ['POST', '/api/admin/catalog/SCH-001/restore', {}],
  ['GET', '/api/admin/settings'],
  ['PATCH', '/api/admin/settings', { maxScholarshipsPerStudent: 99 }],
  ['GET', '/api/admin/students'],
  ['POST', '/api/admin/students/someone/admin', { admin: true }],
  ['POST', '/api/admin/students/someone/delete', { confirmEmail: 'x@y.z' }],
  ['GET', '/api/admin/audit'],
];

describe('admin routes', () => {
  let server: Server;
  let base = '';

  beforeAll(async () => {
    const { createApp } = await import('../src/app');
    server = createApp().listen(0);
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  const call = (method: string, path: string, body?: unknown) =>
    fetch(base + path, {
      method,
      headers: body ? { 'content-type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });

  it('refuses a signed-in student on every admin route', async () => {
    signedIn = { uid: 'student-1', admin: false };
    for (const [method, path, body] of ADMIN_ROUTES) {
      const res = await call(method, path, body);
      expect(res.status, `${method} ${path}`).toBe(403);
      expect(await res.json()).toEqual({ error: 'Admins only' });
    }
  });

  it('asks visitors who are not signed in to sign in', async () => {
    signedIn = null;
    for (const [method, path, body] of ADMIN_ROUTES) {
      expect((await call(method, path, body)).status, `${method} ${path}`).toBe(401);
    }
  });

  it('lets an admin past the role check (validation then applies)', async () => {
    signedIn = { uid: 'admin-1', admin: true };
    // An empty scholarship is rejected by validation, which runs only after the role check passed.
    const res = await call('POST', '/api/admin/catalog', {});
    expect(res.status).toBe(400);
  });
});

describe('admin input rules', () => {
  const entry = {
    name: 'Riverbend Future Leaders',
    organization: 'Riverbend Community Foundation',
    deadline: '2027-01-15',
    minGpa: 3.2,
    promptOrMaterials: 'Essay and two recommendation letters.',
    sourceUrl: 'https://example.org/scholarship',
    verified: true,
  };

  it('accepts a complete scholarship', () => {
    expect(adminCatalogEntrySchema.parse(entry)).toMatchObject({ name: entry.name, verified: true });
  });

  it('needs the official page before a scholarship can be marked verified', () => {
    expect(adminCatalogEntrySchema.safeParse({ ...entry, sourceUrl: null }).success).toBe(false);
    expect(adminCatalogEntrySchema.safeParse({ ...entry, sourceUrl: null, verified: false }).success).toBe(true);
  });

  it('rejects odd dates, GPAs and non-web links', () => {
    expect(adminCatalogEntrySchema.safeParse({ ...entry, deadline: '15/01/2027' }).success).toBe(false);
    expect(adminCatalogEntrySchema.safeParse({ ...entry, minGpa: 7 }).success).toBe(false);
    expect(adminCatalogEntrySchema.safeParse({ ...entry, sourceUrl: 'javascript:alert(1)' }).success).toBe(false);
  });

  it('keeps settings in sensible ranges', () => {
    expect(adminSettingsSchema.safeParse({ maxScholarshipsPerStudent: 0 }).success).toBe(false);
    expect(adminSettingsSchema.safeParse({ alertOffsetsDays: [7, 7] }).success).toBe(false);
    expect(adminSettingsSchema.safeParse({ alertOffsetsDays: [] }).success).toBe(false);
    expect(adminSettingsSchema.safeParse({ alertOffsetsDays: [14, 7, 3, 1, 0], aiEnabled: false }).success).toBe(true);
    expect(adminSettingsSchema.safeParse({ alertOffsetsDays: [-1] }).success).toBe(false);
  });

  it('requires the email to be typed to delete an account', () => {
    expect(adminDeleteSchema.safeParse({}).success).toBe(false);
  });
});
