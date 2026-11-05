# P3FO load bench

Repeatable multi-user load test for the P3FO board. It answers two different
questions with one run:

- **Is the server fast enough?** Locust drives concurrent create / move /
  assign / categorize / read traffic and reports API latency and errors.
- **Does the client still paint smoothly?** An optional headless Chrome client
  keeps the board open, applies the same realtime Yjs updates, and samples
  frame pacing, long tasks, and long-animation-frames.

The design follows the Locust harness used in `~/Dev/omniticket`: real request
flows, a fixed random seed, isolated data, a small set of reported metrics, and
a pass/fail report.

## What a run does

1. Takes a consistent SQLite snapshot with `sqlite3 .backup` so the live
   `p3fo.db` is never modified.
2. Starts an isolated backend on an ephemeral port with that snapshot.
3. Optionally starts a second Vite dev server whose `/api` and `/ws` proxies
   point at the isolated backend, then opens it in headless Chrome.
4. Starts a Yjs observer that counts task-map updates and bytes.
5. Runs Locust with creator, mover, assigner, reader, and mixed personas.
6. Collects OpenTelemetry spans from ClickHouse (backend HTTP, frontend HTTP,
   React commits, browser long tasks) and combines them with the browser probe.
7. Writes `bench/results/<run-id>/report.md`, `summary.json`, Locust CSV/HTML,
   server/frontend logs, and the raw probe JSON.

## Requirements

- `locust` on `PATH` (this machine has it at `/usr/bin/locust`)
- `sqlite3` (falls back to a file copy if missing)
- `google-chrome` for `--browser` (override with `CHROME_BIN`)
- The HyperDX stack for OTel collection (`just dev-otel`), or `--no-otel`
- The stack binds p3fo-specific host ports: OTLP HTTP `14318`, ClickHouse `18123`, HyperDX UI `18088`
- Python packages `websockets` and `requests` for the browser probe/Locust

When the OTel stack is expected but unreachable, the OTel-dependent gates
(`Worst render p95`, `Frontend GET p95`) fail instead of passing silently.
`just tests` / `just pre` skip the load bench with a warning when ClickHouse
is not reachable, so start `just dev-otel` first if you want the paint gates
enforced.

## Usage

```bash
# API only, 25 users for 30 seconds
python3 bench/orchestrator.py --users 25 --duration 30

# API + browser paint measurement
python3 bench/orchestrator.py --users 25 --duration 30 --browser

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
| Browser frame p99 | 50 ms |
| Browser long tasks | 60 / min |

Override with `--max-api-p95-ms`, `--max-error-rate`,
`--max-render-p95-ms`, `--max-frontend-get-p95-ms`,
`--max-frame-p99-ms`, and `--max-long-tasks-per-min`.

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
50 ms), long tasks (~159/min vs 60), frontend GET p95 (~135 ms vs 50 ms), and
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
| `ReaderUser` | 1 | Full `GET /api/tasks` and active-only refresh |
| `MixedUser` | 4 | Create → move → assign → read |

Defaults: think time 0.4–1.6 s, random seed 42, title prefix
`bench:<run-id>-`. Tasks created by the bench are removed at test stop when
running against an external host; isolated runs simply discard the snapshot.

## Notes and limitations

- The browser probe uses headless Chrome and software compositing. Frame
  numbers are indicative; compare them across runs on the same machine rather
  than reading them as absolute desktop numbers. Use `--headed` to run against
  the real display/GPU.
- The probe clears the board's default user filter so realtime Yjs updates are
  applied. Without that, `useTasks` intentionally ignores remote updates while
  `isFiltered` is true.
- Bench telemetry uses per-run service names
  (`p3fo-bench-<run-id>` / `p3fo-bench-<run-id>-frontend`) so live sessions do
  not contaminate the OTel queries.
- `bench/results/` is intentionally ignored by git.
