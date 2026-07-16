import React, { useMemo, useRef, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import type { ConsistencyScoreData } from '@/hooks/useConsistencyScore';

interface ScoreCurveProps {
  data: ConsistencyScoreData;
  height?: number;
}

const DAY_WIDTH = 6;

export const ScoreCurve: React.FC<ScoreCurveProps> = ({ data, height = 120 }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  const chartData = useMemo(() => {
    return data.scoreHistory.map((entry) => ({
      date: entry.date,
      score: Math.round(entry.score * 10) / 10,
    }));
  }, [data.scoreHistory]);

  const trend = useMemo(() => {
    if (chartData.length < 8) return 'stable';
    const recent = chartData[chartData.length - 1].score;
    const weekAgo = chartData[chartData.length - 8].score;
    if (recent > weekAgo + 0.5) return 'up';
    if (recent < weekAgo - 0.5) return 'down';
    return 'stable';
  }, [chartData]);

  useEffect(() => {
    // Keep the view scrolled to the end (most recent data) on first render
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, []);

  const trendArrow = trend === 'up' ? '\u2191' : trend === 'down' ? '\u2193' : '\u2192';
  const trendColor = trend === 'up' ? 'text-green-500' : trend === 'down' ? 'text-red-500' : 'text-muted-foreground';

  const chartWidth = Math.max(chartData.length * DAY_WIDTH, 100);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-muted-foreground">Consistency score</span>
        <span className="text-lg font-bold">
          {data.currentScore}%
          <span className={`ml-1 text-sm ${trendColor}`}>{trendArrow}</span>
        </span>
      </div>
      <div ref={scrollRef} className="overflow-x-auto" style={{ scrollbarWidth: 'thin' }}>
        <div style={{ minWidth: chartWidth, height }}>
          <ResponsiveContainer width="100%" height={height}>
            <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="consistencyGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" hide />
              <YAxis domain={[0, 100]} hide />
              <Tooltip
                contentStyle={{
                  fontSize: '11px',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  border: '1px solid hsl(var(--border))',
                }}
                formatter={(value: number) => [`${value}%`, 'Score']}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.date || ''}
              />
              <ReferenceLine y={50} stroke="hsl(var(--border))" strokeDasharray="3 3" />
              <Area
                type="natural"
                dataKey="score"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#consistencyGradient)"
                animationDuration={400}
                isAnimationActive={true}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};