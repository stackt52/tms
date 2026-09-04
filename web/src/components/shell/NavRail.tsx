'use client';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/m3';
import { useAuth } from '@/lib/auth-context';
import { AccountButton, NotificationsButton } from './TopBar';

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  match: (p: string) => boolean;
  show: boolean;
  badge?: number;
}

export function useNavItems(): { primary: NavItem[]; admin: NavItem | null; mobile: NavItem[] } {
  const { me } = useAuth();
  const caps = me?.capabilities;
  const primary: NavItem[] = [
    { href: '/', label: 'Home', icon: 'home', match: (p) => p === '/', show: true },
    { href: '/trips', label: 'Trips', icon: 'luggage', match: (p) => p.startsWith('/trips') || p.startsWith('/requests') || p.startsWith('/liquidations'), show: true },
    { href: '/approvals', label: 'Approvals', icon: 'fact_check', match: (p) => p.startsWith('/approvals'), show: true, badge: undefined },
    { href: '/fleet', label: 'Vehicles', icon: 'directions_car', match: (p) => p.startsWith('/fleet'), show: true },
    { href: '/finance', label: 'Finance', icon: 'payments', match: (p) => p.startsWith('/finance'), show: !!caps?.canSeeFinance },
  ];
  const admin: NavItem | null = caps?.canAdmin ? { href: '/admin', label: 'Admin', icon: 'settings', match: (p) => p.startsWith('/admin'), show: true } : null;
  const mobile: NavItem[] = [
    primary[0]!,
    primary[1]!,
    primary[2]!,
    { href: '/claims', label: 'Claims', icon: 'receipt_long', match: (p) => p.startsWith('/claims'), show: true },
  ];
  return { primary, admin, mobile };
}

export function NavRail() {
  const pathname = usePathname();
  const { primary, admin } = useNavItems();
  const render = (it: NavItem, bottom = false) => {
    const active = it.match(pathname);
    return (
      <Link key={it.href} href={it.href} className={`rail__item ${active ? 'rail__item--active' : ''} ${bottom ? 'rail__item--bottom' : ''}`} aria-current={active ? 'page' : undefined}>
        <span className="rail__pill">
          <Icon name={it.icon} filled={active} size={24} />
        </span>
        <span>{it.label}</span>
        {it.badge ? <span className="rail__badge">{it.badge}</span> : null}
      </Link>
    );
  };
  return (
    <nav className="rail" aria-label="Primary">
      <Link href="/" className="rail__logo" aria-label="IHM TMS home">
        <Image src="/logo.svg" alt="" width={48} height={48} priority />
      </Link>
      {primary.filter((i) => i.show).map((i) => render(i))}
      <div className="rail__spacer" />
      {admin ? render(admin, true) : null}
      <div className="rail__account">
        <NotificationsButton />
        <AccountButton size="sm" />
      </div>
    </nav>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const { mobile } = useNavItems();
  return (
    <nav className="bottomnav" aria-label="Primary">
      {mobile.map((it) => {
        const active = it.match(pathname);
        return (
          <Link key={it.href} href={it.href} className={`bottomnav__item ${active ? 'bottomnav__item--active' : ''}`} aria-current={active ? 'page' : undefined}>
            <Icon name={it.icon} filled={active} />
            <span>{it.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
