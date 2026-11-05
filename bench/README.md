# P3FO load bench

Repeatable multi-user load test for the P3FO board. It answers two different
questions with one run:

- **Is the server fast enough?** Locust drives concurrent create / move /
  assign / categorize / read traffic and reports API latency and errors.
- **Does the client still paint smoothly?** An optional headless Chrome client
  keeps the board open, applies the same realtime Yjs updates, and samples
  frame pacing, long tasks, and long-animation-frames.
- **How slow is the cold first load?** The probe records first paint, FCP,
  board-ready time, initial transfer bytes, and whether the production bundle
  is actually compressed.
- **What happens when 25 people edit the same timetable?** The `timetable`
  scenario starts and stops timers and edits entries on shared tasks, then
  compares the persisted timer entries with the number of successful writes.

The design follows the Locust harness used in `~/Dev/omniticket`: real request
flows, a fixed random seed, isolated data, a small set of reported metrics, and
a pass/fail report.

## What a run does

1. Takes a consistent SQLite snapshot with `sqlite3 .backup` so the live
   `p3fo.db` is never modified.
2. Starts an isolated backend on an ephemeral port with that snapshot.
3. Optionally starts a second Vite dev server whose `/api` and `/ws` proxies
   point at the isolated backend, then opens it in headless Chrome.
4. With `--production`, builds the real Vite bundle and serves it through the
   production Express server instead of Vite. This is the mode that exercises
   compression, cache headers, and the production chunk waterfall.
5. Starts a Yjs observer that counts task-map updates and bytes.
6. Runs Locust with creator, mover, assigner, reader, mixed, or timetable
   personas.
7. Collects OpenTelemetry spans from ClickHouse (backend HTTP, frontend HTTP,
   React commits, browser long tasks) and combines them with the browser probe.
8. Writes `bench/results/<run-id>/report.md`, `summary.json`, Locust CSV/HTML,
   server/frontend logs, the raw probe JSON, and timetable integrity metrics.

The browser probe now measures the load **from navigation start**, before it
waits for the board or clears filters. The old probe started its rAF sampling
only after the board was already interactive, which is why deployment-only
first-paint problems could not show up in the bench.

## Requirements

- `locust` on `PATH` (this machine has it at `/usr/bin/locust`)
- `sqlite3` (falls back to a file copy if missing)
- `google-chrome` for `--browser` (override with `CHROME_BIN`)
- A production `dist/` for `just bench-first-paint-3g` (run `just build` first);
  it emulates the network locally and does not need a deployed URL or ClickHouse
- `pnpm build` works for `--production` (it builds both the frontend and the
  compiled server)
- The HyperDX stack for OTel collection (`just dev-otel`), or `--no-otel`
- The stack binds p3fo-specific host ports: OTLP HTTP `14318`, ClickHouse `18123`, HyperDX UI `18088`
- Python packages `websockets` and `requests` for the browser probe/Locust

When the OTel stack is expected but unreachable, the OTel-dependent gates
(`Worst render p95`, `Frontend GET p95`) fail instead of passing silently.
`just tests` skips the load bench with a warning when its prerequisites are
missing; `just pre-commit` does not. It starts the ClickHouse/OTel compose
stack if needed, then fails if `locust`, Chrome, ClickHouse, or the OTel
collector still cannot be reached.

The React profiler only records commits of 16 ms or more. If the frontend HTTP
spans prove the SDK is alive but the render list is empty, the gate reports
`no commit >= 16 ms` and passes; a completely empty frontend telemetry set
still fails.

## Usage

