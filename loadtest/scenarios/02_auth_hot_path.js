// Isolates whether requireAuth()'s per-request PocketBase authRefresh()
// round-trip (server/pocketbase.js:22-45) or Express/Node itself is the
// limiter, by ramping two matched scenarios at identical concurrency in the
// same run: the app's cheapest authenticated endpoint (/api/auth/me — pure
// requireAuth cost, no other PocketBase calls) vs. PocketBase's own health
// endpoint hit directly. If the curves move together, PocketBase is the
// limiter; if the app curve diverges while PocketBase's stays flat, the
// bottleneck is elsewhere (Node event loop, connection handling).
//
// This is an exploratory stress ramp beyond ~10 VUs, not a strict pass/fail
// gate — read the summary alongside monitor.sh's CSV, aligned to the stage
// boundaries below, and report the degradation knee rather than a fixed number.
//
// Env knobs: LOADTEST_AUTH_VUS_1/2/3 (default 5/10/20, ceiling 50 each),
//            LOADTEST_AUTH_STAGE_DURATION (default 20s)
// Run: loadtest/.bin/k6 run loadtest/scenarios/02_auth_hot_path.js
import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL, PB_URL, authHeaders, envInt } from '../config.js';
import { registerThrowawayUser } from '../lib/auth.js';
import { deleteThrowawayUser } from '../lib/teardown.js';

const CEILING = 50;
const VUS_1 = envInt('LOADTEST_AUTH_VUS_1', 5, CEILING);
const VUS_2 = envInt('LOADTEST_AUTH_VUS_2', 10, CEILING);
const VUS_3 = envInt('LOADTEST_AUTH_VUS_3', 20, CEILING);
const STAGE_DURATION = __ENV.LOADTEST_AUTH_STAGE_DURATION || '20s';

const rampStages = [
  { duration: STAGE_DURATION, target: VUS_1 },
  { duration: STAGE_DURATION, target: VUS_2 },
  { duration: STAGE_DURATION, target: VUS_3 },
  { duration: '10s', target: 0 },
];

export const options = {
  scenarios: {
    app_auth_me: {
      executor: 'ramping-vus',
      exec: 'appAuthMe',
      startVUs: 0,
      stages: rampStages,
      gracefulRampDown: '5s',
    },
    pb_direct_health: {
      executor: 'ramping-vus',
      exec: 'pbDirectHealth',
      startVUs: 0,
      stages: rampStages,
      gracefulRampDown: '5s',
    },
  },
  thresholds: {
    // Loose sanity gates only — this scenario's real output is the latency
    // curve vs. stage, read from the summary + monitor.sh CSV, not a pass/fail
    // number (see plan: "report the degradation knee, don't gate on a fixed
    // number at 20+ VUs").
    'http_req_failed{scenario:app_auth_me}': ['rate<0.05'],
    'http_req_failed{scenario:pb_direct_health}': ['rate<0.05'],
  },
};

export function setup() {
  const session = registerThrowawayUser('authhot');
  console.log(`Stage plan (${STAGE_DURATION} each): ${VUS_1} -> ${VUS_2} -> ${VUS_3} VUs, matched on both app and direct-PocketBase curves.`);
  return session;
}

export function appAuthMe(session) {
  const res = http.get(`${BASE_URL}/auth/me`, { headers: authHeaders(session.token), tags: { name: 'auth_me_ramp' } });
  check(res, { 'auth/me 200': (r) => r.status === 200 });
}

export function pbDirectHealth() {
  const res = http.get(`${PB_URL}/api/health`, { tags: { name: 'pb_direct_health_ramp' } });
  check(res, { 'pb health 200': (r) => r.status === 200 });
}

export function teardown(session) {
  deleteThrowawayUser(session);
}
