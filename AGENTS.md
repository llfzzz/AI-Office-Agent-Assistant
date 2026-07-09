# AGENTS.md — Engineering Guide

AI Office Agent Assistant: a React 19 + TypeScript + Vite SPA with an Express 5 API,
PocketBase for auth/storage, and Google Gemini for AI. It ships three office "skills"
(meeting minutes / weekly report / PRD review) plus a meeting-memory library, RAG
knowledge base, output records, and a feedback loop. UI uses the vendored **Free Joy**
design system (see `DESIGN.md`).

## Commands

| Task | Command | Notes |
| --- | --- | --- |
| Dev (client + server) | `npm run dev` | Needs PocketBase running separately (`./pocketbase serve`) |
| Dev client only | `npm run dev:client` | Vite on `http://localhost:5173/office-agent/` |
| Typecheck | `npm run typecheck` | `tsc -b` (app + node projects) |
| Lint | `npm run lint` | ESLint over `src`, `server`, `scripts`, `test` |
| Unit tests | `npm test` | Node built-in `node:test`; no server/DB/key needed |
| Build | `npm run build` | `tsc -b && vite build` |
| E2E (manual) | `npm run verify:ai` / `npm run verify:memory` | Require live PocketBase; `verify:ai` also needs `VERIFY_AI_API_KEY` (optional `VERIFY_AI_PROVIDER`/`VERIFY_AI_MODEL`) and creates a per-user AI config for a throwaway account |
| Load testing | `npm run loadtest:install` then `loadtest/.bin/k6 run loadtest/scenarios/<name>.js` | Needs live server + PocketBase, demo mode (no AI key). See `loadtest/README.md`; results in `loadtest/REPORT.md` |

## Architecture

**Frontend (`src/`)** — `App.tsx` is now a ~1000-line orchestrator (state, hooks, layout,
page routing) that composes:

| Folder | Responsibility |
| --- | --- |
| `src/types/` | `index.ts` domain/API types + `ui.ts` app UI types (`View`, nav, attachments); barrel re-exports so `import … from './types'` still works |
| `src/data/` | `constants.ts` — value constants (blank forms, `skillCards`, `meetingTypes`, `sampleMeeting`, file-accept list) |
| `src/lib/` | `format.ts` (ids/timestamps/mime/transcript/attachment helpers) + `office.ts` (`skillName`, output type guards) |
| `src/hooks/` | `useDebouncedValue`, `useDismiss` (click-outside + Escape) |
| `src/app/` | `navigation.ts` — nav group config, helpers, viewport check |
| `src/components/` | Shared leaves: `primitives` (Metric/EmptyState/MemoryMap/SourceBadge/MeetingAssetIcon), `ListBlock`, `ResultPanel`, `OfficeResultPanel`, `OfficeOutputPreview`, `UtilityMenu`, `AiSettingsModal` |
| `src/views/` | One file per page (auth, home, workbench, weekly, prd, compose, library, detail, rag, outputs, feedback, docs) |
| `src/ui/` | App adapters over Free Joy (`SemanticPanel`, `ScorePicker`) |
| `src/freejoy/` | **Vendored** Free Joy component subset — do not refactor |
| `src/api.ts` | Typed fetch client; injects the auth token |
| `src/aiProvider.ts` | AI provider config/catalog types + display labels (masked projections only — keys never reach the client) |

**Backend (`server/`)** — Express API. `index.js` (routing, request logging, auth guards,
SPA fallback) → `analyzer.js` (skill orchestration) → `prompts.js` (prompt builders),
`gemini.js` (HTTP/JSON/provider), `mock.js` (demo fallbacks when no key), `rag.js`
(keyword RAG), `storage.js` (PocketBase CRUD), `transcriber.js` / `extractor.js`
(audio + file → text), `pocketbase.js` (client + `requireAuth`).

AI calls resolve the caller's **per-user default AI config** (`getActiveAiProvider`);
there is no env/server-wide key. Without a usable config the server degrades to
deterministic **demo-fallback** parsing; the UI marks this as "演示模式".
`pb_migrations/` defines the PocketBase schema.

## Review — issues found → fixes applied

