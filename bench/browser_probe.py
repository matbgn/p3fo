"""Headless Chrome probe for P3FO paint performance.

Launches Chrome through the DevTools Protocol, opens the board, clears the
default user filter so Yjs updates are applied, then samples requestAnimationFrame
intervals and long tasks while the Locust load runs.

Usage:
    python3 bench/browser_probe.py --url http://localhost:5183/ \
        --duration-ms 30000 --gate /tmp/probe.go --out probe.json
"""

import argparse
import asyncio
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.parse
import urllib.request
from pathlib import Path

import websockets


NETWORK_PROFILES = {
    "none": None,
    "fast-3g": {
        "latency": 150,
        "download_kbps": 1600,
        "upload_kbps": 750,
        "connection_type": "cellular3g",
    },
    "slow-3g": {
        "latency": 400,
        "download_kbps": 500,
        "upload_kbps": 500,
        "connection_type": "cellular3g",
    },
    "3g": {
        "latency": 300,
        "download_kbps": 750,
        "upload_kbps": 250,
        "connection_type": "cellular3g",
    },
    "4g": {
        "latency": 50,
        "download_kbps": 4000,
        "upload_kbps": 3000,
        "connection_type": "cellular4g",
    },
}


def free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def http_json(url, method="GET"):
    request = urllib.request.Request(url, method=method)
    with urllib.request.urlopen(request, timeout=10) as response:
        return json.loads(response.read().decode("utf-8"))


async def cdp_send(ws, method, params=None, next_id=None):
    message_id = next_id[0]
    next_id[0] += 1
    await ws.send(json.dumps({"id": message_id, "method": method, "params": params or {}}))
    while True:
        raw = await ws.recv()
        message = json.loads(raw)
        if message.get("id") == message_id:
            if "error" in message:
                raise RuntimeError(f"CDP {method}: {message['error']}")
            return message.get("result", {})


async def evaluate(ws, next_id, expression, await_promise=False):
    result = await cdp_send(
        ws,
        "Runtime.evaluate",
        {
            "expression": expression,
            "awaitPromise": await_promise,
            "returnByValue": True,
            "userGesture": True,
        },
        next_id,
    )
    if result.get("exceptionDetails"):
        raise RuntimeError(f"page exception: {result['exceptionDetails']}")
    return result.get("result", {}).get("value")


async def wait_for_board(ws, next_id, timeout_s=120):
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        try:
            state = await evaluate(ws, next_id, "document.readyState")
            text = await evaluate(ws, next_id, "document.body ? document.body.innerText : ''")
            if state == "complete" and text and "Loading persistence" not in text:
                if "Backlog" in text or "Start working" in text:
                    return True
        except Exception:
            pass
        await asyncio.sleep(0.1)
    return False


INIT_JS = r"""
(() => {
  const boot = { startedAt: performance.now(), paint: [], longTasks: [], loaf: [] };
  window.__p3foBoot = boot;

  // Record the exact moment the board DOM appears instead of relying on the
  // probe's polling interval (which can add up to 100 ms to boardReadyMs).
  const markBoardReady = () => {
    if (window.__p3foBoardReadyAt) return;
    const body = document.body;
    if (!body) return;
    const text = body.textContent || '';
    if (text.includes('Backlog') || text.includes('Start working')) {
      window.__p3foBoardReadyAt = performance.now();
    }
  };
  const scheduleBoardCheck = () => {
    if (window.__p3foBoardReadyAt) return;
    requestAnimationFrame(markBoardReady);
  };
  new MutationObserver(scheduleBoardCheck).observe(document, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  requestAnimationFrame(markBoardReady);

  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        boot.paint.push({ name: entry.name, startTime: entry.startTime });
      }
    }).observe({ type: 'paint', buffered: true });
  } catch (error) {}
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        boot.longTasks.push({ startTime: entry.startTime, duration: entry.duration });
      }
    }).observe({ type: 'longtask', buffered: true });
  } catch (error) {}
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        boot.loaf.push({
          startTime: entry.startTime,
          duration: entry.duration,
          blockingDuration: entry.blockingDuration,
        });
      }
    }).observe({ type: 'long-animation-frame', buffered: true });
  } catch (error) {}
})();
"""

