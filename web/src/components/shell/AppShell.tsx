'use client';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { Button, Icon } from '@/components/m3';
import { useAuth } from '@/lib/auth-context';
import { NavRail, BottomNav } from './NavRail';
import './shell.css';

export function AppShell({ children }: { children: ReactNode }) {
  const { firebaseUser, initialising, me, meLoading, meError, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!initialising && !firebaseUser) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [initialising, firebaseUser, router, pathname]);

  if (initialising || (firebaseUser && meLoading)) {
    return (
      <div className="gate">
        <div className="col g12" style={{ alignItems: 'center' }}>
          <div className="rail__logo" style={{ margin: 0 }}>
            IHM
          </div>
          <div className="t-caption">Loading your workspace…</div>
        </div>
      </div>
    );
  }
  if (!firebaseUser) return null;
  if (meError || !me) {
    return (
      <div className="gate">
        <div className="m3-card" style={{ maxWidth: 440 }}>
          <Icon name="cloud_off" size={32} color="var(--md-error)" />
          <div className="t-headline mt8">Can’t reach the TMS API</div>
          <div className="t-body t-muted mt6">{meError?.message ?? 'Unknown error'}. Check that the API is running and NEXT_PUBLIC_API_BASE_URL points at it.</div>
          <div className="row g8 mt16">
            <Button variant="tonal" icon="refresh" onClick={() => window.location.reload()}>
              Retry
            </Button>
            <Button variant="text" onClick={() => logout().then(() => router.replace('/login'))}>
              Sign out
            </Button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="shell">
      <NavRail />
      <main className="shell__main">{children}</main>
      <BottomNav />
    </div>
  );
}

/** Mobile FAB slot — pages opt in (dashboard). */
export function Fab({ href, icon = 'add', label }: { href: string; icon?: string; label: string }) {
  return (
    <div className="fab-slot">
      <Link href={href} className="m3-fab" aria-label={label}>
        <Icon name={icon} size={26} />
      </Link>
    </div>
  );
}
