import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AdminScreen } from '@/screens/admin/AdminScreen';

export const metadata: Metadata = { title: 'Admin' };

export default function AdminPage() {
  return (
    <Suspense fallback={null}>
      <AdminScreen />
    </Suspense>
  );
}
