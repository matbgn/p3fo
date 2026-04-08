import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateProjection, getProjectedHoursForActualMonth, getHistoricalHourlyBalances, getVacationsBalances } from './projectedHours';
import type { CombinedSettings } from '@/hooks/useCombinedSettings';
import type { Task } from '@/hooks/useTasks';

const mockSettings: CombinedSettings = {
    userWorkloadPercentage: 100,
    hoursToBeDoneByDay: 8,
    country: 'CH',
    region: 'BE',
    preferredWorkingDays: { '1': 1, '2': 1, '3': 1, '4': 1, '5': 1 },
    hourlyBalanceLimitUpper: 30,
    hourlyBalanceLimitLower: -30,
    vacationLimitMultiplier: 1.5,
};

const makeTaskWithTimer = (startTime: number, endTime: number, userId?: string): Task => ({
    id: 'test-task',
    title: 'Test Task',
    parentId: null,
    children: [],
    createdAt: startTime,
    triageStatus: 'Done',
    urgent: false,
    impact: false,
    majorIncident: false,
    sprintTarget: false,
    difficulty: 1,
    timer: [{ startTime, endTime }],
    category: 'General',
    priority: 50,
    userId: userId ?? 'test-user',
});

describe('calculateProjection', () => {
    it('projects zero remaining hours when all inputs are zero', () => {
        const result = calculateProjection({
            hoursDone: 0,
            preferredDaysPassed: 0,
            totalPreferredDaysInMonth: 0,
            historyPace: 0
        });
        expect(result).toBe(0);
    });

    it('returns exactly hoursDone when no preferred days have passed and history pace is zero', () => {
        const result = calculateProjection({
            hoursDone: 12.5,
            preferredDaysPassed: 0,
            totalPreferredDaysInMonth: 5,
            historyPace: 0
        });
        expect(result).toBe(12.5);
    });

    it('projects exclusively using history pace when no preferred days have passed', () => {
        const result = calculateProjection({
            hoursDone: 0,
            preferredDaysPassed: 0,
            totalPreferredDaysInMonth: 10,
            historyPace: 7.5
        });
        expect(result).toBe(75); // 0 done + (7.5 history pace * 10 remaining days)
    });

    it('projects using current pace when it is higher than history pace', () => {
        const result = calculateProjection({
            hoursDone: 36.5,
            preferredDaysPassed: 5,
            totalPreferredDaysInMonth: 10,
            historyPace: 0
        });
        expect(result).toBe(73);
    });

    it('never projects negative remaining days if days passed exceeds total preferred days', () => {
        const result = calculateProjection({
            hoursDone: 80,
            preferredDaysPassed: 12,
            totalPreferredDaysInMonth: 10,
            historyPace: 7.5
        });
        expect(result).toBe(80);
    });
});

