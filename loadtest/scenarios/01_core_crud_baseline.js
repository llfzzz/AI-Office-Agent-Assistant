// Standard "normal app usage" baseline before drilling into risk-area
// scenarios: mixed weighted read/write traffic against the core CRUD surface.
// One shared throwaway account (created once in setup()) so the lists it
// reads visibly grow as the run's own creates land — a small but realistic
// touch, and it keeps account-creation overhead out of the measured path.
//
// Env knobs: LOADTEST_CRUD_VUS (default 5, ceiling 20), LOADTEST_CRUD_DURATION (default 30s)
// Run: loadtest/.bin/k6 run loadtest/scenarios/01_core_crud_baseline.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, authHeaders, jsonHeaders, envInt } from '../config.js';
import { registerThrowawayUser } from '../lib/auth.js';
import { deleteThrowawayUser } from '../lib/teardown.js';

const VUS = envInt('LOADTEST_CRUD_VUS', 5, 20);
const DURATION = __ENV.LOADTEST_CRUD_DURATION || '30s';

export const options = {
  vus: VUS,
  duration: DURATION,
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<400'],
  },
};

export function setup() {
  return registerThrowawayUser('crud');
}

function createAndVerifyMeeting(session) {
  const title = `压测会议 ${Date.now()}-${__VU}-${__ITER}`;
  const createRes = http.post(
    `${BASE_URL}/meetings`,
    JSON.stringify({
      title,
      date: '2026-07-09',
      meeting_type: '项目进度会',
      participants: '压测账号',
      raw_transcript: '本次会议决定继续推进压测覆盖率，负责人为压测账号，本周完成。',
      analysis: {
        source: 'demo-fallback',
        structured_minutes: { summary: title, decisions: [], action_items: [] },
        quality_check: { has_hallucination: false },
      },
    }),
    { headers: jsonHeaders(session.token), tags: { name: 'crud_create_meeting' } },
  );

  const created = check(createRes, { 'create meeting 201': (r) => r.status === 201 });
  if (!created) return;

  const id = createRes.json('meeting.id');
  const detailRes = http.get(`${BASE_URL}/meetings/${id}`, {
    headers: authHeaders(session.token),
    tags: { name: 'crud_get_meeting_detail' },
  });

  check(detailRes, {
    'created meeting is retrievable': (r) => r.status === 200,
    'retrieved title matches what was created': (r) => r.json('meeting.title') === title,
  });
}

export default function (session) {
  const roll = Math.random();

  if (roll < 0.6) {
    const res = http.get(`${BASE_URL}/meetings`, { headers: authHeaders(session.token), tags: { name: 'crud_list_meetings' } });
    check(res, { 'list meetings 200': (r) => r.status === 200 });
  } else if (roll < 0.75) {
    const res = http.get(`${BASE_URL}/knowledge`, { headers: authHeaders(session.token), tags: { name: 'crud_list_knowledge' } });
    check(res, { 'list knowledge 200': (r) => r.status === 200 });
  } else if (roll < 0.85) {
    const res = http.get(`${BASE_URL}/office/outputs`, { headers: authHeaders(session.token), tags: { name: 'crud_list_outputs' } });
    check(res, { 'list office outputs 200': (r) => r.status === 200 });
  } else if (roll < 0.9) {
    const res = http.get(`${BASE_URL}/office/feedback`, { headers: authHeaders(session.token), tags: { name: 'crud_list_feedback' } });
    check(res, { 'list office feedback 200': (r) => r.status === 200 });
  } else {
    createAndVerifyMeeting(session);
  }

  sleep(0.2 + Math.random() * 0.6);
}

export function teardown(session) {
  deleteThrowawayUser(session);
}
