import { describe, it, expect } from 'vitest';
import { normalizePreferredDays } from './scheduler-utils';

describe('normalizePreferredDays', () => {
    it('should return default Mon-Fri when no input is provided', () => {
        const result = normalizePreferredDays();
        expect(result).toEqual({ 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 });
    });

    it('should handle legacy number array format', () => {
        const result = normalizePreferredDays([1, 3, 5]);
        expect(result).toEqual({ 1: 1, 3: 1, 5: 1 });
    });

    it('should handle capacity map format', () => {
        const result = normalizePreferredDays({ 1: 0.5, 2: 1, 3: 0.8 });
        expect(result).toEqual({ 1: 0.5, 2: 1, 3: 0.8 });
    });

    it('should return default Mon-Fri when input is empty array', () => {
        const result = normalizePreferredDays([]);
        expect(result).toEqual({ 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 });
    });

    it('should return default Mon-Fri when input is empty object', () => {
        const result = normalizePreferredDays({});
        expect(result).toEqual({ 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 });
    });
});