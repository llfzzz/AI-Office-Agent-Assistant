import {
  buildAskMessages,
  buildFeedbackSummaryMessages,
  buildMinutesMessages,
  buildOfficePlanMessages,
  buildOfficeQualityCheckMessages,
  buildPrdReviewMessages,
  buildQualityCheckMessages,
  buildRevisionMessages,
  buildTicketTriageMessages,
  buildUnderstandingMessages,
  buildWeeklyReportMessages,
} from './prompts.js';
import { chatJson, getProviderMeta, hasProviderConfig } from './gemini.js';
import {
  fallbackAnalysis,
  fallbackAnswer,
  fallbackFeedbackSummary,
  fallbackOfficePlan,
  fallbackOfficeRun,
  fallbackTicketTriage,
} from './mock.js';
import { retrieveRagContext } from './rag.js';
import { getMeeting } from './storage.js';

const MAX_LINKED_MEETINGS = 6;

// Explicit per-stage token budgets. A single run is straight-line code with at
// most one revision pass — there is no retry/self-review loop anywhere.
const TOKEN_BUDGETS = {
  plan: 1600,
  understanding: 700,
  minutes: 2600,
  weekly: 3000,
  prd: 3400,
  quality: 1200,
  revision: 3400,
  feedback: 800,
  triage: 400,
};

const SKILLS = ['meeting_minutes', 'weekly_report', 'prd_review'];

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Resolve the meetings the user linked to an office task into a compact,
 * model-readable reference block (title, date, one-line summary, decisions,
 * action items). Tolerant of missing/deleted meetings; returns '' when none.
 */
export async function buildLinkedMeetingsContext(context, ids = []) {
  const uniqueIds = [...new Set((ids || []).filter(Boolean))].slice(0, MAX_LINKED_MEETINGS);

  if (uniqueIds.length === 0) {
    return '';
  }

  const blocks = [];

  for (const id of uniqueIds) {
    let meeting = null;

    try {
      meeting = await getMeeting(context, id);
    } catch {
      // Ignore missing/deleted meetings; they simply drop out of the reference block.
    }

    if (!meeting) {
      continue;
    }

    const minutes = meeting.analysis?.structured_minutes || {};
    const decisions = (minutes.decisions || []).map((item) => item.decision).filter(Boolean);
    const actions = (minutes.action_items || [])
      .map((item) => {
        const owner = item.owner && item.owner !== '未提及' ? `（${item.owner}）` : '';
        return item.task ? `${item.task}${owner}` : '';
      })
      .filter(Boolean);

    const lines = [
      `关联会议：${meeting.title || '未命名会议'}${meeting.date ? `（${meeting.date}）` : ''}`,
      minutes.one_sentence_summary ? `一句话结论：${minutes.one_sentence_summary}` : '',
      decisions.length ? `关键决策：${decisions.join('；')}` : '',
      actions.length ? `待办事项：${actions.join('；')}` : '',
    ].filter(Boolean);

    blocks.push(lines.join('\n'));
  }

  return blocks.join('\n\n');
}

async function withLinkedMeetings(context, input) {
  const linkedContext = await buildLinkedMeetingsContext(context, input.linked_meeting_ids);
  return linkedContext ? { ...input, linked_meetings_context: linkedContext } : input;
}

function officeQuery(input) {
  return [
    input.title,
    input.date,
    input.content,
    input.linked_meetings_context,
    ...Object.values(input.metadata || {}),
  ]
    .filter(Boolean)
    .join('\n');
}

// --- Normalizers (pure; exported for unit testing) -------------------------

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asString(value, fallback = '') {
  if (typeof value === 'string') {
    return value;
  }

  if (value === undefined || value === null) {
    return fallback;
  }

  return String(value);
}

