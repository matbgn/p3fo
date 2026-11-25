import { describe, it, expect } from 'vitest';
import { Temporal } from '@js-temporal/polyfill';
import type {
  SchedulingConfig,
  VoteProposal,
  VoteResponseEntity,
} from './persistence-types';
import {
  DEFAULT_MAX_SLOTS,
  MAX_SCHEDULING_SLOTS,
  findActiveSchedulingSlot,
  formatSchedulingDateKey,
  formatSchedulingDay,
  formatSchedulingRange,
  formatNormalizedSchedulingRunLabel,
  generateSchedulingSlots,
  normalizeSchedulingConfig,
  prunedSchedulingSlotKeys,
  schedulingBestSlotIds,
  schedulingRunHasAvailability,
  schedulingRunLength,
  schedulingSlotIdentity,
  tallyScheduling,
  topSchedulingRuns,
  validateSchedulingConfig,
} from './scheduling';

const baseConfig = (overrides: Partial<SchedulingConfig> = {}): SchedulingConfig => ({
  timeZone: 'UTC',
  granularityMinutes: 60,
  durationMinutes: 120,
  dates: ['2026-01-02', '2026-01-01'],
  dayStart: '09:00',
  dayEnd: '11:00',
  allowIfNeeded: false,
  maxSlots: DEFAULT_MAX_SLOTS,
  ...overrides,
});

const slotProposal = (
  id: string,
  startAt: string,
  endAt: string,
  active = true,
): VoteProposal => ({
  id,
  content: '',
  position: 0,
  active,
  timeSlot: { startAt, endAt },
});

const response = (
  id: string,
  proposalId: string,
  voterAlias: string,
  value: number,
  displayName?: string,
): VoteResponseEntity => ({
  id,
  voteId: 'vote-1',
  proposalId,
  userId: null,
  voterToken: `token-${voterAlias}`,
  voterAlias,
  value,
  submittedAt: '2026-01-01T00:00:00.000Z',
  ...(displayName
    ? { attendeeData: { displayName, visibility: 'hidden' as const } }
    : {}),
});

describe('normalizeSchedulingConfig', () => {
  it('clamps granularity and rounds duration to a multiple', () => {
    const config = normalizeSchedulingConfig({
      granularityMinutes: 20 as unknown as 30,
      durationMinutes: 50,
      dates: ['2026-01-02', '2026-01-01', '2026-01-01', 'nope'],
    });
    expect(config.granularityMinutes).toBe(30);
    expect(config.durationMinutes).toBe(60);
    expect(config.dates).toEqual(['2026-01-01', '2026-01-02']);
  });

  it('clamps maxSlots into the supported range', () => {
    expect(normalizeSchedulingConfig({ maxSlots: 0 }).maxSlots).toBe(1);
    expect(normalizeSchedulingConfig({ maxSlots: 5000 }).maxSlots).toBe(1000);
    expect(normalizeSchedulingConfig(undefined).maxSlots).toBe(DEFAULT_MAX_SLOTS);
  });

  it('falls back to valid HH:mm times', () => {
    const config = normalizeSchedulingConfig({
      dayStart: '25:00',
      dayEnd: '9:00',
    });
    expect(config.dayStart).toBe('09:00');
    expect(config.dayEnd).toBe('17:00');
  });

  it('bounds the dates it parses instead of walking an unbounded input', () => {
    // A valid poll can never use more dates than the slot cap, so an oversized
    // list must not force Temporal parsing and a full sort of every entry.
    const dates = Array.from({ length: MAX_SCHEDULING_SLOTS + 500 }, (_, index) =>
      Temporal.PlainDate.from('2026-01-01').add({ days: index }).toString(),
    );
    const config = normalizeSchedulingConfig({ dates });
    expect(config.dates.length).toBeLessThanOrEqual(MAX_SCHEDULING_SLOTS + 1);
    // The retained overflow entry keeps the oversized list rejecting rather than
    // silently passing as a truncated valid config.
    expect(
      validateSchedulingConfig(baseConfig({ unit: 'day', dates })),
    ).toMatch(/maximum|exceeds/i);
  });
});

