import { describe, expect, it } from 'vitest';
import {
  isTaskColor,
  normalizeFreeColor,
  normalizeTaskColor,
  resolveTaskColorStyle,
  taskColorBar,
  taskColorKey,
} from './colors';

describe('task colors', () => {
  it('accepts preset ids and free colors', () => {
    expect(isTaskColor('pink')).toBe(true);
    expect(isTaskColor('#3b82f6')).toBe(true);
    expect(isTaskColor('#3b8')).toBe(true);
    expect(isTaskColor('#nope')).toBe(false);
    expect(isTaskColor('rebeccapurple')).toBe(false);
  });

  it('normalizes free colors to #rrggbb', () => {
    expect(normalizeFreeColor('#3b8')).toBe('#33bb88');
    expect(normalizeFreeColor('#3B82F6')).toBe('#3b82f6');
    expect(normalizeFreeColor('  #3b82f6  ')).toBe('#3b82f6');
    expect(normalizeFreeColor('blue')).toBeNull();
  });

  it('normalizes only valid values', () => {
    expect(normalizeTaskColor('pink')).toBe('pink');
    expect(normalizeTaskColor('#ABC')).toBe('#aabbcc');
    expect(normalizeTaskColor('nope')).toBeNull();
  });

  it('uses the same key for equivalent free colors', () => {
    expect(taskColorKey('#ABC')).toBe('#aabbcc');
    expect(taskColorKey('#aabbcc')).toBe('#aabbcc');
    expect(taskColorKey('mango')).toBe('mango');
  });

  it('resolves free colors for a swatch and an accent bar', () => {
    const style = resolveTaskColorStyle('#123456');
    expect(style.label).toBe('#123456');
    expect(style.bar).toBe('#123456');
    expect(style.swatchStyle).toEqual({ backgroundColor: '#123456' });
    expect(taskColorBar('#123456')).toBe('#123456');
    expect(taskColorBar('none')).toBeUndefined();
  });
});
