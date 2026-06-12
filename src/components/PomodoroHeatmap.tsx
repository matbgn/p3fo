import React, { useRef, useEffect, useMemo } from 'react';
import * as d3 from 'd3';
import { PomodoroSession } from '@/lib/pomodoro-types';

interface PomodoroHeatmapProps {
  sessions: PomodoroSession[];
  weeks?: number;
}

const COLORS = ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'];
const CELL_SIZE = 13;
const CELL_GAP = 3;
const LABEL_WIDTH = 40;
const MONTH_HEIGHT = 20;
const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const PomodoroHeatmap: React.FC<PomodoroHeatmapProps> = ({ sessions, weeks = 39 }) => {
  const svgRef = useRef<SVGSVGElement>(null);

  const dailyCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of sessions) {
      if (s.phase !== 'work' || !s.completed) continue;
      const d = new Date(s.startTime);
      const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      map.set(dayKey, (map.get(dayKey) || 0) + 1);
    }
    return map;
  }, [sessions]);

  const { cells, months, width, height } = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endDate = d3.timeDay.floor(today);
    const startDate = d3.timeDay.offset(endDate, -(weeks * 7));

    const days = d3.timeDays(startDate, d3.timeDay.offset(endDate, 1));

    const maxCount = d3.max(Array.from(dailyCounts.values())) || 1;

    const colorScale = d3.scaleQuantize<string>()
      .domain([0, maxCount])
      .range(COLORS);

    const cellsData = days.map((d) => {
      const key = d3.timeFormat('%Y-%m-%d')(d);
      const count = dailyCounts.get(key) || 0;
      const colIndex = Math.floor((d.getTime() - startDate.getTime()) / 86400000 / 7);
      const dayOfWeek = (d.getDay() + 6) % 7;
      return {
        date: d,
        key,
        count,
        color: count === 0 ? COLORS[0] : colorScale(count),
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
        monthData.push({
          label: MONTH_NAMES[m],
          x: cell.x,
        });
      }
    }

    const totalCols = Math.ceil(days.length / 7) + 1;
    const w = LABEL_WIDTH + totalCols * (CELL_SIZE + CELL_GAP) + 20;
    const h = MONTH_HEIGHT + 7 * (CELL_SIZE + CELL_GAP) + 10;

    return { cells: cellsData, months: monthData, width: w, height: h };
  }, [dailyCounts, weeks]);

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

    DAY_LABELS.forEach((label, i) => {
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

    const tooltip = d3.select('body').selectAll('.pomodoro-heatmap-tooltip').data([null]).join('div')
      .attr('class', 'pomodoro-heatmap-tooltip')
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
        tooltip
          .style('opacity', 1)
          .html(`<strong>${d.count}</strong> pomodoro${d.count !== 1 ? 's' : ''} on ${dateStr}`);
      })
      .on('mousemove', (event) => {
        tooltip
          .style('left', (event.clientX + 12) + 'px')
          .style('top', (event.clientY - 28) + 'px');
      })
      .on('mouseleave', () => {
        tooltip.style('opacity', 0);
      });
  }, [cells, months]);

  return (
    <div className="overflow-x-auto">
      <svg
        ref={svgRef}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
      />
    </div>
  );
};

export default PomodoroHeatmap;