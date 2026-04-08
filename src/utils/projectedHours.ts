import { CombinedSettings } from "@/hooks/useCombinedSettings";
import { MonthlyBalanceData } from "@/lib/persistence-types";
import { getWorkingDays, getPreferredWorkingDays, getPreferredWorkingDaysInRange } from "./workingdays";
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

/**
 * Calculate the historical pace (hours per working day) over a given number of days.
 * This function now considers preferred working days to calculate a more accurate pace
 * for users who don't work all weekdays.
 * 
 * @param tasks - Array of tasks with timer entries
 * @param daysBack - Number of days to look back (default 50)
 * @param preferredDays - Map of preferred working days with capacity (0-1)
 * @param country - Country code for holidays
 * @param region - Region code for holidays
 * @returns Average hours per preferred working day
 */
function calculateHistoryPace(
    tasks: Task[],
    daysBack: number = 50,
    preferredDays: Record<number, number> | undefined,
    country: string = 'CH',
    region: string = 'BE'
): number {
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(now.getDate() - daysBack);

    // Use preferred working days for pace calculation
    const { effectiveDays } = getPreferredWorkingDaysInRange(
        startDate,
        now,
        preferredDays,
        country,
        region
    );

    // Avoid division by zero - if no preferred days in range, fall back to standard working days
    if (effectiveDays === 0) {
        const hd = new Holidays(country, region, { types: ['public'] });
        let fallbackWorkingDays = 0;
        for (let d = new Date(startDate); d <= now; d.setDate(d.getDate() + 1)) {
            if (d.getDay() !== 0 && d.getDay() !== 6 && !hd.isHoliday(d)) {
                fallbackWorkingDays++;
            }
        }
        if (fallbackWorkingDays === 0) return 0;
        
        const hoursDone = calculateHoursDoneInDateRange(tasks, startDate, now);
        return hoursDone / fallbackWorkingDays;
    }

    // Calculate hours done in the range
    const hoursDone = calculateHoursDoneInDateRange(tasks, startDate, now);

    return hoursDone / effectiveDays;
}

export function calculateProjection(params: {
    hoursDone: number;
    preferredDaysPassed: number;
    totalPreferredDaysInMonth: number;
    historyPace: number;
}): number {
    const remainingDays = Math.max(0, params.totalPreferredDaysInMonth - params.preferredDaysPassed);
    
    let currentPace = 0;
    if (params.preferredDaysPassed > 0) {
        currentPace = params.hoursDone / params.preferredDaysPassed;
    }
    
    const effectivePace = Math.max(currentPace, params.historyPace);

    return params.hoursDone + (effectivePace * remainingDays);
}

/**
 * Extended result type for projected hours with preferred days information
 */
export interface ProjectedHoursResult {
    totalTimeElapsedForAllMonth: number;
    hoursDue: number;
    totalTimeExpandedInHours: number;
    actualHourlyBalance: number;
    hourlyBalanceProjection: number;
    workload: number;
    preferredWorkingDays?: { totalDays: number; effectiveDays: number };
}

