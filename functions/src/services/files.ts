import type { Response } from 'express';
import type { Attachment } from '@tms/shared';
import { hasAnyRole } from '@tms/shared';
import type { Actor } from '../lib/context';
import { COL, db, nowIso, storage } from '../lib/firebase';
import { badRequest, forbidden } from '../lib/errors';
import { audit } from '../lib/audit';
import { mustGet } from '../lib/query';
import { FILE_READER_ROLES } from './access';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ALLOWED_MIME = /^(image\/(jpeg|png|gif|webp|heic|heif)|application\/pdf)$/;
const ATTACHMENT_KINDS: Attachment['kind'][] = ['QUOTATION', 'BOARDING_PASS', 'RECEIPT', 'MAPS_ROUTE', 'TICKET', 'BOOKING_CONFIRMATION', 'RENTAL_AGREEMENT', 'APPROVAL_EVIDENCE', 'VISA', 'ATTENDANCE_REGISTER', 'ACQUITTAL', 'TRIP_REPORT', 'AUTHORISATION', 'PAYMENT_PROOF', 'PHOTO', 'AGENDA', 'OTHER'];

export function bucket() {
  const name = process.env.STORAGE_BUCKET || undefined;
  return name ? storage.bucket(name) : storage.bucket();
}

export function normaliseKind(kind: unknown): Attachment['kind'] {
  return typeof kind === 'string' && (ATTACHMENT_KINDS as string[]).includes(kind) ? (kind as Attachment['kind']) : 'OTHER';
}

const safeName = (name: string) => name.replace(/[^\w.\-]+/g, '_').slice(0, 120) || 'file';

export async function saveUpload(actor: Actor, file: { originalname: string; mimetype: string; size: number; buffer: Buffer }, kind: unknown): Promise<Attachment> {
  if (!ALLOWED_MIME.test(file.mimetype)) throw badRequest('Only images and PDF files are accepted');
  if (file.size > MAX_UPLOAD_BYTES) throw badRequest('File exceeds 10 MB');
  const ref = db.collection(COL.attachments).doc();
  const storagePath = `uploads/${actor.uid}/${ref.id}-${safeName(file.originalname)}`;
  await bucket().file(storagePath).save(file.buffer, { contentType: file.mimetype, resumable: false, metadata: { metadata: { uploadedBy: actor.uid } } });
  const attachment: Attachment = {
    id: ref.id,
    name: file.originalname,
    contentType: file.mimetype,
    size: file.size,
    storagePath,
    url: `/api/v1/files/${ref.id}`,
    kind: normaliseKind(kind),
    uploadedBy: actor.uid,
    uploadedAt: nowIso(),
  };
  await ref.set(attachment);
  await audit(actor, { entityType: 'attachment', entityId: ref.id, action: 'UPLOADED', newValue: { name: attachment.name, kind: attachment.kind, size: attachment.size } });
  return attachment;
}

export async function streamFile(actor: Actor, id: string, res: Response): Promise<void> {
  const att = await mustGet<Attachment>(COL.attachments, id, 'File');
  if (att.uploadedBy !== actor.uid && !hasAnyRole(actor.roles, FILE_READER_ROLES)) throw forbidden('You cannot access this file');
  const file = bucket().file(att.storagePath);
  const [exists] = await file.exists();
  if (!exists) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'File content not found in storage' } });
    return;
  }
  res.setHeader('Content-Type', att.contentType);
  res.setHeader('Content-Disposition', `inline; filename="${safeName(att.name)}"`);
  res.setHeader('Cache-Control', 'private, max-age=300');
  await new Promise<void>((resolve, reject) => {
    file
      .createReadStream()
      .on('error', reject)
      .on('end', () => resolve())
      .pipe(res);
  });
}
