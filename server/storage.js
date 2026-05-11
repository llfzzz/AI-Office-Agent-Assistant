import { randomUUID } from 'node:crypto';

function normalizeJson(value, fallback) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  return value;
}

function recordToMeeting(record) {
  return {
    id: record.id,
    title: record.title || '未命名会议',
    date: record.date || '',
    meeting_type: record.meeting_type || '自动识别',
    participants: record.participants || '',
    raw_transcript: record.raw_transcript || '',
    analysis: normalizeJson(record.analysis, null),
    qa_history: normalizeJson(record.qa_history, []),
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
  const payload = {
    user: context.user.id,
    title: input.title || '未命名会议',
    date: input.date || new Date().toISOString().slice(0, 10),
    meeting_type: input.meeting_type || input.analysis?.structured_minutes?.meeting_type || '自动识别',
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
