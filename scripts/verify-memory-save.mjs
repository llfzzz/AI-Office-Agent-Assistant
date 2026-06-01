import { randomBytes } from 'node:crypto';

const apiBaseUrl = process.env.VERIFY_API_BASE_URL || 'http://127.0.0.1:8788/api';
const pocketBaseUrl = process.env.PB_URL || 'http://127.0.0.1:8090';
const suffix = `${Date.now()}-${randomBytes(3).toString('hex')}`;
const email = `codex-memory-${suffix}@example.com`;
const password = `Memory-${randomBytes(8).toString('hex')}!`;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function requestJson(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, options);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`${path} failed (${response.status}): ${payload.error || JSON.stringify(payload)}`);
  }

  return payload;
}

function authHeaders(token, extra = {}) {
  return {
    Authorization: `Bearer ${token}`,
    ...extra,
  };
}

function analysis(summary = '保存测试摘要') {
  return {
    source: 'default-api',
    provider: {
      base_url: 'https://generativelanguage.googleapis.com/v1beta',
      model: 'gemini-3-flash-preview',
      configured: true,
    },
    warnings: [],
    meeting_understanding: {
      meeting_type: '项目进度会',
      main_topic: summary,
      top_themes: ['保存测试'],
      has_clear_decision: true,
      has_action_items: true,
      notes_for_extraction: '',
    },
    structured_minutes: {
      meeting_type: '项目进度会',
      one_sentence_summary: summary,
      summary,
      decisions: [{ decision: '保存会议纪要', evidence: '明确要求保存', confidence: 'high' }],
      action_items: [{ task: '验证记忆库', owner: '测试账号', deadline: '今天', priority: 'high', evidence: '明确要求验证' }],
      risks: [],
      open_questions: [],
      long_term_memory: [{ memory: '会议纪要需要保存到记忆库', category: '产品规则' }],
      keywords: ['记忆库'],
    },
    quality_check: {
      has_hallucination: false,
      hallucination_items: [],
      questionable_decisions: [],
      questionable_action_items: [],
      missing_risks_or_questions: [],
      revision_suggestions: [],
    },
  };
}

async function saveMeeting(token, input) {
  return requestJson('/meetings', {
    method: 'POST',
    headers: authHeaders(token, {
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify(input),
  });
}

async function main() {
  let session;

  try {
    session = await requestJson('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        name: 'Codex Memory Save Probe',
      }),
    });
    assert(session.token, 'Registration returned no token');
    console.log('auth: ok');

    const standard = await saveMeeting(session.token, {
      title: '普通纪要保存测试',
      date: '2026-06-01',
      meeting_type: '项目进度会',
      participants: '测试账号',
      raw_transcript: '会议决定验证记忆库保存。',
      analysis: analysis(),
    });
    assert(standard.meeting?.id, 'Standard meeting save returned no id');
    console.log('standard memory save: ok');

    const legacy = await saveMeeting(session.token, {
      title: '旧版记忆兼容测试',
      raw_transcript: '旧版会议记录',
      analysis: {
        summary: '旧版分析摘要',
      },
    });
    assert(
      legacy.meeting?.analysis?.structured_minutes?.summary === '旧版分析摘要',
      'Legacy meeting analysis was not normalized',
    );
    console.log('legacy memory normalization: ok');

    const longTranscript = '长会议记录。'.repeat(150000);
    const long = await saveMeeting(session.token, {
      title: '长转写保存测试',
      raw_transcript: longTranscript,
      analysis: analysis('长转写保存测试'),
    });
    assert(long.meeting?.raw_transcript?.length === longTranscript.length, 'Long transcript save was truncated');
    console.log('long transcript memory save: ok');

    const list = await requestJson('/meetings', {
      headers: authHeaders(session.token),
    });
    assert(list.meetings?.length === 3, `Expected 3 saved meetings, received ${list.meetings?.length}`);

    const detail = await requestJson(`/meetings/${standard.meeting.id}`, {
      headers: authHeaders(session.token),
    });
    assert(detail.meeting?.analysis?.structured_minutes?.summary, 'Meeting detail has no summary');
    console.log('memory list/detail: ok');
  } finally {
    if (session?.token && session?.user?.id) {
      const response = await fetch(`${pocketBaseUrl}/api/collections/users/records/${session.user.id}`, {
        method: 'DELETE',
        headers: authHeaders(session.token),
      });
      console.log(response.ok ? 'test account cleanup: ok' : `test account cleanup skipped (${response.status})`);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
