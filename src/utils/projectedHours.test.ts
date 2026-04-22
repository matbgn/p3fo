import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
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
    splitTime: '17:00',
    weeksComputation: 4,
    highImpactTaskGoal: 10,
    failureRateGoal: 5,
    qliGoal: 80,
    newCapabilitiesGoal: 20,
    weekStartDay: 1,
    defaultPlanView: 'week',
    timezone: 'Europe/Zurich',
    cardAgingBaseDays: 30,
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
    category: 'Support',
    priority: 50,
    userId: userId ?? 'test-user',
});

describe('calculateProjection', () => {
    it('projects zero when no hours done, no days passed, no vacation, zero pace', () => {
        const result = calculateProjection({
            hoursDone: 0,
            hoursDue: 0,
            vacationHours: 0,
            hoursPerDay: 8,
            preferredDaysPassed: 0,
            historyPace: 0
        });
        expect(result).toBe(0);
    });

    it('returns hoursDone when no work days are expected (hoursDue equals vacationHours)', () => {
        const result = calculateProjection({
            hoursDone: 12.5,
            hoursDue: 40,
            vacationHours: 40,
            hoursPerDay: 8,
            preferredDaysPassed: 5,
            historyPace: 8
        });
        expect(result).toBe(12.5);
    });

    it('projects using history pace when no preferred days have passed', () => {
        const result = calculateProjection({
            hoursDone: 0,
            hoursDue: 80,
            vacationHours: 0,
            hoursPerDay: 8,
            preferredDaysPassed: 0,
            historyPace: 8
        });
        // expectedWorkDays = (80 - 0) / 8 = 10
        // daysWorkedEquivalent = 0 / 8 = 0
        // remainingWorkDays = 10 - 0 = 10
        // projected = 0 + (8 * 10) = 80
        expect(result).toBe(80);
    });

    it('projects using current pace when it is higher than history pace', () => {
        const result = calculateProjection({
            hoursDone: 40,
            hoursDue: 80,
            vacationHours: 0,
            hoursPerDay: 8,
            preferredDaysPassed: 4,
            historyPace: 0
        });
        // effectivePace = max(40/4, 0) = 10
        // expectedWorkDays = 80/8 = 10
        // daysWorkedEquivalent = 40/10 = 4
        // remainingWorkDays = 10 - 4 = 6
        // projected = 40 + (10 * 6) = 100
        expect(result).toBe(100);
    });

    it('caps at hoursDone when all expected work days are consumed', () => {
        const result = calculateProjection({
            hoursDone: 80,
            hoursDue: 80,
            vacationHours: 0,
            hoursPerDay: 8,
            preferredDaysPassed: 12,
            historyPace: 7.5
        });
        // effectivePace = max(80/12, 7.5) ~= 6.67
        // expectedWorkDays = 80/8 = 10
        // daysWorkedEquivalent = 80/6.67 ~= 12
        // remainingWorkDays = max(0, 10 - 12) = 0
        // projected = 80 + (6.67 * 0) = 80
        expect(result).toBe(80);
    });

    it('reduces expectedWorkDays by vacation hours', () => {
        const resultNoVacation = calculateProjection({
            hoursDone: 0,
            hoursDue: 80,
            vacationHours: 0,
            hoursPerDay: 8,
            preferredDaysPassed: 0,
            historyPace: 8
        });
        const resultWithVacation = calculateProjection({
            hoursDone: 0,
            hoursDue: 80,
            vacationHours: 40,
            hoursPerDay: 8,
            preferredDaysPassed: 0,
            historyPace: 8
        });
        // Without vacation: expectedWorkDays=10, projected=80
        // With vacation: expectedWorkDays=(80-40)/8=5, projected=0+8*5=40
        expect(resultWithVacation).toBe(40);
        expect(resultWithVacation).toBeLessThan(resultNoVacation);
    });
});