LOAD_METRICS_JS = r"""
() => {
  const round = (value) => Math.round((value || 0) * 10) / 10;
  const nav = performance.getEntriesByType('navigation')[0] || {};
  const paints = {};
  for (const entry of performance.getEntriesByType('paint')) {
    paints[entry.name] = round(entry.startTime);
  }
  const resources = performance.getEntriesByType('resource').map((entry) => ({
    name: entry.name,
    initiatorType: entry.initiatorType,
    transferSize: entry.transferSize || 0,
    encodedBodySize: entry.encodedBodySize || 0,
    decodedBodySize: entry.decodedBodySize || 0,
    durationMs: round(entry.duration),
    startTimeMs: round(entry.startTime),
  }));
  const sum = (key) => resources.reduce((total, entry) => total + entry[key], 0);
  const isKind = (entry, extension) => entry.name.split('?')[0].endsWith('.' + extension);
  const js = resources.filter((entry) => isKind(entry, 'js'));
  const css = resources.filter((entry) => isKind(entry, 'css'));
  const main = resources.find((entry) => entry.name.split('?')[0].match(/\/assets\/index-[^/]+\.js$/));
  const boot = window.__p3foBoot || {};
  const longTasks = boot.longTasks || [];
  return {
    ttfbMs: round(nav.responseStart),
    domContentLoadedMs: round(nav.domContentLoadedEventEnd),
    loadEventMs: round(nav.loadEventEnd),
    firstPaintMs: paints['first-paint'] ?? null,
    firstContentfulPaintMs: paints['first-contentful-paint'] ?? null,
    resourceCount: resources.length,
    navigationTransferBytes: nav.transferSize || 0,
    resourceTransferBytes: sum('transferSize'),
    resourceEncodedBytes: sum('encodedBodySize'),
    resourceDecodedBytes: sum('decodedBodySize'),
    totalTransferBytes: (nav.transferSize || 0) + sum('transferSize'),
    jsTransferBytes: js.reduce((total, entry) => total + entry.transferSize, 0),
    cssTransferBytes: css.reduce((total, entry) => total + entry.transferSize, 0),
    longTasksBeforeBoard: longTasks.length,
    longTaskTotalBeforeBoardMs: Math.round(longTasks.reduce((total, entry) => total + entry.duration, 0)),
    loafBeforeBoard: (boot.loaf || []).length,
    mainBundle: main ? {
      name: main.name,
      transferSize: main.transferSize,
      encodedBodySize: main.encodedBodySize,
      decodedBodySize: main.decodedBodySize,
      durationMs: main.durationMs,
    } : null,
    topResources: [...resources].sort((a, b) => b.transferSize - a.transferSize).slice(0, 12),
  };
}
"""


async def select_view(ws, next_id, view):
    if not view or view == "board":
        return {"view": "board", "clicked": True, "title": True}
    expression = r"""
    async () => {
      const clickElement = (el) => {
        if (!el) return false;
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        return true;
      };
      const findTimetable = () => {
        const clock = document.querySelector('svg.lucide-clock');
        if (clock) return clock.closest('button, [role="button"]');
        const candidates = [...document.querySelectorAll('button, [role="button"]')];
        return candidates.find((el) => (el.getAttribute('aria-label') || '').toLowerCase().includes('timetable')) ||
          candidates.find((el) => (el.textContent || '').trim().toLowerCase() === 'timetable');
      };
      let button = findTimetable();
      if (!button) {
        const more = [...document.querySelectorAll('button')].find((el) =>
          /more|overflow/i.test(el.getAttribute('aria-label') || '') ||
          el.querySelector('svg.lucide-ellipsis')
        );
        if (more) {
          clickElement(more);
          await new Promise((resolve) => setTimeout(resolve, 350));
          button = findTimetable();
        }
      }
      const clicked = clickElement(button);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return {
        view: 'timetable',
        clicked,
        title: (document.body.innerText || '').includes('Timetable'),
      };
    }
    """
    return await evaluate(ws, next_id, f"({expression})()", await_promise=True)


