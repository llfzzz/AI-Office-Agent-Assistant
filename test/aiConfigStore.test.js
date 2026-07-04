import { test } from 'node:test';
import assert from 'node:assert/strict';

import { recordToMaskedConfig, classifyProviderError } from '../server/aiConfigStore.js';

test('recordToMaskedConfig never exposes cipher or plaintext key', () => {
  const record = {
    id: 'cfg1',
    label: 'DeepSeek',
    provider: 'openai-compatible',
    base_url: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    api_key_cipher: 'v1:iv:tag:ciphertext-should-never-leak',
    api_key_hint: 'sk-****abcd',
    is_default: true,
    last_validation_status: 'valid',
    last_validation_message: '连接成功',
    last_validated_at: '2026-07-04T00:00:00.000Z',
    created: '2026-07-04 00:00:00Z',
    updated: '2026-07-04 00:00:00Z',
  };

  const masked = recordToMaskedConfig(record);

  assert.equal('api_key_cipher' in masked, false, 'cipher must be stripped');
  assert.equal('api_key' in masked, false, 'no plaintext key field');
  assert.equal(masked.api_key_hint, 'sk-****abcd');
  assert.equal(masked.is_default, true);
  assert.equal(masked.label, 'DeepSeek');
  assert.equal(masked.last_validation_status, 'valid');

  // Belt-and-braces: no serialized field should contain the cipher.
  assert.ok(!JSON.stringify(masked).includes('ciphertext-should-never-leak'));
});

test('recordToMaskedConfig normalizes an unknown validation status', () => {
  const masked = recordToMaskedConfig({ id: 'x', last_validation_status: 'weird' });
  assert.equal(masked.last_validation_status, 'unknown');
  assert.equal(masked.is_default, false);
});

test('classifyProviderError maps network failures to "unreachable"', () => {
  for (const msg of [
    'Gemini API request timed out after 15000ms',
    'fetch failed',
    'getaddrinfo ENOTFOUND api.example.com',
    'connect ECONNREFUSED 127.0.0.1:443',
  ]) {
    assert.equal(classifyProviderError(new Error(msg)).status, 'unreachable', msg);
  }
});

test('classifyProviderError maps auth failures to "invalid"', () => {
  for (const msg of [
    'Gemini API error 401: unauthorized',
    'Gemini API error 403: permission denied',
    'API key not valid',
  ]) {
    assert.equal(classifyProviderError(new Error(msg)).status, 'invalid', msg);
  }
});

test('classifyProviderError falls back to "invalid" for unknown errors', () => {
  const result = classifyProviderError(new Error('something unexpected'));
  assert.equal(result.status, 'invalid');
  assert.ok(result.message.length > 0);
});

test('classification messages never echo secret material', () => {
  const result = classifyProviderError(new Error('401 with sk-superSecretKey123 in body'));
  assert.ok(!result.message.includes('sk-superSecretKey123'));
});
