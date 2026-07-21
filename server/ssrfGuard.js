// SSRF protection for outbound AI provider requests.
//
// These checks are UNCONDITIONAL — they never depend on NODE_ENV. A custom
// provider Base URL is user-supplied, so every outbound request built from it
// must be validated: protocol, literal-IP form, DNS resolution of every
// address, connection pinning to a validated address (to defeat DNS
// rebinding), and re-validation of every redirect hop, plus response-size and
// redirect caps.
//
// Built-in providers use fixed public HTTPS endpoints and simply pass these
// checks naturally (they resolve to public addresses), so the same guard is
// applied uniformly.

import dnsPromises from 'node:dns/promises';
import net from 'node:net';
import { Agent } from 'undici';

// --- Blocked (non-public) address ranges, IPv4 + IPv6 -----------------------
const blocklist = new net.BlockList();

const V4_BLOCKS = [
  ['0.0.0.0', 8],        // "this" network / unspecified
  ['10.0.0.0', 8],       // RFC1918
  ['100.64.0.0', 10],    // CGNAT
  ['127.0.0.0', 8],      // loopback
  ['169.254.0.0', 16],   // link-local (incl. 169.254.169.254 metadata)
  ['172.16.0.0', 12],    // RFC1918
  ['192.0.0.0', 24],     // IETF protocol assignments
  ['192.0.2.0', 24],     // TEST-NET-1
  ['192.88.99.0', 24],   // 6to4 relay anycast
  ['192.168.0.0', 16],   // RFC1918
  ['198.18.0.0', 15],    // benchmarking
  ['198.51.100.0', 24],  // TEST-NET-2
  ['203.0.113.0', 24],   // TEST-NET-3
  ['224.0.0.0', 4],      // multicast
  ['240.0.0.0', 4],      // reserved (incl. 255.255.255.255 broadcast)
];
for (const [addr, prefix] of V4_BLOCKS) blocklist.addSubnet(addr, prefix, 'ipv4');

const V6_BLOCKS = [
  ['::1', 128],          // loopback
  ['::', 128],           // unspecified
  ['fe80::', 10],        // link-local
  ['fc00::', 7],         // unique local (ULA)
  ['ff00::', 8],         // multicast
  ['2001:db8::', 32],    // documentation
  ['64:ff9b::', 96],     // NAT64
  ['100::', 64],         // discard-only
  // NOTE: IPv4-mapped (::ffff:0:0/96) is intentionally NOT added here. Adding it
  // as an ipv6 subnet makes net.BlockList match ALL IPv4 addresses on an 'ipv4'
  // check (it treats the mapped range as covering IPv4), which would block every
  // public host. Mapped addresses are handled explicitly by embeddedIpv4() below.
];
for (const [addr, prefix] of V6_BLOCKS) {
  if (prefix === 128) blocklist.addAddress(addr, 'ipv6');
  else blocklist.addSubnet(addr, prefix, 'ipv6');
}

const LOCAL_SUFFIXES = ['.local', '.localhost', '.internal', '.lan', '.home', '.corp', '.intranet'];

export function ssrfError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  err.isSsrfBlock = true;
  return err;
}

function stripBrackets(host) {
  return String(host || '').replace(/^\[/, '').replace(/\]$/, '');
}

// Pull an embedded IPv4 out of IPv4-mapped / mixed IPv6 forms (e.g. ::ffff:1.2.3.4).
function embeddedIpv4(ip) {
  const m = String(ip).match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  return m && net.isIP(m[1]) === 4 ? m[1] : '';
}

/**
 * True when a CANONICAL IP string falls in a blocked (non-public) range.
 * A string that is not a canonical IP is treated as unsafe.
 */
export function isBlockedIp(ip) {
  const bare = stripBrackets(ip);
  const fam = net.isIP(bare);
  if (fam === 4) return blocklist.check(bare, 'ipv4');
  if (fam === 6) {
    const v4 = embeddedIpv4(bare);
    if (v4 && blocklist.check(v4, 'ipv4')) return true;
    return blocklist.check(bare, 'ipv6');
  }
  return true;
}

// Reject numeric hostnames in non-canonical forms (decimal dword, hex, octal,
// shortened dotted) that getaddrinfo would coerce into an IP — e.g. 2130706433,
// 0x7f000001, 0177.0.0.1, 127.1 all mean 127.0.0.1.
export function isNonCanonicalNumericHost(host) {
  const h = String(host || '');
  if (net.isIP(h)) return false;            // canonical IPs handled elsewhere
  if (/^0x[0-9a-f]+$/i.test(h)) return true;
  if (/^\d+$/.test(h)) return true;
  if (/^[0-9.]+$/.test(h)) return true;     // dotted but not a canonical IPv4
  return false;
}

function allowInsecureHttpDefault() {
  // Disabled by default. Only an explicit dev opt-in permits plain HTTP.
  return process.env.AI_ALLOW_INSECURE_HTTP === '1';
}

/**
 * Synchronously validate a URL's protocol and literal host (no DNS). Throws an
 * ssrfError on anything unsafe. Returns a URL object. Unconditional.
 */
