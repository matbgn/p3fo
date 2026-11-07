import { useEffect, useMemo, useState } from 'react';
import { useTasks, Task } from './useTasks';
import { getPersistenceAdapter } from '@/lib/persistence-factory';
import { convertEntitiesToTasks } from '@/lib/task-conversions';
import { eventBus } from '@/lib/events';
import { filterWorkflowTasks, uniqueTasksById } from '@/lib/recurrence/engine';

// Several planner surfaces mount this hook at the same time. Share one full
// list read per `tasksChanged` batch (the event bus already coalesces the
// event, so every hook calls fetch in the same tick) and retry once when a
// newer change arrived while the read was in flight.
let fullListVersion = 0;
let inFlightFullList: { version: number; promise: Promise<Task[]> } | null = null;

eventBus.subscribe('tasksChanged', () => {
    fullListVersion += 1;
});

function fetchFullTaskList(): Promise<Task[]> {
    const version = fullListVersion;

    if (!inFlightFullList) {
        const promise = (async () => {
            const adapter = await getPersistenceAdapter();
            const entities = await adapter.listTasks();
            return convertEntitiesToTasks(entities);
        })();
        const request = { version, promise };
        inFlightFullList = request;
        promise.then(
            () => {
                if (inFlightFullList === request) inFlightFullList = null;
            },
            () => {
                if (inFlightFullList === request) inFlightFullList = null;
            },
        );
    }

    const request = inFlightFullList;
    return request.promise.then((tasks) => (
        version > request.version ? fetchFullTaskList() : tasks
    ));
}

export function useAllTasks(options?: { includeRecurring?: boolean }) {
    const includeRecurring = options?.includeRecurring ?? false;
    const { tasks: contextTasks, isFiltered } = useTasks({ includeRecurring });
    const [fetchedTasks, setFetchedTasks] = useState<Task[] | null>(null);
    const [loading, setLoading] = useState(false);

    // The shared store already caches the filtered/all views per snapshot, so
    // use that array directly unless a filtered view fetched the full list.
    const fetchedSource = isFiltered && fetchedTasks ? fetchedTasks : null;
    const tasks = useMemo(
        () => fetchedSource
            ? (includeRecurring ? uniqueTasksById(fetchedSource) : filterWorkflowTasks(fetchedSource))
            : contextTasks,
        [contextTasks, includeRecurring, fetchedSource],
    );

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
                const tasks = await fetchFullTaskList();
                if (mounted) {
                    setFetchedTasks(tasks);
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
        loading,
        // True when `tasks` is the complete workspace list, not a filtered subset.
        isFullList: !isFiltered || Boolean(fetchedTasks),
    };
}
