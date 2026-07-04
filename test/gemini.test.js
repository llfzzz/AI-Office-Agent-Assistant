import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getProviderMeta,
  hasProviderConfig,
  normalizeBaseUrl,
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

test('normalizeBaseUrl trims a full generateContent endpoint back to the base', () => {
  assert.equal(
    normalizeBaseUrl('https://example.com/v1beta/models/gemini-3-flash-preview:generateContent'),
    'https://example.com/v1beta',
  );
});

test('normalizeBaseUrl falls back to the default when empty', () => {
  assert.equal(normalizeBaseUrl(''), 'https://generativelanguage.googleapis.com/v1beta');
});

test('hasProviderConfig is true for a complete custom provider', () => {
  assert.equal(
    hasProviderConfig({ mode: 'custom', api_key: 'k', base_url: 'https://b/v1', model: 'm' }),
    true,
  );
});

test('hasProviderConfig is false for an incomplete custom provider without env key', () => {
  const previous = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    assert.equal(hasProviderConfig({ mode: 'custom', api_key: '', base_url: '', model: '' }), false);
  } finally {
    if (previous !== undefined) process.env.GEMINI_API_KEY = previous;
  }
});

test('getProviderMeta reports the custom base_url/model and configured flag', () => {
  const meta = getProviderMeta({ mode: 'custom', api_key: 'k', base_url: 'https://b/v1/', model: 'm' });
  assert.equal(meta.base_url, 'https://b/v1');
  assert.equal(meta.model, 'm');
  assert.equal(meta.configured, true);
});
