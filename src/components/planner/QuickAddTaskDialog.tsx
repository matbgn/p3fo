import React from 'react';
import { useTranslation } from 'react-i18next';
import { ClockIcon } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { toDateKey } from '@/lib/planner/dates';
import { resolveTaskColorStyle, type TaskColor } from '@/lib/planner/colors';
import { completeTag, parseTaskInput, suggestLabels } from '@/lib/planner/task-input';
import type { Recurrence } from '@/lib/recurrence/types';
import { normalizeRecurrence } from '@/lib/recurrence/engine';
import { useWorkspaceTaxonomy } from '@/hooks/useWorkspaceTaxonomy';
import { useUsersContext } from '@/context/UsersContext';
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
  category: string | null;
  /** A user mentioned with `@trigram`, if any. */
  assigneeId: string | null;
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
  const { categories, colorLabels, labelForColor } = useWorkspaceTaxonomy();
  const { users } = useUsersContext();
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
  const [dismissedAt, setDismissedAt] = React.useState<number | null>(null);
  const [activeSuggestion, setActiveSuggestion] = React.useState(0);
  const titleRef = React.useRef<HTMLInputElement>(null);

  const taxonomy = React.useMemo(
    () => ({ categories, colorLabels, users }),
    [categories, colorLabels, users],
  );
  const parsed = React.useMemo(() => parseTaskInput(title, taxonomy), [title, taxonomy]);
  const suggestions = React.useMemo(
    () => (parsed.tag ? suggestLabels(parsed.tag.query, taxonomy) : []),
    [parsed.tag, taxonomy],
  );
  const suggestionsOpen =
    parsed.tag !== null &&
    suggestions.length > 0 &&
    dismissedAt !== parsed.tag.start;
  // A label recognized in the title drives the picker until the user changes it.
  React.useEffect(() => {
    if (parsed.color) setColor(parsed.color);
  }, [parsed.color]);
  // A time typed in the title drives the time field, so the previewed time is
  // the one persisted instead of being silently replaced by the slot default.
  React.useEffect(() => {
    if (parsed.time) setPlannedTime(parsed.time);
  }, [parsed.time]);

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
    setDismissedAt(null);
    setActiveSuggestion(0);
  }, [open, scheduledFor]);

  const submit = async () => {
    const nextTitle = parsed.text.trim();
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
        plannedTime: plannedTime || parsed.time || null,
        dueDate: dueDate || null,
        dueTime: dueTime || null,
        durationInMinutes: duration ? Number(duration) : null,
        color,
        category: parsed.category,
        assigneeId: parsed.assigneeId,
        recurrence: nextRecurrence,
      });
      onOpenChange(false);
    } finally {
      setIsCreating(false);
    }
  };

  const pickSuggestion = (index: number) => {
    const suggestion = suggestions[index];
    if (!suggestion || !parsed.tag) return;

    const completed = completeTag(title, parsed.tag, suggestion.name);
    setTitle(completed.value);
    setDismissedAt(null);
    setActiveSuggestion(0);
    titleRef.current?.focus();
  };

  const handleTitleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;

    if (suggestionsOpen) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setActiveSuggestion(
          (current) => (current + step + suggestions.length) % suggestions.length,
        );
        return;
      }

      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        pickSuggestion(Math.min(activeSuggestion, suggestions.length - 1));
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        setDismissedAt(parsed.tag?.start ?? null);
        return;
      }
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      void submit();
    }
  };

  // A directly typed category wins; otherwise show the label of the color.
  const labelName = parsed.category ?? labelForColor(parsed.color);
  const labelStyle = parsed.color ? resolveTaskColorStyle(parsed.color) : null;
  const assignee = parsed.assigneeId
    ? users.find((user) => user.userId === parsed.assigneeId) ?? null
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="sr-only">{t('program.newTask')}</DialogTitle>
          <DialogDescription className="sr-only">{t('program.taskTitlePlaceholder')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative">
            <Input
              ref={titleRef}
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                setDismissedAt(null);
                setActiveSuggestion(0);
              }}
              placeholder={t('program.taskTitlePlaceholder')}
              onKeyDown={handleTitleKeyDown}
              className="h-10 border-0 px-0 text-lg font-semibold shadow-none focus-visible:ring-0"
              autoFocus
              autoComplete="off"
              aria-autocomplete="list"
              aria-expanded={suggestionsOpen}
            />

            {(parsed.time || labelName || assignee) && (
              <div className="mt-1 flex flex-wrap gap-1">
                {parsed.time && (
                  <Badge variant="outline" className="h-6 gap-1.5 bg-background shadow-sm">
                    <ClockIcon className="h-3 w-3" />
                    {parsed.time}
                  </Badge>
                )}
                {labelName && (
                  <Badge variant="outline" className="h-6 gap-1.5 bg-background shadow-sm">
                    {labelStyle && (
                      <span
                        className={cn('h-2.5 w-2.5 rounded-full', labelStyle.swatchClass)}
                        style={labelStyle.swatchStyle}
                        aria-hidden
                      />
                    )}
                    {labelName}
                  </Badge>
                )}
                {assignee && (
                  <Badge
                    variant="outline"
                    className="h-6 gap-1.5 bg-background shadow-sm"
                    title={assignee.username}
                  >
                    @{assignee.trigram || assignee.username.slice(0, 3).toUpperCase()}
                  </Badge>
                )}
              </div>
            )}

            {suggestionsOpen && (
              <div
                className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
                role="listbox"
                aria-label={t('planner.labelSuggestions')}
                onMouseDown={(event) => event.preventDefault()}
              >
                {suggestions.map((suggestion, index) => {
                  const style = suggestion.color
                    ? resolveTaskColorStyle(suggestion.color)
                    : null;

                  return (
                    <button
                      key={suggestion.name}
                      type="button"
                      role="option"
                      aria-selected={index === activeSuggestion}
                      className={cn(
                        'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm',
                        index === activeSuggestion && 'bg-accent',
                      )}
                      onMouseEnter={() => setActiveSuggestion(index)}
                      onClick={() => pickSuggestion(index)}
                    >
                      {style ? (
                        <span
                          className={cn('h-2.5 w-2.5 shrink-0 rounded-full', style.swatchClass)}
                          style={style.swatchStyle}
                          aria-hidden
                        />
                      ) : (
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-dashed border-muted-foreground/60" aria-hidden />
                      )}
                      <span className="truncate">{suggestion.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

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
          <Button onClick={() => void submit()} disabled={!parsed.text.trim() || isCreating}>
            {t('program.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
