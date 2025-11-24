import { Task } from "@/hooks/useTasks";
import { getWorkingDays, getWorkingDaysDeltaInSameMonth } from './workingdays';
import { CombinedSettings } from '@/hooks/useCombinedSettings';

type ProjectedHoursResult = {
    totalTimeElapsedForAllMonth: number
    hoursDue: number
    totalTimeExpandedInHours: number
    actualHourlyBalance: number
    hourlyBalanceProjection: number
}

export function getProjectedHoursForActualMonth(
    year: number,
    month: number,
    tasks: Task[],
    settings: CombinedSettings,
    isForcedProjection?: boolean
): ProjectedHoursResult {
    if (isForcedProjection === undefined || isForcedProjection === null) {
        isForcedProjection = false
    }

    const workloadPercentage = settings.userWorkloadPercentage;
    const workingDays = getWorkingDays(year, month)
    const hoursDue =
        Math.round(
            (workloadPercentage / 100) * workingDays * 8 * 10
        ) / 10

    let totalTimeElapsedForAllMonth
    let totalTimeExpandedInHours

    // Calculate hours done for the month from tasks
    // We need to sum up duration of tasks or timer entries that fall in this month
    // For simplicity, let's assume we look at tasks created or updated in this month
    // OR better, we should look at the timer entries if available, or durationInMinutes

    // Filter tasks/entries for the specific month/year
    const startDate = new Date(year, month - 1, 1).getTime();
    const endDate = new Date(year, month, 0, 23, 59, 59).getTime();

    let totalTimeElapsedForAllMonthInSeconds = 0;

    tasks.forEach(task => {
        if (task.timer && task.timer.length > 0) {
            task.timer.forEach(entry => {
                const entryStart = entry.startTime;
                const entryEnd = entry.endTime || Date.now();

                // Check if entry overlaps with the month
                const effectiveStart = Math.max(entryStart, startDate);
                const effectiveEnd = Math.min(entryEnd, endDate);

                if (effectiveStart < effectiveEnd) {
                    totalTimeElapsedForAllMonthInSeconds += (effectiveEnd - effectiveStart) / 1000;
                }
            });
        } else if (task.durationInMinutes) {
            // If no timer, use durationInMinutes if the task was "done" in this month?
            // Or maybe just use created date as a proxy?
            // Legacy used TimetableRecord which seemed to be a monthly aggregate.
            // Here we are aggregating on the fly.
            // Let's rely on timer for accuracy, or fallback to creation date if simple task
            if (task.createdAt >= startDate && task.createdAt <= endDate) {
                totalTimeElapsedForAllMonthInSeconds += task.durationInMinutes * 60;
            }
        }
    });

    const hoursDone = Math.round((totalTimeElapsedForAllMonthInSeconds / 3600) * 10) / 10;
    const holidayHoursTaken = 0; // Not tracked currently
    const previousHourlyBalance = 0; // Not tracked currently

    if (
        (new Date().getFullYear() !== year && new Date().getMonth() !== month - 1) &&
        !isForcedProjection
    ) {
        // Past month
        totalTimeElapsedForAllMonth = hoursDone
        totalTimeExpandedInHours = hoursDone
    } else {
        // Current month projection
        totalTimeElapsedForAllMonth = hoursDone

        const daythOfMonth = new Date().getDate()
        const actualMonth = month - 1 // JS months are 0-indexed
        const yearOfActualMonth = new Date().getFullYear()

        // Only project if we are in the requested month
        if (year === yearOfActualMonth && month - 1 === actualMonth) {
            const workingDaysTillToday = getWorkingDaysDeltaInSameMonth({
                startDate: new Date(yearOfActualMonth, actualMonth, 1),
                endDate: new Date(yearOfActualMonth, actualMonth, daythOfMonth),
                includeStartDate: true,
            })

            const remainingDaysTillEndOfMonth = workingDays - workingDaysTillToday

            // Avoid division by zero
            const rate = workingDaysTillToday > 0 ? totalTimeElapsedForAllMonth / workingDaysTillToday : 0;

            const deltaTimeTillEndOfMonthInHours = rate * remainingDaysTillEndOfMonth

            totalTimeExpandedInHours =
                Math.round(
                    (deltaTimeTillEndOfMonthInHours + totalTimeElapsedForAllMonth -
                        holidayHoursTaken) * 10
                ) / 10
        } else {
            // Future month? or just fallback
            totalTimeExpandedInHours = hoursDone;
        }
    }

    let actualHourlyBalance = 0.0
    // If we are in the past, actual balance is just done - due
    if (
        (new Date().getFullYear() !== year || new Date().getMonth() !== month - 1) &&
        !isForcedProjection
    ) {
        actualHourlyBalance = totalTimeElapsedForAllMonth - hoursDue
    } else {
        // If current month, use projected
        actualHourlyBalance = totalTimeExpandedInHours - hoursDue
    }
    actualHourlyBalance = Math.round(actualHourlyBalance * 10) / 10

    const hourlyBalanceProjection =
        Math.round((actualHourlyBalance + previousHourlyBalance) * 10) / 10

    return {
        totalTimeElapsedForAllMonth: totalTimeElapsedForAllMonth,
        hoursDue: hoursDue,
        totalTimeExpandedInHours: totalTimeExpandedInHours,
        actualHourlyBalance: actualHourlyBalance,
        hourlyBalanceProjection: hourlyBalanceProjection,
    }
}

