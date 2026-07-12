---
name: p3fo-mcp
description: Drive P3FO (Plan/Program/Project/Focus) via the p3fo MCP server. Trigger when the user mentions P3FO, tasks, triage, votes, circles, frameworks, reminders, pomodoro sessions, fertilization board, dream board, QoL survey, or asks to manage productivity data through the P3FO REST API. Works with both local dev and remote deployments behind oauth2-proxy.
---

# P3FO MCP

Drive P3FO (Plan/Program/Project/Focus) via the `p3fo` MCP server (`mcp-server/`, TypeScript, stdio transport). The server wraps the P3FO Express REST API and exposes one tool per endpoint, scoped to: tasks, users & settings, app settings, QoL survey, filters, fertilization/dream boards, circles, frameworks, votes, reminders, and pomodoro sessions.

## Setup

### 1. Build the MCP server

```bash
# from the P3FO repo root
npx tsc -p mcp-server/tsconfig.json
```

This produces `mcp-server/dist/index.js` — the stdio entry point your MCP client will spawn.

### 2. Configure your MCP client

Add the `p3fo` server to your MCP client config. The exact file depends on your LLM tool:

| Tool | Config file |
|------|-------------|
| Kilo | `.kilo/kilo.jsonc` (project) or `~/.config/kilo/kilo.jsonc` (global) |
| Claude Code | `.claude/settings.json` or `~/.claude.json` |
| Cursor | `.cursor/mcp.json` |
| VS Code (Copilot) | `.vscode/mcp.json` |
| Generic MCP | Whatever your client uses for stdio MCP servers |

#### Local development (no auth)

```jsonc
{
  "mcp": {
    "p3fo": {
      "type": "local",
      "command": ["node", "/absolute/path/to/p3fo/mcp-server/dist/index.js"],
      "environment": {
        "P3FO_API_URL": "http://localhost:5172"
      },
      "enabled": true
    }
  }
}
```

#### Remote deployment (behind oauth2-proxy)

If your P3FO instance is deployed behind an oauth2-proxy with the `/mcp` API-key bypass configured:

```jsonc
{
  "mcp": {
    "p3fo": {
      "type": "local",
      "command": ["node", "/absolute/path/to/p3fo/mcp-server/dist/index.js"],
      "environment": {
        "P3FO_API_URL": "https://your-p3fo-host.example.com/mcp",
        "P3FO_API_KEY": "your-shared-api-key"
      },
      "enabled": true
    }
  }
}
```

