import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';

const apiBaseUrl = process.env.VERIFY_API_BASE_URL || 'http://127.0.0.1:8788/api';
const pocketBaseUrl = process.env.PB_URL || 'http://127.0.0.1:8090';
const suffix = `${Date.now()}-${randomBytes(3).toString('hex')}`;
const email = `codex-gemini-${suffix}@example.com`;
const password = `Gemini-${randomBytes(8).toString('hex')}!`;

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

function createToneWav() {
  const sampleRate = 16000;
  const sampleCount = sampleRate;
  const dataSize = sampleCount * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let index = 0; index < sampleCount; index += 1) {
    const sample = Math.round(Math.sin((index / sampleRate) * Math.PI * 2 * 440) * 12000);
    buffer.writeInt16LE(sample, 44 + index * 2);
  }

  return buffer;
}

function createBrowserWebmRecording() {
  const result = spawnSync(ffmpegPath, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    'pipe:0',
    '-c:a',
    'libopus',
    '-f',
    'webm',
    'pipe:1',
  ], {
    input: createToneWav(),
    maxBuffer: 10 * 1024 * 1024,
  });

  assert(result.status === 0, `Unable to create WebM test recording: ${result.stderr.toString('utf8')}`);
  return result.stdout;
}

async function main() {
  let session;

  try {
    const health = await requestJson('/health');
    assert(health.provider?.configured, 'Gemini provider is not configured');
    assert(health.provider?.model, 'Gemini model is missing');
    console.log(`health: ok (${health.provider.model})`);

    session = await requestJson('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        name: 'Codex Gemini E2E',
      }),
    });
    assert(session.token, 'Registration did not return an auth token');
    console.log(`auth: ok (${email})`);

    const analysis = await requestJson('/meetings/analyze', {
      method: 'POST',
      headers: authHeaders(session.token, {
        'Content-Type': 'application/json',
        'X-AI-Provider-Mode': 'custom',
      }),
      body: JSON.stringify({
        title: 'Gemini E2E 会议',
        date: '2026-05-31',
        meeting_type: '项目进度会',
        participants: '产品经理, 开发',
        raw_transcript: '会议决定下周一发布测试版。开发负责今天完成接口联调，产品经理负责明天下午验收。风险是上线前仍需检查图片和音频提取。',
      }),
    });
    assert(
      analysis.source === 'default-api',
      `Meeting analysis fell back to ${analysis.source}: ${JSON.stringify(analysis.warnings || [])}`,
    );
  assert(analysis.structured_minutes?.summary, 'Meeting analysis returned no summary');
  console.log('meeting analysis: ok (empty custom headers fell back to default Gemini)');

  const saved = await requestJson('/meetings', {
    method: 'POST',
    headers: authHeaders(session.token, {
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({
      title: 'Gemini E2E 会议',
      date: '2026-06-01',
      meeting_type: '项目进度会',
      participants: '产品经理, 开发',
      raw_transcript: '会议决定下周一发布测试版。开发负责今天完成接口联调，产品经理负责明天下午验收。风险是上线前仍需检查图片和音频提取。',
      analysis,
    }),
  });
  assert(saved.meeting?.id, 'Meeting save returned no meeting id');

  const list = await requestJson('/meetings', {
    headers: authHeaders(session.token),
  });
  assert(
    list.meetings?.some((meeting) => meeting.id === saved.meeting.id),
    'Saved meeting is missing from memory library',
  );

  const detail = await requestJson(`/meetings/${saved.meeting.id}`, {
    headers: authHeaders(session.token),
  });
  assert(detail.meeting?.analysis?.structured_minutes?.summary, 'Saved meeting detail has no summary');
  console.log('meeting memory save/list/detail: ok');

  const legacySaved = await requestJson('/meetings', {
    method: 'POST',
    headers: authHeaders(session.token, {
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({
      title: '旧版记忆兼容测试',
      raw_transcript: '旧版会议记录',
      analysis: {
        summary: '旧版分析摘要',
      },
    }),
  });
  assert(
    legacySaved.meeting?.analysis?.structured_minutes?.summary === '旧版分析摘要',
    'Legacy meeting analysis was not normalized',
  );
  console.log('legacy meeting memory normalization: ok');

  const longTranscript = '长会议记录。'.repeat(150000);
  const longSaved = await requestJson('/meetings', {
    method: 'POST',
    headers: authHeaders(session.token, {
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({
      title: '长转写保存测试',
      raw_transcript: longTranscript,
      analysis,
    }),
  });
  assert(longSaved.meeting?.raw_transcript?.length === longTranscript.length, 'Long transcript save was truncated');
  console.log('long transcript memory save: ok');

  const textExtraction = await requestJson('/files/extract', {
      method: 'POST',
      headers: authHeaders(session.token, {
        'Content-Type': 'application/octet-stream',
        'X-File-Name': encodeURIComponent('meeting-notes.conf'),
      }),
      body: Buffer.from('会议决定：下周一发布测试版\n待办：开发完成接口联调'),
    });
    assert(textExtraction.text?.includes('下周一发布测试版'), 'Text extraction returned unexpected content');
    console.log('text extraction: ok');

    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    );
    const imageExtraction = await requestJson('/files/extract', {
      method: 'POST',
      headers: authHeaders(session.token, {
        'Content-Type': 'image/png',
        'X-File-Name': encodeURIComponent('meeting-board.png'),
      }),
      body: png,
    });
    assert(imageExtraction.text, 'Image extraction returned no text');
    console.log('image extraction: ok');

    const transcription = await requestJson('/audio/transcribe', {
      method: 'POST',
    headers: authHeaders(session.token, {
      'Content-Type': 'audio/webm',
      'X-File-Name': encodeURIComponent('meeting-recording.webm'),
    }),
    body: createBrowserWebmRecording(),
  });
  assert(transcription.text, 'Audio transcription returned no text');
  console.log('browser WebM audio transcription: ok');
  } finally {
    if (session?.token && session?.user?.id) {
      const response = await fetch(`${pocketBaseUrl}/api/collections/users/records/${session.user.id}`, {
        method: 'DELETE',
        headers: authHeaders(session.token),
      });

      if (response.ok) {
        console.log('test account cleanup: ok');
      } else {
        console.warn(`test account cleanup skipped (${response.status})`);
      }
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