export type DataPoint = {
    date: string;
    "Hours Delta per each Month": number;
    "Cummulative Hourly Balance": number;
    desc_id: string;
    workload: number;
    hourly_balance: number;
    hours_done: number;
};

import { MonthlyBalanceData } from "@/lib/persistence-types";

export function getHistoricalHourlyBalances(
    tasks: Task[],
    settings: CombinedSettings,
    monthsBack: number = 6,
    monthlyBalances: Record<string, MonthlyBalanceData> = {}
): DataPoint[] {
    const now = new Date();
    const data: DataPoint[] = [];
    let cumulativeBalance = 0;

    for (let offset = monthsBack; offset >= 0; offset--) {
        const monthDate = new Date(now.getFullYear(), now.getMonth() - offset, 1);
        const year = monthDate.getFullYear();
        const monthNum = monthDate.getMonth() + 1;
        const descId = `${year}-${String(monthNum).padStart(2, '0')}`;

        const projRes = getProjectedHoursForActualMonth(year, monthNum, tasks, settings, offset === 0);

        let workload = settings.userWorkloadPercentage;
        // For current month, use projected hours. For past months, use actual hours done
        let hoursDone = offset === 0 ? projRes.totalTimeExpandedInHours : projRes.totalTimeElapsedForAllMonth;

        // Calculate hours due based on working days and workload
        const workingDays = getWorkingDays(year, monthNum);
        let hoursDue = Math.round((workload / 100) * workingDays * 8 * 10) / 10;

        // Calculate delta as hours_done - hours_due
        let delta = hoursDone - hoursDue;

        // If it's a past month and we have a manual entry, use it
        if (offset > 0 && monthlyBalances[descId]) {
            const manualEntry = monthlyBalances[descId];
            workload = manualEntry.workload;
            hoursDone = manualEntry.hours_done;

            // Recalculate hours due with manual workload
            hoursDue = Math.round((workload / 100) * workingDays * 8 * 10) / 10;

            // Delta is auto-calculated from hours done and due
            delta = hoursDone - hoursDue;
        } else if (offset > 0) {
            // Past month without manual entry: make it empty/0 as requested
            delta = 0;
            hoursDone = 0;
            workload = 0;
            hoursDue = 0;
        }

        cumulativeBalance += delta;

        const dateStr = `${monthDate.toLocaleDateString("default", { month: "short" })} ${monthDate.getFullYear() % 100}`;

        data.push({
            date: dateStr,
            "Hours Delta per each Month": delta,
            "Cummulative Hourly Balance": cumulativeBalance,
            desc_id: descId,
            workload: workload,
            hourly_balance: delta,
            hours_done: hoursDone,
        });
    }

    // Don't reverse - oldest month on left, newest on right
    return data;
}

export default {
    getProjectedHoursForActualMonth,
    getHistoricalHourlyBalances,
};
