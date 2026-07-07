import { test } from 'node:test';
import assert from 'node:assert/strict';

import { encryptSecret, decryptSecret, maskSecret, isEncryptionAvailable } from '../server/crypto.js';

const SECRET = 'unit-test-ai-config-secret-please';

function withSecret(value, fn) {
  const prev = process.env.AI_CONFIG_SECRET;
  if (value === undefined) {
    delete process.env.AI_CONFIG_SECRET;
  } else {
    process.env.AI_CONFIG_SECRET = value;
  }
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.AI_CONFIG_SECRET;
    else process.env.AI_CONFIG_SECRET = prev;
  }
}

test('encrypt/decrypt round-trips and hides the plaintext', () => {
  withSecret(SECRET, () => {
    const plain = 'sk-abcdef1234567890SECRETVALUE';
    const envelope = encryptSecret(plain);

    assert.ok(envelope.startsWith('v1:'), 'envelope is versioned');
    assert.ok(!envelope.includes(plain), 'ciphertext must not contain the plaintext');
    assert.equal(decryptSecret(envelope), plain);
  });
});

test('two encryptions of the same value differ (random IV)', () => {
  withSecret(SECRET, () => {
    const a = encryptSecret('same-value');
    const b = encryptSecret('same-value');
    assert.notEqual(a, b);
    assert.equal(decryptSecret(a), 'same-value');
    assert.equal(decryptSecret(b), 'same-value');
  });
});

test('tampering with the ciphertext is detected (GCM auth failure)', () => {
  withSecret(SECRET, () => {
    const envelope = encryptSecret('tamper-me');
    const parts = envelope.split(':');
    // Flip the last base64 char of the ciphertext segment.
    const data = parts[3];
    const flipped = (data.slice(-1) === 'A' ? 'B' : 'A');
    parts[3] = data.slice(0, -1) + flipped;
    assert.throws(() => decryptSecret(parts.join(':')));
  });
});

test('decrypting with the wrong secret fails', () => {
  const envelope = withSecret(SECRET, () => encryptSecret('cross-secret'));
  withSecret('a-totally-different-secret-1234', () => {
    assert.throws(() => decryptSecret(envelope));
  });
});

test('malformed envelopes are rejected', () => {
  withSecret(SECRET, () => {
    assert.throws(() => decryptSecret('not-an-envelope'));
    assert.throws(() => decryptSecret('v2:a:b:c'));
    assert.throws(() => decryptSecret(''));
  });
});

test('isEncryptionAvailable reflects a usable secret', () => {
  withSecret(SECRET, () => assert.equal(isEncryptionAvailable(), true));
  withSecret('too-short', () => assert.equal(isEncryptionAvailable(), false));
  withSecret(undefined, () => assert.equal(isEncryptionAvailable(), false));
});

test('encrypt throws (503) when no secret is configured', () => {
  withSecret(undefined, () => {
    assert.throws(() => encryptSecret('x'), (err) => err.status === 503);
  });
});

test('maskSecret reveals only a short prefix and last four', () => {
  assert.equal(maskSecret('sk-abcdef1234567890TESTKEY'), 'sk-****TKEY');
  assert.equal(maskSecret('short'), '****');
  assert.equal(maskSecret(''), '');
  assert.equal(maskSecret('AKIA1234567890ABCD').endsWith('ABCD'), true);
  // Never returns the full secret.
  assert.ok(!maskSecret('sk-abcdef1234567890TESTKEY').includes('abcdef'));
});