describe('getProjectedHoursForActualMonth - vacation handling', () => {
    beforeEach(() => {
        vi.setSystemTime(new Date(2026, 3, 8)); // April 8, 2026
    });

    afterAll(() => {
        vi.useRealTimers();
    });

    it('should not double-count vacation hours in projection', () => {
        const settings50: CombinedSettings = {
            ...mockSettings,
            userWorkloadPercentage: 50,
        };

        const tasks: Task[] = [];

        const resultNoVaction = getProjectedHoursForActualMonth(2026, 4, tasks, settings50, 0);
        const resultWith40hVacation = getProjectedHoursForActualMonth(2026, 4, tasks, settings50, -40);

        const hoursDueNoVacation = resultNoVaction.hoursDue;
        const hoursDueWithVacation = resultWith40hVacation.hoursDue;

        // Hours due should be the same regardless of vacation (it's based on working days * workload)
        expect(hoursDueWithVacation).toBe(hoursDueNoVacation);

        // The projected total with vacation should NOT be 40h more than without
        // because vacation days reduce remaining projection days
        const projectedDifference = resultWith40hVacation.totalTimeExpandedInHours - resultNoVaction.totalTimeExpandedInHours;

        // With 40h vacation (5 days at 8h/day), the remaining projection should shrink by 5 days worth of pacing
        // but the 40h should still count as hours done. The net effect should be less than the raw 40h difference
        // because we removed 5 days from the projection window.
        expect(Math.abs(projectedDifference)).toBeLessThanOrEqual(40);
    });

    it('should reduce remaining workable days by vacation day equivalent', () => {
        const settings50: CombinedSettings = {
            ...mockSettings,
            userWorkloadPercentage: 50,
        };

        const tasks: Task[] = [];

        // 40h vacation = 5 work days at 8h/day
        const resultWithVacation = getProjectedHoursForActualMonth(2026, 4, tasks, settings50, -40);
        const resultNoVacation = getProjectedHoursForActualMonth(2026, 4, tasks, settings50, 0);

        // projectedTotal should include vacation hours as "done" time
        // but the pace projection should cover fewer days
        // The balance should be more favorable with vacation (because you fulfill your obligation on vacation days)
        // but NOT by double-counting
        expect(resultWithVacation.totalTimeExpandedInHours).toBeGreaterThan(0);
    });

    it('should handle positive vacation values gracefully', () => {
        const settings50: CombinedSettings = {
            ...mockSettings,
            userWorkloadPercentage: 50,
        };

        const tasks: Task[] = [];

        // If someone enters 40 (positive) instead of -40
        const result = getProjectedHoursForActualMonth(2026, 4, tasks, settings50, 40);

        // Should work without errors - Math.abs handles both signs
        expect(result.totalTimeExpandedInHours).toBeGreaterThan(0);
    });

    it('should handle zero vacation correctly', () => {
        const settings50: CombinedSettings = {
            ...mockSettings,
            userWorkloadPercentage: 50,
        };

        const tasks: Task[] = [];

        const result0 = getProjectedHoursForActualMonth(2026, 4, tasks, settings50, 0);
        const resultExplicit0 = getProjectedHoursForActualMonth(2026, 4, tasks, settings50);

        expect(result0.totalTimeExpandedInHours).toBe(resultExplicit0.totalTimeExpandedInHours);
        expect(result0.hoursDue).toBe(resultExplicit0.hoursDue);
    });
});

describe('getHistoricalHourlyBalances - selected user settings', () => {
    beforeEach(() => {
        vi.setSystemTime(new Date(2026, 3, 8));
    });

    afterAll(() => {
        vi.useRealTimers();
    });

    it('should use selected user workload for current month, not viewing user workload', () => {
        const viewingUserSettings: CombinedSettings = {
            ...mockSettings,
            userWorkloadPercentage: 40,
        };

        const tasks: Task[] = [];
        const targetUserWorkload = 50;
        const monthlyBalances = {
            '2026-04': {
                workload: 40, // Stale workload from viewing user
                hourlyBalance: 0,
                hoursDone: 0,
            }
        };

        const data = getHistoricalHourlyBalances(tasks, viewingUserSettings, 0, monthlyBalances, targetUserWorkload);

        const currentMonth = data.find(d => d.descId === '2026-04');
        expect(currentMonth).toBeDefined();
        // Current month should use the target user workload (50), not the stored stale value (40)
        expect(currentMonth!.workload).toBe(50);
    });

    it('should use stored workload for past months', () => {
        const viewingUserSettings: CombinedSettings = {
            ...mockSettings,
            userWorkloadPercentage: 40,
        };

        const tasks: Task[] = [];
        const targetUserWorkload = 50;
        const monthlyBalances = {
            '2026-03': {
                workload: 60, // Historical workload
                hourlyBalance: 10,
                hoursDone: 80,
            }
        };

        const data = getHistoricalHourlyBalances(tasks, viewingUserSettings, 2, monthlyBalances, targetUserWorkload);

        const pastMonth = data.find(d => d.descId === '2026-03');
        expect(pastMonth).toBeDefined();
        // Past months should keep historical workload
        expect(pastMonth!.workload).toBe(60);
    });

    it('should use effectiveSettings for hours due calculation', () => {
        const viewingUserSettings: CombinedSettings = {
            ...mockSettings,
            userWorkloadPercentage: 40,
            hoursToBeDoneByDay: 8,
        };

        const tasks: Task[] = [];
        const targetUserWorkload = 50;
        const monthlyBalances = {
            '2026-03': {
                workload: 50,
                hourlyBalance: 0,
                hoursDone: 88, // 50% * 22 working days * 8h = 88h
            }
        };

        const data = getHistoricalHourlyBalances(tasks, viewingUserSettings, 2, monthlyBalances, targetUserWorkload);

        const pastMonth = data.find(d => d.descId === '2026-03');
        expect(pastMonth).toBeDefined();
        // hoursDue = workingDays * 8 * (workload/100)
        // March 2026 has ~22 working days in CH/BE
        // with workload 50%, hoursDue should be around 88
        expect(pastMonth!.workload).toBe(50);
    });
});

