import React from "react";
import { useTranslation } from 'react-i18next';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RichTextField } from "@/components/RichTextField";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Task, Category, TriageStatus } from "@/hooks/useTasks";
import { UserSelector } from "./UserSelector";
import { Play, Pause, Clock2, X, Plus, AlertTriangle, CircleDot, Flame, Crosshair } from "lucide-react";
import { cn } from "@/lib/utils";
import { CategorySelect } from "./CategorySelect";
import { TaskStatusSelect } from "./TaskStatusSelect";
import { TimeSheetDialog } from "./TimeSheetDialog";
import { LinkedVotePicker } from "@/components/voting/LinkedVotePicker";
import { SubtaskProgress } from "@/components/SubtaskProgress";
import { useTasks } from "@/hooks/useTasks";
import { CardScheduleFields } from "./planner/CardScheduleFields";
import { RepeatPicker } from "./planner/RepeatPicker";
import { TaskColorPicker } from "./planner/TaskColorPicker";
import { combineDateKeyAndTime, normalizeDueTime, toDateKey } from "@/lib/planner/dates";
import { effectiveDueDate } from "@/lib/task-conversions";
import { useToday } from "@/hooks/useToday";

interface TaskEditModalProps {
    task: Task;
    tasks: Task[];
    isOpen: boolean;
    onClose: () => void;
    updateTitle: (id: string, title: string) => void;
    updateComment: (id: string, comment: string) => void;
    updateStatus: (id: string, status: TriageStatus) => void;
    updateCategory: (id: string, category: Category) => void;
    updateDifficulty: (id: string, difficulty: 0.5 | 1 | 2 | 3 | 5 | 8) => void;
    updateUser: (id: string, userId: string | undefined) => void;
    updateTerminationDate: (id: string, date: number | undefined, dueTime?: string | null) => void;
    updateDurationInMinutes: (id: string, duration: number | undefined) => void;
    toggleUrgent: (id: string) => void;
    toggleImpact: (id: string) => void;
    toggleMajorIncident: (id: string) => void;
    toggleSprintTarget: (id: string) => void;
    currentUserId: string | undefined;
    onToggleTimer?: (id: string, currentUserId?: string) => void;
    updateLinkedVoteIds?: (id: string, linkedVoteIds: string[]) => void;
    defaultTab?: 'card' | 'details';
    onDelete?: (task: Task) => void;
    onDuplicate?: (task: Task) => void;
}

const DIFFICULTY_OPTIONS: Array<0.5 | 1 | 2 | 3 | 5 | 8> = [0.5, 1, 2, 3, 5, 8];

