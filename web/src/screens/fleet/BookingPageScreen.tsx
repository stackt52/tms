'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card, CardSkeleton, ErrorState, Icon } from '@/components/m3';
import { useVehicleBooking } from '@/lib/queries';
import { BookingSheet } from './BookingSheet';
import './fleet.css';

/** /fleet/bookings/[id] — the booking sheet full-page. */
export function BookingPageScreen() {
  const { id } = useParams<{ id: string }>();
  const q = useVehicleBooking(id);
  return (
    <div className="page">
      <Link href="/fleet" className="row g4 t-caption" style={{ marginBottom: 10 }}>
        <Icon name="arrow_back" size={16} /> Fleet calendar
      </Link>
      <div style={{ maxWidth: 560 }}>
        {q.isLoading ? (
          <CardSkeleton lines={5} h={280} />
        ) : q.isError || !q.data ? (
          <Card>
            <ErrorState error={q.error} retry={() => q.refetch()} />
          </Card>
        ) : (
          <Card>
            <BookingSheet key={q.data.id} booking={q.data} />
          </Card>
        )}
      </div>
    </div>
  );
}
