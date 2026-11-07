import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toDateKey } from '@/lib/planner/dates';
import type { TaskColor } from '@/lib/planner/colors';
import type { Recurrence } from '@/lib/recurrence/types';
import { normalizeRecurrence } from '@/lib/recurrence/engine';
import { CardScheduleFields } from './CardScheduleFields';
import { RepeatPicker } from './RepeatPicker';
import { TaskColorPicker } from './TaskColorPicker';

export type QuickAddTaskInput = {
  title: string;
  plannedDate: string | null;
  plannedTime: string | null;
  dueDate: string | null;
  dueTime: string | null;
  durationInMinutes: number | null;
  color: TaskColor;
  recurrence: Recurrence | null;
};

type QuickAddTaskDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scheduledFor: Date | string | null;
  onCreate: (input: QuickAddTaskInput) => void | Promise<void>;
};

function initialPlannedDate(scheduledFor: Date | string | null): string {
  if (!scheduledFor) return '';
  return typeof scheduledFor === 'string' ? scheduledFor : toDateKey(scheduledFor);
}

function initialPlannedTime(scheduledFor: Date | string | null): string {
  if (!(scheduledFor instanceof Date)) return '';
  const hours = scheduledFor.getHours();
  const minutes = scheduledFor.getMinutes();
  if (hours === 0 && minutes === 0) return '';
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export const QuickAddTaskDialog: React.FC<QuickAddTaskDialogProps> = ({
  open,
  onOpenChange,
  scheduledFor,
  onCreate,
}) => {
  const { t } = useTranslation();
  const [title, setTitle] = React.useState('');
  const [plannedDate, setPlannedDate] = React.useState('');
  const [plannedTime, setPlannedTime] = React.useState('');
  const [dueDate, setDueDate] = React.useState('');
  const [dueTime, setDueTime] = React.useState('');
  const [duration, setDuration] = React.useState('');
  const [color, setColor] = React.useState<TaskColor>('none');
  const [recurrence, setRecurrence] = React.useState<Recurrence | null>(null);
  const [recurrenceError, setRecurrenceError] = React.useState<string | null>(null);
  const [isCreating, setIsCreating] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;

    setTitle('');
    setPlannedDate(initialPlannedDate(scheduledFor));
    setPlannedTime(initialPlannedTime(scheduledFor));
    setDueDate('');
    setDueTime('');
    setDuration('');
    setColor('none');
    setRecurrence(null);
    setRecurrenceError(null);
    setIsCreating(false);
  }, [open, scheduledFor]);

  const submit = async () => {
    const nextTitle = title.trim();
    if (!nextTitle || isCreating) return;

    // The repeat rule was normalized against the date that was selected when
    // "Apply repeat" was clicked. Validate it again against the final planned
    // date so a later date change cannot persist until < plannedDate (which
    // would hide the template and never expand the series).
    const effectivePlannedDate = plannedDate || initialPlannedDate(scheduledFor);
    let nextRecurrence = recurrence;
    if (nextRecurrence) {
      if (!effectivePlannedDate) {
        setRecurrenceError('Plan the card on a date before making it repeat.');
        return;
      }
      try {
        nextRecurrence = normalizeRecurrence(nextRecurrence, effectivePlannedDate);
      } catch (cause) {
        setRecurrenceError(cause instanceof Error ? cause.message : 'Invalid recurrence rule.');
        return;
      }
    }
    setRecurrenceError(null);

    setIsCreating(true);
    try {
      await onCreate({
        title: nextTitle,
        plannedDate: plannedDate || null,
        plannedTime: plannedTime || null,
        dueDate: dueDate || null,
        dueTime: dueTime || null,
        durationInMinutes: duration ? Number(duration) : null,
        color,
        recurrence: nextRecurrence,
      });
      onOpenChange(false);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="sr-only">{t('program.newTask')}</DialogTitle>
          <DialogDescription className="sr-only">{t('program.taskTitlePlaceholder')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t('program.taskTitlePlaceholder')}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void submit();
              }
            }}
            className="h-10 border-0 px-0 text-lg font-semibold shadow-none focus-visible:ring-0"
            autoFocus
          />

          <CardScheduleFields
            plannedDate={plannedDate}
            plannedTime={plannedTime}
            dueDate={dueDate}
            dueTime={dueTime}
            duration={duration}
            onPlannedDateChange={(value) => {
              setPlannedDate(value);
              setRecurrenceError(null);
            }}
            onPlannedTimeChange={setPlannedTime}
            onDueDateChange={setDueDate}
            onDueTimeChange={setDueTime}
            onDurationChange={setDuration}
          />

          {plannedDate ? (
            <RepeatPicker
              anchorDate={plannedDate}
              recurrence={recurrence}
              onApply={(rule) => {
                setRecurrence(rule);
                setRecurrenceError(null);
              }}
            />
          ) : (
            <p className="text-xs text-muted-foreground">
              Plan the card on a date before making it repeat.
            </p>
          )}

          <TaskColorPicker value={color} onChange={setColor} />

          {recurrenceError && <p className="text-xs text-destructive">{recurrenceError}</p>}
        </div>

        <DialogFooter className="mt-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void submit()} disabled={!title.trim() || isCreating}>
            {t('program.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
