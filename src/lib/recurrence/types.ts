export const MAX_EVERY_DAYS = 365;

export type Recurrence =
  | { type: 'daily'; every: number; until?: string | null }
  | { type: 'weekly'; weekdays: number[]; until?: string | null }
  | { type: 'monthly'; day: number; until?: string | null };