```bash
# API only, 25 users for 30 seconds
python3 bench/orchestrator.py --users 25 --duration 30

# API + browser paint measurement
python3 bench/orchestrator.py --users 25 --duration 30 --browser

# Standard cohort: 25 people editing the same timetable and using start/stop
python3 bench/orchestrator.py --users 25 --duration 30 --scenario timetable --browser

# Build and serve the real production bundle, then run the same cohort
python3 bench/orchestrator.py --users 25 --duration 30 --production --scenario timetable --browser

# Probe the deployed site's cold first paint (no load generation)
python3 bench/orchestrator.py --probe-url https://your-p3fo-host/ --first-paint-only

# Local production build, strict first-paint budgets (requires `just build`)
just bench-first-paint-local

# Same build, throttled to a 3G profile for realistic-network diagnostics
just bench-first-paint-3g
just bench-first-paint-3g slow-3g

# Quick smoke test
python3 bench/orchestrator.py --users 3 --duration 15 --browser

# Load an already-running server (no isolated DB, no frontend)
python3 bench/orchestrator.py --host http://localhost:5172 --users 5 --duration 20

# Fail the command when a threshold is violated
python3 bench/orchestrator.py --users 25 --duration 30 --browser --enforce
```

The recommended scientific comparisons use the same seed, the same snapshot,
the same user count, and the same duration. `--run-id` lets you name runs.

### Gates (acceptance criteria)

These are the user-facing p9*/paint outcomes. `--enforce` fails the run when
any of them fails.

| Gate | Default |
|---|---|
| API p95 | 33 ms |
| Error rate | 1 % |
| Worst React commit p95 | 33 ms |
| Frontend GET p95 | 50 ms |
| Browser frame p99 | 25 ms |
| Browser long tasks | 10 / min |
| First contentful paint | 200 ms |
| Board ready | 500 ms |
| Initial transfer | 2.0 MB |
| Main bundle compression ratio | 0.50 (i.e. <= 50 % of decoded size) |
| Timetable edit/start/stop p95 | 50 ms |
| Lost timer entry rate | 1 % of successful starts |

Override with `--max-api-p95-ms`, `--max-error-rate`,
`--max-render-p95-ms`, `--max-frontend-get-p95-ms`,
`--max-frame-p99-ms`, `--max-long-tasks-per-min`, `--max-fcp-ms`,
`--max-board-ready-ms`, `--max-initial-transfer-mb`,
`--max-bundle-compression-ratio`, `--max-timetable-p95-ms`, and
`--max-lost-timer-entry-rate`.

The initial-transfer and compression gates only run when the probe finds a
production-style `/assets/index-<hash>.js` entry. They are omitted under the
Vite dev server instead of being reported as skipped; the dedicated
`bench-first-paint-local` target evaluates them against the production build.

## TDD red/green loop

The bench is designed to be the failing test for performance work:

```bash
# Red: current code fails the p9*/paint gates
python3 bench/orchestrator.py --users 25 --duration 30 --browser --enforce
echo $?   # non-zero

# Apply a fix, rerun the same command with the same seed and snapshot.
# Green: every check in the report is PASS and the exit code is zero.
```

Before the fixes, the code was red on the p9* gates: frame p99 (~117 ms vs
25 ms), long tasks (~159/min vs 10), frontend GET p95 (~135 ms vs 50 ms), and
React commit p95 (~60 ms vs 33 ms). API p95 and error rate passed, which
isolated the failure to the client. After the fixes, three consecutive 25-user
runs pass all gates (API p95 13-14 ms, render p95 18-19 ms, frontend GET p95
5.9-22.1 ms, frame p99 16.8 ms, 0 long tasks/min).

The gate is load-aware. Paint gates are noisier at low load (1-user frame p99
ranged from 33 ms to 83 ms across runs), so use 25 users for a stable signal and
run the green check 2-3 times (or use a median) before declaring a paint fix
done.

Use the same `--run-id` only when you intend to replace the report. For a
comparison, let each run create a new timestamped directory and diff the
`summary.json` values.

## Baseline (local, 2026-11-03)

Measured on this machine with the isolated snapshot and an unfiltered board:

| Run | Users | API p95 | React commit p95 | Frame p99 | Long tasks/min |
|---|---|---|---|---|---|
| Pre-fix | 8 | 14 ms | ~60 ms | 116.6 ms | 159 |
| Post-fix | 25 | 13-14 ms | 18-19 ms | 16.8 ms | 0 |

The API stayed flat while paint degraded with the number of concurrent editors,
which confirmed the client-side diagnosis. Use these numbers only as a
same-machine baseline; rerun before and after each change instead of comparing
to a different host.

