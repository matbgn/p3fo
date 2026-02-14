import { Task } from '@/hooks/useTasks';
import moment from "moment";

/**
 * Normalizes preferred working days to a map of day index (0-6) -> capacity (0-1).
 * Handles legacy number[] format.
 */
export const normalizePreferredDays = (input?: number[] | Record<string, number>): Record<number, number> => {
    const result: Record<number, number> = {};

    if (!input) {
        // Default Mon-Fri full capacity
        [1, 2, 3, 4, 5].forEach(d => result[d] = 1);
        return result;
    }

    if (Array.isArray(input)) {
        // Legacy: array of day indices
        input.forEach(d => result[d] = 1);
    } else {
        // New: map of day -> capacity
        Object.entries(input).forEach(([day, capacity]) => {
            result[parseInt(day, 10)] = capacity;
        });
    }

    return result;
};

// Function to calculate total difficulty of a task and its descendants
export const calculateTotalDifficulty = (task: Task, allTasks: Task[]): number => {
    let totalDifficulty = task.difficulty || 0;

    if (task.children && task.children.length > 0) {
        task.children.forEach(childId => {
            const childTask = allTasks.find(t => t.id === childId);
            if (childTask) {
                totalDifficulty += calculateTotalDifficulty(childTask, allTasks);
            }
        });
    }

    return totalDifficulty;
};

// Function to calculate end date based on start date and duration (in days), skipping weekends
export const calculateEndDate = (startDate: Date, durationInDays: number): Date => {
    const endDate = moment(startDate);
    let remainingDays = durationInDays;

    while (remainingDays > 0) {
        endDate.add(1, 'days');
        // If it's Saturday or Sunday, we don't count it as a working day
        if (endDate.day() !== 0 && endDate.day() !== 6) {
            remainingDays -= 1;
        }
    }

    // Adjust for partial days if needed (e.g. 0.5 days)
    // For now, let's stick to full days as the smallest unit for visualization simplicity or refine later
    // If duration is less than 1 day, it still consumes a "slot" but visually might be smaller.
    // However, the prompt implies "stacking blocks", so let's assume contiguous blocks.

    return endDate.toDate();
};

// Function to schedule tasks for a user
export const scheduleTasksForUser = (userTasks: Task[], allTasks: Task[], startDate: Date = new Date()): { task: Task, start: Date, end: Date }[] => {
    // Sort tasks by priority (or other criteria)
    const sortedTasks = [...userTasks].sort((a, b) => {
        // Priority first (lower number is higher priority in some systems, but let's assume standard sort)
        // If priority is undefined, treat as low priority
        const priorityA = a.priority ?? 999;
        const priorityB = b.priority ?? 999;
        if (priorityA !== priorityB) return priorityA - priorityB;

        // Then by creation date
        return a.createdAt - b.createdAt;
    });

    const scheduledTasks: { task: Task, start: Date, end: Date }[] = [];
    let currentStartDate = moment(startDate);

    // If starting on a weekend, move to Monday
    if (currentStartDate.day() === 0) currentStartDate.add(1, 'days'); // Sunday -> Monday
    if (currentStartDate.day() === 6) currentStartDate.add(2, 'days'); // Saturday -> Monday

    sortedTasks.forEach(task => {
        const totalDifficulty = calculateTotalDifficulty(task, allTasks);
        // 8 points = 1 day
        const durationInDays = Math.max(0.125, totalDifficulty / 8); // Minimum duration to show distinct tasks? Or strictly proportional?
        // Let's use exact calculation. 1 point = 1/8 day.

        const endDate = calculateEndDate(currentStartDate.toDate(), durationInDays);

        scheduledTasks.push({
            task,
            start: currentStartDate.toDate(),
            end: endDate
        });

        // Next task starts when this one ends
        currentStartDate = moment(endDate);
        // Ensure next start is a working day (calculateEndDate already lands on a valid day or we might need to check?)
        // calculateEndDate logic adds days. If it ends on Friday 5pm, currentStartDate is Friday 5pm. 
        // Actually, let's simplify: 
        // We should probably model this as "working hours" to be precise, but "days" is easier for high level.
        // If we just add days, we might land on Sat/Sun if we just did date math. 
        // My calculateEndDate skips weekends for duration, but the *result* is a Date.
        // If we chain them, we need to make sure we don't start on a weekend if the previous one ended on Friday?
        // Actually, if calculateEndDate handled skipping weekends during the duration, the end date is a valid work day (or adjacent).
        // Let's refine calculateEndDate to be robust for chaining.

        // If the previous task ended on Friday, the next one should start on Monday? 
        // No, if it ended Friday afternoon, the next one starts Friday afternoon (if there's time left) or Monday morning.
        // But we are doing "Days" granularity mostly. 8 points = 1 day. 
        // Let's assume sequential Days for simplicity first. 
        // If task A takes 1 day (Mon), it ends Tue (start of day). Task B starts Tue.
    });

    return scheduledTasks;
}