function oneOf(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function stringList(value) {
  return asArray(value)
    .map((item) => (typeof item === 'string' ? item : item ? asString(item.field || item.item || item.text || '') : ''))
    .filter(Boolean);
}

function normalizeMissingInformation(value) {
  return asArray(value)
    .map((entry) => {
      if (typeof entry === 'string') {
        return entry.trim()
          ? { field: entry.trim(), reason: '输入中未提供', blocking: false, fallback_strategy: '在结果中标记缺口' }
          : null;
      }

      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const field = asString(entry.field || entry.item || '').trim();
      return field
        ? {
            field,
            reason: asString(entry.reason),
            blocking: Boolean(entry.blocking),
            fallback_strategy: asString(entry.fallback_strategy),
          }
        : null;
    })
    .filter(Boolean);
}

function normalizeExecutionSteps(value) {
  return asArray(value)
    .map((entry, index) => {
      if (typeof entry === 'string') {
        return entry.trim()
          ? { step: index + 1, action: entry.trim(), inputs: [], expected_result: '', quality_gate: '' }
          : null;
      }

      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const action = asString(entry.action || entry.step_name || '').trim();
      return action
        ? {
            step: Number.isFinite(Number(entry.step)) && Number(entry.step) > 0 ? Number(entry.step) : index + 1,
            action,
            inputs: stringList(entry.inputs),
            expected_result: asString(entry.expected_result),
            quality_gate: asString(entry.quality_gate),
          }
        : null;
    })
    .filter(Boolean);
}

function normalizeRiskRegister(value) {
  return asArray(value)
    .map((entry) => {
      if (typeof entry === 'string') {
        return entry.trim()
          ? { risk: entry.trim(), likelihood: 'medium', impact: 'medium', mitigation: '' }
          : null;
      }

      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const risk = asString(entry.risk || entry.risk_note || '').trim();
      return risk
        ? {
            risk,
            likelihood: oneOf(entry.likelihood, ['high', 'medium', 'low'], 'medium'),
            impact: oneOf(entry.impact, ['high', 'medium', 'low'], 'medium'),
            mitigation: asString(entry.mitigation || entry.suggestion),
          }
        : null;
    })
    .filter(Boolean);
}

/**
 * Normalize any plan payload — model output (v2), legacy saved plans (v1
 * flat shape with required_inputs/risk_notes/string steps), or partial data —
 * into the versioned 2.0 plan structure.
 */
export function normalizeAgentPlan(plan = {}, input = {}, ragContext = undefined) {
  const source = plan && typeof plan === 'object' ? plan : {};
  const selectedSkill = SKILLS.includes(source.selected_skill)
    ? source.selected_skill
    : SKILLS.includes(input.skill_id)
      ? input.skill_id
      : 'weekly_report';

  const deliverable = source.deliverable && typeof source.deliverable === 'object' ? source.deliverable : {};
  const defaultDeliverableType =
    selectedSkill === 'meeting_minutes' ? '会议纪要' : selectedSkill === 'prd_review' ? 'PRD 评审材料' : '周报';

  const sourceInventory = asArray(source.source_inventory)
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const sourceType = oneOf(entry.source_type, ['primary_input', 'linked_meeting', 'rag'], 'primary_input');
      return {
        source_id: asString(entry.source_id || sourceType),
        source_type: sourceType,
        purpose: asString(entry.purpose),
        authority: oneOf(entry.authority, ['primary', 'supporting'], sourceType === 'primary_input' ? 'primary' : 'supporting'),
      };
    })
    .filter(Boolean);

  if (sourceInventory.length === 0) {
    sourceInventory.push({
      source_id: 'primary_input',
      source_type: 'primary_input',
      purpose: '任务的主要输入内容',
      authority: 'primary',
    });

    if (String(input.linked_meetings_context || '').trim()) {
      sourceInventory.push({
        source_id: 'linked_meeting_1',
        source_type: 'linked_meeting',
        purpose: '用户关联的历史会议摘要',
        authority: 'supporting',
      });
    }

    if (ragContext?.enabled) {
      sourceInventory.push({
        source_id: 'rag_1',
        source_type: 'rag',
        purpose: '资料库背景与术语补充',
        authority: 'supporting',
      });
    }
  }

  return {
    schema_version: '2.0',
    task_summary: asString(source.task_summary || source.user_goal || input.title, '未提及'),
    user_goal: asString(source.user_goal || input.title, '未提及'),
    selected_skill: selectedSkill,
    confidence: oneOf(source.confidence, ['high', 'medium', 'low'], 'medium'),
    audience: stringList(source.audience),
    deliverable: {
      type: asString(deliverable.type, defaultDeliverableType),
      language: asString(deliverable.language, 'zh-CN'),
      tone: asString(deliverable.tone, 'professional'),
      format: asString(deliverable.format, '结构化 JSON + 可复制文档'),
    },
    source_inventory: sourceInventory,
    known_facts: asArray(source.known_facts)
      .map((entry) =>
        entry && typeof entry === 'object' && asString(entry.fact).trim()
          ? { fact: asString(entry.fact), source_id: asString(entry.source_id, 'primary_input'), evidence: asString(entry.evidence) }
          : null,
      )
      .filter(Boolean),
    assumptions: asArray(source.assumptions)
      .map((entry) => {
        if (typeof entry === 'string') {
          return entry.trim() ? { assumption: entry.trim(), reason: '', needs_confirmation: true } : null;
        }

        if (!entry || typeof entry !== 'object' || !asString(entry.assumption).trim()) {
          return null;
        }

        return {
          assumption: asString(entry.assumption),
          reason: asString(entry.reason),
          needs_confirmation: entry.needs_confirmation === undefined ? true : Boolean(entry.needs_confirmation),
        };
      })
      .filter(Boolean),
    missing_information: normalizeMissingInformation(source.missing_information),
    success_criteria: stringList(source.success_criteria),
    execution_steps: normalizeExecutionSteps(source.execution_steps),
    output_outline: stringList(source.output_outline),
    risk_register: normalizeRiskRegister(
      asArray(source.risk_register).length ? source.risk_register : source.risk_notes,
    ),
    safety_checks: stringList(source.safety_checks),
    expected_outputs: stringList(source.expected_outputs),
    clarification_questions: stringList(source.clarification_questions),
  };
}

