import React from "react";
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TimeSheet } from "./TimeSheet";

export const TimeSheetDialog: React.FC<{
  taskId: string;
  taskTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}> = ({ taskId, taskTitle, open, onOpenChange }) => {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col p-0" aria-describedby={undefined}>
        <DialogHeader className="p-6 pb-4">
          <DialogTitle>{t('task.timeSheetTitle', { title: taskTitle })}</DialogTitle>
          <DialogDescription className="sr-only">
            {t('task.timeSheetDescription', { title: taskTitle })}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-grow overflow-y-auto px-6 pb-6">
          <TimeSheet taskId={taskId} />
        </div>
      </DialogContent>
    </Dialog>
  );
};
