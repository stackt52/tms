import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ApprovalsScreen } from '@/screens/approvals/ApprovalsScreen';

export const metadata: Metadata = { title: 'Review request' };

/** Deep link to one request in the approval queue — the screen preselects the [id] segment. */
export default function ApprovalDetailPage() {
  return (
    <Suspense fallback={null}>
      <ApprovalsScreen />
    </Suspense>
  );
}
