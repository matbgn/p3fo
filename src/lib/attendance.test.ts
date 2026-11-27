import { describe, expect, it } from 'vitest';
import type {
  AttendanceConfig,
  AttendanceResponseData,
  VoteResponseEntity,
} from './persistence-types';
import {
  attendanceCapacityError,
  attendanceGoingPartyTotal,
  attendancePartySize,
  publicAttendanceRows,
  sanitizeAttendanceData,
  validateAttendanceAnswers,
} from './attendance';
import { EVENT_RSVP_PROPOSAL_ID } from './vote-tally';

const config: AttendanceConfig = {
  askEmail: true,
  allowPartySize: true,
  maxPartySize: 5,
  allowHiddenAttendance: true,
  maxAttendees: 10,
  customQuestions: [
    { id: 'diet', prompt: 'Dietary needs', type: 'text', required: true },
    { id: 'meal', prompt: 'Meal', type: 'choice', options: ['fish', 'veggie'], required: true },
  ],
};

const rsvp = (
  overrides: Partial<VoteResponseEntity> & { attendeeData?: AttendanceResponseData } = {},
): VoteResponseEntity => ({
  id: overrides.id ?? `r-${Math.random()}`,
  voteId: 'vote-1',
  proposalId: EVENT_RSVP_PROPOSAL_ID,
  userId: null,
  voterToken: overrides.voterToken ?? `t-${Math.random()}`,
  value: overrides.value ?? 1,
  submittedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('sanitizeAttendanceData', () => {
  it('omits the display name for anonymous votes', () => {
    const data = sanitizeAttendanceData(config, { displayName: 'Alice' }, { isAnonymous: true });
    expect(data.displayName).toBeUndefined();
  });

  it('trims and caps the display name for non-anonymous votes', () => {
    const data = sanitizeAttendanceData(
      config,
      { displayName: `  ${'x'.repeat(120)}  ` },
      { isAnonymous: false },
    );
    expect(data.displayName).toHaveLength(80);
    expect(data.displayName?.startsWith('x')).toBe(true);
  });

  it('uses the fallback display name when non-anonymous and empty', () => {
    const data = sanitizeAttendanceData(
      config,
      { displayName: '   ' },
      { isAnonymous: false, fallbackDisplayName: '  Bob  ' },
    );
    expect(data.displayName).toBe('Bob');
  });

  it('clamps party size to the configured range', () => {
    expect(sanitizeAttendanceData(config, { partySize: 99 }, { isAnonymous: true }).partySize).toBe(5);
    expect(sanitizeAttendanceData(config, { partySize: -3 }, { isAnonymous: true }).partySize).toBe(1);
    expect(sanitizeAttendanceData(config, { partySize: 2.9 }, { isAnonymous: true }).partySize).toBe(2);
  });

  it('forces party size to one when party sizes are disabled', () => {
    const data = sanitizeAttendanceData(
      { ...config, allowPartySize: false },
      { partySize: 4 },
      { isAnonymous: true },
    );
    expect(data.partySize).toBe(1);
  });

  it('only honors hidden visibility when the config allows it', () => {
    expect(sanitizeAttendanceData(config, { visibility: 'hidden' }, { isAnonymous: true }).visibility).toBe('hidden');
    expect(
      sanitizeAttendanceData(
        { ...config, allowHiddenAttendance: false },
        { visibility: 'hidden' },
        { isAnonymous: true },
      ).visibility,
    ).toBe('public');
  });

  it('keeps only valid answers for configured questions', () => {
    const data = sanitizeAttendanceData(
      config,
      { answers: { diet: '  vegan  ', meal: 'fish', unknown: 'x' } },
      { isAnonymous: true },
    );
    expect(data.answers).toEqual({ diet: 'vegan', meal: 'fish' });
    expect(data.answers?.unknown).toBeUndefined();
  });

  it('rejects out-of-range choice answers and caps long text', () => {
    const outOfRange = sanitizeAttendanceData(
      config,
      { answers: { diet: 'yes', meal: 'pizza' } },
      { isAnonymous: true },
    );
    expect(outOfRange.answers?.meal).toBeUndefined();

    const long = sanitizeAttendanceData(
      config,
      { answers: { diet: 'x'.repeat(900), meal: 'fish' } },
      { isAnonymous: true },
    );
    expect(long.answers?.diet).toHaveLength(500);
  });

  it('normalizes email only when asked', () => {
    const data = sanitizeAttendanceData(
      config,
      { email: '  Alice@Example.COM ' },
      { isAnonymous: true },
    );
    expect(data.email).toBe('alice@example.com');

    expect(
      sanitizeAttendanceData({ ...config, askEmail: false }, { email: 'a@b.co' }, { isAnonymous: true }).email,
    ).toBeUndefined();
    expect(
      sanitizeAttendanceData(config, { email: 'not-an-email' }, { isAnonymous: true }).email,
    ).toBeUndefined();
  });
});

describe('validateAttendanceAnswers', () => {
  it('accepts complete answers', () => {
    expect(
      validateAttendanceAnswers(config, { answers: { diet: 'none', meal: 'veggie' } }),
    ).toBeNull();
  });

  it('reports missing required answers', () => {
    expect(validateAttendanceAnswers(config, { answers: { meal: 'fish' } })).toMatch(/Dietary/);
    expect(validateAttendanceAnswers(config, { answers: { diet: 'none' } })).toMatch(/Meal/);
  });

  it('rejects choices outside the configured options', () => {
    expect(
      validateAttendanceAnswers(config, { answers: { diet: 'none', meal: 'pizza' } }),
    ).toMatch(/Invalid option/);
  });

  it('ignores optional questions that are blank', () => {
    const optional: AttendanceConfig = {
      customQuestions: [{ id: 'note', prompt: 'Note', type: 'text' }],
    };
    expect(validateAttendanceAnswers(optional, { answers: { note: '   ' } })).toBeNull();
  });

  it('does not block an RSVP on an unsatisfiable choice question with no options', () => {
    const broken: AttendanceConfig = {
      customQuestions: [{ id: 'pick', prompt: 'Pick one', type: 'choice', required: true }],
    };
    expect(validateAttendanceAnswers(broken, { answers: {} })).toBeNull();
  });
});

describe('attendancePartySize', () => {
  it('defaults to one', () => {
    expect(attendancePartySize()).toBe(1);
    expect(attendancePartySize({})).toBe(1);
    expect(attendancePartySize({ partySize: 0 })).toBe(1);
    expect(attendancePartySize({ partySize: 3 })).toBe(3);
  });
});

describe('attendanceGoingPartyTotal', () => {
  it('sums only going sentinels and can exclude one voter', () => {
    const responses = [
      rsvp({ voterToken: 'a', attendeeData: { partySize: 2 } }),
      rsvp({ voterToken: 'b', attendeeData: { partySize: 3 } }),
      rsvp({ voterToken: 'c', value: 0, attendeeData: { partySize: 9 } }),
      rsvp({ voterToken: 'd', proposalId: 'p1', attendeeData: { partySize: 9 } }),
    ];
    expect(attendanceGoingPartyTotal(responses)).toBe(5);
    expect(attendanceGoingPartyTotal(responses, 'a')).toBe(3);
  });
});

describe('attendanceCapacityError', () => {
  const responses = [
    rsvp({ voterToken: 'a', attendeeData: { partySize: 4 } }),
    rsvp({ voterToken: 'b', attendeeData: { partySize: 4 } }),
  ];

  it('is unlimited when maxAttendees is zero or undefined', () => {
    expect(attendanceCapacityError(undefined, responses, { value: 1, partySize: 4 }, 'c')).toBeNull();
    expect(
      attendanceCapacityError({ maxAttendees: 0 }, responses, { value: 1, partySize: 4 }, 'c'),
    ).toBeNull();
  });

  it('allows an RSVP that fits', () => {
    expect(
      attendanceCapacityError({ maxAttendees: 10 }, responses, { value: 1, partySize: 2 }, 'c'),
    ).toBeNull();
  });

  it('rejects an RSVP that would overflow capacity', () => {
    expect(
      attendanceCapacityError({ maxAttendees: 10 }, responses, { value: 1, partySize: 3 }, 'c'),
    ).toMatch(/capacity/);
  });

  it('excludes the voter’s existing row before adding the incoming size', () => {
    expect(
      attendanceCapacityError({ maxAttendees: 10 }, responses, { value: 1, partySize: 4 }, 'a'),
    ).toBeNull();
    expect(
      attendanceCapacityError({ maxAttendees: 10 }, responses, { value: 1, partySize: 7 }, 'a'),
    ).toMatch(/capacity/);
  });

  it('never blocks a non-going RSVP', () => {
    expect(
      attendanceCapacityError({ maxAttendees: 10 }, responses, { value: -1, partySize: 9 }, 'c'),
    ).toBeNull();
  });
});

describe('publicAttendanceRows', () => {
  const responses = [
    rsvp({
      voterToken: 'a',
      voterAlias: 'P-A',
      attendeeData: { displayName: 'Alice', partySize: 2 },
    }),
    rsvp({
      voterToken: 'b',
      voterAlias: 'P-B',
      attendeeData: { displayName: 'Bob', partySize: 3, visibility: 'hidden' },
    }),
    rsvp({
      voterToken: 'c',
      voterAlias: 'P-C',
      value: 0,
      attendeeData: { displayName: 'Cara', partySize: 4 },
    }),
  ];

  it('lists going RSVPs and hides names for hidden rows', () => {
    expect(publicAttendanceRows(responses, false)).toEqual([
      { displayName: 'Alice', alias: 'P-A', partySize: 2, visibility: 'public' },
      { displayName: undefined, alias: 'P-B', partySize: 3, visibility: 'hidden' },
    ]);
  });

  it('shows the stable alias instead of names for anonymous votes', () => {
    expect(publicAttendanceRows(responses, true)).toEqual([
      { displayName: undefined, alias: 'P-A', partySize: 2, visibility: 'public' },
      { displayName: undefined, alias: 'P-B', partySize: 3, visibility: 'hidden' },
    ]);
  });
});
