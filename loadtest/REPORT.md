# AI Office Agent Assistant — Load Testing Report

**Date**: 2026-07-09 · **Branch**: `audit/final-review-fixes` · **Commit under test**: `bfb6a87` + this pass's fix
**Tester**: Claude Code, via `/root/.claude/skills/project-load-testing`

## Executive Summary

The project was first re-verified end-to-end (typecheck/lint/test/build + live smoke), then load-tested across 8 scenarios covering the app's specific architectural risk areas (identified from source, not a generic checklist). **One correctness bug was found and fixed**: concurrent "set default AI provider" requests could leave a user with **zero** default configs (not "more than one" as initially hypothesized), silently degrading their AI calls to demo mode with no visible error. Fixing it surfaced and fixed a **second, more severe bug**: the naive fix crashed the entire Node process on any concurrent request that legitimately 404'd. Both are fixed, regression-tested, and re-verified clean under load at higher concurrency than originally triggered them. Three additional issues were found and documented (not fixed, per this pass's agreed scope): absence of rate limiting, unpaginated list/RAG endpoints with a real scaling cost, and PocketBase not being supervised by systemd. The app is stable under all tested loads; the primary real bottleneck is PocketBase's `authRefresh()` round-trip being in the hot path of nearly every request.

## Test Scope

Demo-fallback mode only (no real AI provider key configured — matches the app's actual current live state). Tested directly against `127.0.0.1:8788` / PocketBase `127.0.0.1:8090`, bypassing nginx. Conservative concurrency throughout (≤20 VUs, one exception at 40 max for the auth-hot-path ramp), per an explicit decision to protect a shared, memory-constrained host. Real-AI-provider testing and destructive stress-to-failure ramps were explicitly out of scope for this pass.

## Environment

- **Host**: shared VPS, 2 vCPU, 3.4 GB RAM (~1.4-1.6 GB available during testing), 10 GB free disk — concurrently running an unrelated 14-service "O2O Carpooling" platform, `personal-index-api`, Docker, and nginx.
- **App**: `office-agent.service` (systemd, `Restart=always`, no `MemoryMax`), Node v22.22.2, Express 5.
- **Database**: PocketBase (SQLite-backed), manually started, **not** systemd-supervised (pid stable at 959 throughout this entire test session — never restarted).
- **Load tool**: k6 v2.1.0, installed as a project-local static binary (`loadtest/.bin/k6`, checksum-verified) — no system-wide install, no Docker.

## Test Data

Every scenario creates and cleans up its own throwaway account(s) (`loadtest-<scenario>-<timestamp>@example.com`), relying on PocketBase's `cascadeDelete: true` on every user-owned collection for complete teardown. Scenario 06 seeded one dedicated user's knowledge base to 10 → 50 → 200 documents/meetings (realistic ~1-3KB Chinese business-prose content) to build a scaling curve. Scenario 04 used 4 hand-built ZIP fixtures (`loadtest/seed/generate-zip-fixtures.mjs`) targeting the exact byte layout of `server/extractor.js`'s parser.

## Scenarios and Results

| # | Scenario | Params (official run) | Result |
|---|---|---|---|
| 00 | Smoke gate | 1 VU | ✅ 100% (13/13 checks) |
| 01 | Core CRUD baseline | 5 VUs, 30s | ✅ 100% (350/350); p95 35.2ms, 0% errors |
| 02 | Auth hot path (app vs. direct PocketBase) | 5→10→20 VUs staged, 20s/stage | ✅ 100% (29,834/29,834); see Bottleneck Analysis |
| 03 | Sequential AI chain (demo mode) | 3 VUs, 30s | ✅ 100%; `ai_run_no_links` p95 466.8ms (< 600ms threshold) |
| 04 | Zip-bomb concurrency | 2 VUs × 4 iterations, 60s canary | ✅ 100% (79/79); see below |
| 05 | Rate-limit absence | 20 login + 3 validate attempts, sequential | ✅ 100% — confirms the finding (no throttling exists) |
| 06 | RAG/list volume curve | Fixed 5 VUs, N = 10/50/200 | ✅ 100% correctness; see scaling curve below |
| 07 | Concurrency-consistency | 10 VUs, 20 bursts | ✅ 100% **after** the fix below (was 20% before) |

## Metrics Table

| Scenario | Concurrency | Throughput | Avg | P95 | Max | Error Rate | Notes |
|---|---:|---:|---:|---:|---:|---:|---|
| 01 CRUD baseline | 5 VUs | 10.6 req/s | 17.9ms | 35.2ms | 247ms | 0% | |
| 02 `/api/auth/me` | 5→20 VUs | — | — | — | — | 0% | 3,883 requests completed |
| 02 PocketBase `/api/health` direct | 5→20 VUs | — | — | — | — | 0% | 25,949 requests completed (**~6.7× app's rate**) |
| 03 `office/run` (no links) | 3 VUs | — | — | 466.8ms | — | 0% | demo-fallback, no AI call |
| 04 zip-bomb burst | 2 VUs | 1.2 req/s | 87.5ms | 573ms | 1.44s | 0%* | *0% of expected-outcome checks; k6's raw `http_req_failed` counts the intentional 400s |
| 06 RAG list+plan, N=10 | 5 VUs | 40.4 req/s | 121.1ms | 467.4ms | — | 0% | 14 MB received |
| 06 RAG list+plan, N=50 | 5 VUs | 31.5 req/s | 156.6ms | 529.2ms | — | 0% | 47 MB received |
| 06 RAG list+plan, N=200 | 5 VUs | 13.6 req/s | 361.0ms | 755.9ms | — | 0% | 80 MB received |
| 07 default-race bursts | 10 concurrent × 20 bursts | — | — | — | — | 0%** | **after fix; was 80% burst-failure rate before |

## Bottleneck Analysis

### 1. PocketBase's `authRefresh()` is the real capacity limiter, not Express

**Evidence**: scenario 02 ran the app's cheapest authenticated endpoint (`/api/auth/me`) and a direct, unauthenticated PocketBase health check at identical staged concurrency (5→10→20 VUs) in the same k6 run. Over the same ~70s window, the direct PocketBase call completed **25,949** requests while the app's endpoint — which internally calls `pb.collection('users').authRefresh()` (`server/pocketbase.js:34`) on every single authenticated request, not just login — completed only **3,883** (~6.7× fewer). Zero errors on either side; this is a throughput ceiling, not a stability problem.
**Impact**: every authenticated endpoint in this API (all but 3 routes) pays this cost. PocketBase is effectively the API's real concurrency ceiling.
**Root cause**: `requireAuth` (`server/pocketbase.js:22-45`) round-trips to PocketBase on every request instead of validating the JWT locally or caching a short-lived validation result.
**Fix**: not applied this pass (architectural change, out of "fix only what's broken" scope) — flagged as the top capacity-optimization candidate if real concurrent usage grows.

### 2. RAG/list endpoints scale sub-linearly but non-trivially with data volume

**Evidence**: scenario 06, fixed 5 VUs, sweeping N (knowledge docs + meetings) from 10 → 50 → 200 on one growing dataset: avg latency for the same 3-request-per-iteration workload grew **121ms → 157ms → 361ms** (~3× for a 20× data increase), and iteration throughput dropped **40.4 → 31.5 → 13.6 req/s**. Bytes received per run grew **14MB → 47MB → 80MB**.
**Root cause**: `server/rag.js`'s `retrieveRagContext` calls `listKnowledgeDocuments` (`getFullList()`, no pagination) and re-chunks + re-tokenizes the **entire** knowledge base from scratch, synchronously, on every RAG-enabled call — no caching. `server/storage.js`'s `listMeetings`/`listOfficeOutputs`/`listKnowledgeDocuments` all use `getFullList()` with **no pagination anywhere in the API** — a single request against a large collection has no page-size ceiling at all, independent of concurrency.
**Impact**: acceptable at prototype scale (this project's own documented scope — see AGENTS.md "RAG is keyword-overlap only... fine for the prototype scale"); would need pagination + caching/indexing before scaling to real multi-hundred-document knowledge bases.
**Fix**: not applied this pass (the codebase already documents this as an accepted prototype-scale tradeoff) — confirmed with real numbers rather than left as a guess.

### 3. Zip-bomb decompression caps hold correctly under concurrency, with real but contained resource cost

**Evidence**: scenario 04, all 4 fixtures behaved exactly as designed at every concurrency level tested (2 VUs × 4 iterations): the two adversarial fixtures (one tripping the 24MB per-entry cap, one tripping the 64MB cumulative cap via 4 separate under-cap entries) got a clean 400 every single time; the two legitimate fixtures (trivial, and a 20MB-inflating "large real document") got 200 every time. A concurrent health-check canary stayed 200 throughout. `office-agent` process memory transiently spiked to 227MB (from a ~65MB baseline) during the burst and **returned to baseline** afterward — no leak. `vmstat`'s swap-out counter showed real (if brief) activity during the peak, confirming the operation does exert genuine memory pressure on this box even at minimal concurrency, even though `MemAvailable` never dropped below 1.4GB (far above the 400MB/150MB thresholds set for this box).
**Impact**: the caps added in the prior audit pass (`server/extractor.js:268,276`) work correctly under concurrency, not just single-request. This remains the single scenario most likely to cause real trouble on this specific box if concurrency were pushed materially higher — the plan's conservative default (2, hard ceiling 10) was the right call.

## Risk and Issue List

| ID | Type | Issue | Severity | Fixed | Notes |
|---|---|---|---|---|---|
| 1 | Correctness / Data Consistency | Concurrent `POST /api/ai-configs/:id/default` (and create/update/delete) could leave **zero** configs marked default — reproduced in 4/5 bursts at 8 concurrent requests | **High** | **Yes** | Silently degrades AI calls to demo mode with no visible error to the user. See Optimization Record. |
| 2 | Reliability | The naive fix for #1 crashed the entire Node process on any legitimately-rejecting concurrent request (unhandled promise rejection) | **Critical** | **Yes** | Found *during* fixing #1, via the same load test at the same parameters. Would have shipped a worse regression than the original bug. |
| 3 | Security | No rate limiting / lockout anywhere in the stack: login (20 wrong-password attempts, no 429/lockout) or the AI-config `validate` probe (which calls a real third-party endpoint) | Medium | No (documented) | Confirmed empirically, not just by code inspection. |
| 4 | Performance / Scalability | `server/rag.js` and `server/storage.js` list endpoints have no pagination; RAG re-scans the full knowledge base on every call | Medium | No (documented) | Real, measured cost (see Bottleneck Analysis #2); acceptable at current documented prototype scale. |
| 5 | Reliability | PocketBase is not supervised by systemd — if it crashes, every authenticated endpoint breaks until manually restarted | Medium | No (documented) | Pre-existing operational gap, unrelated to this pass's changes. |
| 6 | Performance | `requireAuth`'s per-request PocketBase `authRefresh()` round-trip is the API's real throughput ceiling (~6.7× slower than PocketBase's own baseline) | Low (at current scale) | No (documented) | Architectural change; flagged for if/when real concurrent usage grows. |

## Optimization Record

**Optimization**: Serialize per-user AI-config default/create/update/delete operations with an in-process async mutex.
**Files changed**: `server/aiConfigStore.js` (`withUserLock` + wrapping `createAiConfig`/`updateAiConfig`/`setDefaultAiConfig`/`deleteAiConfig`), `test/aiConfigStore.test.js` (2 new regression tests).
**Reason**: Issue #1 above — load-tested, not theoretical. The app runs as a single Node process (no clustering), so an in-process, per-user-keyed queue fully serializes the non-transactional read-modify-write sequence in `unsetOtherDefaults`/`setDefaultAiConfig` without needing a database-level transaction.
**Implementation**: `withUserLock(userId, task)` chains `task` onto a per-user tail promise stored in a `Map`; cleans up the map entry via a rejection-swallowed copy of the chain (see Issue #2 — the first version leaked an unhandled rejection here and crashed the process).
**Before**: scenario 07 at 8 concurrent `/default` calls — 4/5 bursts (80%) left zero configs marked default.
**After**: scenario 07 at 10 concurrent `/default` calls (higher than what originally triggered the bug), 20/20 bursts (100%) — exactly one default every time; concurrent delete-of-same-id and cross-user isolation (60/60 attempts) both 100% correct; zero process crashes; zero systemd restarts.
**New risk introduced**: none identified — the crash bug from the first fix attempt was caught by the same load test before being considered "done," not shipped.
**Tests added**: `withUserLock serializes concurrent tasks for the same key, but not across different keys`; `withUserLock: a rejecting task propagates its error without an unhandled rejection or a stuck queue` (deliberately verified against the pre-fix code to confirm it fails with `failureType: 'unhandledRejection'`, matching the live crash observed). Full suite: 64 → 66 tests, all passing.

## Final Load Testing Conclusion

```
Maximum concurrency tested safely on this box: 20 VUs sustained (scenario 02 ramp), 40 VUs max instantaneous
Recommended operating concurrency on this box:  ≤20 concurrent users (leaves headroom on a 2-vCPU/3.4GB shared host)
Critical API P95 (demo mode):                   auth/me ~152ms at up to 20 VUs; office/run ~467ms at 3 VUs
Primary bottleneck:                             PocketBase authRefresh() round-trip on every authenticated request
Completed optimizations:                        AI-config default-flag race fixed (in-process mutex); a second,
                                                 more severe crash bug found and fixed during that same work
Remaining risks:                                no rate limiting; unpaginated list/RAG endpoints; PocketBase
                                                 not systemd-supervised; auth round-trip as the scaling ceiling
Ready for current (prototype/demo) scale:        Yes
Ready for public/production hosting as-is:       No — address the rate-limiting and PocketBase-supervision gaps first
Scaling required beyond current use:             Yes, if concurrent users grow materially — see Bottleneck Analysis
```
