'use client';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { fmtDate, formatZMW, type Attachment, type CreateMileageClaimBody, type MileageDetailResponse } from '@tms/shared';
import { Banner, Button, Card, CardLabel, CardSkeleton, CheckList, Chip, Dialog, DropTile, ErrorState, Icon, PageHeader, TextArea, TextField, humanize, toneFor, useToast } from '@/components/m3';
import { useMe } from '@/lib/auth-context';
import { useDecideMileageClaim, useMileageClaim, useMileageEvidence, usePayMileageClaim, useSubmitMileageClaim, useUpdateMileageClaim } from '@/lib/queries';
import './claims.css';

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
type Draft = Partial<Record<'purpose' | 'date' | 'fromName' | 'toName' | 'distanceKm', string>>;

export function MileageClaimScreen() {
  const { id } = useParams<{ id: string }>();
  const q = useMileageClaim(id);
  if (q.isLoading) {
    return (
      <div className="page">
        <CardSkeleton lines={1} h={70} />
        <div className="split mil-split mt20">
          <div className="main">
            <CardSkeleton lines={4} h={300} />
          </div>
          <div className="side">
            <CardSkeleton lines={3} />
            <CardSkeleton lines={3} />
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
  return <ClaimBody key={q.data.claim.id} data={q.data} />;
}

function ClaimBody({ data }: { data: MileageDetailResponse }) {
  const { claim, policy, canSubmit, canDecide } = data;
  const me = useMe();
  const toast = useToast();
  const isOwner = claim.claimantId === me.user.id;
  const editable = isOwner && claim.status === 'DRAFT';
  const isFinance = me.capabilities.canSeeFinance;

  const update = useUpdateMileageClaim(claim.id);
  const evidence = useMileageEvidence(claim.id);
  const submit = useSubmitMileageClaim(claim.id);
  const decide = useDecideMileageClaim(claim.id);
  const pay = usePayMileageClaim(claim.id);

  /* ---- autosaved fields (draft overlay) ---- */
  const [draft, setDraft] = useState<Draft>({});
  const save = useCallback(
    (d: Draft) => {
      const patch: Partial<CreateMileageClaimBody> = {};
      if (d.purpose !== undefined) patch.purpose = d.purpose;
      if (d.date !== undefined && d.date) patch.date = d.date;
      if (d.fromName !== undefined) patch.fromName = d.fromName;
      if (d.toName !== undefined) patch.toName = d.toName;
      if (d.distanceKm !== undefined) patch.distanceKm = Math.max(0, Number(d.distanceKm) || 0);
      if (Object.keys(patch).length === 0) return;
      update.mutate(patch, {
        onSuccess: () => setDraft((cur) => Object.fromEntries(Object.entries(cur).filter(([k, v]) => d[k as keyof Draft] !== v))),
        onError: (e) => toast.error(e, 'Could not save claim'),
      });
    },
    [update, toast],
  );
  const saver = useDebouncedSave(save);
  const val = (k: keyof Draft) => draft[k] ?? String(claim[k] ?? '');
  const onChange = (k: keyof Draft, v: string) => {
    const next = { ...draft, [k]: v };
    setDraft(next);
    saver.schedule(next);
  };
  const distance = draft.distanceKm !== undefined ? Number(draft.distanceKm) || 0 : claim.distanceKm;
  const amount = Math.round(distance * claim.ratePerKm * 100) / 100;

  const attach = (type: 'ROUTE' | 'BUSINESS' | 'PRE_APPROVAL') => (a: Attachment) =>
    evidence.mutate({ attachmentId: a.id, type }, { onSuccess: () => toast.success('Evidence attached'), onError: (e) => toast.error(e, 'Could not attach evidence') });

  const firstFailing = policy.items.find((i) => !i.ok);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [comment, setComment] = useState('');

  const meta: ReactNode = (
    <>
      Private vehicle · {claim.withinProvince ? 'within' : 'outside'} {claim.province || '—'} Province ·{' '}
      {claim.preApprovalRef ? `pre-approval ${claim.preApprovalRef} on file` : <span className="t-error" style={{ fontWeight: 650 }}>pre-approval missing</span>}
    </>
  );

  const roField = !editable ? 'mil-ro' : '';

  return (
    <div className="page">
      <PageHeader
        back={
          <Link href="/claims" className="row g4 t-caption" style={{ marginBottom: 6 }}>
            <Icon name="arrow_back" size={16} /> Mileage claims
          </Link>
        }
        title={`Mileage claim ${claim.id}`}
        chip={
          <Chip tone={toneFor(claim.status)} size="md">
            {humanize(claim.status)}
            {update.isPending ? ' · saving…' : ''}
          </Chip>
        }
        subtitle={meta}
      />
      {claim.status === 'REJECTED' && claim.reviewerComment ? (
        <div className="mt16">
          <Banner tone="error" title="Rejected" body={claim.reviewerComment} />
        </div>
      ) : null}

      <div className="split mil-split mt20">
        <div className="main">
          <Card className="mil-card">
            <div className="mil-row">
              <TextField label="Trip purpose" className={`grow ${roField}`} value={val('purpose')} readOnly={!editable} onChange={(e) => onChange('purpose', e.target.value)} onBlur={() => saver.flush()} />
              <TextField label="Date" type="date" className={roField} style={{ width: 170 }} value={val('date')} readOnly={!editable} onChange={(e) => onChange('date', e.target.value)} onBlur={() => saver.flush()} />
            </div>
            <div className="mil-row">
              <TextField label="From" className={`grow ${roField}`} value={val('fromName')} readOnly={!editable} onChange={(e) => onChange('fromName', e.target.value)} onBlur={() => saver.flush()} />
              <TextField label="To" className={`grow ${roField}`} value={val('toName')} readOnly={!editable} onChange={(e) => onChange('toName', e.target.value)} onBlur={() => saver.flush()} />
              <TextField
                label="Distance (return)"
                type="number"
                min={0}
                step="1"
                inputMode="decimal"
                className={`mil-dist ${roField}`}
                style={{ width: 150 }}
                trailing={<span className="t-caption-sm">km</span>}
                value={val('distanceKm')}
                readOnly={!editable}
                onChange={(e) => onChange('distanceKm', e.target.value)}
                onBlur={() => saver.flush()}
              />
            </div>

            <div style={{ marginTop: 20, fontWeight: 750, fontSize: 13.5 }}>Required evidence</div>
            <div className="mil-evidence">
              <EvidenceTile
                editable={editable}
                icon="map"
                title="Google Maps route"
                hint="drop screenshot of most direct route"
                done={claim.routeEvidence.length > 0}
                doneHint={claim.routeEvidence.length ? `${claim.routeEvidence[0]!.name} ✓` : undefined}
                kind="MAPS_ROUTE"
                onUploaded={attach('ROUTE')}
              />
              <EvidenceTile
                editable={editable}
                icon="task"
                title="Pre-approval"
                hint="drop supervisor approval (email / pdf)"
                done={claim.preApprovalAttached}
                doneHint={`${claim.preApprovalRef ?? 'Approved'}${claim.preApprovalBy ? ` · ${claim.preApprovalBy}` : ''} ✓`}
                kind="APPROVAL_EVIDENCE"
                onUploaded={attach('PRE_APPROVAL')}
              />
              <EvidenceTile
                editable={editable}
                icon="description"
                title="Business evidence"
                hint="meeting agenda, register or report"
                done={claim.businessEvidence.length > 0}
                doneHint={claim.businessEvidence.length ? `${claim.businessEvidence.map((a) => a.name.replace(/\.[a-z0-9]+$/i, '')).join(' + ')} ✓` : undefined}
                kind="AGENDA"
                onUploaded={attach('BUSINESS')}
              />
            </div>
            <div style={{ marginTop: 16 }}>
              <Banner tone="warning">Tolls, parking, food and repairs are excluded from mileage — claim tolls and parking separately as expenses.</Banner>
            </div>
          </Card>
        </div>

        <div className="side">
          <Card tone="primary" style={{ padding: '24px 26px' }}>
            <CardLabel style={{ opacity: 0.8 }}>Calculation</CardLabel>
            <div className="mil-calc">
              <div className="mil-calc__row">
                <span>Approved distance</span>
                <span>{distance.toLocaleString('en-ZM')} km</span>
              </div>
              <div className="mil-calc__row">
                <span>
                  Effective rate {claim.rateEffectiveFrom ? <span style={{ opacity: 0.7 }}>({fmtDate(claim.rateEffectiveFrom)})</span> : null}
                </span>
                <span>{formatZMW(claim.ratePerKm)} / km</span>
              </div>
              <div className="mil-calc__total">
                <span>Reimbursement</span>
                <span className="mil-calc__figure">{formatZMW(claim.status === 'DRAFT' ? amount : claim.amount)}</span>
              </div>
            </div>
          </Card>

          <Card className="mil-policy">
            <div className="mil-policy__title">Policy check</div>
            <CheckList items={policy.items} />
            {claim.status === 'DRAFT' ? (
              <Button
                block
                style={{ marginTop: 16 }}
                disabled={!canSubmit || !editable}
                loading={submit.isPending}
                disabledLabel={firstFailing ? `Submit — ${lcFirst(firstFailing.label)}` : !isOwner ? 'Only the claimant can submit' : 'Submit claim'}
                onClick={() => {
                  saver.flush();
                  submit.mutate({}, { onSuccess: () => toast.success('Claim submitted for approval'), onError: (e) => toast.error(e, 'Could not submit claim') });
                }}
              >
                Submit claim
              </Button>
            ) : null}
            {canDecide && claim.status === 'SUBMITTED' ? (
              <div className="col g8 mt16">
                <Button block icon="task_alt" loading={decide.isPending} onClick={() => decide.mutate({ decision: 'APPROVED' }, { onSuccess: () => toast.success('Claim approved'), onError: (e) => toast.error(e, 'Could not approve claim') })}>
                  Approve
                </Button>
                <Button block variant="danger-text" onClick={() => setRejectOpen(true)}>
                  Reject
                </Button>
              </div>
            ) : null}
            {isFinance && claim.status === 'APPROVED' ? (
              <Button block variant="tonal" icon="payments" style={{ marginTop: 16 }} loading={pay.isPending} onClick={() => pay.mutate({}, { onSuccess: () => toast.success('Claim marked as paid'), onError: (e) => toast.error(e, 'Could not mark as paid') })}>
                Mark paid
              </Button>
            ) : null}
            {claim.status === 'PAID' ? (
              <div className="row g8 mt14" style={{ color: 'var(--md-on-surface)' }}>
                <Icon name="verified" filled size={18} color="var(--md-primary)" /> Paid {formatZMW(claim.amount)}
              </div>
            ) : null}
          </Card>
        </div>
      </div>

      <Dialog
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title="Reject mileage claim"
        subtitle="The claimant is notified with your reason."
        actions={
          <>
            <Button variant="text" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={!comment.trim()}
              disabledLabel="Reject — add a reason"
              loading={decide.isPending}
              onClick={() =>
                decide.mutate(
                  { decision: 'REJECTED', comment: comment.trim() },
                  {
                    onSuccess: () => {
                      toast.success('Claim rejected');
                      setRejectOpen(false);
                    },
                    onError: (e) => toast.error(e, 'Could not reject claim'),
                  },
                )
              }
            >
              Reject
            </Button>
          </>
        }
      >
        <TextArea label="Reason" className="mt12" value={comment} onChange={(e) => setComment(e.target.value)} />
      </Dialog>
    </div>
  );
}

function EvidenceTile({ editable, icon, title, hint, done, doneHint, kind, onUploaded }: { editable: boolean; icon: string; title: string; hint: string; done: boolean; doneHint?: string; kind: Attachment['kind']; onUploaded: (a: Attachment) => void }) {
  if (done || editable) return <DropTile icon={icon} title={title} hint={hint} done={done} doneHint={doneHint} kind={kind} onUploaded={onUploaded} />;
  return (
    <div className="m3-drop mil-tile--static" aria-disabled>
      <Icon name={icon} size={24} color="var(--md-outline)" />
      <div className="m3-drop__title">{title}</div>
      <div className="m3-drop__hint">not attached</div>
    </div>
  );
}