| Area | Issue | Fix |
| --- | --- | --- |
| Correctness | Weekly-report "referenced meetings" sent only raw IDs to the model; content never used | `analyzer.js` resolves `linked_meeting_ids` via `getMeeting` into a reference block injected into the RAG query + prompt (`buildLinkedMeetingsContext`, rendered by `formatOfficeInput`) |
| Correctness | `saveMeeting` stored the literal `'自动识别'` instead of the detected type | Treat `'自动识别'` as auto and prefer `analysis.structured_minutes.meeting_type` |
| Maintainability | `App.tsx` was 3419 lines (one file, ~25 components) | Split into `app/components/views/hooks/lib/data/types`; App is now the orchestrator only |
| Tooling | ESLint skipped all `server/**` JS | Config now lints `server`, `scripts`, `test`; fixed useless-assignment, useless-catch, control-char regex, missing error `cause` |
| Robustness | Unknown `/api/*` fell through to SPA HTML; no request logging; no startup summary | JSON 404 for unknown API routes; correlation-id request logging (no bodies/tokens); startup config summary |
| Performance | Library search refetched the whole list on every keystroke; provider settings wrote to `localStorage` on every request | Debounced search (`useDebouncedValue`); `getStoredAiProviderSettings` is now a pure read |
| A11y | Utility popover closed only on outside-click; `<html lang="en">` for Chinese content | Escape now closes it (`useDismiss`); `lang="zh-CN"` |
| Navigation | After login there was no way back to the workbench "index" once you navigated away | Sidebar brand is now a button that returns to `skills` (the workbench) |
| Polish | Static filler panels (hardcoded "Agent Plan" flow + "下一版建议" advice); off-brand purple favicon | Removed both panels; new topic-matched **AppLogo** (coral "AI document" glyph) shared by the favicon and in-app brand mark |
| Interaction | Workbench skill cards / metric tiles weren't clickable (only the tiny arrow was); AI settings persisted per-keystroke with no explicit action; skill/output icon SVGs sat top-left in their tiles | Whole skill card is a keyboard-accessible button; metric tiles navigate to their view (`Metric onClick`); AI settings modal now edits a draft with an explicit **保存配置** button; centered the icon tiles |
| Cleanup | Unused `src/assets/{hero,react,vite}`; stale `<title>` and package name | Removed; renamed to `AI Office Agent Assistant` / `ai-office-agent-assistant` |
| AI providers | Custom keys lived in `localStorage` and were sent as headers per request; only the Gemini API format worked | Per-user **encrypted** configs in the DB, resolved server-side; versioned provider catalog (DeepSeek/OpenAI/Anthropic/Gemini/Other) with official base URLs + curated models; OpenAI-compatible adapter alongside native Gemini (see the section below) |
| Testing | No automated tests | `node:test` suite (56 tests): fallbacks, Gemini JSON/provider, RAG ranking, extraction, linked-meeting builder, crypto, provider catalog, config store |
| CI | No quality gate | `.github/workflows/ci.yml`: typecheck → lint → test → build |

### Final audit pass (2026-07-08)

| Area | Issue | Fix |
| --- | --- | --- |
| Correctness | OpenAI adapter sent `max_tokens` + `temperature` to gpt-5*/o-series, which reject both → every call 400'd into demo fallback | `buildOpenAiRequestBody` switches reasoning families to `max_completion_tokens` and omits `temperature` (verified against current OpenAI docs) |
| Correctness | OpenAI-mode configs silently dropped audio/image parts → the model invented "transcripts" | Multimodal parts now raise a clear 400 (`filePartFromBuffer` + message flattening); transcriber/extractor also pre-check for a usable provider |
| Correctness | Validate probe used `max_tokens: 1` → thinking models emit no text → valid keys marked invalid | 128-token probe budget; an HTTP-200 "empty response" counts as valid |
| Correctness | Global `express.json` consumed `.json` meeting-file uploads before `express.raw` → 400 "file is required" | Raw-body routes registered before the JSON parser |
| Correctness | Direct `:8788` serving broken (assets built under `/office-agent/` but only `/api` was prefix-rewritten) | Base-path rewrite now applies to all URLs; works with and without a prefix-stripping proxy |
| Security | DOCX/PPTX/XLSX extractor inflated every ZIP entry unbounded → zip-bomb OOM DoS | Only matched entries are inflated, with per-entry (24 MB) + total (64 MB) `maxOutputLength` caps |
| Stale | `verify-gemini-e2e.mjs` asserted the removed env provider and sent removed headers | Rewritten as `verify-ai-e2e.mjs` (`npm run verify:ai`): creates + validates a per-user config from `VERIFY_AI_*` env |
| Cleanup | Dead `normalizeBaseUrl`/`safeEqual`, unused `public/icons.svg`, legacy `data/` dir + gitignore entries, stale GEMINI_* docs | Removed/updated; tests now cover the new adapter + zip caps (**64 tests**) |

### Load testing pass (2026-07-09)

