import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  listTasks: vi.fn(),
  listPomodoroSessions: vi.fn(),
  snapshot: [] as unknown[],
}));

vi.mock('@/context/SettingsContext', () => ({
  useSettingsContext: () => ({
    settings: {
      preferredWorkingDays: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 },
    },
  }),
}));

vi.mock('@/context/UsersContext', () => ({
  useUsersContext: () => ({ users: [] }),
}));

vi.mock('@/lib/persistence-factory', () => ({
  getPersistenceAdapter: async () => ({
    listTasks: mocks.listTasks,
    listPomodoroSessions: mocks.listPomodoroSessions,
  }),
}));

vi.mock('@/lib/collaboration', () => ({
  yTasks: { values: () => [] },
  isCollaborationEnabled: () => false,
}));

vi.mock('./useTasks', () => ({
  getAllTasksSnapshot: () => mocks.snapshot,
  areTasksFiltered: () => false,
}));

import { eventBus } from '@/lib/events';
import { useConsistencyScore } from './useConsistencyScore';
import type { Task } from './useTasks';

const makeTask = (): Task => ({
  id: 'task-1',
  title: 'Bench task',
  userId: 'user-1',
  triageStatus: 'WIP',
  createdAt: Date.now(),
  timer: [{ startTime: Date.now(), endTime: Date.now() + 60_000 }],
});

describe('useConsistencyScore - in-memory task updates', () => {
  beforeEach(() => {
    mocks.listTasks.mockReset();
    mocks.listPomodoroSessions.mockReset();
    mocks.listTasks.mockResolvedValue([]);
    mocks.listPomodoroSessions.mockResolvedValue([]);
    mocks.snapshot = [];
  });

  it('recomputes the score from memory without refetching tasks or sessions', async () => {
    const { result } = renderHook(() => useConsistencyScore('user-1'));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    mocks.listTasks.mockClear();
    mocks.listPomodoroSessions.mockClear();

    mocks.snapshot = [makeTask()];
    act(() => {
      eventBus.publish('tasksChanged');
    });

    await waitFor(() => {
      expect(result.current.data?.currentScore ?? 0).toBeGreaterThan(0);
    });

    expect(mocks.listTasks).not.toHaveBeenCalled();
    expect(mocks.listPomodoroSessions).not.toHaveBeenCalled();
  });
});
