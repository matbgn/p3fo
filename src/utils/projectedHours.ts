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



export function getRemainingWorkingDays(year: number, month: number, country: string = 'CH', region: string = 'BE'): number {
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
    const hd = new Holidays(country, region, { types: ['public'] });
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

// Helper to calculate total time from tasks for a specific date range
function calculateHoursDoneInDateRange(tasks: Task[], startDate: Date, endDate: Date): number {
    let totalMilliseconds = 0;
    const startRange = startDate.getTime();
    const endRange = endDate.getTime();

    tasks.forEach(task => {
        if (task.timer && Array.isArray(task.timer)) {
            task.timer.forEach(entry => {
                const start = entry.startTime;
                let end = entry.endTime;
                if (!end || end === 0) {
                    end = Date.now();
                }

                // Check overlap with range
                const effectiveStart = Math.max(start, startRange);
                const effectiveEnd = Math.min(end, endRange);

                if (effectiveEnd > effectiveStart) {
                    totalMilliseconds += (effectiveEnd - effectiveStart);
                }
            });
        }
    });

    return totalMilliseconds / (1000 * 60 * 60);
}

function calculateHistoryPace(tasks: Task[], daysBack: number = 50, country: string = 'CH', region: string = 'BE'): number {
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(now.getDate() - daysBack);

    // 1. Calculate working days in the range
    // We need to iterate day by day or use a more sophisticated method.
    // Given 50 days is small, iteration is fine.
    const hd = new Holidays(country, region, { types: ['public'] });
    let workingDays = 0;
    for (let d = new Date(startDate); d <= now; d.setDate(d.getDate() + 1)) {
        if (d.getDay() !== 0 && d.getDay() !== 6 && !hd.isHoliday(d)) {
            workingDays++;
        }
    }

    if (workingDays === 0) return 0;

    // 2. Calculate hours done in the range
    const hoursDone = calculateHoursDoneInDateRange(tasks, startDate, now);

    return hoursDone / workingDays;
}

export function getProjectedHoursForActualMonth(
    year: number,
    month: number,
    tasks: Task[],
    settings: CombinedSettings,
    vacationsTaken: number = 0
) {
    const workingDays = getWorkingDays(year, month, 1, undefined, settings.country, settings.region);
    const hoursToBeDoneByDayByContract = settings.hoursToBeDoneByDay ?? 8;
    const workloadInDecimal = settings.userWorkloadPercentage / 100;

    const hoursDue = workingDays * hoursToBeDoneByDayByContract * workloadInDecimal;
    const hoursDone = calculateHoursDoneFromTasks(tasks, year, month);

    // Linear Projection Logic with Gliding Average
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const currentDay = now.getDate();

    let projectedTotal = hoursDone;

    // Only project if we are in the current month or a future month
    // For past months, projected is just what was done (handled by initial assignment)
    if (year > currentYear || (year === currentYear && month > currentMonth)) {
        // Future month: default to theoretical target
        projectedTotal = hoursDue;
    } else if (year === currentYear && month === currentMonth) {
        // Current month
        // Calculate working days passed so far (from day 1 to today)
        const workingDaysSoFar = getWorkingDays(year, month, 1, currentDay, settings.country, settings.region);
        const totalWorkingDaysInMonth = workingDays; // Already calculated above

        // Calculate History Pace (last 50 days)
        const historyPace = calculateHistoryPace(tasks, 50, settings.country, settings.region);

        // Calculate Current Pace
        // We use Math.max(1, workingDaysSoFar) to avoid division by zero
        const currentPace = hoursDone / Math.max(1, workingDaysSoFar);

        // Calculate Weight Z
        // Z goes from 0 (start of month) to 1 (end of month)
        // We clamp it between 0 and 1 just in case
        const z = Math.max(0, Math.min(1, workingDaysSoFar / totalWorkingDaysInMonth));

        const weightedPace = (z * currentPace) + ((1 - z) * historyPace);

        projectedTotal = weightedPace * totalWorkingDaysInMonth;

    } else {
        // Past month
        projectedTotal = hoursDone;
    }

    // Add vacations taken to the projected total (as they count towards the balance)
    // vacationsTaken is negative, so we subtract it to add the absolute value
    projectedTotal -= vacationsTaken;

    const totalTimeExpandedInHours = projectedTotal;

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

export interface DataPoint {
    date: string; // Keep date as it's used in data.push
    descId: string;
    workload: number;
    hourlyBalance: number;
    hoursDone: number;
    hoursDue: number; // Keep hours_due as it's used in data.push
    projected: boolean;
    cumulativeBalance: number; // Keep cumulative_balance as it's used in data.push
    vacationsDue?: number; // Added from snippet
    vacationsHourlyBalance?: number; // Added from snippet
    vacationsHourlyTaken?: number; // Added from snippet
    isManual?: boolean; // Added from instruction
    modifiedBy?: string; // Added from instruction
}

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
                const vacationsTaken = monthlyBalances[descId]?.vacationsHourlyTaken || 0;
                const projected = getProjectedHoursForActualMonth(year, month, tasks, effectiveSettings, vacationsTaken);
                hoursDone = projected.totalTimeExpandedInHours;
            } else if (monthlyBalances[descId].hoursDone !== undefined && monthlyBalances[descId].hoursDone !== 0) {
                // Use manual hours done if present for past months
                hoursDone = monthlyBalances[descId].hoursDone;
            } else {
                hoursDone = calculateHoursDoneFromTasks(tasks, year, month);
            }

            // Always calculate balance to ensure consistency, ignoring potentially stale stored balance
            const workingDays = getWorkingDays(year, month, 1, undefined, settings.country, settings.region);
            const hoursDue = workingDays * (settings.hoursToBeDoneByDay ?? 8) * (workload / 100);
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

            const workingDays = getWorkingDays(year, month, 1, undefined, settings.country, settings.region);
            const hoursDue = workingDays * (settings.hoursToBeDoneByDay ?? 8) * (workload / 100);
            currentBalance = hoursDone - hoursDue;
        }

        cumulativeBalance += currentBalance;

        const workingDays = getWorkingDays(year, month, 1, undefined, settings.country, settings.region);
        const hoursDue = workingDays * (settings.hoursToBeDoneByDay ?? 8) * (workload / 100);

        data.push({
            date: `${date.toLocaleDateString("default", { month: "short" })} ${year % 100}`,
            descId: descId,
            workload: workload,
            hourlyBalance: Number(currentBalance.toFixed(1)),
            hoursDone: Number(hoursDone.toFixed(1)),
            hoursDue: Number(hoursDue.toFixed(1)),
            projected: false,
            cumulativeBalance: Number(cumulativeBalance.toFixed(1)),
            isManual: monthlyBalances[descId]?.isManual,
            modifiedBy: monthlyBalances[descId]?.modifiedBy
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

        const workingDays = getWorkingDays(year, month, 1, undefined, settings.country, settings.region);
        const hoursDue = workingDays * (settings.hoursToBeDoneByDay ?? 8) * (lastWorkload / 100);

        projectedBalance += 0; // Assume neutral balance for projection

        data.push({
            date: `${date.toLocaleDateString("default", { month: "short" })} ${year % 100}`,
            descId: descId,
            workload: lastWorkload,
            hourlyBalance: 0,
            hoursDone: Number(hoursDue.toFixed(1)),
            hoursDue: Number(hoursDue.toFixed(1)),
            projected: true,
            cumulativeBalance: Number(projectedBalance.toFixed(1))
        });
    }

    return data;
}

