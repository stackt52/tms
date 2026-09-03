'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { computeAdvance, fmtRange, fmtStamp, formatZMW, plural, TRANSPORT_LABELS, type ApprovalDecision, type ApprovalDetailResponse, type CostLine, type EligibilityResult } from '@tms/shared';
import { Banner, Button, Card, CardSkeleton, ChainTimeline, CheckRow, Chip, ErrorState, KV, Skeleton, StatTile, StatusChip, TextArea, fileIcon, useToast } from '@/components/m3';
import { openFile } from '@/lib/api';
import { useApproval, useDecide, useMasterData, useSaveChecklist } from '@/lib/queries';
import { useDebounced } from '@/lib/hooks';
import { CommentDialog } from './CommentDialog';

type DialogKind = Extract<ApprovalDecision, 'RETURNED' | 'CLARIFICATION_REQUESTED' | 'REJECTED'>;

export function ApprovalDetail({ id, onDone }: { id: string; onDone: () => void }) {
  const q = useApproval(id);
  if (q.isLoading) {
    return (
      <div>
        <Skeleton h={24} w="60%" />
        <div className="mt8">
          <Skeleton h={14} w="85%" />
        </div>
        <div className="split apq__body">
          <div className="main">
            <CardSkeleton lines={7} h={360} />
          </div>
          <div className="side">
            <CardSkeleton lines={4} />
            <CardSkeleton lines={4} />
          </div>
        </div>
      </div>
    );
  }
  if (q.error || !q.data) return <ErrorState error={q.error ?? new Error('Request not found')} retry={() => q.refetch()} />;
  return <ApprovalDetailBody id={id} data={q.data} onDone={onDone} />;
}

function costLabel(l: CostLine): string {
  if ((l.category === 'PER_DIEM' || l.category === 'ACCOMMODATION') && l.quantity > 0 && !/night/i.test(l.label)) return `${l.label} · ${plural(l.quantity, 'night')}`;
  if (l.quantity > 1) return `${l.label} · ${l.quantity}×`;
  return l.label;
}

const DECISION_TOAST: Record<ApprovalDecision, (ref: string) => string> = {
  APPROVED: (r) => `${r} approved — sent to the next stage`,
  RETURNED: (r) => `${r} returned for correction`,
  CLARIFICATION_REQUESTED: (r) => `Clarification requested on ${r}`,
  REJECTED: (r) => `${r} rejected`,
};

