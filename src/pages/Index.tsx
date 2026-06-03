import React, { Suspense, useEffect, useState, useCallback } from "react";
import TaskBoard from "@/components/TaskBoard";
import KanbanBoard from "@/components/KanbanBoard";
import { ViewSwitcher } from "@/components/ViewSwitcher";
import { Timetable } from "@/components/Timetable";
const ProgramTopView = React.lazy(() => import("@/components/ProgramTopView"));
import SettingsPage from "./SettingsPage";
const MetricsPage = React.lazy(() => import("./MetricsPage"));
const VotingPage = React.lazy(() => import("./VotingPage"));


import { useUserSettingsContext } from "@/context/UserSettingsContext";
const PlanView = React.lazy(() => import("@/components/PlanView"));
const CelebrationView = React.lazy(() => import("@/components/CelebrationView"));
const DreamTopView = React.lazy(() => import("@/components/DreamTopView"));
import { useViewNavigation } from "@/hooks/useView";
import type { ModuleId } from "@/lib/persistence-types";

import { CompactnessSelector } from "@/components/CompactnessSelector";
import { NotificationCenter } from "@/components/NotificationCenter";
import { UserSection } from "@/components/UserSection";
import { QuickTimer } from "@/components/QuickTimer";
import { UmbrellaNavigation } from "@/components/UmbrellaNavigation";
import { GlobalFocusModeToggle } from "@/components/GlobalFocusModeToggle";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

const LazyWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Suspense fallback={<LoadingSpinner label="Loading..." />}>
    {children}
  </Suspense>
);

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
const activeStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
};

