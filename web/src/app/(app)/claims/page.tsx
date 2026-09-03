import type { Metadata } from 'next';
import { ClaimsListScreen } from '@/screens/claims/ClaimsListScreen';

export const metadata: Metadata = { title: 'Mileage claims' };

export default function ClaimsPage() {
  return <ClaimsListScreen />;
}
