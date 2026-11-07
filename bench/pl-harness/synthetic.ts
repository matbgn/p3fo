import { gaussian, gumbel, hashStringToSeed, mulberry32, shuffle, type Rng } from './rng';
import { kendallTau } from './metrics';

export type StrengthProfile = 'even' | 'normal' | 'clustered' | 'near-ties';
export type UserModel = 'consistent' | 'consistent-noisy' | 'query-normal' | 'query-bt';

export interface PLTask {
  id: string;
  title: string;
}

export interface SyntheticWorld {
  tasks: PLTask[];
  strengths: Record<string, number>;
  /** Ground truth: order by the latent strengths. */
  latentOrder: string[];
  /**
   * Primary evaluation target. For a consistent user this is the user's actual
   * (noisy) preference order; for per-query models it is the latent order.
   */
  targetOrder: string[];
  /** tau(targetOrder, latentOrder): upper bound on latent accuracy. */
  ceilingTau: number;
  /** True when a beats b in the fake user's mind. */
  compare: (a: string, b: string) => boolean;
  /** Full best-to-worst order for a batch, as the fake user would sort it. */
  order: (ids: readonly string[]) => string[];
}

export function makeTasks(n: number): PLTask[] {
  return Array.from({ length: n }, (_, index) => ({
    id: `t${String(index).padStart(2, '0')}`,
    title: `Task ${String(index).padStart(2, '0')}`,
  }));
}

function sampleStrengths(
  n: number,
  profile: StrengthProfile,
  rng: Rng,
): Record<string, number> {
  const values: number[] = [];
  if (profile === 'even') {
    for (let i = 0; i < n; i++) {
      values.push(n === 1 ? 0 : 2 - (4 * i) / (n - 1));
    }
  } else if (profile === 'normal') {
    for (let i = 0; i < n; i++) values.push(gaussian(rng));
  } else if (profile === 'clustered') {
    const centers = [1.6, 0.55, -0.55, -1.6];
    for (let i = 0; i < n; i++) {
      const center = centers[Math.floor(rng() * centers.length)];
      values.push(center + 0.15 * gaussian(rng));
    }
  } else {
    for (let i = 0; i < n; i++) {
      const pair = Math.floor(i / 2);
      const base = 1.5 - 0.5 * pair;
      values.push(base + 0.05 * gaussian(rng));
    }
  }

  // Assign strengths to task IDs in a random order so the ID/title tie-break
  // cannot accidentally correlate with the ground-truth order (which would
  // make the initial ranking look artificially good, especially for `even`).
  const assignment = shuffle(
    Array.from({ length: n }, (_, index) => index),
    rng,
  );
  const strengths: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    strengths[`t${String(assignment[i]).padStart(2, '0')}`] = values[i];
  }
  return strengths;
}

function sortIds(
  ids: readonly string[],
  valueOf: (id: string) => number,
): string[] {
  return [...ids].sort((a, b) => {
    const diff = valueOf(b) - valueOf(a);
    return diff !== 0 ? diff : a.localeCompare(b);
  });
}

export function makeWorld(
  n: number,
  seed: number,
  profile: StrengthProfile,
  model: UserModel,
  noise: number,
  userSeed: number = seed,
  responseSeed: number = userSeed,
): SyntheticWorld {
  const tasks = makeTasks(n);
  const ids = tasks.map((task) => task.id);
  const strengthRng = mulberry32(hashStringToSeed(`strength:${seed}:${profile}`));
  const preferenceRng = mulberry32(
    hashStringToSeed(`user-preference:${userSeed}:${profile}:${model}:${noise}`),
  );
  const responseRng = mulberry32(
    hashStringToSeed(`user-response:${responseSeed}:${profile}:${model}:${noise}`),
  );
  const strengths = sampleStrengths(n, profile, strengthRng);
  const latentOrder = sortIds(ids, (id) => strengths[id]);

  if (model === 'consistent' || model === 'consistent-noisy') {
    const utilities: Record<string, number> = {};
    for (const id of ids) {
      utilities[id] = strengths[id] + noise * gaussian(preferenceRng);
    }
    const targetOrder = sortIds(ids, (id) => utilities[id]);
    const order = (batchIds: readonly string[]): string[] => {
      if (model === 'consistent') {
        return sortIds(batchIds, (id) => utilities[id]);
      }
      if (noise === 0) {
        return sortIds(batchIds, (id) => utilities[id]);
      }
      return sortIds(
        batchIds,
        (id) => utilities[id] + noise * gaussian(responseRng),
      );
    };
    return {
      tasks,
      strengths,
      latentOrder,
      targetOrder,
      ceilingTau: kendallTau(targetOrder, latentOrder),
      compare: (a, b) => order([a, b])[0] === a,
      order,
    };
  }

  if (model === 'query-normal') {
    const order = (batchIds: readonly string[]): string[] => {
      if (noise === 0) return sortIds(batchIds, (id) => strengths[id]);
      return sortIds(batchIds, (id) => strengths[id] + noise * gaussian(responseRng));
    };
    return {
      tasks,
      strengths,
      latentOrder,
      targetOrder: latentOrder,
      ceilingTau: 1,
      compare: (a, b) => order([a, b])[0] === a,
      order,
    };
  }

  const scale = noise === 0 ? 0 : noise;
  const order = (batchIds: readonly string[]): string[] => {
    if (scale === 0) return sortIds(batchIds, (id) => strengths[id]);
    return sortIds(batchIds, (id) => strengths[id] / scale + gumbel(responseRng));
  };
  return {
    tasks,
    strengths,
    latentOrder,
    targetOrder: latentOrder,
    ceilingTau: 1,
    compare: (a, b) => order([a, b])[0] === a,
    order,
  };
}
