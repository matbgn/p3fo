import { useCombinedSettings } from './useCombinedSettings'
import type { Task } from './useTasks'

export interface UseCardAgingResult {
  level: 0 | 1 | 2 | 3
  className: string
}

const TERMINAL_STATUSES = new Set(['Done', 'Dropped', 'Archived'])
const MS_PER_DAY = 1000 * 60 * 60 * 24

export function useCardAging(task: Task): UseCardAgingResult {
  const { settings } = useCombinedSettings()
  const baseDays = settings.cardAgingBaseDays

  if (!baseDays || baseDays <= 0) {
    return { level: 0, className: '' }
  }

  if (TERMINAL_STATUSES.has(task.triageStatus)) {
    return { level: 0, className: '' }
  }

  const timestamp = task.updatedAt ?? task.createdAt
  if (!timestamp) {
    return { level: 0, className: '' }
  }

  const now = Date.now()
  const daysSinceUpdate = (now - timestamp) / MS_PER_DAY

  if (daysSinceUpdate < 0) {
    return { level: 0, className: '' }
  }

  if (daysSinceUpdate < baseDays) {
    return { level: 0, className: '' }
  }

  if (daysSinceUpdate < baseDays * 2) {
    return { level: 1, className: 'card-aged-1 border-aged-1' }
  }

  if (daysSinceUpdate < baseDays * 3) {
    return { level: 2, className: 'card-aged-2 border-aged-2' }
  }

  return { level: 3, className: 'card-aged-3 border-aged-3' }
}