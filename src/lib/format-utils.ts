import { Temporal } from '@js-temporal/polyfill';

// Helper function to convert Unix timestamp to Europe/Zurich time string
export const formatTimeWithTemporal = (ms: number): string => {
    if (ms <= 0) return 'Invalid Date';

    try {
        const instant = Temporal.Instant.fromEpochMilliseconds(ms);
        const zurich = instant.toZonedDateTimeISO('Europe/Zurich');
        const dateString = zurich.toPlainDate().toString(); // YYYY-MM-DD
        const timeString = zurich.toPlainTime().toString({ smallestUnit: 'second' }); // HH:MM:SS

        // Get timezone abbreviation
        const timeZoneAbbr = zurich.toLocaleString('en-US', { timeZoneName: 'short' }).split(' ').pop();

        return `${dateString} ${timeString} ${timeZoneAbbr}`;
    } catch (error) {
        console.error('Error formatting time:', error);
        return 'Invalid Date';
    }
};

// Helper function to convert Unix timestamp to Temporal.Instant in Europe/Zurich
export const timestampToZurichInstant = (timestamp: number): Temporal.Instant => {
    return Temporal.Instant.fromEpochMilliseconds(timestamp);
};

// Helper function to format duration
export const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    return `${String(hours).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
};
