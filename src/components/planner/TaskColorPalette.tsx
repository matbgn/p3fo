import React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import {
  TASK_COLORS,
  normalizeFreeColor,
  resolveTaskColorStyle,
  taskColorKey,
  type TaskColor,
} from '@/lib/planner/colors';
import { taskColorDisplayLabel } from '@/lib/workspace-taxonomy';

type TaskColorPaletteProps = {
  value: TaskColor | null | undefined;
  onChange: (color: TaskColor) => void;
  /** Workspace color→category names; unnamed colors fall back to their default. */
  colorLabels?: Record<string, string>;
  size?: 'sm' | 'md';
  className?: string;
};

const FREE_FALLBACK = '#3b82f6';

/**
 * The task color choices: the nine presets, then a tenth slot that opens a
 * free color picker. A color associated with a workspace category shows that
 * category name; the others show their default color name.
 */
export const TaskColorPalette: React.FC<TaskColorPaletteProps> = ({
  value,
  onChange,
  colorLabels,
  size = 'md',
  className,
}) => {
  const { t } = useTranslation();
  const selectedKey = value ? taskColorKey(value) : 'none';
  const freeValue = value && !(TASK_COLORS as readonly string[]).includes(value)
    ? normalizeFreeColor(value) ?? FREE_FALLBACK
    : FREE_FALLBACK;
  const isFree = selectedKey.startsWith('#');
  const box = size === 'sm' ? 'h-5 w-5' : 'h-6 w-6';

  // The native picker emits an input event for every step while the user
  // drags, and each onChange rewrites the whole task list (or app settings).
  // Preview locally and commit the settled value once.
  const [draft, setDraft] = React.useState<TaskColor>(freeValue);
  const commitTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingColor = React.useRef<TaskColor | null>(null);

  React.useEffect(() => {
    setDraft(freeValue);
  }, [freeValue]);

  const flush = React.useCallback(() => {
    if (commitTimer.current) {
      clearTimeout(commitTimer.current);
      commitTimer.current = null;
    }

    const next = pendingColor.current;
    pendingColor.current = null;
    if (next) onChange(next);
  }, [onChange]);

  React.useEffect(() => () => {
    if (commitTimer.current) {
      clearTimeout(commitTimer.current);
      commitTimer.current = null;
    }

    const next = pendingColor.current;
    pendingColor.current = null;
    if (next) onChange(next);
  }, [onChange]);

  const queueColor = (color: TaskColor) => {
    setDraft(color);
    pendingColor.current = color;

    if (commitTimer.current) clearTimeout(commitTimer.current);
    commitTimer.current = setTimeout(() => {
      commitTimer.current = null;
      const next = pendingColor.current;
      pendingColor.current = null;
      if (next) onChange(next);
    }, 200);
  };

  // A preset is an explicit choice: drop a custom color still waiting on the
  // debounce so it cannot fire afterwards and overwrite the preset.
  const cancelPendingCommit = () => {
    if (commitTimer.current) {
      clearTimeout(commitTimer.current);
      commitTimer.current = null;
    }
    pendingColor.current = null;
  };

  const labelFor = (color: TaskColor): string =>
    taskColorDisplayLabel(color, colorLabels, t);

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {TASK_COLORS.map((color) => {
        const style = resolveTaskColorStyle(color);
        const label = labelFor(color);

        return (
          <button
            key={color}
            type="button"
            className={cn(
              'rounded-full border border-border/70 transition-transform hover:scale-110',
              box,
              style.swatchClass,
              selectedKey === taskColorKey(color) &&
                'ring-2 ring-primary ring-offset-2 ring-offset-background',
            )}
            style={style.swatchStyle}
            onClick={() => {
              cancelPendingCommit();
              onChange(color);
            }}
            aria-label={label}
            aria-pressed={selectedKey === taskColorKey(color)}
            title={label}
          />
        );
      })}

      <label
        className={cn(
          'relative cursor-pointer overflow-hidden rounded-full border border-border/70 transition-transform hover:scale-110',
          box,
          isFree && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
        )}
        title={t('planner.customColor')}
        aria-label={t('planner.customColor')}
      >
        <input
          type="color"
          value={draft}
          onChange={(event) => {
            const color = normalizeFreeColor(event.target.value);
            if (color) queueColor(color);
          }}
          onBlur={flush}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          aria-label={t('planner.customColor')}
        />
        <span
          aria-hidden
          className="pointer-events-none block h-full w-full rounded-full"
          style={{
            background: isFree || draft !== freeValue
              ? draft
              : 'conic-gradient(from 0deg, #ef4444, #f59e0b, #84cc16, #06b6d4, #6366f1, #d946ef, #ef4444)',
          }}
        />
      </label>
    </div>
  );
};
