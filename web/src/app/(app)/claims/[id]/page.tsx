import type { Metadata } from 'next';
import { MileageClaimScreen } from '@/screens/claims/MileageClaimScreen';

export const metadata: Metadata = { title: 'Mileage claim' };

export default function ClaimPage() {
  return <MileageClaimScreen />;
}
