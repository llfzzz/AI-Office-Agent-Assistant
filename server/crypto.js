import { createCipheriv, createDecipheriv, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

// Envelope: v1:<iv b64>:<authTag b64>:<ciphertext b64>. AES-256-GCM.
const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_BYTES = 32;
// App-wide salt for key stretching. The real entropy is AI_CONFIG_SECRET; the
// salt only domain-separates this key from other scrypt uses.
const KEY_SALT = Buffer.from('office-agent-ai-config-key-v1');
// Minimum secret length we accept before treating encryption as "available".
const MIN_SECRET_LENGTH = 16;

let cachedKey = null;
let cachedSecret = null;

function currentSecret() {
  const secret = process.env.AI_CONFIG_SECRET || '';
  return secret.length >= MIN_SECRET_LENGTH ? secret : '';
}

/**
 * True when a usable AI_CONFIG_SECRET is configured. When false, the server must
 * refuse to store or read encrypted custom provider keys (default mode still works).
 */
export function isEncryptionAvailable() {
  return Boolean(currentSecret());
}

function deriveKey() {
  const secret = currentSecret();

  if (!secret) {
    const error = new Error('AI 配置加密未启用：请设置 AI_CONFIG_SECRET（至少 16 个字符）后重试');
    error.status = 503;
    throw error;
  }

  if (cachedKey && cachedSecret === secret) {
    return cachedKey;
  }

  cachedKey = scryptSync(secret, KEY_SALT, KEY_BYTES);
  cachedSecret = secret;
  return cachedKey;
}

/**
 * Encrypt a plaintext secret. Returns an opaque, self-describing envelope string
 * safe to persist. Throws (503) when encryption is not configured.
 */
export function encryptSecret(plaintext) {
  const value = String(plaintext ?? '');
  const key = deriveKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [VERSION, iv.toString('base64'), authTag.toString('base64'), ciphertext.toString('base64')].join(':');
}

/**
 * Decrypt an envelope produced by encryptSecret. Throws on tampering (GCM auth
 * failure), malformed input, or when encryption is not configured.
 */
export function decryptSecret(payload) {
  const parts = String(payload || '').split(':');

  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('无法解密：密文格式无效');
  }

  const key = deriveKey();
  const iv = Buffer.from(parts[1], 'base64');
  const authTag = Buffer.from(parts[2], 'base64');
  const ciphertext = Buffer.from(parts[3], 'base64');

  if (iv.length !== IV_BYTES) {
    throw new Error('无法解密：IV 长度无效');
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/**
 * Produce a non-reversible masked hint for display, e.g. "sk-****abcd".
 * Reveals at most a short recognizable prefix and the last 4 characters, and
 * only when the key is long enough that this leaks negligible entropy.
 */
export function maskSecret(plaintext) {
  const value = String(plaintext || '').trim();

  if (!value) {
    return '';
  }

  if (value.length < 8) {
    return '****';
  }

  const prefixMatch = value.match(/^[A-Za-z]{2,4}[-_]/);
  const prefix = prefixMatch ? prefixMatch[0] : '';
  return `${prefix}****${value.slice(-4)}`;
}

/** Constant-time string compare (used where equality must not leak timing). */
export function safeEqual(a, b) {
  const bufA = Buffer.from(String(a || ''), 'utf8');
  const bufB = Buffer.from(String(b || ''), 'utf8');

  if (bufA.length !== bufB.length) {
    return false;
  }

  return timingSafeEqual(bufA, bufB);
}
