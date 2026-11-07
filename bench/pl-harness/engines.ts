import {
  initState,
  recordBatch,
  selectNextBatch,
  rankResults,
  confidencePercent,
  isConfident,
} from '../../src/lib/pl-prioritization';
import { hashStringToSeed, mulberry32, shuffle } from './rng';
import {
  firstReach,
  kendallDistance,
  kendallTau,
  topKChurn,
  topKPrecision,
} from './metrics';
import type { SyntheticWorld } from './synthetic';

export interface TracePoint {
  step: number;
  decisions: number;
  cumulativeDecisions: number;
  pairwise: number;
  cumulativePairwise: number;
  tau: number;
  latentTau: number;
  top1: number;
  top3: number;
  confidence: number;
  engineMs: number;
  ranking: string[];
}

export interface EngineResult {
  name: string;
  k: number;
  finalOrder: string[];
  tau: number;
  latentTau: number;
  top1: number;
  top3: number;
  decisions: number;
  pairwise: number;
  batches: number;
  engineMs: number;
  done: boolean;
  stopReason: string;
  finalConfidence: number;
  finalStallCount: number;
  totalRankFlips: number;
  lateRankFlips: number;
  top1Changes: number;
  lateTop1Changes: number;
  top3Churn: number;
  stableTail: number;
  confidenceGap: number;
  tauBelow95: boolean;
  tauBelow90: boolean;
  trace: TracePoint[];
}

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function allPairs(ids: readonly string[]): [string, string][] {
  const pairs: [string, string][] = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      pairs.push([ids[i], ids[j]]);
    }
  }
  return pairs;
}

function computeRankStability(trace: TracePoint[]): {
  totalRankFlips: number;
  lateRankFlips: number;
  top1Changes: number;
  lateTop1Changes: number;
  top3Churn: number;
  stableTail: number;
} {
  let totalRankFlips = 0;
  let lateRankFlips = 0;
  let top1Changes = 0;
  let lateTop1Changes = 0;
  let top3Churn = 0;
  const lateStart = Math.max(1, Math.floor((trace.length - 1) * 0.75));

  for (let i = 1; i < trace.length; i++) {
    const distance = kendallDistance(trace[i - 1].ranking, trace[i].ranking);
    totalRankFlips += distance;
    if (i >= lateStart) lateRankFlips += distance;
    if (trace[i - 1].ranking[0] !== trace[i].ranking[0]) {
      top1Changes++;
      if (i >= lateStart) lateTop1Changes++;
    }
    top3Churn += topKChurn(trace[i - 1].ranking, trace[i].ranking, 3);
  }

  let stableTail = 0;
  for (let i = trace.length - 1; i > 0; i--) {
    if (trace[i - 1].ranking.join(',') === trace[i].ranking.join(',')) stableTail++;
    else break;
  }

  return {
    totalRankFlips,
    lateRankFlips,
    top1Changes,
    lateTop1Changes,
    top3Churn,
    stableTail,
  };
}

function finish(
  name: string,
  k: number,
  stateOrder: string[],
  world: SyntheticWorld,
  decisions: number,
  pairwise: number,
  batches: number,
  engineMs: number,
  done: boolean,
  stopReason: string,
  finalConfidence: number,
  finalStallCount: number,
  trace: TracePoint[],
): EngineResult {
  const tau = kendallTau(stateOrder, world.targetOrder);
  const stability = computeRankStability(trace);
  return {
    name,
    k,
    finalOrder: stateOrder,
    tau,
    latentTau: kendallTau(stateOrder, world.latentOrder),
    top1: topKPrecision(stateOrder, world.targetOrder, 1),
    top3: topKPrecision(stateOrder, world.targetOrder, 3),
    decisions,
    pairwise,
    batches,
    engineMs,
    done,
    stopReason,
    finalConfidence,
    finalStallCount,
    ...stability,
    confidenceGap: finalConfidence > 0 ? finalConfidence / 100 - tau : 0,
    tauBelow95: tau < 0.95,
    tauBelow90: tau < 0.9,
    trace,
  };
}

/**
 * Current adaptive engine: InfoGain batch selection + BT scoring.
 * The fake user answers a K=3+ batch with two decisions (highest, lowest),
 * exactly like the UI.
 */
