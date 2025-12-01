import { CombinedSettings } from "@/hooks/useCombinedSettings";
import { MonthlyBalanceData } from "@/lib/persistence-types";
import { getWorkingDays } from "./workingdays";
import { Task } from "@/hooks/useTasks";
import Holidays from 'date-holidays';

// Helper to calculate total time from tasks for a specific month
function calculateHoursDoneFromTasks(tasks: Task[], year: number, month: number): number {
    let totalMilliseconds = 0;
    // Start of month: 1st day at 00:00:00
    const startOfMonth = new Date(year, month - 1, 1).getTime();
    // End of month: Last day at 23:59:59.999
    const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999).getTime();

    tasks.forEach(task => {
        if (task.timer && Array.isArray(task.timer)) {
            task.timer.forEach(entry => {
                const start = entry.startTime;
                // If task is running (no endTime), use Date.now() but cap at endOfMonth
                // Actually, if we are calculating for a past month, a running task should count up to end of that month
                // If we are calculating for future, it shouldn't count.
                // But usually we calculate for past/current.

                let end = entry.endTime;
                if (!end || end === 0) {
                    end = Date.now();
                }

                // Check if task starts in the considered month
                if (start >= startOfMonth && start <= endOfMonth) {
                    // Count the entire duration of the task in the month it started
                    if (end > start) {
                        totalMilliseconds += (end - start);
                    }
                }
            });
        }
    });

    return totalMilliseconds / (1000 * 60 * 60);
}



export function getRemainingWorkingDays(year: number, month: number): number {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    // Past month
    if (year < currentYear || (year === currentYear && month < currentMonth)) {
        return 0;
    }

    // Future month
    if (year > currentYear || (year === currentYear && month > currentMonth)) {
        return 1; // Return > 0 to indicate working days exist
    }

    // Current month
    const hd = new Holidays('CH', 'BE', { types: ['public'] });
    const lastDayOfMonth = new Date(year, month, 0).getDate();
    const today = now.getDate();

    let remaining = 0;
    // Check from today onwards
    for (let day = today; day <= lastDayOfMonth; day++) {
        const date = new Date(year, month - 1, day);
        if (date.getDay() !== 0 && date.getDay() !== 6 && !hd.isHoliday(date)) {
            remaining++;
        }
    }
    return remaining;
}

export function getProjectedHoursForActualMonth(
    year: number,
    month: number,
    tasks: Task[],
    settings: CombinedSettings
) {
    const workingDays = getWorkingDays(year, month);
    const hoursToBeDoneByDayByContract = 8;
    const workloadInDecimal = settings.userWorkloadPercentage / 100;

    const hoursDue = workingDays * hoursToBeDoneByDayByContract * workloadInDecimal;
    const hoursDone = calculateHoursDoneFromTasks(tasks, year, month);

    const remainingWorkingDays = getRemainingWorkingDays(year, month);

    // If no working days left (or past month), projected is what is done.
    // Otherwise, assume we meet the target (hoursDue).
    const totalTimeExpandedInHours = remainingWorkingDays > 0 ? hoursDue : hoursDone;

    // Balance is always done - due
    // For the "Delta hours projected with due" we want the projected balance
    const balance = totalTimeExpandedInHours - hoursDue;

    return {
        totalTimeElapsedForAllMonth: Math.round(hoursDone * 10) / 10,
        hoursDue: Math.round(hoursDue * 10) / 10,
        totalTimeExpandedInHours: Math.round(totalTimeExpandedInHours * 10) / 10,
        actualHourlyBalance: Math.round(balance * 10) / 10,
        hourlyBalanceProjection: Math.round(balance * 10) / 10,
        workload: settings.userWorkloadPercentage
    };
}

export type DataPoint = {
    date: string;
    desc_id: string;
    workload: number;
    hourly_balance: number;
    hours_done: number;
    hours_due: number;
    projected: boolean;
    cumulative_balance: number;
};

// Alias for backward compatibility if needed, though I'll export DataPoint directly
export type HourlyBalanceDataPoint = DataPoint;

