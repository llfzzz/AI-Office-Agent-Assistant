// Throwaway-account helpers for k6 scenarios, mirroring the register/use/delete
// convention already established by scripts/verify-ai-e2e.mjs and
// scripts/verify-memory-save.mjs. k6 runs on goja, not Node — no node:crypto
// here, so the random suffix comes from Date.now()/Math.random() instead.
import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL, jsonHeaders } from '../config.js';

export function randomSuffix() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// Registers one throwaway user and returns its session. Every PocketBase
// collection with a `user` relation cascade-deletes on user removal
// (pb_migrations/*), so deleteThrowawayUser() in teardown.js is complete
// cleanup regardless of what the scenario creates under this account.
export function registerThrowawayUser(scenarioTag, suffixOverride) {
  const suffix = suffixOverride || randomSuffix();
  const email = `loadtest-${scenarioTag}-${suffix}@example.com`;
  const password = `Loadtest-${suffix}-Aa1!`;

  const res = http.post(
    `${BASE_URL}/auth/register`,
    JSON.stringify({ email, password, name: `Loadtest ${scenarioTag}` }),
    { headers: jsonHeaders(), tags: { name: 'auth_register' } },
  );

  const ok = check(res, {
    'register succeeded (201)': (r) => r.status === 201,
  });

  if (!ok) {
    throw new Error(`registerThrowawayUser(${scenarioTag}) failed: ${res.status} ${res.body}`);
  }

  const body = res.json();
  return {
    email,
    password,
    token: body.token,
    userId: body.user && body.user.id,
  };
}

export function loginUser(email, password) {
  const res = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ email, password }),
    { headers: jsonHeaders(), tags: { name: 'auth_login' } },
  );

  return res;
}
