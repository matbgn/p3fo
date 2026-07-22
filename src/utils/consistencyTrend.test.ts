import { describe, it, expect } from 'vitest';
import { computeConsistencyTrend, getTrendDisplay } from './consistencyTrend';
import type { ScoreHistoryEntry } from './consistencyTrend';

function history(scores: number[]): ScoreHistoryEntry[] {
  return scores.map((score, i) => ({ date: `2024-01-${String(i + 1).padStart(2, '0')}`, score }));
}

describe('computeConsistencyTrend', () => {
  it('returns stable when fewer than 2 entries', () => {
    expect(computeConsistencyTrend([])).toBe('stable');
    expect(computeConsistencyTrend(history([50]))).toBe('stable');
  });

  it('shows up when today recovers above the prior 7-day average', () => {
    const entries = history([20, 20, 20, 20, 20, 20, 20, 30]);
    expect(computeConsistencyTrend(entries)).toBe('up');
  });

  it('shows down when today falls below the prior 7-day average', () => {
    const entries = history([80, 80, 80, 80, 80, 80, 80, 60]);
    expect(computeConsistencyTrend(entries)).toBe('down');
  });

  it('returns stable when today is within the dead band of the prior average', () => {
    const entries = history([50, 50, 50, 50, 50, 50, 50, 50.5]);
    expect(computeConsistencyTrend(entries)).toBe('stable');
  });

  it('clamps the reference window when fewer than 7 prior entries exist', () => {
    const entries = history([20, 30]);
    expect(computeConsistencyTrend(entries)).toBe('up');
  });

  it('uses only the 7 entries immediately before today as the reference', () => {
    const entries = history([20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 30]);
    expect(computeConsistencyTrend(entries)).toBe('up');
  });

  it('does not let an old spike mask an active recovery', () => {
    const entries = history([50, 80, 10, 10, 10, 10, 10, 10, 30]);
    expect(computeConsistencyTrend(entries)).toBe('up');
  });

  it('shows down when today is still below a low prior average', () => {
    const entries = history([20, 20, 20, 20, 20, 20, 20, 15]);
    expect(computeConsistencyTrend(entries)).toBe('down');
  });
});

describe('getTrendDisplay', () => {
  it('maps up to the up arrow and green class', () => {
    expect(getTrendDisplay('up')).toEqual({ arrow: '\u2191', colorClass: 'text-green-500' });
  });

  it('maps down to the down arrow and red class', () => {
    expect(getTrendDisplay('down')).toEqual({ arrow: '\u2193', colorClass: 'text-red-500' });
  });

  it('maps stable to the right arrow and muted class', () => {
    expect(getTrendDisplay('stable')).toEqual({ arrow: '\u2192', colorClass: 'text-muted-foreground' });
  });
});