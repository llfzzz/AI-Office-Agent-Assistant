// Shared config for all k6 scenarios. Matches the same base-URL conventions
// already used by scripts/verify-ai-e2e.mjs and scripts/verify-memory-save.mjs
// (direct :8788/:8090, bypassing nginx, so results reflect app+PocketBase only).

export const BASE_URL = (__ENV.LOADTEST_BASE_URL || 'http://127.0.0.1:8788/api').replace(/\/+$/, '');
export const PB_URL = (__ENV.LOADTEST_PB_URL || 'http://127.0.0.1:8090').replace(/\/+$/, '');

export function jsonHeaders(token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

// Read an int env var with a default and an optional hard ceiling. Every
// scenario's concurrency knob goes through this — never a bare hardcoded
// number — so the ~10-25 VU safety envelope agreed for this box is easy to
// audit and impossible to silently exceed by accident.
export function envInt(name, fallback, ceiling) {
  const raw = __ENV[name];
  const value = raw === undefined || raw === '' ? fallback : parseInt(raw, 10);
  const safe = Number.isFinite(value) ? value : fallback;

  if (ceiling !== undefined && safe > ceiling) {
    console.warn(`${name}=${safe} exceeds the recommended ceiling (${ceiling}); clamping.`);
    return ceiling;
  }

  return safe;
}
