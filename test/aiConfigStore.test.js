import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  recordToMaskedConfig,
  classifyProviderError,
  resolveProviderFields,
  assertSafeCustomUrl,
} from '../server/aiConfigStore.js';

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

test('resolveProviderFields enforces the catalog base URL for built-in providers', () => {
  // A malicious client-supplied base_url must be ignored for a preset provider.
  const fields = resolveProviderFields({
    provider: 'deepseek',
    model: '',
    base_url: 'https://evil.example.com',
  });
  assert.equal(fields.provider, 'deepseek');
  assert.equal(fields.base_url, 'https://api.deepseek.com');
  assert.equal(fields.api_mode, 'openai');
  assert.equal(fields.model, 'deepseek-v4-pro'); // default model applied
});

test('resolveProviderFields uses native Gemini mode for the gemini preset', () => {
  const fields = resolveProviderFields({ provider: 'gemini', model: 'gemini-3.5-flash' });
  assert.equal(fields.api_mode, 'gemini');
  assert.equal(fields.base_url, 'https://generativelanguage.googleapis.com/v1beta');
  assert.equal(fields.model, 'gemini-3.5-flash');
});

test('resolveProviderFields accepts a custom URL + mode for "other"', () => {
  const fields = resolveProviderFields({
    provider: 'other',
    base_url: 'https://api.custom.test/v1',
    model: 'my-model',
    api_mode: 'gemini',
  });
  assert.equal(fields.provider, 'other');
  assert.equal(fields.base_url, 'https://api.custom.test/v1');
  assert.equal(fields.api_mode, 'gemini');
  assert.equal(fields.model, 'my-model');
});

test('resolveProviderFields rejects an "other" provider without a base URL', () => {
  assert.throws(() => resolveProviderFields({ provider: 'other', model: 'x' }), (err) => err.status === 400);
});

test('assertSafeCustomUrl accepts https and trims a trailing slash', () => {
  assert.equal(assertSafeCustomUrl('https://api.example.com/v1/'), 'https://api.example.com/v1');
});

test('assertSafeCustomUrl rejects empty, malformed, and non-http(s) URLs', () => {
  assert.throws(() => assertSafeCustomUrl(''), (err) => err.status === 400);
  assert.throws(() => assertSafeCustomUrl('not a url'), (err) => err.status === 400);
  assert.throws(() => assertSafeCustomUrl('ftp://x.example.com'), (err) => err.status === 400);
});

test('assertSafeCustomUrl blocks http and private hosts in production', () => {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    assert.throws(() => assertSafeCustomUrl('http://api.example.com'), /HTTPS/);
    assert.throws(() => assertSafeCustomUrl('https://localhost:8080'), /本地|内网/);
    assert.throws(() => assertSafeCustomUrl('https://192.168.1.5'), /本地|内网/);
    assert.throws(() => assertSafeCustomUrl('https://127.0.0.1'), /本地|内网/);
    assert.throws(() => assertSafeCustomUrl('https://10.0.0.9'), /本地|内网/);
    // A public https host still passes in production.
    assert.equal(assertSafeCustomUrl('https://api.deepseek.com'), 'https://api.deepseek.com');
  } finally {
    if (prev === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prev;
  }
});