Re-verified typecheck/lint/test/build + a full live smoke flow (all green, matching this doc's prior claims), then load-tested with k6 across 8 scenarios chosen from this codebase's actual architecture (see `loadtest/REPORT.md` for full methodology, numbers, and the box's shared-host constraints).

| Area | Issue | Fix |
| --- | --- | --- |
| Correctness / Data consistency | Concurrent `POST /api/ai-configs/:id/default` (also create/update/delete with `is_default`) raced on the non-transactional `unsetOtherDefaults` + update sequence — load-tested: **4/5 bursts of 8 concurrent requests left zero configs marked default**, not ">1" as hypothesized. `getActiveAiProvider` then silently returns `{}`, degrading a user's AI calls to demo mode with no visible error | `withUserLock` (`server/aiConfigStore.js`): an in-process, per-user async mutex serializing `createAiConfig`/`updateAiConfig`/`setDefaultAiConfig`/`deleteAiConfig` (single Node process, no clustering, so this fully closes the race without a DB transaction) |
| Reliability | The first fix attempt (`result.finally(cleanup)`) crashed the entire Node process on any concurrently-rejecting request (e.g. a legitimate 404 on a second concurrent delete) — an unhandled promise rejection, confirmed via `journalctl`: `Main process exited, code=exited, status=1/FAILURE`. Found *by the same load test*, before the fix was considered done | Swallow the rejection on a copy of the chain before attaching cleanup: `result.catch(() => {}).finally(cleanup)`. Regression-tested (`test/aiConfigStore.test.js`): one test deliberately confirmed to fail with `failureType: 'unhandledRejection'` against the pre-fix code |
| Security (documented, not fixed) | No rate limiting or lockout anywhere: 20 wrong-password login attempts and repeated `validate` probes (real third-party call) never hit a 429 or backoff | Documented in `loadtest/REPORT.md` risk list; deferred — no throttling middleware added this pass |
| Performance (documented, not fixed) | `server/rag.js`/`server/storage.js` list/RAG endpoints use unpaginated `getFullList()` and re-tokenize the whole knowledge base per call — measured avg latency ~3× (121ms→361ms) and throughput -66% (40.4→13.6 req/s) going from 10 to 200 seeded documents | Documented; acceptable at this project's stated prototype scale, flagged for before scaling further |
| Reliability (documented, not fixed) | PocketBase is not supervised by systemd (started manually) — confirmed it stayed up for the entire test session, but has no auto-restart if it does crash | Documented; recovery command in `loadtest/README.md` |
| Verified, no fix needed | Zip-bomb decompression caps (24MB/entry, 64MB/total, added in the prior audit pass) hold correctly **under concurrency**, not just single-request; a concurrent health-check canary showed no event-loop-blocking impact; process memory returned to baseline after each burst (no leak) | N/A — confirms the prior pass's fix is robust |
| Tests | Coverage gap: no test exercised `aiConfigStore`'s CRUD/locking paths (only pure helpers were tested) | Exported `withUserLock` for testing (matches this file's existing "exported for unit testing" convention); 2 new tests pin its serialization + no-unhandled-rejection contract (**66 tests**) |

## Tests

`test/` uses Node's built-in runner (zero deps): `mock`, `gemini`, `rag`,
`extractor`, `transcriber`, `analyzer`, `crypto`, `catalog`, `aiConfigStore`.
They cover pure/near-pure server logic (RAG/store use stubs) so `npm test` runs
with no server, database, or API key — **66 tests**.

## Verification results

- `npm run typecheck` ✅  · `npm run lint` ✅ (incl. server) · `npm test` ✅ 66/66 · `npm run build` ✅
- Build output: JS ~293 kB (gzip ~89 kB), CSS ~47.6 kB (gzip ~9.7 kB)
- Live (2026-07-08, running server + PocketBase): 29/29 API checks — register/login,
  demo analyze→save→list→detail→ask, knowledge+RAG office run→output→feedback,
  `.json` file extraction, clean 400s for audio/image without a provider, AI-config
  create/validate/delete with catalog base-URL enforcement, cross-user 404 isolation,
  JSON 404 for unknown API routes, subpath + root static serving with correct cache
  headers (direct `:8788` and via nginx), `npm run verify:memory` ✅
- Load testing (2026-07-09): 8 k6 scenarios, 100% pass after the concurrency fix
  above (was a 20% burst-failure rate before); zero process crashes, zero systemd
  restarts, zero impact on 14 co-located unrelated services. Full results in
  `loadtest/REPORT.md`.

## Decisions & non-changes (intentional)

- **`src/freejoy/**` vendored** — imported from the design MCP; not refactored. Its `Modal`
  has no focus trap (known limitation, deferred).
- **`.env`** — gitignored local secrets, left untouched. The server reads `AI_CONFIG_SECRET`
  plus optional `AI_*` tuning vars (see `.env.example`); there is **no** server-wide AI key —
  provider keys live per user, encrypted in PocketBase.
- **`localStorage` auth-token key** — kept stable to avoid logging out existing users.
- **`sendError` upstream passthrough** — surfaces PocketBase/Gemini messages to the client;
  acceptable for a local single-user prototype (logged server-side with the request id). If
  exposed publicly, sanitize 5xx messages. Deferred.

## Per-user AI provider configurations (encrypted at rest)

Each user stores their own AI provider configs in the database. Keys are
encrypted server-side and **never** returned to the client, stored in
localStorage, or logged. The default config is resolved server-side per request.

### Data model (`pb_migrations/20260704000100_ai_provider_configs.js`)

`ai_provider_configs` — one row per config, owned by `user`:
`label`, `provider`, `base_url`, `model`, `api_key_cipher` (AES-256-GCM
envelope, never exposed), `api_key_hint` (masked, e.g. `sk-****abcd`),
`is_default`, `last_validation_status` (`unknown|valid|invalid|unreachable`),
`last_validation_message` (no secrets), `last_validated_at`.

`ai_config_audit` — append-only trail: `user`, `action`
(`create|update|validate|set_default|delete`), `config_id`, `config_label`,
`detail` (no secrets). `updateRule`/`deleteRule` are `null` → immutable via API.

### Encryption (`server/crypto.js`)

AES-256-GCM. Key = `scrypt(AI_CONFIG_SECRET, appSalt, 32)`, cached. Envelope
`v1:<iv b64>:<authTag b64>:<ciphertext b64>` — random 12-byte IV per encryption,
GCM tag detects tampering (decrypt throws). `AI_CONFIG_SECRET` (≥16 chars) lives
only in server env (see `.env.example`); rotating it invalidates stored keys.
`maskSecret` reveals only a short prefix + last 4 chars. When the secret is
absent, saving/reading custom keys is refused (503) and AI calls run in demo mode.

### Provider catalog & request adapters (`server/providers/catalog.js`)

A **versioned catalog** (`CATALOG_VERSION`) is the single source of truth for
built-in providers — labels, official base URLs, `apiMode`, and curated models
(grouped `recommended|fast|reasoning|legacy` with hints + a default). It is
served to the frontend at `GET /api/ai-providers`, so the model lists live in one
backend file and can be updated without shipping frontend changes. Add/rename/
retire models by editing this file and bumping `CATALOG_VERSION`.

Built-in presets (base URLs verified against official docs, 2026-07):

| id | apiMode | Base URL | Notes |
| --- | --- | --- | --- |
| `deepseek` | openai | `https://api.deepseek.com` | OpenAI-compatible |
| `openai` | openai | `https://api.openai.com/v1` | native OpenAI |
| `anthropic` | openai | `https://api.anthropic.com/v1` | Anthropic's OpenAI-compat endpoint |
| `gemini` | gemini | `https://generativelanguage.googleapis.com/v1beta` | native, multimodal |
| `other` | openai/gemini | *(user-supplied)* | custom endpoint |

`apiMode` selects the request adapter in `server/gemini.js`: `gemini` → native
`:generateContent` (`X-goog-api-key`, supports file/vision); `openai` →
`POST {base}/chat/completions` (`Authorization: Bearer`). For built-in providers
the server **enforces** the catalog base URL + apiMode (a client-supplied
`base_url` is ignored) so keys can't be redirected to an attacker endpoint. Only
`other` accepts a custom URL, validated by `assertSafeCustomUrl` (HTTPS + no
localhost/private hosts in production). File/image extraction and audio
transcription remain Gemini-only; OpenAI-mode configs are rejected with a clear
error (never silently dropped, which would let the model invent a transcript).

OpenAI reasoning families (`gpt-5*`, `o1/o3/o4…`) get `max_completion_tokens`
and no `temperature` (they reject the classic params); DeepSeek/Anthropic-compat/
custom endpoints keep `max_tokens` + `temperature` (`buildOpenAiRequestBody`).
The validate probe runs with a 128-token budget and treats an HTTP-200
"empty response" as a valid connection (thinking models may spend the whole
budget before emitting text).

### API contract (auth required)

| Method | Path | Body / result |
| --- | --- | --- |
| GET | `/ai-providers` | → catalog `{ version, providers[] }` (no secrets) |
| GET | `/ai-configs` | → `{ configs: Masked[], encryption:{available} }` |
| POST | `/ai-configs` | `{label,provider,model,api_key,is_default?, base_url?,api_mode?}` → `{config}` (201) |
| PATCH | `/ai-configs/:id` | same fields, `api_key` optional (blank = keep) → `{config}` |
| POST | `/ai-configs/:id/default` | → `{config}` (sets default, unsets others) |
| POST | `/ai-configs/:id/validate` | probes provider → `{config}` with status |
| DELETE | `/ai-configs/:id` | → 204 (promotes another to default if needed) |

`base_url`/`api_mode` are honored only for `provider:'other'`; built-in providers
derive them from the catalog. Responses only ever carry the **masked** projection
(`recordToMaskedConfig`) — never `api_key_cipher` or plaintext. AI calls
(analyze/plan/run/ask/transcribe/extract/feedback) resolve the caller's default
via `getActiveAiProvider(context)`, which decrypts in memory only. The old
`x-ai-*` request headers are removed.

### Authorization

PocketBase collection rules scope every row to its owner
(`@request.auth.id = user.id`); the server operates with the caller's token, so a
foreign `:id` returns 404 on view/update/validate/set-default/delete. Verified:
a second user gets 404 on all operations against another user's config and sees
an empty list.

### Migration steps

`npm run pb:migrate` (or restart `./pocketbase serve`, which auto-applies
`pb_migrations`): `…000100` creates both collections; `…000200` adds `api_mode`.
Set `AI_CONFIG_SECRET` in the server env before enabling custom keys.
Down-migrations reverse each step.

### Verification results

- Unit (part of the **56**-test `node:test` suite, all green):
  `test/crypto.test.js` (round-trip, random IV, tamper/GCM failure, wrong secret,
  masking, availability); `test/catalog.test.js` (5 providers, official base
  URLs + apiModes, default model ∈ list, only `other` editable, no secrets);
  `test/aiConfigStore.test.js` (masked projection strips cipher, **preset base-URL
  enforcement**, custom-URL HTTPS/private-host validation in production,
  validation-error classification, no secret echo).
- Live (PocketBase + API + preview): built-in preset creation stored the
  **catalog** base URL and ignored a malicious client `base_url`; masked hint
  `sk-****abcd`; **grep of `pb_data` found 0 occurrences of the raw key** with a
  `v1:` envelope present; validate against real DeepSeek with a bad key →
  `invalid`; cross-user view/update/validate/default/delete → 404; audit rows for
  create/set_default/delete contained **no secret material**. UI: provider select
  limited to the 5 presets, base URL auto-filled + hidden for built-ins, grouped
  model selector, `other` reveals custom URL + advanced compat mode, compact FJ
  default Switch.

## Known limitations / deferred work

- **Playwright E2E**: not added. Full flows need a live PocketBase (auth) + a real provider
  key that can't be provisioned/verified here; shipping unrunnable browser tests + a heavy
  dep was out of scope. To add later: run `./pocketbase serve` + `npm run dev`, then drive
  `http://localhost:5173/office-agent/` (register → compose → save → weekly with a linked
  meeting → outputs → feedback).
- **Subpath serving**: the server strips `APP_BASE_PATH` (default `/office-agent`) from
  *all* incoming URLs, so it works both directly on `:8788` and behind a prefix-stripping
  reverse proxy (`start-production.sh` + nginx).
- **RAG** is keyword-overlap only (no embeddings); fine for the prototype scale.
- **Custom "other" endpoints**: `assertSafeCustomUrl` blocks private hosts by name in
  production but does not resolve DNS — a public hostname pointing at an internal IP
  (DNS rebinding) is not detected. Acceptable for a single-tenant prototype; revisit
  before multi-tenant/public hosting.
- **No rate limiting**: login, registration, and the AI-config `validate` probe have no
  throttling at the app layer (confirmed empirically by load testing, not just code
  review — see `loadtest/REPORT.md`). Acceptable for a local prototype; add before
  public hosting.
- **List/RAG endpoints are unpaginated**: `getFullList()` throughout `server/storage.js`
  and `server/rag.js`, with RAG re-tokenizing the entire knowledge base per call (see
  "RAG is keyword-overlap only" above). Load-tested: real but sub-linear latency growth
  (~3× at 20× the data). Fine at prototype scale; add pagination/caching before scaling.
- **PocketBase is not supervised by systemd**: started manually (or via
  `start-production.sh`), unlike `office-agent.service` (`Restart=always`). If it
  crashes, every authenticated endpoint breaks until it's restarted by hand. Not
  observed to crash in practice; worth a systemd unit before unattended production use.
