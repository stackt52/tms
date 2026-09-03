'use client';
import { useState, type ReactNode } from 'react';
import { useParams } from 'next/navigation';
import { calendarDaysBetween, FINANCE_ROLES, fmtDate, fmtRange, fmtStamp, formatAmount, formatZMW, hasAnyRole, plural, type ApprovalDecision, type Attachment, type ExternalParticipantLine, type ExternalPaymentDetailResponse, type ExternalPaymentStatus, type PayoutMethod, type UpsertExternalParticipantBody } from '@tms/shared';
import { Button, Card, CardSkeleton, ChainTimeline, CheckList, Chip, Dialog, ErrorState, Icon, KV, SelectField, Skeleton, Switch, TextField, UploadChip, fileIcon, humanize, useToast } from '@/components/m3';
import { openFile } from '@/lib/api';
import { useMe } from '@/lib/auth-context';
import { useDecideExternal, useExternalAcquittal, useExternalPayment, usePayExternal, useSetParticipants, useSubmitExternal } from '@/lib/queries';
import { CommentDialog } from '@/screens/approvals/CommentDialog';
import { externalStatusTone } from './ExternalPaymentsListScreen';
import './finance.css';

const REVIEW_STATUSES: ExternalPaymentStatus[] = ['SUBMITTED', 'CC_HEAD_REVIEW', 'FINANCE_REVIEW', 'FINANCE_DIRECTOR_REVIEW', 'FINAL_APPROVAL'];
const PROVIDER_LABELS = { AIRTEL: 'Airtel Money', MTN: 'MTN MoMo', ZAMTEL: 'Zamtel Kwacha' } as const;
const COLS = { name: 2, station: 1.4, dsa: 1.2, lunch: 1.2, transport: 1.2, payout: 1.6 };

/** 1i — External-party payment request detail. */
export function ExternalPaymentScreen() {
  const { id } = useParams<{ id: string }>();
  const q = useExternalPayment(id);
  if (q.isLoading) {
    return (
      <div className="page">
        <Skeleton h={28} w="55%" />
        <div className="mt8">
          <Skeleton h={14} w="70%" />
        </div>
        <div className="split ext-split">
          <div className="main">
            <CardSkeleton lines={6} h={320} />
          </div>
          <div className="side">
            <CardSkeleton lines={3} />
            <CardSkeleton lines={4} />
          </div>
        </div>
      </div>
    );
  }
  if (q.error || !q.data) {
    return (
      <div className="page">
        <Card>
          <ErrorState error={q.error ?? new Error('Payment request not found')} retry={() => q.refetch()} />
        </Card>
      </div>
    );
  }
  return <ExternalPaymentBody id={id} data={q.data} />;
}

function toBody(l: ExternalParticipantLine): UpsertExternalParticipantBody {
  return { participantId: l.participantId, fullName: l.fullName, organisation: l.organisation, dutyStationName: l.dutyStationName, isHostSite: l.isHostSite, ihmProvidesTransport: l.ihmProvidesTransport, payout: l.payout };
}

