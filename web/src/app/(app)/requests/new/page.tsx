import type { Metadata } from 'next';
import { NewRequestScreen } from '@/screens/requests/NewRequestScreen';

export const metadata: Metadata = { title: 'New travel request' };

export default function NewRequestPage() {
  return <NewRequestScreen />;
}
