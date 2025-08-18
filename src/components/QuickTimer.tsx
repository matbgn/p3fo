import React from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, RotateCcw, ArrowRight } from "lucide-react";
import { useTasks } from "@/hooks/useTasks";
import { eventBus } from "@/lib/events";

export const QuickTimer: React.FC<{
  onJumpToTask?: (taskId: string) => void;
}> = ({ onJumpToTask }) => {
  const { tasks } = useTasks();
  
  // Find the currently running task
  const runningTask = React.useMemo(() => {
    for (const task of tasks) {
      if (task.timer && task.timer.length > 0) {
        const lastEntry = task.timer[task.timer.length - 1];
        if (lastEntry && lastEntry.endTime === 0) {
          return { task, entry: lastEntry };
        }
      }
    }
    return null;
  }, [tasks]);
  
  const { toggleTimer } = useTasks();
  
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
  
  const formatTime = (milliseconds: number) => {
    const seconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };
  
  return (
    <div className="flex items-center gap-2 p-2 bg-secondary rounded-md min-h-[40px]">
      {runningTask ? (
        <>
          <div className="text-sm font-medium truncate max-w-[150px]">
            {runningTask.task.title}
          </div>
          <div className="text-sm font-mono">
            {formatTime(elapsedTime)}
          </div>
          <Button size="sm" variant="outline" onClick={handleToggleTimer}>
            <Pause className="h-4 w-4" />
          </Button>
          {onJumpToTask && (
            <Button size="sm" variant="outline" onClick={handleJumpToTask}>
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </>
      ) : (
        <div className="text-sm text-muted-foreground italic flex items-center h-full">
          No active timer
        </div>
      )}
    </div>
  );
};