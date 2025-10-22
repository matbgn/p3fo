import React from 'react';
import { Button } from './ui/button';
import { 
  ListChecks,
  Calendar,
  BarChart3,
  Settings,
  History,
  Smile,
  LayoutDashboard,
  ListTodo,
  ChartNoAxesGantt, // Add ChartNoAxesGantt icon
} from 'lucide-react';

interface ViewSwitcherProps {
  value: "focus" | "kanban" | "timetable" | "program" | "settings" | "metrics" | "qol-survey" | "plan"; // Add "plan"
  onChange: (view: "focus" | "kanban" | "timetable" | "program" | "settings" | "metrics" | "qol-survey" | "plan") => void; // Add "plan"
}

interface ViewOption {
  id: "focus" | "kanban" | "timetable" | "program" | "settings" | "metrics" | "qol-survey" | "plan"; // Add "plan"
  label: string;
  icon: React.ReactNode;
}

export function ViewSwitcher({ value, onChange }: ViewSwitcherProps) {
  const views: ViewOption[] = [
    { id: 'plan', label: 'Plan', icon: <ChartNoAxesGantt className="w-4 h-4" /> }, // Move Plan view to first and change icon
    { id: 'program', label: 'Program', icon: <Calendar className="w-4 h-4" /> },
    { id: 'kanban', label: 'Project', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'focus', label: 'Focus', icon: <ListChecks className="w-4 h-4" /> },
    { id: 'timetable', label: 'Timetable', icon: <History className="w-4 h-4" /> },
    { id: 'qol-survey', label: 'QLI', icon: <Smile className="w-4 h-4" /> },
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
          className="flex items-center gap-2"
          onClick={() => onChange(view.id)}
        >
          {view.icon}
          {view.label}
        </Button>
      ))}
    </div>
  );
}