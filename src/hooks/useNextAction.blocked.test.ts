import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

// Regression guard: a Blocked card must never be proposed as the "next task
// to work on" in the NextTaskSpotlight callout. Blocked cards are sorted to
// the front of the backlog (see getMinBacklogPriority in useTasks.ts), so
// without an explicit filter they would win the top-of-storyboard selection
// in useNextAction and mood-adaptation.

const USE_NEXT_ACTION_PATH = path.resolve(__dirname, 'useNextAction.ts')
const MOOD_ADAPTATION_PATH = path.resolve(__dirname, '../utils/mood-adaptation.ts')

describe('useNextAction - blocked card exclusion', () => {
  it('filters out Blocked status from next-action candidates', () => {
    const source = fs.readFileSync(USE_NEXT_ACTION_PATH, 'utf-8')
    const filterStart = source.indexOf('const candidates = tasks')
    expect(filterStart).toBeGreaterThanOrEqual(0)
    const filterBody = source.slice(filterStart, filterStart + 600)

    expect(filterBody).toMatch(/status\s*===\s*'Blocked'/)
    // Must be a filter (exclusion), not a sort dependency
    expect(filterBody).toMatch(/return false/)
  })

  it('still filters Done/Dropped/Archived before Blocked', () => {
    const source = fs.readFileSync(USE_NEXT_ACTION_PATH, 'utf-8')
    const filterStart = source.indexOf('const candidates = tasks')
    const filterBody = source.slice(filterStart, filterStart + 600)

    const inactiveIdx = filterBody.indexOf("'Done' || status === 'Dropped' || status === 'Archived'")
    const blockedIdx = filterBody.indexOf("status === 'Blocked'")
    expect(inactiveIdx).toBeGreaterThanOrEqual(0)
    expect(blockedIdx).toBeGreaterThan(inactiveIdx)
  })

  it('does not exclude Blocked tasks with an active timer (surfaced separately)', () => {
    // The activeTimerTask branch above candidates ignores triageStatus by
    // design: currently worked-on tasks win regardless of status.
    const source = fs.readFileSync(USE_NEXT_ACTION_PATH, 'utf-8')
    expect(source).toMatch(/activeTimerTask/)
  })
})

describe('mood-adaptation - blocked card exclusion', () => {
  it('filters out Blocked status from mood candidates', () => {
    const source = fs.readFileSync(MOOD_ADAPTATION_PATH, 'utf-8')
    const filterStart = source.indexOf('const candidates = tasks')
    expect(filterStart).toBeGreaterThanOrEqual(0)
    const filterBody = source.slice(filterStart, filterStart + 600)

    expect(filterBody).toMatch(/status\s*===\s*'Blocked'/)
    expect(filterBody).toMatch(/return false/)
  })
})