const QUALITY_SCORE_KEYS = ['factuality', 'completeness', 'actionability', 'clarity', 'professionalism', 'safety'];

function clampScore(value, fallback = 3) {
  const num = Number(value);

  if (!Number.isFinite(num)) {
    return fallback;
  }

  return Math.min(5, Math.max(1, Math.round(num)));
}

function normalizeIssues(value) {
  return asArray(value)
    .map((entry) => {
      if (typeof entry === 'string') {
        return entry.trim()
          ? { severity: 'medium', category: '其他', field_path: '', problem: entry.trim(), evidence: '', required_fix: '' }
          : null;
      }

      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const problem = asString(entry.problem || entry.issue || '').trim();
      return problem
        ? {
            severity: oneOf(entry.severity, ['critical', 'high', 'medium', 'low'], 'medium'),
            category: asString(entry.category, '其他'),
            field_path: asString(entry.field_path),
            problem,
            evidence: asString(entry.evidence),
            required_fix: asString(entry.required_fix),
          }
        : null;
    })
    .filter(Boolean);
}

function issuesFromLegacyList(list, severity, category) {
  return asArray(list)
    .map((item) => asString(item).trim())
    .filter(Boolean)
    .map((problem) => ({ severity, category, field_path: '', problem, evidence: '', required_fix: '' }));
}

/**
 * Normalize a quality-check payload into the unified quality-gate shape.
 * Accepts the v2 schema, the legacy office shape (copy_ready_score 1-5,
 * overclaim_items…) and the legacy meeting shape (questionable_decisions…).
 */
