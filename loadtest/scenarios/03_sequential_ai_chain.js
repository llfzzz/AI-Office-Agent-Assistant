// Characterizes per-endpoint cost of the sequential (not parallel) chains in
// server/analyzer.js: analyzeMeeting/planOfficeTask/runOfficeSkill each await
// 1-3 chatJson/fallback calls in series, and withLinkedMeetings (analyzer.js:
// 33-44) awaits up to 6 getMeeting calls one at a time, not Promise.all'd —
// both run even in demo-fallback mode (no AI key), since only the *chatJson*
// call is skipped, not the linked-meetings/RAG plumbing around it.
//
// setup() seeds 6 real meetings once so the "with linked_meeting_ids" variant
// exercises 6 genuine sequential getMeeting round-trips, not 6 no-op lookups
// against ids that don't exist (buildLinkedMeetingsContext silently skips
// missing meetings, which would hide the cost we're trying to measure).
//
// Runs entirely in demo-fallback mode (source==='demo-fallback' is asserted)
// per this pass's decision to stay off real AI providers.
//
// Env knobs: LOADTEST_AI_VUS (default 3, ceiling 10), LOADTEST_AI_DURATION (default 30s)
// Run: loadtest/.bin/k6 run loadtest/scenarios/03_sequential_ai_chain.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, authHeaders, jsonHeaders, envInt } from '../config.js';
import { registerThrowawayUser } from '../lib/auth.js';
import { deleteThrowawayUser } from '../lib/teardown.js';

const VUS = envInt('LOADTEST_AI_VUS', 3, 10);
const DURATION = __ENV.LOADTEST_AI_DURATION || '30s';

export const options = {
  vus: VUS,
  duration: DURATION,
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{name:ai_run_no_links}': ['p(95)<600'],
  },
};

function seedLinkedMeeting(token, index) {
  const res = http.post(
    `${BASE_URL}/meetings`,
    JSON.stringify({
      title: `关联会议 ${index}`,
      date: '2026-07-09',
      meeting_type: '项目进度会',
      participants: '压测账号',
      raw_transcript: `会议内容 ${index}：决定推进压测覆盖率建设，负责人为压测账号，本周五前完成第一版。`,
      analysis: {
        source: 'demo-fallback',
        structured_minutes: {
          summary: `关联会议 ${index} 摘要`,
          one_sentence_summary: `关联会议 ${index} 摘要`,
          decisions: [{ decision: '推进压测覆盖率建设', evidence: '', confidence: 'high' }],
          action_items: [{ task: '完成第一版压测脚本', owner: '压测账号', deadline: '本周五', priority: 'high', evidence: '' }],
        },
        quality_check: { has_hallucination: false },
      },
    }),
    { headers: jsonHeaders(token), tags: { name: 'ai_chain_seed_meeting' } },
  );
  return res.json('meeting.id');
}

export function setup() {
  const session = registerThrowawayUser('aichain');
  const linkedIds = [];
  for (let i = 0; i < 6; i += 1) {
    const id = seedLinkedMeeting(session.token, i);
    if (id) linkedIds.push(id);
  }
  console.log(`Seeded ${linkedIds.length}/6 linked meetings for the with-links variant.`);
  return { session, linkedIds };
}

function assertDemoFallback(res, checkName) {
  return check(res, {
    [checkName]: (r) => r.status === 200,
    [`${checkName} source is demo-fallback`]: (r) => r.json('source') === 'demo-fallback',
  });
}

function callAnalyze(session) {
  const res = http.post(
    `${BASE_URL}/meetings/analyze`,
    JSON.stringify({
      title: '压测分析会议',
      raw_transcript: '我们决定下周一发布新版本。张三负责后端联调，本周五前完成。存在的风险是第三方接口可能超时。',
    }),
    { headers: jsonHeaders(session.token), tags: { name: 'ai_analyze' } },
  );
  assertDemoFallback(res, 'analyze 200 + demo-fallback');
}

function callPlan(session, skillId) {
  const content = skillId === 'prd_review'
    ? '用户反馈导出功能不好用，希望支持一键导出为 PDF，目标用户是企业管理员，需要在下个版本上线。'
    : '本周完成了登录页联调，修复了两个 bug，下周计划开始周报生成 Skill 联调。';

  const res = http.post(
    `${BASE_URL}/office/plan`,
    JSON.stringify({ skill_id: skillId, title: '压测任务', content }),
    { headers: jsonHeaders(session.token), tags: { name: `ai_plan_${skillId}` } },
  );
  assertDemoFallback(res, `plan(${skillId}) 200 + demo-fallback`);
}

function callRun(session, skillId, linkedIds, withLinks) {
  const content = skillId === 'prd_review'
    ? '用户反馈导出功能不好用，希望支持一键导出为 PDF，目标用户是企业管理员，需要在下个版本上线。'
    : '本周完成了登录页联调，修复了两个 bug，下周计划开始周报生成 Skill 联调。';

  const body = { skill_id: skillId, title: '压测任务', content };
  if (withLinks) body.linked_meeting_ids = linkedIds;

  const tagName = `ai_run_${withLinks ? 'with_links' : 'no_links'}`;
  const res = http.post(
    `${BASE_URL}/office/run`,
    JSON.stringify(body),
    { headers: jsonHeaders(session.token), tags: { name: tagName } },
  );
  assertDemoFallback(res, `run(${skillId}, links=${withLinks}) 200 + demo-fallback`);
}

const variants = [
  (s) => callAnalyze(s),
  (s) => callPlan(s, 'weekly_report'),
  (s) => callPlan(s, 'prd_review'),
  (s, l) => callRun(s, 'weekly_report', l, false),
  (s, l) => callRun(s, 'weekly_report', l, true),
  (s, l) => callRun(s, 'prd_review', l, false),
  (s, l) => callRun(s, 'prd_review', l, true),
];

export default function (data) {
  const variant = variants[Math.floor(Math.random() * variants.length)];
  variant(data.session, data.linkedIds);
  sleep(0.3 + Math.random() * 0.7);
}

export function teardown(data) {
  deleteThrowawayUser(data.session);
}
