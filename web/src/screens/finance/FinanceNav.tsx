'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS: { href: string; label: string; match: (p: string) => boolean }[] = [
  { href: '/finance', label: 'Advances', match: (p) => p === '/finance' },
  { href: '/finance/liquidations', label: 'Liquidations', match: (p) => p.startsWith('/finance/liquidations') },
  { href: '/finance/external-payments', label: 'External payments', match: (p) => p.startsWith('/finance/external-payments') },
];

/** Pill sub-navigation shared by the finance screens (link-based so each tab is a real route). */
export function FinanceNav() {
  const pathname = usePathname();
  return (
    <nav className="m3-pilltabs fin-nav" aria-label="Finance sections">
      {TABS.map((t) => {
        const active = t.match(pathname);
        return (
          <Link key={t.href} href={t.href} className={`m3-pilltabs__item ${active ? 'm3-pilltabs__item--active' : ''}`} aria-current={active ? 'page' : undefined}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
