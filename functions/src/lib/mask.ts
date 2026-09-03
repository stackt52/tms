import type { PayoutMethod, UserProfile } from '@tms/shared';

const MASK = '···';

/**
 * Keep only the last `keep` digits of an account / phone number. Input that is already masked
 * (≤ keep digits with a mask prefix) is returned unchanged, so re-saving a record is idempotent.
 */
export function maskDigits(raw: string | undefined | null, keep: number): string {
  const s = (raw ?? '').trim();
  if (!s) return '';
  const digits = s.replace(/\D/g, '');
  if (digits.length <= keep && /^[^\d]*\d{0,4}$/.test(s)) return s.startsWith(MASK) ? s : `${MASK}${digits}`;
  return `${MASK}${digits.slice(-keep)}`;
}

/** Mobile money keeps the last 3 digits, bank accounts the last 4 (SRS §24 — never store raw numbers in masked fields). */
export function maskPayout(p: PayoutMethod | undefined): PayoutMethod | undefined {
  if (!p) return p;
  if (p.type === 'MOBILE_MONEY') return { ...p, numberMasked: maskDigits(p.numberMasked, 3) };
  return { ...p, accountMasked: maskDigits(p.accountMasked, 4) };
}

export function maskBank(b: UserProfile['bank'] | null | undefined): UserProfile['bank'] | undefined {
  return b ? { ...b, accountMasked: maskDigits(b.accountMasked, 4) } : undefined;
}

export function maskMobileMoney(m: UserProfile['mobileMoney'] | null | undefined): UserProfile['mobileMoney'] | undefined {
  return m ? { ...m, numberMasked: maskDigits(m.numberMasked, 3) } : undefined;
}
