'use client';
import { useRef, useState, type ReactNode } from 'react';
import type { Attachment } from '@tms/shared';
import { uploadFile } from '@/lib/api';
import { useToast } from './Toast';
import { Icon } from './Icon';
import { Chip } from './Chip';

/** Dashed drop-zone tile ("Google Maps route") — turns secondary-container once satisfied. */
export function DropTile({ icon, title, hint, done, doneHint, kind, onUploaded, accept = 'image/*,application/pdf' }: { icon: string; title: string; hint: string; done?: boolean; doneHint?: ReactNode; kind: Attachment['kind']; onUploaded: (a: Attachment) => void | Promise<void>; accept?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const { error } = useToast();
  const handle = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const { attachment } = await uploadFile(file, kind);
      await onUploaded(attachment);
    } catch (e) {
      error(e, 'Upload failed');
    } finally {
      setBusy(false);
    }
  };
  if (done) {
    return (
      <div className="m3-drop m3-drop--done">
        <Icon name={icon} filled size={24} color="var(--md-primary)" />
        <div className="m3-drop__title">{title}</div>
        <div className="m3-drop__hint">{doneHint ?? 'Attached ✓'}</div>
      </div>
    );
  }
  return (
    <div
      className={`m3-drop ${over ? 'm3-drop--over' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => input.current?.click()}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        void handle(e.dataTransfer.files[0]);
      }}
    >
      <Icon name={busy ? 'progress_activity' : icon} size={24} color="var(--md-primary)" />
      <div className="m3-drop__title">{title}</div>
      <div className="m3-drop__hint">{busy ? 'uploading…' : hint}</div>
      <input ref={input} type="file" accept={accept} hidden onChange={(e) => void handle(e.target.files?.[0])} />
    </div>
  );
}

/** Dashed pill "Upload receipt" chip that opens the file picker. */
export function UploadChip({ label = 'Upload', kind, onUploaded, tone = 'dashed', icon = 'upload', accept = 'image/*,application/pdf' }: { label?: string; kind: Attachment['kind']; onUploaded: (a: Attachment) => void | Promise<void>; tone?: 'dashed' | 'dashed-error'; icon?: string; accept?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const { error } = useToast();
  return (
    <>
      <Chip tone={tone} icon={busy ? 'progress_activity' : icon} file onClick={() => !busy && input.current?.click()}>
        {busy ? 'Uploading…' : label}
      </Chip>
      <input
        ref={input}
        type="file"
        accept={accept}
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setBusy(true);
          try {
            const { attachment } = await uploadFile(f, kind);
            await onUploaded(attachment);
          } catch (err) {
            error(err, 'Upload failed');
          } finally {
            setBusy(false);
            e.target.value = '';
          }
        }}
      />
    </>
  );
}

export function fileIcon(a: Pick<Attachment, 'contentType' | 'kind' | 'name'>): string {
  if (a.kind === 'TICKET') return 'airplane_ticket';
  if (a.kind === 'BOOKING_CONFIRMATION') return 'hotel';
  if (a.kind === 'RECEIPT' || a.kind === 'PAYMENT_PROOF') return 'receipt';
  if (a.kind === 'MAPS_ROUTE') return 'map';
  if (a.kind === 'PHOTO' || a.contentType.startsWith('image/')) return 'image';
  if (a.contentType === 'application/pdf') return 'picture_as_pdf';
  return 'description';
}
