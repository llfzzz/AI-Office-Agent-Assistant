import { stripControlChars } from './promptSafety.js';

// Ticket-style user feedback. Validation and projection are pure functions so
// they run in unit tests without PocketBase. Canonical enum values are the
// user-facing Chinese labels (the app is Chinese-first and the values are
// allowlist-validated on write).

export const ISSUE_TYPES = [
  '内容不准确',
  '信息有遗漏',
  '出现了没有依据的内容',
  '格式或表达不合适',
  '结果难以直接使用',
  '页面或操作问题',
  '其他问题',
];

export const IMPACT_LEVELS = ['轻微', '影响工作', '严重阻塞'];

export const TARGET_TYPES = ['generation', 'saved_output'];

export const TICKET_LIMITS = {
  subject: 120,
  details: 2000,
  expected_result: 1000,
  output_title: 240,
};

const SKILL_IDS = ['meeting_minutes', 'weekly_report', 'prd_review'];

const STATUS_LABELS = {
  submitted: '已提交',
};

function cleanString(value) {
  if (value === undefined || value === null) {
    return '';
  }

  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
    return null;
  }

  return stripControlChars(String(value)).trim();
}

/**
 * Validate a ticket body into { ok, errors, value }. Error messages are safe
 * to return to the client: they name the field, never echo its content.
 */
export function validateFeedbackTicket(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, errors: { body: '请求内容格式无效' }, value: null };
  }

  const errors = {};
  const read = (field) => {
    const value = cleanString(body[field]);

    if (value === null) {
      errors[field] = '字段类型无效';
      return '';
    }

    return value;
  };

  const issueType = read('issue_type');
  const subject = read('subject');
  const details = read('details');
  const expectedResult = read('expected_result');
  const impact = read('impact');
  const targetType = read('target_type') || 'generation';
  const targetId = read('target_id');
  const skillId = read('skill_id');
  const outputTitle = read('output_title');

  if (!issueType) {
    errors.issue_type = '请选择问题类型';
  } else if (!ISSUE_TYPES.includes(issueType)) {
    errors.issue_type = '问题类型无效';
  }

  if (!subject) {
    errors.subject = '请填写问题标题';
  } else if (subject.length > TICKET_LIMITS.subject) {
    errors.subject = `问题标题过长（最多 ${TICKET_LIMITS.subject} 字）`;
  }

  if (!details) {
    errors.details = '请描述具体发生了什么';
  } else if (details.length > TICKET_LIMITS.details) {
    errors.details = `问题描述过长（最多 ${TICKET_LIMITS.details} 字）`;
  }

  if (expectedResult.length > TICKET_LIMITS.expected_result) {
    errors.expected_result = `期望结果过长（最多 ${TICKET_LIMITS.expected_result} 字）`;
  }

  if (impact && !IMPACT_LEVELS.includes(impact)) {
    errors.impact = '影响程度无效';
  }

  if (!TARGET_TYPES.includes(targetType)) {
    errors.target_type = '反馈对象类型无效';
  }

  if (targetId && !/^[A-Za-z0-9_-]{1,40}$/.test(targetId)) {
    errors.target_id = '反馈对象标识无效';
  }

  if (targetType === 'saved_output' && !targetId && !errors.target_type) {
    errors.target_id = '缺少反馈对象标识';
  }

  if (skillId && !SKILL_IDS.includes(skillId)) {
    errors.skill_id = '技能类型无效';
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors, value: null };
  }

  return {
    ok: true,
    errors: {},
    value: {
      issue_type: issueType,
      subject,
      details,
      expected_result: expectedResult,
      impact,
      target_type: targetType,
      target_id: targetId,
      skill_id: skillId,
      output_title: outputTitle.slice(0, TICKET_LIMITS.output_title),
    },
  };
}

export function ticketNumber(id) {
  return `FB-${String(id || '').slice(0, 8).toUpperCase()}`;
}

function legacyIssueType(record) {
  if (record.hallucination) {
    return '出现了没有依据的内容';
  }

  if (record.missing_info) {
    return '信息有遗漏';
  }

  if (record.needs_heavy_edit) {
    return '结果难以直接使用';
  }

  return '其他问题';
}

function legacyDetails(record) {
  const scores = [record.accuracy_score, record.completeness_score, record.copyability_score].map((value) => Number(value) || 0);
  const parts = [
    record.suggestion ? String(record.suggestion) : '',
    record.missing_info ? `信息遗漏：${record.missing_info}` : '',
    record.hallucination ? `疑似无依据内容：${record.hallucination}` : '',
    scores.some(Boolean) ? `历史评分：准确性 ${scores[0]} / 完整性 ${scores[1]} / 可用性 ${scores[2]}` : '',
  ].filter(Boolean);

  return parts.join('\n') || '用户提交了评分反馈。';
}

/**
 * Project an office_feedback record as a ticket. Legacy rating rows (created
 * before the ticket migration, no issue_type) map onto a readable ticket view.
 * Internal fields (triage, feedback_summary, raw user relation) are never
 * included.
 */
export function recordToFeedbackTicket(record) {
  const legacy = !record.issue_type;
  const targetId = record.target_id || record.office_output || '';

  return {
    id: record.id,
    ticket_no: ticketNumber(record.id),
    target_type: record.target_type || (record.office_output ? 'saved_output' : 'generation'),
    target_id: targetId,
    office_output: record.office_output || '',
    skill_id: record.skill_id || '',
    output_title: record.output_title || '',
    issue_type: legacy ? legacyIssueType(record) : record.issue_type,
    subject: legacy
      ? record.output_title
        ? `关于「${record.output_title}」的评分反馈`
        : '历史评分反馈'
      : record.subject || '',
    details: legacy ? legacyDetails(record) : record.details || '',
    expected_result: legacy ? '' : record.expected_result || '',
    impact: legacy ? '' : record.impact || '',
    status: STATUS_LABELS[record.status] || record.status || '已提交',
    legacy,
    created_at: record.created,
    updated_at: record.updated,
  };
}
