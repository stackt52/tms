import type { Metadata } from 'next';
import { LiquidationScreen } from '@/screens/liquidations/LiquidationScreen';

export const metadata: Metadata = { title: 'Liquidation' };

export default function LiquidationPage() {
  return <LiquidationScreen />;
}
