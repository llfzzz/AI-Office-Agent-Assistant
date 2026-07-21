import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  IMPACT_LEVELS,
  ISSUE_TYPES,
  TICKET_LIMITS,
  recordToFeedbackTicket,
  ticketNumber,
  validateFeedbackTicket,
} from '../server/feedbackTickets.js';

const validBody = {
  issue_type: '内容不准确',
  subject: '待办负责人不对',
  details: '生成的待办里出现了会上没有提到的负责人。',
  target_type: 'generation',
  skill_id: 'meeting_minutes',
  output_title: '周会纪要',
};

test('validateFeedbackTicket accepts every allowed issue type', () => {
  for (const issueType of ISSUE_TYPES) {
    const result = validateFeedbackTicket({ ...validBody, issue_type: issueType });
    assert.equal(result.ok, true, `${issueType} rejected`);
    assert.equal(result.value.issue_type, issueType);
  }
});

test('validateFeedbackTicket accepts every allowed impact level and empty impact', () => {
  for (const impact of ['', ...IMPACT_LEVELS]) {
    const result = validateFeedbackTicket({ ...validBody, impact });
    assert.equal(result.ok, true);
  }
});

test('validateFeedbackTicket rejects unknown enums', () => {
  assert.equal(validateFeedbackTicket({ ...validBody, issue_type: '随便写的类型' }).ok, false);
  assert.equal(validateFeedbackTicket({ ...validBody, impact: '毁灭性' }).ok, false);
  assert.equal(validateFeedbackTicket({ ...validBody, target_type: 'other' }).ok, false);
  assert.equal(validateFeedbackTicket({ ...validBody, skill_id: 'not_a_skill' }).ok, false);
});

test('validateFeedbackTicket enforces required fields with safe field errors', () => {
  const result = validateFeedbackTicket({ target_type: 'generation' });
  assert.equal(result.ok, false);
  assert.ok(result.errors.issue_type);
  assert.ok(result.errors.subject);
  assert.ok(result.errors.details);
  // Error messages never echo user content.
  for (const message of Object.values(result.errors)) {
    assert.ok(message.length < 40);
  }
});

test('validateFeedbackTicket enforces length limits', () => {
  assert.equal(validateFeedbackTicket({ ...validBody, subject: 'x'.repeat(TICKET_LIMITS.subject + 1) }).ok, false);
  assert.equal(validateFeedbackTicket({ ...validBody, details: 'x'.repeat(TICKET_LIMITS.details + 1) }).ok, false);
  assert.equal(
    validateFeedbackTicket({ ...validBody, expected_result: 'x'.repeat(TICKET_LIMITS.expected_result + 1) }).ok,
    false,
  );
});

test('validateFeedbackTicket requires a valid target id for saved outputs', () => {
  assert.equal(validateFeedbackTicket({ ...validBody, target_type: 'saved_output' }).ok, false);
  assert.equal(validateFeedbackTicket({ ...validBody, target_type: 'saved_output', target_id: 'bad id!' }).ok, false);
  assert.equal(validateFeedbackTicket({ ...validBody, target_type: 'saved_output', target_id: 'rec_123' }).ok, true);
});

test('validateFeedbackTicket trims and strips control characters', () => {
  const result = validateFeedbackTicket({
    ...validBody,
    subject: '  标题有控制符  ',
    details: ' 描述 ',
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.subject, '标题有控制符');
  assert.equal(result.value.details, '描述');
});

test('validateFeedbackTicket rejects non-string field types', () => {
  assert.equal(validateFeedbackTicket({ ...validBody, subject: { nested: true } }).ok, false);
  assert.equal(validateFeedbackTicket(null).ok, false);
  assert.equal(validateFeedbackTicket([]).ok, false);
});

test('ticketNumber derives a short display id', () => {
  assert.equal(ticketNumber('abc123def456xyz'), 'FB-ABC123DE');
});

test('recordToFeedbackTicket projects new ticket rows without internal fields', () => {
  const ticket = recordToFeedbackTicket({
    id: 'abc123def456xyz',
    target_type: 'generation',
    target_id: '',
    skill_id: 'weekly_report',
    output_title: '周报',
    issue_type: '信息有遗漏',
    subject: '漏了里程碑',
    details: '里程碑没有出现在输出里。',
    expected_result: '应包含里程碑',
    impact: '影响工作',
    status: 'submitted',
    triage: { summary: '内部归档', priority: 'high' },
    feedback_summary: { internal: true },
    created: '2026-07-21 10:00:00',
    updated: '2026-07-21 10:00:00',
  });

  assert.equal(ticket.ticket_no, 'FB-ABC123DE');
  assert.equal(ticket.status, '已提交');
  assert.equal(ticket.legacy, false);
  assert.equal(ticket.issue_type, '信息有遗漏');
  assert.ok(!('triage' in ticket));
  assert.ok(!('feedback_summary' in ticket));
  assert.ok(!('user' in ticket));
  assert.ok(!JSON.stringify(ticket).includes('内部归档'));
});

test('recordToFeedbackTicket maps legacy rating rows to a readable ticket', () => {
  const ticket = recordToFeedbackTicket({
    id: 'legacy1234567890',
    office_output: 'out42',
    skill_id: 'weekly_report',
    output_title: '第 28 周周报',
    accuracy_score: 2,
    completeness_score: 3,
    copyability_score: 4,
    needs_heavy_edit: true,
    missing_info: '缺少下周计划',
    hallucination: '出现了没提过的数字',
    suggestion: '希望更贴近原始记录',
    feedback_summary: { feedback_summary: '内部总结' },
    created: 'c',
    updated: 'u',
  });

  assert.equal(ticket.legacy, true);
  assert.equal(ticket.issue_type, '出现了没有依据的内容');
  assert.equal(ticket.target_type, 'saved_output');
  assert.equal(ticket.target_id, 'out42');
  assert.ok(ticket.subject.includes('第 28 周周报'));
  assert.ok(ticket.details.includes('希望更贴近原始记录'));
  assert.ok(ticket.details.includes('缺少下周计划'));
  assert.ok(ticket.details.includes('准确性 2'));
  assert.equal(ticket.status, '已提交');
  assert.ok(!JSON.stringify(ticket).includes('内部总结'));
});

test('legacy rows without hallucination fall back to the missing-info issue type', () => {
  const ticket = recordToFeedbackTicket({
    id: 'legacy2',
    office_output: 'out1',
    missing_info: '少了风险',
    created: 'c',
    updated: 'u',
  });
  assert.equal(ticket.issue_type, '信息有遗漏');
});
