import type { Metadata } from 'next';
import { FinanceLiquidationsScreen } from '@/screens/finance/FinanceLiquidationsScreen';

export const metadata: Metadata = { title: 'Liquidations · Finance' };

export default function FinanceLiquidationsPage() {
  return <FinanceLiquidationsScreen />;
}
