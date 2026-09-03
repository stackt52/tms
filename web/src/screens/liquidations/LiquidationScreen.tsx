'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  COST_CATEGORY_LABELS,
  fmtDay,
  fmtStamp,
  formatAmount,
  formatZMW,
  plural,
  type Attachment,
  type CostCategory,
  type ExpenseLine,
  type LiquidationDetailResponse,
  type TripReport,
} from '@tms/shared';
import {
  Banner,
  Button,
  Card,
  CardLabel,
  CardSkeleton,
  CheckList,
  CheckRow,
  Chip,
  Dialog,
  ErrorState,
  Icon,
  PageHeader,
  SelectField,
  TextArea,
  TextField,
  UploadChip,
  humanize,
  toneFor,
  useToast,
} from '@/components/m3';
import { openFile } from '@/lib/api';
import { useMe } from '@/lib/auth-context';
import {
  useAddExpenseLine,
  useApproveTripReport,
  useAttachBoardingPass,
  useAttachReceipt,
  useDeleteExpenseLine,
  useLiquidation,
  useReviewLiquidation,
  useSubmitLiquidation,
  useSubmitTripReport,
  useUpdateLiquidation,
} from '@/lib/queries';
import './liquidations.css';

/* ------------------------------------------------------------------ helpers */

/** Debounced "schedule a save" helper — the latest value wins, flushed on unmount. */
function useDebouncedSave<T>(save: (v: T) => void, delay = 700) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<T | null>(null);
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);
  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (pending.current !== null) {
      const v = pending.current;
      pending.current = null;
      saveRef.current(v);
    }
  }, []);
  const schedule = useCallback(
    (v: T) => {
      pending.current = v;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, delay);
    },
    [delay, flush],
  );
  useEffect(() => () => flush(), [flush]);
  return { schedule, flush };
}

const lcFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const firstName = (s: string) => s.trim().split(/\s+/)[0] ?? s;

const REPORT_FIELDS: { key: keyof Pick<TripReport, 'objective' | 'activities' | 'locations' | 'outcomes' | 'challenges' | 'followUps' | 'recommendations'>; label: string; wide?: boolean }[] = [
  { key: 'objective', label: 'Objective of the trip', wide: true },
  { key: 'activities', label: 'Activities undertaken' },
  { key: 'locations', label: 'Locations visited' },
  { key: 'outcomes', label: 'Outcomes / results' },
  { key: 'challenges', label: 'Challenges encountered' },
  { key: 'followUps', label: 'Follow-up actions' },
  { key: 'recommendations', label: 'Recommendations' },
];

const CATEGORY_OPTIONS = (Object.keys(COST_CATEGORY_LABELS) as CostCategory[]).map((c) => ({ value: c, label: COST_CATEGORY_LABELS[c] }));

/* ------------------------------------------------------------------ screen */

