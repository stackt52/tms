'use client';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import {
  BANKING_MILESTONES,
  BANKING_MILESTONE_LABELS,
  COST_CATEGORY_LABELS,
  fmtDate,
  fmtDay,
  fmtRange,
  fmtStamp,
  formatAmount,
  formatZMW,
  plural,
  type Arrangement,
  type Attachment,
  type TripDetailResponse,
} from '@tms/shared';
import { Button, Card, CardSkeleton, Chip, Dialog, EmptyState, ErrorState, Icon, KV, SelectField, StatusChip, Tabs, TextField, UploadChip, fileIcon, humanize, useToast } from '@/components/m3';
import { openFile } from '@/lib/api';
import { useMe } from '@/lib/auth-context';
import { useMasterData, useAddTripDocument, useOpenLiquidation, useStartTrip, useTrip, useUpsertArrangement } from '@/lib/queries';
import './trips.css';

type Tab = 'overview' | 'arrangements' | 'financials' | 'documents';
const TABS: Tab[] = ['overview', 'arrangements', 'financials', 'documents'];

const ARR_ICON: Record<Arrangement['type'], string> = { FLIGHT: 'flight', HOTEL: 'hotel', SHUTTLE: 'local_taxi', IHM_VEHICLE: 'directions_car', RENTAL: 'car_rental', OTHER: 'receipt_long' };
const ARR_TYPE_LABEL: Record<Arrangement['type'], string> = { FLIGHT: 'Flight', HOTEL: 'Hotel', SHUTTLE: 'Shuttle / taxi', IHM_VEHICLE: 'IHM vehicle', RENTAL: 'Rental vehicle', OTHER: 'Other' };
const ARR_STATUSES: Arrangement['status'][] = ['REQUESTED', 'QUOTED', 'CONFIRMED', 'CANCELLED'];
function arrChip(s: Arrangement['status']): { tone: 'approved' | 'pending' | 'info' | 'neutral'; label: string } {
  if (s === 'CONFIRMED') return { tone: 'approved', label: 'Confirmed' };
  if (s === 'QUOTED') return { tone: 'pending', label: 'Pending' };
  if (s === 'REQUESTED') return { tone: 'info', label: 'Requested' };
  return { tone: 'neutral', label: 'Cancelled' };
}
const DOC_KINDS: Attachment['kind'][] = ['RECEIPT', 'BOARDING_PASS', 'TICKET', 'BOOKING_CONFIRMATION', 'RENTAL_AGREEMENT', 'AUTHORISATION', 'PAYMENT_PROOF', 'VISA', 'TRIP_REPORT', 'PHOTO', 'OTHER'];

