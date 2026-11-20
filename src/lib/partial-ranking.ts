/**
 * Weighted partial-ranking (PR) extension of Morel-Balbi & Kirkley (2025),
 * "Estimation of partial rankings from sparse, noisy comparisons"
 * (arXiv:2501.02505).
 *
 * The paper assumes integer comparison counts. Collaborative votes normalize
 * each participant to total edge weight 1, so this module accepts real-valued
 * edge weights in the same negative log-posterior and greedy agglomerative MAP
 * algorithm.
 */

export type WeightedMatrix = Record<string, Record<string, number>>;

export interface RankingComparison {
  a: string;
  b: string;
  winner: string;
}

export interface RankingBallotInput {
  comparisons: RankingComparison[];
}

export interface PooledBallots {
  /** Equal-weight, participant-normalized evidence used by the ranking solver. */
  matrix: WeightedMatrix;
  /**
   * One-vote-per-ballot-per-pair matrix: each ballot contributes at most 1 to
   * each direction of a pair it compared, so majority diagnostics reflect the
   * ballots that actually compared the pair instead of coverage-normalized
   * weights.
   */
  majorityMatrix: WeightedMatrix;
  includedBallots: number;
}

export interface PartialRankingResult {
  /** Ordered strongest-to-weakest groups. */
  groups: string[][];
  /** Estimated strength per group, aligned with `groups`. */
  groupStrengths: number[];
  /** Estimated group strength per item. */
  itemStrengths: Record<string, number>;
  loss: number;
}

export interface PartialRankingOptions {
  maxIterations?: number;
  tolerance?: number;
}

const DEFAULT_MAX_ITERATIONS = 500;
const DEFAULT_TOLERANCE = 1e-9;
/**
 * The greedy merge runs an O(maxIterations * n^4) search. Cap the total work
 * so a large, user-influenced proposal set cannot block the Node event loop.
 */
const RANKING_WORK_BUDGET = 50_000_000;
/**
 * The merge search itself costs ~n^4 per sweep run: each candidate rebuilds
 * omega (O(n^2)), runs the solver (O(g^2)) and evaluates the loss (O(g^2),
 * with a log per compared pair). The solver budget above covers a single
 * O(n^2) pass, so allow 2x here to keep tie inference enabled for the full
 * MAX_RANKED_ITEMS=100 range (100^4 = 1e8) instead of silently returning a
 * total order for 85+ items.
 */
const RANKING_MERGE_WORK_BUDGET = RANKING_WORK_BUDGET * 2;
/**
 * Calibration for fractional, equal-weight ballots. The paper's fixed prior
 * is very conservative for small-team ballots; multiplying every ballot by
 * the same constant preserves one-person-one-vote while making a clear
 * majority (e.g. 7-3) separable from a genuine tie.
 */
const EVIDENCE_SCALE = 10;

function logGamma(value: number): number {
  // Lanczos approximation (g=7, n=9).
  const coefficients = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (value < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * value)) - logGamma(1 - value);
  }
  const z = value - 1;
  let x = coefficients[0];
  for (let i = 1; i < coefficients.length; i++) {
    x += coefficients[i] / (z + i);
  }
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

function logFactorial(value: number): number {
  if (value <= 1) return 0;
  return logGamma(value + 1);
}

function logChoose(n: number, k: number): number {
  if (k < 0 || k > n) return -Infinity;
  if (k === 0 || k === n) return 0;
  return logFactorial(n) - logFactorial(k) - logFactorial(n - k);
}

function edge(matrix: WeightedMatrix, a: string, b: string): number {
  return matrix[a]?.[b] ?? 0;
}

function groupOmega(groups: string[][], matrix: WeightedMatrix): number[][] {
  const omega = groups.map(() => groups.map(() => 0));
  for (let r = 0; r < groups.length; r++) {
    for (let s = 0; s < groups.length; s++) {
      let total = 0;
      for (const a of groups[r]) {
        for (const b of groups[s]) {
          if (a !== b) total += edge(matrix, a, b);
        }
      }
      omega[r][s] = total;
    }
  }
  return omega;
}

