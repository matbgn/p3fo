/**
 * @file Plackett-Luce + Swiss InfoGain Adaptive Prioritization Engine
 *
 * ## Architecture overview
 *
 * This module implements an adaptive pairwise-comparison engine that ranks a
 * set of tasks by asking the user to compare small batches of K tasks at a
 * time. It combines three research-backed techniques:
 *
 * 1. **Zermelo / Bradley-Terry MLE** (Newman 2023, alpha=0 fast iteration with
 *    a Bayesian MAP prior) — estimates latent "strength" scores from a win
 *    matrix. The MAP variant guarantees convergence even on disconnected or
 *    sparse win matrices by adding pseudo win/loss against an average player.
 *
 * 2. **Swiss InfoGain active selection** (Chouliaras & Chatzopoulos,
 *    arXiv:2511.12796) — instead of querying random or all pairs, the engine
 *    picks the pair with the highest information gain (maximum entropy), i.e.
 *    the pair whose outcome the model is most uncertain about. For K=2 this
 *    reduces to the verified pairwise InfoGain `p(1-p)`.
 *
 * 3. **Plackett-Luce batch entropy** (PL generalization) — for K>2, the batch
 *    is selected by maximizing the joint Shannon entropy of the two-step
 *    query ("pick highest from K, then pick lowest from K-1"). Step 1 uses a
 *    softmax over strengths (PL choice probability); step 2 uses an
 *    inverse-softmax over the remaining items (weakest is most likely to be
 *    picked as lowest). This is the proper PL generalization of pairwise
 *    InfoGain; the K=2 case reduces exactly to binary entropy.
 *
 * ## Batch to pairwise deconstruction
 *
 * Although the UI shows K tasks per batch, the backend never computes a PL
 * likelihood. Each batch result is decomposed into pairwise Bradley-Terry
 * wins:
 *   - K=2: one win (highest beats lowest, the other is implicit lowest).
 *   - K>2: highest beats every other task (K-1 wins); each middle task beats
 *     lowest (K-2 wins). Total 2K-3 implicit pairwise wins per batch.
 *
 * This keeps the scoring engine lightweight (pure BT MLE) while giving the
 * user a richer multi-item interface — the "pairwise engine + batch UI"
 * approach recommended for practical implementations.
 *
 * ## Stop conditions (confidence-based)
 *
 * The engine stops when ANY of the following is true:
 *   - **Confident**: all pairs have BT win-probability >= 0.75 (configurable)
 *     in one direction (no ambiguous pairs remain).
 *   - **No informative batch**: the highest-entropy pair is below an entropy
 *     floor (diminishing returns — further comparisons add ~no information).
 *   - **Ranking stable**: the ranking hasn't changed for STABILITY_WINDOW+1
 *     consecutive batches AND every pair with non-trivial entropy has been
 *     compared at least once (coverage-aware stability).
 *   - **Batch cap**: MAX_BATCHES_CAP reached (safety valve).
 *
 * ## Phases
 *
 * - **Exploration**: every pair is compared at least once before relying on
 *   InfoGain. This prevents the model from getting stuck on a wrong belief
 *   about an unqueried pair (InfoGain trusts current scores, which may be
 *   wrong for pairs never compared). Unqueried pairs are picked Swiss-style
 *   (closest current scores first).
 *
 * - **Exploitation**: once all pairs have been compared, the engine uses
 *   InfoGain to select the most informative batch. The seed pair is the one
 *   with the highest batch entropy; additional tasks are added greedily by
 *   maximizing the batch entropy of the growing set.
 */

import type { Task } from '@/hooks/useTasks';

export interface PLTask {
  id: string;
  title: string;
}

export interface ComparisonBatch {
  tasks: PLTask[];
  k: number;
}

export interface RankedTask {
  taskId: string;
  score: number;
}

export interface PrioritizationState {
  k: number;
  tasks: PLTask[];
  scores: Record<string, number>;
  winMatrix: Record<string, Record<string, number>>;
  totalBatches: number;
  done: boolean;
  results: RankedTask[] | null;
  rankingHistory: string[][];
  stallCount: number;
}

