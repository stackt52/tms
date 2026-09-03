'use client';
import { useState, type ReactNode } from 'react';
import { BANKING_MILESTONE_LABELS, BANKING_MILESTONES, fmtDay, fmtStamp, formatAmount, formatZMW, shortRef, workingDaysBetween, type AdvanceQueueRow, type BankingMilestone, type Role } from '@tms/shared';
import { Button, Card, CardSkeleton, Chip, EmptyState, ErrorState, Icon, SummaryCard, useToast } from '@/components/m3';
import { useMe } from '@/lib/auth-context';
import { useAdvanceMilestone, useAdvanceQueue, useApproveException, useRequestException } from '@/lib/queries';
import { CommentDialog } from '@/screens/approvals/CommentDialog';
import { FinanceNav } from './FinanceNav';
import './finance.css';

/** Who may record each banking milestone (SRS §11.3 / handoff footer copy). */
const MILESTONE_ROLES: Record<BankingMilestone, Role[]> = {
  PREPARED: ['FINANCE_ACCOUNTANT', 'FINANCE_ASSISTANT'],
  SUBMITTED: ['FINANCE_ACCOUNTANT', 'FINANCE_ASSISTANT'],
  AUTH_1: ['FINANCE_DIRECTOR'],
  AUTH_2: ['PROJECT_DIRECTOR', 'CEO'],
  RELEASED: ['FINANCE_ACCOUNTANT', 'FINANCE_ASSISTANT', 'FINANCE_DIRECTOR'],
};
const MILESTONE_ACTION: Record<BankingMilestone, string> = {
  PREPARED: 'Prepare payment',
  SUBMITTED: 'Mark submitted',
  AUTH_1: 'Auth 1',
  AUTH_2: 'Auth 2',
  RELEASED: 'Release',
};

const COLS = { req: 2.4, approved: 1.1, advance: 1.1, depart: 1.3, policy: 1.6, action: 1.5 };

/** 1h — Finance advances queue. */
export function AdvancesScreen() {
  const me = useMe();
  const roles = me.user.roles;
  const q = useAdvanceQueue();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const rows = q.data?.rows ?? [];
  const selected = rows.find((r) => r.requestId === selectedId) ?? rows[0] ?? null;
  const pct = q.data?.advancePercentage ?? 75;
  const s = q.data?.summary;

  return (
    <div className="page">
      <div className="fin-header">
        <div className="t-title">Advance processing</div>
        <div className="spacer" />
        <div className="fin-summary">
          <SummaryCard label="Ready to pay" value={s ? `${s.readyCount} · ${formatZMW(s.readyValue, { decimals: 0 })}` : '—'} />
          <SummaryCard label="Flagged" value={s ? s.flagged : '—'} tone="pending" />
          <SummaryCard label="Blocked" value={s ? s.blocked : '—'} tone="blocked" />
        </div>
      </div>
      <FinanceNav />

      {q.isLoading ? (
        <div className="mt18">
          <CardSkeleton lines={4} h={280} />
        </div>
      ) : q.error ? (
        <Card className="mt18">
          <ErrorState error={q.error} retry={() => q.refetch()} />
        </Card>
      ) : rows.length === 0 ? (
        <Card className="mt18">
          <EmptyState icon="payments" title="No advances to process" body="Approved requests with a travel advance appear here once the chain completes." />
        </Card>
      ) : (
        <Card flush className="fin-table">
          <div className="tbl-scroll">
            <div>
              <div className="tbl-head">
                <span style={{ flex: COLS.req }}>Request / traveller</span>
                <span style={{ flex: COLS.approved }}>Approved</span>
                <span style={{ flex: COLS.advance }}>Advance {pct}%</span>
                <span style={{ flex: COLS.depart }}>Departure</span>
                <span style={{ flex: COLS.policy }}>Policy status</span>
                <span style={{ flex: COLS.action }}>Action</span>
              </div>
              {rows.map((r) => (
                <AdvanceRow key={r.requestId} r={r} roles={roles} selected={selected?.requestId === r.requestId} onSelect={() => setSelectedId(r.requestId)} />
              ))}
            </div>
          </div>
        </Card>
      )}

      <MilestoneFooter row={selected} />
    </div>
  );
}

