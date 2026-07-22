import React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Folder,
  Play,
  Pause,
  Clock2,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  CircleDot,
  Flame,
  Crosshair,
  Trash2,
  FileText,
  CalendarIcon,
  MoreHorizontal,
} from "lucide-react";
import { Task, Category, TriageStatus } from "@/hooks/useTasks";
import { TaskStatusSelect } from "./TaskStatusSelect";
import { CategorySelect } from "./CategorySelect";
import { UserSelector } from "./UserSelector";
import { RichTextField } from "./RichTextField";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/format-utils";
import { format } from "date-fns";
import { addReminder } from "@/utils/reminders";
import { useReminderStore } from "@/hooks/useReminders";
import { useUserSettings } from "@/hooks/useUserSettings";
import { useSettingsContext } from "@/context/SettingsContext";
import { Calendar } from "@/components/ui/calendar";
import { TimePickerDialog } from "@/components/ui/time-picker-dialog";
import { TaskEditModal } from "./TaskEditModal";
import { QuickAddTask } from "./QuickAddTask";
import { TimeSheet } from "./TimeSheet";
import { Badge } from "@/components/ui/badge";
import {
  LiveTimeBadge,
  EditableTitle,
  DIFFICULTY_OPTIONS,
  getDifficultyColor,
  DifficultyBadge,
} from "./SharedTaskControls";

export type TodolistRowData = {
  task: Task;
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
};

interface TodolistRowProps {
  row: TodolistRowData;
  tasks: Task[];
  onToggleExpand: (taskId: string) => void;
  updateStatus: (id: string, status: TriageStatus) => void;
  updateDifficulty: (id: string, difficulty: 0.5 | 1 | 2 | 3 | 5 | 8) => void;
  updateCategory: (id: string, category: Category) => void;
  updateTitle: (id: string, title: string) => void;
  updateComment: (id: string, comment: string) => void;
  updateTerminationDate: (id: string, terminationDate: number | undefined) => void;
  updateDurationInMinutes: (id: string, durationInMinutes: number | undefined) => void;
  updateUser: (id: string, userId: string | undefined) => void;
  deleteTask: (id: string) => void;
  duplicateTaskStructure: (id: string) => void;
  toggleUrgent: (id: string) => void;
  toggleImpact: (id: string) => void;
  toggleMajorIncident: (id: string) => void;
  toggleSprintTarget: (id: string) => void;
  toggleDone: (task: Task) => void;
  toggleTimer: (id: string, currentUserId?: string) => void;
  createTask: (title: string, parentId?: string | null, userId?: string) => Promise<string>;
  onFocusOnTask?: (taskId: string) => void;
  isHighlighted?: boolean;
  scrollTodolistRowRef?: React.MutableRefObject<Map<string, HTMLElement>>;
}

