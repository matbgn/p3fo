import React, { useEffect } from "react";
import TaskBoard from "@/components/TaskBoard";
import KanbanBoard from "@/components/KanbanBoard";
import { MadeWithDyad } from "@/components/made-with-dyad";
import { ViewSwitcher } from "@/components/ViewSwitcher";
import { Timetable } from "@/components/Timetable";
import ProgramView from "@/components/ProgramView";
import SettingsPage from "./SettingsPage";
import MetricsPage from "./MetricsPage";
import QoLIndexSurveyPage from "./QoLIndexSurveyPage";
import { addReminder } from "@/utils/reminders";
import PlanView from "@/components/PlanView"; // Import PlanView
import { Button } from "@/components/ui/button";

const Index: React.FC = () => {
  const [view, setView] = React.useState<
    "focus" | "kanban" | "timetable" | "program" | "settings" | "metrics" | "qol-survey" | "plan"
  >("focus");
  const [focusedTaskId, setFocusedTaskId] = React.useState<string | null>(null);

  const handleFocusOnTask = React.useCallback((taskId: string) => {
    setView("focus");
    setFocusedTaskId(taskId);
  }, []);

  useEffect(() => {
    addReminder({
      title: "Welcome to P3Fo!",
      description: "Don't forget to set up your first task.",
      persistent: true,
    });
  }, []);


  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-10">
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col items-end gap-2">
              <ViewSwitcher value={view} onChange={setView} />
            </div>
          </div>
        </div>
      </header>

      <main className="px-12 py-8">
        {view === "focus" ? (
          <TaskBoard focusedTaskId={focusedTaskId} />
        ) : view === "kanban" ? (
          <KanbanBoard onFocusOnTask={handleFocusOnTask} />
        ) : view === "timetable" ? (
          <Timetable onJumpToTask={handleFocusOnTask} />
        ) : view === "program" ? (
          <ProgramView onFocusOnTask={handleFocusOnTask} />
        ) : view === "plan" ? (
          <PlanView onFocusOnTask={handleFocusOnTask} />
        ) : view === "metrics" ? (
          <MetricsPage />
        ) : view === "qol-survey" ? (
          <QoLIndexSurveyPage />
        ) : (
          <SettingsPage />
        )}
      </main>
    </div>
  );
};

export default Index;