export function LiquidationScreen() {
  const { id } = useParams<{ id: string }>();
  const q = useLiquidation(id);

  if (q.isLoading) {
    return (
      <div className="page">
        <div className="col g20">
          <CardSkeleton lines={1} h={80} />
          <div className="split liq-split">
            <div className="main">
              <CardSkeleton lines={5} h={320} />
            </div>
            <div className="side">
              <CardSkeleton lines={3} />
              <CardSkeleton lines={3} />
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (q.isError || !q.data) {
    return (
      <div className="page">
        <ErrorState error={q.error} retry={() => q.refetch()} />
      </div>
    );
  }
  return <LiquidationBody key={q.data.liquidation.id} data={q.data} />;
}

function LiquidationBody({ data }: { data: LiquidationDetailResponse }) {
  const { liquidation: liq, request, readiness, daysRemaining, canSubmit, canReview, canApproveTripReport } = data;
  const me = useMe();
  const toast = useToast();
  const isOwner = liq.travellerId === me.user.id;
  const editable = isOwner && (liq.status === 'OPEN' || liq.status === 'RETURNED');

  const update = useUpdateLiquidation(liq.id);
  const addLine = useAddExpenseLine(liq.id);
  const delLine = useDeleteExpenseLine(liq.id);
  const attachReceipt = useAttachReceipt(liq.id);
  const attachBoarding = useAttachBoardingPass(liq.id);
  const submit = useSubmitLiquidation(liq.id);

  /* ---- header chip ---- */
  let chip: React.ReactNode;
  if (liq.status === 'OPEN' || liq.status === 'RETURNED') {
    chip =
      daysRemaining >= 0 ? (
        <Chip tone="pending" size="md">
          {daysRemaining === 0 ? 'Due today' : `Due in ${plural(daysRemaining, 'day')}`} · {fmtDay(liq.dueDate)}
        </Chip>
      ) : (
        <Chip tone="blocked" size="md">
          Overdue by {plural(-daysRemaining, 'day')}
        </Chip>
      );
  } else {
    chip = (
      <Chip tone={toneFor(liq.status)} size="md">
        {humanize(liq.status)}
      </Chip>
    );
  }

  const adv = request.advance;
  const meta = [
    `Returned ${fmtDay(liq.returnDate)}`,
    adv && adv.requested ? `Advance received ${formatZMW(adv.amount)} (${adv.percentage}% of ${formatZMW(adv.approvedAmount, { decimals: 0 })})` : 'No advance received',
    'All receipts required before submission',
  ].join(' · ');

  /* ---- inline "Actual" editing ---- */
  const [draftActual, setDraftActual] = useState<Record<string, string>>({});
  const saveActuals = useCallback(
    (draft: Record<string, string>) => {
      const lines: ExpenseLine[] = liq.lines.map((l) => (draft[l.id] !== undefined ? { ...l, actual: Number(draft[l.id]) || 0 } : l));
      update.mutate(
        { lines },
        {
          onSuccess: () => setDraftActual((d) => Object.fromEntries(Object.entries(d).filter(([k, v]) => draft[k] !== v))),
          onError: (e) => toast.error(e, 'Could not save actuals'),
        },
      );
    },
    [liq.lines, update, toast],
  );
  const actualSaver = useDebouncedSave(saveActuals);
  const onActual = (lineId: string, value: string) => {
    const next = { ...draftActual, [lineId]: value };
    setDraftActual(next);
    actualSaver.schedule(next);
  };

  /* ---- live reconciliation preview (uses drafted actuals) ---- */
  const recon = useMemo(() => {
    const totalActual = liq.lines.reduce((s, l) => s + (draftActual[l.id] !== undefined ? Number(draftActual[l.id]) || 0 : l.actual || 0), 0);
    const advanceReceived = liq.reconciliation.advanceReceived;
    const settlement = Math.round((totalActual - advanceReceived) * 100) / 100;
    return { advanceReceived, totalActual, settlement, direction: settlement > 0 ? 'DUE_TO_EMPLOYEE' : settlement < 0 ? 'REFUND_TO_IHM' : 'BALANCED' } as const;
  }, [liq.lines, liq.reconciliation.advanceReceived, draftActual]);

  /* ---- add line dialog ---- */
  const [addOpen, setAddOpen] = useState(false);
  const [newLine, setNewLine] = useState({ category: 'OTHER' as CostCategory, label: '', budgeted: '', actual: '', receiptRequired: true });
  const submitNewLine = () => {
    addLine.mutate(
      { category: newLine.category, label: newLine.label.trim(), budgeted: newLine.budgeted ? Number(newLine.budgeted) : undefined, actual: Number(newLine.actual) || 0, receiptRequired: newLine.receiptRequired },
      {
        onSuccess: () => {
          toast.success('Expense line added');
          setAddOpen(false);
          setNewLine({ category: 'OTHER', label: '', budgeted: '', actual: '', receiptRequired: true });
        },
        onError: (e) => toast.error(e, 'Could not add expense line'),
      },
    );
  };

  /* ---- refund reference ---- */
  const [refundRef, setRefundRef] = useState<string | null>(null);
  const saveRefundRef = useCallback(
    (v: string) => update.mutate({ refundReference: v }, { onSuccess: () => setRefundRef((cur) => (cur === v ? null : cur)), onError: (e) => toast.error(e, 'Could not save reference') }),
    [update, toast],
  );
  const refundSaver = useDebouncedSave(saveRefundRef);

  /* ---- submit ---- */
  const firstFailing = readiness.items.find((i) => !i.ok);
  const onSubmit = () =>
    submit.mutate({}, { onSuccess: () => toast.success('Liquidation submitted to Finance'), onError: (e) => toast.error(e, 'Could not submit liquidation') });

  return (
    <div className="page">
      <PageHeader
        back={
          <Link href="/liquidations" className="row g4 t-caption" style={{ marginBottom: 6 }}>
            <Icon name="arrow_back" size={16} /> Liquidations
          </Link>
        }
        title={`Liquidate ${liq.requestId} · ${liq.tripTitle}`}
        chip={chip}
        subtitle={meta}
      />

      {liq.status === 'RETURNED' && liq.reviewerComment ? (
        <div className="mt16">
          <Banner tone="error" title="Returned by Finance" body={liq.reviewerComment} />
        </div>
      ) : null}

      <div className="split liq-split mt20">
        <div className="main col g14">
          {/* ---------- expense table ---------- */}
          <Card>
            <div className="liq-th">
              <span className="liq-c-exp">Expense</span>
              <span className="liq-c-bud">Budgeted</span>
              <span className="liq-c-act">Actual</span>
              <span className="liq-c-rcpt">Receipt</span>
              {editable ? <span className="liq-c-del" /> : null}
            </div>
            {liq.lines.length === 0 ? (
              <div className="t-caption" style={{ padding: '18px 4px' }}>
                No expense lines yet — add the costs you actually incurred.
              </div>
            ) : null}
            {liq.lines.map((l) => (
              <div key={l.id} className="liq-tr">
                <span className="liq-c-exp truncate" title={l.label}>
                  {l.label}
                </span>
                <span className="liq-c-bud">{l.budgeted ? formatAmount(l.budgeted) : '—'}</span>
                <span className="liq-c-act">
                  {editable ? (
                    <input
                      className="liq-actual"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      aria-label={`Actual for ${l.label}`}
                      value={draftActual[l.id] ?? String(l.actual)}
                      onChange={(e) => onActual(l.id, e.target.value)}
                      onBlur={() => actualSaver.flush()}
                    />
                  ) : (
                    formatAmount(l.actual)
                  )}
                </span>
                <span className="liq-c-rcpt">
                  <ReceiptCell line={l} editable={editable} onUploaded={(a) => attachReceipt.mutate({ lineId: l.id, attachmentId: a.id }, { onSuccess: () => toast.success('Receipt attached'), onError: (e) => toast.error(e, 'Could not attach receipt') })} />
                </span>
                {editable ? (
                  <span className="liq-c-del">
                    {!l.budgeted ? (
                      <button
                        type="button"
                        className="liq-del"
                        aria-label={`Remove ${l.label}`}
                        title="Remove line"
                        onClick={() => delLine.mutate({ lineId: l.id }, { onSuccess: () => toast.success('Line removed'), onError: (e) => toast.error(e, 'Could not remove line') })}
                      >
                        <Icon name="delete" size={18} />
                      </button>
                    ) : null}
                  </span>
                ) : null}
              </div>
            ))}
            {editable ? (
              <button type="button" className="liq-add" onClick={() => setAddOpen(true)}>
                <Icon name="add_circle" size={19} />
                Add expense line
              </button>
            ) : null}
          </Card>

          {/* ---------- trip report ---------- */}
          <TripReportCard liq={liq} editable={editable} canApprove={canApproveTripReport} />
        </div>

        <div className="side">
          {/* ---------- reconciliation ---------- */}
          <Card tone="dark">
            <CardLabel style={{ opacity: 0.75 }}>Reconciliation</CardLabel>
            <div className="liq-recon">
              <div className="liq-recon__row">
                <span>Advance received</span>
                <span>{formatAmount(recon.advanceReceived)}</span>
              </div>
              <div className="liq-recon__row">
                <span>Total actual spend</span>
                <span>{formatAmount(recon.totalActual)}</span>
              </div>
              {recon.direction === 'DUE_TO_EMPLOYEE' ? (
                <div className="liq-recon__total">
                  <span>Due to {firstName(liq.travellerName)}</span>
                  <span className="liq-recon__figure">{formatZMW(recon.settlement)}</span>
                </div>
              ) : recon.direction === 'REFUND_TO_IHM' ? (
                <>
                  <div className="liq-recon__total">
                    <span>Refund to IHM</span>
                    <span className="liq-recon__figure liq-recon__figure--refund">{formatZMW(-recon.settlement)}</span>
                  </div>
                  <TextField
                    label="Deposit reference"
                    placeholder="Bank / mobile-money reference"
                    style={{ marginTop: 6 }}
                    value={refundRef ?? liq.refundReference ?? ''}
                    readOnly={!editable}
                    onChange={(e) => {
                      setRefundRef(e.target.value);
                      refundSaver.schedule(e.target.value);
                    }}
                    onBlur={() => refundSaver.flush()}
                  />
                </>
              ) : (
                <div className="liq-recon__total">
                  <span>Balanced</span>
                  <span className="liq-recon__figure liq-recon__figure--balanced">{formatZMW(0)}</span>
                </div>
              )}
            </div>
            <div className="liq-recon__foot">
              {recon.direction === 'REFUND_TO_IHM'
                ? 'Deposit the unspent balance to the IHM account and capture the bank or mobile-money reference above before submitting.'
                : recon.direction === 'BALANCED'
                  ? 'Advance and actual spend match — nothing to settle.'
                  : 'Refunds due to IHM would show here as a deposit instruction with bank reference capture.'}
            </div>
          </Card>

          {/* ---------- before you submit / review / status ---------- */}
          {liq.status === 'OPEN' || liq.status === 'RETURNED' ? (
            <Card style={{ padding: '20px 24px' }}>
              <div style={{ fontWeight: 750, fontSize: 13.5, marginBottom: 10 }}>Before you submit</div>
              <CheckList items={readiness.items} />
              {liq.boardingPassesRequired && liq.boardingPasses.length === 0 && editable ? (
                <div className="mt12">
                  <UploadChip
                    label="Upload boarding passes"
                    kind="BOARDING_PASS"
                    tone="dashed-error"
                    onUploaded={(a) => attachBoarding.mutate({ attachmentId: a.id }, { onSuccess: () => toast.success('Boarding pass attached'), onError: (e) => toast.error(e, 'Could not attach boarding pass') })}
                  />
                </div>
              ) : null}
              {liq.boardingPasses.length ? (
                <div className="row g6 wrap mt10">
                  {liq.boardingPasses.map((b) => (
                    <Chip key={b.id} tone="neutral" icon="airplane_ticket" regular onClick={() => void openFile(b.id)}>
                      {b.name}
                    </Chip>
                  ))}
                </div>
              ) : null}
              <Button
                block
                style={{ marginTop: 16 }}
                disabled={!canSubmit || !editable}
                loading={submit.isPending}
                disabledLabel={firstFailing ? `Submit — ${lcFirst(firstFailing.label)}` : !isOwner ? 'Only the traveller can submit' : 'Submit liquidation'}
                onClick={onSubmit}
              >
                Submit liquidation
              </Button>
            </Card>
          ) : null}

          {canReview && liq.status === 'SUBMITTED' ? <FinanceReviewCard liq={liq} recon={liq.reconciliation} /> : null}

          {liq.status === 'SUBMITTED' && !canReview ? (
            <Card style={{ padding: '20px 24px' }}>
              <div style={{ fontWeight: 750, fontSize: 13.5, marginBottom: 6 }}>Submitted to Finance</div>
              <div className="t-caption">{liq.submittedAt ? `Sent ${fmtStamp(liq.submittedAt)} · ` : ''}Finance will confirm the settlement and close the trip.</div>
            </Card>
          ) : null}

          {liq.status === 'APPROVED' || liq.status === 'CLOSED' ? (
            <Card style={{ padding: '20px 24px' }}>
              <div style={{ fontWeight: 750, fontSize: 13.5, marginBottom: 6 }}>{liq.status === 'CLOSED' ? 'Closed' : 'Approved by Finance'}</div>
              <div className="t-caption">
                {liq.reviewedAt ? `Reviewed ${fmtStamp(liq.reviewedAt)}` : 'Reviewed'}
                {liq.reviewerComment ? ` · ${liq.reviewerComment}` : ''}
              </div>
            </Card>
          ) : null}
        </div>
      </div>

      {/* ---------- add expense line dialog ---------- */}
      <Dialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add expense line"
        subtitle="Costs incurred that were not in the approved budget. Receipts are required unless the line is an allowance."
        actions={
          <>
            <Button variant="text" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitNewLine} loading={addLine.isPending} disabled={!newLine.label.trim() || newLine.actual === ''} disabledLabel="Add line">
              Add line
            </Button>
          </>
        }
      >
        <div className="col g16 mt12">
          <SelectField label="Category" options={CATEGORY_OPTIONS} value={newLine.category} onChange={(e) => setNewLine((s) => ({ ...s, category: e.target.value as CostCategory }))} />
          <TextField label="Description" placeholder="e.g. Airtime for field coordination" value={newLine.label} onChange={(e) => setNewLine((s) => ({ ...s, label: e.target.value }))} />
          <div className="row g14">
            <TextField label="Budgeted (ZMW)" type="number" min={0} step="0.01" placeholder="0.00" className="grow" value={newLine.budgeted} onChange={(e) => setNewLine((s) => ({ ...s, budgeted: e.target.value }))} />
            <TextField label="Actual (ZMW)" type="number" min={0} step="0.01" placeholder="0.00" className="grow" value={newLine.actual} onChange={(e) => setNewLine((s) => ({ ...s, actual: e.target.value }))} />
          </div>
          <CheckRow checked={newLine.receiptRequired} onChange={(v) => setNewLine((s) => ({ ...s, receiptRequired: v }))}>
            Receipt required for this line
          </CheckRow>
        </div>
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------------ receipt cell */

function ReceiptCell({ line, editable, onUploaded }: { line: ExpenseLine; editable: boolean; onUploaded: (a: Attachment) => void }) {
  if (line.receiptRequired === false) {
    return (
      <Chip tone="approved" className="liq-rcpt">
        Not required
      </Chip>
    );
  }
  if (line.receipts.length > 0) {
    const first = line.receipts[0]!;
    const label = line.receipts.length === 1 ? first.name : plural(line.receipts.length, 'receipt');
    return (
      <span className="row g6" style={{ minWidth: 0, maxWidth: '100%' }}>
        <Chip tone="neutral" icon="attachment" regular className="liq-rcpt" title={line.receipts.map((r) => r.name).join(', ')} onClick={() => void openFile(first.id)}>
          <span className="liq-rcpt__name">{label}</span>
        </Chip>
        {editable ? (
          <span className="liq-missing">
            <UploadChip label="Add" kind="RECEIPT" tone="dashed" icon="add" onUploaded={onUploaded} />
          </span>
        ) : null}
      </span>
    );
  }
  if (!editable) {
    return (
      <Chip tone="blocked" className="liq-rcpt">
        Missing
      </Chip>
    );
  }
  return (
    <span className="liq-missing">
      <UploadChip label="Missing" kind="RECEIPT" tone="dashed-error" onUploaded={onUploaded} />
    </span>
  );
}

/* ------------------------------------------------------------------ trip report */

function TripReportCard({ liq, editable, canApprove }: { liq: LiquidationDetailResponse['liquidation']; editable: boolean; canApprove: boolean }) {
  const toast = useToast();
  const update = useUpdateLiquidation(liq.id);
  const submitReport = useSubmitTripReport(liq.id);
  const approveReport = useApproveTripReport(liq.id);
  const report = liq.tripReport;
  const submitted = !!report.submittedAt;
  const approved = !!report.supervisorApprovedAt;
  const canEdit = editable && !submitted;

  const [draft, setDraft] = useState<Partial<TripReport>>({});
  const save = useCallback(
    (patch: Partial<TripReport>) =>
      update.mutate(
        { tripReport: patch },
        {
          onSuccess: () => setDraft((d) => Object.fromEntries(Object.entries(d).filter(([k, v]) => patch[k as keyof TripReport] !== v))),
          onError: (e) => toast.error(e, 'Could not save trip report'),
        },
      ),
    [update, toast],
  );
  const saver = useDebouncedSave(save);
  const value = (k: keyof TripReport) => (draft[k] as string | undefined) ?? (report[k] as string | undefined) ?? '';
  const onChange = (k: keyof TripReport, v: string) => {
    const next = { ...draft, [k]: v };
    setDraft(next);
    saver.schedule(next);
  };
  const [comment, setComment] = useState('');

  const chip = approved ? (
    <Chip tone="approved" icon="check_circle" iconFilled>
      Approved by supervisor{report.supervisorApprovedAt ? ` · ${fmtDay(report.supervisorApprovedAt)}` : ''}
    </Chip>
  ) : submitted ? (
    <Chip tone="pending">Awaiting supervisor sign-off</Chip>
  ) : (
    <Chip tone="neutral">Draft{update.isPending ? ' · saving…' : ''}</Chip>
  );

  return (
    <Card title="Trip report" titleRight={chip}>
      <div className="liq-report">
        {REPORT_FIELDS.map((f) => (
          <TextArea
            key={f.key}
            label={f.label}
            className={f.wide ? 'liq-report__wide' : undefined}
            rows={f.wide ? 2 : 3}
            value={value(f.key)}
            readOnly={!canEdit}
            tinted={!canEdit}
            onChange={(e) => onChange(f.key, e.target.value)}
            onBlur={() => saver.flush()}
            placeholder={canEdit ? '—' : undefined}
          />
        ))}
      </div>
      {report.supervisorComment ? (
        <div className="t-caption mt12">
          <b>Supervisor:</b> {report.supervisorComment}
        </div>
      ) : null}
      {canEdit ? (
        <div className="row g10 mt16 wrap">
          <Button
            variant="tonal"
            icon="send"
            loading={submitReport.isPending}
            disabled={!value('objective').trim() || !value('activities').trim()}
            disabledLabel="Send to supervisor — describe the objective and activities first"
            onClick={() => {
              saver.flush();
              submitReport.mutate({}, { onSuccess: () => toast.success('Trip report sent to your supervisor'), onError: (e) => toast.error(e, 'Could not send trip report') });
            }}
          >
            Send to supervisor
          </Button>
          <span className="t-caption">Autosaves as you type · required before the liquidation can be submitted</span>
        </div>
      ) : null}
      {canApprove && submitted && !approved ? (
        <div className="row-end g10 mt16 wrap">
          <TextField label="Comment (optional)" className="grow" value={comment} onChange={(e) => setComment(e.target.value)} />
          <Button
            icon="task_alt"
            loading={approveReport.isPending}
            onClick={() => approveReport.mutate(comment.trim() ? { comment: comment.trim() } : {}, { onSuccess: () => toast.success('Trip report approved'), onError: (e) => toast.error(e, 'Could not approve trip report') })}
          >
            Approve trip report
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

/* ------------------------------------------------------------------ finance review */

function FinanceReviewCard({ liq, recon }: { liq: LiquidationDetailResponse['liquidation']; recon: LiquidationDetailResponse['liquidation']['reconciliation'] }) {
  const toast = useToast();
  const review = useReviewLiquidation(liq.id);
  const [reference, setReference] = useState('');
  const [comment, setComment] = useState('');
  const [returnOpen, setReturnOpen] = useState(false);
  const direction =
    recon.direction === 'DUE_TO_EMPLOYEE'
      ? `Pay ${formatZMW(recon.settlement)} to ${liq.travellerName}`
      : recon.direction === 'REFUND_TO_IHM'
        ? `Refund of ${formatZMW(-recon.settlement)} due from ${liq.travellerName}${liq.refundReference ? ` · deposit ref ${liq.refundReference}` : ' · no deposit reference yet'}`
        : 'Balanced — no settlement required';
  return (
    <Card style={{ padding: '20px 24px' }}>
      <div style={{ fontWeight: 750, fontSize: 13.5, marginBottom: 10 }}>Finance review</div>
      <div className="col g6" style={{ fontSize: 12.5 }}>
        <div className="kv">
          <span>Advance received</span>
          <span>{formatAmount(recon.advanceReceived)}</span>
        </div>
        <div className="kv">
          <span>Total actual spend</span>
          <span>{formatAmount(recon.totalActual)}</span>
        </div>
        <div className="kv kv--total">
          <span>Settlement</span>
          <span>{formatZMW(Math.abs(recon.settlement))}</span>
        </div>
        <div className="t-caption">{direction}</div>
      </div>
      <TextField label="Settlement reference" placeholder="Payment / journal reference" style={{ marginTop: 14 }} value={reference} onChange={(e) => setReference(e.target.value)} />
      <div className="col g8 mt14">
        <Button
          block
          icon="task_alt"
          loading={review.isPending}
          onClick={() =>
            review.mutate(
              { decision: 'APPROVED', settlementReference: reference.trim() || undefined },
              { onSuccess: () => toast.success('Liquidation approved and trip closed'), onError: (e) => toast.error(e, 'Could not approve liquidation') },
            )
          }
        >
          Approve &amp; close
        </Button>
        <Button block variant="outlined" onClick={() => setReturnOpen(true)}>
          Return to traveller
        </Button>
      </div>
      <Dialog
        open={returnOpen}
        onClose={() => setReturnOpen(false)}
        title="Return to traveller"
        subtitle="Tell the traveller what needs correcting. The liquidation re-opens for editing."
        actions={
          <>
            <Button variant="text" onClick={() => setReturnOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={!comment.trim()}
              disabledLabel="Return — add a comment"
              loading={review.isPending}
              onClick={() =>
                review.mutate(
                  { decision: 'RETURNED', comment: comment.trim() },
                  {
                    onSuccess: () => {
                      toast.success('Returned to traveller');
                      setReturnOpen(false);
                    },
                    onError: (e) => toast.error(e, 'Could not return liquidation'),
                  },
                )
              }
            >
              Return
            </Button>
          </>
        }
      >
        <TextArea label="Comment" className="mt12" value={comment} onChange={(e) => setComment(e.target.value)} />
      </Dialog>
    </Card>
  );
}
