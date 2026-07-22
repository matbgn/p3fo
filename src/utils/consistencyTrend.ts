export type ConsistencyTrend = 'up' | 'down' | 'stable';

export interface ScoreHistoryEntry {
  date: string;
  score: number;
}

export interface TrendDisplay {
  arrow: string;
  colorClass: string;
}

const TREND_THRESHOLD = 1.0;
const REFERENCE_WINDOW = 7;

function mean(entries: ScoreHistoryEntry[]): number {
  if (entries.length === 0) return 0;
  return entries.reduce((sum, e) => sum + e.score, 0) / entries.length;
}

export function computeConsistencyTrend(scoreHistory: ScoreHistoryEntry[]): ConsistencyTrend {
  const len = scoreHistory.length;
  if (len < 2) return 'stable';

  const recent = scoreHistory[len - 1].score;

  const referenceEnd = len - 1;
  const referenceCount = Math.min(REFERENCE_WINDOW, referenceEnd);
  if (referenceCount < 1) return 'stable';
  const reference = mean(scoreHistory.slice(referenceEnd - referenceCount, referenceEnd));

  if (recent > reference + TREND_THRESHOLD) return 'up';
  if (recent < reference - TREND_THRESHOLD) return 'down';
  return 'stable';
}

export function getTrendDisplay(trend: ConsistencyTrend): TrendDisplay {
  const arrow = trend === 'up' ? '\u2191' : trend === 'down' ? '\u2193' : '\u2192';
  const colorClass =
    trend === 'up'
      ? 'text-green-500'
      : trend === 'down'
        ? 'text-red-500'
        : 'text-muted-foreground';
  return { arrow, colorClass };
}