import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useConsistencyScore } from '@/hooks/useConsistencyScore';
import { useUserSettings } from '@/hooks/useUserSettings';
import { computeConsistencyTrend, getTrendDisplay } from '@/utils/consistencyTrend';

interface ConsistencySparklineProps {
  height?: number;
}

export const ConsistencySparkline: React.FC<ConsistencySparklineProps> = ({ height = 28 }) => {
  const { t } = useTranslation();
  const { userId } = useUserSettings();
  const { data, isLoading } = useConsistencyScore(userId);

  const sparklineData = useMemo(() => {
    if (!data) return [];
    return data.scoreHistory.slice(-30).map((e) => e.score);
  }, [data]);

  if (isLoading || !data || sparklineData.length < 2) return null;

  const trend = computeConsistencyTrend(data.scoreHistory);
  const { arrow: trendArrow, colorClass: trendColor } = getTrendDisplay(trend);

  const max = 100;
  const min = 0;
  const width = 80;
  const points = sparklineData
    .map((score, i) => {
      const x = (i / (sparklineData.length - 1)) * width;
      const y = height - ((score - min) / (max - min)) * height;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <div className="flex flex-col items-start gap-0.5">
      <span className="text-[10px] text-muted-foreground">{t('spotlight.consistency')}</span>
      <div className="flex items-center gap-2">
        <svg width={width} height={height} className="shrink-0">
          <polyline
            points={points}
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div className="flex items-baseline gap-1">
          <span className="text-sm font-bold">{data.currentScore}%</span>
          <span className={`text-xs ${trendColor}`}>{trendArrow}</span>
        </div>
      </div>
    </div>
  );
};