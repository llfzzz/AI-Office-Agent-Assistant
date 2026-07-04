import { decryptSecret, encryptSecret, isEncryptionAvailable, maskSecret } from './crypto.js';
import { generateContent } from './gemini.js';

const COLLECTION = 'ai_provider_configs';
const AUDIT = 'ai_config_audit';

const VALIDATION_STATUSES = new Set(['unknown', 'valid', 'invalid', 'unreachable']);

function httpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

/**
 * Project a stored record to the safe shape sent to clients. NEVER includes
 * api_key_cipher or any plaintext secret — only the masked hint.
 */
export function recordToMaskedConfig(record) {
  const status = VALIDATION_STATUSES.has(record.last_validation_status)
    ? record.last_validation_status
    : 'unknown';

  return {
    id: record.id,
    label: record.label || '',
    provider: record.provider || 'custom',
    base_url: record.base_url || '',
    model: record.model || '',
    api_key_hint: record.api_key_hint || '',
    is_default: Boolean(record.is_default),
    last_validation_status: status,
    last_validation_message: record.last_validation_message || '',
    last_validated_at: record.last_validated_at || '',
    created_at: record.created,
    updated_at: record.updated,
  };
}

// Audit is best-effort and must never surface secrets or break the main action.
async function writeAudit(context, action, record, detail = '') {
  try {
    await context.pb.collection(AUDIT).create({
      user: context.user.id,
      action,
      config_id: record?.id || '',
      config_label: record?.label || '',
      detail: String(detail || '').slice(0, 400),
    });
  } catch {
    // Swallow: auditing failure should not fail the operation.
  }
}

// PocketBase rules already scope to the owner; getOne on a foreign id returns 404.
// We still translate that into a clean 404 so callers never learn it exists.
async function getOwnedRecord(context, id) {
  try {
    return await context.pb.collection(COLLECTION).getOne(id);
  } catch (error) {
    if (error?.status === 404) {
      throw httpError('未找到该 AI 配置', 404);
    }
    throw error;
  }
}

async function unsetOtherDefaults(context, keepId) {
  const records = await context.pb.collection(COLLECTION).getFullList();
  for (const record of records) {
    if (record.id !== keepId && record.is_default) {
      await context.pb.collection(COLLECTION).update(record.id, { is_default: false });
    }
  }
}

function providerFromRecord(record) {
  const api_key = record.api_key_cipher ? decryptSecret(record.api_key_cipher) : '';
  return {
    mode: 'custom',
    api_key,
    base_url: record.base_url || '',
    model: record.model || '',
  };
}

function requireEncryption() {
  if (!isEncryptionAvailable()) {
    throw httpError('服务器未启用 AI 配置加密（缺少 AI_CONFIG_SECRET），无法保存自定义密钥', 503);
  }
}

function sanitizeMeta(input) {
  return {
    label: String(input.label || '').trim().slice(0, 80),
    provider: String(input.provider || 'custom').trim().slice(0, 40) || 'custom',
    base_url: String(input.base_url || '').trim().slice(0, 400),
    model: String(input.model || '').trim().slice(0, 160),
  };
}

export async function listAiConfigs(context) {
  const records = await context.pb.collection(COLLECTION).getFullList({ sort: '-is_default,-updated' });
  return records.map(recordToMaskedConfig);
}

export async function createAiConfig(context, input) {
  requireEncryption();

  const meta = sanitizeMeta(input);
  const apiKey = typeof input.api_key === 'string' ? input.api_key.trim() : '';

  if (!meta.base_url || !meta.model) {
    throw httpError('请填写 Base URL 与模型名称', 400);
  }
  if (!apiKey) {
    throw httpError('请填写 API Key', 400);
  }

  const existing = await context.pb.collection(COLLECTION).getFullList();
  const shouldDefault = Boolean(input.is_default) || existing.length === 0;

  const record = await context.pb.collection(COLLECTION).create({
    user: context.user.id,
    label: meta.label || '默认配置',
    provider: meta.provider,
    base_url: meta.base_url,
    model: meta.model,
    api_key_cipher: encryptSecret(apiKey),
    api_key_hint: maskSecret(apiKey),
    is_default: shouldDefault,
    last_validation_status: 'unknown',
    last_validation_message: '',
    last_validated_at: '',
  });

  if (shouldDefault) {
    await unsetOtherDefaults(context, record.id);
  }

  await writeAudit(context, 'create', record, `provider=${meta.provider} model=${meta.model}`);
  return recordToMaskedConfig(record);
}

