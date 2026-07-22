import { useEffect, Profiler } from "react";
import { otelProfilerCallback } from "./telemetry";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { NotificationCenter } from "./components/NotificationCenter";
import { NotificationManager } from "./components/NotificationManager";
import { UserSection } from "./components/UserSection";
import { PersistenceProvider } from "@/lib/PersistenceProvider";
import { UserProvider } from "@/context/UserContext";
import { UserSettingsProvider } from "@/context/UserSettingsContext";
import { UsersProvider } from "@/context/UsersContext";
import { SettingsProvider } from "@/context/SettingsContext";
import { PomodoroProvider } from "@/context/PomodoroContext";
import { TravelerProvider } from "@/context/TravelerContext";
import { PomodoroPiPWindow } from "@/components/PomodoroPiPWindow";
import { PomodoroFocusOverlay } from "@/components/PomodoroFocusOverlay";
import { PomodoroTransitionAlert } from "@/components/PomodoroTransitionAlert";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import PublicVotePage from "./pages/PublicVotePage";
import ModerationPopout from "./components/voting/ModerationPopout";
import { useReminderStore } from "./hooks/useReminders";
import { ViewProvider } from "@/context/ViewContext";
import { DEFAULT_TASKS_INITIALIZED_KEY } from "./hooks/useTasks";
import { destroyTravelerIdleState } from "@/lib/traveler-idle-state";
import { useSettingsContext } from "@/context/SettingsContext";
import { DEFAULT_FOCUS_MODE_CONFIG } from "@/lib/pomodoro-types";
import "@/i18n";

declare global {
  interface Window {
    _appStartupTime?: number;
  }
}

const queryClient = new QueryClient();

import { CursorOverlay } from "@/components/CursorOverlay";

const App = () => {
  const { checkAndTriggerReminders } = useReminderStore();

  useEffect(() => {
    import('@/lib/collaboration').then(({ yTasks, yUserSettings, yFertilizationState, yFertilizationCards, yFertilizationColumns, yDreamState, yDreamCards, yDreamColumns, yCircles, ySystemState, doc }) => {
      const observer = () => {
        const command = ySystemState.get('command') as { type: string, timestamp: number } | undefined;
        if (command && command.type === 'CLEAR_ALL') {
          const startupTime = window._appStartupTime || 0;
          if (command.timestamp > startupTime) {
            console.log('Received global CLEAR_ALL command. Wiping data...');
            doc.transact(() => {
              yTasks.clear();
              yUserSettings.clear();
              yFertilizationState.clear();
              yFertilizationCards.clear();
              yFertilizationColumns.clear();
              yDreamState.clear();
              yDreamCards.clear();
              yDreamColumns.clear();
              yCircles.clear();
            });
            localStorage.clear();
            localStorage.setItem(DEFAULT_TASKS_INITIALIZED_KEY, 'true');
            sessionStorage.clear();
            window.indexedDB.databases().then(dbs => {
              dbs.forEach(db => {
                if (db.name && db.name.includes('p3fo')) window.indexedDB.deleteDatabase(db.name);
              });
              window.indexedDB.deleteDatabase('p3fo-yjs-tasks');
            });

            setTimeout(() => window.location.reload(), 500);
          }
        }
      };
      ySystemState.observe(observer);
      window._appStartupTime = Date.now();

      return () => ySystemState.unobserve(observer);
    });
  }, []);

  useEffect(() => {
    return () => {
      destroyTravelerIdleState();
    };
  }, []);

  return (
    <Profiler id="Root-App" onRender={otelProfilerCallback}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <PersistenceProvider>
            <UserProvider>
              <UserSettingsProvider>
                  <UsersProvider>
                    <SettingsProvider>
                      <PomodoroProvider>
                        <TravelerProvider>
                          <TimerOverlays />
                          <ViewProvider>
                            <Toaster />
                            <Sonner />
                            <CursorOverlay />
                            <NotificationManager />
                            <div className="relative">
                              <BrowserRouter basename={import.meta.env.VITE_BASE_URL || "/p3fo"} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                                <Routes>
                                  <Route path="/v/:slug" element={<PublicVotePage />} />
                                  <Route path="/v/:slug/m/:token" element={<ModerationPopout />} />
                                  <Route path="/" element={<Index />} />
                                  <Route path="*" element={<NotFound />} />
                                </Routes>
                              </BrowserRouter>
                            </div>
                          </ViewProvider>
                        </TravelerProvider>
                      </PomodoroProvider>
                    </SettingsProvider>
                  </UsersProvider>
              </UserSettingsProvider>
            </UserProvider>
          </PersistenceProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </Profiler>
  );
};

const TimerOverlays: React.FC = () => {
  const { settings } = useSettingsContext();
  const focusConfig = settings.focusModeConfig ?? DEFAULT_FOCUS_MODE_CONFIG;
  return (
    <>
      <PomodoroTransitionAlert />
      <PomodoroPiPWindow />
      {focusConfig.showFocusOverlay && <PomodoroFocusOverlay />}
    </>
  );
};

export default App;