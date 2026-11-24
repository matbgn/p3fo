import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearLocalTaskTracking,
  deriveLocalPresence,
  deriveRemoteTracking,
  deriveTakeoverForSelf,
  getLocalTaskTracking,
  isTakeoverRequest,
  isTrackingPayload,
  MAX_TAKEOVER_PHASE_DURATION_MS,
  sanitizeDeviceLabel,
  setLocalTaskTracking,
  subscribeLocalTaskTracking,
  type LocalPresenceInput,
  type LocalTaskTracking,
  type TrackingPresencePayload,
} from './tracking-presence'

const validPayload: TrackingPresencePayload = {
  v: 1,
  sessionId: 'pomodoro:1000',
  userId: 'user-1',
  taskId: 'task-1',
  technique: 'pomodoro',
  phase: 'work',
  sinceTs: 1_000,
  durationMs: 1_500_000,
  deviceLabel: 'Mac',
  pomodoro: { cycleCount: 1, armedBoost: 1, activeBoost: 2 },
}

const travelerPayload: TrackingPresencePayload = {
  v: 1,
  sessionId: 'traveler:2000',
  userId: 'user-1',
  taskId: null,
  technique: 'traveler',
  phase: 'work',
  sinceTs: 2_000,
  durationMs: 4_200_000,
  deviceLabel: 'Mac',
  traveler: {
    departure: 'GVA',
    destination: 'CDG',
    travelMode: 'flight',
    travelDurationMs: 4_200_000,
    breakDurationMs: 840_000,
  },
}

const base: LocalPresenceInput = {
  userId: 'user-1',
  pomodoro: {
    phase: 'idle',
    startedAt: null,
    pausedAt: null,
    durationMs: 0,
    cycleCount: 0,
    armedBoost: 1,
    activeBoost: 1,
  },
  traveler: {
    phase: 'idle',
    startedAt: null,
    pausedAt: null,
    durationMs: 0,
    breakDurationMs: 0,
    departure: '',
    destination: '',
    travelMode: 'flight',
  },
  localTask: null,
  deviceLabel: 'Mac',
}

afterEach(() => {
  setLocalTaskTracking(null)
})

describe('sanitizeDeviceLabel', () => {
  it('strips markup delimiters and control characters', () => {
    expect(sanitizeDeviceLabel('<img src=x onerror=alert(1)>')).toBe('img src=x onerror=alert(1)')
    expect(sanitizeDeviceLabel('bad\u0000label')).toBe('badlabel')
    expect(sanitizeDeviceLabel('  multi   space  ')).toBe('multi space')
  })

  it('caps the label length', () => {
    expect(sanitizeDeviceLabel('x'.repeat(80))).toHaveLength(32)
  })

  it('falls back for non-strings and empty results', () => {
    expect(sanitizeDeviceLabel({ evil: true })).toBe('Unknown device')
    expect(sanitizeDeviceLabel('<>')).toBe('Unknown device')
  })
})

describe('isTrackingPayload', () => {
  it('accepts pomodoro and traveler payloads', () => {
    expect(isTrackingPayload(validPayload)).toBe(true)
    expect(isTrackingPayload(travelerPayload)).toBe(true)
  })

  it('accepts a task payload without takeover data', () => {
    expect(
      isTrackingPayload({
        v: 1,
        sessionId: 'task:5000',
        userId: 'user-1',
        taskId: 'task-1',
        technique: 'task',
        phase: 'task',
        sinceTs: 5_000,
        deviceLabel: 'Mac',
      }),
    ).toBe(true)
  })

  it('rejects malformed payloads', () => {
    expect(isTrackingPayload(null)).toBe(false)
    expect(isTrackingPayload({ ...validPayload, v: 2 })).toBe(false)
    expect(isTrackingPayload({ ...validPayload, sessionId: '' })).toBe(false)
    expect(isTrackingPayload({ ...validPayload, userId: '' })).toBe(false)
    expect(isTrackingPayload({ ...validPayload, technique: 'meeting' })).toBe(false)
    expect(isTrackingPayload({ ...validPayload, sinceTs: Number.NaN })).toBe(false)
    expect(isTrackingPayload({ ...validPayload, taskId: undefined })).toBe(false)
    expect(isTrackingPayload({ ...validPayload, durationMs: 0 })).toBe(false)
    expect(isTrackingPayload({ ...validPayload, deviceLabel: 'x'.repeat(129) })).toBe(false)
    expect(isTrackingPayload({ ...validPayload, pomodoro: { cycleCount: 0 } })).toBe(false)
    expect(isTrackingPayload({ ...travelerPayload, traveler: { departure: 'GVA' } })).toBe(false)
  })

  it('rejects unbounded or malformed takeover fields', () => {
    // A forged payload could otherwise make this device adopt and record an
    // arbitrary amount of tracked time.
    expect(
      isTrackingPayload({ ...validPayload, durationMs: MAX_TAKEOVER_PHASE_DURATION_MS + 1 }),
    ).toBe(false)
    expect(
      isTrackingPayload({
        ...travelerPayload,
        traveler: { ...travelerPayload.traveler!, travelDurationMs: MAX_TAKEOVER_PHASE_DURATION_MS + 1 },
      }),
    ).toBe(false)
    expect(
      isTrackingPayload({
        ...travelerPayload,
        traveler: { ...travelerPayload.traveler!, breakDurationMs: 0 },
      }),
    ).toBe(false)
    expect(
      isTrackingPayload({ ...validPayload, pomodoro: { ...validPayload.pomodoro!, activeBoost: 4 } }),
    ).toBe(false)
    expect(
      isTrackingPayload({ ...validPayload, pomodoro: { ...validPayload.pomodoro!, armedBoost: 0 } }),
    ).toBe(false)
    // Unknown phase values are rejected per technique.
    expect(isTrackingPayload({ ...validPayload, phase: 'idle' })).toBe(false)
  })
})