export function getHistoricalHourlyBalances(
    tasks: Task[],
    settings: CombinedSettings,
    monthsForward: number = 6,
    monthlyBalances: Record<string, MonthlyBalanceData> = {},
    userWorkload?: number
): DataPoint[] {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const defaultWorkload = userWorkload ?? settings.userWorkloadPercentage;

    const effectiveSettings = {
        ...settings,
        userWorkloadPercentage: defaultWorkload
    };

    // 1. Determine the start date for history
    // Find the earliest month in monthlyBalances
    let minYear = currentYear;
    let minMonth = currentMonth;

    Object.keys(monthlyBalances).forEach(key => {
        const [y, m] = key.split('-').map(Number);
        if (y < minYear || (y === minYear && m < minMonth)) {
            minYear = y;
            minMonth = m;
        }
    });

    // We want to generate data from minDate to now
    const data: DataPoint[] = [];
    let cumulativeBalance = 0;

    // Iterate month by month from minDate to current date
    // Calculate number of months between minDate and now
    const monthsDiff = (currentYear - minYear) * 12 + (currentMonth - minMonth);

    for (let i = 0; i <= monthsDiff; i++) {
        // Calculate date for current iteration
        // Start from minDate and add i months
        const date = new Date(minYear, minMonth - 1 + i, 1);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const descId = `${year}-${String(month).padStart(2, '0')}`;
        const isCurrentMonth = year === currentYear && month === currentMonth;

        let workload = 0;
        let hoursDone = 0;
        let currentBalance = 0;

        if (monthlyBalances[descId]) {
            workload = monthlyBalances[descId].workload;

            if (isCurrentMonth) {
                // For current month, ALWAYS use the projected logic which accounts for remaining working days
                // This ensures consistency with the Forecast view and ignores potentially stale stored values
                const projected = getProjectedHoursForActualMonth(year, month, tasks, effectiveSettings);
                hoursDone = projected.totalTimeExpandedInHours;
            } else if (monthlyBalances[descId].hours_done !== undefined && monthlyBalances[descId].hours_done !== 0) {
                // Use manual hours done if present for past months
                hoursDone = monthlyBalances[descId].hours_done;
            } else {
                hoursDone = calculateHoursDoneFromTasks(tasks, year, month);
            }

            // Always calculate balance to ensure consistency, ignoring potentially stale stored balance
            const workingDays = getWorkingDays(year, month);
            const hoursDue = workingDays * 8 * (workload / 100);
            currentBalance = hoursDone - hoursDue;
        } else {
            // No record in DB
            if (isCurrentMonth) {
                workload = defaultWorkload;
                // For current month, use the projected logic which accounts for remaining working days
                const projected = getProjectedHoursForActualMonth(year, month, tasks, settings);
                hoursDone = projected.totalTimeExpandedInHours;
            } else {
                workload = 0; // Default to 0 for past months without records
                hoursDone = calculateHoursDoneFromTasks(tasks, year, month);
            }

            const workingDays = getWorkingDays(year, month);
            const hoursDue = workingDays * 8 * (workload / 100);
            currentBalance = hoursDone - hoursDue;
        }

        cumulativeBalance += currentBalance;

        const workingDays = getWorkingDays(year, month);
        const hoursDue = workingDays * 8 * (workload / 100);

        data.push({
            date: `${date.toLocaleDateString("default", { month: "short" })} ${year % 100}`,
            desc_id: descId,
            workload: workload,
            hourly_balance: Number(currentBalance.toFixed(1)),
            hours_done: Number(hoursDone.toFixed(1)),
            hours_due: Number(hoursDue.toFixed(1)),
            projected: false,
            cumulative_balance: Number(cumulativeBalance.toFixed(1))
        });
    }

    // 2. Calculate Projection
    const lastBalance = cumulativeBalance;
    let projectedBalance = lastBalance;
    const lastWorkload = data.length > 0 ? data[data.length - 1].workload : defaultWorkload;

    for (let i = 1; i <= monthsForward; i++) {
        const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const descId = `${year}-${String(month).padStart(2, '0')}`;

        const workingDays = getWorkingDays(year, month);
        const hoursDue = workingDays * 8 * (lastWorkload / 100);

        projectedBalance += 0; // Assume neutral balance for projection

        data.push({
            date: `${date.toLocaleDateString("default", { month: "short" })} ${year % 100}`,
            desc_id: descId,
            workload: lastWorkload,
            hourly_balance: 0,
            hours_done: Number(hoursDue.toFixed(1)),
            hours_due: Number(hoursDue.toFixed(1)),
            projected: true,
            cumulative_balance: Number(projectedBalance.toFixed(1))
        });
    }

    return data;
}

