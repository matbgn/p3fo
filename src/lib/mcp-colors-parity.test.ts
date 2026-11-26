import { describe, expect, it } from 'vitest';
import { TASK_COLORS, normalizeTaskColor } from '@/lib/planner/colors';
import { TASK_COLOR_VALUES, normalizeTaskColorValue } from '../../mcp-server/src/colors';

describe('MCP task color parity', () => {
  it('matches the app preset color list', () => {
    expect([...TASK_COLOR_VALUES]).toEqual([...TASK_COLORS]);
  });

  it('normalizes colors exactly like the app', () => {
    const samples = [
      ...TASK_COLORS,
      '#ABC',
      '#aabbcc',
      '#3b8',
      '#ABCD',
      '  #3B82F6  ',
      ' #abc ',
      'nope',
      'blue',
      '',
    ];

    for (const sample of samples) {
      expect(normalizeTaskColorValue(sample)).toBe(normalizeTaskColor(sample));
    }
  });
});
