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
import { useView } from "@/context/ViewContext";

const Index: React.FC = () => {
  const { view, setView, focusedTaskId, handleFocusOnTask } = useView();

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
          <div className="flex items-center justify-left gap-12">
            <div className="flex items-center">
              {/* Project Logo */}
              <img
                src={`${import.meta.env.BASE_URL}P3Fo_Logo.png`}
                alt="P3Fo Logo"
                className="h-10 w-auto"
              />
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