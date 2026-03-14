import React from "react";
import { Button } from "@/components/ui/button";
import { Pause, ArrowRight, Play } from "lucide-react";
import { useTasks } from "@/hooks/useTasks";
import { useAllTasks } from "@/hooks/useAllTasks";
import { useUserSettings } from "@/hooks/useUserSettings";
import { eventBus } from "@/lib/events";

export const QuickTimer: React.FC<{
  onJumpToTask?: (taskId: string) => void;
}> = ({ onJumpToTask }) => {
  // Use useAllTasks to get ALL tasks regardless of any view's filter
  // This ensures the timer always shows the current user's running task
  // even when a different user is selected in a filter dropdown
  const { tasks } = useAllTasks();
  const { userId: currentUserId } = useUserSettings();
  const { toggleTimer } = useTasks();
  
  // Find the currently running task AND the most recently stopped task for the current user
  const { runningTask, lastStoppedTask } = React.useMemo(() => {
    let running = null;
    let lastStopped = null;
    let lastStoppedTime = 0;
    
    for (const task of tasks) {
      // Only consider tasks assigned to the current user
      if (task.userId && task.userId !== currentUserId) {
        continue;
      }
      if (task.timer && task.timer.length > 0) {
        const lastEntry = task.timer[task.timer.length - 1];
        if (lastEntry) {
          if (lastEntry.endTime === 0) {
            // Running task
            running = { task, entry: lastEntry };
          } else if (lastEntry.endTime > lastStoppedTime) {
            // Most recently stopped task
            lastStopped = { task, entry: lastEntry };
            lastStoppedTime = lastEntry.endTime;
          }
        }
      }
    }
    return { runningTask: running, lastStoppedTask: lastStopped };
  }, [tasks, currentUserId]);
  
  // State for elapsed time to update in real-time
  const [elapsedTime, setElapsedTime] = React.useState(0);
  
  // Update elapsed time every second when a task is running
  React.useEffect(() => {
    if (!runningTask) {
      setElapsedTime(0);
      return;
    }
    
    // If the timer is already stopped, use the fixed end time
    if (runningTask.entry.endTime > 0) {
      setElapsedTime(runningTask.entry.endTime - runningTask.entry.startTime);
      return;
    }
    
    const interval = setInterval(() => {
      setElapsedTime(Date.now() - runningTask.entry.startTime);
    }, 1000);
    
    return () => clearInterval(interval);
  }, [runningTask]);
  
  // Subscribe to timer updates
  React.useEffect(() => {
    const onTimerToggled = () => {
      // Force re-render when timer is toggled
      setElapsedTime(prev => prev + 1); // This will trigger a re-render
    };
    
    eventBus.subscribe("timerToggled", onTimerToggled);
    return () => {
      eventBus.unsubscribe("timerToggled", onTimerToggled);
    };
  }, []);
  
  // Always render the component, even when no task is running
  // This is intentional - we want to show "No active timer" when no task is running
  
  const handleToggleTimer = () => {
    toggleTimer(runningTask.task.id);
  };
  
  const handleJumpToTask = () => {
    if (onJumpToTask) {
      onJumpToTask(runningTask.task.id);
    }
  };
  
  const handleResumeLastTask = () => {
    if (lastStoppedTask) {
      toggleTimer(lastStoppedTask.task.id);
    }
  };
  
  const handleJumpToLastTask = () => {
    if (lastStoppedTask && onJumpToTask) {
      onJumpToTask(lastStoppedTask.task.id);
    }
  };
  
  const formatTime = (milliseconds: number) => {
    const seconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };
  
  return (
    <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 bg-secondary rounded-md min-h-[32px] sm:min-h-[36px]">
      {runningTask ? (
        <>
          <div className="text-xs sm:text-sm font-medium truncate max-w-[80px] sm:max-w-[120px] md:max-w-[150px]">
            {runningTask.task.title}
          </div>
          <div className="text-xs sm:text-sm font-mono shrink-0">
            {formatTime(elapsedTime)}
          </div>
          <Button size="sm" variant="outline" onClick={handleToggleTimer} className="h-7 w-7 sm:h-8 sm:w-8 p-0">
            <Pause className="h-3 w-3 sm:h-4 sm:w-4" />
          </Button>
          {onJumpToTask && (
            <Button size="sm" variant="outline" onClick={handleJumpToTask} className="h-7 w-7 sm:h-8 sm:w-8 p-0">
              <ArrowRight className="h-3 w-3 sm:h-4 sm:w-4" />
            </Button>
          )}
        </>
      ) : lastStoppedTask ? (
        <>
          <button
            onClick={handleJumpToLastTask}
            className="text-xs sm:text-sm text-muted-foreground/60 hover:text-muted-foreground truncate max-w-[80px] sm:max-w-[120px] md:max-w-[150px] cursor-pointer hover:underline transition-colors"
            title={lastStoppedTask.task.title}
          >
            {lastStoppedTask.task.title}
          </button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleResumeLastTask}
            className="h-7 w-7 sm:h-8 sm:w-8 p-0 text-muted-foreground/60 hover:text-foreground"
            title="Resume timer"
          >
            <Play className="h-3 w-3 sm:h-4 sm:w-4" />
          </Button>
        </>
      ) : (
        <div className="text-xs sm:text-sm text-muted-foreground italic flex items-center h-full">
          No active timer
        </div>
      )}
    </div>
  );
};
