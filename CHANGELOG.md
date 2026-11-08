# Changelog

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

## v0.33.0 (2026-07-25)

### Features

- **layout:** floating top-right overlay for size slider + exit focus button (3ab0b8d)
- **umbrella:** add a scratch search bar to the umbrella navigation (df8881c)
- **salary:** add a duplicate button on the employee table (3b295c4)
- **notifications:** click title to jump to card and localize aging/blocked messages (6300c50)
- **6 hats boards:** add card pinning to retro boards (f9e0c0f)

### Bug Fixes

- **notifications:** re-localize reminders via i18n keys at render (9c58551)
- **mood:** ask on daily load then every N hours (c0c67cd)
- **viewSwitcher:** move slider + focus button next to user icon on narrow screens (77fe887)
- **viewSwitcher:** keep user icon, notification bell and language flag visible on narrow screens (f410261)
- **userSection:** remove redundant trigram text next to avatar (9db0199)
- **layout:** size slider + focus button in normal flow, not floating (23888a2)
- **layout:** move focus toggle to floating top-right, simplify size slider (f46da91)
- **quickTimer:** two-line layout on mobile, task zone on top (1281709)
- **quickTimer:** cap task title to 24 chars and collapse traveler idle config into a popover (eae8553)
- **quickTimer:** always show technique zone when a technique is enabled (f25a5d9)
- **quickTimer:** keep running task title, elapsed time and pause button visible while a pomodoro or traveler session is active (e41c7f1)
- **time picker:** add a11y title to time picker dialog (a8e0e9e)
- **auth:** reload on 401 to refresh proxy session (f677dc4)
- **i18n:** respect base url for locale loading (c97c43c)

---
