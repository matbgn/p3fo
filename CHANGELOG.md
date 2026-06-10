# Changelog

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

## v0.23.0 (2026-05-26)

### Features

- **common:** add focus mode to program view and align dual-view rendering (09ba014)

### Bug Fixes

- **kanban board:** correct dnd for touch devices (dda864f)

---

## v0.22.0 (2026-05-26)

### Features

- **common:** add module mgmt to unmount unused modules (sub-views) from the UI (728e7e8)
- **storyboard:** add compact post-it storyboard cards with hover expand (4e16313)
- **common:** add focus mode across celebration, dream and plan views and boards (24e768c)
- **common:** add umbrella navigation overlay (4906dbd)
- **user profile:** add inline trigram editing to profile (b1196de)
- **common:** add drag & drop to calendar and improve the one from boards (4f0d937)
- **common:** add tag editing to fact fertilization cards (9714dd4)
- **common:** add fact tags to fertilization cards (afb0f1a)
- **common:** add custom mj labels and fix scoring (055fb28)
- **common:** add per-column voting controls (1271c4f)
- **common:** add reorder votes by column option (f0c902c)
- **common:** add vote reset and improve revealed votes (d96cf2c)

### Bug Fixes

- **circles:** add touch support for mobile and fix double-click (02613b9)
- **voting:** start MJ voting phase and reorder scale (c01cde4)
- **common:** revise vote badge color and fill (2382334)
- **common:** persist vote labels and points on boards (ebf08d0)
- **common:** deduplicate links and soften line style (21700b2)

---

## v0.21.1 (2026-05-22)

### Bug Fixes

- **import:** sync imported tasks, boards, and circles to Yjs for cross-client collaboration (6d406b3)
- **common:** all boards clearance bis (535c108)
- **common:** all boards clearance (d41656b)
- **import/export:** add dream board and circle migration (d2e5c7a)

---

## v0.21.0 (2026-04-27)

### Features

- **circles:** add BlockNote rich text editing with collaborative capa for roles edition (2ffd91b)

---

## v0.20.0 (2026-04-26)

### Features

- **plan:** add roles table with user assignments view (c6bbb49)

### Bug Fixes

- **DBs:** fix databases connectors for sqllite & postgres (dbc6051)

---

## v0.19.0 (2026-04-22)

### Features

- **circles:** add user assignments to roles (824fa4e)

### Bug Fixes

- **common:** browser-only mode and canvas events in plan view (983b556)
- **projectedHours:** adapt expectation-normalized projection for vacation deductions and work day capping (c420393)

---

## v0.18.0 (2026-04-18)

### Features

- **common:** implement card aging with visual feedback (877483e)

---

## v0.17.2 (2026-04-08)

### Bug Fixes

- **metrics:** compute metrics per EFT instead of per user pool (739435f)
- **tests:** syntax (a9da54a)
- **common:** use selected user settings in projections (2ffa708)
- **kanban:** only count leaf tasks in total difficulty calculations (a78544e)

---