function ExternalPaymentBody({ id, data }: { id: string; data: ExternalPaymentDetailResponse }) {
  const { payment: p, payoutsMissing, canAct, canEdit, policyRules, approvalChain } = data;
  const me = useMe();
  const toast = useToast();
  const decide = useDecideExternal(id);
  const submit = useSubmitExternal(id);
  const pay = usePayExternal(id);
  const acquit = useExternalAcquittal(id);
  const setParticipants = useSetParticipants(id);
  const [dialog, setDialog] = useState<null | 'return' | 'reject' | 'pay'>(null);
  const [editing, setEditing] = useState<{ line: ExternalParticipantLine | null } | null>(null);

  const stage = p.workflow?.stages[p.currentStageIndex];
  const inReview = REVIEW_STATUSES.includes(p.status);
  const statusLabel = inReview && stage ? `${stage.label} review` : humanize(p.status);
  const dsaDays = Math.max(0, ...p.participants.map((l) => l.dsaDays)) || calendarDaysBetween(p.startDate, p.endDate) + 1;
  const isFinance = hasAnyRole(me.user.roles, FINANCE_ROLES);

  const doDecide = (decision: ApprovalDecision, comment?: string) =>
    decide.mutate(
      { decision, comment: comment?.trim() || undefined },
      {
        onSuccess: () => {
          toast.success(decision === 'APPROVED' ? `${p.id} approved` : decision === 'RETURNED' ? `${p.id} returned for correction` : `${p.id} rejected`);
          setDialog(null);
        },
        onError: (e) => toast.error(e, 'Could not record the decision'),
      },
    );

  const saveParticipants = (list: UpsertExternalParticipantBody[], msg: string) =>
    setParticipants.mutate(
      { participants: list },
      {
        onSuccess: () => {
          toast.success(msg);
          setEditing(null);
        },
        onError: (e) => toast.error(e, 'Could not save participants'),
      },
    );

  const onSaveParticipant = (body: UpsertExternalParticipantBody) => {
    const existing = p.participants.map(toBody);
    const idx = body.participantId ? existing.findIndex((x) => x.participantId === body.participantId) : -1;
    const list = idx >= 0 ? existing.map((x, i) => (i === idx ? body : x)) : [...existing, body];
    saveParticipants(list, idx >= 0 ? `${body.fullName} updated` : `${body.fullName} added`);
  };
  const onRemoveParticipant = (participantId: string) => {
    const line = p.participants.find((l) => l.participantId === participantId);
    saveParticipants(
      p.participants.filter((l) => l.participantId !== participantId).map(toBody),
      `${line?.fullName ?? 'Participant'} removed`,
    );
  };

  const openFileSafe = (a: Attachment) => void openFile(a.id).catch((e) => toast.error(e, 'Could not open file'));

  // ----- actions block (side card) -----
  let actions: ReactNode = null;
  if (canAct) {
    actions = (
      <div className="ext-actions">
        <Button disabled={payoutsMissing > 0 || decide.isPending} loading={decide.isPending && decide.variables?.decision === 'APPROVED'} disabledLabel={payoutsMissing > 0 ? `Approve — ${plural(payoutsMissing, 'payout')} missing` : undefined} onClick={() => doDecide('APPROVED')}>
          Approve
        </Button>
        <Button variant="outlined" disabled={decide.isPending} onClick={() => setDialog('return')}>
          {payoutsMissing > 0 ? `Return — ${plural(payoutsMissing, 'payout')} missing` : 'Return for correction'}
        </Button>
        <Button variant="danger-text" disabled={decide.isPending} onClick={() => setDialog('reject')}>
          Reject
        </Button>
      </div>
    );
  } else if ((p.status === 'DRAFT' || p.status === 'RETURNED') && canEdit) {
    actions = (
      <div className="ext-actions">
        <Button
          icon="send"
          disabled={p.participants.length === 0 || submit.isPending}
          loading={submit.isPending}
          disabledLabel="Submit — add participants first"
          onClick={() =>
            submit.mutate(
              {},
              {
                onSuccess: () => toast.success(`${p.id} submitted for approval`),
                onError: (e) => toast.error(e, 'Could not submit'),
              },
            )
          }
        >
          Submit for approval
        </Button>
        {payoutsMissing > 0 ? <span className="t-caption">{plural(payoutsMissing, 'payout')} missing — approvers can&apos;t approve until captured.</span> : null}
      </div>
    );
  } else if (p.status === 'APPROVED' && isFinance) {
    actions = (
      <div className="ext-actions">
        <Button icon="payments" onClick={() => setDialog('pay')}>
          Mark paid
        </Button>
        <span className="t-caption">Electronic payment only — record the batch reference.</span>
      </div>
    );
  } else if (inReview) {
    actions = (
      <div className="row g6 mt16 t-caption">
        <Icon name="hourglass_top" size={16} />
        Waiting on {stage?.label ?? 'the next approver'}
      </div>
    );
  }

  const chain = approvalChain.map((c) => ({
    key: c.key,
    label: c.state === 'current' && canAct ? `${c.label} — you` : c.label,
    state: c.state,
    meta: c.state === 'done' || c.state === 'rejected' || c.state === 'invalidated' ? [c.actorName, c.at ? fmtStamp(c.at) : null].filter(Boolean).join(' · ') || undefined : c.state === 'current' && canAct ? undefined : c.actorName,
  }));

  return (
    <div className="page">
      <div className="mb8">
        <Button variant="text" size="xs" icon="arrow_back" href="/finance/external-payments">
          External payments
        </Button>
      </div>
      <div className="row g12 wrap">
        <div className="t-title">
          {p.id} · {p.activityTitle}, {p.activityLocationName}
        </div>
        <Chip tone={externalStatusTone(p.status)} size="md">
          {statusLabel}
        </Chip>
      </div>
      <div className="t-body-sm t-muted mt4">
        {plural(p.participants.length, 'external participant')} · {fmtRange(p.startDate, p.endDate)} · Requested by {p.requesterName} ({p.costCentreId}) · Bank transfer &amp; mobile money only — cash is not offered
      </div>

      <div className="split ext-split">
        <div className="main">
          <Card flush className="ext-table">
            <div className="tbl-scroll">
              <div>
                <div className="tbl-head">
                  <span style={{ flex: COLS.name }}>Participant</span>
                  <span style={{ flex: COLS.station }}>Duty station</span>
                  <span style={{ flex: COLS.dsa }}>DSA ({dsaDays} d)</span>
                  <span style={{ flex: COLS.lunch }}>Lunch</span>
                  <span style={{ flex: COLS.transport }}>Transport</span>
                  <span style={{ flex: COLS.payout }}>Payout</span>
                </div>
                {p.participants.length === 0 ? (
                  <div style={{ padding: '24px 18px 8px' }}>
                    <div className="t-body t-muted">No participants yet{canEdit ? ' — add each person with their payout details.' : '.'}</div>
                  </div>
                ) : (
                  p.participants.map((l) => <ParticipantRow key={l.participantId} l={l} editable={canEdit} onEdit={() => setEditing({ line: l })} />)
                )}
              </div>
            </div>
            <div className="ext-foot">
              {canEdit ? (
                <Button variant="text" size="sm" icon="add" onClick={() => setEditing({ line: null })}>
                  Add participant
                </Button>
              ) : null}
              <span className="ml-auto">{plural(p.participants.length, 'participant')}</span>
            </div>
          </Card>
        </div>

        <div className="side">
          <Card tone="dark" style={{ padding: '22px 26px' }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, opacity: 0.75 }}>REQUEST TOTAL</div>
            <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6, letterSpacing: -0.3 }}>{formatZMW(p.totals.total)}</div>
            <div className="col" style={{ gap: 6, marginTop: 10, fontSize: 12.5, opacity: 0.9 }}>
              <KV label={`DSA — GRZ/PSMD rates${p.rates.dsaEffectiveFrom ? ` (${fmtDate(p.rates.dsaEffectiveFrom)})` : ''}`} value={formatAmount(p.totals.dsa, 0)} />
              <KV label="Lunch allowance (host-site only)" value={formatAmount(p.totals.lunch, 0)} />
              <KV label={`Transport @ ZMW ${formatAmount(p.rates.transportFlat, 0)} flat`} value={formatAmount(p.totals.transport, 0)} />
            </div>
          </Card>

          <Card style={{ padding: '20px 24px', fontSize: 12.5 }}>
            <div className="ext-card-title">Policy rules applied</div>
            <div style={{ color: 'var(--md-on-surface-variant)' }}>
              <CheckList items={policyRules.map((r, i) => ({ key: `${i}-${r.label}`, label: r.label, ok: r.ok }))} />
            </div>
            {actions}
          </Card>

          {p.status === 'PAID' || p.status === 'ACQUITTED' ? (
            <Card style={{ padding: '20px 24px' }}>
              <div className="ext-card-title">Acquittal</div>
              <div className="t-caption mb10">
                Paid{p.paidAt ? ` ${fmtDate(p.paidAt)}` : ''}
                {p.paymentReference ? ` · ref ${p.paymentReference}` : ''}. Upload the signed evidence to close the request.
              </div>
              <div className="col g10">
                <AcquittalRow
                  label="Attendance register"
                  files={p.acquittal.attendanceRegister ? [p.acquittal.attendanceRegister] : []}
                  onOpen={openFileSafe}
                  chip={
                    <UploadChip
                      label={p.acquittal.attendanceRegister ? 'Replace register' : 'Attendance register'}
                      kind="ATTENDANCE_REGISTER"
                      icon="how_to_reg"
                      tone={p.acquittal.attendanceRegister ? 'dashed' : 'dashed-error'}
                      onUploaded={async (a) => {
                        await acquit.mutateAsync({ attendanceRegisterId: a.id });
                        toast.success('Attendance register attached');
                      }}
                    />
                  }
                />
                <AcquittalRow
                  label="Signed acquittal sheet"
                  files={p.acquittal.acquittalSheets}
                  onOpen={openFileSafe}
                  chip={
                    <UploadChip
                      label={p.acquittal.acquittalSheets.length ? 'Add acquittal sheet' : 'Acquittal sheet'}
                      kind="ACQUITTAL"
                      icon="draw"
                      tone={p.acquittal.acquittalSheets.length ? 'dashed' : 'dashed-error'}
                      onUploaded={async (a) => {
                        await acquit.mutateAsync({ acquittalSheetIds: [...p.acquittal.acquittalSheets.map((x) => x.id), a.id] });
                        toast.success('Acquittal sheet attached');
                      }}
                    />
                  }
                />
                <AcquittalRow
                  label="Bank / mobile-money evidence"
                  files={p.acquittal.bankEvidence ? [p.acquittal.bankEvidence] : []}
                  onOpen={openFileSafe}
                  chip={
                    <UploadChip
                      label={p.acquittal.bankEvidence ? 'Replace evidence' : 'Bank evidence'}
                      kind="PAYMENT_PROOF"
                      icon="account_balance"
                      tone={p.acquittal.bankEvidence ? 'dashed' : 'dashed-error'}
                      onUploaded={async (a) => {
                        await acquit.mutateAsync({ bankEvidenceId: a.id });
                        toast.success('Bank evidence attached');
                      }}
                    />
                  }
                />
              </div>
            </Card>
          ) : null}

          <Card style={{ padding: '18px 22px' }}>
            <div className="ext-card-title">Approval chain</div>
            {chain.length ? <ChainTimeline items={chain} /> : <div className="t-caption">Not yet submitted — Cost Centre Head → Finance Accountant → Finance Director → Project Director / CEO.</div>}
          </Card>
        </div>
      </div>

      <CommentDialog
        open={dialog === 'return'}
        title="Return for correction"
        subtitle={payoutsMissing > 0 ? `${plural(payoutsMissing, 'participant')} still ${payoutsMissing === 1 ? 'has' : 'have'} no payout details — the requester will be asked to complete them.` : 'The requester is asked to amend and resubmit.'}
        placeholder="What needs to change?"
        confirmLabel="Return"
        busy={decide.isPending && decide.variables?.decision === 'RETURNED'}
        onClose={() => setDialog(null)}
        onConfirm={(t) => doDecide('RETURNED', t)}
      />
      <CommentDialog
        open={dialog === 'reject'}
        title={`Reject ${p.id}?`}
        subtitle="This ends the request. The requester is notified with your reason."
        label="Reason"
        confirmLabel="Reject"
        confirmVariant="danger"
        busy={decide.isPending && decide.variables?.decision === 'REJECTED'}
        onClose={() => setDialog(null)}
        onConfirm={(t) => doDecide('REJECTED', t)}
      />
      <CommentDialog
        open={dialog === 'pay'}
        title="Mark as paid"
        subtitle={`${formatZMW(p.totals.total)} to ${plural(p.participants.length, 'participant')} by bank transfer / mobile money.`}
        label="Payment reference"
        placeholder="Batch or transaction reference (optional)"
        singleLine
        required={false}
        confirmLabel="Mark paid"
        busy={pay.isPending}
        onClose={() => setDialog(null)}
        onConfirm={(ref) =>
          pay.mutate(
            { reference: ref || undefined },
            {
              onSuccess: () => {
                toast.success(`${p.id} marked as paid`);
                setDialog(null);
              },
              onError: (e) => toast.error(e, 'Could not mark as paid'),
            },
          )
        }
      />
      {editing ? <ParticipantDialog line={editing.line} busy={setParticipants.isPending} onClose={() => setEditing(null)} onSave={onSaveParticipant} onRemove={editing.line ? () => onRemoveParticipant(editing.line!.participantId) : undefined} /> : null}
    </div>
  );
}

