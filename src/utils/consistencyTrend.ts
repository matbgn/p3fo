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
const RECENT_WINDOW = 3;
const OLDER_WINDOW = 7;

function mean(entries: ScoreHistoryEntry[]): number {
  if (entries.length === 0) return 0;
  return entries.reduce((sum, e) => sum + e.score, 0) / entries.length;
}

export function computeConsistencyTrend(scoreHistory: ScoreHistoryEntry[]): ConsistencyTrend {
  const len = scoreHistory.length;
  if (len < 2) return 'stable';

  const recentCount = Math.min(RECENT_WINDOW, len);
  const recent = mean(scoreHistory.slice(len - recentCount));

  const olderEnd = len - recentCount;
  const olderCount = Math.min(OLDER_WINDOW, olderEnd);
  if (olderCount < 1) return 'stable';
  const older = mean(scoreHistory.slice(olderEnd - olderCount, olderEnd));

  if (recent > older + TREND_THRESHOLD) return 'up';
  if (recent < older - TREND_THRESHOLD) return 'down';
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