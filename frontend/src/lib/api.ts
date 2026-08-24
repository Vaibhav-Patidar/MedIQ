/* ============================================================
   MedIQ API Client
   Typed fetch wrapper with JWT auth, error envelope handling.
   ============================================================ */
import type { ErrorEnvelope } from '../types';
import { useAuthStore } from '../stores/auth';

let RAW_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';
// Normalize: ensure it ends with /api
export const BASE_URL = RAW_BASE.replace(/\/+$/, '').endsWith('/api')
  ? RAW_BASE.replace(/\/+$/, '')
  : `${RAW_BASE.replace(/\/+$/, '')}/api`;

export class ApiError extends Error {
  code: string;
  status: number;
  details: Record<string, unknown> | unknown[];
  hoursAvailable?: number;
  hoursRequired?: number;

  constructor(envelope: ErrorEnvelope, status: number) {
    super(envelope.message);
    this.name = 'ApiError';
    this.code = envelope.error;
    this.status = status;
    this.details = envelope.details;
    this.hoursAvailable = envelope.hours_available;
    this.hoursRequired = envelope.hours_required;
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options?: { noAuth?: boolean }
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (!options?.noAuth) {
    const token = useAuthStore.getState().token;
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  // 204 No Content
  if (res.status === 204) {
    return undefined as T;
  }

  const data = await res.json();

  if (!res.ok) {
    // Handle 401 — clear token and redirect
    if (res.status === 401) {
      useAuthStore.getState().clearToken();
      if (typeof window !== 'undefined' && window.location.pathname !== '/') {
        window.location.href = '/';
      }
    }

    // If it looks like an error envelope, throw ApiError
    if (data && typeof data === 'object' && 'error' in data) {
      throw new ApiError(data as ErrorEnvelope, res.status);
    }

    throw new ApiError(
      { error: 'unknown', message: 'An unexpected error occurred.', details: {} },
      res.status
    );
  }

  return data as T;
}

export function get<T>(path: string, noAuth?: boolean): Promise<T> {
  return request<T>('GET', path, undefined, { noAuth });
}

export function post<T>(path: string, body?: unknown, noAuth?: boolean): Promise<T> {
  return request<T>('POST', path, body, { noAuth });
}

export function put<T>(path: string, body?: unknown): Promise<T> {
  return request<T>('PUT', path, body);
}

export function del<T>(path: string): Promise<T> {
  return request<T>('DELETE', path);
}
