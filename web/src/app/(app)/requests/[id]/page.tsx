import type { Metadata } from 'next';
import { RequestDetailScreen } from '@/screens/requests/RequestDetailScreen';

export const metadata: Metadata = { title: 'Travel request' };

export default function RequestDetailPage() {
  return <RequestDetailScreen />;
}
