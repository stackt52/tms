import { formatRef, type RefPrefix } from '@tms/shared';
import { db, COL } from './firebase';

/** Transactionally allocate the next sequence number for a prefix + year → e.g. TRV-2026-0424. */
export async function nextRef(prefix: RefPrefix, year = new Date().getUTCFullYear()): Promise<{ id: string; seq: number; year: number }> {
  const ref = db.collection(COL.counters).doc(`${prefix}-${year}`);
  const seq = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const next = ((snap.data()?.value as number | undefined) ?? 0) + 1;
    tx.set(ref, { value: next, prefix, year }, { merge: true });
    return next;
  });
  return { id: formatRef(prefix, year, seq), seq, year };
}

export function shortId(): string {
  return Math.random().toString(36).slice(2, 10);
}
