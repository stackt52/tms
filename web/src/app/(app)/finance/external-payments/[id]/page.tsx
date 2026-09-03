import type { Metadata } from 'next';
import { ExternalPaymentScreen } from '@/screens/finance/ExternalPaymentScreen';

export const metadata: Metadata = { title: 'External-party payment' };

export default function ExternalPaymentPage() {
  return <ExternalPaymentScreen />;
}