describe('isTakeoverRequest', () => {
  it('validates the takeover shape', () => {
    expect(
      isTakeoverRequest({ v: 1, targetClientId: 3, sessionId: 'pomodoro:1', userId: 'user-1', at: 10 }),
    ).toBe(true)
    expect(isTakeoverRequest(null)).toBe(false)
    expect(isTakeoverRequest({ v: 1, targetClientId: '3', sessionId: 'x', userId: 'user-1', at: 1 })).toBe(false)
    expect(isTakeoverRequest({ v: 1, targetClientId: 3, sessionId: '', userId: 'user-1', at: 1 })).toBe(false)
    expect(isTakeoverRequest({ v: 1, targetClientId: 3, sessionId: 'x', at: 1 })).toBe(false)
    expect(isTakeoverRequest({ v: 1, targetClientId: 3, sessionId: 'x', userId: '', at: 1 })).toBe(false)
  })
})

describe('deriveRemoteTracking', () => {
  it('returns null without a local user id', () => {
    const states = new Map([[2, { tracking: validPayload }]])
    expect(deriveRemoteTracking(states, 1, undefined)).toBeNull()
    expect(deriveRemoteTracking(states, 1, '')).toBeNull()
  })

  it('ignores this client', () => {
    const states = new Map([[1, { tracking: validPayload }]])
    expect(deriveRemoteTracking(states, 1, 'user-1')).toBeNull()
  })

  it('ignores another user tracking their own time', () => {
    const states = new Map([[2, { tracking: { ...validPayload, userId: 'user-2' } }]])
    expect(deriveRemoteTracking(states, 1, 'user-1')).toBeNull()
  })

  it('returns the session from another device for the same user', () => {
    const states = new Map([[2, { tracking: validPayload }]])
    expect(deriveRemoteTracking(states, 1, 'user-1')).toEqual({
      clientId: 2,
      payload: validPayload,
    })
  })

  it('prefers the newest session when several devices track', () => {
    const older = { ...validPayload, sinceTs: 1_000, deviceLabel: 'Old' }
    const newer = { ...validPayload, sinceTs: 5_000, deviceLabel: 'New' }
    const states = new Map([
      [2, { tracking: older }],
      [3, { tracking: newer }],
    ])
    expect(deriveRemoteTracking(states, 1, 'user-1')?.payload.deviceLabel).toBe('New')
  })

  it('skips malformed remote state', () => {
    const states = new Map([[2, { tracking: { v: 1 } }]])
    expect(deriveRemoteTracking(states, 1, 'user-1')).toBeNull()
  })
})

describe('deriveTakeoverForSelf', () => {
  const request = { v: 1 as const, targetClientId: 7, sessionId: 'pomodoro:1000', userId: 'user-1', at: 10 }

  it('finds a request targeting this client and session from the same user', () => {
    const states = new Map([[8, { takeover: request }]])
    expect(deriveTakeoverForSelf(states, 7, 'pomodoro:1000', 'user-1')).toEqual(request)
  })

  it('ignores requests for another client or another session', () => {
    const states = new Map([[8, { takeover: request }]])
    expect(deriveTakeoverForSelf(states, 9, 'pomodoro:1000', 'user-1')).toBeNull()
    expect(deriveTakeoverForSelf(states, 7, 'pomodoro:999', 'user-1')).toBeNull()
  })

  it('ignores a takeover from a different user', () => {
    const states = new Map([[8, { takeover: request }]])
    expect(deriveTakeoverForSelf(states, 7, 'pomodoro:1000', 'user-2')).toBeNull()
  })

  it('ignores everything without a local user id', () => {
    const states = new Map([[8, { takeover: request }]])
    expect(deriveTakeoverForSelf(states, 7, 'pomodoro:1000', null)).toBeNull()
    expect(deriveTakeoverForSelf(states, 7, 'pomodoro:1000', '')).toBeNull()
  })

  it('picks the newest matching request', () => {
    const states = new Map([
      [8, { takeover: { ...request, at: 5 } }],
      [9, { takeover: { ...request, at: 20 } }],
    ])
    expect(deriveTakeoverForSelf(states, 7, 'pomodoro:1000', 'user-1')?.at).toBe(20)
  })
})

