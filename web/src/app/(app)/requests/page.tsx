import type { Metadata } from 'next';
import { RequestsListScreen } from '@/screens/requests/RequestsListScreen';

export const metadata: Metadata = { title: 'My travel requests' };

export default function RequestsPage() {
  return <RequestsListScreen />;
}