export function getMonthProjectionVacations(
    year: number,
    month: number,
    workloadInDecimal: number
): number {
    const hoursToBeDoneByDayByContract = 8;
    const vacationsWeekNbrByContract = 5;
    const vacationsRate =
        Math.round(
            (vacationsWeekNbrByContract / (52 - vacationsWeekNbrByContract)) * 10000
        ) / 10000;
    const monthProjectedVacations =
        getWorkingDays(year, month) *
        hoursToBeDoneByDayByContract *
        workloadInDecimal *
        vacationsRate;

    return Math.round(monthProjectedVacations * 10) / 10;
}

export type VacationsDataPoint = {
    date: string;
    desc_id: string;
    workload: number;
    vacations_hourly_balance: number;
    vacations_hourly_taken: number;
    vacations_due: number;
    projected: boolean;
    cumulative_balance: number;
};

export function getVacationsBalances(
    settings: CombinedSettings,
    monthsBack: number = 18, // Ignored now, dynamic based on data
    monthsForward: number = 6,
    monthlyBalances: Record<string, MonthlyBalanceData> = {},
    userWorkload?: number
): VacationsDataPoint[] {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const defaultWorkload = userWorkload ?? settings.userWorkloadPercentage;

    // 1. Determine the start date for history
    let minYear = currentYear;
    let minMonth = currentMonth;

    Object.keys(monthlyBalances).forEach(key => {
        const [y, m] = key.split('-').map(Number);
        if (y < minYear || (y === minYear && m < minMonth)) {
            minYear = y;
            minMonth = m;
        }
    });

    const data: VacationsDataPoint[] = [];
    let cumulativeBalance = 0;

    const monthsDiff = (currentYear - minYear) * 12 + (currentMonth - minMonth);

    for (let i = 0; i <= monthsDiff; i++) {
        const date = new Date(minYear, minMonth - 1 + i, 1);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const descId = `${year}-${String(month).padStart(2, '0')}`;
        const isCurrentMonth = year === currentYear && month === currentMonth;

        let workload = 0;
        let vacationsTaken = 0;

        if (monthlyBalances[descId]) {
            workload = monthlyBalances[descId].workload;
            vacationsTaken = monthlyBalances[descId].vacations_hourly_taken || 0;
        } else {
            if (isCurrentMonth) {
                workload = defaultWorkload;
            } else {
                workload = 0;
            }
        }

        const vacationsDue = getMonthProjectionVacations(year, month, workload / 100);

        let currentBalance = 0;
        if (monthlyBalances[descId] && monthlyBalances[descId].vacations_hourly_balance !== undefined) {
            currentBalance = monthlyBalances[descId].vacations_hourly_balance!;
            cumulativeBalance = currentBalance;
        } else {
            cumulativeBalance += vacationsDue + vacationsTaken;
            currentBalance = cumulativeBalance;
        }

        data.push({
            date: `${date.toLocaleDateString("default", { month: "short" })} ${year % 100}`,
            desc_id: descId,
            workload: workload,
            vacations_hourly_balance: Number(currentBalance.toFixed(1)),
            vacations_hourly_taken: vacationsTaken,
            vacations_due: vacationsDue,
            projected: false,
            cumulative_balance: Number(currentBalance.toFixed(1))
        });
    }

    // 2. Calculate Projection
    const lastBalance = cumulativeBalance;
    let projectedBalance = lastBalance;
    const lastWorkload = data.length > 0 ? data[data.length - 1].workload : settings.userWorkloadPercentage;

    for (let i = 1; i <= monthsForward; i++) {
        const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const descId = `${year}-${String(month).padStart(2, '0')}`;

        const vacationsDue = getMonthProjectionVacations(year, month, lastWorkload / 100);
        projectedBalance += vacationsDue;

        data.push({
            date: `${date.toLocaleDateString("default", { month: "short" })} ${year % 100}`,
            desc_id: descId,
            workload: lastWorkload,
            vacations_hourly_balance: Number(projectedBalance.toFixed(1)),
            vacations_hourly_taken: 0,
            vacations_due: vacationsDue,
            projected: true,
            cumulative_balance: Number(projectedBalance.toFixed(1))
        });
    }

    return data;
}

export default {
    getProjectedHoursForActualMonth,
    getHistoricalHourlyBalances,
    getMonthProjectionVacations,
    getVacationsBalances
};
