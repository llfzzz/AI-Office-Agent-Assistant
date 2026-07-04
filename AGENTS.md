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
| E2E (manual) | `npm run verify:gemini` / `npm run verify:memory` | Require live PocketBase + a real `GEMINI_API_KEY` |

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
| `src/api.ts` | Typed fetch client; injects auth token + AI-provider headers |
| `src/aiProvider.ts` | Local (browser) AI provider settings, normalized on read |

**Backend (`server/`)** — Express API. `index.js` (routing, request logging, auth guards,
SPA fallback) → `analyzer.js` (skill orchestration) → `prompts.js` (prompt builders),
`gemini.js` (HTTP/JSON/provider), `mock.js` (demo fallbacks when no key), `rag.js`
(keyword RAG), `storage.js` (PocketBase CRUD), `transcriber.js` / `extractor.js`
(audio + file → text), `pocketbase.js` (client + `requireAuth`).

Without `GEMINI_API_KEY` the server degrades to deterministic **demo-fallback** parsing;
the UI marks this as "演示模式". `pb_migrations/` defines the PocketBase schema.

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
| Cleanup | Unused `src/assets/{hero,react,vite}`; stale `<title>` and package name | Removed; renamed to `AI Office Agent Assistant` / `ai-office-agent-assistant` |
| Testing | No automated tests | `node:test` suite (28 tests) for fallbacks, Gemini JSON/provider, RAG ranking, extraction, linked-meeting builder |
| CI | No quality gate | `.github/workflows/ci.yml`: typecheck → lint → test → build |

## Tests

`test/` uses Node's built-in runner (zero deps): `mock.test.js`, `gemini.test.js`,
`rag.test.js`, `extractor.test.js`, `analyzer.test.js`. They cover pure/near-pure server
logic (RAG uses a stubbed `context.pb`) so `npm test` runs with no server, database, or API key.

## Verification results (this branch)

- `npm run typecheck` ✅  · `npm run lint` ✅ (incl. server) · `npm test` ✅ 28/28 · `npm run build` ✅
- Build output: JS 286.8 kB (gzip 87.3 kB), CSS 44.0 kB (gzip 9.0 kB)
- Preview smoke test: login screen renders, login/register toggle works, no console errors

## Decisions & non-changes (intentional)

- **`src/freejoy/**` vendored** — imported from the design MCP; not refactored. Its `Modal`
  has no focus trap (known limitation, deferred).
- **`.env`** — gitignored local secrets, left untouched. Note the repo reads `GEMINI_*`
  vars (see `.env.example`); a local `.env` using other names simply runs in demo mode.
- **`localStorage` auth-token key** — kept stable to avoid logging out existing users.
- **`sendError` upstream passthrough** — surfaces PocketBase/Gemini messages to the client;
  acceptable for a local single-user prototype (logged server-side with the request id). If
  exposed publicly, sanitize 5xx messages. Deferred.

## Known limitations / deferred work

- **Playwright E2E**: not added. Full flows need a live PocketBase (auth) + optional Gemini
  key that can't be provisioned/verified here; shipping unrunnable browser tests + a heavy
  dep was out of scope. To add later: run `./pocketbase serve` + `npm run dev`, then drive
  `http://localhost:5173/office-agent/` (register → compose → save → weekly with a linked
  meeting → outputs → feedback).
- **Subpath production serving**: Vite rebases built asset URLs to `/office-agent/`, but
  `express.static` serves at root — a reverse proxy is expected to map the subpath in
  production (`start-production.sh`).
- **RAG** is keyword-overlap only (no embeddings); fine for the prototype scale.
