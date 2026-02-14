import React from "react";
import { AlertTriangle, CircleDot, Flame, Crosshair } from "lucide-react";

interface TaskTagProps {
  impact?: boolean;
  urgent?: boolean;
  majorIncident?: boolean;
  sprintTarget?: boolean;
  size?: "sm" | "md";
}

export const TaskTag: React.FC<TaskTagProps> = ({
  impact = false,
  urgent = false,
  majorIncident = false,
  sprintTarget = false,
  size = "md"
}) => {
  const sizeClasses = size === "sm" ? "h-3 w-3" : "h-4 w-4";
  const gapClass = size === "sm" ? "gap-0.5" : "gap-1";

  if (!impact && !urgent && !majorIncident && !sprintTarget) {
    return null;
  }

  return (
    <div className={`flex ${gapClass} items-center`}>
      {urgent && (
        <AlertTriangle className={`${sizeClasses} text-red-500`} />
      )}
      {impact && (
        <CircleDot className={`${sizeClasses} text-yellow-500`} />
      )}
      {majorIncident && (
        <Flame className={`${sizeClasses} text-red-700`} />
      )}
      {sprintTarget && (
        <Crosshair className={`${sizeClasses} text-violet-500`} />
      )}
    </div>
  );
};