import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ApprovalsScreen } from '@/screens/approvals/ApprovalsScreen';

export const metadata: Metadata = { title: 'Approvals' };

export default function ApprovalsPage() {
  return (
    <Suspense fallback={null}>
      <ApprovalsScreen />
    </Suspense>
  );
}
