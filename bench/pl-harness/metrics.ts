import { hashStringToSeed, mulberry32 } from './rng';

export interface TracePointLike {
  cumulativeDecisions: number;
  tau: number;
}

export function kendallTau(order: readonly string[], truth: readonly string[]): number {
  if (order.length < 2) return 1;
  const truthPos = new Map<string, number>();
  truth.forEach((id, index) => truthPos.set(id, index));

  let concordant = 0;
  let discordant = 0;
  for (let i = 0; i < order.length; i++) {
    for (let j = i + 1; j < order.length; j++) {
      const a = truthPos.get(order[i]);
      const b = truthPos.get(order[j]);
      if (a === undefined || b === undefined) continue;
      if (a < b) concordant++;
      else if (a > b) discordant++;
    }
  }

  const comparable = concordant + discordant;
  return comparable === 0 ? 1 : (concordant - discordant) / comparable;
}

export function topKPrecision(order: readonly string[], truth: readonly string[], k: number): number {
  const kk = Math.min(k, order.length, truth.length);
  if (kk === 0) return 1;
  const truthTop = new Set(truth.slice(0, kk));
  let hits = 0;
  for (let i = 0; i < kk; i++) {
    if (truthTop.has(order[i])) hits++;
  }
  return hits / kk;
}

export function ndcgAtK(order: readonly string[], truth: readonly string[], k: number): number {
  const kk = Math.min(k, order.length, truth.length);
  if (kk === 0) return 1;
  const truthPos = new Map<string, number>();
  truth.forEach((id, index) => truthPos.set(id, index));

  const relevance = (id: string): number => truth.length - (truthPos.get(id) ?? truth.length);
  let dcg = 0;
  for (let i = 0; i < kk; i++) {
    dcg += relevance(order[i]) / Math.log2(i + 2);
  }

  let idcg = 0;
  for (let i = 0; i < kk; i++) {
    idcg += relevance(truth[i]) / Math.log2(i + 2);
  }
  return idcg === 0 ? 1 : dcg / idcg;
}

export function tauAtBudget(trace: readonly TracePointLike[], budget: number): number {
  let tau = 0;
  for (const point of trace) {
    if (point.cumulativeDecisions > budget) break;
    tau = point.tau;
  }
  return tau;
}

export function firstReach(
  trace: readonly TracePointLike[],
  threshold: number,
): number | null {
  for (const point of trace) {
    if (point.tau >= threshold) return point.cumulativeDecisions;
  }
  return null;
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function median(values: readonly number[]): number {
  return quantile(values, 0.5);
}

export function quantile(values: readonly number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (pos - lower);
}

export interface ConfidenceInterval {
  mean: number;
  lower: number;
  upper: number;
}

export function bootstrapMeanCI(
  values: readonly number[],
  seed: string | number,
  iterations = 10_000,
): ConfidenceInterval {
  if (values.length === 0) return { mean: 0, lower: 0, upper: 0 };
  const rng = mulberry32(hashStringToSeed(`bootstrap:${String(seed)}`));
  const samples: number[] = [];
  for (let iteration = 0; iteration < iterations; iteration++) {
    let sum = 0;
    for (let i = 0; i < values.length; i++) {
      sum += values[Math.floor(rng() * values.length)];
    }
    samples.push(sum / values.length);
  }
  return {
    mean: mean(values),
    lower: quantile(samples, 0.025),
    upper: quantile(samples, 0.975),
  };
}

export function share(values: readonly number[], predicate: (value: number) => boolean): number {
  if (values.length === 0) return 0;
  let hits = 0;
  for (const value of values) {
    if (predicate(value)) hits++;
  }
  return hits / values.length;
}

export function sd(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance =
    values.reduce((sum, value) => sum + (value - avg) * (value - avg), 0) /
    (values.length - 1);
  return Math.sqrt(variance);
}

export function coefficientOfVariation(values: readonly number[]): number {
  const avg = mean(values);
  return avg === 0 ? 0 : sd(values) / Math.abs(avg);
}

export function ci95HalfWidth(values: readonly number[]): number {
  if (values.length < 2) return 0;
  return (1.96 * sd(values)) / Math.sqrt(values.length);
}

export function samplesForHalfWidth(values: readonly number[], targetHalfWidth: number): number | null {
  if (targetHalfWidth <= 0) return null;
  const s = sd(values);
  if (s === 0) return 1;
  return Math.ceil(((1.96 * s) / targetHalfWidth) ** 2);
}

/** Kendall tau distance: number of pairs whose relative order differs. */
export function kendallDistance(first: readonly string[], second: readonly string[]): number {
  if (first.length !== second.length) return Math.max(first.length, second.length);
  const position = new Map<string, number>();
  second.forEach((id, index) => position.set(id, index));
  let distance = 0;
  for (let i = 0; i < first.length; i++) {
    for (let j = i + 1; j < first.length; j++) {
      const a = position.get(first[i]);
      const b = position.get(first[j]);
      if (a === undefined || b === undefined) continue;
      if (a > b) distance++;
    }
  }
  return distance;
}

/** Number of new entrants in the top-k set between two rankings. */
export function topKChurn(
  previous: readonly string[],
  current: readonly string[],
  k: number,
): number {
  const kk = Math.min(k, previous.length, current.length);
  if (kk === 0) return 0;
  const previousTop = new Set(previous.slice(0, kk));
  let churn = 0;
  for (const id of current.slice(0, kk)) {
    if (!previousTop.has(id)) churn++;
  }
  return churn;
}

export function jaccardTopK(
  first: readonly string[],
  second: readonly string[],
  k: number,
): number {
  const kk = Math.min(k, first.length, second.length);
  if (kk === 0) return 1;
  const firstSet = new Set(first.slice(0, kk));
  const secondSet = new Set(second.slice(0, kk));
  let intersection = 0;
  for (const id of firstSet) {
    if (secondSet.has(id)) intersection++;
  }
  const union = firstSet.size + secondSet.size - intersection;
  return union === 0 ? 1 : intersection / union;
}

export function meanPairwiseTau(orders: readonly (readonly string[])[]): number | null {
  if (orders.length < 2) return null;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < orders.length; i++) {
    for (let j = i + 1; j < orders.length; j++) {
      sum += kendallTau(orders[i], orders[j]);
      count++;
    }
  }
  return count === 0 ? null : sum / count;
}

export function top1Agreement(orders: readonly (readonly string[])[]): number | null {
  if (orders.length === 0) return null;
  const counts = new Map<string, number>();
  for (const order of orders) {
    const top = order[0];
    if (top === undefined) continue;
    counts.set(top, (counts.get(top) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  return Math.max(...counts.values()) / orders.length;
}

export function meanTop3Agreement(orders: readonly (readonly string[])[]): number | null {
  if (orders.length < 2) return null;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < orders.length; i++) {
    for (let j = i + 1; j < orders.length; j++) {
      sum += jaccardTopK(orders[i], orders[j], 3);
      count++;
    }
  }
  return count === 0 ? null : sum / count;
}