## Interpreting the results

- **API p95 low, frame p99 high** → the server is fine and the jank is client
  rendering. Look at `react.render: Root-App` count/avg and the long-task list.
  This was the P3FO failure mode before the fixes: every task update triggered
  a `tasksChanged` event that re-rendered the board and every mounted card.
- **API p95 high, frame p99 low** → backend or database contention; compare
  `PATCH`/`GET` backend spans with Locust response times.
- **Frontend HTTP p95 much higher than backend p95** → browser connection
  queueing or the Vite dev proxy, typically at page load when many cards fetch
  their votes at once.
- **Yjs events/s high with large update bytes** → fan-out volume. A single task
  object is re-broadcast as a full map value, so update bytes grow with task
  size and the number of mutations.

## Scenario mix

| Persona | Weight | Behavior |
|---|---|---|
| `CreatorUser` | 2 | POST a card, sometimes assign + categorize it |
| `AssignerUser` | 3 | GET active cards, PATCH `userId` and `category` |
| `MoverUser` | 3 | GET active cards, PATCH status/priority, edit titles |
| `ReaderUser` | 2 | Full `GET /api/tasks` and active-only refresh |
| `MixedUser` | 4 | Create → move → assign → read |
| `TimetableUser` | 6 (timetable scenario only) | Edit entries and start/stop timers on shared tasks |

Defaults: think time 0.4–1.6 s, random seed 42, title prefix
`bench:<run-id>-`. Tasks created by the bench are removed at test stop when
running against an external host; isolated runs simply discard the snapshot.

## Simultaneous timetable editing (standard cohort)

`--scenario timetable` runs the standard 25-person cohort on the same
timetable view. Every user works on the same `--timetable-tasks` shared tasks
(default 2, each seeded with `--timetable-entries` entries, default 24). The
persona mirrors the SPA: it keeps a stale local copy, edits one timer entry or
toggles a timer, and PATCHes the **whole task** (including the full `timer`
array), exactly like `updateTimeEntry` and `toggleTimer`. Starting a timer also
closes open timers on other tasks, mirroring `toggleTimer`.

The report adds a **Timetable concurrency integrity** section:

- `Lost timer entries` compares the entries that should exist after all
  successful starts with the entries actually persisted.
- `Lost timer entry rate` is a gate (default 1 % of successful starts).
- `Entries still open` should stay at one or fewer per task.

Measured locally in production mode with 25 users for 30 s: API p95 stayed at
~15 ms and the frame p99 stayed at ~17 ms, but **96 % of timer entries were
lost**. The bottleneck is not HTTP latency; it is the full-task PATCH
last-write-wins semantics, so the fix belongs in the write path (merge only the
changed timer entry, or add a version/ETag precondition), not in the database
driver.

`--timetable-sync` refetches the task before every mutation, which approximates
a Yjs-synced client. It drops the loss to 1.6–5 % at 25 users; the remaining
loss is the in-flight race between two users who both read before either
PATCH lands. The gate is 1 %, so that residual loss is red by design; the
report always shows the actual rate.

## Cold first load and deployed first paint

`--production` builds the real Vite bundle and serves it through the production
Express server. `--probe-url URL --first-paint-only` probes an already-deployed
site without generating load. `--production --first-paint-only --network fast-3g`
starts that production server locally and throttles Chrome through CDP network
emulation, so the 3G diagnostic can run against `localhost` without a deployed
URL. `just pre-commit` uses the unthrottled `bench-first-paint-local` target for
stable code budgets. All modes record metrics from navigation start:

- first paint and first contentful paint (FCP)
- board-ready time
- initial transfer bytes and decoded bytes
- main-bundle compression ratio
- the twelve largest first-load resources

This closes the gap that let the deployed regression through: the old probe
used the Vite dev server and started its rAF sampling only after the board was
interactive, so it never saw an uncompressed 2.8 MB production entry chunk.

