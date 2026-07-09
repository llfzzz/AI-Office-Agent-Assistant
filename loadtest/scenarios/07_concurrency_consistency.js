// Targets the non-transactional default-flag sequence in
// server/aiConfigStore.js: setDefaultAiConfig (lines 260-266) does an update()
// then a separate unsetOtherDefaults() (getFullList + per-record update loop,
// lines 144-151) — independent PocketBase calls, no unique constraint at the
// data layer backstopping "exactly one default per user". Also verifies
// cross-user isolation (PocketBase collection rules) holds under concurrency,
// not just in the single-shot cases already verified in AGENTS.md.
//
// This uses http.batch() to fire genuinely concurrent requests from a single
// VU/iteration, then checks state after each burst — a k6 VU/iteration
// executor can't guarantee tight fire-together timing across VUs, but
// http.batch() fires an array of requests as real concurrent connections and
// waits for all of them, which is exactly what a race test needs.
//
// Env knobs: LOADTEST_RACE_CONCURRENCY (default 10, ceiling 20),
//            LOADTEST_RACE_BURSTS (default 20, ceiling 50)
// Run: loadtest/.bin/k6 run loadtest/scenarios/07_concurrency_consistency.js
import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL, authHeaders, jsonHeaders, envInt } from '../config.js';
import { registerThrowawayUser } from '../lib/auth.js';
import { deleteThrowawayUser } from '../lib/teardown.js';

const CONCURRENCY = envInt('LOADTEST_RACE_CONCURRENCY', 10, 20);
const BURSTS = envInt('LOADTEST_RACE_BURSTS', 20, 50);

export const options = {
  vus: 1,
  iterations: 1,
  thresholds: {
    checks: ['rate==1'],
  },
};

function createConfig(token, label) {
  const res = http.post(
    `${BASE_URL}/ai-configs`,
    JSON.stringify({ label, provider: 'deepseek', model: 'deepseek-v4-flash', api_key: `sk-loadtest-${label}` }),
    { headers: jsonHeaders(token), tags: { name: 'race_create_config' } },
  );
  return res.status === 201 ? res.json('config.id') : null;
}

export function setup() {
  const session = registerThrowawayUser('race');
  const other = registerThrowawayUser('race-other');

  const configIds = [0, 1, 2]
    .map((i) => createConfig(session.token, `race-config-${i}`))
    .filter(Boolean);

  return { session, other, configIds };
}

export default function (data) {
  const { session, other, configIds } = data;

  if (configIds.length < 3) {
    check(null, { 'setup created 3 ai-configs (needs AI_CONFIG_SECRET configured)': () => false });
    return;
  }

  // --- 1. default-flag race: repeated concurrent bursts, check after each ---
  let cleanBursts = 0;
  for (let b = 0; b < BURSTS; b += 1) {
    const requests = [];
    for (let i = 0; i < CONCURRENCY; i += 1) {
      const targetId = configIds[i % configIds.length];
      requests.push(['POST', `${BASE_URL}/ai-configs/${targetId}/default`, null, { headers: jsonHeaders(session.token) }]);
    }
    http.batch(requests);

    const listRes = http.get(`${BASE_URL}/ai-configs`, { headers: authHeaders(session.token), tags: { name: 'race_list_after_burst' } });
    const configs = listRes.json('configs') || [];
    const defaultCount = configs.filter((c) => c.is_default).length;

    const ok = check(null, {
      [`burst ${b + 1}/${BURSTS}: exactly one is_default after ${CONCURRENCY} concurrent /default calls`]: () => defaultCount === 1,
    });
    if (ok) cleanBursts += 1;
    else console.error(`burst ${b + 1}: found ${defaultCount} configs with is_default=true (expected exactly 1)`);
  }
  console.log(`default-flag race: ${cleanBursts}/${BURSTS} bursts left exactly one default config`);

  // --- 2. concurrent delete of the same id: exactly one 204, rest 404, never 500 ---
  const deleteTargetId = createConfig(session.token, 'race-delete-target');
  if (deleteTargetId) {
    const deleteRequests = [];
    for (let i = 0; i < CONCURRENCY; i += 1) {
      deleteRequests.push(['DELETE', `${BASE_URL}/ai-configs/${deleteTargetId}`, null, { headers: authHeaders(session.token) }]);
    }
    const deleteResponses = http.batch(deleteRequests);
    const successCount = deleteResponses.filter((r) => r.status === 204).length;
    const notFoundCount = deleteResponses.filter((r) => r.status === 404).length;
    const otherCount = deleteResponses.length - successCount - notFoundCount;
    if (otherCount > 0) {
      deleteResponses.forEach((r, i) => {
        if (r.status !== 204 && r.status !== 404) console.error(`unexpected delete[${i}] status=${r.status} body=${r.body}`);
      });
    }

    check(null, {
      'concurrent delete of the same id: exactly one 204': () => successCount === 1,
      'concurrent delete of the same id: the rest are 404': () => notFoundCount === CONCURRENCY - 1,
      'concurrent delete of the same id: never a 500 or other status': () => otherCount === 0,
    });
  }

  // --- 3. cross-user isolation under repeated concurrent bursts ---
  let leakCount = 0;
  let attemptCount = 0;
  for (let b = 0; b < BURSTS; b += 1) {
    const targetId = configIds[b % configIds.length];
    const requests = [
      ['PATCH', `${BASE_URL}/ai-configs/${targetId}`, JSON.stringify({ label: 'hijack-attempt' }), { headers: jsonHeaders(other.token) }],
      ['POST', `${BASE_URL}/ai-configs/${targetId}/default`, null, { headers: jsonHeaders(other.token) }],
      ['POST', `${BASE_URL}/ai-configs/${targetId}/validate`, null, { headers: jsonHeaders(other.token) }],
    ];
    const responses = http.batch(requests);
    responses.forEach((r, i) => {
      attemptCount += 1;
      if (r.status !== 404) {
        leakCount += 1;
        const kind = ['PATCH', 'default', 'validate'][i];
        console.error(`cross-user leak: burst ${b + 1} ${kind} -> ${r.status} body=${r.body}`);
      }
    });
  }
  check(null, {
    [`cross-user access is 404 across all ${attemptCount} concurrent attempts (zero leaks)`]: () => leakCount === 0,
  });
  console.log(`cross-user isolation: ${attemptCount - leakCount}/${attemptCount} correctly 404'd, ${leakCount} leaks`);

  // Defense-in-depth: confirm the PATCH attempts above never actually mutated
  // the victim's labels, even on a request that (unexpectedly) didn't 404.
  const finalList = http.get(`${BASE_URL}/ai-configs`, { headers: authHeaders(session.token) });
  const finalConfigs = finalList.json('configs') || [];
  const hijacked = finalConfigs.some((c) => c.label === 'hijack-attempt');
  check(null, { 'no config label was actually overwritten by the cross-user PATCH attempts': () => !hijacked });

  // One-shot cross-user delete attempt (kept out of the repeated-burst loop
  // above so it can't interact with the delete-of-same-id sub-test's target).
  const crossDelete = http.del(
    `${BASE_URL}/ai-configs/${configIds[0]}`,
    null,
    { headers: authHeaders(other.token), tags: { name: 'cross_user_delete_attempt' } },
  );
  check(crossDelete, { 'cross-user delete attempt is 404': (r) => r.status === 404 });
}

export function teardown(data) {
  deleteThrowawayUser(data.session);
  deleteThrowawayUser(data.other);
}
