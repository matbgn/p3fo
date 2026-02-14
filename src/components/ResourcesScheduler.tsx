import React, { useMemo, useState, useRef, useEffect } from 'react';
import moment from 'moment';
import { useAllTasks } from '@/hooks/useAllTasks';
import { useUsers } from '@/hooks/useUsers';
import { Task } from '@/hooks/useTasks';
import { calculateTotalDifficulty, normalizePreferredDays } from '@/utils/scheduler-utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
    TooltipProvider
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, User as UserIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DaySelector } from '@/components/ui/day-selector';

interface ResourcesSchedulerProps {
    onFocusOnTask: (taskId: string) => void;
    onEditTask?: (task: Task) => void;
}

interface ScheduledBlock {
    task: Task;
    start: Date;
    end: Date;
    totalDifficulty: number;
}

// Configuration
// const DAY_WIDTH = 120; // Replaced by dynamic state
const HEADER_HEIGHT = 40;
const ROW_HEIGHT = 80; // Increased height to fit bubbles
const SIDEBAR_WIDTH = 250;

const ResourcesScheduler: React.FC<ResourcesSchedulerProps> = ({ onFocusOnTask, onEditTask }) => {
    const { tasks } = useAllTasks();
    const { users, updateUser } = useUsers();
    const [viewStartDate, setViewStartDate] = useState(moment().startOf('day'));

    // 1. Filter Tasks
    const activeTasks = useMemo(() => {
        return tasks.filter(t =>
            !t.parentId &&
            t.triageStatus !== 'Done' &&
            t.triageStatus !== 'Dropped' &&
            t.triageStatus !== 'Archived'
        );
    }, [tasks]);

    // 2. Prepare Resources (Users)
    const resources = useMemo(() => {
        const list = users.map(u => ({
            id: u.userId,
            name: u.username || 'Unknown User',
            avatar: u.logo,
            initials: u.username ? u.username.substring(0, 2).toUpperCase() : '??',
            preferredWorkingDays: u.preferredWorkingDays || [1, 2, 3, 4, 5]
        }));
        return list;
    }, [users]);

    // 3. Schedule Logic
    const scheduledData = useMemo(() => {
        const data: Record<string, ScheduledBlock[]> = {};

        // Group by User
        const tasksByUser: Record<string, Task[]> = {};
        activeTasks.forEach(task => {
            const userId = task.userId || 'unassigned';
            tasksByUser[userId] = tasksByUser[userId] || [];
            tasksByUser[userId].push(task);
        });

        const SCALE_HOURS_PER_POINT = 3; // 24 hours / 8 points. 1 point = 3 hours on the timeline.

        resources.forEach(user => {
            const userId = user.id;
            const userTasks = tasksByUser[userId] || [];
            const preferredDaysMap = normalizePreferredDays(user.preferredWorkingDays);

            // Helper to check working capacity for a day (0 to 1)
            const getDayCapacity = (date: moment.Moment) => preferredDaysMap[date.day()] || 0;

            // Sort
            const sorted = userTasks.sort((a, b) => {
                const priorityA = a.priority ?? 999;
                const priorityB = b.priority ?? 999;
                if (priorityA !== priorityB) return priorityA - priorityB;
                return a.createdAt - b.createdAt;
            });

            // Stack
            // Start stacking from Today 00:00 (Start of day) to align with grid
            let stackPointer = moment().startOf('day');

            // Find first working moment
            while (getDayCapacity(stackPointer) === 0) {
                stackPointer.add(1, 'days');
                stackPointer.startOf('day');
            }

            const blocks: ScheduledBlock[] = [];

            sorted.forEach(task => {
                const totalDifficulty = calculateTotalDifficulty(task, tasks);
                if (totalDifficulty === 0) return;

                // "Standard Hours" required to complete the task (assuming 1.0 capacity)
                let remainingStandardHours = totalDifficulty * SCALE_HOURS_PER_POINT;

                const start = stackPointer.clone();
                const currentPointer = start.clone();

                while (remainingStandardHours > 0) {
                    const capacity = getDayCapacity(currentPointer);

                    if (capacity === 0) {
                        // Skip non-working day
                        currentPointer.add(1, 'days').startOf('day'); // Move to next day 00:00
                        continue;
                    }

                    // Calculate remaining time in this 24h window (linear time)
                    // We assume work happens 24h/day in this visualization context (8pts = 24h)
                    // The "End of Day" is actually the start of next day for calculation purposes
                    const startOfNextDay = currentPointer.clone().add(1, 'days').startOf('day');
                    const timeUntilNextDayHours = moment.duration(startOfNextDay.diff(currentPointer)).asHours();

                    // How much *Standard Work* can we do in this remaining time?
                    // StandardWork = TimePassed * Capacity
                    const potentialStandardWork = timeUntilNextDayHours * capacity;

                    if (potentialStandardWork >= remainingStandardHours) {
                        // We can finish the task today (or in this segment)
                        // TimePassed = StandardWork / Capacity
                        const timeNeeded = remainingStandardHours / capacity;
                        currentPointer.add(timeNeeded, 'hours');
                        remainingStandardHours = 0;
                    } else {
                        // CONSUME ALL of this day's capacity and move to next
                        remainingStandardHours -= potentialStandardWork;
                        currentPointer.add(1, 'days').startOf('day'); // Jump to next day start
                    }
                }

                const end = currentPointer.clone();

                blocks.push({
                    task,
                    start: start.toDate(),
                    end: end.toDate(),
                    totalDifficulty
                });

                stackPointer = end; // Next task starts here
            });

            data[userId] = blocks;
        });

        // Handle Unassigned?
        if (tasksByUser['unassigned']) {
            // ... unassigned logic (default M-F)
            const sorted = tasksByUser['unassigned'].sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999));
            let stack = moment().startOf('day');
            const blocks: ScheduledBlock[] = [];
            sorted.forEach(task => {
                const td = calculateTotalDifficulty(task, tasks);
                if (td === 0) return;
                const hours = td * SCALE_HOURS_PER_POINT;
                const start = stack.clone();
                const end = start.clone().add(hours, 'hours'); // simplified
                blocks.push({ task, start: start.toDate(), end: end.toDate(), totalDifficulty: td });
                stack = end;
            });
            data['unassigned'] = blocks;
        }

        return data;
    }, [activeTasks, tasks, resources]);

    // 4. Render Helpers
    // 4. Render Helpers
    const [dayWidth, setDayWidth] = useState(120);

    const getDateX = (date: Date) => {
        const diffDays = moment(date).diff(viewStartDate, 'days', true);
        return diffDays * dayWidth;
    };

    const handleNextWeek = () => setViewStartDate(p => moment(p).add(7, 'days'));
    const handlePrevWeek = () => setViewStartDate(p => moment(p).subtract(7, 'days'));
    const handleToday = () => setViewStartDate(moment().startOf('day'));

    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleWheel = (e: WheelEvent) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                e.stopPropagation();
                const delta = e.deltaY * -0.2; // Scaling factor
                setDayWidth(prev => {
                    // Prevent zooming if already at limits to avoid layout thrashing
                    // but calculating it here is fine
                    const newWidth = Math.max(50, Math.min(500, prev + delta));
                    return newWidth;
                });
            }
        };

        // Passive: false is crucial to allow preventDefault
        container.addEventListener('wheel', handleWheel, { passive: false });

        return () => {
            container.removeEventListener('wheel', handleWheel);
        };
    }, []);

    const calendarDays = useMemo(() => {
        const days = [];
        for (let i = 0; i < 60; i++) {
            days.push(viewStartDate.clone().add(i, 'days'));
        }
        return days;
    }, [viewStartDate]);

    return (
        <Card className="h-full flex flex-col border-none shadow-none">
            <CardHeader className="py-2 px-4 border-b flex flex-row items-center justify-between shrink-0 h-[60px]">
                <CardTitle className="text-lg">Resources Workload</CardTitle>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={handlePrevWeek}><ChevronLeft className="h-4 w-4" /></Button>
                    <Button variant="outline" size="sm" onClick={handleToday}>Today</Button>
                    <Button variant="outline" size="sm" onClick={handleNextWeek}><ChevronRight className="h-4 w-4" /></Button>
                </div>
            </CardHeader>
            <CardContent
                ref={containerRef}
                className="flex-1 p-0 overflow-hidden relative flex flex-col"
            >
                <div className="flex flex-1 overflow-hidden">
                    {/* Left Sidebar: Users */}
                    <div
                        className="shrink-0 border-r bg-background z-20 shadow-sm"
                        style={{ width: SIDEBAR_WIDTH }}
                    >
                        <div
                            className="border-b bg-muted/30 flex items-center px-4 font-medium text-sm text-muted-foreground"
                            style={{ height: HEADER_HEIGHT }}
                        >
                            Team Members
                        </div>

                        <ScrollArea className="h-[calc(100%-40px)]">
                            {resources.map((user) => (
                                <div
                                    key={user.id}
                                    className="flex items-center gap-3 px-4 border-b hover:bg-muted/50 transition-colors"
                                    style={{ height: ROW_HEIGHT }}
                                >
                                    <Avatar className="h-8 w-8">
                                        <AvatarImage src={user.avatar} />
                                        <AvatarFallback>{user.initials}</AvatarFallback>
                                    </Avatar>
                                    <div className="min-w-0 flex-1">
                                        <div className="text-sm font-medium truncate">{user.name}</div>
                                        <div className="flex flex-col gap-1 mt-1">
                                            <div className="text-xs text-muted-foreground">
                                                {scheduledData[user.id]?.length || 0} tasks assigned
                                            </div>
                                            <DaySelector
                                                value={user.preferredWorkingDays}
                                                onChange={(val) => updateUser(user.id, { preferredWorkingDays: val })}
                                                className="scale-75 origin-left"
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {scheduledData['unassigned']?.length > 0 && (
                                <div
                                    className="flex items-center gap-3 px-4 border-b bg-muted/10"
                                    style={{ height: ROW_HEIGHT }}
                                >
                                    <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-500">
                                        <UserIcon className="h-4 w-4" />
                                    </div>
                                    <div className="text-sm font-medium text-muted-foreground">Unassigned</div>
                                </div>
                            )}
                        </ScrollArea>
                    </div>

                    {/* Right: Timeline */}
                    <ScrollArea className="flex-1" orientation="horizontal">
                        <div className="relative min-h-full">
                            <div
                                className="flex sticky top-0 z-10 bg-background border-b"
                                style={{ height: HEADER_HEIGHT, width: calendarDays.length * dayWidth }}
                            >
                                {calendarDays.map((day, i) => {
                                    const isToday = day.isSame(moment(), 'day');
                                    const isWeekend = day.day() === 0 || day.day() === 6;
                                    return (
                                        <div
                                            key={i}
                                            className={cn(
                                                "shrink-0 border-r px-2 flex flex-col justify-center text-xs",
                                                isToday && "bg-blue-50/50",
                                                isWeekend && "bg-slate-50/50"
                                            )}
                                            style={{ width: dayWidth }}
                                        >
                                            <div className={cn("font-medium", isToday && "text-blue-600")}>
                                                {day.format('ddd D MMM')}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="relative">
                                <div className="absolute inset-0 flex pointer-events-none">
                                    {calendarDays.map((_, i) => (
                                        <div
                                            key={i}
                                            className="border-r h-full"
                                            style={{ width: dayWidth }}
                                        />
                                    ))}
                                </div>

                                {resources.map((user) => (
                                    <div
                                        key={user.id}
                                        className="relative border-b hover:bg-muted/10"
                                        style={{ height: ROW_HEIGHT, width: calendarDays.length * dayWidth }}
                                    >
                                        {scheduledData[user.id]?.map((block, idx) => {
                                            const left = getDateX(block.start);
                                            const width = getDateX(block.end) - left;
                                            if (left + width < 0) return null;

                                            return (
                                                <TooltipProvider key={block.task.id}>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <div
                                                                className={cn(
                                                                    "absolute top-2 bottom-2 rounded-md shadow-sm border px-2 flex flex-col justify-center cursor-pointer hover:brightness-95 transition-all text-[10px]",
                                                                    block.task.urgent ? "bg-red-100 border-red-200 text-red-900" :
                                                                        block.task.impact ? "bg-amber-100 border-amber-200 text-amber-900" :
                                                                            "bg-blue-100 border-blue-200 text-blue-900"
                                                                )}
                                                                style={{
                                                                    left: Math.max(0, left),
                                                                    width: Math.max(5, width),
                                                                    zIndex: 1
                                                                }}
                                                                onClick={() => onEditTask ? onEditTask(block.task) : onFocusOnTask(block.task.id)}
                                                            >
                                                                <div className="font-semibold truncate">{block.task.title}</div>
                                                                <div className="opacity-75">{block.totalDifficulty} pts</div>
                                                            </div>
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            <div className="text-xs">
                                                                <div className="font-bold">{block.task.title}</div>
                                                                <div>Duration: {block.totalDifficulty} pts</div>
                                                                <div>Start: {moment(block.start).format('MMM D')}</div>
                                                                <div>End: {moment(block.end).format('MMM D')}</div>
                                                            </div>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            );
                                        })}
                                    </div>
                                ))}

                                {scheduledData['unassigned']?.length > 0 && (
                                    <div
                                        className="relative border-b bg-muted/5"
                                        style={{ height: ROW_HEIGHT, width: calendarDays.length * dayWidth }}
                                    >
                                    </div>
                                )}
                            </div>
                        </div>
                    </ScrollArea>
                </div>
            </CardContent>
        </Card>
    );
};

export default ResourcesScheduler;
