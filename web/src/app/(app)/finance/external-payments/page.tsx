import type { Metadata } from 'next';
import { ExternalPaymentsListScreen } from '@/screens/finance/ExternalPaymentsListScreen';

export const metadata: Metadata = { title: 'External-party payments' };

export default function ExternalPaymentsPage() {
  return <ExternalPaymentsListScreen />;
}