export function assertPublicUrl(rawUrl, { allowHttp = allowInsecureHttpDefault() } = {}) {
  const value = String(rawUrl || '').trim();
  if (!value) throw ssrfError('Base URL 不能为空');

  let url;
  try {
    url = new URL(value);
  } catch {
    throw ssrfError('Base URL 不是有效的地址');
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw ssrfError('Base URL 仅支持 http/https 协议');
  }
  if (url.protocol === 'http:' && !allowHttp) {
    throw ssrfError('Base URL 必须使用 HTTPS');
  }
  if (url.username || url.password) {
    throw ssrfError('Base URL 不允许包含用户名或密码');
  }

  const host = stripBrackets(url.hostname).toLowerCase();
  if (!host) throw ssrfError('Base URL 缺少主机名');

  if (net.isIP(host)) {
    if (isBlockedIp(host)) throw ssrfError('不允许访问本地或内网地址');
    return url;
  }
  if (isNonCanonicalNumericHost(host)) {
    throw ssrfError('不允许使用非规范的 IP 形式（十进制/十六进制/八进制）');
  }
  if (host === 'localhost' || LOCAL_SUFFIXES.some((s) => host.endsWith(s))) {
    throw ssrfError('不允许访问本地或内网地址');
  }

  return url;
}

/**
 * Resolve a hostname and validate EVERY resolved address. Returns the list of
 * validated {address, family}. Throws if any address is blocked. A literal IP
 * short-circuits to itself. `lookup` is injectable for tests.
 */
export async function resolveAndValidate(hostname, lookup = dnsPromises.lookup) {
  const bare = stripBrackets(hostname);
  const literalFamily = net.isIP(bare);
  if (literalFamily) {
    if (isBlockedIp(bare)) throw ssrfError('目标地址不被允许');
    return [{ address: bare, family: literalFamily }];
  }

  let results;
  try {
    results = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw ssrfError('无法解析目标主机地址');
  }
  const list = Array.isArray(results) ? results : [results];
  if (!list.length) throw ssrfError('无法解析目标主机地址');

  for (const r of list) {
    if (!r || !r.address || isBlockedIp(r.address)) {
      throw ssrfError('目标主机解析到内网/保留地址，已阻止');
    }
  }
  return list;
}

const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);
const DEFAULT_MAX_BYTES = 12 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 3;

function pinLookup(addr) {
  // Node's net.connect calls lookup(host, options, cb). With all:false the
  // callback is (err, address, family); with all:true it is (err, [{...}]).
  return (_hostname, options, cb) => {
    if (options && options.all) cb(null, [{ address: addr.address, family: addr.family }]);
    else cb(null, addr.address, addr.family);
  };
}

async function readCapped(response, maxBytes) {
  const cl = Number(response.headers.get('content-length'));
  if (Number.isFinite(cl) && cl > maxBytes) {
    try { await response.body?.cancel(); } catch { /* ignore */ }
    throw ssrfError('AI 服务响应体过大', 502);
  }
  if (!response.body) {
    return { ok: response.ok, status: response.status, headers: response.headers, _text: '', _buf: Buffer.alloc(0) };
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      try { await reader.cancel(); } catch { /* ignore */ }
      throw ssrfError('AI 服务响应体过大', 502);
    }
    chunks.push(Buffer.from(value));
  }
  const buf = Buffer.concat(chunks);
  return { ok: response.ok, status: response.status, headers: response.headers, _text: buf.toString('utf8'), _buf: buf };
}

function wrapResponse(capped) {
  return {
    ok: capped.ok,
    status: capped.status,
    headers: capped.headers,
    async text() { return capped._text; },
    async json() { return JSON.parse(capped._text); },
    async arrayBuffer() { return capped._buf; },
  };
}

/**
 * SSRF-hardened fetch. Validates + resolves + pins + re-validates redirects and
 * caps the response. Returns a minimal Response-like object exposing
 * ok/status/headers/text()/json()/arrayBuffer(). Unconditional.
 *
 * guard: { allowHttp, maxRedirects, maxBytes, dispatcher, lookup, fetchImpl }
 * When a `dispatcher` is supplied (e.g. an outbound proxy) connection pinning
 * is skipped, but URL/DNS validation still runs.
 */
export async function safeFetch(rawUrl, options = {}, guard = {}) {
  const {
    allowHttp = allowInsecureHttpDefault(),
    maxRedirects = DEFAULT_MAX_REDIRECTS,
    maxBytes = DEFAULT_MAX_BYTES,
    dispatcher,
    lookup = dnsPromises.lookup,
    fetchImpl = fetch,
  } = guard;

  let current = assertPublicUrl(rawUrl, { allowHttp });
  let redirectsLeft = maxRedirects;

  for (;;) {
    const addrs = await resolveAndValidate(current.hostname, lookup);
    const pinnedAgent = dispatcher ? null : new Agent({ connect: { lookup: pinLookup(addrs[0]) } });

    try {
      const response = await fetchImpl(current, {
        ...options,
        dispatcher: dispatcher || pinnedAgent,
        redirect: 'manual',
      });

      if (REDIRECT_STATUS.has(response.status) && response.headers.get('location')) {
        if (redirectsLeft <= 0) throw ssrfError('AI 服务重定向次数过多', 502);
        redirectsLeft -= 1;
        const next = new URL(response.headers.get('location'), current);
        try { await response.body?.cancel(); } catch { /* ignore */ }
        current = assertPublicUrl(next.toString(), { allowHttp }); // re-validate each hop
        continue;
      }

      return wrapResponse(await readCapped(response, maxBytes));
    } finally {
      if (pinnedAgent) pinnedAgent.destroy().catch(() => {});
    }
  }
}
