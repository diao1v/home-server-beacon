/**
 * Resolves API and WS URLs.
 *
 * - When VITE_API_BASE_URL is empty (default: Option A — UI served by monitor),
 *   we use same-origin relative URLs and derive WS from window.location.
 * - When set (Option B — UI hosted separately, e.g. Cloudflare Pages),
 *   we use the configured base for both HTTP and WS.
 */
const RAW_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').trim();
const API_BASE = RAW_BASE.replace(/\/$/, '');

export function apiUrl(path: string): string {
  return API_BASE + path;
}

export function wsUrl(): string {
  if (API_BASE) {
    return `${API_BASE.replace(/^http/, 'ws')}/ws`;
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws`;
}
