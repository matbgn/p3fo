import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CATEGORIES,
  MAX_CATEGORIES,
  MAX_COLOR_LABELS,
  categoryOptions,
  colorForCategory,
  isValidCategoryName,
  labelForColor,
  sanitizeCategories,
  sanitizeColorLabels,
  withCategoryColor,
  withRenamedCategory,
  withoutCategory,
} from './workspace-taxonomy';

describe('workspace categories', () => {
  it('seeds the legacy categories', () => {
    expect(DEFAULT_CATEGORIES).toContain('Consulting');
    expect(DEFAULT_CATEGORIES).not.toContain('General');
  });

  it('trims, deduplicates and bounds stored categories', () => {
    expect(sanitizeCategories(['  Deep  work ', 'deep work', '', 42, 'Admin'])).toEqual([
      'Deep work',
      'Admin',
    ]);
    expect(sanitizeCategories('nope')).toEqual([]);
    expect(sanitizeCategories(['x'.repeat(41)])).toEqual([]);
    expect(
      sanitizeCategories(Array.from({ length: MAX_CATEGORIES + 10 }, (_, i) => `Cat ${i}`)),
    ).toHaveLength(MAX_CATEGORIES);
  });

  it('drops names that cannot be typed as a #tag or would collide with a sentinel', () => {
    expect(
      sanitizeCategories(['-', '--', 'Uncategorized', 'uncategorized', 'none', 'None', 'Admin']),
    ).toEqual(['Admin']);
    expect(isValidCategoryName('-')).toBe(false);
    expect(isValidCategoryName('Uncategorized')).toBe(false);
    expect(isValidCategoryName('none')).toBe(false);
    expect(isValidCategoryName('Deep work')).toBe(true);
  });

  it('always offers General in pickers', () => {
    expect(categoryOptions(['Admin'])).toEqual(['Admin', 'General']);
    expect(categoryOptions(['Admin', 'General'])).toEqual(['Admin', 'General']);
  });
});

describe('workspace labels', () => {
  it('keeps valid color associations, including free colors', () => {
    expect(
      sanitizeColorLabels({ pink: ' Deep work ', '#3b82f6': 'Admin', nope: 'X', mango: '' }),
    ).toEqual({ pink: 'Deep work', '#3b82f6': 'Admin' });
    expect(sanitizeColorLabels({ '#ABC': 'Admin' })).toEqual({ '#aabbcc': 'Admin' });
  });

  it('bounds the number of stored color associations', () => {
    const stored: Record<string, string> = {};

    for (let index = 0; index < MAX_COLOR_LABELS + 20; index += 1) {
      stored[`#${index.toString(16).padStart(6, '0')}`] = 'Category';
    }

    expect(Object.keys(sanitizeColorLabels(stored))).toHaveLength(MAX_COLOR_LABELS);
  });

  it('resolves a color to its category and back', () => {
    const labels = { pink: 'Deep work', '#3b82f6': 'Admin' };

    expect(labelForColor('pink', labels)).toBe('Deep work');
    expect(labelForColor('#3B82F6', labels)).toBe('Admin');
    expect(labelForColor('green', labels)).toBeNull();
    expect(colorForCategory('deep-work', labels)).toBe('pink');
    expect(colorForCategory('ADMIN', labels)).toBe('#3b82f6');
    expect(colorForCategory('Unknown', labels)).toBeNull();
  });

  it('keeps one category per color and one color per category', () => {
    let labels = withCategoryColor({}, 'Deep work', 'pink');
    expect(labels).toEqual({ pink: 'Deep work' });

    labels = withCategoryColor(labels, 'Admin', 'pink');
    expect(labels).toEqual({ pink: 'Admin' });

    labels = withCategoryColor(labels, 'Admin', 'green');
    expect(labels).toEqual({ green: 'Admin' });

    labels = withCategoryColor(labels, 'Admin', null);
    expect(labels).toEqual({});
  });

  it('follows renames and removals', () => {
    const labels = { pink: 'Deep work', green: 'Admin' };

    expect(withRenamedCategory(labels, 'deep work', 'Focus')).toEqual({
      pink: 'Focus',
      green: 'Admin',
    });
    expect(withoutCategory(labels, 'Deep work')).toEqual({ green: 'Admin' });
  });
});
