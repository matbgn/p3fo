import React, { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import * as d3 from 'd3';
import type { DayEntry } from '@/hooks/useConsistencyScore';
import { ConsistencyLegend, ALL_LEGEND_KEYS, type LegendKey } from '@/components/ConsistencyLegend';

interface ConsistencyHeatmapProps {
  days: DayEntry[];
  weeks?: number;
  weekStartDay?: 0 | 1;
  visible?: Set<LegendKey>;
  onToggleLegend?: (key: LegendKey) => void;
}

const COLOR_EMPTY = '#ebedf0';
const COLOR_EMPTY_DARK = '#2d333b';
const COLOR_NON_WORKING = '#f0f0f0';
const COLOR_NON_WORKING_DARK = '#1e252e';
const COLOR_HIDDEN = '#d8d8d8';
const COLOR_HIDDEN_DARK = '#353535';

const BLUE_SCALE = ['#93c5fd', '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8'];
const GOLD_SCALE = ['#fde68a', '#fcd34d', '#fbbf24', '#f59e0b', '#d97706'];
const GREEN_SCALE = ['#9be9a8', '#40c463', '#30a14e', '#216e39'];

const CELL_SIZE = 15;
const CELL_GAP = 3;
const LABEL_WIDTH = 40;
const MONTH_HEIGHT = 20;
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function scaleColor(scale: string[], count: number, max: number): string {
  if (count <= 0) return scale[0];
  const idx = Math.min(scale.length - 1, Math.floor((count / Math.max(max, 1)) * scale.length));
  return scale[idx];
}

function getCellColor(day: DayEntry | undefined, isDark: boolean, maxBlue: number, maxGold: number, maxGreen: number): string {
  if (!day) return isDark ? COLOR_EMPTY_DARK : COLOR_EMPTY;
  const emptyColor = isDark ? COLOR_EMPTY_DARK : COLOR_EMPTY;
  if (day.kind === 'empty') {
    return day.isWorkingDay ? emptyColor : (isDark ? COLOR_NON_WORKING_DARK : COLOR_NON_WORKING);
  }
  switch (day.kind) {
    case 'gold': {
      const intensity = day.pomodoroCount > 0 ? day.pomodoroCount : day.taskStartedCount;
      return scaleColor(GOLD_SCALE, intensity, Math.max(maxGold, 1));
    }
    case 'green':
      return scaleColor(GREEN_SCALE, day.pomodoroCount, Math.max(maxGreen, 1));
    case 'blue':
      return scaleColor(BLUE_SCALE, day.taskStartedCount, Math.max(maxBlue, 1));
    default:
      return emptyColor;
  }
}

const ConsistencyHeatmap: React.FC<ConsistencyHeatmapProps> = ({ days, weeks = 39, weekStartDay = 1, visible: visibleProp, onToggleLegend }) => {
  const { t } = useTranslation();
  const dayLabels = useMemo(() => {
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const ordered = weekStartDay === 1
      ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
      : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return ordered.map((name, i) => (i % 2 === 1 ? name : ''));
  }, [weekStartDay]);
  const svgRef = useRef<SVGSVGElement>(null);
  const [internalVisible, setInternalVisible] = useState<Set<LegendKey>>(ALL_LEGEND_KEYS);
  const visible = visibleProp ?? internalVisible;

  const toggleLegend = useCallback((key: LegendKey) => {
    if (onToggleLegend) {
      onToggleLegend(key);
    } else {
      setInternalVisible(prev => {
        const next = new Set(prev);
        if (next.has(key)) {
          if (next.size > 1) next.delete(key);
        } else {
          next.add(key);
        }
        return next;
      });
    }
  }, [onToggleLegend]);

  const dayMap = useMemo(() => {
    const map = new Map<string, DayEntry>();
    for (const d of days) map.set(d.dayKey, d);
    return map;
  }, [days]);

  const maxBlue = useMemo(() => Math.max(1, ...days.filter(d => d.kind === 'blue').map(d => d.taskStartedCount)), [days]);
  const maxGold = useMemo(() => Math.max(1, ...days.filter(d => d.kind === 'gold').map(d => Math.max(d.pomodoroCount, d.taskStartedCount))), [days]);
  const maxGreen = useMemo(() => Math.max(1, ...days.filter(d => d.kind === 'green').map(d => d.pomodoroCount)), [days]);

  const { cells, months, width, height } = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endDate = d3.timeDay.floor(today);
    const startDate = d3.timeDay.offset(endDate, -(weeks * 7));

    const allDays = d3.timeDays(startDate, d3.timeDay.offset(endDate, 1));
    const isDark = document.documentElement.classList.contains('dark');

    const cellsData = allDays.map((d) => {
      const key = d3.timeFormat('%Y-%m-%d')(d);
      const day = dayMap.get(key);
      const colIndex = Math.floor((d.getTime() - startDate.getTime()) / 86400000 / 7);
      const dayOfWeek = (d.getDay() - weekStartDay + 7) % 7;
      const isHidden = day && day.kind !== 'empty' && !visible.has(day.kind as LegendKey);
      return {
        date: d,
        key,
        day,
        isHidden: !!isHidden,
        color: isHidden
          ? (isDark ? COLOR_HIDDEN_DARK : COLOR_HIDDEN)
          : getCellColor(day, isDark, maxBlue, maxGold, maxGreen),
        x: LABEL_WIDTH + colIndex * (CELL_SIZE + CELL_GAP),
        y: MONTH_HEIGHT + dayOfWeek * (CELL_SIZE + CELL_GAP),
      };
    });

    const monthData: { label: string; x: number }[] = [];
    let lastMonth = -1;
    for (const cell of cellsData) {
      const m = cell.date.getMonth();
      if (m !== lastMonth) {
        lastMonth = m;
        monthData.push({ label: MONTH_NAMES[m], x: cell.x });
      }
    }

    const totalCols = Math.ceil(allDays.length / 7) + 1;
    const w = LABEL_WIDTH + totalCols * (CELL_SIZE + CELL_GAP) + 20;
    const h = MONTH_HEIGHT + 7 * (CELL_SIZE + CELL_GAP) + 10;

    return { cells: cellsData, months: monthData, width: w, height: h };
  }, [dayMap, weeks, weekStartDay, maxBlue, maxGold, maxGreen, visible]);

  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const g = svg.append('g');

    months.forEach((m) => {
      g.append('text')
        .attr('x', m.x)
        .attr('y', 12)
        .attr('fill', 'currentColor')
        .attr('font-size', '11px')
        .text(m.label);
    });

    dayLabels.forEach((label, i) => {
      if (label) {
        g.append('text')
          .attr('x', LABEL_WIDTH - 4)
          .attr('y', MONTH_HEIGHT + i * (CELL_SIZE + CELL_GAP) + CELL_SIZE - 1)
          .attr('text-anchor', 'end')
          .attr('fill', 'currentColor')
          .attr('font-size', '11px')
          .text(label);
      }
    });

    const tooltip = d3.select('body').selectAll('.focus-heatmap-tooltip').data([null]).join('div')
      .attr('class', 'focus-heatmap-tooltip')
      .style('position', 'fixed')
      .style('padding', '6px 10px')
      .style('background', 'hsl(var(--popover))')
      .style('border', '1px solid hsl(var(--border))')
      .style('border-radius', '6px')
      .style('font-size', '12px')
      .style('pointer-events', 'none')
      .style('opacity', 0)
      .style('z-index', 9999)
      .style('color', 'hsl(var(--popover-foreground))');

    g.selectAll('rect')
      .data(cells)
      .join('rect')
      .attr('x', (d) => d.x)
      .attr('y', (d) => d.y)
      .attr('width', CELL_SIZE)
      .attr('height', CELL_SIZE)
      .attr('rx', 2)
      .attr('fill', (d) => d.color)
      .on('mouseenter', (event, d) => {
        const dateStr = d3.timeFormat('%a %b %d, %Y')(d.date);
        if (!d.day) {
          tooltip.style('opacity', 1).html(`<span style="color: hsl(var(--muted-foreground))">${dateStr}</span>`);
          return;
        }
        if (d.isHidden) {
          const labelKeyMap: Record<string, string> = { gold: 'pomodoroUi.impactWork', green: 'pomodoroUi.focusWork', blue: 'pomodoroUi.startedTasks' };
          const label = t(labelKeyMap[d.day.kind] ?? '') || d.day.kind;
          tooltip.style('opacity', 1).html(`<span style="color: hsl(var(--muted-foreground))">${t('spotlight.heatmap.hidden', { label })} · ${dateStr}</span>`);
          return;
        }
        const parts: string[] = [];
        if (d.day.pomodoroCount > 0) parts.push(`<strong>${d.day.pomodoroCount}</strong> ${t(d.day.pomodoroCount !== 1 ? 'spotlight.heatmap.focusSessions' : 'spotlight.heatmap.focusSession')}`);
        if (d.day.kind === 'blue') parts.push(t(d.day.taskStartedCount !== 1 ? 'spotlight.heatmap.tasksStartedNoFocus_plural' : 'spotlight.heatmap.tasksStartedNoFocus', { count: d.day.taskStartedCount }));
        if (d.day.kind === 'gold') parts.push(t('spotlight.heatmap.impactDay'));
        if (d.day.kind === 'empty' && d.day.isWorkingDay) parts.push(t('spotlight.heatmap.noActivity'));
        if (!d.day.isWorkingDay) parts.push(t('spotlight.heatmap.dayOff'));
        tooltip.style('opacity', 1).html(`${parts.join(' · ')} ${t('spotlight.heatmap.on', { date: dateStr })}`);
      })
      .on('mousemove', (event) => {
        tooltip
          .style('left', (event.clientX + 12) + 'px')
          .style('top', (event.clientY - 28) + 'px');
      })
      .on('mouseleave', () => {
        tooltip.style('opacity', 0);
      });

  }, [cells, months, dayLabels, t]);

  return (
    <div className="flex gap-4">
      <div className="overflow-x-auto flex-1">
        <svg
          ref={svgRef}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
        />
      </div>
      <div className="flex flex-col justify-center gap-3 shrink-0">
        <ConsistencyLegend visible={visible} onToggle={toggleLegend} className="flex-col gap-3" />
      </div>
    </div>
  );
};

export default ConsistencyHeatmap;