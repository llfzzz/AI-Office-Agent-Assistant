// Documents the absence of rate limiting/lockout — a security finding, not a
// throughput gate. Deliberately low volume and sequential (not concurrent):
// repeated logins are cheap, but /api/ai-configs/:id/validate calls a real
// third-party endpoint even with a bad key, so this stays far below anything
// that could be mistaken for abuse of DeepSeek's infrastructure.
//
// Env knobs: LOADTEST_RATELIMIT_LOGIN_ATTEMPTS (default 20, ceiling 30),
//            LOADTEST_RATELIMIT_VALIDATE_ATTEMPTS (default 3, ceiling 5)
// Run: loadtest/.bin/k6 run loadtest/scenarios/05_rate_limit_absence.js
import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL, jsonHeaders, envInt } from '../config.js';
import { registerThrowawayUser } from '../lib/auth.js';
import { deleteThrowawayUser } from '../lib/teardown.js';

const LOGIN_ATTEMPTS = envInt('LOADTEST_RATELIMIT_LOGIN_ATTEMPTS', 20, 30);
const VALIDATE_ATTEMPTS = envInt('LOADTEST_RATELIMIT_VALIDATE_ATTEMPTS', 3, 5);

export const options = {
  vus: 1,
  iterations: 1,
  thresholds: {
    checks: ['rate==1'],
  },
};

export function setup() {
  return registerThrowawayUser('ratelimit');
}

export default function (session) {
  // --- login: repeated wrong-password attempts against a real account ---
  const loginDurations = [];
  let sawLogin429 = false;

  for (let i = 0; i < LOGIN_ATTEMPTS; i += 1) {
    const res = http.post(
      `${BASE_URL}/auth/login`,
      JSON.stringify({ email: session.email, password: 'definitely-wrong-password' }),
      { headers: jsonHeaders(), tags: { name: 'login_wrong_password' } },
    );
    loginDurations.push(res.timings.duration);
    if (res.status === 429) sawLogin429 = true;
    check(res, { [`login attempt ${i + 1} is 401 (wrong password, not blocked)`]: (r) => r.status === 401 });
  }

  check(null, { 'no 429 across any login attempt': () => !sawLogin429 });

  const first = loginDurations[0];
  const last = loginDurations[loginDurations.length - 1];
  console.log(
    `login: ${LOGIN_ATTEMPTS} wrong-password attempts, first=${first.toFixed(1)}ms last=${last.toFixed(1)}ms `
    + `(no growth would indicate no backoff anywhere in the stack), saw429=${sawLogin429}`,
  );

  const goodLogin = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ email: session.email, password: session.password }),
    { headers: jsonHeaders(), tags: { name: 'login_correct_after_flood' } },
  );
  check(goodLogin, {
    [`correct password still logs in immediately after ${LOGIN_ATTEMPTS} failed attempts (no lockout)`]: (r) => r.status === 200,
  });

  // --- validate: low-N probe against a real third-party endpoint with a bad key ---
  const configRes = http.post(
    `${BASE_URL}/ai-configs`,
    JSON.stringify({
      label: '压测-fake-key',
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      api_key: 'sk-loadtest-deliberately-invalid-key',
    }),
    { headers: jsonHeaders(session.token), tags: { name: 'create_ai_config_for_ratelimit_probe' } },
  );
  const configCreated = check(configRes, {
    'ai-config created for validate probe (needs AI_CONFIG_SECRET configured)': (r) => r.status === 201,
  });

  if (configCreated) {
    const configId = configRes.json('config.id');
    const validateDurations = [];
    let sawValidate429 = false;

    for (let i = 0; i < VALIDATE_ATTEMPTS; i += 1) {
      const res = http.post(
        `${BASE_URL}/ai-configs/${configId}/validate`,
        null,
        { headers: jsonHeaders(session.token), tags: { name: 'validate_bad_key' } },
      );
      validateDurations.push(res.timings.duration);
      if (res.status === 429) sawValidate429 = true;
      check(res, { [`validate attempt ${i + 1} completes without being blocked (200 + invalid status)`]: (r) => r.status === 200 });
    }

    check(null, { 'no 429 across any validate attempt': () => !sawValidate429 });
    console.log(
      `validate: ${VALIDATE_ATTEMPTS} attempts against a real provider with a bad key, `
      + `durations=[${validateDurations.map((d) => d.toFixed(0)).join(', ')}]ms, saw429=${sawValidate429}`,
    );
  } else {
    console.warn('Skipping validate probe: ai-config creation failed (encryption likely not configured).');
  }
}

export function teardown(session) {
  deleteThrowawayUser(session);
}
