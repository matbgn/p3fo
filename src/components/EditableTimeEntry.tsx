import React, { useState } from 'react';
import { Temporal } from '@js-temporal/polyfill';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableRow, TableCell } from "@/components/ui/table";
import { Trash2, Pencil, ArrowRight, Play, Pause, AlertTriangle } from "lucide-react";
import { TaskTag } from "./TaskTag";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { CATEGORIES } from "../data/categories";
import { Category } from "@/hooks/useTasks";

import { formatTimeWithTemporal, formatTimeCompact, formatDuration, timestampToInstant, plainDateTimeToTimestamp, instantToPlainDateTime } from "@/lib/format-utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useSettingsContext } from "@/context/SettingsContext";
import { CalendarIcon, Clock } from "lucide-react";
import { TimePickerDialog } from "@/components/ui/time-picker-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";


import { Task } from '@/hooks/useTasks';

import { UserSelector } from "./UserSelector";
import { useUsersContext, UserWithTrigram } from '@/context/UsersContext';
import { useUserSettings } from '@/hooks/useUserSettings';
import { UserAvatar } from "./UserAvatar";

function plainDateTimeToDisplayString(pdt: Temporal.PlainDateTime): string {
    return pdt.toString({ smallestUnit: 'second' }).slice(0, 19);
}

function plainDateTimeToTimestampS(pdt: Temporal.PlainDateTime, timezone: string): number {
    return pdt.toZonedDateTime(timezone).epochMilliseconds;
}

