# P3FO Persistence Architecture Proposal

This document specifies how to add dual-mode persistence:

- Mode 1: Pure static SPA using browser JSON persistence (localStorage/sessionStorage) with no backend.
- Mode 2: Server-backed persistence via a minimal Node API (in `server/`) using SQLite or PostgreSQL.
- Automatic runtime selection based on configuration and backend availability.

All changes are additive and backward-compatible. Static deployment remains the default.

---

## 1. Goals

1. Keep current UX: everything works with just a static host (e.g. GitHub Pages, Vercel static).
2. Introduce a clean persistence abstraction so React code does not directly depend on `localStorage` / `sessionStorage` / DB.
3. Allow optional backend:
   - REST JSON API.
   - Pluggable DB: SQLite or PostgreSQL.
4. Auto-detect at runtime:
   - If backend is configured and healthy: use server persistence.
   - Else: use browser JSON persistence.

---

## 2. High-Level Architecture

Three layers:

- Domain:
  - Existing hooks and components: tasks, settings, user settings, QoL survey, filters.
- Persistence Abstraction:
  - Single `PersistenceAdapter` interface describing operations.
- Implementations:
  - `BrowserJsonPersistence`:
    - Uses `localStorage` and `sessionStorage`.
    - 100% static support.
  - `HttpApiPersistence`:
    - Uses `fetch` to call `/api/...` endpoints on Node backend.
  - Server-side:
    - Node app with DB adapters:
      - `sqlite` (preferred default).
      - `postgres`.

React code calls `PersistenceAdapter` only.

---

## 3. Types and Contracts

Create:

- `src/lib/persistence-types.ts`

Content (conceptual):

- `TaskEntity`:
  - Matches `Task` in `src/hooks/useTasks.ts`.
- `UserSettingsEntity`:
  - Matches `UserSettings` in `src/hooks/useUserSettings.ts`.
- `AppSettingsEntity`:
  - Matches `Settings` in `src/hooks/useSettings.ts`.
- `QolSurveyResponseEntity`:
  - JSON mapping of existing QoL survey answers.
- `FilterStateEntity`:
  - From `src/lib/filter-storage.ts`.

- `StorageMetadata`:
  - `mode`: `'browser-json' | 'server-sql'`
  - `backend`: `'local' | 'sqlite' | 'postgres'`
  - `version`: `string`

- `PersistenceAdapter`:

Tasks:
- `listTasks(): Promise<TaskEntity[]>`
- `getTask(id: string): Promise<TaskEntity | null>`
- `createTask(input: Partial<TaskEntity>): Promise<TaskEntity>`
- `updateTask(id: string, patch: Partial<TaskEntity>): Promise<TaskEntity>`
- `deleteTask(id: string): Promise<void>`
- `bulkUpdatePriorities(items: { id: string; priority: number | undefined }[]): Promise<void>`
- `clearAllTasks(): Promise<void>`
- `importTasks(tasks: TaskEntity[]): Promise<void>`

User settings:
- `getUserSettings(): Promise<UserSettingsEntity>`
- `updateUserSettings(patch: Partial<UserSettingsEntity>): Promise<UserSettingsEntity>`

App settings:
- `getSettings(): Promise<AppSettingsEntity>`
- `updateSettings(patch: Partial<AppSettingsEntity>): Promise<AppSettingsEntity>`

QoL survey:
- `getQolSurveyResponse(): Promise<QolSurveyResponseEntity | null>`
- `saveQolSurveyResponse(data: QolSurveyResponseEntity): Promise<void>`

Filters:
- `getFilters(): Promise<FilterStateEntity | null>`
- `saveFilters(data: FilterStateEntity): Promise<void>`
- `clearFilters(): Promise<void>`

Metadata:
- `getMetadata(): Promise<StorageMetadata>`

---

## 4. BrowserJsonPersistence

Create:

- `src/lib/persistence-browser.ts`

Responsibilities:

- Implement `PersistenceAdapter` using:
  - Tasks: `dyad_task_board_v1`
  - User settings: `p3fo_user_settings_v1`
  - App settings: `dyad_settings_v1`
  - QoL survey: `qolSurveyResponse`
  - Filters: `taskFilters` via `sessionStorage`
