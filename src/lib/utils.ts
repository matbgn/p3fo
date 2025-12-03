import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { Temporal } from '@js-temporal/polyfill';
import { Task } from "@/hooks/useTasks";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const byId = (arr: Task[]) => Object.fromEntries(arr.map((t) => [t.id, t]));

export function formatDuration(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

// Export time-related functions from format-utils to maintain compatibility
export { timestampToInstant, formatTimeWithTemporal, instantToPlainDateTime, plainDateTimeToTimestamp } from './format-utils';
