import type { Metadata } from 'next';
import { Suspense } from 'react';
import { FleetScreen } from '@/screens/fleet/FleetScreen';

export const metadata: Metadata = { title: 'Fleet' };

export default function FleetPage() {
  return (
    <Suspense fallback={null}>
      <FleetScreen />
    </Suspense>
  );
}
