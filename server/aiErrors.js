// Sanitize AI provider errors. Upstream response bodies, internal hostnames,
// IPs, ports, headers, and credentials must NEVER reach API clients — only a
// coarse, safe classification (plus the request correlation id added by the
// route layer). Detailed diagnostics stay in the server log, with secrets
// redacted.

export function sanitizeProviderStatus(status) {
  const s = Number(status) || 0;
  if (s === 401 || s === 403) return `AI 服务鉴权失败（HTTP ${s}）`;
  if (s === 404) return 'AI 服务地址或模型不存在（HTTP 404）';
  if (s === 429) return 'AI 服务触发限流，请稍后再试（HTTP 429）';
  if (s >= 500) return `AI 服务暂时不可用（HTTP ${s}）`;
  if (s >= 400) return `AI 服务请求失败（HTTP ${s}）`;
  return 'AI 服务请求失败';
}

/**
 * Build a sanitized error for an upstream HTTP failure. Carries no upstream
 * body. Presents a 502 to our own clients; keeps the upstream status for
 * server-side classification only.
 */
export function providerHttpError(status) {
  const err = new Error(sanitizeProviderStatus(status));
  err.status = 502;
  err.upstreamStatus = Number(status) || 0;
  err.sanitized = true;
  return err;
}

export function providerNetworkError() {
  const err = new Error('无法连接到 AI 服务地址');
  err.status = 502;
  err.sanitized = true;
  return err;
}

/** Redact credentials/secrets from a string before it is logged. */
export function redactSensitive(text, ...secrets) {
  let out = String(text ?? '');
  for (const secret of secrets) {
    const s = String(secret || '');
    if (s.length >= 6) out = out.split(s).join('«redacted»');
  }
  return out
    .replace(/(authorization|x-goog-api-key|api[-_]?key)(\s*[:=]\s*)[^\s"',;}]+/gi, '$1$2«redacted»')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer «redacted»')
    .replace(/sk-[A-Za-z0-9._-]{6,}/g, 'sk-«redacted»')
    .replace(/AIza[A-Za-z0-9._-]{6,}/g, 'AIza«redacted»');
}

/**
 * Log detailed upstream diagnostics to the server log ONLY. Truncated and
 * secret-redacted. Never returned to clients.
 */
export function logUpstreamError(kind, detail, ...secrets) {
  const redacted = redactSensitive(detail, ...secrets).slice(0, 500);
  console.error(`[ai] upstream ${kind}: ${redacted}`);
}
