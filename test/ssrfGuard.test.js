import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  assertPublicUrl,
  isBlockedIp,
  isNonCanonicalNumericHost,
  resolveAndValidate,
  safeFetch,
} from '../server/ssrfGuard.js';

// A blocked-IP throw from assertPublicUrl/resolveAndValidate is an ssrfError.
const isSsrf = (err) => err && err.isSsrfBlock === true;

test('isBlockedIp flags loopback, private, link-local, unspecified, and mapped IPs', () => {
  for (const ip of [
    '127.0.0.1', '127.1.2.3', '0.0.0.0', '10.0.0.9', '172.16.5.5', '192.168.1.5',
    '169.254.169.254', '100.64.0.1', '::1', '::', 'fe80::1', 'fc00::1',
    '::ffff:127.0.0.1', '::ffff:10.0.0.1',
  ]) {
    assert.equal(isBlockedIp(ip), true, `${ip} must be blocked`);
  }
});

test('isBlockedIp allows public IPs', () => {
  for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:4700:4700::1111']) {
    assert.equal(isBlockedIp(ip), false, `${ip} must be allowed`);
  }
});

test('isNonCanonicalNumericHost catches decimal/hex/shortened forms', () => {
  for (const h of ['2130706433', '0x7f000001', '0177.0.0.1', '127.1']) {
    assert.equal(isNonCanonicalNumericHost(h), true, h);
  }
  assert.equal(isNonCanonicalNumericHost('127.0.0.1'), false); // canonical
  assert.equal(isNonCanonicalNumericHost('api.example.com'), false);
});

test('assertPublicUrl rejects private / metadata / loopback literals', () => {
  for (const url of [
    'https://127.0.0.1',
    'https://localhost',
    'https://0.0.0.0',
    'https://169.254.169.254/latest/meta-data/',
    'https://10.0.0.9',
    'https://192.168.1.5',
    'https://[::1]',
    'https://2130706433',        // decimal 127.0.0.1
    'https://0x7f000001',        // hex 127.0.0.1
    'https://foo.internal',
    'https://db.local',
  ]) {
    assert.throws(() => assertPublicUrl(url), isSsrf, url);
  }
});

test('assertPublicUrl rejects non-http(s) protocols and embedded credentials', () => {
  assert.throws(() => assertPublicUrl('ftp://example.com'), isSsrf);
  assert.throws(() => assertPublicUrl('file:///etc/passwd'), isSsrf);
  assert.throws(() => assertPublicUrl('https://user:pass@example.com'), isSsrf);
  assert.throws(() => assertPublicUrl(''), isSsrf);
});

test('assertPublicUrl rejects plain HTTP unless explicitly allowed', () => {
  assert.throws(() => assertPublicUrl('http://api.example.com'), /HTTPS/);
  // Opt-in dev flag lets HTTP through the protocol check.
  assert.equal(
    assertPublicUrl('http://api.example.com', { allowHttp: true }).toString(),
    'http://api.example.com/',
  );
});

test('assertPublicUrl accepts valid public HTTPS and built-in provider endpoints', () => {
  for (const url of [
    'https://api.deepseek.com',
    'https://api.openai.com/v1',
    'https://generativelanguage.googleapis.com/v1beta',
    'https://api.anthropic.com',
  ]) {
    assert.equal(assertPublicUrl(url).protocol, 'https:', url);
  }
});

test('resolveAndValidate blocks a public hostname that resolves to a private IP (DNS rebinding)', async () => {
  const lookup = async () => [{ address: '10.0.0.5', family: 4 }];
  await assert.rejects(resolveAndValidate('sneaky.example.com', lookup), isSsrf);
});

test('resolveAndValidate blocks when ANY resolved address is private', async () => {
  const lookup = async () => [
    { address: '93.184.216.34', family: 4 },
    { address: '127.0.0.1', family: 4 },
  ];
  await assert.rejects(resolveAndValidate('mixed.example.com', lookup), isSsrf);
});

test('resolveAndValidate passes a hostname resolving only to public IPs', async () => {
  const lookup = async () => [{ address: '93.184.216.34', family: 4 }];
  const addrs = await resolveAndValidate('example.com', lookup);
  assert.equal(addrs[0].address, '93.184.216.34');
});

test('safeFetch blocks a redirect from a public host to an internal one', async () => {
  const lookup = async () => [{ address: '93.184.216.34', family: 4 }];
  const fetchImpl = async () => ({
    status: 302,
    ok: false,
    headers: new Map([['location', 'http://169.254.169.254/latest/meta-data/']]),
    body: null,
  });
  // Map's .get works for headers.get('location'); dispatcher supplied to skip pinning.
  await assert.rejects(
    safeFetch('https://api.example.com', {}, { lookup, fetchImpl, dispatcher: {} }),
    isSsrf,
  );
});

test('safeFetch rejects an oversized response via content-length', async () => {
  const lookup = async () => [{ address: '93.184.216.34', family: 4 }];
  const fetchImpl = async () => ({
    status: 200,
    ok: true,
    headers: new Map([['content-length', String(50 * 1024 * 1024)]]),
    body: { cancel: async () => {} },
  });
  await assert.rejects(
    safeFetch('https://api.example.com', {}, { lookup, fetchImpl, dispatcher: {}, maxBytes: 1024 }),
    /过大/,
  );
});

test('safeFetch returns a wrapped response for a valid public request', async () => {
  const lookup = async () => [{ address: '93.184.216.34', family: 4 }];
  const payload = JSON.stringify({ hello: 'world' });
  let readOnce = false;
  const fetchImpl = async () => ({
    status: 200,
    ok: true,
    headers: new Map([['content-type', 'application/json']]),
    body: {
      getReader() {
        return {
          async read() {
            if (readOnce) return { done: true };
            readOnce = true;
            return { done: false, value: Buffer.from(payload) };
          },
          async cancel() {},
        };
      },
    },
  });
  const res = await safeFetch('https://api.example.com', {}, { lookup, fetchImpl, dispatcher: {} });
  assert.equal(res.ok, true);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { hello: 'world' });
});
