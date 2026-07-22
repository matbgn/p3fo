import React from 'react';
import { useTranslation } from 'react-i18next';

export type LegendKey = 'gold' | 'green' | 'blue';

export interface LegendItem {
  key: LegendKey;
  label: string;
  labelKey: string;
  color: string;
}

const ITEMS: LegendItem[] = [
  { key: 'gold', label: 'Impact work', labelKey: 'pomodoroUi.impactWork', color: '#fbbf24' },
  { key: 'green', label: 'Focus work', labelKey: 'pomodoroUi.focusWork', color: '#40c463' },
  { key: 'blue', label: 'Started tasks', labelKey: 'pomodoroUi.startedTasks', color: '#3b82f6' },
];

interface ConsistencyLegendProps {
  visible: Set<LegendKey>;
  onToggle: (key: LegendKey) => void;
  className?: string;
}

export const ConsistencyLegend: React.FC<ConsistencyLegendProps> = ({ visible, onToggle, className }) => {
  const { t } = useTranslation();
  return (
    <div className={`flex items-center gap-4 text-xs text-muted-foreground ${className ?? ''}`}>
      {ITEMS.map((item) => {
        const isVisible = visible.has(item.key);
        return (
          <button
            key={item.key}
            onClick={() => onToggle(item.key)}
            className="flex items-center gap-1 transition-opacity"
            style={{ opacity: isVisible ? 1 : 0.35 }}
          >
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{ background: isVisible ? item.color : 'hsl(var(--muted-foreground))' }}
            />
            <span>{t(item.labelKey)}</span>
          </button>
        );
      })}
    </div>
  );
};

export const ALL_LEGEND_KEYS = new Set<LegendKey>(['gold', 'green', 'blue']);
export const LEGEND_ITEMS = ITEMS;