import Holidays from 'date-holidays'
import { normalizePreferredDays } from './scheduler-utils'

export function getWorkingDays(year: number, month: number, startDay: number = 1, endDay?: number, country: string = 'CH', region: string = 'BE'): number {
    // Create an instance of the holiday calendar for the specified country and region
    const hd = new Holidays(country, region, { types: ['public'] })

    // Get the total number of days in the month
    const lastDayOfMonth: number = endDay || new Date(year, month, 0).getDate()

    // Count the number of working days excluding public holidays
    let workingDays = 0
    for (let day = startDay; day <= lastDayOfMonth; day++) {
        const date: Date = new Date(year, month - 1, day)
        if (date.getDay() !== 0 && date.getDay() !== 6 && !hd.isHoliday(date)) {
            workingDays++
        }
    }

    return workingDays
}

export function getWorkingDaysDeltaInSameMonth({
    startDate,
    endDate,
    includeStartDate,
    country = 'CH',
    region = 'BE',
}: {
    startDate: Date
    endDate: Date
    includeStartDate: boolean
    country?: string
    region?: string
}): number {
    // Create an instance of the holiday calendar for the specified country and region
    const hd = new Holidays(country, region, { types: ['public'] })

    // Count the number of working days excluding public holidays
    let workingDays = 0
    for (
        let day = startDate.getDate();
        day < endDate.getDate() + (includeStartDate ? 1 : 0);
        day++
    ) {
        const date: Date = new Date(
            startDate.getFullYear(),
            startDate.getMonth(),
            day
        )
        if (date.getDay() !== 0 && date.getDay() !== 6 && !hd.isHoliday(date)) {
            workingDays++
        }
    }

    return workingDays
}

/**
 * Get preferred working days for a month period.
 * This counts only days that match the user's preferred working days,
 * weighting each day by its capacity (0-1).
 * 
 * @param year - Year
 * @param month - Month (1-indexed)
 * @param startDay - Start day of month (default 1)
 * @param endDay - End day of month (optional, defaults to last day)
 * @param preferredDays - Map of day (0-6, where 0=Sunday) -> capacity (0-1), can be string or number keys
 * @param country - Country code for holidays
 * @param region - Region code for holidays
 * @returns Object with totalDays count and effectiveDays (weighted by capacity)
 */
export function getPreferredWorkingDays(
    year: number,
    month: number,
    startDay: number = 1,
    endDay: number | undefined,
    preferredDays: Record<string, number> | Record<number, number> | undefined,
    country: string = 'CH',
    region: string = 'BE'
): { totalDays: number; effectiveDays: number } {
    // Normalize preferred days (handles both array and object formats, string or number keys)
    const normalizedPreferred = preferredDays ? normalizePreferredDays(preferredDays as Record<string, number>) : normalizePreferredDays();
    
    const hd = new Holidays(country, region, { types: ['public'] });
    const lastDayOfMonth: number = endDay || new Date(year, month, 0).getDate();
    
    let totalDays = 0;
    let effectiveDays = 0;
    
    for (let day = startDay; day <= lastDayOfMonth; day++) {
        const date = new Date(year, month - 1, day);
        const dayOfWeek = date.getDay();
        
        // Check if this day is a preferred working day
        const capacity = normalizedPreferred[dayOfWeek];
        if (capacity && capacity > 0 && !hd.isHoliday(date)) {
            totalDays += 1;
            effectiveDays += capacity;
        }
    }
    
    return { totalDays, effectiveDays };
}

/**
 * Get preferred working days count for a date range (used in history pace calculation).
 * 
 * @param startDate - Start date
 * @param endDate - End date
 * @param preferredDays - Map of day (0-6) -> capacity (0-1), can be string or number keys
 * @param country - Country code for holidays
 * @param region - Region code for holidays
 * @returns Object with totalDays count and effectiveDays (weighted by capacity)
 */
export function getPreferredWorkingDaysInRange(
    startDate: Date,
    endDate: Date,
    preferredDays: Record<string, number> | Record<number, number> | undefined,
    country: string = 'CH',
    region: string = 'BE'
): { totalDays: number; effectiveDays: number } {
    const normalizedPreferred = preferredDays ? normalizePreferredDays(preferredDays as Record<string, number>) : normalizePreferredDays();
    const hd = new Holidays(country, region, { types: ['public'] });
    
    let totalDays = 0;
    let effectiveDays = 0;
    
    // Iterate day by day from startDate to endDate
    const current = new Date(startDate);
    while (current <= endDate) {
        const dayOfWeek = current.getDay();
        const capacity = normalizedPreferred[dayOfWeek];
        
        if (capacity && capacity > 0 && !hd.isHoliday(current)) {
            totalDays += 1;
            effectiveDays += capacity;
        }
        
        current.setDate(current.getDate() + 1);
    }
    
    return { totalDays, effectiveDays };
}

export default { getWorkingDays, getWorkingDaysDeltaInSameMonth, getPreferredWorkingDays, getPreferredWorkingDaysInRange }
