# Changelog

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

## v0.16.0 (2026-03-14)

### Features

- **persistence:** add bulk import/export for circles and reminders (dc8ba00)
- **metrics:** use preferred days for pace projection (f8fd4e4)
- **users:** add inline trigram editing UI (37fd1a2)

### Bug Fixes

- **filters:** prevent race condition clobbering persisted filters on views reload (04d3e9a)
- **reminders:** add HTTP persistence adapter CRUD operations (970b511)

---

## v0.15.0 (2026-02-14)

### Features

- **tasks:** add Sprint Target togglable label with filtering (f6b1a4d)
- **users:** persist trigrams in user settings for stability (5ba57c7)
- **users:** add standardized trigram identification system (c51cbcd)
- **ressources:** add resource scheduler with preferred working days (40df2a3)
- **board:** add focus mode and toggle off functionality in task board (da44e9b)

### Bug Fixes

- **reminders:** correct reminder system severall way (f37b657)
- **dreamview:** create task and highlight it in storyboard upon dream card promotion (55eda27)
- **storyboard:** filter archived tasks and add attribute badges (4058e71)
- **settings:** support capacity-based preferred working days (84be9c9)
- **users:** use generateTrigram for fallback display initial (afa09c5)
- **user:** change UUID switch to discard current workspace (954ab82)
- **forecast:** make hourly balance badge thresholds related (3896851)
- **settings:** add weekStartDay and defaultPlanView user preferences (d81e18c)
- **circles:** make deletion more reliable by using shadcn modal (7c659a0)
- **circles:** enhance circles editor with node type handling and UI improvements (65ccea7)

---

## v0.14.0 (2026-02-04)

### Features

- **circles:** add description fields and real-time collaboration (abf100e)
- **circles:** add smooth zoom animation and fix resize skewing (9de10d5)
- **circles:** add basic circles editor visualization with D3.js (9fc1d9d)
- **views:** add Celebration and Dream as top-level views (0e6fa25)

### Bug Fixes

- **circles:** resolve canvas interaction and color mapping issues (aee838d)

---

## v0.13.0 (2026-02-03)

### Features

- **kanban board:** add difficulty points badge and bulk archive functionality (622a0c1)

### Bug Fixes

- **import/export:** add allTasks state and improve SQLite import/export reliability (688c530)
- **kanban:** handle invalid triageStatus values gracefully (180fd3d)
- prevent default tasks recreation after clearing all data (882f054)

---

## v0.12.2 (2026-02-01)

### Bug Fixes

- **lint:** replace any types with proper interfaces in App.tsx and DataImporter.tsx (b4b995b)
- **lint:** replace any types with specific interfaces in sqlite.ts (67125d9)
- **lint:** replace any types with specific union types in postgres.ts (e55e3dd)
- sync imported user settings to Yjs to prevent cache overwrite (7ae7cb2)

---

## v0.12.1 (2026-01-30)

---

## v0.12.0 (2026-01-25)

### Features

- **board:** add Dream Board with time frames and voting system (a308862)
- **fertilization:** add confirmation dialog and visual linking with auto-navigation (7201b6b)
- **fertilization:** add card linking, promote-to-backlog, and sort-by-votes (57bad5f)

### Bug Fixes

- **import:** merge user settings and optimize export (aac0032)

---
