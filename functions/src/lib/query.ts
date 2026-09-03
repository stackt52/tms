import type { Request } from 'express';
import type { DocumentSnapshot, Query, QuerySnapshot } from 'firebase-admin/firestore';
import type { Paged } from '@tms/shared';
import { db } from './firebase';
import { notFound } from './errors';
import { qs } from './http';

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;

export function parseLimit(req: Request, fallback = DEFAULT_LIMIT): number {
  const raw = Number(qs(req, 'limit'));
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.min(Math.floor(raw), MAX_LIMIT);
}

export function docsOf<T>(snap: QuerySnapshot): T[] {
  return snap.docs.map((d) => d.data() as T);
}

export async function runQuery<T>(q: Query, limit = DEFAULT_LIMIT): Promise<T[]> {
  const snap = await q.limit(limit).get();
  return docsOf<T>(snap);
}

export async function getDoc<T>(col: string, id: string): Promise<T | null> {
  const snap = await db.collection(col).doc(id).get();
  return snap.exists ? (snap.data() as T) : null;
}

export async function mustGet<T>(col: string, id: string, what = 'Resource'): Promise<T> {
  const doc = await getDoc<T>(col, id);
  if (!doc) throw notFound(what);
  return doc;
}

/** Batched getAll (Firestore caps a single getAll at ~500 refs; keep well below). */
export async function getMany<T>(col: string, ids: readonly string[]): Promise<Map<string, T>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const out = new Map<string, T>();
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    const snaps: DocumentSnapshot[] = await db.getAll(...chunk.map((id) => db.collection(col).doc(id)));
    for (const s of snaps) if (s.exists) out.set(s.id, s.data() as T);
  }
  return out;
}

export async function getAllDocs<T>(col: string, limit = 500): Promise<T[]> {
  return runQuery<T>(db.collection(col), limit);
}

export function paged<T>(items: T[], limit?: number): Paged<T> {
  return { items, nextCursor: limit && items.length >= limit ? 'more' : null, total: items.length };
}

/** Firestore `in` accepts at most 30 values — chunk larger lists. */
export async function queryIn<T>(col: string, field: string, values: readonly string[], limit = DEFAULT_LIMIT, orderBy?: { field: string; dir: 'asc' | 'desc' }): Promise<T[]> {
  const out: T[] = [];
  const unique = [...new Set(values)];
  for (let i = 0; i < unique.length; i += 30) {
    let q: Query = db.collection(col).where(field, 'in', unique.slice(i, i + 30));
    if (orderBy) q = q.orderBy(orderBy.field, orderBy.dir);
    out.push(...(await runQuery<T>(q, limit)));
  }
  return out;
}

export function parseStatusList(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined;
  const list = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length ? list : undefined;
}

export const byDesc =
  <T>(pick: (t: T) => string | number | undefined | null) =>
  (a: T, b: T): number => {
    const x = pick(a) ?? '';
    const y = pick(b) ?? '';
    return x < y ? 1 : x > y ? -1 : 0;
  };
export const byAsc =
  <T>(pick: (t: T) => string | number | undefined | null) =>
  (a: T, b: T): number => {
    const x = pick(a) ?? '';
    const y = pick(b) ?? '';
    return x < y ? -1 : x > y ? 1 : 0;
  };
