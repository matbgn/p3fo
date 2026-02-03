import React, { useMemo } from 'react';
import { Button } from './ui/button';
import {
  ListChecks,
  Calendar,
  BarChart3,
  Settings,
  History,
  LayoutDashboard,
  ChartNoAxesGantt,
  PartyPopper,
  Sparkles,
  CircleDot,
} from 'lucide-react';
import { useCursors } from '@/hooks/useCursors';
import { Badge } from './ui/badge';

interface ViewSwitcherProps {
  value: "focus" | "kanban" | "timetable" | "program" | "settings" | "metrics" | "plan" | "dream" | "celebration" | "circles";
  onChange: (view: "focus" | "kanban" | "timetable" | "program" | "settings" | "metrics" | "plan" | "dream" | "celebration" | "circles") => void;
}

interface ViewOption {
  id: "focus" | "kanban" | "timetable" | "program" | "settings" | "metrics" | "plan" | "dream" | "celebration" | "circles";
  label: string;
  icon: React.ReactNode;
}

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

  const views: ViewOption[] = [
    { id: 'celebration', label: 'Celebration', icon: <PartyPopper className="w-4 h-4" /> },
    { id: 'dream', label: 'Dream', icon: <Sparkles className="w-4 h-4" /> },
    { id: 'plan', label: 'Plan', icon: <ChartNoAxesGantt className="w-4 h-4" /> },
    { id: 'circles', label: 'Circles', icon: <CircleDot className="w-4 h-4" /> },
    { id: 'program', label: 'Program', icon: <Calendar className="w-4 h-4" /> },
    { id: 'kanban', label: 'Project', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'focus', label: 'Focus', icon: <ListChecks className="w-4 h-4" /> },
    { id: 'timetable', label: 'Timetable', icon: <History className="w-4 h-4" /> },
    { id: 'metrics', label: 'Metrics', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'settings', label: 'Settings', icon: <Settings className="w-4 h-4" /> },
  ];

  return (
    <div className="flex space-x-1 p-1 bg-gray-100 rounded-lg">
      {views.map((view) => (
        <Button
          key={view.id}
          variant={value === view.id ? 'default' : 'ghost'}
          size="sm"
          className="flex items-center gap-2 relative"
          onClick={() => onChange(view.id)}
        >
          {view.icon}
          {view.label}
          {userCounts[view.id] > 0 && (
            <Badge
              variant="secondary"
              className="ml-1 px-1.5 py-0 h-5 min-w-[1.25rem] flex items-center justify-center text-[10px] bg-primary/10 text-primary hover:bg-primary/20"
            >
              {userCounts[view.id]}
            </Badge>
          )}
        </Button>
      ))}
    </div>
  );
}