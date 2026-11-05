"""Locust scenarios for the P3FO board.

Simulates multiple users creating cards, moving them between statuses,
reassigning them, changing their category, and reading the board the same
way the SPA does (full payload plus active-only refresh).

Run through bench/orchestrator.py for an isolated database and a report, or
directly:

    locust -f bench/locustfile.py --headless -u 10 -r 2 -t 30s \
        --host http://localhost:5172
"""

import itertools
import json
import os
import random
import threading
import time
from pathlib import Path

import requests
from locust import HttpUser, between, events, task

RUN_ID = os.environ.get("BENCH_RUN_ID", time.strftime("%Y%m%d-%H%M%S"))
TITLE_PREFIX = os.environ.get("BENCH_TITLE_PREFIX", "bench:")
SEED = int(os.environ.get("BENCH_SEED", "42"))
WAIT_MIN = float(os.environ.get("BENCH_WAIT_MIN", "0.4"))
WAIT_MAX = float(os.environ.get("BENCH_WAIT_MAX", "1.6"))
CLEANUP = os.environ.get("BENCH_CLEANUP", "1") == "1"
SCENARIO = os.environ.get("BENCH_SCENARIO", "mixed").strip().lower()
TIMETABLE_TASK_COUNT = max(1, int(os.environ.get("BENCH_TIMETABLE_TASKS", "2")))
TIMETABLE_ENTRY_COUNT = max(1, int(os.environ.get("BENCH_TIMETABLE_ENTRIES", "24")))
INTEGRITY_OUT = os.environ.get("BENCH_INTEGRITY_OUT", "")
TIMETABLE_SYNC = os.environ.get("BENCH_TIMETABLE_SYNC", "0") == "1"

CATEGORIES = [
    "General",
    "Marketing",
    "Documentation",
    "Consulting",
    "Testing",
    "Funerals",
    "Negotiated overtime",
    "Sickness",
    "Finances",
    "HR",
    "Training",
    "Support",
    "UX/UI",
    "Admin",
    "Development",
    "System Operations",
    "Private",
]
STATUSES = ["Backlog", "Ready", "WIP", "Blocked", "Done"]
USER_IDS = []
COUNTER = itertools.count()


def _task_title(persona):
    return f"{TITLE_PREFIX}{RUN_ID}-{persona}-{next(COUNTER):05d}"


def _headers():
    return {"Content-Type": "application/json"}


def _scenario_weight(mixed_weight, timetable_weight):
    return timetable_weight if SCENARIO == "timetable" else mixed_weight


HOT_TASKS = []
HOT_TASKS_LOCK = threading.Lock()


