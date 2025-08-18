import React from "react";
import TaskBoard from "@/components/TaskBoard";
import TriageBoard from "@/components/TriageBoard";
import { MadeWithDyad } from "@/components/made-with-dyad";
import { ViewSwitcher } from "@/components/ViewSwitcher";
import { Timetable } from "@/components/Timetable";
import SettingsPage from "./SettingsPage";
import MetricsPage from "./MetricsPage";
import QoLIndexSurveyPage from "./QoLIndexSurveyPage";

const Index: React.FC = () => {
  const [view, setView] = React.useState<
    "focus" | "triage" | "timetable" | "settings" | "metrics" | "qol-survey"
  >("focus");
  const [focusedTaskId, setFocusedTaskId] = React.useState<string | null>(null);

  const handleFocusOnTask = React.useCallback((taskId: string) => {
    setView("focus");
    setFocusedTaskId(taskId);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-10">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                P3Com - Plan, programm, project and communicate
              </h1>
              <p className="mt-2 text-muted-foreground">
                Organize your goals with results in mind
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <ViewSwitcher value={view} onChange={setView} />
            </div>
          </div>
        </div>
      </header>

      <main className="px-12 py-8">
        {view === "focus" ? (
          <TaskBoard focusedTaskId={focusedTaskId} />
        ) : view === "triage" ? (
          <TriageBoard onFocusOnTask={handleFocusOnTask} />
        ) : view === "timetable" ? (
          <Timetable onJumpToTask={handleFocusOnTask} />
        ) : view === "metrics" ? (
          <MetricsPage />
        ) : view === "qol-survey" ? (
          <QoLIndexSurveyPage />
        ) : (
          <SettingsPage />
        )}
      </main>

      <footer className="container mx-auto px-4 py-6">
        <MadeWithDyad />
      </footer>
    </div>
  );
};

export default Index;