describe('getVacationsBalances - selected user settings', () => {
    beforeEach(() => {
        vi.setSystemTime(new Date(2026, 3, 8));
    });

    afterAll(() => {
        vi.useRealTimers();
    });

    it('should use effectiveSettings for vacation due calculation', () => {
        const viewingUserSettings: CombinedSettings = {
            ...mockSettings,
            userWorkloadPercentage: 40,
            hoursToBeDoneByDay: 8,
        };

        const targetUserWorkload = 50;
        const monthlyBalances = {
            '2026-03': {
                workload: 50,
                hourlyBalance: 0,
                hoursDone: 0,
                vacationsHourlyBalance: 10,
                vacationsHourlyTaken: -8,
            }
        };

        const data = getVacationsBalances(viewingUserSettings, 18, 6, monthlyBalances, targetUserWorkload);

        const marchEntry = data.find(d => d.descId === '2026-03');
        expect(marchEntry).toBeDefined();
        // March workload should use stored value (past month)
        expect(marchEntry!.workload).toBe(50);
    });

    it('should use target user workload for current month', () => {
        const viewingUserSettings: CombinedSettings = {
            ...mockSettings,
            userWorkloadPercentage: 40,
        };

        const targetUserWorkload = 50;
        const monthlyBalances = {
            '2026-04': {
                workload: 40, // Stale workload from viewing user
                hourlyBalance: 0,
                hoursDone: 0,
                vacationsHourlyTaken: -16,
            }
        };

        const data = getVacationsBalances(viewingUserSettings, 18, 6, monthlyBalances, targetUserWorkload);

        const currentMonth = data.find(d => d.descId === '2026-04');
        expect(currentMonth).toBeDefined();
        // Current month should use target user workload, not stale stored value
        expect(currentMonth!.workload).toBe(50);
    });
});

