import React, { useState } from 'react';
import { Temporal } from '@js-temporal/polyfill';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableRow, TableCell } from "@/components/ui/table";
import { Trash2, Pencil, ArrowRight, Play, Pause } from "lucide-react";
import { TaskTag } from "./TaskTag";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { CATEGORIES } from "../data/categories";
import { Category } from "@/hooks/useTasks";

import { formatTimeWithTemporal, formatDuration, timestampToInstant, plainDateTimeToTimestamp, instantToPlainDateTime } from "@/lib/format-utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useCombinedSettings } from "@/hooks/useCombinedSettings";
import { CalendarIcon, Clock } from "lucide-react";
import { TimePickerDialog } from "@/components/ui/time-picker-dialog";


import { Task } from '@/hooks/useTasks';

import { UserSelector } from "./UserSelector";
import { useUsers } from '@/hooks/useUsers';
import { useUserSettings } from '@/hooks/useUserSettings';
import { UserAvatar } from "./UserAvatar";

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
  onToggleTimer?: (taskId: string) => void;
  children?: React.ReactNode;
}> = ({ entry, taskMap, onUpdateTimeEntry, onUpdateTaskCategory, onUpdateUser, onDelete, onJumpToTask, onToggleTimer, children }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [editTaskCategory, setEditTaskCategory] = useState<string>("Uncategorized");
  const { settings } = useCombinedSettings();
  const weekStartsOn = settings.weekStartDay as 0 | 1;

  const task = taskMap[entry.taskId];
  const { users } = useUsers();
  const { userSettings, userId: currentUserId } = useUserSettings();
  const [editUserId, setEditUserId] = useState<string | undefined>(undefined);

  // State for time picker dialog
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [timePickerConfig, setTimePickerConfig] = useState<{
    type: 'start' | 'end';
    initialTime: number;
  } | null>(null);

  const openTimePicker = (type: 'start' | 'end', initialTime: number) => {
    setTimePickerConfig({ type, initialTime });
    setTimePickerOpen(true);
  };

  const startInstant = timestampToInstant(entry.startTime);
  const startPlainDateTime = instantToPlainDateTime(startInstant, settings.timezone);

  const endInstant = entry.endTime > 0
    ? timestampToInstant(entry.endTime)
    : null;
  const endPlainDateTime = endInstant
    ? instantToPlainDateTime(endInstant, settings.timezone)
    : null;

  // Calculate duration
  const duration = entry.endTime > 0
    ? entry.endTime - entry.startTime
    : Date.now() - entry.startTime;

  const handleEdit = () => {
    setEditStartTime(startPlainDateTime.toString({ smallestUnit: 'second' }).slice(0, 19));
    setEditEndTime(endPlainDateTime ? endPlainDateTime.toString({ smallestUnit: 'second' }).slice(0, 19) : '');
    setEditTaskCategory(entry.taskCategory || "Uncategorized");
    setEditUserId(task?.userId);
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

      const newStartTime = plainDateTimeToTimestamp(startPlainDateTime, settings.timezone);

      let newEndTime = 0;
      if (editEndTime) {
        const [endDatePart, endTimePart] = editEndTime.split('T');
        const [endYear, endMonth, endDay] = endDatePart.split('-').map(Number);
        const [endHour, endMinute, endSecond] = endTimePart.split(':').map(Number);

        const endPlainDateTime = Temporal.PlainDateTime.from({
          year: endYear, month: endMonth, day: endDay,
          hour: endHour, minute: endMinute, second: endSecond
        });

        newEndTime = plainDateTimeToTimestamp(endPlainDateTime, settings.timezone);
      }

      onUpdateTimeEntry(entry.taskId, entry.index, { startTime: newStartTime, endTime: newEndTime });
      onUpdateTaskCategory(entry.taskId, editTaskCategory === "Uncategorized" ? undefined : editTaskCategory);
      onUpdateUser(entry.taskId, editUserId);
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
          <UserSelector
            value={editUserId}
            onChange={setEditUserId}
            className="h-6 w-auto"
          />
        </TableCell>
        <TableCell>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={"outline"}
                className={cn(
                  "w-[240px] justify-start text-left font-normal",
                  !editStartTime && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {editStartTime ? (
                  format(new Date(editStartTime), "PPP p")
                ) : (
                  <span>Pick a date</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={editStartTime ? new Date(editStartTime) : undefined}
                onSelect={(date) => {
                  if (date) {
                    const current = editStartTime ? new Date(editStartTime) : new Date();
                    date.setHours(current.getHours(), current.getMinutes(), current.getSeconds());
                    setEditStartTime(format(date, "yyyy-MM-dd'T'HH:mm:ss"));
                  }
                }}
                initialFocus
                weekStartsOn={weekStartsOn}
              />
              <div className="p-3 border-t border-border">
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => openTimePicker('start', editStartTime ? new Date(editStartTime).getTime() : Date.now())}
                >
                  <Clock className="mr-2 h-4 w-4" />
                  {editStartTime ? (
                    format(new Date(editStartTime), "HH:mm:ss")
                  ) : (
                    <span className="text-muted-foreground">Set time...</span>
                  )}
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </TableCell>
        <TableCell>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={"outline"}
                className={cn(
                  "w-[240px] justify-start text-left font-normal",
                  !editEndTime && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {editEndTime ? (
                  format(new Date(editEndTime), "PPP p")
                ) : (
                  <span>Running...</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={editEndTime ? new Date(editEndTime) : undefined}
                onSelect={(date) => {
                  if (date) {
                    const current = editEndTime ? new Date(editEndTime) : new Date();
                    date.setHours(current.getHours(), current.getMinutes(), current.getSeconds());
                    setEditEndTime(format(date, "yyyy-MM-dd'T'HH:mm:ss"));
                  }
                }}
                initialFocus
                weekStartsOn={weekStartsOn}
              />
              <div className="p-3 border-t border-border flex flex-col gap-2">
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => openTimePicker('end', editEndTime ? new Date(editEndTime).getTime() : Date.now())}
                >
                  <Clock className="mr-2 h-4 w-4" />
                  {editEndTime ? (
                    format(new Date(editEndTime), "HH:mm:ss")
                  ) : (
                    <span className="text-muted-foreground">Set time...</span>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditEndTime('')}
                >
                  Set to Running
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </TableCell>
        <TableCell className="flex gap-2">
          <Button size="sm" onClick={handleSave}>Save</Button>
          <Button size="sm" variant="outline" onClick={handleCancel}>Cancel</Button>
          {timePickerConfig && (
            <TimePickerDialog
              isOpen={timePickerOpen}
              onClose={() => setTimePickerOpen(false)}
              initialTime={timePickerConfig.initialTime}
              onTimeChange={(timestamp) => {
                const instant = timestampToInstant(timestamp);
                const plainDateTime = instantToPlainDateTime(instant, settings.timezone);
                const dateString = plainDateTime.toString({ smallestUnit: 'second' });

                if (timePickerConfig.type === 'start') {
                  setEditStartTime(dateString);
                } else {
                  setEditEndTime(dateString);
                }
              }}
            />
          )}
        </TableCell>
      </TableRow>
    );
  }

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
            sprintTarget={task?.sprintTarget}
          />
        </div>
        {children}
      </TableCell>
      <TableCell>{entry.taskCategory || "Uncategorized"}</TableCell>
      <TableCell>
        {task?.userId ? (
          (() => {
            const isCurrentUser = task.userId === currentUserId;
            const otherUser = !isCurrentUser ? users.find((u) => u.userId === task.userId) : null;
            const currentUserFromList = users.find(u => u.userId === currentUserId);
            const trigram = isCurrentUser
              ? (currentUserFromList as any)?.trigram
              : (otherUser as any)?.trigram;
            return (
              <UserAvatar
                username={isCurrentUser ? userSettings.username : otherUser?.username || 'Unknown'}
                logo={isCurrentUser ? userSettings.logo : otherUser?.logo}
                size="sm"
                showTooltip={true}
                trigram={trigram}
              />
            );
          })()
        ) : (
          <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center">
            <span className="text-xs text-muted-foreground">-</span>
          </div>
        )}
      </TableCell>
      <TableCell>{formatTimeWithTemporal(entry.startTime, settings.timezone)}</TableCell>
      <TableCell>{entry.endTime > 0 ? formatTimeWithTemporal(entry.endTime, settings.timezone) : 'Running'}</TableCell>
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
          {onToggleTimer && (
            <Button
              size="sm"
              variant="outline"
              className="h-6 w-6 p-0"
              onClick={(e) => {
                e.stopPropagation();
                onToggleTimer(entry.taskId);
              }}
            >
              {entry.endTime === 0 ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
          )}
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