export function normalizeQualityGate(check = {}) {
  const source = check && typeof check === 'object' ? check : {};
  const isLegacyOffice =
    !source.verdict &&
    (source.copy_ready_score !== undefined || source.overclaim_items !== undefined || source.unclear_items !== undefined);
  const isLegacyMeeting =
    !source.verdict &&
    (source.questionable_decisions !== undefined || source.questionable_action_items !== undefined ||
      source.missing_risks_or_questions !== undefined);

  if (isLegacyOffice || isLegacyMeeting) {
    const hallucination = Boolean(source.has_hallucination);
    const issues = [
      ...issuesFromLegacyList(source.hallucination_items, 'high', '幻觉'),
      ...issuesFromLegacyList(source.overclaim_items, 'high', '夸大表述'),
      ...issuesFromLegacyList(source.questionable_decisions, 'high', '决策依据不足'),
      ...issuesFromLegacyList(source.questionable_action_items, 'high', '待办依据不足'),
      ...issuesFromLegacyList(source.unclear_items, 'medium', '表述不清'),
    ];
    const legacyScore = isLegacyOffice ? clampScore(source.copy_ready_score, hallucination ? 2 : 4) : hallucination ? 2 : 4;
    const verdict = hallucination || legacyScore <= 1 ? (legacyScore <= 1 ? 'blocked' : 'revise') : legacyScore >= 4 ? 'pass' : 'revise';
    const scores = Object.fromEntries(QUALITY_SCORE_KEYS.map((key) => [key, legacyScore]));
    scores.factuality = hallucination ? 2 : legacyScore;

    return {
      verdict,
      scores,
      issues,
      missing_information: [
        ...stringList(source.missing_key_points),
        ...stringList(source.missing_risks_or_questions),
      ],
      revision_summary: stringList(source.revision_suggestions),
      copy_ready: verdict === 'pass',
    };
  }

  const verdict = oneOf(source.verdict, ['pass', 'revise', 'blocked'], 'pass');
  const rawScores = source.scores && typeof source.scores === 'object' ? source.scores : {};

  return {
    verdict,
    scores: Object.fromEntries(QUALITY_SCORE_KEYS.map((key) => [key, clampScore(rawScores[key])])),
    issues: normalizeIssues(source.issues),
    missing_information: stringList(source.missing_information),
    revision_summary: stringList(source.revision_summary),
    copy_ready: source.copy_ready === undefined ? verdict === 'pass' : Boolean(source.copy_ready),
  };
}

/** One targeted revision is triggered by a revise/blocked-level result only. */
export function shouldRevise(check) {
  if (!check || typeof check !== 'object') {
    return false;
  }

  if (check.verdict === 'revise' || check.verdict === 'blocked') {
    return true;
  }

  return asArray(check.issues).some((issue) => issue?.severity === 'critical' || issue?.severity === 'high');
}

export function normalizeMinutes(minutes = {}, input = {}, understanding = {}) {
  const source = minutes && typeof minutes === 'object' ? minutes : {};

  return {
    meeting_type: source.meeting_type || understanding.meeting_type || input.meeting_type || '其他',
    meeting_purpose: asString(source.meeting_purpose, '未提及'),
    one_sentence_summary: source.one_sentence_summary || '未提及',
    summary: source.summary || '未提及',
    discussion_topics: asArray(source.discussion_topics)
      .map((entry) => {
        if (typeof entry === 'string') {
          return entry.trim() ? { topic: entry.trim(), key_points: [] } : null;
        }

        if (!entry || typeof entry !== 'object' || !asString(entry.topic).trim()) {
          return null;
        }

        return { topic: asString(entry.topic), key_points: stringList(entry.key_points) };
      })
      .filter(Boolean),
    decisions: asArray(source.decisions),
    proposals: asArray(source.proposals)
      .map((entry) => {
        if (typeof entry === 'string') {
          return entry.trim() ? { proposal: entry.trim(), status: '讨论中' } : null;
        }

        if (!entry || typeof entry !== 'object' || !asString(entry.proposal).trim()) {
          return null;
        }

        return { proposal: asString(entry.proposal), status: oneOf(entry.status, ['讨论中', '建议'], '讨论中') };
      })
      .filter(Boolean),
    action_items: asArray(source.action_items).map((entry) => {
      const item = entry && typeof entry === 'object' ? entry : { task: asString(entry) };

      return {
        task: asString(item.task),
        owner: asString(item.owner, '未提及') || '未提及',
        deadline: asString(item.deadline, '未提及') || '未提及',
        priority: asString(item.priority, 'medium'),
        status: asString(item.status, '未提及') || '未提及',
        dependencies: stringList(item.dependencies),
        completion_criteria: asString(item.completion_criteria),
        evidence: asString(item.evidence),
      };
    }),
    risks: asArray(source.risks),
    open_questions: asArray(source.open_questions),
    follow_ups: stringList(source.follow_ups),
    long_term_memory: asArray(source.long_term_memory),
    keywords: asArray(source.keywords),
    copy_ready_minutes: asString(source.copy_ready_minutes),
  };
}

