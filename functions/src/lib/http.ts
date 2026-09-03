import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodTypeAny, infer as ZInfer } from 'zod';
import { badRequest } from './errors';

/** Wrap async handlers so thrown errors reach the error middleware. */
export const wrap =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

export function parseBody<T extends ZodTypeAny>(schema: T, body: unknown): ZInfer<T> {
  const r = schema.safeParse(body);
  if (!r.success) throw badRequest('Invalid request body', r.error.flatten());
  return r.data;
}

export function qs(req: Request, key: string): string | undefined {
  const v = req.query[key];
  return typeof v === 'string' ? v : Array.isArray(v) ? String(v[0]) : undefined;
}
