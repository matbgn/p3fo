import React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type TriageStatus = "Backlog" | "Ready" | "WIP" | "Blocked" | "Done" | "Dropped" | "Archived";

const STATUSES: TriageStatus[] = ["Backlog", "Ready", "WIP", "Blocked", "Done", "Dropped", "Archived"];

export const TaskStatusSelect: React.FC<{
  value: TriageStatus;
  onChange: (v: TriageStatus) => void;
  className?: string;
}> = ({ value, onChange, className }) => {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as TriageStatus)}>
      <SelectTrigger className={className}>
        <SelectValue placeholder="Status" />
      </SelectTrigger>
      <SelectContent>
        {STATUSES.map((s) => (
          <SelectItem key={s} value={s}>
            {s}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};