describe('validateSchedulingConfig', () => {
  it('requires dates', () => {
    expect(validateSchedulingConfig(baseConfig({ dates: [] }))).toMatch(/date/i);
  });

  it('rejects a daily range that ends before it starts', () => {
    expect(
      validateSchedulingConfig(
        baseConfig({ dayStart: '17:00', dayEnd: '09:00' }),
      ),
    ).toMatch(/end time/i);
  });

  it('rejects an invalid IANA time zone', () => {
    expect(
      validateSchedulingConfig(baseConfig({ timeZone: 'Not/AZone' })),
    ).toMatch(/time zone/i);
  });

  it('rejects a slot count above maxSlots', () => {
    expect(
      validateSchedulingConfig(baseConfig({ maxSlots: 2 })),
    ).toMatch(/exceeds/i);
  });

  it('counts the supplied slots, not the DST-inflated grid, for maxSlots', () => {
    // A spring-forward day makes the theoretical grid (6 slots) larger than what
    // the generator actually produces (4 slots). Validation must accept the
    // generated set the editor is about to save instead of rejecting it.
    const config = baseConfig({
      timeZone: 'Europe/Zurich',
      granularityMinutes: 30,
      durationMinutes: 30,
      dates: ['2026-03-29'],
      dayStart: '01:00',
      dayEnd: '04:00',
      maxSlots: 4,
    });
    const { proposals, error } = generateSchedulingSlots(config);
    expect(error).toBeNull();
    expect(proposals).toHaveLength(4);
    expect(validateSchedulingConfig(config, proposals)).toBeNull();
  });

  it('rejects a daily window that cannot fit the meeting duration', () => {
    expect(
      validateSchedulingConfig(
        baseConfig({
          granularityMinutes: 30,
          durationMinutes: 60,
          dayStart: '09:00',
          dayEnd: '09:35',
        }),
      ),
    ).toMatch(/too short|duration/i);
  });

  it('accepts a daily window that exactly fits the meeting duration', () => {
    expect(
      validateSchedulingConfig(
        baseConfig({
          granularityMinutes: 30,
          durationMinutes: 60,
          dayStart: '09:00',
          dayEnd: '10:00',
        }),
      ),
    ).toBeNull();
  });

  it('requires a time slot on every active proposal', () => {
    const proposals: VoteProposal[] = [
      { id: 'a', content: '', position: 0, active: true },
    ];
    expect(validateSchedulingConfig(baseConfig(), proposals)).toMatch(
      /time slot/i,
    );
  });

  it('rejects a proposal whose start is not before its end', () => {
    const proposals = [
      slotProposal('a', '2026-01-01T10:00:00.000Z', '2026-01-01T09:00:00.000Z'),
    ];
    expect(validateSchedulingConfig(baseConfig(), proposals)).toMatch(/before/i);
  });

  it('rejects a pruned slot set that no longer holds one meeting', () => {
    const proposals = [
      slotProposal('a', '2026-01-01T09:00:00.000Z', '2026-01-01T09:30:00.000Z'),
      slotProposal('b', '2026-01-01T11:00:00.000Z', '2026-01-01T11:30:00.000Z'),
    ];
    expect(validateSchedulingConfig(baseConfig(), proposals)).toMatch(
      /cannot fit/i,
    );
  });

  it('accepts a pruned slot set that still has a contiguous window', () => {
    const proposals = [
      slotProposal('a', '2026-01-01T09:00:00.000Z', '2026-01-01T10:00:00.000Z'),
      slotProposal('b', '2026-01-01T10:00:00.000Z', '2026-01-01T11:00:00.000Z'),
    ];
    expect(validateSchedulingConfig(baseConfig(), proposals)).toBeNull();
  });

  it('requires at least one active slot when proposals are supplied', () => {
    expect(validateSchedulingConfig(baseConfig(), [])).toMatch(
      /active time slot/i,
    );
  });
});