- Behavior:
  - Mirrors current logic in:
    - `src/hooks/useTasks.ts`
    - `src/hooks/useUserSettings.ts`
    - `src/hooks/useSettings.ts`
    - `src/lib/filter-storage.ts`
    - `src/pages/QoLIndexSurveyPage.tsx`
  - Wrap operations in `try/catch`.
  - Never assume presence of `window` if called in non-browser; guard with `typeof window !== 'undefined'`.

This becomes default adapter in static deployments.

---

## 5. HttpApiPersistence

Create:

- `src/lib/persistence-http.ts`

Responsibilities:

- Implement `PersistenceAdapter` using `fetch` against `P3FO_API_URL`:

Base URL:

- From `import.meta.env.VITE_P3FO_API_URL` (no trailing slash assumption).

Endpoints:

- `GET /api/health`
- `GET /api/tasks`
- `POST /api/tasks`
- `GET /api/tasks/:id`
- `PATCH /api/tasks/:id`
- `DELETE /api/tasks/:id`
- `POST /api/tasks/bulk-priorities`
- `POST /api/tasks/import`
- `POST /api/tasks/clear`
- `GET /api/user-settings`
- `PATCH /api/user-settings`
- `GET /api/settings`
- `PATCH /api/settings`
- `GET /api/qol`
- `PUT /api/qol`
- `GET /api/filters`
- `PUT /api/filters`
- `DELETE /api/filters`

Map JSON payloads 1:1 with `persistence-types` to minimize frontend logic.

---

## 6. Runtime Selection

Create:

- `src/lib/persistence-config.ts`
- `src/lib/persistence-factory.ts`

Configuration:

- `VITE_P3FO_API_URL`: optional HTTP base URL to backend.
- `VITE_P3FO_FORCE_BROWSER`: optional, `'true'` to force browser mode.

Selection algorithm:

1. If `VITE_P3FO_FORCE_BROWSER === 'true'`:
   - Use `BrowserJsonPersistence`.

2. Else if `VITE_P3FO_API_URL` is set:
   - Call `GET ${VITE_P3FO_API_URL}/api/health`.
   - If success and `ok === true`:
     - Use `HttpApiPersistence`.
   - Else:
     - Fallback to `BrowserJsonPersistence`.

3. Else:
   - Use `BrowserJsonPersistence`.

Export:

- `getPersistenceAdapter(): Promise<PersistenceAdapter>`
  - Singleton: create once, cache instance.
- Optionally:
  - `getSelectedMode(): 'browser-json' | 'server-sql'`.

This ensures:
- Pure static deploy: no env, no requests to backend, uses browser JSON.
- Server deploy: env set, uses backend if reachable.

---

## 7. React Integration

Introduce a provider:

- `src/lib/PersistenceProvider.tsx`

Behavior:

- On mount:
  - Call `getPersistenceAdapter()`.
  - Store adapter in React state.
- Expose:
  - `const PersistenceContext = React.createContext<PersistenceAdapter | null>(null);`
  - `export const usePersistence = () => { ... }`

Integration:

- Wrap the app at the top-level, e.g. in `src/main.tsx` or `src/App.tsx`:

Conceptual:

- `<PersistenceProvider>`
  - `<BrowserRouter>...`

Hooks migration (gradual):

- Replace:
  - Direct `localStorage` / `sessionStorage` calls
- With:
  - `const persistence = usePersistence();`
  - Use `await`/promises inside effects or use React Query for async.

For compatibility and minimal changes:
- Keep the existing in-memory `tasks` array and event bus in `useTasks.ts`, but initialize and mutate it through `persistence` instead of localStorage directly.
- Over time, converge to a fully async adapter usage.

---

## 8. Minimal Node Backend

Add directory:

- `server/`

Core files:

- `server/index.ts`
  - Creates HTTP server (Express/Fastify/Hono).
  - Reads env:
    - `P3FO_DB_CLIENT`: `'sqlite' | 'pg'`
    - `P3FO_DB_URL`: connection string (for Postgres) or file path (for SQLite).
    - `P3FO_DB_SQLITE_FILE`: optional path override for SQLite.
  - Instantiates DB adapter.
  - Registers REST routes under `/api`.