The deployed check on 2026-11-05 measured FCP `5.9 s` and `6.1 MB` of initial
transfer, with the main chunk at a `1.00` compression ratio. After enabling
compression on the production server and immutable caching for hashed assets,
the local production run measured FCP `260 ms`, board ready `538 ms`, and
`1.78 MB` of initial transfer (`0.29` main-bundle ratio).

With the tightened `200 ms` / `500 ms` budgets, the current run passes:
the inline boot shell paints in `32–48 ms`, and the probe records the exact
board DOM-ready moment at `425–434 ms` instead of adding its polling interval.
FCP is deliberately the boot shell; board-ready remains the application
readiness gate.

Cache invalidation does not need a purge: Vite emits content-hashed filenames
and `index.html` is served `no-store`, so a new deploy points at new hashed
assets. The immutable header is only applied to files that match Vite's
`-<hash>.<ext>` pattern; any other file under `/assets` is served
`max-age=0, must-revalidate`, and non-hashed public files keep revalidation.
Old hashed chunks may stay in a browser cache, but nothing references them
after the new shell loads. For an emergency purge (for example a CDN that
ignores the origin headers), purge the CDN/Caddy cache or change the asset
hash/build version.

Production runs use `--no-otel` by default in `just bench-production`: the
production Express server does not proxy the frontend's `/v1/traces` export
(Vite does in dev), so frontend React-commit spans are unavailable there until
that route is wired. The backend still exports OTel spans when enabled.

## Network profiles

`--network` uses Chrome DevTools network emulation. Available profiles:

| Profile | Download | Upload | Latency |
|---|---|---|---|
| `fast-3g` | 1.6 Mbps | 750 kbps | 150 ms |
| `3g` | 750 kbps | 250 kbps | 300 ms |
| `slow-3g` | 500 kbps | 500 kbps | 400 ms |
| `4g` | 4 Mbps | 3 Mbps | 50 ms |

`just bench-first-paint-3g` runs the local production build on `fast-3g` by
default. These limits are absolute performance budgets, not numbers derived
from the current build. The 3G profile is a diagnostic: on a 1.6 Mbps link the
render-blocking CSS and main bundle are network-bound, so this target is
expected to stay red until the initial payload is far smaller. On the current
bundle it measures FCP ~`1.8 s` (budget `200 ms`), board-ready ~`11.3 s`
(budget `500 ms`), and initial transfer ~`2.1 MB` (budget `2.0 MB`). The
compression ratio (~`0.29`) passes.

`just pre-commit` uses `bench-first-paint-local` (unthrottled), which gates the
app's own paint cost against the same budgets and is the stable code
regression signal. Use the 3G target for network diagnostics, or override the
limits explicitly when needed:

```bash
python3 bench/orchestrator.py --production --skip-build --first-paint-only \
  --network slow-3g --max-fcp-ms 30000 --max-board-ready-ms 90000
```

The transfer-size and compression gates stay network-independent, so they are
the stable bundle regression signals while the FCP/board budgets drive further
network-path work.

## Notes and limitations

- The browser probe uses headless Chrome and software compositing. Frame
  numbers are indicative; compare them across runs on the same machine rather
  than reading them as absolute desktop numbers. Use `--headed` to run against
  the real display/GPU.
- The probe clears the board's default user filter so realtime Yjs updates are
  applied. Without that, `useTasks` intentionally ignores remote updates while
  `isFiltered` is true.
- Locust timetable users do not open a Yjs WebSocket. By default they keep a
  stale local task copy, which is the worst case for full-task PATCH. Pass
  `--timetable-sync` to refetch before each mutation, approximating a
  Yjs-synced client; that measures the residual in-flight race (measured
  1.6–5 % lost entries at 25 users) instead of the worst case (~96 %).
- Dev-server runs include Vite module compilation and unbundled source. Use
  `--production` for authoritative paint numbers; the dev timetable run can
  show multi-second frames that do not reproduce against the production bundle.
- Bench telemetry uses per-run service names
  (`p3fo-bench-<run-id>` / `p3fo-bench-<run-id>-frontend`) so live sessions do
  not contaminate the OTel queries.
- `bench/results/` is intentionally ignored by git.
