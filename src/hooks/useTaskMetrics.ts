import { useMemo } from 'react';
import { useAllTasks } from './useAllTasks';
import { createTaskMap, createHighImpactMap } from '@/lib/metrics';

export function useTaskMetrics() {
    const { tasks } = useAllTasks();

    const taskMap = useMemo(() => {
        return createTaskMap(tasks);
    }, [tasks]);

    const highImpactMap = useMemo(() => {
        return createHighImpactMap(tasks, taskMap);
    }, [tasks, taskMap]);

    return {
        tasks,
        taskMap,
        highImpactMap
    };
}
