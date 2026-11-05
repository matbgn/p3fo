import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, Check, Plus, Target, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useSprints, toSprintTask } from '@/hooks/useSprints';
import { usePersistence } from '@/hooks/usePersistence';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import type { SprintWellbeingStatus } from '@/lib/persistence-types';
import { useAllTasks } from '@/hooks/useAllTasks';
import { useSettingsContext } from '@/context/SettingsContext';
import { AutoClosePanel } from './AutoClosePanel';
import { sortTasks } from '@/utils/taskSorting';
import {
  SPRINT_CHECKLIST,
  WHO5_OPTIONS,
  WHO5_QUESTIONS,
  SprintEntity,
  SprintImpediment,
  SprintOutcome,
  addDaysToDateOnly,
  buildBurndown,
  computeCapacity,
  daysBetweenInclusive,
  indexTasks,
  isDoneInRange,
  parseDateOnly,
  rangeBounds,
  roundPoints,
  sprintNameFor,
  totalPoints,
} from '@/lib/sprint-types';

const STEPS = ['open', 'review', 'close', 'retro'] as const;

interface SprintCeremonyOverlayProps {
  initialStep?: number;
  onClose?: () => void;
  embedded?: boolean;
}

function KpiCard({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function Burndown({ sprint, tasks }: { sprint: SprintEntity; tasks: ReturnType<typeof toSprintTask>[] }) {
  const { t } = useTranslation();
  const { settings } = useSettingsContext();
  const timeZone = settings.timezone ?? 'Europe/Zurich';
  const points = React.useMemo(
    () => buildBurndown(sprint, tasks, timeZone),
    [sprint, tasks, timeZone],
  );
  if (points.length === 0) return null;
  const width = 600;
  const height = 190;
  const chartRight = width - 70;
  const max = Math.max(sprint.capacity.targetPoints, 1);
  const x = (index: number) => 44 + (index / Math.max(1, points.length - 1)) * (chartRight - 44);
  const y = (value: number) => 20 + (1 - value / max) * (height - 55);
  const polyline = points.map((point, index) => `${x(index)},${y(point.remaining)}`).join(' ');
  const ideal = points.map((point, index) => `${x(index)},${y(point.ideal)}`).join(' ');

  // Projection from the current actual point to the end of the sprint, at the
  // observed burn rate since the start. This is intentionally not a regression
  // or a mean: it answers "if we keep this pace, where do we land?".
  const projection = (() => {
    if (sprint.status === 'closed') return null;
    const start = parseDateOnly(sprint.startDate);
    if (!start) return null;
    const now = new Date();
    const nowUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const dayOffset = Math.round((nowUtc - start.getTime()) / 86_400_000);
    if (dayOffset < 0) return null;
    const currentIndex = Math.min(points.length - 1, dayOffset + 1);
    if (currentIndex >= points.length - 1) return null;
    const currentRemaining = points[currentIndex]?.remaining ?? max;
    const burned = max - currentRemaining;
    const rate = burned / Math.max(1, currentIndex);
    const values: string[] = [];
    let endValue = currentRemaining;
    for (let index = currentIndex; index < points.length; index += 1) {
      endValue = Math.max(0, Math.min(max, currentRemaining - rate * (index - currentIndex)));
      values.push(`${x(index)},${y(endValue)}`);
    }
    return { line: values.join(' '), endValue };
  })();

  const projectionLabel = projection ? `≈ ${Math.round(projection.endValue)} pts` : '';
  const projectionLabelY = projection
    ? Math.min(height - 30, Math.max(18, y(projection.endValue) - 10))
    : 0;
  const projectionLabelWidth = projectionLabel.length * 5.4 + 12;
  const projectionLabelX = width - 12 - projectionLabelWidth;

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-medium">{t('sprint.burndown.title', 'Impact burndown')}</span>
        <span className="text-xs text-muted-foreground">
          {sprint.startDate} → {sprint.endDate}
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Sprint burndown">
        <line x1="44" y1="20" x2="44" y2={height - 35} stroke="hsl(var(--border))" />
        <line x1="44" y1={height - 35} x2={chartRight} y2={height - 35} stroke="hsl(var(--border))" />
        <polyline points={ideal} fill="none" stroke="hsl(var(--border))" strokeDasharray="5 5" strokeWidth="1.5" />
        <polyline points={polyline} fill="none" stroke="hsl(var(--primary))" strokeWidth="2.5" strokeLinejoin="round" />
        {projection && (
          <>
            <polyline
              points={projection.line}
              fill="none"
              stroke="#f59e0b"
              strokeWidth="2"
              strokeDasharray="4 4"
              strokeLinejoin="round"
            />
            <rect
              x={projectionLabelX}
              y={projectionLabelY - 10}
              width={projectionLabelWidth}
              height={16}
              rx={3}
              fill="hsl(var(--card))"
              stroke="#f59e0b"
              strokeOpacity={0.55}
            />
            <text
              x={width - 16}
              y={projectionLabelY + 1}
              fontSize="10"
              fontWeight={600}
              textAnchor="end"
              fill="hsl(var(--foreground))"
            >
              {projectionLabel}
            </text>
          </>
        )}
        <text x="46" y="14" fontSize="10" fill="hsl(var(--muted-foreground))">{max}</text>
        <text x={width - 10} y={height - 22} fontSize="10" textAnchor="end" fill="hsl(var(--muted-foreground))">
          {points[points.length - 1].remaining} left
        </text>
      </svg>
      <div className="mt-2 flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full" style={{ background: 'hsl(var(--primary))' }} />
          {t('sprint.burndown.actual', 'Actual')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0 w-4" style={{ borderTop: '1.5px dashed hsl(var(--border))' }} />
          {t('sprint.burndown.ideal', 'Ideal')}
        </span>
        {projection && (
          <span className="flex items-center gap-1.5">
            <span className="h-0 w-4" style={{ borderTop: '1.5px dashed #f59e0b' }} />
            {t('sprint.burndown.projected', 'Projected')}
          </span>
        )}
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">
        {t('sprint.burndown.hint', 'All Impact Done tasks · target {{target}} pts', {
          target: sprint.capacity.targetPoints,
        })}
      </div>
    </div>
  );
}

export function SprintCeremonyOverlay({ initialStep = 0, onClose, embedded = false }: SprintCeremonyOverlayProps) {
  const { t } = useTranslation();
  const { sprints, activeSprint, draftSprint, loading, createDraft, createNextDraft, updateSprint, setImpediments, setScope, closeSprint, startSprint, armAutoClose, disarmAutoClose } = useSprints();
  const { tasks: allTasks } = useAllTasks();
  const { settings } = useSettingsContext();
  const persistence = usePersistence();
  const { userId } = useCurrentUser();

  const firstSprintId = activeSprint?.id ?? draftSprint?.id ?? null;
  const [step, setStep] = React.useState(() => {
    if (initialStep > 0) return initialStep;
    return activeSprint ? 1 : 0;
  });
  const [sprintId, setSprintId] = React.useState<string | null>(firstSprintId);
  const sprint = sprints.find((candidate) => candidate.id === sprintId) ?? null;

  // Sprint state hydrates asynchronously, so the initial useState above sees
  // an empty list. Select the persisted sprint (and its natural step) once it
  // arrives instead of showing "No sprint yet".
  const fallbackSprintId = activeSprint?.id ?? draftSprint?.id;
  const fallbackSprintStatus = activeSprint?.status ?? draftSprint?.status;

  React.useEffect(() => {
    if (sprintId || !fallbackSprintId) return;
    setSprintId(fallbackSprintId);
    setStep(fallbackSprintStatus === 'active' ? 1 : 0);
  }, [fallbackSprintId, fallbackSprintStatus, sprintId]);
  const tasks = React.useMemo(() => allTasks.map(toSprintTask), [allTasks]);
  const tasksById = React.useMemo(() => indexTasks(tasks), [tasks]);

  const [outcomes, setOutcomes] = React.useState<Record<string, SprintOutcome>>({});
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [search, setSearch] = React.useState('');
  const [name, setName] = React.useState('');
  const [lengthWeeks, setLengthWeeks] = React.useState(4);
  const [retro, setRetro] = React.useState({
    gladSadMad: '',
    deviations: '',
    improvements: '',
    appreciated: '',
    todos: '',
  });
  const [checklist, setChecklist] = React.useState<Record<string, boolean>>({});
  const [wellbeing, setWellbeing] = React.useState<SprintWellbeingStatus | null>(null);
  const [who5, setWho5] = React.useState<(number | null)[]>([null, null, null, null, null]);
  const [wellbeingBusy, setWellbeingBusy] = React.useState(false);
  const [impedimentLabel, setImpedimentLabel] = React.useState('');
  const [impedimentDays, setImpedimentDays] = React.useState(0.5);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!sprint) return;
    setOutcomes(
      Object.fromEntries(
        sprint.scope.map((item) => [item.taskId, item.outcome ?? 'carried']),
      ) as Record<string, SprintOutcome>,
    );
    setSelected(new Set(sprint.scope.map((item) => item.taskId)));
    setName(sprint.name);
    setLengthWeeks(Math.max(1, Math.round(daysBetweenInclusive(sprint.startDate, sprint.endDate) / 7)));
    setRetro({
      gladSadMad: sprint.retro?.gladSadMad ?? '',
      deviations: sprint.retro?.deviations ?? '',
      improvements: sprint.retro?.improvements ?? '',
      appreciated: sprint.retro?.appreciated ?? '',
      todos: sprint.retro?.todos ?? '',
    });
    setChecklist(sprint.retro?.checklist ?? {});
    setWellbeing(null);
    setWho5([null, null, null, null, null]);
    // Form state is initialised once per sprint; user edits must not be reset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sprint?.id]);

  const activeSprintId = sprint?.id;

  React.useEffect(() => {
    if (!activeSprintId || !userId) {
      setWellbeing(null);
      return;
    }
    let cancelled = false;
    persistence
      .getSprintWellbeing(activeSprintId, userId)
      .then((status) => {
        if (!cancelled) setWellbeing(status);
      })
      .catch((error) => {
        console.error('Error loading sprint well-being:', error);
      });
    return () => {
      cancelled = true;
    };
  }, [activeSprintId, userId, persistence]);

  const aggregateWellbeing = wellbeing?.aggregate ?? sprint?.retro?.wellbeing ?? null;

  const submitWho5 = async () => {
    if (!sprint || !userId || who5.some((value) => value === null)) return;
    setWellbeingBusy(true);
    try {
      const status = await persistence.submitSprintWellbeing(sprint.id, userId, who5 as number[]);
      setWellbeing(status);
      if (sprint.status === 'closed' && status.aggregate) {
        await updateSprint(sprint.id, {
          retro: { ...retro, checklist, wellbeing: status.aggregate },
        });
      }
    } catch (error) {
      console.error('Error submitting sprint well-being:', error);
    } finally {
      setWellbeingBusy(false);
    }
  };

  const openItems = React.useMemo(() => {
    if (!sprint) return [];
    const bounds = rangeBounds(
      sprint.startDate,
      sprint.endDate,
      settings.timezone ?? 'Europe/Zurich',
    );
    return sprint.scope.filter((item) => {
      const task = tasksById.get(item.taskId);
      if (!task) return true;
      if (['Done', 'Dropped', 'Archived'].includes(task.triageStatus)) return false;
      return !isDoneInRange(task, bounds.startMs, bounds.endMs);
    });
  }, [sprint, tasksById, settings.timezone]);

  const saveOutcomes = React.useCallback(
    (nextOutcomes: Record<string, SprintOutcome>) => {
      setOutcomes(nextOutcomes);
      if (!sprint) return;
      void updateSprint(sprint.id, {
        scope: sprint.scope.map((item) => ({
          ...item,
          outcome: nextOutcomes[item.taskId] ?? item.outcome,
        })),
      }).catch((error) => {
        console.error('Error saving sprint outcomes:', error);
      });
    },
    [sprint, updateSprint],
  );

  const candidates = React.useMemo(() => {
    const list = allTasks.filter(
      (task) =>
        !task.parentId &&
        !['Done', 'Dropped', 'Archived'].includes(task.triageStatus) &&
        (!search.trim() || task.title.toLowerCase().includes(search.trim().toLowerCase())),
    );
    return [...list].sort(sortTasks.plan);
  }, [allTasks, search]);

  const selectedPoints = React.useMemo(() => {
    return roundPoints(
      [...selected].reduce((acc, id) => acc + totalPoints(id, tasksById), 0),
    );
  }, [selected, tasksById]);

  const capacity = sprint?.capacity;
  const targetPoints = capacity?.targetPoints ?? 0;
  const practiceDisplay = capacity
    ? capacity.practicePct > 0 && capacity.practicePct <= 1
      ? capacity.practicePct * 100
      : capacity.practicePct
    : 0;
  const peopleDisplay = capacity
    ? Math.round(capacity.eftCount * 1000) / 10
    : 0;

  const next = async () => {
    if (!sprint) return;
    if (step === 0) {
      setStep(1);
      return;
    }
    if (step === 1) {
      setStep(sprint.status === 'active' ? 2 : sprint.status === 'closed' ? 3 : 0);
      return;
    }
    if (step === 2) {
      setBusy(true);
      try {
        const closed = await closeSprint(sprint.id, outcomes);
        if (!closed) return;
        try {
          const status = await persistence.getSprintWellbeing(sprint.id, userId ?? '');
          await updateSprint(sprint.id, {
            retro: { ...retro, checklist, wellbeing: status.aggregate ?? sprint.retro?.wellbeing },
          });
        } catch (error) {
          console.error('Error saving sprint well-being snapshot:', error);
        }
        setStep(3);
      } finally {
        setBusy(false);
      }
      return;
    }
    if (step === 3) {
      setBusy(true);
      try {
        await updateSprint(sprint.id, {
          retro: {
            ...retro,
            checklist,
            wellbeing: aggregateWellbeing ?? sprint.retro?.wellbeing,
          },
        });
        let nextDraft = draftSprint;
        if (!nextDraft && sprint.status === 'closed') {
          nextDraft = await createNextDraft(sprint.id);
        }
        if (nextDraft) setSprintId(nextDraft.id);
        setStep(0);
      } finally {
        setBusy(false);
      }
      return;
    }
  };

  const toggleSelected = (taskId: string) => {
    setSelected((previous) => {
      const nextSet = new Set(previous);
      if (nextSet.has(taskId)) nextSet.delete(taskId);
      else nextSet.add(taskId);
      return nextSet;
    });
  };

  const selectTopGoals = () => {
    setSelected(new Set(candidates.slice(0, 3).map((task) => task.id)));
  };

  const applyTheoretical = async (value: number) => {
    if (!sprint) return;
    await updateSprint(sprint.id, {
      capacity: computeCapacity({
        theoreticalPoints: Math.max(1, value),
        practicePct: sprint.capacity.practicePct,
        eftCount: sprint.capacity.eftCount,
        workingDays: sprint.capacity.workingDays,
        impediments: sprint.capacity.impediments,
      }),
    });
  };

  const isDefaultSprintName = (value: string) =>
    !value.trim() || /^Sprint \d{4}-\d{2}-\d{2} → \d{4}-\d{2}-\d{2}$/.test(value);

  const applySprintLength = async (weeks: number) => {
    if (!sprint) return;
    const safe = Math.max(1, Math.round(weeks));
    const endDate = addDaysToDateOnly(sprint.startDate, safe * 7 - 1);
    const nextName = isDefaultSprintName(name)
      ? sprintNameFor(sprint.startDate, endDate)
      : name;
    setLengthWeeks(safe);
    setName(nextName);
    await updateSprint(sprint.id, { endDate, name: nextName });
  };

  const applyStartDate = async (value: string) => {
    if (!sprint || !value) return;
    const endDate = addDaysToDateOnly(value, lengthWeeks * 7 - 1);
    const nextName = isDefaultSprintName(name) ? sprintNameFor(value, endDate) : name;
    setName(nextName);
    await updateSprint(sprint.id, { startDate: value, endDate, name: nextName });
  };

  const applyEndDate = async (value: string) => {
    if (!sprint || !value) return;
    const startDate = addDaysToDateOnly(value, -(lengthWeeks * 7 - 1));
    const nextName = isDefaultSprintName(name) ? sprintNameFor(startDate, value) : name;
    setName(nextName);
    await updateSprint(sprint.id, { startDate, endDate: value, name: nextName });
  };

  const sprintStartDate = sprint?.startDate;
  const sprintEndDate = sprint?.endDate;

  React.useEffect(() => {
    if (!sprintStartDate || !sprintEndDate) return;
    const isDefault =
      !name.trim() || /^Sprint \d{4}-\d{2}-\d{2} → \d{4}-\d{2}-\d{2}$/.test(name);
    if (!isDefault) return;
    const expected = sprintNameFor(sprintStartDate, sprintEndDate);
    if (name !== expected) setName(expected);
  }, [sprintStartDate, sprintEndDate, name]);

  const applyCapacity = async (patch: { practicePct?: number; eftCount?: number }) => {
    if (!sprint) return;
    const nextPractice = Number.isFinite(patch.practicePct)
      ? (patch.practicePct as number)
      : sprint.capacity.practicePct;
    const nextEft = Number.isFinite(patch.eftCount)
      ? (patch.eftCount as number)
      : sprint.capacity.eftCount;
    await updateSprint(sprint.id, {
      capacity: computeCapacity({
        theoreticalPoints: sprint.capacity.theoreticalPoints,
        practicePct: nextPractice,
        eftCount: nextEft,
        workingDays: sprint.capacity.workingDays,
        impediments: sprint.capacity.impediments,
      }),
    });
  };

  const addImpediment = async () => {
    if (!sprint || !impedimentLabel.trim()) return;
    const nextImpediments: SprintImpediment[] = [
      ...sprint.capacity.impediments,
      { id: crypto.randomUUID(), label: impedimentLabel.trim(), days: Math.max(0, impedimentDays) },
    ];
    setImpedimentLabel('');
    setImpedimentDays(0.5);
    await setImpediments(sprint.id, nextImpediments);
  };

  const removeImpediment = async (id: string) => {
    if (!sprint) return;
    await setImpediments(
      sprint.id,
      sprint.capacity.impediments.filter((item) => item.id !== id),
    );
  };

  const saveDraft = async () => {
    if (!sprint) return;
    setBusy(true);
    try {
      await updateSprint(sprint.id, { name });
      await setScope(sprint.id, [...selected]);
    } finally {
      setBusy(false);
    }
  };

  const launch = async () => {
    if (!sprint) return;
    setBusy(true);
    try {
      await updateSprint(sprint.id, { name });
      await setScope(sprint.id, [...selected]);
      await startSprint(sprint.id);
      onClose?.();
    } finally {
      setBusy(false);
    }
  };

  const stepLabel = (key: (typeof STEPS)[number]) =>
    t(`sprint.step.${key}`, key.charAt(0).toUpperCase() + key.slice(1));

  const canNext = Boolean(sprint) && !(step === 1 && sprint?.status === 'draft');

  const previousStep = () => {
    if (step === 0) return 0;
    if (step === 3) return sprint?.status === 'active' ? 2 : 1;
    return step - 1;
  };

  return (
    <div
      className={
        embedded
          ? 'flex shrink-0 flex-col overflow-hidden rounded-lg border bg-card'
          : 'fixed inset-0 z-50 flex flex-col bg-background'
      }
    >
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold">{sprint?.name ?? t('sprint.newSprint', 'New sprint')}</h2>
        </div>
        <div className="flex items-center gap-2">
          {sprint && (
            <span className="hidden rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary sm:inline">
              {sprint.metrics.committedPoints} / {targetPoints} pts
            </span>
          )}
          {onClose && (
            <Button variant="ghost" size="icon" onClick={onClose} aria-label={t('common.close', 'Close')}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1 border-b px-4 py-2 sm:grid-cols-4">
        {STEPS.map((key, index) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              const allowed =
                index === 0 ||
                index === 1 ||
                (index === 2 && sprint?.status === 'active') ||
                (index === 3 && Boolean(sprint));
              if (allowed) setStep(index);
            }}
            className={`w-full whitespace-nowrap rounded-md px-3 py-1.5 text-center text-xs font-medium transition ${
              step === index
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            {index + 1}. {stepLabel(key)}
          </button>
        ))}
      </div>

      <div className={embedded ? 'p-4 sm:p-6' : 'flex-1 overflow-auto p-4 sm:p-6'}>
        <div className="mx-auto max-w-6xl space-y-4">
          {!sprint && !loading && (
            <div className="rounded-lg border bg-card p-6 text-center">
              <h3 className="text-lg font-semibold">{t('sprint.noSprint', 'No sprint yet')}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('sprint.noSprintHelp', 'Create a draft, pick the scope, then start it.')}
              </p>
              <Button
                className="mt-4"
                onClick={async () => {
                  const draft = await createDraft();
                  setSprintId(draft.id);
                  setStep(0);
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                {t('sprint.createDraft', 'Create draft')}
              </Button>
            </div>
          )}

          {sprint && step === 1 && (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <KpiCard
                  label={t('sprint.kpi.goal', 'Sprint goal')}
                  value={sprint.metrics.committedPoints}
                  hint={t('sprint.kpi.goalHint', '{{count}} goal items', { count: sprint.scope.length })}
                />
                <KpiCard
                  label={t('sprint.kpi.goalDone', 'Goal done')}
                  value={sprint.metrics.scopeDonePoints}
                  hint={`${sprint.metrics.completionPct}%`}
                />
                <KpiCard
                  label={t('sprint.kpi.impactDone', 'Impact done')}
                  value={sprint.metrics.achievedPoints}
                  hint={t('sprint.kpi.impactHint', 'all Impact Done, Admin excluded')}
                />
                <KpiCard
                  label={t('sprint.kpi.remaining', 'Remaining to target')}
                  value={sprint.metrics.remainingToTarget}
                  hint={t('sprint.kpi.remainingHint', 'target {{target}} pts', { target: targetPoints })}
                />
              </div>
              <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
                <Burndown sprint={sprint} tasks={tasks} />
                <div className="rounded-lg border bg-card p-3">
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="font-medium">{t('sprint.goal.title', 'Sprint goal')}</span>
                    <span className="text-xs text-muted-foreground">
                      {t('sprint.goal.items', '{{count}} items · {{points}} pts', {
                        count: sprint.scope.length,
                        points: sprint.metrics.committedPoints,
                      })}
                    </span>
                  </div>
                  <div className="max-h-72 space-y-1 overflow-auto pr-1">
                    {sprint.scope.map((item) => {
                      const task = tasksById.get(item.taskId);
                      return (
                        <div key={item.taskId} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50">
                          <span className="min-w-0 flex-1 truncate">{item.title}</span>
                          <span className="text-[11px] text-muted-foreground">{task?.triageStatus ?? item.statusAtCommit}</span>
                          <span className="w-8 text-right text-xs font-semibold tabular-nums">{item.points}</span>
                        </div>
                      );
                    })}
                    {sprint.scope.length === 0 && (
                      <p className="py-6 text-center text-xs text-muted-foreground">
                        {t('sprint.scopeEmpty', 'No scope selected yet.')}
                      </p>
                    )}
                  </div>
                </div>
              </div>
              {sprint.status === 'active' && (
                <AutoClosePanel
                  sprint={sprint}
                  tasks={tasks}
                  timezone={settings.timezone ?? 'Europe/Zurich'}
                  onArm={(config) => armAutoClose(sprint.id, config)}
                  onDisarm={() => disarmAutoClose(sprint.id)}
                />
              )}
            </>
          )}

          {sprint && step === 2 && (
            <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
              <div className="rounded-lg border bg-card p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">{t('sprint.close.openGoals', 'Open goals')}</h3>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{sprint.metrics.openPoints} pts</span>
                </div>
                <div className="max-h-[50vh] space-y-2 overflow-auto pr-1">
                  {openItems.map((item) => (
                    <div key={item.taskId} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{item.title}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {tasksById.get(item.taskId)?.triageStatus ?? item.statusAtCommit} · {item.points} pts
                        </div>
                      </div>
                      <select
                        value={outcomes[item.taskId] ?? 'carried'}
                        onChange={(event) => {
                          saveOutcomes({
                            ...outcomes,
                            [item.taskId]: event.target.value as SprintOutcome,
                          });
                        }}
                        className="h-8 rounded-md border bg-background px-2 text-xs"
                      >
                        <option value="carried">{t('sprint.outcome.carried', 'Carry')}</option>
                        <option value="backlog">{t('sprint.outcome.backlog', 'Backlog')}</option>
                        <option value="dropped">{t('sprint.outcome.dropped', 'Drop')}</option>
                      </select>
                    </div>
                  ))}
                  {openItems.length === 0 && (
                    <p className="py-6 text-center text-xs text-muted-foreground">
                      {t('sprint.close.nothingOpen', 'Everything is done.')}
                    </p>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      saveOutcomes(
                        Object.fromEntries(
                          openItems.map((item) => [item.taskId, 'carried']),
                        ) as Record<string, SprintOutcome>,
                      )
                    }
                  >
                    {t('sprint.close.allCarry', 'All → next sprint')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      saveOutcomes(
                        Object.fromEntries(
                          openItems.map((item) => [item.taskId, 'backlog']),
                        ) as Record<string, SprintOutcome>,
                      )
                    }
                  >
                    {t('sprint.close.allBacklog', 'All → backlog')}
                  </Button>
                </div>
              </div>
              <div className="rounded-lg border bg-card p-4 text-sm">
                <h3 className="font-semibold">{t('sprint.close.whatHappens', 'What closing writes')}</h3>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  <li>{t('sprint.close.bullet1', 'Sprint status becomes closed.')}</li>
                  <li>{t('sprint.close.bullet2', 'Each open item receives an outcome.')}</li>
                  <li>{t('sprint.close.bullet3', 'Carried goals keep sprintTarget; the rest are cleared.')}</li>
                  <li>{t('sprint.close.bullet4', 'Velocity is computed from High Impact Done tasks, Admin excluded.')}</li>
                </ul>
                <Button className="mt-4 w-full" onClick={next} disabled={busy}>
                  <Check className="mr-2 h-4 w-4" />
                  {t('sprint.close.close', 'Close sprint')}
                </Button>
              </div>
            </div>
          )}

          {sprint && step === 3 && (
            <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
              <div className="space-y-3">
                <div className="rounded-lg border bg-card p-4">
                  <h3 className="text-sm font-semibold">
                    {t('sprint.retro.gladSadMad', 'Glad–Sad–Mad & interactions between people')}
                  </h3>
                  <p className="mb-2 text-[11px] text-muted-foreground">
                    {t('sprint.retro.gladSadMadHint', 'Support from colleagues, autonomy at work, workload.')}
                  </p>
                  <Textarea
                    value={retro.gladSadMad}
                    onChange={(event) => setRetro((previous) => ({ ...previous, gladSadMad: event.target.value }))}
                    rows={4}
                    className="text-sm"
                  />

                  <div className="mt-4 rounded-md border bg-muted/30 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-xs font-semibold">
                        {t('sprint.retro.who5Title', 'WHO-5 well-being index')}
                      </h4>
                      <span className="text-[11px] text-muted-foreground">
                        {t('sprint.retro.who5Scale', 'Last four weeks · 0 at no time, 5 all of the time')}
                      </span>
                    </div>

                    {wellbeing?.answered ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {t('sprint.retro.who5Recorded', 'Your response is recorded anonymously. It cannot be changed.')}
                      </p>
                    ) : (
                      <div className="mt-2 space-y-1.5">
                        {WHO5_QUESTIONS.map((question, index) => (
                          <div key={question} className="grid grid-cols-[1fr_9rem] items-center gap-2">
                            <span className="text-[11px]">
                              {index + 1}. {t(`sprint.who5.q${index + 1}`, question)}
                            </span>
                            <select
                              value={who5[index] ?? ''}
                              onChange={(event) => {
                                const value = event.target.value === '' ? null : Number(event.target.value);
                                setWho5((previous) =>
                                  previous.map((entry, position) => (position === index ? value : entry)),
                                );
                              }}
                              className="h-7 rounded-md border bg-background px-1 text-[11px]"
                            >
                              <option value="">—</option>
                              {WHO5_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.value} · {t(`sprint.who5.option.${option.value}`, option.label)}
                                </option>
                              ))}
                            </select>
                          </div>
                        ))}
                        <Button
                          size="sm"
                          className="mt-2"
                          onClick={() => void submitWho5()}
                          disabled={wellbeingBusy || who5.some((value) => value === null)}
                        >
                          {t('sprint.retro.who5Submit', 'Submit anonymously')}
                        </Button>
                      </div>
                    )}

                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-semibold">
                        {aggregateWellbeing ? `${aggregateWellbeing.score}/100` : '—'}
                      </span>
                      <span className="text-muted-foreground">
                        {aggregateWellbeing
                          ? t('sprint.retro.who5Aggregate', '{{count}} responses · team aggregate only', {
                              count: aggregateWellbeing.count,
                            })
                          : t('sprint.retro.who5None', 'No responses yet')}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {t(
                        'sprint.retro.who5Privacy',
                        'One response per person per sprint. Only the team aggregate is visible; individual answers are never shown.',
                      )}
                    </p>
                  </div>
                </div>

                {(
                  [
                    ['deviations', 'Points that led to schedule or goal deviations, and solutions found'],
                    ['improvements', 'Ways to improve comfort and efficiency, tools and processes'],
                    ['appreciated', 'Particularly appreciated situations'],
                    ['todos', 'Follow-up actions (TODOs)'],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key} className="rounded-lg border bg-card p-4">
                    <Label className="space-y-1 text-xs">
                      <span>{t(`sprint.retro.${key}`, label)}</span>
                      <Textarea
                        value={retro[key]}
                        onChange={(event) =>
                          setRetro((previous) => ({ ...previous, [key]: event.target.value }))
                        }
                        rows={3}
                        className="text-sm"
                      />
                    </Label>
                  </div>
                ))}
              </div>

              <div className="rounded-lg border bg-card p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">{t('sprint.retro.checklist', 'Curation checklist')}</h3>
                  <span className="text-xs text-muted-foreground">
                    {Object.values(checklist).filter(Boolean).length}/{SPRINT_CHECKLIST.length}
                  </span>
                </div>
                <div className="max-h-[52vh] space-y-1 overflow-auto pr-1">
                  {SPRINT_CHECKLIST.map((item) => (
                    <label key={item.id} className="flex items-start gap-2 rounded-md px-1 py-1 text-xs hover:bg-muted/50">
                      <Checkbox
                        checked={Boolean(checklist[item.id])}
                        onCheckedChange={(checked) =>
                          setChecklist((previous) => ({ ...previous, [item.id]: Boolean(checked) }))
                        }
                      />
                      <span className={checklist[item.id] ? 'text-muted-foreground line-through' : ''}>
                        {t(`sprint.checklist.${item.id}`, item.label)}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {sprint && step === 0 && (
            <>
              {sprint.status !== 'draft' ? (
                <div className="rounded-lg border bg-card p-6 text-center text-sm">
                  <p className="font-medium">
                    {sprint.status === 'active'
                      ? t('sprint.open.closeFirst', 'Close the active sprint before opening the next one.')
                      : t('sprint.open.noDraft', 'No draft is ready.')}
                  </p>
                  <div className="mt-3 flex flex-wrap justify-center gap-2">
                    <Button variant="outline" onClick={() => setStep(sprint.status === 'active' ? 2 : 3)}>
                      {sprint.status === 'active'
                        ? t('sprint.open.goClose', 'Go to Close')
                        : t('sprint.open.goRetro', 'Go to Retro')}
                    </Button>
                    {sprint.status === 'closed' && (
                      <Button
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          try {
                            const draft = await createDraft();
                            setSprintId(draft.id);
                            setStep(0);
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        {t('sprint.createDraft', 'Create draft')}
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
                    <div className="space-y-3 rounded-lg border bg-card p-4">
                      <div className="grid gap-3 sm:grid-cols-3">
                        <KpiCard label={t('sprint.capacity.theoretical', 'Theoretical')} value={sprint.capacity.theoreticalPoints} hint={t('sprint.capacity.theoreticalHint', 'per 1.0 EFT')} />
                        <KpiCard label={t('sprint.capacity.practice', 'Practice')} value={`${practiceDisplay}%`} hint={t('sprint.capacity.practiceHint', 'team planning input')} />
                        <KpiCard label={t('sprint.capacity.target', 'Target')} value={targetPoints} hint={`${sprint.capacity.correctedPct.toFixed(2)}%`} />
                      </div>

                      <Label className="space-y-1 text-xs">
                        <span>{t('sprint.open.name', 'Name')}</span>
                        <Input value={name} onChange={(event) => setName(event.target.value)} />
                      </Label>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <Label className="space-y-1 text-xs">
                          <span>{t('sprint.open.startDate', 'Start')}</span>
                          <Input
                            type="date"
                            value={sprint.startDate}
                            onChange={(event) => void applyStartDate(event.target.value)}
                          />
                        </Label>
                        <Label className="space-y-1 text-xs">
                          <span>{t('sprint.open.length', 'Length (weeks)')}</span>
                          <Input
                            type="number"
                            min={1}
                            max={12}
                            step={1}
                            value={lengthWeeks}
                            onChange={(event) => void applySprintLength(Number(event.target.value))}
                          />
                        </Label>
                        <Label className="space-y-1 text-xs">
                          <span>{t('sprint.open.end', 'End')}</span>
                          <Input
                            type="date"
                            value={sprint.endDate}
                            onChange={(event) => void applyEndDate(event.target.value)}
                          />
                        </Label>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-3">
                        <Label className="space-y-1 text-xs">
                          <span>{t('sprint.capacity.theoretical', 'Theoretical')}</span>
                          <Input
                            type="number"
                            min={1}
                            defaultValue={sprint.capacity.theoreticalPoints}
                            onBlur={(event) => void applyTheoretical(Number(event.target.value))}
                          />
                        </Label>
                        <Label className="space-y-1 text-xs">
                          <span>{t('sprint.capacity.people')}</span>
                          <Input
                            type="number"
                            min={1}
                            step={1}
                            defaultValue={peopleDisplay}
                            onBlur={(event) => void applyCapacity({ eftCount: Number(event.target.value) / 100 })}
                          />
                        </Label>
                        <Label className="space-y-1 text-xs">
                          <span>{t('sprint.capacity.practice', 'Practice %')}</span>
                          <Input
                            type="number"
                            min={1}
                            max={500}
                            step={1}
                            defaultValue={practiceDisplay}
                            onBlur={(event) => void applyCapacity({ practicePct: Number(event.target.value) })}
                          />
                        </Label>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-md border bg-muted/30 p-2 text-xs">
                          <div className="text-muted-foreground">{t('sprint.capacity.workingDays', 'Working days')}</div>
                          <div className="text-lg font-semibold">{sprint.capacity.workingDays}</div>
                        </div>
                        <div className="rounded-md border bg-muted/30 p-2 text-xs">
                          <div className="text-muted-foreground">{t('sprint.capacity.costPerDay', 'Cost per impediment day')}</div>
                          <div className="text-lg font-semibold">{sprint.capacity.costPerDayPct.toFixed(2)}%</div>
                        </div>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {t(
                          'sprint.capacity.practiceHelp',
                          'Practice % is the team total from the wiki table (for example MBO 80% theory → 60% practice). It is not summed from the paid workload field.',
                        )}
                      </p>

                      <div>
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-xs font-medium">{t('sprint.capacity.impediments', 'Impediments')}</span>
                          <span className="text-xs text-muted-foreground">
                            {sprint.capacity.impedimentDays} d → {sprint.capacity.correctedPct.toFixed(2)}%
                          </span>
                        </div>
                        <div className="space-y-1">
                          {sprint.capacity.impediments.map((item) => (
                            <div key={item.id} className="flex items-center gap-2 rounded-md border px-2 py-1 text-xs">
                              <span className="min-w-0 flex-1 truncate">{item.label}</span>
                              <span className="tabular-nums">{item.days} d</span>
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => void removeImpediment(item.id)}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                        <div className="mt-2 flex gap-2">
                          <Input
                            value={impedimentLabel}
                            onChange={(event) => setImpedimentLabel(event.target.value)}
                            placeholder={t('sprint.capacity.impedimentLabel', 'Label')}
                            className="h-8 text-xs"
                          />
                          <Input
                            type="number"
                            min={0}
                            step={0.5}
                            value={impedimentDays}
                            onChange={(event) => setImpedimentDays(Number(event.target.value))}
                            className="h-8 w-20 text-xs"
                          />
                          <Button variant="outline" size="sm" onClick={() => void addImpediment()}>
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>

                      <div className="rounded-md border bg-muted/30 p-3 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{t('sprint.open.goalCommitment', 'Sprint goal commitment')}</span>
                          <span className="font-semibold">{selectedPoints} pts · {selected.size} items</span>
                        </div>
                        <div className="mt-1 flex items-center justify-between text-muted-foreground">
                          <span>{t('sprint.open.teamTarget', 'Team target')}</span>
                          <span>{targetPoints} pts</span>
                        </div>
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          {t(
                            'sprint.open.goalVsBurndown',
                            'The goal is the commitment. The burndown counts every Impact task that reaches Done.',
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-lg border bg-card p-4">
                      <div className="mb-1">
                        <h3 className="text-sm font-semibold">{t('sprint.open.candidates', 'Sprint goal candidates')}</h3>
                        <p className="text-[11px] text-muted-foreground">
                          {t('sprint.open.candidatesHelp', 'Pick the 2–3 outcomes the team commits to.')}
                        </p>
                      </div>
                      <div className="mb-2 mt-2 flex items-center gap-2">
                        <Input
                          value={search}
                          onChange={(event) => setSearch(event.target.value)}
                          placeholder={t('sprint.open.search', 'Filter candidates')}
                          className="h-8 text-xs"
                        />
                        <Button variant="outline" size="sm" onClick={selectTopGoals}>
                          <Target className="mr-1 h-3 w-3" />
                          {t('sprint.open.top3', 'Top 3 goals')}
                        </Button>
                      </div>
                      <div className="max-h-[42vh] space-y-1 overflow-auto pr-1">
                        {candidates.map((task) => {
                          const checked = selected.has(task.id);
                          return (
                            <label key={task.id} className="flex items-center gap-2 rounded-md px-1 py-1.5 text-xs hover:bg-muted/50">
                              <Checkbox checked={checked} onCheckedChange={() => toggleSelected(task.id)} />
                              <span className="min-w-0 flex-1 truncate">{task.title}</span>
                              <span className="text-muted-foreground">{task.triageStatus}</span>
                              <span className="w-8 text-right font-semibold tabular-nums">
                                {totalPoints(task.id, tasksById)}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                      <div className="mt-3 flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => void saveDraft()} disabled={busy}>
                          {t('sprint.open.saveDraft', 'Save draft')}
                        </Button>
                        <Button size="sm" onClick={() => void launch()} disabled={busy || selected.size === 0}>
                          {t('sprint.open.startSprint', 'Start sprint')}
                          <ArrowRight className="ml-1 h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  <AutoClosePanel
                    sprint={sprint}
                    tasks={tasks}
                    timezone={settings.timezone ?? 'Europe/Zurich'}
                    onArm={(config) => armAutoClose(sprint.id, config)}
                    onDisarm={() => disarmAutoClose(sprint.id)}
                  />
                </>
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between border-t px-4 py-3">
        <span className="text-xs text-muted-foreground">
          {t('sprint.stepOf', 'Step {{current}} of {{total}}', { current: step + 1, total: STEPS.length })}
        </span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setStep(previousStep())} disabled={step === 0}>
            <ArrowLeft className="mr-1 h-3 w-3" />
            {t('sprint.back', 'Back')}
          </Button>
          {sprint && (
            <Button size="sm" onClick={() => void next()} disabled={!canNext || busy}>
              {t('sprint.next', 'Next')}
              <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