def _timetable_base_ms():
    day = 86_400_000
    return (int(time.time() * 1000) // day) * day - 3 * day


def _seed_hot_timetable_tasks(client):
    """Create the shared tasks every timetable user edits.

    The ids are process-global so every Locust user converges on the same few
    rows. That is the deliberate contention point: the UI PATCHes the whole
    task (including its `timer` array) after editing a single entry, so
    simultaneous editors overwrite each other's timer entries.
    """
    global HOT_TASKS
    if HOT_TASKS:
        return HOT_TASKS

    with HOT_TASKS_LOCK:
        if HOT_TASKS:
            return HOT_TASKS

        base = _timetable_base_ms()
        seeded = []
        for task_index in range(TIMETABLE_TASK_COUNT):
            timer = []
            for entry_index in range(TIMETABLE_ENTRY_COUNT):
                start = base + entry_index * 3_600_000
                timer.append({"startTime": start, "endTime": start + 1_800_000})

            payload = {
                "title": f"{TITLE_PREFIX}{RUN_ID}-timetable-{task_index:02d}",
                "triageStatus": "WIP",
                "category": "Consulting",
                "difficulty": 2,
                "timer": timer,
            }
            with client.post(
                "/api/tasks",
                json=payload,
                name="POST /api/tasks (timetable seed)",
                catch_response=True,
            ) as response:
                if response.status_code == 201:
                    seeded.append(response.json())
                else:
                    response.failure(f"timetable seed failed: {response.status_code}")

        HOT_TASKS = seeded
        return HOT_TASKS


def _patch_whole_task(client, task, timer, name, extra=None):
    """PATCH the full task, mirroring persistence-http's updateTask()."""
    payload = {**task, "timer": timer}
    if extra:
        payload.update(extra)
    with client.patch(
        f"/api/tasks/{task['id']}",
        json=payload,
        name=name,
        catch_response=True,
    ) as response:
        if response.status_code != 200:
            response.failure(f"patch failed: {response.status_code}")
    task["timer"] = timer
    return payload


class BenchUser(HttpUser):
    abstract = True
    wait_time = between(WAIT_MIN, WAIT_MAX)

    def on_start(self):
        self.rng = random.Random(SEED + next(COUNTER))
        self.task_cache = []
        self.task_cache_at = 0.0
        self.created_ids = []

        self.client.get("/api/health", name="/api/health")
        users = self.client.get("/api/users", name="/api/users")
        if users.ok:
            USER_IDS[:] = [u.get("userId") for u in users.json() if u.get("userId")]

        self.refresh_tasks(force=True)

    def refresh_tasks(self, force=False):
        if not force and time.time() - self.task_cache_at < 5:
            return self.task_cache
        with self.client.get(
            "/api/tasks",
            params={"active": "true"},
            name="/api/tasks?active=true",
            catch_response=True,
        ) as response:
            if response.ok:
                self.task_cache = [t["id"] for t in response.json().get("data", [])]
                self.task_cache_at = time.time()
            else:
                response.failure(f"task list failed: {response.status_code}")
        return self.task_cache

    def pick_task(self):
        ids = self.refresh_tasks()
        return self.rng.choice(ids) if ids else None

    def create_task(self, persona):
        payload = {
            "title": _task_title(persona),
            "triageStatus": "Backlog",
            "category": self.rng.choice(CATEGORIES),
            "difficulty": self.rng.choice([0.5, 1, 2, 3, 5, 8]),
            "priority": self.rng.randint(1, 999),
            "urgent": self.rng.random() < 0.1,
            "impact": self.rng.random() < 0.2,
            "sprintTarget": self.rng.random() < 0.1,
        }
        if USER_IDS:
            payload["userId"] = self.rng.choice(USER_IDS)
        with self.client.post(
            "/api/tasks", json=payload, name="POST /api/tasks", catch_response=True
        ) as response:
            if response.status_code == 201:
                task_id = response.json().get("id")
                if task_id:
                    self.created_ids.append(task_id)
                return task_id
            response.failure(f"create failed: {response.status_code}")
            return None

    def patch_task(self, task_id, patch, name):
        with self.client.patch(
            f"/api/tasks/{task_id}",
            json=patch,
            name=name,
            catch_response=True,
        ) as response:
            if response.status_code != 200:
                response.failure(f"patch failed: {response.status_code}")

    def assign(self):
        task_id = self.pick_task()
        if not task_id:
            return
        patch = {"category": self.rng.choice(CATEGORIES)}
        if USER_IDS:
            patch["userId"] = self.rng.choice(USER_IDS)
        self.patch_task(task_id, patch, "PATCH /api/tasks/:id (assign+category)")

    def move(self):
        task_id = self.pick_task()
        if not task_id:
            return
        patch = {"triageStatus": self.rng.choice(STATUSES)}
        if self.rng.random() < 0.3:
            patch["priority"] = self.rng.randint(1, 999)
        self.patch_task(task_id, patch, "PATCH /api/tasks/:id (move)")

    def edit(self):
        task_id = self.pick_task()
        if not task_id:
            return
        self.patch_task(
            task_id,
            {"title": f"bench-edit-{next(COUNTER):05d}"},
            "PATCH /api/tasks/:id (edit)",
        )

    def read_full(self):
        self.client.get("/api/tasks", name="GET /api/tasks")

    def read_active(self):
        self.client.get(
            "/api/tasks", params={"active": "true"}, name="GET /api/tasks?active=true"
        )


class CreatorUser(BenchUser):
    weight = _scenario_weight(2, 0)

    @task
    def create_and_assign(self):
        task_id = self.create_task("creator")
        if task_id and self.rng.random() < 0.5:
            patch = {"category": self.rng.choice(CATEGORIES)}
            if USER_IDS:
                patch["userId"] = self.rng.choice(USER_IDS)
            self.patch_task(task_id, patch, "PATCH /api/tasks/:id (assign+category)")


class AssignerUser(BenchUser):
    weight = _scenario_weight(3, 0)

    @task(3)
    def assign_and_categorize(self):
        self.assign()

    @task(1)
    def read_active(self):
        super().read_active()


class MoverUser(BenchUser):
    weight = _scenario_weight(3, 0)

    @task(3)
    def move_card(self):
        self.move()

    @task(1)
    def edit_title(self):
        self.edit()


class ReaderUser(BenchUser):
    weight = _scenario_weight(2, 0)

    @task(2)
    def full_board(self):
        self.read_full()

    @task(1)
    def active_board(self):
        self.read_active()


class MixedUser(BenchUser):
    weight = _scenario_weight(4, 0)

    @task(2)
    def create_then_move(self):
        task_id = self.create_task("mixed")
        if task_id:
            self.move()

    @task(3)
    def assign(self):
        super().assign()

    @task(3)
    def move(self):
        super().move()

    @task(1)
    def read(self):
        super().read_active()


class TimetableUser(BenchUser):
    """Simultaneous timetable editors and timer start/stop.

    Every user edits the same small set of seeded tasks. Like the real UI, the
    client keeps a stale local copy and PATCHes the whole task (including the
    full `timer` array) after touching a single entry. Concurrent users
    therefore overwrite each other's entries, which is exactly the contention
    this scenario measures.
    """

    weight = _scenario_weight(0, 6)

    def on_start(self):
        super().on_start()
        self.user_seq = next(COUNTER)
        self.mark_counter = itertools.count()
        self.mark_base = int(time.time() * 1000) + (self.user_seq % 1000) * 1_000
        self.local_tasks = {}

        for task in _seed_hot_timetable_tasks(self.client):
            task_id = task.get("id")
            if not task_id:
                continue
            with self.client.get(
                f"/api/tasks/{task_id}",
                name="GET /api/tasks/:id (timetable load)",
                catch_response=True,
            ) as response:
                if response.ok:
                    self.local_tasks[task_id] = response.json()
                else:
                    response.failure(f"timetable load failed: {response.status_code}")

    def _next_mark(self):
        return self.mark_base + next(self.mark_counter)

    def _pick_task(self):
        if not self.local_tasks:
            return None
        return self.local_tasks[self.rng.choice(list(self.local_tasks))]

    def _sync_task(self, task_id):
        """Optionally refetch a task, approximating a Yjs-synced client."""
        if not TIMETABLE_SYNC:
            return self.local_tasks.get(task_id)
        with self.client.get(
            f"/api/tasks/{task_id}",
            name="GET /api/tasks/:id (timetable sync)",
            catch_response=True,
        ) as response:
            if response.ok:
                self.local_tasks[task_id] = response.json()
            else:
                response.failure(f"timetable sync failed: {response.status_code}")
        return self.local_tasks.get(task_id)

    @staticmethod
    def _timer(task):
        return [dict(entry) for entry in (task.get("timer") or [])]

    @task(4)
    def edit_entry(self):
        task = self._pick_task()
        if not task:
            return
        task = self._sync_task(task["id"])
        if not task:
            return
        timer = self._timer(task)
        if not timer:
            return
        index = self.rng.randrange(len(timer))
        entry = dict(timer[index])
        delta = self.rng.choice([-1, 1]) * self.rng.randint(1, 15) * 60_000
        if entry.get("startTime"):
            entry["startTime"] = max(0, entry["startTime"] + delta)
        if entry.get("endTime"):
            entry["endTime"] = max(
                entry.get("startTime", 0) + 60_000,
                entry["endTime"] + delta,
            )
        entry["benchSeq"] = self._next_mark()
        timer[index] = entry
        _patch_whole_task(
            self.client,
            task,
            timer,
            "PATCH /api/tasks/:id (timetable edit)",
        )

    @task(2)
    def start_timer(self):
        task = self._pick_task()
        if not task:
            return
        task = self._sync_task(task["id"])
        if not task:
            return

        # Mirror toggleTimer(): starting a timer stops every other running one.
        for other_id in list(self.local_tasks):
            if other_id == task["id"]:
                continue
            other = self._sync_task(other_id)
            if not other:
                continue
            other_timer = self._timer(other)
            open_indices = [
                index for index, entry in enumerate(other_timer)
                if not entry.get("endTime")
            ]
            if not open_indices:
                continue
            for index in open_indices:
                other_timer[index] = {
                    **other_timer[index],
                    "endTime": self._next_mark(),
                    "benchSeq": self._next_mark(),
                }
            _patch_whole_task(
                self.client,
                other,
                other_timer,
                "PATCH /api/tasks/:id (timetable stop other)",
            )

        timer = self._timer(task)
        if any(not entry.get("endTime") for entry in timer):
            return
        timer.append({
            "startTime": self._next_mark(),
            "endTime": 0,
            "benchSeq": self._next_mark(),
        })
        _patch_whole_task(
            self.client,
            task,
            timer,
            "PATCH /api/tasks/:id (timetable start)",
            {"triageStatus": "WIP"},
        )

    @task(2)
    def stop_timer(self):
        task = self._pick_task()
        if not task:
            return
        task = self._sync_task(task["id"])
        if not task:
            return
        timer = self._timer(task)
        open_indices = [
            index for index, entry in enumerate(timer)
            if not entry.get("endTime")
        ]
        if not open_indices:
            return
        index = open_indices[-1]
        timer[index] = {
            **timer[index],
            "endTime": self._next_mark(),
            "benchSeq": self._next_mark(),
        }
        _patch_whole_task(
            self.client,
            task,
            timer,
            "PATCH /api/tasks/:id (timetable stop)",
        )

    @task(2)
    def read_timetable(self):
        super().read_full()


def _request_counts(environment):
    counts = {}
    for entry in environment.stats.entries.values():
        name = getattr(entry, "name", "")
        succeeded = max(0, entry.num_requests - entry.num_failures)
        counts[name] = counts.get(name, 0) + succeeded
    return counts


def _collect_timetable_integrity(environment, tasks):
    if SCENARIO != "timetable":
        return {}

    prefix = f"{TITLE_PREFIX}{RUN_ID}-timetable-"
    hot_tasks = [
        task for task in tasks
        if str(task.get("title", "")).startswith(prefix)
    ]
    counts = _request_counts(environment)

    def count(fragment):
        return sum(
            requests_count for name, requests_count in counts.items()
            if fragment in name
        )

    starts = count("timetable start")
    edits = count("timetable edit")
    stops = count("timetable stop)")
    others = count("timetable stop other")
    seed_entries = len(hot_tasks) * TIMETABLE_ENTRY_COUNT
    final_entries = sum(len(task.get("timer") or []) for task in hot_tasks)
    expected_entries = seed_entries + starts
    lost_entries = max(0, expected_entries - final_entries)
    open_entries = sum(
        1
        for task in hot_tasks
        for entry in (task.get("timer") or [])
        if not entry.get("endTime")
    )

    return {
        "hotTasks": len(hot_tasks),
        "hotTaskIds": [task.get("id") for task in hot_tasks],
        "seedEntriesPerTask": TIMETABLE_ENTRY_COUNT,
        "seedEntries": seed_entries,
        "finalEntries": final_entries,
        "expectedEntries": expected_entries,
        "successfulEdits": edits,
        "successfulStarts": starts,
        "successfulStops": stops,
        "successfulStopOthers": others,
        "lostTimerEntries": lost_entries,
        "lostTimerEntryRate": (lost_entries / starts) if starts else 0.0,
        "openTimerEntries": open_entries,
    }


@events.test_stop.add_listener
def collect_integrity_and_cleanup(environment, **_kwargs):
    host = environment.host
    if not host:
        return

    tasks = []
    try:
        response = requests.get(f"{host}/api/tasks", timeout=10)
        response.raise_for_status()
        tasks = response.json().get("data", [])

        integrity = _collect_timetable_integrity(environment, tasks)
        if integrity:
            if INTEGRITY_OUT:
                Path(INTEGRITY_OUT).write_text(
                    json.dumps(integrity, indent=2),
                    encoding="utf-8",
                )
            print(
                "[bench] timetable integrity: "
                f"{integrity['lostTimerEntries']} lost timer entries "
                f"({integrity['lostTimerEntryRate'] * 100:.1f}% of starts), "
                f"{integrity['openTimerEntries']} still open"
            )
    except Exception as exc:
        print(f"[bench] integrity skipped: {exc}")

    if not CLEANUP:
        return
    try:
        prefix = f"{TITLE_PREFIX}{RUN_ID}-"
        deleted = 0
        for item in tasks:
            if item.get("title", "").startswith(prefix):
                requests.delete(f"{host}/api/tasks/{item['id']}", timeout=5)
                deleted += 1
        print(f"[bench] cleaned up {deleted} created task(s)")
    except Exception as exc:
        print(f"[bench] cleanup skipped: {exc}")
