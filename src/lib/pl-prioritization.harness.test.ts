import { describe, expect, it } from 'vitest';
import { initState, recordBatch, selectNextBatch } from './pl-prioritization';
import { runBtEngine, runCondorcet } from '../../bench/pl-harness/engines';
import { tauAtBudget } from '../../bench/pl-harness/metrics';
import { makeWorld } from '../../bench/pl-harness/synthetic';

describe('prioritization harness (20 items)', () => {
  it('is deterministic for a given seed', () => {
    const first = runBtEngine(makeWorld(20, 7, 'normal', 'consistent', 0.5), 3);
    const second = runBtEngine(makeWorld(20, 7, 'normal', 'consistent', 0.5), 3);
    expect(first.finalOrder).toEqual(second.finalOrder);
    expect(first.decisions).toBe(second.decisions);
  });

  it('pure Condorcet recovers a consistent user order exactly', () => {
    for (const seed of [1, 2, 3]) {
      const world = makeWorld(20, seed, 'normal', 'consistent', 0.5);
      const condorcet = runCondorcet(world, seed);
      expect(condorcet.decisions).toBe(190);
      expect(condorcet.tau).toBe(1);
    }
  });

  it('BT k=3 saves decisions and is accurate on a consistent user', () => {
    const results: Array<{ btTau: number; condorcetTauAt95: number; btTauAt95: number }> = [];
    for (const seed of [1, 2, 3, 4, 5]) {
      const world = makeWorld(20, seed, 'normal', 'consistent', 0.5);
      const condorcet = runCondorcet(world, seed);
      const bt = runBtEngine(world, 3);
      expect(bt.decisions).toBeLessThan(condorcet.decisions);
      expect(bt.tau).toBeGreaterThan(0.9);
      results.push({
        btTau: bt.tau,
        btTauAt95: tauAtBudget(bt.trace, 95),
        condorcetTauAt95: tauAtBudget(condorcet.trace, 95),
      });
    }

    const meanBtAt95 =
      results.reduce((sum, result) => sum + result.btTauAt95, 0) / results.length;
    const meanCondorcetAt95 =
      results.reduce((sum, result) => sum + result.condorcetTauAt95, 0) / results.length;
    expect(meanBtAt95).toBeGreaterThan(meanCondorcetAt95 + 0.1);
    expect(results.every((result) => result.btTau > 0.9)).toBe(true);
  });

  it('K=3 batch decomposition records all three pairwise wins', () => {
    const world = makeWorld(3, 11, 'even', 'consistent', 0);
    let state = initState(world.tasks, 3);
    const batch = selectNextBatch(state);
    expect(batch).not.toBeNull();
    const ids = batch!.tasks.map((task) => task.id);
    const ordered = world.order(ids);
    state = recordBatch(state, ordered[0], ordered[2], ids);

    for (let i = 0; i < ordered.length; i++) {
      for (let j = i + 1; j < ordered.length; j++) {
        expect(state.winMatrix[ordered[i]]?.[ordered[j]] ?? 0).toBeGreaterThanOrEqual(1);
      }
    }
  });
});