/** Clamp log-strength scores to [-20, 20] to avoid exp() overflow. */
const SCORE_CLAMP = 20;
/** Iterations for the Zermelo MLE fixed-point solver (Newman 2023). */
const MLE_ITERATIONS = 30;
/**
 * Confidence threshold for the "all pairs resolved" stop condition. A pair
 * is considered resolved when min(p, 1-p) <= 1 - threshold, i.e. the model is
 * at least this confident about the direction. Lowered from the discussed
 * 0.85 to 0.75 because BT MLE with a weak prior needs many comparisons to
 * separate genuinely-adjacent items at 0.85 — the stability and floor
 * conditions compensate.
 */
const CONFIDENCE_THRESHOLD = 0.75;
/**
 * Bayesian prior weight for the MAP score estimator (Newman 2023 eq 12).
 * Adds `PRIOR_WEIGHT` pseudo win and `PRIOR_WEIGHT` pseudo loss against an
 * average-strength player, guaranteeing convergence on disconnected matrices.
 * Low value (0.1) allows faster score separation; higher values anchor scores
 * toward center (more robust but slower convergence).
 */
const PRIOR_WEIGHT = 0.1;
/**
 * Entropy floor for the "diminishing returns" stop. If even the most
 * uncertain pair has batch entropy below this, the engine stops — further
 * comparisons would add negligible information.
 */
const INFO_GAIN_FLOOR = 0.01;
/**
 * Number of consecutive batches with an unchanged ranking required before
 * the stability stop fires (plus the current batch). Must be combined with
 * the coverage check so the ranking isn't "stable" simply because unqueried
 * pairs were never compared.
 */
const STABILITY_WINDOW = 5;
/**
 * Number of consecutive batches with no `confidencePercent` increase before
 * the stall stop fires. This is the backup escape when the ranking
 * oscillates on near-equal adjacent pairs and the stability stop never
 * locks. The counter resets on any confidence increase.
 */
const STALL_WINDOW = 10;
/** Safety-valve cap on total batches to prevent infinite loops. */
const MAX_BATCHES_CAP = 500;

/**
 * Initialize the prioritization state for a set of tasks.
 *
 * @param tasks - The tasks to rank (must have at least 2 for a meaningful comparison).
 * @param k - Batch size (items shown per batch). Clamped to `tasks.length` if larger.
 * @returns The initial state with all scores at 0 (equal strength) and an empty win matrix.
 */
export function initState(tasks: PLTask[], k: number): PrioritizationState {
  const effectiveK = Math.min(k, tasks.length);
  return {
    k: effectiveK,
    tasks,
    scores: Object.fromEntries(tasks.map((t) => [t.id, 0])),
    winMatrix: {},
    totalBatches: 0,
    done: false,
    results: null,
    rankingHistory: [],
    stallCount: 0,
  };
}

function clampScore(s: number): number {
  return Math.max(-SCORE_CLAMP, Math.min(SCORE_CLAMP, s));
}

function strength(s: number): number {
  return Math.exp(clampScore(s));
}

function btWinProb(si: number, sj: number): number {
  const pi = strength(si);
  const pj = strength(sj);
  return pi / (pi + pj);
}

/**
 * Estimate BT latent scores (log-strengths) from a win matrix using Zermelo
 * MLE with a Bayesian MAP prior (Newman 2023, alpha=0 fast variant).
 *
 * The MAP prior adds a pseudo win and pseudo loss against an average player,
 * guaranteeing convergence even when the win-matrix graph is disconnected.
 * Scores are centered to mean 0 and clamped to [-20, 20].
 *
 * @param winMatrix - `w_ij` = number of times task i beat task j.
 * @param taskIds - All task IDs (including those with no wins/losses yet).
 * @returns Log-strength scores centered to mean 0.
 */
