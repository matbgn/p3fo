import { describe, expect, it } from 'vitest';
import { completeTag, parseTaskInput, suggestLabels } from './task-input';

const taxonomy = {
  categories: ['Deep work', 'Admin', 'Errands'],
  colorLabels: { pink: 'Deep work', '#3b82f6': 'Admin' },
  users: [
    { userId: 'u-mat', trigram: 'MAT', username: 'Mat' },
    { userId: 'u-edv', trigram: 'EDV', username: 'Eddie' },
  ],
};

describe('parseTaskInput', () => {
  it('reads a plain title', () => {
    expect(parseTaskInput('Write the report', taxonomy)).toMatchObject({
      text: 'Write the report',
      time: null,
      color: null,
      category: null,
      tag: null,
    });
  });

  it('takes a #label anywhere and sets its category and color', () => {
    expect(parseTaskInput('Write the report #deep-work', taxonomy)).toMatchObject({
      text: 'Write the report',
      category: 'Deep work',
      color: 'pink',
    });
  });

  it('matches names ignoring case, spaces and hyphens', () => {
    expect(parseTaskInput('#deepwork Write', taxonomy)).toMatchObject({
      text: 'Write',
      category: 'Deep work',
      color: 'pink',
    });
    expect(parseTaskInput('#ADMIN Write', taxonomy)).toMatchObject({
      text: 'Write',
      category: 'Admin',
      color: '#3b82f6',
    });
  });

  it('accepts a renamed category and its color id', () => {
    expect(parseTaskInput('Write #deep-work', taxonomy).category).toBe('Deep work');
    expect(parseTaskInput('Write #pink', taxonomy)).toMatchObject({
      text: 'Write',
      color: 'pink',
      category: null,
    });
  });

  it('leaves an unknown tag as text and takes a later known one', () => {
    expect(parseTaskInput('Write #nope #admin', taxonomy)).toMatchObject({
      text: 'Write #nope',
      category: 'Admin',
      color: '#3b82f6',
    });
  });

  it('applies only the first known label', () => {
    expect(parseTaskInput('Write #admin #pink', taxonomy)).toMatchObject({
      text: 'Write #pink',
      category: 'Admin',
      color: '#3b82f6',
    });
  });

  it('keeps a label alone as text: a task needs a title', () => {
    expect(parseTaskInput('#admin', taxonomy)).toMatchObject({
      text: '#admin',
      category: null,
      color: null,
    });
  });

  it('reads the leading time after the label is out', () => {
    expect(parseTaskInput('#admin 17:30 Standup', taxonomy)).toMatchObject({
      text: 'Standup',
      time: '17:30',
      category: 'Admin',
    });
  });

  it('knows no label without a taxonomy', () => {
    expect(parseTaskInput('Write #admin', { categories: [], colorLabels: {} })).toMatchObject({
      text: 'Write #admin',
      category: null,
    });
  });

  it('reports the tag still being typed', () => {
    expect(parseTaskInput('Write #ad', taxonomy).tag).toEqual({
      start: 6,
      end: 9,
      query: 'ad',
    });
    expect(parseTaskInput('Write #ad ', taxonomy).tag).toBeNull();
  });
});

describe('mentions', () => {
  it('assigns the user named by @trigram and takes it out', () => {
    expect(parseTaskInput('Fix the bug @MAT', taxonomy)).toMatchObject({
      text: 'Fix the bug',
      assigneeId: 'u-mat',
    });
  });

  it('ignores case and reads a leading mention', () => {
    expect(parseTaskInput('@mat Fix the bug', taxonomy)).toMatchObject({
      text: 'Fix the bug',
      assigneeId: 'u-mat',
    });
  });

  it('keeps an unknown mention as text and takes a later one', () => {
    expect(parseTaskInput('Fix @nope @EDV', taxonomy)).toMatchObject({
      text: 'Fix @nope',
      assigneeId: 'u-edv',
    });
  });

  it('applies only the first mention', () => {
    expect(parseTaskInput('Fix @MAT @EDV', taxonomy)).toMatchObject({
      text: 'Fix @EDV',
      assigneeId: 'u-mat',
    });
  });

  it('keeps a mention alone as text: a task needs a title', () => {
    expect(parseTaskInput('@MAT', taxonomy)).toMatchObject({
      text: '@MAT',
      assigneeId: null,
    });
  });

  it('combines a mention, a label and a time', () => {
    expect(parseTaskInput('@EDV 17:30 Standup #admin', taxonomy)).toMatchObject({
      text: 'Standup',
      time: '17:30',
      assigneeId: 'u-edv',
      category: 'Admin',
      color: '#3b82f6',
    });
  });

  it('knows no mention when no users are given', () => {
    expect(
      parseTaskInput('Fix @MAT', { categories: [], colorLabels: {} }),
    ).toMatchObject({ text: 'Fix @MAT', assigneeId: null });
  });

  it('keeps a leading time when the caller has no date context', () => {
    expect(
      parseTaskInput('17:30 Gym #admin', taxonomy, { parseTime: false }),
    ).toMatchObject({
      text: '17:30 Gym',
      time: null,
      category: 'Admin',
      color: '#3b82f6',
    });
  });

  it('keeps label tag positions in the original input after a mention', () => {
    expect(parseTaskInput('@MAT Write #ad', taxonomy)).toMatchObject({
      assigneeId: 'u-mat',
      tag: { start: 11, end: 14, query: 'ad' },
    });
  });
});

describe('label suggestions', () => {
  it('matches names and associated color ids', () => {
    expect(suggestLabels('ad', taxonomy)).toEqual([
      { name: 'Admin', color: '#3b82f6' },
    ]);
    expect(suggestLabels('pink', taxonomy)).toEqual([
      { name: 'Deep work', color: 'pink' },
    ]);
    expect(suggestLabels('', taxonomy)).toHaveLength(3);
  });

  it('completes a tag with its slug', () => {
    expect(completeTag('Write #de', { start: 6, end: 9 }, 'Deep work')).toEqual({
      value: 'Write #deep-work ',
      caret: 17,
    });
  });
});
