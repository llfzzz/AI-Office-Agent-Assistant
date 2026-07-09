// HIGHEST-RISK SCENARIO — run alone, last, nothing else concurrent, full
// attention on monitor.sh. Verifies the 24MB/entry + 64MB/total decompression
// caps in server/extractor.js:extractZipEntries (lines 268, 276) hold under
// CONCURRENCY, not just single requests: inflateRawSync is synchronous and
// runs on Node's single main thread, so N concurrent uploads can transiently
// hold up to N x ~24MB of inflated buffers AND block the event loop — real
// risk on a box with ~150MB genuinely free RAM. Fixtures are pre-built by
// generate-zip-fixtures.mjs (run that first).
//
// Runs a second, low-rate "canary" sub-scenario (plain /api/health polling)
// concurrently with the burst: a latency spike there during the burst is
// direct evidence of event-loop blocking, independent of whether the memory
// caps hold.
//
// Env knobs: LOADTEST_ZIP_CONCURRENCY (default 2, HARD ceiling 10 — do not
//            raise without conscious re-confirmation given this box's memory),
//            LOADTEST_ZIP_ITERATIONS_PER_VU (default 4, ceiling 8),
//            LOADTEST_ZIP_CANARY_DURATION (default 60s)
// Run: loadtest/.bin/k6 run loadtest/scenarios/04_zip_bomb_concurrency.js
import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL, authHeaders, envInt } from '../config.js';
import { registerThrowawayUser } from '../lib/auth.js';
import { deleteThrowawayUser } from '../lib/teardown.js';

const CONCURRENCY = envInt('LOADTEST_ZIP_CONCURRENCY', 2, 10);
const ITERATIONS_PER_VU = envInt('LOADTEST_ZIP_ITERATIONS_PER_VU', 4, 8);
const CANARY_DURATION = __ENV.LOADTEST_ZIP_CANARY_DURATION || '60s';

const validSmall = open('../fixtures/valid-small.docx', 'b');
const nearCapValid = open('../fixtures/near-cap-valid.docx', 'b');
const tripEntryCap = open('../fixtures/trip-entry-cap.docx', 'b');
const tripTotalCap = open('../fixtures/trip-total-cap.docx', 'b');

const fixtures = [
  { name: 'valid-small.docx', body: validSmall, expectStatus: 200 },
  { name: 'near-cap-valid.docx', body: nearCapValid, expectStatus: 200 },
  { name: 'trip-entry-cap.docx', body: tripEntryCap, expectStatus: 400 },
  { name: 'trip-total-cap.docx', body: tripTotalCap, expectStatus: 400 },
];

export const options = {
  scenarios: {
    zip_bomb_burst: {
      executor: 'per-vu-iterations',
      exec: 'zipBombBurst',
      vus: CONCURRENCY,
      iterations: ITERATIONS_PER_VU,
      maxDuration: '2m',
    },
    health_canary: {
      executor: 'constant-arrival-rate',
      exec: 'healthCanary',
      rate: 1,
      timeUnit: '1s',
      duration: CANARY_DURATION,
      preAllocatedVUs: 2,
      maxVUs: 4,
    },
  },
  thresholds: {
    // http_req_failed is intentionally NOT gated here: two of the four
    // fixtures are *expected* to return 400, which k6 classifies as
    // "failed" by default. The real assertion is the per-fixture status
    // check below (checks: rate==1) plus the canary's own latency, read from
    // the summary rather than gated with a hard number (event-loop-blocking
    // impact is being characterized, not pass/failed at an arbitrary ms figure).
    checks: ['rate==1'],
  },
};

export function setup() {
  const session = registerThrowawayUser('zipbomb');
  console.log(
    `zip-bomb burst: ${CONCURRENCY} concurrent VUs x ${ITERATIONS_PER_VU} iterations each `
    + `(hard ceiling 10) cycling through ${fixtures.length} fixtures; canary polling /api/health for ${CANARY_DURATION}.`,
  );
  return session;
}

export function zipBombBurst(session) {
  const fixture = fixtures[(__ITER + __VU) % fixtures.length];
  const res = http.post(`${BASE_URL}/files/extract`, fixture.body, {
    headers: {
      ...authHeaders(session.token),
      'Content-Type': 'application/octet-stream',
      'X-File-Name': fixture.name,
    },
    tags: { name: `zip_upload_${fixture.name.replace(/[^a-z0-9]/gi, '_')}` },
    timeout: '30s',
  });

  check(res, {
    [`${fixture.name}: status matches expectation (${fixture.expectStatus})`]: (r) => r.status === fixture.expectStatus,
    [`${fixture.name}: never a 500 / crash`]: (r) => r.status !== 500 && r.status !== 0,
  });
}

export function healthCanary() {
  const res = http.get(`${BASE_URL}/health`, { tags: { name: 'zip_health_canary' } });
  check(res, { 'canary /api/health 200 during zip-bomb burst': (r) => r.status === 200 });
}

export function teardown(session) {
  deleteThrowawayUser(session);
}
