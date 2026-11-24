import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ACTIVE_SESSION_HEARTBEAT_MS,
  MAX_ACTIVE_SESSION_AGE_MS,
  clearActiveSession,
  loadActiveSession,
  resolvePomodoroRestore,
  resolveTravelerRestore,
  saveActiveSession,
  type StoredPomodoroSessionData,
  type StoredTravelerSessionData,
} from './active-session'
import type { PomodoroState } from './pomodoro-types'
import type { TravelerState } from './traveler-types'

const now = 1_800_000_000_000

function pomodoroState(overrides: Partial<PomodoroState> = {}): PomodoroState {
  return {
    phase: 'work',
    startedAt: now - 5 * 60_000,
    cycleCount: 1,
    pausedAt: null,
    pausedElapsed: 0,
    armedBoost: 1,
    activeBoost: 1,
    ...overrides,
  }
}

function travelerState(overrides: Partial<TravelerState> = {}): TravelerState {
  return {
    phase: 'work',
    startedAt: now - 5 * 60_000,
    pausedAt: null,
    pausedElapsed: 0,
    travelDurationMs: 60 * 60_000,
    breakDurationMs: 12 * 60_000,
    departure: 'GVA',
    destination: 'CDG',
    travelMode: 'flight',
    ...overrides,
  }
}

function storedPomodoro(
  overrides: Partial<StoredPomodoroSessionData> = {},
): StoredPomodoroSessionData {
  return { state: pomodoroState(), durationMs: 25 * 60_000, ...overrides }
}

const store = new Map<string, string>()
const storageMock: Storage = {
  get length() {
    return store.size
  },
  clear: () => store.clear(),
  getItem: (key) => store.get(key) ?? null,
  key: (index) => Array.from(store.keys())[index] ?? null,
  removeItem: (key) => {
    store.delete(key)
  },
  setItem: (key, value) => {
    store.set(key, String(value))
  },
}

