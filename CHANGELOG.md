# Changelog

## v0.31.0 (2026-07-17)

### Features

- **common:** add executive-function tooling (9867a45)
- **comparative tool:** add early finalize and convergence (e08281a)
- **auth:** add shared API key for MCP access behind oauth2-proxy (8caaa2a)

### Bug Fixes

- **common:** add focus mode to timetable and metrics pages (283828d)
- **focus board:** add focus mode UI to task board (7554cfe)
- **data storage:** add wip limit and non-action period settings (87f7b50)
- **tasks:** correct timer transfer and parent sync (8f6d434)
- **tasks:** inherit parent metadata in subtasks (c9bc394)
- **boards:** align kanban hover delay with storyboard (2b38d72)

---

## v0.30.0 (2026-06-25)

### Features

- **devtools:** add MCP server wrapping P3Fo REST API (02b7bff)

---

## v0.29.0 (2026-06-25)

### Features

- **comparative tool:** add Plackett-Luce + InfoGain ranking engine (6067496)
- **comparative tool:** add diff-based batch task import with similarity matching (fa8fd9b)

### Bug Fixes

- **tasks:** keep card controls mounted while dropdown open (3bebbce)

---

## v0.28.1 (2026-06-23)

### Bug Fixes

- **boards:** persist Yjs-synced BlockNote content to DB snapshot (4afff10)

---

## v0.28.0 (2026-06-23)

### Features

- **traveler:** add Lisbon and Porto airport locations (a9fd84b)

### Bug Fixes

- **focus sessions:** add pomodoro/focus sessions import/export (0aefb8e)
- **voting tool:** add vote responses/moderators import endpoints and toast feedback (819b58a)
- **focus sessions:** support configurable week start day in pomodoro heatmap (b657b89)

---

## v0.27.1 (2026-06-15)

### Bug Fixes

- address reported bugs and style issues across boards (57b6429)

---

## v0.27.0 (2026-06-14)

### Features

- **boards:** add offline voters and per-board JSON import/export (3a20377)

---

## v0.26.0 (2026-06-13)

### Features

- **pomodoro:** add traveler timer mode alongside pomodoro (fb8cfed)
- **pomodoro:** add pomodoro technique integration (31a3fbb)

### Bug Fixes

- **pomodoro:** distinguish traveler from pomodoro sessions and improve robustness (2bf4b48)
- **pomodoro:** fix config defaults and deduplicate chime logic (97677c4)

---

## v0.25.1 (2026-06-10)

### Bug Fixes

- **voting tool:** display rich text content of proposal's to public view (2971f16)

---

## v0.25.0 (2026-06-03)

### Features

- **voting tool:** add submit-all-votes flow for multi-proposal voting when single vote is expected (34bd46d)
- **voting:** real-time updates via Yjs for vote proposals, loops, and responses (0084565)
- **voting:** restore per-proposal diff dialog, add pre-round editor, disable editing during active round (d06af2c)
- **voting:** Redesign CONSENT_LOOP as per-proposal loops (5f128a8)
- **voting:** offer a reset votes option (339f288)
- **voting:** Phase 10+11 — unit tests + i18n (EN/FR) (a8ecce6)
- **voting:** add Vitest unit tests for vote-tally.ts (32cd9ff)
- **voting:** add vote data to global export/import (Phase 9) (0251cba)
- **voting:** Phase 7 — TaskCard-to-Vote linking (e8802b0)
- **voting:** Phase 5-6 — CONSENT_LOOP mode + multi-moderator & moderation pop-out (4b403e7)
- **voting:** extract shared tally functions into src/lib/vote-tally.ts (8f34c71)
- **voting:** add PublicVotePage with /v/:slug routes for anonymous voting (9f01a5d)
- **voting:** Phase 2 — BlockNote proposals & manager UI components (dd102cd)
- **voting:** add data model, DB schema, REST routes, adapters, and hooks (391cdd0)
- **dream phase:** add intentional and collaborative frameworks (bd581e7)

### Bug Fixes

- **voting tool:** replace datetime-local inputs with shared calendar picker (fddf82b)
- **voting tool:** keep vote UI visible and disabled after voting when changes not allowed (3d9b2ee)
- **voting tool:** ensure moderator get a fresh modal settings view (6f7e200)
- **voting tool:** prevent showing results to public when toggle is not activated (2b4ab10)
- **voting tool:** render live per-proposal results overview in consent loop (85236b2)
- **voting tool:** permit mulitple proposals opening vote at once (d62144d)
- **voting tool:** offer ability for the moderator to edit consent loop proposition before next round (3d884d2)
- CONSENT_LOOP draft persistence and build errors (6cc0675)
- resolve lint errors in PublicVotePage and BlockNoteProposalEditor (acccb5c)
- **voting:** remove stale i18n keys and fix duplicate withdraw key (6ae469a)
- **voting tool:** make consent loop mode kind of work (7e48e7c)
- **voting tool:** fix do not show result before close in MJ (4d746d8)
- **voting tool:** fix points vote with caping option (2fba169)
- **voting tool:** fix thumbs up single VS multiple choice vote (9102d8c)
- **voting:** correct modal opening (3a21565)
- **voting:** fix TS build errors in CreateLinkedVoteDialog and useVoteModerators (9230cc8)
- **dream phase:** import missing yFrameworks (f07bb4d)

---

## v0.24.0 (2026-05-27)

### Features

- **focus board:** add todolist view to task board (35cff1b)

### Bug Fixes

- **prioritization:** add sprint target filter (5587aa1)
- **ressources view:** fix scrolling down on mobile (5cd895b)
- **calendar view:** fix scrolling down on mobile (610c8f9)
- **focus view:** ensure all children are deployed on expand all (3a0b4f2)
- **task cards:** ensure dropdowns are still accessible on ultra compact mode (b67b542)

---