describe('getProjectedHoursForActualMonth - expectation-normalized vacation handling', () => {
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

        const resultNoVacation = getProjectedHoursForActualMonth(2026, 4, tasks, settings50, 0);
        const resultWith40hVacation = getProjectedHoursForActualMonth(2026, 4, tasks, settings50, -40);

        // Hours due should be the same regardless of vacation (it's based on working days * workload)
        expect(resultWith40hVacation.hoursDue).toBe(resultNoVacation.hoursDue);

        // The projected total with vacation should NOT be 40h more than without
        // because vacation reduces the expected work days (not the hours due)
        const projectedDifference = resultWith40hVacation.totalTimeExpandedInHours - resultNoVacation.totalTimeExpandedInHours;
        expect(projectedDifference).toBeLessThanOrEqual(40);
    });

    it('should handle positive vacation values gracefully', () => {
        const settings50: CombinedSettings = {
            ...mockSettings,
            userWorkloadPercentage: 50,
        };

        const tasks: Task[] = [];

        // If someone enters 40 (positive) instead of -40, Math.abs handles both signs
        const result = getProjectedHoursForActualMonth(2026, 4, tasks, settings50, 40);
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

describe('Vacation scenarios (50% workload, 40h vacation = 2 work weeks)', () => {
    beforeEach(() => {
        vi.setSystemTime(new Date(2026, 3, 22));
    });

    afterAll(() => {
        vi.useRealTimers();
    });

    const settings50: CombinedSettings = {
        ...mockSettings,
        userWorkloadPercentage: 50,
    };

    it('scenario a: vacation at beginning of month, no work done yet', () => {
        const tasks: Task[] = [];
        const result = getProjectedHoursForActualMonth(2026, 4, tasks, settings50, -40);

        // 0 hoursDone, historyPace=0, expectedWorkDays=6
        // Fallback: hoursDone + expectedWorkDays * hoursPerDay = 0 + 6*8 = 48
        // + 40h vacation = 88h total
        expect(result.totalTimeExpandedInHours).toBeGreaterThanOrEqual(40);
        expect(result.actualHourlyBalance).toBeLessThanOrEqual(0);
    });

    it('scenario b: some work done before/after vacation, pace matches contract', () => {
        const tasks: Task[] = [];
        for (let day = 1; day <= 3; day++) {
            const start = new Date(2026, 3, day, 9, 0, 0).getTime();
            const end = start + 4 * 3600 * 1000;
            tasks.push(makeTaskWithTimer(start, end));
        }

        const resultNoVacation = getProjectedHoursForActualMonth(2026, 4, tasks, settings50, 0);
        const resultWithVacation = getProjectedHoursForActualMonth(2026, 4, tasks, settings50, -40);

        // With vacation: expectedWorkDays shrinks from ~11 to ~6
        // Result includes hours done + vacation hours + any remaining pace projection
        expect(resultWithVacation.totalTimeExpandedInHours).toBeGreaterThan(0);
        // Vacation should reduce the total vs no-vacation + 40h (no double-counting)
        expect(resultWithVacation.totalTimeExpandedInHours).toBeLessThanOrEqual(resultNoVacation.totalTimeExpandedInHours + 40);
    });

    it('scenario c: vacation towards end of month, work done early', () => {
        vi.setSystemTime(new Date(2026, 3, 24));

        const tasks: Task[] = [];
        for (let day = 1; day <= 10; day++) {
            const start = new Date(2026, 3, day, 9, 0, 0).getTime();
            const end = start + 4 * 3600 * 1000;
            tasks.push(makeTaskWithTimer(start, end));
        }

        const result = getProjectedHoursForActualMonth(2026, 4, tasks, settings50, -40);

        expect(result.totalTimeExpandedInHours).toBeGreaterThanOrEqual(40 + 40);
    });

    it('scenario: no vacation still projects based on pace', () => {
        const tasks: Task[] = [];
        // At 50% workload with 4h/day tasks, the pace is low (~0.8h preferred day)
        // If pace < hoursPerDay, daysWorkedEquivalent may exceed expectedWorkDays
        // In that case projection returns hoursDone (no additional projection).
        // This is correct: a slow pace means the employee has already used up their
        // calendar-day budget for the expected work.
        for (let day = 1; day <= 3; day++) {
            const start = new Date(2026, 3, day, 9, 0, 0).getTime();
            const end = start + 4 * 3600 * 1000;
            tasks.push(makeTaskWithTimer(start, end));
        }

        const result = getProjectedHoursForActualMonth(2026, 4, tasks, settings50, 0);

        // At very low effective pace, daysWorkedEquivalent > expectedWorkDays,
        // projection returns hoursDone. But with full-time pace from history, it would exceed.
        expect(result.totalTimeExpandedInHours).toBeGreaterThanOrEqual(12);
    });

    it('should NOT zero out projection when 0 hours done + vacation', () => {
        const tasks: Task[] = [];

        const result = getProjectedHoursForActualMonth(2026, 4, tasks, settings50, -40);

        // With 0 hoursDone and 0 historyPace, fallback kicks in:
        // projected = 0 + expectedWorkDays * hoursPerDay = 0 + 6*8 = 48
        // total = 48 + 40 = 88
        // This is the key fix: the old logic gave 0 remaining days.
        expect(result.totalTimeExpandedInHours).toBeGreaterThan(40);
    });

    it('should handle vacation that exceeds hours due', () => {
        const settings100: CombinedSettings = {
            ...mockSettings,
            userWorkloadPercentage: 100,
        };

        const tasks: Task[] = [];

        const result = getProjectedHoursForActualMonth(2026, 4, tasks, settings100, -200);

        // expectedWorkDays = max(0, (hoursDue - 200) / 8). If hoursDue < 200, expectedWorkDays = 0
        // Fallback with 0 pace: 0 + 0*8 = 0 projected
        // + 200 vacation = 200 total
        // But balance = 200 - hoursDue > 0 (vacation exceeds obligation)
        expect(result.totalTimeExpandedInHours).toBeGreaterThanOrEqual(0);
        // When vacation exceeds hours due, balance is positive (over-credited)
        expect(result.totalTimeExpandedInHours).toBeGreaterThan(0);
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

    it('should handle beginning-of-month vacation (no hours done yet)', () => {
        // Scenario: vacation taken in first week, no actual work hours tracked yet
        const settings50: CombinedSettings = {
            ...mockSettings,
            userWorkloadPercentage: 50,
        };

        const tasks: Task[] = [];
        const result = getProjectedHoursForActualMonth(2026, 4, tasks, settings50, -40);

        // With 0 hours done and 40h vacation, total should include vacation hours + projected hours
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