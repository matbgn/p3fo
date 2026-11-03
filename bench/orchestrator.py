"""P3FO load bench orchestrator.

Creates an isolated SQLite snapshot, starts the backend (and optionally the
Vite frontend plus a headless Chrome paint probe), runs Locust, collects
OpenTelemetry spans from ClickHouse, and writes a repeatable report.

Examples:
    python3 bench/orchestrator.py --users 10 --duration 30
    python3 bench/orchestrator.py --users 20 --duration 60 --browser
    python3 bench/orchestrator.py --host http://localhost:5172 --users 5 --duration 20
"""

import argparse
import csv
import json
import os
import shutil
import signal
import socket
import subprocess
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
BENCH = REPO / "bench"
RESULTS = BENCH / "results"


def now_utc():
    return datetime.now(timezone.utc)


def free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def wait_http(url, timeout=60, process=None):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if process is not None and process.poll() is not None:
            raise RuntimeError(f"process exited while waiting for {url}")
        try:
            with urllib.request.urlopen(url, timeout=2) as response:
                if response.status < 500:
                    return True
        except Exception:
            pass
        time.sleep(0.25)
    raise TimeoutError(f"timeout waiting for {url}")


def snapshot_db(source, destination):
    source = Path(source).resolve()
    if not source.exists():
        raise FileNotFoundError(source)
    sqlite3 = shutil.which("sqlite3")
    if sqlite3:
        subprocess.run(
            [sqlite3, str(source), f".backup '{destination}'"],
            check=True,
            stdout=subprocess.DEVNULL,
        )
    else:
        shutil.copy2(source, destination)


