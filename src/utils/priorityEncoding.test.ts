import { describe, it, expect } from 'vitest';
import { computeChildPriority, renumberSiblings, MAX_PRIORITY_DEPTH } from './priorityEncoding';

describe('priorityEncoding', () => {
  describe('computeChildPriority', () => {
    it('returns integer priorities at depth 0 (roots)', () => {
      expect(computeChildPriority(0, 0, 0)).toBe(1);
      expect(computeChildPriority(0, 1, 0)).toBe(2);
      expect(computeChildPriority(0, 2, 0)).toBe(3);
    });

    it('ignores parentPriority at depth 0 (roots always start at 1)', () => {
      expect(computeChildPriority(5, 0, 0)).toBe(1);
      expect(computeChildPriority(99, 2, 0)).toBe(3);
    });

    it('computes depth-1 children with 2 decimal places', () => {
      expect(computeChildPriority(1, 0, 1)).toBeCloseTo(1.01, 10);
      expect(computeChildPriority(1, 1, 1)).toBeCloseTo(1.02, 10);
      expect(computeChildPriority(1, 2, 1)).toBeCloseTo(1.03, 10);
      expect(computeChildPriority(2, 0, 1)).toBeCloseTo(2.01, 10);
      expect(computeChildPriority(2, 1, 1)).toBeCloseTo(2.02, 10);
    });

    it('computes depth-2 grandchildren with 4 decimal places', () => {
      expect(computeChildPriority(1.01, 0, 2)).toBeCloseTo(1.0101, 10);
      expect(computeChildPriority(1.01, 1, 2)).toBeCloseTo(1.0102, 10);
      expect(computeChildPriority(1.02, 0, 2)).toBeCloseTo(1.0201, 10);
    });

    it('computes depth-3 great-grandchildren with 6 decimal places', () => {
      expect(computeChildPriority(1.0101, 0, 3)).toBeCloseTo(1.010101, 10);
      expect(computeChildPriority(1.0101, 1, 3)).toBeCloseTo(1.010102, 10);
    });
  });

  describe('renumberSiblings', () => {
    it('renumbers roots (depth 0) with integer priorities', () => {
      const siblings = [
        { id: 'a', priority: 3 },
        { id: 'b', priority: 1 },
        { id: 'c', priority: 2 },
      ];
      const result = renumberSiblings(siblings, 0, 0);
      expect(result).toEqual([
        { id: 'a', priority: 1 },
        { id: 'b', priority: 2 },
        { id: 'c', priority: 3 },
      ]);
    });

    it('renumbers depth-1 children', () => {
      const siblings = [
        { id: 'a', priority: 1.03 },
        { id: 'b', priority: 1.01 },
        { id: 'c', priority: 1.02 },
      ];
      const result = renumberSiblings(siblings, 1, 1);
      expect(result[0]).toEqual({ id: 'a', priority: 1.01 });
      expect(result[1]).toEqual({ id: 'b', priority: 1.02 });
      expect(result[2]).toEqual({ id: 'c', priority: 1.03 });
    });

    it('renumbers depth-2 grandchildren', () => {
      const siblings = [
        { id: 'a', priority: 1.0102 },
        { id: 'b', priority: 1.0101 },
      ];
      const result = renumberSiblings(siblings, 1.01, 2);
      expect(result[0]).toEqual({ id: 'a', priority: 1.0101 });
      expect(result[1]).toEqual({ id: 'b', priority: 1.0102 });
    });

    it('handles empty array', () => {
      expect(renumberSiblings([], 0, 0)).toEqual([]);
      expect(renumberSiblings([], 1, 1)).toEqual([]);
    });

    it('handles single child', () => {
      expect(renumberSiblings([{ id: 'only', priority: 5 }], 0, 0)).toEqual([
        { id: 'only', priority: 1 },
      ]);
      expect(renumberSiblings([{ id: 'only', priority: 5 }], 1, 1)).toEqual([
        { id: 'only', priority: 1.01 },
      ]);
    });

    it('produces priorities that sort correctly ascending', () => {
      // Build a mixed-depth scenario and verify ascending sort matches expected hierarchy.
      const roots = renumberSiblings(
        [{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }],
        0,
        0,
      );
      const r1Children = renumberSiblings(
        [{ id: 'r1a' }, { id: 'r1b' }, { id: 'r1c' }],
        roots[0].priority,
        1,
      );
      const r2Children = renumberSiblings(
        [{ id: 'r2a' }, { id: 'r2b' }],
        roots[1].priority,
        1,
      );
      const r1aGrandchildren = renumberSiblings(
        [{ id: 'r1a1' }, { id: 'r1a2' }],
        r1Children[0].priority,
        2,
      );

      const all = [
        ...roots,
        ...r1Children,
        ...r2Children,
        ...r1aGrandchildren,
      ];
      const sorted = [...all].sort((a, b) => a.priority - b.priority);

      // Expected: r1(1), r1a(1.01), r1a1(1.0101), r1a2(1.0102),
      //           r1b(1.02), r1c(1.03), r2(2), r2a(2.01), r2b(2.02), r3(3)
      expect(sorted.map((s) => s.id)).toEqual([
        'r1',
        'r1a',
        'r1a1',
        'r1a2',
        'r1b',
        'r1c',
        'r2',
        'r2a',
        'r2b',
        'r3',
      ]);
    });
  });

  describe('MAX_PRIORITY_DEPTH', () => {
    it('is defined and reasonably small for float precision', () => {
      expect(MAX_PRIORITY_DEPTH).toBe(7);
      // Sanity: depth 7 increment should still be representable.
      const increment = 1 * Math.pow(10, -2 * MAX_PRIORITY_DEPTH);
      expect(increment).toBeGreaterThan(0);
    });
  });
});