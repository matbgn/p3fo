import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useCardAging } from './useCardAging'
import type { Task } from './useTasks'

const TERMINAL_STATUSES = ['Done', 'Dropped', 'Archived'] as const
const MS_PER_DAY = 1000 * 60 * 60 * 24

const mockUseCombinedSettings = vi.fn()

vi.mock('./useCombinedSettings', () => ({
  useCombinedSettings: () => mockUseCombinedSettings(),
}))

describe('useCardAging', () => {
  const realDateNow = Date.now
  const NOW = 1700000000000

  beforeEach(() => {
    Date.now = () => NOW
    mockUseCombinedSettings.mockReturnValue({
      settings: { cardAgingBaseDays: 30 },
    })
  })

  afterEach(() => {
    Date.now = realDateNow
    vi.clearAllMocks()
  })

  function makeTask(overrides: Partial<Task> = {}): Task {
    return {
      id: 'task-1',
      title: 'Test Task',
      createdAt: NOW,
      triageStatus: 'Backlog',
      urgent: false,
      impact: false,
      ...overrides,
    } as Task
  }

  describe('AC1: Fresh Task No Aging', () => {
    it('should return level 0 and empty className for fresh task', () => {
      const task = makeTask({ updatedAt: NOW })
      const { result } = renderHook(() => useCardAging(task))
      expect(result.current).toEqual({ level: 0, className: '' })
    })
  })

  describe('AC2: Level 1 Task', () => {
    it('should return level 1 for task updated 31 days ago', () => {
      const updatedAt = NOW - 31 * MS_PER_DAY
      const task = makeTask({ updatedAt })
      const { result } = renderHook(() => useCardAging(task))
      expect(result.current).toEqual({ level: 1, className: 'card-aged-1 border-aged-1' })
    })
  })

  describe('AC3: Level 2 Task', () => {
    it('should return level 2 for task updated 61 days ago', () => {
      const updatedAt = NOW - 61 * MS_PER_DAY
      const task = makeTask({ updatedAt })
      const { result } = renderHook(() => useCardAging(task))
      expect(result.current).toEqual({ level: 2, className: 'card-aged-2 border-aged-2' })
    })
  })

  describe('AC4: Level 3 Task', () => {
    it('should return level 3 for task updated 91 days ago', () => {
      const updatedAt = NOW - 91 * MS_PER_DAY
      const task = makeTask({ updatedAt })
      const { result } = renderHook(() => useCardAging(task))
      expect(result.current).toEqual({ level: 3, className: 'card-aged-3 border-aged-3' })
    })
  })

  describe('AC5: Terminal Status Skipped', () => {
    it.each(TERMINAL_STATUSES)('should return level 0 for %s status even if old', (status) => {
      const updatedAt = NOW - 100 * MS_PER_DAY
      const task = makeTask({ updatedAt, triageStatus: status as Task['triageStatus'] })
      const { result } = renderHook(() => useCardAging(task))
      expect(result.current).toEqual({ level: 0, className: '' })
    })
  })

  describe('AC6: Feature Disabled Zero', () => {
    it('should return level 0 when cardAgingBaseDays is 0', () => {
      mockUseCombinedSettings.mockReturnValue({
        settings: { cardAgingBaseDays: 0 },
      })

      const updatedAt = NOW - 100 * MS_PER_DAY
      const task = makeTask({ updatedAt })
      const { result } = renderHook(() => useCardAging(task))
      expect(result.current).toEqual({ level: 0, className: '' })
    })
  })

  describe('AC7: Feature Disabled Undefined', () => {
    it('should return level 0 when cardAgingBaseDays is undefined', () => {
      mockUseCombinedSettings.mockReturnValue({
        settings: { cardAgingBaseDays: undefined },
      })

      const updatedAt = NOW - 100 * MS_PER_DAY
      const task = makeTask({ updatedAt })
      const { result } = renderHook(() => useCardAging(task))
      expect(result.current).toEqual({ level: 0, className: '' })
    })
  })

  describe('AC8: Missing updatedAt Fallback', () => {
    it('should use createdAt when updatedAt is undefined', () => {
      const createdAt = NOW - 31 * MS_PER_DAY
      const task = makeTask({ createdAt, updatedAt: undefined })
      const { result } = renderHook(() => useCardAging(task))
      expect(result.current).toEqual({ level: 1, className: 'card-aged-1 border-aged-1' })
    })
  })

  describe('AC9: Future Timestamp Clamped', () => {
    it('should return level 0 for future updatedAt timestamp', () => {
      const updatedAt = NOW + MS_PER_DAY
      const task = makeTask({ updatedAt })
      const { result } = renderHook(() => useCardAging(task))
      expect(result.current).toEqual({ level: 0, className: '' })
    })
  })

  describe('AC10: Negative BaseDays Disabled', () => {
    it('should return level 0 when cardAgingBaseDays is negative', () => {
      mockUseCombinedSettings.mockReturnValue({
        settings: { cardAgingBaseDays: -5 },
      })

      const updatedAt = NOW - 100 * MS_PER_DAY
      const task = makeTask({ updatedAt })
      const { result } = renderHook(() => useCardAging(task))
      expect(result.current).toEqual({ level: 0, className: '' })
    })
  })
})