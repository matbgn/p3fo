import React from "react";
import { TriageStatus } from "@/hooks/useTasks";

interface StatusTagProps {
  status: TriageStatus;
  compact?: boolean;
}

const statusColors: Record<TriageStatus, string> = {
  Backlog: "bg-violet-500",
  Ready: "bg-blue-500",
  WIP: "bg-yellow-500",
  Blocked: "bg-red-500",
  Done: "bg-green-500",
  Dropped: "bg-purple-500",
  Archived: "bg-gray-600",
};

const statusLabels: Record<TriageStatus, string> = {
  Backlog: "Backlog",
  Ready: "Ready",
  WIP: "In Progress",
  Blocked: "Blocked",
  Done: "Done",
  Dropped: "Dropped",
  Archived: "Archived",
};

export const StatusTag: React.FC<StatusTagProps> = ({ status, compact = false }) => {
  const sizeClasses = compact
    ? "px-1.5 py-0.5 text-[10px]"
    : "px-2.5 py-0.5 text-xs";
  return (
    <span className={`inline-flex items-center shrink-0 rounded-full font-medium text-white ${sizeClasses} ${statusColors[status]}`}>
      {statusLabels[status]}
    </span>
  );
};