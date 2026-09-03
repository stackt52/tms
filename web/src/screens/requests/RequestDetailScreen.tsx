'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import {
  ACTIVE_TRIP_STATUSES,
  COST_CATEGORY_LABELS,
  TRANSPORT_LABELS,
  TRAVEL_CATEGORY_LABELS,
  fmtDateTime,
  fmtStamp,
  formatAmount,
  formatZMW,
  plural,
  timelineFor,
  type ApprovalChainItem,
  type TravelRequestDetail,
} from '@tms/shared';
import { Avatar, Banner, Button, Card, CardSkeleton, ChainTimeline, Chip, Dialog, EmptyState, ErrorState, Icon, KV, PageHeader, ProcessTimeline, StatTile, StatusChip, fileIcon, humanize, useToast } from '@/components/m3';
import { openFile } from '@/lib/api';
import { useCancelTravelRequest, useSubmitTravelRequest, useTravelRequest } from '@/lib/queries';
import './requests.css';

export function RequestDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const q = useTravelRequest(id);
  if (q.isLoading) {
    return (
      <div className="page col g16">
        <CardSkeleton h={90} lines={1} />
        <div className="split">
          <div className="main col g16">
            <CardSkeleton />
            <CardSkeleton />
          </div>
          <div className="side">
            <CardSkeleton />
          </div>
        </div>
      </div>
    );
  }
  if (q.isError || !q.data) {
    return (
      <div className="page">
        <ErrorState error={q.error} retry={() => void q.refetch()} />
      </div>
    );
  }
  return <Detail data={q.data} />;
}

function chainMeta(it: ApprovalChainItem): string | undefined {
  const parts = [it.actorName, it.at ? fmtStamp(it.at) : undefined].filter(Boolean);
  return parts.length ? parts.join(' · ') : undefined;
}

