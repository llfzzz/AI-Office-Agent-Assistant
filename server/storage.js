import { randomUUID } from 'node:crypto';
import { recordToFeedbackTicket } from './feedbackTickets.js';

function normalizeJson(value, fallback) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  return value;
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeDecisions(value) {
  return normalizeArray(value).map((item) =>
    typeof item === 'string'
      ? { decision: item, evidence: '', confidence: 'medium' }
      : {
          decision: item?.decision || item?.content || '未提及',
          evidence: item?.evidence || '',
          confidence: item?.confidence || 'medium',
        },
  );
}

function normalizeActionItems(value) {
  return normalizeArray(value).map((item) =>
    typeof item === 'string'
      ? { task: item, owner: '未提及', deadline: '未提及', priority: 'medium', evidence: '' }
      : {
          task: item?.task || item?.content || '未提及',
          owner: item?.owner || '未提及',
          deadline: item?.deadline || '未提及',
          priority: item?.priority || 'medium',
          evidence: item?.evidence || '',
        },
  );
}

function normalizeMemories(value) {
  return normalizeArray(value).map((item) =>
    typeof item === 'string'
      ? { memory: item, category: '会议记忆' }
      : {
          memory: item?.memory || item?.content || '未提及',
          category: item?.category || '会议记忆',
        },
  );
}

function normalizeMeetingAnalysis(value, record = {}) {
  const analysis = normalizeJson(value, {});
  const minutes = analysis.structured_minutes || analysis.minutes || {};
  const summary = minutes.summary || analysis.summary || '未提及';

  return {
    ...analysis,
    source: analysis.source || 'demo-fallback',
    provider: analysis.provider || null,
    warnings: normalizeArray(analysis.warnings),
    meeting_understanding: analysis.meeting_understanding || {
      meeting_type: minutes.meeting_type || record.meeting_type || '自动识别',
      main_topic: minutes.one_sentence_summary || summary,
      top_themes: [],
      has_clear_decision: normalizeArray(minutes.decisions).length > 0,
      has_action_items: normalizeArray(minutes.action_items).length > 0,
      notes_for_extraction: '已兼容旧版会议记忆结构。',
    },
    structured_minutes: {
      meeting_type: minutes.meeting_type || record.meeting_type || '自动识别',
      one_sentence_summary: minutes.one_sentence_summary || summary,
      summary,
      decisions: normalizeDecisions(minutes.decisions),
      action_items: normalizeActionItems(minutes.action_items),
      risks: normalizeArray(minutes.risks),
      open_questions: normalizeArray(minutes.open_questions),
      long_term_memory: normalizeMemories(minutes.long_term_memory),
      keywords: normalizeArray(minutes.keywords),
    },
    quality_check: {
      has_hallucination: Boolean(analysis.quality_check?.has_hallucination),
      hallucination_items: normalizeArray(analysis.quality_check?.hallucination_items),
      questionable_decisions: normalizeArray(analysis.quality_check?.questionable_decisions),
      questionable_action_items: normalizeArray(analysis.quality_check?.questionable_action_items),
      missing_risks_or_questions: normalizeArray(analysis.quality_check?.missing_risks_or_questions),
      revision_suggestions: normalizeArray(analysis.quality_check?.revision_suggestions),
    },
  };
}

function recordToMeeting(record) {
  return {
    id: record.id,
    title: record.title || '未命名会议',
    date: record.date || '',
    meeting_type: record.meeting_type || '自动识别',
    participants: record.participants || '',
    raw_transcript: record.raw_transcript || '',
    analysis: normalizeMeetingAnalysis(record.analysis, record),
    qa_history: normalizeArray(record.qa_history),
    created_at: record.created,
    updated_at: record.updated,
  };
}