export function runBtEngine(
  world: SyntheticWorld,
  k: number,
  name = `bt-k${k}`,
): EngineResult {
  let state = initState(world.tasks, k);
  const trace: TracePoint[] = [];
  let decisions = 0;
  let pairwise = 0;
  let batches = 0;
  let engineMs = 0;

  for (let guard = 0; guard < 5000; guard++) {
    const selectStart = nowMs();
    const batch = selectNextBatch(state);
    const selectMs = nowMs() - selectStart;
    if (!batch) break;

    const ids = batch.tasks.map((task) => task.id);
    const ordered = world.order(ids);
    const highest = ordered[0];
    const lowest = ids.length >= 3 ? ordered[ordered.length - 1] : undefined;

    const recordStart = nowMs();
    state = recordBatch(state, highest, lowest, ids);
    const recordMs = nowMs() - recordStart;
    engineMs += selectMs + recordMs;

    const stepDecisions = ids.length >= 3 ? 2 : 1;
    const stepPairs = ids.length >= 3 ? 2 * ids.length - 3 : 1;
    decisions += stepDecisions;
    pairwise += stepPairs;
    batches++;

    const ranked = rankResults(state).map((result) => result.taskId);
    trace.push({
      step: batches,
      decisions: stepDecisions,
      cumulativeDecisions: decisions,
      pairwise: stepPairs,
      cumulativePairwise: pairwise,
      tau: kendallTau(ranked, world.targetOrder),
      latentTau: kendallTau(ranked, world.latentOrder),
      top1: topKPrecision(ranked, world.targetOrder, 1),
      top3: topKPrecision(ranked, world.targetOrder, 3),
      confidence: confidencePercent(state),
      engineMs: selectMs + recordMs,
      ranking: ranked,
    });

    if (state.done) break;
  }

  const finalOrder = state.results
    ? state.results.map((result) => result.taskId)
    : rankResults(state).map((result) => result.taskId);

  const inferredStopReason =
    state.totalBatches >= 500
      ? 'cap'
      : state.stallCount >= 10
        ? 'stall'
        : isConfident(state)
          ? 'confident'
          : selectNextBatch(state) === null
            ? 'floor/stability'
            : 'stability';
  const stopReason = state.stopReason ?? inferredStopReason;

  return finish(
    name,
    k,
    finalOrder,
    world,
    decisions,
    pairwise,
    batches,
    engineMs,
    state.done,
    stopReason,
    confidencePercent(state),
    state.stallCount,
    trace,
  );
}

/**
 * Pure Condorcet baseline: every pair compared exactly once.
 * Ranking = number of head-to-head wins (Copeland-style), tie-break by id.
 * This is the client's 18*17/2 = 153 (or 20*19/2 = 190) baseline.
 */
export function runCondorcet(
  world: SyntheticWorld,
  seed: number,
  name = 'condorcet',
): EngineResult {
  const ids = world.tasks.map((task) => task.id);
  const pairs = shuffle(allPairs(ids), mulberry32(hashStringToSeed(`condorcet:${seed}`)));
  const wins: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
  const trace: TracePoint[] = [];
  let decisions = 0;
  let engineMs = 0;

  for (const [a, b] of pairs) {
    const start = nowMs();
    const winner = world.compare(a, b) ? a : b;
    wins[winner] += 1;
    decisions += 1;

    const ranked = [...ids].sort((x, y) => {
      const diff = wins[y] - wins[x];
      return diff !== 0 ? diff : x.localeCompare(y);
    });
    engineMs += nowMs() - start;

    trace.push({
      step: decisions,
      decisions: 1,
      cumulativeDecisions: decisions,
      pairwise: 1,
      cumulativePairwise: decisions,
      tau: kendallTau(ranked, world.targetOrder),
      latentTau: kendallTau(ranked, world.latentOrder),
      top1: topKPrecision(ranked, world.targetOrder, 1),
      top3: topKPrecision(ranked, world.targetOrder, 3),
      confidence: 0,
      engineMs: nowMs() - start,
      ranking: ranked,
    });
  }

  const finalOrder = [...ids].sort((x, y) => {
    const diff = wins[y] - wins[x];
    return diff !== 0 ? diff : x.localeCompare(y);
  });

  return finish(
    name,
    2,
    finalOrder,
    world,
    decisions,
    decisions,
    0,
    engineMs,
    true,
    'all-pairs',
    0,
    0,
    trace,
  );
}

/**
 * Control: BT scoring fed with all C(n,2) pairs (one pair per batch).
 * Same decision count as Condorcet, but BT scores instead of Copeland wins.
 * Isolates the scoring model from the adaptive selection/stop policy.
 */
export function runBtAllPairs(
  world: SyntheticWorld,
  seed: number,
  name = 'bt-allpairs',
): EngineResult {
  const ids = world.tasks.map((task) => task.id);
  const pairs = shuffle(allPairs(ids), mulberry32(hashStringToSeed(`condorcet:${seed}`)));
  let state = initState(world.tasks, 2);
  const trace: TracePoint[] = [];
  let decisions = 0;
  let engineMs = 0;

  for (const [a, b] of pairs) {
    const winner = world.compare(a, b) ? a : b;
    const start = nowMs();
    state = recordBatch(state, winner, undefined, [a, b]);
    const elapsed = nowMs() - start;
    engineMs += elapsed;
    decisions += 1;

    const ranked = rankResults(state).map((result) => result.taskId);
    trace.push({
      step: decisions,
      decisions: 1,
      cumulativeDecisions: decisions,
      pairwise: 1,
      cumulativePairwise: decisions,
      tau: kendallTau(ranked, world.targetOrder),
      latentTau: kendallTau(ranked, world.latentOrder),
      top1: topKPrecision(ranked, world.targetOrder, 1),
      top3: topKPrecision(ranked, world.targetOrder, 3),
      confidence: confidencePercent(state),
      engineMs: elapsed,
      ranking: ranked,
    });
  }

  const finalOrder = rankResults(state).map((result) => result.taskId);
  return finish(
    name,
    2,
    finalOrder,
    world,
    decisions,
    decisions,
    decisions,
    engineMs,
    state.done,
    'all-pairs-control',
    confidencePercent(state),
    state.stallCount,
    trace,
  );
}

export function decisionsToReach(result: EngineResult, threshold: number): number | null {
  return firstReach(result.trace, threshold);
}
