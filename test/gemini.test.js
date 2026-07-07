import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOpenAiRequestBody,
  getProviderMeta,
  hasProviderConfig,
  isOpenAiReasoningModel,
  parseJsonContent,
} from '../server/gemini.js';

test('parseJsonContent parses plain JSON', () => {
  assert.deepEqual(parseJsonContent('{"a":1,"b":"x"}'), { a: 1, b: 'x' });
});

test('parseJsonContent strips ```json code fences', () => {
  assert.deepEqual(parseJsonContent('```json\n{"a":1}\n```'), { a: 1 });
});

test('parseJsonContent extracts embedded JSON object from prose', () => {
  assert.deepEqual(parseJsonContent('结果如下：{"a":1} 完成'), { a: 1 });
});

test('parseJsonContent repairs malformed JSON via jsonrepair', () => {
  // Trailing comma + unquoted key is not valid JSON but jsonrepair fixes it.
  assert.deepEqual(parseJsonContent('{a: 1, b: 2,}'), { a: 1, b: 2 });
});

test('hasProviderConfig is true for a complete custom provider', () => {
  assert.equal(
    hasProviderConfig({ mode: 'custom', api_key: 'k', base_url: 'https://b/v1', model: 'm' }),
    true,
  );
});

test('hasProviderConfig is false without a per-user provider (no env fallback)', () => {
  assert.equal(hasProviderConfig({}), false);
  assert.equal(hasProviderConfig({ mode: 'custom', api_key: '', base_url: '', model: '' }), false);
});

test('getProviderMeta reports the custom base_url/model and configured flag', () => {
  const meta = getProviderMeta({ mode: 'custom', api_key: 'k', base_url: 'https://b/v1/', model: 'm' });
  assert.equal(meta.base_url, 'https://b/v1');
  assert.equal(meta.model, 'm');
  assert.equal(meta.configured, true);
});

test('getProviderMeta reports unconfigured when no per-user provider exists', () => {
  const meta = getProviderMeta({});
  assert.equal(meta.configured, false);
  assert.equal(meta.base_url, '');
  assert.equal(meta.model, '');
});

test('isOpenAiReasoningModel matches gpt-5 and o-series families only', () => {
  assert.equal(isOpenAiReasoningModel('gpt-5.5'), true);
  assert.equal(isOpenAiReasoningModel('gpt-5.4-mini'), true);
  assert.equal(isOpenAiReasoningModel('o4-mini'), true);
  assert.equal(isOpenAiReasoningModel('o1'), true);
  assert.equal(isOpenAiReasoningModel('gpt-4.1-mini'), false);
  assert.equal(isOpenAiReasoningModel('deepseek-v4-pro'), false);
  assert.equal(isOpenAiReasoningModel('claude-sonnet-5'), false);
  assert.equal(isOpenAiReasoningModel(''), false);
});

const contents = [{ role: 'user', parts: [{ text: '你好' }] }];

test('buildOpenAiRequestBody uses classic params for non-reasoning models', () => {
  const body = buildOpenAiRequestBody(contents, { temperature: 0.1, max_tokens: 500 }, { model: 'deepseek-v4-pro' });
  assert.equal(body.model, 'deepseek-v4-pro');
  assert.equal(body.max_tokens, 500);
  assert.equal(body.temperature, 0.1);
  assert.equal('max_completion_tokens' in body, false);
  assert.deepEqual(body.messages, [{ role: 'user', content: '你好' }]);
});

test('buildOpenAiRequestBody switches to max_completion_tokens and drops temperature for gpt-5/o-series', () => {
  for (const model of ['gpt-5.5', 'o4-mini']) {
    const body = buildOpenAiRequestBody(contents, { temperature: 0, max_tokens: 800 }, { model });
    assert.equal(body.max_completion_tokens, 800, model);
    assert.equal('max_tokens' in body, false, model);
    assert.equal('temperature' in body, false, model);
  }
});

test('buildOpenAiRequestBody carries the system instruction as a system message', () => {
  const body = buildOpenAiRequestBody(contents, { system_instruction: '只输出 JSON' }, { model: 'deepseek-v4-flash' });
  assert.deepEqual(body.messages[0], { role: 'system', content: '只输出 JSON' });
});

test('buildOpenAiRequestBody rejects file/image parts instead of silently dropping them', () => {
  const multimodal = [
    {
      role: 'user',
      parts: [{ text: '请转写' }, { inline_data: { mime_type: 'audio/flac', data: 'AAA=' } }],
    },
  ];
  assert.throws(
    () => buildOpenAiRequestBody(multimodal, {}, { model: 'deepseek-v4-pro' }),
    (err) => err.status === 400 && /不支持音频转写和图片提取/.test(err.message),
  );
});
