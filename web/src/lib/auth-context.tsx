'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signInWithPopup, signOut, type User } from 'firebase/auth';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { MeResponse } from '@tms/shared';
import { firebaseAuth, googleProvider } from './firebase';
import { api } from './api';

interface AuthState {
  firebaseUser: User | null;
  /** true until Firebase has reported the initial auth state */
  initialising: boolean;
  me: MeResponse | null;
  meLoading: boolean;
  meError: Error | null;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [initialising, setInitialising] = useState(true);
  const qc = useQueryClient();

  useEffect(() => {
    const unsub = onAuthStateChanged(firebaseAuth(), (u) => {
      setFirebaseUser(u);
      setInitialising(false);
    });
    return unsub;
  }, []);

  const meQuery = useQuery({
    queryKey: ['me', firebaseUser?.uid ?? null],
    queryFn: () => api<MeResponse>('/me'),
    enabled: !!firebaseUser,
    staleTime: 60_000,
  });

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(firebaseAuth(), email, password);
  }, []);
  const signInWithGoogle = useCallback(async () => {
    await signInWithPopup(firebaseAuth(), googleProvider);
  }, []);
  const logout = useCallback(async () => {
    await signOut(firebaseAuth());
    qc.clear();
  }, [qc]);
  const refreshMe = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ['me'] });
  }, [qc]);

  const value = useMemo<AuthState>(
    () => ({
      firebaseUser,
      initialising,
      me: meQuery.data ?? null,
      meLoading: meQuery.isLoading,
      meError: (meQuery.error as Error | null) ?? null,
      signInWithPassword,
      signInWithGoogle,
      logout,
      refreshMe,
    }),
    [firebaseUser, initialising, meQuery.data, meQuery.isLoading, meQuery.error, signInWithPassword, signInWithGoogle, logout, refreshMe],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

/** Convenience: the signed-in profile (throws if used before auth resolved — use inside the app shell only). */
export function useMe(): MeResponse {
  const { me } = useAuth();
  if (!me) throw new Error('useMe used before profile loaded');
  return me;
}
