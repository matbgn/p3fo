import Holidays from 'date-holidays'

export function getWorkingDays(year: number, month: number): number {
    // Create an instance of the Swiss holiday calendar
    const hd = new Holidays('CH', 'BE', { types: ['public'] })

    // Get the total number of days in the month
    const lastDayOfMonth: number = new Date(year, month, 0).getDate()

    // Count the number of working days excluding public holidays
    let workingDays = 0
    for (let day = 1; day <= lastDayOfMonth; day++) {
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
}: {
    startDate: Date
    endDate: Date
    includeStartDate: boolean
}): number {
    // Create an instance of the Swiss holiday calendar
    const hd = new Holidays('CH', 'BE', { types: ['public'] })

    // Count the number of working days excluding public holidays
    let workingDays = 0
    for (
        let day = startDate.getDate();
        day < endDate.getDate() + (includeStartDate ? 1 : 0);
        day++
    ) {
        const date: Date = new Date(
            startDate.getFullYear(),
            startDate.getMonth() - 1,
            day
        )
        if (date.getDay() !== 0 && date.getDay() !== 6 && !hd.isHoliday(date)) {
            workingDays++
        }
    }

    return workingDays
}

export default { getWorkingDays, getWorkingDaysDeltaInSameMonth }