function recordToOfficeOutput(record) {
  return {
    id: record.id,
    skill_id: record.skill_id,
    title: record.title || '未命名办公输出',
    input: normalizeJson(record.input, {}),
    agent_plan: normalizeJson(record.agent_plan, null),
    output: normalizeJson(record.output, null),
    quality_check: normalizeJson(record.quality_check, null),
    rag: normalizeJson(record.rag, null),
    created_at: record.created,
    updated_at: record.updated,
  };
}

function recordToOfficeFeedback(record) {
  return {
    id: record.id,
    office_output: record.office_output,
    skill_id: record.skill_id || '',
    output_title: record.output_title || '',
    accuracy_score: Number(record.accuracy_score || 0),
    copyability_score: Number(record.copyability_score || 0),
    completeness_score: Number(record.completeness_score || 0),
    needs_heavy_edit: Boolean(record.needs_heavy_edit),
    missing_info: record.missing_info || '',
    hallucination: record.hallucination || '',
    suggestion: record.suggestion || '',
    feedback_summary: normalizeJson(record.feedback_summary, null),
    created_at: record.created,
    updated_at: record.updated,
  };
}

function searchableText(meeting) {
  const minutes = meeting.analysis?.structured_minutes || {};
  return [
    meeting.title,
    meeting.date,
    meeting.meeting_type,
    meeting.participants,
    meeting.raw_transcript,
    minutes.meeting_type,
    minutes.one_sentence_summary,
    minutes.summary,
    ...(minutes.keywords || []),
    ...(minutes.long_term_memory || []).map((item) => item.memory),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export async function listMeetings(context, filters = {}) {
  const records = await context.pb.collection('meetings').getFullList({
    sort: '-created',
  });
  const meetings = records.map(recordToMeeting);
  const query = String(filters.search || '').trim().toLowerCase();
  const type = String(filters.type || '').trim();

  return meetings.filter((meeting) => {
    const minutesType = meeting.analysis?.structured_minutes?.meeting_type;
    const matchType = !type || type === '全部' || meeting.meeting_type === type || minutesType === type;
    const matchSearch = !query || searchableText(meeting).includes(query);
    return matchType && matchSearch;
  });
}

export async function getMeeting(context, id) {
  try {
    const record = await context.pb.collection('meetings').getOne(id);
    return recordToMeeting(record);
  } catch (error) {
    if (error?.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function saveMeeting(context, input) {
  // Treat '自动识别' (the default UI option) as "let the model decide": prefer the
  // detected type from the analysis so the memory library gets a real category.
  const chosenType = input.meeting_type && input.meeting_type !== '自动识别' ? input.meeting_type : '';
  const detectedType = input.analysis?.structured_minutes?.meeting_type;
  const payload = {
    user: context.user.id,
    title: input.title || '未命名会议',
    date: input.date || new Date().toISOString().slice(0, 10),
    meeting_type: chosenType || detectedType || '自动识别',
    participants: input.participants || '',
    raw_transcript: input.raw_transcript || '',
    analysis: input.analysis,
  };

  if (input.id) {
    const existing = await getMeeting(context, input.id);
    payload.qa_history = existing?.qa_history || [];
    const record = await context.pb.collection('meetings').update(input.id, payload);
    return recordToMeeting(record);
  }

  payload.qa_history = [];
  const record = await context.pb.collection('meetings').create(payload);
  return recordToMeeting(record);
}

export async function appendQuestionAnswer(context, meetingId, qa) {
  const meeting = await getMeeting(context, meetingId);

  if (!meeting) {
    return null;
  }

  const entry = {
    id: randomUUID(),
    question: qa.question,
    answer: qa.answer,
    evidence: qa.evidence || '',
    confidence: qa.confidence || 'medium',
    source: qa.source || 'demo-fallback',
    warnings: qa.warnings || [],
    created_at: new Date().toISOString(),
  };

  await context.pb.collection('qa_entries').create({
    user: context.user.id,
    meeting: meetingId,
    question: entry.question,
    answer: entry.answer,
    evidence: entry.evidence,
    confidence: entry.confidence,
    source: entry.source,
    warnings: entry.warnings,
  });

  await context.pb.collection('meetings').update(meetingId, {
    qa_history: [entry, ...(meeting.qa_history || [])],
  });

  return entry;
}

export async function listOfficeOutputs(context) {
  const records = await context.pb.collection('office_outputs').getFullList({
    sort: '-created',
  });
  return records.map(recordToOfficeOutput);
}

export async function getOfficeOutput(context, id) {
  try {
    const record = await context.pb.collection('office_outputs').getOne(id);
    return recordToOfficeOutput(record);
  } catch (error) {
    if (error?.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function saveOfficeOutput(context, input) {
  const taskInput = input.input || {};
  const result = input.result || input;
  const payload = {
    user: context.user.id,
    skill_id: taskInput.skill_id || input.skill_id || result.agent_plan?.selected_skill || 'weekly_report',
    title: taskInput.title || input.title || '未命名办公输出',
    input: taskInput,
    agent_plan: result.agent_plan,
    output: result.skill_output || result.output,
    quality_check: result.quality_check,
    rag: result.rag || taskInput.rag || {},
  };

  if (input.id) {
    const record = await context.pb.collection('office_outputs').update(input.id, payload);
    return recordToOfficeOutput(record);
  }

  const record = await context.pb.collection('office_outputs').create(payload);
  return recordToOfficeOutput(record);
}

export async function listOfficeFeedback(context) {
  const records = await context.pb.collection('office_feedback').getFullList({
    sort: '-created',
  });
  return records.map(recordToOfficeFeedback);
}

export async function saveOfficeFeedback(context, officeOutputId, feedback, feedbackSummary) {
  const output = await getOfficeOutput(context, officeOutputId);

  if (!output) {
    return null;
  }

  const payload = {
    user: context.user.id,
    office_output: officeOutputId,
    target_type: 'saved_output',
    target_id: officeOutputId,
    status: 'submitted',
    skill_id: output.skill_id,
    output_title: output.title,
    accuracy_score: Number(feedback.accuracy_score || 0),
    copyability_score: Number(feedback.copyability_score || 0),
    completeness_score: Number(feedback.completeness_score || 0),
    needs_heavy_edit: Boolean(feedback.needs_heavy_edit),
    missing_info: feedback.missing_info || '',
    hallucination: feedback.hallucination || '',
    suggestion: feedback.suggestion || '',
    feedback_summary: feedbackSummary || null,
  };

  const record = await context.pb.collection('office_feedback').create(payload);
  return recordToOfficeFeedback(record);
}

/** List every feedback row for the caller, projected as tickets (legacy rating
 * rows included via the compatibility mapping). */
export async function listFeedbackTickets(context) {
  const records = await context.pb.collection('office_feedback').getFullList({
    sort: '-created',
  });
  return records.map(recordToFeedbackTicket);
}

/**
 * Create a feedback ticket. When the ticket targets a saved output, the
 * caller-scoped lookup doubles as the ownership check — a foreign or missing
 * id returns null and the route responds 404.
 */
export async function saveFeedbackTicket(context, ticket, triage) {
  let output = null;

  if (ticket.target_type === 'saved_output' && ticket.target_id) {
    output = await getOfficeOutput(context, ticket.target_id);

    if (!output) {
      return null;
    }
  }

  const payload = {
    user: context.user.id,
    target_type: ticket.target_type,
    target_id: ticket.target_id || '',
    skill_id: ticket.skill_id || output?.skill_id || '',
    output_title: ticket.output_title || output?.title || '',
    issue_type: ticket.issue_type,
    subject: ticket.subject,
    details: ticket.details,
    expected_result: ticket.expected_result || '',
    impact: ticket.impact || '',
    status: 'submitted',
    triage: triage || null,
  };

  if (output) {
    payload.office_output = ticket.target_id;
  }

  const record = await context.pb.collection('office_feedback').create(payload);
  return recordToFeedbackTicket(record);
}