- `server/db/index.ts`
  - Exports `createDbClient` that returns a common interface for:
    - Tasks CRUD
    - Singletons (settings, user settings, QoL, filters)

- `server/db/sqlite.ts`
  - Uses `better-sqlite3` or similar.
  - Initializes tables (if not exist).

- `server/db/postgres.ts`
  - Uses `pg`.
  - Assumes migrations run separately or performs basic bootstrap.

REST contract (summarized):

- `GET /api/health`
  - `{ ok: true, mode: 'sqlite' | 'postgres' }`
- Tasks:
  - `GET /api/tasks`
  - `POST /api/tasks`
  - `GET /api/tasks/:id`
  - `PATCH /api/tasks/:id`
  - `DELETE /api/tasks/:id`
  - `POST /api/tasks/bulk-priorities`
  - `POST /api/tasks/import`
  - `POST /api/tasks/clear`
- User settings:
  - `GET /api/user-settings`
  - `PATCH /api/user-settings`
- App settings:
  - `GET /api/settings`
  - `PATCH /api/settings`
- QoL:
  - `GET /api/qol`
  - `PUT /api/qol`
- Filters:
  - `GET /api/filters`
  - `PUT /api/filters`
  - `DELETE /api/filters`

NPM scripts:

- `dev:server`: run backend in dev (e.g. `tsx server/index.ts`).
- `start:server`: start compiled backend.

Backend is optional:
- Static-only deployments never hit it.

---

## 9. Data Model Mapping

Tables (simplified):

Tasks:
- `id` (uuid, pk)
- `parent_id` (uuid, nullable)
- `title` (text)
- `created_at` (timestamp)
- `triage_status` (text)
- `urgent` (boolean)
- `impact` (boolean)
- `major_incident` (boolean)
- `difficulty` (real/int)
- `timer` (json/jsonb)
- `category` (text)
- `termination_date` (timestamp, nullable)
- `comment` (text, nullable)
- `duration_in_minutes` (int, nullable)
- `priority` (int, nullable)
- `user_id` (text, nullable)

User settings:
- Single row:
  - `id` (int pk, default 1)
  - `username`
  - `logo`
  - `has_completed_onboarding`

App settings:
- Single row:
  - `id` (int pk, default 1)
  - `split_time`
  - `user_workload_percentage`
  - `weeks_computation`
  - `high_impact_task_goal`
  - `failure_rate_goal`
  - `qli_goal`
  - `new_capabilities_goal`

QoL survey:
- Single row:
  - `id` (int pk, default 1)
  - `responses` (json/jsonb)

Filters:
- Single row:
  - `id` (int pk, default 1)
  - `data` (json/jsonb)

Mapping:
- `HttpApiPersistence` and backend always read/write JSON using these tables.
- `BrowserJsonPersistence` uses the existing keys and shapes.

---

## 10. Migration Strategy

1. Introduce types and adapters (no behavioral change).
2. Add `BrowserJsonPersistence` and `PersistenceProvider`, but keep hooks using old logic.
3. Gradually:
   - Update `useTasks`, `useUserSettings`, `useSettings`, `filter-storage`, `QoLIndexSurveyPage` to use `usePersistence()`.
   - Ensure behavior matches existing semantics.
4. Add `HttpApiPersistence` wired to REST API.
5. Add backend under `server/` and scripts.
6. Wire in runtime selection via `persistence-factory`.
7. Verify:
   - Static mode (no `VITE_P3FO_API_URL`): all features function as before.
   - Server mode (`VITE_P3FO_API_URL` + DB env): data persists in DB.

---

## 11. Guarantees

- Pure static deployment:
  - No backend required.
  - Uses browser JSON persistence only.
  - No configuration needed.

- Server-backed deployment:
  - When env + backend are present, app auto-switches to server mode.
  - If backend down or misconfigured, app falls back to browser JSON without crashing.

This design provides the requested dual capability with clean separation, deterministic runtime selection, and minimal impact on existing UI code.