async def clear_filters(ws, next_id):
    expression = """
    async () => {
      const clickByText = (text) => {
        const candidates = [...document.querySelectorAll('button, [role="button"], div, span')];
        const el = candidates.find((node) => node.textContent && node.textContent.trim() === text);
        if (!el) return false;
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        return true;
      };
      const opened = clickByText('Filters & Controls');
      await new Promise((resolve) => setTimeout(resolve, 400));
      const cleared = clickByText('Clear All Filters');
      await new Promise((resolve) => setTimeout(resolve, 800));
      if (opened && !cleared) {
        clickByText('Filters & Controls');
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
      return { opened, cleared };
    }
    """
    return await evaluate(ws, next_id, f"({expression})()", await_promise=True)


MEASURE_JS = """
async (durationMs) => {
  const frames = [];
  const longTasks = [];
  const loaf = [];
  let longTaskObserver = null;
  let loafObserver = null;
  try {
    longTaskObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) longTasks.push(Math.round(entry.duration));
    });
    longTaskObserver.observe({ entryTypes: ['longtask'] });
  } catch (error) {}
  try {
    loafObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        loaf.push({ duration: Math.round(entry.duration), blocking: Math.round(entry.blockingDuration) });
      }
    });
    loafObserver.observe({ type: 'long-animation-frame' });
  } catch (error) {}

  let last = performance.now();
  let running = true;
  function tick(now) {
    frames.push(now - last);
    last = now;
    if (running) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  const start = performance.now();
  await new Promise((resolve) => setTimeout(resolve, durationMs));
  running = false;
  if (longTaskObserver) longTaskObserver.disconnect();
  if (loafObserver) loafObserver.disconnect();

  const sorted = [...frames].sort((a, b) => a - b);
  const percentile = (q) => sorted.length ? Math.round(sorted[Math.floor(sorted.length * q)] * 10) / 10 : 0;
  return {
    durationMs: Math.round(performance.now() - start),
    frameCount: frames.length,
    fps: frames.length ? Math.round(1000 / (frames.reduce((a, b) => a + b, 0) / frames.length)) : 0,
    frameP50Ms: percentile(0.5),
    frameP95Ms: percentile(0.95),
    frameP99Ms: percentile(0.99),
    frameMaxMs: sorted.length ? Math.round(sorted[sorted.length - 1]) : 0,
    framesOver25Ms: frames.filter((value) => value > 25).length,
    framesOver50Ms: frames.filter((value) => value > 50).length,
    longTasks,
    longTaskCount: longTasks.length,
    longTaskTotalMs: longTasks.reduce((a, b) => a + b, 0),
    longTaskMaxMs: longTasks.length ? Math.max(...longTasks) : 0,
    loafCount: loaf.length,
    loafTotalMs: loaf.reduce((a, b) => a + b.duration, 0),
    loafBlockingMs: loaf.reduce((a, b) => a + b.blocking, 0),
    domNodes: document.querySelectorAll('*').length,
    backlogVisible: document.body.innerText.includes('Backlog'),
  };
}
"""