export function normalizeWeeklyOutput(output = {}) {
  const source = output && typeof output === 'object' ? output : {};

  return {
    reporting_period: asString(source.reporting_period, '未提及'),
    one_sentence_summary: asString(source.one_sentence_summary, '未提及'),
    executive_summary: asString(source.executive_summary || source.one_sentence_summary, '未提及'),
    completed_items: asArray(source.completed_items).map((entry) => ({
      item: asString(entry?.item ?? entry),
      evidence: asString(entry?.evidence),
      impact: asString(entry?.impact),
    })),
    in_progress: asArray(source.in_progress).map((entry) => ({
      item: asString(entry?.item ?? entry),
      status: asString(entry?.status, '进行中'),
      evidence: asString(entry?.evidence),
    })),
    key_progress: stringList(source.key_progress),
    milestones_or_metrics: stringList(source.milestones_or_metrics),
    risks: asArray(source.risks).map((entry) => ({
      risk: asString(entry?.risk ?? entry),
      impact: asString(entry?.impact),
      suggestion: asString(entry?.suggestion),
    })),
    blockers: stringList(source.blockers),
    dependencies: stringList(source.dependencies),
    support_needed: stringList(source.support_needed),
    next_week_plan: asArray(source.next_week_plan).map((entry) => {
      if (typeof entry === 'string') {
        return { objective: entry, deliverable: '', priority: 'medium', deadline: '', dependency: '', basis: '建议（需确认）' };
      }

      const item = entry && typeof entry === 'object' ? entry : {};
      return {
        objective: asString(item.objective || item.plan),
        deliverable: asString(item.deliverable),
        priority: oneOf(item.priority, ['high', 'medium', 'low'], 'medium'),
        deadline: asString(item.deadline, '未提及') || '未提及',
        dependency: asString(item.dependency),
        basis: asString(item.basis, '建议（需确认）'),
      };
    }),
    cross_team_items: stringList(source.cross_team_items),
    management_highlights: stringList(source.management_highlights),
    copy_ready_report: asString(source.copy_ready_report),
  };
}

export function normalizePrdOutput(output = {}) {
  const source = output && typeof output === 'object' ? output : {};
  const readiness = source.review_readiness && typeof source.review_readiness === 'object' ? source.review_readiness : {};

  return {
    review_readiness: {
      level: oneOf(readiness.level, ['ready', 'needs_work', 'not_ready'], 'needs_work'),
      conclusion: asString(readiness.conclusion),
    },
    background: asString(source.background, '未提及'),
    problem_statement: asString(source.problem_statement, '未提及'),
    target_users: stringList(source.target_users),
    user_scenarios: stringList(source.user_scenarios),
    user_pain_points: asArray(source.user_pain_points).map((entry) => ({
      pain: asString(entry?.pain ?? entry),
      source: asString(entry?.source, '未提及'),
      severity: oneOf(entry?.severity, ['high', 'medium', 'low'], 'medium'),
    })),
    product_goals: stringList(source.product_goals),
    non_goals: stringList(source.non_goals),
    success_metrics: asArray(source.success_metrics).map((entry) => {
      if (typeof entry === 'string') {
        return { metric: entry, status: '建议（需确认）' };
      }

      return { metric: asString(entry?.metric), status: asString(entry?.status, '建议（需确认）') };
    }),
    scope: stringList(source.scope),
    out_of_scope: stringList(source.out_of_scope),
    user_flow: stringList(source.user_flow),
    functional_requirements: asArray(source.functional_requirements).map((entry, index) => ({
      id: asString(entry?.id, `FR-${String(index + 1).padStart(2, '0')}`),
      requirement: asString(entry?.requirement ?? entry),
      priority: asString(entry?.priority, 'P1'),
    })),
    business_rules: stringList(source.business_rules),
    state_and_permission_notes: stringList(source.state_and_permission_notes),
    data_api_analytics: stringList(source.data_api_analytics),
    non_functional_requirements: stringList(source.non_functional_requirements),
    dependencies: stringList(source.dependencies),
    edge_cases: stringList(source.edge_cases),
    acceptance_criteria: asArray(source.acceptance_criteria).map((entry) => ({
      criterion: asString(entry?.criterion ?? entry),
      given: asString(entry?.given),
      when: asString(entry?.when),
      then: asString(entry?.then),
      verification_method: asString(entry?.verification_method),
    })),
    engineering_notes: stringList(source.engineering_notes),
    testing_notes: stringList(source.testing_notes),
    risks: asArray(source.risks).map((entry) => ({
      risk: asString(entry?.risk ?? entry),
      mitigation: asString(entry?.mitigation),
    })),
    open_questions: stringList(source.open_questions),
    rollout_notes: stringList(source.rollout_notes),
    prd_draft: asString(source.prd_draft),
  };
}

