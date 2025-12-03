import Holidays from 'date-holidays'

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

export default { getWorkingDays, getWorkingDaysDeltaInSameMonth }
