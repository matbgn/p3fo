import React from 'react';
import { Table, TableBody, TableHeader, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { EditableTimeEntry } from './EditableTimeEntry';
import { TaskHierarchy } from './TaskHierarchy';

// Define the props for ChronologicalView
interface ChronologicalViewProps {
  timerEntries: any[]; // You might want to create a more specific type for this
  taskMap: Record<string, any>;
  onUpdate: (taskId: string, entryIndex: number, entry: { startTime: number; endTime: number }) => void;
  onDelete: (taskId: string, entryIndex: number) => void;
  onJumpToTask?: (taskId: string) => void;
}

export const ChronologicalView: React.FC<ChronologicalViewProps> = ({
  timerEntries,
  taskMap,
  onUpdate,
  onDelete,
  onJumpToTask,
}) => {
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
                onUpdate={onUpdate}
                onDelete={onDelete}
                onJumpToTask={onJumpToTask}
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