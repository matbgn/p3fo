import { describe, expect, it } from 'vitest';
import {
  allocationFromValues,
  budgetConfigError,
  budgetFromPreset,
  budgetNotes,
  budgetNoteTotal,
  budgetTotal,
  budgetUsesNotes,
  formatBudgetNotes,
  normalizeBudgetConfig,
  normalizeBudgetNotes,
  parseBudgetSubmission,
  resolveBudgetConfig,
  tallyBudget,
  validateBudgetDraftValues,
} from './budget';

const monopoly = {
  budget: { preset: 'monopoly' as const },
  maxPointsPerUser: 100,
};
const flexible = { maxPointsPerUser: 10, allowMultiple: true };

describe('budget presets', () => {
  it('gives the Monopoly preset a $100 total', () => {
    expect(budgetNoteTotal(budgetNotes({ budget: { preset: 'monopoly' } }) ?? [])).toBe(
      100,
    );
  });

  it('treats a missing or unknown preset as the flexible model', () => {
    expect(normalizeBudgetConfig(undefined)).toEqual({ preset: 'flexible' });
    expect(normalizeBudgetConfig({ preset: 'nope' as never })).toEqual({
      preset: 'flexible',
    });
    expect(budgetUsesNotes(flexible)).toBe(false);
  });

  it('resolves built-in presets from canonical notes and custom notes from input', () => {
    expect(budgetNotes({ budget: { preset: 'monopoly' } })).toEqual([
      { value: 20, count: 2 },
      { value: 10, count: 4 },
      { value: 5, count: 4 },
    ]);
    expect(
      budgetNotes({
        budget: {
          preset: 'custom',
          notes: [
            { value: 10, count: 1 },
            { value: 10, count: 2 },
            { value: 25, count: 2 },
          ],
        },
      }),
    ).toEqual([
      { value: 25, count: 2 },
      { value: 10, count: 3 },
    ]);
  });

  it('honours a stored note multiset for a built-in preset', () => {
    // A preset constant edit in a later release must not reinterpret a vote
    // whose notes were persisted when it was created.
    expect(
      normalizeBudgetConfig({
        preset: 'monopoly',
        notes: [
          { value: 50, count: 1 },
          { value: 10, count: 2 },
        ],
      }),
    ).toEqual({
      preset: 'monopoly',
      notes: [
        { value: 50, count: 1 },
        { value: 10, count: 2 },
      ],
    });
  });

  it('resolves the editor budget once so preview and save agree', () => {
    // Both the preview and the save payload go through this helper: a built-in
    // preset must keep the loaded multiset, not today's canonical constant.
    const stored = [
      { value: 50, count: 1 },
      { value: 10, count: 2 },
    ];
    expect(budgetFromPreset('monopoly', stored)).toEqual({
      preset: 'monopoly',
      notes: stored,
    });
    expect(budgetFromPreset('flexible', stored)).toEqual({ preset: 'flexible' });
  });

  it('falls back to flexible when custom notes are unusable', () => {
    expect(
      normalizeBudgetConfig({
        preset: 'custom',
        notes: [{ value: 0, count: 2 }],
      }),
    ).toEqual({ preset: 'flexible' });
  });

  it('drops invalid entries and caps the note multiset', () => {
    expect(
      normalizeBudgetNotes([
        { value: -5, count: 2 },
        { value: 5, count: 0 },
        { value: 10, count: 2.5 },
        { value: 20, count: 2 },
      ]),
    ).toEqual([{ value: 20, count: 2 }]);
  });

  it('rejects a custom variation with no usable note', () => {
    expect(budgetConfigError({ preset: 'custom', notes: [] })).toBeTruthy();
    expect(budgetConfigError({ preset: 'nope' })).toBeTruthy();
    expect(budgetConfigError({ preset: 'monopoly' })).toBeNull();
    expect(budgetConfigError(undefined)).toBeNull();
  });
});

