import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { usePersistence } from '@/hooks/usePersistence';
import {
  SprintAutoClosePolicy,
  SprintEntity,
  SprintTaskLike,
  planAutoClose,
  resolveAutoCloseDueAt,
} from '@/lib/sprint-types';

interface AutoClosePanelProps {
  sprint: SprintEntity;
  tasks: SprintTaskLike[];
  timezone: string;
  onArm: (config: {
    graceHours: number;
    policy: SprintAutoClosePolicy;
    createNextDraft: boolean;
    notify: boolean;
  }) => Promise<void>;
  onDisarm: () => Promise<void>;
}

const POLICIES: { value: SprintAutoClosePolicy; label: string; description: string }[] = [
  {
    value: 'preselected',
    label: 'Prepared outcomes',
    description: 'Use the carry, backlog and drop decisions prepared for the sprint goals.',
  },
  {
    value: 'storyboard',
    label: 'Storyboard order',
    description: 'Carry open goals in Storyboard order.',
  },
  { value: 'carry-all', label: 'Carry everything', description: 'Every open goal goes to the next draft.' },
  { value: 'backlog-all', label: 'Backlog everything', description: 'Every open goal goes back to the backlog.' },
];

export function AutoClosePanel({ sprint, tasks, timezone, onArm, onDisarm }: AutoClosePanelProps) {
  const { t } = useTranslation();
  const persistence = usePersistence();
  const [graceHours, setGraceHours] = React.useState(sprint.autoClose?.graceHours ?? 24);
  const [policy, setPolicy] = React.useState<SprintAutoClosePolicy>(
    sprint.autoClose?.policy ?? 'preselected',
  );
  const [createNextDraft, setCreateNextDraft] = React.useState(
    sprint.autoClose?.createNextDraft ?? true,
  );
  const [notify, setNotify] = React.useState(sprint.autoClose?.notify ?? true);
  const [busy, setBusy] = React.useState(false);

  const dueAt = resolveAutoCloseDueAt(sprint.endDate, graceHours, timezone);
  const plan = React.useMemo(
    () => planAutoClose(sprint, tasks, { policy, timeZone: timezone }),
    [policy, sprint, tasks, timezone],
  );
  const armed = sprint.autoClose?.enabled && sprint.autoClose.status === 'armed';

  const arm = async () => {
    setBusy(true);
    try {
      await onArm({ graceHours, policy, createNextDraft, notify });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{t('sprint.autoClose.title', 'Auto-close')}</h3>
          <p className="text-xs text-muted-foreground">
            {t(
              'sprint.autoClose.help',
              'Closes the sprint if nobody did it before the deadline, then optionally prepares the next draft.',
            )}
          </p>
          {persistence.mode === 'browser' && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {t(
                'sprint.autoClose.browserBestEffort',
                'Best effort: this only runs while the app is open.',
              )}
            </p>
          )}
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            armed ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
          }`}
        >
          {armed ? t('sprint.autoClose.armed', 'Armed') : t('sprint.autoClose.off', 'Off')}
        </span>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">
            {t('sprint.autoClose.grace', 'Grace period (hours)')}
          </span>
          <input
            type="number"
            min={0}
            step={1}
            value={graceHours}
            onChange={(event) => setGraceHours(Number(event.target.value))}
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
          />
          <span className="mt-1 block text-[11px] text-muted-foreground">
            {t('sprint.autoClose.dueAt', 'Closes at {{date}}', {
              date: new Date(dueAt).toLocaleString(),
            })}
          </span>
        </label>

        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">
            {t('sprint.autoClose.policy', 'Policy')}
          </span>
          <select
            value={policy}
            onChange={(event) => setPolicy(event.target.value as SprintAutoClosePolicy)}
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
          >
            {POLICIES.map((candidate) => (
              <option key={candidate.value} value={candidate.value}>
                {candidate.label}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-[11px] text-muted-foreground">
            {t(`sprint.autoClose.policyHelp.${policy}`, POLICIES.find((item) => item.value === policy)?.description ?? '')}
          </span>
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={createNextDraft}
            onChange={(event) => setCreateNextDraft(event.target.checked)}
          />
          {t('sprint.autoClose.createDraft', 'Create the next draft')}
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={notify}
            onChange={(event) => setNotify(event.target.checked)}
          />
          {t('sprint.autoClose.notify', 'Notify the team')}
        </label>
      </div>

      <div className="mt-3 rounded-md border bg-muted/30 p-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">
            {t('sprint.autoClose.preview', 'Preview')}
          </span>
          <span>{t('sprint.autoClose.previewCarry', '{{count}} goals carried', { count: plan.carriedTaskIds.length })}</span>
          <span>{t('sprint.autoClose.previewBacklog', '{{points}} pts to backlog', { points: plan.backlogPoints })}</span>
          <span>
            {t('sprint.autoClose.previewNext', 'Next goal: {{points}} pts', {
              points: plan.carriedPoints,
            })}
          </span>
        </div>
      </div>

      <div className="mt-3 flex justify-end gap-2">
        {armed && (
          <Button variant="outline" size="sm" onClick={onDisarm} disabled={busy}>
            {t('sprint.autoClose.disarm', 'Disarm')}
          </Button>
        )}
        <Button size="sm" onClick={arm} disabled={busy || sprint.status === 'closed'}>
          {armed
            ? t('sprint.autoClose.update', 'Update auto-close')
            : t('sprint.autoClose.arm', 'Arm auto-close')}
        </Button>
      </div>
    </div>
  );
}