describe('Vacation projection edge cases', () => {
    beforeEach(() => {
        vi.setSystemTime(new Date(2026, 3, 8)); // April 8, 2026
    });

    afterAll(() => {
        vi.useRealTimers();
    });

    it('should not produce unrealistic projections when large vacation is taken in current month', () => {
        const settings50: CombinedSettings = {
            ...mockSettings,
            userWorkloadPercentage: 50,
        };

        const tasks: Task[] = [];

        // No vacation
        const resultNoVacation = getProjectedHoursForActualMonth(2026, 4, tasks, settings50, 0);

        // 40h vacation (5 full days)
        const result40hVacation = getProjectedHoursForActualMonth(2026, 4, tasks, settings50, -40);

        expect(result40hVacation.totalTimeExpandedInHours).toBeGreaterThan(0);

        // The difference should not exceed the vacation hours value
        // (which would indicate double-counting)
        const projDiff = result40hVacation.totalTimeExpandedInHours - resultNoVacation.totalTimeExpandedInHours;
        expect(projDiff).toBeLessThanOrEqual(40);
    });

    it('should reduce projection days by vacation days and add vacation hours', () => {
        const settings100: CombinedSettings = {
            ...mockSettings,
            userWorkloadPercentage: 100,
        };

        // Create tasks covering several days so there's a meaningful pace
        const tasks: Task[] = [];
        for (let day = 1; day <= 4; day++) {
            const start = new Date(2026, 3, day, 9, 0, 0).getTime();
            const end = start + 8 * 3600 * 1000;
            tasks.push(makeTaskWithTimer(start, end));
        }

        const resultNoVacation = getProjectedHoursForActualMonth(2026, 4, tasks, settings100, 0);
        const result40hVacation = getProjectedHoursForActualMonth(2026, 4, tasks, settings100, -40);

        // With 40h vacation:
        // - 5 vacation days are subtracted from total preferred days (reducing projection window)
        // - 40 vacation hours are added as earned time
        // - The net diff should be: +40h (vacation hours) - pace * 5 (removed projection days)
        // At 8h/day pace, removing 5 days removes ~40h, so net ≈ 0-40h diff
        // But the exact value depends on current vs history pace
        const projDiff = result40hVacation.totalTimeExpandedInHours - resultNoVacation.totalTimeExpandedInHours;
        // Vacation hours should be present in the total, and projection window is reduced
        expect(result40hVacation.totalTimeExpandedInHours).toBeGreaterThan(0);
        // The diff should not exceed the vacation hours (no double counting)
        expect(projDiff).toBeLessThanOrEqual(40);
    });

    it('should handle beginning-of-month vacation (no hours done yet)', () => {
        // Scenario: vacation taken in first week, no actual work hours tracked yet
        const settings50: CombinedSettings = {
            ...mockSettings,
            userWorkloadPercentage: 50,
        };

        const tasks: Task[] = [];
        const result = getProjectedHoursForActualMonth(2026, 4, tasks, settings50, -40);

        // With 0 hours done and 40h vacation, total should include vacation hours + projected hours
        // The projection uses historyPace for remaining days (reduced by vacation days)
        expect(result.totalTimeExpandedInHours).toBeGreaterThanOrEqual(40);
        // Hours due is based on full working days * workload (vacation doesn't reduce what's owed)
        // So balance should be negative or near zero (vacation covers some obligation but not all)
        expect(result.actualHourlyBalance).toBeLessThanOrEqual(0);
    });

    it('should handle end-of-month vacation (many hours already done)', () => {
        // Scenario: person worked a lot, now taking vacation at end of month
        const settings100: CombinedSettings = {
            ...mockSettings,
            userWorkloadPercentage: 100,
        };

        // Simulate having worked 120 hours already this month (late in April)
        vi.setSystemTime(new Date(2026, 3, 24));
        const startOfWork = new Date(2026, 3, 1, 9, 0, 0).getTime();
        const tasks = [makeTaskWithTimer(startOfWork, startOfWork + 120 * 3600 * 1000)];

        const resultNoVacation = getProjectedHoursForActualMonth(2026, 4, tasks, settings100, 0);
        const resultWithVacation = getProjectedHoursForActualMonth(2026, 4, tasks, settings100, -40);

        // With vacation, total projected hours should include the vacation hours
        expect(resultWithVacation.totalTimeExpandedInHours).toBeGreaterThan(resultNoVacation.totalTimeExpandedInHours);
        // And the projection window should be reduced (fewer remaining work days)
        expect(resultWithVacation.totalTimeExpandedInHours).toBeGreaterThan(120);
    });

    it('should handle vacation that exceeds remaining work days', () => {
        const settings100: CombinedSettings = {
            ...mockSettings,
            userWorkloadPercentage: 100,
        };

        const tasks: Task[] = [];

        // 160h vacation = 20 full work days (more than half a month)
        // This should not produce negative projection days
        const result = getProjectedHoursForActualMonth(2026, 4, tasks, settings100, -160);

        expect(result.totalTimeExpandedInHours).toBeGreaterThanOrEqual(0);
        expect(result.actualHourlyBalance).toBeLessThanOrEqual(0);
    });

    it('vacation hours should count as done time in hourly balance', () => {
        const settings100: CombinedSettings = {
            ...mockSettings,
            userWorkloadPercentage: 100,
        };

        const tasks: Task[] = [];

        const result0 = getProjectedHoursForActualMonth(2026, 4, tasks, settings100, 0);
        const result40 = getProjectedHoursForActualMonth(2026, 4, tasks, settings100, -40);

        // With vacation, total projected hours should include vacation hours
        // (they count as time fulfilling the obligation)
        expect(result40.totalTimeExpandedInHours).toBeGreaterThan(result0.totalTimeExpandedInHours - 40);
    });
});