describe('generateSchedulingSlots', () => {
  it('generates slots in ascending order with sequential positions', () => {
    const { proposals, error } = generateSchedulingSlots(baseConfig());
    expect(error).toBeNull();
    expect(proposals).toHaveLength(4);
    expect(proposals.map((proposal) => proposal.timeSlot?.startAt)).toEqual([
      '2026-01-01T09:00:00Z',
      '2026-01-01T10:00:00Z',
      '2026-01-02T09:00:00Z',
      '2026-01-02T10:00:00Z',
    ]);
    expect(proposals.map((proposal) => proposal.position)).toEqual([0, 1, 2, 3]);
    expect(proposals.every((proposal) => proposal.active)).toBe(true);
    expect(proposals.every((proposal) => proposal.content === '')).toBe(true);
    expect(proposals[0].timeSlot?.endAt).toBe('2026-01-01T10:00:00Z');
  });

  it('returns an error instead of slots for an invalid config', () => {
    const { proposals, error } = generateSchedulingSlots(
      baseConfig({ dates: [] }),
    );
    expect(proposals).toEqual([]);
    expect(error).toMatch(/date/i);
  });

  it('caps generated slots at maxSlots and reports an error', () => {
    const { proposals, error } = generateSchedulingSlots(
      baseConfig({ maxSlots: 2 }),
    );
    expect(proposals).toHaveLength(2);
    expect(proposals.map((proposal) => proposal.timeSlot?.startAt)).toEqual([
      '2026-01-01T09:00:00Z',
      '2026-01-01T10:00:00Z',
    ]);
    expect(error).toMatch(/maximum/i);
  });

  it('skips DST spring-forward gaps in Europe/Zurich', () => {
    const { proposals, error } = generateSchedulingSlots(
      baseConfig({
        timeZone: 'Europe/Zurich',
        granularityMinutes: 30,
        durationMinutes: 30,
        dates: ['2026-03-29'],
        dayStart: '01:00',
        dayEnd: '04:00',
      }),
    );
    expect(error).toBeNull();
    const localTimes = proposals.map((proposal) =>
      Temporal.Instant.from(proposal.timeSlot!.startAt)
        .toZonedDateTimeISO('Europe/Zurich')
        .toPlainTime()
        .toString({ smallestUnit: 'minute' }),
    );
    expect(localTimes).toEqual(['01:00', '01:30', '03:00', '03:30']);
    expect(
      proposals.map((proposal) =>
        formatSchedulingDateKey(
          proposal.timeSlot!.startAt,
          'Europe/Zurich',
        ),
      ),
    ).toEqual(['2026-03-29', '2026-03-29', '2026-03-29', '2026-03-29']);
  });
});

describe('findActiveSchedulingSlot', () => {
  const proposals: VoteProposal[] = [
    slotProposal('active', '2026-01-02T09:00:00Z', '2026-01-02T09:30:00Z'),
    slotProposal(
      'inactive',
      '2026-01-02T09:30:00Z',
      '2026-01-02T10:00:00Z',
      false,
    ),
  ];

  it('returns the active slot with a matching id', () => {
    expect(findActiveSchedulingSlot(proposals, 'active')?.id).toBe('active');
  });

  it('rejects inactive, unknown and missing slot ids', () => {
    expect(findActiveSchedulingSlot(proposals, 'inactive')).toBeUndefined();
    expect(findActiveSchedulingSlot(proposals, 'missing')).toBeUndefined();
    expect(findActiveSchedulingSlot(proposals, null)).toBeUndefined();
  });
});

describe('formatSchedulingRange', () => {
  it('does not invert a range that crosses a DST fall-back', () => {
    // Europe/Zurich falls back on 2026-10-25. 02:30 CEST (00:30Z) plus 30
    // minutes is 02:00 CET (01:00Z), so the local wall clock runs backwards
    // even though the instants are ordered. Printing only the two clock times
    // would read as "02:30 – 02:00".
    const label = formatSchedulingRange(
      '2026-10-25T00:30:00Z',
      '2026-10-25T01:00:00Z',
      'Europe/Zurich',
    );
    expect(label).toContain('02:30');
    expect(label).toContain('02:00');
    // The offset disambiguates the two ends instead of inverting the range.
    expect(label).toMatch(/GMT\+2|UTC\+2/);
    expect(label).toMatch(/GMT\+1|UTC\+1/);
  });

  it('keeps the plain same-day format for ordinary slots', () => {
    const label = formatSchedulingRange(
      '2026-01-02T09:00:00Z',
      '2026-01-02T10:00:00Z',
      'UTC',
    );
    expect(label).toMatch(/09?:00/);
    expect(label).toContain('10:00');
    expect(label).not.toMatch(/GMT|UTC/);
  });
});

