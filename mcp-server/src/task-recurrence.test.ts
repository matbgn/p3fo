import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  adjustRecurrenceForAnchorMove,
  validateRecurrenceAnchor,
} from './task-recurrence.js';

describe('recurrence anchor validation', () => {
  it('rejects a recurrence without a planned date', () => {
    assert.match(
      validateRecurrenceAnchor(null, '{"type":"daily","every":1}') ?? '',
      /plannedDate/,
    );
  });

  it('rejects an until date before the planned date', () => {
    assert.match(
      validateRecurrenceAnchor(
        '2026-03-10',
        '{"type":"daily","every":1,"until":"2026-03-09"}',
      ) ?? '',
      /until/,
    );
  });

  it('accepts a rule anchored on its planned date', () => {
    assert.equal(
      validateRecurrenceAnchor(
        '2026-03-10',
        '{"type":"daily","every":1,"until":"2026-03-10"}',
      ),
      null,
    );
  });

  it('does not require an anchor when the recurrence is cleared', () => {
    assert.equal(validateRecurrenceAnchor(null, null), null);
  });
});

describe('recurrence anchor move adjustment', () => {
  it('shifts the rule end date when the anchor moves', () => {
    const adjusted = adjustRecurrenceForAnchorMove(
      JSON.stringify({ type: 'weekly', weekdays: [1], until: '2026-03-31' }),
      '2026-03-02',
      '2026-03-09',
    );

    assert.deepEqual(JSON.parse(adjusted as string), {
      type: 'weekly',
      weekdays: [1],
      until: '2026-04-07',
    });
    assert.equal(validateRecurrenceAnchor('2026-03-09', adjusted), null);
  });

  it('clamps a legacy until that is still before the new anchor', () => {
    const adjusted = adjustRecurrenceForAnchorMove(
      JSON.stringify({ type: 'daily', every: 1, until: '2026-03-01' }),
      '2026-03-02',
      '2026-03-10',
    );

    assert.deepEqual(JSON.parse(adjusted as string), {
      type: 'daily',
      every: 1,
      until: '2026-03-10',
    });
  });

  it('clears the rule when the anchor is cleared', () => {
    assert.equal(
      adjustRecurrenceForAnchorMove(
        JSON.stringify({ type: 'daily', every: 1 }),
        '2026-03-02',
        null,
      ),
      null,
    );
  });

  it('leaves rules without an anchor or without an until unchanged', () => {
    const rule = JSON.stringify({ type: 'daily', every: 2 });
    assert.deepEqual(
      JSON.parse(adjustRecurrenceForAnchorMove(rule, null, '2026-03-10') as string),
      { type: 'daily', every: 2 },
    );
    assert.deepEqual(
      JSON.parse(adjustRecurrenceForAnchorMove(rule, '2026-03-02', '2026-03-10') as string),
      { type: 'daily', every: 2 },
    );
    assert.equal(adjustRecurrenceForAnchorMove(null, '2026-03-02', '2026-03-10'), null);
  });
});
