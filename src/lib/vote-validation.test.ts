import { describe, it, expect } from 'vitest';
import type { VoteEntity } from './persistence-types';
import { isVoteMode, validateVoteResponseValue } from './vote-validation';

const voteFor = (mode: VoteEntity['config']['mode'], extra: Partial<VoteEntity['config']> = {}) =>
  ({ config: { mode, ...extra } }) as Pick<VoteEntity, 'config'>;

describe('validateVoteResponseValue', () => {
  it('accepts only 1 for THUMBS_UP', () => {
    const vote = voteFor('THUMBS_UP');
    expect(validateVoteResponseValue(vote, 1)).toBeNull();
    expect(validateVoteResponseValue(vote, 0)).toBeTruthy();
  });

  it('accepts -1, 0 and 1 for THUMBS_UD_NEUTRAL', () => {
    const vote = voteFor('THUMBS_UD_NEUTRAL');
    for (const value of [-1, 0, 1]) expect(validateVoteResponseValue(vote, value)).toBeNull();
    expect(validateVoteResponseValue(vote, 2)).toBeTruthy();
  });

  it('accepts -1, 0 and 1 for ATTENDANCE', () => {
    const vote = voteFor('ATTENDANCE');
    for (const value of [-1, 0, 1]) expect(validateVoteResponseValue(vote, value)).toBeNull();
    expect(validateVoteResponseValue(vote, 2)).toBeTruthy();
    expect(validateVoteResponseValue(vote, -2)).toBeTruthy();
  });

  it('accepts -1 and 1 for SCHEDULING and gates 0 on allowIfNeeded', () => {
    const strict = voteFor('SCHEDULING');
    expect(validateVoteResponseValue(strict, 1)).toBeNull();
    expect(validateVoteResponseValue(strict, -1)).toBeNull();
    expect(validateVoteResponseValue(strict, 0)).toMatch(/if needed/i);
    expect(validateVoteResponseValue(strict, 2)).toBeTruthy();

    const flexible = voteFor('SCHEDULING', {
      scheduling: {
        timeZone: 'UTC',
        granularityMinutes: 30,
        durationMinutes: 60,
        dates: ['2026-01-01'],
        dayStart: '09:00',
        dayEnd: '17:00',
        allowIfNeeded: true,
      },
    });
    expect(validateVoteResponseValue(flexible, 0)).toBeNull();
    expect(validateVoteResponseValue(flexible, 1)).toBeNull();
    expect(validateVoteResponseValue(flexible, -1)).toBeNull();
    expect(validateVoteResponseValue(flexible, 2)).toBeTruthy();
  });

  it('bounds POINTS by the configured budget', () => {
    const vote = voteFor('POINTS', { maxPointsPerUser: 5 });
    expect(validateVoteResponseValue(vote, 5)).toBeNull();
    expect(validateVoteResponseValue(vote, 6)).toBeTruthy();
    expect(validateVoteResponseValue(vote, 1.5)).toBeTruthy();
  });

  it('bounds MAJORITY_JUDGMENT and CONSENT_LOOP to the MJ scale', () => {
    for (const mode of ['MAJORITY_JUDGMENT', 'CONSENT_LOOP'] as const) {
      const vote = voteFor(mode);
      expect(validateVoteResponseValue(vote, -1)).toBeNull();
      expect(validateVoteResponseValue(vote, 4)).toBeNull();
      // 5 is outside the scale the tally and the UI build buckets from.
      expect(validateVoteResponseValue(vote, 5)).toBeTruthy();
      expect(validateVoteResponseValue(vote, 6)).toBeTruthy();
    }
  });

  it('accepts only the planning-poker cards for POKER_PLANNING', () => {
    const vote = voteFor('POKER_PLANNING');
    for (const value of [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 100, 1000]) {
      expect(validateVoteResponseValue(vote, value)).toBeNull();
    }
    expect(validateVoteResponseValue(vote, 4)).toBeTruthy();
    expect(validateVoteResponseValue(vote, 1.5)).toBeTruthy();
    expect(validateVoteResponseValue(vote, 22)).toBeTruthy();
  });

  it('validates the selected poker scale', () => {
    const tshirt = voteFor('POKER_PLANNING', {
      poker: { scale: 'tshirt' },
    });
    for (const value of [1, 2, 3, 5, 8, 13, 100, 1000]) {
      expect(validateVoteResponseValue(tshirt, value)).toBeNull();
    }
    expect(validateVoteResponseValue(tshirt, 4)).toBeTruthy();

    const powers = voteFor('POKER_PLANNING', {
      poker: { scale: 'powersof2' },
    });
    for (const value of [0, 1, 2, 4, 8, 16, 32, 64, 100, 1000]) {
      expect(validateVoteResponseValue(powers, value)).toBeNull();
    }
    expect(validateVoteResponseValue(powers, 5)).toBeTruthy();
  });

  it('rejects non-finite values', () => {
    expect(validateVoteResponseValue(voteFor('THUMBS_UP'), Number.NaN)).toBeTruthy();
    expect(
      validateVoteResponseValue(voteFor('THUMBS_UP'), 'x' as unknown as number),
    ).toBeTruthy();
  });

  it('points comparative votes at the ranking endpoint', () => {
    expect(validateVoteResponseValue(voteFor('COMPARATIVE_PRIORITIZATION'), 1)).toMatch(
      /ranking-submissions/,
    );
  });
});

describe('isVoteMode', () => {
  it('accepts every known mode', () => {
    for (const mode of [
      'THUMBS_UP',
      'THUMBS_UD_NEUTRAL',
      'POINTS',
      'MAJORITY_JUDGMENT',
      'ATTENDANCE',
      'CONSENT_LOOP',
      'COMPARATIVE_PRIORITIZATION',
      'SCHEDULING',
      'POKER_PLANNING',
    ]) {
      expect(isVoteMode(mode)).toBe(true);
    }
  });

  it('rejects null and unknown values', () => {
    expect(isVoteMode(null)).toBe(false);
    expect(isVoteMode(undefined)).toBe(false);
    expect(isVoteMode('')).toBe(false);
    expect(isVoteMode('NOT_A_MODE')).toBe(false);
  });
});
