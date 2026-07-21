// HTTP security middleware: security headers (helmet), a Permissions-Policy,
// no-store caching for API responses, and rate limiters. Applied in
// server/index.js. The app and its API are same-origin, so there is no CORS
// surface; browsers enforce same-origin.

import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';

/**
 * Security headers tuned for the Vite/React SPA (same-origin script + CSS, React
 * inline styles). No external origins are needed. frame-ancestors 'none' plus
 * helmet's X-Frame-Options: DENY prevent clickjacking; HSTS is enabled for
 * production HTTPS. Kept deliberately not "overly strict" (tested against the
 * built frontend).
 */
export function securityHeaders() {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        'base-uri': ["'self'"],
        'object-src': ["'none'"],
        'frame-ancestors': ["'none'"],
        'frame-src': ["'none'"],
        'script-src': ["'self'"],
        'style-src': ["'self'", "'unsafe-inline'"], // React inline style attributes
        'img-src': ["'self'", 'data:', 'blob:'],
        'media-src': ["'self'", 'blob:', 'data:'],
        'font-src': ["'self'", 'data:'],
        'connect-src': ["'self'"],
        'worker-src': ["'self'", 'blob:'],
        'form-action': ["'self'"],
      },
    },
    hsts: { maxAge: 15552000, includeSubDomains: true }, // 180 days
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    crossOriginResourcePolicy: { policy: 'same-origin' },
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginEmbedderPolicy: false, // avoid breaking data:/blob: assets
  });
}

/** Deny powerful browser features the app does not use. */
export function permissionsPolicy(_req, res, next) {
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=()',
  );
  next();
}

/** Prevent browser/proxy caching of (potentially sensitive) API responses. */
export function noStoreApi(_req, res, next) {
  res.setHeader('Cache-Control', 'no-store');
  next();
}

function makeLimiter({ windowMs, limit, skipSuccessfulRequests = false }) {
  return rateLimit({
    windowMs,
    limit,
    skipSuccessfulRequests,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // Keyed on req.ip, which is trustworthy only because index.js sets
    // `trust proxy` to exactly one hop (the local nginx). Returns 429 JSON.
    handler: (req, res) => {
      res.status(429).json({
        error: '请求过于频繁，请稍后再试',
        requestId: res.locals?.requestId,
      });
    },
  });
}

// Auth: count only FAILED logins (2xx skipped), so legitimate users are never
// locked out while brute-force/credential-stuffing trips the limit — a simple
// per-IP lockout that does not reveal whether an account exists.
export const loginLimiter = makeLimiter({ windowMs: 15 * 60 * 1000, limit: 10, skipSuccessfulRequests: true });
export const registerLimiter = makeLimiter({ windowMs: 60 * 60 * 1000, limit: 10 });
// Provider validation and AI generation make outbound calls — cap them.
export const validateLimiter = makeLimiter({ windowMs: 15 * 60 * 1000, limit: 20 });
export const configWriteLimiter = makeLimiter({ windowMs: 15 * 60 * 1000, limit: 60 });
export const uploadLimiter = makeLimiter({ windowMs: 5 * 60 * 1000, limit: 30 });
export const generationLimiter = makeLimiter({ windowMs: 5 * 60 * 1000, limit: 60 });
// General API burst limit (per IP). Generous for normal use.
export const apiLimiter = makeLimiter({ windowMs: 60 * 1000, limit: 150 });