export function getProjectedHoursForActualMonth(
    year: number,
    month: number,
    tasks: Task[],
    settings: CombinedSettings,
    vacationsTaken: number = 0
): ProjectedHoursResult {
    const hoursToBeDoneByDayByContract = settings.hoursToBeDoneByDay ?? 8;
    const workloadInDecimal = settings.userWorkloadPercentage / 100;
    
    // Hours due is based on ALL working days (Mon-Fri) and workload percentage
    // Preferred days affect pace only, not hours due
    const workingDays = getWorkingDays(year, month, 1, undefined, settings.country, settings.region);
    const hoursDue = workingDays * hoursToBeDoneByDayByContract * workloadInDecimal;
    
    // Get preferred working days from settings (for pace calculation)
    const preferredDays = settings.preferredWorkingDays;
    
    // Hours done is calculated from all tasks regardless of preferred days
    // Working outside preferred days is a "bonus"
    const hoursDone = calculateHoursDoneFromTasks(tasks, year, month);

    // Linear Projection Logic with Gliding Average
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const currentDay = now.getDate();

    let projectedTotal = hoursDone;

    // Vacation hours count as hours worked (paid time off fulfilling obligation)
    const vacationHours = Math.abs(vacationsTaken);
    const hoursPerDay = hoursToBeDoneByDayByContract;
    const vacationDaysEquivalent = vacationHours / hoursPerDay;

    // Only project if we are in the current month or a future month
    // For past months, projected is just what was done (handled by initial assignment)
    if (year > currentYear || (year === currentYear && month > currentMonth)) {
        // Future month: default to theoretical target
        projectedTotal = hoursDue;
    } else if (year === currentYear && month === currentMonth) {
        // Current month
        // Calculate preferred working days passed so far (from day 1 to today)
        const preferredDaysSoFar = getPreferredWorkingDays(
            year,
            month,
            1,
            currentDay,
            preferredDays,
            settings.country,
            settings.region
        );
        
        // Calculate total preferred working days for the month (for pace calculation)
        const preferredDaysInMonth = getPreferredWorkingDays(
            year,
            month,
            1,
            undefined,
            preferredDays,
            settings.country,
            settings.region
        );
        
        const totalPreferredDaysInMonth = preferredDaysInMonth.effectiveDays;

        // Calculate History Pace using preferred days (last 50 days)
        const historyPace = calculateHistoryPace(
            tasks,
            50,
            preferredDays,
            settings.country,
            settings.region
        );

        // Reduce total preferred days by vacation day equivalents.
        // Vacation days are not available for future work, so they reduce the projection window.
        const effectiveTotalPreferredDays = Math.max(0, totalPreferredDaysInMonth - vacationDaysEquivalent);

        // Project the rest of the month using strict TDD logic.
        // Note: preferredDaysPassed is NOT adjusted for vacation because the current pace
        // (hoursDone / daysPassed) naturally reflects lower productivity during vacation periods.
        // The historyPace (last 50 days) provides a fallback when current pace is low.
        projectedTotal = calculateProjection({
            hoursDone,
            preferredDaysPassed: preferredDaysSoFar.effectiveDays,
            totalPreferredDaysInMonth: effectiveTotalPreferredDays,
            historyPace
        });

    } else {
        // Past month
        projectedTotal = hoursDone;
    }

    // Add vacation hours as hours worked
    projectedTotal += vacationHours;

    const totalTimeExpandedInHours = projectedTotal;

    // Balance is always done - due
    // For the "Delta hours projected with due" we want the projected balance
    const balance = totalTimeExpandedInHours - hoursDue;
    
    // Get preferred working days for the month for result
    const preferredDaysInMonth = getPreferredWorkingDays(
        year,
        month,
        1,
        undefined,
        preferredDays,
        settings.country,
        settings.region
    );

    return {
        totalTimeElapsedForAllMonth: Math.round(hoursDone * 10) / 10,
        hoursDue: Math.round(hoursDue * 10) / 10,
        totalTimeExpandedInHours: Math.round(totalTimeExpandedInHours * 10) / 10,
        actualHourlyBalance: Math.round(balance * 10) / 10,
        hourlyBalanceProjection: Math.round(balance * 10) / 10,
        workload: settings.userWorkloadPercentage,
        preferredWorkingDays: preferredDaysInMonth
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

    // Also determine the max future month in monthlyBalances for future records
    let maxFutureYear = currentYear;
    let maxFutureMonth = currentMonth;

    Object.keys(monthlyBalances).forEach(key => {
        const [y, m] = key.split('-').map(Number);
        if (y > maxFutureYear || (y === maxFutureYear && m > maxFutureMonth)) {
            maxFutureYear = y;
            maxFutureMonth = m;
        }
    });

    const data: DataPoint[] = [];
    let cumulativeBalance = 0;

    const endYear = Math.max(currentYear, maxFutureYear);
    const endMonth = (currentYear > maxFutureYear) ? currentMonth : 
                     (maxFutureYear > currentYear) ? maxFutureMonth : Math.max(currentMonth, maxFutureMonth);
    const totalMonths = (endYear - minYear) * 12 + (endMonth - minMonth);

    for (let i = 0; i <= totalMonths; i++) {
        const date = new Date(minYear, minMonth - 1 + i, 1);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const descId = `${year}-${String(month).padStart(2, '0')}`;
        const isCurrentMonth = year === currentYear && month === currentMonth;
        const isFuture = year > currentYear || (year === currentYear && month > currentMonth);

        let workload = 0;
        let hoursDone = 0;
        let currentBalance = 0;

        if (monthlyBalances[descId]) {
            workload = isCurrentMonth ? defaultWorkload : monthlyBalances[descId].workload;

            if (isCurrentMonth) {
                const vacationsTaken = monthlyBalances[descId]?.vacationsHourlyTaken || 0;
                const projected = getProjectedHoursForActualMonth(year, month, tasks, effectiveSettings, vacationsTaken);
                hoursDone = projected.totalTimeExpandedInHours;
            } else if (isFuture) {
                hoursDone = monthlyBalances[descId].hoursDone || 0;
            } else if (monthlyBalances[descId].hoursDone !== undefined && monthlyBalances[descId].hoursDone !== 0) {
                hoursDone = monthlyBalances[descId].hoursDone;
            } else {
                hoursDone = calculateHoursDoneFromTasks(tasks, year, month);
            }

            const workingDaysForMonth = getWorkingDays(year, month, 1, undefined, effectiveSettings.country, effectiveSettings.region);
            const hoursDue = workingDaysForMonth * (effectiveSettings.hoursToBeDoneByDay ?? 8) * (workload / 100);
            currentBalance = hoursDone - hoursDue;
        } else {
            // No record in DB
            if (isCurrentMonth) {
                workload = defaultWorkload;
                const projected = getProjectedHoursForActualMonth(year, month, tasks, effectiveSettings);
                hoursDone = projected.totalTimeExpandedInHours;
            } else if (isFuture) {
                workload = defaultWorkload;
                hoursDone = 0;
            } else {
                workload = 0;
                hoursDone = calculateHoursDoneFromTasks(tasks, year, month);
            }

            const workingDaysForMonth = getWorkingDays(year, month, 1, undefined, effectiveSettings.country, effectiveSettings.region);
            const hoursDue = workingDaysForMonth * (effectiveSettings.hoursToBeDoneByDay ?? 8) * (workload / 100);
            currentBalance = hoursDone - hoursDue;
        }

        cumulativeBalance += currentBalance;

        const displayWorkingDays = getWorkingDays(year, month, 1, undefined, effectiveSettings.country, effectiveSettings.region);
        const displayHoursDue = displayWorkingDays * (effectiveSettings.hoursToBeDoneByDay ?? 8) * (workload / 100);

        data.push({
            date: `${date.toLocaleDateString("default", { month: "short" })} ${year % 100}`,
            descId: descId,
            workload: workload,
            hourlyBalance: Number(currentBalance.toFixed(1)),
            hoursDone: Number(hoursDone.toFixed(1)),
            hoursDue: Number(displayHoursDue.toFixed(1)),
            projected: false,
            cumulativeBalance: Number(cumulativeBalance.toFixed(1)),
            isManual: monthlyBalances[descId]?.isManual,
            modifiedBy: monthlyBalances[descId]?.modifiedBy
        });
    }

    // 2. Calculate Projection from after the last stored month
    const lastBalance = cumulativeBalance;
    let projectedBalance = lastBalance;
    const lastWorkload = data.length > 0 ? data[data.length - 1].workload : defaultWorkload;

    const projStartYear = endYear;
    const projStartMonth = endMonth;
    for (let i = 1; i <= monthsForward; i++) {
        const date = new Date(projStartYear, projStartMonth - 1 + i, 1);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const descId = `${year}-${String(month).padStart(2, '0')}`;

        const projectedWorkingDays = getWorkingDays(year, month, 1, undefined, effectiveSettings.country, effectiveSettings.region);
        const hoursDue = projectedWorkingDays * (effectiveSettings.hoursToBeDoneByDay ?? 8) * (lastWorkload / 100);

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

    const effectiveSettings = {
        ...settings,
        userWorkloadPercentage: defaultWorkload
    };

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

    // Also determine the max future month in monthlyBalances for future records
    let maxFutureYear = currentYear;
    let maxFutureMonth = currentMonth;

    Object.keys(monthlyBalances).forEach(key => {
        const [y, m] = key.split('-').map(Number);
        if (y > maxFutureYear || (y === maxFutureYear && m > maxFutureMonth)) {
            maxFutureYear = y;
            maxFutureMonth = m;
        }
    });

    const data: VacationsDataPoint[] = [];
    let cumulativeBalance = 0;

    const endYear = Math.max(currentYear, maxFutureYear);
    const endMonth = (currentYear > maxFutureYear) ? currentMonth : 
                     (maxFutureYear > currentYear) ? maxFutureMonth : Math.max(currentMonth, maxFutureMonth);
    const totalMonths = (endYear - minYear) * 12 + (endMonth - minMonth);

    for (let i = 0; i <= totalMonths; i++) {
        const date = new Date(minYear, minMonth - 1 + i, 1);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const descId = `${year}-${String(month).padStart(2, '0')}`;
        const isCurrentMonth = year === currentYear && month === currentMonth;
        const isFuture = year > currentYear || (year === currentYear && month > currentMonth);

        let workload = 0;
        let vacationsTaken = 0;

        if (monthlyBalances[descId]) {
            workload = isCurrentMonth ? defaultWorkload : monthlyBalances[descId].workload;
            vacationsTaken = monthlyBalances[descId].vacationsHourlyTaken || 0;
        } else {
            if (isCurrentMonth || isFuture) {
                workload = defaultWorkload;
            } else {
                workload = 0;
            }
        }

        const vacationsDue = getMonthProjectionVacations(year, month, workload / 100, effectiveSettings.hoursToBeDoneByDay ?? 8, effectiveSettings.country, effectiveSettings.region);

        let currentBalance = 0;
        if (monthlyBalances[descId] && monthlyBalances[descId].vacationsHourlyBalance !== undefined && monthlyBalances[descId].vacationsHourlyBalance !== null) {
            // Use stored balance only if it was manually set (non-zero or explicitly stored)
            // A stored value of 0 for a future month that was auto-created breaks the cumulative chain
            const storedBalance = monthlyBalances[descId].vacationsHourlyBalance!;
            if (storedBalance !== 0 || !isFuture) {
                currentBalance = storedBalance;
                cumulativeBalance = currentBalance;
            } else {
                // Future month with 0 balance was auto-created, use cumulative calculation
                cumulativeBalance += vacationsDue + vacationsTaken;
                currentBalance = cumulativeBalance;
            }
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

    // 2. Calculate Projection from after the last stored month
    const lastBalance = cumulativeBalance;
    let projectedBalance = lastBalance;
    const lastWorkload = data.length > 0 ? data[data.length - 1].workload : effectiveSettings.userWorkloadPercentage;

    // Start projection from the month after the last stored data point (or after current month)
    const projStartYear = endYear;
    const projStartMonth = endMonth;
    for (let i = 1; i <= monthsForward; i++) {
        const date = new Date(projStartYear, projStartMonth - 1 + i, 1);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const descId = `${year}-${String(month).padStart(2, '0')}`;

        const vacationsDue = getMonthProjectionVacations(year, month, lastWorkload / 100, effectiveSettings.hoursToBeDoneByDay ?? 8, effectiveSettings.country, effectiveSettings.region);
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
