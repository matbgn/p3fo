# Changelog

## v0.40.0 (2026-11-12)

### Features

- **planner:** add day hover card and filter sync (17c8c5f)
- **comparative tool:** add comparative vote UI (6db33b7)
- **comparative tool:** add ranking export menu (d9f0590)
- **comparative tool:** add live ranking ballot API (49dd113)
- **comparative tool:** persist and back up ranking ballots (be4f41e)
- **comparative tool:** add weighted partial-ranking vote engine (4a7aacf)

### Bug Fixes

- **common:** add dedicated all-day due time for tasks (d432ef3)
- **planner:** clear planned and due times in the UI (53fe839)

---

## v0.39.2 (2026-11-08)

---

## v0.39.1 (2026-11-07)

### Bug Fixes

- **prioritization:** gate Bradley-Terry stop rule + improve Zermelo convergence (fa51346)

---

## v0.39.0 (2026-11-07)

### Features

- **planner:** add weekly planner with recurrence (3ca0a65)

---

## v0.38.0 (2026-11-06)

### Features

- **MCP:** add task search, audit and bulk tools (345d9c5)

### Bug Fixes

- **justfile:** load IaC ansible.cfg for deploy commands (cba139b)
- **common:** prevent narrow-screen page overflow (0dcc486)
- **common:** keep rich text modal actions visible (d1a3dbe)

---

## v0.37.0 (2026-11-05)

### Features

- **sprint:** add sprint ceremony with burndown chart and auto-close (a24a225)
- **timetable:** add manual time entry creation (e2a8946)

### Bug Fixes

- **metrics:** keep workload on month rollover (06dddbb)

---

## v0.36.0 (2026-11-03)

### Features

- **timesheet:** add quick 1s time entry (853fef6)
- **timetable:** add nested subproject headers (536889e)
- **pomodoro:** add x2/x3 boost for work rounds (d0b9d90)

### Bug Fixes

- **storyboard:** sort blocked cards after ready work (02bf388)
- **common:** recover from stale chunk load errors (58e399f)
- **timetable:** align edit row with table columns (d083e30)
- **resources:** allow empty preferred working days (1ae0cd8)
- **mood spotlight:** exclude blocked cards from callout (7bb179e)

---

## v0.35.0 (2026-09-02)

### Features

- **MCP:** add task search and active filter (9170450)

### Bug Fixes

- **voting:** align results view with public vote page (018310a)
- **common:** re-prompt example data after workspace wipe (4a7dd58)

---

## v0.34.1 (2026-08-28)

### Bug Fixes

- **common:** render properly module groups to bulk-disable views and timers (b7a8b46)
- **common:** gate example data modal on full workspace scan (49c2b34)
- **layout:** keep active view mounted (817a06c)

---

## v0.34.0 (2026-08-26)

### Features

- **salary:** add employee row colors and mobile-friendly determinants (65186af)
- **salary:** add employee row reordering and level description sync (e17de1d)
- **timetable:** add project filter (2e50037)

### Bug Fixes

- **kanban:** show status select on hover in compact card sizes (b025339)
- **metrics:** correct collaborative metric computations and labels (916343c)
- **metrics:** count QoL index favorable answers with stored keys (23ebe82)
- **metrics:** anchor grid to week start and end on current day for heatmap (14f9d33)
- **salary system:** honor 13th-salary switch and derive hours/day (afc8fe9)
- **quickTimer:** hide archived tasks from running task slot (bdd630c)

---

## v0.33.1 (2026-07-25)

---