export function estimateScores(
  winMatrix: Record<string, Record<string, number>>,
  taskIds: string[],
): Record<string, number> {
  if (taskIds.length === 0) return {};
  const pi: Record<string, number> = Object.fromEntries(taskIds.map((id) => [id, 1]));

  for (let iter = 0; iter < MLE_ITERATIONS; iter++) {
    const next: Record<string, number> = {};
    for (const i of taskIds) {
      const winsI = winMatrix[i] || {};
      let numerator = PRIOR_WEIGHT;
      let denominator = (2 * PRIOR_WEIGHT) / (pi[i] + 1);
      for (const j of taskIds) {
        if (i === j) continue;
        const winsIJ = winsI[j] || 0;
        const winsJI = (winMatrix[j] || {})[i] || 0;
        const denom = pi[i] + pi[j];
        if (denom === 0) continue;
        numerator += winsIJ * (pi[j] / denom);
        denominator += winsJI / denom;
      }
      next[i] = denominator > 0 ? numerator / denominator : 1;
      if (!isFinite(next[i]) || next[i] <= 0) next[i] = 1e-6;
    }
    // normalize by geometric mean
    let logSum = 0;
    for (const id of taskIds) logSum += Math.log(next[id]);
    const geoMean = Math.exp(logSum / taskIds.length);
    for (const id of taskIds) {
      pi[id] = next[id] / geoMean;
      if (pi[id] <= 0) pi[id] = 1e-6;
    }
  }

  const scores: Record<string, number> = {};
  for (const id of taskIds) {
    scores[id] = Math.log(pi[id]);
  }
  // center to mean 0
  const mean = taskIds.reduce((acc, id) => acc + scores[id], 0) / taskIds.length;
  for (const id of taskIds) scores[id] = scores[id] - mean;
  return scores;
}

/**
 * Check whether the model is confident enough to stop comparing.
 *
 * Checks only the n-1 adjacent pairs in the current ranking (consecutive
 * items sorted by score). This is mathematically equivalent to checking all
 * C(n,2) pairs: if every adjacent gap has BT p >= threshold, then every
 * non-adjacent pair (a sum of adjacent gaps) also does. The adjacent-only
 * check is O(n log n) instead of O(n²) and makes the confidence goal
 * achievable for large n (the all-pairs version required a score range of
 * n×ln(3), which exceeds the [-20,20] clamp for n > ~36).
 *
 * @param state - Current prioritization state.
 * @param threshold - Minimum BT win-probability for a pair to be "resolved".
 */
export function isConfident(
  state: PrioritizationState,
  threshold: number = CONFIDENCE_THRESHOLD,
): boolean {
  if (state.tasks.length < 2) return true;
  const ranked = rankResults(state);
  for (let i = 0; i < ranked.length - 1; i++) {
    const p = btWinProb(state.scores[ranked[i].taskId], state.scores[ranked[i + 1].taskId]);
    const closer = Math.min(p, 1 - p);
    if (closer > 1 - threshold) return false;
  }
  return true;
}

function addWin(
  winMatrix: Record<string, Record<string, number>>,
  winnerId: string,
  loserId: string,
): void {
  if (!winMatrix[winnerId]) winMatrix[winnerId] = {};
  winMatrix[winnerId][loserId] = (winMatrix[winnerId][loserId] || 0) + 1;
}

/**
 * Record a batch result and advance the engine state.
 *
 * Decomposes the K-wise batch choice into pairwise BT wins:
 *   - K=2 (or no lowest specified): one win, highest beats the implicit lowest.
 *   - K>2: highest beats every other task (K-1 wins); each middle task beats
 *     lowest (K-2 wins). Total 2K-3 implicit pairwise wins.
 *
 * After recording, scores are re-estimated via Zermelo MLE. The engine checks
 * all stop conditions (confidence, no-informative-batch, stability, cap) and
 * sets `done` + `results` if any is met.
 *
 * @param state - Current prioritization state (not mutated).
 * @param highestId - The task ID chosen as highest priority in this batch.
 * @param lowestId - The task ID chosen as lowest priority (undefined for K=2).
 * @param batchTaskIds - IDs of the tasks shown in this batch (for correct
 *   pairwise deconstruction; defaults to all tasks if omitted).
 * @returns New state with updated win matrix, scores, and possibly `done`.
 */
