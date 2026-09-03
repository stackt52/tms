'use client';
import { COST_CATEGORY_LABELS, TRANSPORT_LABELS, TRAVEL_CATEGORY_LABELS, computeAdvance, fmtDateTime, formatAmount, formatZMW, plural, type WizardStep } from '@tms/shared';
import { Button, Chip, KV, fileIcon, humanize } from '@/components/m3';
import type { StepProps } from './wizard-state';

function Section({ title, step, goTo, children }: { title: string; step: WizardStep; goTo: (s: WizardStep) => void; children: React.ReactNode }) {
  return (
    <section className="wiz-review__sec">
      <div className="wiz-review__head">
        <span className="wiz-review__title">{title}</span>
        <div className="spacer" />
        <Button variant="text" size="xs" icon="edit" onClick={() => goTo(step)}>
          Edit
        </Button>
      </div>
      {children}
    </section>
  );
}
function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <div className="wiz-review__k">{k}</div>
      <div>{v || '—'}</div>
    </div>
  );
}

export function StepReview({ view, md, goTo }: StepProps) {
  const it = view.itinerary;
  const elig = view.eligibility;
  const pct = view.advance?.percentage ?? 75;
  const project = md?.projects.find((p) => p.id === view.projectId);
  const cc = md?.costCentres.find((c) => c.id === view.costCentreId);
  const sup = md?.users.find((u) => u.id === view.supervisorId);
  const hotel = md?.vendors.find((v) => v.id === view.accommodation.preferredVendorId);
  return (
    <div className="wiz-review">
      <div className="row g8 wrap">
        {view.category ? <Chip tone={view.category === 'INTERNATIONAL' ? 'info' : 'approved'} size="md">{TRAVEL_CATEGORY_LABELS[view.category]}</Chip> : <Chip tone="blocked" size="md">Travel type missing</Chip>}
        {elig ? (
          <Chip tone={elig.perDiemEligible ? 'approved' : 'neutral'} size="md" icon={elig.perDiemEligible ? 'verified' : 'info'} iconFilled>
            {elig.perDiemEligible ? 'Per diem eligible' : 'No per diem'}
          </Chip>
        ) : null}
        {elig ? (
          <Chip tone={elig.leadTimeOk ? 'approved' : 'pending'} size="md">
            Lead time {elig.leadTimeWorkingDays} wd {elig.leadTimeOk ? '✓' : '— short'}
          </Chip>
        ) : null}
        {elig?.internationalNoticeOk === false ? (
          <Chip tone="blocked" size="md">
            International notice under 14 days
          </Chip>
        ) : null}
      </div>

      <Section title="Trip details" step="trip_details" goTo={goTo}>
        <div className="wiz-review__grid">
          <Row k="Activity" v={view.activityTitle} />
          <Row k="Purpose" v={view.purpose} />
          <Row k="Work plan ref" v={view.workPlanRef} />
          <Row k="Project" v={project ? `${project.id} · ${project.name}` : view.projectId} />
          <Row k="Cost centre" v={cc ? `${cc.id} · ${cc.name}` : view.costCentreId} />
          <Row k="Supervisor" v={sup?.displayName ?? view.supervisorId} />
        </div>
        {view.activityDescription ? <div className="t-body-sm mt8" style={{ whiteSpace: 'pre-wrap' }}>{view.activityDescription}</div> : null}
      </Section>

      <Section title="Itinerary" step="itinerary" goTo={goTo}>
        <div className="wiz-review__grid">
          <Row k="Origin" v={it.originName} />
          <Row k="Destination" v={it.destinationName} />
          <Row k="Departure" v={it.departAt ? fmtDateTime(it.departAt) : ''} />
          <Row k="Return" v={it.returnAt ? fmtDateTime(it.returnAt) : ''} />
          <Row k="Nights" v={String(it.nights)} />
          <Row k="Distance" v={`≈ ${it.distanceOverrideKm ?? elig?.distanceKm ?? it.distanceKm} km`} />
          {it.stops.length ? <Row k="Stops" v={it.stops.map((s) => s.name).join(', ')} /> : null}
        </div>
      </Section>

      <Section title="Travellers" step="travellers" goTo={goTo}>
        <div className="row g8 wrap">
          {view.travellers.map((t, i) => (
            <Chip key={t.userId ?? t.externalId ?? i} tone={t.isLead ? 'active' : 'neutral'} size="md" regular>
              {t.name}
              {t.isLead ? ' · lead' : ''}
            </Chip>
          ))}
          {view.isGroup ? <Chip tone="info" size="md">Group</Chip> : null}
        </div>
      </Section>

      <Section title="Transport & accommodation" step="transport" goTo={goTo}>
        <div className="wiz-review__grid">
          <Row k="Transport" v={view.transport.mode ? TRANSPORT_LABELS[view.transport.mode] : ''} />
          {view.transport.justification ? <Row k="Justification" v={view.transport.justification} /> : null}
          <Row k="Accommodation" v={view.accommodation.required ? `${plural(view.accommodation.nights, 'night')} · ${formatZMW(view.accommodation.ratePerNight)}/night${hotel ? ` · ${hotel.name}` : ''}` : 'Not required'} />
          {view.accommodation.fullBoardProvided ? <Row k="Board" v="Full board provided" /> : null}
        </div>
      </Section>

      <Section title="Allowances" step="allowances" goTo={goTo}>
        <div className="wiz-review__grid">
          <Row k="Per diem" v={view.allowances.perDiemWaived ? `Waived — ${view.allowances.waiverReason ?? ''}` : `${plural(view.allowances.perDiemNights, 'night')}${view.allowances.perDiemRate ? ` × ${formatZMW(view.allowances.perDiemRate)}` : ''}`} />
          <Row k="Funding" v={view.allowances.overheadFunded ? 'Overhead' : 'Project'} />
          {view.international ? <Row k="Cabin class" v={humanize(view.international.cabinClass)} /> : null}
          {view.international?.visaRequired ? <Row k="Visa" v={humanize(view.international.visaStatus ?? 'TO_APPLY')} /> : null}
          {view.personal?.combined ? <Row k="Personal travel" v={`Contribution ${formatZMW(view.personal.personalContribution ?? 0)}`} /> : null}
        </div>
      </Section>

      <Section title="Costing" step="costing" goTo={goTo}>
        <div className="col g6" style={{ fontSize: 13 }}>
          {view.costing.lines.map((l) => (
            <KV key={l.id} label={`${l.label || COST_CATEGORY_LABELS[l.category]} · ${l.quantity} × ${formatAmount(l.unitCost)}${l.paidDirectly ? ' · IHM pays' : ''}`} value={formatAmount(l.amount)} />
          ))}
          <KV label="Total" value={formatZMW(view.costing.total)} total />
          <KV label={`Estimated advance (${pct}%)`} value={formatZMW(view.advance?.amount || computeAdvance(view.costing.advanceEligibleTotal, pct))} />
        </div>
      </Section>

      <Section title="Attachments" step="attachments" goTo={goTo}>
        {view.attachments.length ? (
          <div className="row g8 wrap">
            {view.attachments.map((a) => (
              <Chip key={a.id} tone="neutral" file icon={fileIcon(a)} title={humanize(a.kind)}>
                {a.name}
              </Chip>
            ))}
          </div>
        ) : (
          <div className="t-caption">No documents attached.</div>
        )}
      </Section>
    </div>
  );
}
