import type { Metadata } from 'next';
import { LiquidationsListScreen } from '@/screens/liquidations/LiquidationsListScreen';

export const metadata: Metadata = { title: 'Liquidations' };

export default function LiquidationsPage() {
  return <LiquidationsListScreen />;
}