// --- Orchestration ---------------------------------------------------------
// Every orchestrator accepts an optional `deps` bag so tests can stub the
// model call (`deps.chatJson`) without network access. Route call sites in
// index.js pass three arguments and are unchanged.

const failedQualityGate = (note) =>
  normalizeQualityGate({ verdict: 'pass', copy_ready: true, revision_summary: [note] });

/**
 * Quality gate + at most one targeted revision. `normalize` re-normalizes the
 * revised draft; returns the final draft, gate result, and whether a revision
 * was applied. Bounded: 1 gate call, ≤1 revision call, ≤1 re-check call.
 */
async function runQualityLoop({ chat, provider, warnings, buildGate, buildRevision, normalize, draft }) {
  let quality_check;
  let revision_applied = false;

  try {
    quality_check = normalizeQualityGate(
      await chat(buildGate(draft), { provider, temperature: 0, max_tokens: TOKEN_BUDGETS.quality, timeout_ms: 45000 }),
    );
  } catch (error) {
    warnings.push(`质量自检未完成：${errorMessage(error)}`);
    return { draft, quality_check: failedQualityGate('质量自检请求失败，但输出已成功生成。'), revision_applied };
  }

  if (!shouldRevise(quality_check)) {
    return { draft, quality_check, revision_applied };
  }

  try {
    const revised = await chat(buildRevision(draft, quality_check), {
      provider,
      temperature: 0.1,
      max_tokens: TOKEN_BUDGETS.revision,
    });
    draft = normalize(revised);
    revision_applied = true;
  } catch (error) {
    warnings.push(`定向修订未完成，保留原始输出：${errorMessage(error)}`);
    return { draft, quality_check, revision_applied };
  }

  try {
    quality_check = normalizeQualityGate(
      await chat(buildGate(draft), { provider, temperature: 0, max_tokens: TOKEN_BUDGETS.quality, timeout_ms: 45000 }),
    );
  } catch (error) {
    warnings.push(`修订后复检未完成：${errorMessage(error)}`);
  }

  return { draft, quality_check, revision_applied };
}

