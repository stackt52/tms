import type { Metadata } from 'next';
import { BookingPageScreen } from '@/screens/fleet/BookingPageScreen';

export const metadata: Metadata = { title: 'Vehicle booking' };

export default function BookingPage() {
  return <BookingPageScreen />;
}