const Index: React.FC = () => {
  const { view, setView, focusedTaskId, handleFocusOnTask, disabledModules } = useViewNavigation();
  const { userSettings } = useUserSettingsContext();

  // Track which views have been mounted (lazy-mount on first visit, keep-alive after)
  const [mountedViews, setMountedViews] = React.useState<Set<string>>(() => new Set([view]));

  // Global focus mode state driven by body data attribute
  const [isGlobalFocusMode, setIsGlobalFocusMode] = useState(false);

  // Umbrella overlay open state
  const [umbrellaOpen, setUmbrellaOpen] = useState(false);

  const toggleUmbrella = useCallback(() => {
    setUmbrellaOpen(prev => !prev);
  }, []);

  React.useEffect(() => {
    setMountedViews(prev => {
      if (prev.has(view)) return prev;
      const next = new Set(prev);
      next.add(view);
      return next;
    });
  }, [view]);

  // Remove disabled modules from mounted views (unmount them)
  React.useEffect(() => {
    if (disabledModules.length === 0) return;
    setMountedViews(prev => {
      const next = new Set(prev);
      let changed = false;
      for (const m of disabledModules) {
        const viewKey = m.includes('.') ? m.split('.')[0] : m;
        if (next.has(viewKey)) {
          next.delete(viewKey);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [disabledModules]);

  React.useEffect(() => {
    const onChange = (e: CustomEvent) => setIsGlobalFocusMode(e.detail.active);
    window.addEventListener('focusmodechange', onChange as EventListener);
    return () => window.removeEventListener('focusmodechange', onChange as EventListener);
  }, []);

  // Global Ctrl+K / Cmd+K shortcut to toggle umbrella
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        toggleUmbrella();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleUmbrella]);

  // Global F11 shortcut: toggles focus mode for the currently active view
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F11') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('togglefocusmode', { detail: { viewId: view } }));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [view]);

  // Track active view on body for per-view focus mode providers
  React.useEffect(() => {
    document.body.dataset.activeView = view;
  }, [view]);

  const handleViewChange = React.useCallback((newView: typeof view) => {
    setView(newView);
  }, [setView]);



  // Memoize each view element so switching tabs doesn't reconcile them.
  // Each element is re-created only when its own dependencies change, not when `view` changes.
  const focusView = React.useMemo(() => <TaskBoard focusedTaskId={focusedTaskId} onFocusOnTask={handleFocusOnTask} />, [focusedTaskId, handleFocusOnTask]);
  const kanbanView = React.useMemo(() => <KanbanBoard onFocusOnTask={handleFocusOnTask} highlightedTaskId={focusedTaskId} />, [handleFocusOnTask, focusedTaskId]);
  const timetableView = React.useMemo(() => <Timetable onJumpToTask={handleFocusOnTask} />, [handleFocusOnTask]);
  const programView = React.useMemo(() => <LazyWrapper><ProgramTopView onFocusOnTask={handleFocusOnTask} /></LazyWrapper>, [handleFocusOnTask]);
  const planView = React.useMemo(() => <LazyWrapper><PlanView onFocusOnTask={handleFocusOnTask} /></LazyWrapper>, [handleFocusOnTask]);
  const celebrationView = React.useMemo(() => <LazyWrapper><CelebrationView onFocusOnTask={handleFocusOnTask} /></LazyWrapper>, [handleFocusOnTask]);
  const dreamView = React.useMemo(() => <LazyWrapper><DreamTopView onFocusOnTask={handleFocusOnTask} /></LazyWrapper>, [handleFocusOnTask]);
  const metricsView = React.useMemo(() => <LazyWrapper><MetricsPage /></LazyWrapper>, []);
  const votingView = React.useMemo(() => <LazyWrapper><VotingPage /></LazyWrapper>, []);
  const settingsView = React.useMemo(() => <SettingsPage />, []);

  return (
      <div className={`flex flex-col h-screen bg-background ${isGlobalFocusMode ? 'focus-mode-active' : ''}`}>
      <header className={`border-b transition-all duration-300 ${isGlobalFocusMode ? 'hidden' : 'block'}`}>
        <div className="container mx-auto px-4 py-4">
          <ViewSwitcher
            value={view}
            onChange={handleViewChange}
            disabledModules={disabledModules}
            utilityItems={
              <>
                <NotificationCenter />
                <UserSection />
              </>
            }
            rightItems={
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap sm:flex-nowrap">
                <QuickTimer onJumpToTask={handleFocusOnTask} />
                <CompactnessSelector />
                <GlobalFocusModeToggle activeViewId={view} />
              </div>
            }
          />
        </div>
      </header>

      <main className={`flex flex-col px-12 py-8 transition-all duration-300 ${isGlobalFocusMode ? 'px-0 py-0 h-screen' : 'h-[calc(100vh-4rem)] min-h-0'}`}>
        {/* Keep-alive: mount on first visit, hide with content-visibility:hidden, skip reconciliation via useMemo */}
        {/* content-visibility:hidden tells the browser to skip layout+paint entirely for hidden views */}
        {/* Disabled modules are completely excluded from rendering */}
        {!disabledModules.includes('focus' as ModuleId) && (
        <div style={view === "focus" ? activeStyle : hiddenStyle}>
          {mountedViews.has("focus") && focusView}
        </div>
        )}
        {!disabledModules.includes('kanban' as ModuleId) && (
        <div style={view === "kanban" ? activeStyle : hiddenStyle}>
          {mountedViews.has("kanban") && kanbanView}
        </div>
        )}
        {!disabledModules.includes('timetable' as ModuleId) && (
        <div style={view === "timetable" ? activeStyle : hiddenStyle}>
          {mountedViews.has("timetable") && timetableView}
        </div>
        )}
        {!disabledModules.includes('program' as ModuleId) && (
        <div style={view === "program" ? activeStyle : hiddenStyle}>
          {mountedViews.has("program") && programView}
        </div>
        )}
        {!disabledModules.includes('plan' as ModuleId) && (
        <div style={view === "plan" ? activeStyle : hiddenStyle}>
          {mountedViews.has("plan") && planView}
        </div>
        )}
        {!disabledModules.includes('celebration' as ModuleId) && (
        <div style={view === "celebration" ? activeStyle : hiddenStyle}>
          {mountedViews.has("celebration") && celebrationView}
        </div>
        )}
        {!disabledModules.includes('dream' as ModuleId) && (
        <div style={view === "dream" ? activeStyle : hiddenStyle}>
          {mountedViews.has("dream") && dreamView}
        </div>
        )}
        {!disabledModules.includes('metrics' as ModuleId) && (
        <div style={view === "metrics" ? activeStyle : hiddenStyle}>
          {mountedViews.has("metrics") && metricsView}
        </div>
        )}
        {!disabledModules.includes('voting' as ModuleId) && (
        <div style={view === "voting" ? activeStyle : hiddenStyle}>
          {mountedViews.has("voting") && votingView}
        </div>
        )}
        {!disabledModules.includes('settings' as ModuleId) && (
        <div style={view === "settings" ? activeStyle : hiddenStyle}>
          {mountedViews.has("settings") && settingsView}
        </div>
        )}
      </main>

      <UmbrellaNavigation open={umbrellaOpen} onClose={() => setUmbrellaOpen(false)} />
    </div>
  );
};

export default Index;