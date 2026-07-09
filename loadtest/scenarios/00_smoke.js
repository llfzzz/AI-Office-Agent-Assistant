// Pre-flight gate. Must be 100% green before any other scenario runs — proves
// the target/auth/seed plumbing works before any load is applied.
// Run: loadtest/.bin/k6 run loadtest/scenarios/00_smoke.js
import http from 'k6/http';
import { check, fail } from 'k6';
import { BASE_URL } from '../config.js';
import { registerThrowawayUser, loginUser } from '../lib/auth.js';
import { deleteThrowawayUser } from '../lib/teardown.js';
import { authHeaders } from '../config.js';

export const options = {
  vus: 1,
  iterations: 1,
  thresholds: {
    http_req_failed: ['rate==0'],
    checks: ['rate==1'],
  },
};

export default function () {
  const health = http.get(`${BASE_URL}/health`, { tags: { name: 'health' } });
  const healthOk = check(health, {
    'health status 200': (r) => r.status === 200,
    'health.ok === true': (r) => r.json('ok') === true,
    'database.ok === true': (r) => r.json('database.ok') === true,
  });

  if (!healthOk) {
    fail(`smoke: /api/health not healthy (status=${health.status} body=${health.body}) — aborting before any scenario runs`);
  }

  const session = registerThrowawayUser('smoke');

  const loginRes = loginUser(session.email, session.password);
  check(loginRes, { 'login 200': (r) => r.status === 200 });

  const me = http.get(`${BASE_URL}/auth/me`, { headers: authHeaders(session.token), tags: { name: 'auth_me' } });
  check(me, { 'auth/me 200': (r) => r.status === 200 });

  const listEndpoints = ['/meetings', '/knowledge', '/office/outputs', '/office/feedback', '/ai-providers', '/ai-configs'];
  for (const path of listEndpoints) {
    const res = http.get(`${BASE_URL}${path}`, { headers: authHeaders(session.token), tags: { name: `smoke_get${path.replace(/\//g, '_')}` } });
    check(res, { [`GET ${path} is 2xx`]: (r) => r.status >= 200 && r.status < 300 });
  }

  deleteThrowawayUser(session);
}
