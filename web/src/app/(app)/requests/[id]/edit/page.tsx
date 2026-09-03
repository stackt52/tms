import type { Metadata } from 'next';
import { Suspense } from 'react';
import { RequestWizardScreen } from '@/screens/requests/wizard/RequestWizardScreen';

export const metadata: Metadata = { title: 'Travel request wizard' };

export default function RequestEditPage() {
  return (
    <Suspense fallback={null}>
      <RequestWizardScreen />
    </Suspense>
  );
}
