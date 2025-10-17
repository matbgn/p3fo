import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { Temporal } from '@js-temporal/polyfill';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDuration(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export const timestampToZurichInstant = (timestamp: number): Temporal.Instant => {
  return Temporal.Instant.fromEpochMilliseconds(timestamp);
};

export const instantToZurichPlainDateTime = (instant: Temporal.Instant): Temporal.PlainDateTime => {
  const zurich = instant.toZonedDateTimeISO('Europe/Zurich');
  return zurich.toPlainDateTime();
};

export const zurichPlainDateTimeToTimestamp = (plainDateTime: Temporal.PlainDateTime): number => {
  const zurich = plainDateTime.toZonedDateTime('Europe/Zurich');
  return zurich.epochMilliseconds;
};