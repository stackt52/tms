'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { CardSkeleton, ErrorState, PillTabs } from '@/components/m3';
import { useAdminOverview } from '@/lib/queries';
import { RatesTab } from './RatesTab';
import { WorkflowsTab } from './WorkflowsTab';
import { PolicyTab } from './PolicyTab';
import { VendorsTab } from './VendorsTab';
import { UsersTab } from './UsersTab';
import { MasterDataTab } from './MasterDataTab';
import './admin.css';

export type AdminTab = 'rates' | 'workflows' | 'policy' | 'vendors' | 'users' | 'master';
const TABS: { value: AdminTab; label: string }[] = [
  { value: 'rates', label: 'Rates' },
  { value: 'workflows', label: 'Workflows' },
  { value: 'policy', label: 'Policy rules' },
  { value: 'vendors', label: 'Vendors' },
  { value: 'users', label: 'Users & roles' },
  { value: 'master', label: 'Master data' },
];

export function AdminScreen() {
  const sp = useSearchParams();
  const router = useRouter();
  const raw = sp.get('tab');
  const tab: AdminTab = TABS.some((t) => t.value === raw) ? (raw as AdminTab) : 'rates';
  const q = useAdminOverview();

  return (
    <div className="page">
      <div className="t-title">Policy administration</div>
      <div className="mt12">
        <PillTabs<AdminTab> options={TABS} value={tab} onChange={(t) => router.replace(`/admin?tab=${t}`, { scroll: false })} />
      </div>
      <div style={{ marginTop: 18 }}>
        {q.isLoading ? (
          <div className="split admin-split">
            <div className="main">
              <CardSkeleton lines={6} h={320} />
            </div>
            <div className="side">
              <CardSkeleton lines={3} />
              <CardSkeleton lines={4} />
            </div>
          </div>
        ) : q.isError || !q.data ? (
          <ErrorState error={q.error} retry={() => q.refetch()} />
        ) : tab === 'rates' ? (
          <RatesTab data={q.data} />
        ) : tab === 'workflows' ? (
          <WorkflowsTab data={q.data} />
        ) : tab === 'policy' ? (
          <PolicyTab data={q.data} />
        ) : tab === 'vendors' ? (
          <VendorsTab data={q.data} />
        ) : tab === 'users' ? (
          <UsersTab data={q.data} />
        ) : (
          <MasterDataTab data={q.data} />
        )}
      </div>
    </div>
  );
}