export async function analyzeMeeting(input, context, provider = {}, deps = {}) {
  const chat = deps.chatJson ?? chatJson;
  const ragContext = await retrieveRagContext(context, input.raw_transcript, input.rag || {});

  if (!hasProviderConfig(provider)) {
    const result = fallbackAnalysis(input);
    return { ...result, rag: ragContext };
  }

  try {
    const meeting_understanding = await chat(buildUnderstandingMessages(input, ragContext), {
      provider,
      temperature: 0.1,
      max_tokens: TOKEN_BUDGETS.understanding,
    });
    const minutes = await chat(buildMinutesMessages(input, meeting_understanding, ragContext), {
      provider,
      temperature: 0.15,
      max_tokens: TOKEN_BUDGETS.minutes,
    });
    const warnings = [];
    const { draft, quality_check, revision_applied } = await runQualityLoop({
      chat,
      provider,
      warnings,
      draft: normalizeMinutes(minutes, input, meeting_understanding),
      buildGate: (current) => buildQualityCheckMessages(input, current),
      buildRevision: (current, check) => buildRevisionMessages(input, {}, current, check, 'meeting_minutes'),
      normalize: (revised) => normalizeMinutes(revised, input, meeting_understanding),
    });

    return {
      source: 'default-api',
      provider: getProviderMeta(provider),
      warnings,
      rag: ragContext,
      meeting_understanding,
      structured_minutes: draft,
      quality_check,
      revision_applied,
    };
  } catch (error) {
    const result = fallbackAnalysis(input, errorMessage(error));
    return { ...result, rag: ragContext };
  }
}

export async function planOfficeTask(input, context, provider = {}, deps = {}) {
  const chat = deps.chatJson ?? chatJson;
  const enrichedInput = await withLinkedMeetings(context, input);
  const ragContext = await retrieveRagContext(context, officeQuery(enrichedInput), enrichedInput.rag || {});

  if (!hasProviderConfig(provider)) {
    return {
      source: 'demo-fallback',
      provider: null,
      warnings: ['未配置可用的自定义 AI 配置，当前执行计划来自本地演示规划。'],
      rag: ragContext,
      agent_plan: fallbackOfficePlan(enrichedInput, ragContext),
    };
  }

  try {
    const plan = await chat(buildOfficePlanMessages(enrichedInput, ragContext), {
      provider,
      temperature: 0.1,
      max_tokens: TOKEN_BUDGETS.plan,
    });

    return {
      source: 'default-api',
      provider: getProviderMeta(provider),
      warnings: [],
      rag: ragContext,
      agent_plan: normalizeAgentPlan(plan, enrichedInput, ragContext),
    };
  } catch (error) {
    return {
      source: 'demo-fallback',
      provider: null,
      warnings: [errorMessage(error)],
      rag: ragContext,
      agent_plan: fallbackOfficePlan(enrichedInput, ragContext, errorMessage(error)),
    };
  }
}

