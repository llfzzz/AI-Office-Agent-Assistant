import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

// Envelope: v1:<iv b64>:<authTag b64>:<ciphertext b64>. AES-256-GCM.
// The envelope version denotes the FORMAT (unchanged). Key rotation is handled
// by trying the current key then the previous key on decrypt — the GCM auth tag
// unambiguously tells us which key a record was written with.
const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_BYTES = 32;
// App-wide salt for key stretching. The real entropy is the secret; the salt
// only domain-separates this key from other scrypt uses.
const KEY_SALT = Buffer.from('office-agent-ai-config-key-v1');
// Minimum secret length we accept before treating encryption as "available".
const MIN_SECRET_LENGTH = 16;

export const KEY_CURRENT = 'current';
export const KEY_PREVIOUS = 'previous';

// Derived-key cache keyed by the raw secret string (bounded: at most the
// current + previous secrets are ever present).
const keyCache = new Map();

function usable(raw) {
  const s = String(raw || '');
  return s.length >= MIN_SECRET_LENGTH ? s : '';
}

// Current key: AI_CONFIG_SECRET_CURRENT, falling back to the legacy
// AI_CONFIG_SECRET so nothing breaks before/without a rotation.
function currentSecret() {
  return usable(process.env.AI_CONFIG_SECRET_CURRENT || process.env.AI_CONFIG_SECRET);
}

// Previous key: only present during a rotation window (for reading not-yet-
// migrated records). Absent in normal operation.
function previousSecret() {
  return usable(process.env.AI_CONFIG_SECRET_PREVIOUS);
}

/**
 * True when a usable current secret is configured. When false, the server must
 * refuse to store or read encrypted custom provider keys (demo mode still works).
 */
export function isEncryptionAvailable() {
  return Boolean(currentSecret());
}

function keyFromSecret(secret) {
  let key = keyCache.get(secret);
  if (!key) {
    key = scryptSync(secret, KEY_SALT, KEY_BYTES);
    keyCache.set(secret, key);
  }
  return key;
}

function requireCurrentKey() {
  const secret = currentSecret();
  if (!secret) {
    const error = new Error('AI 配置加密未启用：请设置 AI_CONFIG_SECRET（至少 16 个字符）后重试');
    error.status = 503;
    throw error;
  }
  return keyFromSecret(secret);
}

// Ordered decrypt candidates: current first, then previous (rotation window).
function candidateKeys() {
  const out = [];
  const cur = currentSecret();
  if (cur) out.push([KEY_CURRENT, keyFromSecret(cur)]);
  const prev = previousSecret();
  if (prev) out.push([KEY_PREVIOUS, keyFromSecret(prev)]);
  return out;
}

/**
 * Encrypt a plaintext secret with the CURRENT key. Returns an opaque,
 * self-describing envelope string safe to persist. Throws (503) when
 * encryption is not configured.
 */
export function encryptSecret(plaintext) {
  const value = String(plaintext ?? '');
  const key = requireCurrentKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [VERSION, iv.toString('base64'), authTag.toString('base64'), ciphertext.toString('base64')].join(':');
}

function decryptWithKey(parts, key) {
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
 * Decrypt an envelope, trying the current key then the previous key. Returns
 * { text, keyId } so callers (the rotation migration) can tell which key was
 * used. Throws on tampering, malformed input, or when no key can decrypt it.
 */
export function tryDecryptSecret(payload) {
  const parts = String(payload || '').split(':');

  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('无法解密：密文格式无效');
  }

  const candidates = candidateKeys();
  if (!candidates.length) {
    const error = new Error('AI 配置加密未启用');
    error.status = 503;
    throw error;
  }

  let lastError;
  for (const [keyId, key] of candidates) {
    try {
      return { text: decryptWithKey(parts, key), keyId };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('无法解密');
}

/**
 * Decrypt an envelope produced by encryptSecret. Throws on tampering (GCM auth
 * failure), malformed input, or when encryption is not configured.
 */
export function decryptSecret(payload) {
  return tryDecryptSecret(payload).text;
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
