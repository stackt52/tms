'use client';
import { useState } from 'react';
import { fmtStamp, type Attachment } from '@tms/shared';
import { Chip, DropTile, IconButton, SelectField, UploadChip, fileIcon, humanize, useToast } from '@/components/m3';
import { openFile } from '@/lib/api';
import type { StepProps } from './wizard-state';

const KINDS: { value: Attachment['kind']; label: string; hint: string; icon: string }[] = [
  { value: 'QUOTATION', label: 'Quotation', hint: 'Hotel, flight or rental quotes', icon: 'request_quote' },
  { value: 'AGENDA', label: 'Agenda / invitation', hint: 'Workshop agenda or meeting invitation', icon: 'event_note' },
  { value: 'APPROVAL_EVIDENCE', label: 'Prior approval evidence', hint: 'Emails or memos approving the activity', icon: 'verified_user' },
  { value: 'OTHER', label: 'Other', hint: 'Any other supporting document', icon: 'attach_file' },
];

export function StepAttachments({ view, set, mobile }: StepProps) {
  const [kind, setKind] = useState<Attachment['kind']>('QUOTATION');
  const { error, success } = useToast();
  const files = view.attachments;
  const add = (a: Attachment) => {
    set({ attachments: [...files, a] });
    success(`${a.name} attached`);
  };
  const remove = (id: string) => set({ attachments: files.filter((f) => f.id !== id) });
  const meta = KINDS.find((k) => k.value === kind)!;

  return (
    <div className="col g16">
      <div className="wiz-grid">
        <SelectField label="Document type" value={kind} onChange={(e) => setKind(e.target.value as Attachment['kind'])} options={KINDS.map((k) => ({ value: k.value, label: k.label }))} onSurface={mobile} />
        <DropTile icon={meta.icon} title={`Upload ${meta.label.toLowerCase()}`} hint={`${meta.hint} · PDF or image`} kind={kind} onUploaded={add} />
      </div>

      <div>
        <div className="t-label mb8">Attached ({files.length})</div>
        {files.length ? (
          <div className="col g8">
            {files.map((f) => (
              <div key={f.id} className="wiz-person">
                <Chip tone="neutral" file icon={fileIcon(f)} onClick={() => openFile(f.id).catch((e) => error(e, 'Could not open file'))}>
                  {f.name}
                </Chip>
                <Chip tone="info" size="xs">
                  {humanize(f.kind)}
                </Chip>
                <span className="t-caption-sm grow">
                  {(f.size / 1024).toFixed(0)} KB · {fmtStamp(f.uploadedAt)}
                </span>
                <IconButton icon="delete" label={`Remove ${f.name}`} onClick={() => remove(f.id)} />
              </div>
            ))}
          </div>
        ) : (
          <div className="t-caption">Nothing attached yet. Quotations are expected for accommodation, flights and rentals.</div>
        )}
      </div>
      <div className="row g8 wrap">
        <span className="t-caption">Quick upload:</span>
        {KINDS.map((k) => (
          <UploadChip key={k.value} label={k.label} kind={k.value} icon={k.icon} onUploaded={add} />
        ))}
      </div>
    </div>
  );
}