describe('deriveLocalPresence', () => {
  it('returns null when idle', () => {
    expect(deriveLocalPresence(base)).toBeNull()
  })

  it('returns null without a user id', () => {
    expect(deriveLocalPresence({ ...base, userId: '' })).toBeNull()
  })

  it('publishes a running pomodoro with takeover data', () => {
    const payload = deriveLocalPresence({
      ...base,
      pomodoro: {
        ...base.pomodoro,
        phase: 'work',
        startedAt: 2_000,
        pausedAt: null,
        currentTaskId: 'task-9',
        durationMs: 1_500_000,
        cycleCount: 3,
        activeBoost: 2,
      },
    })
    expect(payload).toMatchObject({
      sessionId: 'pomodoro:2000',
      technique: 'pomodoro',
      phase: 'work',
      taskId: 'task-9',
      sinceTs: 2_000,
      durationMs: 1_500_000,
      deviceLabel: 'Mac',
      userId: 'user-1',
      pomodoro: { cycleCount: 3, armedBoost: 1, activeBoost: 2 },
    })
  })

  it('does not publish a paused pomodoro', () => {
    expect(
      deriveLocalPresence({
        ...base,
        pomodoro: { ...base.pomodoro, phase: 'work', startedAt: 2_000, pausedAt: 3_000 },
      }),
    ).toBeNull()
  })

  it('does not publish during a break', () => {
    expect(
      deriveLocalPresence({
        ...base,
        pomodoro: { ...base.pomodoro, phase: 'short-break', startedAt: 2_000, pausedAt: null },
      }),
    ).toBeNull()
    expect(
      deriveLocalPresence({
        ...base,
        traveler: { ...base.traveler, phase: 'break', startedAt: 2_000, pausedAt: null },
      }),
    ).toBeNull()
  })

  it('falls through a paused pomodoro to a local task timer', () => {
    const localTask: LocalTaskTracking = {
      taskId: 'task-3',
      userId: 'user-1',
      sinceTs: 4_000,
    }
    const payload = deriveLocalPresence({
      ...base,
      pomodoro: { ...base.pomodoro, phase: 'work', startedAt: 2_000, pausedAt: 3_000 },
      localTask,
    })
    expect(payload).toMatchObject({
      sessionId: 'task:4000',
      technique: 'task',
      taskId: 'task-3',
      sinceTs: 4_000,
    })
  })

  it('publishes a running traveler with takeover data', () => {
    const payload = deriveLocalPresence({
      ...base,
      traveler: {
        ...base.traveler,
        phase: 'work',
        startedAt: 6_000,
        pausedAt: null,
        durationMs: 4_200_000,
        breakDurationMs: 840_000,
        departure: 'GVA',
        destination: 'CDG',
      },
    })
    expect(payload).toMatchObject({
      sessionId: 'traveler:6000',
      technique: 'traveler',
      phase: 'work',
      sinceTs: 6_000,
      durationMs: 4_200_000,
      traveler: {
        departure: 'GVA',
        destination: 'CDG',
        travelMode: 'flight',
        travelDurationMs: 4_200_000,
        breakDurationMs: 840_000,
      },
    })
  })

  it('prefers a running pomodoro over a local task timer', () => {
    const localTask: LocalTaskTracking = {
      taskId: 'task-3',
      userId: 'user-1',
      sinceTs: 1_000,
    }
    const payload = deriveLocalPresence({
      ...base,
      pomodoro: { ...base.pomodoro, phase: 'work', startedAt: 2_000, pausedAt: null },
      localTask,
    })
    expect(payload?.technique).toBe('pomodoro')
  })
})

describe('local task tracking registry', () => {
  const entry: LocalTaskTracking = {
    taskId: 'task-1',
    userId: 'user-1',
    sinceTs: 1_000,
  }

  it('stores and clears the current entry', () => {
    setLocalTaskTracking(entry)
    expect(getLocalTaskTracking()).toEqual(entry)
    clearLocalTaskTracking('other-task')
    expect(getLocalTaskTracking()).toEqual(entry)
    clearLocalTaskTracking('task-1')
    expect(getLocalTaskTracking()).toBeNull()
  })

  it('notifies subscribers on change, including clearing', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeLocalTaskTracking(listener)
    setLocalTaskTracking(entry)
    setLocalTaskTracking(entry)
    clearLocalTaskTracking()
    unsubscribe()
    clearLocalTaskTracking()
    expect(listener).toHaveBeenCalledTimes(2)
  })
})