function AdvanceRow({ r, roles, selected, onSelect }: { r: AdvanceQueueRow; roles: Role[]; selected: boolean; onSelect: () => void }) {
  const toast = useToast();
  const milestone = useAdvanceMilestone(r.requestId);
  const requestException = useRequestException(r.requestId);
  const approveException = useApproveException(r.requestId);
  const [dialog, setDialog] = useState<null | 'reference' | 'exception'>(null);

  const a = r.advance;
  const ps = a.policyStatus;
  const warm = ps === 'LEAD_TIME_SHORT';
  const blocked = ps === 'BLOCKED';
  const lead = a.leadTimeWorkingDays ?? workingDaysBetween(new Date(), r.departAt);
  const blocker = r.blockingRequestId ?? a.blockedByRequestId ?? null;
  const next = BANKING_MILESTONES.find((m) => !a.milestones[m]);
  const latestDone = [...BANKING_MILESTONES].reverse().find((m) => a.milestones[m]);

  const record = (m: BankingMilestone, reference?: string) =>
    milestone.mutate(
      { milestone: m, reference },
      {
        onSuccess: () => {
          toast.success(`${r.shortRef} · ${BANKING_MILESTONE_LABELS[m]} recorded`);
          setDialog(null);
        },
        onError: (e) => toast.error(e, 'Could not record the milestone'),
      },
    );

  let policy: ReactNode;
  if (ps === 'CLEAR') policy = <Chip tone="approved">Clear</Chip>;
  else if (ps === 'LEAD_TIME_SHORT') policy = <Chip tone="pending">{a.exception && !a.exception.approvedAt ? 'Exception requested' : 'Lead time short'}</Chip>;
  else if (blocked) policy = <Chip tone="blocked">Blocked — {blocker ? shortRef(blocker) : 'prior trip'} unliquidated</Chip>;
  else if (ps === 'AWAITING_APPROVAL') policy = <Chip tone="neutral">Awaiting approval</Chip>;
  else policy = <Chip tone="neutral">No advance</Chip>;

  let action: ReactNode;
  if (!r.isApproved) {
    action = (
      <Button variant="outlined" size="sm" disabled>
        Awaiting approval
      </Button>
    );
  } else if (blocked) {
    action = (
      <Button variant="danger-text" size="sm" href={blocker ? `/trips/${blocker}` : `/requests/${r.requestId}`}>
        View blocking trip →
      </Button>
    );
  } else if (ps === 'LEAD_TIME_SHORT') {
    if (a.exception && !a.exception.approvedAt) {
      action = roles.includes('FINANCE_DIRECTOR') ? (
        <Button
          variant="tonal"
          size="sm"
          icon="verified"
          loading={approveException.isPending}
          onClick={() =>
            approveException.mutate(undefined, {
              onSuccess: () => toast.success(`Lead-time exception approved for ${r.shortRef}`),
              onError: (e) => toast.error(e, 'Could not approve the exception'),
            })
          }
        >
          Approve exception
        </Button>
      ) : (
        <Chip tone="pending" icon="hourglass_top" title={`Reason: ${a.exception.reason}`}>
          Awaiting Finance Director
        </Chip>
      );
    } else {
      action = (
        <Button variant="outlined-warn" size="sm" onClick={() => setDialog('exception')}>
          Request exception
        </Button>
      );
    }
  } else if (ps === 'CLEAR') {
    if (!next) {
      action = (
        <Chip tone="approved" icon="check_circle" iconFilled>
          Released
        </Chip>
      );
    } else if (!MILESTONE_ROLES[next].some((x) => roles.includes(x))) {
      action = latestDone ? <Chip tone="active">{BANKING_MILESTONE_LABELS[latestDone]} ✓</Chip> : <Chip tone="neutral">Awaiting {BANKING_MILESTONE_LABELS[next]}</Chip>;
    } else if (next === 'SUBMITTED') {
      action = (
        <Button size="sm" onClick={() => setDialog('reference')}>
          {MILESTONE_ACTION.SUBMITTED}
        </Button>
      );
    } else {
      action = (
        <Button size="sm" variant={next === 'PREPARED' || next === 'RELEASED' ? 'filled' : 'tonal'} loading={milestone.isPending} onClick={() => record(next)}>
          {MILESTONE_ACTION[next]}
        </Button>
      );
    }
  } else {
    action = <span className="t-faint">—</span>;
  }

  return (
    <div className={`tbl-row tbl-row--clickable ${warm ? 'tbl-row--warm' : ''} ${selected ? 'adv-row--selected' : ''}`} onClick={onSelect} aria-selected={selected}>
      <span style={{ flex: COLS.req }}>
        <b>{r.shortRef}</b> · {r.travellerName}
        <br />
        <span className="fin-sub">
          {r.destination} · {r.projectOrFunding}
        </span>
      </span>
      <span style={{ flex: COLS.approved }}>{formatAmount(r.approvedAmount)}</span>
      <span style={{ flex: COLS.advance, fontWeight: 700, ...(blocked ? { color: 'var(--md-outline-variant)', textDecoration: 'line-through' } : {}) }}>{formatAmount(a.amount)}</span>
      <span style={{ flex: COLS.depart, ...(warm ? { color: 'var(--md-warning-text)', fontWeight: 700 } : {}) }}>
        {fmtDay(r.departAt)} · {lead} wd
      </span>
      <span style={{ flex: COLS.policy }}>{policy}</span>
      <span style={{ flex: COLS.action }} onClick={(e) => e.stopPropagation()}>
        {action}
        <CommentDialog
          open={dialog === 'reference'}
          title="Mark submitted to online banking"
          subtitle={`${r.shortRef} · ${r.travellerName} · ${formatZMW(a.amount)}`}
          label="Bank reference"
          placeholder="Batch / transaction reference"
          singleLine
          confirmLabel="Mark submitted"
          busy={milestone.isPending}
          onClose={() => setDialog(null)}
          onConfirm={(ref) => record('SUBMITTED', ref)}
        />
        <CommentDialog
          open={dialog === 'exception'}
          title="Request lead-time exception"
          subtitle={`Only ${lead} working ${lead === 1 ? 'day' : 'days'} before departure — policy requires ${a.leadTimeRequiredWorkingDays}. The Finance Director must approve before the advance is prepared.`}
          label="Reason"
          placeholder="Why should this advance be paid despite the short notice?"
          confirmLabel="Request exception"
          confirmVariant="outlined-warn"
          busy={requestException.isPending}
          onClose={() => setDialog(null)}
          onConfirm={(reason) =>
            requestException.mutate(
              { reason },
              {
                onSuccess: () => {
                  toast.success(`Exception requested for ${r.shortRef}`);
                  setDialog(null);
                },
                onError: (e) => toast.error(e, 'Could not request the exception'),
              },
            )
          }
        />
      </span>
    </div>
  );
}

