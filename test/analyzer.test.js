import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLinkedMeetingsContext,
  normalizeAgentPlan,
  normalizeQualityGate,
  planOfficeTask,
  runOfficeSkill,
  shouldRevise,
} from '../server/analyzer.js';

function stubContext(recordsById) {
  return {
    user: { id: 'u1' },
    pb: {
      collection() {
        return {
          async getOne(id) {
            if (recordsById[id]) {
              return recordsById[id];
            }
            const error = new Error('not found');
            error.status = 404;
            throw error;
          },
        };
      },
    },
  };
}

const records = {
  m1: {
    id: 'm1',
    title: '需求评审会',
    date: '2026-05-01',
    meeting_type: '需求评审',
    analysis: {
      structured_minutes: {
        meeting_type: '需求评审',
        one_sentence_summary: '确定第一版范围',
        decisions: [{ decision: '第一版只做文本输入', evidence: '会上明确', confidence: 'high' }],
        action_items: [{ task: '完成前端页面', owner: '小罗', deadline: '本周', priority: 'high', evidence: '' }],
      },
    },
    created: '',
    updated: '',
  },
};

test('buildLinkedMeetingsContext returns empty string when nothing is linked', async () => {
  assert.equal(await buildLinkedMeetingsContext(stubContext(records), []), '');
});

test('buildLinkedMeetingsContext renders title, summary, decisions and owners', async () => {
  const text = await buildLinkedMeetingsContext(stubContext(records), ['m1']);
  assert.ok(text.includes('需求评审会'));
  assert.ok(text.includes('确定第一版范围'));
  assert.ok(text.includes('第一版只做文本输入'));
  assert.ok(text.includes('完成前端页面（小罗）'));
});

test('buildLinkedMeetingsContext skips missing/deleted meetings', async () => {
  assert.equal(await buildLinkedMeetingsContext(stubContext(records), ['missing']), '');
});

test('buildLinkedMeetingsContext de-duplicates repeated ids', async () => {
  const text = await buildLinkedMeetingsContext(stubContext(records), ['m1', 'm1']);
  assert.equal(text.split('关联会议：').length - 1, 1);
});

// --- Plan normalization ----------------------------------------------------

test('normalizeAgentPlan always emits the versioned 2.0 shape', () => {
  const plan = normalizeAgentPlan({}, { skill_id: 'prd_review', title: '需求' }, { enabled: false });
  assert.equal(plan.schema_version, '2.0');
  assert.equal(plan.selected_skill, 'prd_review');
  assert.ok(Array.isArray(plan.execution_steps));
  assert.ok(Array.isArray(plan.risk_register));
  assert.ok(plan.deliverable && plan.deliverable.language === 'zh-CN');
  assert.ok(plan.source_inventory.some((source) => source.source_type === 'primary_input'));
});

test('normalizeAgentPlan upgrades legacy v1 plans (required_inputs/string steps/risk_notes)', () => {
  const plan = normalizeAgentPlan(
    {
      user_goal: '生成周报',
      selected_skill: 'weekly_report',
      required_inputs: ['工作记录'],
      missing_information: ['周期'],
      execution_steps: ['识别完成事项', '整理下周计划'],
      risk_notes: ['可能夸大成果'],
    },
    { skill_id: 'weekly_report' },
  );

  assert.equal(plan.schema_version, '2.0');
  assert.equal(typeof plan.missing_information[0], 'object');
  assert.equal(plan.missing_information[0].field, '周期');
  assert.equal(typeof plan.execution_steps[0], 'object');
  assert.equal(plan.execution_steps[0].action, '识别完成事项');
  assert.equal(plan.risk_register[0].risk, '可能夸大成果');
});

// --- Quality gate normalization + revision decision ------------------------

test('normalizeQualityGate reads the v2 verdict schema', () => {
  const gate = normalizeQualityGate({
    verdict: 'revise',
    scores: { factuality: 2, completeness: 3, actionability: 3, clarity: 4, professionalism: 4, safety: 5 },
    issues: [{ severity: 'high', category: '幻觉', problem: '编造了负责人' }],
    missing_information: ['缺少下周计划'],
    copy_ready: false,
  });
  assert.equal(gate.verdict, 'revise');
  assert.equal(gate.issues.length, 1);
  assert.equal(gate.scores.factuality, 2);
  assert.equal(shouldRevise(gate), true);
});

test('normalizeQualityGate upgrades the legacy office quality shape', () => {
  const gate = normalizeQualityGate({
    has_hallucination: true,
    hallucination_items: ['编造的数字'],
    overclaim_items: ['把计划写成完成'],
    copy_ready_score: 2,
    revision_suggestions: ['补充依据'],
  });
  assert.ok(['revise', 'blocked'].includes(gate.verdict));
  assert.ok(gate.issues.length >= 2);
  assert.equal(shouldRevise(gate), true);
});