describe('schedulingRunLength', () => {
  it('divides duration by granularity', () => {
    expect(schedulingRunLength(baseConfig())).toBe(2);
    expect(
      schedulingRunLength(
        baseConfig({ granularityMinutes: 15, durationMinutes: 60 }),
      ),
    ).toBe(4);
  });
});

describe('tallyScheduling', () => {
  const config = baseConfig({
    granularityMinutes: 30,
    durationMinutes: 60,
    dates: ['2026-01-01'],
    dayStart: '09:00',
    dayEnd: '11:00',
  });
  const proposals: VoteProposal[] = [
    slotProposal('s1', '2026-01-01T09:00:00Z', '2026-01-01T09:30:00Z'),
    slotProposal('s2', '2026-01-01T09:30:00Z', '2026-01-01T10:00:00Z'),
    slotProposal('s3', '2026-01-01T10:00:00Z', '2026-01-01T10:30:00Z'),
    slotProposal('s4', '2026-01-01T10:30:00Z', '2026-01-01T11:00:00Z'),
  ];
  const responses: VoteResponseEntity[] = [
    response('r1', 's1', 'alice', 1),
    response('r2', 's2', 'alice', 1),
    response('r3', 's3', 'alice', 1),
    response('r4', 's4', 'alice', 1),
    response('r5', 's1', 'bob', 1, 'Bob'),
    response('r6', 's2', 'bob', 0),
    response('r7', 's3', 'bob', 0),
    response('r8', 's4', 'bob', -1),
    response('r9', 's2', 'carol', 1),
    response('r10', 's3', 'carol', 1),
    response('r11', 's4', 'carol', 1),
  ];

  it('counts values per slot and includes participant display names', () => {
    const tally = tallyScheduling(responses, proposals, config);
    expect(tally.totalVoters).toBe(3);
    expect(tally.slots.map((slot) => slot.proposalId)).toEqual([
      's1',
      's2',
      's3',
      's4',
    ]);
    expect(tally.slots[0]).toMatchObject({ available: 2, ifNeeded: 0, unavailable: 0 });
    expect(tally.slots[1]).toMatchObject({ available: 2, ifNeeded: 1, unavailable: 0 });
    expect(tally.slots[3]).toMatchObject({ available: 2, ifNeeded: 0, unavailable: 1 });
    expect(tally.participants.map((participant) => participant.alias)).toEqual([
      'alice',
      'bob',
      'carol',
    ]);
    expect(
      tally.participants.find((participant) => participant.alias === 'bob')
        ?.displayName,
    ).toBe('Bob');
  });

  it('groups by the moderator digest so a colliding public alias does not merge voters', () => {
    const colliding: VoteResponseEntity[] = [
      { ...response('c1', 's1', 'same', 1), participantId: 'digest-alice' },
      { ...response('c2', 's1', 'same', -1), participantId: 'digest-bob' },
    ];

    const tally = tallyScheduling(colliding, proposals, config);

    expect(tally.totalVoters).toBe(2);
    expect(tally.participants).toHaveLength(2);
    expect(tally.participants.map((participant) => participant.alias)).toEqual([
      'same',
      'same',
    ]);
    expect(new Set(tally.participants.map((participant) => participant.key)).size).toBe(2);
    expect(tally.slots[0]).toMatchObject({ available: 1, unavailable: 1 });
  });

  it('builds contiguous runs and sorts them by availability', () => {
    const tally = tallyScheduling(responses, proposals, config);
    expect(tally.runs).toHaveLength(3);
    expect(tally.runs.map((run) => run.slotIds)).toEqual([
      ['s2', 's3'],
      ['s3', 's4'],
      ['s1', 's2'],
    ]);
    expect(tally.runs[0]).toMatchObject({
      startAt: '2026-01-01T09:30:00Z',
      endAt: '2026-01-01T10:30:00Z',
      available: 2,
      ifNeeded: 1,
      unavailable: 0,
    });
  });

  it('breaks equal run scores by earliest start', () => {
    const tieProposals: VoteProposal[] = [
      '09:00',
      '09:30',
      '10:00',
      '10:30',
      '11:00',
      '11:30',
    ].map((time, index) => {
      const startMinutes = 9 * 60 + index * 30;
      const hours = Math.floor(startMinutes / 60);
      const minutes = startMinutes % 60;
      const startAt = `2026-01-01T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00Z`;
      const endMinutes = startMinutes + 30;
      const endAt = `2026-01-01T${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}:00Z`;
      return slotProposal(`t${index}`, startAt, endAt);
    });
    const tieResponses = tieProposals.flatMap((proposal) => [
      response(`a-${proposal.id}`, proposal.id, 'alice', 1),
      response(`b-${proposal.id}`, proposal.id, 'bob', 0),
    ]);

    const tally = tallyScheduling(tieResponses, tieProposals, config);
    expect(tally.runs).toHaveLength(5);
    expect(tally.runs[0]?.startAt).toBe('2026-01-01T09:00:00Z');
  });

  it('ignores inactive proposals and active proposals without a time slot', () => {
    const mixed = [
      ...proposals,
      slotProposal('inactive', '2026-01-01T11:00:00Z', '2026-01-01T11:30:00Z', false),
      { id: 'no-slot', content: '', position: 5, active: true },
    ];
    const withExtraResponse = [
      ...responses,
      response('r12', 'inactive', 'dave', 1),
      response('r13', 'no-slot', 'dave', 1),
    ];
    const tally = tallyScheduling(withExtraResponse, mixed, config);
    expect(tally.slots.map((slot) => slot.proposalId)).toEqual([
      's1',
      's2',
      's3',
      's4',
    ]);
    expect(tally.participants.map((participant) => participant.alias)).not.toContain(
      'dave',
    );
  });
});

