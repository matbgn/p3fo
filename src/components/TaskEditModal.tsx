import React from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { useCombinedSettings } from "@/hooks/useCombinedSettings";
import { CategorySelect } from "./CategorySelect";
import { TaskStatusSelect } from "./TaskStatusSelect";

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
    updateTerminationDate: (id: string, date: number | undefined) => void;
    updateDurationInMinutes: (id: string, duration: number | undefined) => void;
    toggleUrgent: (id: string) => void;
    toggleImpact: (id: string) => void;
    toggleMajorIncident: (id: string) => void;
    currentUserId: string | undefined;
}

const DIFFICULTY_OPTIONS: Array<0.5 | 1 | 2 | 3 | 5 | 8> = [0.5, 1, 2, 3, 5, 8];

export const TaskEditModal: React.FC<TaskEditModalProps> = ({
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
    currentUserId,
}) => {
    const { settings } = useCombinedSettings();
    const weekStartsOn = settings.weekStartDay as 0 | 1;

    // Internal state to track which task is currently being edited
    // This allows "jumping" to other tasks without closing the modal
    const [activeTask, setActiveTask] = React.useState(task);

    const [title, setTitle] = React.useState(activeTask.title);
    const [comment, setComment] = React.useState(activeTask.comment || "");
    const [duration, setDuration] = React.useState(activeTask.durationInMinutes?.toString() || "");

    // Reset active task when the prop task changes (e.g. if modal is reopened for a different task)
    React.useEffect(() => {
        setActiveTask(task);
    }, [task]);

    // Update form fields when activeTask changes
    React.useEffect(() => {
        setTitle(activeTask.title);
        setComment(activeTask.comment || "");
        setDuration(activeTask.durationInMinutes?.toString() || "");
    }, [activeTask]);

    const handleSave = () => {
        if (title !== activeTask.title) updateTitle(activeTask.id, title);
        if (comment !== (activeTask.comment || "")) updateComment(activeTask.id, comment);

        const parsedDuration = parseInt(duration);
        const finalDuration = isNaN(parsedDuration) ? undefined : parsedDuration;
        if (finalDuration !== activeTask.durationInMinutes) updateDurationInMinutes(activeTask.id, finalDuration);

        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto flex flex-col">
                <DialogHeader>
                    <DialogTitle>
                        <Input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="text-lg font-bold border-none shadow-none focus-visible:ring-0 px-0"
                            placeholder="Task Title"
                        />
                    </DialogTitle>
                    <DialogDescription>
                        Edit task details
                    </DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 py-4 flex-1">
                    {/* Main Column */}
                    <div className="md:col-span-2 flex flex-col gap-4">
                        <div className="flex flex-col gap-2 flex-1">
                            <Label htmlFor="description" className="text-base font-semibold">Description</Label>
                            <Textarea
                                id="description"
                                value={comment}
                                onChange={(e) => setComment(e.target.value)}
                                className="flex-1 min-h-[300px] resize-none"
                                placeholder="Add a detailed description..."
                            />
                        </div>

                        <div className="flex flex-col gap-2 pt-4 border-t">
                            <Label className="text-base font-semibold">Task Hierarchy</Label>
                            <div className="flex flex-col gap-2 p-4 bg-muted/30 rounded-md">
                                {/* Parent */}
                                {activeTask.parentId ? (
                                    <div
                                        className="flex items-center gap-2 cursor-pointer hover:bg-accent/50 p-1 rounded transition-colors"
                                        onClick={() => {
                                            const parent = tasks.find(t => t.id === activeTask.parentId);
                                            if (parent) setActiveTask(parent);
                                        }}
                                    >
                                        <span className="text-sm text-muted-foreground">Parent:</span>
                                        <span className="text-sm font-medium text-blue-600 hover:underline">
                                            {tasks.find((t) => t.id === activeTask.parentId)?.title || "Unknown Parent"}
                                        </span>
                                    </div>
                                ) : (
                                    <div className="text-sm text-muted-foreground italic">No parent task</div>
                                )}

                                {/* Current Task */}
                                <div className="flex items-center gap-2 pl-4 border-l-2 border-primary">
                                    <span className="text-sm font-bold">{activeTask.title}</span>
                                    <span className="text-xs text-muted-foreground">(Current)</span>
                                </div>

                                {/* Children */}
                                {activeTask.children && activeTask.children.length > 0 ? (
                                    <div className="flex flex-col gap-1 pl-8 border-l-2 border-muted">
                                        {activeTask.children.map((childId) => {
                                            const child = tasks.find((t) => t.id === childId);
                                            return (
                                                <div
                                                    key={childId}
                                                    className="text-sm cursor-pointer hover:bg-accent/50 p-1 rounded transition-colors text-blue-600 hover:underline"
                                                    onClick={() => {
                                                        if (child) setActiveTask(child);
                                                    }}
                                                >
                                                    {child?.title || "Unknown Child"}
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="text-sm text-muted-foreground italic pl-8">No subtasks</div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Sidebar Column */}
                    <div className="flex flex-col gap-6">
                        <div className="flex flex-col gap-2">
                            <Label>Status</Label>
                            <TaskStatusSelect value={activeTask.triageStatus} onChange={(s) => updateStatus(activeTask.id, s)} />
                        </div>

                        <div className="flex flex-col gap-2">
                            <Label>Assigned To</Label>
                            <UserSelector
                                value={activeTask.userId || ''}
                                onChange={(selectedId) => updateUser(activeTask.id, selectedId === 'current-user' ? currentUserId : selectedId)}
                            />
                        </div>

                        <div className="flex flex-col gap-2">
                            <Label>Category</Label>
                            <CategorySelect
                                value={activeTask.category || "none"}
                                onChange={(category) => updateCategory(activeTask.id, category === "none" ? undefined : category)}
                            />
                        </div>

                        <div className="flex flex-col gap-2">
                            <Label>Difficulty</Label>
                            <Select value={activeTask.difficulty?.toString() || "1"} onValueChange={(v) => updateDifficulty(activeTask.id, parseFloat(v) as 0.5 | 1 | 2 | 3 | 5 | 8)}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select difficulty" />
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

                        <div className="flex flex-col gap-2">
                            <Label>Termination Date</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant={"outline"}
                                        className={cn(
                                            "w-full justify-start text-left font-normal",
                                            !activeTask.terminationDate && "text-muted-foreground"
                                        )}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {activeTask.terminationDate ? format(new Date(activeTask.terminationDate), "PPP") : <span>Pick a date</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                    <Calendar
                                        mode="single"
                                        selected={activeTask.terminationDate ? new Date(activeTask.terminationDate) : undefined}
                                        onSelect={(date) => {
                                            if (date) {
                                                const current = activeTask.terminationDate ? new Date(activeTask.terminationDate) : new Date();
                                                date.setHours(current.getHours(), current.getMinutes(), current.getSeconds());
                                                updateTerminationDate(activeTask.id, date.getTime());
                                            } else {
                                                updateTerminationDate(activeTask.id, undefined);
                                            }
                                        }}
                                        initialFocus
                                        weekStartsOn={weekStartsOn}
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>

                        <div className="flex flex-col gap-2">
                            <Label>Planned Duration (min)</Label>
                            <Input
                                type="number"
                                min="0"
                                value={duration}
                                onChange={(e) => setDuration(e.target.value)}
                                onBlur={() => {
                                    const parsed = parseInt(duration);
                                    if (!isNaN(parsed) && parsed !== activeTask.durationInMinutes) {
                                        updateDurationInMinutes(activeTask.id, parsed);
                                    } else if (duration === "" && activeTask.durationInMinutes !== undefined) {
                                        updateDurationInMinutes(activeTask.id, undefined);
                                    }
                                }}
                            />
                        </div>

                        <div className="flex flex-col gap-4 pt-2 border-t">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="urgent" className="cursor-pointer">Urgent</Label>
                                <Switch id="urgent" checked={activeTask.urgent} onCheckedChange={() => toggleUrgent(activeTask.id)} />
                            </div>
                            <div className="flex items-center justify-between">
                                <Label htmlFor="impact" className="cursor-pointer">High Impact</Label>
                                <Switch id="impact" checked={activeTask.impact} onCheckedChange={() => toggleImpact(activeTask.id)} />
                            </div>
                            <div className="flex items-center justify-between">
                                <Label htmlFor="incident" className="cursor-pointer">Incident</Label>
                                <Switch id="incident" checked={activeTask.majorIncident} onCheckedChange={() => toggleMajorIncident(activeTask.id)} />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t mt-auto">
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSave}>Save & Close</Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};
