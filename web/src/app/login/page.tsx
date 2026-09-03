import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoginScreen } from '@/screens/auth/LoginScreen';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginScreen />
    </Suspense>
  );
}
