'use client';
import { useState } from 'react';
import { Button, Dialog, TextArea, TextField, type ButtonVariant } from '@/components/m3';

export interface CommentDialogProps {
  open: boolean;
  title: string;
  subtitle?: string;
  /** Field label ("Comment", "Reason", "Bank reference"). */
  label?: string;
  placeholder?: string;
  initial?: string;
  confirmLabel: string;
  confirmVariant?: ButtonVariant;
  /** Confirm stays disabled (45% + explanatory label) until text is entered. Default true. */
  required?: boolean;
  singleLine?: boolean;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (text: string) => void;
}

/** Comment / reason prompt used by approval decisions, exceptions and banking references. Remounts on open so the text resets. */
export function CommentDialog(props: CommentDialogProps) {
  if (!props.open) return null;
  return <CommentDialogInner {...props} />;
}

function CommentDialogInner({ title, subtitle, label = 'Comment', placeholder, initial = '', confirmLabel, confirmVariant = 'filled', required = true, singleLine, busy, onClose, onConfirm }: CommentDialogProps) {
  const [text, setText] = useState(initial);
  const missing = required && !text.trim();
  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      actions={
        <>
          <Button variant="text" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant={confirmVariant} disabled={missing || busy} loading={busy} disabledLabel={missing ? `${confirmLabel} — ${label.toLowerCase()} required` : undefined} onClick={() => onConfirm(text.trim())}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {singleLine ? (
        <TextField label={label} placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
      ) : (
        <TextArea label={label} placeholder={placeholder} rows={4} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
      )}
    </Dialog>
  );
}
