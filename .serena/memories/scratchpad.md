# Scratchpad — i18n coverage completion

## Objective
Complete i18n coverage across all views: fertilization columns, dream columns, framework categories, circles/roles, program top resources, kanban columns, calendar, etc.

## Progress
- [x] Task 1 (i18n:fert-columns): FertilizationView column titles + fact tags translated via fertilizationColumnTitle helper + t('fertilization.column.{id}') / t('fertilization.factTag.{value}'). Commit e5828a5.
- [x] Task 2 (i18n:dream-columns): DreamView column titles translated via dreamColumnTitle helper + t('dream.column.{id}'). Same commit e5828a5.
- [ ] Task 3 (i18n:kanban-columns): KanbanBoard column headers (Backlog/Ready/WIP/Blocked/Done/Dropped/Archived) need t('kanban.status.{id}'). FR: Backlog/Prêt/En cours/Bloqué/Réalisé/Abandonné/Archivé.
- [ ] Task 4 (i18n:fw-categories): Framework category labels+descriptions (Mission, Purpose, etc.) — check if INTENTIONAL_CATEGORY_IDS/COLLABORATIVE_CATEGORY_IDS already use t() per memory mem-1784746283-85df.
- [ ] Task 5 (i18n:roles): Roles subview search box, column headers, list/user view toggle.
- [ ] Task 6 (i18n:program-resources): ProgramTop resources subview (workload, team members, dates, tasks assigned).

## Key Pattern
For stored data with English labels (column titles, category labels), use a render-time helper:
```ts
const KNOWN_IDS = ['id1', 'id2', ...];
function viewLabel(t, item) {
  return KNOWN_IDS.includes(item.id) ? t(`namespace.key.${item.id}`) : item.title;
}
```
This keeps DB rows intact while showing localized strings. Pass translated title to child components via spread: `column={{...column, title: helper(t, column)}}`.

## Notes
- Pre-existing uncommitted change in fr/translation.json thumbsUdNeutral was included in commit (aligned with i18n objective).
- Build, lint, typecheck, vitest all pass after task 1+2.