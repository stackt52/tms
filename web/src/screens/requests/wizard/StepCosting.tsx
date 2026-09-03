'use client';
import { COST_CATEGORY_LABELS, computeAdvance, computeCosting, formatAmount, formatZMW, type CostCategory, type CostLine } from '@tms/shared';
import { Button, Chip, Icon, KV } from '@/components/m3';
import { newId, type StepProps } from './wizard-state';

const CATS = Object.keys(COST_CATEGORY_LABELS) as CostCategory[];
const RECEIPT_FREE: CostCategory[] = ['PER_DIEM', 'MILEAGE'];

function blank(category: CostCategory = 'OTHER', label = '', quantity = 1, unitCost = 0, extra: Partial<CostLine> = {}): CostLine {
  return { id: newId('cl'), category, label, quantity, unitCost, amount: quantity * unitCost, receiptRequired: !RECEIPT_FREE.includes(category), ...extra };
}

export function StepCosting({ view, set }: StepProps) {
  const lines = view.costing.lines;
  const costing = computeCosting(lines);
  const pct = view.advance?.percentage ?? 75;
  const commit = (next: CostLine[]) => set({ costingLines: next });
  const update = (id: string, p: Partial<CostLine>) => commit(lines.map((l) => (l.id === id ? { ...l, ...p, amount: (p.quantity ?? l.quantity) * (p.unitCost ?? l.unitCost) } : l)));
  const has = (c: CostCategory) => lines.some((l) => l.category === c);
  const al = view.allowances;
  const acc = view.accommodation;

  const suggestions: { key: CostCategory; label: string; make: () => CostLine }[] = [];
  if (!has('PER_DIEM') && !al.perDiemWaived && al.perDiemNights > 0 && al.perDiemRate > 0) suggestions.push({ key: 'PER_DIEM', label: `Per diem · ${al.perDiemNights} × ${formatAmount(al.perDiemRate)}`, make: () => blank('PER_DIEM', 'Per diem', al.perDiemNights, al.perDiemRate) });
  if (!has('ACCOMMODATION') && acc.required && acc.nights > 0) suggestions.push({ key: 'ACCOMMODATION', label: `Accommodation · ${acc.nights} nights`, make: () => blank('ACCOMMODATION', 'Accommodation', acc.nights, acc.ratePerNight, { paidDirectly: !!acc.preferredVendorId }) });
  if (!has('FLIGHTS') && view.transport.mode === 'AIR') suggestions.push({ key: 'FLIGHTS', label: 'Flights (paid by IHM)', make: () => blank('FLIGHTS', 'Return airfare', 1, 0, { paidDirectly: true, employeeContribution: view.international?.upgradeDifference }) });
  if (!has('CAR_RENTAL') && view.transport.mode === 'RENTAL') suggestions.push({ key: 'CAR_RENTAL', label: 'Car rental', make: () => blank('CAR_RENTAL', 'Rental vehicle', Math.max(1, view.itinerary.nights + 1), 0, { paidDirectly: true }) });
  if (!has('FUEL') && (view.transport.mode === 'IHM_VEHICLE' || view.transport.mode === 'RENTAL')) suggestions.push({ key: 'FUEL', label: 'Fuel', make: () => blank('FUEL', 'Fuel', 1, 0) });
  if (!has('GROUND_TRANSPORT')) suggestions.push({ key: 'GROUND_TRANSPORT', label: 'Ground transport', make: () => blank('GROUND_TRANSPORT', 'Airport / local transfers', 1, 0) });
  if (!has('VISA') && view.international?.visaRequired) suggestions.push({ key: 'VISA', label: 'Visa costs', make: () => blank('VISA', 'Visa fees', 1, 0) });

  return (
    <div className="col g16">
      {suggestions.length ? (
        <div className="row g8 wrap">
          <span className="t-caption">Quick add:</span>
          {suggestions.map((s) => (
            <Chip key={s.key} tone="dashed" icon="add" onClick={() => commit([...lines, s.make()])}>
              {s.label}
            </Chip>
          ))}
        </div>
      ) : null}

      <div className="tbl-scroll">
        <div className="wiz-cost" style={{ minWidth: 760 }}>
          <div className="tbl-head">
            <span style={{ flex: 1.3 }}>Category</span>
            <span style={{ flex: 1.6 }}>Item</span>
            <span style={{ width: 64 }}>Qty</span>
            <span style={{ width: 110, textAlign: 'right' }}>Unit (ZMW)</span>
            <span style={{ width: 110, textAlign: 'right' }}>Amount</span>
            <span style={{ width: 64, textAlign: 'center' }}>Receipt</span>
            <span style={{ width: 64, textAlign: 'center' }}>IHM pays</span>
            <span style={{ width: 110, textAlign: 'right' }}>Employee</span>
            <span style={{ width: 40 }} />
          </div>
          {lines.length ? (
            lines.map((l) => (
              <div key={l.id} className="tbl-row">
                <div className="wiz-cell" style={{ flex: 1.3 }}>
                  <select aria-label="Category" value={l.category} onChange={(e) => update(l.id, { category: e.target.value as CostCategory, receiptRequired: !RECEIPT_FREE.includes(e.target.value as CostCategory) })}>
                    {CATS.map((c) => (
                      <option key={c} value={c}>
                        {COST_CATEGORY_LABELS[c]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="wiz-cell" style={{ flex: 1.6 }}>
                  <input aria-label="Item" placeholder={COST_CATEGORY_LABELS[l.category]} value={l.label} onChange={(e) => update(l.id, { label: e.target.value })} />
                </div>
                <div className="wiz-cell" style={{ width: 64 }}>
                  <input aria-label="Quantity" type="number" min={0} step="1" value={l.quantity} onChange={(e) => update(l.id, { quantity: Number(e.target.value) || 0 })} />
                </div>
                <div className="wiz-cell" style={{ width: 110 }}>
                  <input aria-label="Unit cost" type="number" min={0} step="0.01" value={l.unitCost || ''} onChange={(e) => update(l.id, { unitCost: Number(e.target.value) || 0 })} />
                </div>
                <div style={{ width: 110, textAlign: 'right', fontWeight: 650 }}>{formatAmount(l.quantity * l.unitCost)}</div>
                <div className="wiz-cell wiz-cell--check" style={{ width: 64 }}>
                  <input aria-label="Receipt required" type="checkbox" checked={l.receiptRequired} onChange={(e) => update(l.id, { receiptRequired: e.target.checked })} />
                </div>
                <div className="wiz-cell wiz-cell--check" style={{ width: 64 }}>
                  <input aria-label="Paid directly by IHM" type="checkbox" checked={!!l.paidDirectly} onChange={(e) => update(l.id, { paidDirectly: e.target.checked })} />
                </div>
                <div className="wiz-cell" style={{ width: 110 }}>
                  <input aria-label="Employee contribution" type="number" min={0} step="0.01" value={l.employeeContribution || ''} onChange={(e) => update(l.id, { employeeContribution: Number(e.target.value) || 0 })} />
                </div>
                <div style={{ width: 40, display: 'flex', justifyContent: 'center' }}>
                  <button type="button" className="m3-iconbtn" style={{ width: 32, height: 32 }} aria-label="Remove line" onClick={() => commit(lines.filter((x) => x.id !== l.id))}>
                    <Icon name="close" size={18} />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="tbl-row t-caption" style={{ justifyContent: 'center' }}>
              No cost lines yet — use quick add or add a line below.
            </div>
          )}
        </div>
      </div>
      <div>
        <Button variant="text" size="sm" icon="add_circle" onClick={() => commit([...lines, blank()])} style={{ paddingLeft: 0 }}>
          Add cost line
        </Button>
      </div>

      <div className="m3-card m3-card--md m3-card--secondary">
        <div className="wiz-totals">
          <KV label="Total estimate" value={formatZMW(costing.total)} />
          <KV label="Paid directly by IHM (not advanced)" value={formatZMW(costing.paidDirectly)} muted />
          <KV label="Employee contribution" value={formatZMW(costing.employeeContribution)} muted />
          <KV label="Advance-eligible" value={formatZMW(costing.advanceEligibleTotal)} />
          <KV label={`Estimated advance (${pct}%)`} value={formatZMW(computeAdvance(costing.advanceEligibleTotal, pct))} total />
        </div>
        <div className="t-caption-sm mt10" style={{ color: 'inherit', opacity: 0.8 }}>The advance is released only when there is no outstanding liquidation and at least 5 working days remain before departure.</div>
      </div>
    </div>
  );
}