const dayConfig = (
  overrides: Partial<SchedulingConfig> = {},
): SchedulingConfig =>
  baseConfig({ unit: 'day', timeZone: 'Europe/Zurich', ...overrides });

describe('day scheduling generation', () => {
  it('generates one proposal per date at local midnight in Europe/Zurich', () => {
    const { proposals, error } = generateSchedulingSlots(
      dayConfig({ dates: ['2026-06-02', '2026-06-01'] }),
    );
    expect(error).toBeNull();
    expect(proposals).toHaveLength(2);
    expect(proposals.map((proposal) => proposal.id)).toEqual([
      'day-2026-06-01',
      'day-2026-06-02',
    ]);
    expect(proposals.map((proposal) => proposal.timeSlot?.startAt)).toEqual([
      '2026-05-31T22:00:00Z',
      '2026-06-01T22:00:00Z',
    ]);
    expect(proposals.map((proposal) => proposal.timeSlot?.endAt)).toEqual([
      '2026-06-01T22:00:00Z',
      '2026-06-02T22:00:00Z',
    ]);
    expect(proposals.map((proposal) => proposal.position)).toEqual([0, 1]);
    expect(
      proposals.every(
        (proposal) =>
          proposal.content === '' &&
          proposal.description === '' &&
          proposal.active,
      ),
    ).toBe(true);
  });

  it('keeps midnight boundaries stable across the spring-forward change', () => {
    const { proposals, error } = generateSchedulingSlots(
      dayConfig({ dates: ['2026-03-29'] }),
    );
    expect(error).toBeNull();
    // 29 March 2026 is a 23-hour day in Europe/Zurich.
    expect(proposals[0].timeSlot?.startAt).toBe('2026-03-28T23:00:00Z');
    expect(proposals[0].timeSlot?.endAt).toBe('2026-03-29T22:00:00Z');
  });

  it('caps at maxSlots and reports an error', () => {
    const { proposals, error } = generateSchedulingSlots(
      dayConfig({ dates: ['2026-06-01', '2026-06-02'], maxSlots: 1 }),
    );
    expect(proposals).toHaveLength(1);
    expect(proposals[0].id).toBe('day-2026-06-01');
    expect(error).toMatch(/maximum|more than/i);
  });
});

