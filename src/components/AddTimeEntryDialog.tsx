import React from "react";
import { useTranslation } from 'react-i18next';
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import type { Task } from "@/hooks/useTasks";

const normalizeSearch = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');

const filterTasks = (value: string, search: string) => {
  const normalizedValue = normalizeSearch(value);
  const terms = search.split(/\s+/).map(normalizeSearch).filter(Boolean);
  if (terms.length === 0) return 1;
  return terms.every((term) => normalizedValue.includes(term)) ? 1 : 0;
};

export const AddTimeEntryDialog: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tasks: Task[];
  entryTimeLabel?: string;
  onCreate: (taskId: string) => void;
}> = ({ open, onOpenChange, tasks, entryTimeLabel, onCreate }) => {
  const { t } = useTranslation();
  const [selectedTaskId, setSelectedTaskId] = React.useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setSelectedTaskId(null);
      setPickerOpen(false);
    }
  }, [open]);

  const selectedTask = tasks.find((task) => task.id === selectedTaskId);

  const handleAdd = () => {
    if (!selectedTaskId) return;
    onCreate(selectedTaskId);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md overflow-hidden">
        <DialogHeader>
          <DialogTitle>{t('timetable.addTimeEntryTitle')}</DialogTitle>
          <DialogDescription>{t('timetable.addTimeEntryDescription')}</DialogDescription>
        </DialogHeader>
        <div className="flex min-w-0 flex-col gap-2 py-2">
          <label className="text-sm font-medium">{t('timetable.task')}</label>
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={pickerOpen}
                className="w-full min-w-0 justify-between gap-2 font-normal"
              >
                <span className="min-w-0 flex-1 truncate text-left">
                  {selectedTask ? selectedTask.title : t('timetable.selectTaskPlaceholder')}
                </span>
                <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
              <Command filter={filterTasks}>
                <CommandInput placeholder={t('timetable.searchTaskPlaceholder')} />
                <CommandList>
                  <CommandEmpty>{t('timetable.noTasksFound')}</CommandEmpty>
                  {tasks.map((task) => (
                    <CommandItem
                      key={task.id}
                      value={`${task.title} ${task.id}`}
                      onSelect={() => {
                        setSelectedTaskId(task.id);
                        setPickerOpen(false);
                      }}
                    >
                      <Check className={cn("mr-2 h-4 w-4 shrink-0", selectedTaskId === task.id ? "opacity-100" : "opacity-0")} />
                      <span className="min-w-0 flex-1 truncate">{task.title}</span>
                    </CommandItem>
                  ))}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          {entryTimeLabel && (
            <p className="text-xs text-muted-foreground">{entryTimeLabel}</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button onClick={handleAdd} disabled={!selectedTaskId}>{t('common.add')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
