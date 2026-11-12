import { describe, expect, it } from 'vitest';
import {
  computeCondorcetDiagnostics,
  computePartialRankingLoss,
  estimatePartialRanking,
  poolBallots,
  solveGroupStrengths,
  type WeightedMatrix,
} from './partial-ranking';

function totalOrderMatrix(ids: string[], weight = 1): WeightedMatrix {
  const matrix: WeightedMatrix = {};
  ids.forEach((id) => {
    matrix[id] = {};
  });
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      matrix[ids[i]][ids[j]] = weight;
      matrix[ids[j]][ids[i]] = 0;
    }
  }
  return matrix;
}

function tieMatrix(ids: string[], weight = 0.5): WeightedMatrix {
  const matrix: WeightedMatrix = {};
  ids.forEach((id) => {
    matrix[id] = {};
  });
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      matrix[ids[i]][ids[j]] = weight;
      matrix[ids[j]][ids[i]] = weight;
    }
  }
  return matrix;
}

describe('weighted partial ranking', () => {
  it('groups a fully tied comparison graph into one rank', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const result = estimatePartialRanking(ids, tieMatrix(ids));
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].sort()).toEqual(ids);
  });

  it('separates a dense total order when evidence is strong', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const result = estimatePartialRanking(ids, totalOrderMatrix(ids, 10));
    expect(result.groups.map((group) => group[0])).toEqual(ids);
  });

  it('uses more evidence to separate more groups', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const weak = estimatePartialRanking(ids, totalOrderMatrix(ids, 1));
    const strong = estimatePartialRanking(ids, totalOrderMatrix(ids, 10));
    expect(strong.groups.length).toBeGreaterThanOrEqual(weak.groups.length);
    expect(strong.groups.length).toBe(4);
  });

  it('covers every item exactly once', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const matrix: WeightedMatrix = {};
    ids.forEach((id) => {
      matrix[id] = {};
    });
    matrix.a.b = 1;
    matrix.b.c = 1;
    matrix.c.d = 1;
    matrix.d.e = 1;
    const result = estimatePartialRanking(ids, matrix);
    expect(result.groups.flat().sort()).toEqual([...ids].sort());
  });

  it('infers a collective tie at the largest supported ballot size', () => {
    // 85 is the smallest size where the merge search used to be skipped, which
    // silently turned a full tie into an arbitrary total order.
    const ids = Array.from({ length: 85 }, (_, index) => `p${index}`);
    const result = estimatePartialRanking(ids, tieMatrix(ids));
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]).toHaveLength(ids.length);
  });

  it('computes a finite negative log posterior', () => {
    const ids = ['a', 'b'];
    const matrix = totalOrderMatrix(ids);
    const strengths = solveGroupStrengths(ids.map((id) => [id]), matrix);
    const loss = computePartialRankingLoss(ids.map((id) => [id]), strengths, matrix, 2);
    expect(Number.isFinite(loss)).toBe(true);
  });
});

describe('equal-weight ballot pooling', () => {
  it('makes two opposite single-comparison voters a tie', () => {
    const pooled = poolBallots(
      [
        { comparisons: [{ a: 'a', b: 'b', winner: 'a' }] },
        { comparisons: [{ a: 'a', b: 'b', winner: 'b' }] },
      ],
      ['a', 'b'],
    );
    expect(pooled.includedBallots).toBe(2);
    expect(pooled.matrix.a.b).toBeCloseTo(10);
    expect(pooled.matrix.b.a).toBeCloseTo(10);

    const result = estimatePartialRanking(['a', 'b'], pooled.matrix);
    expect(result.groups).toHaveLength(1);
  });

  it('does not let a user with many repeated comparisons outweigh one voter', () => {
    const heavyComparisons = Array.from({ length: 100 }, () => ({
      a: 'a',
      b: 'b',
      winner: 'a',
    }));
    const pooled = poolBallots(
      [
        { comparisons: heavyComparisons },
        { comparisons: [{ a: 'a', b: 'b', winner: 'b' }] },
      ],
      ['a', 'b'],
    );
    expect(pooled.matrix.a.b).toBeCloseTo(10);
    expect(pooled.matrix.b.a).toBeCloseTo(10);
  });

  it('normalizes each ballot by its distinct compared pairs', () => {
    const pooled = poolBallots(
      [
        {
          comparisons: [
            { a: 'a', b: 'b', winner: 'a' },
            { a: 'a', b: 'c', winner: 'a' },
          ],
        },
      ],
      ['a', 'b', 'c'],
    );
    const total =
      (pooled.matrix.a.b ?? 0) +
      (pooled.matrix.b.a ?? 0) +
      (pooled.matrix.a.c ?? 0) +
      (pooled.matrix.c.a ?? 0) +
      (pooled.matrix.b.c ?? 0) +
      (pooled.matrix.c.b ?? 0);
    expect(total).toBeCloseTo(20);
  });
});

describe('Condorcet diagnostics', () => {
  it('finds a Condorcet winner', () => {
    const ids = ['a', 'b', 'c'];
    const matrix = totalOrderMatrix(ids);
    const diagnostics = computeCondorcetDiagnostics(ids, matrix);
    expect(diagnostics.winnerId).toBe('a');
    expect(diagnostics.hasMajorityCycle).toBe(false);
  });

  it('detects a majority cycle', () => {
    const ids = ['a', 'b', 'c'];
    const matrix: WeightedMatrix = {
      a: { b: 1, c: 0 },
      b: { a: 0, c: 1 },
      c: { a: 1, b: 0 },
    };
    const diagnostics = computeCondorcetDiagnostics(ids, matrix);
    expect(diagnostics.winnerId).toBeNull();
    expect(diagnostics.hasMajorityCycle).toBe(true);
  });
});
