import type { Metadata } from 'next';
import { DashboardScreen } from '@/screens/dashboard/DashboardScreen';

export const metadata: Metadata = { title: 'Home' };

export default function HomePage() {
  return <DashboardScreen />;
}
