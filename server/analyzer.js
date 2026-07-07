import {
  buildAskMessages,
  buildFeedbackSummaryMessages,
  buildMinutesMessages,
  buildOfficePlanMessages,
  buildOfficeQualityCheckMessages,
  buildPrdReviewMessages,
  buildQualityCheckMessages,
  buildUnderstandingMessages,
  buildWeeklyReportMessages,
} from './prompts.js';
import { chatJson, getProviderMeta, hasProviderConfig } from './gemini.js';
import { fallbackAnalysis, fallbackAnswer, fallbackFeedbackSummary, fallbackOfficePlan, fallbackOfficeRun } from './mock.js';
import { retrieveRagContext } from './rag.js';
import { getMeeting } from './storage.js';

const MAX_LINKED_MEETINGS = 6;

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

function normalizeMinutes(minutes, input, understanding) {
  return {
    meeting_type:
      minutes.meeting_type ||
      understanding.meeting_type ||
      input.meeting_type ||
      '其他',
    one_sentence_summary: minutes.one_sentence_summary || '未提及',
    summary: minutes.summary || '未提及',
    decisions: Array.isArray(minutes.decisions) ? minutes.decisions : [],
    action_items: Array.isArray(minutes.action_items) ? minutes.action_items : [],
    risks: Array.isArray(minutes.risks) ? minutes.risks : [],
    open_questions: Array.isArray(minutes.open_questions) ? minutes.open_questions : [],
    long_term_memory: Array.isArray(minutes.long_term_memory) ? minutes.long_term_memory : [],
    keywords: Array.isArray(minutes.keywords) ? minutes.keywords : [],
  };
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

function normalizeAgentPlan(plan, input, ragContext) {
  const selectedSkill = ['meeting_minutes', 'weekly_report', 'prd_review'].includes(plan.selected_skill)
    ? plan.selected_skill
    : input.skill_id || 'weekly_report';

  return {
    user_goal: plan.user_goal || input.title || '未提及',
    detected_intent: plan.detected_intent || selectedSkill,
    selected_skill: selectedSkill,
    confidence: plan.confidence || 'medium',
    required_inputs: Array.isArray(plan.required_inputs) ? plan.required_inputs : [],
    missing_information: Array.isArray(plan.missing_information) ? plan.missing_information : [],
    use_rag: typeof plan.use_rag === 'boolean' ? plan.use_rag : Boolean(ragContext?.enabled),
    execution_steps: Array.isArray(plan.execution_steps) ? plan.execution_steps : [],
    expected_outputs: Array.isArray(plan.expected_outputs) ? plan.expected_outputs : [],
    risk_notes: Array.isArray(plan.risk_notes) ? plan.risk_notes : [],
  };
}

function normalizeOfficeQualityCheck(check) {
  return {
    has_hallucination: Boolean(check.has_hallucination),
    hallucination_items: Array.isArray(check.hallucination_items) ? check.hallucination_items : [],
    overclaim_items: Array.isArray(check.overclaim_items) ? check.overclaim_items : [],
    missing_key_points: Array.isArray(check.missing_key_points) ? check.missing_key_points : [],
    unclear_items: Array.isArray(check.unclear_items) ? check.unclear_items : [],
    copy_ready_score: Number(check.copy_ready_score || 0),
    revision_suggestions: Array.isArray(check.revision_suggestions) ? check.revision_suggestions : [],
  };
}

export async function analyzeMeeting(input, context, provider = {}) {
  const ragContext = await retrieveRagContext(context, input.raw_transcript, input.rag || {});

  if (!hasProviderConfig(provider)) {
    const result = fallbackAnalysis(input);
    return { ...result, rag: ragContext };
  }

  try {
    const meeting_understanding = await chatJson(buildUnderstandingMessages(input, ragContext), {
      provider,
      temperature: 0.1,
      max_tokens: 700,
    });
    const minutes = await chatJson(buildMinutesMessages(input, meeting_understanding, ragContext), {
      provider,
      temperature: 0.15,
      max_tokens: 2200,
    });
    const structured_minutes = normalizeMinutes(minutes, input, meeting_understanding);
    let quality_check;
    const warnings = [];

    try {
      quality_check = await chatJson(
        buildQualityCheckMessages(input, structured_minutes),
        { provider, temperature: 0, max_tokens: 700, timeout_ms: 45000 },
      );
    } catch (error) {
      warnings.push(`质量自检未完成：${error instanceof Error ? error.message : String(error)}`);
      quality_check = {
        has_hallucination: false,
        hallucination_items: [],
        questionable_decisions: [],
        questionable_action_items: [],
        missing_risks_or_questions: [],
        revision_suggestions: ['质量自检请求失败，但结构化纪要已成功生成。'],
      };
    }

    return {
      source: 'default-api',
      provider: getProviderMeta(provider),
      warnings,
      rag: ragContext,
      meeting_understanding,
      structured_minutes,
      quality_check,
    };
  } catch (error) {
    const result = fallbackAnalysis(input, error instanceof Error ? error.message : String(error));
    return { ...result, rag: ragContext };
  }
}

export async function planOfficeTask(input, context, provider = {}) {
  const enrichedInput = await withLinkedMeetings(context, input);
  const ragContext = await retrieveRagContext(context, officeQuery(enrichedInput), enrichedInput.rag || {});

  if (!hasProviderConfig(provider)) {
    return {
      source: 'demo-fallback',
      provider: null,
      warnings: ['未配置可用的自定义 AI 配置，当前 Agent Plan 来自本地演示规划。'],
      rag: ragContext,
      agent_plan: fallbackOfficePlan(enrichedInput, ragContext),
    };
  }

  try {
    const plan = await chatJson(buildOfficePlanMessages(enrichedInput, ragContext), {
      provider,
      temperature: 0.1,
      max_tokens: 900,
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
      warnings: [error instanceof Error ? error.message : String(error)],
      rag: ragContext,
      agent_plan: fallbackOfficePlan(enrichedInput, ragContext, error instanceof Error ? error.message : String(error)),
    };
  }
}

export async function runOfficeSkill(input, context, provider = {}) {
  const enrichedInput = await withLinkedMeetings(context, input);
  const ragContext = await retrieveRagContext(context, officeQuery(enrichedInput), enrichedInput.rag || {});

  if (input.skill_id === 'meeting_minutes') {
    const meetingAnalysis = await analyzeMeeting(
      {
        title: input.title,
        date: input.date || new Date().toISOString().slice(0, 10),
        meeting_type: input.metadata?.meeting_type || '自动识别',
        participants: input.metadata?.participants || '',
        raw_transcript: input.content || '',
        rag: input.rag,
      },
      context,
      provider,
    );
    const plan = fallbackOfficePlan(input, meetingAnalysis.rag || ragContext);

    return {
      source: meetingAnalysis.source,
      provider: meetingAnalysis.provider,
      warnings: meetingAnalysis.warnings,
      rag: meetingAnalysis.rag || ragContext,
      agent_plan: plan,
      skill_output: meetingAnalysis.structured_minutes,
      quality_check: {
        has_hallucination: meetingAnalysis.quality_check.has_hallucination,
        hallucination_items: meetingAnalysis.quality_check.hallucination_items || [],
        overclaim_items: [
          ...(meetingAnalysis.quality_check.questionable_decisions || []),
          ...(meetingAnalysis.quality_check.questionable_action_items || []),
        ],
        missing_key_points: meetingAnalysis.quality_check.missing_risks_or_questions || [],
        unclear_items: [],
        copy_ready_score: meetingAnalysis.quality_check.has_hallucination ? 2 : 4,
        revision_suggestions: meetingAnalysis.quality_check.revision_suggestions || [],
      },
    };
  }

  if (!hasProviderConfig(provider)) {
    return fallbackOfficeRun(enrichedInput, ragContext);
  }

  try {
    const planPayload = await chatJson(buildOfficePlanMessages(enrichedInput, ragContext), {
      provider,
      temperature: 0.1,
      max_tokens: 900,
    });
    const agent_plan = normalizeAgentPlan(planPayload, enrichedInput, ragContext);
    const messages =
      agent_plan.selected_skill === 'prd_review'
        ? buildPrdReviewMessages(enrichedInput, agent_plan, ragContext)
        : buildWeeklyReportMessages(enrichedInput, agent_plan, ragContext);
    const skill_output = await chatJson(messages, {
      provider,
      temperature: 0.15,
      max_tokens: agent_plan.selected_skill === 'prd_review' ? 2600 : 1800,
    });
    let quality_check;
    const warnings = [];

    try {
      const check = await chatJson(buildOfficeQualityCheckMessages(enrichedInput, agent_plan, skill_output), {
        provider,
        temperature: 0,
        max_tokens: 800,
        timeout_ms: 45000,
      });
      quality_check = normalizeOfficeQualityCheck(check);
    } catch (error) {
      warnings.push(`办公输出质量自检未完成：${error instanceof Error ? error.message : String(error)}`);
      quality_check = normalizeOfficeQualityCheck({
        has_hallucination: false,
        copy_ready_score: 3,
        revision_suggestions: ['质量自检请求失败，但 Skill 输出已成功生成。'],
      });
    }

    return {
      source: 'default-api',
      provider: getProviderMeta(provider),
      warnings,
      rag: ragContext,
      agent_plan,
      skill_output,
      quality_check,
    };
  } catch (error) {
    return fallbackOfficeRun(enrichedInput, ragContext, error instanceof Error ? error.message : String(error));
  }
}

export async function summarizeFeedback(input, provider = {}) {
  if (!hasProviderConfig(provider)) {
    return fallbackFeedbackSummary(input);
  }

  try {
    return await chatJson(buildFeedbackSummaryMessages(input), {
      provider,
      temperature: 0.1,
      max_tokens: 800,
    });
  } catch (error) {
    return fallbackFeedbackSummary(input, error instanceof Error ? error.message : String(error));
  }
}

export async function answerQuestion(meeting, question, provider = {}) {
  if (!hasProviderConfig(provider)) {
    return fallbackAnswer(meeting, question);
  }

  try {
    const answer = await chatJson(buildAskMessages(meeting, question), {
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
    return fallbackAnswer(meeting, question, error instanceof Error ? error.message : String(error));
  }
}
