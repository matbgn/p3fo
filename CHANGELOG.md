# Changelog

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

## v0.17.1 (2026-03-18)

### Bug Fixes

- **ressources plan:** handle empty inputs on preferred days (0ed0cd2)
- **timetable:** make overlap arcs reactive to filter and view changes (0a34c54)
- **running timer:** only stop timers belonging to current user (535889c)
- **running timer:** filter timer stops by current user only (3cb47ef)

---

## v0.17.0 (2026-03-14)

### Features

- **timetable:** add overlapping time entry detection (991dd8e)
- **time-picker-dialog:** add keyboard input for direct time entry (cb2d48c)
- **running timer:** centralize QuickTimer with user-specific filtering and resume (873304b)

### Bug Fixes

- **running timer:** stop and persist other running timers on toggle (79a7915)

---
