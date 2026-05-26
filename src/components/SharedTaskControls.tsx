import React from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Task } from "@/hooks/useTasks";
import { eventBus } from "@/lib/events";
import { formatDuration } from "@/lib/format-utils";

export const LiveTimeBadge: React.FC<{ task: Task; totalTime?: number; onClick?: () => void }> = React.memo(({ task, totalTime, onClick }) => {
  const [runningTime, setRunningTime] = React.useState(0);

  const totalCompletedTime = React.useMemo(() => {
    return (task.timer || []).reduce((acc, entry) => {
      if (entry.endTime && entry.endTime > 0) {
        return acc + (entry.endTime - entry.startTime);
      }
      return acc;
    }, 0);
  }, [task.timer]);

  React.useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    const updateTimer = () => {
      const runningTimer = (task.timer || []).find((e) => e.endTime === 0);
      if (runningTimer && runningTimer.startTime) {
        const elapsed = Date.now() - runningTimer.startTime!;
        setRunningTime(elapsed);
      } else {
        setRunningTime(0);
      }
    };

    updateTimer();
    interval = setInterval(updateTimer, 1000);

    const onTimerToggled = () => {
      updateTimer();
    };
    eventBus.subscribe("timerToggled", onTimerToggled);

    return () => {
      if (interval) {
        clearInterval(interval);
      }
      eventBus.unsubscribe("timerToggled", onTimerToggled);
    };
  }, [task.id, task.timer]);

  const displayTime = totalTime !== undefined ? totalTime : totalCompletedTime + runningTime;

  return (
    <Badge variant="outline" className="text-xs cursor-pointer" onClick={onClick}>
      {formatDuration(displayTime)}
    </Badge>
  );
});

export const EditableTitle: React.FC<{
  title: string;
  done?: boolean;
  onUpdateTitle: (title: string) => void;
}> = React.memo(({ title, done, onUpdateTitle }) => {
  const [isEditing, setIsEditing] = React.useState(false);
  const [editValue, setEditValue] = React.useState(title);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditValue(title);
    setIsEditing(true);
  };

  const handleBlur = () => {
    setIsEditing(false);
    if (editValue.trim() !== title) {
      onUpdateTitle(editValue);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      setIsEditing(false);
      if (editValue.trim() !== title) {
        onUpdateTitle(editValue);
      }
    } else if (e.key === "Escape") {
      setEditValue(title);
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <Input
        ref={inputRef}
        type="text"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className="h-6 px-1 py-0 text-sm"
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  return (
    <span
      className={`text-md flex-1 ${done ? "line-through text-muted-foreground" : ""} cursor-pointer select-none`}
      onDoubleClick={handleDoubleClick}
    >
      <b>
        {title}
      </b>
    </span>
  );
});

// eslint-disable-next-line react-refresh/only-export-components
export const DIFFICULTY_OPTIONS: Array<0.5 | 1 | 2 | 3 | 5 | 8> = [0.5, 1, 2, 3, 5, 8];

// eslint-disable-next-line react-refresh/only-export-components
export const getDifficultyColor = (difficulty: number) => {
  const colors: Record<number, string> = {
    0.5: "bg-green-500",
    1: "bg-green-400",
    2: "bg-yellow-400",
    3: "bg-yellow-500",
    5: "bg-orange-500",
    8: "bg-red-500",
  };
  return colors[difficulty] || "bg-gray-500";
};

export const DifficultyBadge: React.FC<{ difficulty: number }> = ({ difficulty }) => {
  const getFibonacciDifficulty = (value: number) => {
    const fib: number[] = [0.5, 1, 2, 3, 5, 8];
    if (value > 8) return { value: 8, plus: true };
    return { value: fib.find((f) => f >= value) || 8, plus: false };
  };

  const { value, plus } = getFibonacciDifficulty(difficulty);
  const color = getDifficultyColor(value);

  return (
    <div className="flex items-center h-6 w-16 p-0">
      <div className={`w-3 h-3 rounded-full ${plus ? 'bg-red-200' : color} mr-2`} />
      <span>{value}{plus && '+'}</span>
    </div>
  );
};