describe('validateSchedulingConfig in day mode', () => {
  it('does not require the daily window or duration settings', () => {
    expect(
      validateSchedulingConfig(
        dayConfig({
          dates: ['2026-06-01'],
          dayStart: '17:00',
          dayEnd: '09:00',
          durationMinutes: 0,
          granularityMinutes: 0 as unknown as 30,
        }),
      ),
    ).toBeNull();
  });

  it('requires at least one date', () => {
    expect(validateSchedulingConfig(dayConfig({ dates: [] }))).toMatch(/date/i);
  });

  it('rejects an invalid IANA time zone', () => {
    expect(
      validateSchedulingConfig(
        dayConfig({ dates: ['2026-06-01'], timeZone: 'Not/AZone' }),
      ),
    ).toMatch(/time zone/i);
  });

  it('requires a time slot on every active proposal', () => {
    const proposals: VoteProposal[] = [
      { id: 'a', content: '', position: 0, active: true },
    ];
    expect(
      validateSchedulingConfig(dayConfig({ dates: ['2026-06-01'] }), proposals),
    ).toMatch(/time slot/i);
  });

  it('rejects a proposal whose day does not end after it starts', () => {
    const proposals = [
      slotProposal('a', '2026-06-02T00:00:00.000Z', '2026-06-01T00:00:00.000Z'),
    ];
    expect(
      validateSchedulingConfig(dayConfig({ dates: ['2026-06-01'] }), proposals),
    ).toMatch(/before/i);
  });
});

describe('schedulingRunLength in day mode', () => {
  it('is exactly one day regardless of duration and granularity', () => {
    expect(
      schedulingRunLength(
        dayConfig({ dates: ['2026-06-01'], durationMinutes: 0 }),
      ),
    ).toBe(1);
  });
});

describe('tallyScheduling in day mode', () => {
  const config = dayConfig({
    dates: ['2026-06-01', '2026-06-02', '2026-06-03'],
  });
  const { proposals } = generateSchedulingSlots(config);
  const responses: VoteResponseEntity[] = [
    ...proposals.map((proposal) =>
      response(`a-${proposal.id}`, proposal.id, 'alice', 1),
    ),
    response('b1', 'day-2026-06-01', 'bob', 1),
    response('b2', 'day-2026-06-02', 'bob', 1),
    response('b3', 'day-2026-06-03', 'bob', -1),
    response('c1', 'day-2026-06-01', 'carol', -1),
    response('c2', 'day-2026-06-02', 'carol', -1),
    response('c3', 'day-2026-06-03', 'carol', -1),
  ];

  it('builds one run per day and breaks ties by the earliest day', () => {
    const tally = tallyScheduling(responses, proposals, config);
    expect(tally.runs).toHaveLength(3);
    expect(tally.runs.map((run) => run.slotIds)).toEqual([
      ['day-2026-06-01'],
      ['day-2026-06-02'],
      ['day-2026-06-03'],
    ]);
    expect(tally.runs[0]).toMatchObject({
      available: 2,
      ifNeeded: 0,
      unavailable: 1,
    });
    expect(tally.runs[0]?.startAt).toBe('2026-05-31T22:00:00Z');
  });
});

describe('formatNormalizedSchedulingRunLabel', () => {
  it('formats a whole day for day scheduling', () => {
    const run = {
      startAt: '2026-05-31T22:00:00Z',
      endAt: '2026-06-01T22:00:00Z',
    };
    const label = formatNormalizedSchedulingRunLabel(
      run,
      dayConfig({ dates: ['2026-06-01'] }),
    );
    expect(label).toBe(formatSchedulingDay(run.startAt, 'Europe/Zurich'));
    expect(label).not.toContain('–');
    expect(label).toContain('2026');
  });

  it('keeps the time range for time scheduling', () => {
    const label = formatNormalizedSchedulingRunLabel(
      { startAt: '2026-01-01T09:00:00Z', endAt: '2026-01-01T11:00:00Z' },
      baseConfig(),
    );
    expect(label).toContain('–');
  });
});


