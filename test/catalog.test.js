import { test } from 'node:test';
import assert from 'node:assert/strict';

import { publicCatalog, getProviderPreset, PROVIDER_CATALOG } from '../server/providers/catalog.js';

test('catalog exposes exactly the five built-in providers, in order', () => {
  const catalog = publicCatalog();
  assert.deepEqual(
    catalog.providers.map((provider) => provider.id),
    ['deepseek', 'openai', 'anthropic', 'gemini', 'other'],
  );
  assert.ok(catalog.version, 'catalog is versioned');
});

test('official base URLs and API modes match documented values', () => {
  assert.equal(getProviderPreset('deepseek').baseUrl, 'https://api.deepseek.com');
  assert.equal(getProviderPreset('deepseek').apiMode, 'openai');
  assert.equal(getProviderPreset('openai').baseUrl, 'https://api.openai.com/v1');
  assert.equal(getProviderPreset('openai').apiMode, 'openai');
  // Anthropic is reached through its official OpenAI-compatible endpoint.
  assert.equal(getProviderPreset('anthropic').baseUrl, 'https://api.anthropic.com/v1');
  assert.equal(getProviderPreset('anthropic').apiMode, 'openai');
  // Gemini uses its native generateContent API.
  assert.equal(getProviderPreset('gemini').baseUrl, 'https://generativelanguage.googleapis.com/v1beta');
  assert.equal(getProviderPreset('gemini').apiMode, 'gemini');
});

test('each built-in provider default model is present in its own model list', () => {
  for (const provider of PROVIDER_CATALOG) {
    if (provider.editableBaseUrl) continue; // "other" has no preset models
    assert.ok(provider.defaultModel, `${provider.id} has a default model`);
    assert.ok(
      provider.models.some((model) => model.id === provider.defaultModel),
      `${provider.id} default model is in its curated list`,
    );
    assert.ok(provider.models.length > 0, `${provider.id} exposes at least one model`);
  }
});

test('only "other" is an editable custom provider', () => {
  assert.equal(getProviderPreset('other').editableBaseUrl, true);
  for (const id of ['deepseek', 'openai', 'anthropic', 'gemini']) {
    assert.equal(getProviderPreset(id).editableBaseUrl, false, `${id} base URL is locked`);
  }
});

test('unknown provider ids resolve to null', () => {
  assert.equal(getProviderPreset('nope'), null);
  assert.equal(getProviderPreset(''), null);
});

test('public catalog carries no secret material', () => {
  const json = JSON.stringify(publicCatalog());
  assert.ok(!/api_key|secret|cipher|password/i.test(json));
});
