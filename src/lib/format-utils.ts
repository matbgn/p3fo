import { Temporal } from '@js-temporal/polyfill';

// Helper function to convert Unix timestamp to time string with specified timezone
export const formatTimeWithTemporal = (ms: number, timezone: string = 'Europe/Zurich'): string => {
    if (ms <= 0) return 'Invalid Date';

    try {
        const instant = Temporal.Instant.fromEpochMilliseconds(ms);
        const zonedDateTime = instant.toZonedDateTimeISO(timezone);
        const dateString = zonedDateTime.toPlainDate().toString(); // YYYY-MM-DD
        const timeString = zonedDateTime.toPlainTime().toString({ smallestUnit: 'second' }); // HH:MM:SS

        // Get timezone abbreviation
        const timeZoneAbbr = zonedDateTime.toLocaleString('en-US', { timeZoneName: 'short' }).split(' ').pop();

        return `${dateString} ${timeString} ${timeZoneAbbr}`;
    } catch (error) {
        console.error('Error formatting time:', error);
        return 'Invalid Date';
    }
};

// Helper function to convert Unix timestamp to Temporal.Instant with specified timezone
export const timestampToInstant = (timestamp: number): Temporal.Instant => {
    return Temporal.Instant.fromEpochMilliseconds(timestamp);
};

// Helper function to convert Temporal.Instant to PlainDateTime with specified timezone
export const instantToPlainDateTime = (instant: Temporal.Instant, timezone: string = 'Europe/Zurich'): Temporal.PlainDateTime => {
  const zonedDateTime = instant.toZonedDateTimeISO(timezone);
  return zonedDateTime.toPlainDateTime();
};

// Helper function to convert PlainDateTime to Unix timestamp with specified timezone
export const plainDateTimeToTimestamp = (plainDateTime: Temporal.PlainDateTime, timezone: string = 'Europe/Zurich'): number => {
  const zonedDateTime = plainDateTime.toZonedDateTime(timezone);
  return zonedDateTime.epochMilliseconds;
};


// Helper function to format duration
export const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    return `${String(hours).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
};
