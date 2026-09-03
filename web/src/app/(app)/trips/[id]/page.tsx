import type { Metadata } from 'next';
import { Suspense } from 'react';
import { TripWorkspaceScreen } from '@/screens/trips/TripWorkspaceScreen';

export const metadata: Metadata = { title: 'Trip workspace' };

export default function TripPage() {
  return (
    <Suspense fallback={null}>
      <TripWorkspaceScreen />
    </Suspense>
  );
}
