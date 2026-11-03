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
import os
import random
import time

import requests
from locust import HttpUser, between, events, task

RUN_ID = os.environ.get("BENCH_RUN_ID", time.strftime("%Y%m%d-%H%M%S"))
TITLE_PREFIX = os.environ.get("BENCH_TITLE_PREFIX", "bench:")
SEED = int(os.environ.get("BENCH_SEED", "42"))
WAIT_MIN = float(os.environ.get("BENCH_WAIT_MIN", "0.4"))
WAIT_MAX = float(os.environ.get("BENCH_WAIT_MAX", "1.6"))
CLEANUP = os.environ.get("BENCH_CLEANUP", "1") == "1"

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
    weight = 2

    @task
    def create_and_assign(self):
        task_id = self.create_task("creator")
        if task_id and self.rng.random() < 0.5:
            patch = {"category": self.rng.choice(CATEGORIES)}
            if USER_IDS:
                patch["userId"] = self.rng.choice(USER_IDS)
            self.patch_task(task_id, patch, "PATCH /api/tasks/:id (assign+category)")


class AssignerUser(BenchUser):
    weight = 3

    @task(3)
    def assign_and_categorize(self):
        self.assign()

    @task(1)
    def read_active(self):
        super().read_active()


class MoverUser(BenchUser):
    weight = 3

    @task(3)
    def move_card(self):
        self.move()

    @task(1)
    def edit_title(self):
        self.edit()


class ReaderUser(BenchUser):
    weight = 2

    @task(2)
    def full_board(self):
        self.read_full()

    @task(1)
    def active_board(self):
        self.read_active()


class MixedUser(BenchUser):
    weight = 4

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


@events.test_stop.add_listener
def cleanup_created_tasks(environment, **_kwargs):
    if not CLEANUP:
        return
    host = environment.host
    if not host:
        return
    try:
        response = requests.get(f"{host}/api/tasks", timeout=10)
        response.raise_for_status()
        prefix = f"{TITLE_PREFIX}{RUN_ID}-"
        deleted = 0
        for item in response.json().get("data", []):
            if item.get("title", "").startswith(prefix):
                requests.delete(f"{host}/api/tasks/{item['id']}", timeout=5)
                deleted += 1
        print(f"[bench] cleaned up {deleted} created task(s)")
    except Exception as exc:
        print(f"[bench] cleanup skipped: {exc}")
