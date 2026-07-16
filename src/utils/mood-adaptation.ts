import type { Task } from '@/hooks/useTasks';
import { sortTasks } from '@/utils/taskSorting';

export type MoodLevel = 'green' | 'orange' | 'red';

export type DifficultyGroup = 'hard' | 'medium' | 'easy';

const DIFFICULTY_GROUPS: Record<number, DifficultyGroup> = {
  0.5: 'easy',
  1: 'easy',
  2: 'medium',
  3: 'medium',
  5: 'hard',
  8: 'hard',
};

export function getDifficultyGroup(difficulty: number | undefined): DifficultyGroup {
  if (difficulty === undefined) return 'medium';
  return DIFFICULTY_GROUPS[difficulty] ?? 'medium';
}

const GROUP_ORDER: DifficultyGroup[] = ['hard', 'medium', 'easy'];
const DIFFICULTY_POINT_DISTANCE = 16;

export interface MoodAdaptationResult {
  task: Task;
  alternatives: Task[];
}

export function adaptTaskToMood(
  mood: MoodLevel,
  tasks: Task[],
  currentUserId?: string,
): MoodAdaptationResult | null {
  const candidates = tasks
    .filter(t => {
      if (t.parentId) return false;
      const status = t.triageStatus;
      if (status === 'Done' || status === 'Dropped' || status === 'Archived') return false;
      if (currentUserId && t.userId && t.userId !== currentUserId) return false;
      return true;
    })
    .sort(sortTasks.plan);

  if (candidates.length === 0) return null;

  const top = candidates[0];
  const topGroup = getDifficultyGroup(top.difficulty);

  if (mood === 'green') {
    return { task: top, alternatives: [] };
  }

  if (mood === 'orange') {
    const targetGroupIndex = GROUP_ORDER.indexOf(topGroup) + 1;
    if (targetGroupIndex >= GROUP_ORDER.length) {
      if (topGroup === 'easy' && top.difficulty === 0.5) {
        const alt05 = findFirstByDifficulty(candidates, 0.5, 1, DIFFICULTY_POINT_DISTANCE);
        return { task: top, alternatives: alt05 ? [alt05] : [] };
      }
      if (topGroup === 'easy') {
        const first05 = findFirstByDifficulty(candidates, 0.5, 0, DIFFICULTY_POINT_DISTANCE);
        if (first05) return { task: first05, alternatives: [] };
        return { task: top, alternatives: [] };
      }
      return { task: top, alternatives: [] };
    }

    const targetGroup = GROUP_ORDER[targetGroupIndex];
    if (targetGroup === 'easy') {
      const first05 = findFirstByDifficulty(candidates, 0.5, 0, DIFFICULTY_POINT_DISTANCE);
      if (first05) return { task: first05, alternatives: [] };
      const first1 = findFirstByDifficulty(candidates, 1, 0, DIFFICULTY_POINT_DISTANCE);
      if (first1) return { task: first1, alternatives: [] };
    } else {
      const firstInGroup = findFirstByGroup(candidates, targetGroup);
      if (firstInGroup) return { task: firstInGroup, alternatives: [] };
    }
    return { task: top, alternatives: [] };
  }

  if (mood === 'red') {
    const first05 = findFirstByDifficulty(candidates, 0.5, 0, DIFFICULTY_POINT_DISTANCE);
    if (first05) {
      if (top.difficulty === 0.5) {
        const alt05 = findFirstByDifficulty(candidates, 0.5, 1, DIFFICULTY_POINT_DISTANCE);
        return { task: first05, alternatives: alt05 ? [alt05] : [] };
      }
      return { task: first05, alternatives: [] };
    }
    const first1 = findFirstByDifficulty(candidates, 1, 0, DIFFICULTY_POINT_DISTANCE);
    if (first1) return { task: first1, alternatives: [] };
    return { task: top, alternatives: [] };
  }

  return { task: top, alternatives: [] };
}

function findFirstByDifficulty(
  tasks: Task[],
  difficulty: number,
  skipCount: number,
  maxPointDistance: number,
): Task | null {
  let skipped = 0;
  let pointDistance = 0;
  for (const t of tasks) {
    if (t.difficulty === difficulty) {
      if (skipped < skipCount) {
        skipped++;
        pointDistance += t.difficulty ?? 1;
        continue;
      }
      return t;
    }
    pointDistance += t.difficulty ?? 1;
    if (pointDistance > maxPointDistance) break;
  }
  return null;
}

function findFirstByGroup(tasks: Task[], group: DifficultyGroup): Task | null {
  for (const t of tasks) {
    if (getDifficultyGroup(t.difficulty) === group) return t;
  }
  return null;
}