function maskTail(masked: string, keep: number): string {
  if (/[·*…•]/.test(masked)) return masked;
  const digits = masked.replace(/\D/g, '');
  return digits.length > keep ? `···${digits.slice(-keep)}` : masked;
}

function PayoutChip({ payout }: { payout: PayoutMethod }) {
  if (!payout) return <Chip tone="dashed-error">Payment details missing</Chip>;
  if (payout.type === 'MOBILE_MONEY') {
    return (
      <Chip tone="neutral" regular icon="smartphone">
        {PROVIDER_LABELS[payout.provider]} {maskTail(payout.numberMasked, 3)}
      </Chip>
    );
  }
  return (
    <Chip tone="neutral" regular icon="account_balance">
      {payout.bankName} {maskTail(payout.accountMasked, 4)}
    </Chip>
  );
}

function ParticipantRow({ l, editable, onEdit }: { l: ExternalParticipantLine; editable: boolean; onEdit: () => void }) {
  const transportNote = l.isHostSite ? "No transport allowance — activity held at participant's duty station" : l.ihmProvidesTransport ? 'No transport allowance — IHM provides transport' : undefined;
  return (
    <div
      className={`tbl-row ${l.isHostSite ? 'tbl-row--warm' : ''} ${editable ? 'tbl-row--clickable' : ''}`}
      onClick={editable ? onEdit : undefined}
      role={editable ? 'button' : undefined}
      tabIndex={editable ? 0 : undefined}
      onKeyDown={
        editable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onEdit();
              }
            }
          : undefined
      }
    >
      <span style={{ flex: COLS.name }} className="ext-name">
        {l.fullName}
        <br />
        <span className="ext-org">
          {l.organisation}
          {l.isHostSite ? ' — host site' : ''}
        </span>
      </span>
      <span style={{ flex: COLS.station }}>{l.dutyStationName}</span>
      <span style={{ flex: COLS.dsa }}>{l.dsaDays > 0 ? <b>{formatAmount(l.dsa)}</b> : <span className="ext-na">— n/a</span>}</span>
      <span style={{ flex: COLS.lunch }}>{l.lunchApplicable ? <b>{formatAmount(l.lunch)}</b> : <span className="ext-na">— excl.</span>}</span>
      <span style={{ flex: COLS.transport }}>
        {l.transport > 0 ? (
          <b>{formatAmount(l.transport)}</b>
        ) : (
          <span className="ext-warn" title={transportNote}>
            {formatAmount(0)} <Icon name="info" size={14} title={transportNote} />
          </span>
        )}
      </span>
      <span style={{ flex: COLS.payout }}>
        <PayoutChip payout={l.payout} />
      </span>
    </div>
  );
}

