// Controlled AES key rotation for stored AI provider keys.
//
// Re-encrypts every `ai_provider_configs.api_key_cipher` envelope from the
// PREVIOUS key to the CURRENT key. Idempotent: a record already written with the
// current key (GCM auth tag matches) is left untouched. Verifies afterwards that
// every non-empty cipher decrypts with the current key alone.
//
// SAFETY: run with PocketBase STOPPED so nothing else writes data.db. Requires
// AI_CONFIG_SECRET_CURRENT and AI_CONFIG_SECRET_PREVIOUS in the environment.
// Never prints secrets or plaintext key material.
//
//   node --experimental-sqlite scripts/rotate-ai-config-key.mjs [--dry-run] [--db <path>]

import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  KEY_CURRENT,
  KEY_PREVIOUS,
  encryptSecret,
  tryDecryptSecret,
} from '../server/crypto.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const dbIdx = args.indexOf('--db');
const dbPath = dbIdx >= 0 ? args[dbIdx + 1] : path.resolve(__dirname, '..', 'pb_data', 'data.db');

if (!process.env.AI_CONFIG_SECRET_CURRENT) {
  console.error('[rotate] refusing: AI_CONFIG_SECRET_CURRENT is not set');
  process.exit(2);
}
if (!process.env.AI_CONFIG_SECRET_PREVIOUS) {
  console.error('[rotate] refusing: AI_CONFIG_SECRET_PREVIOUS is not set (nothing to migrate from)');
  process.exit(2);
}

console.log(`[rotate] db=${dbPath} dryRun=${dryRun}`);
const db = new DatabaseSync(dbPath, { readOnly: dryRun });

const rows = db
  .prepare("SELECT id, api_key_cipher FROM ai_provider_configs WHERE api_key_cipher IS NOT NULL AND api_key_cipher != ''")
  .all();

let migrated = 0;
let alreadyCurrent = 0;
let failed = 0;
const update = dryRun ? null : db.prepare('UPDATE ai_provider_configs SET api_key_cipher = ? WHERE id = ?');

for (const row of rows) {
  let decoded;
  try {
    decoded = tryDecryptSecret(row.api_key_cipher);
  } catch (err) {
    failed += 1;
    console.error(`[rotate] id=${row.id} DECRYPT FAILED with both keys: ${err.message}`);
    continue;
  }

  if (decoded.keyId === KEY_CURRENT) {
    alreadyCurrent += 1;
    continue;
  }
  // keyId === KEY_PREVIOUS -> re-encrypt under the current key.
  const reEnvelope = encryptSecret(decoded.text);
  // Sanity: the new envelope must decrypt back to the same plaintext with current.
  const check = tryDecryptSecret(reEnvelope);
  if (check.keyId !== KEY_CURRENT || check.text !== decoded.text) {
    failed += 1;
    console.error(`[rotate] id=${row.id} RE-ENCRYPT VERIFY FAILED; leaving untouched`);
    continue;
  }
  if (!dryRun) update.run(reEnvelope, row.id);
  migrated += 1;
  console.log(`[rotate] id=${row.id} migrated ${KEY_PREVIOUS} -> ${KEY_CURRENT}`);
}

// Post-migration verification: every cipher must now decrypt with CURRENT only.
let verifyFail = 0;
if (!dryRun) {
  const after = db
    .prepare("SELECT id, api_key_cipher FROM ai_provider_configs WHERE api_key_cipher IS NOT NULL AND api_key_cipher != ''")
    .all();
  const prevSecret = process.env.AI_CONFIG_SECRET_PREVIOUS;
  delete process.env.AI_CONFIG_SECRET_PREVIOUS; // force current-only decrypt
  for (const row of after) {
    try {
      const d = tryDecryptSecret(row.api_key_cipher);
      if (d.keyId !== KEY_CURRENT) throw new Error(`unexpected keyId ${d.keyId}`);
    } catch (err) {
      verifyFail += 1;
      console.error(`[rotate] VERIFY id=${row.id} does not decrypt with current key alone: ${err.message}`);
    }
  }
  process.env.AI_CONFIG_SECRET_PREVIOUS = prevSecret;
}

db.close();

console.log(`[rotate] rows=${rows.length} migrated=${migrated} alreadyCurrent=${alreadyCurrent} failed=${failed} verifyFail=${verifyFail}`);
if (failed > 0 || verifyFail > 0) {
  console.error('[rotate] completed WITH ERRORS');
  process.exit(1);
}
console.log('[rotate] OK');
