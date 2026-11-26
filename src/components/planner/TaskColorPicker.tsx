import React from 'react';
import { useTranslation } from 'react-i18next';
import type { TaskColor } from '@/lib/planner/colors';
import { useWorkspaceTaxonomy } from '@/hooks/useWorkspaceTaxonomy';
import { taskColorDisplayLabel } from '@/lib/workspace-taxonomy';
import { TaskColorPalette } from './TaskColorPalette';

type TaskColorPickerProps = {
  value: TaskColor;
  onChange: (value: TaskColor) => void;
};

export const TaskColorPicker: React.FC<TaskColorPickerProps> = ({ value, onChange }) => {
  const { t } = useTranslation();
  const { colorLabels } = useWorkspaceTaxonomy();
  const name = taskColorDisplayLabel(value, colorLabels, t);

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <p className="text-xs font-medium text-muted-foreground">{t('planner.colour')}</p>
        <span className="truncate text-xs text-foreground/80">{name}</span>
      </div>
      <TaskColorPalette value={value} onChange={onChange} colorLabels={colorLabels} />
    </div>
  );
};