### 3. Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `P3FO_API_URL` | Yes | `http://localhost:5172` | Base URL of a running P3FO backend. Use the `/mcp` prefix for remote deployments behind oauth2-proxy. |
| `P3FO_API_KEY` | Remote only | — | Shared API key sent as `X-API-Key` header. Must match the server's `P3FO_API_KEY` env. Generate with `openssl rand -hex 32`. |
| `P3FO_API_TOKEN` | No | — | Optional Bearer token (backward compat; also accepted by the server's API key middleware). |

### 4. Server-side requirements (remote only)

If you're connecting to a remote P3FO deployment, the server must be configured with:

```env
# P3FO server env
P3FO_API_KEY=<same-key-as-your-mcp-client>

# oauth2-proxy env
OAUTH2_PROXY_SKIP_AUTH_ROUTES=^/mcp/
```

The `/mcp` path prefix bypasses OIDC cookie auth in oauth2-proxy and is protected by the API key instead. The P3FO server strips `/mcp` and routes to the existing `/api/*` handlers. When `P3FO_API_KEY` is not set server-side, the middleware is a no-op (local dev mode).

### 5. Reload your client

Tools only appear in a session started **after** the server is registered. Start a new chat — reload does not re-inject tools into a running agent.

## CRITICAL: the `params` wrapper

Every tool that takes arguments wraps them under a single top-level **`params`** object. Tools with no args (`p3fo_health`, `p3fo_clear_tasks`, `p3fo_list_users`, etc.) take an empty object.

Call shape:

```
p3fo_list_tasks({ "params": { "userId": "u-123", "limit": 50 } })
```

NOT:

```
p3fo_list_tasks({ "userId": "u-123" })   // WRONG — will fail
```

## CRITICAL: call MCP tools directly, never delegate

**Never** use a subagent/task tool to read or search MCP tool output. MCP tools are available directly in your session — call them inline. If a tool returns a large/truncated payload, **do not** spawn an agent to grep the output file. Instead:

1. Re-call the tool with a tighter `limit` or a status/category filter to reduce the payload, OR
2. Use `p3fo_get_task` with a specific `id` if you know it, OR
3. Use `p3fo_list_tasks` with `triageStatuses` / `excludeStatuses` / `userId` to narrow the result set.

Delegating to a subagent to search truncated MCP output wastes a round-trip and context. The MCP server is the source of truth — filter at the source, not downstream.

## Output format

All tools return JSON (pretty-printed) as a single `text` content block. Errors return `isError: true` with the P3FO API status and message. There is no markdown/json toggle — parse the JSON text client-side when you need to count or filter.

## Tool reference

### System

- **`p3fo_health`** — no args. `{ ok, mode, timestamp }`. Use to verify the backend is reachable.
- **`p3fo_clear_all_data`** — no args. Destructive: wipes all P3FO data. Gate with `ask`/`deny`.

### Tasks

- **`p3fo_list_tasks`** — `params`: `userId?`, `limit?`, `offset?`, `excludeStatuses?` (string[]), `triageStatuses?` (string[]), `includeSubtasks?` (boolean, default `false` in the MCP tool to save context). Returns `{ data, total }`.
- **`p3fo_get_task`** — `params`: `id`.
- **`p3fo_create_task`** — `params`: `task` (TaskEntity fields, e.g. `title`, `triageStatus`, `urgent`, `impact`, `difficulty`, `category`, `userId`, `parentId`).
- **`p3fo_update_task`** — `params`: `id`, `patch` (partial TaskEntity).
- **`p3fo_delete_task`** — `params`: `id`.
- **`p3fo_bulk_update_priorities`** — `params`: `items` (`{ id, priority? }[]`).
- **`p3fo_import_tasks`** — `params`: `tasks` (TaskEntity[]).
- **`p3fo_clear_tasks`** — no args.

`TriageStatus` ∈ `Backlog | Ready | WIP | Blocked | Done | Dropped`. `Category` ∈ Marketing, Documentation, Consulting, Testing, Funerals, Negotiated overtime, Sickness, Finances, HR, Training, Support, UX/UI, Admin, Development, System Operations, Private.

#### Filtering by triage status — IMPORTANT

`triageStatuses` is an **include** filter (SQL `IN (...)`), `excludeStatuses` is an **exclude** filter (SQL `NOT IN (...)`). They compose with AND. Example — only WIP tasks:

```
p3fo_list_tasks({ "params": { "triageStatuses": ["WIP"] } })
```

Everything except Archived and Backlog:

```
p3fo_list_tasks({ "params": { "excludeStatuses": ["Archived", "Backlog"] } })
```

**Known limitation / verification gotcha:** The MCP server binary correctly serializes these to `triage_statuses=WIP` in the HTTP query string (verified via stdio + netcat inspection). However, some MCP clients may drop or ignore nested array values inside the `params` wrapper, causing the tool to return unfiltered results. If a `p3fo_list_tasks` call returns far more items than expected, **do NOT assume the filter is broken server-side** — verify by calling the REST API directly:

```bash
curl -s "https://your-p3fo-host.example.com/mcp/api/tasks?triage_statuses=WIP&limit=5" \
  -H "X-API-Key: <key>" | python3 -c "import sys,json; d=json.load(sys.stdin); print('total:', d['total'])"
```

If curl returns the correct filtered `total` but the MCP tool does not, the issue is in the MCP client argument passing, not the server or API. Prefer filtering post-hoc on the returned `data` array in that case, or fix the tool schema to flatten the `params` wrapper.

### Users & user settings

- **`p3fo_list_users`** — no args. Returns UserSettingsEntity[].
- **`p3fo_get_user_settings`** — `params`: `userId`.
- **`p3fo_update_user_settings`** — `params`: `userId`, `patch` (partial: `username`, `logo`, `workload`, `monthlyBalances`, `timezone`, `weekStartDay`, …).
- **`p3fo_migrate_user`** — `params`: `oldUserId`, `newUserId`.
- **`p3fo_delete_user`** — `params`: `userId`.
- **`p3fo_clear_users`** — no args.

### App settings

- **`p3fo_get_app_settings`** — no args.
- **`p3fo_update_app_settings`** — `params`: `patch` (partial: `splitTime`, `userWorkloadPercentage`, `weeksComputation`, `highImpactTaskGoal`, `failureRateGoal`, `qliGoal`, `disabledModules`, …).

### QoL survey

- **`p3fo_list_qol_responses`** — no args. `{ [userId]: response }`.
- **`p3fo_get_qol_response`** — `params`: `userId`.
- **`p3fo_save_qol_response`** — `params`: `userId`, `data`.

### Filters

- **`p3fo_get_filters`** / **`p3fo_save_filters`** (`params`: `data`) / **`p3fo_clear_filters`**.

### Fertilization & Dream boards

- **`p3fo_get_fertilization_board`** / **`p3fo_update_fertilization_board`** (`params`: `state`).
- **`p3fo_get_dream_board`** / **`p3fo_update_dream_board`** (`params`: `state`).

### Circles (EasyCIRCLE)

- **`p3fo_list_circles`** — no args.
- **`p3fo_get_circle`** — `params`: `id`.
- **`p3fo_create_circle`** — `params`: `circle` (`name`, `parentId`, `nodeType` ∈ organization|circle|group|role, `purpose`, `missions`, `authorityScope`, `assignments`).
- **`p3fo_update_circle`** — `params`: `id`, `patch`.
- **`p3fo_delete_circle`** — `params`: `id`.
- **`p3fo_clear_circles`** — no args.
- **`p3fo_import_circles`** — `params`: `circles`.

### Frameworks

- **`p3fo_list_frameworks`** — `params?`: `frameworkType` (intentional|collaborative).
- **`p3fo_get_framework`** / **`p3fo_create_framework`** (`params`: `framework`) / **`p3fo_update_framework`** (`params`: `id`, `patch`) / **`p3fo_delete_framework`** (`params`: `id`).
- **`p3fo_import_frameworks`** — `params`: `frameworks`.

### Votes (governance)

- **`p3fo_list_votes`** — `params?`: `linkedTaskId`, `ownerId`, `kind` (consultation|decision).
- **`p3fo_get_vote`** — `params`: `idOrSlug`.
- **`p3fo_create_vote`** — `params`: `vote` (`title`, `slug`, `proposals`, `config` { `mode`, `kind`, `phase`, … }).
- **`p3fo_update_vote`** — `params`: `id`, `patch`.
- **`p3fo_finalize_vote`** — `params`: `id`, `outcome` (`winningProposalId`, `summary`, …). Only `kind: "decision"`.
- **`p3fo_delete_vote`** / **`p3fo_reset_vote`** — `params`: `id`.
- **`p3fo_get_vote_results`** — `params`: `idOrSlug`. Returns `{ vote, responses, totalVotes }` (responses anonymized if `config.isAnonymous`).
- **`p3fo_submit_vote_response`** — `params`: `idOrSlug`, `response` (`value`, `voterToken`, `proposalId?`). Vote must be `OPEN`. Value validation by mode: THUMBS_UP=1; THUMBS_UD_NEUTRAL∈{-1,0,1}; POINTS∈[0,maxPointsPerUser]; MAJORITY_JUDGMENT/CONSENT_LOOP∈[-1,5].
- **`p3fo_withdraw_vote_response`** — `params`: `idOrSlug`, `voterToken`, `proposalId?`, `loopId?`.
- **`p3fo_list_vote_loops`** / **`p3fo_create_vote_loop`** (`params`: `voteId`, `loop`) — CONSENT_LOOP.
- **`p3fo_close_vote_loop`** / **`p3fo_update_vote_loop`** — `params`: `loopId` (+`patch`).
- **`p3fo_list_vote_moderators`** / **`p3fo_add_vote_moderator`** (`params`: `voteId`, `input`) / **`p3fo_revoke_vote_moderator`** (`params`: `voteId`, `moderatorId`).
- **`p3fo_resolve_vote_moderator_token`** — `params`: `token`.
- **`p3fo_import_votes`** — `params`: `items`.

### Reminders

- **`p3fo_list_reminders`** — `params?`: `userId`.
- **`p3fo_get_reminder`** — `params`: `id`.
- **`p3fo_create_reminder`** — `params`: `reminder` (`userId`, `title`, `triggerDate?`, `persistent`, `state`, …).
- **`p3fo_update_reminder`** — `params`: `id`, `patch`.
- **`p3fo_delete_reminder`** — `params`: `id`.
- **`p3fo_delete_reminders_by_task`** — `params`: `taskId`.
- **`p3fo_clear_reminders`** — no args.
- **`p3fo_import_reminders`** — `params`: `reminders`.

### Pomodoro sessions

- **`p3fo_list_pomodoro_sessions`** — `params?`: `userId`, `since` (epoch ms).
- **`p3fo_create_pomodoro_session`** — `params`: `session` (`id`, `userId`, `startTime`, `endTime`, `phase`, `duration`, `completed`, `kind?`).
- **`p3fo_delete_pomodoro_session`** — `params`: `id`.
- **`p3fo_clear_pomodoro_sessions`** — no args.
- **`p3fo_delete_pomodoro_sessions_by_user`** — `params`: `userId`.
- **`p3fo_import_pomodoro_sessions`** — `params`: `sessions`.

## Common workflows

### List a user's active tasks

```
p3fo_list_tasks({ "params": { "userId": "u-123", "excludeStatuses": ["Done", "Dropped"] } })
```

### Triage: move a task to WIP and set priority

```
p3fo_update_task({ "params": { "id": "t-456", "patch": { "triageStatus": "WIP", "priority": 3 } } })
```

### Inspect the fertilization board

```
p3fo_get_fertilization_board({})
```

### Run a decision vote end-to-end

1. `p3fo_create_vote({ "params": { "vote": { "title": "...", "slug": "...", "config": { "mode": "MAJORITY_JUDGMENT", "kind": "decision", "phase": "OPEN" }, "proposals": [...] } } })`
2. Collect responses: `p3fo_get_vote_results({ "params": { "idOrSlug": "<slug>" } })`
3. `p3fo_finalize_vote({ "params": { "id": "<id>", "outcome": { "winningProposalId": "...", "summary": "...", "finalizedAt": "<iso>", "finalizedByUserId": "..." } } })`

### Verify the connection

```
p3fo_health({})   // { ok: true, mode: "sqlite", timestamp: "..." }
```

## Troubleshooting

- **No `p3fo_*` tools available** → server not registered at session start, or not built. Run `npx tsc -p mcp-server/tsconfig.json` and **start a new chat**.
- **`P3FO API error 500` / fetch failed** → backend not running or wrong `P3FO_API_URL`. Confirm with `p3fo_health`.
- **`P3FO API error 401: Unauthorized: invalid or missing API key`** → remote deployment requires `P3FO_API_KEY`; set it to match the server's `P3FO_API_KEY` env.
- **`P3FO API error 302: Redirected to ...`** → the MCP client hit oauth2-proxy's login redirect. You're likely using the wrong URL (missing `/mcp` prefix) or `OAUTH2_PROXY_SKIP_AUTH_ROUTES` isn't set. Use `P3FO_API_URL` with the `/mcp` suffix.
- **`Missing required argument` / `Unexpected keyword argument`** → you forgot the `params` wrapper. Wrap all args under `params`.
- **`p3fo_list_tasks` ignores `triageStatuses`/`excludeStatuses`/`limit`** → the MCP server sends the correct query string (verified via stdio+netcat), but some MCP clients drop nested array params. Verify with curl against `/mcp/api/tasks?triage_statuses=WIP` — if curl works but the tool doesn't, the issue is client-side argument passing. See "Filtering by triage status" above.
- **404 on a vote** → `p3fo_get_vote` accepts id OR slug; both are tried server-side. Confirm the value.
- **Vote response rejected (400)** → vote not `OPEN`, or `value` out of range for the vote's `mode`. See value rules above.

## Security notes

- `p3fo_clear_all_data`, `p3fo_clear_tasks/users/circles/reminders/pomodoro_sessions`, `p3fo_delete_*` are destructive — gate behind `ask`/`deny` in your MCP client's permission settings.
- If `P3FO_API_KEY` is set, keep it out of version control (env block or git-ignored `.env`).
- Vote responses are anonymized server-side only when `config.isAnonymous` is true; otherwise `userId` is returned in results.

## Development

```bash
# from the P3FO repo root
npx tsc -p mcp-server/tsconfig.json          # build
node mcp-server/dist/index.js                # run (needs P3FO backend up)
P3FO_API_URL=http://localhost:5172 node mcp-server/dist/index.js
```

Sources: `mcp-server/src/client.ts` (REST wrapper), `mcp-server/src/tools.ts` (tool registry), `mcp-server/src/index.ts` (stdio entry), `server/index.ts` (REST API being wrapped).