# Changelog

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

## v0.8.0 (2025-12-05)

### Features

- **filters:** add auto-expansion of filters when card compactness is full in board views (9b7c0e0)
- **tasks:** allow creating tasks with an assigned user based on the current filter selection (46703f0)
- **filters:** make filters section collapsable to follow compactness (198c3ea)
- **tasks:** add detailed task edit modal (ed1b9f2)
- **task layout:** add card compactness selector (6275d19)

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