describe('parseBudgetSubmission (flexible)', () => {
  it('accepts a whole allocation within the budget and drops zeros', () => {
    expect(
      parseBudgetSubmission(flexible, ['a', 'b', 'c'], {
        values: { a: 4, b: 6, c: 0 },
      }),
    ).toEqual({ values: { a: 4, b: 6 }, error: null });
    expect(
      parseBudgetSubmission(flexible, ['a', 'b'], {
        values: { a: 4, b: 7 },
      }).error,
    ).toMatch(/maximum of 10/);
  });

  it('rejects fractional, negative, unknown and excessive values', () => {
    expect(
      parseBudgetSubmission(flexible, ['a'], { values: { a: 1.5 } }).error,
    ).toBeTruthy();
    expect(
      parseBudgetSubmission(flexible, ['a'], { values: { a: -1 } }).error,
    ).toBeTruthy();
    expect(
      parseBudgetSubmission(flexible, ['a'], { values: { nope: 1 } }).error,
    ).toMatch(/unknown or inactive/);
    expect(
      parseBudgetSubmission(
        { maxPointsPerUser: 10, allowMultiple: false },
        ['a', 'b'],
        { values: { a: 2 } },
      ).error,
    ).toMatch(/at most one/);
  });
});

describe('parseBudgetSubmission (fixed notes)', () => {
  it('derives totals from the submitted note counts', () => {
    expect(
      parseBudgetSubmission(monopoly, ['p1', 'p2', 'p3'], {
        allocation: {
          p1: { '20': 1, '5': 1 },
          p2: { '10': 2 },
          p3: { '5': 0 },
        },
      }),
    ).toEqual({ values: { p1: 25, p2: 20 }, error: null });
  });

  it('rejects unknown notes, over-counts and inactive proposals', () => {
    expect(
      parseBudgetSubmission(monopoly, ['p1'], {
        allocation: { p1: { '25': 1 } },
      }).error,
    ).toMatch(/unknown note/);
    expect(
      parseBudgetSubmission(monopoly, ['p1'], {
        allocation: { p1: { '20': 3 } },
      }).error,
    ).toMatch(/only 2 available/);
    expect(
      parseBudgetSubmission(monopoly, ['p1'], {
        allocation: { nope: { '20': 1 } },
      }).error,
    ).toMatch(/unknown or inactive/);
    expect(
      parseBudgetSubmission(monopoly, ['p1'], {
        allocation: { p1: { '20': 1.5 } },
      }).error,
    ).toMatch(/non-negative integers/);
  });

  it('requires an allocation object for fixed-note votes', () => {
    expect(
      parseBudgetSubmission(monopoly, ['p1'], { values: { p1: 20 } }).error,
    ).toMatch(/allocation/);
  });

  it('rejects a bucket flooded with alias keys of one note value', () => {
    // All of these coerce to 20 but are distinct JSON keys; without the
    // per-bucket bound the public route would scan every one of them.
    const bucket: Record<string, number> = { '20': 0 };
    for (let index = 1; index <= 50; index += 1) {
      bucket[`20.${'0'.repeat(index)}`] = 0;
    }
    expect(
      parseBudgetSubmission(monopoly, ['p1'], { allocation: { p1: bucket } })
        .error,
    ).toMatch(/unknown note value/);
  });
});