export function recordBatch(
  state: PrioritizationState,
  highestId: string,
  lowestId?: string,
  batchTaskIds?: string[],
): PrioritizationState {
  const winMatrix: Record<string, Record<string, number>> = {};
  for (const w of Object.keys(state.winMatrix)) {
    winMatrix[w] = { ...state.winMatrix[w] };
  }

  const allTaskIds = state.tasks.map((t) => t.id);
  const batchIds = batchTaskIds ?? allTaskIds;
  const effectiveLowest = lowestId ?? batchIds.find((id) => id !== highestId);

  if (state.k === 2 || !lowestId) {
    if (effectiveLowest) addWin(winMatrix, highestId, effectiveLowest);
  } else {
    for (const id of batchIds) {
      if (id === highestId) continue;
      addWin(winMatrix, highestId, id);
      if (id !== lowestId) {
        addWin(winMatrix, id, lowestId);
      }
    }
  }

  const scores = estimateScores(winMatrix, allTaskIds);
  const next: PrioritizationState = {
    ...state,
    winMatrix,
    scores,
    totalBatches: state.totalBatches + 1,
    rankingHistory: [...state.rankingHistory, rankResults({ ...state, scores, winMatrix, rankingHistory: [] }).map((r) => r.taskId)],
  };

  const prevConf = confidencePercent(state);
  const newConf = confidencePercent(next);
  next.stallCount = newConf > prevConf ? 0 : state.stallCount + 1;

  if (isConfident(next) || selectNextBatch(next) === null || isRankingStable(next) || next.totalBatches >= MAX_BATCHES_CAP || next.stallCount >= STALL_WINDOW) {
    next.done = true;
    next.results = rankResults(next);
  }
  return next;
}

function isRankingStable(state: PrioritizationState): boolean {
  if (state.rankingHistory.length < STABILITY_WINDOW + 1) return false;
  // Require that every uncertain adjacent pair (in the current ranking)
  // has been directly compared. Non-adjacent uncertain pairs are skipped:
  // they will be resolved by transitivity once the adjacent gaps are
  // separated. This lets the stability stop fire after O(n) adjacent
  // comparisons instead of O(n²) all-pairs comparisons.
  const ranked = rankResults(state);
  for (let i = 0; i < ranked.length - 1; i++) {
    const a = ranked[i].taskId;
    const b = ranked[i + 1].taskId;
    if (!pairIsUncertain(a, b, state.scores)) continue;
    const wab = state.winMatrix[a]?.[b] || 0;
    const wba = state.winMatrix[b]?.[a] || 0;
    if (wab + wba === 0) return false;
  }
  const recent = state.rankingHistory.slice(-STABILITY_WINDOW - 1);
  const last = recent[recent.length - 1];
  return recent.every((r) => JSON.stringify(r) === JSON.stringify(last));
}

/**
 * Produce the final ranking from current scores, sorted by descending score
 * with title-then-ID tie-breaking for deterministic output.
 *
 * @param state - Current prioritization state.
 * @returns Ranked tasks with their BT scores.
 */
export function rankResults(state: PrioritizationState): RankedTask[] {
  return state.tasks
    .map((t) => ({ taskId: t.id, score: state.scores[t.id] }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const ta = state.tasks.find((t) => t.id === a.taskId);
      const tb = state.tasks.find((t) => t.id === b.taskId);
      return (ta?.title ?? '').localeCompare(tb?.title ?? '');
    });
}

/**
 * Compute the expected Shannon entropy of a two-step PL batch query over a
 * set of tasks.
 *
 * Step 1 (pick highest from K): softmax `p_i = exp(s_i) / sum(exp(s_j))`.
 *   Entropy H1 = -sum p_i log(p_i).
 *
 * Step 2 (pick lowest from K-1, given highest = h): inverse-softmax
 *   `q_j = (1/exp(s_j)) / sum_{k!=h}(1/exp(s_k))` (weakest task most likely
 *   to be picked as lowest). Entropy H2(h) = -sum q_j log(q_j), expected over
 *   which h is chosen: H2 = sum_h p_h * H2(h).
 *
 * Total H(S) = H1 + H2. For K=2 this reduces exactly to binary entropy
 * (the verified pairwise InfoGain `p(1-p)` special case).
 *
 * @param taskIds - IDs of the candidate tasks in the batch.
 * @param scores - Current BT log-strength scores.
 * @returns Expected batch entropy (information gain) in nats.
 */
