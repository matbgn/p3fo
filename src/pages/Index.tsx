import React, { useEffect } from "react";
import TaskBoard from "@/components/TaskBoard";
import KanbanBoard from "@/components/KanbanBoard";
import { MadeWithDyad } from "@/components/made-with-dyad";
import { ViewSwitcher } from "@/components/ViewSwitcher";
import { Timetable } from "@/components/Timetable";
import ProgramTopView from "@/components/ProgramTopView";
import SettingsPage from "./SettingsPage";
import MetricsPage from "./MetricsPage";

import { addReminder } from "@/utils/reminders";
import PlanView from "@/components/PlanView";
import CelebrationView from "@/components/CelebrationView";
import DreamTopView from "@/components/DreamTopView";
import { Button } from "@/components/ui/button";
import { useViewNavigation } from "@/hooks/useView";

import { CompactnessSelector } from "@/components/CompactnessSelector";
import { NotificationCenter } from "@/components/NotificationCenter";
import { UserSection } from "@/components/UserSection";

// Styles for the keep-alive view slots.
// content-visibility:hidden tells the browser to skip layout+paint for hidden subtrees.
// This is far cheaper than display:none which forces full layout recalculation on toggle.
const hiddenStyle: React.CSSProperties = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  contentVisibility: "hidden" as any,
  position: "absolute",
  width: 0,
  height: 0,
  overflow: "hidden",
  pointerEvents: "none",
};
const activeStyle: React.CSSProperties = {};

const Index: React.FC = () => {
  const { view, setView, focusedTaskId, handleFocusOnTask } = useViewNavigation();

  // Track which views have been mounted (lazy-mount on first visit, keep-alive after)
  const [mountedViews, setMountedViews] = React.useState<Set<string>>(() => new Set([view]));

  React.useEffect(() => {
    setMountedViews(prev => {
      if (prev.has(view)) return prev;
      const next = new Set(prev);
      next.add(view);
      return next;
    });
  }, [view]);

  const handleViewChange = React.useCallback((newView: typeof view) => {
    setView(newView);
  }, [setView]);

  useEffect(() => {
    addReminder({
      title: "Welcome to P3Fo!",
      description: "Don't forget to set up your first task.",
      persistent: true,
    });
  }, []);

  // Memoize each view element so switching tabs doesn't reconcile them.
  // Each element is re-created only when its own dependencies change, not when `view` changes.
  const focusView = React.useMemo(() => <TaskBoard focusedTaskId={focusedTaskId} />, [focusedTaskId]);
  const kanbanView = React.useMemo(() => <KanbanBoard onFocusOnTask={handleFocusOnTask} highlightedTaskId={focusedTaskId} />, [handleFocusOnTask, focusedTaskId]);
  const timetableView = React.useMemo(() => <Timetable onJumpToTask={handleFocusOnTask} />, [handleFocusOnTask]);
  const programView = React.useMemo(() => <ProgramTopView onFocusOnTask={handleFocusOnTask} />, [handleFocusOnTask]);
  const planView = React.useMemo(() => <PlanView onFocusOnTask={handleFocusOnTask} />, [handleFocusOnTask]);
  const celebrationView = React.useMemo(() => <CelebrationView onFocusOnTask={handleFocusOnTask} />, [handleFocusOnTask]);
  const dreamView = React.useMemo(() => <DreamTopView onFocusOnTask={handleFocusOnTask} />, [handleFocusOnTask]);
  const metricsView = React.useMemo(() => <MetricsPage />, []);
  const settingsView = React.useMemo(() => <SettingsPage />, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4">
          <ViewSwitcher
            value={view}
            onChange={handleViewChange}
            utilityItems={
              <>
                <NotificationCenter />
                <UserSection />
              </>
            }
            rightItems={<CompactnessSelector />}
          />
        </div>
      </header>

      <main className="px-12 py-8">
        {/* Keep-alive: mount on first visit, hide with content-visibility:hidden, skip reconciliation via useMemo */}
        {/* content-visibility:hidden tells the browser to skip layout+paint entirely for hidden views */}
        <div style={view === "focus" ? activeStyle : hiddenStyle}>
          {mountedViews.has("focus") && focusView}
        </div>
        <div style={view === "kanban" ? activeStyle : hiddenStyle}>
          {mountedViews.has("kanban") && kanbanView}
        </div>
        <div style={view === "timetable" ? activeStyle : hiddenStyle}>
          {mountedViews.has("timetable") && timetableView}
        </div>
        <div style={view === "program" ? activeStyle : hiddenStyle}>
          {mountedViews.has("program") && programView}
        </div>
        <div style={view === "plan" ? activeStyle : hiddenStyle}>
          {mountedViews.has("plan") && planView}
        </div>
        <div style={view === "celebration" ? activeStyle : hiddenStyle}>
          {mountedViews.has("celebration") && celebrationView}
        </div>
        <div style={view === "dream" ? activeStyle : hiddenStyle}>
          {mountedViews.has("dream") && dreamView}
        </div>
        <div style={view === "metrics" ? activeStyle : hiddenStyle}>
          {mountedViews.has("metrics") && metricsView}
        </div>
        <div style={view === "settings" ? activeStyle : hiddenStyle}>
          {mountedViews.has("settings") && settingsView}
        </div>
      </main>
    </div>
  );
};

export default Index;