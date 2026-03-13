import { describe, it, expect } from 'vitest';
import { calculateProjection } from './projectedHours';

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
        // e.g. Jonathan scenario: 36.5 hours in 5 days = 7.3 pace. History = 0. Remaining = 5.
        // Expect: 36.5 + (7.3 * 5) = 73
        const result = calculateProjection({
            hoursDone: 36.5,
            preferredDaysPassed: 5,
            totalPreferredDaysInMonth: 10,
            historyPace: 0
        });
        
        expect(result).toBe(73);
    });

    it('never projects negative remaining days if days passed exceeds total preferred days', () => {
        // e.g. someone worked extra days at the very end of the month
        // total days = 10, days passed = 12 (due to weekend logged as preferred by accident or working past month end)
        // Expect: Remaining days prediction to be 0, so it just returns hoursDone
        const result = calculateProjection({
            hoursDone: 80,
            preferredDaysPassed: 12,
            totalPreferredDaysInMonth: 10,
            historyPace: 7.5
        });
        
        expect(result).toBe(80);
    });
});
