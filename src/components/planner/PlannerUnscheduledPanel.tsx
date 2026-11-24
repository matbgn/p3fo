import React from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StoryboardCard } from '@/components/StoryboardCard';
import { QuickAddTask } from '@/components/QuickAddTask';
import { FilterControls, type Filters } from '@/components/FilterControls';
import { getDefaultFilters, mergeViewFilters, taskMatchesFilters, validateFilters } from '@/lib/filter-merge';
import { loadFiltersFromSessionStorage, subscribeToFilterChanges } from '@/lib/filter-storage';
import { sortTasks } from '@/utils/taskSorting';
import { cn } from '@/lib/utils';
import { useTasks, type Task } from '@/hooks/useTasks';
import { useUserSettings } from '@/hooks/useUserSettings';

type PlannerUnscheduledPanelProps = {
  tasks: Task[];
  unscheduled: Task[];
  title?: string;
  filters?: Filters;
  onFiltersChange?: (filters: Filters) => void;
};

export const PlannerUnscheduledPanel: React.FC<PlannerUnscheduledPanelProps> = ({
  tasks,
  unscheduled,
  title,
  filters: controlledFilters,
  onFiltersChange,
}) => {
  const { t } = useTranslation();
  const { userId: currentUserId } = useUserSettings();
  const {
    updateStatus,
    updateDifficulty,
    updateCategory,
    updateTitle,
    updateUser,
    deleteTask,
    duplicateTaskStructure,
    toggleUrgent,
    toggleImpact,
    toggleMajorIncident,
    toggleSprintTarget,
    toggleDone,
    toggleTimer,
    reparent,
    updateTerminationDate,
    updateComment,
    updateDurationInMinutes,
  } = useTasks();

  const isControlled = controlledFilters !== undefined && onFiltersChange !== undefined;
  const [storedFilters, setStoredFilters] = React.useState<Filters>(() => getDefaultFilters());
  const [isFiltersCollapsed, setIsFiltersCollapsed] = React.useState(true);
  const [isCollapsed, setIsCollapsed] = React.useState(false);
  const [hoverCardHeight, setHoverCardHeight] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (isControlled) return;
    let cancelled = false;

    void loadFiltersFromSessionStorage().then((loaded) => {
      if (!cancelled && loaded) setStoredFilters(validateFilters(loaded));
    });

    const unsubscribe = subscribeToFilterChanges((next) => setStoredFilters(validateFilters(next)));

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [isControlled]);

  const activeFilters = isControlled ? controlledFilters : storedFilters;
  const setActiveFilters = isControlled ? onFiltersChange : setStoredFilters;

  const displayFilters = React.useMemo(
    () => mergeViewFilters(activeFilters, { defaultActiveStatuses: true }),
    [activeFilters],
  );

  const filteredTasks = React.useMemo(() => {
    return unscheduled
      .filter((task) => taskMatchesFilters(task, displayFilters, { searchComments: true }))
      .sort(sortTasks.plan);
  }, [displayFilters, unscheduled]);

  return (
    <section
      className="border-t border-border/60 bg-muted/20 px-3 py-2"
      aria-label={title ?? t('planner.unscheduled')}
    >
      <div className={cn('flex flex-wrap items-center gap-2', !isCollapsed && 'mb-2')}>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={() => setIsCollapsed((current) => !current)}
          aria-expanded={!isCollapsed}
          aria-label={t(isCollapsed ? 'planner.expandUnscheduled' : 'planner.collapseUnscheduled')}
          title={t(isCollapsed ? 'planner.expandUnscheduled' : 'planner.collapseUnscheduled')}
        >
          <ChevronDown
            className={cn('h-3.5 w-3.5 transition-transform duration-200', isCollapsed && '-rotate-180')}
          />
        </Button>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title ?? t('planner.unscheduled')}
        </h3>
        <Badge variant="secondary">{filteredTasks.length}</Badge>
        {!isCollapsed && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-6 gap-1 px-1.5 text-[10px]"
            onClick={() => setIsFiltersCollapsed((current) => !current)}
          >
            {isFiltersCollapsed ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
            {t('program.filtersAndControls')}
          </Button>
        )}
      </div>

      {!isCollapsed && (
        <>
          {filteredTasks.length === 0 ? (
            <p className="py-2 text-xs text-muted-foreground">{t('planner.unscheduledEmpty')}</p>
          ) : (
            <div
              className={cn(
                'flex flex-row gap-2 overflow-x-auto pb-2 transition-[height] duration-200',
                hoverCardHeight ? 'overflow-y-auto' : 'max-h-56 overflow-y-auto',
              )}
              style={hoverCardHeight ? { height: hoverCardHeight + 16 } : undefined}
            >
              {filteredTasks.map((task) => (
                <StoryboardCard
                  key={task.id}
                  task={task}
                  tasks={tasks}
                  updateStatus={updateStatus}
                  updateDifficulty={updateDifficulty}
                  updateCategory={updateCategory}
                  updateTitle={updateTitle}
                  updateUser={(id, userId) => updateUser(id, userId === 'current-user' ? currentUserId : userId)}
                  deleteTask={deleteTask}
                  duplicateTaskStructure={duplicateTaskStructure}
                  toggleUrgent={toggleUrgent}
                  toggleImpact={toggleImpact}
                  toggleMajorIncident={toggleMajorIncident}
                  toggleSprintTarget={toggleSprintTarget}
                  toggleDone={() => toggleDone(task.id)}
                  toggleTimer={toggleTimer}
                  reparent={reparent}
                  updateTerminationDate={updateTerminationDate}
                  updateComment={updateComment}
                  updateDurationInMinutes={updateDurationInMinutes}
                  onHoverHeightChange={setHoverCardHeight}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData('text/task-id', task.id);
                    event.dataTransfer.effectAllowed = 'move';
                  }}
                />
              ))}
            </div>
          )}

          <QuickAddTask
            placeholder={t('program.quickAddTask')}
            userId={currentUserId}
            className="max-w-md"
          />

          {!isFiltersCollapsed && (
            <div className="mt-2 flex flex-wrap items-center gap-4 rounded-lg border p-3">
              <FilterControls
                filters={activeFilters}
                setFilters={setActiveFilters}
                defaultFilters={getDefaultFilters()}
              />
            </div>
          )}
        </>
      )}
    </section>
  );
};
