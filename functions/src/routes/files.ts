import { Router, type Request } from 'express';
import busboy from 'busboy';
import type { UploadResponse } from '@tms/shared';
import { actorOf } from '../lib/context';
import { badRequest } from '../lib/errors';
import { wrap } from '../lib/http';
import { ALLOWED_MIME, MAX_UPLOAD_BYTES, saveUpload, streamFile } from '../services/files';

interface ParsedUpload {
  file?: { originalname: string; mimetype: string; size: number; buffer: Buffer };
  fields: Record<string, string>;
}

/**
 * Parse a single-file multipart body. Cloud Functions (and its emulator) consume the request stream up front and
 * expose it as `req.rawBody`, which is why plain multer fails there ("Unexpected end of form"); when `rawBody` is
 * present we feed that buffer to busboy, otherwise we pipe the live request stream.
 */
function parseMultipart(req: Request): Promise<ParsedUpload> {
  return new Promise((resolve, reject) => {
    if (!/^multipart\/form-data/i.test(req.headers['content-type'] ?? '')) return reject(badRequest('Expected multipart/form-data with a "file" field'));
    const bb = busboy({ headers: req.headers, limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 10 } });
    const out: ParsedUpload = { fields: {} };
    let failed: Error | null = null;
    bb.on('field', (name, value) => {
      out.fields[name] = value;
    });
    bb.on('file', (name, stream, info) => {
      if (name !== 'file' || !ALLOWED_MIME.test(info.mimeType)) {
        failed = badRequest(name !== 'file' ? 'Multipart field "file" is required' : 'Only images and PDF files are accepted');
        stream.resume();
        return;
      }
      const chunks: Buffer[] = [];
      stream.on('data', (c: Buffer) => chunks.push(c));
      stream.on('limit', () => {
        failed = badRequest('File exceeds 10 MB');
      });
      stream.on('end', () => {
        if (failed) return;
        const buffer = Buffer.concat(chunks);
        out.file = { originalname: info.filename || 'upload', mimetype: info.mimeType, size: buffer.length, buffer };
      });
    });
    bb.on('error', (e) => reject(e));
    bb.on('close', () => (failed ? reject(failed) : resolve(out)));
    const raw = (req as Request & { rawBody?: Buffer }).rawBody;
    if (raw && raw.length) bb.end(raw);
    else req.pipe(bb);
  });
}

export function filesRouter(): Router {
  const r = Router();

  r.post(
    '/',
    wrap(async (req, res) => {
      const actor = actorOf(req);
      const parsed = await parseMultipart(req);
      if (!parsed.file) throw badRequest('Multipart field "file" is required');
      const attachment = await saveUpload(actor, parsed.file, parsed.fields.kind);
      const out: UploadResponse = { attachment };
      res.status(201).json(out);
    }),
  );

  r.get('/:id', wrap(async (req, res) => streamFile(actorOf(req), req.params.id, res)));
  return r;
}
