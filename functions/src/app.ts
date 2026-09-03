import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { authenticate } from './lib/auth';
import { HttpError } from './lib/errors';
import { apiRouter } from './routes';

export function createApp() {
  const app = express();
  app.set('trust proxy', true);
  app.use(
    cors({
      origin: true,
      credentials: false,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Authorization', 'Content-Type'],
    }),
  );
  app.use(express.json({ limit: '2mb' }));

  app.get(['/health', '/api/v1/health'], (_req, res) => res.json({ ok: true, service: 'ihm-tms-api', at: new Date().toISOString() }));

  app.use('/api/v1', authenticate, apiRouter());

  app.use((_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } }));

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
      return;
    }
    const anyErr = err as { code?: string; message?: string };
    if (anyErr?.code === 'auth/id-token-expired' || anyErr?.code === 'auth/argument-error') {
      res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Invalid or expired token' } });
      return;
    }
    console.error(err);
    res.status(500).json({ error: { code: 'INTERNAL', message: anyErr?.message ?? 'Internal error' } });
  });

  return app;
}
