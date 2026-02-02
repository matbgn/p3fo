import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { NotificationCenter } from "./components/NotificationCenter";
import { UserSection } from "./components/UserSection";
import { PersistenceProvider } from "@/lib/PersistenceProvider";
import { UserProvider } from "@/context/UserContext";
import { UserSettingsProvider } from "@/context/UserSettingsContext";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import { useReminderStore } from "./hooks/useReminders";
import { ViewProvider } from "@/context/ViewContext";
import { DEFAULT_TASKS_INITIALIZED_KEY } from "./hooks/useTasks";

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
    const interval = setInterval(() => {
      checkAndTriggerReminders();
    }, 1000 * 60); // Check every minute

    return () => clearInterval(interval);
  }, [checkAndTriggerReminders]);

  // Listen for global system commands (like Clear All Data)
  useEffect(() => {
    import('@/lib/collaboration').then(({ ySystemState }) => {
      const observer = () => {
        const command = ySystemState.get('command') as { type: string, timestamp: number } | undefined;
        if (command && command.type === 'CLEAR_ALL') {
          // Check if this command is recent (e.g. within last 10 seconds)
          // or we could just trust it if we haven't processed it.
          // Simple approach: if timestamp > startup time, assume it's new.
          const startupTime = window._appStartupTime || 0;
          if (command.timestamp > startupTime) {
            console.log('Received global CLEAR_ALL command. Wiping data...');
            // Wipe data
            localStorage.clear();
            // Preserve the initialized flag to prevent default tasks from being recreated
            localStorage.setItem(DEFAULT_TASKS_INITIALIZED_KEY, 'true');
            sessionStorage.clear();
            window.indexedDB.databases().then(dbs => {
              dbs.forEach(db => {
                if (db.name && db.name.includes('p3fo')) window.indexedDB.deleteDatabase(db.name);
              });
              window.indexedDB.deleteDatabase('p3fo-yjs-tasks');
            });

            // Reload to reset state
            // Give a small delay for DB deletion
            setTimeout(() => window.location.reload(), 500);
          }
        }
      };
      ySystemState.observe(observer);
      // Set startup time to avoid reacting to old commands persisted in Yjs if not cleared
      window._appStartupTime = Date.now();

      return () => ySystemState.unobserve(observer);
    });
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <PersistenceProvider>
          <UserProvider>
            <UserSettingsProvider>
              <ViewProvider>
                <Toaster />
                <Sonner />
                <CursorOverlay />
                <div className="relative">
                  <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
                    <NotificationCenter />
                    <UserSection />
                  </div>
                  <BrowserRouter basename={import.meta.env.VITE_BASE_URL || "/p3fo"} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                    <Routes>
                      <Route path="/" element={<Index />} />
                      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </BrowserRouter>
                </div>
              </ViewProvider>
            </UserSettingsProvider>
          </UserProvider>
        </PersistenceProvider>
      </TooltipProvider>
    </QueryClientProvider >
  );
};

export default App;