beforeEach(() => {
  store.clear()
  // jsdom may run with an opaque origin where localStorage is unavailable.
  Object.defineProperty(window, 'localStorage', { configurable: true, value: storageMock })
  vi.stubGlobal('localStorage', storageMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('active session storage', () => {
  it('round-trips a per-user session', () => {
    saveActiveSession('pomodoro', 'user-1', { phase: 'work' })
    expect(loadActiveSession('pomodoro', 'user-1')?.data).toEqual({ phase: 'work' })
    expect(loadActiveSession('pomodoro', 'user-2')).toBeNull()
  })

  it('clears a session', () => {
    saveActiveSession('pomodoro', 'user-1', { phase: 'work' })
    clearActiveSession('pomodoro', 'user-1')
    expect(loadActiveSession('pomodoro', 'user-1')).toBeNull()
  })

  it('ignores sessions older than the max age', () => {
    saveActiveSession('pomodoro', 'user-1', { phase: 'work' })
    const key = 'p3fo_active_pomodoro:user-1'
    const record = JSON.parse(storageMock.getItem(key)!)
    record.savedAt = Date.now() - MAX_ACTIVE_SESSION_AGE_MS - 1_000
    storageMock.setItem(key, JSON.stringify(record))
    expect(loadActiveSession('pomodoro', 'user-1')).toBeNull()
  })

  it('ignores malformed storage', () => {
    storageMock.setItem('p3fo_active_pomodoro:user-1', '{not json')
    expect(loadActiveSession('pomodoro', 'user-1')).toBeNull()
  })

  it('requires a user id', () => {
    saveActiveSession('pomodoro', 'user-1', { phase: 'work' })
    expect(loadActiveSession('pomodoro', null)).toBeNull()
  })
})

describe('pomodoro restore', () => {
  it('restores a running session with the persisted duration', () => {
    const outcome = resolvePomodoroRestore(storedPomodoro(), now - 60_000, now)
    expect(outcome.kind).toBe('restore')
    if (outcome.kind !== 'restore') return
    expect(outcome.state.startedAt).toBe(now - 5 * 60_000)
    expect(outcome.state.durationOverrideMs).toBe(25 * 60_000)
  })

  it('does not depend on the current config for the restored duration', () => {
    const outcome = resolvePomodoroRestore(
      storedPomodoro({
        durationMs: 50 * 60_000,
        state: pomodoroState({ startedAt: now - 10 * 60_000 }),
      }),
      now - 60_000,
      now,
    )
    expect(outcome.kind).toBe('restore')
    if (outcome.kind !== 'restore') return
    expect(outcome.state.startedAt).toBe(now - 10 * 60_000)
    expect(outcome.state.durationOverrideMs).toBe(50 * 60_000)
  })

  it('finalizes an expired session only up to the last known-alive heartbeat', () => {
    const startedAt = now - 30 * 60_000
    const savedAt = now - 20 * 60_000
    const outcome = resolvePomodoroRestore(
      storedPomodoro({ state: pomodoroState({ startedAt }) }),
      savedAt,
      now,
    )
    expect(outcome).toEqual({
      kind: 'expired',
      endTime: savedAt + ACTIVE_SESSION_HEARTBEAT_MS,
      completed: false,
    })
  })

  it('marks an expired session complete only when the tab was alive for the full phase', () => {
    const startedAt = now - 30 * 60_000
    // The heartbeat survived past the phase end, so the whole phase was credited.
    const outcome = resolvePomodoroRestore(
      storedPomodoro({ state: pomodoroState({ startedAt }) }),
      now - 1_000,
      now,
    )
    expect(outcome).toEqual({
      kind: 'expired',
      endTime: startedAt + 25 * 60_000,
      completed: true,
    })
  })

  it('restores a paused session with the persisted duration', () => {
    const state = pomodoroState({
      startedAt: now - 30 * 60_000,
      pausedAt: now - 25 * 60_000,
      pausedElapsed: 5 * 60_000,
    })
    const outcome = resolvePomodoroRestore(storedPomodoro({ state }), now - 20 * 60_000, now)
    expect(outcome).toEqual({
      kind: 'restore',
      state: { ...state, durationOverrideMs: 25 * 60_000 },
    })
  })

  it('discards idle or invalid records', () => {
    expect(
      resolvePomodoroRestore(
        storedPomodoro({ state: pomodoroState({ phase: 'idle', startedAt: null }) }),
        now,
        now,
      ),
    ).toEqual({ kind: 'discard' })
    expect(
      resolvePomodoroRestore(storedPomodoro({ durationMs: 0 }), now, now),
    ).toEqual({ kind: 'discard' })
  })
})

describe('traveler restore', () => {
  const stored = (state: TravelerState): StoredTravelerSessionData => ({ state })

  it('restores a running traveler session', () => {
    const state = travelerState()
    expect(resolveTravelerRestore(stored(state), now - 60_000, now)).toEqual({
      kind: 'restore',
      state,
    })
  })

  it('finalizes an expired session up to the last known-alive heartbeat', () => {
    const startedAt = now - 2 * 60 * 60_000
    const savedAt = now - 90 * 60_000
    const outcome = resolveTravelerRestore(
      stored(travelerState({ startedAt })),
      savedAt,
      now,
    )
    expect(outcome).toEqual({
      kind: 'expired',
      endTime: savedAt + ACTIVE_SESSION_HEARTBEAT_MS,
      completed: false,
    })
  })

  it('uses the break duration during a break', () => {
    const state = travelerState({ phase: 'break', startedAt: now - 10 * 60_000 })
    expect(resolveTravelerRestore(stored(state), now - 60_000, now).kind).toBe('restore')
  })

  it('discards idle or invalid records', () => {
    expect(
      resolveTravelerRestore(
        stored(travelerState({ phase: 'idle', startedAt: null })),
        now,
        now,
      ),
    ).toEqual({ kind: 'discard' })
  })
})
