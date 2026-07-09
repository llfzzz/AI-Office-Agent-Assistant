# Load testing — AI Office Agent Assistant

k6-based load/stress/concurrency-consistency testing for this app. See the
full plan and results in `loadtest/REPORT.md` (generated after a run) — this
file is just "how do I run it."

**Read before running on a shared box**: this app may be co-located with
other services (check `systemctl list-units --state=running`). Scenario 04
(zip-bomb concurrency) is the one most likely to cause real resource
pressure — see its header comment and the safety notes below before raising
its concurrency past the default.

## Setup

```bash
npm run loadtest:install        # downloads a project-local k6 binary into loadtest/.bin/ (gitignored)
node loadtest/seed/generate-zip-fixtures.mjs   # builds fixtures/*.docx for scenario 04
```

Requires the app + PocketBase already running (`npm start` / `npm run dev`,
`./pocketbase serve`) — same as any other `scripts/verify-*.mjs` script. No
AI provider key is needed; every scenario runs in demo-fallback mode.

## Running a scenario

```bash
loadtest/.bin/k6 run loadtest/scenarios/00_smoke.js
```

Every scenario reads its concurrency/duration from env vars with a
conservative default and an enforced ceiling (see each file's header
comment) — override with `-e` or a plain env var, e.g.:

```bash
LOADTEST_CRUD_VUS=10 loadtest/.bin/k6 run loadtest/scenarios/01_core_crud_baseline.js
```

### Recommended order

1. `00_smoke.js` — must be 100% green or stop here.
2. `01_core_crud_baseline.js`, `02_auth_hot_path.js`, `03_sequential_ai_chain.js`,
   `05_rate_limit_absence.js`, `07_concurrency_consistency.js` — any order.
3. `06_rag_volume.js` — run the seeder before each step:
   ```bash
   node loadtest/seed/seed-rag-volume.mjs --target=10  && loadtest/.bin/k6 run loadtest/scenarios/06_rag_volume.js
   node loadtest/seed/seed-rag-volume.mjs --target=50  && loadtest/.bin/k6 run loadtest/scenarios/06_rag_volume.js
   node loadtest/seed/seed-rag-volume.mjs --target=200 && loadtest/.bin/k6 run loadtest/scenarios/06_rag_volume.js
   node loadtest/seed/seed-rag-volume.mjs --cleanup
   ```
4. `04_zip_bomb_concurrency.js` — **run alone**, nothing else concurrent. Start
   `monitor.sh` first (see below) and watch it, not just k6's own output.

### Monitoring during a run

```bash
bash loadtest/monitor.sh <run-name>   # writes results/monitor-<run-name>-<timestamp>.csv, warns/aborts on thresholds
```

Abort thresholds (see the plan): `MemAvailable` < 400MB → reduce concurrency;
< 150MB → `Ctrl-C` the running k6 process immediately. `office-agent.service`
self-heals (`Restart=always`); PocketBase does not — if it dies:

```bash
sudo -u ai ./pocketbase serve --http=127.0.0.1:8090 >> pocketbase.log 2>&1 &
```

## Known gaps

- No real-AI-provider scenario is included by default (demo-fallback only,
  per this project's current testing scope). `03_sequential_ai_chain.js`'s
  header documents what a real-provider variant would need if added later.
- `POST /api/audio/transcribe` isn't covered beyond an implicit fast-fail
  check — it requires a real provider unconditionally, so demo-mode can't
  exercise its real (ffmpeg transcode + upload) path.
- Not wired into CI: these need a live app + PocketBase, and results from a
  CI runner's resource envelope wouldn't represent this box's constraints.
