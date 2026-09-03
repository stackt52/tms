import type { Metadata } from 'next';
import { NewClaimScreen } from '@/screens/claims/NewClaimScreen';

export const metadata: Metadata = { title: 'New mileage claim' };

export default function NewClaimPage() {
  return <NewClaimScreen />;
}
