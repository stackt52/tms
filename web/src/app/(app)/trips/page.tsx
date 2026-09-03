import type { Metadata } from 'next';
import { TripsListScreen } from '@/screens/trips/TripsListScreen';

export const metadata: Metadata = { title: 'My trips' };

export default function TripsPage() {
  return <TripsListScreen />;
}