function sanitizeSigma(values: number[]): number[] {
  return values.map((value) =>
    !Number.isFinite(value) || value <= 0 ? 1e-9 : value,
  );
}

/**
 * Solve the weighted MAP strengths for a fixed grouping using the paper's
 * alpha=0 update (Eq. 28). For singleton groups this is the BT MAP estimator.
 */
function solveGroupStrengthsWithOmega(
  groups: string[][],
  omega: number[][],
  initial?: number[],
  options: PartialRankingOptions = {},
): number[] {
  const count = groups.length;
  if (count === 0) return [];
  const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const tolerance = options.tolerance ?? DEFAULT_TOLERANCE;
  let sigma = sanitizeSigma(
    initial && initial.length === count
      ? initial
      : new Array(count).fill(1),
  );

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const next = new Array<number>(count);
    let maxChange = 0;
    for (let r = 0; r < count; r++) {
      let numerator = 1;
      let denominator = 2 / (sigma[r] + 1);
      for (let s = 0; s < count; s++) {
        if (s === r) continue;
        const sum = sigma[r] + sigma[s];
        numerator += (omega[r][s] * sigma[s]) / sum;
        denominator += omega[s][r] / sum;
      }
      const value = denominator > 0 ? numerator / denominator : 1;
      next[r] = !Number.isFinite(value) || value <= 0 ? 1e-9 : value;
      maxChange = Math.max(
        maxChange,
        Math.abs(next[r] - sigma[r]) / Math.max(1, Math.abs(sigma[r])),
      );
    }
    sigma = next;
    if (maxChange < tolerance) break;
  }
  return sigma;
}

export function solveGroupStrengths(
  groups: string[][],
  matrix: WeightedMatrix,
  initial?: number[],
  options: PartialRankingOptions = {},
): number[] {
  return solveGroupStrengthsWithOmega(
    groups,
    groupOmega(groups, matrix),
    initial,
    options,
  );
}

/** Negative log posterior, Eq. 22. */
export function computePartialRankingLoss(
  groups: string[][],
  groupStrengths: number[],
  matrix: WeightedMatrix,
  itemCount: number,
): number {
  return computePartialRankingLossWithOmega(
    groups,
    groupStrengths,
    groupOmega(groups, matrix),
    itemCount,
  );
}

function computePartialRankingLossWithOmega(
  groups: string[][],
  groupStrengths: number[],
  omega: number[][],
  itemCount: number,
): number {
  const rankCount = groups.length;
  if (rankCount === 0) return 0;

  const groupSizes = groups.map((group) => group.length);
  let prior =
    Math.log(Math.max(itemCount, 1)) +
    logChoose(itemCount - 1, rankCount - 1) +
    logFactorial(itemCount);
  for (const size of groupSizes) prior -= logFactorial(size);

  let strengthPrior = 0;
  for (const sigma of groupStrengths) {
    const safe = Math.max(sigma, 1e-9);
    strengthPrior += Math.log(((safe + 1) * (safe + 1)) / safe);
  }

  let interaction = 0;
  for (let r = 0; r < rankCount; r++) {
    for (let s = 0; s < rankCount; s++) {
      if (omega[r][s] === 0) continue;
      const numerator = Math.max(groupStrengths[r], 1e-9) + Math.max(groupStrengths[s], 1e-9);
      const denominator = Math.max(groupStrengths[r], 1e-9);
      interaction += omega[r][s] * Math.log(numerator / denominator);
    }
  }

  return prior + strengthPrior + interaction;
}