function batchEntropy(taskIds: string[], scores: Record<string, number>): number {
  const strengths = taskIds.map((id) => strength(scores[id]));
  const total = strengths.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;

  const probs = strengths.map((s) => s / total);

  let h1 = 0;
  for (const p of probs) {
    if (p > 0) h1 -= p * Math.log(p);
  }

  let h2Expected = 0;
  for (let h = 0; h < taskIds.length; h++) {
    const pH = probs[h];
    if (pH <= 0) continue;
    const remainingIds: number[] = [];
    const invStrengths: number[] = [];
    for (let j = 0; j < taskIds.length; j++) {
      if (j === h) continue;
      remainingIds.push(j);
      invStrengths.push(1 / strengths[j]);
    }
    const invTotal = invStrengths.reduce((a, b) => a + b, 0);
    if (invTotal === 0) continue;
    let h2h = 0;
    for (const is of invStrengths) {
      const q = is / invTotal;
      if (q > 0) h2h -= q * Math.log(q);
    }
    h2Expected += pH * h2h;
  }

  return h1 + h2Expected;
}

/**
 * Whether a pair still carries enough uncertainty to warrant a comparison.
 *
 * A pair is "uncertain" when its batch entropy is at or above the info-gain
 * floor — i.e. the model could still learn something from querying it. This
 * is the single criterion shared by the exploration branch of
 * `selectNextBatch`, the coverage check in `isRankingStable`, and the
 * exploitation floor stop, so all three agree on what "needs comparing".
 *
 * @param a - First task ID.
 * @param b - Second task ID.
 * @param scores - Current BT log-strength scores.
 */
function pairIsUncertain(a: string, b: string, scores: Record<string, number>): boolean {
  return batchEntropy([a, b], scores) >= INFO_GAIN_FLOOR;
}

/**
 * Select the next batch of K tasks to show the user.
 *
 * Two phases:
 * 1. **Exploration** — if any pair has never been compared, pick unqueried
 *    pairs Swiss-style (closest current scores first) and extend the batch
 *    greedily to cover as many unqueried pairs as possible.
 * 2. **Exploitation** — once all pairs have been compared at least once,
 *    select the batch with maximum PL batch entropy (InfoGain). Seed with the
 *    highest-entropy pair, then greedily add tasks that maximize the batch
 *    entropy of the growing set.
 *
 * Returns null when the engine is confident, no informative batch remains, or
 * fewer than 2 tasks are available — signaling the caller to finalize results.
 *
 * @param state - Current prioritization state.
 * @param k - Optional override for batch size (defaults to `state.k`).
 * @returns The next batch to display, or null if done.
 */