function ApprovalDetailBody({ id, data, onDone }: { id: string; data: ApprovalDetailResponse; onDone: () => void }) {
  const { request, checklist, checklistState, canAct, stage, approvalChain, project, costCentre } = data;
  const md = useMasterData();
  const toast = useToast();
  const decide = useDecide(id);
  const { mutate: saveTicks } = useSaveChecklist(id);

  // Checklist ticks — local state seeded from the server, persisted (debounced) while the approver works.
  const [ticks, setTicks] = useState<Record<string, boolean>>(checklistState ?? {});
  const dirty = useRef(false);
  const debouncedTicks = useDebounced(ticks, 600);
  useEffect(() => {
    if (!dirty.current || !checklist || !canAct) return;
    saveTicks(debouncedTicks);
  }, [debouncedTicks, checklist, canAct, saveTicks]);

  const [comment, setComment] = useState('');
  const [dialog, setDialog] = useState<DialogKind | null>(null);

  const total = checklist?.length ?? 0;
  const done = checklist ? checklist.filter((c) => ticks[c.key]).length : 0;
  const left = total - done;

  const pct = request.advance?.percentage ?? 75;
  const advanceAmt = request.advance?.amount ?? computeAdvance(request.costing.advanceEligibleTotal, pct);
  const it = request.itinerary;
  const unitName = md.data?.units.find((u) => u.id === request.unitId)?.name;
  const projectId = project?.id ?? request.projectId;
  const meta = [
    request.requesterName,
    unitName,
    projectId ? `Project ${projectId}` : null,
    costCentre?.id ?? request.costCentreId,
    it.departAt && it.returnAt ? fmtRange(it.departAt, it.returnAt) : null,
    `Est. ${formatZMW(request.costing.total, { decimals: 0 })}`,
    `Advance ${pct}% = ${formatZMW(advanceAmt, { decimals: 0 })}`,
  ]
    .filter(Boolean)
    .join(' · ');

  const submit = (decision: ApprovalDecision, text?: string) => {
    const c = (text ?? comment).trim();
    decide.mutate(
      { decision, comment: c || undefined, checklist: checklist ? ticks : undefined },
      {
        onSuccess: () => {
          toast.success(DECISION_TOAST[decision](request.id));
          setDialog(null);
          onDone();
        },
        onError: (e) => toast.error(e, 'Could not record the decision'),
      },
    );
  };
  const pending = (d: ApprovalDecision) => decide.isPending && decide.variables?.decision === d;

  const chain = approvalChain.map((c) => ({
    key: c.key,
    label: c.state === 'current' && canAct ? `${c.label} — you` : c.label,
    state: c.state,
    meta: c.state === 'done' || c.state === 'rejected' || c.state === 'invalidated' ? [c.actorName, c.at ? fmtStamp(c.at) : null].filter(Boolean).join(' · ') || undefined : c.state === 'current' && canAct ? undefined : c.actorName,
  }));

  const actions: ReactNode = canAct ? (
    <>
      <TextArea className="mt16" label="Comment" placeholder="Add a comment for the traveller or next approver…" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
      <div className="apq__actions">
        <Button disabled={left > 0 || decide.isPending} loading={pending('APPROVED')} disabledLabel={left > 0 ? `Approve — ${plural(left, 'check')} left` : undefined} onClick={() => submit('APPROVED')}>
          Approve
        </Button>
        <Button variant="outlined" disabled={decide.isPending} onClick={() => setDialog('RETURNED')}>
          Return for correction
        </Button>
        <Button variant="outlined" disabled={decide.isPending} onClick={() => setDialog('CLARIFICATION_REQUESTED')}>
          Request clarification
        </Button>
        <Button variant="danger-text" disabled={decide.isPending} onClick={() => setDialog('REJECTED')}>
          Reject
        </Button>
      </div>
    </>
  ) : (
    <div className="mt16">
      <Banner tone="info" compact icon="hourglass_top" body={<>You can&apos;t act on this stage — waiting on {stage?.label ?? 'the current approver'}.</>} />
    </div>
  );

  return (
    <div>
      <div className="row g12 wrap">
        <div className="apq__head">
          {request.id} · {request.activityTitle || 'Untitled request'}
        </div>
        <StatusChip status={request.status} size="md" />
      </div>
      <div className="apq__meta">{meta}</div>

      <div className="split apq__body">
        <div className="main">
          {checklist ? (
            <Card size="md">
              <div className="apq__card-title">
                Supervisor checklist <small>· from Travel SOP §9.2</small>
              </div>
              <div className="apq__checks">
                {checklist.map((c) => (
                  <CheckRow
                    key={c.key}
                    checked={!!ticks[c.key]}
                    onChange={
                      canAct
                        ? (v) => {
                            dirty.current = true;
                            setTicks((t) => ({ ...t, [c.key]: v }));
                          }
                        : undefined
                    }
                  >
                    {c.label}
                  </CheckRow>
                ))}
              </div>
              {actions}
            </Card>
          ) : (
            <Card size="md">
              <div className="apq__card-title">
                Review notes <small>· {stage?.label ?? 'request summary'}</small>
              </div>
              <div className="col g14" style={{ fontSize: 13.5 }}>
                <Section label="Itinerary">
                  {[it.originName, it.destinationName].filter(Boolean).join(' → ') || '—'}
                  {it.stops.length ? ` (via ${it.stops.map((s) => s.name).join(', ')})` : ''}
                  {it.departAt && it.returnAt ? ` · ${fmtRange(it.departAt, it.returnAt)}` : ''} · {plural(it.nights, 'night')} · {it.distanceKm} km
                </Section>
                <Section label="Purpose">{request.purpose || request.activityDescription || '—'}</Section>
                <Section label="Travellers">{request.travellers.length ? request.travellers.map((t) => t.name).join(', ') : request.requesterName}</Section>
                <Section label="Transport & accommodation">
                  {request.transport.mode ? TRANSPORT_LABELS[request.transport.mode] : 'Transport not set'} · {request.accommodation.required ? `${plural(request.accommodation.nights, 'night')} @ ${formatZMW(request.accommodation.ratePerNight)}` : 'No accommodation'}
                </Section>
                <Section label="Eligibility">{request.eligibility ? <EligibilityTiles e={request.eligibility} /> : <span className="t-muted">Not computed</span>}</Section>
                <Section label="Cost lines">
                  <div className="col g6" style={{ fontSize: 13 }}>
                    {request.costing.lines.map((l) => (
                      <KV key={l.id} label={costLabel(l)} value={formatZMW(l.amount, { decimals: 0 })} />
                    ))}
                    <KV total label="Total" value={formatZMW(request.costing.total, { decimals: 0 })} />
                  </div>
                </Section>
                <Section label="Attachments">
                  {request.attachments.length ? (
                    <div className="apq__files">
                      {request.attachments.map((a) => (
                        <Chip key={a.id} tone="neutral" file icon={fileIcon(a)} onClick={() => void openFile(a.id).catch((e) => toast.error(e, 'Could not open file'))}>
                          {a.name}
                        </Chip>
                      ))}
                    </div>
                  ) : (
                    <span className="t-muted">None attached</span>
                  )}
                </Section>
              </div>
              {actions}
            </Card>
          )}
        </div>

        <div className="side">
          <Card size="md" style={{ padding: '18px 22px' }}>
            <div className="apq__side-title">Approval chain</div>
            {chain.length ? <ChainTimeline items={chain} /> : <div className="t-caption">Not yet submitted</div>}
          </Card>
          <Card size="md" style={{ padding: '18px 22px' }}>
            <div className="apq__side-title">Cost estimate</div>
            <div className="col" style={{ gap: 7, fontSize: 13 }}>
              {request.costing.lines.map((l) => (
                <KV key={l.id} label={costLabel(l)} value={formatZMW(l.amount, { decimals: 0 })} />
              ))}
              <KV total label="Total" value={formatZMW(request.costing.total, { decimals: 0 })} />
            </div>
          </Card>
          <Card size="md" style={{ padding: '18px 22px' }}>
            <div className="apq__side-title">Eligibility</div>
            {request.eligibility ? <EligibilityTiles e={request.eligibility} /> : <div className="t-caption">Not computed yet</div>}
            {request.eligibility?.internationalNoticeOk === false ? (
              <div className="mt10">
                <Banner tone="warning" body="Submitted under the 2-week international notice" />
              </div>
            ) : null}
          </Card>
        </div>
      </div>

      <CommentDialog
        open={dialog === 'RETURNED'}
        title="Return for correction"
        subtitle="The traveller is asked to amend and resubmit; the chain restarts from the first stage."
        placeholder="What needs to change?"
        initial={comment}
        confirmLabel="Return"
        busy={pending('RETURNED')}
        onClose={() => setDialog(null)}
        onConfirm={(t) => submit('RETURNED', t)}
      />
      <CommentDialog
        open={dialog === 'CLARIFICATION_REQUESTED'}
        title="Request clarification"
        subtitle="Approval pauses until the traveller responds, then resumes at this stage."
        placeholder="What do you need clarified?"
        initial={comment}
        confirmLabel="Send request"
        busy={pending('CLARIFICATION_REQUESTED')}
        onClose={() => setDialog(null)}
        onConfirm={(t) => submit('CLARIFICATION_REQUESTED', t)}
      />
      <CommentDialog
        open={dialog === 'REJECTED'}
        title={`Reject ${request.id}?`}
        subtitle="This ends the request. The traveller is notified with your reason."
        label="Reason"
        placeholder="Why is this request being rejected?"
        initial={comment}
        confirmLabel="Reject"
        confirmVariant="danger"
        busy={pending('REJECTED')}
        onClose={() => setDialog(null)}
        onConfirm={(t) => submit('REJECTED', t)}
      />
    </div>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="apq__section-label">{label}</div>
      <div>{children}</div>
    </div>
  );
}

export function EligibilityTiles({ e }: { e: EligibilityResult }) {
  return (
    <div className="apq__elig">
      <StatTile label="Distance" value={`${e.distanceKm} km`} verdict={`vs ${e.distanceThresholdKm} km`} ok={e.distanceOk} />
      <StatTile label="Time away" value={`${e.hoursAway} h`} verdict={`vs ${e.hoursThreshold} h`} ok={e.hoursOk} />
      <StatTile label="Lead time" value={`${e.leadTimeWorkingDays} wd`} verdict={e.leadTimeOk ? 'ok' : `${e.leadTimeRequiredWorkingDays} needed`} ok={e.leadTimeOk} />
    </div>
  );
}
