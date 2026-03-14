import React, { useEffect, useRef } from 'react';
import { Table, TableBody, TableHeader, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { EditableTimeEntry } from './EditableTimeEntry';
import { TaskHierarchy } from './TaskHierarchy';
import { useTasks } from '@/hooks/useTasks';
import { loadFiltersFromSessionStorage } from "@/lib/filter-storage";
import { getDefaultFilters, validateFilters } from "@/lib/filter-merge";
import { Filters } from "./FilterControls";
import { getEntryKey, detectTimeOverlaps } from '@/utils/timeOverlap';

import { Task } from '@/hooks/useTasks';

interface TimerEntry {
  taskId: string;
  taskTitle: string;
  taskCategory: string | undefined;
  taskParentId: string | undefined;
  index: number;
  startTime: number;
  endTime: number;
}

// Define the props for ChronologicalView
interface ChronologicalViewProps {
  timerEntries: TimerEntry[];
  taskMap: Record<string, Task>;
  onUpdateTimeEntry: (taskId: string, entryIndex: number, entry: { startTime: number; endTime: number }) => void;
  onUpdateTaskCategory: (taskId: string, category: string | undefined) => void;
  onUpdateUser: (taskId: string, userId: string | undefined) => void;
  onDelete: (taskId: string, entryIndex: number) => void;
  onJumpToTask?: (taskId: string) => void;
  onToggleTimer?: (taskId: string) => void;
}

export const ChronologicalView: React.FC<ChronologicalViewProps> = ({
  timerEntries,
  taskMap,
  onUpdateTimeEntry,
  onUpdateTaskCategory,
  onUpdateUser,
  onDelete,
  onJumpToTask,
  onToggleTimer,
}) => {
  const { updateTimeEntry, updateCategory } = useTasks();

  const [filters, setFilters] = React.useState<Filters>(getDefaultFilters());

  // Load filters on mount
  React.useEffect(() => {
    const loadFilters = async () => {
      try {
        const storedFilters = await loadFiltersFromSessionStorage();
        if (storedFilters) {
          setFilters(validateFilters(storedFilters));
        }
      } catch (error) {
        console.error("Error loading filters:", error);
      }
    };

    loadFilters();
  }, []);

  // Sort entries in reverse chronologically by start time
  const sortedEntries = [...timerEntries].sort((a, b) => b.startTime - a.startTime);

  // Detect time overlaps for same user
  const overlapInfo = React.useMemo(() => {
    const result = detectTimeOverlaps(timerEntries.map(entry => ({
      taskId: entry.taskId,
      index: entry.index,
      startTime: entry.startTime,
      endTime: entry.endTime,
      userId: taskMap[entry.taskId]?.userId,
      taskTitle: entry.taskTitle,
    })));
    return result;
  }, [timerEntries, taskMap]);

  // Build overlap info map for quick lookup
  const entryOverlapMap = React.useMemo(() => {
    const map = new Map<string, { hasOverlap: boolean; overlappingEntries: Array<{ taskId: string; taskTitle: string }>; overlapGroupId?: string }>();
    
    for (const group of overlapInfo.overlappingGroups) {
      const groupId = group.entries.map(e => `${e.taskId}-${e.index}`).sort().join('--');
      for (const entry of group.entries) {
        const key = getEntryKey(entry.taskId, entry.index);
        const otherEntries = group.entries
          .filter(e => e.taskId !== entry.taskId || e.index !== entry.index)
          .map(e => ({ taskId: e.taskId, taskTitle: e.taskTitle }));
        map.set(key, {
          hasOverlap: true,
          overlappingEntries: otherEntries,
          overlapGroupId: groupId,
        });
      }
    }
    return map;
  }, [overlapInfo]);

  // SVG line drawing for overlap connections - optimized for performance
  const tableRef = React.useRef<HTMLDivElement | null>(null);
  const [overlapLines, setOverlapLines] = React.useState<Array<{ x1: number; y1: number; x2: number; y2: number; groupId: string }>>([]);
  
  // Store the previous overlap group count to avoid unnecessary recalculations
  const prevOverlapGroupCountRef = React.useRef(0);
  const overlapGroupCount = overlapInfo.overlappingGroups.length;

  // Only recompute when overlap group count changes
  React.useEffect(() => {
    // Skip if no overlaps or count hasn't changed
    if (overlapGroupCount === 0) {
      if (overlapLines.length > 0) {
        setOverlapLines([]);
      }
      prevOverlapGroupCountRef.current = 0;
      return;
    }

    if (overlapGroupCount === prevOverlapGroupCountRef.current) {
      return; // No change, skip recompute
    }
    
    prevOverlapGroupCountRef.current = overlapGroupCount;

    // Delay to let DOM settle
    const timeoutId = setTimeout(() => {
      const container = tableRef.current;
      if (!container) return;

      // Get all overlap groups
      const groupElements = new Map<string, HTMLElement[]>();
      
      container.querySelectorAll('[data-overlap-group]').forEach((el) => {
        const groupId = (el as HTMLElement).getAttribute('data-overlap-group');
        if (groupId) {
          if (!groupElements.has(groupId)) {
            groupElements.set(groupId, []);
          }
          groupElements.get(groupId)!.push(el as HTMLElement);
        }
      });

      const containerRect = container.getBoundingClientRect();
      const lines: Array<{ x1: number; y1: number; x2: number; y2: number; groupId: string }> = [];

      groupElements.forEach((elements, groupId) => {
        const sortedElements = [...elements].sort((a, b) => {
          const rectA = a.getBoundingClientRect();
          const rectB = b.getBoundingClientRect();
          return rectA.top - rectB.top;
        });

        for (let i = 0; i < sortedElements.length - 1; i++) {
          const el1 = sortedElements[i];
          const el2 = sortedElements[i + 1];
          
          const rect1 = el1.getBoundingClientRect();
          const rect2 = el2.getBoundingClientRect();

          const y1 = rect1.top + rect1.height / 2 - containerRect.top;
          const y2 = rect2.top + rect2.height / 2 - containerRect.top;

          lines.push({
            x1: -20,
            y1,
            x2: -20,
            y2,
            groupId,
          });
        }
      });

      setOverlapLines(lines);
    }, 150); // Longer delay for initial render
    
    return () => clearTimeout(timeoutId);
  }, [overlapGroupCount]); // Only depend on count, not the full overlapInfo

  return (
    <div ref={tableRef} className="relative">
      {/* SVG overlay for overlap lines */}
      <svg className="pointer-events-none absolute top-0 left-0 w-full h-full" style={{ overflow: "visible" }}>
        {overlapLines.map((line, i) => {
          // Draw a curved arc using quadratic bezier curve
          const midY = (line.y1 + line.y2) / 2;
          const curveOffset = -40; // How far the curve extends to the left
          const pathD = `M ${line.x1} ${line.y1} Q ${line.x1 + curveOffset} ${midY} ${line.x2} ${line.y2}`;
          return (
            <path
              key={`${line.groupId}-${i}`}
              d={pathD}
              stroke="#ef4444"
              strokeWidth="2"
              strokeDasharray="4 2"
              fill="none"
            />
          );
        })}
      </svg>
      {sortedEntries.length === 0 ? (
        <p>No timer data matches the selected filters.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Task</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Start Time</TableHead>
              <TableHead>End Time</TableHead>
              <TableHead>Duration</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedEntries.map((entry) => {
              const entryKey = getEntryKey(entry.taskId, entry.index);
              const overlap = entryOverlapMap.get(entryKey);
              return (
                <EditableTimeEntry
                  key={`${entry.taskId}-${entry.index}`}
                  entry={entry}
                  taskMap={taskMap}
                  onUpdateTimeEntry={updateTimeEntry}
                  onUpdateTaskCategory={updateCategory}
                  onUpdateUser={onUpdateUser}
                  onDelete={onDelete}
                  onJumpToTask={onJumpToTask}
                  onToggleTimer={onToggleTimer}
                  overlapInfo={overlap}
                >
                  <TaskHierarchy task={taskMap[entry.taskId]} taskMap={taskMap} />
                </EditableTimeEntry>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
};