test('normalizeQualityGate upgrades the legacy meeting quality shape', () => {
  const gate = normalizeQualityGate({
    has_hallucination: false,
    questionable_decisions: ['讨论被写成决策'],
    missing_risks_or_questions: ['遗漏一个风险'],
  });
  assert.equal(gate.issues.some((issue) => issue.category === '决策依据不足'), true);
  assert.ok(gate.missing_information.includes('遗漏一个风险'));
});

test('shouldRevise triggers on critical/high issues even when verdict is pass', () => {
  assert.equal(shouldRevise({ verdict: 'pass', issues: [{ severity: 'high', problem: 'x' }] }), true);
  assert.equal(shouldRevise({ verdict: 'pass', issues: [{ severity: 'low', problem: 'x' }] }), false);
  assert.equal(shouldRevise({ verdict: 'blocked', issues: [] }), true);
});

// --- Orchestration with a stubbed model call (no network) ------------------

function stubProvider() {
  return { mode: 'custom', api_key: 'k', base_url: 'https://example.com', model: 'test-model', api_mode: 'openai' };
}

function ragStubContext() {
  return {
    user: { id: 'u1' },
    pb: {
      collection() {
        return {
          async getFullList() {
            return [];
          },
          async getOne() {
            const error = new Error('not found');
            error.status = 404;
            throw error;
          },
        };
      },
    },
  };
}

function countingChat(responses) {
  const calls = [];
  const chatJson = async (messages) => {
    calls.push(messages);
    const system = messages.find((message) => message.role === 'system').content;
    const key = Object.keys(responses).find((token) => system.includes(token));
    return typeof responses[key] === 'function' ? responses[key](calls.length) : responses[key] || {};
  };
  return { chatJson, calls };
}

test('weekly run makes 3 model calls when quality passes', async () => {
  const { chatJson, calls } = countingChat({
    任务规划模块: { selected_skill: 'weekly_report' },
    周报生成: { copy_ready_report: '本周完成登录。' },
    输出质量检查器: { verdict: 'pass', copy_ready: true },
  });

  const result = await runOfficeSkill(
    { skill_id: 'weekly_report', title: '周报', content: '完成登录功能。' },
    ragStubContext(),
    stubProvider(),
    { chatJson },
  );

  assert.equal(calls.length, 3);
  assert.equal(result.revision_applied, false);
  assert.equal(result.quality_check.verdict, 'pass');
  assert.equal(result.agent_plan.schema_version, '2.0');
});

test('weekly run performs exactly one revision then a final check (5 calls), never looping', async () => {
  const { chatJson, calls } = countingChat({
    任务规划模块: { selected_skill: 'weekly_report' },
    周报生成: { copy_ready_report: '初稿。' },
    定向修订模块: { copy_ready_report: '修订稿。' },
    // The gate always says revise; the loop must still stop after one revision.
    输出质量检查器: { verdict: 'revise', issues: [{ severity: 'high', problem: '仍需改进' }] },
  });

  const result = await runOfficeSkill(
    { skill_id: 'weekly_report', title: '周报', content: '完成登录功能。' },
    ragStubContext(),
    stubProvider(),
    { chatJson },
  );

  // plan + generate + gate + revision + final gate = 5, and no more.
  assert.equal(calls.length, 5);
  assert.equal(result.revision_applied, true);
  assert.equal(result.skill_output.copy_ready_report, '修订稿。');
});

test('meeting run issues a real model plan call in parallel with analysis', async () => {
  const { chatJson, calls } = countingChat({
    任务规划模块: { selected_skill: 'meeting_minutes', task_summary: '真实计划' },
    会议理解模块: { meeting_type: '需求评审' },
    '会议纪要 Skill': { one_sentence_summary: '结论', decisions: [] },
    会议纪要质量检查器: { verdict: 'pass', copy_ready: true },
  });

  const result = await runOfficeSkill(
    { skill_id: 'meeting_minutes', title: '评审会', content: '我们决定第一版先做纪要。' },
    ragStubContext(),
    stubProvider(),
    { chatJson },
  );

  assert.ok(calls.some((messages) => messages.find((m) => m.role === 'system').content.includes('任务规划模块')));
  assert.equal(result.agent_plan.task_summary, '真实计划');
  assert.equal(result.agent_plan.schema_version, '2.0');
  assert.equal(result.quality_check.verdict, 'pass');
});

test('planOfficeTask returns a demo fallback plan without a provider (no model call)', async () => {
  let called = false;
  const chatJson = async () => {
    called = true;
    return {};
  };

  const result = await planOfficeTask(
    { skill_id: 'weekly_report', title: '周报', content: '内容' },
    ragStubContext(),
    {},
    { chatJson },
  );

  assert.equal(called, false);
  assert.equal(result.source, 'demo-fallback');
  assert.equal(result.agent_plan.schema_version, '2.0');
});