function MilestoneFooter({ row }: { row: AdvanceQueueRow | null }) {
  const done = row?.advance.milestones ?? {};
  const latest = [...BANKING_MILESTONES].reverse().find((m) => done[m]);
  return (
    <div className="adv-footer">
      <Icon name="account_balance" filled size={24} color="var(--md-primary)" />
      <div className="adv-footer__text">
        <b>Banking milestones per payment:</b> prepared by Finance Accountant → submitted to online banking (reference captured) → 1st authorisation, Finance Director → 2nd authorisation, Project Director / CEO → released.
        {row ? (
          <>
            {' '}
            Showing <b>{row.shortRef}</b>.
          </>
        ) : null}
      </div>
      <div className="row g6 wrap" aria-label="Milestone progress">
        {BANKING_MILESTONES.map((m) => {
          const rec = done[m];
          const tone = rec ? (m === latest ? 'active' : 'approved') : 'faint';
          return (
            <Chip key={m} tone={tone} className="adv-ms" title={rec ? `${rec.byName} · ${fmtStamp(rec.at)}${rec.reference ? ` · ref ${rec.reference}` : ''}` : undefined}>
              {BANKING_MILESTONE_LABELS[m]}
              {m === latest ? ' ✓' : ''}
            </Chip>
          );
        })}
      </div>
    </div>
  );
}