export function selectNextBatch(
  state: PrioritizationState,
  k?: number,
): ComparisonBatch | null {
  if (isConfident(state)) return null;

  const effectiveK = Math.min(k ?? state.k, state.tasks.length);
  if (effectiveK < 2) return null;

  const ids = state.tasks.map((t) => t.id);

  function pairCompared(a: string, b: string): number {
    return (state.winMatrix[a]?.[b] || 0) + (state.winMatrix[b]?.[a] || 0);
  }

  // Phase 1 — Exploration: ensure every uncertain pair is compared at
  // least once. Pick the unqueried pair with the closest current scores
  // (Swiss-style), so we resolve the most uncertain unqueried pairs first.
  // Pairs already confidently resolved via transitive wins (entropy below
  // the floor) are skipped — this lets the engine converge without forcing
  // all C(n,2) direct comparisons.
  const unqueriedPairs: [string, string][] = [];
  for (let a = 0; a < ids.length; a++) {
    for (let b = a + 1; b < ids.length; b++) {
      if (pairCompared(ids[a], ids[b]) === 0
          && pairIsUncertain(ids[a], ids[b], state.scores)) {
        unqueriedPairs.push([ids[a], ids[b]]);
      }
    }
  }

  let selected: string[];
  if (unqueriedPairs.length > 0) {
    // Sort unqueried pairs by score closeness (smallest |s_a - s_b|)
    unqueriedPairs.sort((p1, p2) => {
      const d1 = Math.abs(state.scores[p1[0]] - state.scores[p1[1]]);
      const d2 = Math.abs(state.scores[p2[0]] - state.scores[p2[1]]);
      return d1 - d2;
    });
    selected = [...unqueriedPairs[0]];
    // Extend: add tasks that create the most new unqueried pairs within the batch
    while (selected.length < effectiveK) {
      let bestCandidate: string | null = null;
      let bestNewPairs = -1;
      for (const id of ids) {
        if (selected.includes(id)) continue;
        let newPairs = 0;
        for (const s of selected) {
          if (pairCompared(id, s) === 0) newPairs++;
        }
        if (newPairs > bestNewPairs) {
          bestNewPairs = newPairs;
          bestCandidate = id;
        }
      }
      if (bestCandidate === null || bestNewPairs === 0) break;
      selected.push(bestCandidate);
    }
  } else {
    // Phase 2 — Exploitation: InfoGain-based selection.
    let bestPair: [string, string] | null = null;
    let bestPairH = -Infinity;
    for (let a = 0; a < ids.length; a++) {
      for (let b = a + 1; b < ids.length; b++) {
        const h = batchEntropy([ids[a], ids[b]], state.scores);
        if (h > bestPairH || (h === bestPairH && bestPair === null)) {
          bestPairH = h;
          bestPair = [ids[a], ids[b]];
        }
      }
    }
    if (!bestPair) return null;
    if (bestPairH < INFO_GAIN_FLOOR) return null;

    selected = [bestPair[0], bestPair[1]];
    while (selected.length < effectiveK) {
      let bestCandidate: string | null = null;
      let bestH = -Infinity;
      for (const id of ids) {
        if (selected.includes(id)) continue;
        const candidate = [...selected, id];
        const h = batchEntropy(candidate, state.scores);
        if (h > bestH) {
          bestH = h;
          bestCandidate = id;
        }
      }
      if (bestCandidate === null) break;
      selected.push(bestCandidate);
    }
  }

  const batchTasks = selected
    .map((id) => state.tasks.find((t) => t.id === id))
    .filter((t): t is PLTask => t !== undefined);
  if (batchTasks.length < 2) return null;
  return { tasks: batchTasks, k: effectiveK };
}

/**
 * Rough estimate of the number of batches needed, for UI display only.
 * For K=2: ~n*log2(n). For K>2: divided by (K-1) since each batch yields
 * ~2K-3 pairwise wins instead of 1.
 */
export function expectedComparisons(n: number, k: number): number {
  if (n < 2) return 0;
  const base = Math.ceil(n * Math.log2(n));
  if (k <= 2) return base;
  return Math.ceil(base / (k - 1));
}

/**
 * Percentage of adjacent pairs in the current ranking that are "resolved"
 * (confident direction), for the progress bar in the UI. A pair is resolved
 * when `min(p, 1-p) <= 1 - threshold`.
 *
 * Only the n-1 consecutive pairs in the sorted ranking are checked — these
 * are the pairs that determine whether the ordering is correct. Non-adjacent
 * pairs are automatically resolved when all adjacent pairs are (their score
 * gap is a sum of adjacent gaps). This makes the progress bar climb toward
 * 100% as the engine works through adjacent pairs, instead of plateauing at
 * ~91% for large n where many non-adjacent-but-close pairs can never reach
 * the confidence threshold.
 *
 * @param state - Current prioritization state.
 * @returns Integer 0-100.
 */
export function confidencePercent(state: PrioritizationState): number {
  if (state.tasks.length < 2) return 100;
  const ranked = rankResults(state);
  const total = ranked.length - 1;
  let resolved = 0;
  for (let i = 0; i < total; i++) {
    const p = btWinProb(state.scores[ranked[i].taskId], state.scores[ranked[i + 1].taskId]);
    const closer = Math.min(p, 1 - p);
    if (closer <= 1 - CONFIDENCE_THRESHOLD) resolved++;
  }
  return total === 0 ? 100 : Math.round((resolved / total) * 100);
}

export { CONFIDENCE_THRESHOLD };