const TaskEditModalInner: React.FC<TaskEditModalProps> = ({
    task,
    tasks,
    isOpen,
    onClose,
    updateTitle,
    updateComment,
    updateStatus,
    updateCategory,
    updateDifficulty,
    updateUser,
    updateTerminationDate,
    updateDurationInMinutes,
    toggleUrgent,
    toggleImpact,
    toggleMajorIncident,
    toggleSprintTarget,
    currentUserId,
    onToggleTimer,
    updateLinkedVoteIds: updateLinkedVoteIdsProp,
    defaultTab = 'details',
    onDelete,
    onDuplicate,
}) => {
    const { t } = useTranslation();
    const { updatePlannedDate, updatePlannedTime, updateColor, setRecurrence, createTask, toggleDone } = useTasks();

    // Internal state to track which task is currently being edited
    // This allows "jumping" to other tasks without closing the modal
    const [activeTask, setActiveTask] = React.useState(task);

    const [title, setTitle] = React.useState(activeTask.title);
    const [comment, setComment] = React.useState(activeTask.comment || "");
    const [isTimeSheetOpen, setIsTimeSheetOpen] = React.useState(false);
    const [activeTab, setActiveTab] = React.useState<'card' | 'details'>(defaultTab);
    const [checklistTitle, setChecklistTitle] = React.useState('');
    const [durationDraft, setDurationDraft] = React.useState(
        activeTask.durationInMinutes ? String(activeTask.durationInMinutes) : '',
    );

    // Reset active task when the prop task changes (e.g. if modal is reopened for a different task)
    React.useEffect(() => {
        setActiveTask(task);
    }, [task]);

    // Update form fields when activeTask changes
    React.useEffect(() => {
        setTitle(activeTask.title);
        setComment(activeTask.comment || "");
        setChecklistTitle('');
        setDurationDraft(activeTask.durationInMinutes ? String(activeTask.durationInMinutes) : '');
    }, [activeTask]);

    React.useEffect(() => {
        if (isOpen) setActiveTab(defaultTab);
    }, [defaultTab, isOpen, task.id]);

    const handleSave = () => {
        if (title !== activeTask.title) updateTitle(activeTask.id, title);
        if (comment !== (activeTask.comment || "")) updateComment(activeTask.id, comment);
        onClose();
    };

    const effectiveDue = effectiveDueDate(activeTask);
    const dueDateValue = effectiveDue ? toDateKey(new Date(effectiveDue)) : '';
    const dueTimeValue = normalizeDueTime(activeTask.dueTime, effectiveDue) ?? '';
    const durationValue = durationDraft;
    const todayKey = useToday();

    const commitDuration = () => {
        const trimmed = durationDraft.trim();
        const parsed = trimmed === '' ? undefined : Number(trimmed);
        const next = parsed === undefined || Number.isNaN(parsed) ? undefined : parsed;
        if (next !== activeTask.durationInMinutes) {
            void updateDurationInMinutes(activeTask.id, next);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto flex flex-col [&>button]:hidden">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="text-lg font-bold border-none shadow-none focus-visible:ring-0 px-0 flex-1"
                            placeholder={t('task.titlePlaceholder')}
                        />
                        <div className="flex items-center gap-1">
                            <UserSelector
                                value={activeTask.userId || ''}
                                onChange={(selectedId) => updateUser(activeTask.id, selectedId === 'current-user' ? currentUserId : selectedId)}
                            />
                            {onToggleTimer && (
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 w-8 p-0"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onToggleTimer(activeTask.id, currentUserId);
                                    }}
                                >
                                    {activeTask.timer?.some(t => t.endTime === 0) ? (
                                        <Pause className="h-5 w-5 text-primary" />
                                    ) : (
                                        <Play className="h-5 w-5 text-muted-foreground hover:text-primary" />
                                    )}
                                </Button>
                            )}

                            <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsTimeSheetOpen(true);
                                }}
                            >
                                <Clock2 className="h-5 w-5 text-muted-foreground hover:text-primary" />
                            </Button>

                            <DialogClose asChild>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 w-8 p-0"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onClose();
                                    }}
                                >
                                    <X className="h-5 w-5 text-muted-foreground hover:text-destructive" />
                                </Button>
                            </DialogClose>
                        </div>
                    </DialogTitle>
                    <DialogDescription>
                        {t('task.editDetails')}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex items-center gap-1 self-start rounded-md border bg-card p-1">
                    <Button
                        variant={activeTab === 'card' ? 'secondary' : 'ghost'}
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => setActiveTab('card')}
                    >
                        {t('planner.cardTab')}
                    </Button>
                    <Button
                        variant={activeTab === 'details' ? 'secondary' : 'ghost'}
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => setActiveTab('details')}
                    >
                        {t('planner.detailsTab')}
                    </Button>
                </div>

                {activeTab === 'card' && (
                    <div className="space-y-4 py-4 flex-1">
                        <CardScheduleFields
                            plannedDate={activeTask.plannedDate ?? ''}
                            plannedTime={activeTask.plannedTime ?? ''}
                            dueDate={dueDateValue}
                            dueTime={dueTimeValue}
                            duration={durationValue}
                            onPlannedDateChange={(value) => void updatePlannedDate(activeTask.id, value || null)}
                            onPlannedTimeChange={(value) => void updatePlannedTime(activeTask.id, value || null)}
                            onDueDateChange={(value) => updateTerminationDate(activeTask.id, value ? combineDateKeyAndTime(value, dueTimeValue) : undefined, dueTimeValue || null)}
                            onDueTimeChange={(value) => updateTerminationDate(activeTask.id, dueDateValue ? combineDateKeyAndTime(dueDateValue, value) : undefined, value || null)}
                            onDurationChange={setDurationDraft}
                            onDurationCommit={commitDuration}
                        />

                        {activeTask.seriesId ? (
                            <p className="text-xs text-muted-foreground">
                                This occurrence belongs to a recurring series. Edit the series in the Recurring lane.
                            </p>
                        ) : !activeTask.parentId ? (
                            <RepeatPicker
                                anchorDate={activeTask.plannedDate ?? todayKey}
                                recurrence={activeTask.recurrence ?? null}
                                onApply={(recurrence) => {
                                    if (recurrence && !activeTask.plannedDate) {
                                        void updatePlannedDate(activeTask.id, todayKey);
                                    }
                                    void setRecurrence(activeTask.id, recurrence);
                                }}
                            />
                        ) : null}

                        <TaskColorPicker
                            value={activeTask.color ?? 'none'}
                            onChange={(value) => void updateColor(activeTask.id, value)}
                        />

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1 text-xs font-medium text-muted-foreground">
                                <span>{t('task.statusLabel')}</span>
                                <TaskStatusSelect value={activeTask.triageStatus} onChange={(status) => updateStatus(activeTask.id, status)} />
                            </div>
                            <div className="space-y-1 text-xs font-medium text-muted-foreground">
                                <span>{t('task.categoryLabel')}</span>
                                <CategorySelect
                                    value={activeTask.category || 'none'}
                                    onChange={(category) => updateCategory(activeTask.id, category === 'none' ? undefined : category)}
                                />
                            </div>
                            <div className="space-y-1 text-xs font-medium text-muted-foreground">
                                <span>{t('task.difficultyLabel')}</span>
                                <Select
                                    value={activeTask.difficulty?.toString() || '1'}
                                    onValueChange={(value) => updateDifficulty(activeTask.id, parseFloat(value) as 0.5 | 1 | 2 | 3 | 5 | 8)}
                                >
                                    <SelectTrigger className="h-8">
                                        <SelectValue placeholder={t('task.selectDifficulty')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {DIFFICULTY_OPTIONS.map((diff) => (
                                            <SelectItem key={diff} value={diff.toString()}>
                                                {diff}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1 text-xs font-medium text-muted-foreground">
                                <span>{t('planner.flags')}</span>
                                <div className="flex items-center gap-1">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className={cn('h-8 w-8', activeTask.urgent && 'bg-accent')}
                                        onClick={() => toggleUrgent(activeTask.id)}
                                        aria-label={t('task.urgentLabel')}
                                        title={t('task.urgentLabel')}
                                    >
                                        <AlertTriangle className={cn('h-4 w-4', activeTask.urgent ? 'text-red-500' : 'text-muted-foreground')} />
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className={cn('h-8 w-8', activeTask.impact && 'bg-accent')}
                                        onClick={() => toggleImpact(activeTask.id)}
                                        aria-label={t('task.highImpactLabel')}
                                        title={t('task.highImpactLabel')}
                                    >
                                        <CircleDot className={cn('h-4 w-4', activeTask.impact ? 'text-yellow-500' : 'text-muted-foreground')} />
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className={cn('h-8 w-8', activeTask.majorIncident && 'bg-accent')}
                                        onClick={() => toggleMajorIncident(activeTask.id)}
                                        aria-label={t('task.incidentLabel')}
                                        title={t('task.incidentLabel')}
                                    >
                                        <Flame className={cn('h-4 w-4', activeTask.majorIncident ? 'text-red-700' : 'text-muted-foreground')} />
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className={cn('h-8 w-8', activeTask.sprintTarget && 'bg-accent')}
                                        onClick={() => toggleSprintTarget(activeTask.id)}
                                        aria-label={t('task.sprintTargetLabel')}
                                        title={t('task.sprintTargetLabel')}
                                    >
                                        <Crosshair className={cn('h-4 w-4', activeTask.sprintTarget ? 'text-violet-500' : 'text-muted-foreground')} />
                                    </Button>
                                </div>
                            </div>
                        </div>

                    </div>
                )}

                {activeTab === 'details' && (
                    <div className="flex flex-col gap-4 py-4 flex-1">
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="description" className="text-base font-semibold">{t('task.descriptionLabel')}</Label>
                            <RichTextField
                                value={comment}
                                onChange={(text) => setComment(text)}
                                label={t('task.descriptionFieldLabel')}
                                placeholder={t('task.descriptionPlaceholder')}
                                className="min-h-[160px]"
                            />
                        </div>

                        <div className="flex flex-col gap-2 pt-4 border-t">
                            <div className="flex items-center justify-between">
                                <Label className="text-base font-semibold">{t('task.hierarchyLabel')}</Label>
                                {activeTask.children && activeTask.children.length > 0 && (
                                    <SubtaskProgress task={activeTask} tasks={tasks} />
                                )}
                            </div>
                            <div className="flex flex-col gap-2 rounded-md bg-muted/30 p-4">
                                {activeTask.parentId ? (
                                    <div
                                        className="flex items-center gap-2 rounded p-1 transition-colors cursor-pointer hover:bg-accent/50"
                                        onClick={() => {
                                            const parent = tasks.find((candidate) => candidate.id === activeTask.parentId);
                                            if (parent) setActiveTask(parent);
                                        }}
                                    >
                                        <span className="text-sm text-muted-foreground">{t('task.parentLabel')}</span>
                                        <span className="text-sm font-medium text-blue-600 hover:underline">
                                            {tasks.find((candidate) => candidate.id === activeTask.parentId)?.title || t('task.unknownParent')}
                                        </span>
                                    </div>
                                ) : (
                                    <div className="text-sm italic text-muted-foreground">{t('task.noParent')}</div>
                                )}

                                <div className="flex items-center gap-2 border-l-2 border-primary pl-4">
                                    <span className="text-sm font-bold">{activeTask.title}</span>
                                    <span className="text-xs text-muted-foreground">{t('task.current')}</span>
                                </div>

                                {activeTask.children && activeTask.children.length > 0 ? (
                                    <div className="flex flex-col gap-1 border-l-2 border-muted pl-8">
                                        {activeTask.children.map((childId) => {
                                            const child = tasks.find((candidate) => candidate.id === childId);
                                            const isDone = child && (child.triageStatus === 'Done' || child.triageStatus === 'Dropped');
                                            return (
                                                <div
                                                    key={childId}
                                                    className="flex items-center gap-2 rounded p-1 text-sm transition-colors hover:bg-accent/50"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        className="h-3.5 w-3.5 shrink-0 accent-orange-500"
                                                        checked={!!isDone}
                                                        onChange={() => child && void toggleDone(child.id)}
                                                    />
                                                    <button
                                                        type="button"
                                                        className={isDone ? 'text-left text-muted-foreground line-through' : 'text-left text-blue-600 hover:underline'}
                                                        onClick={() => {
                                                            if (child) setActiveTask(child);
                                                        }}
                                                    >
                                                        {child?.title || t('task.unknownChild')}
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="pl-8 text-sm italic text-muted-foreground">{t('task.noSubtasks')}</div>
                                )}

                                <div className="flex items-center gap-1.5 border-l-2 border-muted pt-1 pl-8">
                                    <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                                    <Input
                                        value={checklistTitle}
                                        onChange={(event) => setChecklistTitle(event.target.value)}
                                        onKeyDown={(event) => {
                                            if (event.key === 'Enter' && checklistTitle.trim()) {
                                                event.preventDefault();
                                                void createTask(checklistTitle.trim(), activeTask.id);
                                                setChecklistTitle('');
                                            }
                                        }}
                                        placeholder={t('planner.addChecklistItem')}
                                        className="h-7 border-0 px-0 text-sm shadow-none focus-visible:ring-0"
                                    />
                                </div>
                            </div>
                        </div>

                        {updateLinkedVoteIdsProp && (
                            <div className="flex flex-col gap-2 border-t pt-2">
                                <LinkedVotePicker
                                    linkedVoteIds={activeTask.linkedVoteIds || []}
                                    onChange={(ids) => updateLinkedVoteIdsProp(activeTask.id, ids)}
                                />
                            </div>
                        )}
                    </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-4 border-t mt-auto">
                    <div className="flex gap-1">
                        {onDuplicate && (
                            <Button variant="ghost" size="sm" onClick={() => onDuplicate(activeTask)}>
                                {t('planner.duplicate')}
                            </Button>
                        )}
                        {onDelete && (
                            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => onDelete(activeTask)}>
                                {t('planner.delete')}
                            </Button>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
                        <Button onClick={handleSave}>{t('task.saveAndClose')}</Button>
                    </div>
                </div>
            </DialogContent>

            <TimeSheetDialog
                taskId={activeTask.id}
                taskTitle={activeTask.title}
                open={isTimeSheetOpen}
                onOpenChange={setIsTimeSheetOpen}
            />

        </Dialog>
    );
};

export const TaskEditModal = React.memo(TaskEditModalInner);
