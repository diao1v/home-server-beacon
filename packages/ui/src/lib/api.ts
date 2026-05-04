import { apiUrl } from './env';

export async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), init);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${path}`);
  }
  return (await res.json()) as T;
}
