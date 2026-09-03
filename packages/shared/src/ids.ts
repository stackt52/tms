export type RefPrefix = 'TRV' | 'VEH' | 'MIL' | 'EXT' | 'LIQ' | 'PAY' | 'SUP' | 'RNT' | 'MTG' | 'EVT';

/** TRV-2026-0412 */
export function formatRef(prefix: RefPrefix, year: number, seq: number): string {
  return `${prefix}-${year}-${String(seq).padStart(4, '0')}`;
}

/** TRV-2026-0412 -> TRV-0412 (used in dense lists and chips) */
export function shortRef(ref: string): string {
  const m = /^([A-Z]{3})-(\d{4})-(\d{4,})$/.exec(ref);
  return m ? `${m[1]}-${m[3]}` : ref;
}

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}