function mergedGroups(groups: string[][], index: number): string[][] {
  const next: string[][] = [];
  for (let i = 0; i < groups.length; i++) {
    if (i === index) {
      next.push([...groups[i], ...groups[i + 1]]);
      i++;
    } else {
      next.push([...groups[i]]);
    }
  }
  return next;
}

function mergeInitialStrengths(strengths: number[], index: number): number[] {
  const merged = (strengths[index] + strengths[index + 1]) / 2;
  return [
    ...strengths.slice(0, index),
    merged,
    ...strengths.slice(index + 2),
  ];
}

/**
 * Greedy agglomerative MAP inference of a partial ranking.
 *
 * At each step every adjacent group merge is evaluated with a full
 * recomputation of Eq. 22 (the paper's merge criterion), the best merge is
 * applied, and the best partition seen across all group counts is retained.
 */
export function estimatePartialRanking(
  itemIds: string[],
  matrix: WeightedMatrix,
  options: PartialRankingOptions = {},
): PartialRankingResult {
  const uniqueIds = [...new Set(itemIds)];
  if (uniqueIds.length === 0) {
    return { groups: [], groupStrengths: [], itemStrengths: {}, loss: 0 };
  }

  // Scale the solver budget with the item count: total cost is roughly
  // maxIterations * n^4, so keep maxIterations <= budget / n^4. Small votes
  // keep the full default; very large sets converge more coarsely instead of
  // monopolising the event loop.
  const solverOptions: PartialRankingOptions = {
    ...options,
    maxIterations: Math.min(
      options.maxIterations ?? DEFAULT_MAX_ITERATIONS,
      Math.max(1, Math.floor(RANKING_WORK_BUDGET / Math.max(1, uniqueIds.length ** 4))),
    ),
  };

  const initialStrengths = solveGroupStrengths(
    uniqueIds.map((id) => [id]),
    matrix,
    undefined,
    solverOptions,
  );
  const orderedIds = uniqueIds
    .map((id, index) => ({ id, strength: initialStrengths[index] }))
    .sort(
      (a, b) =>
        b.strength - a.strength || a.id.localeCompare(b.id),
    )
    .map((entry) => entry.id);

  let groups: string[][] = orderedIds.map((id) => [id]);
  const initialOmega = groupOmega(groups, matrix);
  let strengths = solveGroupStrengthsWithOmega(
    groups,
    initialOmega,
    undefined,
    solverOptions,
  );
  let loss = computePartialRankingLossWithOmega(
    groups,
    strengths,
    initialOmega,
    uniqueIds.length,
  );

  let bestGroups = groups.map((group) => [...group]);
  let bestStrengths = [...strengths];
  let bestLoss = loss;

  // Estimate the full per-candidate cost (~n^4: the omega rebuild plus the
  // solver and loss passes, not just the solver's n^4/2), then compare it with
  // the merge budget. This keeps tie inference enabled up to 100 items while
  // still refusing the search for larger, user-influenced proposal sets.
  const canAffordMerges = uniqueIds.length ** 4 <= RANKING_MERGE_WORK_BUDGET;

  while (canAffordMerges && groups.length > 1) {
    let bestMergeIndex = 0;
    let bestMergeGroups: string[][] | null = null;
    let bestMergeStrengths: number[] | null = null;
    let bestMergeLoss = Infinity;

    for (let index = 0; index < groups.length - 1; index++) {
      const candidateGroups = mergedGroups(groups, index);
      const candidateOmega = groupOmega(candidateGroups, matrix);
      const candidateStrengths = solveGroupStrengthsWithOmega(
        candidateGroups,
        candidateOmega,
        mergeInitialStrengths(strengths, index),
        solverOptions,
      );
      const candidateLoss = computePartialRankingLossWithOmega(
        candidateGroups,
        candidateStrengths,
        candidateOmega,
        uniqueIds.length,
      );
      if (
        candidateLoss < bestMergeLoss - 1e-12 ||
        (Math.abs(candidateLoss - bestMergeLoss) <= 1e-12 && index < bestMergeIndex)
      ) {
        bestMergeLoss = candidateLoss;
        bestMergeIndex = index;
        bestMergeGroups = candidateGroups;
        bestMergeStrengths = candidateStrengths;
      }
    }

    if (!bestMergeGroups || !bestMergeStrengths) break;
    groups = bestMergeGroups;
    strengths = bestMergeStrengths;
    loss = bestMergeLoss;

    if (loss < bestLoss - 1e-12) {
      bestLoss = loss;
      bestGroups = groups.map((group) => [...group]);
      bestStrengths = [...strengths];
    }
  }

  const itemStrengths: Record<string, number> = {};
  bestGroups.forEach((group, index) => {
    for (const id of group) itemStrengths[id] = bestStrengths[index];
  });

  return {
    groups: bestGroups,
    groupStrengths: bestStrengths,
    itemStrengths,
    loss: bestLoss,
  };
}

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
}

