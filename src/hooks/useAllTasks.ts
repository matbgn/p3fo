import { useState, useEffect } from 'react';
import { useTasks, Task } from './useTasks';
import { getPersistenceAdapter } from '@/lib/persistence-factory';
import { convertEntitiesToTasks } from '@/lib/task-conversions';
import { eventBus } from '@/lib/events';

export function useAllTasks() {
    const { tasks: contextTasks, isFiltered } = useTasks();
    const [fetchedTasks, setFetchedTasks] = useState<Task[] | null>(null);
    const [loading, setLoading] = useState(false);

    // Use fetched tasks if we are in filtered mode, otherwise use context tasks
    const tasks = isFiltered && fetchedTasks ? fetchedTasks : contextTasks;

    // Effect to handle fetching all tasks when filtered
    useEffect(() => {
        let mounted = true;

        const fetchAllTasks = async () => {
            if (!isFiltered) {
                setFetchedTasks(null);
                return;
            }

            setLoading(true);
            try {
                const adapter = await getPersistenceAdapter();
                const entities = await adapter.listTasks();
                if (mounted) {
                    setFetchedTasks(convertEntitiesToTasks(entities));
                }
            } catch (error) {
                console.error("Error fetching all tasks:", error);
            } finally {
                if (mounted) {
                    setLoading(false);
                }
            }
        };

        fetchAllTasks();

        // Subscribe to changes to re-fetch if we are in disconnected/filtered mode
        const onTasksChanged = () => {
            if (isFiltered) {
                fetchAllTasks();
            }
        };

        eventBus.subscribe("tasksChanged", onTasksChanged);

        return () => {
            mounted = false;
            eventBus.unsubscribe("tasksChanged", onTasksChanged);
        };
    }, [isFiltered]);

    return {
        tasks,
        loading
    };
}
