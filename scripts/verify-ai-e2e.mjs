// Live end-to-end check against a running API + PocketBase, using the
// per-user AI provider configuration flow (there is no env/server fallback).
//
// Required env:
//   VERIFY_AI_API_KEY    — API key for the provider under test
// Optional env:
//   VERIFY_AI_PROVIDER   — catalog provider id (default: gemini)
//   VERIFY_AI_MODEL      — model id (default: the provider's catalog default)
//   VERIFY_AI_BASE_URL   — base URL (only for provider "other")
//   VERIFY_AI_API_MODE   — openai|gemini (only for provider "other")
//   VERIFY_API_BASE_URL  — API root (default http://127.0.0.1:8788/api)
//
// Audio transcription and image extraction are exercised only for
// Gemini-compatible configs (they are Gemini-only capabilities).
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';

const apiBaseUrl = process.env.VERIFY_API_BASE_URL || 'http://127.0.0.1:8788/api';
const pocketBaseUrl = process.env.PB_URL || 'http://127.0.0.1:8090';
const suffix = `${Date.now()}-${randomBytes(3).toString('hex')}`;
const email = `verify-ai-${suffix}@example.com`;
const password = `Verify-${randomBytes(8).toString('hex')}!`;

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
  const apiKey = process.env.VERIFY_AI_API_KEY || '';
  assert(apiKey, 'Set VERIFY_AI_API_KEY (and optionally VERIFY_AI_PROVIDER/VERIFY_AI_MODEL) to run this script');

  let session;

  try {
    const health = await requestJson('/health');
    assert(health.ok, 'API health check failed');
    assert(health.database?.ok, `PocketBase is not reachable at ${health.database?.url || pocketBaseUrl}`);
    assert(health.encryption?.available, 'AI_CONFIG_SECRET is not configured — custom AI configs cannot be saved');
    console.log('health: ok (database + encryption available)');

    session = await requestJson('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        name: 'AI E2E Probe',
      }),
    });
    assert(session.token, 'Registration did not return an auth token');
    console.log(`auth: ok (${email})`);

    const providerId = process.env.VERIFY_AI_PROVIDER || 'gemini';
    const catalog = await requestJson('/ai-providers', { headers: authHeaders(session.token) });
    const preset = catalog.providers?.find((provider) => provider.id === providerId);
    assert(preset, `Unknown provider "${providerId}" (catalog has: ${catalog.providers?.map((p) => p.id).join(', ')})`);

    const configInput = {
      label: `E2E ${preset.label}`,
      provider: providerId,
      model: process.env.VERIFY_AI_MODEL || preset.defaultModel,
      api_key: apiKey,
      is_default: true,
    };
    if (preset.editableBaseUrl) {
      configInput.base_url = process.env.VERIFY_AI_BASE_URL || '';
      configInput.api_mode = process.env.VERIFY_AI_API_MODE || 'openai';
    }

    const created = await requestJson('/ai-configs', {
      method: 'POST',
      headers: authHeaders(session.token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(configInput),
    });
    assert(created.config?.id, 'AI config creation returned no id');
    assert(created.config.is_default, 'AI config was not set as default');

    const validated = await requestJson(`/ai-configs/${created.config.id}/validate`, {
      method: 'POST',
      headers: authHeaders(session.token),
    });
    assert(
      validated.config?.last_validation_status === 'valid',
      `AI config validation failed: ${validated.config?.last_validation_status} — ${validated.config?.last_validation_message}`,
    );
    console.log(`ai config: ok (${providerId} · ${created.config.model} · validated)`);

    const isGeminiMode = created.config.api_mode === 'gemini';

    const analysis = await requestJson('/meetings/analyze', {
      method: 'POST',
      headers: authHeaders(session.token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        title: 'AI E2E 会议',
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
    console.log('meeting analysis: ok (live provider)');

    const saved = await requestJson('/meetings', {
      method: 'POST',
      headers: authHeaders(session.token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        title: 'AI E2E 会议',
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
      headers: authHeaders(session.token, { 'Content-Type': 'application/json' }),
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
      headers: authHeaders(session.token, { 'Content-Type': 'application/json' }),
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

    const jsonExtraction = await requestJson('/files/extract', {
      method: 'POST',
      headers: authHeaders(session.token, {
        'Content-Type': 'application/json',
        'X-File-Name': encodeURIComponent('meeting-notes.json'),
      }),
      body: Buffer.from('{"决定":"下周一发布测试版"}'),
    });
    assert(jsonExtraction.text?.includes('下周一发布测试版'), 'JSON file extraction returned unexpected content');
    console.log('json file extraction: ok');

    if (isGeminiMode) {
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
    } else {
      console.log('image extraction / audio transcription: skipped (Gemini-only; current config is OpenAI-compatible)');
    }
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
