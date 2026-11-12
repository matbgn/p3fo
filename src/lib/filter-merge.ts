import type { Filters } from '@/components/FilterControls'
import type { TriageStatus, Category, Task } from '@/hooks/useTasks'

export type ViewFilterOverrides = {
  excludeStatuses?: TriageStatus[]
  includeAllStatuses?: boolean
  defaultActiveStatuses?: boolean
  forceSelectedUserId?: string | null
}

const VALID_STATUSES: TriageStatus[] = [
  'Backlog',
  'Ready',
  'WIP',
  'Blocked',
  'Done',
  'Dropped',
  'Archived'
]

export function getDefaultFilters(): Filters {
  return {
    showUrgent: false,
    showImpact: false,
    showMajorIncident: false,
    showSprintTarget: false,
    status: [],
    showDone: false,
    searchText: '',
    difficulty: [],
    category: [],
    selectedUserId: null,
    projectIds: []
  }
}

export function mergeViewFilters(
  storedFilters: Filters | null,
  overrides: ViewFilterOverrides
): Filters {
  if (!storedFilters) {
    return getDefaultFilters()
  }

  const result: Filters = { ...storedFilters }

  if (overrides.forceSelectedUserId !== undefined) {
    result.selectedUserId = overrides.forceSelectedUserId
  }

  if (overrides.excludeStatuses && result.status) {
    result.status = result.status.filter(
      (s) => !overrides.excludeStatuses!.includes(s)
    )
  }

  if (overrides.includeAllStatuses) {
    // When includeAllStatuses is set, we don't modify the status array at all
    // This is used by Timetable view which shows all statuses including Done/Dropped
  } else if (overrides.defaultActiveStatuses) {
    // When defaultActiveStatuses is set and status array is empty, default to active statuses
    // This is used by DreamTopView/storyboard which shows only active tasks
    if (result.status.length === 0) {
      result.status = ['Backlog', 'Ready', 'WIP', 'Blocked']
    }
  }

  return result
}

export type TaskFilterMatchOptions = {
  searchComments?: boolean
}

export function taskMatchesFilters(
  task: Task,
  filters: Filters,
  options: TaskFilterMatchOptions = {}
): boolean {
  if (filters.searchText?.trim()) {
    const searchText = filters.searchText.toLowerCase()
    const matchesTitle = task.title.toLowerCase().includes(searchText)
    const matchesComment =
      options.searchComments && Boolean(task.comment?.toLowerCase().includes(searchText))
    if (!matchesTitle && !matchesComment) return false
  }

  if (filters.showUrgent && !task.urgent) return false
  if (filters.showImpact && !task.impact) return false
  if (filters.showMajorIncident && !task.majorIncident) return false
  if (filters.showSprintTarget && !task.sprintTarget) return false

  if (
    filters.difficulty &&
    filters.difficulty.length > 0 &&
    !filters.difficulty.includes(task.difficulty)
  ) {
    return false
  }

  if (
    filters.category &&
    filters.category.length > 0 &&
    task.category &&
    !filters.category.includes(task.category)
  ) {
    return false
  }

  if (
    filters.status &&
    filters.status.length > 0 &&
    !filters.status.includes(task.triageStatus)
  ) {
    return false
  }

  if (filters.selectedUserId) {
    if (filters.selectedUserId === 'UNASSIGNED') {
      if (task.userId && task.userId !== 'unassigned') return false
    } else if (task.userId !== filters.selectedUserId) {
      return false
    }
  }

  return true
}

export function validateFilters(stored: unknown): Filters {
  if (!stored || typeof stored !== 'object') {
    return getDefaultFilters()
  }

  const filters = stored as Record<string, unknown>
  const defaults = getDefaultFilters()

  const validated: Filters = {
    showUrgent:
      typeof filters.showUrgent === 'boolean' ? filters.showUrgent : defaults.showUrgent,
    showImpact:
      typeof filters.showImpact === 'boolean' ? filters.showImpact : defaults.showImpact,
    showMajorIncident:
      typeof filters.showMajorIncident === 'boolean'
        ? filters.showMajorIncident
        : defaults.showMajorIncident,
    showSprintTarget:
      typeof filters.showSprintTarget === 'boolean'
        ? filters.showSprintTarget
        : defaults.showSprintTarget,
    status: Array.isArray(filters.status)
      ? filters.status.filter((s) => VALID_STATUSES.includes(s)) as TriageStatus[]
      : defaults.status,
    showDone:
      typeof filters.showDone === 'boolean' ? filters.showDone : defaults.showDone,
    searchText:
      typeof filters.searchText === 'string' ? filters.searchText : defaults.searchText,
    difficulty: Array.isArray(filters.difficulty)
      ? filters.difficulty.filter((d) => typeof d === 'number')
      : defaults.difficulty,
    category: Array.isArray(filters.category)
      ? filters.category.filter((c) => typeof c === 'string') as Category[]
      : defaults.category,
    selectedUserId:
      filters.selectedUserId === null || filters.selectedUserId === undefined || typeof filters.selectedUserId === 'string'
        ? (filters.selectedUserId ?? null) as string | null
        : defaults.selectedUserId,
    projectIds: Array.isArray(filters.projectIds)
      ? filters.projectIds.filter((p) => typeof p === 'string')
      : defaults.projectIds
  }

  return validated
}