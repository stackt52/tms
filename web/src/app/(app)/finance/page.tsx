import type { Metadata } from 'next';
import { AdvancesScreen } from '@/screens/finance/AdvancesScreen';

export const metadata: Metadata = { title: 'Advance processing' };

export default function FinancePage() {
  return <AdvancesScreen />;
}