interface BallotPairCount {
  first: string;
  second: string;
  firstWins: number;
  secondWins: number;
}

interface ValidBallotComparison {
  key: string;
  first: string;
  second: string;
  winner: string;
}

function* validBallotComparisons(
  ballot: RankingBallotInput,
  active: Set<string>,
): Generator<ValidBallotComparison> {
  const comparisons = (ballot as { comparisons?: unknown }).comparisons;
  // Imported/legacy rows may contain malformed entries (or a non-array). Skip
  // them rather than throwing and taking the whole results endpoint down.
  if (!Array.isArray(comparisons)) return;
  for (const raw of comparisons) {
    const comparison = raw as unknown as Record<string, unknown> | null;
    if (!comparison || typeof comparison !== 'object') continue;
    const a = comparison.a;
    const b = comparison.b;
    const winner = comparison.winner;
    if (
      typeof a !== 'string' ||
      typeof b !== 'string' ||
      typeof winner !== 'string' ||
      a === b ||
      !active.has(a) ||
      !active.has(b) ||
      (winner !== a && winner !== b)
    ) {
      continue;
    }
    const first = a < b ? a : b;
    const second = a < b ? b : a;
    yield { key: pairKey(a, b), first, second, winner };
  }
}

function countBallotPairs(
  ballot: RankingBallotInput,
  active: Set<string>,
): Map<string, BallotPairCount> {
  const pairs = new Map<string, BallotPairCount>();
  for (const { key, first, second, winner } of validBallotComparisons(ballot, active)) {
    const entry = pairs.get(key) ?? {
      first,
      second,
      firstWins: 0,
      secondWins: 0,
    };
    if (winner === first) entry.firstWins++;
    else entry.secondWins++;
    pairs.set(key, entry);
  }
  return pairs;
}

/**
 * Number of distinct pairs a ballot validly compared. Shares the exact
 * validation rules with `countBallotPairs` so coverage and the pooled matrix
 * cannot disagree about which comparisons count.
 */
export function countCoveredPairs(
  ballot: RankingBallotInput,
  active: Set<string>,
): number {
  const keys = new Set<string>();
  for (const comparison of validBallotComparisons(ballot, active)) {
    keys.add(comparison.key);
  }
  return keys.size;
}

/**
 * Equal-weight per participant pooling:
 * - average repeated comparisons within a participant into a per-pair win rate
 * - normalize each participant by their number of distinct compared pairs
 * - average participants with equal total weight
 */
