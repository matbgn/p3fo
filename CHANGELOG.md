# Changelog

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

## v0.32.0 (2026-07-22)

### Features

- **i18n:** add German to voting module and translate hardcoded UI strings (9d6b772)
- **i18n:** translate individual metrics (forecast, hourly balance, vacations, QoL survey) (c707fb0)
- **i18n:** translate NextTaskSpotlight callout (mood, greeting, start working) and consistency components (e380803)
- **i18n:** translate NotificationCenter (Snooze, Mark as Read, Clear All, title, empty state) (2474a6f)
- **i18n:** translate metric cards (HighImpact, FailureRate, NewCapabilities, QLI) (e793cfd)
- **i18n:** translate PlanView toggle buttons, titles, and action buttons (ae2fcea)
- **i18n:** translate ResourcesScheduler subview (workload title, team members, today, tasks assigned, unassigned, tooltip duration/start/end) (12549ed)
- **i18n:** translate RolesTable subview (search, headers, list/user filter, involvement labels) (6a7edec)
- **i18n:** resolve framework category labels/descriptions via t() at render (dfa846a)
- **i18n:** translate KanbanBoard column headers (Backlog/Ready/WIP/Blocked/Done/Dropped/Archived) (fbeb456)
- **i18n:** translate FertilizationView and DreamView column titles + fact tags (e5828a5)
- **i18n:** translate ChronologicalView and ProgramTopView strings (4cc38b6)
- **i18n:** translate TodoStrip and CirclesView strings (b540cfa)
- **i18n:** translate TodolistView and TodolistRow strings (32293bc)
- **i18n:** translate framework views, DreamTopView navigation and labels (c1bab4a)
- **i18n:** translate DreamView board strings, timeline, and voting controls (29c3aa7)
- **i18n:** translate FertilizationView moderation, voting modes, and board options (24c9c1e)
- **i18n:** add initial multi-language support (31cea89)
- **salary system:** add projected hourly rate tab (de12e7d)
- **salary system:** edit fake employees in team simulator (b3b33cd)
- **salary system:** add team simulator panel (0888c38)
- **salary system:** add salary calculator (a8d5d59)

### Bug Fixes

- **salary system:** correct hourly rate base (7786c79)
- **mcp:** live-sync task mutations via Yjs (bfe34b4)
- **mcp:** use POST aliases for MCP task mutations (ffa9d8d)
- **consistency:** base trend on today vs prior 7-day avg (ad26ec0)

---

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
