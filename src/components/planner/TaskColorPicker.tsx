import React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { TASK_COLORS, TASK_COLOR_STYLES, type TaskColor } from '@/lib/planner/colors';

type TaskColorPickerProps = {
  value: TaskColor;
  onChange: (value: TaskColor) => void;
};

export const TaskColorPicker: React.FC<TaskColorPickerProps> = ({ value, onChange }) => {
  const { t } = useTranslation();

  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t('planner.colour')}</p>
      <div className="flex flex-wrap gap-1.5">
        {TASK_COLORS.map((option) => (
          <button
            key={option}
            type="button"
            className={cn(
              'h-6 w-6 rounded-full border border-border/70 transition-transform hover:scale-110',
              TASK_COLOR_STYLES[option].swatch,
              value === option && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
            )}
            onClick={() => onChange(option)}
            aria-label={TASK_COLOR_STYLES[option].label}
            title={TASK_COLOR_STYLES[option].label}
          />
        ))}
      </div>
    </div>
  );
};