export function TripWorkspaceScreen() {
  const { id } = useParams<{ id: string }>();
  const q = useTrip(id);
  if (q.isLoading) {
    return (
      <div className="page page--flush">
        <div className="tw-hero" style={{ minHeight: 170 }} />
        <div className="tw-body">
          <div className="tw-body__main">
            <CardSkeleton />
            <CardSkeleton />
          </div>
          <div className="tw-body__side">
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
  return <Workspace data={q.data} />;
}

function Workspace({ data }: { data: TripDetailResponse }) {
  const { request: r, trip, liquidation } = data;
  const me = useMe();
  const router = useRouter();
  const params = useSearchParams();
  const tabParam = params.get('tab') as Tab | null;
  const tab: Tab = tabParam && TABS.includes(tabParam) ? tabParam : 'overview';
  const setTab = (t: Tab) => router.replace(`/trips/${r.id}${t === 'overview' ? '' : `?tab=${t}`}`, { scroll: false });
  const { success, error } = useToast();

  const canManage = me.capabilities.canProcure || me.user.roles.includes('OFFICE_MANAGEMENT') || me.user.roles.includes('PROCUREMENT_OFFICER');
  const isTraveller = me.user.id === r.requesterId || (r.travellerIds ?? []).includes(me.user.id) || r.travellers.some((t) => t.userId === me.user.id);
  const start = useStartTrip(r.id);
  const it = r.itinerary;
  const travellerName = trip.travellerNames[0] ?? r.travellers[0]?.name ?? r.requesterName;
  const meta = [travellerName, it.departAt && it.returnAt ? `${fmtRange(it.departAt, it.returnAt)} ${new Date(it.returnAt).getUTCFullYear()}` : null, plural(it.nights, 'night'), r.projectId, r.costCentreId].filter(Boolean).join(' · ');

  return (
    <div className="page page--flush">
      <header className="tw-hero">
        <div className="tw-hero__crumb">
          <Link href="/trips">
            <Icon name="arrow_back" size={18} /> My trips
          </Link>
          <span>/ {r.id}</span>
        </div>
        <div className="tw-hero__row">
          <div className="grow">
            <div className="tw-hero__title">{trip.title || r.activityTitle || 'Trip'}</div>
            <div className="tw-hero__meta">{meta}</div>
          </div>
          {r.status === 'READY_FOR_TRAVEL' && isTraveller ? (
            <Button variant="tonal" size="sm" icon="flight_takeoff" loading={start.isPending} onClick={() => start.mutate(undefined, { onSuccess: () => success('Trip started — safe travels'), onError: (e) => error(e, 'Could not start the trip') })}>
              Start trip
            </Button>
          ) : null}
          <StatusChip status={r.status} size="lg" />
        </div>
        <div className="tw-hero__tabs">
          <Tabs<Tab>
            value={tab}
            onChange={setTab}
            options={[
              { value: 'overview', label: 'Overview' },
              { value: 'arrangements', label: 'Arrangements' },
              { value: 'financials', label: 'Financials' },
              { value: 'documents', label: 'Documents', badge: trip.documents.length },
            ]}
          />
        </div>
      </header>

      {tab === 'overview' ? (
        <div className="tw-body">
          <div className="tw-body__main">
            <Card title="Arrangements" titleRight={<Button variant="text" size="xs" onClick={() => setTab('arrangements')}>View all</Button>}>
              <ArrangementList items={trip.arrangements} />
            </Card>
            <Card title="Documents">
              <DocumentChips data={data} />
            </Card>
          </div>
          <div className="tw-body__side">
            <Financials data={data} />
            <ApprovalsEvidence data={data} />
          </div>
        </div>
      ) : null}

      {tab === 'arrangements' ? <ArrangementsTab data={data} canManage={canManage} /> : null}
      {tab === 'financials' ? <FinancialsTab data={data} liquidationId={liquidation?.id ?? trip.liquidationId ?? null} /> : null}
      {tab === 'documents' ? <DocumentsTab data={data} /> : null}
    </div>
  );
}

/* ---------- Arrangements ---------- */

function ArrangementList({ items, right }: { items: Arrangement[]; right?: (a: Arrangement) => React.ReactNode }) {
  if (!items.length) return <EmptyState icon="event_available" title="No bookings yet" body="Procurement and Office Management add flights, hotels and vehicles here as they are confirmed." />;
  return (
    <div className="col g12">
      {items.map((a) => {
        const chip = arrChip(a.status);
        const pending = a.status !== 'CONFIRMED';
        return (
          <div key={a.id} className="tw-arr">
            <Icon name={ARR_ICON[a.type]} filled={!pending} size={22} color={pending ? 'var(--md-warning-text)' : 'var(--md-primary)'} />
            <div className="grow">
              <div className="tw-arr__title">{a.title}</div>
              <div className="tw-arr__detail">{[a.detail, a.bookingRef && !a.detail?.includes(a.bookingRef) ? `Ref ${a.bookingRef}` : null, a.vendorName && !a.detail?.includes(a.vendorName) ? a.vendorName : null, a.amount ? formatZMW(a.amount) : null].filter(Boolean).join(' · ')}</div>
            </div>
            <div className="tw-arr__right">
              {right ? right(a) : null}
              <Chip tone={chip.tone}>{chip.label}</Chip>
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface ArrForm {
  id?: string;
  type: Arrangement['type'];
  title: string;
  detail: string;
  vendorId: string;
  bookingRef: string;
  amount: string;
  status: Arrangement['status'];
}
const emptyArr: ArrForm = { type: 'FLIGHT', title: '', detail: '', vendorId: '', bookingRef: '', amount: '', status: 'REQUESTED' };

function ArrangementsTab({ data, canManage }: { data: TripDetailResponse; canManage: boolean }) {
  const { trip, request: r } = data;
  const md = useMasterData();
  const upsert = useUpsertArrangement(r.id);
  const { success, error } = useToast();
  const [form, setForm] = useState<ArrForm | null>(null);
  const vendors = md.data?.vendors.filter((v) => v.active) ?? [];

  const save = () => {
    if (!form || !form.title.trim()) return;
    const vendor = vendors.find((v) => v.id === form.vendorId);
    upsert.mutate(
      {
        id: form.id,
        type: form.type,
        title: form.title.trim(),
        detail: form.detail.trim(),
        vendorId: form.vendorId || undefined,
        vendorName: vendor?.name,
        bookingRef: form.bookingRef.trim() || undefined,
        amount: form.amount ? Number(form.amount) : undefined,
        status: form.status,
      },
      {
        onSuccess: () => {
          success(form.id ? 'Arrangement updated' : 'Arrangement added');
          setForm(null);
        },
        onError: (e) => error(e, 'Could not save arrangement'),
      },
    );
  };
  const changeStatus = (a: Arrangement, status: Arrangement['status']) =>
    upsert.mutate({ id: a.id, type: a.type, title: a.title, status }, { onSuccess: () => success(`Marked ${arrChip(status).label.toLowerCase()}`), onError: (e) => error(e, 'Could not update status') });

  return (
    <div className="tw-body">
      <div className="tw-body__main">
        <Card
          title="Arrangements"
          titleRight={
            canManage ? (
              <Button size="sm" icon="add" onClick={() => setForm({ ...emptyArr })}>
                Add arrangement
              </Button>
            ) : (
              <span className="t-caption">{plural(trip.arrangements.length, 'booking')}</span>
            )
          }
        >
          <ArrangementList
            items={trip.arrangements}
            right={
              canManage
                ? (a) => (
                    <>
                      <select className="tw-arr__status" aria-label={`Status for ${a.title}`} value={a.status} onChange={(e) => changeStatus(a, e.target.value as Arrangement['status'])} disabled={upsert.isPending}>
                        {ARR_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {arrChip(s).label}
                          </option>
                        ))}
                      </select>
                      <button type="button" className="m3-iconbtn" aria-label="Edit arrangement" onClick={() => setForm({ id: a.id, type: a.type, title: a.title, detail: a.detail ?? '', vendorId: a.vendorId ?? '', bookingRef: a.bookingRef ?? '', amount: a.amount ? String(a.amount) : '', status: a.status })}>
                        <Icon name="edit" size={18} />
                      </button>
                    </>
                  )
                : undefined
            }
          />
        </Card>
        <Card title="Requested in the travel request" size="md">
          <div className="col g6 t-body-sm">
            <KV label="Transport" value={r.transport.mode ? humanize(r.transport.mode) : '—'} />
            {r.transport.driverRequired ? <KV label="Driver" value="Required" /> : null}
            <KV label="Accommodation" value={r.accommodation.required ? `${plural(r.accommodation.nights, 'night')} · ${formatZMW(r.accommodation.ratePerNight)}/night` : 'Not required'} />
            {r.international ? <KV label="Cabin class" value={humanize(r.international.cabinClass)} /> : null}
          </div>
        </Card>
      </div>
      <div className="tw-body__side">
        <Financials data={data} />
      </div>

      <Dialog
        open={!!form}
        onClose={() => setForm(null)}
        title={form?.id ? 'Edit arrangement' : 'Add arrangement'}
        subtitle="Bookings made through Procurement or Office Management for this trip."
        actions={
          <>
            <Button variant="text" onClick={() => setForm(null)}>
              Cancel
            </Button>
            <Button onClick={save} loading={upsert.isPending} disabled={!form?.title.trim()} disabledLabel="Add a title first">
              {form?.id ? 'Save changes' : 'Add arrangement'}
            </Button>
          </>
        }
      >
        {form ? (
          <div className="col g16 mt12">
            <div className="row g12" style={{ alignItems: 'stretch' }}>
              <SelectField label="Type" className="grow" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as Arrangement['type'] })} options={(Object.keys(ARR_TYPE_LABEL) as Arrangement['type'][]).map((t) => ({ value: t, label: ARR_TYPE_LABEL[t] }))} />
              <SelectField label="Status" className="grow" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Arrangement['status'] })} options={ARR_STATUSES.map((s) => ({ value: s, label: arrChip(s).label }))} />
            </div>
            <TextField label="Title" placeholder="Proflight PFZ 312 · LUN → NLA · 08 Sep 07:40" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <TextField label="Detail" placeholder="Booked · Economy · cancellation terms" value={form.detail} onChange={(e) => setForm({ ...form, detail: e.target.value })} />
            <div className="row g12" style={{ alignItems: 'stretch' }}>
              <SelectField label="Vendor" className="grow" value={form.vendorId} placeholder="No vendor" onChange={(e) => setForm({ ...form, vendorId: e.target.value })} options={vendors.map((v) => ({ value: v.id, label: `${v.name} · ${humanize(v.category)}` }))} />
              <TextField label="Booking ref" style={{ width: 160 }} value={form.bookingRef} onChange={(e) => setForm({ ...form, bookingRef: e.target.value })} />
              <TextField label="Amount (ZMW)" type="number" min={0} step="0.01" style={{ width: 160 }} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}

/* ---------- Financials ---------- */

function Financials({ data, large }: { data: TripDetailResponse; large?: boolean }) {
  const f = data.trip.financials;
  return (
    <div className={`tw-fin ${large ? 'tw-fin--lg' : ''}`}>
      <div className="tw-fin__label">FINANCIALS</div>
      <div className="tw-fin__figures">
        <div>
          <div className="tw-fin__k">Approved budget</div>
          <div className="tw-fin__v">{formatZMW(f.approvedBudget, { decimals: Number.isInteger(f.approvedBudget) ? 0 : 2 })}</div>
        </div>
        <div>
          <div className="tw-fin__k">
            {data.request.advance?.paidAt ? 'Advance paid' : 'Advance'} ({f.advancePercentage}%)
          </div>
          <div className="tw-fin__v">{formatZMW(f.advanceAmount)}</div>
        </div>
      </div>
      <div className="tw-fin__lines">
        <div>
          <span>Employee contribution</span>
          <span>{formatZMW(f.employeeContribution)}</span>
        </div>
        <div>
          <span>Expenses logged so far</span>
          <span>{formatZMW(f.expensesLogged, { decimals: Number.isInteger(f.expensesLogged) ? 0 : 2 })}</span>
        </div>
        <div className="tw-fin__due">
          <span>Liquidation due</span>
          <span>{f.liquidationDueDate ? fmtDate(f.liquidationDueDate) : '5 days after return'}</span>
        </div>
      </div>
    </div>
  );
}

function ApprovalsEvidence({ data }: { data: TripDetailResponse }) {
  const done = data.approvalChain.filter((c) => c.state === 'done');
  return (
    <div className="tw-appr">
      <div className="tw-appr__title">Approvals</div>
      {done.length ? (
        <div className="tw-appr__list">
          {done.map((c) => (
            <div key={c.key}>
              <Icon name="check_circle" filled size={18} color="var(--md-primary)" />
              <span>
                {c.label}
                {c.actorName ? ` — ${c.actorName}` : ''}
                {c.at ? ` · ${fmtDay(c.at)}` : ''}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="t-caption">No approvals recorded.</div>
      )}
    </div>
  );
}

function FinancialsTab({ data, liquidationId }: { data: TripDetailResponse; liquidationId: string | null }) {
  const { request: r } = data;
  const router = useRouter();
  const open = useOpenLiquidation();
  const { error, success } = useToast();
  const adv = r.advance;
  const doneKeys = BANKING_MILESTONES.filter((m) => !!adv?.milestones?.[m]);
  const latest = doneKeys[doneKeys.length - 1];
  const canOpen = ['IN_PROGRESS', 'READY_FOR_TRAVEL', 'AWAITING_LIQUIDATION'].includes(r.status);
  const liquidate = () => {
    if (liquidationId) return router.push(`/liquidations/${liquidationId}`);
    open.mutate(r.id, {
      onSuccess: (d) => {
        success('Liquidation opened');
        router.push(`/liquidations/${d.liquidation.id}`);
      },
      onError: (e) => error(e, 'Could not open liquidation'),
    });
  };
  return (
    <div className="tw-body">
      <div className="tw-body__main">
        <Financials data={data} large />
        <Card title="Approved cost lines" titleRight={<span className="t-figure">{formatZMW(r.costing.total)}</span>}>
          {r.costing.lines.length ? (
            <div className="req-lines">
              <div className="tbl-head">
                <span style={{ flex: 2 }}>Item</span>
                <span style={{ flex: 1 }}>Qty</span>
                <span style={{ flex: 1, textAlign: 'right' }}>Unit</span>
                <span style={{ flex: 1, textAlign: 'right' }}>Amount</span>
              </div>
              {r.costing.lines.map((l) => (
                <div key={l.id} className="tbl-row" style={{ fontSize: 13 }}>
                  <span style={{ flex: 2 }}>
                    <span style={{ fontWeight: 600 }}>{l.label || COST_CATEGORY_LABELS[l.category]}</span>
                    <span className="t-caption-sm">
                      {' '}
                      · {COST_CATEGORY_LABELS[l.category]}
                      {l.paidDirectly ? ' · paid directly' : ''}
                      {l.employeeContribution ? ` · employee ${formatAmount(l.employeeContribution)}` : ''}
                    </span>
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
              </div>
            </div>
          ) : (
            <div className="t-caption">No cost lines on the approved request.</div>
          )}
        </Card>
      </div>
      <div className="tw-body__side">
        <Card title="Advance payment" size="md">
          {adv ? (
            <>
              <div className="col g6 t-body-sm">
                <KV label={`Advance (${adv.percentage}%)`} value={formatZMW(adv.amount)} />
                <KV label="Policy status" value={<Chip tone={adv.policyStatus === 'CLEAR' ? 'approved' : adv.policyStatus === 'BLOCKED' ? 'blocked' : 'pending'}>{humanize(adv.policyStatus)}</Chip>} />
                {adv.leadTimeWorkingDays !== null ? <KV label="Lead time" value={`${plural(adv.leadTimeWorkingDays, 'working day')} (need ${adv.leadTimeRequiredWorkingDays})`} /> : null}
                {adv.paidAt ? <KV label="Released" value={fmtStamp(adv.paidAt)} /> : null}
              </div>
              <div className="t-label mt14 mb8">Banking milestones</div>
              <div className="tw-milestones">
                {BANKING_MILESTONES.map((m, i) => {
                  const rec = adv.milestones?.[m];
                  const tone = rec ? (m === latest ? 'active' : 'approved') : 'faint';
                  return (
                    <span key={m} className="row g8">
                      <Chip tone={tone} icon={rec ? 'check' : undefined} title={rec ? `${rec.byName} · ${fmtStamp(rec.at)}${rec.reference ? ` · ${rec.reference}` : ''}` : undefined}>
                        {BANKING_MILESTONE_LABELS[m]}
                      </Chip>
                      {i < BANKING_MILESTONES.length - 1 ? <Icon name="arrow_forward" size={14} /> : null}
                    </span>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="t-caption">No advance has been requested for this trip.</div>
          )}
        </Card>
        <Card title="Liquidation" size="md">
          <div className="t-body-sm t-muted">Submit receipts and the trip report within 5 days of return. Reconciliation shows any amount due to you or refundable to IHM.</div>
          <div className="mt14">
            <Button icon="receipt_long" block onClick={liquidate} loading={open.isPending} disabled={!liquidationId && !canOpen} disabledLabel="Available once the trip starts">
              {liquidationId ? 'Open liquidation' : 'Liquidate this trip'}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ---------- Documents ---------- */

function DocumentChips({ data }: { data: TripDetailResponse }) {
  const add = useAddTripDocument(data.request.id);
  const { error, success } = useToast();
  return (
    <div className="tw-docs">
      {data.trip.documents.map((d) => (
        <Chip key={d.id} tone="neutral" file icon={fileIcon(d)} title={humanize(d.kind)} onClick={() => openFile(d.id).catch((e) => error(e, 'Could not open file'))}>
          {d.name}
        </Chip>
      ))}
      <UploadChip label="Upload receipt" kind="RECEIPT" onUploaded={(a) => add.mutateAsync({ attachmentId: a.id, kind: 'RECEIPT' }).then(() => success('Receipt added'))} />
    </div>
  );
}

function DocumentsTab({ data }: { data: TripDetailResponse }) {
  const add = useAddTripDocument(data.request.id);
  const { error, success } = useToast();
  const [kind, setKind] = useState<Attachment['kind']>('RECEIPT');
  const docs = data.trip.documents;
  return (
    <div className="tw-body">
      <div className="tw-body__main">
        <Card title="Documents" titleRight={<span className="t-caption">{plural(docs.length, 'file')}</span>}>
          {docs.length ? (
            <div className="tw-docgrid">
              {docs.map((d) => (
                <button key={d.id} type="button" className="tw-doc" onClick={() => openFile(d.id).catch((e) => error(e, 'Could not open file'))}>
                  <div className="row g8">
                    <Icon name={fileIcon(d)} size={22} color="var(--md-primary)" />
                    <Chip tone="neutral" size="xs">
                      {humanize(d.kind)}
                    </Chip>
                  </div>
                  <div className="tw-doc__name" title={d.name}>
                    {d.name}
                  </div>
                  <div className="tw-doc__meta">
                    {(d.size / 1024).toFixed(0)} KB · {fmtStamp(d.uploadedAt)}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState icon="folder_open" title="No documents yet" body="Tickets, confirmations, boarding passes and receipts for this trip will be kept here." />
          )}
        </Card>
      </div>
      <div className="tw-body__side">
        <Card title="Upload a document" size="md">
          <SelectField label="Document type" value={kind} onChange={(e) => setKind(e.target.value as Attachment['kind'])} options={DOC_KINDS.map((k) => ({ value: k, label: humanize(k) }))} />
          <div className="mt14">
            <UploadChip label={`Upload ${humanize(kind).toLowerCase()}`} kind={kind} onUploaded={(a) => add.mutateAsync({ attachmentId: a.id, kind }).then(() => success('Document added'))} />
          </div>
          <div className="t-caption mt12">PDF or image, up to 10 MB. Receipts uploaded here are available when you liquidate.</div>
        </Card>
      </div>
    </div>
  );
}