export async function runOfficeSkill(input, context, provider = {}, deps = {}) {
  const chat = deps.chatJson ?? chatJson;
  const enrichedInput = await withLinkedMeetings(context, input);
  const ragContext = await retrieveRagContext(context, officeQuery(enrichedInput), enrichedInput.rag || {});

  if (input.skill_id === 'meeting_minutes') {
    const meetingInput = {
      title: input.title,
      date: input.date || new Date().toISOString().slice(0, 10),
      meeting_type: input.metadata?.meeting_type || '自动识别',
      participants: input.metadata?.participants || '',
      raw_transcript: input.content || '',
      rag: input.rag,
    };
    const planWarnings = [];
    // The plan call only depends on the input + RAG, so it runs in parallel
    // with the meeting analysis chain instead of falling back to the local
    // demo plan as before.
    const planPromise = hasProviderConfig(provider)
      ? chat(buildOfficePlanMessages(enrichedInput, ragContext), {
          provider,
          temperature: 0.1,
          max_tokens: TOKEN_BUDGETS.plan,
        })
          .then((plan) => normalizeAgentPlan(plan, enrichedInput, ragContext))
          .catch((error) => {
            planWarnings.push(`执行计划生成失败，已使用本地规划：${errorMessage(error)}`);
            return fallbackOfficePlan(enrichedInput, ragContext, errorMessage(error));
          })
      : Promise.resolve(fallbackOfficePlan(enrichedInput, ragContext));
    const [agent_plan, meetingAnalysis] = await Promise.all([
      planPromise,
      analyzeMeeting(meetingInput, context, provider, deps),
    ]);

    return {
      source: meetingAnalysis.source,
      provider: meetingAnalysis.provider,
      warnings: [...meetingAnalysis.warnings, ...planWarnings],
      rag: meetingAnalysis.rag || ragContext,
      agent_plan,
      skill_output: meetingAnalysis.structured_minutes,
      quality_check: normalizeQualityGate(meetingAnalysis.quality_check),
      revision_applied: Boolean(meetingAnalysis.revision_applied),
    };
  }

  if (!hasProviderConfig(provider)) {
    return fallbackOfficeRun(enrichedInput, ragContext);
  }

  try {
    const planPayload = await chat(buildOfficePlanMessages(enrichedInput, ragContext), {
      provider,
      temperature: 0.1,
      max_tokens: TOKEN_BUDGETS.plan,
    });
    const agent_plan = normalizeAgentPlan(planPayload, enrichedInput, ragContext);
    const isPrd = agent_plan.selected_skill === 'prd_review';
    const normalizeOutput = isPrd ? normalizePrdOutput : normalizeWeeklyOutput;
    const rawOutput = await chat(
      isPrd
        ? buildPrdReviewMessages(enrichedInput, agent_plan, ragContext)
        : buildWeeklyReportMessages(enrichedInput, agent_plan, ragContext),
      {
        provider,
        temperature: 0.15,
        max_tokens: isPrd ? TOKEN_BUDGETS.prd : TOKEN_BUDGETS.weekly,
      },
    );
    const warnings = [];
    const { draft, quality_check, revision_applied } = await runQualityLoop({
      chat,
      provider,
      warnings,
      draft: normalizeOutput(rawOutput),
      buildGate: (current) => buildOfficeQualityCheckMessages(enrichedInput, agent_plan, current),
      buildRevision: (current, check) =>
        buildRevisionMessages(enrichedInput, agent_plan, current, check, agent_plan.selected_skill),
      normalize: normalizeOutput,
    });

    return {
      source: 'default-api',
      provider: getProviderMeta(provider),
      warnings,
      rag: ragContext,
      agent_plan,
      skill_output: draft,
      quality_check,
      revision_applied,
    };
  } catch (error) {
    return fallbackOfficeRun(enrichedInput, ragContext, errorMessage(error));
  }
}

export async function summarizeFeedback(input, provider = {}, deps = {}) {
  const chat = deps.chatJson ?? chatJson;

  if (!hasProviderConfig(provider)) {
    return fallbackFeedbackSummary(input);
  }

  try {
    return await chat(buildFeedbackSummaryMessages(input), {
      provider,
      temperature: 0.1,
      max_tokens: TOKEN_BUDGETS.feedback,
    });
  } catch (error) {
    return fallbackFeedbackSummary(input, errorMessage(error));
  }
}

/** Internal triage for feedback tickets. Never blocks ticket creation. */
export async function triageFeedbackTicket(ticket, provider = {}, deps = {}) {
  const chat = deps.chatJson ?? chatJson;

  if (!hasProviderConfig(provider)) {
    return fallbackTicketTriage(ticket);
  }

  try {
    const triage = await chat(buildTicketTriageMessages(ticket), {
      provider,
      temperature: 0.1,
      max_tokens: TOKEN_BUDGETS.triage,
    });

    return {
      summary: asString(triage?.summary, '用户提交了反馈工单。'),
      category: asString(triage?.category, '其他'),
      priority: oneOf(triage?.priority, ['high', 'medium', 'low'], 'medium'),
    };
  } catch (error) {
    return fallbackTicketTriage(ticket, errorMessage(error));
  }
}

export async function answerQuestion(meeting, question, provider = {}, deps = {}) {
  const chat = deps.chatJson ?? chatJson;

  if (!hasProviderConfig(provider)) {
    return fallbackAnswer(meeting, question);
  }

  try {
    const answer = await chat(buildAskMessages(meeting, question), {
      provider,
      temperature: 0.1,
    });

    return {
      answer: answer.answer || '这条会议记录中没有明确提到',
      evidence: answer.evidence || '',
      confidence: answer.confidence || 'medium',
      source: 'default-api',
      warnings: [],
    };
  } catch (error) {
    return fallbackAnswer(meeting, question, errorMessage(error));
  }
}
