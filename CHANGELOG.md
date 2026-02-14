# Changelog

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

## v0.11.0 (2026-01-06)

### Features

- **fertilization:** add 3 additional ways to vote (Up/Down/Neutral, with points, Majority Judgment) (e5aa268)

---

## v0.10.2 (2025-12-11)

### Bug Fixes

- **metrics:** adapt badge color in Forecast accordingly to totalProjectedBalance (8227943)

---

## v0.10.1 (2025-12-10)

### Bug Fixes

- **layout:** persist card compactness user preference on server deployments (452699b)

---

## v0.10.0 (2025-12-10)

### Features

- **fertilization:** permit column renaming (bcdf0bb)
- **fertilization:** add filters (3ada959)
- **fertilization:** permit anonymous contributions (c14e29e)
- **fertilization:** add become moderator button (b125451)
- **fertilization:** WIP start implementing new fertilization tool (704049a)

### Bug Fixes

- **fertilization:** restore import / export integrity (d3d797f)
- **fertilization:** make it live collaborative (04467c1)
- **tasks board:** do not show done/dropped by default (ac8272c)

---

## v0.9.0 (2025-12-09)

### Features

- **task modal:** add possibility to start / stop a card from the modal directly (b9c8435)
- **timetable:** implement direct start/stop button on tasks in timetable (02e32c4)
- **layout:** introduce persistance of compactness selector on user settings (fbf7d7d)

### Bug Fixes

- **tasks board:** sort also the dropped tasks to last position and strike them but not ticked (055f641)
- **metrics:** correct last and projected hourly balance in forecast view (aeba583)
- **focus board:** restore the sorting mechanic for tasks done which should be at the end (0fc597a)
- **focus board:** restore highlight of the current task and ensure that a newly started task becomes the new focus (ac5956c)

---
