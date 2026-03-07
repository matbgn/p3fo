import React, { useEffect } from 'react';
import { Table, TableBody, TableHeader, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { EditableTimeEntry } from './EditableTimeEntry';
import { TaskHierarchy } from './TaskHierarchy';
import { useTasks } from '@/hooks/useTasks';
import { saveFiltersToSessionStorage, loadFiltersFromSessionStorage, clearFiltersFromSessionStorage } from "@/lib/filter-storage";
import { getDefaultFilters, validateFilters } from "@/lib/filter-merge";
import { Filters } from "./FilterControls";

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

  return (
    <div>
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
            {sortedEntries.map((entry) => (
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
              >
                <TaskHierarchy task={taskMap[entry.taskId]} taskMap={taskMap} />
              </EditableTimeEntry>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
};