function Detail({ data }: { data: TravelRequestDetail }) {
  const { request: r, trip, liquidation, people, project, costCentre } = data;
  const { success, error } = useToast();
  const submit = useSubmitTravelRequest(r.id);
  const cancel = useCancelTravelRequest(r.id);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const it = r.itinerary;
  const elig = r.eligibility;

  const returned = r.status === 'RETURNED_FOR_CORRECTION' || r.status === 'CLARIFICATION_REQUESTED';
  const lastDecision = [...r.approvals].reverse().find((a) => a.decision === 'RETURNED' || a.decision === 'CLARIFICATION_REQUESTED');
  const isActiveTrip = ACTIVE_TRIP_STATUSES.includes(r.status);
  const supervisorName = r.supervisorId ? people[r.supervisorId]?.displayName : undefined;

  const doSubmit = () =>
    submit.mutate(undefined, {
      onSuccess: () => success('Request submitted for approval'),
      onError: (e) => error(e, 'Could not submit'),
    });
  const doCancel = () =>
    cancel.mutate(undefined, {
      onSuccess: () => {
        setConfirmCancel(false);
        success('Request cancelled');
      },
      onError: (e) => error(e, 'Could not cancel'),
    });

  return (
    <div className="page col g18">
      <PageHeader
        back={
          <Link href="/requests" className="row g6 t-caption" style={{ marginBottom: 8 }}>
            <Icon name="arrow_back" size={18} /> My travel requests
          </Link>
        }
        title={r.activityTitle || 'Untitled travel request'}
        chip={<StatusChip status={r.status} size="lg" />}
        subtitle={[r.id, r.category ? TRAVEL_CATEGORY_LABELS[r.category] : null, r.requesterName, r.submittedAt ? `Submitted ${fmtStamp(r.submittedAt)}` : `Created ${fmtStamp(r.createdAt)}`, `v${r.version}`].filter(Boolean).join(' · ')}
        actions={
          <div className="row g8 wrap">
            {data.canEdit ? (
              <Button variant="outlined" size="sm" icon="edit" href={`/requests/${r.id}/edit`}>
                Edit
              </Button>
            ) : null}
            {data.canSubmit ? (
              <Button size="sm" icon="send" onClick={doSubmit} loading={submit.isPending}>
                Submit for approval
              </Button>
            ) : null}
            {trip ? (
              <Button variant="tonal" size="sm" icon="luggage" href={`/trips/${r.id}`}>
                Open trip workspace
              </Button>
            ) : null}
            {liquidation ? (
              <Button variant="tonal" size="sm" icon="receipt_long" href={`/liquidations/${liquidation.id}`}>
                Open liquidation
              </Button>
            ) : null}
          </div>
        }
      />

      {returned ? (
        <Banner
          tone="warning"
          icon="feedback"
          title={r.status === 'RETURNED_FOR_CORRECTION' ? 'Returned for correction' : 'Clarification requested'}
          body={
            <>
              {lastDecision ? (
                <>
                  <b>{lastDecision.actorName}</b> ({lastDecision.stageLabel}, {fmtStamp(lastDecision.at)}): {lastDecision.comment || 'No comment provided.'}
                </>
              ) : (
                'An approver has asked for changes. Edit the request and resubmit.'
              )}
            </>
          }
          action={
            data.canEdit ? (
              <Button variant="tonal" size="sm" href={`/requests/${r.id}/edit`}>
                Edit &amp; resubmit
              </Button>
            ) : undefined
          }
        />
      ) : null}

      {isActiveTrip ? (
        <Card title="Trip progress" titleRight={trip ? <Link href={`/trips/${r.id}`} className="t-caption t-primary" style={{ fontWeight: 650 }}>Open trip workspace →</Link> : undefined}>
          <ProcessTimeline items={timelineFor(r.status)} />
        </Card>
      ) : null}

      <div className="split">
        <div className="main col g16">
          <Card title="Itinerary">
            <div className="col g8 t-body">
              <KV label="Origin" value={it.originName || '—'} />
              <KV label="Destination" value={it.destinationName || '—'} />
              {it.stops.length ? <KV label="Intermediate stops" value={it.stops.map((s) => s.name).join(', ')} /> : null}
              <KV label="Departure" value={it.departAt ? fmtDateTime(it.departAt) : '—'} />
              <KV label="Return" value={it.returnAt ? fmtDateTime(it.returnAt) : '—'} />
              <KV label="Nights" value={String(it.nights)} />
              <KV label="Distance from duty station" value={`≈ ${it.distanceOverrideKm ?? it.distanceKm} km${it.distanceOverrideKm ? ' (override)' : ''}`} />
            </div>
          </Card>

          <Card title="Trip details">
            <div className="col g10 t-body">
              <div>
                <div className="t-label">Purpose</div>
                <div className="mt4">{r.purpose || '—'}</div>
              </div>
              <div>
                <div className="t-label">Activity description</div>
                <div className="mt4" style={{ whiteSpace: 'pre-wrap' }}>{r.activityDescription || '—'}</div>
              </div>
              <div>
                <div className="t-label">Expected outcomes</div>
                <div className="mt4" style={{ whiteSpace: 'pre-wrap' }}>{r.expectedOutcomes || '—'}</div>
              </div>
              <div className="col g6 mt6">
                <KV label="Work plan reference" value={r.workPlanRef || '—'} />
                <KV label="Project" value={project ? `${project.id} · ${project.name}` : (r.projectId ?? '—')} />
                <KV label="Cost centre" value={costCentre ? `${costCentre.id} · ${costCentre.name}` : (r.costCentreId ?? '—')} />
                <KV label="Supervisor" value={supervisorName ?? '—'} />
              </div>
              {r.justification ? (
                <div>
                  <div className="t-label">Justification</div>
                  <div className="mt4" style={{ whiteSpace: 'pre-wrap' }}>{r.justification}</div>
                </div>
              ) : null}
            </div>
          </Card>

          <Card title="Travellers" titleRight={r.isGroup ? <Chip tone="info">Group travel</Chip> : undefined}>
            {r.travellers.length ? (
              r.travellers.map((t, i) => {
                const p = t.userId ? people[t.userId] : undefined;
                return (
                  <div key={`${t.userId ?? t.externalId ?? t.name}-${i}`} className="req-person">
                    <Avatar initials={t.initials || p?.initials || '?'} tone={p?.avatarTone ?? (['deep', 'secondary', 'tertiary', 'warning'] as const)[i % 4]} size="sm" />
                    <span style={{ fontWeight: 600 }}>{t.name}</span>
                    {t.isLead ? <Chip tone="active" size="xs">Lead</Chip> : null}
                    {t.externalId ? <Chip tone="neutral" size="xs">External</Chip> : null}
                  </div>
                );
              })
            ) : (
              <div className="t-caption">No travellers added.</div>
            )}
          </Card>

          <Card title="Transport & accommodation">
            <div className="col g8 t-body">
              <KV label="Transport" value={r.transport.mode ? TRANSPORT_LABELS[r.transport.mode] : '—'} />
              {r.transport.driverRequired ? <KV label="Driver" value="IHM driver required" /> : null}
              {r.transport.justification ? <KV label="Justification" value={r.transport.justification} /> : null}
              <KV label="Accommodation" value={r.accommodation.required ? `${plural(r.accommodation.nights, 'night')} · ${formatZMW(r.accommodation.ratePerNight)}/night` : 'Not required'} />
              {r.accommodation.fullBoardProvided ? <KV label="Board" value="Full board provided — replaces per diem" /> : null}
              <KV label="Per diem" value={r.allowances.perDiemWaived ? `Waived${r.allowances.waiverReason ? ` — ${r.allowances.waiverReason}` : ''}` : `${plural(r.allowances.perDiemNights, 'night')} × ${formatZMW(r.allowances.perDiemRate)}`} />
              {r.international ? <KV label="Cabin class" value={humanize(r.international.cabinClass)} /> : null}
              {r.personal?.combined ? <KV label="Personal travel" value={`Combined · contribution ${formatZMW(r.personal.personalContribution ?? 0)}`} /> : null}
            </div>
          </Card>

          <Card title="Cost estimate" titleRight={<span className="t-figure">{formatZMW(r.costing.total)}</span>}>
            {r.costing.lines.length ? (
              <div className="req-lines">
                <div className="tbl-head">
                  <span style={{ flex: 2 }}>Item</span>
                  <span style={{ flex: 1 }}>Qty</span>
                  <span style={{ flex: 1, textAlign: 'right' }}>Unit</span>
                  <span style={{ flex: 1, textAlign: 'right' }}>Amount</span>
                </div>
                {r.costing.lines.map((l) => (
                  <div key={l.id} className="tbl-row">
                    <span style={{ flex: 2 }}>
                      <span style={{ fontWeight: 600 }}>{l.label || COST_CATEGORY_LABELS[l.category]}</span>
                      <span className="t-caption-sm"> · {COST_CATEGORY_LABELS[l.category]}{l.paidDirectly ? ' · paid directly' : ''}</span>
                    </span>
                    <span style={{ flex: 1 }}>{l.quantity}</span>
                    <span style={{ flex: 1, textAlign: 'right' }}>{formatAmount(l.unitCost)}</span>
                    <span style={{ flex: 1, textAlign: 'right', fontWeight: 650 }}>{formatAmount(l.amount)}</span>
                  </div>
                ))}
                <div className="col g6 mt12" style={{ fontSize: 13 }}>
                  <KV label="Advance-eligible" value={formatZMW(r.costing.advanceEligibleTotal)} />
                  <KV label="Paid directly by IHM" value={formatZMW(r.costing.paidDirectly)} />
                  <KV label="Employee contribution" value={formatZMW(r.costing.employeeContribution)} />
                  {r.advance ? <KV label={`Advance (${r.advance.percentage}%)`} value={formatZMW(r.advance.amount)} total /> : null}
                </div>
              </div>
            ) : (
              <div className="t-caption">No cost lines yet.</div>
            )}
          </Card>

          <Card title="Attachments">
            {r.attachments.length ? (
              <div className="req-file">
                {r.attachments.map((a) => (
                  <Chip key={a.id} tone="neutral" file icon={fileIcon(a)} onClick={() => openFile(a.id).catch((e) => error(e, 'Could not open file'))} title={humanize(a.kind)}>
                    {a.name}
                  </Chip>
                ))}
              </div>
            ) : (
              <div className="t-caption">No supporting documents attached.</div>
            )}
          </Card>
        </div>

        <div className="side">
          <Card title="Approval chain">
            {data.approvalChain.length ? (
              <ChainTimeline items={data.approvalChain.map((c) => ({ key: c.key, label: c.label, state: c.state, meta: chainMeta(c) }))} />
            ) : (
              <div className="t-caption">The approval chain is set when the request is submitted.</div>
            )}
            {data.approvalChain.some((c) => c.comment) ? (
              <div className="col g8 mt14">
                {data.approvalChain
                  .filter((c) => c.comment)
                  .map((c) => (
                    <div key={c.key} className="t-caption" style={{ background: 'var(--md-surface)', borderRadius: 12, padding: '8px 12px' }}>
                      <b>{c.actorName ?? c.label}:</b> {c.comment}
                    </div>
                  ))}
              </div>
            ) : null}
          </Card>

          <Card title="Eligibility" titleRight={elig ? <Chip tone={elig.perDiemEligible ? 'approved' : 'blocked'}>{elig.perDiemEligible ? 'Per diem eligible' : 'No per diem'}</Chip> : undefined}>
            {elig ? (
              <div className="col g8" style={{ background: 'var(--md-surface)', borderRadius: 16, padding: 8 }}>
                <StatTile label="Distance from duty station" value={`≈ ${elig.distanceKm} km`} verdict={elig.distanceOk ? `over ${elig.distanceThresholdKm} km ✓` : `under ${elig.distanceThresholdKm} km ✗`} ok={elig.distanceOk} />
                <StatTile label="Time away" value={`${elig.hoursAway} hours`} verdict={elig.hoursOk ? `over ${elig.hoursThreshold} h ✓` : `under ${elig.hoursThreshold} h ✗`} ok={elig.hoursOk} />
                <StatTile label="Advance lead time" value={plural(elig.leadTimeWorkingDays, 'working day')} verdict={elig.leadTimeOk ? 'OK ✓' : 'short ✗'} ok={elig.leadTimeOk} />
                {elig.internationalNoticeOk !== null ? <StatTile label="International notice" value={plural(elig.internationalNoticeDays ?? 0, 'day')} verdict={elig.internationalNoticeOk ? '14 days ✓' : 'under 14 days ✗'} ok={elig.internationalNoticeOk} /> : null}
              </div>
            ) : (
              <div className="t-caption">Eligibility is calculated once an itinerary is entered.</div>
            )}
          </Card>

          {r.advance ? (
            <Card title="Travel advance">
              <div className="col g8 t-body">
                <KV label={`Advance (${r.advance.percentage}%)`} value={formatZMW(r.advance.amount)} />
                <KV label="Policy status" value={<Chip tone={r.advance.policyStatus === 'CLEAR' ? 'approved' : r.advance.policyStatus === 'BLOCKED' ? 'blocked' : 'pending'}>{humanize(r.advance.policyStatus)}</Chip>} />
                {r.advance.blockedByRequestId ? <KV label="Blocked by" value={<Link href={`/requests/${r.advance.blockedByRequestId}`}>{r.advance.blockedByRequestId}</Link>} /> : null}
                {r.advance.paidAt ? <KV label="Paid" value={fmtStamp(r.advance.paidAt)} /> : null}
              </div>
            </Card>
          ) : null}

          {data.canCancel || data.canEdit || data.canSubmit ? (
            <Card title="Actions">
              <div className="req-actions">
                {data.canEdit ? (
                  <Button variant="tonal" size="sm" icon="edit" href={`/requests/${r.id}/edit`}>
                    Edit request
                  </Button>
                ) : null}
                {data.canSubmit ? (
                  <Button size="sm" icon="send" onClick={doSubmit} loading={submit.isPending}>
                    Submit for approval
                  </Button>
                ) : null}
                {data.canCancel ? (
                  <Button variant="danger-text" size="sm" icon="cancel" onClick={() => setConfirmCancel(true)}>
                    Cancel request
                  </Button>
                ) : null}
              </div>
            </Card>
          ) : null}
          {!r.travellers.length && !r.costing.lines.length && r.status === 'DRAFT' ? (
            <div className="m3-card m3-card--md">
              <EmptyState icon="edit_note" title="Still a draft" body="Continue in the wizard to complete this request." action={<Button variant="tonal" size="sm" href={`/requests/${r.id}/edit`}>Continue</Button>} />
            </div>
          ) : null}
        </div>
      </div>

      <Dialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title="Cancel this request?"
        subtitle={`${r.id} will be marked Cancelled. Approvers will be notified and it cannot be reopened.`}
        actions={
          <>
            <Button variant="text" onClick={() => setConfirmCancel(false)}>
              Keep request
            </Button>
            <Button variant="danger" onClick={doCancel} loading={cancel.isPending}>
              Cancel request
            </Button>
          </>
        }
      />
    </div>
  );
}
