import { describe, expect, it } from 'vitest'
import {
  canUserToggleTaskTimer,
  getTaskOwnerId,
  isTaskTimerOwnedByUser,
  isUnassignedUserId,
} from './task-timer-ownership'

describe('getTaskOwnerId', () => {
  it('returns a real assignee', () => {
    expect(getTaskOwnerId({ userId: 'alice' })).toBe('alice')
  })

  it('treats missing and legacy unassigned sentinels as unassigned', () => {
    expect(getTaskOwnerId({})).toBeNull()
    expect(getTaskOwnerId({ userId: null })).toBeNull()
    expect(getTaskOwnerId({ userId: 'UNASSIGNED' })).toBeNull()
    expect(getTaskOwnerId({ userId: 'unassigned' })).toBeNull()
  })
})

describe('isUnassignedUserId', () => {
  it('recognises both sentinel spellings', () => {
    expect(isUnassignedUserId('UNASSIGNED')).toBe(true)
    expect(isUnassignedUserId('unassigned')).toBe(true)
    expect(isUnassignedUserId('alice')).toBe(false)
    expect(isUnassignedUserId(undefined)).toBe(false)
  })
})

describe('canUserToggleTaskTimer', () => {
  it('lets the assignee control their own task timer', () => {
    expect(canUserToggleTaskTimer({ userId: 'alice' }, 'alice')).toBe(true)
  })

  it('blocks a different user from starting or stopping the timer', () => {
    expect(canUserToggleTaskTimer({ userId: 'alice' }, 'bob')).toBe(false)
  })

  it('leaves unassigned tasks open to everyone', () => {
    expect(canUserToggleTaskTimer({}, 'alice')).toBe(true)
    expect(canUserToggleTaskTimer({ userId: 'UNASSIGNED' }, 'alice')).toBe(true)
    expect(canUserToggleTaskTimer({ userId: 'unassigned' }, 'alice')).toBe(true)
  })

  it('blocks the unassigned pseudo-user from assigned tasks', () => {
    expect(canUserToggleTaskTimer({ userId: 'alice' }, 'UNASSIGNED')).toBe(false)
    expect(canUserToggleTaskTimer({ userId: 'alice' }, 'unassigned')).toBe(false)
    expect(canUserToggleTaskTimer({ userId: 'UNASSIGNED' }, 'UNASSIGNED')).toBe(true)
  })

  it('does not block while the current user is unknown', () => {
    expect(canUserToggleTaskTimer({ userId: 'alice' }, undefined)).toBe(true)
    expect(canUserToggleTaskTimer({ userId: 'alice' }, null)).toBe(true)
  })
})

describe('isTaskTimerOwnedByUser', () => {
  it('owns tasks assigned to the current user', () => {
    expect(isTaskTimerOwnedByUser({ userId: 'alice' }, 'alice')).toBe(true)
    expect(isTaskTimerOwnedByUser({ userId: 'alice' }, 'bob')).toBe(false)
  })

  it('does not attribute unassigned tasks to a named user', () => {
    expect(isTaskTimerOwnedByUser({}, 'alice')).toBe(false)
    expect(isTaskTimerOwnedByUser({ userId: 'UNASSIGNED' }, 'alice')).toBe(false)
    expect(isTaskTimerOwnedByUser({ userId: 'unassigned' }, 'alice')).toBe(false)
  })

  it('attributes unassigned tasks to the unassigned filter pseudo-user', () => {
    expect(isTaskTimerOwnedByUser({}, 'UNASSIGNED')).toBe(true)
    expect(isTaskTimerOwnedByUser({ userId: 'unassigned' }, 'UNASSIGNED')).toBe(true)
  })

  it('treats an unknown current user as owning everything', () => {
    expect(isTaskTimerOwnedByUser({ userId: 'alice' }, undefined)).toBe(true)
  })
})
