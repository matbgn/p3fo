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
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import { useReminderStore } from "./hooks/useReminders";
import { ViewProvider } from "@/context/ViewContext";

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

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <PersistenceProvider>
          <UserProvider>
            <ViewProvider>
              <Toaster />
              <Sonner />
              <CursorOverlay />
              <div className="relative">
                <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
                  <NotificationCenter />
                  <UserSection />
                </div>
                <BrowserRouter basename="/p3fo" future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                  <Routes>
                    <Route path="/" element={<Index />} />
                    {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </BrowserRouter>
              </div>
            </ViewProvider>
          </UserProvider>
        </PersistenceProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;