export const TodolistRow: React.FC<TodolistRowProps> = React.memo(({
  row,
  tasks,
  onToggleExpand,
  updateStatus,
  updateDifficulty,
  updateCategory,
  updateTitle,
  updateComment,
  updateTerminationDate,
  updateDurationInMinutes,
  updateUser,
  deleteTask,
  duplicateTaskStructure,
  toggleUrgent,
  toggleImpact,
  toggleMajorIncident,
  toggleSprintTarget,
  toggleDone,
  toggleTimer,
  createTask,
  onFocusOnTask,
  isHighlighted,
  scrollTodolistRowRef,
}) => {
  const { t } = useTranslation();
  const { task, depth, hasChildren, isExpanded } = row;
  const [isHovered, setIsHovered] = React.useState(false);
  const [subtaskDropdownOpen, setSubtaskDropdownOpen] = React.useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = React.useState(false);
  const [isTimeSheetOpen, setIsTimeSheetOpen] = React.useState(false);
  const [isCommentModalOpen, setIsCommentModalOpen] = React.useState(false);
  const [commentText, setCommentText] = React.useState(task.comment || "");
  React.useEffect(() => {
    setCommentText(task.comment || "");
  }, [task.comment]);
  const [durationValue, setDurationValue] = React.useState(task.durationInMinutes || "");
  const [offsetMinutes, setOffsetMinutes] = React.useState(-1);
  const [timePickerOpen, setTimePickerOpen] = React.useState(false);
  const { scheduledReminders, reminders, updateScheduledReminderTriggerDate, dismissReminder } = useReminderStore();
  const { userId: currentUserId } = useUserSettings();
  const { settings } = useSettingsContext();
  const weekStartsOn = settings.weekStartDay as 0 | 1;

  const canHaveTimer = !hasChildren;
  const isDone = task.triageStatus === "Done" || task.triageStatus === "Dropped";

  const totalDifficulty = hasChildren
    ? (task.children || []).reduce((sum, childId) => {
        const child = tasks.find(t => t.id === childId);
        return sum + (child?.difficulty || 0);
      }, 0)
    : task.difficulty || 0;

  React.useEffect(() => {
    setCommentText(task.comment || "");
  }, [task.comment]);

  React.useEffect(() => {
    setDurationValue(task.durationInMinutes ?? "");
  }, [task.durationInMinutes]);

  React.useEffect(() => {
    const existingReminder = scheduledReminders.find(
      (r) => r.taskId === task.id && r.originalTriggerDate === new Date(task.terminationDate || 0).toISOString()
    );
    if (existingReminder?.offsetMinutes !== undefined) {
      setOffsetMinutes(existingReminder.offsetMinutes);
    } else {
      setOffsetMinutes(-1);
    }
  }, [task.id, task.terminationDate, scheduledReminders]);

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (e.defaultPrevented) return;
    setIsEditModalOpen(true);
  };

  const rowRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const registry = scrollTodolistRowRef?.current;
    if (registry && rowRef.current) {
      registry.set(task.id, rowRef.current);
    }
    return () => {
      if (registry) {
        registry.delete(task.id);
      }
    };
  }, [task.id, scrollTodolistRowRef]);

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        ref={rowRef}
        className={cn(
          "todolist-row grid items-center gap-2 px-2 py-3.5 border-b border-border transition-colors hover:bg-accent/30",
          depth > 0 && "border-l-2 border-l-muted-foreground/30",
          isDone && "opacity-50",
          isHighlighted && "ring-2 ring-yellow-400 bg-yellow-50 dark:bg-yellow-900/20",
          hasChildren && "cursor-pointer"
        )}
        style={{
          gridTemplateColumns: "auto 1fr 100px 80px 68px 90px 36px 36px 56px 28px",
          paddingLeft: depth > 0 ? `${depth * 20 + 8}px` : undefined,
        }}
        onClick={hasChildren ? () => onToggleExpand(task.id) : undefined}
        onDoubleClick={handleDoubleClick}
      >
        {/* Col 1: checkbox/folder + chevron */}
        <div className="flex items-center gap-1 shrink-0">
          {hasChildren ? (
            <Folder className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Checkbox
              checked={task.triageStatus === "Done"}
              onCheckedChange={() => toggleDone(task)}
              onClick={(e) => e.stopPropagation()}
              className="h-4 w-4 accent-orange-500"
            />
          )}
          {hasChildren && (
            <button
              className="p-0 hover:bg-accent rounded"
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand(task.id);
              }}
            >
              {isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </button>
          )}
        </div>

        {/* Col 2: title + tags (flex-1) */}
        <div className="min-w-0 flex items-center gap-1.5 overflow-hidden">
          <EditableTitle
            title={task.title}
            done={isDone}
            onUpdateTitle={(title) => updateTitle(task.id, title)}
          />
          <div className="flex gap-0.5 shrink-0 overflow-hidden">
            {task.urgent && (
              <Badge variant="destructive" className="text-[9px] px-1 py-0 h-4 leading-none">
                <AlertTriangle className="h-2 w-2 mr-0.5" />
                {t('todolist.badge.urgent')}
              </Badge>
            )}
            {task.impact && (
              <Badge variant="secondary" className="bg-yellow-500 hover:bg-yellow-600 text-yellow-900 text-[9px] px-1 py-0 h-4 leading-none">
                <CircleDot className="h-2 w-2 mr-0.5" />
                {t('todolist.badge.impact')}
              </Badge>
            )}
            {task.majorIncident && (
              <Badge variant="destructive" className="bg-red-700 hover:bg-red-800 text-white text-[9px] px-1 py-0 h-4 leading-none">
                <Flame className="h-2 w-2 mr-0.5" />
                {t('todolist.badge.iod')}
              </Badge>
            )}
            {task.sprintTarget && (
              <Badge variant="secondary" className="bg-violet-500 hover:bg-violet-600 text-violet-100 text-[9px] px-1 py-0 h-4 leading-none">
                <Crosshair className="h-2 w-2 mr-0.5" />
                {t('todolist.badge.sprint')}
              </Badge>
            )}
          </div>
        </div>

        {/* Col 3: Time badge */}
        <div className="flex items-center justify-center shrink-0">
          <LiveTimeBadge
            task={task}
            onClick={() => {
              if (onFocusOnTask) onFocusOnTask(task.id);
            }}
          />
        </div>

        {/* Col 4: Status */}
        <div className="flex items-center justify-center shrink-0">
          <TaskStatusSelect
            value={task.triageStatus}
            onChange={(s) => updateStatus(task.id, s)}
            className="h-6 text-xs w-[72px]"
          />
        </div>

        {/* Col 5: Difficulty */}
        <div className="flex items-center justify-center shrink-0">
          {!hasChildren ? (
            <Select value={task.difficulty?.toString() || "1"} onValueChange={(v) => updateDifficulty(task.id, parseFloat(v) as 0.5 | 1 | 2 | 3 | 5 | 8)}>
              <SelectTrigger className="h-6 w-14 p-0 text-xs">
                <SelectValue>
                  <div className="flex items-center justify-center">
                    <div className={`w-2.5 h-2.5 rounded-full ${getDifficultyColor(task.difficulty || 1)} mr-1`} />
                    <span className="text-xs">{task.difficulty || 1}</span>
                  </div>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {DIFFICULTY_OPTIONS.map((d) => (
                  <SelectItem key={d} value={d.toString()}>
                    <div className="flex items-center">
                      <div className={`w-2.5 h-2.5 rounded-full ${getDifficultyColor(d)} mr-1.5`} />
                      <span>{d}</span>
                      {d === 8 && (
                        <span className="text-xs text-muted-foreground ml-2">{t('task.difficulty8Hint')}</span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <DifficultyBadge difficulty={totalDifficulty} />
          )}
        </div>

        {/* Col 6: Category */}
        <div className="flex items-center justify-center shrink-0">
          <CategorySelect
            value={task.category || "none"}
            onChange={(v) => updateCategory(task.id, v === "none" ? undefined : v)}
            className="h-6 w-[80px] text-xs"
          />
        </div>

        {/* Col 7: User */}
        <div className="flex items-center justify-center shrink-0">
          <UserSelector
            value={task.userId || ""}
            onChange={(selectedId) => updateUser(task.id, selectedId === 'current-user' ? currentUserId : selectedId)}
            className="h-6"
          />
        </div>

        {/* Col 8: Comment */}
        <div className={cn(
          "flex items-center justify-center shrink-0 transition-opacity duration-150",
          isHovered || task.comment ? "opacity-100" : "opacity-0"
        )}>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            onClick={(e) => {
              e.stopPropagation();
              setIsCommentModalOpen(true);
            }}
          >
            <FileText className={`h-3.5 w-3.5 ${task.comment ? "text-blue-500" : "text-gray-400"}`} />
          </Button>
        </div>

        {/* Col 9: Timer controls */}
        <div className={cn(
          "flex items-center justify-center gap-1 shrink-0 transition-opacity duration-150",
          isHovered ? "opacity-100" : "opacity-0"
        )}>
          {canHaveTimer && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0"
              onClick={(e) => {
                e.stopPropagation();
                toggleTimer(task.id, currentUserId);
              }}
            >
              {task.timer?.some(e => !e.endTime) ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            </Button>
          )}
          {canHaveTimer && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0"
              onClick={(e) => {
                e.stopPropagation();
                setIsTimeSheetOpen(true);
              }}
            >
              <Clock2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        {/* Col 10: More actions */}
        <div className={cn(
          "flex items-center justify-center shrink-0 transition-opacity duration-150",
          isHovered ? "opacity-100" : "opacity-0"
        )}>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2" align="end" onClick={(e) => e.stopPropagation()}>
              <div className="flex flex-col gap-1">
                {!task.parentId && (
                  <>
                    <button
                      className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-md hover:bg-accent w-full"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleUrgent(task.id);
                      }}
                    >
                      <AlertTriangle className={`h-3.5 w-3.5 ${task.urgent ? "text-red-500" : "text-gray-400"}`} />
                      <span>{task.urgent ? t('todolist.removeUrgent') : t('todolist.markUrgent')}</span>
                    </button>
                    <button
                      className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-md hover:bg-accent w-full"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleImpact(task.id);
                      }}
                    >
                      <CircleDot className={`h-3.5 w-3.5 ${task.impact ? "text-yellow-500" : "text-gray-400"}`} />
                      <span>{task.impact ? t('todolist.removeHighImpact') : t('todolist.markHighImpact')}</span>
                    </button>
                    <button
                      className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-md hover:bg-accent w-full"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleMajorIncident(task.id);
                      }}
                    >
                      <Flame className={`h-3.5 w-3.5 ${task.majorIncident ? "text-red-700" : "text-gray-400"}`} />
                      <span>{task.majorIncident ? t('todolist.removeIncidentOnDelivery') : t('todolist.markIncidentOnDelivery')}</span>
                    </button>
                    <button
                      className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-md hover:bg-accent w-full"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSprintTarget(task.id);
                      }}
                    >
                      <Crosshair className={`h-3.5 w-3.5 ${task.sprintTarget ? "text-violet-500" : "text-gray-400"}`} />
                      <span>{task.sprintTarget ? t('todolist.removeSprintTarget') : t('todolist.markSprintTarget')}</span>
                    </button>
                    <div className="h-px bg-border my-1" />
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-md hover:bg-accent w-full">
                          <CalendarIcon className="h-3.5 w-3.5 text-gray-400" />
                          <span>{task.terminationDate ? format(new Date(task.terminationDate), "PP") : t('todolist.setDeadline')}</span>
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={task.terminationDate ? new Date(task.terminationDate) : undefined}
                          onSelect={(date) => {
                            if (date) {
                              const current = task.terminationDate ? new Date(task.terminationDate) : new Date();
                              date.setHours(current.getHours(), current.getMinutes(), current.getSeconds());
                              updateTerminationDate(task.id, date.getTime());
                            } else {
                              updateTerminationDate(task.id, undefined);
                            }
                          }}
                          initialFocus
                          weekStartsOn={weekStartsOn}
                        />
                      </PopoverContent>
                    </Popover>
                    <div className="flex items-center gap-2 px-2 py-1.5">
                      <span className="text-xs text-muted-foreground">{t('todolist.durationLabel')}</span>
                      <Input
                        type="number"
                        placeholder={t('task.durationPlaceholder')}
                        min="0"
                        value={durationValue}
                        onChange={(e) => setDurationValue(e.target.value)}
                        onBlur={() => {
                          const duration = parseInt(String(durationValue));
                          updateDurationInMinutes(task.id, isNaN(duration) ? undefined : duration);
                        }}
                        className="w-16 h-6 text-xs px-1"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                    <div className="h-px bg-border my-1" />
                  </>
                )}
                <button
                  className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-md hover:bg-accent w-full"
                  onClick={(e) => {
                    e.stopPropagation();
                    duplicateTaskStructure(task.id);
                  }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                  </svg>
                  <span>{t('todolist.duplicate')}</span>
                </button>
                <button
                  className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-md hover:bg-accent hover:text-red-500 w-full"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteTask(task.id);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>{t('todolist.delete')}</span>
                </button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Quick-add subtask on hover */}
      {(isHovered || subtaskDropdownOpen) && (
        <div
          className="px-2 py-1 border-b border-border bg-accent/10"
          style={{ paddingLeft: `${(depth + 1) * 20 + 8}px` }}
          onClick={(e) => e.stopPropagation()}
        >
          <QuickAddTask
            placeholder={t('todolist.subtaskPlaceholder')}
            parentId={task.id}
            showPlusIcon
            onDropdownOpenChange={setSubtaskDropdownOpen}
          />
        </div>
      )}

      {/* Modals */}
      {isEditModalOpen && (
        <TaskEditModal
          task={task}
          tasks={tasks}
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          updateTitle={updateTitle}
          updateComment={updateComment}
          updateStatus={updateStatus}
          updateCategory={updateCategory}
          updateDifficulty={updateDifficulty}
          updateUser={updateUser}
          updateTerminationDate={updateTerminationDate}
          updateDurationInMinutes={updateDurationInMinutes}
          toggleUrgent={toggleUrgent}
          toggleImpact={toggleImpact}
          toggleMajorIncident={toggleMajorIncident}
          toggleSprintTarget={toggleSprintTarget}
          onToggleTimer={toggleTimer}
          currentUserId={currentUserId}
        />
      )}

      {isCommentModalOpen && (
        <Dialog open={isCommentModalOpen} onOpenChange={setIsCommentModalOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>{t('task.editCommentTitle', { title: task.title })}</DialogTitle>
              <DialogDescription className="sr-only">
                {t('task.editCommentDescription', { title: task.title })}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <label htmlFor="todolist-comment" className="sr-only">{t('task.commentLabel')}</label>
                <RichTextField
                  value={commentText}
                  onChange={(json) => setCommentText(json)}
                  label={t('task.commentFieldLabel')}
                  placeholder={t('task.commentPlaceholder')}
                  className="min-h-[200px]"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  updateComment(task.id, commentText);
                  setIsCommentModalOpen(false);
                }}
              >
                {t('task.saveComment')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {canHaveTimer && isTimeSheetOpen && (
        <Dialog open={isTimeSheetOpen} onOpenChange={setIsTimeSheetOpen}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col p-0" aria-describedby={undefined}>
            <DialogHeader className="p-6 pb-4">
              <DialogTitle>{t('task.timeSheetTitle', { title: task.title })}</DialogTitle>
              <DialogDescription className="sr-only">
                {t('task.timeSheetDescription', { title: task.title })}
              </DialogDescription>
            </DialogHeader>
            <div className="flex-grow overflow-y-auto px-6 pb-6">
              <TimeSheet taskId={task.id} />
            </div>
          </DialogContent>
        </Dialog>
      )}

      <TimePickerDialog
        isOpen={timePickerOpen}
        onClose={() => setTimePickerOpen(false)}
        initialTime={task.terminationDate || Date.now()}
        onTimeChange={(timestamp) => {
          updateTerminationDate(task.id, timestamp);
          updateScheduledReminderTriggerDate(task.id, new Date(timestamp).toISOString(), offsetMinutes);
        }}
      />
    </div>
  );
});
