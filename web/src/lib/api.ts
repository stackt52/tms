'use client';
import type { ApiError } from '@tms/shared';
import { firebaseAuth } from './firebase';

export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? '').replace(/\/$/, '');

export class ApiClientError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  formData?: FormData;
  query?: Record<string, string | number | boolean | undefined | null | string[]>;
  signal?: AbortSignal;
}

export function apiUrl(path: string, query?: ApiOptions['query']): string {
  const url = `${API_BASE}/api/v1${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) v.forEach((x) => params.append(k, x));
    else params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

export async function getIdToken(): Promise<string | null> {
  const user = firebaseAuth().currentUser;
  if (!user) return null;
  return user.getIdToken();
}

export async function api<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const token = await getIdToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (opts.formData) body = opts.formData;
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  const res = await fetch(apiUrl(path, opts.query), {
    method: opts.method ?? (body ? 'POST' : 'GET'),
    headers,
    body,
    signal: opts.signal,
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const err = (json as ApiError | null)?.error;
    throw new ApiClientError(res.status, err?.code ?? 'HTTP_ERROR', err?.message ?? `Request failed (${res.status})`, err?.details);
  }
  return json as T;
}

/** Upload a file through the API (multipart). Returns the created Attachment. */
export async function uploadFile(file: File, kind?: string) {
  const fd = new FormData();
  fd.append('file', file, file.name);
  if (kind) fd.append('kind', kind);
  return api<import('@tms/shared').UploadResponse>('/files', { method: 'POST', formData: fd });
}

/** Authenticated file URL — files are streamed by the API, so pass the token via fetch and open a blob. */
export async function openFile(attachmentId: string): Promise<void> {
  const token = await getIdToken();
  const res = await fetch(apiUrl(`/files/${attachmentId}`), { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new ApiClientError(res.status, 'FILE_ERROR', 'Could not open file');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