export function poolBallots(
  ballots: RankingBallotInput[],
  activeItemIds: string[],
): PooledBallots {
  const active = new Set(activeItemIds);
  const pooled: WeightedMatrix = {};
  const majority: WeightedMatrix = {};
  for (const id of activeItemIds) {
    pooled[id] = {};
    majority[id] = {};
  }

  // Two passes keep only one ballot's pair map alive at a time instead of
  // retaining a map per participant for the whole (unbounded) submission set.
  let includedBallots = 0;
  let distinctPairSum = 0;
  for (const ballot of ballots) {
    const pairs = countBallotPairs(ballot, active);
    if (pairs.size === 0) continue;
    includedBallots++;
    distinctPairSum += pairs.size;
  }

  // Equal weight per participant: every ballot contributes the same total edge
  // weight. A common scale keeps the pooled matrix in a count-like range so the
  // paper's fixed prior is not overwhelmed by 1/distinctPairs normalization.
  const avgDistinctPairs =
    includedBallots === 0 ? 0 : distinctPairSum / includedBallots;

  for (const ballot of ballots) {
    const pairs = countBallotPairs(ballot, active);
    if (pairs.size === 0) continue;
    for (const entry of pairs.values()) {
      const total = entry.firstWins + entry.secondWins;
      if (total === 0) continue;
      const firstRate = entry.firstWins / total;
      const secondRate = 1 - firstRate;
      const scale = (avgDistinctPairs / pairs.size) * EVIDENCE_SCALE;
      pooled[entry.first][entry.second] =
        (pooled[entry.first][entry.second] ?? 0) + firstRate * scale;
      pooled[entry.second][entry.first] =
        (pooled[entry.second][entry.first] ?? 0) + secondRate * scale;
      // One ballot contributes at most one vote per pair; this matrix is used
      // for majority diagnostics, where a sparse ballot must not outweigh the
      // ballots that actually compared a given pair.
      majority[entry.first][entry.second] =
        (majority[entry.first][entry.second] ?? 0) + firstRate;
      majority[entry.second][entry.first] =
        (majority[entry.second][entry.first] ?? 0) + secondRate;
    }
  }

  // Sum (do not average) the equal-weight ballots: every participant
  // contributes the same total weight, and more participants provide more
  // evidence to the paper's fixed prior.
  return { matrix: pooled, majorityMatrix: majority, includedBallots };
}

export interface CondorcetDiagnostics {
  winnerId: string | null;
  hasMajorityCycle: boolean;
}

export function computeCondorcetDiagnostics(
  itemIds: string[],
  matrix: WeightedMatrix,
): CondorcetDiagnostics {
  const ids = [...new Set(itemIds)];
  const edges = new Map<string, string[]>();
  for (const id of ids) edges.set(id, []);

  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i];
      const b = ids[j];
      if (edge(matrix, a, b) > edge(matrix, b, a) + 1e-12) {
        edges.get(a)!.push(b);
      } else if (edge(matrix, b, a) > edge(matrix, a, b) + 1e-12) {
        edges.get(b)!.push(a);
      }
    }
  }

  let winnerId: string | null = null;
  for (const id of ids) {
    let beatsAll = true;
    for (const other of ids) {
      if (other === id) continue;
      if (!edges.get(id)!.includes(other)) {
        beatsAll = false;
        break;
      }
    }
    if (beatsAll) {
      winnerId = id;
      break;
    }
  }

  const color = new Map<string, 0 | 1 | 2>();
  for (const id of ids) color.set(id, 0);
  const hasCycleFrom = (start: string): boolean => {
    const stack: Array<{ id: string; index: number }> = [{ id: start, index: 0 }];
    color.set(start, 1);
    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const neighbors = edges.get(frame.id)!;
      if (frame.index >= neighbors.length) {
        color.set(frame.id, 2);
        stack.pop();
        continue;
      }
      const next = neighbors[frame.index++];
      const state = color.get(next) ?? 0;
      if (state === 1) return true;
      if (state === 0) {
        color.set(next, 1);
        stack.push({ id: next, index: 0 });
      }
    }
    return false;
  };

  let hasMajorityCycle = false;
  for (const id of ids) {
    if (color.get(id) === 0 && hasCycleFrom(id)) {
      hasMajorityCycle = true;
      break;
    }
  }

  return { winnerId, hasMajorityCycle };
}