function AcquittalRow({ label, files, chip, onOpen }: { label: string; files: Attachment[]; chip: ReactNode; onOpen: (a: Attachment) => void }) {
  return (
    <div>
      <div className="t-caption-sm mb8" style={{ fontWeight: 650 }}>
        {label}
      </div>
      <div className="row g8 wrap">
        {files.map((a) => (
          <Chip key={a.id} tone="neutral" file icon={fileIcon(a)} onClick={() => onOpen(a)}>
            {a.name}
          </Chip>
        ))}
        {chip}
      </div>
    </div>
  );
}

type PayoutType = 'NONE' | 'MOBILE_MONEY' | 'BANK';

function ParticipantDialog({ line, busy, onClose, onSave, onRemove }: { line: ExternalParticipantLine | null; busy: boolean; onClose: () => void; onSave: (b: UpsertExternalParticipantBody) => void; onRemove?: () => void }) {
  const [form, setForm] = useState(() => ({
    fullName: line?.fullName ?? '',
    organisation: line?.organisation ?? '',
    dutyStationName: line?.dutyStationName ?? '',
    isHostSite: line?.isHostSite ?? false,
    ihmProvidesTransport: line?.ihmProvidesTransport ?? false,
    payoutType: (line?.payout?.type ?? 'NONE') as PayoutType,
    provider: (line?.payout?.type === 'MOBILE_MONEY' ? line.payout.provider : 'AIRTEL') as 'AIRTEL' | 'MTN' | 'ZAMTEL',
    number: line?.payout?.type === 'MOBILE_MONEY' ? line.payout.numberMasked : '',
    bankName: line?.payout?.type === 'BANK' ? line.payout.bankName : '',
    account: line?.payout?.type === 'BANK' ? line.payout.accountMasked : '',
  }));
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const missing: string[] = [];
  if (!form.fullName.trim()) missing.push('name');
  if (!form.organisation.trim()) missing.push('organisation');
  if (!form.dutyStationName.trim()) missing.push('duty station');
  if (form.payoutType === 'MOBILE_MONEY' && !form.number.trim()) missing.push('mobile number');
  if (form.payoutType === 'BANK' && (!form.bankName.trim() || !form.account.trim())) missing.push('bank details');

  const save = () => {
    const payout: PayoutMethod = form.payoutType === 'MOBILE_MONEY' ? { type: 'MOBILE_MONEY', provider: form.provider, numberMasked: form.number.trim() } : form.payoutType === 'BANK' ? { type: 'BANK', bankName: form.bankName.trim(), accountMasked: form.account.trim() } : null;
    onSave({
      participantId: line?.participantId,
      fullName: form.fullName.trim(),
      organisation: form.organisation.trim(),
      dutyStationName: form.dutyStationName.trim(),
      isHostSite: form.isHostSite,
      ihmProvidesTransport: form.ihmProvidesTransport,
      payout,
    });
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={line ? 'Edit participant' : 'Add participant'}
      subtitle="DSA, lunch and transport are recomputed from these flags against the effective GRZ/PSMD rates."
      actions={
        <>
          {onRemove ? (
            <Button variant="danger-text" disabled={busy} onClick={onRemove}>
              Remove
            </Button>
          ) : null}
          <div className="spacer" />
          <Button variant="text" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={missing.length > 0 || busy} loading={busy} disabledLabel={`Save — ${missing.length === 1 ? missing[0] : `${missing.length} fields`} missing`} onClick={save}>
            {line ? 'Save changes' : 'Add participant'}
          </Button>
        </>
      }
    >
      <div className="col g18 mt10">
        <TextField label="Full name" value={form.fullName} onChange={(e) => set('fullName', e.target.value)} autoFocus />
        <div className="ext-form-grid">
          <TextField label="Organisation" placeholder="MoH Katete DHO" value={form.organisation} onChange={(e) => set('organisation', e.target.value)} />
          <TextField label="Duty station" placeholder="Katete" value={form.dutyStationName} onChange={(e) => set('dutyStationName', e.target.value)} />
        </div>
        <div className="row g12">
          <Switch checked={form.isHostSite} onChange={(v) => set('isHostSite', v)} label="Host site" />
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>Activity is at this participant&apos;s duty station</div>
            <div className="t-caption">Host-site participants get lunch instead of DSA and no transport allowance.</div>
          </div>
        </div>
        <div className="row g12">
          <Switch checked={form.ihmProvidesTransport} onChange={(v) => set('ihmProvidesTransport', v)} label="IHM provides transport" disabled={form.isHostSite} />
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>IHM provides transport</div>
            <div className="t-caption">Suppresses the ZMW flat transport allowance.</div>
          </div>
        </div>
        <SelectField
          label="Payout method"
          icon="payments"
          options={[
            { value: 'NONE', label: 'Not captured yet' },
            { value: 'MOBILE_MONEY', label: 'Mobile money' },
            { value: 'BANK', label: 'Bank transfer' },
          ]}
          value={form.payoutType}
          onChange={(e) => set('payoutType', e.target.value as PayoutType)}
          hint="Cash is not offered to external parties."
        />
        {form.payoutType === 'MOBILE_MONEY' ? (
          <div className="ext-form-grid">
            <SelectField
              label="Provider"
              options={[
                { value: 'AIRTEL', label: 'Airtel Money' },
                { value: 'MTN', label: 'MTN MoMo' },
                { value: 'ZAMTEL', label: 'Zamtel Kwacha' },
              ]}
              value={form.provider}
              onChange={(e) => set('provider', e.target.value as 'AIRTEL' | 'MTN' | 'ZAMTEL')}
            />
            <TextField label="Mobile number" icon="smartphone" inputMode="tel" value={form.number} onChange={(e) => set('number', e.target.value)} />
          </div>
        ) : form.payoutType === 'BANK' ? (
          <div className="ext-form-grid">
            <TextField label="Bank" icon="account_balance" placeholder="Zanaco" value={form.bankName} onChange={(e) => set('bankName', e.target.value)} />
            <TextField label="Account number" inputMode="numeric" value={form.account} onChange={(e) => set('account', e.target.value)} />
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