describe('budget draft and reconstruction', () => {
  it('rejects draft totals the note multiset cannot produce', () => {
    expect(
      validateBudgetDraftValues(
        { budget: { preset: 'custom', notes: [{ value: 10, count: 2 }] } },
        { p1: 15 },
      ),
    ).toMatch(/cannot be formed/);
    // An over-budget draft is rejected by the cheap total check before any
    // per-proposal knapsack work.
    expect(
      validateBudgetDraftValues(
        { budget: { preset: 'custom', notes: [{ value: 10, count: 1 }] } },
        { p1: 15 },
      ),
    ).toMatch(/exceeds the maximum/);
    expect(validateBudgetDraftValues(monopoly, { p1: 35 })).toBeNull();
  });

  it('reconstructs a valid note breakdown from persisted totals', () => {
    const allocation = allocationFromValues(
      { p1: 25, p2: 20 },
      budgetNotes(monopoly) ?? [],
    );
    expect(allocation).not.toBeNull();
    const totals = Object.fromEntries(
      Object.entries(allocation ?? {}).map(([id, bucket]) => [
        id,
        Object.entries(bucket).reduce(
          (sum, [value, count]) => sum + Number(value) * count,
          0,
        ),
      ]),
    );
    expect(totals).toEqual({ p1: 25, p2: 20 });
  });

  it('returns null when no note set can explain the totals', () => {
    expect(
      allocationFromValues({ p1: 15 }, [{ value: 10, count: 1 }]),
    ).toBeNull();
  });

  it('falls back to the bounded search when the greedy pass cannot fit the totals', () => {
    // Greedy takes the $10 note for the first target and strands the $1 it
    // cannot pay, so only the bounded search can find 11 = 6 + 5.
    const notes = [
      { value: 10, count: 2 },
      { value: 6, count: 2 },
      { value: 5, count: 2 },
    ];
    const allocation = allocationFromValues({ p1: 11, p2: 10, p3: 6 }, notes);
    expect(allocation).not.toBeNull();
    const totals = Object.fromEntries(
      Object.entries(allocation ?? {}).map(([id, bucket]) => [
        id,
        Object.entries(bucket).reduce(
          (sum, [value, count]) => sum + Number(value) * count,
          0,
        ),
      ]),
    );
    expect(totals).toEqual({ p1: 11, p2: 10, p3: 6 });
  });

  it('degrades to null instead of unbounded work for a wide unfittable ballot', () => {
    // 400 backed proposals with a deck whose greedy pass always fails must not
    // turn the public-page reconstruction into a multi-second scan. The work
    // budget is charged per node, per memo key character and per candidate, so
    // this returns `null` (read-only ballot) rather than exploring them all.
    const notes = [
      { value: 7, count: 200 },
      { value: 4, count: 200 },
    ];
    const values = Object.fromEntries(
      Array.from({ length: 400 }, (_, index) => [`p${index}`, 6]),
    );
    expect(allocationFromValues(values, notes)).toBeNull();
  });

  it('checks bounded coin sums through the draft validator', () => {
    // A custom deck of 2×$20 + 1×$10 can form 30, 40 and 50 but not 25.
    const deck = {
      budget: {
        preset: 'custom' as const,
        notes: [
          { value: 20, count: 2 },
          { value: 10, count: 1 },
        ],
      },
    };
    for (const value of [30, 40, 50]) {
      expect(validateBudgetDraftValues(deck, { p1: value })).toBeNull();
    }
    expect(validateBudgetDraftValues(deck, { p1: 25 })).toMatch(
      /cannot be formed/,
    );
  });
});

describe('tallyBudget', () => {
  it('sums the amount and counts the voters who backed the proposal', () => {
    const tally = tallyBudget(
      [
        { proposalId: 'a', value: 20 },
        { proposalId: 'a', value: 5 },
        { proposalId: 'a', value: 0 },
        { proposalId: 'b', value: 30 },
      ],
      'a',
    );
    expect(tally).toEqual({ total: 25, backers: 2 });
  });
});

describe('budget formatting', () => {
  it('renders the note multiset', () => {
    expect(
      formatBudgetNotes([
        { value: 20, count: 2 },
        { value: 5, count: 4 },
      ]),
    ).toBe('2×$20 + 4×$5');
  });

  it('uses the notes total when present', () => {
    expect(budgetTotal(monopoly)).toBe(100);
    expect(budgetTotal(flexible)).toBe(10);
  });
});

describe('resolveBudgetConfig', () => {
  it('derives a flexible total from the requested cap', () => {
    expect(
      resolveBudgetConfig({
        requestedBudget: undefined,
        budgetProvided: false,
        requestedMaxPointsPerUser: 25,
        maxProvided: true,
      }),
    ).toEqual({
      budget: { preset: 'flexible' },
      maxPointsPerUser: 25,
      error: null,
    });
  });

  it('derives a fixed-note total from the resolved notes', () => {
    expect(
      resolveBudgetConfig({
        requestedBudget: { preset: 'monopoly' },
        budgetProvided: true,
        requestedMaxPointsPerUser: 5,
        maxProvided: true,
      }),
    ).toEqual({
      budget: {
        preset: 'monopoly',
        notes: [
          { value: 20, count: 2 },
          { value: 10, count: 4 },
          { value: 5, count: 4 },
        ],
      },
      maxPointsPerUser: 100,
      error: null,
    });
  });

  it('rejects a non-positive flexible cap', () => {
    const result = resolveBudgetConfig({
      requestedBudget: { preset: 'flexible' },
      budgetProvided: true,
      requestedMaxPointsPerUser: 0,
      maxProvided: true,
    });
    expect(result.error).toBe('maxPointsPerUser must be a positive integer');
  });

  it('keeps the stored values when the request omits them', () => {
    expect(
      resolveBudgetConfig({
        requestedBudget: undefined,
        budgetProvided: false,
        requestedMaxPointsPerUser: undefined,
        maxProvided: false,
        fallbackBudget: { preset: 'flexible' },
        fallbackMaxPointsPerUser: 40,
      }),
    ).toEqual({
      budget: { preset: 'flexible' },
      maxPointsPerUser: 40,
      error: null,
    });
  });
});