describe('topSchedulingRuns', () => {
  const config = baseConfig({
    dates: ['2026-01-01'],
    dayStart: '09:00',
    dayEnd: '12:00',
    granularityMinutes: 60,
    durationMinutes: 60,
    allowIfNeeded: true,
  });
  const proposals = generateSchedulingSlots(config).proposals;
  const [first, second, third] = proposals;

  it('keeps only the runs tied at the maximum availability', () => {
    const tally = tallyScheduling(
      [
        response('r1', first.id, 'a', 1),
        response('r2', second.id, 'a', 1),
        response('r3', third.id, 'a', 1),
        response('r4', first.id, 'b', 1),
        response('r5', second.id, 'b', -1),
        response('r6', third.id, 'b', 1),
      ],
      proposals,
      config,
    );
    expect(topSchedulingRuns(tally).map((run) => run.startAt)).toEqual([
      first.timeSlot?.startAt,
      third.timeSlot?.startAt,
    ]);
    expect(schedulingBestSlotIds(tally)).toEqual([first.id, third.id]);
  });

  it('falls back to the best if-needed runs when nobody is fully available', () => {
    const tally = tallyScheduling(
      [
        response('r1', first.id, 'a', 0),
        response('r2', second.id, 'a', -1),
        response('r3', third.id, 'a', 0),
        response('r4', first.id, 'b', 0),
        response('r5', second.id, 'b', 0),
        response('r6', third.id, 'b', -1),
      ],
      proposals,
      config,
    );
    expect(topSchedulingRuns(tally).map((run) => run.startAt)).toEqual([
      first.timeSlot?.startAt,
    ]);
  });

  it('returns no best runs when every run has an unavailable participant', () => {
    const tally = tallyScheduling(
      [
        response('r1', first.id, 'a', -1),
        response('r2', second.id, 'a', -1),
        response('r3', third.id, 'a', -1),
      ],
      proposals,
      config,
    );
    expect(topSchedulingRuns(tally)).toEqual([]);
    expect(schedulingBestSlotIds(tally)).toEqual([]);
  });
});

describe('schedulingRunHasAvailability', () => {
  it('accepts runs with an available or if-needed answer and rejects the rest', () => {
    expect(schedulingRunHasAvailability({ available: 1, ifNeeded: 0 })).toBe(true);
    expect(schedulingRunHasAvailability({ available: 0, ifNeeded: 1 })).toBe(true);
    expect(schedulingRunHasAvailability({ available: 0, ifNeeded: 0 })).toBe(false);
  });
});

describe('schedulingSlotIdentity', () => {
  it('keeps a pruned slot identified by its local wall-clock after the zone changes', () => {
    const config = baseConfig({
      timeZone: 'Europe/Zurich',
      dates: ['2026-01-15'],
      dayStart: '09:00',
      dayEnd: '11:00',
      granularityMinutes: 60,
      durationMinutes: 60,
    });
    const zurichSlot = generateSchedulingSlots(config).proposals[0];
    const tokyoSlot = generateSchedulingSlots({
      ...config,
      timeZone: 'Asia/Tokyo',
    }).proposals[0];

    expect(zurichSlot.timeSlot?.startAt).not.toBe(tokyoSlot.timeSlot?.startAt);
    expect(
      schedulingSlotIdentity(zurichSlot, 'time', 'Europe/Zurich'),
    ).toBe(schedulingSlotIdentity(tokyoSlot, 'time', 'Asia/Tokyo'));
  });

  it('uses the proposal id for whole-day slots', () => {
    const proposal = slotProposal(
      'day-2026-06-01',
      '2026-05-31T22:00:00Z',
      '2026-06-01T22:00:00Z',
    );
    expect(schedulingSlotIdentity(proposal, 'day', 'Europe/Zurich')).toBe(
      'day-2026-06-01',
    );
  });
});

describe('prunedSchedulingSlotKeys', () => {
  it('recovers a pruned time slot from the saved proposal set', () => {
    const config = baseConfig();
    const full = generateSchedulingSlots(config).proposals;
    const saved = full.slice(1);
    const expected = schedulingSlotIdentity(full[0], 'time', 'UTC');

    expect(prunedSchedulingSlotKeys(config, saved)).toEqual([expected]);
    expect(prunedSchedulingSlotKeys(config, full)).toEqual([]);
  });

  it('recovers a pruned whole-day slot from the saved proposal set', () => {
    const config = baseConfig({ unit: 'day', dates: ['2026-01-01', '2026-01-02'] });
    const full = generateSchedulingSlots(config).proposals;
    const saved = full.filter((proposal) => proposal.id === 'day-2026-01-02');

    expect(prunedSchedulingSlotKeys(config, saved)).toEqual(['day-2026-01-01']);
  });

  it('returns no removals when nothing was saved', () => {
    expect(prunedSchedulingSlotKeys(baseConfig(), [])).toEqual([]);
  });
});
