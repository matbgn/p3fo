import { describe, it, expect } from 'vitest'
import { blockedThresholdMs } from './NotificationManager.blockedThreshold'

const MS_PER_DAY = 1000 * 60 * 60 * 24

describe('blockedThresholdMs - escalation tied to aging cadence', () => {
  it('uses 1 day at the default cardAgingBaseDays of 30', () => {
    expect(blockedThresholdMs(30)).toBe(MS_PER_DAY)
  })

  it('uses 1 day when aging is disabled (baseDays = 0)', () => {
    expect(blockedThresholdMs(0)).toBe(MS_PER_DAY)
  })

  it('scales with decimal baseDays used for testing (~0.005 days = 7.2 min)', () => {
    expect(blockedThresholdMs(0.005)).toBe(432000)
  })

  it('caps at 1 day for baseDays of 1 or more', () => {
    expect(blockedThresholdMs(1)).toBe(MS_PER_DAY)
    expect(blockedThresholdMs(2)).toBe(MS_PER_DAY)
  })

  it('scales down for baseDays below 1 day', () => {
    expect(blockedThresholdMs(0.5)).toBe(0.5 * MS_PER_DAY)
    expect(blockedThresholdMs(0.25)).toBe(0.25 * MS_PER_DAY)
  })

  it('never exceeds 1 day regardless of baseDays', () => {
    for (const baseDays of [0.1, 0.5, 1, 2, 7, 30, 365]) {
      expect(blockedThresholdMs(baseDays)).toBeLessThanOrEqual(MS_PER_DAY)
    }
  })

  it('is no longer the old 30-minute threshold', () => {
    // Regression guard against reintroducing 30 * 60 * 1000
    expect(blockedThresholdMs(30)).toBeGreaterThan(30 * 60 * 1000)
  })
})