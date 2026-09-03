'use client';
import { useMemo, useState } from 'react';
import { addDays, fmtDate, isoDate, type AdminOverview, type Vendor } from '@tms/shared';
import { Button, Card, Chip, Dialog, EmptyState, Icon, SelectField, Switch, TextField, humanize, useToast } from '@/components/m3';
import { useUpsertVendor } from '@/lib/queries';

const CATEGORIES: Vendor['category'][] = ['AIRLINE', 'HOTEL', 'CAR_RENTAL', 'TRAVEL_AGENT', 'SHUTTLE', 'CATERING', 'VENUE', 'OTHER'];

export function VendorsTab({ data }: { data: AdminOverview }) {
  const [editing, setEditing] = useState<Vendor | 'new' | null>(null);
  const vendors = useMemo(() => [...data.vendors].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name)), [data.vendors]);
  const soon = isoDate(addDays(new Date(), 90));
  const expiring = vendors.filter((v) => v.active && v.contractValidTo && v.contractValidTo <= soon);
  return (
    <div className="split admin-split">
      <div className="main">
        <Card className="admin-card">
          <div className="admin-head">
            <div className="admin-title">Approved vendors</div>
            <div className="spacer" />
            <Button variant="tonal" size="sm" icon="add" onClick={() => setEditing('new')}>
              Add vendor
            </Button>
          </div>
          <div className="tbl-compact tbl-scroll">
            <div>
              <div className="tbl-head">
                <span style={{ flex: 2 }}>Vendor</span>
                <span style={{ flex: 1.2 }}>Category</span>
                <span style={{ flex: 1.5 }}>Locations</span>
                <span style={{ flex: 1.2 }}>Contract valid to</span>
                <span style={{ flex: 0.9 }}>Status</span>
                <span style={{ width: 30 }} />
              </div>
              {vendors.length === 0 ? <EmptyState icon="storefront" title="No vendors yet" body="Add airlines, hotels and rental companies with negotiated rates." /> : null}
              {vendors.map((v) => (
                <div key={v.id} className="tbl-row">
                  <span style={{ flex: 2, minWidth: 0 }}>
                    <div style={{ fontWeight: 650 }} className="truncate">
                      {v.name}
                    </div>
                    {v.approvedRate ? <div className="t-caption-sm truncate">{v.approvedRate}</div> : null}
                  </span>
                  <span style={{ flex: 1.2 }}>{humanize(v.category)}</span>
                  <span style={{ flex: 1.5 }} className="truncate">
                    {v.locations?.length ? v.locations.join(', ') : '—'}
                  </span>
                  <span style={{ flex: 1.2 }} className={v.contractValidTo && v.contractValidTo <= soon ? 't-error t-semibold' : ''}>
                    {v.contractValidTo ? fmtDate(v.contractValidTo) : '—'}
                  </span>
                  <span style={{ flex: 0.9 }}>
                    <Chip tone={v.active ? 'approved' : 'neutral'} size="xs">
                      {v.active ? 'Active' : 'Inactive'}
                    </Chip>
                  </span>
                  <button type="button" className="admin-edit" aria-label={`Edit ${v.name}`} onClick={() => setEditing(v)}>
                    <Icon name="edit" size={18} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>
      <div className="side">
        <Card className="admin-card">
          <div className="admin-title admin-title--sm">Contracts expiring within 90 days</div>
          {expiring.length === 0 ? (
            <div className="t-caption">All active vendor contracts are valid beyond 90 days.</div>
          ) : (
            <div className="col g8" style={{ fontSize: 12.5 }}>
              {expiring.map((v) => (
                <div key={v.id} className="row g8">
                  <span className="grow truncate">
                    <b>{v.name}</b> · {humanize(v.category)}
                  </span>
                  <Chip tone="pending" size="xs">
                    {fmtDate(v.contractValidTo!)}
                  </Chip>
                </div>
              ))}
            </div>
          )}
          <div className="t-caption mt12">Rentals are restricted to approved vendors when the policy toggle is on; inactive vendors are hidden from the request wizard.</div>
        </Card>
      </div>
      {editing ? <VendorDialog vendor={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function VendorDialog({ vendor, onClose }: { vendor: Vendor | null; onClose: () => void }) {
  const toast = useToast();
  const upsert = useUpsertVendor();
  const [f, setF] = useState({
    name: vendor?.name ?? '',
    category: vendor?.category ?? ('HOTEL' as Vendor['category']),
    contact: vendor?.contact ?? '',
    locations: vendor?.locations?.join(', ') ?? '',
    contractValidTo: vendor?.contractValidTo ?? '',
    approvedRate: vendor?.approvedRate ?? '',
    active: vendor?.active ?? true,
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  const save = () =>
    upsert.mutate(
      {
        id: vendor?.id,
        name: f.name.trim(),
        category: f.category,
        contact: f.contact.trim() || undefined,
        locations: f.locations
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        contractValidTo: f.contractValidTo || undefined,
        approvedRate: f.approvedRate.trim() || undefined,
        active: f.active,
      },
      {
        onSuccess: () => {
          toast.success(vendor ? 'Vendor updated' : 'Vendor added');
          onClose();
        },
        onError: (e) => toast.error(e, 'Could not save vendor'),
      },
    );
  return (
    <Dialog
      open
      onClose={onClose}
      title={vendor ? `Edit ${vendor.name}` : 'Add vendor'}
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={upsert.isPending} disabled={!f.name.trim()} disabledLabel="Save — add a name" onClick={save}>
            Save vendor
          </Button>
        </>
      }
    >
      <div className="dlg-grid mt12">
        <TextField label="Name" className="dlg-wide" value={f.name} onChange={(e) => set('name', e.target.value)} />
        <SelectField label="Category" options={CATEGORIES.map((c) => ({ value: c, label: humanize(c) }))} value={f.category} onChange={(e) => set('category', e.target.value as Vendor['category'])} />
        <TextField label="Contact" placeholder="email / phone" value={f.contact} onChange={(e) => set('contact', e.target.value)} />
        <TextField label="Locations" className="dlg-wide" placeholder="Lusaka, Ndola, Kitwe" hint="Comma-separated" value={f.locations} onChange={(e) => set('locations', e.target.value)} />
        <TextField label="Contract valid to" type="date" value={f.contractValidTo} onChange={(e) => set('contractValidTo', e.target.value)} />
        <TextField label="Approved rate" placeholder="e.g. ZMW 1,150 / night B&B" value={f.approvedRate} onChange={(e) => set('approvedRate', e.target.value)} />
        <div className="pol-row dlg-wide" style={{ padding: 0 }}>
          <span>Active — available for arrangements and rentals</span>
          <Switch checked={f.active} onChange={(v) => set('active', v)} label="Active" />
        </div>
      </div>
    </Dialog>
  );
}