function dateDayToPlainDateTime(date: Date, timePdt: Temporal.PlainDateTime | null, timezone: string): Temporal.PlainDateTime {
    const datePdt = Temporal.PlainDate.from({
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        day: date.getDate(),
    });
    const timePart = timePdt
        ? { hour: timePdt.hour, minute: timePdt.minute, second: timePdt.second }
        : { hour: 0, minute: 0, second: 0 };
    return Temporal.PlainDateTime.from({
        year: datePdt.year,
        month: datePdt.month,
        day: datePdt.day,
        ...timePart,
    });
}

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
  overlapInfo?: {
    hasOverlap: boolean;
    overlappingEntries: Array<{ taskId: string; taskTitle: string }>;
    overlapGroupId?: string;
  };
}> = ({ entry, taskMap, onUpdateTimeEntry, onUpdateTaskCategory, onUpdateUser, onDelete, onJumpToTask, onToggleTimer, children, overlapInfo }) => {
  const [isEditing, setIsEditing] = useState(false);
  const { settings } = useSettingsContext();
  const weekStartsOn = settings.weekStartDay as 0 | 1;
  const timezone = settings.timezone || 'Europe/Zurich';

  const [startPdt, setStartPdt] = useState<Temporal.PlainDateTime | null>(null);
  const [endPdt, setEndPdt] = useState<Temporal.PlainDateTime | null>(null);
  const [editTaskCategory, setEditTaskCategory] = useState<string>("Uncategorized");

  const task = taskMap[entry.taskId];
  const { users } = useUsersContext();
  const { userSettings, userId: currentUserId } = useUserSettings();
  const [editUserId, setEditUserId] = useState<string | undefined>(undefined);

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
  const startPlainDateTime = instantToPlainDateTime(startInstant, timezone);

  const endInstant = entry.endTime > 0
    ? timestampToInstant(entry.endTime)
    : null;
  const endPlainDateTime = endInstant
    ? instantToPlainDateTime(endInstant, timezone)
    : null;

  const duration = entry.endTime > 0
    ? entry.endTime - entry.startTime
    : Date.now() - entry.startTime;

  const handleEdit = () => {
    setStartPdt(startPlainDateTime);
    setEndPdt(endPlainDateTime);
    setEditTaskCategory(entry.taskCategory || "Uncategorized");
    setEditUserId(task?.userId);
    setIsEditing(true);
  };

  const handleDoubleClick = () => {
    handleEdit();
  };

  const handleSave = () => {
    try {
      if (!startPdt) return;
      const newStartTime = plainDateTimeToTimestampS(startPdt, timezone);

      let newEndTime = 0;
      if (endPdt) {
        newEndTime = plainDateTimeToTimestampS(endPdt, timezone);
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
    const startDisplayStr = startPdt ? plainDateTimeToDisplayString(startPdt) : '';
    const endDisplayStr = endPdt ? plainDateTimeToDisplayString(endPdt) : '';
    const startAsDate = startPdt ? new Date(startPdt.year, startPdt.month - 1, startPdt.day) : undefined;
    const endAsDate = endPdt ? new Date(endPdt.year, endPdt.month - 1, endPdt.day) : undefined;

    return (
      <TableRow>
        <TableCell colSpan={6}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium truncate max-w-[200px]" title={entry.taskTitle}>{entry.taskTitle}</span>
            <Select onValueChange={(value) => setEditTaskCategory(value)} value={editTaskCategory}>
              <SelectTrigger className="w-[140px] h-8">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((category) => (
                  <SelectItem key={category} value={category}>{category}</SelectItem>
                ))}
                <SelectItem value="Uncategorized">Uncategorized</SelectItem>
              </SelectContent>
            </Select>
            <UserSelector value={editUserId} onChange={setEditUserId} className="h-8 w-auto" />
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "h-8 justify-start text-left font-normal px-2",
                    !startDisplayStr && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {startPdt ? format(startAsDate!, "PPP p") : <span>Pick a date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={startAsDate}
                  onSelect={(date) => { if (date && startPdt) setStartPdt(dateDayToPlainDateTime(date, startPdt, timezone)); }}
                  initialFocus
                  weekStartsOn={weekStartsOn}
                />
                <div className="p-3 border-t border-border">
                  <Button variant="outline" className="w-full justify-start" onClick={() => openTimePicker('start', startPdt ? plainDateTimeToTimestampS(startPdt, timezone) : Date.now())}>
                    <Clock className="mr-2 h-4 w-4" />
                    {startPdt ? `${String(startPdt.hour).padStart(2,'0')}:${String(startPdt.minute).padStart(2,'0')}:${String(startPdt.second).padStart(2,'0')}` : <span className="text-muted-foreground">Set time...</span>}
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "h-8 justify-start text-left font-normal px-2",
                    !endPdt && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {endPdt ? format(endAsDate!, "PPP p") : <span>Running...</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={endAsDate}
                  onSelect={(date) => { if (date) setEndPdt(dateDayToPlainDateTime(date, endPdt || startPdt, timezone)); }}
                  initialFocus
                  weekStartsOn={weekStartsOn}
                />
                <div className="p-3 border-t border-border flex flex-col gap-2">
                  <Button variant="outline" className="w-full justify-start" onClick={() => openTimePicker('end', endPdt ? plainDateTimeToTimestampS(endPdt, timezone) : (startPdt ? plainDateTimeToTimestampS(startPdt, timezone) : Date.now()))}>
                    <Clock className="mr-2 h-4 w-4" />
                    {endPdt ? `${String(endPdt.hour).padStart(2,'0')}:${String(endPdt.minute).padStart(2,'0')}:${String(endPdt.second).padStart(2,'0')}` : <span className="text-muted-foreground">Set time...</span>}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setEndPdt(null)}>Set to Running</Button>
                </div>
              </PopoverContent>
            </Popover>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSave}>Save</Button>
              <Button size="sm" variant="outline" onClick={handleCancel}>Cancel</Button>
            </div>
            {timePickerConfig && (
              <TimePickerDialog
                isOpen={timePickerOpen}
                onClose={() => setTimePickerOpen(false)}
                initialTime={timePickerConfig.initialTime}
                onTimeChange={(timestamp) => {
                  const instant = Temporal.Instant.fromEpochMilliseconds(timestamp);
                  const pdt = instant.toZonedDateTimeISO(timezone).toPlainDateTime();
                  if (timePickerConfig.type === 'start') setStartPdt(pdt); else setEndPdt(pdt);
                }}
              />
            )}
          </div>
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



  const entryId = `entry-${entry.taskId}-${entry.index}`;

  return (
    <TableRow
      ref={(el) => {
        if (el) {
          if (overlapInfo?.overlapGroupId) {
            el.setAttribute('data-overlap-group', overlapInfo.overlapGroupId);
          } else {
            el.removeAttribute('data-overlap-group');
          }
        }
      }}
      className={cn(
        "hover:bg-muted/50",
        overlapInfo?.hasOverlap && "bg-red-50 dark:bg-red-950/20 border-l-2 border-l-red-500"
      )}
      onDoubleClick={handleDoubleClick}
      data-entry-id={entryId}
    >
      <TableCell style={{ paddingLeft: indentLevel > 0 ? `${Math.min(8 + indentLevel * 4, 20)}px` : undefined }}>
        <div className="flex items-center gap-2 min-w-0">
          {overlapInfo?.hasOverlap && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center shrink-0">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                </div>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <div className="text-sm">
                  <p className="font-semibold mb-1">Overlapping time entries:</p>
                  <ul className="list-disc list-inside">
                    {overlapInfo.overlappingEntries.map((e, i) => (
                      <li key={i}>{e.taskTitle}</li>
                    ))}
                  </ul>
                </div>
              </TooltipContent>
            </Tooltip>
          )}
          {indentLevel > 0 && <span className="text-muted-foreground shrink-0">↳ </span>}
          <span className="truncate" title={entry.taskTitle}>{entry.taskTitle}</span>
          <TaskTag
            impact={task?.impact}
            urgent={task?.urgent}
            majorIncident={task?.majorIncident}
            sprintTarget={task?.sprintTarget}
          />
        </div>
        {children}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <span className="truncate block max-w-full" title={entry.taskCategory || "Uncategorized"}>{entry.taskCategory || "Uncategorized"}</span>
      </TableCell>
      <TableCell>
        {task?.userId ? (
          (() => {
            const isCurrentUser = task.userId === currentUserId;
            const otherUser = !isCurrentUser ? users.find((u) => u.userId === task.userId) : null;
            const currentUserFromList = users.find(u => u.userId === currentUserId);
            const trigram = isCurrentUser
              ? (currentUserFromList as UserWithTrigram)?.trigram
              : (otherUser as UserWithTrigram)?.trigram;
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
      <TableCell className="whitespace-nowrap overflow-hidden text-ellipsis" title={formatTimeWithTemporal(entry.startTime, timezone)}>{formatTimeCompact(entry.startTime, timezone)}</TableCell>
      <TableCell className="whitespace-nowrap overflow-hidden text-ellipsis" title={entry.endTime > 0 ? formatTimeWithTemporal(entry.endTime, timezone) : 'Running'}>{entry.endTime > 0 ? formatTimeCompact(entry.endTime, timezone) : 'Running'}</TableCell>
      <TableCell>
        <div className="flex items-center justify-between whitespace-nowrap">
          <span title={formatDuration(duration)}>{formatDuration(duration)}</span>
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
        </div>
      </TableCell>
    </TableRow>
  );
};