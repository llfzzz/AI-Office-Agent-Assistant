import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fallbackAnalysis,
  fallbackAnswer,
  fallbackFeedbackSummary,
  fallbackOfficePlan,
  fallbackOfficeRun,
} from '../server/mock.js';

test('fallbackAnalysis produces a structured demo result from a transcript', () => {
  const result = fallbackAnalysis({
    title: 'AI 会议助手讨论',
    participants: '小罗, 产品',
    raw_transcript:
      '我们决定本周先做 Demo。小罗负责前端页面。风险是模型可能编造没有提到的信息。还有一个未确定的问题是接口是否稳定。',
  });

  assert.equal(result.source, 'demo-fallback');
  assert.equal(result.provider, null);
  assert.ok(result.warnings.length >= 1);
  assert.ok(result.structured_minutes.summary);
  assert.ok(Array.isArray(result.structured_minutes.decisions));
  assert.ok(result.structured_minutes.action_items.some((item) => item.owner === '小罗'));
  assert.ok(result.structured_minutes.risks.length >= 1);
  assert.equal(result.quality_check.has_hallucination, false);
});

test('fallbackOfficeRun (weekly_report) returns a copy-ready report', () => {
  const result = fallbackOfficeRun(
    { skill_id: 'weekly_report', content: '完成了登录功能。下周计划接入支付。风险是依赖第三方接口。' },
    { enabled: false },
  );

  assert.equal(result.source, 'demo-fallback');
  assert.equal(result.agent_plan.selected_skill, 'weekly_report');
  assert.ok('copy_ready_report' in result.skill_output);
  assert.ok(result.skill_output.copy_ready_report.includes('本周总结'));
});

test('fallbackOfficeRun (prd_review) returns a PRD draft', () => {
  const result = fallbackOfficeRun(
    { skill_id: 'prd_review', content: '用户反馈无法批量导出。希望支持批量导出功能。约束是第一版不做第三方集成。' },
    { enabled: false },
  );

  assert.equal(result.agent_plan.selected_skill, 'prd_review');
  assert.ok('prd_draft' in result.skill_output);
  assert.ok(result.skill_output.prd_draft.startsWith('#'));
});

test('fallbackOfficePlan flags missing information', () => {
  const plan = fallbackOfficePlan({ skill_id: 'weekly_report', content: '' }, { enabled: false });
  assert.equal(plan.selected_skill, 'weekly_report');
  assert.ok(Array.isArray(plan.missing_information));
});

test('fallbackAnswer answers owner questions from action items', () => {
  const meeting = {
    analysis: {
      structured_minutes: {
        action_items: [{ task: '完成前端', owner: '小罗', evidence: '小罗负责前端' }],
      },
    },
  };
  const answer = fallbackAnswer(meeting, '谁负责后续跟进？');
  assert.ok(answer.answer.includes('小罗'));
  assert.equal(answer.source, 'demo-fallback');
});

test('fallbackFeedbackSummary categorizes hallucination + low score as high priority', () => {
  const summary = fallbackFeedbackSummary({
    feedback: { accuracy_score: 2, copyability_score: 2, completeness_score: 2, hallucination: '编造了数据' },
  });
  assert.ok(summary.problem_categories.includes('幻觉问题'));
  assert.equal(summary.priority, 'high');
});
