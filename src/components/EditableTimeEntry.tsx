import React, { useState } from 'react';
import { Temporal } from '@js-temporal/polyfill';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableRow, TableCell } from "@/components/ui/table";
import { Trash2, Pencil, ArrowRight } from "lucide-react";
import { TaskTag } from "./TaskTag";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { CATEGORIES } from "../data/categories";
import { Category } from "@/hooks/useTasks";

import { formatTimeWithTemporal, formatDuration, timestampToZurichInstant } from "@/lib/format-utils";

// Helper function to convert Temporal.Instant to Europe/Zurich PlainDateTime
const instantToZurichPlainDateTime = (instant: Temporal.Instant): Temporal.PlainDateTime => {
  const zurich = instant.toZonedDateTimeISO('Europe/Zurich');
  return zurich.toPlainDateTime();
};

// Helper function to convert Europe/Zurich PlainDateTime to Unix timestamp
const zurichPlainDateTimeToTimestamp = (plainDateTime: Temporal.PlainDateTime): number => {
  const zurich = plainDateTime.toZonedDateTime('Europe/Zurich');
  return zurich.epochMilliseconds;
};

import { Task } from '@/hooks/useTasks';

import { UserSelector } from "./UserSelector";

// Editable time entry component
export const EditableTimeEntry: React.FC<{
  entry: {
    taskId: string;
    taskTitle: string;
    taskCategory: string | undefined;
    taskParentId: string | undefined;
    index: number;
    startTime: number;
    endTime: number;
  };
  taskMap: Record<string, Task>;
  onUpdateTimeEntry: (taskId: string, entryIndex: number, entry: { startTime: number; endTime: number }) => void;
  onUpdateTaskCategory: (taskId: string, category: string | undefined) => void;
  onUpdateUser: (taskId: string, userId: string | undefined) => void;
  onDelete: (taskId: string, entryIndex: number) => void;
  onJumpToTask?: (taskId: string) => void;
  children?: React.ReactNode;
}> = ({ entry, taskMap, onUpdateTimeEntry, onUpdateTaskCategory, onUpdateUser, onDelete, onJumpToTask, children }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [editTaskCategory, setEditTaskCategory] = useState<string>("Uncategorized");

  const startInstant = timestampToZurichInstant(entry.startTime);
  const startPlainDateTime = instantToZurichPlainDateTime(startInstant);

  const endInstant = entry.endTime > 0
    ? timestampToZurichInstant(entry.endTime)
    : null;
  const endPlainDateTime = endInstant
    ? instantToZurichPlainDateTime(endInstant)
    : null;

  // Calculate duration
  const duration = entry.endTime > 0
    ? entry.endTime - entry.startTime
    : Date.now() - entry.startTime;

  const handleEdit = () => {
    setEditStartTime(startPlainDateTime.toString({ smallestUnit: 'second' }).slice(0, 19));
    setEditEndTime(endPlainDateTime ? endPlainDateTime.toString({ smallestUnit: 'second' }).slice(0, 19) : '');
    setEditTaskCategory(entry.taskCategory || "Uncategorized");
    setIsEditing(true);
  };

  // Handle double-click to enter edit mode
  const handleDoubleClick = () => {
    handleEdit();
  };

  const handleSave = () => {
    try {
      const [startDatePart, startTimePart] = editStartTime.split('T');
      const [startYear, startMonth, startDay] = startDatePart.split('-').map(Number);
      const [startHour, startMinute, startSecond] = startTimePart.split(':').map(Number);

      const startPlainDateTime = Temporal.PlainDateTime.from({
        year: startYear, month: startMonth, day: startDay,
        hour: startHour, minute: startMinute, second: startSecond
      });

      const newStartTime = zurichPlainDateTimeToTimestamp(startPlainDateTime);

      let newEndTime = 0;
      if (editEndTime) {
        const [endDatePart, endTimePart] = editEndTime.split('T');
        const [endYear, endMonth, endDay] = endDatePart.split('-').map(Number);
        const [endHour, endMinute, endSecond] = endTimePart.split(':').map(Number);

        const endPlainDateTime = Temporal.PlainDateTime.from({
          year: endYear, month: endMonth, day: endDay,
          hour: endHour, minute: endMinute, second: endSecond
        });

        newEndTime = zurichPlainDateTimeToTimestamp(endPlainDateTime);
      }

      onUpdateTimeEntry(entry.taskId, entry.index, { startTime: newStartTime, endTime: newEndTime });
      onUpdateTaskCategory(entry.taskId, editTaskCategory === "Uncategorized" ? undefined : editTaskCategory);
      setIsEditing(false);
    } catch (error) {
      console.error('Error updating time entry:', error);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
  };

  const handleDelete = () => {
    onDelete(entry.taskId, entry.index);
  };

  if (isEditing) {
    return (
      <TableRow>
        <TableCell>{entry.taskTitle}</TableCell>
        <TableCell>
          <Select onValueChange={(value) => setEditTaskCategory(value)} value={editTaskCategory}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select a category" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((category) => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
              <SelectItem value="Uncategorized">Uncategorized</SelectItem>
            </SelectContent>
          </Select>
        </TableCell>
        <TableCell>
          {/* User selection not available in edit mode for now, or could be added */}
          <span className="text-muted-foreground">-</span>
        </TableCell>
        <TableCell>
          <Input
            type="datetime-local"
            step="1"
            value={editStartTime}
            onChange={(e) => setEditStartTime(e.target.value)}
          />
        </TableCell>
        <TableCell>
          <Input
            type="datetime-local"
            step="1"
            value={editEndTime}
            onChange={(e) => setEditEndTime(e.target.value)}
          />
        </TableCell>
        <TableCell className="flex gap-2">
          <Button size="sm" onClick={handleSave}>Save</Button>
          <Button size="sm" variant="outline" onClick={handleCancel}>Cancel</Button>
        </TableCell>
      </TableRow>
    );
  }

  const task = taskMap[entry.taskId];
  let indentLevel = 0;
  let current = taskMap[entry.taskId];
  const topParentId = entry.taskParentId || entry.taskId;

  while (current && current.id !== topParentId) {
    if (current.parentId) {
      indentLevel++;
      current = taskMap[current.parentId];
    } else {
      break;
    }
  }

  return (
    <TableRow
      className="hover:bg-muted/50"
      onDoubleClick={handleDoubleClick}
    >
      <TableCell style={{ paddingLeft: indentLevel > 0 ? `${Math.min(8 + indentLevel * 4, 20)}px` : undefined }}>
        <div className="flex items-center gap-2">
          {indentLevel > 0 && <span className="text-muted-foreground">↳ </span>}
          {entry.taskTitle}
          <TaskTag
            impact={task?.impact}
            urgent={task?.urgent}
            majorIncident={task?.majorIncident}
          />
        </div>
        {children}
      </TableCell>
      <TableCell>{entry.taskCategory || "Uncategorized"}</TableCell>
      <TableCell>
        <UserSelector
          value={task?.userId}
          onChange={(userId) => onUpdateUser(task.id, userId)}
          className="h-6 w-auto"
        />
      </TableCell>
      <TableCell>{formatTimeWithTemporal(entry.startTime)}</TableCell>
      <TableCell>{entry.endTime > 0 ? formatTimeWithTemporal(entry.endTime) : 'Running'}</TableCell>
      <TableCell className="flex items-center justify-between">
        <span>{formatDuration(duration)}</span>
        <div className="flex gap-1">
          {onJumpToTask && (
            <Button
              size="sm"
              variant="outline"
              className="h-6 w-6 p-0"
              onClick={() => onJumpToTask(entry.taskId)}
            >
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-6 w-6 p-0"
            onClick={handleEdit}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="destructive"
            className="h-6 w-6 p-0"
            onClick={handleDelete}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
};