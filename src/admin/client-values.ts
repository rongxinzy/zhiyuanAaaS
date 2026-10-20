import { AdminRequestError } from './client-auth.js';

export function segment(value: string): string {
  return encodeURIComponent(value);
}

export function identityQuery(values: { readonly [key: string]: string | number | undefined }): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  return search.toString();
}

export function problemFromResponse(status: number, data: unknown): Error {
  if (isRecord(data) && typeof data.code === 'string') {
    const detail = typeof data.detail === 'string' ? data.detail : null;
    return new AdminRequestError(status, data.code, detail);
  }
  return new AdminRequestError(status, null, null);
}

export function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

export function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string' && item.length > 0);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function arrayFrom(value: unknown, key: string): unknown[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  const items = (value as Record<string, unknown>)[key];
  return Array.isArray(items) ? items : [];
}

export function valueString(value: unknown, key: string): string | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === 'string' && candidate ? candidate : null;
}
