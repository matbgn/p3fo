import type { ComparisonBatch, PLTask, RankedTask } from './pl-prioritization';

export interface CondorcetPair {
  a: string;
  b: string;
}

export interface CondorcetState {
  tasks: PLTask[];
  pairs: CondorcetPair[];
  wins: Record<string, number>;
  comparedPairs: number;
  totalPairs: number;
  done: boolean;
  results: RankedTask[] | null;
}

export function expectedCondorcetComparisons(n: number): number {
  return n < 2 ? 0 : (n * (n - 1)) / 2;
}

function shuffled<T>(items: T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function initCondorcetState(
  tasks: PLTask[],
  rng: () => number = Math.random,
): CondorcetState {
  const pairs: CondorcetPair[] = [];
  for (let i = 0; i < tasks.length; i++) {
    for (let j = i + 1; j < tasks.length; j++) {
      pairs.push({ a: tasks[i].id, b: tasks[j].id });
    }
  }

  const state: CondorcetState = {
    tasks,
    pairs: shuffled(pairs, rng),
    wins: Object.fromEntries(tasks.map((task) => [task.id, 0])),
    comparedPairs: 0,
    totalPairs: pairs.length,
    done: tasks.length < 2,
    results: null,
  };
  if (state.done) state.results = rankCondorcetResults(state);
  return state;
}

export function selectNextCondorcetPair(
  state: CondorcetState,
): ComparisonBatch | null {
  if (state.done || state.comparedPairs >= state.totalPairs) return null;
  const pair = state.pairs[state.comparedPairs];
  const first = state.tasks.find((task) => task.id === pair.a);
  const second = state.tasks.find((task) => task.id === pair.b);
  if (!first || !second) return null;
  return { tasks: [first, second], k: 2 };
}

export function recordCondorcetComparison(
  state: CondorcetState,
  winnerId: string,
): CondorcetState {
  if (state.done || state.comparedPairs >= state.totalPairs) return state;
  const pair = state.pairs[state.comparedPairs];
  if (winnerId !== pair.a && winnerId !== pair.b) return state;

  const wins = {
    ...state.wins,
    [winnerId]: (state.wins[winnerId] ?? 0) + 1,
  };
  const comparedPairs = state.comparedPairs + 1;
  const done = comparedPairs >= state.totalPairs;
  const next: CondorcetState = {
    ...state,
    wins,
    comparedPairs,
    done,
    results: null,
  };
  if (done) next.results = rankCondorcetResults(next);
  return next;
}

export function rankCondorcetResults(state: CondorcetState): RankedTask[] {
  const titles = new Map(state.tasks.map((task) => [task.id, task.title]));
  return [...state.tasks]
    .map((task) => ({
      taskId: task.id,
      score: state.wins[task.id] ?? 0,
    }))
    .sort((first, second) => {
      if (second.score !== first.score) return second.score - first.score;
      const firstTitle = titles.get(first.taskId) ?? '';
      const secondTitle = titles.get(second.taskId) ?? '';
      return firstTitle.localeCompare(secondTitle) || first.taskId.localeCompare(second.taskId);
    });
}

export function condorcetProgress(state: CondorcetState): number {
  if (state.totalPairs === 0) return 100;
  return (state.comparedPairs / state.totalPairs) * 100;
}
