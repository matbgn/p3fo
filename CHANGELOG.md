# Changelog

## v0.8.0 (2025-12-09)

### Features

- **task modal:** add possibility to start / stop a card from the modal directly (b9c8435)
- **timetable:** implement direct start/stop button on tasks in timetable (02e32c4)
- **layout:** introduce persistance of compactness selector on user settings (fbf7d7d)
- **filters:** add auto-expansion of filters when card compactness is full in board views (9b7c0e0)
- **tasks:** allow creating tasks with an assigned user based on the current filter selection (46703f0)
- **filters:** make filters section collapsable to follow compactness (198c3ea)
- **tasks:** add detailed task edit modal (ed1b9f2)
- **task layout:** add card compactness selector (6275d19)

### Bug Fixes

- **tasks board:** sort also the dropped tasks to last position and strike them but not ticked (055f641)
- **metrics:** correct last and projected hourly balance in forecast view (aeba583)
- **focus board:** restore the sorting mechanic for tasks done which should be at the end (0fc597a)
- **focus board:** restore highlight of the current task and ensure that a newly started task becomes the new focus (ac5956c)

---

## v0.7.0 (2025-12-04)

### Features

- **timetable:** introduce 'Since X weeks' predefined date range (c8a9b06)

### Bug Fixes

- **metrics:** fix calculation on high impact tasks done (adf5575)

---

## v0.6.0 (2025-12-03)

### Features

- **settings:** reorganize time & hours settings out of goal metrics stuff (e05f782)
- **timetable:** introduce a new workspace setting to set the hours due (7e1384e)

### Bug Fixes

- add user-specific timezone setting and refactor settings persistence with scope (a0de78c)
- **timetable:** use Temporal API for consistent date string generation in time entries (b306c7a)
- **data export:** add missing attributes to export and import (a40868d)
- **timetable:** fix user selection on timetable entries for current user (e4e02ca)

---

## v0.5.0 (2025-12-01)

### Features

- **timetable:** persist data once month is done (001a80b)
- **forecast:** incorporate vacation hours into projected hours and balance calculations (8b2579b)
- **forecast:** enhance projected hours calculation with a gliding average combining current and historical pace (3dfdf9e)
- **timetable:** implement year and month selection in the forecast view (4896e55)

### Bug Fixes

- **forecast:** restore linear progression for the projected hours (c4b8af2)
- applied effective user workload settings when calculating projected hours for the current month (6774e92)

---

## v0.4.0 (2025-11-29)

### Features

- **vacations:** introduce a graph to project and report vacations usage (70368af)
- **programm view:** add default plan view setting (6c85f16)
- **user settings:** add a starting day param in settings for Mo VS Su (36a8d1a)
- **timetable:** add user assignment to time entries, integrate new date range picker, and persist user filters (44ec0e8)
- centralize user selection in MetricsPage, passing selected userId to Forecast, HourlyBalance, and QoLSurvey components (c0ec060)

### Bug Fixes

- **metrics:** correct `newCapabilitiesTime` cutoff date calculation missing seconds conversion (8902d2b)
- export all user settings and enable their import for full data restoration (4f8d653)
- team QoL survey index to be user-specific (99a26c1)

---

## v0.3.0 (2025-11-24)

### Features

- introduce monthly balance tracking graph (cdde904)

---

## v0.2.0 (2025-11-24)

### Bug Fixes

- **user join:** optimize yjs code on first log (dee9c2b)
- **task:** fix task title update (9c9827f)
- **user join:** correct username generation (7de2901)
- deletion on collaboration (44c9f22)
- username propagation in collaboration mode (451e5cc)

---

## v0.1.0 (2025-11-23)

### Features

