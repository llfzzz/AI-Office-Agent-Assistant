// Establishes a scaling curve (not a break-it test) for the uncached
// full-rechunk-and-tokenize RAG pass (server/rag.js: retrieveRagContext ->
// listKnowledgeDocuments does getFullList() with NO pagination anywhere in
// the API, then chunks + tokenizes the ENTIRE knowledge base from scratch on
// every call) and the equivalent unpaginated getFullList()-then-filter-in-JS
// pattern in server/storage.js's listMeetings. Concurrency is held FIXED so N
// (seeded document/meeting count) is the only variable being swept.
//
// Run once per volume step, after topping up the shared dataset:
//   node loadtest/seed/seed-rag-volume.mjs --target=10  && loadtest/.bin/k6 run loadtest/scenarios/06_rag_volume.js
//   node loadtest/seed/seed-rag-volume.mjs --target=50  && loadtest/.bin/k6 run loadtest/scenarios/06_rag_volume.js
//   node loadtest/seed/seed-rag-volume.mjs --target=200 && loadtest/.bin/k6 run loadtest/scenarios/06_rag_volume.js
// Then compare p50/p95 across the three run summaries.
//
// Env knobs: LOADTEST_VOLUME_VUS (default 5, fixed across all N), LOADTEST_VOLUME_DURATION (default 20s)
import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL, authHeaders, jsonHeaders, envInt } from '../config.js';

const sessionRaw = open('../.state/rag-volume-session.json');
const session = JSON.parse(sessionRaw);

if (!session || !session.token || session.cleaned) {
  throw new Error(
    'No active volume-test session found (or it was already cleaned up). '
    + 'Run `node loadtest/seed/seed-rag-volume.mjs --target=<N>` first.',
  );
}

const VUS = envInt('LOADTEST_VOLUME_VUS', 5, 10);
const DURATION = __ENV.LOADTEST_VOLUME_DURATION || '20s';
const LABEL = __ENV.LOADTEST_VOLUME_LABEL || `n${session.knowledgeCount}`;

export const options = {
  vus: VUS,
  duration: DURATION,
  thresholds: {
    http_req_failed: ['rate<0.01'],
  },
};

export function setup() {
  console.log(`RAG volume sweep: N=${session.knowledgeCount} knowledge docs, ${session.meetingCount} meetings, ${VUS} fixed VUs, label=${LABEL}`);
}

export default function () {
  const listKnowledge = http.get(`${BASE_URL}/knowledge`, {
    headers: authHeaders(session.token),
    tags: { name: `volume_list_knowledge_${LABEL}` },
  });
  check(listKnowledge, { 'list knowledge 200': (r) => r.status === 200 });

  const listMeetings = http.get(`${BASE_URL}/meetings`, {
    headers: authHeaders(session.token),
    tags: { name: `volume_list_meetings_${LABEL}` },
  });
  check(listMeetings, { 'list meetings 200': (r) => r.status === 200 });

  const plan = http.post(
    `${BASE_URL}/office/plan`,
    JSON.stringify({
      skill_id: 'weekly_report',
      title: '压测容量任务',
      content: '本周完成了压测容量场景验证，正在评估资料库检索在不同数据量下的表现，下周计划继续跟进。',
      rag: { enabled: true },
    }),
    { headers: jsonHeaders(session.token), tags: { name: `volume_office_plan_rag_${LABEL}` } },
  );
  check(plan, {
    'office/plan (rag enabled) 200': (r) => r.status === 200,
    'office/plan actually used rag': (r) => r.json('rag.enabled') === true,
  });
}
