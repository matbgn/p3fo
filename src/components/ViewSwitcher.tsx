import React, { useMemo } from 'react';
import { Button } from './ui/button';
import {
  ListChecks,
  Calendar,
  BarChart3,
  Settings,
  Clock,
  LayoutDashboard,
  CircleDot,
  PartyPopper,
  Sparkles,
} from 'lucide-react';
import { useCursors } from '@/hooks/useCursors';
import { Badge } from './ui/badge';
import { cn } from '@/lib/utils';

type ViewId = "focus" | "kanban" | "timetable" | "program" | "settings" | "metrics" | "plan" | "dream" | "celebration";

interface ViewSwitcherProps {
  value: ViewId;
  onChange: (view: ViewId) => void;
}

interface ViewOption {
  id: ViewId;
  label: string;
  icon: React.ReactNode;
}

type ColorCategory = 'green' | 'blue' | 'orange' | 'red';

const COLOR_MAP: Record<ViewId, ColorCategory> = {
  celebration: 'green',
  dream: 'blue',
  plan: 'orange',
  program: 'red',
  kanban: 'red',
  focus: 'red',
  metrics: 'red',
  timetable: 'red',   // fallback, won't be used in main pills
  settings: 'red',    // fallback, won't be used in main pills
};

const COLOR_CLASSES: Record<ColorCategory, { active: string; inactive: string }> = {
  green: {
    active: 'bg-green-600 text-white hover:bg-green-700 hover:text-white shadow-sm',
    inactive: 'text-green-700 hover:bg-green-50',
  },
  blue: {
    active: 'bg-blue-600 text-white hover:bg-blue-700 hover:text-white shadow-sm',
    inactive: 'text-blue-700 hover:bg-blue-50',
  },
  orange: {
    active: 'bg-orange-500 text-white hover:bg-orange-600 hover:text-white shadow-sm',
    inactive: 'text-orange-700 hover:bg-orange-50',
  },
  red: {
    active: 'bg-red-600 text-white hover:bg-red-700 hover:text-white shadow-sm',
    inactive: 'text-red-700 hover:bg-red-50',
  },
};

const mainViews: ViewOption[] = [
  { id: 'celebration', label: 'Celebration', icon: <PartyPopper className="w-4 h-4" /> },
  { id: 'dream', label: 'Dream', icon: <Sparkles className="w-4 h-4" /> },
  { id: 'plan', label: 'Plan', icon: <CircleDot className="w-4 h-4" /> },
  { id: 'program', label: 'Program', icon: <Calendar className="w-4 h-4" /> },
  { id: 'kanban', label: 'Project', icon: <LayoutDashboard className="w-4 h-4" /> },
  { id: 'focus', label: 'Focus', icon: <ListChecks className="w-4 h-4" /> },
  { id: 'metrics', label: 'Metrics', icon: <BarChart3 className="w-4 h-4" /> },
];

const utilityViews: ViewOption[] = [
  { id: 'timetable', label: 'Timetable', icon: <Clock className="w-4 h-4" /> },
  { id: 'settings', label: 'Settings', icon: <Settings className="w-4 h-4" /> },
];

export function ViewSwitcher({ value, onChange }: ViewSwitcherProps) {
  const cursors = useCursors();

  const userCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    Array.from(cursors.values()).forEach(state => {
      if (state.view) {
        counts[state.view] = (counts[state.view] || 0) + 1;
      }
    });
    return counts;
  }, [cursors]);

  return (
    <div className="flex space-x-1 p-1 bg-gray-100 rounded-lg">
      {mainViews.map((view) => {
        const isActive = value === view.id;
        const color = COLOR_MAP[view.id];
        const classes = isActive ? COLOR_CLASSES[color].active : COLOR_CLASSES[color].inactive;

        return (
          <Button
            key={view.id}
            variant="ghost"
            size="sm"
            className={cn("flex items-center gap-2 relative", classes)}
            onClick={() => onChange(view.id)}
          >
            {view.icon}
            {view.label}
            {userCounts[view.id] > 0 && (
              <Badge
                variant="secondary"
                className={cn(
                  "ml-1 px-1.5 py-0 h-5 min-w-[1.25rem] flex items-center justify-center text-[10px]",
                  isActive ? "bg-white/25 text-white hover:bg-white/35" : "bg-primary/10 text-primary hover:bg-primary/20"
                )}
              >
                {userCounts[view.id]}
              </Badge>
            )}
          </Button>
        );
      })}
    </div>
  );
}

export function ViewSwitcherUtilities({ value, onChange }: ViewSwitcherProps) {
  const cursors = useCursors();

  const userCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    Array.from(cursors.values()).forEach(state => {
      if (state.view) {
        counts[state.view] = (counts[state.view] || 0) + 1;
      }
    });
    return counts;
  }, [cursors]);

  return (
    <>
      {utilityViews.map((view) => {
        const isActive = value === view.id;
        return (
          <Button
            key={view.id}
            variant={isActive ? 'default' : 'ghost'}
            size="icon"
            className={cn("relative h-8 w-8", isActive ? '' : 'text-muted-foreground')}
            onClick={() => onChange(view.id)}
            title={view.label}
          >
            {view.icon}
            {userCounts[view.id] > 0 && (
              <Badge
                variant="secondary"
                className="absolute -top-1 -right-1 px-1 py-0 h-4 min-w-[1rem] flex items-center justify-center text-[9px] bg-primary/10 text-primary"
              >
                {userCounts[view.id]}
              </Badge>
            )}
          </Button>
        );
      })}
    </>
  );
}