import React from "react";
import { useTranslation } from "react-i18next";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type TriageStatus = "Backlog" | "Ready" | "WIP" | "Blocked" | "Done" | "Dropped" | "Archived";

const STATUSES: TriageStatus[] = ["Backlog", "Ready", "WIP", "Blocked", "Done", "Dropped", "Archived"];

const STATUS_TRANSLATION_KEY: Record<TriageStatus, string> = {
  Backlog: "status.backlog",
  Ready: "status.ready",
  WIP: "status.wip",
  Blocked: "status.blocked",
  Done: "status.done",
  Dropped: "status.dropped",
  Archived: "status.archived",
};

export const TaskStatusSelect: React.FC<{
  value: TriageStatus;
  onChange: (v: TriageStatus) => void;
  className?: string;
  onOpenChange?: (open: boolean) => void;
}> = ({ value, onChange, className, onOpenChange }) => {
  const { t } = useTranslation();
  return (
    <Select value={value} onValueChange={(v) => onChange(v as TriageStatus)} onOpenChange={onOpenChange}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={t('filters.statusPlaceholder')} />
      </SelectTrigger>
      <SelectContent>
        {STATUSES.map((s) => (
          <SelectItem key={s} value={s}>
            {t(STATUS_TRANSLATION_KEY[s])}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};