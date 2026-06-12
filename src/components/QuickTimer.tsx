import React from "react";
import { Button } from "@/components/ui/button";
import { Pause, ArrowRight, Play, SkipForward, Apple, RotateCcw, PictureInPicture2 } from "lucide-react";
import { useTasks } from "@/hooks/useTasks";
import { useAllTasks } from "@/hooks/useAllTasks";
import { useUserSettings } from "@/hooks/useUserSettings";
import { usePomodoro } from "@/hooks/usePomodoro";
import { useDocumentPiP } from "@/hooks/useDocumentPiP";
import { PomodoroPhase } from "@/lib/pomodoro-types";
import { eventBus } from "@/lib/events";

const phaseDotColor: Record<PomodoroPhase, string> = {
  idle: 'bg-muted-foreground/30',
  work: 'bg-red-500',
  'short-break': 'bg-green-500',
  'long-break': 'bg-blue-500',
};

const phaseLabel: Record<PomodoroPhase, string> = {
  idle: '',
  work: 'Focus',
  'short-break': 'Break',
  'long-break': 'Long Break',
};

const formatPomodoroTime = (ms: number): string => {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

export const QuickTimer: React.FC<{
  onJumpToTask?: (taskId: string) => void;
}> = ({ onJumpToTask }) => {
  const { tasks } = useAllTasks();
  const { userId: currentUserId } = useUserSettings();
  const { toggleTimer } = useTasks();
  const pomodoro = usePomodoro();
  const { isSupported: pipSupported, isPiPActive, openPiP, closePiP } = useDocumentPiP();

  const { runningTask, lastStoppedTask } = React.useMemo(() => {
    let running = null;
    let lastStopped = null;
    let lastStoppedTime = 0;
    
    for (const task of tasks) {
      if (task.userId && task.userId !== currentUserId) {
        continue;
      }
      if (task.timer && task.timer.length > 0) {
        const lastEntry = task.timer[task.timer.length - 1];
        if (lastEntry) {
          if (lastEntry.endTime === 0) {
            running = { task, entry: lastEntry };
          } else if (lastEntry.endTime > lastStoppedTime) {
            lastStopped = { task, entry: lastEntry };
            lastStoppedTime = lastEntry.endTime;
          }
        }
      }
    }
    return { runningTask: running, lastStoppedTask: lastStopped };
  }, [tasks, currentUserId]);
  
  const [elapsedTime, setElapsedTime] = React.useState(0);
  
  React.useEffect(() => {
    if (!runningTask) {
      setElapsedTime(0);
      return;
    }
    
    if (runningTask.entry.endTime > 0) {
      setElapsedTime(runningTask.entry.endTime - runningTask.entry.startTime);
      return;
    }
    
    const interval = setInterval(() => {
      setElapsedTime(Date.now() - runningTask.entry.startTime);
    }, 1000);
    
    return () => clearInterval(interval);
  }, [runningTask]);
  
  React.useEffect(() => {
    const onTimerToggled = () => {
      setElapsedTime(prev => prev + 1);
    };
    
    eventBus.subscribe("timerToggled", onTimerToggled);
    return () => {
      eventBus.unsubscribe("timerToggled", onTimerToggled);
    };
  }, []);

  const formatTime = (milliseconds: number) => {
    const seconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const pomodoroActive = pomodoro.pomodoroEnabled && pomodoro.state.phase !== 'idle';
  const showOverlay = pomodoro.focusConfig.showFocusOverlay;
  const handleQuickPiP = React.useCallback(async () => {
    if (isPiPActive) {
      closePiP();
    } else {
      await openPiP(pomodoro.focusConfig.pipWidth, pomodoro.focusConfig.pipHeight);
    }
  }, [isPiPActive, openPiP, closePiP, pomodoro.focusConfig.pipWidth, pomodoro.focusConfig.pipHeight]);

  return (
    <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 bg-secondary rounded-md min-h-[32px] sm:min-h-[36px]">
      {pomodoroActive || (pomodoro.pomodoroEnabled && pomodoro.displayCycleIndex >= 0) ? (
        <>
          <div className={`w-2 h-2 rounded-full shrink-0 ${phaseDotColor[pomodoro.state.phase]}`} title={phaseLabel[pomodoro.state.phase]} />
          {pomodoro.state.phase !== 'idle' ? (
            <div className="text-xs sm:text-sm font-mono shrink-0 font-semibold">
              {formatPomodoroTime(pomodoro.remaining)}
            </div>
          ) : (
            <div className="text-xs sm:text-sm font-mono shrink-0 text-muted-foreground font-semibold">
              {pomodoro.config.workDuration > 0
                ? formatPomodoroTime(pomodoro.config.workDuration)
                : '--:--'}
            </div>
          )}
          <div className="flex items-center gap-0.5">
            {Array.from({ length: pomodoro.config.cyclesBeforeLongBreak }, (_, i) => {
              // Mirror the PiP dot rendering: long-break turns all 4 dots
              // blue; otherwise show red for current work, green for the
              // just-finished session (in break or persisted after idle),
              // grey for upcoming.
              const idx = pomodoro.displayCycleIndex;
              if (pomodoro.state.phase === 'long-break') {
                return (
                  <div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full transition-colors bg-blue-500"
                  />
                );
              }
              const isFinished = idx >= 0 && i < idx;
              const isCurrent = idx >= 0 && i === idx;
              const isCurrentWork = isCurrent && pomodoro.state.phase === 'work';
              const dotColor = isFinished
                ? 'bg-green-500'
                : isCurrentWork
                  ? 'bg-red-500'
                  : isCurrent
                    ? 'bg-green-500'
                    : 'bg-muted-foreground/30';
              return (
                <div
                  key={i}
                  className={`w-1.5 h-1.5 rounded-full transition-colors ${dotColor}`}
                />
              );
            })}
          </div>
          {pomodoro.isRunning && !pomodoro.isPaused ? (
            <Button size="sm" variant="outline" onClick={pomodoro.pause} className="h-7 w-7 sm:h-8 sm:w-8 p-0">
              <Pause className="h-3 w-3 sm:h-4 sm:w-4" />
            </Button>
          ) : pomodoro.isPaused ? (
            <Button size="sm" variant="outline" onClick={pomodoro.resume} className="h-7 w-7 sm:h-8 sm:w-8 p-0">
              <Play className="h-3 w-3 sm:h-4 sm:w-4" />
            </Button>
          ) : null}
          {pomodoro.state.phase !== 'idle' && (
            <Button size="sm" variant="outline" onClick={() => { pomodoro.skip(); }} className="h-7 w-7 sm:h-8 sm:w-8 p-0" title="Skip phase">
              <SkipForward className="h-3 w-3 sm:h-4 sm:w-4" />
            </Button>
          )}
          {(pomodoro.state.phase !== 'idle' || pomodoro.displayCycleIndex >= 0) && (
            <Button size="sm" variant="outline" onClick={() => { pomodoro.reset(); }} className="h-7 w-7 sm:h-8 sm:w-8 p-0" title="Reset cycle">
              <RotateCcw className="h-3 w-3 sm:h-4 sm:w-4" />
            </Button>
          )}
          {pomodoro.state.phase === 'idle' && pomodoro.displayCycleIndex >= 0 && (
            <Button size="sm" variant="outline" onClick={() => { pomodoro.startWork(); }} className="h-7 w-7 sm:h-8 sm:w-8 p-0" title="Start work">
              <Play className="h-3 w-3 sm:h-4 sm:w-4" />
            </Button>
          )}
          {pipSupported && !showOverlay && (
            <Button size="sm" variant="outline" onClick={handleQuickPiP} className="h-7 w-7 sm:h-8 sm:w-8 p-0" title={isPiPActive ? 'Close PiP' : 'Open in PiP'}>
              <PictureInPicture2 className="h-3 w-3 sm:h-4 sm:w-4" />
            </Button>
          )}
          {runningTask && (
            <>
              <div className="w-px h-4 bg-border" />
              <div className="text-xs sm:text-sm font-medium truncate max-w-[60px] sm:max-w-[100px]">
                {runningTask.task.title}
              </div>
              <div className="text-xs sm:text-sm font-mono shrink-0 text-muted-foreground">
                {formatTime(elapsedTime)}
              </div>
              <Button size="sm" variant="outline" onClick={() => toggleTimer(runningTask.task.id, currentUserId)} className="h-7 w-7 sm:h-8 sm:w-8 p-0">
                <Pause className="h-3 w-3 sm:h-4 sm:w-4" />
              </Button>
            </>
          )}
        </>
      ) : runningTask ? (
        <>
          <div className="text-xs sm:text-sm font-medium truncate max-w-[80px] sm:max-w-[120px] md:max-w-[150px]">
            {runningTask.task.title}
          </div>
          <div className="text-xs sm:text-sm font-mono shrink-0">
            {formatTime(elapsedTime)}
          </div>
          {pomodoro.pomodoroEnabled && (
            <Button size="sm" variant="ghost" onClick={() => pomodoro.startWork(runningTask.task.id)} className="h-7 w-7 sm:h-8 sm:w-8 p-0 text-muted-foreground/60 hover:text-red-500" title="Start Pomodoro">
              <Apple className="h-3 w-3 sm:h-4 sm:w-4" />
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => toggleTimer(runningTask.task.id, currentUserId)} className="h-7 w-7 sm:h-8 sm:w-8 p-0">
            <Pause className="h-3 w-3 sm:h-4 sm:w-4" />
          </Button>
          {onJumpToTask && (
            <Button size="sm" variant="outline" onClick={() => onJumpToTask(runningTask.task.id)} className="h-7 w-7 sm:h-8 sm:w-8 p-0">
              <ArrowRight className="h-3 w-3 sm:h-4 sm:w-4" />
            </Button>
          )}
        </>
      ) : lastStoppedTask ? (
        <>
          <button
            onClick={() => onJumpToTask && onJumpToTask(lastStoppedTask.task.id)}
            className="text-xs sm:text-sm text-muted-foreground/60 hover:text-muted-foreground truncate max-w-[80px] sm:max-w-[120px] md:max-w-[150px] cursor-pointer hover:underline transition-colors"
            title={lastStoppedTask.task.title}
          >
            {lastStoppedTask.task.title}
          </button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => toggleTimer(lastStoppedTask.task.id, currentUserId)}
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