export async function updateAiConfig(context, id, input) {
  const existing = await getOwnedRecord(context, id);
  const meta = sanitizeMeta({ ...existing, ...input });
  const apiKey = typeof input.api_key === 'string' ? input.api_key.trim() : '';

  const patch = {
    label: meta.label || existing.label || '默认配置',
    provider: meta.provider,
    base_url: meta.base_url,
    model: meta.model,
  };

  let keyRotated = false;
  if (apiKey) {
    requireEncryption();
    patch.api_key_cipher = encryptSecret(apiKey);
    patch.api_key_hint = maskSecret(apiKey);
    // A changed key invalidates any prior validation result.
    patch.last_validation_status = 'unknown';
    patch.last_validation_message = '';
    patch.last_validated_at = '';
    keyRotated = true;
  }

  const record = await context.pb.collection(COLLECTION).update(id, patch);

  if (input.is_default === true && !record.is_default) {
    await context.pb.collection(COLLECTION).update(id, { is_default: true });
    await unsetOtherDefaults(context, id);
  }

  await writeAudit(context, 'update', record, keyRotated ? 'key rotated' : 'metadata updated');
  return recordToMaskedConfig(await getOwnedRecord(context, id));
}

export async function setDefaultAiConfig(context, id) {
  const existing = await getOwnedRecord(context, id);
  await context.pb.collection(COLLECTION).update(id, { is_default: true });
  await unsetOtherDefaults(context, id);
  await writeAudit(context, 'set_default', existing);
  return recordToMaskedConfig(await getOwnedRecord(context, id));
}

export async function deleteAiConfig(context, id) {
  const existing = await getOwnedRecord(context, id);
  await context.pb.collection(COLLECTION).delete(id);
  await writeAudit(context, 'delete', existing);

  // If we removed the default, promote the most recently updated remaining one.
  if (existing.is_default) {
    const rest = await context.pb.collection(COLLECTION).getFullList({ sort: '-updated' });
    if (rest[0]) {
      await context.pb.collection(COLLECTION).update(rest[0].id, { is_default: true });
    }
  }

  return { id };
}

/**
 * Map a provider probe error to a safe, secret-free validation status/message.
 * Exposed for unit testing.
 */
export function classifyProviderError(error) {
  const raw = (error instanceof Error ? error.message : String(error || '')).toLowerCase();

  if (
    raw.includes('timed out') ||
    raw.includes('fetch failed') ||
    raw.includes('enotfound') ||
    raw.includes('econnrefused') ||
    raw.includes('econnreset') ||
    raw.includes('network') ||
    raw.includes('dns')
  ) {
    return { status: 'unreachable', message: '无法连接到服务地址，请检查 Base URL 或网络' };
  }

  if (
    raw.includes('401') ||
    raw.includes('403') ||
    raw.includes('unauthorized') ||
    raw.includes('permission') ||
    raw.includes('api key') ||
    raw.includes('api_key') ||
    raw.includes('invalid')
  ) {
    return { status: 'invalid', message: 'API Key 无效、已过期或无权限' };
  }

  return { status: 'invalid', message: '验证失败，请检查 Base URL、模型名称与 API Key' };
}

async function probeProvider(provider) {
  try {
    await generateContent([{ role: 'user', parts: [{ text: 'ping' }] }], {
      provider,
      temperature: 0,
      max_tokens: 1,
      timeout_ms: Number(process.env.AI_VALIDATE_TIMEOUT_MS || 15000),
    });
    return { status: 'valid', message: '连接成功' };
  } catch (error) {
    return classifyProviderError(error);
  }
}

export async function validateAiConfig(context, id) {
  const record = await getOwnedRecord(context, id);

  let result;
  try {
    result = await probeProvider(providerFromRecord(record));
  } catch (error) {
    // Decryption/config errors surface as a non-secret invalid status.
    result = classifyProviderError(error);
  }

  const updated = await context.pb.collection(COLLECTION).update(id, {
    last_validation_status: result.status,
    last_validation_message: result.message,
    last_validated_at: new Date().toISOString(),
  });

  await writeAudit(context, 'validate', record, `status=${result.status}`);
  return recordToMaskedConfig(updated);
}

/**
 * Resolve the caller's active provider override for server-side AI calls.
 * Returns a decrypted provider object (kept in memory only) or {} to fall back
 * to the env/default provider. Never throws — any failure yields a safe default.
 */
export async function getActiveAiProvider(context) {
  try {
    if (!isEncryptionAvailable()) {
      return {};
    }

    const records = await context.pb.collection(COLLECTION).getFullList({
      filter: 'is_default = true',
      sort: '-updated',
    });
    const record = records[0];

    if (!record || !record.api_key_cipher) {
      return {};
    }

    return providerFromRecord(record);
  } catch {
    return {};
  }
}
