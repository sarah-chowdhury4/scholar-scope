import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/** Turns expected failures into JSON. Anything else goes to the shared error handler. */
export function wrap(fn: (req: Request, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch((err: unknown) => {
      if (err instanceof ZodError) {
        res.status(400).json({ error: err.issues[0]?.message ?? 'Invalid request' });
        return;
      }
      if (err instanceof HttpError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      next(err);
    });
  };
}