export function getMonthProjectionVacations(
    year: number,
    month: number,
    workloadInDecimal: number,
    hoursToBeDoneByDay: number = 8,
    country: string = 'CH',
    region: string = 'BE'
): number {
    const hoursToBeDoneByDayByContract = hoursToBeDoneByDay;
    const vacationsWeekNbrByContract = 5;
    const vacationsRate =
        Math.round(
            (vacationsWeekNbrByContract / (52 - vacationsWeekNbrByContract)) * 10000
        ) / 10000;
    const monthProjectedVacations =
        getWorkingDays(year, month, 1, undefined, country, region) *
        hoursToBeDoneByDayByContract *
        workloadInDecimal *
        vacationsRate;

    return Math.round(monthProjectedVacations * 10) / 10;
}

export type VacationsDataPoint = {
    date: string;
    descId: string;
    workload: number;
    vacationsHourlyBalance: number;
    vacationsHourlyTaken: number;
    vacationsDue: number;
    projected: boolean;
    cumulativeBalance: number;
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
            vacationsTaken = monthlyBalances[descId].vacationsHourlyTaken || 0;
        } else {
            if (isCurrentMonth) {
                workload = defaultWorkload;
            } else {
                workload = 0;
            }
        }

        const vacationsDue = getMonthProjectionVacations(year, month, workload / 100, settings.hoursToBeDoneByDay ?? 8, settings.country, settings.region);

        let currentBalance = 0;
        if (monthlyBalances[descId] && monthlyBalances[descId].vacationsHourlyBalance !== undefined) {
            currentBalance = monthlyBalances[descId].vacationsHourlyBalance!;
            cumulativeBalance = currentBalance;
        } else {
            cumulativeBalance += vacationsDue + vacationsTaken;
            currentBalance = cumulativeBalance;
        }

        data.push({
            date: `${date.toLocaleDateString("default", { month: "short" })} ${year % 100}`,
            descId: descId,
            workload: workload,
            vacationsHourlyBalance: Number(currentBalance.toFixed(1)),
            vacationsHourlyTaken: vacationsTaken,
            vacationsDue: vacationsDue,
            projected: false,
            cumulativeBalance: Number(currentBalance.toFixed(1))
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

        const vacationsDue = getMonthProjectionVacations(year, month, lastWorkload / 100, settings.hoursToBeDoneByDay ?? 8, settings.country, settings.region);
        projectedBalance += vacationsDue;

        data.push({
            date: `${date.toLocaleDateString("default", { month: "short" })} ${year % 100}`,
            descId: descId,
            workload: lastWorkload,
            vacationsHourlyBalance: Number(projectedBalance.toFixed(1)),
            vacationsHourlyTaken: 0,
            vacationsDue: vacationsDue,
            projected: true,
            cumulativeBalance: Number(projectedBalance.toFixed(1))
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
