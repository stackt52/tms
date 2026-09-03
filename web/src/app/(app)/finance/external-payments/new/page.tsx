import type { Metadata } from 'next';
import { NewExternalPaymentScreen } from '@/screens/finance/NewExternalPaymentScreen';

export const metadata: Metadata = { title: 'New external payment request' };

export default function NewExternalPaymentPage() {
  return <NewExternalPaymentScreen />;
}