async def run(args):
    port = free_port()
    profile_dir = tempfile.mkdtemp(prefix="p3fo-bench-chrome-")
    chrome = args.chrome
    chrome_args = [
        chrome,
        f"--remote-debugging-port={port}",
        f"--user-data-dir={profile_dir}",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-background-timer-throttling",
        "--disable-renderer-backgrounding",
        "--disable-backgrounding-occluded-windows",
        f"--window-size={args.width},{args.height}",
    ]
    if not args.headed:
        chrome_args.insert(1, "--headless=new")
    chrome_args.append("about:blank")

    process = subprocess.Popen(
        chrome_args,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        deadline = time.time() + 30
        while time.time() < deadline:
            try:
                http_json(f"http://127.0.0.1:{port}/json/version")
                break
            except Exception:
                if process.poll() is not None:
                    raise RuntimeError(f"Chrome exited with code {process.returncode}")
                time.sleep(0.2)
        else:
            raise RuntimeError("Chrome DevTools did not start")

        target = http_json(
            f"http://127.0.0.1:{port}/json/new?{urllib.parse.quote('about:blank', safe='')}",
            method="PUT",
        )
        ws_url = target["webSocketDebuggerUrl"]

        async with websockets.connect(ws_url, max_size=None) as ws:
            next_id = [0]
            await cdp_send(ws, "Runtime.enable", {}, next_id)
            await cdp_send(ws, "Page.enable", {}, next_id)
            network_profile = NETWORK_PROFILES.get(args.network)
            if network_profile:
                await cdp_send(ws, "Network.enable", {}, next_id)
                await cdp_send(
                    ws,
                    "Network.setCacheDisabled",
                    {"cacheDisabled": True},
                    next_id,
                )
                await cdp_send(
                    ws,
                    "Network.emulateNetworkConditions",
                    {
                        "offline": False,
                        "latency": network_profile["latency"],
                        "downloadThroughput": int(
                            network_profile["download_kbps"] * 1024 / 8
                        ),
                        "uploadThroughput": int(
                            network_profile["upload_kbps"] * 1024 / 8
                        ),
                        "connectionType": network_profile["connection_type"],
                    },
                    next_id,
                )
            await cdp_send(
                ws,
                "Page.addScriptToEvaluateOnNewDocument",
                {"source": INIT_JS},
                next_id,
            )
            await cdp_send(ws, "Page.navigate", {"url": args.url}, next_id)
            loaded = await wait_for_board(ws, next_id)
            board_ready_ms = await evaluate(
                ws,
                next_id,
                "window.__p3foBoardReadyAt || performance.now()",
            ) or 0
            initial_load = await evaluate(ws, next_id, f"({LOAD_METRICS_JS})()") or {}
            initial_load["boardReadyMs"] = round(board_ready_ms, 1)
            view = await select_view(ws, next_id, args.view) or {"view": args.view}
            filters = await clear_filters(ws, next_id) or {}
            await asyncio.sleep(2.5)
            if not loaded:
                print("[probe] board did not load in time", file=sys.stderr)
            if args.ready_file:
                Path(args.ready_file).write_text("ready", encoding="utf-8")
            print("PROBE_READY", flush=True)

            if args.gate:
                gate_deadline = time.time() + 120
                while time.time() < gate_deadline and not os.path.exists(args.gate):
                    await asyncio.sleep(0.1)

            result = await evaluate(
                ws, next_id, f"({MEASURE_JS})({args.duration_ms})", await_promise=True
            )
            result["url"] = args.url
            result["network"] = args.network
            result["initialLoad"] = initial_load
            result["view"] = view
            result["filters"] = filters
            result["boardLoaded"] = loaded
            result["headed"] = args.headed
            result["chrome"] = chrome
            result["timestamp"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            if args.out:
                with open(args.out, "w", encoding="utf-8") as handle:
                    json.dump(result, handle, indent=2)
            print(json.dumps(result))
    finally:
        try:
            process.terminate()
            process.wait(timeout=10)
        except Exception:
            process.kill()
        shutil.rmtree(profile_dir, ignore_errors=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://localhost:5173/")
    parser.add_argument("--duration-ms", type=int, default=30000)
    parser.add_argument("--view", default="board", choices=["board", "timetable"])
    parser.add_argument(
        "--network",
        default="none",
        choices=sorted(NETWORK_PROFILES),
    )
    parser.add_argument("--gate", default="")
    parser.add_argument("--ready-file", default="")
    parser.add_argument("--out", default="")
    parser.add_argument("--chrome", default=os.environ.get("CHROME_BIN", "google-chrome"))
    parser.add_argument("--headed", action="store_true")
    parser.add_argument("--width", type=int, default=1600)
    parser.add_argument("--height", type=int, default=1000)
    asyncio.run(run(parser.parse_args()))


if __name__ == "__main__":
    main()