- Introduce Docker setup for containerized deployment (ab36a42)
- permit to delete dangling users (19bb1d5)
- Add user ID migration functionality with UI to change UUID and refactor user setting updates (522c283)
- introduce user context and combined settings with user filtering capabilities for tasks (3eaa9a7)
- Implement forecasting timesheet (ccb1029)
- Implement real-time cursor collaboration using Yjs and WebSockets. (4796a4c)
- **persistence:** add hybrid browser/db storage architecture (22b0ac2)
- **tasks:** add user assignment and profile management system (4d91b3f)
- **plan view:** add task filtering and quick timer (a52e15f)
- **tasks:** automatically adjust priority when task is blocked (e090dd8)
- **status done:** automatically close parent if all sub tasks are done or dropped (9e59c56)
- **priorization:** add select all button (54e7a12)
- **filters:** make filtering persistent between views (e93186b)
- **boards:** add categories filtering (61fc70f)
- **priorization:** filter by criticity (8efebe4)
- **plan view:** add quick add task (12eb10c)
- **plan view:** implement a basic plan view with a first priorization tool (734d649)
- **reminders:** introduce the basic mechanics of reminders (035f711)
- **program:** add termination date and duration basic support (0d49024)
- **focus board:** add a comment field (a3d1956)
- **timetable:** permit to quickly edit the category from the table itself (9265082)
- **timetable:** chunk entries by half day corresponding to settings default (0db4bca)
- **timetable:** add chronological view (6b8d71e)
- **boards:** been able to filter on difficulty (9a4801c)
- **boards:** sort tasks done by timestamp (dbdf4d8)
- propagate done status to children from top tasks (f54046d)
- expand data import/export to include settings and survey responses (2c245bb)
- make program view vertically scrollable (f9e6518)
- implement basic calendar view for program scheduling (12ce189)
- search in Focus board now show any subtasks (309ffb5)
- permit to copy a whole tasks/subtasks tree (13adc4f)
- implement duplication of entire parent/child task structures (19974fa)
- filter by criticity closes #11 (09007d1)
- if task is started by timer, automatically set its status to WIP (2186028)
- extract categories to data file and sort alphabetically (cd0f4fa)

### Bug Fixes

- Implement conditional Yjs collaboration and awareness based on persistence configuration (5742a98)
- linting and relative errors (7bc7327)
- **filters:** ensure array format even if empty (17d63cf)
- **demo tasks:** do not recreate tasks when already initialized once (449f8b3)
- **user:** rendering to be consistant everywhere (c485de9)
- **user:** persistance (6a37292)
- **db storage:** stabilize sqlite using on server mode (4745930)
- **ui:** timer functionality to all boards (f1c5df6)
- **boards:** default filters on first load (15bf154)
- **priorization:** fixed reordering logic and improve UI (e5b7016)
- **filters sync:** exclude timetable from the persistance of filtering (755222b)
- **timetable:** try to fix the computation of time spent on high impact stuff (28cdfa6)
- **plan:** apply the priorization tool according to changes in 1c49b967e471279d26955d3b09c88135f8281654 (84a0caf)
- **plan:** multi stage ordering (1c49b96)
- **plan prio:** unselect tasks (a726f19)
- **timetable:** include end date into the range (9bc9b66)
- **metrics:** calculation based on definition (88b3072)
- **reminders:** persistance and duplicates (5ff5a57)
- **timetable:** edit the category from the chronological view (b2ca9b9)
- **metrics:** calculation of high impact achievement for tasks done closes #16 (3ede06b)
- typo (17fcd56)
- pass duplicateTaskStructure prop to Column component in TriageBoard (423b4f4)
- **metrics board:** include all high impact subtasks (d6df8d0)
- dropdown selector for done and dropped closes #4 and #6 (a47edd6)
- once editing subtask in the Focus Board, the focus on parent is lost instead of keeping it on the parent task inherited (5dd2c5d)
- **focus:** Retain parent task focus after subtask edit (266c504)
- dropped tasks in Focus view should be also hidden by default (fd5b108)
- auto deploy on GH pages (370a64f)

---