def clickhouse_query(url, sql):
    request = urllib.request.Request(
        url,
        data=(sql.strip() + "\nFORMAT JSON").encode("utf-8"),
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.loads(response.read().decode("utf-8")).get("data", [])


def collect_otel(clickhouse, start, end, backend_service, frontend_service):
    if not clickhouse:
        return {}
    start_s = start.strftime("%Y-%m-%d %H:%M:%S.%f")
    end_s = end.strftime("%Y-%m-%d %H:%M:%S.%f")
    window = (
        f"Timestamp >= toDateTime64('{start_s}', 3, 'UTC') "
        f"AND Timestamp <= toDateTime64('{end_s}', 3, 'UTC')"
    )
    queries = {
        "backend_http": f"""
            SELECT SpanName, count() AS count,
                   round(quantile(0.5)(Duration) / 1e6, 1) AS p50_ms,
                   round(quantile(0.95)(Duration) / 1e6, 1) AS p95_ms,
                   round(quantile(0.99)(Duration) / 1e6, 1) AS p99_ms,
                   round(max(Duration) / 1e6, 1) AS max_ms
            FROM default.otel_traces
            WHERE {window} AND ServiceName = '{backend_service}'
              AND SpanName IN ('GET', 'POST', 'PATCH', 'DELETE', 'PUT')
            GROUP BY SpanName ORDER BY count DESC
        """,
        "backend_routes": f"""
            SELECT replaceRegexpAll(replaceRegexpAll(SpanAttributes['http.url'], 'https?://[^/]+', ''), '[0-9a-f]{{8}}-[0-9a-f]{{4}}-[0-9a-f]{{4}}-[0-9a-f]{{4}}-[0-9a-f]{{12}}', ':id') AS route,
                   count() AS count,
                   round(quantile(0.5)(Duration) / 1e6, 1) AS p50_ms,
                   round(quantile(0.95)(Duration) / 1e6, 1) AS p95_ms,
                   round(quantile(0.99)(Duration) / 1e6, 1) AS p99_ms,
                   round(max(Duration) / 1e6, 1) AS max_ms
            FROM default.otel_traces
            WHERE {window} AND ServiceName = '{backend_service}'
              AND SpanName IN ('GET', 'POST', 'PATCH', 'DELETE', 'PUT')
            GROUP BY route ORDER BY count DESC LIMIT 15
        """,
        "frontend_http": f"""
            SELECT SpanName, count() AS count,
                   round(quantile(0.5)(Duration) / 1e6, 1) AS p50_ms,
                   round(quantile(0.95)(Duration) / 1e6, 1) AS p95_ms,
                   round(quantile(0.99)(Duration) / 1e6, 1) AS p99_ms,
                   round(max(Duration) / 1e6, 1) AS max_ms
            FROM default.otel_traces
            WHERE {window} AND ServiceName = '{frontend_service}'
              AND SpanName LIKE 'HTTP %'
            GROUP BY SpanName ORDER BY count DESC
        """,
        "frontend_routes": f"""
            SELECT replaceRegexpAll(SpanAttributes['http.url'], 'https?://[^/]+', '') AS route,
                   count() AS count,
                   round(quantile(0.5)(Duration) / 1e6, 1) AS p50_ms,
                   round(quantile(0.95)(Duration) / 1e6, 1) AS p95_ms,
                   round(quantile(0.99)(Duration) / 1e6, 1) AS p99_ms,
                   round(max(Duration) / 1e6, 1) AS max_ms
            FROM default.otel_traces
            WHERE {window} AND ServiceName = '{frontend_service}'
              AND SpanName LIKE 'HTTP %'
            GROUP BY route ORDER BY count DESC LIMIT 15
        """,
        "react_render": f"""
            SELECT SpanName, count() AS count,
                   round(avg(Duration) / 1e6, 1) AS avg_ms,
                   round(quantile(0.95)(Duration) / 1e6, 1) AS p95_ms,
                   round(max(Duration) / 1e6, 1) AS max_ms
            FROM default.otel_traces
            WHERE {window} AND ServiceName = '{frontend_service}'
              AND SpanName LIKE 'react.render%'
            GROUP BY SpanName ORDER BY count DESC
        """,
        "long_tasks": f"""
            SELECT count() AS count,
                   round(avg(Duration) / 1e6, 1) AS avg_ms,
                   round(max(Duration) / 1e6, 1) AS max_ms
            FROM default.otel_traces
            WHERE {window} AND ServiceName = '{frontend_service}'
              AND SpanName = 'browser.long_task'
        """,
        "yjs": f"""
            SELECT SpanName, count() AS count,
                   round(avg(Duration) / 1e6, 1) AS avg_ms,
                   round(quantile(0.95)(Duration) / 1e6, 1) AS p95_ms
            FROM default.otel_traces
            WHERE {window} AND ServiceName = '{frontend_service}'
              AND SpanName LIKE 'yjs.%'
            GROUP BY SpanName ORDER BY count DESC
        """,
    }
    result = {}
    for name, sql in queries.items():
        try:
            result[name] = clickhouse_query(clickhouse, sql)
        except Exception as exc:
            result[name] = {"error": str(exc)}
    return result


def read_locust_csv(path):
    if not path.exists():
        return {}
    with path.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    aggregate = next((row for row in rows if row.get("Name") == "Aggregated"), None)

    def num(row, key):
        try:
            return float(row.get(key, 0))
        except (TypeError, ValueError):
            return 0.0

    def row_summary(row):
        return {
            "requests": int(num(row, "Request Count")),
            "failures": int(num(row, "Failure Count")),
            "median_ms": num(row, "Median Response Time"),
            "avg_ms": num(row, "Average Response Time"),
            "p95_ms": num(row, "95%"),
            "p99_ms": num(row, "99%"),
            "max_ms": num(row, "Max Response Time"),
            "rps": num(row, "Requests/s"),
        }

    return {
        "aggregate": row_summary(aggregate) if aggregate else {},
        "endpoints": [
            {"name": row.get("Name"), **row_summary(row)}
            for row in rows
            if row.get("Name") not in (None, "Aggregated")
        ],
    }


def load_json(path):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except Exception:
        return {}


def table(headers, rows):
    if not rows:
        return "_no data_\n"
    output = ["| " + " | ".join(headers) + " |", "|" + "|".join(["---"] * len(headers)) + "|"]
    for row in rows:
        output.append("| " + " | ".join(str(value) for value in row) + " |")
    return "\n".join(output) + "\n"


def render_report(context):
    locust = context["locust"]
    otel = context["otel"]
    browser = context["browser"]
    yjs = context["yjs"]
    aggregate = locust.get("aggregate", {})
    requests = aggregate.get("requests", 0)
    failures = aggregate.get("failures", 0)
    error_rate = (failures / requests) if requests else 0.0

    lines = [
        f"# P3FO load bench — {context['run_id']}",
        "",
        f"- Started: `{context['started_at']}`",
        f"- Duration: `{context['duration']}s` with `{context['users']}` users (spawn rate `{context['spawn_rate']}/s`)",
        f"- Target: `{context['target']}`",
        f"- Isolated DB: `{context['db_path']}`",
        f"- Seed: `{context['seed']}`",
        "",
        "## Locust",
        "",
        table(
            ["Metric", "Value"],
            [
                ["Requests", requests],
                ["Failures", failures],
                ["Error rate", f"{error_rate * 100:.2f}%"],
                ["Median", f"{aggregate.get('median_ms', 0):.1f} ms"],
                ["p95", f"{aggregate.get('p95_ms', 0):.1f} ms"],
                ["p99", f"{aggregate.get('p99_ms', 0):.1f} ms"],
                ["Max", f"{aggregate.get('max_ms', 0):.1f} ms"],
                ["Throughput", f"{aggregate.get('rps', 0):.1f} req/s"],
            ],
        ),
        "",
        "### Endpoints",
        "",
        table(
            ["Endpoint", "Count", "Fail", "p50", "p95", "p99", "Max"],
            [
                [
                    row["name"],
                    row["requests"],
                    row["failures"],
                    f"{row['median_ms']:.1f}",
                    f"{row['p95_ms']:.1f}",
                    f"{row['p99_ms']:.1f}",
                    f"{row['max_ms']:.1f}",
                ]
                for row in locust.get("endpoints", [])
            ],
        ),
        "## Backend HTTP spans",
        "",
        table(
            ["Span", "Count", "p50", "p95", "p99", "Max"],
            [
                [row["SpanName"], row["count"], row["p50_ms"], row["p95_ms"], row["p99_ms"], row["max_ms"]]
                for row in (otel.get("backend_http") or [])
                if isinstance(row, dict) and "SpanName" in row
            ],
        ),
        "### Backend routes",
        "",
        table(
            ["Route", "Count", "p50", "p95", "p99", "Max"],
            [
                [row["route"], row["count"], row["p50_ms"], row["p95_ms"], row["p99_ms"], row["max_ms"]]
                for row in (otel.get("backend_routes") or [])
                if isinstance(row, dict) and "route" in row
            ],
        ),
        "## Frontend HTTP spans",
        "",
        table(
            ["Span", "Count", "p50", "p95", "p99", "Max"],
            [
                [row["SpanName"], row["count"], row["p50_ms"], row["p95_ms"], row["p99_ms"], row["max_ms"]]
                for row in (otel.get("frontend_http") or [])
                if isinstance(row, dict) and "SpanName" in row
            ],
        ),
        "### Frontend routes",
        "",
        table(
            ["Route", "Count", "p50", "p95", "p99", "Max"],
            [
                [row["route"], row["count"], row["p50_ms"], row["p95_ms"], row["p99_ms"], row["max_ms"]]
                for row in (otel.get("frontend_routes") or [])
                if isinstance(row, dict) and "route" in row
            ],
        ),
        "## React commits",
        "",
        table(
            ["Profiler", "Count", "Avg", "p95", "Max"],
            [
                [row["SpanName"], row["count"], row["avg_ms"], row["p95_ms"], row["max_ms"]]
                for row in (otel.get("react_render") or [])
                if isinstance(row, dict) and "SpanName" in row
            ],
        ),
    ]

    long_tasks = otel.get("long_tasks") or []
    if isinstance(long_tasks, dict):
        if "error" in long_tasks:
            lines += [
                "## Long tasks (OTel)",
                "",
                f"_unavailable: {long_tasks['error']}_",
                "",
            ]
            long_tasks = []
        else:
            long_tasks = [long_tasks]
    if isinstance(long_tasks, list) and long_tasks and isinstance(long_tasks[0], dict):
        row = long_tasks[0]
        lines += [
            "## Long tasks (OTel)",
            "",
            f"- Count: `{row.get('count', 0)}`",
            f"- Average: `{row.get('avg_ms', 0)} ms`",
            f"- Max: `{row.get('max_ms', 0)} ms`",
            "",
        ]

    if browser:
        lines += [
            "## Browser paint probe",
            "",
            table(
                ["Metric", "Value"],
                [
                    ["Board loaded", browser.get("boardLoaded")],
                    ["Filters cleared", browser.get("filters")],
                    ["FPS (avg)", browser.get("fps")],
                    ["Frame p50", f"{browser.get('frameP50Ms')} ms"],
                    ["Frame p95", f"{browser.get('frameP95Ms')} ms"],
                    ["Frame p99", f"{browser.get('frameP99Ms')} ms"],
                    ["Frame max", f"{browser.get('frameMaxMs')} ms"],
                    ["Frames > 25 ms", browser.get("framesOver25Ms")],
                    ["Frames > 50 ms", browser.get("framesOver50Ms")],
                    ["Long tasks", browser.get("longTaskCount")],
                    ["Long task time", f"{browser.get('longTaskTotalMs')} ms"],
                    ["LoAF count", browser.get("loafCount")],
                    ["LoAF blocking", f"{browser.get('loafBlockingMs')} ms"],
                    ["DOM nodes", browser.get("domNodes")],
                ],
            ),
        ]

    if yjs:
        lines += [
            "## Yjs fan-out",
            "",
            table(
                ["Metric", "Value"],
                [
                    ["Connected", yjs.get("connected")],
                    ["Task events", yjs.get("taskEvents")],
                    ["Task keys changed", yjs.get("taskKeys")],
                    ["Events/s", round(yjs.get("taskEventsPerSecond", 0), 2)],
                    ["Doc updates", yjs.get("docUpdates")],
                    ["Update bytes", yjs.get("docUpdateBytes")],
                    ["Max event gap", f"{yjs.get('maxEventGapMs', 0)} ms"],
                ],
            ),
        ]

    gates = context["gates"]
    lines += [
        "## Gates (user-facing p9*/paint outcomes)",
        "",
        table(["Gate", "Value", "Limit", "Status"], gates),
        "",
        "## Artifacts",
        "",
    ]
    for name, path in context["artifacts"].items():
        lines.append(f"- {name}: `{path}`")
    lines.append("")
    return "\n".join(lines)


def evaluate_gates(args, locust, otel, browser):
    aggregate = locust.get("aggregate", {})
    requests = aggregate.get("requests", 0)
    failures = aggregate.get("failures", 0)
    error_rate = (failures / requests) if requests else 0.0
    gates = []

    def add(name, value, limit, ok, unit=""):
        gates.append([
            name,
            f"{value:.2f}{unit}" if isinstance(value, float) else value,
            f"{limit}{unit}",
            "PASS" if ok else "FAIL",
        ])

    if not aggregate or not requests:
        gates.append(["API p95", "no locust data", f"{args.max_api_p95_ms} ms", "FAIL"])
        gates.append(["Error rate", "no locust data", f"{args.max_error_rate * 100}%", "FAIL"])
    else:
        add("API p95", aggregate.get("p95_ms", 0), args.max_api_p95_ms, aggregate.get("p95_ms", 0) <= args.max_api_p95_ms, " ms")
        add("Error rate", error_rate * 100, args.max_error_rate * 100, error_rate <= args.max_error_rate, "%")

    otel_expected = not args.no_otel

    render_rows = [row for row in (otel.get("react_render") or []) if isinstance(row, dict) and "p95_ms" in row]
    if render_rows:
        worst = max(render_rows, key=lambda row: float(row["p95_ms"]))
        add("Worst render p95", float(worst["p95_ms"]), args.max_render_p95_ms, float(worst["p95_ms"]) <= args.max_render_p95_ms, " ms")
    elif otel_expected:
        # Missing OTel data is not a pass: without react.render spans the gate
        # cannot be evaluated and the run must not be reported as green.
        gates.append(["Worst render p95", "no OTel data", f"{args.max_render_p95_ms} ms", "FAIL"])
    else:
        gates.append(["Worst render p95", "skipped (--no-otel)", f"{args.max_render_p95_ms} ms", "SKIP"])

    frontend_http = [row for row in (otel.get("frontend_http") or []) if isinstance(row, dict) and "SpanName" in row]
    get_rows = [row for row in frontend_http if row["SpanName"] == "HTTP GET"]
    if get_rows:
        worst_get = max(float(row["p95_ms"]) for row in get_rows)
        add("Frontend GET p95", worst_get, args.max_frontend_get_p95_ms, worst_get <= args.max_frontend_get_p95_ms, " ms")
    elif otel_expected:
        gates.append(["Frontend GET p95", "no OTel data", f"{args.max_frontend_get_p95_ms} ms", "FAIL"])
    else:
        gates.append(["Frontend GET p95", "skipped (--no-otel)", f"{args.max_frontend_get_p95_ms} ms", "SKIP"])

    if browser:
        if not isinstance(browser, dict) or not browser.get("durationMs"):
            gates.append(["Frame p99", "no browser data", f"{args.max_frame_p99_ms} ms", "FAIL"])
            gates.append(["Long tasks/min", "no browser data", f"{args.max_long_tasks_per_min}", "FAIL"])
        else:
            add("Frame p99", float(browser.get("frameP99Ms", 0)), args.max_frame_p99_ms, float(browser.get("frameP99Ms", 0)) <= args.max_frame_p99_ms, " ms")
            duration_min = float(browser.get("durationMs", 0)) / 60000.0
            long_tasks_per_min = float(browser.get("longTaskCount", 0)) / (duration_min if duration_min > 0 else 1.0)
            add("Long tasks/min", long_tasks_per_min, args.max_long_tasks_per_min, long_tasks_per_min <= args.max_long_tasks_per_min)

    return gates


def stop_process(process, name):
    if process is None or process.poll() is not None:
        return
    try:
        os.killpg(os.getpgid(process.pid), signal.SIGINT)
        process.wait(timeout=6)
    except Exception:
        try:
            os.killpg(os.getpgid(process.pid), signal.SIGKILL)
        except Exception:
            process.kill()
        try:
            process.wait(timeout=5)
        except Exception:
            pass
    print(f"[bench] stopped {name}")


def read_until_ready(process, marker, timeout=120):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if process.poll() is not None:
            return False
        line = process.stdout.readline() if process.stdout else ""
        if line:
            print(f"[bench] {line.rstrip()}")
            if marker in line:
                return True
        else:
            time.sleep(0.1)
    return False


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--users", type=int, default=25)
    parser.add_argument("--spawn-rate", type=float, default=5)
    parser.add_argument("--duration", type=int, default=30)
    parser.add_argument("--host", default="")
    parser.add_argument("--db-source", default=str(REPO / "p3fo.db"))
    parser.add_argument("--api-port", type=int, default=0)
    parser.add_argument("--frontend-port", type=int, default=0)
    parser.add_argument("--frontend", action="store_true")
    parser.add_argument("--browser", action="store_true")
    parser.add_argument("--no-otel", action="store_true")
    parser.add_argument("--clickhouse", default=os.environ.get("CLICKHOUSE_URL", "http://localhost:18123"))
    parser.add_argument("--backend-service", default="")
    parser.add_argument("--frontend-service", default="")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--run-id", default="")
    parser.add_argument("--keep-db", action="store_true")
    parser.add_argument("--enforce", action="store_true")
    parser.add_argument("--max-api-p95-ms", type=float, default=33.0)
    parser.add_argument("--max-error-rate", type=float, default=0.01)
    parser.add_argument("--max-render-p95-ms", type=float, default=33.0)
    parser.add_argument("--max-frame-p99-ms", type=float, default=33.0)
    parser.add_argument("--max-long-tasks-per-min", type=float, default=60.0)
    parser.add_argument("--max-frontend-get-p95-ms", type=float, default=50.0)
    args = parser.parse_args()

    if args.browser:
        args.frontend = True
    run_id = args.run_id or time.strftime("%Y%m%d-%H%M%S")
    run_dir = RESULTS / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    for stale in ("probe.go", "probe.ready", "yjs.go", "browser_probe.json", "yjs_observer.json"):
        (run_dir / stale).unlink(missing_ok=True)
    api_port = args.api_port or free_port()
    frontend_port = args.frontend_port or free_port()
    isolated = not args.host
    target = args.host or f"http://127.0.0.1:{api_port}"
    backend_service = args.backend_service or (
        f"p3fo-bench-{run_id}" if isolated else "p3fo-backend"
    )
    frontend_service = args.frontend_service or (
        f"p3fo-bench-{run_id}-frontend" if args.frontend else "p3fo-frontend"
    )
    temp_db = None
    server_log = (run_dir / "server.log").open("w", encoding="utf-8")
    frontend_log = (run_dir / "frontend.log").open("w", encoding="utf-8")
    locust_log = (run_dir / "locust.log").open("w", encoding="utf-8")

    server = None
    frontend = None
    probe = None
    observer = None
    probe_log = None
    started_at = now_utc()
    try:
        if isolated:
            temp_dir = Path(os.environ.get("TMPDIR", "/tmp")) / f"p3fo-bench-{run_id}"
            temp_dir.mkdir(parents=True, exist_ok=True)
            temp_db = temp_dir / "bench.db"
            snapshot_db(args.db_source, temp_db)
            env = os.environ.copy()
            env.update(
                {
                    "PORT": str(api_port),
                    "P3FO_DB_CLIENT": "sqlite",
                    "P3FO_DB_SQLITE_FILE": str(temp_db),
                    "OTEL_EXPORTER_OTLP_ENDPOINT": env.get(
                        "OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:14318/v1/traces"
                    ),
                    "OTEL_SERVICE_NAME": backend_service,
                }
            )
            server = subprocess.Popen(
                ["pnpm", "exec", "tsx", "server/index.ts"],
                cwd=REPO,
                env=env,
                stdout=server_log,
                stderr=subprocess.STDOUT,
                start_new_session=True,
            )
            wait_http(f"{target}/api/health", timeout=90, process=server)
            print(f"[bench] isolated backend on {target} (db {temp_db})")

        if args.frontend:
            env = os.environ.copy()
            env.update(
                {
                    "API_TARGET": target,
                    "WS_TARGET": target.replace("http://", "ws://").replace("https://", "wss://"),
                    "VITE_OTEL_ENABLED": "true" if not args.no_otel else "false",
                    "VITE_OTEL_SERVICE_NAME": frontend_service,
                }
            )
            frontend = subprocess.Popen(
                [
                    "pnpm",
                    "exec",
                    "vite",
                    "--port",
                    str(frontend_port),
                    "--strictPort",
                    "--host",
                    "127.0.0.1",
                ],
                cwd=REPO,
                env=env,
                stdout=frontend_log,
                stderr=subprocess.STDOUT,
                start_new_session=True,
            )
            wait_http(f"http://127.0.0.1:{frontend_port}/", timeout=90, process=frontend)
            print(f"[bench] frontend on http://127.0.0.1:{frontend_port}/")

        probe_gate = run_dir / "probe.go"
        yjs_gate = run_dir / "yjs.go"
        probe_out = run_dir / "browser_probe.json"
        yjs_out = run_dir / "yjs_observer.json"

        probe_ready = run_dir / "probe.ready"
        probe_log = (run_dir / "probe.log").open("w", encoding="utf-8")
        if args.browser:
            probe_env = os.environ.copy()
            probe = subprocess.Popen(
                [
                    sys.executable,
                    str(BENCH / "browser_probe.py"),
                    "--url",
                    f"http://127.0.0.1:{frontend_port}/",
                    "--duration-ms",
                    str((args.duration + 3) * 1000),
                    "--gate",
                    str(probe_gate),
                    "--ready-file",
                    str(probe_ready),
                    "--out",
                    str(probe_out),
                ],
                cwd=REPO,
                env=probe_env,
                stdout=probe_log,
                stderr=subprocess.STDOUT,
                text=True,
                start_new_session=True,
            )
            deadline = time.time() + 180
            while time.time() < deadline and not probe_ready.exists():
                if probe.poll() is not None:
                    break
                time.sleep(0.25)
            if probe_ready.exists():
                print("[bench] browser probe ready")
            else:
                print("[bench] browser probe did not become ready", file=sys.stderr)

        if isolated and not args.no_otel:
            observer_env = os.environ.copy()
            observer_env.update(
                {
                    "YJS_WS_URL": target.replace("http://", "ws://").replace("https://", "wss://"),
                    "YJS_ROOM": "p3fo-room",
                    "YJS_DURATION_MS": str((args.duration + 3) * 1000),
                    "YJS_OUT": str(yjs_out),
                    "YJS_START_GATE": str(yjs_gate),
                }
            )
            observer = subprocess.Popen(
                ["node", str(BENCH / "yjs_observer.mjs")],
                cwd=REPO,
                env=observer_env,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                start_new_session=True,
            )
            if not read_until_ready(observer, "YJS_READY", timeout=30):
                print("[bench] Yjs observer did not connect", file=sys.stderr)

        locust_env = os.environ.copy()
        locust_env.update(
            {
                "BENCH_RUN_ID": run_id,
                "BENCH_TITLE_PREFIX": "bench:",
                "BENCH_SEED": str(args.seed),
                "BENCH_CLEANUP": "0" if isolated else "1",
            }
        )
        locust_cmd = [
            shutil.which("locust") or "locust",
            "-f",
            str(BENCH / "locustfile.py"),
            "--headless",
            "-u",
            str(args.users),
            "-r",
            str(args.spawn_rate),
            "-t",
            f"{args.duration}s",
            "--host",
            target,
            "--csv",
            str(run_dir / "locust"),
            "--html",
            str(run_dir / "locust.html"),
            "--loglevel",
            "WARNING",
        ]
        measure_start = now_utc()
        print(f"[bench] locust: {args.users} users, {args.duration}s")
        locust_proc = subprocess.Popen(
            locust_cmd,
            cwd=REPO,
            env=locust_env,
            stdout=locust_log,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )
        probe_gate.write_text("go", encoding="utf-8")
        yjs_gate.write_text("go", encoding="utf-8")
        try:
            locust_proc.wait(timeout=args.duration + 180)
        except subprocess.TimeoutExpired:
            stop_process(locust_proc, "locust")
        measure_end = now_utc()

        if locust_proc.returncode not in (0, None):
            print(f"[bench] locust exited with {locust_proc.returncode}", file=sys.stderr)

        if probe is not None:
            try:
                probe.wait(timeout=args.duration + 120)
            except subprocess.TimeoutExpired:
                stop_process(probe, "browser probe")
        if observer is not None:
            try:
                observer.wait(timeout=args.duration + 120)
            except subprocess.TimeoutExpired:
                stop_process(observer, "yjs observer")

        time.sleep(6)
        locust = read_locust_csv(run_dir / "locust_stats.csv")
        browser = load_json(probe_out)
        yjs = load_json(yjs_out)
        otel = {} if args.no_otel else collect_otel(
            args.clickhouse, measure_start, measure_end, backend_service, frontend_service
        )
        gates = evaluate_gates(args, locust, otel, browser)
        context = {
            "run_id": run_id,
            "started_at": started_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "duration": args.duration,
            "users": args.users,
            "spawn_rate": args.spawn_rate,
            "target": target,
            "db_path": str(temp_db) if temp_db else args.db_source,
            "seed": args.seed,
            "locust": locust,
            "otel": otel,
            "browser": browser,
            "yjs": yjs,
            "gates": gates,
            "artifacts": {
                "report": str(run_dir / "report.md"),
                "locust csv": str(run_dir / "locust_stats.csv"),
                "locust html": str(run_dir / "locust.html"),
                "server log": str(run_dir / "server.log"),
                "frontend log": str(run_dir / "frontend.log"),
                "browser probe": str(probe_out),
                "yjs observer": str(yjs_out),
            },
        }
        (run_dir / "summary.json").write_text(json.dumps(context, indent=2), encoding="utf-8")
        (run_dir / "report.md").write_text(render_report(context), encoding="utf-8")
        print(f"[bench] report: {run_dir / 'report.md'}")
        for gate in gates:
            print(f"[bench] gate {gate[0]}: {gate[1]} (limit {gate[2]}) -> {gate[3]}")

        if args.enforce and any(gate[3] == "FAIL" for gate in gates):
            sys.exit(1)
    finally:
        stop_process(probe, "browser probe")
        stop_process(observer, "yjs observer")
        stop_process(frontend, "frontend")
        stop_process(server, "backend")
        server_log.close()
        frontend_log.close()
        locust_log.close()
        if probe_log is not None:
            probe_log.close()
        if temp_db is not None and not args.keep_db:
            shutil.rmtree(temp_db.parent, ignore_errors=True)


if __name__ == "__main__":
    main()
